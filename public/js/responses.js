// Responses page: filters (run as SQL on the server), seat allocation, charts, table and export

const formId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);

let form = null;
let data = null;      // last reply from /query
let timer = null;
const filters = { answers: {}, min: {}, status: '', q: '' };

const questions = () => form.fields.filter((f) => f.type !== 'page');

// ----- filters -----

function renderFilters() {
  const choice = form.fields.filter((f) => CHOICE_TYPES.includes(f.type));
  const numbers = form.fields.filter((f) => f.type === 'number');
  $('filters').innerHTML = `
    ${choice.map((f) => `
      <div>
        <label class="label">${esc(f.label)}</label>
        <select class="select" data-answer="${f.id}">
          <option value="">Any</option>
          ${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}
        </select>
      </div>`).join('')}
    ${numbers.map((f) => `
      <div>
        <label class="label">${esc(f.label)} — at least</label>
        <input class="input" type="number" step="any" data-min="${f.id}" placeholder="Any">
      </div>`).join('')}
    <div>
      <label class="label">Status</label>
      <select class="select" data-status>
        <option value="">Any</option>
        ${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="label">Search</label>
      <input class="input" type="search" data-q placeholder="Name, roll number…">
    </div>`;
}

$('filters').addEventListener('input', (event) => {
  const el = event.target;
  if (el.dataset.answer) filters.answers[el.dataset.answer] = el.value;
  if (el.dataset.min) filters.min[el.dataset.min] = el.value;
  if ('status' in el.dataset) filters.status = el.value;
  if ('q' in el.dataset) filters.q = el.value;
  // Wait until typing stops before asking the server
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});

$('clear').addEventListener('click', () => {
  Object.assign(filters, { answers: {}, min: {}, status: '', q: '' });
  $('filters').querySelectorAll('input, select').forEach((el) => { el.value = ''; });
  load();
});

// ----- drawing -----

function renderStats() {
  const s = data.stats;
  $('s-total').textContent = s.total;
  $('s-matching').textContent = data.responses.length;
  $('s-selected').textContent = s.selected;
  $('s-waiting').textContent = s.waiting;
  $('s-seats').textContent = form.capacity ? Math.max(form.capacity - s.selected, 0) + ' of ' + form.capacity : '—';
  $('showing').textContent = `Showing ${data.responses.length} of ${s.total} responses`;
}

