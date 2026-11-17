// FormCraft server: serves the pages and the JSON API.
// Run with:  node server.js   then open http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db, { one, all, run, transaction, DATA_DIR } from './db.js';
import { TEMPLATES } from './templates.js';

// Settings come from environment variables so the same code runs locally and on a hosting service
const PORT = Number(process.env.PORT) || 3000;
// Set TRUST_PROXY=1 when the app runs behind the hosting service's proxy, so the real visitor IP is used
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Set DEMO_MODE=1 on hosting without a permanent disk; pages then warn that data can be reset
const DEMO_MODE = process.env.DEMO_MODE === '1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const FIELD_TYPES = ['text', 'textarea', 'email', 'number', 'date', 'select', 'radio', 'checkbox', 'file', 'page'];
const CHOICE_TYPES = ['select', 'radio', 'checkbox'];
// Colour themes (each has a .theme-<name> block in public/css/style.css)
const THEMES = [
  'lavender', 'ocean', 'sunset', 'forest', 'rose', 'candy', 'mint', 'peach',
  'lemon', 'sky', 'coffee', 'paper', 'midnight', 'aurora', 'galaxy',
];
// Moving backgrounds (each is drawn by public/js/visuals.js)
const VISUALS = [
  'none', 'bubbles', 'strawberries', 'stars', 'hearts', 'snow', 'confetti', 'sakura', 'flowers', 'leaves',
  'balloons', 'butterflies', 'fireflies', 'rain', 'sparkles', 'fruits', 'candy', 'study', 'music', 'space',
];

// Name used by the pages -> value stored in responses.status
const STATUSES = { pending: '', selected: 'selected', waiting: 'waiting', not_eligible: 'not_eligible' };

const MB = 1024 * 1024;
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const ANSWER_FILE_TYPES = {
  ...IMAGE_TYPES,
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};
const MAX_BACKGROUND_SIZE = 3 * MB;
const MAX_ANSWER_FILE_SIZE = 5 * MB;

// ---------- small helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}

