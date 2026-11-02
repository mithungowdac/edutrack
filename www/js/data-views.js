// Screens that change data: import, manual entry, corrections, audit log.
const DataViews = (() => {
  const { esc, $, $$, ask, unlock, audit, toast, parseCSV, toCSV, saveFile, textToBase64 } = UI;
  const view = () => $('#view');
  const COLUMNS = ['usn', 'name', 'branch', 'section', 'current_sem', 'subject_code', 'subject_name', 'semester', 'credits', 'classes_held', 'classes_attended', 'internal_marks', 'exam_marks'];
  let preview = null;

  const changed = async () => { await DB.save(); A.invalidate(); };

  function reviewQueue() {
    const out = [];
    for (const s of A.students()) for (const r of s.records) {
      if (r.semester > s.current_sem) continue;
      if (r.held == null) out.push([s, `${r.name}: attendance missing`]);
      if (r.cie == null) out.push([s, `${r.name}: internal marks missing`]);
      if (r.see == null && r.semester < s.current_sem) out.push([s, `${r.name}: exam marks missing`]);
      if (r.cie_pct != null && r.see_pct != null && Math.abs(r.cie_pct - r.see_pct) >= 60) out.push([s, `${r.name}: internal ${r.cie}/50 and exam ${r.see}/50 are far apart`]);
    }
    return out;
  }

  function data() {
    const demo = DB.getSetting('demo_data') === '1', queue = reviewQueue();
    view().innerHTML = `<p class="notice">Records are stored only on this device. Use real student data only with your institution's permission.</p>
      <section class="card"><h2>Import from CSV</h2><p class="small muted">One row per student per subject. Internal and exam marks are out of 50.</p>
        <div class="form" style="margin-top:8px"><input id="file" type="file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel" aria-label="Choose a CSV file">
        <button class="btn" id="template">Get blank CSV template</button></div><div id="preview"></div></section>
      <section class="card"><h2>Enter manually</h2><p class="small muted">Add a student, then add their subject records.</p>
        <div class="btns" style="margin-top:8px"><button class="btn primary" id="add">Add student</button></div></section>
      <section class="card"><h2>Records to review</h2>
        <p class="small muted">${queue.length ? `${queue.length} possible problems found` : 'No missing or unusual records found.'}</p>
        <ul class="list">${queue.slice(0, 8).map(([s, why]) => `<li><a class="item" href="#/edit/${encodeURIComponent(s.usn)}"><div class="who"><b>${esc(s.name)}</b><small>${esc(why)}</small></div></a></li>`).join('')}</ul></section>
      <section class="card"><h2>Manage</h2><div class="btns" style="margin-top:8px">
        <button class="btn" id="export">Export all as CSV</button><a class="btn" href="#/audit">Correction history</a>
        <button class="btn" id="pin">Change PIN</button>
        ${demo ? '<button class="btn danger" id="clear">Remove demo data</button>' : '<button class="btn" id="demo">Load demo data</button>'}</div></section>`;
    $('#file').onchange = onFile;
    $('#template').onclick = () => saveFile('edutrack_template.csv', 'text/csv', textToBase64(toCSV([COLUMNS, ['1MV23CS001', 'Student Name', 'CSE', 'A', 5, 'S501', 'Software Engineering', 5, 4, 45, 40, 32, '']])));
    $('#add').onclick = addStudent;
    $('#export').onclick = exportAll;
    $('#pin').onclick = changePin;
    if (demo) $('#clear').onclick = removeDemo; else $('#demo').onclick = loadDemo;
  }

  const intIn = (v, lo, hi) => Number.isInteger(+v) && v !== '' && +v >= lo && +v <= hi;

  function checkRows(text) {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
    if (!rows.length) return { fatal: 'The file is empty.' };
    const head = rows[0].map(h => h.trim().toLowerCase());
    const missing = COLUMNS.filter(c => !head.includes(c));
    if (missing.length) return { fatal: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template.` };
    const good = [], errors = [];
    rows.slice(1).forEach((cells, n) => {
      const r = {};
      head.forEach((h, i) => { r[h] = (cells[i] || '').trim(); });
      const line = n + 2, bad = [];
      r.usn = r.usn.toUpperCase();
      if (!/^[A-Z0-9-]{3,20}$/.test(r.usn)) bad.push('USN is not valid');
      if (!r.name) bad.push('name is empty');
      if (!r.subject_code) bad.push('subject code is empty');
      if (!r.subject_name) bad.push('subject name is empty');
      if (!intIn(r.current_sem, 1, 8)) bad.push('current_sem must be 1 to 8');
      if (!intIn(r.semester, 1, 8)) bad.push('semester must be 1 to 8');
      if (r.credits && !intIn(r.credits, 0, 10)) bad.push('credits must be 0 to 10');
      if (r.classes_held !== '' || r.classes_attended !== '') {
        if (!intIn(r.classes_held, 1, 500) || !intIn(r.classes_attended, 0, 500)) bad.push('classes must be whole numbers');
        else if (+r.classes_attended > +r.classes_held) bad.push('attended is more than held');
      }
      for (const [k, label] of [['internal_marks', 'internal'], ['exam_marks', 'exam']])
        if (r[k] !== '' && !(Number.isFinite(+r[k]) && +r[k] >= 0 && +r[k] <= 50)) bad.push(`${label} marks must be 0 to 50`);
      if (bad.length) errors.push(`Line ${line}: ${bad.join('; ')}`); else good.push(r);
    });
    return { good, errors };
  }

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    preview = checkRows(await file.text());
    const box = $('#preview');
    if (preview.fatal) { box.innerHTML = `<p class="error">${esc(preview.fatal)}</p>`; return; }
    const demo = DB.getSetting('demo_data') === '1';
    const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    box.innerHTML = `<div class="form" style="margin-top:10px"><p class="notice"><b>${count(preview.good.length, 'row')} ready</b> for ${count(new Set(preview.good.map(r => r.usn)).size, 'student')}.
        ${preview.errors.length ? `${count(preview.errors.length, 'row')} with problems will be skipped.` : ''} Existing records with the same USN and subject will be replaced.</p>
      ${preview.errors.length ? `<details><summary>View problems</summary><ul class="actions small">${preview.errors.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      ${demo ? '<p class="small muted">The fictional demo students will be removed first.</p>' : ''}
      <button class="btn primary" id="do-import" ${preview.good.length ? '' : 'disabled'}>Import ${count(preview.good.length, 'row')}</button></div>`;
    $('#do-import').onclick = doImport;
  }

  async function doImport() {
    if (!await unlock()) return;
    if (DB.getSetting('demo_data') === '1') DB.clearRecords();
    DB.tx(() => {
      for (const r of preview.good) {
        DB.run('INSERT OR REPLACE INTO students VALUES (?,?,?,?,?)', [r.usn, r.name, r.branch, r.section, +r.current_sem]);
        DB.run('INSERT OR REPLACE INTO subjects VALUES (?,?,?,?)', [r.subject_code, r.subject_name, +r.semester, r.credits === '' ? 3 : +r.credits]);
        if (r.classes_held !== '') DB.run('INSERT OR REPLACE INTO attendance VALUES (?,?,?,?)', [r.usn, r.subject_code, +r.classes_held, +r.classes_attended]);
        if (r.internal_marks !== '') DB.run('INSERT OR REPLACE INTO internals VALUES (?,?,?)', [r.usn, r.subject_code, +r.internal_marks]);
        if (r.exam_marks !== '') DB.run('INSERT OR REPLACE INTO exams VALUES (?,?,?)', [r.usn, r.subject_code, +r.exam_marks]);
      }
      audit('', 'CSV import', '', `${preview.good.length} rows`, `${preview.errors.length} rows skipped`);
    });
    await changed();
    toast(`Imported ${preview.good.length} rows`);
    preview = null;
    location.hash = '#/students';
  }

  async function addStudent() {
    if (!await unlock()) return;
    const v = await ask({
      title: 'Add student', ok: 'Add',
      html: `<label>USN<input name="usn" required placeholder="1MV23CS001" autocomplete="off"></label><label>Full name<input name="name" required autocomplete="off"></label>
        <div class="grid2"><label>Branch<input name="branch" value="CSE"></label><label>Section<input name="section" value="A"></label></div>
        <label>Current semester<input name="sem" type="number" min="1" max="8" required value="5"></label>`,
      check: x => {
        const usn = x.usn.trim().toUpperCase();
        if (!/^[A-Z0-9-]{3,20}$/.test(usn)) return 'Enter a valid USN.';
        if (DB.all('SELECT 1 FROM students WHERE usn=?', [usn]).length) return 'That USN already exists.';
        return intIn(x.sem, 1, 8) ? null : 'Semester must be 1 to 8.';
      },
    });
    if (!v) return;
    const usn = v.usn.trim().toUpperCase();
    DB.run('INSERT INTO students VALUES (?,?,?,?,?)', [usn, v.name.trim(), v.branch.trim(), v.section.trim(), +v.sem]);
    audit(usn, 'Student added', '', v.name.trim(), '');
    await changed();
    location.hash = `#/edit/${encodeURIComponent(usn)}`;
  }

  function exportAll() {
    const rows = [COLUMNS];
    for (const s of A.students()) for (const r of s.records)
      rows.push([s.usn, s.name, s.branch, s.section, s.current_sem, r.code, r.name, r.semester, r.credits, r.held ?? '', r.attended ?? '', r.cie ?? '', r.see ?? '']);
    saveFile('edutrack_export.csv', 'text/csv', textToBase64(toCSV(rows)));
  }

  async function changePin() {
    if (!await unlock()) return;
    const v = await ask({
      title: 'Change PIN', ok: 'Save',
      html: `<label>Current PIN<input name="old" type="password" inputmode="numeric" required></label>
        <label>New PIN (at least 4 digits)<input name="next" type="password" inputmode="numeric" required></label>`,
      check: async x => (await DB.hash(x.old)) !== DB.getSetting('pin_hash') ? 'Current PIN is not correct.' : /^\d{4,}$/.test(x.next) ? null : 'Use at least 4 digits.',
    });
    if (!v) return;
    DB.setSetting('pin_hash', await DB.hash(v.next));
    audit('', 'PIN changed', '', '', '');
    await changed();
    toast('PIN changed');
  }

  async function removeDemo() {
    if (!await unlock()) return;
    if (!await ask({ title: 'Remove demo data?', html: '<p class="small">All fictional students and their records will be removed. You can load them again later.</p>', ok: 'Remove', danger: true })) return;
    DB.clearRecords();
    audit('', 'Demo data removed', '', '', '');
    await changed();
    App.render();
  }
  async function loadDemo() {
    if (!await unlock()) return;
    if (DB.all('SELECT 1 FROM students LIMIT 1').length &&
      !await ask({ title: 'Replace current records?', html: '<p class="small">Loading demo data removes every student now in the app. Export them first if you need them.</p>', ok: 'Replace', danger: true })) return;
    DB.clearRecords();
    await DB.loadDemo();
    audit('', 'Demo data loaded', '', '', '');
    await changed();
    App.render();
  }

  let editSem = {};
  function edit(usn) {
    const s = A.student(usn);
    if (!s) { view().innerHTML = '<p class="card">Student not found.</p>'; return; }
    const sems = s.semesters.map(m => m.sem);
    if (!sems.includes(editSem[usn])) editSem[usn] = sems.includes(s.current_sem) ? s.current_sem : sems[sems.length - 1];
    const rows = s.records.filter(r => r.semester === editSem[usn]);
    view().innerHTML = `<section class="card"><div class="row"><div><h2>${esc(s.name)}</h2><p class="small muted">${esc(s.usn)}</p></div><button class="btn" id="profile">Edit profile</button></div></section>
      <section class="card"><div class="row"><h2>Marks and attendance</h2>
          <select id="sem" aria-label="Semester" style="width:auto">${sems.map(n => `<option value="${n}">Semester ${n}</option>`).join('') || '<option>None</option>'}</select></div>
        <form id="f" class="form" novalidate>
        ${rows.map(r => `<div class="subject"><h3>${esc(r.name)}</h3><div class="grid4">
          <label>Held<input inputmode="numeric" name="${esc(r.code)}|held" value="${r.held ?? ''}"></label>
          <label>Attended<input inputmode="numeric" name="${esc(r.code)}|attended" value="${r.attended ?? ''}"></label>
          <label>Int /50<input inputmode="decimal" name="${esc(r.code)}|cie" value="${r.cie ?? ''}"></label>
          <label>Exam /50<input inputmode="decimal" name="${esc(r.code)}|see" value="${r.see ?? ''}"></label></div></div>`).join('') || '<p class="muted">No subject records yet.</p>'}
        ${rows.length ? `<label>Reason for the correction<input name="reason" placeholder="For example: typing error in marks sheet" autocomplete="off"></label>
          <p class="error" id="err" hidden></p><button class="btn primary">Save corrections</button>` : ''}
        </form></section>
      <div class="btns"><button class="btn" id="add-sub">Add subject record</button><button class="btn danger" id="del">Delete student</button></div>`;
    const sel = $('#sem');
    if (sems.length) sel.value = editSem[usn];
    sel.onchange = () => { editSem[usn] = +sel.value; App.render(); };
    $('#f').onsubmit = e => { e.preventDefault(); saveCorrections(s, rows, new FormData(e.target)); };
    $('#profile').onclick = () => editProfile(s);
    $('#add-sub').onclick = () => addSubject(s);
    $('#del').onclick = () => deleteStudent(s);
  }

  async function saveCorrections(s, rows, form) {
    const err = $('#err'), fail = m => { err.textContent = m; err.hidden = false; };
    const changes = [];
    for (const r of rows) {
      const read = k => { const v = String(form.get(`${r.code}|${k}`)).trim(); return v === '' ? null : Number(v); };
      const held = read('held'), attended = read('attended'), cie = read('cie'), see = read('see');
      for (const [v, label] of [[cie, 'Internal'], [see, 'Exam']])
        if (v != null && !(Number.isFinite(v) && v >= 0 && v <= 50)) return fail(`${r.name}: ${label} marks must be 0 to 50.`);
      if ((held == null) !== (attended == null)) return fail(`${r.name}: fill in both classes held and attended.`);
      if (held != null && !(Number.isInteger(held) && Number.isInteger(attended) && held > 0 && attended >= 0 && attended <= held)) return fail(`${r.name}: attended must be a whole number, no more than held.`);
      if (held !== r.held || attended !== r.attended) changes.push(['attendance', r, `${r.attended ?? ''}/${r.held ?? ''}`, `${attended ?? ''}/${held ?? ''}`, held, attended]);
      if (cie !== r.cie) changes.push(['internals', r, r.cie, cie]);
      if (see !== r.see) changes.push(['exams', r, r.see, see]);
    }
    if (!changes.length) return toast('Nothing has changed');
    const reason = String(form.get('reason')).trim();
    if (!reason) return fail('Please give a reason for the correction.');
    if (!await unlock()) return;
    DB.tx(() => {
      for (const [table, r, oldV, newV, held, attended] of changes) {
        if (table === 'attendance') {
          if (held == null) DB.run('DELETE FROM attendance WHERE usn=? AND code=?', [s.usn, r.code]);
          else DB.run('INSERT OR REPLACE INTO attendance VALUES (?,?,?,?)', [s.usn, r.code, held, attended]);
        } else if (newV == null) DB.run(`DELETE FROM ${table} WHERE usn=? AND code=?`, [s.usn, r.code]);
        else DB.run(`INSERT OR REPLACE INTO ${table} VALUES (?,?,?)`, [s.usn, r.code, newV]);
        audit(s.usn, `${r.name}: ${{ attendance: 'attendance', internals: 'internal', exams: 'exam' }[table]}`, oldV, newV, reason);
      }
    });
    await changed();
    toast(`${changes.length} change${changes.length > 1 ? 's' : ''} saved`);
    App.render();
  }

  async function editProfile(s) {
    if (!await unlock()) return;
    const v = await ask({
      title: 'Edit profile', ok: 'Save',
      html: `<label>Full name<input name="name" required value="${esc(s.name)}"></label>
        <div class="grid2"><label>Branch<input name="branch" value="${esc(s.branch)}"></label><label>Section<input name="section" value="${esc(s.section)}"></label></div>
        <label>Current semester<input name="sem" type="number" min="1" max="8" required value="${esc(s.current_sem)}"></label>`,
      check: x => intIn(x.sem, 1, 8) ? null : 'Semester must be 1 to 8.',
    });
    if (!v) return;
    DB.run('UPDATE students SET name=?, branch=?, section=?, current_sem=? WHERE usn=?', [v.name.trim(), v.branch.trim(), v.section.trim(), +v.sem, s.usn]);
    audit(s.usn, 'Profile', `${s.name}, ${s.branch} ${s.section}, sem ${s.current_sem}`, `${v.name.trim()}, ${v.branch.trim()} ${v.section.trim()}, sem ${v.sem}`, '');
    await changed();
    App.render();
  }

  async function addSubject(s) {
    if (!await unlock()) return;
    const known = DB.all('SELECT * FROM subjects ORDER BY code');
    const v = await ask({
      title: 'Add subject record', ok: 'Add',
      html: `<label>Subject code<input name="code" list="codes" required autocomplete="off"><datalist id="codes">${known.map(k => `<option value="${esc(k.code)}">${esc(k.name)}</option>`).join('')}</datalist></label>
        <label>Subject name (for a new code)<input name="name" autocomplete="off"></label>
        <label>Semester<input name="sem" type="number" min="1" max="8" value="${esc(s.current_sem)}"></label>
        <div class="grid2"><label>Classes held<input name="held" inputmode="numeric"></label><label>Classes attended<input name="attended" inputmode="numeric"></label>
        <label>Internal /50<input name="cie" inputmode="decimal"></label><label>Exam /50<input name="see" inputmode="decimal"></label></div>`,
      check: x => {
        const code = x.code.trim(), exists = known.some(k => k.code === code);
        if (!code) return 'Enter a subject code.';
        if (!exists && !x.name.trim()) return 'Enter a name for this new subject.';
        if (!exists && !intIn(x.sem, 1, 8)) return 'Semester must be 1 to 8.';
        if (!x.held && !x.cie && !x.see) return 'Enter at least attendance or marks.';
        if (!x.held !== !x.attended) return 'Fill in both classes held and attended.';
        if (x.held && !(intIn(x.held, 1, 500) && intIn(x.attended, 0, +x.held))) return 'Attended must be a whole number, no more than held.';
        for (const m of [x.cie, x.see]) if (m !== '' && !(Number.isFinite(+m) && +m >= 0 && +m <= 50)) return 'Marks must be 0 to 50.';
        return null;
      },
    });
    if (!v) return;
    const code = v.code.trim();
    DB.tx(() => {
      DB.run('INSERT OR IGNORE INTO subjects VALUES (?,?,?,3)', [code, v.name.trim(), +v.sem]);
      if (v.held) DB.run('INSERT OR REPLACE INTO attendance VALUES (?,?,?,?)', [s.usn, code, +v.held, +v.attended]);
      if (v.cie !== '') DB.run('INSERT OR REPLACE INTO internals VALUES (?,?,?)', [s.usn, code, +v.cie]);
      if (v.see !== '') DB.run('INSERT OR REPLACE INTO exams VALUES (?,?,?)', [s.usn, code, +v.see]);
      audit(s.usn, `Subject record added: ${code}`, '', `att ${v.attended}/${v.held}, int ${v.cie}, exam ${v.see}`, '');
    });
    await changed();
    App.render();
  }

  async function deleteStudent(s) {
    if (!await unlock()) return;
    if (!await ask({ title: `Delete ${s.name}?`, html: '<p class="small">This permanently removes the student and all their records from this device.</p>', ok: 'Delete', danger: true })) return;
    DB.tx(() => {
      DB.run('DELETE FROM students WHERE usn=?', [s.usn]);
      for (const t of ['attendance', 'internals', 'exams']) DB.run(`DELETE FROM ${t} WHERE usn=?`, [s.usn]);
      audit(s.usn, 'Student deleted', s.name, '', '');
    });
    await changed();
    location.hash = '#/students';
  }

  function auditView() {
    const rows = DB.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200');
    view().innerHTML = `<section class="card"><h2>Correction history</h2><p class="small muted">Every change made in the app, newest first.</p>
      <ul class="list">${rows.map(r => `<li style="padding:10px 0"><b>${esc(r.item)}</b>${r.usn ? ` <span class="muted small">${esc(r.usn)}</span>` : ''}
        ${r.old_value || r.new_value ? `<div class="small">${esc(r.old_value || '(empty)')} → ${esc(r.new_value || '(empty)')}</div>` : ''}
        ${r.reason ? `<div class="small">Reason: ${esc(r.reason)}</div>` : ''}
        <div class="small muted">${esc(r.actor)} · ${esc(new Date(r.ts).toLocaleString('en-IN'))}</div></li>`).join('') || '<li class="muted pad">No changes yet.</li>'}</ul></section>`;
  }
  return { data, edit, auditView, checkRows };
})();
