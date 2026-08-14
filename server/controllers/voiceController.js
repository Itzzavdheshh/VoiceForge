// Implements Chatterbox Multilingual TTS voice cloning and speech proxy handlers.
// Uses the Hugging Face Gradio client to call ResembleAI/Chatterbox-Multilingual-TTS.
import crypto from "crypto";
import { getIsMock } from "../utils/mock.js";
import { isValidLanguageCode, toChatterboxLanguageCode } from "../utils/languages.js";

// ---------------------------------------------------------------------------
// In-memory voice store: maps voice_id to { name, audioBuffer, mimeType, expiresAt }
// In production you would persist this to a database or object store.
// ---------------------------------------------------------------------------
export const voiceStore = new Map();

// Maximum number of pending speech streams allowed in memory to prevent heap exhaustion.
// When exceeded, the oldest entry is evicted. Configurable via MAX_PENDING_STREAMS.
const MAX_PENDING_STREAMS = parseInt(process.env.MAX_PENDING_STREAMS, 10) || 200;

// Callers must supply their own ElevenLabs key via the X-ElevenLabs-Api-Key
// request header. The server no longer falls back to its own environment key
// so anonymous requests cannot charge the server operator's account.
function requireApiKey(request) {
  const apiKey = request.get("X-ElevenLabs-Api-Key")?.trim();
  if (!apiKey) {
    const error = new Error(
      "An ElevenLabs API key is required. Add it via the X-ElevenLabs-Api-Key header."
    );
    error.status = 401;
    throw error;
  }
  return apiKey;
}

// Sanitizes a filename by removing path traversal sequences and special characters.
// Prevents injection attacks and ensures safe transmission to external APIs.
function sanitizeFilename(filename) {
  return (filename || "reference.webm")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .substring(0, 100);
}

async function readElevenLabsError(response) {
  const text = await response.text();
  try {
    const rawJson = Buffer.from(token, "base64url").toString("utf8");
    const { iv, tag, data } = JSON.parse(rawJson);

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      ENCRYPTION_KEY,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));

    let decrypted = decipher.update(data, "base64", "utf8");
    decrypted += decipher.final("utf8");

    const payload = JSON.parse(decrypted);

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      const error = new Error("Speech stream has expired.");
      error.status = 403;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.status === 403) {
      throw error;
    }
    const err = new Error("Audio link expired — please generate speech again.");
    err.status = 400;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Gradio / Chatterbox voice generation
// ---------------------------------------------------------------------------

let cachedGradioClient = null;
let currentSpaceIdentifier = null;

async function getGradioClient() {
  const spaceIdentifier = process.env.VOICE_ENGINE_SPACE || "ResembleAI/Chatterbox-Multilingual-TTS";
  if (!cachedGradioClient || currentSpaceIdentifier !== spaceIdentifier) {
    const { client } = await import("@gradio/client");
    try {
      cachedGradioClient = await withTimeout(client(spaceIdentifier), 10000, "Chatterbox client init");
      currentSpaceIdentifier = spaceIdentifier;
    } catch (err) {
      if (
        err.message?.includes("SPACE_INITIALIZING") || 
        err.message?.includes("Space is sleeping") || 
        err.message?.includes("is sleeping") ||
        err.message?.includes("Chatterbox client init timed out")
      ) {
        const error = new Error("AI Engine is waking up");
        error.isColdStart = true;
        error.status = 503;
        throw error;
      }
      throw err;
    }
  }
  return cachedGradioClient;
}
/**
 * Calls the ResembleAI/Chatterbox-Multilingual-TTS Gradio space and returns
 * the URL of the generated audio file.
 *
 * @param {Buffer}  audioBuffer        Raw bytes of the reference voice recording.
 * @param {string}  mimeType           MIME type of the reference audio (e.g. "audio/webm").
 * @param {string}  targetText         Text to synthesize (max 300 chars).
 * @param {string}  [languageCode]     Chatterbox language code, e.g. "en".
 * @param {object}  [voiceSettings]    Optional Chatterbox generation settings.
 * @returns {Promise<string>}          Direct URL to the generated audio file.
 */
