import { MESSAGE_TYPES } from '../shared/messages.js';

const elements = {
  statusText: document.querySelector('#statusText'),
  videoTitle: document.querySelector('#videoTitle'),
  audioMessage: document.querySelector('#audioMessage'),
  resetAll: document.querySelector('#resetAll'),
  pitchDown: document.querySelector('#pitchDown'),
  pitchUp: document.querySelector('#pitchUp'),
  pitchReset: document.querySelector('#pitchReset'),
  pitchRange: document.querySelector('#pitchRange'),
  pitchValue: document.querySelector('#pitchValue'),
  leftVolumeRange: document.querySelector('#leftVolumeRange'),
  leftVolumeValue: document.querySelector('#leftVolumeValue'),
  rightVolumeRange: document.querySelector('#rightVolumeRange'),
  rightVolumeValue: document.querySelector('#rightVolumeValue'),
  speedRange: document.querySelector('#speedRange'),
  speedValue: document.querySelector('#speedValue'),
  presets: document.querySelectorAll('.preset'),
  setA: document.querySelector('#setA'),
  setB: document.querySelector('#setB'),
  toggleLoop: document.querySelector('#toggleLoop'),
  jumpA: document.querySelector('#jumpA'),
  clearLoop: document.querySelector('#clearLoop'),
  loopValue: document.querySelector('#loopValue'),
  controls: document.querySelectorAll('.control')
};

let tabId = null;
let state = null;
let busy = false;

bindEvents();
loadState();

function bindEvents() {
  elements.pitchDown.addEventListener('click', () => setPitch(getPitch() - 1));
  elements.pitchUp.addEventListener('click', () => setPitch(getPitch() + 1));
  elements.pitchReset.addEventListener('click', () => setPitch(0));
  elements.pitchRange.addEventListener('change', () => setPitch(Number(elements.pitchRange.value)));
  elements.leftVolumeRange.addEventListener('change', () => setChannelVolume('left', Number(elements.leftVolumeRange.value)));
  elements.rightVolumeRange.addEventListener('change', () => setChannelVolume('right', Number(elements.rightVolumeRange.value)));
  elements.speedRange.addEventListener('change', () => setSpeed(Number(elements.speedRange.value)));
  elements.presets.forEach((button) => {
    button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
  });
  elements.setA.addEventListener('click', () => sendPopupMessage(MESSAGE_TYPES.POPUP_SET_LOOP_POINT, { point: 'A' }));
  elements.setB.addEventListener('click', () => sendPopupMessage(MESSAGE_TYPES.POPUP_SET_LOOP_POINT, { point: 'B' }));
  elements.toggleLoop.addEventListener('click', () => {
    sendPopupMessage(MESSAGE_TYPES.POPUP_TOGGLE_LOOP, {
      enabled: !state?.settings?.loop?.enabled
    });
  });
  elements.jumpA.addEventListener('click', () => sendPopupMessage(MESSAGE_TYPES.POPUP_JUMP_TO_LOOP_START));
  elements.clearLoop.addEventListener('click', () => sendPopupMessage(MESSAGE_TYPES.POPUP_CLEAR_LOOP));
  elements.resetAll.addEventListener('click', () => sendPopupMessage(MESSAGE_TYPES.POPUP_RESET_ALL));
}

async function loadState() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    tabId = tab?.id ?? null;
    await sendPopupMessage(MESSAGE_TYPES.POPUP_GET_STATE);
  } catch (error) {
    renderError(error);
  }
}

async function sendPopupMessage(type, payload = {}) {
  if (busy) {
    return;
  }

  busy = true;
  render();

  try {
    const response = await chrome.runtime.sendMessage({
      type,
      tabId,
      ...payload
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'The extension did not respond.');
    }

    state = response.state || state;
    render();
  } catch (error) {
    renderError(error);
  } finally {
    busy = false;
    render();
  }
}

function setPitch(pitchSemitones) {
  sendPopupMessage(MESSAGE_TYPES.POPUP_SET_PITCH, {
    pitchSemitones
  });
}

function setSpeed(speed) {
  sendPopupMessage(MESSAGE_TYPES.POPUP_SET_SPEED, {
    speed
  });
}

function setChannelVolume(channel, volume) {
  sendPopupMessage(MESSAGE_TYPES.POPUP_SET_CHANNEL_VOLUME, {
    channel,
    volume
  });
}

function render() {
  if (!state) {
    setControlsDisabled(true);
    return;
  }

  const settings = state.settings;
  const audioStatus = state.audioStatus || {};
  const connected = state.connection === 'connected';
  const pitchAvailable = audioStatus.available !== false;

  elements.statusText.dataset.state = state.connection;
  elements.statusText.textContent = getStatusText(state);
  elements.videoTitle.textContent = state.status?.title || '';
  elements.resetAll.disabled = busy || !connected;

  elements.pitchRange.value = String(settings.pitchSemitones);
  elements.pitchValue.textContent = `${formatSigned(settings.pitchSemitones)} st`;

  const channelVolumes = settings.channelVolumes || {
    left: 1,
    right: 1
  };
  elements.leftVolumeRange.value = String(channelVolumes.left);
  elements.leftVolumeValue.textContent = formatPercent(channelVolumes.left);
  elements.rightVolumeRange.value = String(channelVolumes.right);
  elements.rightVolumeValue.textContent = formatPercent(channelVolumes.right);

  elements.speedRange.value = String(settings.speed);
  elements.speedValue.textContent = `${Math.round(settings.speed * 100)}%`;

  elements.loopValue.textContent = `A ${formatTime(settings.loop.start)} / B ${formatTime(settings.loop.end)}`;
  elements.toggleLoop.textContent = settings.loop.enabled ? 'On' : 'Loop';
  elements.toggleLoop.setAttribute('aria-pressed', String(settings.loop.enabled));
  elements.jumpA.disabled = busy || !connected || settings.loop.start === null;

  elements.audioMessage.hidden = pitchAvailable || !audioStatus.message;
  elements.audioMessage.textContent = audioStatus.message || '';

  setControlsDisabled(busy || !connected);
  setPitchDisabled(busy || !connected || !pitchAvailable);
  updatePresetState(settings.speed);
}

function renderError(error) {
  elements.statusText.dataset.state = 'unsupported';
  elements.statusText.textContent = 'Unavailable';
  elements.videoTitle.textContent = '';
  elements.audioMessage.hidden = false;
  elements.audioMessage.textContent = error instanceof Error ? error.message : String(error);
  setControlsDisabled(true);
}

function getStatusText(currentState) {
  if (currentState.connection === 'connected') {
    return currentState.audioStatus?.active ? 'Connected with pitch' : 'Connected';
  }

  if (currentState.connection === 'no-media') {
    return 'No playable media';
  }

  return 'Unsupported page';
}

function setControlsDisabled(disabled) {
  elements.controls.forEach((element) => {
    element.disabled = disabled;
  });
}

function setPitchDisabled(disabled) {
  [elements.pitchDown, elements.pitchUp, elements.pitchReset, elements.pitchRange].forEach((element) => {
    element.disabled = disabled;
  });
}

function updatePresetState(speed) {
  elements.presets.forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === speed));
  });
}

function getPitch() {
  return Number(state?.settings?.pitchSemitones || 0);
}

function formatSigned(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatTime(value) {
  if (value === null || value === undefined) {
    return '--';
  }

  const totalSeconds = Math.max(0, Math.floor(Number(value)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${minutes}:${seconds}`;
}
