const { test } = require('node:test');
const assert = require('node:assert/strict');
const { eventTiming, hitTimeStatus } = require('../dist/pbz-attack-alerts/observations');

test('native uppercase Duration is retained when the SDK lowercase property is absent', () => {
    const event = { StartTime: 1, Duration: 0.4, TriggerTimeOffset: 0.1, EndTriggerTimeOffset: 0.2 };
    const timing = eventTiming(event);
    assert.equal(timing.field, 'Duration');
    assert.equal(timing.start, 1.1);
    assert.ok(Math.abs(timing.end - 1.6) < 1e-10);
});
test('zero-duration point events stay zero, even when an alternative field differs', () => {
    const timing = eventTiming({ StartTime: 2, duration: 0, Duration: 1 });
    assert.equal(timing.duration, 0);
    assert.equal(timing.end, 2);
});
test('missing or inaccessible duration does not become a fabricated timestamp', () => {
    const event = { StartTime: 1, get duration() { throw Error('binding unavailable'); } };
    assert.deepEqual(eventTiming(event), { start: 1, duration: undefined, end: undefined, field: 'unavailable' });
    assert.equal(eventTiming({ duration: 0.2 }).start, undefined);
});
test('observed projectile float sentinel is distinguished from valid clock values', () => {
    assert.equal(hitTimeStatus(-3.3999999521443642e38), 'sentinel');
    assert.equal(hitTimeStatus(123.4), 'known');
    assert.equal(hitTimeStatus(NaN), 'invalid');
});