// Reads the whole request body as bytes, refusing anything bigger than maxBytes
function readRaw(req, maxBytes) {
  const tooBig = new HttpError(413, maxBytes >= MB ? `The file is too large (max ${maxBytes / MB} MB)` : 'Request is too large');
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > maxBytes) {
      req.resume(); // throw the body away so the error reply can still be sent
      return reject(tooBig);
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
    });
    req.on('end', () => (size > maxBytes ? reject(tooBig) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

function parseJson(buffer) {
  if (!buffer.length) return {};
  try {
    const data = JSON.parse(buffer.toString('utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const newSlug = () => crypto.randomBytes(6).toString('base64url');

// ---------- passwords and sessions ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, 'hex'));
}

// On https the cookie is marked Secure so the browser never sends it over plain http
function isHttps(req) {
  return Boolean(req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
}

function sessionCookie(req, token, maxAge) {
  return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

function startSession(req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, userId);
  return { 'Set-Cookie': sessionCookie(req, token, 604800) };
}

// ---------- rate limits ----------

function clientIp(req) {
  if (TRUST_PROXY) {
    // The proxy adds the real address at the end of X-Forwarded-For; earlier entries can be faked
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

// Allows `max` requests per IP in each `windowMs`; protects login from password guessing and forms from spam.
// Requests from this same computer are not limited, so testing locally never gets blocked.
function rateLimit(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.reset <= now) hits.delete(ip);
  }, windowMs).unref();
  return (req) => {
    const ip = clientIp(req);
    if (!TRUST_PROXY && isLoopback(ip)) return;
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      const minutes = Math.ceil((entry.reset - now) / 60000);
      throw new HttpError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
  };
}

const LIMITS = {
  auth: rateLimit(20, 15 * 60 * 1000),    // login and sign-up
  submit: rateLimit(30, 10 * 60 * 1000),  // public form submissions
  upload: rateLimit(30, 10 * 60 * 1000),  // public file uploads
};

function sessionToken(req) {
  const match = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return match ? match[1] : null;
}

function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  // A login lasts 7 days, the same as the cookie
  return one(
    `SELECT u.id, u.name, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.created_at > datetime('now', '-7 days')`,
    token
  ) || null;
}

// ---------- uploaded files ----------

function contentType(req) {
  return String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

function fileNameFrom(req) {
  let name = '';
  try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { /* bad encoding */ }
  return cleanText(path.basename(name.replace(/\\/g, '/')), 200) || 'file';
}

// Checks the first bytes so a file named .png really is a PNG
function looksLikeImage(buffer, mime) {
  const hex = buffer.subarray(0, 12).toString('hex');
  if (mime === 'image/png') return hex.startsWith('89504e47');
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (mime === 'image/gif') return hex.startsWith('47494638');
  if (mime === 'image/webp') return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
  return true;
}

function saveUpload({ formId, kind, buffer, mime, name, allowed }) {
  if (!buffer.length) throw new HttpError(400, 'The file is empty');
  const ext = allowed[mime];
  if (!ext) throw new HttpError(400, 'This type of file is not allowed');
  if (IMAGE_TYPES[mime] && !looksLikeImage(buffer, mime)) throw new HttpError(400, 'This file is not a valid image');
  const token = crypto.randomBytes(16).toString('hex');
  const storedName = token + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);
  run(
    'INSERT INTO uploads (token, form_id, kind, original_name, mime, size, stored_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    token, formId, kind, name, mime, buffer.length, storedName
  );
  return { token, name, size: buffer.length };
}

// Deletes upload rows and their files. `where` is always a fixed string from this file.
function deleteUploads(where, ...params) {
  const names = all(`SELECT stored_name FROM uploads WHERE ${where}`, ...params).map((u) => u.stored_name);
  run(`DELETE FROM uploads WHERE ${where}`, ...params);
  for (const name of names) fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => {});
}

function sendUpload(res, upload, disposition) {
  const filePath = path.join(UPLOAD_DIR, upload.stored_name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'File not found');
  res.writeHead(200, {
    'Content-Type': upload.mime,
    'Content-Length': upload.size,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(upload.original_name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

// Regular tidy-up: files picked in a form that was never submitted (after a day) and expired logins
function cleanUp() {
  try {
    deleteUploads("kind = 'answer' AND response_id IS NULL AND created_at < datetime('now', '-1 day')");
    run("DELETE FROM sessions WHERE created_at <= datetime('now', '-7 days')");
  } catch (err) {
    console.error('Clean-up failed', err);
  }
}

// ---------- forms and fields ----------

function parseShowIf(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function getFields(formId) {
  return all('SELECT id, label, type, required, options, show_if FROM fields WHERE form_id = ? ORDER BY position, id', formId)
    .map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: !!f.required,
      options: JSON.parse(f.options),
      show_if: parseShowIf(f.show_if),
    }));
}

function formPayload(form) {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    slug: form.slug,
    theme: form.theme,
    visual: form.visual,
    background: form.background ? `/media/${form.background}` : '',
    is_open: !!form.is_open,
    max_responses: form.max_responses,
    thank_you: form.thank_you,
    capacity: form.capacity,
    fields: getFields(form.id),
  };
}

const responseCount = (formId) => one('SELECT COUNT(*) AS n FROM responses WHERE form_id = ?', formId).n;
const isFull = (form) => form.max_responses > 0 && responseCount(form.id) >= form.max_responses;

function ownedForm(id, user) {
  const form = one('SELECT * FROM forms WHERE id = ? AND user_id = ?', Number(id), user.id);
  if (!form) throw new HttpError(404, 'Form not found');
  return form;
}

// Checks one question sent by the builder (or a template) and returns a clean copy
function cleanField(raw, index) {
  const type = String(raw?.type);
  if (!FIELD_TYPES.includes(type)) throw new HttpError(400, `Question ${index + 1} has an unknown type`);
  const label = cleanText(raw.label, 200) || (type === 'page' ? 'Next page' : '');
  if (!label) throw new HttpError(400, `Question ${index + 1} needs a label`);

  let options = [];
  if (CHOICE_TYPES.includes(type)) {
    options = (Array.isArray(raw.options) ? raw.options : []).map((o) => cleanText(o, 100)).filter(Boolean);
    options = [...new Set(options)].slice(0, 50);
    if (!options.length) throw new HttpError(400, `"${label}" needs at least one option`);
    // Checkbox answers are stored as "A, B", so a comma inside an option would break them apart
    if (type === 'checkbox' && options.some((o) => o.includes(','))) {
      throw new HttpError(400, `Options of "${label}" can't contain commas`);
    }
  }

  const showIf = type !== 'page' && isObject(raw.show_if)
    ? { field: String(raw.show_if.field ?? ''), value: cleanText(raw.show_if.value, 100) }
    : null;

  return {
    id: Number(raw.id) || null,
    key: String(raw.key ?? raw.id ?? ''),
    label,
    type,
    required: type !== 'page' && raw.required ? 1 : 0,
    options,
    showIf,
  };
}

// Replaces the questions of a form. Call inside a transaction.
// Existing questions keep their id so answers already collected stay attached to them.
function saveFields(formId, rawFields) {
  const fields = (Array.isArray(rawFields) ? rawFields : []).slice(0, 100).map(cleanField);

  const usedKeys = new Set();
  fields.forEach((f, i) => {
    if (!f.key || usedKeys.has(f.key)) f.key = `auto-${i}`;
    usedKeys.add(f.key);
  });

  // A question may only depend on a choice question that comes before it
  fields.forEach((f, i) => {
    if (!f.showIf) return;
    const refIndex = fields.findIndex((other) => other.key === f.showIf.field);
    const ref = fields[refIndex];
    if (!ref) {
      f.showIf = null; // the question it depended on was removed
      return;
    }
    if (refIndex >= i) throw new HttpError(400, `"${f.label}" depends on "${ref.label}", so it must come below it`);
    if (!CHOICE_TYPES.includes(ref.type)) throw new HttpError(400, `"${f.label}" can only depend on a choice question`);
    if (!ref.options.includes(f.showIf.value)) {
      throw new HttpError(400, `"${f.label}" depends on the option "${f.showIf.value}", which "${ref.label}" no longer has`);
    }
  });

  const existingIds = all('SELECT id FROM fields WHERE form_id = ?', formId).map((r) => r.id);
  const idByKey = {};
  fields.forEach((f, position) => {
    if (f.id && existingIds.includes(f.id)) {
      run('UPDATE fields SET label = ?, type = ?, required = ?, options = ?, position = ? WHERE id = ?',
        f.label, f.type, f.required, JSON.stringify(f.options), position, f.id);
    } else {
      f.id = run('INSERT INTO fields (form_id, label, type, required, options, position) VALUES (?, ?, ?, ?, ?, ?)',
        formId, f.label, f.type, f.required, JSON.stringify(f.options), position).id;
    }
    idByKey[f.key] = f.id;
  });

  // Now that every question has an id, store the conditions using ids
  for (const f of fields) {
    const showIf = f.showIf ? JSON.stringify({ field: idByKey[f.showIf.field], value: f.showIf.value }) : '';
    run('UPDATE fields SET show_if = ? WHERE id = ?', showIf, f.id);
  }

  const kept = new Set(fields.map((f) => f.id));
  existingIds.filter((id) => !kept.has(id)).forEach((id) => run('DELETE FROM fields WHERE id = ?', id));
}

// ---------- answers ----------

// Is this question shown, given the answers to the questions before it?
function isVisible(field, values, fieldsById) {
  if (!field.show_if) return true;
  const ref = fieldsById.get(field.show_if.field);
  if (!ref) return true;
  const answer = values.get(ref.id) || '';
  return ref.type === 'checkbox' ? answer.split(', ').includes(field.show_if.value) : answer === field.show_if.value;
}

// Checks one submitted answer against its question. Returns the text to store, or '' if empty.
function cleanAnswer(field, raw, formId) {
  if (field.type === 'file') {
    const token = typeof raw === 'string' ? raw : '';
    if (!token) {
      if (field.required) throw new HttpError(400, `"${field.label}" is required`);
      return '';
    }
    const upload = one(
      "SELECT id FROM uploads WHERE token = ? AND form_id = ? AND kind = 'answer' AND response_id IS NULL",
      token, formId
    );
    if (!upload) throw new HttpError(400, `The file for "${field.label}" was not found. Choose it again.`);
    return token;
  }

  let value;
  if (field.type === 'checkbox') {
    const picked = (Array.isArray(raw) ? raw : []).map(String).filter((v) => field.options.includes(v));
    value = field.options.filter((o) => picked.includes(o)).join(', ');
  } else {
    value = cleanText(raw, 5000);
  }
  if (!value) {
    if (field.required) throw new HttpError(400, `"${field.label}" is required`);
    return '';
  }
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HttpError(400, `"${field.label}" must be a valid email`);
  }
  if (field.type === 'number' && !Number.isFinite(Number(value))) {
    throw new HttpError(400, `"${field.label}" must be a number`);
  }
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `"${field.label}" must be a date`);
  }
  if ((field.type === 'select' || field.type === 'radio') && !field.options.includes(value)) {
    throw new HttpError(400, `"${field.label}" has an invalid choice`);
  }
  return value;
}

// ---------- filtering responses with SQL ----------

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');
const quoteSql = (value) => (typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const HAS_ANSWER = 'EXISTS (SELECT 1 FROM answers a WHERE a.response_id = r.id AND a.field_id = ?';

// Turns the filters chosen on the responses page into one SQL query.
// Returns the query with ? placeholders (to run) and with the values filled in (to show on the page).
function buildFilter(form, filters) {
  const f = isObject(filters) ? filters : {};
  const wantedAnswers = isObject(f.answers) ? f.answers : {};
  const minimums = isObject(f.min) ? f.min : {};
  const clauses = [{ sql: 'r.form_id = ?', params: [form.id] }];

  for (const field of getFields(form.id)) {
    const wanted = cleanText(wantedAnswers[field.id], 100);
    if (wanted && (field.type === 'select' || field.type === 'radio')) {
      clauses.push({ sql: `${HAS_ANSWER} AND a.value = ?)`, params: [field.id, wanted], note: field.label });
    }
    if (wanted && field.type === 'checkbox') {
      clauses.push({
        sql: `${HAS_ANSWER} AND ', ' || a.value || ', ' LIKE ? ESCAPE '\\')`,
        params: [field.id, `%, ${escapeLike(wanted)}, %`],
        note: field.label,
      });
    }
    const min = minimums[field.id];
    if (field.type === 'number' && min !== '' && min != null && Number.isFinite(Number(min))) {
      clauses.push({ sql: `${HAS_ANSWER} AND CAST(a.value AS REAL) >= ?)`, params: [field.id, Number(min)], note: field.label });
    }
  }

  if (Object.hasOwn(STATUSES, f.status)) {
    clauses.push({ sql: 'r.status = ?', params: [STATUSES[f.status]] });
  }
  const search = cleanText(f.q, 100);
  if (search) {
    clauses.push({
      sql: "EXISTS (SELECT 1 FROM answers a WHERE a.response_id = r.id AND a.value LIKE ? ESCAPE '\\')",
      params: [`%${escapeLike(search)}%`],
    });
  }

  const head = 'SELECT r.id, r.submitted_at, r.status\n  FROM responses r\n WHERE ';
  const tail = '\n ORDER BY r.id';
  const sql = head + clauses.map((c) => c.sql).join('\n   AND ') + tail;
  const display = head + clauses.map((c) => {
    let i = 0;
    const text = c.sql.replace(/\?/g, () => quoteSql(c.params[i++]));
    return c.note ? `${text}  -- ${c.note.replace(/\s+/g, ' ')}` : text;
  }).join('\n   AND ') + tail + ';';
  return { sql, params: clauses.flatMap((c) => c.params), display };
}

// ---------- routes ----------

const routes = [];
function route(method, pattern, handler, { auth = true, raw = 0 } = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, key) => { keys.push(key); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler, auth, raw });
}

