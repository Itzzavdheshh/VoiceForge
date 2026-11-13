// client/src/hooks/useTTS.js
// Multi-tier text-to-speech synthesis pipeline:
// Tier 1: 100% In-Browser Edge AI (Transformers.js / Kokoro / Piper-TTS architecture via Web Worker)
// Tier 2: Cloud Hugging Face Space backend (/api/voice/speak)
// Tier 3: Offline Mock Engine stub for zero-latency local fallback
import React from "react";
import { loadVoiceSettings } from "../utils/voiceSettings.js";
import { API_BASE_URL } from "../utils/apiConfig.js";
import { unlockAudioContext } from "../utils/audioContext.js";
import {
  synthesizeEdgeTTS,
  generateMockWAV,
  loadTTSEngine,
  persistTTSEngine,
  TTS_ENGINES,
} from "../utils/edgeTTS.js";

function safeRevokeObjectURL(url) {
  if (
    url &&
    typeof url === "string" &&
    url.startsWith("blob:") &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore in test or restricted environments
    }
  }
}

export default function useTTS() {
  const [status, setStatus] = React.useState("idle");
  const [error, setError] = React.useState("");
  const [audioUrl, setAudioUrl] = React.useState("");
  const [engine, setEngine] = React.useState(() => loadTTSEngine());
  const [activeEngine, setActiveEngine] = React.useState(() => loadTTSEngine());
  const prevBlobRef = React.useRef("");
  const mountedRef = React.useRef(true);

  // Sync engine preference across components/tabs
  React.useEffect(() => {
    function handleEngineChange(event) {
      const nextEngine = event.detail?.engine || loadTTSEngine();
      setEngine(nextEngine);
    }
    window.addEventListener("voiceforge:ttsEngineChanged", handleEngineChange);
    return () => {
      window.removeEventListener(
        "voiceforge:ttsEngineChanged",
        handleEngineChange,
      );
    };
  }, []);

  const setTTSEngine = React.useCallback((nextEngine) => {
    setEngine(nextEngine);
    persistTTSEngine(nextEngine);
  }, []);

  const speak = React.useCallback(
    async (textOrOptions, voiceIdParam, languageCodeParam = "en") => {
      let text = "";
      let voiceId = "";
      let languageCode = "en";
      let onSpeakingChange = null;
      let requestedEngine = null;

      if (typeof textOrOptions === "object" && textOrOptions !== null) {
        text = textOrOptions.text || "";
        voiceId = textOrOptions.voiceId || textOrOptions.voice_id || "";
        languageCode =
          textOrOptions.language_code || textOrOptions.languageCode || "en";
        onSpeakingChange = textOrOptions.onSpeakingChange;
        requestedEngine = textOrOptions.engine || null;
      } else {
        text = textOrOptions || "";
        voiceId = voiceIdParam || "";
        languageCode = languageCodeParam || "en";
      }

      // Synchronously unlock AudioContext within the user gesture event loop before async calls
      unlockAudioContext();

      const controller = new AbortController();
      setError("");
      setStatus("speaking");
      if (typeof onSpeakingChange === "function") onSpeakingChange(true);

      const targetEngine = requestedEngine || loadTTSEngine();
      const voiceSettings = loadVoiceSettings();

      // ── Helper to update active audio URL safely ────────────────
      const commitAudio = (blobUrl, resolvedEngine) => {
        if (!mountedRef.current) {
          safeRevokeObjectURL(blobUrl);
          if (typeof onSpeakingChange === "function") onSpeakingChange(false);
          return { audioUrl: "", blobUrl: "", engine: resolvedEngine };
        }

        safeRevokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = blobUrl;
        setAudioUrl(blobUrl);
        setActiveEngine(resolvedEngine);
        setStatus("ready");
        if (typeof onSpeakingChange === "function") onSpeakingChange(false);
        return { audioUrl: blobUrl, blobUrl, engine: resolvedEngine };
      };

      // ── TIER 1: In-Browser Edge AI Synthesis ────────────────────
      const tryTier1Edge = async () => {
        const result = await synthesizeEdgeTTS(text, voiceSettings, {
          languageCode,
        });
        return commitAudio(result.audioUrl || result.blobUrl, TTS_ENGINES.EDGE);
      };

      // ── TIER 2: Cloud Hugging Face Space backend ────────────────
      const tryTier2Cloud = async () => {
        const modelId =
          localStorage.getItem("voiceforge:selectedModelId") ||
          "eleven_multilingual_v2";
        const apiKey =
          localStorage.getItem("voiceforge:elevenlabsApiKey") || "";

        const response = await fetch(`${API_BASE_URL}/api/voice/speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ElevenLabs-Api-Key": apiKey,
          },
          body: JSON.stringify({
            text,
            voice_id: voiceId,
            voice_settings: voiceSettings,
            model_id: modelId,
            language_code: languageCode,
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          if (typeof onSpeakingChange === "function") onSpeakingChange(false);
          return { aborted: true };
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (payload.status === "waking_up") {
            const err = new Error(
              "Waking up AI Engine... this may take a minute.",
            );
            err.isColdStart = true;
            throw err;
          }
          throw new Error(payload.error || "Cloud speech generation failed.");
        }

        const payload = await response.json();
        const nextAudioUrl = payload.audioUrl;

        if (!nextAudioUrl) {
          throw new Error("Audio URL missing from server response.");
        }

        let blobUrl = "";
        try {
          const audioResponse = await fetch(nextAudioUrl);
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            if (
              typeof URL !== "undefined" &&
              typeof URL.createObjectURL === "function"
            ) {
              blobUrl = URL.createObjectURL(blob);
            }
          }
        } catch {
          // Fallback to direct nextAudioUrl if blob fetch fails
        }

        return commitAudio(blobUrl || nextAudioUrl, TTS_ENGINES.CLOUD);
      };

      // ── TIER 3: Offline Mock Engine stub ────────────────────────
      const tryTier3Mock = () => {
        const mockResult = generateMockWAV(text);
        return commitAudio(
          mockResult.audioUrl || mockResult.blobUrl,
          TTS_ENGINES.MOCK,
        );
      };

      try {
        // Multi-tier routing execution:
        if (targetEngine === TTS_ENGINES.MOCK) {
          return tryTier3Mock();
        }

        if (targetEngine === TTS_ENGINES.CLOUD) {
          try {
            return await tryTier2Cloud();
          } catch (cloudErr) {
            console.warn(
              "[useTTS] Cloud synthesis failed, falling back to In-Browser Edge TTS (Tier 1):",
              cloudErr,
            );
            try {
              return await tryTier1Edge();
            } catch (edgeErr) {
              console.warn(
                "[useTTS] Edge synthesis failed, falling back to Offline Mock (Tier 3):",
                edgeErr,
              );
              return tryTier3Mock();
            }
          }
        }

        // Default: Tier 1 (In-Browser Edge AI)
        try {
          return await tryTier1Edge();
        } catch (edgeErr) {
          console.warn(
            "[useTTS] In-Browser Edge TTS failed, falling back to Cloud AI (Tier 2):",
            edgeErr,
          );
          try {
            return await tryTier2Cloud();
          } catch (cloudErr) {
            console.warn(
              "[useTTS] Cloud AI failed, falling back to Offline Mock (Tier 3):",
              cloudErr,
            );
            return tryTier3Mock();
          }
        }
      } catch (ttsError) {
        if (typeof onSpeakingChange === "function") onSpeakingChange(false);
        if (ttsError?.name === "AbortError") {
          return { aborted: true };
        }
        setError(ttsError?.message || String(ttsError));
        setStatus("error");
        throw ttsError;
      }
    },
    [],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      safeRevokeObjectURL(prevBlobRef.current);
    };
  }, []);

  return {
    speak,
    status,
    error,
    audioUrl,
    engine: activeEngine,
    ttsEngine: engine,
    setEngine: setTTSEngine,
    isEdgeReady: true,
  };
}
