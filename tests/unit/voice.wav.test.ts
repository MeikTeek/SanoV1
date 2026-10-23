import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWavBase64 } from '../../frontend/src/voice/wavRecorder';

test('WAV sai em 16 kHz mono PCM 16 bits, com o tamanho certo', () => {
  // 1 s de seno a 440 Hz gravado a 48 kHz, em dois pedaços.
  const tone = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.5);
  const wav = Buffer.from(toWavBase64([tone.slice(0, 20_000), tone.slice(20_000)], 48_000), 'base64');

  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1); // PCM
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 16_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 16_000 * 2);
  assert.equal(wav.length, 44 + 16_000 * 2);
  // O sinal sobrevive à redução (não virou silêncio nem saturou).
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak > 12_000 && peak < 20_000, `pico ${peak}`);
});
