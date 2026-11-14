"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindupTracker = void 0;
const UE = require("ue");
const puerts_1 = require("puerts");
const overlay_1 = require("./overlay");
const observations_1 = require("./observations");
function values(list, limit = 512) {
    const count = list.Num();
    if (!Number.isSafeInteger(count) || count < 0)
        throw Error('Invalid native array');
    const out = [];
    for (let i = 0; i < Math.min(count, limit); i++)
        out.push(list.Get(i));
    return out;
}
function valid(value) {
    return !!value && UE.KismetSystemLibrary.IsValid(value);
}
/** An intent cue before a native attack node. It is NOT an estimated impact. */
class WindupTracker {
    constructor() {
        this.actors = [];
        this.nextScan = 0;
        this.nextPoll = 0;
        this.result = [];
        this.clocks = new Map();
        this.cues = new Map();
        this.errors = new Set();
        this.confirmedSamples = 0;
        this.shownSamples = 0;
    }
    update(gi, player, now, lead) {
        if (now < this.nextPoll)
            return this.result;
        this.nextPoll = now + 0.025;
        this.result = [];
        const liveTasks = new Set();
        try {
            if (now >= this.nextScan) {
                this.nextScan = now + 0.5;
                const out = (0, puerts_1.$ref)(UE.NewArray(UE.Pawn));
                UE.GameplayStatics.GetAllActorsOfClass(gi, UE.Pawn.StaticClass(), out);
                const point = player.K2_GetActorLocation();
                this.actors = values((0, puerts_1.$unref)(out)).filter((actor) => {
                    try {
                        if (!valid(actor) || actor === player)
                            return false;
                        const p = actor.K2_GetActorLocation();
                        return Math.hypot(p.X - point.X, p.Y - point.Y, p.Z - point.Z) < 1800;
                    }
                    catch {
                        return false;
                    } // One despawned pawn must not abort the scan.
                }).slice(0, 32);
            }
            for (const actor of this.actors) {
                if (!valid(actor))
                    continue;
                const actorKey = UE.KismetSystemLibrary.GetPathName(actor);
                try {
                    // Require an explicit AI target and close frontal range. Nearby idle,
                    // friendly, rear-facing and off-target abilities are not prewarned.
                    const controller = actor.Controller;
                    if (!valid(controller) || !UE.GameplayStatics.ObjectIsA(controller, UE.AIController.StaticClass()))
                        continue;
                    const target = (0, puerts_1.$ref)(null);
                    if (!UE.SGameAIFunctionLibrary.GetTargetActor((0, overlay_1.checked)(controller, UE.AIController), target) || (0, puerts_1.$unref)(target) !== player)
                        continue;
                    const p = player.K2_GetActorLocation(), a = actor.K2_GetActorLocation();
                    const dx = p.X - a.X, dy = p.Y - a.Y, distance = Math.hypot(dx, dy);
                    const forward = actor.GetActorForwardVector();
                    if (distance > 650 || Math.abs(p.Z - a.Z) > 220 || (distance > 60 && (forward.X * dx + forward.Y * dy) / distance < 0.15))
                        continue;
                    const object = actor.GetComponentByClass(UE.AbilitySystemComponent.StaticClass());
                    if (!valid(object))
                        continue;
                    const asc = (0, overlay_1.checked)(object, UE.AbilitySystemComponent);
                    const abilities = new Set();
                    const ticking = values(asc.TickingTasks);
                    for (const spec of values(asc.ActivatableAbilities.Items)) {
                        if (!spec.ActiveCount)
                            continue;
                        const instances = [...values(spec.NonReplicatedInstances), ...values(spec.ReplicatedInstances)];
                        for (const ability of instances.length ? instances : [spec.Ability])
                            if (valid(ability))
                                abilities.add(ability);
                    }
                    for (const task of ticking)
                        if (valid(task) && UE.GameplayStatics.ObjectIsA(task, UE.AbilityTask.StaticClass())) {
                            const ability = (0, overlay_1.checked)(task, UE.AbilityTask).Ability;
                            if (valid(ability))
                                abilities.add(ability);
                        }
                    for (const ability of abilities) {
                        if (!valid(ability) || ability.bIsActive === false || ability.bIsAbilityEnding || !UE.GameplayStatics.ObjectIsA(ability, UE.LegoAbility.StaticClass()))
                            continue;
                        const tasks = new Set([(0, overlay_1.checked)(ability, UE.LegoAbility).GetPlayTimelineTask(), ...values(ability.ActiveTasks), ...ticking]);
                        for (const candidate of tasks) {
                            if (!valid(candidate) || !UE.GameplayStatics.ObjectIsA(candidate, UE.LGATask_PlayTimeline.StaticClass()))
                                continue;
                            const task = (0, overlay_1.checked)(candidate, UE.LGATask_PlayTimeline), timeline = task.Timeline;
                            if (task.Ability !== ability || !valid(timeline))
                                continue;
                            const key = UE.KismetSystemLibrary.GetPathName(task), cursor = task.CurrentTime;
                            if (!Number.isFinite(cursor))
                                continue;
                            liveTasks.add(key);
                            const old = this.clocks.get(key);
                            const rate = old && now > old.time && cursor >= old.cursor ? (cursor - old.cursor) / (now - old.time) : 1;
                            this.clocks.set(key, { time: now, cursor, rate });
                            if (rate < 0.05 || rate > 4)
                                continue;
                            for (const event of values(timeline.Actions, 128)) {
                                const action = event.Action, start = (0, observations_1.eventTiming)(event).start;
                                if (!valid(action) || start === undefined || !UE.GameplayStatics.ObjectIsA(action, UE.LGAAction_DurationBulletWithDeflectBase.StaticClass()))
                                    continue;
                                const remaining = (start - cursor) / rate;
                                if (remaining > lead || remaining < -0.10)
                                    continue;
                                const tags = UE.BlueprintGameplayTagLibrary, req = action.ActivationRequirements;
                                const iface = tags.Conv_ObjectToGameplayTagAssetInterface(asc);
                                if (!iface || !tags.HasAllMatchingGameplayTags(iface, req.RequireTags) || tags.HasAnyMatchingGameplayTags(iface, req.IgnoreTags) ||
                                    (!tags.IsTagQueryEmpty(req.TagQuery) && !tags.DoesContainerMatchTagQuery(tags.GetOwnedGameplayTags(iface), req.TagQuery)))
                                    continue;
                                const kind = (0, overlay_1.checked)(action, UE.LGAAction_DurationBulletWithDeflectBase).DeflectBulletType;
                                if (![0, 1, 2, 3, 4, 5].includes(kind))
                                    continue;
                                const actionKey = UE.KismetSystemLibrary.GetPathName(action);
                                let cue = this.cues.get(actionKey);
                                if (!cue || now - cue.last > 0.5) {
                                    cue = { last: now, confirmed: false };
                                    this.cues.set(actionKey, cue);
                                }
                                cue.last = now;
                                if (cue.confirmed)
                                    continue;
                                this.result.push({ source: actor, sourceKey: actorKey, actionKey,
                                    color: kind === 0 || kind === 3 || kind === 4 ? 'red' : 'yellow', progress: 1 - Math.max(0, remaining) / lead });
                            }
                        }
                    }
                }
                catch (error) {
                    if (!this.errors.has(actorKey)) {
                        this.errors.add(actorKey);
                        console.error(`[PBZMOD] pbz-attack-alerts windup actor=${actor.GetName()} unavailable=${String(error)}`);
                    }
                }
            }
        }
        catch (error) {
            if (!this.errors.has('scan')) {
                this.errors.add('scan');
                console.error(`[PBZMOD] pbz-attack-alerts windup scan unavailable=${String(error)}`);
            }
        }
        for (const key of this.clocks.keys())
            if (!liveTasks.has(key))
                this.clocks.delete(key);
        for (const [key, cue] of this.cues)
            if (now - cue.last > 3)
                this.cues.delete(key);
        return this.result;
    }
    confirm(action, now, hitTime) {
        if (!valid(action))
            return;
        const cue = this.cues.get(UE.KismetSystemLibrary.GetPathName(action));
        if (!cue || cue.confirmed || now - cue.last > 0.5)
            return;
        cue.confirmed = true;
        if (cue.first !== undefined && this.confirmedSamples++ < 30)
            console.log(`[PBZMOD] pbz-attack-alerts windup confirmed advance=${(now - cue.first).toFixed(3)} totalLead=${(hitTime - cue.first).toFixed(3)}`);
    }
    shown(actionKey, now) {
        const cue = this.cues.get(actionKey);
        if (cue && cue.first === undefined) {
            cue.first = now;
            if (this.shownSamples++ < 30)
                console.log(`[PBZMOD] pbz-attack-alerts windup shown time=${now.toFixed(3)} action=${actionKey}`);
        }
    }
}
exports.WindupTracker = WindupTracker;
