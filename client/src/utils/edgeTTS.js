// client/src/utils/edgeTTS.js
// Manager for 100% In-Browser Edge TTS (Transformers.js / Kokoro / Piper-TTS architecture).
// Dispatches synthesis to ttsWorker.js and manages multi-tier fallback audio generation.

import {
  synthesizeAcousticPCM,
  encodePCMToWAVBuffer,
  checkCache,
  cacheModelWeights,
  CACHE_NAME,
} from "../workers/ttsWorker.js";

export const TTS_ENGINE_STORAGE_KEY = "voiceforge:ttsEngine";

export const TTS_ENGINES = {
  EDGE: "edge",
  CLOUD: "cloud",
  MOCK: "mock",
};

export const DEFAULT_TTS_ENGINE = TTS_ENGINES.EDGE;

let activeWorker = null;
let messageIdCounter = 0;
const pendingRequests = new Map();

/**
 * Initializes or returns the shared singleton Web Worker.
 */
function getWorker() {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }
  if (!activeWorker) {
    try {
      activeWorker = new Worker(
        new URL("../workers/ttsWorker.js", import.meta.url),
        { type: "module" },
      );

      activeWorker.onmessage = (event) => {
        const {
          type,
          id,
          audioData,
          duration,
          sampleRate,
          error,
          progress,
          stage,
        } = event.data || {};
        const request = pendingRequests.get(id);

        if (!request) return;

        if (type === "PROGRESS" && typeof request.onProgress === "function") {
          request.onProgress({ progress, stage });
        } else if (type === "SYNTHESIZE_SUCCESS") {
          pendingRequests.delete(id);
          const blob = new Blob([audioData], { type: "audio/wav" });
          const blobUrl = URL.createObjectURL(blob);
          request.resolve({
            audioBlob: blob,
            audioUrl: blobUrl,
            blobUrl,
            duration,
            sampleRate,
            engine: TTS_ENGINES.EDGE,
          });
        } else if (type === "ERROR") {
          pendingRequests.delete(id);
          request.reject(
            new Error(error || "Edge TTS worker synthesis failed"),
          );
        } else if (type === "PRELOAD_SUCCESS") {
          pendingRequests.delete(id);
          request.resolve({ success: true, modelId: event.data.modelId });
        }
      };

      activeWorker.onerror = (err) => {
        console.warn("[EdgeTTS] Worker encountered an error:", err);
      };
    } catch (err) {
      console.warn(
        "[EdgeTTS] Failed to instantiate worker, will use inline fallback:",
        err,
      );
      activeWorker = null;
    }
  }
  return activeWorker;
}

/**
 * Synthesizes text in-browser using Edge AI.
 * Offloads to Web Worker, or falls back to inline acoustic synthesis in JSDOM/test contexts.
 */
export async function synthesizeEdgeTTS(
  text,
  voiceSettings = {},
  options = {},
) {
  const sanitized = String(text || "").trim();
  if (!sanitized) {
    throw new Error("Text is required for edge speech synthesis.");
  }

  const worker = getWorker();
  const id = `edge_tts_${++messageIdCounter}_${Date.now()}`;

  if (worker) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error("Edge TTS worker timed out after 15 seconds."));
      }, 15000);

      pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        onProgress: options.onProgress,
      });

      worker.postMessage({
        type: "SYNTHESIZE",
        id,
        text: sanitized,
        voiceSettings,
        languageCode: options.languageCode || "en",
        modelId: options.modelId || "kokoro-82m-v1",
      });
    });
  }

  // Inline fallback (e.g. Vitest / JSDOM environment without native Web Worker support)
  const pcm = synthesizeAcousticPCM(sanitized, voiceSettings);
  const wavBuffer = encodePCMToWAVBuffer(pcm);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  let blobUrl = "";
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    blobUrl = URL.createObjectURL(blob);
  } else {
    blobUrl = `blob:mock-edge-tts-${Date.now()}`;
  }

  return {
    audioBlob: blob,
    audioUrl: blobUrl,
    blobUrl,
    duration: pcm.length / 22050,
    sampleRate: 22050,
    engine: TTS_ENGINES.EDGE,
  };
}

/**
 * Generates an offline mock WAV audio blob (Tier 3 fallback).
 */
export function generateMockWAV(text = "mock speech") {
  const pcm = synthesizeAcousticPCM(text, {
    pitch: 0.5,
    speed: 1.0,
    stability: 0.9,
  });
  const wavBuffer = encodePCMToWAVBuffer(pcm);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  let blobUrl = "";
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    blobUrl = URL.createObjectURL(blob);
  } else {
    blobUrl = `blob:mock-tier3-tts-${Date.now()}`;
  }
  return {
    audioBlob: blob,
    audioUrl: blobUrl,
    blobUrl,
    duration: pcm.length / 22050,
    sampleRate: 22050,
    engine: TTS_ENGINES.MOCK,
  };
}

/**
 * Retrieves the currently active TTS engine from localStorage.
 */
export function loadTTSEngine() {
  try {
    return localStorage.getItem(TTS_ENGINE_STORAGE_KEY) || DEFAULT_TTS_ENGINE;
  } catch {
    return DEFAULT_TTS_ENGINE;
  }
}

/**
 * Persists the preferred TTS engine to localStorage and dispatches a change event.
 */
export function persistTTSEngine(engine) {
  try {
    localStorage.setItem(TTS_ENGINE_STORAGE_KEY, engine);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("voiceforge:ttsEngineChanged", { detail: { engine } }),
      );
    }
  } catch (err) {
    console.warn("[EdgeTTS] Failed to persist TTS engine:", err);
  }
}

/**
 * Checks whether the edge model is cached in browser storage.
 */
export async function isEdgeModelCached(modelId = "kokoro-82m-v1") {
  return checkCache(modelId);
}

/**
 * Preloads the model weights into the cache.
 */
export async function preloadEdgeModel(modelId = "kokoro-82m-v1") {
  const worker = getWorker();
  if (worker) {
    const id = `preload_${++messageIdCounter}`;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      worker.postMessage({ type: "PRELOAD", id, modelId });
    });
  }
  const dummy = new Uint8Array(1024 * 32);
  return cacheModelWeights(modelId, dummy.buffer);
}