function renderCharts() {
  const choice = form.fields.filter((f) => CHOICE_TYPES.includes(f.type));
  $('charts-box').classList.toggle('hidden', !choice.length || !data.responses.length);
  $('charts').innerHTML = choice.map((f) => {
    const counts = new Map(f.options.map((o) => [o, 0]));
    for (const r of data.responses) {
      const value = r.answers[f.id];
      if (!value) continue;
      for (const v of f.type === 'checkbox' ? value.split(', ') : [value]) counts.set(v, (counts.get(v) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return `<div class="chart">
      <h3>${esc(f.label)}</h3>
      ${[...counts].map(([option, n]) => `
        <div class="bar-row">
          <span class="bar-label" title="${esc(option)}">${esc(option)}</span>
          <div class="bar-track"><div class="bar" style="width:${Math.round((n / max) * 100)}%"></div></div>
          <span class="bar-n">${n}</span>
        </div>`).join('')}
    </div>`;
  }).join('');
}

function cellHtml(field, value) {
  if (!value) return '';
  if (field.type === 'file') {
    const file = data.files[value];
    return file ? `<a href="/api/files/${esc(value)}" target="_blank">${esc(file.name)}</a> <span class="muted">(${formatSize(file.size)})</span>` : '';
  }
  return esc(value);
}

function renderTable() {
  if (!data.stats.total) {
    $('table').innerHTML = '<div class="empty"><strong>Share your form to get responses</strong><br>Answers show up here as soon as somebody submits.</div>';
    return;
  }
  const cols = questions();
  $('table').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th>Submitted</th><th>Status</th>
        ${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}
        <th class="no-print"></th>
      </tr></thead>
      <tbody>
        ${data.responses.map((r) => `<tr>
          <td>${r.id}</td>
          <td style="white-space:nowrap">${esc(formatDate(r.submitted_at))}</td>
          <td>
            <select class="status-select st-${r.status}" data-response="${r.id}" aria-label="Status">
              ${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${key === r.status ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </td>
          ${cols.map((f) => `<td>${cellHtml(f, r.answers[f.id])}</td>`).join('')}
          <td class="no-print"><button class="btn btn-small btn-danger" data-delete="${r.id}">Delete</button></td>
        </tr>`).join('') || `<tr><td colspan="${cols.length + 4}" class="muted">No responses match these filters.</td></tr>`}
      </tbody>
    </table></div>`;
}

function render() {
  $('title').textContent = form.title;
  $('status').textContent = form.is_open ? 'Open' : 'Closed';
  $('status').className = 'badge ' + (form.is_open ? 'badge-open' : 'badge-closed');
  $('sql').textContent = data.sql;
  renderStats();
  renderCharts();
  renderTable();
}

async function load() {
  try {
    data = await api('POST', `/api/forms/${formId}/query`, { filters });
    form = data.form;
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

// ----- table actions -----

$('table').addEventListener('change', async (event) => {
  const id = event.target.dataset.response;
  if (!id) return;
  try {
    await api('PATCH', '/api/responses/' + id, { status: event.target.value });
    toast('Status updated');
  } catch (err) {
    toast(err.message, true);
  }
  load();
});

$('table').addEventListener('click', async (event) => {
  const id = event.target.dataset.delete;
  if (!id || !confirm("Delete this response? This can't be undone.")) return;
  await api('DELETE', '/api/responses/' + id);
  toast('Response deleted');
  load();
});

// ----- seat allocation -----

$('capacity').addEventListener('input', () => { $('cap-error').textContent = ''; });

$('allocate').addEventListener('click', async () => {
  const capacity = Number($('capacity').value);
  if (!Number.isInteger(capacity) || capacity < 1) {
    $('cap-error').textContent = 'Enter the number of seats (at least 1)';
    return;
  }
  const question = `Give ${capacity} seats to the earliest responses that match the current filters?\n\nThis replaces the status of every response.`;
  if (!confirm(question)) return;
  try {
    const result = await api('POST', `/api/forms/${formId}/select`, { filters, capacity });
    toast(`${result.selected} selected, ${result.waiting} on the waiting list, ${result.not_eligible} not eligible`);
    load();
  } catch (err) {
    $('cap-error').textContent = err.message;
  }
});

$('reset').addEventListener('click', async () => {
  if (!confirm('Set every response back to Pending?')) return;
  await api('POST', `/api/forms/${formId}/reset-status`);
  toast('All statuses reset');
  load();
});

// ----- export -----

$('print').addEventListener('click', () => window.print());

$('export').addEventListener('click', () => {
  if (!data.responses.length) return toast('There are no responses to download', true);
  const cols = questions();
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Response', 'Submitted', 'Status', ...cols.map((f) => f.label)],
    ...data.responses.map((r) => [
      r.id,
      formatDate(r.submitted_at),
      STATUS_LABELS[r.status],
      ...cols.map((f) => (f.type === 'file' ? data.files[r.answers[f.id]]?.name : r.answers[f.id])),
    ]),
  ].map((line) => line.map(cell).join(','));
  // The ﻿ at the start makes Excel read Urdu and other non-English text correctly
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (form.title.replace(/[^\w]+/g, '-').toLowerCase() || 'responses') + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});

// ----- start -----

requireUser().then(async () => {
  await load();
  if (!form) {
    location.href = '/dashboard';
    return;
  }
  renderFilters();
  if (form.capacity) $('capacity').value = form.capacity;
});
