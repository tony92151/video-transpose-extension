export function normalizeTime(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Math.round(number * 1000) / 1000;
}

export function normalizeLoop(loop = {}) {
  const start = normalizeTime(loop.start);
  const end = normalizeTime(loop.end);
  const enabled = Boolean(loop.enabled) && start !== null && end !== null && end > start;

  return {
    enabled,
    start,
    end
  };
}

export function shouldSeekToLoopStart(currentTime, loop, epsilon = 0) {
  const time = Number(currentTime);
  const normalized = normalizeLoop(loop);

  return Number.isFinite(time) && normalized.enabled && time >= normalized.end - epsilon;
}
