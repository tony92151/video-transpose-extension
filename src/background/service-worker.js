import { applyControlUpdate } from '../shared/control-state.js';
import { MESSAGE_TYPES } from '../shared/messages.js';
import {
  createDefaultSettings,
  getStorageKey,
  mergeStoredSettings,
  serializeSettings
} from '../shared/settings.js';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const DEFAULT_AUDIO_STATUS = Object.freeze({
  available: true,
  active: false,
  pitchSemitones: 0,
  message: ''
});

const audioStatusByTab = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender)
    .then((payload) => {
      sendResponse({
        ok: true,
        ...payload
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: formatError(error)
      });
    });

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopPitchProcessing(tabId).catch(() => {});
  audioStatusByTab.delete(tabId);
});

async function handleRuntimeMessage(message = {}, sender = {}) {
  switch (message.type) {
    case MESSAGE_TYPES.POPUP_GET_STATE:
      return {
        state: await getStateForTab(await resolveTabId(message.tabId))
      };

    case MESSAGE_TYPES.POPUP_SET_SPEED:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'SET_SPEED',
          speed: message.speed
        })
      };

    case MESSAGE_TYPES.POPUP_SET_PITCH:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'SET_PITCH',
          pitchSemitones: message.pitchSemitones
        })
      };

    case MESSAGE_TYPES.POPUP_SET_LOOP_POINT:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'SET_LOOP_POINT',
          point: message.point
        })
      };

    case MESSAGE_TYPES.POPUP_TOGGLE_LOOP:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'TOGGLE_LOOP',
          enabled: message.enabled
        })
      };

    case MESSAGE_TYPES.POPUP_CLEAR_LOOP:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'CLEAR_LOOP'
        })
      };

    case MESSAGE_TYPES.POPUP_JUMP_TO_LOOP_START:
      return {
        state: await jumpToLoopStart(await resolveTabId(message.tabId))
      };

    case MESSAGE_TYPES.POPUP_RESET_ALL:
      return {
        state: await updateSettingsForTab(await resolveTabId(message.tabId), {
          type: 'RESET_ALL'
        })
      };

    case MESSAGE_TYPES.CONTENT_READY:
    case MESSAGE_TYPES.CONTENT_VIDEO_CHANGED:
      if (sender.tab?.id !== undefined) {
        await restoreSettingsForContentTab(sender.tab.id, message.status);
      }

      return {
        accepted: true
      };

    case MESSAGE_TYPES.OFFSCREEN_AUDIO_STATUS:
      setAudioStatus(message.tabId, {
        available: message.available !== false,
        active: Boolean(message.active),
        pitchSemitones: Number(message.pitchSemitones) || 0,
        message: message.message || ''
      });

      return {
        accepted: true
      };

    default:
      return {
        ignored: true
      };
  }
}

async function resolveTabId(tabId) {
  if (Number.isInteger(tabId)) {
    return tabId;
  }

  const tabs = await chromeCall((callback) => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },
      callback
    );
  });

  return tabs?.[0]?.id ?? null;
}

async function getStateForTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return buildState({
      connection: 'unsupported',
      status: null,
      settings: createDefaultSettings('')
    });
  }

  const status = await getContentStatus(tabId);

  if (!status?.supported) {
    return buildState({
      tabId,
      connection: 'unsupported',
      status,
      settings: createDefaultSettings('')
    });
  }

  if (!status.hasMedia || !status.videoId) {
    return buildState({
      tabId,
      connection: 'no-media',
      status,
      settings: createDefaultSettings(status.videoId || '')
    });
  }

  const settings = await loadSettings(status.videoId);
  const applied = await sendContentMessage(tabId, {
    type: MESSAGE_TYPES.CONTENT_APPLY_SETTINGS,
    settings
  });

  await reconcilePitchProcessing(tabId, settings.pitchSemitones);

  return buildState({
    tabId,
    connection: 'connected',
    status: applied.status || status,
    settings
  });
}

async function updateSettingsForTab(tabId, action) {
  const status = await getContentStatus(tabId);

  if (!status?.supported || !status.hasMedia || !status.videoId) {
    return getStateForTab(tabId);
  }

  const currentSettings = await loadSettings(status.videoId);
  let nextAction = action;

  if (action.type === 'SET_LOOP_POINT') {
    const currentTimeResponse = await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_GET_CURRENT_TIME
    });

    nextAction = {
      ...action,
      time: currentTimeResponse.time
    };
  }

  const nextSettings = serializeSettings(applyControlUpdate(currentSettings, nextAction));
  await saveSettings(nextSettings);

  if (nextAction.type === 'RESET_ALL') {
    await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_RESET
    });
  } else if (nextAction.type === 'SET_SPEED') {
    await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_SET_SPEED,
      speed: nextSettings.speed
    });
  } else if (
    nextAction.type === 'SET_LOOP_POINT' ||
    nextAction.type === 'TOGGLE_LOOP' ||
    nextAction.type === 'CLEAR_LOOP' ||
    nextAction.type === 'SET_LOOP'
  ) {
    await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_SET_LOOP,
      loop: nextSettings.loop
    });
  } else {
    await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_APPLY_SETTINGS,
      settings: nextSettings
    });
  }

  await reconcilePitchProcessing(tabId, nextSettings.pitchSemitones);

  return getStateForTab(tabId);
}

