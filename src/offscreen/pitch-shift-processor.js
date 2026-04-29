class RiffRepeatPitchShifter extends AudioWorkletProcessor {
  constructor() {
    super();

    this.pitchRatio = 1;
    this.bufferSize = 8192;
    this.baseDelay = 2048;
    this.depth = 1536;
    this.phase = 0;
    this.writeIndex = 0;
    this.buffers = [];

    this.port.onmessage = (event) => {
      if (event.data?.type === 'SET_PITCH') {
        const semitones = Math.max(-12, Math.min(12, Math.round(Number(event.data.pitchSemitones) || 0)));
        this.pitchRatio = Math.pow(2, semitones / 12);
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const frameCount = output[0].length;

    for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
      const phaseA = this.phase;
      const phaseB = (this.phase + 0.5) % 1;
      const fadeA = 0.5 - 0.5 * Math.cos(2 * Math.PI * phaseA);
      const fadeB = 1 - fadeA;
      const sweep = (1 - this.pitchRatio) * this.depth;
      const delayA = this.clampDelay(this.baseDelay + sweep * phaseA);
      const delayB = this.clampDelay(this.baseDelay + sweep * phaseB);

      for (let channel = 0; channel < output.length; channel += 1) {
        const inputChannel = input[channel] || input[0];
        const outputChannel = output[channel];
        const buffer = this.getBuffer(channel);
        const inputSample = inputChannel ? inputChannel[sampleIndex] : 0;

        buffer[this.writeIndex] = inputSample;

        if (this.pitchRatio === 1) {
          outputChannel[sampleIndex] = inputSample;
        } else {
          const shiftedA = this.readDelay(buffer, delayA);
          const shiftedB = this.readDelay(buffer, delayB);
          outputChannel[sampleIndex] = shiftedA * fadeB + shiftedB * fadeA;
        }
      }

      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.phase = (this.phase + this.getPhaseStep()) % 1;
    }

    return true;
  }

  getBuffer(channel) {
    if (!this.buffers[channel]) {
      this.buffers[channel] = new Float32Array(this.bufferSize);
    }

    return this.buffers[channel];
  }

  readDelay(buffer, delay) {
    const readIndex = (this.writeIndex - delay + this.bufferSize) % this.bufferSize;
    const previousIndex = Math.floor(readIndex);
    const nextIndex = (previousIndex + 1) % this.bufferSize;
    const fraction = readIndex - previousIndex;

    return buffer[previousIndex] * (1 - fraction) + buffer[nextIndex] * fraction;
  }

  clampDelay(delay) {
    return Math.max(32, Math.min(this.bufferSize - 2, delay));
  }

  getPhaseStep() {
    return Math.max(0.0002, Math.abs(this.pitchRatio - 1) / this.depth);
  }
}

registerProcessor('riff-repeat-pitch-shifter', RiffRepeatPitchShifter);
