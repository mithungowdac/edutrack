// PDF reports for one student or a whole class.
const Reports = (() => {
  const f = (v, d = 1) => v == null ? '-' : Number(v).toFixed(d);
  const NOTE = 'The category is a statistical estimate to support a conversation, not a verdict on the student. Review it with the student\'s full context.';

  function start(title, subtitle) {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(title, 40, 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(subtitle, 40, 67);
    doc.text(`Generated ${new Date().toLocaleDateString('en-IN')} with EduTrack`, 40, 81);
    if (DB.getSetting('demo_data') === '1') { doc.setTextColor(170, 40, 40); doc.text('DEMO REPORT: fictional students, simulated records.', 40, 95); }
    doc.setTextColor(0);
    return { doc, y: 112 };
  }
  function heading(r, text) {
    if (r.y > 740) { r.doc.addPage(); r.y = 50; }
    r.doc.setFont('helvetica', 'bold'); r.doc.setFontSize(12); r.doc.text(text, 40, r.y);
    r.doc.setFont('helvetica', 'normal'); r.y += 8;
  }
  function table(r, head, body) {
    r.doc.autoTable({ startY: r.y, head: [head], body, margin: { left: 40, right: 40 }, styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [31, 95, 176] } });
    r.y = r.doc.lastAutoTable.finalY + 22;
  }
  function para(r, text) {
    r.doc.setFontSize(10);
    const lines = r.doc.splitTextToSize(text, 515);
    if (r.y + lines.length * 13 > 800) { r.doc.addPage(); r.y = 50; }
    r.doc.text(lines, 40, r.y);
    r.y += lines.length * 13 + 6;
  }
  const finish = (r, name) => UI.saveFile(name, 'application/pdf', r.doc.output('datauristring').split(',')[1]);

  async function student(s) {
    const r = start(`Student report: ${s.name}`, `${s.usn} | ${s.branch || '-'} Section ${s.section || '-'} | Semester ${s.current_sem}`);
    heading(r, 'Summary');
    table(r, ['Overall marks', 'Attendance (current sem)', 'Internals (current sem)', 'Backlogs'],
      [[`${f(s.overall_pct)}%`, `${f(s.attendance_pct)}%`, `${f(s.internal_pct)}%`, s.backlogs]]);
    if (s.prediction) {
      heading(r, `Estimated category: ${s.prediction.category} (${(s.prediction.confidence * 100).toFixed(0)}% model probability)`);
      table(r, ['Factor', 'Value', 'Training average', 'Effect on this estimate'], s.prediction.factors.map(x => [
        x.label, x.imputed ? 'No data' : f(x.value), f(x.typical), Math.abs(x.contribution) < .1 ? 'Little effect' : x.contribution > 0 ? 'Supports' : 'Points away',
      ]));
      para(r, NOTE);
    }
    if (s.actions.length) { heading(r, 'Suggested support'); r.y += 8; s.actions.forEach(a => para(r, `- ${a}`)); }
    heading(r, 'Semester trend');
    table(r, ['Semester', 'Attendance %', 'Internals %', 'Overall %'], s.semesters.map(m => [m.sem, f(m.attendance), f(m.internal), f(m.overall)]));
    heading(r, 'Subject records');
    table(r, ['Sem', 'Subject', 'Classes', 'Attendance %', 'Internal /50', 'Exam /50', 'Total /100'],
      s.records.map(x => [x.semester, x.name, x.held == null ? '-' : `${x.attended}/${x.held}`, f(x.att_pct, 0), f(x.cie, 0), f(x.see, 0), f(x.total, 0)]));
    await finish(r, `report_${s.usn}.pdf`);
  }

  async function classReport(key, list) {
    const t = A.thresholds(), flagged = list.filter(s => s.flags.length);
    const r = start(`Class report: ${key === 'all' ? 'All students' : key}`, `${list.length} students`);
    heading(r, 'Summary');
    table(r, ['Average overall', 'Average attendance', 'Students needing review'],
      [[`${f(A.mean(list.map(s => s.overall_pct)))}%`, `${f(A.mean(list.map(s => s.attendance_pct)))}%`, flagged.length]]);
    heading(r, 'Semester trend');
    table(r, ['Semester', 'Attendance %', 'Internals %', 'Overall %'], A.classSemesters(list).map(m => [m.sem, f(m.attendance), f(m.internal), f(m.overall)]));
    heading(r, 'Subject-wise averages');
    table(r, ['Sem', 'Subject', 'Attendance %', 'Internal /50', 'Exam /50', 'Total /100', 'Pass %'],
      A.subjectAverages(list).map(x => [x.semester, x.name, f(x.attendance), f(x.cie), f(x.see), f(x.total), f(x.passRate, 0)]));
    heading(r, `Students needing review (minimums: attendance ${t.attendance}%, internals ${t.internal}%, overall ${t.overall}%)`);
    table(r, ['USN', 'Name', 'Estimate', 'Reasons'], flagged.map(s => [s.usn, s.name, s.prediction ? s.prediction.category : '-', s.flags.join(', ')]));
    para(r, NOTE);
    await finish(r, `class_report_${key.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`);
  }
  return { student, classReport };
})();
