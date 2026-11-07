// Run with: node --test tests/*.test.js   (Node 18 or later; no dependencies, no build step)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { STATES, EVENTS, transition, view } = require('../form-state.js');

const ALL_STATES = ['idle', 'submitting', 'sent', 'failed'];
const ALL_EVENTS = ['submit', 'succeeded', 'failed', 'reset'];
const LEGAL = [
  ['idle', 'submit', 'submitting'],
  ['failed', 'submit', 'submitting'],
  ['submitting', 'succeeded', 'sent'],
  ['submitting', 'failed', 'failed'],
  ['sent', 'reset', 'idle']
];

test('the named states and events are exactly these', () => {
  assert.deepStrictEqual(Object.values(STATES), ALL_STATES);
  assert.deepStrictEqual(Object.values(EVENTS), ALL_EVENTS);
});

for (const [from, event, to] of LEGAL) {
  test(`legal: ${from} --${event}--> ${to}`, () => {
    assert.strictEqual(transition(from, event), to);
  });
}

for (const from of ALL_STATES) {
  for (const event of ALL_EVENTS) {
    if (LEGAL.some(([f, e]) => f === from && e === event)) continue;
    test(`illegal: ${from} refuses ${event}`, () => {
      assert.strictEqual(transition(from, event), null);
    });
  }
}

test('the legal and illegal lists cover all 16 (state, event) pairs: 5 legal, 11 refused', () => {
  let legal = 0;
  let refused = 0;
  for (const s of ALL_STATES) for (const e of ALL_EVENTS) { if (transition(s, e) === null) refused++; else legal++; }
  assert.deepStrictEqual([legal, refused], [5, 11]);
});

test('unknown states and events are refused, including inherited property names', () => {
  assert.strictEqual(transition('idle', 'toString'), null);
  assert.strictEqual(transition('constructor', 'submit'), null);
  assert.strictEqual(transition(undefined, 'submit'), null);
  assert.strictEqual(transition('idle', undefined), null);
});

test('duplicate: a second submit while the first is in flight is refused (one POST per click burst)', () => {
  const first = transition('idle', 'submit');
  assert.strictEqual(first, 'submitting');
  assert.strictEqual(transition(first, 'submit'), null);
});

test('duplicate: a second answer for the same POST is refused (sent ignores a late failure; failed ignores a late success)', () => {
  assert.strictEqual(transition('sent', 'failed'), null);
  assert.strictEqual(transition('failed', 'succeeded'), null);
});

test('a submit on the thanks panel is refused until "send another" resets the form', () => {
  assert.strictEqual(transition('sent', 'submit'), null);
  assert.strictEqual(transition(transition('sent', 'reset'), 'submit'), 'submitting');
});

test('retry: failed --submit--> submitting --succeeded--> sent', () => {
  let s = 'idle';
  for (const e of ['submit', 'failed', 'submit', 'succeeded']) s = transition(s, e);
  assert.strictEqual(s, 'sent');
});

test('view: what the template reads for each state', () => {
  assert.deepStrictEqual(view('idle'), { sent: false, notSent: true, error: false, submitting: false });
  assert.deepStrictEqual(view('submitting'), { sent: false, notSent: true, error: false, submitting: true });
  assert.deepStrictEqual(view('sent'), { sent: true, notSent: false, error: false, submitting: false });
  assert.deepStrictEqual(view('failed'), { sent: false, notSent: true, error: true, submitting: false });
});
