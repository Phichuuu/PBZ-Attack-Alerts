'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const { sdk } = require('../dependencies.json');
const destination = path.join(root, 'vendor/game-api');
async function main() {
    const cache = path.join(root, '.cache');
    fs.mkdirSync(cache, { recursive: true });
    const archive = path.join(cache, `sdk-${sdk.version}.zip`);
    let bytes;
    if (fs.existsSync(archive)) bytes = fs.readFileSync(archive);
    else {
        console.log(`Downloading official PBZ SDK ${sdk.version}...`);
        // Windows WebClient honours the system proxy without weakening TLS.
        const partial=archive+'.download';
        const windowsCommand="$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $client=New-Object Net.WebClient; try { $client.DownloadFile($env:PBZ_SDK_URL,$env:PBZ_SDK_DEST) } finally { $client.Dispose() }";
        const result=process.platform==='win32' ?
            spawnSync('powershell.exe',['-NoProfile','-Command',windowsCommand],
                {encoding:'utf8',timeout:125000,env:{...process.env,PBZ_SDK_URL:sdk.url,PBZ_SDK_DEST:partial}}) :
            spawnSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','120','--output',partial,sdk.url],
                {encoding:'utf8',timeout:125000});
        if(result.error?.code==='ENOENT') {
            const response=await fetch(sdk.url,{signal:AbortSignal.timeout(120000)});
            if(!response.ok) throw Error(`SDK download failed: HTTP ${response.status}`);
            bytes=Buffer.from(await response.arrayBuffer());
        } else {
            if(result.status!==0) throw Error('SDK download failed; check access to GitHub and retry npm run sdk.');
            bytes=fs.readFileSync(partial);
        }
    }
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== sdk.sha256) throw Error('SDK checksum mismatch');
    const files = unzipSync(bytes, { filter: item => item.name.startsWith(sdk.prefix) && !item.name.endsWith('/') });
    if (!files[sdk.prefix + 'index.d.ts']) throw Error('SDK entry point missing');
    for (const [name, data] of Object.entries(files)) {
        const relative = name.slice(sdk.prefix.length);
        if (relative.split(/[\\/]/).includes('..') || path.isAbsolute(relative)) throw Error('Invalid SDK path');
        const target = path.resolve(destination, relative);
        if (!target.startsWith(destination + path.sep)) throw Error('SDK path escaped destination');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
    }
    fs.writeFileSync(archive, bytes);
    console.log(`Verified SDK ${sdk.version}; ${Object.keys(files).length} files ready.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