// --- accounts ---

route('POST', '/api/signup', ({ req, body, res }) => {
  LIMITS.auth(req);
  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 200).toLowerCase();
  const password = String(body.password ?? '');
  if (!name) throw new HttpError(400, 'Enter your name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'That email is already registered');

  const { id } = run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, hashPassword(password));
  sendJson(res, 201, { user: { id, name, email } }, startSession(req, id));
}, { auth: false });

route('POST', '/api/login', ({ req, body, res }) => {
  LIMITS.auth(req);
  const email = cleanText(body.email, 200).toLowerCase();
  const user = one('SELECT * FROM users WHERE email = ?', email);
  if (!user || !checkPassword(String(body.password ?? ''), user.password_hash)) {
    throw new HttpError(401, 'Wrong email or password');
  }
  sendJson(res, 200, { user: { id: user.id, name: user.name, email: user.email } }, startSession(req, user.id));
}, { auth: false });

route('POST', '/api/logout', ({ req, res }) => {
  const token = sessionToken(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}, { auth: false });

route('GET', '/api/me', ({ user, res }) => sendJson(res, 200, { user }));

// Lists the builder shows: colour themes and moving backgrounds
route('GET', '/api/options', ({ res }) => sendJson(res, 200, { themes: THEMES, visuals: VISUALS, demo: DEMO_MODE }), { auth: false });

// --- forms ---

route('GET', '/api/templates', ({ res }) => {
  const templates = Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    title: t.title,
    blurb: t.blurb,
    theme: t.theme,
    visual: t.visual,
    questions: t.fields.filter((f) => f.type !== 'page').length,
  }));
  sendJson(res, 200, { templates });
});

