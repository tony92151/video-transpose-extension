const SUPPORTED_HOSTS = new Set(['www.youtube.com', 'youtube.com']);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function toUrl(input) {
  if (input instanceof URL) {
    return input;
  }

  try {
    return new URL(String(input));
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(input) {
  const url = toUrl(input);

  if (!url || !SUPPORTED_HOSTS.has(url.hostname) || url.pathname !== '/watch') {
    return null;
  }

  const videoId = url.searchParams.get('v');

  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function isSupportedWatchUrl(input) {
  return extractYouTubeVideoId(input) !== null;
}
