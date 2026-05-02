import { MESSAGE_TYPES } from '../shared/messages.js';
import { createDefaultSettings, serializeSettings } from '../shared/settings.js';

const sessions = new Map();
const OFFSCREEN_MESSAGE_TYPES = new Set([
  MESSAGE_TYPES.OFFSCREEN_START_AUDIO,
  MESSAGE_TYPES.OFFSCREEN_SET_PITCH,
  MESSAGE_TYPES.OFFSCREEN_SET_CHANNEL_VOLUMES,
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
      await startAudio(message.tabId, message.streamId, message.pitchSemitones, message.channelVolumes);
      return {
        started: true
      };

    case MESSAGE_TYPES.OFFSCREEN_SET_PITCH:
      setPitch(message.tabId, message.pitchSemitones);
      return {
        updated: true
      };

    case MESSAGE_TYPES.OFFSCREEN_SET_CHANNEL_VOLUMES:
      setChannelVolumes(message.tabId, message.channelVolumes);
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

async function startAudio(tabId, streamId, pitchSemitones, channelVolumes) {
  if (!Number.isInteger(tabId)) {
    throw new TypeError('A tab ID is required to start audio processing.');
  }

  if (!streamId) {
    throw new TypeError('A tab capture stream ID is required to start audio processing.');
  }

  await stopAudio(tabId);

  try {
    const audioSettings = serializeSettings({
      pitchSemitones,
      channelVolumes
    });
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
    const splitter = audioContext.createChannelSplitter(2);
    const leftGain = audioContext.createGain();
    const rightGain = audioContext.createGain();
    const merger = audioContext.createChannelMerger(2);
    const shifter = new AudioWorkletNode(audioContext, 'riff-repeat-pitch-shifter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    source.connect(shifter);
    shifter.connect(splitter);
    splitter.connect(leftGain, 0);
    splitter.connect(rightGain, 1);
    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);
    merger.connect(audioContext.destination);
    shifter.port.postMessage({
      type: 'SET_PITCH',
      pitchSemitones: audioSettings.pitchSemitones
    });
    setGainValue(leftGain, audioSettings.channelVolumes.left, audioContext);
    setGainValue(rightGain, audioSettings.channelVolumes.right, audioContext);

    sessions.set(tabId, {
      audioContext,
      stream,
      source,
      shifter,
      splitter,
      leftGain,
      rightGain,
      merger,
      pitchSemitones: audioSettings.pitchSemitones,
      channelVolumes: audioSettings.channelVolumes
    });

    postAudioStatus(tabId, {
      available: true,
      active: true,
      pitchSemitones: audioSettings.pitchSemitones,
      channelVolumes: audioSettings.channelVolumes,
      message: ''
    });
  } catch (error) {
    postAudioStatus(tabId, {
      available: false,
      active: false,
      pitchSemitones: 0,
      channelVolumes: createDefaultSettings('').channelVolumes,
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

  const audioSettings = serializeSettings({
    pitchSemitones,
    channelVolumes: session.channelVolumes
  });

  session.shifter.port.postMessage({
    type: 'SET_PITCH',
    pitchSemitones: audioSettings.pitchSemitones
  });
  session.pitchSemitones = audioSettings.pitchSemitones;

  postAudioStatus(tabId, {
    available: true,
    active: true,
    pitchSemitones: audioSettings.pitchSemitones,
    channelVolumes: session.channelVolumes,
    message: ''
  });
}

function setChannelVolumes(tabId, channelVolumes) {
  const session = sessions.get(tabId);

  if (!session) {
    throw new Error('No active audio session exists for this tab.');
  }

  const audioSettings = serializeSettings({
    pitchSemitones: session.pitchSemitones,
    channelVolumes
  });

  setGainValue(session.leftGain, audioSettings.channelVolumes.left, session.audioContext);
  setGainValue(session.rightGain, audioSettings.channelVolumes.right, session.audioContext);
  session.channelVolumes = audioSettings.channelVolumes;

  postAudioStatus(tabId, {
    available: true,
    active: true,
    pitchSemitones: session.pitchSemitones,
    channelVolumes: session.channelVolumes,
    message: ''
  });
}

async function stopAudio(tabId) {
  const session = sessions.get(tabId);

  if (!session) {
    postAudioStatus(tabId, {
      active: false,
      pitchSemitones: 0,
      channelVolumes: createDefaultSettings('').channelVolumes,
      message: ''
    });
    return;
  }

  session.source.disconnect();
  session.shifter.disconnect();
  session.splitter.disconnect();
  session.leftGain.disconnect();
  session.rightGain.disconnect();
  session.merger.disconnect();
  session.stream.getTracks().forEach((track) => track.stop());
  await session.audioContext.close();
  sessions.delete(tabId);

  postAudioStatus(tabId, {
    available: true,
    active: false,
    pitchSemitones: 0,
    channelVolumes: createDefaultSettings('').channelVolumes,
    message: ''
  });
}

function setGainValue(gainNode, value, audioContext) {
  gainNode.gain.setValueAtTime(value, audioContext.currentTime);
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
