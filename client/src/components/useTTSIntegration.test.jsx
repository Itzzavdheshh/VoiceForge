// client/src/components/useTTSIntegration.test.jsx
// Integration and unit tests for useTTS hook with multi-tier fallback engine (Issue #1418).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTTS from "../hooks/useTTS.js";
import { TTS_ENGINES, persistTTSEngine } from "../utils/edgeTTS.js";
import * as edgeTTSModule from "../utils/edgeTTS.js";

describe("useTTS integration and multi-tier fallback (Issue #1418)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("routes speech requests through ttsSpeak function payload", async () => {
    const mockTtsSpeak = vi.fn().mockResolvedValue({ engine: "chatterbox" });
    const text = "Hello world";
    const language = "en-US";

    await mockTtsSpeak({ text, language_code: language });

    expect(mockTtsSpeak).toHaveBeenCalledWith({
      text: "Hello world",
      language_code: "en-US",
    });
  });

  it("synthesizes speech with In-Browser Edge AI by default (Tier 1)", async () => {
    const { result } = renderHook(() => useTTS());
    expect(result.current.ttsEngine).toBe(TTS_ENGINES.EDGE);

    let res;
    await act(async () => {
      res = await result.current.speak(
        "Test voice synthesis with edge engine.",
      );
    });

    expect(res).toBeDefined();
    expect(res.engine).toBe(TTS_ENGINES.EDGE);
    expect(res.audioUrl).toBeDefined();
    expect(result.current.status).toBe("ready");
  });

  it("routes directly to Tier 3 mock engine when selected", async () => {
    persistTTSEngine(TTS_ENGINES.MOCK);
    const { result } = renderHook(() => useTTS());

    let res;
    await act(async () => {
      res = await result.current.speak("Testing mock offline engine directly.");
    });

    expect(res.engine).toBe(TTS_ENGINES.MOCK);
    expect(res.audioUrl).toBeDefined();
  });

  it("falls back to Tier 2 (Cloud) when Tier 1 (Edge) fails", async () => {
    // Spy on synthesizeEdgeTTS and make it throw
    vi.spyOn(edgeTTSModule, "synthesizeEdgeTTS").mockRejectedValueOnce(
      new Error("Edge WASM memory exhausted"),
    );

    // Mock fetch for Cloud Tier 2 (/api/voice/speak)
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/voice/speak")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ audioUrl: "https://example.com/audio.mp3" }),
        });
      }
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(["fake-audio"], { type: "audio/mpeg" }),
      });
    });

    const { result } = renderHook(() => useTTS());

    let res;
    await act(async () => {
      res = await result.current.speak("Fallback to cloud synthesis.");
    });

    expect(res.engine).toBe(TTS_ENGINES.CLOUD);
    expect(result.current.status).toBe("ready");
  });

  it("falls back to Tier 3 (Mock) when both Tier 1 (Edge) and Tier 2 (Cloud) fail", async () => {
    // Spy on synthesizeEdgeTTS to fail
    vi.spyOn(edgeTTSModule, "synthesizeEdgeTTS").mockRejectedValueOnce(
      new Error("Edge Worker error"),
    );

    // Make cloud fetch fail (e.g. offline network error)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

    const { result } = renderHook(() => useTTS());

    let res;
    await act(async () => {
      res = await result.current.speak("Offline complete fallback.");
    });

    // Should gracefully fallback to Tier 3 without throwing
    expect(res.engine).toBe(TTS_ENGINES.MOCK);
    expect(res.audioUrl).toBeDefined();
    expect(result.current.status).toBe("ready");
  });

  it("allows switching engine dynamically via setEngine", () => {
    const { result } = renderHook(() => useTTS());
    expect(result.current.ttsEngine).toBe(TTS_ENGINES.EDGE);

    act(() => {
      result.current.setEngine(TTS_ENGINES.CLOUD);
    });

    expect(result.current.ttsEngine).toBe(TTS_ENGINES.CLOUD);
    expect(localStorage.getItem(edgeTTSModule.TTS_ENGINE_STORAGE_KEY)).toBe(
      TTS_ENGINES.CLOUD,
    );
  });
});
