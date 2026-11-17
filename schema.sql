-- FormCraft database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per logged-in browser
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  slug        TEXT NOT NULL UNIQUE,          -- used in the public link /f/<slug>
  theme       TEXT NOT NULL DEFAULT 'lavender',
  visual      TEXT NOT NULL DEFAULT 'none',  -- moving background: bubbles, stars, strawberries...
  background  TEXT NOT NULL DEFAULT '',      -- token of an uploaded background image, or ''
  is_open     INTEGER NOT NULL DEFAULT 1,    -- 1 = accepting responses
  max_responses INTEGER NOT NULL DEFAULT 0,  -- stop accepting after this many responses; 0 = no limit
  thank_you   TEXT NOT NULL DEFAULT '',      -- message shown after submitting; '' = default text
  capacity    INTEGER NOT NULL DEFAULT 0,    -- seats used by the last seat allocation
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The questions of a form
CREATE TABLE IF NOT EXISTS fields (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id  INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  type     TEXT NOT NULL,                    -- text, textarea, email, number, date, select, radio, checkbox, file, page
  required INTEGER NOT NULL DEFAULT 0,
  options  TEXT NOT NULL DEFAULT '[]',       -- JSON array, used by select / radio / checkbox
  show_if  TEXT NOT NULL DEFAULT '',         -- JSON {"field": <field id>, "value": "<option>"}, or '' = always shown
  position INTEGER NOT NULL DEFAULT 0
);

-- One row each time somebody submits a form
CREATE TABLE IF NOT EXISTS responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id      INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT '',     -- '', 'selected', 'waiting' or 'not_eligible'
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per answered question inside a response
CREATE TABLE IF NOT EXISTS answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  field_id    INTEGER NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  value       TEXT NOT NULL
);

-- Files on disk: form background images and files attached to answers
CREATE TABLE IF NOT EXISTS uploads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT NOT NULL UNIQUE,
  form_id       INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  response_id   INTEGER REFERENCES responses(id) ON DELETE CASCADE,  -- set once the answer is submitted
  kind          TEXT NOT NULL,               -- 'background' or 'answer'
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  stored_name   TEXT NOT NULL,               -- file name inside data/uploads
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forms_user       ON forms(user_id);
CREATE INDEX IF NOT EXISTS idx_fields_form      ON fields(form_id);
CREATE INDEX IF NOT EXISTS idx_responses_form   ON responses(form_id);
CREATE INDEX IF NOT EXISTS idx_answers_resp     ON answers(response_id);
CREATE INDEX IF NOT EXISTS idx_uploads_form     ON uploads(form_id);
CREATE INDEX IF NOT EXISTS idx_uploads_response ON uploads(response_id);
