const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {zipSync}=require('fflate');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t,{loader=true,proxy=false}={}) {
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pbz-install-test-'));
    // This exact directory was created by the test, never a computed game path.
    t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
    const project=path.join(temp,'project'), game=path.join(temp,'game with spaces');
    const put=(base,p,bytes)=>{fs.mkdirSync(path.dirname(path.join(base,p)),{recursive:true});fs.writeFileSync(path.join(base,p),bytes);};
    put(project,'scripts/install.ps1',fs.readFileSync(path.join(root,'scripts/install.ps1')));
    put(project,'scripts/verify-install.ps1',fs.readFileSync(path.join(root,'scripts/verify-install.ps1')));
    const script='// pbz-attack-alerts test fixture, never executed\n';
    put(project,'ready-to-install/pbz-attack-alerts/main.js',script);
    put(project,'ready-to-install/manifest.json',JSON.stringify({version:'test',files:{'pbz-attack-alerts/main.js':hash(script)}}));
    put(game,'platform/steam/PBZ.exe','inert test fixture, not an executable');
    fs.mkdirSync(path.join(game,'ProjectPBZ'),{recursive:true});
    if(loader) {
        put(game,'ProjectPBZ/Content/JavaScript/PBZModLoader/bootstrap.js','existing loader');
        put(game,'ProjectPBZ/Content/JavaScript/PBZModLoader/manager.js','existing loader');
    }
    if(loader || proxy) put(game,'platform/steam/version.dll','inert existing fixture');
    const bytes=zipSync(Object.fromEntries(Object.entries({
        'ProjectPBZ/Content/JavaScript/PBZModLoader/bootstrap.js':'inert bootstrap',
        'ProjectPBZ/Content/JavaScript/PBZModLoader/manager.js':'inert manager',
        'ProjectPBZ/PBZModLoader/mods.ini':'fixture defaults',
        'platform/steam/version.dll':'inert proxy, never loaded',
    }).map(([key,value])=>[key,Buffer.from(value)])));
    put(project,'.cache/PBZModLoader-fixture.zip',bytes);
    put(project,'dependencies.json',JSON.stringify({loader:{version:'fixture',url:'https://invalid.invalid/not-used',sha256:hash(bytes)}}));
    const runFrom=(selected,...args)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(project,'scripts/install.ps1'),'-GameRoot',selected,...args],{encoding:'utf8'});
    const run=(...args)=>runFrom(game,...args);
    const verify=(...args)=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(project,'scripts/verify-install.ps1'),...args],{encoding:'utf8'});
    return {project,game,put,script,run,runFrom,verify,mod:path.join(game,'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js')};
}
const windows={skip:process.platform!=='win32'};
test('installer installs to a fresh game using a verified cached loader',windows,t=>{
    const f=fixture(t,{loader:false});const r=f.run();assert.equal(r.status,0,r.stderr);
    assert.equal(fs.readFileSync(f.mod,'utf8'),f.script);
    assert.equal(fs.readFileSync(path.join(f.game,'platform/steam/version.dll'),'utf8'),'inert proxy, never loaded');
});
test('installer preserves existing loader/config and backs up an updated mod',windows,t=>{
    const f=fixture(t); f.put(f.game,'ProjectPBZ/PBZModLoader/mods.ini','keep my settings');
    f.put(f.game,'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js','// pbz-attack-alerts older local version');
    f.put(f.game,'ProjectPBZ/PBZModLoader/mods/another-mod/main.js','unrelated');
    const r=f.run();assert.equal(r.status,0,r.stderr);
    assert.equal(fs.readFileSync(path.join(f.game,'platform/steam/version.dll'),'utf8'),'inert existing fixture');
    assert.equal(fs.readFileSync(path.join(f.game,'ProjectPBZ/PBZModLoader/mods.ini'),'utf8'),'keep my settings');
    assert.equal(fs.readFileSync(path.join(f.game,'ProjectPBZ/PBZModLoader/mods/another-mod/main.js'),'utf8'),'unrelated');
    const backups=path.join(f.game,'ProjectPBZ/PBZModLoader/attack-alerts-backups');
    const saved=path.join(backups,fs.readdirSync(backups)[0],'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js');
    assert.match(fs.readFileSync(saved,'utf8'),/older local version/);
});
test('installer refuses corrupted package before writing files',windows,t=>{
    const f=fixture(t);f.put(f.project,'ready-to-install/pbz-attack-alerts/main.js','corrupt');
    const r=f.run();assert.notEqual(r.status,0);assert.equal(fs.existsSync(f.mod),false);
});
test('installer refuses an unknown DLL proxy without changing it',windows,t=>{
    const f=fixture(t,{loader:false,proxy:true});const r=f.run();assert.notEqual(r.status,0);
    assert.equal(fs.readFileSync(path.join(f.game,'platform/steam/version.dll'),'utf8'),'inert existing fixture');
    assert.equal(fs.existsSync(f.mod),false);
});
test('installer dry-run does not install files',windows,t=>{
    const f=fixture(t,{loader:false});const r=f.run('-WhatIf');assert.equal(r.status,0,r.stderr);assert.equal(fs.existsSync(f.mod),false);
});
test('installer accepts Windows short-name game paths without weakening containment',windows,t=>{
    const f=fixture(t);
    const query=spawnSync('powershell.exe',['-NoProfile','-Command',
        '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:PBZ_TEST_GAME_ROOT).ShortPath'],
        {encoding:'utf8',env:{...process.env,PBZ_TEST_GAME_ROOT:f.game}});
    assert.equal(query.status,0,query.stderr);
    const r=f.runFrom(query.stdout.trim());assert.equal(r.status,0,r.stderr);
    assert.equal(fs.readFileSync(f.mod,'utf8'),f.script);
});

