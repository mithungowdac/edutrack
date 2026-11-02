// Turns raw records into averages, the model's inputs, predictions, flags and suggested actions.
const A = (() => {
  let model, cache = null;
  const invalidate = () => { cache = null; };
  const mean = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const LABELS = { attendance_pct: 'Attendance', internal_pct: 'Internal marks', previous_pct: 'Previous semesters', backlogs: 'Backlogs' };

  async function loadModel() { model = await (await fetch('data/model.json')).json(); return model; }
  const getModel = () => model;
  const thresholds = () => ({
    attendance: +DB.getSetting('min_attendance', 85),
    internal: +DB.getSetting('min_internal', 40),
    overall: +DB.getSetting('min_overall', 50),
  });

  // Same calculation as scikit-learn's LogisticRegression.predict_proba
  function predictRaw(values) {
    const z = values.map((v, j) => (v - model.mean[j]) / model.scale[j]);
    const scores = model.coef.map((row, k) => row.reduce((s, c, j) => s + c * z[j], model.intercept[k]));
    const top = Math.max(...scores);
    const exps = scores.map(s => Math.exp(s - top));
    const total = exps.reduce((a, b) => a + b, 0);
    return { z, probabilities: exps.map(e => e / total) };
  }

  function predict(features) {
    const imputed = features.previous_pct == null;
    const values = model.features.map((f, j) => features[f] == null ? model.mean[j] : features[f]);
    const { z, probabilities } = predictRaw(values);
    const k = probabilities.indexOf(Math.max(...probabilities));
    const factors = model.features.map((f, j) => ({
      feature: f, label: LABELS[f], value: values[j], typical: model.mean[j],
      contribution: model.coef[k][j] * z[j], imputed: f === 'previous_pct' && imputed,
    })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return { category: model.classes[k], confidence: probabilities[k], classes: model.classes, probabilities, factors, imputed };
  }

  function records() {
    return DB.all(`SELECT st.usn, su.code, su.name, su.semester, su.credits, a.held, a.attended, i.marks AS cie, e.marks AS see
      FROM students st CROSS JOIN subjects su
      LEFT JOIN attendance a ON a.usn=st.usn AND a.code=su.code
      LEFT JOIN internals i ON i.usn=st.usn AND i.code=su.code
      LEFT JOIN exams e ON e.usn=st.usn AND e.code=su.code
      WHERE a.usn IS NOT NULL OR i.usn IS NOT NULL OR e.usn IS NOT NULL
      ORDER BY su.semester, su.code`).map(r => ({
        ...r,
        att_pct: r.held ? 100 * r.attended / r.held : null,
        cie_pct: r.cie == null ? null : r.cie * 2,
        see_pct: r.see == null ? null : r.see * 2,
        total: r.cie == null || r.see == null ? null : r.cie + r.see,
        failed: r.cie != null && r.see != null && (r.cie < 20 || r.see < 18 || r.cie + r.see < 40),
      }));
  }

  function actionsFor(s, t) {
    const out = [], now = s.records.filter(r => r.semester === s.current_sem);
    const held = now.reduce((a, r) => a + (r.held || 0), 0), attended = now.reduce((a, r) => a + (r.attended || 0), 0);
    if (s.attendance_pct != null && s.attendance_pct < t.attendance && t.attendance < 100) {
      const need = Math.ceil((t.attendance / 100 * held - attended) / (1 - t.attendance / 100));
      out.push(`Attendance follow-up: meet the student and check for barriers. About ${need} consecutive classes are needed to reach ${t.attendance}%.`);
    }
    let weak = now.filter(r => r.cie_pct != null && r.cie_pct < t.internal);
    if (!weak.length && s.prediction && s.prediction.category === 'At Risk')
      weak = now.filter(r => r.cie_pct != null).sort((a, b) => a.cie_pct - b.cie_pct).slice(0, 2);
    if (weak.length) out.push(`Revision plan: schedule weekly support for ${weak.map(r => r.name).join(', ')} before the next assessment.`);
    if (s.backlogs > 0) out.push(`Backlog plan: help the student prepare for ${s.backlogs} uncleared subject${s.backlogs > 1 ? 's' : ''}.`);
    if (s.prediction && s.prediction.category === 'At Risk') out.push('Mentor check-in: talk with the student before acting on this estimate; marks may not show the full picture.');
    return out;
  }

  function summarize(st, recs, t) {
    const now = recs.filter(r => r.semester === st.current_sem);
    const past = recs.filter(r => r.semester < st.current_sem && r.total != null);
    const heldNow = now.reduce((a, r) => a + (r.held || 0), 0);
    const f = {
      attendance_pct: heldNow ? 100 * now.reduce((a, r) => a + (r.attended || 0), 0) / heldNow : null,
      internal_pct: mean(now.map(r => r.cie_pct)),
      previous_pct: mean(past.map(r => r.total)),
      backlogs: past.filter(r => r.failed).length,
    };
    const sems = [...new Set(recs.map(r => r.semester))].sort((a, b) => a - b).map(sem => {
      const rs = recs.filter(r => r.semester === sem), h = rs.reduce((a, r) => a + (r.held || 0), 0);
      return { sem, attendance: h ? 100 * rs.reduce((a, r) => a + (r.attended || 0), 0) / h : null,
        internal: mean(rs.map(r => r.cie_pct)), overall: mean(rs.map(r => r.total)) };
    });
    const s = { ...st, ...f, records: recs, semesters: sems, overall_pct: mean(recs.map(r => r.total)) };
    s.prediction = f.attendance_pct != null && f.internal_pct != null ? predict(f) : null;
    s.flags = [];
    if (f.attendance_pct != null && f.attendance_pct < t.attendance) s.flags.push(`Attendance ${f.attendance_pct.toFixed(0)}%`);
    if (f.internal_pct != null && f.internal_pct < t.internal) s.flags.push(`Internals ${f.internal_pct.toFixed(0)}%`);
    if (s.overall_pct != null && s.overall_pct < t.overall) s.flags.push(`Overall ${s.overall_pct.toFixed(0)}%`);
    if (s.prediction && s.prediction.category === 'At Risk') s.flags.push('Model: At Risk');
    s.actions = actionsFor(s, t);
    return s;
  }

  function students() {
    if (cache) return cache;
    const t = thresholds(), recs = records(), by = {};
    for (const r of recs) (by[r.usn] = by[r.usn] || []).push(r);
    cache = DB.all('SELECT * FROM students ORDER BY usn').map(st => summarize(st, by[st.usn] || [], t));
    return cache;
  }
  const student = usn => students().find(s => s.usn === usn);
  const classKey = s => `${s.branch || '-'} ${s.section || '-'}`;

  function inClass(key) { return students().filter(s => key === 'all' || classKey(s) === key); }

  function subjectAverages(list, semester) {
    const rows = {};
    for (const s of list) for (const r of s.records) {
      if (semester && r.semester !== semester) continue;
      const x = rows[r.code] = rows[r.code] || { code: r.code, name: r.name, semester: r.semester, cie: [], see: [], total: [], att: [], fail: 0, done: 0 };
      x.cie.push(r.cie); x.see.push(r.see); x.total.push(r.total); x.att.push(r.att_pct);
      if (r.total != null) { x.done++; if (r.failed) x.fail++; }
    }
    return Object.values(rows).map(x => ({ code: x.code, name: x.name, semester: x.semester, cie: mean(x.cie), see: mean(x.see), total: mean(x.total),
      attendance: mean(x.att), passRate: x.done ? 100 * (x.done - x.fail) / x.done : null, students: x.cie.length })).sort((a, b) => a.code.localeCompare(b.code));
  }
  function classSemesters(list) {
    const sems = {};
    for (const s of list) for (const m of s.semesters) (sems[m.sem] = sems[m.sem] || []).push(m);
    return Object.keys(sems).map(Number).sort((a, b) => a - b).map(sem => ({ sem,
      attendance: mean(sems[sem].map(m => m.attendance)), internal: mean(sems[sem].map(m => m.internal)), overall: mean(sems[sem].map(m => m.overall)) }));
  }
  return { loadModel, getModel, predictRaw, thresholds, students, student, classKey, inClass, subjectAverages, classSemesters, invalidate, mean, LABELS };
})();
