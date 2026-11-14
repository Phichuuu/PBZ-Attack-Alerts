/** Read-only compatibility readers; unavailable timing is never a zero-time hit. */
export function finiteField(value: object, name: string): number | undefined {
    try {
        const result: unknown = Reflect.get(value, name);
        return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
    } catch { return undefined; }
}
export function eventTiming(event: object): { start?: number; duration?: number; end?: number; field: string } {
    const lower = finiteField(event, 'duration');
    const duration = lower ?? finiteField(event, 'Duration');
    const rawStart = finiteField(event, 'StartTime');
    const start = rawStart === undefined ? undefined : rawStart + (finiteField(event, 'TriggerTimeOffset') ?? 0);
    const end = rawStart === undefined || duration === undefined ? undefined :
        rawStart + duration + (finiteField(event, 'EndTriggerTimeOffset') ?? 0);
    return { start, duration, end, field: lower !== undefined ? 'duration' : duration !== undefined ? 'Duration' : 'unavailable' };
}
export function hitTimeStatus(hitTime: number): 'known' | 'sentinel' | 'invalid' {
    if (!Number.isFinite(hitTime)) return 'invalid';
    return Math.abs(hitTime) > 1e30 ? 'sentinel' : 'known';
}
