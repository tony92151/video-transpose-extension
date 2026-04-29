import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeLoop, shouldSeekToLoopStart } from '../src/shared/loop.js';

describe('loop helpers', () => {
  it('enables only loops with an end after the start', () => {
    assert.deepEqual(normalizeLoop({ enabled: true, start: 10, end: 12 }), {
      enabled: true,
      start: 10,
      end: 12
    });

    assert.deepEqual(normalizeLoop({ enabled: true, start: 12, end: 10 }), {
      enabled: false,
      start: 12,
      end: 10
    });
  });

  it('keeps partial A/B points without enabling enforcement', () => {
    assert.deepEqual(normalizeLoop({ enabled: true, start: 8, end: null }), {
      enabled: false,
      start: 8,
      end: null
    });
  });

  it('detects when playback should seek back to A', () => {
    const loop = normalizeLoop({ enabled: true, start: 4, end: 8 });

    assert.equal(shouldSeekToLoopStart(7.9, loop), false);
    assert.equal(shouldSeekToLoopStart(8, loop), true);
    assert.equal(shouldSeekToLoopStart(11, loop), true);
  });
});
