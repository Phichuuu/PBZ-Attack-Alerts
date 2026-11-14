const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const observations = require('../dist/pbz-attack-alerts/observations');

function fixture({ malformedFirstActor = false, useSpecFallback = false } = {}) {
    const logs = [];
    const list = items => ({ Num: () => items.length, Get: i => items[i] });
    const empty = list([]);
    const frames = { GetMaxIndex: () => 0 };
    const names = ['Actor', 'Pawn', 'DeflectComponent', 'AbilitySystemComponent', 'AbilityTask',
        'LegoAbility', 'LGATask_PlayTimeline', 'LGAAction_DurationBulletWithDeflectBase'];
    const UE = {};
    for (const name of names) {
        const type = { name, GetName: () => name };
        UE[name] = { StaticClass: () => type };
    }
    const native = (kind, name, properties = {}) => ({ kind, GetName: () => name,
        GetClass: () => ({ GetName: () => kind }), ...properties });
    const isA = (object, type) => object.kind === type.name ||
        (object.kind === 'LGATask_PlayTimeline' && type.name === 'AbilityTask');
    const goodAction = native('LGAAction_DurationBulletWithDeflectBase', 'ordinary-hit', {
        PreHitPointDuration: 0.3, RuntimePreHitPointDuration: 0.3, DeflectBulletType: 1,
        SendFrameTimes: list([0]), StartBulletTimes: list([0.3]), EndBulletTimes: list([0.4]),
    });
    const timeline = native('Timeline', 'attack', { Actions: list([
        { Action: goodAction, StartTime: 0.5, Duration: 0.4 },
    ]), RoleLayers: empty });
    const ability = native('LegoAbility', 'ability', { bIsActive: true, bIsAbilityEnding: false,
        GetPlayTimelineTask: () => null, ActiveTasks: empty });
    const task = native('LGATask_PlayTimeline', 'concurrent-task', { Ability: ability, Timeline: timeline, CurrentTime: 0.4 });
    const asc = native('AbilitySystemComponent', 'asc', {
        ActivatableAbilities: { Items: list(useSpecFallback ? [{ ActiveCount: 1,
            Ability: ability, NonReplicatedInstances: empty, ReplicatedInstances: empty }] : []) },
        TickingTasks: useSpecFallback ? empty : list([task]),
    });
    if (useSpecFallback) ability.ActiveTasks = list([task]);
    const deflect = native('DeflectComponent', 'deflect', { SendFrames: frames, ReceiveFrames: frames });
    const actor = native('Pawn', 'enemy', { K2_GetActorLocation: () => ({ X: 100, Y: 0, Z: 0 }),
        GetComponentByClass: type => type.name === 'DeflectComponent' ? deflect : asc });
    const player = native('Pawn', 'player', { K2_GetActorLocation: () => ({ X: 0, Y: 0, Z: 0 }), GetComponentByClass: () => deflect });
    const actors = [actor];
    if (malformedFirstActor) actors.unshift({ ...actor, GetName: () => 'bad-enemy',
        GetComponentByClass: type => type.name === 'DeflectComponent' ? deflect : { ...asc, ActivatableAbilities: {} } });
    Object.assign(UE, {
        NewArray: () => empty,
        GameplayStatics: { ObjectIsA: isA, GetAllActorsOfClass: (_g, _c, out) => { out.value = list(actors); } },
        KismetSystemLibrary: { IsValid: value => !!value, GetPathName: value => value.GetName() },
    });
    const mod = { exports: {} };
    const context = { exports: mod.exports, module: mod,
        console: { log: text => logs.push(text), error: text => logs.push(text) },
        require: id => id === 'ue' ? UE : id === 'puerts' ? { $ref: value => ({ value }), $unref: ref => ref.value } :
            id === './observations' ? observations : { checked: (value, type) => {
                if (!isA(value, type.StaticClass())) throw Error('Wrong native class'); return value;
            } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/pbz-attack-alerts/diagnostics.js'), 'utf8'), context);
    return { logs, tick: () => new mod.exports.CombatProbe().tick({}, player, 1) };
}
test('probe discovers concurrent ticking tasks and records the Duration alias without a current task', () => {
    const f = fixture(); f.tick();
    assert.ok(!f.logs.some(line => /error=|PROBE failed/.test(line)), f.logs.join('\n'));
    assert.ok(f.logs.some(line => line.includes('"field":"Duration"') && line.includes('"starts":[0.3]')));
});
test('probe includes active non-instanced abilities through their spec fallback', () => {
    const f = fixture({ useSpecFallback: true }); f.tick();
    assert.ok(f.logs.some(line => line.includes('PROBE ability source=enemy')));
});
test('one unreadable enemy does not prevent recording another enemy', () => {
    const f = fixture({ malformedFirstActor: true }); f.tick();
    assert.ok(f.logs.some(line => line.includes('actor=bad-enemy error=')));
    assert.ok(f.logs.some(line => line.includes('PROBE ability source=enemy')));
});
