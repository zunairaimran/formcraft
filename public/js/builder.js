// The form builder: edit the title, questions, conditions and look, then save to the server

const formId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);

let form = null;      // the form being edited
let dirty = false;    // true when there are unsaved changes
let newKeys = 0;      // counter for keys of questions that are not saved yet
let options = { themes: [], visuals: [] };   // filled from /api/options
let playing = { key: '', handle: null };     // the moving background shown on the canvas

function markDirty() {
  dirty = true;
  $('save-state').textContent = 'Unsaved changes';
}

// Conditions point at other questions by key. Saved questions use their id as key;
// new questions get a temporary key until the server gives them an id.
function withKeys(field) {
  return {
    ...field,
    key: String(field.id),
    show_if: field.show_if ? { field: String(field.show_if.field), value: field.show_if.value } : null,
  };
}

const dependentsOf = (key) => form.fields.filter((f) => f.show_if && f.show_if.field === key);

// ----- drawing -----

function renderPalette() {
  $('palette').innerHTML = Object.entries(FIELD_TYPES).map(([type, info]) =>
    `<button class="add-field" data-type="${type}"><i>${info.icon}</i>${info.name}</button>`
  ).join('');
}

function renderSwatches() {
  $('swatches').innerHTML = options.themes.map((name) =>
    `<button class="swatch themed theme-${name} ${form.theme === name ? 'active' : ''}" data-theme="${name}" aria-label="${name} theme"><span>${name}</span></button>`
  ).join('');
  $('canvas').className = `canvas themed theme-${form.theme}`;
  renderBackground();
  playVisual();
}

function renderVisuals() {
  $('visuals').innerHTML = options.visuals.map((name) => {
    const info = Visuals.LIST[name] || { label: name, icon: '?' };
    return `<button class="visual-opt ${form.visual === name ? 'active' : ''}" data-visual="${name}"><b aria-hidden="true">${info.icon}</b>${esc(info.label)}</button>`;
  }).join('');
}

// Start the moving background on the canvas. It restarts only when the visual or theme changed,
// because bubbles take their colour from the theme.
function playVisual() {
  const key = form.visual + '|' + form.theme;
  if (playing.key === key) return;
  if (playing.handle) playing.handle.stop();
  playing = { key, handle: Visuals.mount($('canvas'), form.visual, 'absolute') };
}

function renderBackground() {
  applyBackground($('canvas'), form.background);
  const preview = $('bg-preview');
  preview.style.backgroundImage = form.background ? `url("${form.background}")` : '';
  preview.textContent = form.background ? '' : 'No image';
  $('bg-remove').classList.toggle('hidden', !form.background);
}

// The "Show only if ... is ..." row under a question
function conditionHtml(field, index) {
  if (field.type === 'page') return '';
  const sources = form.fields.slice(0, index).filter((f) => CHOICE_TYPES.includes(f.type));
  if (!sources.length && !field.show_if) return '';

  const on = Boolean(field.show_if);
  const ref = on ? form.fields.find((f) => f.key === field.show_if.field) : null;
  let selects = '';
  let warning = '';

  if (on) {
    const refIsBelow = ref && !sources.includes(ref);
    const fieldOptions = sources.map((s) =>
      `<option value="${esc(s.key)}" ${ref === s ? 'selected' : ''}>${esc(s.label)}</option>`).join('')
      + (refIsBelow ? `<option value="${esc(ref.key)}" selected>${esc(ref.label)}</option>` : '');
    const options = ref ? ref.options : [];
    const missing = !options.includes(field.show_if.value);
    const valueOptions = options.map((o) =>
      `<option ${o === field.show_if.value ? 'selected' : ''}>${esc(o)}</option>`).join('')
      + (missing ? `<option selected value="${esc(field.show_if.value)}">${esc(field.show_if.value)} (removed)</option>` : '');

    selects = `
      <select class="select" data-key="cond-field" aria-label="Question it depends on">${fieldOptions}</select>
      <span>is</span>
      <select class="select" data-key="cond-value" aria-label="Answer that shows it">${valueOptions}</select>`;
    if (refIsBelow) warning = 'Move this question below the one it depends on.';
    else if (missing) warning = 'Pick an option that still exists.';
  }

  return `<div class="cond">
    <label class="check"><input type="checkbox" data-key="cond-on" ${on ? 'checked' : ''}> Show only if</label>
    ${selects}
    ${warning ? `<p class="hint warn">${warning}</p>` : ''}
  </div>`;
}

