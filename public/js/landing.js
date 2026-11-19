// Home page: the live demo form in the hero and the seat allocation demo. Nothing here is saved.

const $ = (id) => document.getElementById(id);

// ----- live demo: theme and moving background -----

const DEMO_THEMES = ['lavender', 'candy', 'mint', 'sky', 'peach', 'galaxy'];
const DEMO_VISUALS = ['bubbles', 'strawberries', 'stars', 'hearts', 'confetti', 'snow', 'none'];
const hero = $('hero');
let demo = { theme: 'lavender', visual: 'bubbles', handle: null };

function renderChips() {
  $('demo-themes').innerHTML = DEMO_THEMES.map((t) =>
    `<button class="chip ${demo.theme === t ? 'active' : ''}" data-theme="${t}" aria-pressed="${demo.theme === t}">${t}</button>`).join('');
  $('demo-visuals').innerHTML = DEMO_VISUALS.map((v) => {
    const info = Visuals.LIST[v];
    const text = v === 'none' ? 'None' : `${info.icon} ${info.label}`;
    return `<button class="chip ${demo.visual === v ? 'active' : ''}" data-visual="${v}" aria-pressed="${demo.visual === v}">${text}</button>`;
  }).join('');
}

function applyDemoLook() {
  hero.className = `hero themed theme-${demo.theme}`;
  // Bubbles take their colour from the theme, so restart the background after a theme change
  if (demo.handle) demo.handle.stop();
  demo.handle = Visuals.mount(hero, demo.visual, 'absolute');
  renderChips();
}

$('demo-themes').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-theme]');
  if (!chip) return;
  demo.theme = chip.dataset.theme;
  applyDemoLook();
});

$('demo-visuals').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-visual]');
  if (!chip) return;
  demo.visual = chip.dataset.visual;
  applyDemoLook();
});

// ----- live demo: the form itself -----

function renderDemoForm() {
  $('demo-body').innerHTML = `
    <form id="demo-form" novalidate>
      <h3>Event registration</h3>
      <p class="form-desc">25 December · Seats are limited</p>
      <div class="q">
        <label class="q-label" for="d-name">Full name <b>*</b></label>
        <input class="input" id="d-name" autocomplete="off" placeholder="Ayesha Khan" required>
      </div>
      <div class="q">
        <label class="q-label" for="d-sem">Semester <b>*</b></label>
        <select class="select" id="d-sem" required>
          <option value="">Choose…</option>
          ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'].map((s) => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div class="q">
        <label class="q-label" for="d-dept">Department <b>*</b></label>
        <select class="select" id="d-dept" required>
          <option value="">Choose…</option>
          <option>Computer Science</option>
          <option>Software Engineering</option>
          <option>Other</option>
        </select>
      </div>
      <div class="q hidden" id="d-other-q">
        <label class="q-label" for="d-other">Which department? <b>*</b></label>
        <input class="input" id="d-other" autocomplete="off" disabled required>
      </div>
      <p class="form-error" id="d-error" role="alert"></p>
      <button class="form-submit" type="submit">Submit</button>
    </form>`;

  const form = $('demo-form');
  // A smart question: shown only when "Other" is picked
  $('d-dept').addEventListener('change', () => {
    const other = $('d-dept').value === 'Other';
    $('d-other-q').classList.toggle('hidden', !other);
    $('d-other').disabled = !other;
  });
  form.addEventListener('input', () => { $('d-error').textContent = ''; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const el of form.querySelectorAll('input:not(:disabled), select')) {
      if (!el.value.trim()) {
        const label = form.querySelector(`label[for="${el.id}"]`).textContent.replace('*', '').trim();
        $('d-error').textContent = `"${label}" is required`;
        el.focus();
        return;
      }
    }
    const name = $('d-name').value.trim();
    $('demo-body').innerHTML = `
      <div class="form-done">
        <div class="tick">&#10003;</div>
        <h3>Thank you, ${esc(name)}!</h3>
        <p class="form-desc">That's how your visitors will feel. This was only a preview, so nothing was saved.</p>
        <div class="demo-actions">
          <a class="form-submit js-cta" href="/signup" style="text-decoration:none">Make my own form</a>
          <button class="btn-back" type="button" id="demo-again">Try again</button>
        </div>
      </div>`;
    updateCtas();
    $('demo-again').addEventListener('click', renderDemoForm);
  });
}

