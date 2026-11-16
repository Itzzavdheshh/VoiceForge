import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../utils/audioContext.js", () => ({ unlockAudioContext: vi.fn() }));
import useTTS from "./useTTS.js";

function abortableFetch(url, init) {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
  });
}

describe("useTTS stop()", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:x");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("aborts the /speak request and resets state", async () => {
    const fetchMock = vi.fn(abortableFetch);
    global.fetch = fetchMock;
    const onSpeakingChange = vi.fn();
    const { result } = renderHook(() => useTTS());

    let pending;
    act(() => {
      pending = result.current.speak({ text: "hi", voiceId: "v", onSpeakingChange });
    });
    expect(result.current.status).toBe("speaking");

    act(() => {
      result.current.stop();
    });
    const outcome = await pending;

    expect(outcome).toEqual({ aborted: true });
    expect(result.current.status).toBe("idle");
    expect(result.current.audioUrl).toBe("");
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
  });

  it("aborts the stream fetch, cancels server-side and never plays", async () => {
    const calls = [];
    global.fetch = vi.fn((url, init) => {
      calls.push(url);
      if (url.endsWith("/api/voice/speak")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            speechId: "tok",
            audioUrl: "/api/voice/speak/stream?t=tok",
          }),
        });
      }
      if (url.includes("/speak/cancel")) return Promise.resolve({ ok: true });
      return abortableFetch(url, init);
    });
    const { result } = renderHook(() => useTTS());

    let pending;
    act(() => {
      pending = result.current.speak({ text: "hi", voiceId: "v" });
    });
    await vi.waitFor(() =>
      expect(calls.some((u) => u.includes("/speak/stream"))).toBe(true),
    );

    act(() => {
      result.current.stop();
    });
    expect(await pending).toEqual({ aborted: true });
    expect(calls.some((u) => u.includes("/speak/cancel"))).toBe(true);
    expect(result.current.audioUrl).toBe("");
    expect(result.current.status).toBe("idle");
  });

  it("allows a new phrase right after an interrupt", async () => {
    global.fetch = vi.fn(abortableFetch);
    const { result } = renderHook(() => useTTS());
    let first;
    act(() => {
      first = result.current.speak({ text: "one", voiceId: "v" });
    });
    act(() => {
      result.current.stop();
    });
    await first;

    act(() => {
      result.current.speak({ text: "two", voiceId: "v" });
    });
    expect(result.current.status).toBe("speaking");
  });
});