function fieldCard(field, index) {
  const actions = `
    <div class="fcard-actions">
      <button class="icon-btn" data-act="up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
      <button class="icon-btn" data-act="down" aria-label="Move down" ${index === form.fields.length - 1 ? 'disabled' : ''}>&darr;</button>
      <button class="icon-btn" data-act="delete" aria-label="Delete">&#10005;</button>
    </div>`;

  if (field.type === 'page') {
    return `<div class="fcard fcard-page" data-index="${index}">
      <div class="fcard-head"><span class="ftype">Page break</span>${actions}</div>
      <input class="input" data-key="label" maxlength="200" placeholder="Title of the next page" value="${esc(field.label)}" aria-label="Page title">
      <p class="hint">Questions below this line appear on a new page.</p>
    </div>`;
  }

  return `<div class="fcard" data-index="${index}">
    <div class="fcard-head"><span class="ftype">${FIELD_TYPES[field.type].name}</span>${actions}</div>
    <input class="input" data-key="label" maxlength="200" placeholder="Question" value="${esc(field.label)}" aria-label="Question">
    ${CHOICE_TYPES.includes(field.type) ? `
      <textarea class="textarea" data-key="options" placeholder="One option per line" aria-label="Options">${esc(field.options.join('\n'))}</textarea>
      <p class="hint">One option per line.</p>` : ''}
    ${field.type === 'file' ? '<p class="hint">People can attach an image, PDF, Word or text file up to 5 MB.</p>' : ''}
    <div class="fcard-foot">
      <label class="check"><input type="checkbox" data-key="required" ${field.required ? 'checked' : ''}> Required</label>
    </div>
    ${conditionHtml(field, index)}
  </div>`;
}

function renderFields() {
  $('fields').innerHTML = form.fields.length
    ? form.fields.map(fieldCard).join('')
    : '<div class="empty">Add your first question from the list on the left.</div>';
}

