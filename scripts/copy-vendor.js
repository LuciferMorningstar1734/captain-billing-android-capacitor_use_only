const fs = require('fs');
fs.mkdirSync('www/vendor', { recursive: true });
fs.copyFileSync('node_modules/jspdf/dist/jspdf.umd.min.js', 'www/vendor/jspdf.umd.min.js');
console.log('vendor copied');