route('GET', '/api/forms', ({ user, res }) => {
  const forms = all(
    `SELECT f.id, f.title, f.slug, f.theme, f.visual, f.background, f.is_open, f.max_responses, f.created_at,
            (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS response_count
       FROM forms f
      WHERE f.user_id = ?
      ORDER BY f.id DESC`,
    user.id
  ).map((f) => ({ ...f, is_open: !!f.is_open, background: f.background ? `/media/${f.background}` : '' }));
  sendJson(res, 200, { forms });
});

route('POST', '/api/forms', ({ user, body, res }) => {
  const template = Object.hasOwn(TEMPLATES, body.template) ? TEMPLATES[body.template] : TEMPLATES.blank;
  const formId = transaction(() => {
    const { id } = run(
      'INSERT INTO forms (user_id, title, description, slug, theme, visual) VALUES (?, ?, ?, ?, ?, ?)',
      user.id, template.title, template.description, newSlug(), template.theme, template.visual
    );
    saveFields(id, template.fields);
    return id;
  });
  sendJson(res, 201, { form: formPayload(one('SELECT * FROM forms WHERE id = ?', formId)) });
});

route('GET', '/api/forms/:id', ({ user, params, res }) => {
  sendJson(res, 200, { form: formPayload(ownedForm(params.id, user)) });
});

