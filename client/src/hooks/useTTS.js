// Sends typed text to the local backend and returns playable cloned speech audio.
// Supports interruption: stop() aborts every in-flight request, tells the server
// to drop the synthesis job, and resets playback state so a new phrase can be
// submitted immediately.
import React from "react";
import { loadVoiceSettings } from "../utils/voiceSettings.js";
import { API_BASE_URL } from "../utils/apiConfig.js";
import { unlockAudioContext } from "../utils/audioContext.js";

function resolveApiUrl(url) {
  return typeof url === "string" && url.startsWith("/")
    ? `${API_BASE_URL}${url}`
    : url;
}

export default function useTTS() {
  const [status, setStatus] = React.useState("idle");
  const [error, setError] = React.useState("");
  const [audioUrl, setAudioUrl] = React.useState("");
  const prevBlobRef = React.useRef("");
  const mountedRef = React.useRef(true);

  // Interruption bookkeeping. Every speak() call gets a monotonically
  // increasing id; anything that resolves for a stale id is discarded.
  const requestIdRef = React.useRef(0);
  const controllerRef = React.useRef(null);
  const speechTokenRef = React.useRef("");
  const speakingCallbackRef = React.useRef(null);

  // Aborts the in-flight network work and releases the server-side job.
  // Does not touch React state, so speak() can use it to supersede a request.
  const abortInFlight = React.useCallback(() => {
    const controller = controllerRef.current;
    const token = speechTokenRef.current;
    controllerRef.current = null;
    speechTokenRef.current = "";
    requestIdRef.current += 1;

    if (controller) controller.abort();

    if (token) {
      // Fire-and-forget: frees the pending token / Gradio job even when the
      // browser has not opened the stream connection yet. keepalive lets it
      // survive page navigation.
      let apiKey = "";
      try {
        apiKey = localStorage.getItem("voiceforge:elevenlabsApiKey") || "";
      } catch {
        /* storage unavailable */
      }
      fetch(`${API_BASE_URL}/api/voice/speak/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ElevenLabs-Api-Key": apiKey,
        },
        body: JSON.stringify({ speechId: token }),
        keepalive: true,
      }).catch(() => {});
    }
    return Boolean(controller);
  }, []);

  /**
   * Immediately stops generation and playback.
   * @returns {boolean} true when a request was actually in flight.
   */
  const stop = React.useCallback(() => {
    const hadInFlight = abortInFlight();

    if (prevBlobRef.current) {
      URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = "";
    }

    const notifySpeaking = speakingCallbackRef.current;
    speakingCallbackRef.current = null;
    if (typeof notifySpeaking === "function") notifySpeaking(false);

    if (mountedRef.current) {
      setAudioUrl(""); // unmounts the <audio> element, dropping buffered data
      setError("");
      setStatus("idle");
    }
    return hadInFlight;
  }, [abortInFlight]);

  const speak = React.useCallback(
    async (textOrOptions, voiceIdParam, languageCodeParam = "en") => {
      let text = "";
      let voiceId = "";
      let languageCode = "en";
      let onSpeakingChange = null;

      if (typeof textOrOptions === "object" && textOrOptions !== null) {
        text = textOrOptions.text || "";
        voiceId = textOrOptions.voiceId || textOrOptions.voice_id || "";
        languageCode =
          textOrOptions.language_code || textOrOptions.languageCode || "en";
        onSpeakingChange = textOrOptions.onSpeakingChange;
      } else {
        text = textOrOptions || "";
        voiceId = voiceIdParam || "";
        languageCode = languageCodeParam || "en";
      }

      // Synchronously unlock AudioContext within the user gesture event loop before async fetch
      unlockAudioContext();

      // A new request supersedes any older one that is still in flight.
      abortInFlight();
      const controller = new AbortController();
      controllerRef.current = controller;
      const requestId = requestIdRef.current;
      const isCurrent = () =>
        requestIdRef.current === requestId && !controller.signal.aborted;
      const finishSpeaking = () => {
        if (!isCurrent()) return; // stop() already notified the caller
        if (speakingCallbackRef.current === onSpeakingChange) {
          speakingCallbackRef.current = null;
        }
        if (typeof onSpeakingChange === "function") onSpeakingChange(false);
      };
      const clearActive = () => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          speechTokenRef.current = "";
        }
      };

      speakingCallbackRef.current = onSpeakingChange;
      setError("");
      setStatus("speaking");
      if (typeof onSpeakingChange === "function") onSpeakingChange(true);

      try {
        const voiceSettings = loadVoiceSettings();
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

        if (!isCurrent()) return { aborted: true };

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (payload.status === "waking_up") {
            const err = new Error(
              "Waking up AI Engine... this may take a minute.",
            );
            err.isColdStart = true;
            throw err;
          }
          throw new Error(payload.error || "Speech generation failed.");
        }

        const payload = await response.json();
        if (!isCurrent()) return { aborted: true };

        const nextAudioUrl = payload.audioUrl;

        if (!nextAudioUrl) {
          throw new Error("Audio URL missing from server response.");
        }

        // Remember the token so stop() can cancel the server job even before
        // the stream connection is open.
        speechTokenRef.current = payload.speechId || "";

        let blobUrl = "";
        try {
          const audioResponse = await fetch(resolveApiUrl(nextAudioUrl), {
            headers: { "X-ElevenLabs-Api-Key": apiKey },
            signal: controller.signal,
          });
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            if (!isCurrent()) return { aborted: true };
            const created = URL.createObjectURL(blob);
            if (!mountedRef.current) {
              URL.revokeObjectURL(created);
              finishSpeaking();
              return { audioUrl: "", blobUrl: "" };
            }
            blobUrl = created;
          }
        } catch (blobError) {
          // An abort must never fall through to the direct-URL fallback below,
          // otherwise the interrupted audio would start playing anyway.
          if (blobError?.name === "AbortError" || !isCurrent()) {
            return { aborted: true };
          }
          // Blob capture failed — fallback to direct URL
        }

        if (!isCurrent()) {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          return { aborted: true };
        }

        if (!mountedRef.current) {
          finishSpeaking();
          return { audioUrl: "", blobUrl: "" };
        }

        // The stream has been consumed; there is nothing left to cancel.
        clearActive();
        if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = blobUrl;
        setAudioUrl(blobUrl || nextAudioUrl);
        setStatus("ready");
        finishSpeaking();
        return { audioUrl: blobUrl || nextAudioUrl, blobUrl };
      } catch (ttsError) {
        if (ttsError?.name === "AbortError" || !isCurrent()) {
          // Interrupted (or superseded): stop() has already reset the UI state.
          return { aborted: true };
        }
        clearActive();
        finishSpeaking();
        setError(ttsError?.message || String(ttsError));
        setStatus("error");
        throw ttsError;
      }
    },
    [abortInFlight],
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortInFlight();
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
    };
  }, [abortInFlight]);

  return { speak, stop, status, error, audioUrl };
}