async function generateClonedVoice(
  audioBuffer,
  mimeType,
  targetText,
  languageCode = "en",
  voiceSettings = {},
  abortSignal = null,
) {
  const normalizedVoiceSettings =
    voiceSettings && typeof voiceSettings === "object" ? voiceSettings : {};

  // Check if space is running to avoid infinite stalls on cold-starts
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const hfRes = await fetch(`https://huggingface.co/api/spaces/${spaceIdentifier}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (hfRes.ok) {
      const hfData = await hfRes.json();
      const stage = hfData.runtime?.stage;
      if (stage && stage !== "RUNNING") {
        const { client } = await import("@gradio/client");
        // Trigger client initialization asynchronously in background to wake it up
        client(spaceIdentifier).catch(() => {});
        
        const error = new Error(`Voice engine is warming up (current status: ${stage}). Please try again shortly.`);
        error.status = 503;
        throw error;
      }
    }
  } catch (err) {
    if (err.status === 503) {
      throw err;
    }
    console.warn("[VoiceForge] Failed to check space status:", err.message);
  }

  const { client } = await import("@gradio/client");
  /** @type {import("@gradio/client").GradioApp} */
  const app = await withTimeout(
    client(spaceIdentifier),
    10000,
    "Chatterbox client init",
  );

  // Wrap the raw Buffer in a Blob so Gradio treats it as a file upload.
  const referenceBlob = new Blob([audioBuffer], { type: mimeType });
  const exaggeration = clampNumber(normalizedVoiceSettings.style, 0.25, 2, 0.5);
  const cfgWeight = clampNumber(normalizedVoiceSettings.stability, 0.2, 1, 0.5);
  const temperature = clampNumber(
    normalizedVoiceSettings.temperature,
    0.05,
    5,
    0.8,
  );
  const seed = Number.isInteger(normalizedVoiceSettings.seed)
    ? normalizedVoiceSettings.seed
    : 0;

  const result = await withTimeout(
    app.predict("/generate_tts_audio", [
      targetText,       // Text string to synthesize (max 300 chars)
      languageCode,     // Language code string (e.g. "en", "hi")
      referenceBlob,    // Reference audio Blob
      exaggeration,     // Exaggeration intensity float (Default: 0.5)
      temperature,      // Generation temperature float (Default: 0.8)
      seed,             // Seed integer (0 = randomised)
      cfgWeight         // CFG weight / Pace factor float (Default: 0.5)
    ]),
    30000,
    "Chatterbox predict",
    abortSignal
  );

  const audioUrl = result.data[0].url;
  if (!audioUrl) {
    throw new Error("Chatterbox returned no audio URL.");
  }
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

// Generate a stable identifier used to deduplicate clone requests.
// Authenticated flows should pass a per-user ID via a real session/auth middleware;
// without session middleware wired up we fall back to the client IP.
function getRequestLockId(request) {
  const ip = request.ip || request.socket?.remoteAddress || "unknown";
  return `ip:${ip}`;
}

// Atomically check and acquire the lock for a clone request.
// Returns true if the lock was acquired (no request was in-flight),
// false if a request is already in progress (duplicate - reject with 429).
function tryAcquireCloneLock(lockId) {
  const lockData = activeCloneRequests.get(lockId);

  if (lockData) {
    // Clean up expired locks (older than 5 minutes) and allow the request.
    if (Date.now() - lockData.timestamp > 300000) {
      activeCloneRequests.delete(lockId);
    } else {
      return false;
    }
  }

  activeCloneRequests.set(lockId, { timestamp: Date.now() });
  return true;
}

// Release a lock for a clone request.
function releaseCloneLock(lockId) {
  activeCloneRequests.delete(lockId);
}

export async function cloneVoice(request, response, next) {
  const lockId = getRequestLockId(request);

  try {
    const audioFile = request.file;

    if (!audioFile) {
      response.status(400).json({ error: "Reference audio is required." });
      return;
    }

    const formData = new FormData();
    formData.append("name", request.body.name || "VoiceForge Voice");
    formData.append("description", "Voice profile created locally by VoiceForge.");
    const safeName = sanitizeFilename(audioFile.originalname);
    formData.append("files", new Blob([audioFile.buffer], { type: audioFile.mimetype }), safeName);

    // --- mock mode: return a deterministic fixture voice_id ---
    if (getIsMock()) {
      console.warn("[VoiceForge] MOCK_ELEVENLABS: skipping real voice clone, returning fixture.");
      releaseCloneLock(lockId);
      response.json({
        voice_id: request.body.voice_id || "mock-voice-id-00000000",
        name: request.body.name || "VoiceForge Voice (mock)",
      });
      return;
    }

    // Store the audio buffer server-side so it can be used during speak/stream.
    const voiceId = crypto.randomUUID();

    // Fix (IDOR): voice_id alone used to be sufficient to use someone else's
    // cloned voice, since voiceStore has no per-user access control and
    // voice_id can leak via logs, referrers, shared links, etc. We now mint
    // a separate high-entropy owner token at clone time and only store its
    // hash; speak() must present the matching plaintext token to use this
    // voice. The plaintext token is returned once, here, and never again.
    const ownerToken = crypto.randomBytes(24).toString("base64url");
    const ownerTokenHash = crypto
      .createHash("sha256")
      .update(ownerToken)
      .digest("hex");

    voiceStore.set(voiceId, {
      name: request.body.name || "VoiceForge Voice",
      audioBuffer: audioFile.buffer,
      mimeType: audioFile.mimetype,
      ownerTokenHash,
      expiresAt: Date.now() + VOICE_STORE_TTL_MS
    });

    if (!elevenResponse.ok) {
      const error = new Error(await readElevenLabsError(elevenResponse));
      error.status = elevenResponse.status;
      throw error;
    }

    const payload = await elevenResponse.json();
    releaseCloneLock(lockId);
    response.json({
      voice_id: voiceId,
      owner_token: ownerToken,
      name: request.body.name || "VoiceForge Voice",
    });
  } catch (error) {
    releaseCloneLock(lockId);
    next(error);
  }
}

// Maps speechId -> { text, voiceId, apiKey, mergedSettings, timeout }.
// Keys are unguessable UUIDs (see speak) and entries are single-use.
const pendingStreams = new Map();

/**
 * Clears and removes a pending speech stream.
 *
 * @param {string} speechId The ID of the pending speech stream to clean up.
 * @returns {object|undefined} The deleted stream entry if found, otherwise undefined.
 */
function deletePendingStream(speechId) {
  const entry = pendingStreams.get(speechId);
  if (!entry) {
    return undefined;
  }
  clearTimeout(entry.timeout);
  pendingStreams.delete(speechId);
  return entry;
}

// Drop the oldest entries until the store is below its configured cap. Map
// preserves insertion order, so the first key is always the oldest.
function evictOldestPendingStreams() {
  while (pendingStreams.size >= PENDING_STREAMS_MAX) {
    const oldestKey = pendingStreams.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    deletePendingStream(oldestKey);
  }
}

/**
 * Express handler to initiate a speech request.
 * Validates parameters and returns a signed token with a streaming audio URL.
 *
 * @param {object} request Express request object.
 * @param {object} response Express response object.
 * @param {function} next Express next middleware callback.
 */
export async function speak(request, response, next) {
  try {
    const {
      text,
      voice_id: voiceId,
      owner_token: ownerToken,
      language_code,
      voice_settings,
    } = request.body;

    if (pendingStreams.size >= PENDING_STREAMS_MAX) {
      response.status(503).json({
        error:
          "Too many pending speech requests. Please retry after retrieving or cancelling existing audio streams.",
      });
      return;
    }
    // Fix (Issue 1): trim both fields before checking so whitespace-only
    // strings ("   ") are treated the same as missing values.
    const trimmedText = typeof text === "string" ? text.trim() : "";
    const trimmedVoiceId = typeof voiceId === "string" ? voiceId.trim() : "";

    if (!trimmedText && !trimmedVoiceId) {
      response
        .status(400)
        .json({ error: "Both text and voice_id are required." });
      return;
    }
    if (!trimmedText) {
      response
        .status(400)
        .json({ error: "text is required and must not be blank." });
      return;
    }
    if (!trimmedVoiceId) {
      response
        .status(400)
        .json({ error: "voice_id is required and must not be blank." });
      return;
    }
    pruneVoiceStore();
    if (!getIsMock() && !voiceStore.has(trimmedVoiceId)) {
      response.status(404).json({
        error: "Voice profile not found. Please re-clone your voice.",
      });
      return;
    }
    if (trimmedText.length > 300) {
      response.status(400).json({
        error: "Text too long; maximum 300 characters for Chatterbox TTS.",
      });
      return;
    }
    if (!isValidLanguageCode(language_code)) {
      response.status(400).json({
        error: `Unsupported language code "${language_code}". See Chatterbox Multilingual docs for supported codes.`,
      });
      return;
    }

    // Fix (IDOR): verify the caller actually owns this voice_id before
    // queuing any synthesis work. Skipped in mock mode since cloneVoice
    // never persists a real voiceStore entry (or owner token) there.
    if (!getIsMock()) {
      pruneVoiceStore();
      const voiceEntry = voiceStore.get(trimmedVoiceId);
      if (!voiceEntry) {
        response.status(404).json({
          error: "Voice profile not found. Please re-clone your voice.",
        });
        return;
      }
      const trimmedOwnerToken =
        typeof ownerToken === "string" ? ownerToken.trim() : "";
      const providedHash = trimmedOwnerToken
        ? crypto.createHash("sha256").update(trimmedOwnerToken).digest("hex")
        : null;
      const isAuthorized =
        !!providedHash &&
        providedHash.length === voiceEntry.ownerTokenHash.length &&
        crypto.timingSafeEqual(
          Buffer.from(providedHash),
          Buffer.from(voiceEntry.ownerTokenHash),
        );
      if (!isAuthorized) {
        response
          .status(403)
          .json({ error: "Invalid or missing owner_token for this voice_id." });
        return;
      }
    }

    const defaultVoiceSettings = {
      stability: 0.45,
      style: 0.5,
      temperature: 0.8
    };

    const sanitizedSettings = {};
    if (voice_settings !== undefined && voice_settings !== null) {
      if (typeof voice_settings !== "object" || Array.isArray(voice_settings)) {
        response
          .status(400)
          .json({ error: "voice_settings must be a plain object." });
        return;
      }
      if (voice_settings.stability !== undefined) {
        if (
          typeof voice_settings.stability !== "number" ||
          !Number.isFinite(voice_settings.stability) ||
          voice_settings.stability < 0 ||
          voice_settings.stability > 1
        ) {
          response.status(400).json({
            error: "stability must be a finite number between 0 and 1.",
          });
          return;
        }
        sanitizedSettings.stability = voice_settings.stability;
      }
      if (voice_settings.style !== undefined) {
        if (
          typeof voice_settings.style !== "number" ||
          !Number.isFinite(voice_settings.style) ||
          voice_settings.style < 0 ||
          voice_settings.style > 1
        ) {
          response
            .status(400)
            .json({ error: "style must be a finite number between 0 and 1." });
          return;
        }
        sanitizedSettings.style = voice_settings.style;
      }
      if (voice_settings.temperature !== undefined) {
        if (
          typeof voice_settings.temperature !== "number" ||
          !Number.isFinite(voice_settings.temperature) ||
          voice_settings.temperature < 0.05 ||
          voice_settings.temperature > 5
        ) {
          response.status(400).json({
            error: "temperature must be a finite number between 0.05 and 5.",
          });
          return;
        }
        sanitizedSettings.temperature = voice_settings.temperature;
      }
    }
    sanitizedSettings.stability = voice_settings.stability;
  }
  if (voice_settings.style !== undefined) {
    if (typeof voice_settings.style !== "number" || !Number.isFinite(voice_settings.style) || voice_settings.style < 0 || voice_settings.style > 2) {
      response.status(400).json({ error: "style must be a finite number between 0 and 2." });
      return;
    }
    sanitizedSettings.style = voice_settings.style;
  }
  if (voice_settings.temperature !== undefined) {
    if (typeof voice_settings.temperature !== "number" || !Number.isFinite(voice_settings.temperature) || voice_settings.temperature < 0.05 || voice_settings.temperature > 5) {
      response.status(400).json({ error: "temperature must be a finite number between 0.05 and 5." });
      return;
    }
    sanitizedSettings.temperature = voice_settings.temperature;
  }
}
    const mergedSettings = { ...defaultVoiceSettings, ...sanitizedSettings };

    // Enforce maximum pending streams limit to prevent memory exhaustion.
    // If limit is exceeded, evict the oldest entry (first in iteration order).
    if (pendingStreams.size > MAX_PENDING_STREAMS) {
      const oldestKey = pendingStreams.keys().next().value;
      pendingStreams.delete(oldestKey);
    }

    // Set a timeout to clean up if the stream is never requested within 60s
    setTimeout(() => {
      pendingStreams.delete(speechId);
    }, 60000);

    response.json({
      speechId: token,
      audioUrl: `/api/voice/speak/stream?t=${token}`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Express handler to stream generated Speech synthesis audio back to the client.
 * Decrypts and validates the stream token, initiates Chatterbox synthesis via Gradio client,
 * and proxies the generated audio chunks.
 *
 * @param {object} request Express request object.
 * @param {object} response Express response object.
 * @param {function} next Express next middleware callback.
 */
export async function streamSpeech(request, response, next) {
  try {
    const { speechId } = request.params;
    const requestApiKey = request.get("X-ElevenLabs-Api-Key")?.trim();

    const streamData = pendingStreams.get(speechId);

    // Fix (replay protection): decryptToken only checks that the token is
    // authentic and not expired - it does not check that it hasn't already
    // been consumed. Previously this only *checked* pendingStreams.has(),
    // and the entry wasn't removed until the `finally` block after
    // generation completed - so two replays arriving within that window
    // (or within the 60s token validity window generally) could both pass
    // the check and each trigger a full, costly Chatterbox generation.
    //
    // Fix: consume (delete) the pending entry atomically right here, before
    // any async work starts. A missing/undefined entry means the token was
    // already redeemed (or never existed), so we 410. The later cleanup
    // calls to deletePendingStream() elsewhere in this handler are now
    // no-ops for the happy path, but are kept as a safety net for the
    // abort/mock code paths.
    const pendingEntry = speechId ? deletePendingStream(speechId) : undefined;
    if (!pendingEntry) {
      response.status(410).json({
        error:
          "This speech token has already been used or has expired. Please request a new one.",
      });
      return;
    }

    // Verify the caller's API key matches the key used to create the speech stream.
    // This prevents unauthorized callers from using another user's speechId to consume their quota.
    if (requestApiKey !== streamData.apiKey) {
      response.status(403).json({ error: "Unauthorized. The API key provided does not match the speech request." });
      return;
    }

    // Clean up immediately after retrieving parameters to prevent memory leaks
    pendingStreams.delete(speechId);

    // Resolve the stored reference audio for this voice profile.
    const db = await getDb();
    const voiceEntry = await db.get('SELECT * FROM voice_profiles WHERE voice_id = ?', [voiceId]);
    if (!voiceEntry) {
      response.status(404).json({
        error: "Voice profile not found. Please re-clone your voice.",
      });
      return;
    }

    const chatterboxLanguage = toChatterboxLanguageCode(language_code);

    // Set up abortion for client disconnect
    const generateController = new AbortController();
    const onClose = () => {
      console.log("[VoiceForge] Request aborted by client");
      if (speechId) deletePendingStream(speechId);
      generateController.abort();
    };
    request.on("close", onClose);

    // Call Chatterbox and get back a direct audio URL.
    let audioUrl;
    try {
      audioUrl = await generateClonedVoice(
        voiceEntry.audio_data,
        voiceEntry.mime_type,
        text,
        chatterboxLanguage,
        voice_settings,
        generateController.signal,
      );
    } catch (error) {
      if (error.message === "Request aborted by client") {
        console.log("[VoiceForge] Inference canceled. Cleanup completed.");
        return; // Stop processing, request is already closed
      }
      if (error.message.includes("timed out")) {
        response.status(504).json({ error: error.message });
        return;
      }
      if (error.status === 503) {
        response.status(503).json({ error: error.message });
        return;
      }
      throw error;
    } finally {
      request.off("close", onClose);
      if (speechId) deletePendingStream(speechId);
    }

    // Proxy the audio bytes back to the client so they don't need to reach
    // the Gradio space directly (avoids CORS issues in the browser).
    let upstream;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      upstream = await fetch(audioUrl, { signal: controller.signal });
      clearTimeout(timer);
    } catch (error) {
      if (error.name === "AbortError") {
        response.status(504).json({
          error:
            "Failed to fetch generated audio from Chatterbox due to timeout.",
        });
        return;
      }
      throw error;
    }
    if (!upstream.ok) {
      response
        .status(502)
        .json({ error: "Failed to fetch generated audio from Chatterbox." });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "audio/wav";
    response.setHeader("Content-Type", contentType);
    response.setHeader("Transfer-Encoding", "chunked");

    const reader = upstream.body.getReader();

    request.on("close", () => {
      reader.cancel().catch((err) => console.error("Error cancelling Chatterbox reader:", err));
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(value);
      }
      response.end();
    } catch (streamError) {
      console.error("Stream reading error:", streamError);
      if (!response.headersSent) {
        next(streamError);
      } else {
        response.end();
      }
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Express handler to check the status, active engine name, and target space identifier.
 *
 * @param {object} request Express request object.
 * @param {object} response Express response object.
 */
export function getStatus(request, response) {
  response.json({
    isMock: getIsMock(),
    engine: "ResembleAI/Chatterbox-Multilingual-TTS",
    space:
      process.env.VOICE_ENGINE_SPACE ||
      "ResembleAI/Chatterbox-Multilingual-TTS",
  });
}

/**
 * Express handler to get all saved voice profiles (excluding binary audio data).
 */
export async function getProfiles(request, response, next) {
  try {
    const db = await getDb();
    const profiles = await db.all('SELECT voice_id, name, created_at FROM voice_profiles ORDER BY created_at DESC');
    const mappedProfiles = profiles.map(p => ({
      id: p.voice_id,
      voice_id: p.voice_id,
      name: p.name,
      createdAt: p.created_at
    }));
    response.json(mappedProfiles);
  } catch (error) {
    next(error);
  }
}

/**
 * Express handler to delete a saved voice profile.
 */
export async function deleteProfile(request, response, next) {
  try {
    const { voiceId } = request.params;
    const db = await getDb();
    await db.run('DELETE FROM voice_profiles WHERE voice_id = ?', [voiceId]);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
}
