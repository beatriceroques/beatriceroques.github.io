const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const seed = require('./seed');

let db = null;

function open(userDataDir) {
  if (db) return db;
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, 'cv.db');
  const isNew = !fs.existsSync(dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  if (isNew) seedFromDefaults(db);
  return db;
}

function applySchema(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS cv (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      profile TEXT NOT NULL DEFAULT '',
      photo_path TEXT NOT NULL DEFAULT '',
      show_photo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS contact_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      href TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      level_label TEXT NOT NULL,
      level_pct INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_range TEXT NOT NULL,
      role TEXT NOT NULL,
      org TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS educations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_range TEXT NOT NULL,
      degree TEXT NOT NULL,
      school TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      position INTEGER NOT NULL
    );
  `);
}

function seedFromDefaults(d) {
  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO cv (id, name, title, profile, photo_path, show_photo)
       VALUES (1, @name, @title, @profile, @photo_path, @show_photo)`
    ).run(seed.cv);

    const insertList = (table, cols) => {
      const placeholders = cols.map((c) => `@${c}`).join(', ');
      const stmt = d.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}, position) VALUES (${placeholders}, @position)`
      );
      return (rows) => rows.forEach((row, i) => stmt.run({ ...row, position: i }));
    };

    insertList('contact_lines', ['text', 'href'])(seed.contact_lines);
    insertList('skills', ['text'])(seed.skills);
    insertList('languages', ['name', 'level_label', 'level_pct'])(seed.languages);
    insertList('experiences', ['date_range', 'role', 'org'])(seed.experiences);
    insertList('educations', ['date_range', 'degree', 'school'])(seed.educations);
    insertList('interests', ['text'])(seed.interests);
  });
  tx();
}

function getAll() {
  return {
    cv: db.prepare('SELECT * FROM cv WHERE id = 1').get(),
    contact_lines: db.prepare('SELECT * FROM contact_lines ORDER BY position').all(),
    skills: db.prepare('SELECT * FROM skills ORDER BY position').all(),
    languages: db.prepare('SELECT * FROM languages ORDER BY position').all(),
    experiences: db.prepare('SELECT * FROM experiences ORDER BY position').all(),
    educations: db.prepare('SELECT * FROM educations ORDER BY position').all(),
    interests: db.prepare('SELECT * FROM interests ORDER BY position').all(),
  };
}

function saveAll(payload) {
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE cv SET name = @name, title = @title, profile = @profile,
       photo_path = @photo_path, show_photo = @show_photo WHERE id = 1`
    ).run({
      name: payload.cv.name ?? '',
      title: payload.cv.title ?? '',
      profile: payload.cv.profile ?? '',
      photo_path: payload.cv.photo_path ?? '',
      show_photo: payload.cv.show_photo ? 1 : 0,
    });

    const replaceList = (table, cols, rows) => {
      db.prepare(`DELETE FROM ${table}`).run();
      const placeholders = cols.map((c) => `@${c}`).join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${table} (${cols.join(', ')}, position) VALUES (${placeholders}, @position)`
      );
      rows.forEach((row, i) => stmt.run({ ...row, position: i }));
    };

    replaceList('contact_lines', ['text', 'href'], payload.contact_lines || []);
    replaceList('skills', ['text'], payload.skills || []);
    replaceList(
      'languages',
      ['name', 'level_label', 'level_pct'],
      payload.languages || []
    );
    replaceList(
      'experiences',
      ['date_range', 'role', 'org'],
      payload.experiences || []
    );
    replaceList(
      'educations',
      ['date_range', 'degree', 'school'],
      payload.educations || []
    );
    replaceList('interests', ['text'], payload.interests || []);
  });
  tx();
  return getAll();
}

module.exports = { open, getAll, saveAll };
