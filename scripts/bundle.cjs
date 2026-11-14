'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const name = 'pbz-attack-alerts';
const source = path.join(root, 'dist', name);
const ready = path.join(root, 'ready-to-install', name);
fs.mkdirSync(ready, { recursive: true });
for (const file of ['README-试用说明.txt', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
    fs.copyFileSync(path.join(root, file), path.join(source, file));
const files = {};
for (const file of fs.readdirSync(source).sort()) {
    // Every bundled file is UTF-8 text, including PNGs embedded as hexadecimal.
    // Canonical LF keeps manifest hashes valid after Git checkout on any OS.
    const bytes = Buffer.from(fs.readFileSync(path.join(source, file),'utf8').replace(/\r\n/g,'\n'),'utf8');
    fs.writeFileSync(path.join(source,file),bytes);
    fs.writeFileSync(path.join(ready, file), bytes);
    files[`${name}/${file}`] = crypto.createHash('sha256').update(bytes).digest('hex');
}
// Fixed output path only; refuse to silently carry obsolete entry points/assets.
for (const file of fs.readdirSync(ready)) {
    if (!files[`${name}/${file}`]) throw Error(`Stale bundled file: ${file}. Remove it explicitly before bundling.`);
}
fs.writeFileSync(path.join(root, 'ready-to-install/manifest.json'), JSON.stringify({
    version: require('../package.json').version, files,
}, null, 2) + '\n');
console.log(`Bundled ${Object.keys(files).length} verified files.`);
