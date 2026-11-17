// The public page somebody opens from a shared link: /f/<slug>
// Handles pages (page breaks), questions that show only for some answers, and file uploads.

const slug = location.pathname.split('/').pop();
const body = document.getElementById('body');
const FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.txt';

let form = null;
let fields = [];      // questions, without page breaks
let pages = [];       // [{ title, fields }]
let current = 0;      // index of the page on screen
let theForm = null;

function message(title, text, tick = false) {
  body.innerHTML = `<div class="form-done">
    ${tick ? '<div class="tick">&#10003;</div>' : ''}
    <h1>${esc(title)}</h1>
    <p class="form-desc">${esc(text)}</p>
    ${tick ? `<a class="again" href="${esc(location.pathname)}">Submit another response</a>` : ''}
  </div>`;
}

// Page breaks split the questions into pages. A break at the very top only names the first page.
function buildPages(allFields) {
  const result = [];
  let page = { title: '', fields: [] };
  for (const f of allFields) {
    if (f.type !== 'page') {
      page.fields.push(f);
    } else if (page.fields.length) {
      result.push(page);
      page = { title: f.label, fields: [] };
    } else {
      page.title = f.label;
    }
  }
  if (page.fields.length || !result.length) result.push(page);
  return result;
}

// The HTML for one question
function fieldHtml(f) {
  const name = 'f' + f.id;
  const required = f.required ? 'required' : '';
  let control;
  if (f.type === 'textarea') {
    control = `<textarea class="textarea" name="${name}" id="${name}" ${required}></textarea>`;
  } else if (f.type === 'select') {
    control = `<select class="select" name="${name}" id="${name}" ${required}>
      <option value="">Choose…</option>
      ${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}
    </select>`;
  } else if (f.type === 'radio' || f.type === 'checkbox') {
    control = f.options.map((o) => `
      <label class="choice"><input type="${f.type}" name="${name}" value="${esc(o)}" ${f.type === 'radio' ? required : ''}> ${esc(o)}</label>`).join('');
  } else if (f.type === 'file') {
    control = `<input class="input" type="file" name="${name}" id="${name}" accept="${FILE_ACCEPT}" ${required}>
      <p class="file-hint">Image, PDF, Word or text file, up to 5 MB.</p>`;
  } else if (f.type === 'number') {
    control = `<input class="input" type="number" step="any" name="${name}" id="${name}" ${required}>`;
  } else {
    control = `<input class="input" type="${f.type}" name="${name}" id="${name}" ${required}>`;
  }
  return `<div class="q" data-field="${f.id}">
    <label class="q-label" for="${name}">${esc(f.label)}${f.required ? ' <b>*</b>' : ''}</label>
    ${control}
  </div>`;
}

const wrapOf = (f) => theForm.querySelector(`[data-field="${f.id}"]`);
const isHidden = (f) => wrapOf(f).classList.contains('hidden');

// The current answer of a question, read from the page
function readValue(f) {
  if (f.type === 'checkbox') return [...theForm.querySelectorAll(`[name="f${f.id}"]:checked`)].map((el) => el.value);
  if (f.type === 'radio') return theForm.querySelector(`[name="f${f.id}"]:checked`)?.value || '';
  if (f.type === 'file') return theForm.querySelector(`[name="f${f.id}"]`).files[0] || null;
  return theForm.querySelector(`[name="f${f.id}"]`).value.trim();
}

// Show or hide questions that depend on other answers.
// Hidden inputs are disabled so the browser does not ask for them.
function updateVisibility() {
  const values = new Map();
  for (const f of fields) {
    let visible = true;
    if (f.show_if) {
      const answer = values.get(f.show_if.field);
      visible = Array.isArray(answer) ? answer.includes(f.show_if.value) : answer === f.show_if.value;
    }
    const wrap = wrapOf(f);
    wrap.classList.toggle('hidden', !visible);
    wrap.querySelectorAll('input, select, textarea').forEach((el) => { el.disabled = !visible; });
    values.set(f.id, visible ? readValue(f) : '');
  }
}

// Pages that still have at least one visible question
function visiblePages() {
  const list = pages.map((_, i) => i).filter((i) => pages[i].fields.some((f) => !isHidden(f)));
  return list.length ? list : [0];
}