test('agent verification accepts installed files without claiming configuration or runtime checks',windows,t=>{
    const f=fixture(t);const installed=f.run();assert.equal(installed.status,0,installed.stderr);
    const r=f.verify('-GameRoot',f.game);assert.equal(r.status,0,r.stderr);
    const report=JSON.parse(r.stdout);
    assert.equal(report.schemaVersion,1);assert.equal(report.status,'files_verified');
    assert.equal(report.packageVersion,'test');assert.equal(report.configurationChecked,false);
    assert.equal(report.runtimeVerified,false);assert.deepEqual(report.issues,[]);
    assert.equal(report.files[0].installedSha256,hash(f.script));
});

test('agent verification detects changed and missing installed files without repairing them',windows,t=>{
    const f=fixture(t);f.put(f.game,'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js','user custom content');
    const r=f.verify('-GameRoot',f.game);assert.equal(r.status,1);
    const report=JSON.parse(r.stdout);assert.equal(report.status,'verification_failed');
    assert.equal(report.files[0].packageMatches,true);assert.equal(report.files[0].installedMatches,false);
    assert.equal(fs.readFileSync(f.mod,'utf8'),'user custom content');
    fs.unlinkSync(f.mod);
    const missing=f.verify('-GameRoot',f.game);assert.equal(missing.status,1);
    assert.equal(JSON.parse(missing.stdout).files[0].installedSha256,null);
    assert.equal(fs.existsSync(f.mod),false);
});

test('agent verification detects corrupted source even when installed files match',windows,t=>{
    const f=fixture(t);assert.equal(f.run().status,0);
    f.put(f.project,'ready-to-install/pbz-attack-alerts/main.js','corrupt source');
    const r=f.verify('-GameRoot',f.game);assert.equal(r.status,1);
    const report=JSON.parse(r.stdout);assert.equal(report.files[0].packageMatches,false);
    assert.equal(report.files[0].installedMatches,true);
});

test('agent verification reports loader absence and overriding TypeScript',windows,t=>{
    const f=fixture(t,{loader:false});f.put(f.game,'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.js',f.script);
    f.put(f.game,'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts/main.ts','old entry');
    const r=f.verify('-GameRoot',f.game);assert.equal(r.status,1);
    const report=JSON.parse(r.stdout);assert.equal(report.loaderFilesPresent,false);
    assert.ok(report.issues.some(x=>x.includes('main.ts')));
    assert.equal(fs.readFileSync(path.join(path.dirname(f.mod),'main.ts'),'utf8'),'old entry');
});

test('agent verification returns JSON errors for unsafe manifests and missing arguments',windows,t=>{
    const f=fixture(t);
    const noArgs=f.verify();assert.equal(noArgs.status,2);assert.equal(JSON.parse(noArgs.stdout).status,'error');
    for(const files of [{}, {'pbz-attack-alerts/main.js':hash(f.script),'pbz-attack-alerts/../../outside.js':hash(f.script)}, {'pbz-attack-alerts/main.js':'not-a-hash'}]) {
        f.put(f.project,'ready-to-install/manifest.json',JSON.stringify({version:'test',files}));
        const r=f.verify('-GameRoot',f.game);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'error');
    }
    assert.equal(fs.existsSync(f.mod),false);
});
