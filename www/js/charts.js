// Chart.js wrappers so every chart in the app shares the same look.
const Charts = (() => {
  let live = [];
  const token = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SERIES = ['--series-1', '--series-2', '--series-3'];
  const clear = () => { live.forEach(c => c.destroy()); live = []; };
  const short = s => s.length > 19 ? s.slice(0, 18) + '…' : s;

  // Vertical guide showing a minimum such as the 85% attendance requirement
  const guide = value => ({
    id: 'guide',
    afterDatasetsDraw(c) {
      const x = c.scales.x.getPixelForValue(value), { top, bottom } = c.chartArea, g = c.ctx;
      g.save(); g.strokeStyle = token('--ink-2'); g.lineWidth = 1; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.restore();
    },
  });

  // Prints each line's latest value beside its end, nudged apart so numbers never overlap
  const endValues = {
    id: 'endValues',
    afterDatasetsDraw(c) {
      const items = [];
      c.data.datasets.forEach((d, i) => {
        let k = d.data.length - 1;
        while (k >= 0 && d.data[k] == null) k--;
        if (k < 0) return;
        const p = c.getDatasetMeta(i).data[k];
        items.push({ x: p.x, y: p.y, text: d.data[k].toFixed(0) });
      });
      items.sort((a, b) => a.y - b.y);
      for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + 13);
      const g = c.ctx;
      g.save(); g.font = '12px system-ui, sans-serif'; g.fillStyle = token('--ink'); g.textBaseline = 'middle';
      items.forEach(t => g.fillText(t.text, t.x + 8, t.y)); g.restore();
    },
  };

  const axes = () => ({ color: token('--ink-2'), grid: token('--line'), border: token('--axis') });
  const tooltip = (extra = {}) => ({ backgroundColor: token('--ink'), titleColor: token('--surface'), bodyColor: token('--surface'), padding: 9, cornerRadius: 8, displayColors: true, boxPadding: 4, ...extra });

  function mount(id, config, height) {
    const box = document.getElementById(id);
    if (!box) return;
    box.style.height = height + 'px';
    box.innerHTML = '<canvas></canvas>';
    const canvas = box.firstChild;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', box.dataset.label || 'Chart; the same values are in the table');
    live.push(new Chart(canvas, config));
  }
  const legendHtml = series => series.length < 2 ? '' :
    `<div class="legend">${series.map((s, i) => `<span><i style="background:${token(SERIES[i])}"></i>${UI.esc(s.name)}</span>`).join('')}</div>`;

  // Horizontal bars: long subject names stay readable on a phone
  function hbars(id, names, series, { threshold, max = 100, unit = '%' } = {}) {
    const a = axes(), thick = series.length > 1 ? 9 : 14;
    mount(id, {
      type: 'bar',
      data: { labels: names, datasets: series.map((s, i) => ({ label: s.name, data: s.values, backgroundColor: token(SERIES[i]), barThickness: thick, borderRadius: 4, borderSkipped: 'left' })) },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        interaction: { mode: 'y', intersect: false },
        scales: {
          x: { min: 0, max, ticks: { color: a.color, stepSize: 25, callback: v => v + unit }, grid: { color: a.grid }, border: { color: a.border } },
          y: { ticks: { color: a.color, autoSkip: false, callback(v) { return short(this.getLabelForValue(v)); } }, grid: { display: false }, border: { color: a.border } },
        },
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.x == null ? '–' : c.parsed.x.toFixed(0) + unit}` } }) },
      },
      plugins: threshold == null ? [] : [guide(threshold)],
    }, names.length * (series.length > 1 ? 30 : 26) + 42);
  }

  function vbars(id, labels, name, values) {
    const a = axes();
    mount(id, {
      type: 'bar',
      data: { labels, datasets: [{ label: name, data: values, backgroundColor: token(SERIES[0]), barPercentage: .8, categoryPercentage: .9, borderRadius: 4, borderSkipped: 'bottom' }] },
      options: {
        maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: a.color }, grid: { display: false }, border: { color: a.border } },
          y: { beginAtZero: true, ticks: { color: a.color, precision: 0 }, grid: { color: a.grid }, border: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: tooltip() },
      },
    }, 200);
  }

  function lines(id, labels, series) {
    const a = axes();
    mount(id, {
      type: 'line',
      data: { labels, datasets: series.map((s, i) => ({ label: s.name, data: s.values, borderColor: token(SERIES[i]), backgroundColor: token(SERIES[i]), borderWidth: 2, tension: 0, spanGaps: false, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: token('--surface'), pointBorderWidth: 2 })) },
      options: {
        maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        layout: { padding: { right: 26 } },
        scales: {
          x: { ticks: { color: a.color }, grid: { display: false }, border: { color: a.border } },
          y: { min: 0, max: 100, ticks: { color: a.color, stepSize: 25, callback: v => v + '%' }, grid: { color: a.grid }, border: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } }) },
      },
      plugins: [endValues],
    }, 220);
  }
  return { clear, hbars, vbars, lines, legendHtml };
})();
