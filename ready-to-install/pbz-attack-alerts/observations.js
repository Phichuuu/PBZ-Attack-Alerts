"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finiteField = finiteField;
exports.eventTiming = eventTiming;
exports.hitTimeStatus = hitTimeStatus;
/** Read-only compatibility readers; unavailable timing is never a zero-time hit. */
function finiteField(value, name) {
    try {
        const result = Reflect.get(value, name);
        return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
    }
    catch {
        return undefined;
    }
}
function eventTiming(event) {
    const lower = finiteField(event, 'duration');
    const duration = lower ?? finiteField(event, 'Duration');
    const rawStart = finiteField(event, 'StartTime');
    const start = rawStart === undefined ? undefined : rawStart + (finiteField(event, 'TriggerTimeOffset') ?? 0);
    const end = rawStart === undefined || duration === undefined ? undefined :
        rawStart + duration + (finiteField(event, 'EndTriggerTimeOffset') ?? 0);
    return { start, duration, end, field: lower !== undefined ? 'duration' : duration !== undefined ? 'Duration' : 'unavailable' };
}
function hitTimeStatus(hitTime) {
    if (!Number.isFinite(hitTime))
        return 'invalid';
    return Math.abs(hitTime) > 1e30 ? 'sentinel' : 'known';
}
