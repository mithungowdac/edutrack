// Copies the few library files the app needs into www/vendor (run: npm run vendor)
const fs = require('fs');
const files = [
  'sql.js/dist/sql-wasm.js', 'sql.js/dist/sql-wasm.wasm', 'chart.js/dist/chart.umd.min.js',
  'jspdf/dist/jspdf.umd.min.js', 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
];
fs.mkdirSync('www/vendor', { recursive: true });
for (const f of files) fs.copyFileSync(`node_modules/${f}`, `www/vendor/${f.split('/').pop()}`);
console.log('copied', files.length, 'files');
