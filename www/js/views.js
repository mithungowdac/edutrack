// Screens for reading results: Home, Students, one student, Class and Model.
const Views = (() => {
  const { esc, pct, num, pill, $, $$ } = UI;
  const view = () => $('#view');
  const demoNote = () => DB.getSetting('demo_data') === '1'
    ? '<p class="notice"><b>Demo data.</b> These students are fictional and their records are simulated.</p>' : '';
  const empty = () => `<div class="card"><h2>No student records yet</h2><p class="muted">Import a CSV file or add a student from the Data tab.</p>
    <p><a class="btn primary" href="#/data">Go to Data</a></p></div>`;

  function studentItem(s) {
    return `<li><a class="item" href="#/student/${encodeURIComponent(s.usn)}"><div class="who"><b>${esc(s.name)}</b>
      <small>${esc(s.usn)} · Attendance ${pct(s.attendance_pct)} · Internals ${pct(s.internal_pct)}</small></div>${pill(s.prediction && s.prediction.category)}</a></li>`;
  }
  const byPriority = list => [...list].sort((a, b) => b.flags.length - a.flags.length ||
    (b.prediction ? b.prediction.probabilities[b.prediction.classes.indexOf('At Risk')] : 0) - (a.prediction ? a.prediction.probabilities[a.prediction.classes.indexOf('At Risk')] : 0));

  function tableBlock(summary, head, rows) {
    return `<details><summary>${esc(summary)}</summary><div class="scroll"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  function home() {
    const list = A.students();
    if (!list.length) { view().innerHTML = empty(); return; }
    const flagged = byPriority(list.filter(s => s.flags.length));
    const counts = { 'At Risk': 0, Average: 0, Good: 0 };
    list.forEach(s => { if (s.prediction) counts[s.prediction.category]++; });
    const total = counts['At Risk'] + counts.Average + counts.Good || 1;
    view().innerHTML = `${demoNote()}
      <div class="stats">
        <div class="stat"><b>${list.length}</b><span>Students</span></div>
        <div class="stat"><b>${flagged.length}</b><span>Need review</span></div>
        <div class="stat"><b>${pct(A.mean(list.map(s => s.overall_pct)))}</b><span>Average overall marks</span></div>
        <div class="stat"><b>${pct(A.mean(list.map(s => s.attendance_pct)))}</b><span>Average attendance</span></div>
      </div>
      <section class="card"><h2>Estimated categories</h2>
        ${Object.entries(counts).map(([c, n]) => `<div class="prob"><span>${esc(c)}</span><span class="track"><b style="width:${100 * n / total}%"></b></span><span>${n}</span></div>`).join('')}
      </section>
      <section class="card"><div class="row"><h2>Early warning</h2><a href="#/students?filter=flagged" class="small">See all ${flagged.length}</a></div>
        <p class="small muted">Below a minimum you set, or estimated At Risk. Open a student for suggested support.</p>
        <ul class="list">${flagged.slice(0, 5).map(studentItem).join('') || '<li class="muted pad">Nobody is flagged right now.</li>'}</ul>
      </section>`;
  }

  function students(params) {
    const all = A.students();
    if (!all.length) { view().innerHTML = empty(); return; }
    view().innerHTML = `<div class="grid2"><label>Search<input id="q" type="search" placeholder="Name or USN"></label>
      <label>Show<select id="f">
        <option value="all">All students</option><option value="flagged">Need review</option>
        <option>At Risk</option><option>Average</option><option>Good</option></select></label></div>
      <section class="card"><p class="small muted" id="n"></p><ul class="list" id="list"></ul></section>`;
    const q = $('#q'), f = $('#f');
    f.value = params.get('filter') || 'all';
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const rows = (f.value === 'flagged' ? byPriority(all) : all).filter(s =>
        (!term || s.name.toLowerCase().includes(term) || s.usn.toLowerCase().includes(term)) &&
        (f.value === 'all' || (f.value === 'flagged' ? s.flags.length : s.prediction && s.prediction.category === f.value)));
      $('#n').textContent = `${rows.length} of ${all.length} students`;
      $('#list').innerHTML = rows.map(studentItem).join('') || '<li class="muted pad">No match.</li>';
    };
    q.oninput = draw; f.onchange = draw;
    draw();
  }

  function predictionCard(s) {
    const p = s.prediction;
    if (!p) return `<section class="card"><h2>Estimated category</h2><p class="muted">Not enough data. The model needs this semester's attendance and internal marks.</p></section>`;
    const now = s.records.filter(r => r.semester === s.current_sem);
    const actual = now.length && now.every(r => r.total != null) ? A.mean(now.map(r => r.total)) : null;
    return `<section class="card"><div class="row"><h2>Estimated category</h2>${pill(p.category)}</div>
      <p class="small muted">Estimate of this semester's final result, made without its exam marks. Use it to start a conversation, not to judge a student.</p>
      ${actual == null ? '' : `<p class="notice">Actual result is now in: <b>${actual.toFixed(1)}%</b>.</p>`}
      <div>${p.classes.map((c, i) => `<div class="prob"><span>${esc(c)}</span><span class="track"><b style="width:${(p.probabilities[i] * 100).toFixed(0)}%"></b></span><span>${(p.probabilities[i] * 100).toFixed(0)}%</span></div>`).join('')}</div>
      <h3 style="margin-top:14px">Factors linked to this estimate</h3>
      <p class="small muted">These are patterns in the training data, not proven causes.</p>
      ${p.factors.map(x => {
        const dir = Math.abs(x.contribution) < .1 ? 'Little effect' : x.contribution > 0 ? 'Supports' : 'Points away';
        const unit = x.feature === 'backlogs' ? '' : '%';
        return `<div class="factor"><div class="row"><b>${esc(x.label)}</b><span class="dir">${dir}</span></div>
          <span class="muted small">${x.imputed ? 'No earlier record, so the training average was used' : `${num(x.value)}${unit} here, ${num(x.typical)}${unit} on average in training`}</span></div>`;
      }).join('')}</section>`;
  }

  function student(usn) {
    const s = A.student(usn);
    if (!s) { view().innerHTML = '<p class="card">Student not found.</p>'; return; }
    const sems = s.semesters.map(m => m.sem);
    const t = A.thresholds();
    view().innerHTML = `<section class="card"><div class="row"><div><h2>${esc(s.name)}</h2>
        <p class="small muted">${esc(s.usn)} · ${esc(s.branch)} ${esc(s.section)} · Semester ${esc(s.current_sem)}</p></div>${pill(s.prediction && s.prediction.category)}</div>
        ${s.flags.length ? `<div class="chips">${s.flags.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}</section>
      <div class="stats">
        <div class="stat"><b>${pct(s.overall_pct, 1)}</b><span>Overall marks</span></div>
        <div class="stat"><b>${pct(s.attendance_pct, 1)}</b><span>Attendance this semester</span></div>
        <div class="stat"><b>${pct(s.internal_pct, 1)}</b><span>Internals this semester</span></div>
        <div class="stat"><b>${s.backlogs}</b><span>Backlogs</span></div>
      </div>
      ${predictionCard(s)}
      <section class="card"><h2>Suggested support</h2>
        ${s.actions.length ? `<ul class="actions">${s.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="muted">No action suggested right now.</p>'}</section>
      <section class="card"><h2>Semester trend</h2><div class="chart" id="c-trend" data-label="Marks and attendance by semester"></div>
        ${Charts.legendHtml([{ name: 'Overall marks' }, { name: 'Attendance' }, { name: 'Internals' }])}
        ${tableBlock('View as table', ['Semester', 'Overall', 'Attendance', 'Internals'], s.semesters.map(m => [m.sem, pct(m.overall, 1), pct(m.attendance, 1), pct(m.internal, 1)]))}</section>
      <section class="card"><div class="row"><h2>Subject detail</h2>
        <select id="sem" aria-label="Semester" style="width:auto">${sems.map(n => `<option value="${n}">Semester ${n}</option>`).join('')}</select></div>
        <h3 style="margin-top:12px">Attendance</h3><p class="small muted">Dashed line: ${t.attendance}% minimum</p><div class="chart" id="c-att" data-label="Attendance by subject"></div>
        <h3 style="margin-top:14px">Marks</h3><div class="chart" id="c-marks" data-label="Marks by subject"></div>
        ${Charts.legendHtml([{ name: 'Internal %' }, { name: 'Exam %' }])}
        <div id="sub-table"></div></section>
      <div class="btns"><button class="btn primary" id="pdf">Student report (PDF)</button><a class="btn" href="#/edit/${encodeURIComponent(s.usn)}">Review or correct data</a></div>`;
    const labels = s.semesters.map(m => `Sem ${m.sem}`);
    Charts.lines('c-trend', labels, [
      { name: 'Overall marks', values: s.semesters.map(m => m.overall) },
      { name: 'Attendance', values: s.semesters.map(m => m.attendance) },
      { name: 'Internals', values: s.semesters.map(m => m.internal) },
    ]);
    const semSel = $('#sem');
    const drawSem = () => {
      const rs = s.records.filter(r => r.semester === +semSel.value), names = rs.map(r => r.name);
      Charts.hbars('c-att', names, [{ name: 'Attendance', values: rs.map(r => r.att_pct) }], { threshold: t.attendance });
      Charts.hbars('c-marks', names, [{ name: 'Internal %', values: rs.map(r => r.cie_pct) }, { name: 'Exam %', values: rs.map(r => r.see_pct) }]);
      $('#sub-table').innerHTML = tableBlock('View as table', ['Subject', 'Attend.', 'Int /50', 'Exam /50', 'Total'],
        rs.map(r => [r.name, pct(r.att_pct), num(r.cie, 0), num(r.see, 0), num(r.total, 0)]));
    };
    semSel.value = sems.includes(s.current_sem) ? s.current_sem : sems[sems.length - 1];
    semSel.onchange = drawSem;
    if (sems.length) drawSem();
    $('#pdf').onclick = () => Reports.student(s);
  }

  let cls = { key: 'all', sem: 0 };
  function classView() {
    const everyone = A.students();
    if (!everyone.length) { view().innerHTML = empty(); return; }
    const keys = [...new Set(everyone.map(A.classKey))].sort();
    if (cls.key !== 'all' && !keys.includes(cls.key)) cls.key = 'all';
    const list = A.inClass(cls.key), t = A.thresholds();
    const trend = A.classSemesters(list), sems = trend.map(m => m.sem);
    if (!sems.includes(cls.sem)) cls.sem = sems[sems.length - 1];
    const subs = A.subjectAverages(list, cls.sem);
    const bins = [['Under 65', 0, 65], ['65–74', 65, 75], ['75–84', 75, 85], ['85–94', 85, 95], ['95+', 95, 101]];
    const hist = bins.map(b => list.filter(s => s.attendance_pct != null && s.attendance_pct >= b[1] && s.attendance_pct < b[2]).length);
    const below = list.filter(s => s.flags.some(f => !f.startsWith('Model')));
    view().innerHTML = `<div class="grid2"><label>Class<select id="k"><option value="all">All students</option>${keys.map(k => `<option>${esc(k)}</option>`).join('')}</select></label>
        <label>Semester<select id="s">${sems.map(n => `<option value="${n}">Semester ${n}</option>`).join('')}</select></label></div>
      <section class="card"><h2>Semester trend</h2><div class="chart" id="c-trend" data-label="Class marks and attendance by semester"></div>
        ${Charts.legendHtml([{ name: 'Overall marks' }, { name: 'Attendance' }, { name: 'Internals' }])}
        ${tableBlock('View as table', ['Semester', 'Overall', 'Attendance', 'Internals'], trend.map(m => [m.sem, pct(m.overall, 1), pct(m.attendance, 1), pct(m.internal, 1)]))}</section>
      <section class="card"><h2>Subject averages</h2><p class="small muted">${subs.some(x => x.total != null) ? 'Average total marks out of 100' : 'Exams are pending, so this shows average internal marks as a percentage'}</p>
        <div class="chart" id="c-sub" data-label="Average marks by subject"></div>
        ${tableBlock('View as table', ['Subject', 'Attend.', 'Int /50', 'Exam /50', 'Total', 'Pass'], subs.map(x => [x.name, pct(x.attendance), num(x.cie), num(x.see), num(x.total), pct(x.passRate)]))}</section>
      <section class="card"><h2>Attendance spread</h2><p class="small muted">Students by attendance this semester</p><div class="chart" id="c-hist" data-label="Number of students in each attendance band"></div>
        ${tableBlock('View as table', ['Attendance', 'Students'], bins.map((b, i) => [b[0] + '%', hist[i]]))}</section>
      <section class="card"><h2>Minimum thresholds</h2><p class="small muted">Change these to match your department's rules.</p>
        <div class="grid4" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <label>Attendance %<input id="t-a" type="number" min="0" max="100" value="${t.attendance}"></label>
          <label>Internals %<input id="t-i" type="number" min="0" max="100" value="${t.internal}"></label>
          <label>Overall %<input id="t-o" type="number" min="0" max="100" value="${t.overall}"></label></div>
        <h3 style="margin-top:14px">${below.length} below a minimum</h3>
        <ul class="list">${below.map(studentItem).join('') || '<li class="muted pad">Nobody is below these minimums.</li>'}</ul></section>
      <button class="btn primary" id="pdf">Class report (PDF)</button>`;
    const k = $('#k'), s = $('#s');
    k.value = cls.key; s.value = cls.sem;
    k.onchange = () => { cls.key = k.value; App.render(); };
    s.onchange = () => { cls.sem = +s.value; App.render(); };
    Charts.lines('c-trend', trend.map(m => `Sem ${m.sem}`), [
      { name: 'Overall marks', values: trend.map(m => m.overall) },
      { name: 'Attendance', values: trend.map(m => m.attendance) },
      { name: 'Internals', values: trend.map(m => m.internal) },
    ]);
    const pending = !subs.some(x => x.total != null);
    Charts.hbars('c-sub', subs.map(x => x.name), [{ name: pending ? 'Internal %' : 'Total marks', values: subs.map(x => pending ? (x.cie == null ? null : x.cie * 2) : x.total) }]);
    Charts.vbars('c-hist', bins.map(b => b[0]), 'Students', hist);
    [['#t-a', 'min_attendance'], ['#t-i', 'min_internal'], ['#t-o', 'min_overall']].forEach(([id, key]) => {
      $(id).onchange = async e => {
        const v = Math.min(100, Math.max(0, +e.target.value || 0));
        DB.setSetting(key, v);
        await DB.save();
        A.invalidate();
        App.render();
      };
    });
    $('#pdf').onclick = () => Reports.classReport(cls.key, list);
  }

  function metricRows(entries) {
    return entries.map(([name, m]) => `<tr><td>${esc(name)}</td><td>${(m.accuracy * 100).toFixed(1)}%</td><td>${m.f1_macro.toFixed(2)}</td><td>${(m.at_risk_recall * 100).toFixed(0)}%</td><td>${(m.at_risk_precision * 100).toFixed(0)}%</td></tr>`).join('');
  }
  function confusion(title, m) {
    const c = ['At Risk', 'Average', 'Good'];
    return `<h3 style="margin-top:12px">${esc(title)}</h3><div class="scroll"><table><thead><tr><th>Actual ↓ / Estimated →</th>${c.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${m.confusion_matrix.map((r, i) => `<tr><td>${c[i]}</td>${r.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function modelView() {
    const m = A.getModel(), r = m.report, syn = r.synthetic_test;
    const v = m.check_vectors, matched = v.inputs.filter((x, i) => A.predictRaw(x).probabilities.every((p, k) => Math.abs(p - v.probabilities[i][k]) < 1e-3)).length;
    const HEAD = '<thead><tr><th>Test</th><th>Accuracy</th><th>F1</th><th>At Risk found</th><th>Flags correct</th></tr></thead>';
    view().innerHTML = `<p class="notice"><b>How to read this model:</b> it helps decide who to talk to first. It must never be used alone to judge, grade or penalise a student.</p>
      <section class="card"><h2>What it does</h2><p>A logistic regression model estimates whether this semester's final result will be <b>At Risk</b> (under 50%), <b>Average</b> (50–69%) or <b>Good</b> (70% or more).</p>
        <p class="muted small">Inputs: attendance, internal marks, previous semesters' marks and backlogs. This semester's exam marks are left out, because they are what is being estimated.</p></section>
      <section class="card"><h2>Held-out test results</h2><p class="small muted">Every score comes from records the model did not learn from.</p>
        <h3 style="margin-top:12px">Synthetic records (${syn['Logistic Regression'].test_size} test students)</h3>
        <div class="scroll"><table>${HEAD}<tbody>${metricRows([['Logistic regression (used)', syn['Logistic Regression']], ['Random forest', syn['Random Forest']], ['Always guess most common', syn['Baseline (always majority class)']]])}</tbody></table></div>
        <p class="small muted">This mostly shows the model recovered the pattern we simulated, so it is not evidence of real-world accuracy.</p>
        ${r.real_benchmark ? `<h3 style="margin-top:12px">Real students, UCI dataset (${r.real_benchmark.logistic.test_size} test students)</h3>
        <div class="scroll"><table>${HEAD}<tbody>${metricRows([['Same method, trained on UCI', r.real_benchmark.logistic], ['App model on all 649 UCI students', r.external_test.logistic], ['Always guess most common', r.external_test.baseline]])}</tbody></table></div>
        <p class="small muted">The app's model finds nearly every struggling UCI student but over-flags: more than half of its At Risk flags are false alarms. That is why flags lead to a conversation, not a decision.</p>` : ''}
        ${confusion('Synthetic test: where it goes wrong', syn['Logistic Regression'])}
        ${r.external_test ? confusion('Real UCI students: where it goes wrong', r.external_test.logistic) : ''}</section>
      <section class="card"><h2>Limitations</h2><ul class="actions">
        <li>It was trained on simulated records, not real MVIT or VTU students. It must be retrained and re-tested on authorised local data before real use.</li>
        <li>The UCI students are Portuguese secondary-school students, so that test checks the method, not local accuracy.</li>
        <li>UCI records absences as a count. Converting them to a percentage assumes ${180} school days.</li>
        <li>It cannot see health, finances, family events or teaching quality, and a low attendance figure may have a good reason.</li>
        <li>Attendance has little weight in this model because internal marks already carry most of the signal. Low attendance is still flagged by its own threshold.</li>
        <li>Fairness across student groups has not been tested.</li></ul></section>
      <section class="card"><h2>Technical check</h2><p class="small">The app recalculates predictions on the phone. Compared with scikit-learn's own answers on ${v.inputs.length} test students: <b>${matched} of ${v.inputs.length} match</b>.</p>
        <p class="small muted">Trained on ${m.training_rows} simulated students with an 80/20 split.</p></section>`;
  }
  return { home, students, student, classView, modelView };
})();
