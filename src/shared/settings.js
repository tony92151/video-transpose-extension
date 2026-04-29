import { normalizeLoop } from './loop.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_PREFIX = 'youtube-practice:v1';
export const DEFAULT_SPEED = 1;
export const DEFAULT_PITCH = 0;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const MIN_PITCH = -12;
export const MAX_PITCH = 12;

export function getStorageKey(videoId) {
  if (!videoId || typeof videoId !== 'string') {
    throw new TypeError('A YouTube video ID is required for settings storage.');
  }

  return `${STORAGE_PREFIX}:${videoId}`;
}

export function createDefaultSettings(videoId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    videoId,
    pitchSemitones: DEFAULT_PITCH,
    speed: DEFAULT_SPEED,
    loop: {
      enabled: false,
      start: null,
      end: null
    }
  };
}

export function clampPitch(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_PITCH;
  }

  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(number)));
}

export function clampSpeed(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_SPEED;
  }

  const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, number));

  return Math.round(clamped * 100) / 100;
}

export function serializeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    videoId: typeof source.videoId === 'string' ? source.videoId : '',
    pitchSemitones: clampPitch(source.pitchSemitones),
    speed: clampSpeed(source.speed),
    loop: normalizeLoop(source.loop)
  };
}

export function mergeStoredSettings(videoId, storedSettings) {
  const defaults = createDefaultSettings(videoId);
  const stored = storedSettings && typeof storedSettings === 'object' ? storedSettings : {};

  return serializeSettings({
    ...defaults,
    ...stored,
    videoId,
    loop: {
      ...defaults.loop,
      ...(stored.loop && typeof stored.loop === 'object' ? stored.loop : {})
    }
  });
}
