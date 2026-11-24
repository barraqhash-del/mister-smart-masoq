const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');
const source = path.join(root, 'assets', 'basma-soft-icon.jpg');

if (!fs.existsSync(source)) throw new Error('Basma Soft launcher icon source is missing.');
if (!fs.existsSync(androidRes)) throw new Error('Android resources folder is missing. Run this after "npx cap add android".');

const mipmapDirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
for (const dirName of mipmapDirs) {
  const dir = path.join(androidRes, dirName);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (/^ic_launcher(_round|_foreground)?\.(png|webp|jpg|jpeg|xml)$/i.test(name)) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
  fs.copyFileSync(source, path.join(dir, 'ic_launcher.jpg'));
}

const adaptiveDir = path.join(androidRes, 'mipmap-anydpi-v26');
if (fs.existsSync(adaptiveDir)) {
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    fs.rmSync(path.join(adaptiveDir, name), { force: true });
  }
}

const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
manifest = manifest.replace(/\s+android:roundIcon="@mipmap\/ic_launcher_round"/, '');
fs.writeFileSync(manifestPath, manifest, 'utf8');

console.log('Basma Soft launcher icon applied to Android mipmap resources.');
