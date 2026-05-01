import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyControlUpdate } from '../src/shared/control-state.js';
import { createDefaultSettings } from '../src/shared/settings.js';

describe('control state reducer', () => {
  it('updates speed and pitch through message-like actions', () => {
    const settings = createDefaultSettings('abc123');
    const spedUp = applyControlUpdate(settings, { type: 'SET_SPEED', speed: 2.5 });
    const pitched = applyControlUpdate(spedUp, { type: 'SET_PITCH', pitchSemitones: -3 });

    assert.equal(pitched.speed, 2.5);
    assert.equal(pitched.pitchSemitones, -3);
  });

  it('updates one channel volume without changing the other channel', () => {
    const settings = createDefaultSettings('abc123');
    const leftChanged = applyControlUpdate(settings, {
      type: 'SET_CHANNEL_VOLUME',
      channel: 'left',
      volume: 1.5
    });
    const rightChanged = applyControlUpdate(leftChanged, {
      type: 'SET_CHANNEL_VOLUME',
      channel: 'right',
      volume: -1
    });

    assert.deepEqual(rightChanged.channelVolumes, {
      left: 1.5,
      right: 0
    });
  });

  it('sets A/B loop points using the current playback time', () => {
    const settings = createDefaultSettings('abc123');
    const withA = applyControlUpdate(settings, { type: 'SET_LOOP_POINT', point: 'A', time: 12 });
    const withB = applyControlUpdate(withA, { type: 'SET_LOOP_POINT', point: 'B', time: 18 });

    assert.deepEqual(withB.loop, {
      enabled: true,
      start: 12,
      end: 18
    });
  });

  it('resets all controls to defaults for the same video', () => {
    const settings = {
      ...createDefaultSettings('abc123'),
      pitchSemitones: 5,
      speed: 0.5,
      channelVolumes: {
        left: 0.5,
        right: 1.75
      },
      loop: {
        enabled: true,
        start: 2,
        end: 4
      }
    };

    assert.deepEqual(applyControlUpdate(settings, { type: 'RESET_ALL' }), createDefaultSettings('abc123'));
  });
});
