'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const files = {};
function add(relative) {
    const p=path.join(root,relative);
    if(fs.statSync(p).isDirectory()) for(const f of fs.readdirSync(p)) add(relative+'/'+f);
    else files[relative]=[new Uint8Array(fs.readFileSync(p)),{mtime:new Date('2026-01-01T00:00:00Z')}];
}
for(const p of ['Install.cmd','scripts/install.ps1','scripts/verify-install.ps1','AGENTS.md','docs/AGENT_DEPLOYMENT.md','dependencies.json','ready-to-install','README.md','LICENSE','THIRD_PARTY_NOTICES.md']) add(p);
const release=path.join(root,'release'); fs.mkdirSync(release,{recursive:true});
const name=`PBZ-Attack-Alerts-${version}-win64.zip`, output=path.join(release,name);
const bytes=zipSync(files,{level:9});
fs.writeFileSync(output,bytes,{flag:'wx'});
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(output+'.sha256',sha+'  '+name+'\n',{flag:'wx'});
console.log(`Packaged ${name}: ${sha}`);
