// Small shared helpers: safe text, status pills, dialogs, the edit PIN, saving files.
const UI = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v, d = 0) => v == null ? '–' : `${v.toFixed(d)}%`;
  const num = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace(/\.0$/, '');
  const ICONS = { 'At Risk': '▲', Average: '●', Good: '✓' };
  const pill = cat => cat ? `<span class="pill ${cat.replace(' ', '')}"><i aria-hidden="true">${ICONS[cat]}</i>${esc(cat)}</span>` : '<span class="pill">No estimate</span>';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // Shows a dialog. Resolves to the form's values, or null if cancelled.
  // `check` may return an error message to keep the dialog open.
  function ask({ title, html = '', ok = 'OK', danger = false, check }) {
    const d = $('#modal');
    d.innerHTML = `<form class="form"><h2>${esc(title)}</h2>${html}<p class="error" id="m-err" hidden></p>
      <div class="btns"><button type="button" class="btn" id="m-cancel">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div></form>`;
    return new Promise(done => {
      const finish = v => { d.close(); done(v); };
      $('#m-cancel', d).onclick = () => finish(null);
      d.oncancel = e => { e.preventDefault(); finish(null); };
      $('form', d).onsubmit = async e => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.target));
        const err = check ? await check(values) : null;
        if (err) { const p = $('#m-err', d); p.textContent = err; p.hidden = false; return; }
        finish(values);
      };
      d.showModal();
    });
  }

  // Editing needs a reviewer name and PIN. The name is recorded in the audit log.
  let reviewer = null;
  async function unlock() {
    if (reviewer) return reviewer;
    const v = await ask({
      title: 'Faculty or admin access', ok: 'Unlock',
      html: `<p class="small muted">Corrections are recorded under this name.</p>
        <label>Your name<input name="name" required autocomplete="off"></label>
        <label>PIN<input name="pin" type="password" inputmode="numeric" required autocomplete="off"></label>`,
      check: async x => (await DB.hash(x.pin)) === DB.getSetting('pin_hash') ? null : 'That PIN is not correct.',
    });
    if (v) reviewer = v.name.trim();
    return reviewer;
  }

  function audit(usn, item, oldValue, newValue, reason) {
    DB.run('INSERT INTO audit_log (ts, actor, usn, item, old_value, new_value, reason) VALUES (?,?,?,?,?,?,?)',
      [new Date().toISOString(), reviewer || 'unknown', usn, item, oldValue == null ? '' : String(oldValue), newValue == null ? '' : String(newValue), reason || '']);
  }

  // On a phone, hands the file to the Android share sheet. In a browser, downloads it.
  async function saveFile(name, mime, base64) {
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform()) {
      const fs = C.Plugins.Filesystem || C.registerPlugin('Filesystem');
      const share = C.Plugins.Share || C.registerPlugin('Share');
      const r = await fs.writeFile({ path: name, data: base64, directory: 'CACHE' });
      try { await share.share({ title: name, files: [r.uri] }); } catch (e) { /* the user closed the share sheet */ }
      return;
    }
    const a = document.createElement('a');
    a.href = `data:${mime};base64,${base64}`;
    a.download = name;
    a.click();
    toast(`Saved ${name}`);
  }
  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+@-]/.test(s) && isNaN(Number(s))) s = "'" + s;  // stops spreadsheets running a cell as a formula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  return { esc, pct, num, pill, $, $$, toast, ask, unlock, audit, saveFile, textToBase64, toCSV, parseCSV };
})();