async function jumpToLoopStart(tabId) {
  const status = await getContentStatus(tabId);

  if (status?.videoId) {
    const settings = await loadSettings(status.videoId);

    if (settings.loop.start !== null) {
      await sendContentMessage(tabId, {
        type: MESSAGE_TYPES.CONTENT_JUMP_TO,
        time: settings.loop.start
      });
    }
  }

  return getStateForTab(tabId);
}

async function restoreSettingsForContentTab(tabId, status = {}) {
  if (!status.supported || !status.hasMedia || !status.videoId) {
    return;
  }

  const settings = await loadSettings(status.videoId);

  await sendContentMessage(tabId, {
    type: MESSAGE_TYPES.CONTENT_APPLY_SETTINGS,
    settings
  }).catch(() => {});

  if (getAudioStatus(tabId).active || settings.pitchSemitones === 0) {
    await reconcilePitchProcessing(tabId, settings.pitchSemitones);
  }
}

async function getContentStatus(tabId) {
  try {
    const response = await sendContentMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_GET_STATUS
    });

    return response.status;
  } catch {
    return {
      supported: false,
      hasMedia: false,
      videoId: null,
      title: ''
    };
  }
}

async function loadSettings(videoId) {
  const key = getStorageKey(videoId);
  const result = await chromeCall((callback) => {
    chrome.storage.local.get(key, callback);
  });

  return mergeStoredSettings(videoId, result?.[key]);
}

async function saveSettings(settings) {
  if (!settings.videoId) {
    return;
  }

  const serialized = serializeSettings(settings);
  const key = getStorageKey(serialized.videoId);

  await chromeCall((callback) => {
    chrome.storage.local.set(
      {
        [key]: serialized
      },
      callback
    );
  });
}

async function sendContentMessage(tabId, message) {
  const response = await chromeCall((callback) => {
    chrome.tabs.sendMessage(tabId, message, callback);
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'The YouTube page did not accept the extension message.');
  }

  return response;
}

async function reconcilePitchProcessing(tabId, pitchSemitones) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  if (pitchSemitones === 0) {
    await stopPitchProcessing(tabId);
    return;
  }

  const currentStatus = getAudioStatus(tabId);

  try {
    if (currentStatus.active) {
      await sendExtensionMessage({
        type: MESSAGE_TYPES.OFFSCREEN_SET_PITCH,
        tabId,
        pitchSemitones
      });
    } else {
      await startPitchProcessing(tabId, pitchSemitones);
    }

    setAudioStatus(tabId, {
      available: true,
      active: true,
      pitchSemitones,
      message: ''
    });
  } catch (error) {
    setAudioStatus(tabId, {
      available: false,
      active: false,
      pitchSemitones: 0,
      message: formatError(error)
    });
  }
}

async function startPitchProcessing(tabId, pitchSemitones) {
  await ensureOffscreenDocument();

  const streamId = await chromeCall((callback) => {
    chrome.tabCapture.getMediaStreamId(
      {
        targetTabId: tabId
      },
      callback
    );
  });

  if (!streamId) {
    throw new Error('Chrome did not provide an audio capture stream.');
  }

  const response = await sendExtensionMessage({
    type: MESSAGE_TYPES.OFFSCREEN_START_AUDIO,
    tabId,
    streamId,
    pitchSemitones
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'The offscreen audio engine did not start.');
  }
}

async function stopPitchProcessing(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  try {
    await sendExtensionMessage({
      type: MESSAGE_TYPES.OFFSCREEN_STOP_AUDIO,
      tabId
    });
  } catch {
    // The offscreen document may not exist yet; stopping is still complete.
  }

  setAudioStatus(tabId, {
    available: getAudioStatus(tabId).available,
    active: false,
    pitchSemitones: 0,
    message: ''
  });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error('Chrome offscreen documents are unavailable in this browser.');
  }

  if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Riff Repeat keeps local tab audio processing alive while the popup is closed.'
  });
}

function buildState({ tabId = null, connection, status, settings }) {
  return {
    tabId,
    connection,
    controlsEnabled: connection === 'connected',
    status,
    settings: serializeSettings(settings),
    audioStatus: getAudioStatus(tabId)
  };
}

function getAudioStatus(tabId) {
  return {
    ...DEFAULT_AUDIO_STATUS,
    ...(Number.isInteger(tabId) ? audioStatusByTab.get(tabId) : null)
  };
}

function setAudioStatus(tabId, status) {
  if (!Number.isInteger(Number(tabId))) {
    return;
  }

  audioStatusByTab.set(Number(tabId), {
    ...getAudioStatus(Number(tabId)),
    ...status
  });
}

function sendExtensionMessage(message) {
  return chromeCall((callback) => {
    chrome.runtime.sendMessage(message, callback);
  });
}

function chromeCall(invoke) {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result);
    });
  });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
