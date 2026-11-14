// Preserve PuerTS's lazy native-type proxy; namespace interop copies only
// already-enumerable types and loses e.g. GameplayStatics on a cold start.
import UE = require('ue');
import { argv, $ref, $unref } from 'puerts';
import { AlertScheduler, Attack } from './alerts';
import { AlertOverlay, checked } from './overlay';
import { settings } from './settings';
import { CombatProbe } from './diagnostics';
import { hitTimeStatus } from './observations';
import { WindupTracker } from './windup';
import { BodyAnchors } from './anchors';

const prefix = '[PBZMOD] pbz-attack-alerts';
const scheduler = new AlertScheduler();
const overlay = new AlertOverlay();
let timer: ReturnType<typeof setInterval> | undefined;
let world: UE.World | null | undefined;
let player: UE.Pawn | null | undefined;
let component: UE.DeflectComponent | undefined;
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
let probe = new CombatProbe();
let windup = new WindupTracker();
let anchors = new BodyAnchors();
const reported = new Set<string>();
function log(message: string): void { console.log(`${prefix} ${message}`); }
function reset(): void {
    scheduler.reset(); overlay.destroy(); component = undefined;
    player = undefined; world = undefined; lastTime = -1;
    reported.clear(); nextAcquire = 0; nextReport = 0;
    nextUiAttempt = 0; uiFailures = 0; nextDataAttempt = 0; dataFailures = 0;
    selfCheckStarted = -1; selfCheckDone = false;
    probe = new CombatProbe();
    windup = new WindupTracker();
    anchors = new BodyAnchors();
}
export function stop(): void {
    if (timer !== undefined) { clearInterval(timer); timer = undefined; }
    reset(); log('stopped; owned overlay removed');
}
function forceDodge(action: UE.LGAAction | null | undefined): boolean {
    if (!action || !UE.KismetSystemLibrary.IsValid(action)) return false;
    let kind: UE.EDeflectBulletType | undefined;
    if (UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_DurationBulletWithDeflectBase.StaticClass())) {
        kind = checked(action, UE.LGAAction_DurationBulletWithDeflectBase).DeflectBulletType;
    } else if (UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_BulletBurstWithDeflectBase.StaticClass())) {
        kind = checked(action, UE.LGAAction_BulletBurstWithDeflectBase).DeflectType;
    }
    return kind === UE.EDeflectBulletType.PowerAttack || kind === UE.EDeflectBulletType.CantDeflect || kind === UE.EDeflectBulletType.RedEye;
}
function tick(): void {
    const gi = argv.getByName('GameInstance');
    if (!gi || !UE.KismetSystemLibrary.IsValid(gi)) { reset(); return; }
    const nextWorld = gi.GetWorld();
    const nextPlayer = UE.GameplayStatics.GetPlayerPawn(gi, 0);
    if (!nextWorld || !nextPlayer || !UE.KismetSystemLibrary.IsValid(nextPlayer)) { reset(); return; }
    if (nextWorld !== world || nextPlayer !== player) {
        reset(); world = nextWorld; player = nextPlayer;
        log(`world=${UE.GameplayStatics.GetCurrentLevelName(gi, true)} player=${player.GetName()}`);
    }
    const now = UE.GameplayStatics.GetTimeSeconds(gi);
    if (now < lastTime) scheduler.reset();
    lastTime = now;
    if (UE.GameplayStatics.IsGamePaused(gi)) { if (settings.combatProbe) probe.tick(gi, player, now); overlay.hide(); return; }
    const controller = UE.GameplayStatics.GetPlayerController(gi, 0);
    if (!controller || !UE.KismetSystemLibrary.IsValid(controller)) { overlay.hide(); return; }
    if (!component || !UE.KismetSystemLibrary.IsValid(component)) {
        if (now < nextAcquire) return;
        nextAcquire = now + 1;
        const found = player.GetComponentByClass(UE.DeflectComponent.StaticClass());
        if (!found) { if (now >= nextReport) { log('waiting for player DeflectComponent'); nextReport = now + 30; } return; }
        component = checked(found, UE.DeflectComponent);
        log('bound player incoming-attack frames; combat coverage pending in-game validation');
    }
    const attacks: Attack[] = [];
    if (settings.combatProbe) probe.tick(gi, player, now);
    const preparations=settings.earlyWindup ? windup.update(gi,player,now,settings.windupSeconds) : [];
    const sources = new Map<string, UE.Actor>();
    let rawCount = -1;
    const keys = new Set<string>();
    // Collect diagnostics even if the display is not ready. A failed UI must not
    // hide whether ordinary attacks ever enter the native receive-frame map.
    if (now >= nextDataAttempt && dataFailures < 3) {
    try {
    const frames = component.ReceiveFrames;
    rawCount = frames.Num();
    // TMap is sparse: Num() is not a valid upper index bound.
    const count = frames.GetMaxIndex();
    if (count > 4096) throw new Error(`Unexpected receive-frame capacity ${count}`);
    for (let i = 0; i < count; i++) {
        if (!frames.IsValidIndex(i)) continue;
        const id = frames.GetKey(i);
        const frame = frames.Get(id);
        if (!frame || frame.IsHit || !Number.isFinite(frame.HitGameTime)) continue;
        let source: UE.Actor | null | undefined;
        if (frame.SourceAction && UE.KismetSystemLibrary.IsValid(frame.SourceAction)) source = frame.SourceAction.GetAvatarActor();
        if ((!source || !UE.KismetSystemLibrary.IsValid(source)) && frame.Bullet && UE.KismetSystemLibrary.IsValid(frame.Bullet)) source = frame.Bullet.GetOwnerAvatar();
        if (!source || !UE.KismetSystemLibrary.IsValid(source) || UE.KismetMathLibrary.EqualEqual_ObjectObject(source, player)) continue;
        const sourceKey = UE.KismetSystemLibrary.GetPathName(source);
        sources.set(sourceKey, source);
        const attack: Attack = { id, source: sourceKey, hitTime: frame.HitGameTime,
            isDodge: frame.IsDodge, isHit: frame.IsHit, forceRed: forceDodge(frame.SourceAction) };
        attacks.push(attack);
        const key = `${id}:${sourceKey}`;
        keys.add(key);
        if (!reported.has(key)) {
            if(settings.earlyWindup && hitTimeStatus(frame.HitGameTime)==='known') windup.confirm(frame.SourceAction,now,frame.HitGameTime);
            totalFrames++;
            if (samples++ < settings.diagnosticSamples) log(`incoming handle=${id} source=${source.GetName()} timing=${hitTimeStatus(frame.HitGameTime)} lead=${(frame.HitGameTime - now).toFixed(3)} color=${attack.isDodge || attack.forceRed ? 'red' : 'yellow'} action=${frame.SourceAction?.GetClass().GetName() ?? 'bullet'}`);
        }
    }
    reported.clear(); keys.forEach(key => reported.add(key));
    } catch (error) {
        attacks.length = 0; sources.clear(); scheduler.reset();
        dataFailures++; nextDataAttempt = now + 5;
        console.error(`${prefix} attack-data attempt=${dataFailures}/3 ${String(error)}`);
    }
    }
    const flashes = scheduler.update(attacks, now, settings.leadSeconds, settings.flashSeconds);
    if (!overlay.valid && now >= nextUiAttempt && uiFailures < 3) {
        try {
            overlay.create(controller, settings.maxVisible, settings.size);
            log(`overlay attached with world owner=${controller.GetName()}`);
            if (settings.startupCheck && !selfCheckDone) {
                selfCheckStarted = now + settings.startupDelaySeconds; selfCheckDone = true;
                log(`visual self-check scheduled: lower-centre gold/red pulses after ${settings.startupDelaySeconds}s for ${settings.startupSeconds}s; unrelated to enemy attacks`);
            }
        } catch (error) {
            uiFailures++; nextUiAttempt = now + 2;
            console.error(`${prefix} overlay attempt=${uiFailures}/3 ${String(error)}; attack diagnostics continue`);
        }
    }
    if (now >= nextReport) {
        nextReport = now + 10;
        log(`observed=${totalFrames} raw=${rawCount} pending=${attacks.length} flashes=${flashes.length} overlay=${overlay.valid} uiFailures=${uiFailures} dataFailures=${dataFailures} ${overlay.valid ? overlay.describe() : ''}`);
    }
    if (!overlay.valid) return;
    overlay.hide();
    const viewport = UE.WidgetLayoutLibrary.GetViewportSize(gi);
    const dpi = UE.WidgetLayoutLibrary.GetViewportScale(gi);
    const width = viewport.X / Math.max(dpi, 0.01), height = viewport.Y / Math.max(dpi, 0.01);
    let slot = 0;
    const occupied=new Set<string>();
    const project=(source: UE.Actor): {x:number;y:number}=>{
        const point=anchors.point(source,settings.heightOffset);
        const screen=$ref(UE.KismetMathLibrary.MakeVector2D(0,0));
        const visible=UE.WidgetLayoutLibrary.ProjectWorldLocationToWidgetPosition(controller,
            point,screen,false);
        const projected=$unref(screen), margin=settings.size*0.55;
        return {x:visible ? Math.max(margin,Math.min(width-margin,projected.X)) : width/2+slot*90,
            y:visible ? Math.max(margin,Math.min(height-margin,projected.Y)) : height*0.80};
    };
    for (const flash of flashes) {
        if (slot >= settings.maxVisible) break;
        const source = sources.get(flash.source);
        if (!source || !UE.KismetSystemLibrary.IsValid(source)) continue;
        const {x,y}=project(source);
        occupied.add(flash.source);
        overlay.show(slot++, x, y, flash.color, (now - flash.startedAt) / settings.flashSeconds);
        if (displaySamples++ < 10) log(`draw color=${flash.color} xy=${Math.round(x)},${Math.round(y)} lead=${(flash.hitTime - now).toFixed(3)} source=${source.GetName()}`);
    }
    for(const cue of preparations) {
        if(slot>=settings.maxVisible) break;
        if(occupied.has(cue.sourceKey) || !UE.KismetSystemLibrary.IsValid(cue.source)) continue;
        const {x,y}=project(cue.source);
        overlay.prepare(slot++,x,y,cue.color,cue.progress);
        windup.shown(cue.actionKey,now);
        occupied.add(cue.sourceKey);
    }
    if (settings.startupCheck && selfCheckStarted >= 0 && now >= selfCheckStarted && now - selfCheckStarted < settings.startupSeconds && slot === 0) {
        const phase = (now - selfCheckStarted) % 1;
        if (phase < 0.75) {
            overlay.show(0, width / 2 - 120, height * 0.72, 'yellow', 0.2);
            overlay.show(1, width / 2 + 120, height * 0.72, 'red', 0.2);
        }
    }
    if (settings.preview) {
        const phase = now % 2;
        if (phase < settings.flashSeconds) overlay.show(0, width / 2, height / 2, Math.floor(now / 2) % 2 ? 'red' : 'yellow', phase / settings.flashSeconds);
    }
}
log('0.2.3-experimental loaded; higher-contrast yellow at unchanged size; yellow=parry red=dodge; coverage incomplete');
timer = setInterval(() => {
    try { tick(); }
    catch (error) {
        console.error(`${prefix} ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
        // Fail closed on unsupported bindings; never retry an unsafe call every frame.
        stop();
    }
}, settings.pollMilliseconds);
