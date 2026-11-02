// Local SQLite database. sql.js runs real SQLite inside the app; the file is kept in
// the phone's private app storage (IndexedDB), so data stays on the device.
const DB = (() => {
  let db;
  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS students (usn TEXT PRIMARY KEY, name TEXT NOT NULL, branch TEXT, section TEXT, current_sem INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS subjects (code TEXT PRIMARY KEY, name TEXT NOT NULL, semester INTEGER NOT NULL, credits INTEGER DEFAULT 3);
    CREATE TABLE IF NOT EXISTS attendance (usn TEXT, code TEXT, held INTEGER, attended INTEGER, PRIMARY KEY (usn, code));
    CREATE TABLE IF NOT EXISTS internals (usn TEXT, code TEXT, marks REAL, PRIMARY KEY (usn, code));
    CREATE TABLE IF NOT EXISTS exams (usn TEXT, code TEXT, marks REAL, PRIMARY KEY (usn, code));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, usn TEXT, item TEXT, old_value TEXT, new_value TEXT, reason TEXT);`;

  const idb = () => new Promise((ok, no) => {
    const r = indexedDB.open('edutrack', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  async function readFile() {
    const h = await idb();
    return new Promise((ok, no) => {
      const q = h.transaction('files').objectStore('files').get('main');
      q.onsuccess = () => { h.close(); ok(q.result); };
      q.onerror = () => { h.close(); no(q.error); };
    });
  }
  async function save() {
    const bytes = db.export();
    const h = await idb();
    return new Promise((ok, no) => {
      const t = h.transaction('files', 'readwrite');
      t.objectStore('files').put(bytes, 'main');
      t.oncomplete = () => { h.close(); ok(); };
      t.onerror = () => { h.close(); no(t.error); };
    });
  }
  function all(sql, params = []) {
    const st = db.prepare(sql);
    st.bind(params);
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  }
  const run = (sql, params = []) => db.run(sql, params);
  const getSetting = (k, d = null) => { const r = all('SELECT value FROM settings WHERE key=?', [k]); return r.length ? r[0].value : d; };
  const setSetting = (k, v) => run('INSERT OR REPLACE INTO settings VALUES (?,?)', [k, String(v)]);

  function tx(fn) {
    run('BEGIN');
    try { fn(); run('COMMIT'); } catch (e) { run('ROLLBACK'); throw e; }
  }
  async function hash(text) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('edutrack:' + text));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function loadDemo() {
    const s = await (await fetch('data/demo_seed.json')).json();
    tx(() => {
      for (const x of s.students) run('INSERT INTO students VALUES (?,?,?,?,?)', [x.usn, x.name, x.branch, x.section, x.current_sem]);
      for (const x of s.subjects) run('INSERT INTO subjects VALUES (?,?,?,?)', [x.code, x.name, x.semester, x.credits]);
      for (const x of s.attendance) run('INSERT INTO attendance VALUES (?,?,?,?)', [x.usn, x.code, x.held, x.attended]);
      for (const x of s.internals) run('INSERT INTO internals VALUES (?,?,?)', [x.usn, x.code, x.marks]);
      for (const x of s.exams) run('INSERT INTO exams VALUES (?,?,?)', [x.usn, x.code, x.marks]);
      setSetting('demo_data', 1);
    });
  }
  function clearRecords() {
    tx(() => { for (const t of ['students', 'subjects', 'attendance', 'internals', 'exams']) run(`DELETE FROM ${t}`); setSetting('demo_data', 0); });
  }
  async function init() {
    const SQL = await initSqlJs({ locateFile: f => 'vendor/' + f });
    const bytes = await readFile();
    db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.run(SCHEMA);
    if (!bytes) {
      setSetting('min_attendance', 85);
      setSetting('min_internal', 40);
      setSetting('min_overall', 50);
      setSetting('pin_hash', await hash('1234'));
      await loadDemo();
      await save();
    }
  }
  return { init, all, run, tx, save, getSetting, setSetting, hash, loadDemo, clearRecords };
})();
