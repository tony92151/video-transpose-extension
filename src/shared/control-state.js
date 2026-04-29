import { normalizeLoop, normalizeTime } from './loop.js';
import { createDefaultSettings, serializeSettings } from './settings.js';

function withNormalizedSettings(settings) {
  return serializeSettings(settings);
}

export function applyControlUpdate(settings, action = {}) {
  const current = withNormalizedSettings(settings);

  switch (action.type) {
    case 'SET_SPEED':
      return withNormalizedSettings({
        ...current,
        speed: action.speed
      });

    case 'SET_PITCH':
      return withNormalizedSettings({
        ...current,
        pitchSemitones: action.pitchSemitones
      });

    case 'SET_LOOP': {
      return withNormalizedSettings({
        ...current,
        loop: action.loop
      });
    }

    case 'SET_LOOP_POINT': {
      const point = String(action.point || '').toUpperCase();
      const time = normalizeTime(action.time);
      const nextLoop = {
        ...current.loop
      };

      if (point === 'A') {
        nextLoop.start = time;
      }

      if (point === 'B') {
        nextLoop.end = time;
      }

      nextLoop.enabled = nextLoop.start !== null && nextLoop.end !== null && nextLoop.end > nextLoop.start;

      return withNormalizedSettings({
        ...current,
        loop: normalizeLoop(nextLoop)
      });
    }

    case 'TOGGLE_LOOP':
      return withNormalizedSettings({
        ...current,
        loop: normalizeLoop({
          ...current.loop,
          enabled: action.enabled ?? !current.loop.enabled
        })
      });

    case 'CLEAR_LOOP':
      return withNormalizedSettings({
        ...current,
        loop: {
          enabled: false,
          start: null,
          end: null
        }
      });

    case 'RESET_ALL':
      return createDefaultSettings(current.videoId);

    default:
      return current;
  }
}
