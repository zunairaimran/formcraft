// Opens the SQLite database and creates the tables from schema.sql
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Where the database and uploaded files live. On a hosting service, point DATA_DIR at its
// permanent disk (for example /var/data), otherwise everything is lost when the server restarts.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const dataDir = DATA_DIR;

const db = new DatabaseSync(path.join(dataDir, 'formcraft.db'));
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));

// A database made by an older version of FormCraft misses these columns; add them without losing data
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('forms', 'background', "TEXT NOT NULL DEFAULT ''");
addColumn('forms', 'capacity', 'INTEGER NOT NULL DEFAULT 0');
addColumn('forms', 'visual', "TEXT NOT NULL DEFAULT 'none'");
addColumn('forms', 'max_responses', 'INTEGER NOT NULL DEFAULT 0');
addColumn('forms', 'thank_you', "TEXT NOT NULL DEFAULT ''");
addColumn('fields', 'show_if', "TEXT NOT NULL DEFAULT ''");
addColumn('responses', 'status', "TEXT NOT NULL DEFAULT ''");

// Small helpers so the rest of the code reads like plain SQL
export const one = (sql, ...params) => db.prepare(sql).get(...params);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const run = (sql, ...params) => {
  const r = db.prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
};

// Run several statements together: all succeed or none do
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export default db;
