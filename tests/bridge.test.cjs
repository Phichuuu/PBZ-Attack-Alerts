const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// PuerTS resolves native types lazily. They are available via property access
// without appearing in Object.getOwnPropertyNames(require('ue')).
function runtime({ rejectViewport = false } = {}) {
    const logs = [], callbacks = new Set(), instances = [], attached = new Set();
    let player = null, now = 1, wallNow = 1000, readFailure, removeFailure;
    let world = {}, controllerId = 0;
    const released = new WeakSet();
    const gi = { GetWorld: () => world };
    const newController = () => {
        const ownWorld = world, name = `controller-${++controllerId}`;
        return { GetWorld: () => ownWorld, GetName: () => name };
    };
    let controller = newController();
    const natives = {};
    function make(cls, values = {}) { return { cls, GetName: () => cls.name, ...values }; }
    function register(name, factory = () => ({})) {
        const cls = { name, GetName: () => name };
        return natives[name] = { StaticClass: () => cls, factory: outer => {
            const value = make(cls, { ...factory(), outer,
                GetOuter: () => outer, GetWorld: () => outer?.GetWorld?.() });
            instances.push(value); return value;
        } };
    }
    register('DeflectComponent'); register('LGAAction_DurationBulletWithDeflectBase');
    register('LGAAction_BulletBurstWithDeflectBase');
    const slot = () => ({ SetSize() {}, SetAlignment() {}, SetPosition() {} });
    const widget = () => ({ GetCachedGeometry: () => ({}), SetVisibility() {}, SetRenderTransformPivot() {}, SetRenderOpacity(value) { this.opacity = value; },
        SetRenderScale() {}, SetRenderTransformAngle() {}, RemoveFromParent() {} });
    register('CanvasPanel', () => ({ ...widget(), AddChildToCanvas: slot }));
    register('Border', () => ({ ...widget(), Background: {}, SetBrush() {}, SetBrushColor() {} }));
    register('Image', () => ({ ...widget(), SetBrushFromTexture() {}, SetColorAndOpacity() {} }));
    register('Texture2D');
    const viewportType = register('GameViewportSubsystem');
    const viewport = make(viewportType.StaticClass(), {
        GetWidgetSlot: () => ({ Anchors: {}, Offsets: {} }),
        AddWidget(value) {
            if (rejectViewport || !value.GetWorld()) return false;
            attached.add(value); return true;
        },
        IsWidgetAdded: value => attached.has(value), RemoveWidget(value) {
            attached.delete(value);
            if (removeFailure) throw new Error(removeFailure);
        },
    });
    Object.assign(natives, {
        SubsystemBlueprintLibrary: { GetEngineSubsystem: () => viewport },
        SlateBlueprintLibrary: { GetLocalSize: () => ({ X: 1280, Y: 720 }) },
        NewObject: cls => natives[cls.name].factory(),
        BuiltinByte: 1, NewArray: () => ({ Add() {} }),
        KismetRenderingLibrary: { ImportBufferAsTexture2D: owner => natives.Texture2D.factory(owner) },
        GameplayStatics: { GetPlayerPawn: () => {
                if (readFailure) { const error = readFailure; readFailure = undefined; throw new Error(error); }
                return player;
            }, GetCurrentLevelName: () => 'test',
            SpawnObject: (cls, outer) => natives[cls.name].factory(outer),
            GetTimeSeconds: () => now, IsGamePaused: () => false, GetPlayerController: () => controller,
            ObjectIsA: (value, cls) => value?.cls === cls },
        KismetSystemLibrary: { IsValid: value => {
                // PuerTS can throw before IsValid reaches Unreal for a released wrapper.
                if (value && released.has(value)) throw new Error('passing a invalid object');
                return value != null;
            }, GetPathName: value => value.GetName() },
        KismetMathLibrary: { MakeVector2D: (X, Y) => ({ X, Y }), MakeColor: (R, G, B, A) => ({ R, G, B, A }),
            EqualEqual_ObjectObject: (a, b) => a === b },
        WidgetLayoutLibrary: { GetViewportSize: () => ({ X: 1280, Y: 720 }), GetViewportScale: () => 1,
            ProjectWorldLocationToWidgetPosition: (_c, _p, out) => { out.value = { X: 640, Y: 300 }; return true; } },
        ESlateVisibility: { HitTestInvisible: 3 }, ESlateBrushDrawType: { Image: 1 },
        EDeflectBulletType: { CantDeflect: 0, Normal: 1, BlueEye: 2, RedEye: 3, PowerAttack: 4 },
        Vector: function (X, Y, Z) { Object.assign(this, { X, Y, Z }); },
    });
    const bridge = new Proxy({ KismetSystemLibrary: natives.KismetSystemLibrary }, {
        get: (target, key) => Object.hasOwn(target, key) ? target[key] : natives[key],
    });
    const puerts = { argv: { getByName: () => gi }, $ref: value => ({ value }), $unref: ref => ref.value };
    const cache = new Map();
    function load(name) {
        if (cache.has(name)) return cache.get(name).exports;
        const mod = { exports: {} }; cache.set(name, mod);
        const file = path.resolve(__dirname, '../dist/pbz-attack-alerts', name + '.js');
        const context = { module: mod, exports: mod.exports,
            require: id => id === 'ue' ? bridge : id === 'puerts' ? puerts : load(id.replace(/^\.\//, '')),
            console: { log: line => logs.push(line), error: line => logs.push(line) },
            Date: class extends Date { static now() { return wallNow; } },
            setInterval: callback => { callbacks.add(callback); return callback; }, clearInterval: handle => callbacks.delete(handle) };
        vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
        return mod.exports;
    }
    // This harness exercises rendering/receive frames; diagnostics have separate fixtures.
    load('settings').settings.combatProbe = false;
    load('settings').settings.earlyWindup = false;
    return { load, logs, attached, callbacks, instances, get controller() { return controller; },
        advance: seconds => { now += seconds; wallNow += seconds * 1000; },
        setTime: seconds => { now = seconds; },
        failNextRead: message => { readFailure = message; },
        failRemoval: message => { removeFailure = message; },
        setRejectViewport: value => { rejectViewport = value; },
        replaceController: () => { controller = newController(); },
        releaseWidgets: () => { instances.forEach(value => released.add(value)); attached.clear(); },
        beginTravel() {
            instances.forEach(value => released.add(value)); attached.clear();
            player = null; controller = null; world = null;
        },
        tick: () => [...callbacks].forEach(callback => callback()),
        enterCombat() {
            if (!world) { world = {}; controller = newController(); now = 1; }
            const source = { GetName: () => 'enemy', K2_GetActorLocation: () => ({ X: 0, Y: 0, Z: 0 }) };
            const action = { GetAvatarActor: () => source, GetClass: () => ({ GetName: () => 'test-action' }) };
            // A sparse slot beyond Num() verifies the native TMap iteration path.
            const frame = { SourceAction: action, HitGameTime: now + .2, IsDodge: false, IsHit: false };
            const frames = { Num: () => 1, GetMaxIndex: () => 5, IsValidIndex: i => i === 4, GetKey: () => 9, Get: () => frame };
            const component = make(natives.DeflectComponent.StaticClass(), { ReceiveFrames: frames });
            player = { GetName: () => 'player', GetComponentByClass: () => component };
        },
    };
}

test('compiled mod preserves lazy UE type access when starting in the menu', () => {
    const r = runtime(); const mod = r.load('main'); r.tick();
    assert.ok(!r.logs.some(line => line.includes('TypeError')), r.logs.join('\n'));
    assert.equal(r.callbacks.size, 1, 'the mod must keep waiting for the player');
    mod.stop(); assert.equal(r.callbacks.size, 0);
});
test('overlay can access cold native classes and cleans up only owned widgets', () => {
    const r = runtime(); const { AlertOverlay } = r.load('overlay'); const overlay = new AlertOverlay();
    overlay.create(r.controller, 2, 86); assert.equal(r.attached.size, 1);
    overlay.show(0, 640, 300, 'yellow', 0); overlay.hide(); overlay.destroy();
    assert.equal(r.attached.size, 0);
});
test('compiled mod reaches a visible flash from sparse incoming frames and stops cleanly', () => {
    const r = runtime(); r.load('settings').settings.startupCheck = false;
    r.enterCombat(); const mod = r.load('main'); r.tick();
    assert.ok(!r.logs.some(line => line.includes('Error')), r.logs.join('\n'));
    assert.ok(r.logs.some(line => line.includes('incoming handle=9')));
    assert.ok(r.logs.some(line => line.includes('draw color=yellow')));
    assert.ok(r.instances.some(value => value.cls.name === 'CanvasPanel' && value.opacity > 0));
    mod.stop(); mod.stop(); assert.equal(r.attached.size, 0); assert.equal(r.callbacks.size, 0);
});

test('all generated widgets inherit the owning controller world', () => {
    const r = runtime(); const { AlertOverlay } = r.load('overlay'); const overlay = new AlertOverlay();
    overlay.create(r.controller, 2, 86);
    assert.ok(r.instances.length > 0);
    for (const instance of r.instances) assert.equal(instance.GetWorld(), r.controller.GetWorld());
    overlay.destroy();
});

test('viewport rejection preserves attack diagnostics and stops after three UI attempts', () => {
    const r = runtime({ rejectViewport: true }); r.enterCombat(); const mod = r.load('main');
    for (let i = 0; i < 7; i++) { r.tick(); r.advance(2); }
    assert.ok(r.logs.some(line => line.includes('incoming handle=9')));
    assert.equal(r.logs.filter(line => line.includes('overlay attempt=')).length, 3);
    assert.equal(r.callbacks.size, 1);
    assert.equal(r.attached.size, 0);
    mod.stop();
});

test('released overlay wrappers cannot interrupt idempotent cleanup', () => {
    const r = runtime(); const { AlertOverlay } = r.load('overlay'); const overlay = new AlertOverlay();
    overlay.create(r.controller, 1, 154); r.releaseWidgets();
    assert.equal(overlay.valid, false);
    assert.doesNotThrow(() => overlay.destroy());
    assert.equal(overlay.valid, false); assert.doesNotThrow(() => overlay.destroy());
    overlay.create(r.controller, 1, 154); assert.equal(overlay.valid, true);
    overlay.destroy();
});

test('native removal failure releases JS references and allows the next overlay', () => {
    const r = runtime(); const { AlertOverlay } = r.load('overlay'); const overlay = new AlertOverlay();
    overlay.create(r.controller, 1, 154); r.failRemoval('passing a invalid object');
    assert.doesNotThrow(() => overlay.destroy()); assert.equal(overlay.valid, false);
    r.failRemoval(undefined); overlay.create(r.controller, 1, 154); assert.equal(overlay.valid, true);
    overlay.destroy();
});

test('map travel through released widgets and no pawn resumes visible attack alerts', () => {
    const r = runtime(); r.enterCombat(); const mod = r.load('main'); r.tick();
    assert.equal(r.logs.filter(line => line.includes('draw color=yellow')).length, 1);
    for (let trip=0;trip<3;trip++) {
        r.beginTravel(); assert.doesNotThrow(() => r.tick()); r.tick();
        assert.equal(r.callbacks.size, 1, 'loading must not stop polling');
        assert.equal(r.attached.size, 0);
        r.enterCombat(); r.tick();
        assert.equal(r.attached.size, 1);
        assert.equal(r.logs.filter(line => line.includes('draw color=yellow')).length, trip+2);
    }
    mod.stop(); assert.equal(r.callbacks.size, 0);
});

test('a replaced controller rebuilds widgets even when world and pawn are unchanged', () => {
    const r = runtime(); r.enterCombat(); const mod = r.load('main'); r.tick();
    const old = [...r.attached][0]; r.replaceController(); r.tick();
    assert.equal(r.attached.size, 1); const root = [...r.attached][0];
    assert.notEqual(root, old); assert.equal(root.GetOuter(), r.controller);
    mod.stop();
});

test('game-clock rewind clears lifecycle state and retries exhausted UI setup', () => {
    const r = runtime({ rejectViewport: true }); r.enterCombat(); const mod = r.load('main');
    for (let i=0;i<3;i++) { r.tick(); r.advance(2); }
    assert.equal(r.attached.size, 0);
    r.setRejectViewport(false); r.setTime(.1); r.tick();
    assert.equal(r.attached.size, 1); mod.stop();
});

test('transient released-object errors back off and reacquire without stopping', () => {
    const r = runtime(); r.enterCombat(); const mod = r.load('main'); r.tick();
    r.failNextRead('passing a invalid object'); r.tick();
    assert.equal(r.callbacks.size, 1); assert.equal(r.attached.size, 0);
    r.tick(); assert.equal(r.attached.size, 0, 'must not retry a native failure every frame');
    r.advance(1.1); r.enterCombat(); r.tick();
    assert.equal(r.attached.size, 1);
    assert.equal(r.logs.filter(line => line.includes('draw color=yellow')).length, 2);
    mod.stop();
});

test('unknown binding failures still stop rather than repeatedly calling unsupported APIs', () => {
    const r = runtime(); r.enterCombat(); const mod = r.load('main'); r.tick();
    r.failNextRead('unsupported native binding'); r.tick();
    assert.equal(r.callbacks.size, 0); assert.equal(r.attached.size, 0);
    mod.stop();
});
