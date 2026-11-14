const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AlertScheduler } = require('../dist/pbz-attack-alerts/alerts.js');
const attack = (overrides = {}) => ({ id: 1, source: 'enemy-a', hitTime: 1,
    isDodge: false, isHit: false, forceRed: false, ...overrides });
const run = (s, frames, now) => s.update(frames, now, 0.28, 0.22);

test('ordinary parryable attacks warn before impact, not on animation start', () => {
    const s = new AlertScheduler();
    assert.deepEqual(run(s, [attack()], 0.5), []);
    assert.equal(run(s, [attack()], 0.75)[0].color, 'yellow');
});
test('dodge and power attacks are red', () => {
    for (const modifier of [{ isDodge: true }, { forceRed: true }]) {
        assert.equal(run(new AlertScheduler(), [attack(modifier)], 0.75)[0].color, 'red');
    }
});
test('the same attack cannot flash twice after its flash expires', () => {
    const s = new AlertScheduler();
    run(s, [attack()], 0.73);
    assert.deepEqual(run(s, [attack()], 0.96), []);
    assert.deepEqual(run(s, [attack()], 0.98), []);
});
test('cancelled and consumed attacks disappear immediately', () => {
    for (const remaining of [[], [attack({ isHit: true })]]) {
        const s = new AlertScheduler(); run(s, [attack()], 0.75);
        assert.deepEqual(run(s, remaining, 0.8), []);
    }
});
test('new attack IDs in a combo can each flash', () => {
    const s = new AlertScheduler(); run(s, [attack()], 0.75);
    const next = run(s, [attack({ id: 2, hitTime: 1.2 })], 0.95);
    assert.equal(next[0].id, 2);
});
test('a reused frame handle does not suppress a new strike', () => {
    const s = new AlertScheduler(); run(s, [attack()], 0.75);
    assert.equal(run(s, [attack({ hitTime: 1.3 })], 1.1)[0].startedAt, 1.1);
});
test('simultaneous attackers remain separate and ordered by impact', () => {
    const result = run(new AlertScheduler(), [attack({ hitTime: 1.1 }), attack({ id: 2, source: 'enemy-b' })], 0.85);
    assert.deepEqual(result.map(f => f.source), ['enemy-b', 'enemy-a']);
});
test('same-enemy overlapping red and yellow attacks show red', () => {
    const result = run(new AlertScheduler(), [attack(), attack({ id: 2, hitTime: 1.05, isDodge: true })], 0.8);
    assert.equal(result.length, 1); assert.equal(result[0].color, 'red');
});
test('late and nonfinite timestamps do not produce misleading warnings', () => {
    for (const time of [0, NaN, Infinity]) assert.deepEqual(run(new AlertScheduler(), [attack({ hitTime: time })], 0.8), []);
});
test('time remaining scales with the game clock; pause does not restart flashes', () => {
    const s = new AlertScheduler(); const before = run(s, [attack()], 0.75);
    assert.deepEqual(run(s, [attack()], 0.75), before);
});
test('reset clears state for map changes and hot reload', () => {
    const s = new AlertScheduler(); run(s, [attack()], 0.73);
    s.reset(); assert.equal(run(s, [attack()], 0.9)[0].startedAt, 0.9);
});
