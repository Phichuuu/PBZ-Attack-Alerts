"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CombatProbe = void 0;
const UE = require("ue");
const puerts_1 = require("puerts");
const overlay_1 = require("./overlay");
const observations_1 = require("./observations");
function values(list, limit = 512) {
    const count = list.Num();
    if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('Invalid native array count');
    const result = [];
    for (let i = 0; i < Math.min(count, limit); i++)
        result.push(list.Get(i));
    return result;
}
/** Temporary read-only probe for attack sources not visible in ReceiveFrames. */
class CombatProbe {
    constructor() {
        this.actors = [];
        this.nextScan = 0;
        this.seen = new Set();
        this.failed = false;
        this.nextPoll = -1;
    }
    tick(gi, player, now) {
        if (this.failed || now < this.nextPoll || this.seen.size >= 200)
            return;
        this.nextPoll = now + 0.05;
        try {
            if (now >= this.nextScan) {
                this.nextScan = now + 1;
                const out = (0, puerts_1.$ref)(UE.NewArray(UE.Actor));
                UE.GameplayStatics.GetAllActorsOfClass(gi, UE.Pawn.StaticClass(), out);
                const values = (0, puerts_1.$unref)(out), point = player.K2_GetActorLocation();
                this.actors = [];
                for (let i = 0; i < Math.min(values.Num(), 512) && this.actors.length < 32; i++) {
                    const actor = values.Get(i);
                    if (!actor || !UE.KismetSystemLibrary.IsValid(actor) || actor === player)
                        continue;
                    const p = actor.K2_GetActorLocation();
                    if (Math.hypot(p.X - point.X, p.Y - point.Y, p.Z - point.Z) < 2500)
                        this.actors.push(actor);
                }
            }
            const playerDeflect = player.GetComponentByClass(UE.DeflectComponent.StaticClass());
            if (playerDeflect) {
                const map = (0, overlay_1.checked)(playerDeflect, UE.DeflectComponent).ReceiveFrames;
                for (let i = 0; i < Math.min(map.GetMaxIndex(), 512); i++) {
                    if (!map.IsValidIndex(i))
                        continue;
                    const id = map.GetKey(i), frame = map.Get(id);
                    if (!frame)
                        continue;
                    const key = `raw:${id}:${frame.HitGameTime}:${frame.IsHit}`;
                    if (this.seen.has(key))
                        continue;
                    this.seen.add(key);
                    console.log(`[PBZMOD] pbz-attack-alerts PROBE raw id=${id} time=${now} hit=${frame.HitGameTime} timing=${(0, observations_1.hitTimeStatus)(frame.HitGameTime)} isHit=${frame.IsHit} dodge=${frame.IsDodge}`);
                }
            }
            for (const actor of this.actors) {
                if (!UE.KismetSystemLibrary.IsValid(actor))
                    continue;
                try {
                    const obj = actor.GetComponentByClass(UE.DeflectComponent.StaticClass());
                    if (obj) {
                        const map = (0, overlay_1.checked)(obj, UE.DeflectComponent).SendFrames;
                        for (let i = 0; i < Math.min(map.GetMaxIndex(), 512); i++) {
                            if (!map.IsValidIndex(i))
                                continue;
                            const handle = map.GetKey(i), f = map.Get(handle);
                            if (!f)
                                continue;
                            const key = `send:${actor.GetName()}:${handle}`;
                            if (this.seen.has(key))
                                continue;
                            this.seen.add(key);
                            let receives = false;
                            for (let j = 0; j < f.Receivers.Num(); j++)
                                if (f.Receivers.Get(j) === player)
                                    receives = true;
                            console.log(`[PBZMOD] pbz-attack-alerts PROBE send source=${actor.GetName()} id=${handle} lead=${f.HitGameTime - now} timing=${(0, observations_1.hitTimeStatus)(f.HitGameTime)} paused=${f.Paused} player=${receives} dodge=${f.IsDodge} action=${f.SourceAction?.GetClass().GetName()}`);
                        }
                    }
                    const ascObject = actor.GetComponentByClass(UE.AbilitySystemComponent.StaticClass());
                    if (!ascObject)
                        continue;
                    const asc = (0, overlay_1.checked)(ascObject, UE.AbilitySystemComponent);
                    const abilities = new Set();
                    for (const spec of values(asc.ActivatableAbilities.Items)) {
                        if (!spec.ActiveCount)
                            continue;
                        const instances = [...values(spec.NonReplicatedInstances), ...values(spec.ReplicatedInstances)];
                        for (const ability of instances.length ? instances : [spec.Ability])
                            if (ability)
                                abilities.add(ability);
                    }
                    const ticking = values(asc.TickingTasks);
                    for (const task of ticking) {
                        if (!task || !UE.KismetSystemLibrary.IsValid(task) || !UE.GameplayStatics.ObjectIsA(task, UE.AbilityTask.StaticClass()))
                            continue;
                        const ability = (0, overlay_1.checked)(task, UE.AbilityTask).Ability;
                        if (ability)
                            abilities.add(ability);
                    }
                    for (const ability of abilities) {
                        if (!UE.KismetSystemLibrary.IsValid(ability) || ability.bIsActive === false || ability.bIsAbilityEnding || !UE.GameplayStatics.ObjectIsA(ability, UE.LegoAbility.StaticClass()))
                            continue;
                        const candidates = [(0, overlay_1.checked)(ability, UE.LegoAbility).GetPlayTimelineTask(), ...values(ability.ActiveTasks), ...ticking];
                        for (const candidate of candidates) {
                            if (!candidate || !UE.KismetSystemLibrary.IsValid(candidate) || !UE.GameplayStatics.ObjectIsA(candidate, UE.LGATask_PlayTimeline.StaticClass()))
                                continue;
                            const task = (0, overlay_1.checked)(candidate, UE.LGATask_PlayTimeline);
                            if (task.Ability !== ability)
                                continue;
                            if (!task?.Timeline || !UE.KismetSystemLibrary.IsValid(task))
                                continue;
                            const key = `task:${UE.KismetSystemLibrary.GetPathName(task)}:${task.Timeline.GetName()}`;
                            const first = !this.seen.has(key);
                            const groups = [{ role: '', events: task.Timeline.Actions }, ...values(task.Timeline.RoleLayers, 16).map(layer => ({ role: layer.RoleName, events: layer.Actions }))];
                            const details = [];
                            for (const group of groups)
                                for (const event of values(group.events, 128)) {
                                    const action = event.Action;
                                    if (!action || !UE.KismetSystemLibrary.IsValid(action))
                                        continue;
                                    let timing;
                                    if (UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_DurationBulletWithDeflectBase.StaticClass())) {
                                        const attack = (0, overlay_1.checked)(action, UE.LGAAction_DurationBulletWithDeflectBase);
                                        timing = { preHit: attack.PreHitPointDuration, runtimePreHit: attack.RuntimePreHitPointDuration,
                                            sends: values(attack.SendFrameTimes, 32), starts: values(attack.StartBulletTimes, 32), ends: values(attack.EndBulletTimes, 32) };
                                    }
                                    const detail = { role: group.role, action: action.GetClass().GetName(), ...(0, observations_1.eventTiming)(event),
                                        deflect: (0, observations_1.finiteField)(action, 'DeflectBulletType') ?? (0, observations_1.finiteField)(action, 'DeflectType') ?? (0, observations_1.finiteField)(action, 'Deflect Bullet Type'), timing };
                                    details.push(detail);
                                    if (detail.deflect !== undefined || timing) {
                                        const encoded = JSON.stringify(detail);
                                        const eventKey = key + ':' + action.GetName() + ':' + encoded;
                                        if (!this.seen.has(eventKey) && this.seen.size < 200) {
                                            this.seen.add(eventKey);
                                            console.log(`[PBZMOD] pbz-attack-alerts PROBE attack source=${actor.GetName()} ability=${ability.GetClass().GetName()} cursor=${task.CurrentTime.toFixed(3)} game=${now.toFixed(3)} data=${encoded}`);
                                        }
                                    }
                                }
                            if (first) {
                                this.seen.add(key);
                                console.log(`[PBZMOD] pbz-attack-alerts PROBE ability source=${actor.GetName()} ability=${ability.GetName()} time=${task.CurrentTime} timeline=${task.Timeline.GetName()} events=${details.length}`);
                            }
                        }
                    }
                }
                catch (error) {
                    const key = `error:${actor.GetName()}`;
                    if (!this.seen.has(key)) {
                        this.seen.add(key);
                        console.error(`[PBZMOD] pbz-attack-alerts PROBE actor=${actor.GetName()} error=${String(error)}`);
                    }
                }
            }
        }
        catch (error) {
            this.failed = true;
            console.error(`[PBZMOD] pbz-attack-alerts PROBE failed ${String(error)}`);
        }
    }
}
exports.CombatProbe = CombatProbe;