// ----- seat allocation demo -----

const APPLICANTS = [
  { name: 'Ayesha', sem: '5th', cgpa: 3.6, skill: 'Programming' },
  { name: 'Hamza', sem: '7th', cgpa: 3.1, skill: 'Design' },
  { name: 'Sana', sem: '5th', cgpa: 3.9, skill: 'Programming' },
  { name: 'Bilal', sem: '3rd', cgpa: 2.8, skill: 'Programming' },
  { name: 'Zara', sem: '6th', cgpa: 3.4, skill: 'Design' },
  { name: 'Usman', sem: '4th', cgpa: 3.7, skill: 'Programming' },
  { name: 'Mahnoor', sem: '8th', cgpa: 2.9, skill: 'Design' },
  { name: 'Ali', sem: '6th', cgpa: 3.2, skill: 'Programming' },
];
const PILLS = {
  selected: '<span class="pill pill-selected">Selected</span>',
  waiting: '<span class="pill pill-waiting">Waiting list</span>',
  not: '<span class="pill pill-not">Not eligible</span>',
};

function renderAllocation() {
  const capacity = Number($('alloc-cap').value);
  const skill = $('alloc-skill').value;
  const minCgpa = Number($('alloc-cgpa').value) || 0;
  $('alloc-cap-out').textContent = capacity;

  // Same rule as the real app: eligible ones in submission order, first come first served
  let seat = 0;
  const statuses = APPLICANTS.map((a) => {
    const eligible = (!skill || a.skill === skill) && a.cgpa >= minCgpa;
    if (!eligible) return 'not';
    seat++;
    return seat <= capacity ? 'selected' : 'waiting';
  });

  $('alloc-rows').innerHTML = APPLICANTS.map((a, i) => `
    <tr><td>${i + 1}</td><td>${a.name}</td><td>${a.sem}</td><td>${a.cgpa.toFixed(1)}</td><td>${a.skill}</td><td>${PILLS[statuses[i]]}</td></tr>`).join('');

  const count = (s) => statuses.filter((x) => x === s).length;
  $('alloc-summary').innerHTML = `
    <span class="pill pill-selected">${count('selected')} selected</span>
    <span class="pill pill-waiting">${count('waiting')} waiting</span>
    <span class="pill pill-not">${count('not')} not eligible</span>`;

  const where = ['form_id = 1'];
  if (minCgpa) where.push(`cgpa >= ${minCgpa}`);
  if (skill) where.push(`skill = '${skill}'`);
  $('alloc-sql').textContent = `-- simplified: the real query reads these answers from the answers table\nSELECT * FROM responses\n WHERE ${where.join('\n   AND ')}\n ORDER BY submitted_at\n LIMIT ${capacity};`;
}

for (const id of ['alloc-cap', 'alloc-skill', 'alloc-cgpa']) $(id).addEventListener('input', renderAllocation);

// ----- buttons for visitors who are already logged in -----

let loggedIn = false;
function updateCtas() {
  if (!loggedIn) return;
  document.querySelectorAll('.js-cta').forEach((link) => {
    link.href = '/dashboard';
    if (link.classList.contains('btn')) link.textContent = 'Go to dashboard';
  });
}

api('GET', '/api/me').then(() => {
  loggedIn = true;
  $('nav-login').classList.add('hidden');
  updateCtas();
}).catch(() => {});

// ----- start -----

applyDemoLook();
renderDemoForm();
renderAllocation();
