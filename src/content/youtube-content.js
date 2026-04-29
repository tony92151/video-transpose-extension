(() => {
  const MESSAGE_TYPES = {
    CONTENT_GET_STATUS: 'YTP_CONTENT_GET_STATUS',
    CONTENT_APPLY_SETTINGS: 'YTP_CONTENT_APPLY_SETTINGS',
    CONTENT_SET_SPEED: 'YTP_CONTENT_SET_SPEED',
    CONTENT_SET_LOOP: 'YTP_CONTENT_SET_LOOP',
    CONTENT_GET_CURRENT_TIME: 'YTP_CONTENT_GET_CURRENT_TIME',
    CONTENT_JUMP_TO: 'YTP_CONTENT_JUMP_TO',
    CONTENT_RESET: 'YTP_CONTENT_RESET',
    CONTENT_READY: 'YTP_CONTENT_READY',
    CONTENT_VIDEO_CHANGED: 'YTP_CONTENT_VIDEO_CHANGED'
  };

  const DEFAULT_SETTINGS = {
    schemaVersion: 1,
    videoId: '',
    pitchSemitones: 0,
    speed: 1,
    loop: {
      enabled: false,
      start: null,
      end: null
    }
  };

  let activeVideo = null;
  let activeVideoId = null;
  let currentSettings = { ...DEFAULT_SETTINGS };
  let loopTimer = null;
  let detectionTimer = null;
  let lastReportedKey = '';

  function normalizeTime(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return null;
    }

    return Math.round(number * 1000) / 1000;
  }

  function clampSpeed(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return 1;
    }

    return Math.round(Math.max(0.25, Math.min(4, number)) * 100) / 100;
  }

  function normalizeLoop(loop = {}) {
    const start = normalizeTime(loop.start);
    const end = normalizeTime(loop.end);

    return {
      enabled: Boolean(loop.enabled) && start !== null && end !== null && end > start,
      start,
      end
    };
  }

  function normalizeSettings(settings = {}) {
    return {
      schemaVersion: 1,
      videoId: typeof settings.videoId === 'string' ? settings.videoId : activeVideoId || '',
      pitchSemitones: Math.max(-12, Math.min(12, Math.round(Number(settings.pitchSemitones) || 0))),
      speed: clampSpeed(settings.speed),
      loop: normalizeLoop(settings.loop)
    };
  }

  function extractVideoId() {
    const url = new URL(window.location.href);

    if (!['www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/watch') {
      return null;
    }

    const videoId = url.searchParams.get('v');

    return videoId && /^[A-Za-z0-9_-]{1,128}$/.test(videoId) ? videoId : null;
  }

  function findVideo() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  function getTitle() {
    const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
    const rawTitle = titleElement?.textContent?.trim() || document.title.replace(/\s*-\s*YouTube$/, '');

    return rawTitle || 'YouTube video';
  }

  function buildStatus() {
    const supported = activeVideoId !== null;

    return {
      supported,
      hasMedia: Boolean(activeVideo),
      videoId: activeVideoId,
      title: supported ? getTitle() : '',
      currentTime: activeVideo ? activeVideo.currentTime : null,
      duration: activeVideo && Number.isFinite(activeVideo.duration) ? activeVideo.duration : null,
      speed: activeVideo ? activeVideo.playbackRate : currentSettings.speed,
      paused: activeVideo ? activeVideo.paused : true
    };
  }

  function enforceLoop() {
    if (!activeVideo || !currentSettings.loop.enabled) {
      return;
    }

    if (activeVideo.currentTime >= currentSettings.loop.end) {
      activeVideo.currentTime = currentSettings.loop.start;
    }
  }

  function updateLoopTimer() {
    if (loopTimer) {
      window.clearInterval(loopTimer);
      loopTimer = null;
    }

    if (currentSettings.loop.enabled) {
      loopTimer = window.setInterval(enforceLoop, 100);
    }
  }

  function bindVideo(video) {
    if (activeVideo === video) {
      return;
    }

    if (activeVideo) {
      activeVideo.removeEventListener('timeupdate', enforceLoop);
    }

    activeVideo = video;

    if (activeVideo) {
      activeVideo.addEventListener('timeupdate', enforceLoop);
      activeVideo.playbackRate = currentSettings.speed;
    }
  }

  function applySettings(settings) {
    currentSettings = normalizeSettings(settings);

    if (activeVideo) {
      activeVideo.playbackRate = currentSettings.speed;
    }

    updateLoopTimer();
  }

  function detectMedia() {
    const nextVideoId = extractVideoId();
    const nextVideo = findVideo();
    const previousKey = `${activeVideoId || ''}:${Boolean(activeVideo)}`;

    activeVideoId = nextVideoId;
    bindVideo(nextVideo);

    const nextKey = `${activeVideoId || ''}:${Boolean(activeVideo)}`;

    if (nextKey !== previousKey && nextKey !== lastReportedKey) {
      lastReportedKey = nextKey;
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.CONTENT_VIDEO_CHANGED,
        status: buildStatus()
      }).catch(() => {});
    }
  }

  function scheduleDetection() {
    window.clearTimeout(detectionTimer);
    detectionTimer = window.setTimeout(detectMedia, 150);
  }

  function patchHistoryMethod(methodName) {
    const original = history[methodName];

    history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleDetection();
      return result;
    };
  }

  function setupNavigationTracking() {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    window.addEventListener('popstate', scheduleDetection);
    window.addEventListener('yt-navigate-finish', scheduleDetection);
    window.addEventListener('yt-page-data-updated', scheduleDetection);

    const observer = new MutationObserver(scheduleDetection);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.setInterval(detectMedia, 1500);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      detectMedia();

      switch (message?.type) {
        case MESSAGE_TYPES.CONTENT_GET_STATUS:
          sendResponse({
            ok: true,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_APPLY_SETTINGS:
          applySettings(message.settings);
          sendResponse({
            ok: true,
            settings: currentSettings,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_SET_SPEED:
          currentSettings = normalizeSettings({
            ...currentSettings,
            speed: message.speed
          });

          if (activeVideo) {
            activeVideo.playbackRate = currentSettings.speed;
          }

          sendResponse({
            ok: true,
            settings: currentSettings,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_SET_LOOP:
          currentSettings = normalizeSettings({
            ...currentSettings,
            loop: message.loop
          });
          updateLoopTimer();
          sendResponse({
            ok: true,
            settings: currentSettings,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_GET_CURRENT_TIME:
          sendResponse({
            ok: true,
            time: activeVideo ? activeVideo.currentTime : null,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_JUMP_TO:
          if (activeVideo && Number.isFinite(Number(message.time))) {
            activeVideo.currentTime = Math.max(0, Number(message.time));
          }

          sendResponse({
            ok: true,
            status: buildStatus()
          });
          break;

        case MESSAGE_TYPES.CONTENT_RESET:
          currentSettings = normalizeSettings({
            ...DEFAULT_SETTINGS,
            videoId: activeVideoId || ''
          });

          if (activeVideo) {
            activeVideo.playbackRate = 1;
          }

          updateLoopTimer();
          sendResponse({
            ok: true,
            settings: currentSettings,
            status: buildStatus()
          });
          break;

        default:
          return false;
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return false;
  });

  detectMedia();
  setupNavigationTracking();
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CONTENT_READY,
    status: buildStatus()
  }).catch(() => {});
})();
