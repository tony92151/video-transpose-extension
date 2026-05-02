# Channel Volume Controls Design

## Goal

Add per-video left and right channel volume controls to Riff Repeat. Each channel can be adjusted independently from 0% to 200%, with both channels defaulting to 100%.

This changes playback audio only. It does not modify the source video file or YouTube media element.

## User Experience

The popup adds a Channels section with two range controls:

- Left: 0% to 200%, default 100%
- Right: 0% to 200%, default 100%

Changing either slider applies immediately to the active tab. Reset All restores both channels to 100%, along with the existing pitch, speed, and loop defaults.

## Settings

Stored settings gain a `channelVolumes` object:

```js
channelVolumes: {
  left: 1,
  right: 1
}
```

Values are normalized as numbers from `0` to `2`, rounded to two decimals. Missing or invalid stored values fall back to `1`.

## Message Flow

The popup sends a `POPUP_SET_CHANNEL_VOLUME` message with:

```js
{
  channel: 'left' | 'right',
  volume: number
}
```

The background reducer stores the updated setting and then reconciles the offscreen audio session.

The offscreen document accepts channel volumes when starting audio and through a new update message while audio is active.

## Audio Architecture

The offscreen audio graph becomes:

```text
source -> pitch shifter -> splitter -> left/right gain -> merger -> destination
```

The pitch shifter remains responsible only for pitch processing. Channel volume is handled with Web Audio `GainNode`s after pitch shifting.

The offscreen audio session is active when audio processing is needed:

- pitch is not 0 semitones, or
- left volume is not 100%, or
- right volume is not 100%

When pitch is 0 and both channel volumes are 100%, the background stops the offscreen audio session.

## Error Handling

If offscreen audio setup fails, the popup keeps the existing audio-status behavior and shows the error message. Channel sliders are disabled when the current tab is unsupported or disconnected.

## Tests

Add shared-unit coverage before implementation:

- defaults include left and right channel volumes at `1`
- stored channel volumes are clamped to `0..2`
- serialization keeps only the supported channel-volume shape
- `SET_CHANNEL_VOLUME` updates only the requested channel
- `RESET_ALL` restores both channels to `1`
