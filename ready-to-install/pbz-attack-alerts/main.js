"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stop = stop;
// Preserve PuerTS's lazy native-type proxy; namespace interop copies only
// already-enumerable types and loses e.g. GameplayStatics on a cold start.
const UE = require("ue");
const puerts_1 = require("puerts");
const alerts_1 = require("./alerts");
const overlay_1 = require("./overlay");
const settings_1 = require("./settings");
const diagnostics_1 = require("./diagnostics");
const observations_1 = require("./observations");
const windup_1 = require("./windup");
const anchors_1 = require("./anchors");
const prefix = '[PBZMOD] pbz-attack-alerts';
const scheduler = new alerts_1.AlertScheduler();
const overlay = new overlay_1.AlertOverlay();
let timer;
let world;
let player;
let owner;
let component;
let nextAcquire = 0;
let lastTime = -1;
let samples = 0;
let totalFrames = 0;
let nextReport = 0;
let nextUiAttempt = 0;
let uiFailures = 0;
let nextDataAttempt = 0;
let dataFailures = 0;
let selfCheckStarted = -1;
let selfCheckDone = false;
let displaySamples = 0;
let probe = new diagnostics_1.CombatProbe();
let windup = new windup_1.WindupTracker();
let anchors = new anchors_1.BodyAnchors();
const reported = new Set();
let nextTickAt = 0;
let nextLifetimeReport = 0;
function log(message) { console.log(`${prefix} ${message}`); }
function reset() {
    scheduler.reset();
    component = undefined;
    player = undefined;
    world = undefined;
    owner = undefined;
    lastTime = -1;
    reported.clear();
    nextAcquire = 0;
    nextReport = 0;
    nextUiAttempt = 0;
    uiFailures = 0;
    nextDataAttempt = 0;
    dataFailures = 0;
    selfCheckStarted = -1;
    selfCheckDone = false;
    probe = new diagnostics_1.CombatProbe();
    windup = new windup_1.WindupTracker();
    anchors = new anchors_1.BodyAnchors();
    overlay.destroy();
}
function stop() {
    if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
    }
    reset();
    log('stopped; owned overlay removed');
}
function forceDodge(action) {
    if (!(0, overlay_1.isLive)(action))
        return false;
    let kind;
    if (UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_DurationBulletWithDeflectBase.StaticClass())) {
        kind = (0, overlay_1.checked)(action, UE.LGAAction_DurationBulletWithDeflectBase).DeflectBulletType;
    }
    else if (UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_BulletBurstWithDeflectBase.StaticClass())) {
        kind = (0, overlay_1.checked)(action, UE.LGAAction_BulletBurstWithDeflectBase).DeflectType;
    }
    return kind === UE.EDeflectBulletType.PowerAttack || kind === UE.EDeflectBulletType.CantDeflect || kind === UE.EDeflectBulletType.RedEye;
}
function tick() {
    const gi = puerts_1.argv.getByName('GameInstance');
    if (!(0, overlay_1.isLive)(gi)) {
        reset();
        return;
    }
    const nextWorld = gi.GetWorld();
    const nextPlayer = UE.GameplayStatics.GetPlayerPawn(gi, 0);
    if (!(0, overlay_1.isLive)(nextWorld) || !(0, overlay_1.isLive)(nextPlayer)) {
        reset();
        return;
    }
    const controller = UE.GameplayStatics.GetPlayerController(gi, 0);
    if (!(0, overlay_1.isLive)(controller)) {
        reset();
        return;
    }
    const now = UE.GameplayStatics.GetTimeSeconds(gi);
    if (!Number.isFinite(now)) {
        reset();
        return;
    }
    if (nextWorld !== world || nextPlayer !== player || controller !== owner || now < lastTime) {
        reset();
        world = nextWorld;
        player = nextPlayer;
        owner = controller;
        log(`world=${UE.GameplayStatics.GetCurrentLevelName(gi, true)} player=${player.GetName()} controller=${controller.GetName()}; lifecycle rebound`);
    }
    lastTime = now;
    if (UE.GameplayStatics.IsGamePaused(gi)) {
        if (settings_1.settings.combatProbe)
            probe.tick(gi, player, now);
        overlay.hide();
        return;
    }
    if (!(0, overlay_1.isLive)(component)) {
        if (now < nextAcquire)
            return;
        nextAcquire = now + 1;
        const found = player.GetComponentByClass(UE.DeflectComponent.StaticClass());
        if (!(0, overlay_1.isLive)(found)) {
            if (now >= nextReport) {
                log('waiting for player DeflectComponent');
                nextReport = now + 30;
            }
            return;
        }
        component = (0, overlay_1.checked)(found, UE.DeflectComponent);
        log('bound player incoming-attack frames; combat coverage pending in-game validation');
    }
    const attacks = [];
    if (settings_1.settings.combatProbe)
        probe.tick(gi, player, now);
    const preparations = settings_1.settings.earlyWindup ? windup.update(gi, player, now, settings_1.settings.windupSeconds) : [];
    const sources = new Map();
    let rawCount = -1;
    const keys = new Set();
    // Collect diagnostics even if the display is not ready. A failed UI must not
    // hide whether ordinary attacks ever enter the native receive-frame map.
    if (now >= nextDataAttempt && dataFailures < 3) {
        try {
            const frames = component.ReceiveFrames;
            rawCount = frames.Num();
            // TMap is sparse: Num() is not a valid upper index bound.
            const count = frames.GetMaxIndex();
            if (count > 4096)
                throw new Error(`Unexpected receive-frame capacity ${count}`);
            for (let i = 0; i < count; i++) {
                if (!frames.IsValidIndex(i))
                    continue;
                const id = frames.GetKey(i);
                const frame = frames.Get(id);
                if (!frame || frame.IsHit || !Number.isFinite(frame.HitGameTime))
                    continue;
                let source;
                if ((0, overlay_1.isLive)(frame.SourceAction))
                    source = frame.SourceAction.GetAvatarActor();
                if (!(0, overlay_1.isLive)(source) && (0, overlay_1.isLive)(frame.Bullet))
                    source = frame.Bullet.GetOwnerAvatar();
                if (!(0, overlay_1.isLive)(source) || UE.KismetMathLibrary.EqualEqual_ObjectObject(source, player))
                    continue;
                const sourceKey = UE.KismetSystemLibrary.GetPathName(source);
                sources.set(sourceKey, source);
                const attack = { id, source: sourceKey, hitTime: frame.HitGameTime,
                    isDodge: frame.IsDodge, isHit: frame.IsHit, forceRed: forceDodge(frame.SourceAction) };
                attacks.push(attack);
                const key = `${id}:${sourceKey}`;
                keys.add(key);
                if (!reported.has(key)) {
                    if (settings_1.settings.earlyWindup && (0, observations_1.hitTimeStatus)(frame.HitGameTime) === 'known')
                        windup.confirm(frame.SourceAction, now, frame.HitGameTime);
                    totalFrames++;
                    if (samples++ < settings_1.settings.diagnosticSamples)
                        log(`incoming handle=${id} source=${source.GetName()} timing=${(0, observations_1.hitTimeStatus)(frame.HitGameTime)} lead=${(frame.HitGameTime - now).toFixed(3)} color=${attack.isDodge || attack.forceRed ? 'red' : 'yellow'} action=${frame.SourceAction?.GetClass().GetName() ?? 'bullet'}`);
                }
            }
            reported.clear();
            keys.forEach(key => reported.add(key));
        }
        catch (error) {
            if ((0, overlay_1.isReleasedObjectError)(error))
                throw error;
            attacks.length = 0;
            sources.clear();
            scheduler.reset();
            dataFailures++;
            nextDataAttempt = now + 5;
            console.error(`${prefix} attack-data attempt=${dataFailures}/3 ${String(error)}`);
        }
    }
    const flashes = scheduler.update(attacks, now, settings_1.settings.leadSeconds, settings_1.settings.flashSeconds);
    if (!overlay.valid && now >= nextUiAttempt && uiFailures < 3) {
        try {
            overlay.create(controller, settings_1.settings.maxVisible, settings_1.settings.size);
            uiFailures = 0;
            log(`overlay attached with world owner=${controller.GetName()}`);
            if (settings_1.settings.startupCheck && !selfCheckDone) {
                selfCheckStarted = now + settings_1.settings.startupDelaySeconds;
                selfCheckDone = true;
                log(`visual self-check scheduled: lower-centre gold/red pulses after ${settings_1.settings.startupDelaySeconds}s for ${settings_1.settings.startupSeconds}s; unrelated to enemy attacks`);
            }
        }
        catch (error) {
            if ((0, overlay_1.isReleasedObjectError)(error))
                throw error;
            uiFailures++;
            nextUiAttempt = now + 2;
            console.error(`${prefix} overlay attempt=${uiFailures}/3 ${String(error)}; attack diagnostics continue`);
        }
    }
    if (now >= nextReport) {
        nextReport = now + 10;
        log(`observed=${totalFrames} raw=${rawCount} pending=${attacks.length} flashes=${flashes.length} overlay=${overlay.valid} uiFailures=${uiFailures} dataFailures=${dataFailures} ${overlay.valid ? overlay.describe() : ''}`);
    }
    if (!overlay.valid)
        return;
    overlay.hide();
    const viewport = UE.WidgetLayoutLibrary.GetViewportSize(gi);
    const dpi = UE.WidgetLayoutLibrary.GetViewportScale(gi);
    const width = viewport.X / Math.max(dpi, 0.01), height = viewport.Y / Math.max(dpi, 0.01);
    let slot = 0;
    const occupied = new Set();
    const project = (source) => {
        const point = anchors.point(source, settings_1.settings.heightOffset);
        const screen = (0, puerts_1.$ref)(UE.KismetMathLibrary.MakeVector2D(0, 0));
        const visible = UE.WidgetLayoutLibrary.ProjectWorldLocationToWidgetPosition(controller, point, screen, false);
        const projected = (0, puerts_1.$unref)(screen), margin = settings_1.settings.size * 0.55;
        return { x: visible ? Math.max(margin, Math.min(width - margin, projected.X)) : width / 2 + slot * 90,
            y: visible ? Math.max(margin, Math.min(height - margin, projected.Y)) : height * 0.80 };
    };
    for (const flash of flashes) {
        if (slot >= settings_1.settings.maxVisible)
            break;
        const source = sources.get(flash.source);
        if (!(0, overlay_1.isLive)(source))
            continue;
        const { x, y } = project(source);
        occupied.add(flash.source);
        overlay.show(slot++, x, y, flash.color, (now - flash.startedAt) / settings_1.settings.flashSeconds);
        if (displaySamples++ < 10)
            log(`draw color=${flash.color} xy=${Math.round(x)},${Math.round(y)} lead=${(flash.hitTime - now).toFixed(3)} source=${source.GetName()}`);
    }
    for (const cue of preparations) {
        if (slot >= settings_1.settings.maxVisible)
            break;
        if (occupied.has(cue.sourceKey) || !(0, overlay_1.isLive)(cue.source))
            continue;
        const { x, y } = project(cue.source);
        overlay.prepare(slot++, x, y, cue.color, cue.progress);
        windup.shown(cue.actionKey, now);
        occupied.add(cue.sourceKey);
    }
    if (settings_1.settings.startupCheck && selfCheckStarted >= 0 && now >= selfCheckStarted && now - selfCheckStarted < settings_1.settings.startupSeconds && slot === 0) {
        const phase = (now - selfCheckStarted) % 1;
        if (phase < 0.75) {
            overlay.show(0, width / 2 - 120, height * 0.72, 'yellow', 0.2);
            overlay.show(1, width / 2 + 120, height * 0.72, 'red', 0.2);
        }
    }
    if (settings_1.settings.preview) {
        const phase = now % 2;
        if (phase < settings_1.settings.flashSeconds)
            overlay.show(0, width / 2, height / 2, Math.floor(now / 2) % 2 ? 'red' : 'yellow', phase / settings_1.settings.flashSeconds);
    }
}
log('0.2.4-experimental loaded; map-travel lifecycle recovery; yellow=parry red=dodge; coverage incomplete');
timer = setInterval(() => {
    if (Date.now() < nextTickAt)
        return;
    try {
        tick();
    }
    catch (error) {
        if ((0, overlay_1.isReleasedObjectError)(error)) {
            // Loading/GC can invalidate a wrapper between a check and its use.
            // Discard all old-world state and wait in real time (game time may
            // pause or rewind). Keep unknown API failures fail-closed below.
            reset();
            nextTickAt = Date.now() + 1000;
            if (Date.now() >= nextLifetimeReport) {
                log('released native object during transition; waiting to reacquire world/player/controller');
                nextLifetimeReport = Date.now() + 30000;
            }
            return;
        }
        console.error(`${prefix} ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        // Fail closed on unsupported bindings; never retry an unsafe call every frame.
        stop();
    }
}, settings_1.settings.pollMilliseconds);