// Save everything from the builder: text, look, settings and the questions
route('PUT', '/api/forms/:id', ({ user, params, body, res }) => {
  const form = ownedForm(params.id, user);
  const title = cleanText(body.title, 150) || 'Untitled form';
  const description = cleanText(body.description, 1000);
  const theme = THEMES.includes(body.theme) ? body.theme : form.theme;
  const visual = VISUALS.includes(body.visual) ? body.visual : form.visual;
  const thankYou = cleanText(body.thank_you, 500);
  const limit = body.max_responses === '' || body.max_responses == null ? 0 : Number(body.max_responses);
  if (!Number.isInteger(limit) || limit < 0 || limit > 100000) {
    throw new HttpError(400, 'The response limit must be a whole number (0 means no limit)');
  }

  transaction(() => {
    run(
      `UPDATE forms SET title = ?, description = ?, theme = ?, visual = ?, is_open = ?, max_responses = ?, thank_you = ?
        WHERE id = ?`,
      title, description, theme, visual, body.is_open ? 1 : 0, limit, thankYou, form.id
    );
    saveFields(form.id, body.fields);
  });
  sendJson(res, 200, { form: formPayload(one('SELECT * FROM forms WHERE id = ?', form.id)) });
});

route('POST', '/api/forms/:id/duplicate', ({ user, params, res }) => {
  const form = ownedForm(params.id, user);
  const newId = transaction(() => {
    const { id } = run(
      `INSERT INTO forms (user_id, title, description, slug, theme, visual, max_responses, thank_you, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, `Copy of ${form.title}`.slice(0, 150), form.description, newSlug(),
      form.theme, form.visual, form.max_responses, form.thank_you, form.capacity
    );
    // Same questions as new rows; conditions point at the copies through their old ids used as keys
    saveFields(id, getFields(form.id).map((f) => ({
      ...f,
      id: null,
      key: String(f.id),
      show_if: f.show_if && { field: String(f.show_if.field), value: f.show_if.value },
    })));

    const bg = form.background && one("SELECT * FROM uploads WHERE token = ? AND kind = 'background'", form.background);
    if (bg && fs.existsSync(path.join(UPLOAD_DIR, bg.stored_name))) {
      const token = crypto.randomBytes(16).toString('hex');
      const storedName = token + path.extname(bg.stored_name);
      fs.copyFileSync(path.join(UPLOAD_DIR, bg.stored_name), path.join(UPLOAD_DIR, storedName));
      run('INSERT INTO uploads (token, form_id, kind, original_name, mime, size, stored_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        token, id, 'background', bg.original_name, bg.mime, bg.size, storedName);
      run('UPDATE forms SET background = ? WHERE id = ?', token, id);
    }
    return id;
  });
  sendJson(res, 201, { form: formPayload(one('SELECT * FROM forms WHERE id = ?', newId)) });
});

route('DELETE', '/api/forms/:id', ({ user, params, res }) => {
  const form = ownedForm(params.id, user);
  transaction(() => {
    deleteUploads('form_id = ?', form.id);
    run('DELETE FROM forms WHERE id = ?', form.id);
  });
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/forms/:id/background', ({ user, params, req, body, res }) => {
  const form = ownedForm(params.id, user);
  const upload = saveUpload({
    formId: form.id, kind: 'background', buffer: body, mime: contentType(req), name: fileNameFrom(req), allowed: IMAGE_TYPES,
  });
  run('UPDATE forms SET background = ? WHERE id = ?', upload.token, form.id);
  if (form.background) deleteUploads('token = ?', form.background);
  sendJson(res, 200, { background: `/media/${upload.token}` });
}, { raw: MAX_BACKGROUND_SIZE });

route('DELETE', '/api/forms/:id/background', ({ user, params, res }) => {
  const form = ownedForm(params.id, user);
  run("UPDATE forms SET background = '' WHERE id = ?", form.id);
  if (form.background) deleteUploads('token = ?', form.background);
  sendJson(res, 200, { background: '' });
});

// --- responses ---

// Responses that match the filters, plus counts and the SQL that found them
route('POST', '/api/forms/:id/query', ({ user, params, body, res }) => {
  const form = ownedForm(params.id, user);
  const filter = buildFilter(form, body.filters);
  const matching = all(filter.sql, ...filter.params);

  const answers = new Map();
  for (const row of all(
    'SELECT a.response_id, a.field_id, a.value FROM answers a JOIN responses r ON r.id = a.response_id WHERE r.form_id = ?',
    form.id
  )) {
    if (!answers.has(row.response_id)) answers.set(row.response_id, {});
    answers.get(row.response_id)[row.field_id] = row.value;
  }

  const stats = { total: 0, pending: 0, selected: 0, waiting: 0, not_eligible: 0 };
  for (const row of all('SELECT status, COUNT(*) AS n FROM responses WHERE form_id = ? GROUP BY status', form.id)) {
    stats[row.status || 'pending'] = row.n;
    stats.total += row.n;
  }

  const files = {};
  for (const u of all("SELECT token, original_name, size FROM uploads WHERE form_id = ? AND kind = 'answer' AND response_id IS NOT NULL", form.id)) {
    files[u.token] = { name: u.original_name, size: u.size };
  }

  sendJson(res, 200, {
    form: formPayload(form),
    responses: matching.map((r) => ({
      id: r.id,
      submitted_at: r.submitted_at,
      status: r.status || 'pending',
      answers: answers.get(r.id) || {},
    })),
    stats,
    files,
    sql: filter.display,
  });
});

// Seat allocation: responses matching the filters are eligible; the earliest ones get the seats,
// the rest go on the waiting list, and everybody else is marked not eligible.
route('POST', '/api/forms/:id/select', ({ user, params, body, res }) => {
  const form = ownedForm(params.id, user);
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
    throw new HttpError(400, 'Enter the number of seats (at least 1)');
  }
  const filters = { ...(isObject(body.filters) ? body.filters : {}) };
  delete filters.status; // the current status must not decide who is eligible

  const filter = buildFilter(form, filters);
  const eligible = all(filter.sql, ...filter.params).map((r) => r.id);
  const total = one('SELECT COUNT(*) AS n FROM responses WHERE form_id = ?', form.id).n;

  transaction(() => {
    run('UPDATE forms SET capacity = ? WHERE id = ?', capacity, form.id);
    run("UPDATE responses SET status = 'not_eligible' WHERE form_id = ?", form.id);
    eligible.forEach((id, i) => run('UPDATE responses SET status = ? WHERE id = ?', i < capacity ? 'selected' : 'waiting', id));
  });
  sendJson(res, 200, {
    selected: Math.min(capacity, eligible.length),
    waiting: Math.max(eligible.length - capacity, 0),
    not_eligible: total - eligible.length,
  });
});

route('POST', '/api/forms/:id/reset-status', ({ user, params, res }) => {
  const form = ownedForm(params.id, user);
  run("UPDATE responses SET status = '' WHERE form_id = ?", form.id);
  sendJson(res, 200, { ok: true });
});

// Change one response's status by hand
route('PATCH', '/api/responses/:id', ({ user, params, body, res }) => {
  if (!Object.hasOwn(STATUSES, body.status)) throw new HttpError(400, 'Unknown status');
  const { changes } = run(
    'UPDATE responses SET status = ? WHERE id = ? AND form_id IN (SELECT id FROM forms WHERE user_id = ?)',
    STATUSES[body.status], Number(params.id), user.id
  );
  if (!changes) throw new HttpError(404, 'Response not found');
  sendJson(res, 200, { ok: true });
});

route('DELETE', '/api/responses/:id', ({ user, params, res }) => {
  const response = one(
    'SELECT r.id FROM responses r JOIN forms f ON f.id = r.form_id WHERE r.id = ? AND f.user_id = ?',
    Number(params.id), user.id
  );
  if (!response) throw new HttpError(404, 'Response not found');
  transaction(() => {
    deleteUploads('response_id = ?', response.id);
    run('DELETE FROM responses WHERE id = ?', response.id);
  });
  sendJson(res, 200, { ok: true });
});

// A file attached to an answer; only the form's owner can open it
route('GET', '/api/files/:token', ({ user, params, res }) => {
  const upload = one(
    `SELECT u.* FROM uploads u JOIN forms f ON f.id = u.form_id
      WHERE u.token = ? AND u.kind = 'answer' AND f.user_id = ?`,
    params.token, user.id
  );
  if (!upload) throw new HttpError(404, 'File not found');
  sendUpload(res, upload, IMAGE_TYPES[upload.mime] ? 'inline' : 'attachment');
});

// --- public pages ---

// What a visitor sees when opening the shared link
route('GET', '/api/public/:slug', ({ params, res }) => {
  const form = one('SELECT * FROM forms WHERE slug = ?', params.slug);
  if (!form) throw new HttpError(404, 'This form does not exist');
  const { id, capacity, max_responses, ...payload } = formPayload(form);
  sendJson(res, 200, { form: { ...payload, is_full: isFull(form) } });
}, { auth: false });

function openPublicForm(slug) {
  const form = one('SELECT * FROM forms WHERE slug = ?', slug);
  if (!form) throw new HttpError(404, 'This form does not exist');
  if (!form.is_open) throw new HttpError(403, 'This form is no longer accepting responses');
  if (isFull(form)) throw new HttpError(403, 'This form has reached its response limit');
  return form;
}

// Files are uploaded first; the submit then refers to them by token
route('POST', '/api/public/:slug/upload', ({ params, req, body, res }) => {
  LIMITS.upload(req);
  const form = openPublicForm(params.slug);
  if (!one("SELECT id FROM fields WHERE form_id = ? AND type = 'file'", form.id)) {
    throw new HttpError(400, 'This form does not accept files');
  }
  const mime = contentType(req);
  if (!ANSWER_FILE_TYPES[mime]) throw new HttpError(400, 'Allowed files: images, PDF, Word and text files');
  sendJson(res, 201, saveUpload({
    formId: form.id, kind: 'answer', buffer: body, mime, name: fileNameFrom(req), allowed: ANSWER_FILE_TYPES,
  }));
}, { auth: false, raw: MAX_ANSWER_FILE_SIZE });

route('POST', '/api/public/:slug/submit', ({ params, req, body, res }) => {
  LIMITS.submit(req);
  const form = openPublicForm(params.slug);

  const submitted = isObject(body.answers) ? body.answers : {};
  const fields = getFields(form.id);
  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  // Questions hidden by a condition are skipped, so they can't be required
  const values = new Map();
  for (const field of fields) {
    if (field.type === 'page' || !isVisible(field, values, fieldsById)) continue;
    values.set(field.id, cleanAnswer(field, submitted[field.id], form.id));
  }

  transaction(() => {
    const { id } = run('INSERT INTO responses (form_id) VALUES (?)', form.id);
    for (const [fieldId, value] of values) {
      if (!value) continue;
      run('INSERT INTO answers (response_id, field_id, value) VALUES (?, ?, ?)', id, fieldId, value);
      if (fieldsById.get(fieldId).type === 'file') run('UPDATE uploads SET response_id = ? WHERE token = ?', id, value);
    }
  });
  sendJson(res, 201, { ok: true });
}, { auth: false });

// ---------- pages and static files ----------

const PAGES = {
  '/': 'index.html',
  '/login': 'auth.html',
  '/signup': 'auth.html',
  '/dashboard': 'dashboard.html',
  '/builder': 'builder.html',
  '/responses': 'responses.html',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendNotFound(res) {
  fs.readFile(path.join(PUBLIC_DIR, '404.html'), (err, content) => {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(err ? 'Page not found' : content);
  });
}

function serveFile(res, relativePath) {
  const filePath = path.join(PUBLIC_DIR, relativePath);
  // Never serve anything outside the public folder
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendNotFound(res);
  fs.readFile(filePath, (err, content) => {
    if (err) return sendNotFound(res);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  });
}

// ---------- the server ----------

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'Bad address');
    }

    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        const match = r.method === req.method && r.regex.exec(pathname);
        if (!match) continue;
        const user = currentUser(req);
        if (r.auth && !user) throw new HttpError(401, 'Log in first');
        const params = Object.fromEntries(r.keys.map((key, i) => [key, match[i + 1]]));
        let body = {};
        if (r.raw) body = await readRaw(req, r.raw);
        else if (req.method !== 'GET') body = parseJson(await readRaw(req, 200_000));
        return await r.handler({ req, res, user, params, body });
      }
      throw new HttpError(404, 'Not found');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');

    // Hosting services call this to check that the app is alive
    if (pathname === '/healthz') {
      one('SELECT 1 AS ok');
      return sendJson(res, 200, { ok: true });
    }

    // Background images are public because anybody opening the form sees them
    const media = /^\/media\/([a-f0-9]{32})$/.exec(pathname);
    if (media) {
      const upload = one("SELECT * FROM uploads WHERE token = ? AND kind = 'background'", media[1]);
      if (!upload) return sendNotFound(res);
      return sendUpload(res, upload, 'inline');
    }

    if (PAGES[pathname]) return serveFile(res, PAGES[pathname]);
    if (/^\/f\/[\w-]+$/.test(pathname)) return serveFile(res, 'form.html');
    return serveFile(res, pathname.slice(1));
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  }
});

cleanUp();
setInterval(cleanUp, 60 * 60 * 1000).unref();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already used by another program. Start on another port, for example:`);
    const next = PORT + 1;
    console.error(process.platform === 'win32' ? `  $env:PORT=${next}; node server.js` : `  PORT=${next} node server.js`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`FormCraft is running at http://localhost:${PORT}`);
  console.log(`Data folder: ${DATA_DIR}`);
  if (DEMO_MODE) console.log('Demo mode: pages show that data can be reset');
});

// Hosting services stop the app with SIGTERM when they deploy a new version; finish cleanly
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
