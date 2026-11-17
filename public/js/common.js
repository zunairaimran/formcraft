// Helpers shared by every page

// Talk to the server. Returns the JSON reply or throws an Error with the server's message.
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no JSON in reply */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Make text safe to put inside HTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Small message at the bottom of the screen
function toast(message, bad = false) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// For pages that need a login: returns the user, or sends the visitor to /login
async function requireUser() {
  try {
    return (await api('GET', '/api/me')).user;
  } catch (err) {
    location.href = '/login';
    throw err;
  }
}

async function logout() {
  await api('POST', '/api/logout');
  location.href = '/';
}

const FIELD_TYPES = {
  text: { name: 'Short text', icon: 'Aa' },
  textarea: { name: 'Long text', icon: '¶' },
  email: { name: 'Email', icon: '@' },
  number: { name: 'Number', icon: '12' },
  date: { name: 'Date', icon: '31' },
  select: { name: 'Dropdown', icon: '▾' },
  radio: { name: 'Single choice', icon: '◉' },
  checkbox: { name: 'Multiple choice', icon: '☑' },
  file: { name: 'File upload', icon: '⇪' },
  page: { name: 'Page break', icon: '⤓' },
};

const CHOICE_TYPES = ['select', 'radio', 'checkbox'];

const STATUS_LABELS = {
  pending: 'Pending',
  selected: 'Selected',
  waiting: 'Waiting list',
  not_eligible: 'Not eligible',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_BACKGROUND_SIZE = 3 * 1024 * 1024;

const publicLink = (slug) => `${location.origin}/f/${slug}`;

// SQLite stores UTC like "2026-11-17 10:20:30"; show it in local time
const formatDate = (text) => new Date(text.replace(' ', 'T') + 'Z').toLocaleString();

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Send one file to the server as the raw request body
async function uploadFile(url, file) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no JSON in reply */ }
  if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
  return data;
}

// Put an uploaded picture behind a themed area (or remove it)
function applyBackground(el, url) {
  el.style.backgroundImage = url ? `url("${url}")` : '';
  el.classList.toggle('has-bg', Boolean(url));
}
