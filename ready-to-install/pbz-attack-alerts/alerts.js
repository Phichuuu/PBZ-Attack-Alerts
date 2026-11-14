"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertScheduler = void 0;
/** Native state is read by main.ts and never changed here. */
class AlertScheduler {
    constructor() {
        this.seen = new Map();
        this.active = new Map();
    }
    reset() { this.seen.clear(); this.active.clear(); }
    update(attacks, now, lead, duration) {
        const present = new Set();
        for (const attack of attacks) {
            if (!Number.isFinite(attack.hitTime) || !Number.isFinite(now) || attack.isHit)
                continue;
            present.add(attack.id);
            let state = this.seen.get(attack.id);
            if (!state || state.source !== attack.source || Math.abs(state.hitTime - attack.hitTime) > 0.12) {
                state = { source: attack.source, hitTime: attack.hitTime, fired: false };
                this.seen.set(attack.id, state);
                this.active.delete(attack.id);
            }
            const remaining = attack.hitTime - now;
            if (!state.fired && remaining >= 0 && remaining <= lead) {
                state.fired = true;
                this.active.set(attack.id, { id: attack.id, source: attack.source,
                    color: attack.isDodge || attack.forceRed ? 'red' : 'yellow', startedAt: now, hitTime: attack.hitTime });
            }
            const flash = this.active.get(attack.id);
            if (flash && (attack.isDodge || attack.forceRed))
                flash.color = 'red';
        }
        for (const id of this.seen.keys())
            if (!present.has(id))
                this.seen.delete(id);
        for (const [id, flash] of this.active) {
            if (!present.has(id) || now - flash.startedAt >= duration || now > flash.hitTime)
                this.active.delete(id);
        }
        const grouped = new Map();
        for (const flash of this.active.values()) {
            const previous = grouped.get(flash.source);
            if (!previous || (flash.color === 'red' && previous.color !== 'red') ||
                (flash.color === previous.color && flash.hitTime < previous.hitTime))
                grouped.set(flash.source, flash);
        }
        return [...grouped.values()].sort((a, b) => a.hitTime - b.hitTime);
    }
}
exports.AlertScheduler = AlertScheduler;
