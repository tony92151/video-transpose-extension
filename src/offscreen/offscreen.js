import { MESSAGE_TYPES } from '../shared/messages.js';

const sessions = new Map();
const OFFSCREEN_MESSAGE_TYPES = new Set([
  MESSAGE_TYPES.OFFSCREEN_START_AUDIO,
  MESSAGE_TYPES.OFFSCREEN_SET_PITCH,
  MESSAGE_TYPES.OFFSCREEN_STOP_AUDIO
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!OFFSCREEN_MESSAGE_TYPES.has(message?.type)) {
    return false;
  }

  handleMessage(message)
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

async function handleMessage(message = {}) {
  switch (message.type) {
    case MESSAGE_TYPES.OFFSCREEN_START_AUDIO:
      await startAudio(message.tabId, message.streamId, message.pitchSemitones);
      return {
        started: true
      };

    case MESSAGE_TYPES.OFFSCREEN_SET_PITCH:
      setPitch(message.tabId, message.pitchSemitones);
      return {
        updated: true
      };

    case MESSAGE_TYPES.OFFSCREEN_STOP_AUDIO:
      await stopAudio(message.tabId);
      return {
        stopped: true
      };

    default:
      return {
        ignored: true
      };
  }
}

async function startAudio(tabId, streamId, pitchSemitones) {
  if (!Number.isInteger(tabId)) {
    throw new TypeError('A tab ID is required to start audio processing.');
  }

  if (!streamId) {
    throw new TypeError('A tab capture stream ID is required to start audio processing.');
  }

  await stopAudio(tabId);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule('pitch-shift-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const shifter = new AudioWorkletNode(audioContext, 'riff-repeat-pitch-shifter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    source.connect(shifter);
    shifter.connect(audioContext.destination);
    shifter.port.postMessage({
      type: 'SET_PITCH',
      pitchSemitones
    });

    sessions.set(tabId, {
      audioContext,
      stream,
      source,
      shifter
    });

    postAudioStatus(tabId, {
      available: true,
      active: true,
      pitchSemitones,
      message: ''
    });
  } catch (error) {
    postAudioStatus(tabId, {
      available: false,
      active: false,
      pitchSemitones: 0,
      message: formatError(error)
    });

    throw error;
  }
}

function setPitch(tabId, pitchSemitones) {
  const session = sessions.get(tabId);

  if (!session) {
    throw new Error('No active audio session exists for this tab.');
  }

  session.shifter.port.postMessage({
    type: 'SET_PITCH',
    pitchSemitones
  });

  postAudioStatus(tabId, {
    available: true,
    active: true,
    pitchSemitones,
    message: ''
  });
}

async function stopAudio(tabId) {
  const session = sessions.get(tabId);

  if (!session) {
    postAudioStatus(tabId, {
      active: false,
      pitchSemitones: 0,
      message: ''
    });
    return;
  }

  session.source.disconnect();
  session.shifter.disconnect();
  session.stream.getTracks().forEach((track) => track.stop());
  await session.audioContext.close();
  sessions.delete(tabId);

  postAudioStatus(tabId, {
    available: true,
    active: false,
    pitchSemitones: 0,
    message: ''
  });
}

function postAudioStatus(tabId, status) {
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.OFFSCREEN_AUDIO_STATUS,
    tabId,
    ...status
  }).catch(() => {});
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
