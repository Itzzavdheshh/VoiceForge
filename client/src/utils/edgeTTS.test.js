// client/src/utils/edgeTTS.test.js
// Comprehensive unit tests for In-Browser Edge TTS (Transformers.js/Piper architecture)
// and multi-tier speech synthesis fallback pipeline (Issue #1418).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  synthesizeEdgeTTS,
  generateMockWAV,
  loadTTSEngine,
  persistTTSEngine,
  TTS_ENGINES,
  TTS_ENGINE_STORAGE_KEY,
} from "./edgeTTS.js";
import {
  synthesizeAcousticPCM,
  encodePCMToWAVBuffer,
} from "../workers/ttsWorker.js";

describe("In-Browser Edge TTS Engine (Issue #1418)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Acoustic PCM synthesis", () => {
    it("generates non-empty Float32Array PCM samples for input text", () => {
      const pcm = synthesizeAcousticPCM(
        "Hello VoiceForge, testing in-browser edge TTS.",
      );
      expect(pcm).toBeInstanceOf(Float32Array);
      expect(pcm.length).toBeGreaterThan(0);
      // Sample values must be clamped within [-1, 1]
      for (let i = 0; i < Math.min(pcm.length, 500); i++) {
        expect(pcm[i]).toBeGreaterThanOrEqual(-1);
        expect(pcm[i]).toBeLessThanOrEqual(1);
      }
    });

    it("returns empty Float32Array for empty or whitespace-only input", () => {
      expect(synthesizeAcousticPCM("").length).toBe(0);
      expect(synthesizeAcousticPCM("   ").length).toBe(0);
      expect(synthesizeAcousticPCM(null).length).toBe(0);
    });

    it("modulates output duration and frequency based on voice settings", () => {
      const normal = synthesizeAcousticPCM("Quick speech", { speed: 1.0 });
      const fast = synthesizeAcousticPCM("Quick speech", { speed: 2.0 });
      // Faster speech should produce fewer total audio samples
      expect(fast.length).toBeLessThan(normal.length);
    });
  });

  describe("WAV RIFF encoding", () => {
    it("encodes PCM samples into valid standard 16-bit RIFF WAV ArrayBuffer", () => {
      const pcm = new Float32Array([0.0, 0.5, -0.5, 0.25, -0.25]);
      const buffer = encodePCMToWAVBuffer(pcm, 22050);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      const view = new DataView(buffer);

      // Verify RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
      );
      expect(riff).toBe("RIFF");

      // Verify WAVE format
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11),
      );
      expect(wave).toBe("WAVE");

      // Verify fmt chunk
      const fmt = String.fromCharCode(
        view.getUint8(12),
        view.getUint8(13),
        view.getUint8(14),
        view.getUint8(15),
      );
      expect(fmt).toBe("fmt ");
      expect(view.getUint16(20, true)).toBe(1); // PCM format
      expect(view.getUint16(22, true)).toBe(1); // Mono channel
      expect(view.getUint32(24, true)).toBe(22050); // Sample rate
      expect(view.getUint16(34, true)).toBe(16); // 16-bit

      // Verify data chunk
      const data = String.fromCharCode(
        view.getUint8(36),
        view.getUint8(37),
        view.getUint8(38),
        view.getUint8(39),
      );
      expect(data).toBe("data");
      expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    });
  });

  describe("synthesizeEdgeTTS and Mock Engine", () => {
    it("synthesizes edge audio and returns standard audio blob and URL", async () => {
      const result = await synthesizeEdgeTTS("In-browser Edge TTS is active.");
      expect(result).toHaveProperty("audioBlob");
      expect(result).toHaveProperty("audioUrl");
      expect(result.engine).toBe(TTS_ENGINES.EDGE);
      expect(result.sampleRate).toBe(22050);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.audioBlob.type).toBe("audio/wav");
    });

    it("throws when empty text is provided to synthesizeEdgeTTS", async () => {
      await expect(synthesizeEdgeTTS("")).rejects.toThrow(
        "Text is required for edge speech synthesis.",
      );
    });

    it("generates valid Tier 3 mock audio with generateMockWAV", () => {
      const mockResult = generateMockWAV("Testing fallback mock.");
      expect(mockResult.engine).toBe(TTS_ENGINES.MOCK);
      expect(mockResult.audioBlob.type).toBe("audio/wav");
      expect(mockResult.audioUrl).toBeDefined();
    });
  });

  describe("Engine selection persistence", () => {
    it("defaults to Edge AI engine when no setting is saved", () => {
      expect(loadTTSEngine()).toBe(TTS_ENGINES.EDGE);
    });

    it("saves preferred engine to localStorage and emits custom event", () => {
      const eventSpy = vi.fn();
      window.addEventListener("voiceforge:ttsEngineChanged", eventSpy);

      persistTTSEngine(TTS_ENGINES.CLOUD);
      expect(localStorage.getItem(TTS_ENGINE_STORAGE_KEY)).toBe(
        TTS_ENGINES.CLOUD,
      );
      expect(loadTTSEngine()).toBe(TTS_ENGINES.CLOUD);
      expect(eventSpy).toHaveBeenCalledTimes(1);

      persistTTSEngine(TTS_ENGINES.MOCK);
      expect(loadTTSEngine()).toBe(TTS_ENGINES.MOCK);

      window.removeEventListener("voiceforge:ttsEngineChanged", eventSpy);
    });
  });
});
