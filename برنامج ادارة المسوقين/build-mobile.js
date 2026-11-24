const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const webDir = path.join(root, 'www');
fs.mkdirSync(webDir, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css']) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Required mobile asset is missing: ${file}`);
  }
  fs.copyFileSync(source, path.join(webDir, file));
}

console.log('Mobile web assets prepared in www/.');
