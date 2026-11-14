export type AlertColor = 'yellow' | 'red';
export interface Attack {
    id: number; source: string; hitTime: number;
    isDodge: boolean; isHit: boolean; forceRed: boolean;
}
export interface Flash {
    id: number; source: string; color: AlertColor; startedAt: number; hitTime: number;
}
/** Native state is read by main.ts and never changed here. */
export class AlertScheduler {
    private seen = new Map<number, { source: string; hitTime: number; fired: boolean }>();
    private active = new Map<number, Flash>();
    reset(): void { this.seen.clear(); this.active.clear(); }
    update(attacks: Attack[], now: number, lead: number, duration: number): Flash[] {
        const present = new Set<number>();
        for (const attack of attacks) {
            if (!Number.isFinite(attack.hitTime) || !Number.isFinite(now) || attack.isHit) continue;
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
            if (flash && (attack.isDodge || attack.forceRed)) flash.color = 'red';
        }
        for (const id of this.seen.keys()) if (!present.has(id)) this.seen.delete(id);
        for (const [id, flash] of this.active) {
            if (!present.has(id) || now - flash.startedAt >= duration || now > flash.hitTime) this.active.delete(id);
        }
        const grouped = new Map<string, Flash>();
        for (const flash of this.active.values()) {
            const previous = grouped.get(flash.source);
            if (!previous || (flash.color === 'red' && previous.color !== 'red') ||
                (flash.color === previous.color && flash.hitTime < previous.hitTime)) grouped.set(flash.source, flash);
        }
        return [...grouped.values()].sort((a, b) => a.hitTime - b.hitTime);
    }
}
