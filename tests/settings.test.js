import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clampPitch,
  clampSpeed,
  createDefaultSettings,
  getStorageKey,
  mergeStoredSettings,
  serializeSettings
} from '../src/shared/settings.js';

describe('settings', () => {
  it('builds stable per-video storage keys', () => {
    assert.equal(getStorageKey('abc123'), 'youtube-practice:v1:abc123');
  });

  it('creates sanitized defaults for a video', () => {
    assert.deepEqual(createDefaultSettings('abc123'), {
      schemaVersion: 1,
      videoId: 'abc123',
      pitchSemitones: 0,
      speed: 1,
      channelVolumes: {
        left: 1,
        right: 1
      },
      loop: {
        enabled: false,
        start: null,
        end: null
      }
    });
  });

  it('clamps pitch and speed to MVP ranges', () => {
    assert.equal(clampPitch(-99), -12);
    assert.equal(clampPitch(99), 12);
    assert.equal(clampPitch(2.4), 2);
    assert.equal(clampSpeed(0.05), 0.25);
    assert.equal(clampSpeed(5), 4);
    assert.equal(clampSpeed(1.337), 1.34);
  });

  it('merges stored settings with defaults and sanitizes invalid values', () => {
    const settings = mergeStoredSettings('abc123', {
      schemaVersion: 1,
      videoId: 'wrong',
      pitchSemitones: 20,
      speed: 0.1,
      channelVolumes: {
        left: 5,
        right: -1,
        center: 0.5
      },
      loop: {
        enabled: true,
        start: 12,
        end: 8
      }
    });

    assert.deepEqual(settings, {
      schemaVersion: 1,
      videoId: 'abc123',
      pitchSemitones: 12,
      speed: 0.25,
      channelVolumes: {
        left: 2,
        right: 0
      },
      loop: {
        enabled: false,
        start: 12,
        end: 8
      }
    });
  });

  it('serializes only the supported settings shape', () => {
    const serialized = serializeSettings({
      schemaVersion: 7,
      videoId: 'abc123',
      pitchSemitones: -4,
      speed: 1.25,
      channelVolumes: {
        left: 1.25,
        right: 0.5,
        center: 2
      },
      loop: {
        enabled: true,
        start: 2,
        end: 5
      },
      ignored: true
    });

    assert.deepEqual(serialized, {
      schemaVersion: 1,
      videoId: 'abc123',
      pitchSemitones: -4,
      speed: 1.25,
      channelVolumes: {
        left: 1.25,
        right: 0.5
      },
      loop: {
        enabled: true,
        start: 2,
        end: 5
      }
    });
  });
});