function showPage() {
  const list = visiblePages();
  if (!list.includes(current)) current = list.find((i) => i > current) ?? list[list.length - 1];
  const position = list.indexOf(current);
  const last = position === list.length - 1;

  theForm.querySelectorAll('.form-step').forEach((step) => {
    step.classList.toggle('hidden', Number(step.dataset.page) !== current);
  });
  document.getElementById('back').classList.toggle('hidden', position === 0);
  document.getElementById('next').classList.toggle('hidden', last);
  document.getElementById('submit').classList.toggle('hidden', !last);

  const steps = document.getElementById('steps');
  steps.classList.toggle('hidden', list.length < 2);
  steps.innerHTML = `<div class="steps-bar"><div style="width:${Math.round(((position + 1) / list.length) * 100)}%"></div></div>
    <p class="steps-text">Step ${position + 1} of ${list.length}</p>`;
  document.getElementById('error').textContent = '';
}

function showError(text) {
  document.getElementById('error').textContent = text;
  return false;
}

// Checks the visible questions of one page. With report = true the browser points at the problem.
function validatePage(index, report) {
  for (const f of pages[index].fields) {
    if (isHidden(f)) continue;
    if (f.type === 'checkbox') {
      if (f.required && !readValue(f).length) return report ? showError(`"${f.label}" is required`) : false;
      continue;
    }
    if (f.type === 'file') {
      const file = readValue(f);
      if (file && file.size > MAX_FILE_SIZE) return report ? showError(`"${file.name}" is larger than 5 MB`) : false;
    }
    for (const el of wrapOf(f).querySelectorAll('input, select, textarea')) {
      if (!el.checkValidity()) {
        if (report) el.reportValidity();
        return false;
      }
    }
  }
  return true;
}

function goNext() {
  if (!validatePage(current, true)) return;
  const list = visiblePages();
  current = list[list.indexOf(current) + 1] ?? current;
  showPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  const list = visiblePages();
  current = list[list.indexOf(current) - 1] ?? current;
  showPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submit(event) {
  event.preventDefault();
  const list = visiblePages();
  // Enter pressed on an earlier page means "next"
  if (current !== list[list.length - 1]) return goNext();

  // Check every page; jump to the first one with a problem
  for (const i of list) {
    if (!validatePage(i, false)) {
      current = i;
      showPage();
      validatePage(i, true);
      return;
    }
  }

  const button = document.getElementById('submit');
  button.disabled = true;
  try {
    const answers = {};
    for (const f of fields) {
      if (isHidden(f)) continue;
      const value = readValue(f);
      if (f.type === 'file') {
        if (!value) continue;
        button.textContent = 'Uploading file…';
        answers[f.id] = (await uploadFile(`/api/public/${slug}/upload`, value)).token;
      } else {
        answers[f.id] = value;
      }
    }
    button.textContent = 'Sending…';
    await api('POST', `/api/public/${slug}/submit`, { answers });
    message('Thank you', form.thank_you || 'Your response has been recorded.', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showError(err.message);
    button.disabled = false;
    button.textContent = 'Submit';
  }
}

function renderForm() {
  document.title = form.title;
  const page = document.getElementById('page');
  page.className = `form-page themed theme-${form.theme}`;
  applyBackground(page, form.background);
  Visuals.mount(page, form.visual, 'fixed');
  if (!form.is_open) return message(form.title, 'This form is no longer accepting responses.');
  if (form.is_full) return message(form.title, 'This form has reached its response limit, so it is closed now.');

  fields = form.fields.filter((f) => f.type !== 'page');
  pages = buildPages(form.fields);

  body.innerHTML = `
    <h1>${esc(form.title)}</h1>
    <p class="form-desc">${esc(form.description)}</p>
    <div class="steps" id="steps"></div>
    <form id="the-form" novalidate>
      ${pages.map((p, i) => `
        <section class="form-step" data-page="${i}">
          ${p.title ? `<h2 class="step-title">${esc(p.title)}</h2>` : ''}
          ${p.fields.map(fieldHtml).join('')}
        </section>`).join('')}
      <p class="form-error" id="error" role="alert"></p>
      <div class="form-nav">
        <button class="btn-back" type="button" id="back">Back</button>
        <span class="spacer"></span>
        <button class="form-submit" type="button" id="next">Next</button>
        <button class="form-submit" type="submit" id="submit">Submit</button>
      </div>
    </form>`;

  theForm = document.getElementById('the-form');
  theForm.addEventListener('submit', submit);
  theForm.addEventListener('input', updateVisibility);
  theForm.addEventListener('change', updateVisibility);
  document.getElementById('next').addEventListener('click', goNext);
  document.getElementById('back').addEventListener('click', goBack);
  updateVisibility();
  showPage();
}

api('GET', '/api/public/' + slug)
  .then((data) => { form = data.form; renderForm(); })
  .catch((err) => message('Form not found', err.message));