function renderShare() {
  const link = publicLink(form.slug);
  $('link').value = link;
  $('qr').innerHTML = '';
  if (!window.QRCode) {
    // The QR library loads from the internet; without it the section is hidden
    $('qr-wrap').classList.add('hidden');
    return;
  }
  new QRCode($('qr'), { text: link, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
  $('qr-local').classList.toggle('hidden', !['localhost', '127.0.0.1'].includes(location.hostname));
}

function renderAll() {
  $('title').value = form.title;
  $('description').value = form.description;
  $('is-open').checked = form.is_open;
  $('limit').value = form.max_responses || '';
  $('thank-you').value = form.thank_you;
  $('responses-link').href = '/responses?id=' + form.id;
  renderSwatches();
  renderVisuals();
  renderFields();
}

// ----- editing questions -----

$('palette').addEventListener('click', (event) => {
  const button = event.target.closest('.add-field');
  if (!button) return;
  const type = button.dataset.type;
  form.fields.push({
    id: null,
    key: `new-${++newKeys}`,
    label: type === 'page' ? 'Next page' : FIELD_TYPES[type].name,
    type,
    required: false,
    options: CHOICE_TYPES.includes(type) ? ['Option 1', 'Option 2'] : [],
    show_if: null,
  });
  markDirty();
  renderFields();
  // Put the cursor in the new question so it can be renamed right away
  const input = $('fields').lastElementChild.querySelector('[data-key="label"]');
  input.focus();
  input.select();
});

// Typing updates the form object without redrawing, so the cursor stays where it is
$('fields').addEventListener('input', (event) => {
  const card = event.target.closest('.fcard');
  const key = event.target.dataset.key;
  if (!card || !['label', 'required', 'options'].includes(key)) return;
  const field = form.fields[Number(card.dataset.index)];
  if (key === 'label') field.label = event.target.value;
  if (key === 'required') field.required = event.target.checked;
  if (key === 'options') field.options = event.target.value.split('\n').map((o) => o.trim()).filter(Boolean);
  markDirty();
});

$('fields').addEventListener('change', (event) => {
  const card = event.target.closest('.fcard');
  const key = event.target.dataset.key;
  if (!card || !key) return;
  const index = Number(card.dataset.index);
  const field = form.fields[index];

  if (key === 'label' || key === 'options') {
    // Questions that depend on this one show its label and options, so redraw them
    if (dependentsOf(field.key).length) renderFields();
    return;
  }
  if (key === 'cond-on') {
    const source = form.fields.slice(0, index).find((f) => CHOICE_TYPES.includes(f.type));
    field.show_if = event.target.checked && source ? { field: source.key, value: source.options[0] || '' } : null;
  } else if (key === 'cond-field') {
    const ref = form.fields.find((f) => f.key === event.target.value);
    field.show_if = { field: ref.key, value: ref.options[0] || '' };
  } else if (key === 'cond-value') {
    field.show_if.value = event.target.value;
  } else {
    return;
  }
  markDirty();
  renderFields();
});

$('fields').addEventListener('click', (event) => {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const i = Number(button.closest('.fcard').dataset.index);
  const fields = form.fields;

  if (button.dataset.act === 'up') [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
  if (button.dataset.act === 'down') [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
  if (button.dataset.act === 'delete') {
    const savedQuestion = fields[i].id && fields[i].type !== 'page';
    if (savedQuestion && !confirm('Delete this question? Answers already collected for it will be removed when you save.')) return;
    const dependents = dependentsOf(fields[i].key);
    dependents.forEach((f) => { f.show_if = null; });
    fields.splice(i, 1);
    if (dependents.length) toast('Conditions that used this question were removed');
  }
  markDirty();
  renderFields();
});

// ----- look and settings -----

$('swatches').addEventListener('click', (event) => {
  const swatch = event.target.closest('.swatch');
  if (!swatch) return;
  form.theme = swatch.dataset.theme;
  markDirty();
  renderSwatches();
});

$('visuals').addEventListener('click', (event) => {
  const button = event.target.closest('.visual-opt');
  if (!button) return;
  form.visual = button.dataset.visual;
  markDirty();
  renderVisuals();
  playVisual();
});

$('bg-file').addEventListener('change', async () => {
  const file = $('bg-file').files[0];
  $('bg-file').value = '';
  if (!file) return;
  if (file.size > MAX_BACKGROUND_SIZE) return toast('The image is too large (max 3 MB)', true);
  try {
    form.background = (await uploadFile(`/api/forms/${form.id}/background`, file)).background;
    renderBackground();
    toast('Background image updated');
  } catch (err) {
    toast(err.message, true);
  }
});

$('bg-remove').addEventListener('click', async () => {
  try {
    await api('DELETE', `/api/forms/${form.id}/background`);
    form.background = '';
    renderBackground();
    toast('Background image removed');
  } catch (err) {
    toast(err.message, true);
  }
});

$('title').addEventListener('input', () => { form.title = $('title').value; markDirty(); });
$('description').addEventListener('input', () => { form.description = $('description').value; markDirty(); });
$('is-open').addEventListener('change', () => { form.is_open = $('is-open').checked; markDirty(); });
$('limit').addEventListener('input', () => { form.max_responses = $('limit').value; markDirty(); });
$('thank-you').addEventListener('input', () => { form.thank_you = $('thank-you').value; markDirty(); });

// ----- saving and sharing -----

async function save() {
  $('save').disabled = true;
  try {
    const data = await api('PUT', '/api/forms/' + form.id, form);
    form = { ...data.form, fields: data.form.fields.map(withKeys) };
    dirty = false;
    $('save-state').textContent = 'All changes saved';
    renderAll();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  } finally {
    $('save').disabled = false;
  }
}

$('save').addEventListener('click', async () => {
  if (await save()) toast('Form saved');
});

$('preview').addEventListener('click', async () => {
  if (dirty && !(await save())) return;
  window.open('/f/' + form.slug, '_blank');
});

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('link').value);
  toast('Link copied');
});

$('qr-download').addEventListener('click', () => {
  const canvas = $('qr').querySelector('canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${form.title.replace(/[^\w]+/g, '-').toLowerCase() || 'form'}-qr.png`;
  link.click();
});

// Ctrl+S saves
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    $('save').click();
  }
});

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});

// ----- start -----

requireUser().then(async () => {
  try {
    const [data, opts] = await Promise.all([api('GET', '/api/forms/' + formId), api('GET', '/api/options')]);
    options = opts;
    form = { ...data.form, fields: data.form.fields.map(withKeys) };
  } catch {
    location.href = '/dashboard';
    return;
  }
  renderPalette();
  renderAll();
  renderShare();
  $('save-state').textContent = 'All changes saved';
});
