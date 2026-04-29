# Riff Repeat

Riff Repeat is a Chrome Manifest V3 extension for local YouTube practice controls:
pitch shifting, speed changes, A/B looping, reset controls, and per-video
settings stored in `chrome.storage.local`.

## Load Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open a desktop YouTube watch page and click the Riff Repeat toolbar button.

## Development

The extension is plain JavaScript and does not require a build step. Shared pure
logic lives in `src/shared`, browser entry points live in `src/background`,
`src/content`, `src/offscreen`, and `src/popup`.

When Node 20+ is available, run:

```bash
npm test
```

## MVP Limits

Pitch shifting uses local Chrome tab capture plus an AudioWorklet. The current
worklet favors a simple offline-free implementation over studio quality, so
latency and artifacts are expected at larger semitone shifts. If Chrome denies
tab capture or offscreen audio is unavailable, speed and loop controls remain
usable while pitch is shown as unavailable.
