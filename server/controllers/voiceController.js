// Implements ElevenLabs voice cloning and text-to-speech proxy handlers.
import crypto from "crypto";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

const STREAM_SECRET = process.env.STREAM_SECRET || crypto.randomBytes(32).toString("hex");
const ENCRYPTION_KEY = crypto.createHash("sha256").update(STREAM_SECRET).digest();
const IV_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";

function encryptToken(payload) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag().toString("base64");
  
  const tokenData = {
    iv: iv.toString("base64"),
    tag: authTag,
    data: encrypted
  };
  
  return Buffer.from(JSON.stringify(tokenData)).toString("base64url");
}

function decryptToken(token) {
  try {
    const rawJson = Buffer.from(token, "base64url").toString("utf8");
    const { iv, tag, data } = JSON.parse(rawJson);
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      ENCRYPTION_KEY,
      Buffer.from(iv, "base64")
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
    const err = new Error("Invalid or tampered speech token.");
    err.status = 400;
    throw err;
  }
}

function getApiKey(request) {
  return request.get("X-ElevenLabs-Api-Key") || process.env.ELEVENLABS_API_KEY;
}

function requireApiKey(request) {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    const error = new Error("Missing ElevenLabs API key. Add it to .env or Settings.");
    error.status = 400;
    throw error;
    // console.log(process.env.ELEVENLABS_API_KEY);
  }
  return apiKey;
}

async function readElevenLabsError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.detail?.message || payload.detail || payload.error || text;
  } catch {
    return text || `ElevenLabs request failed with status ${response.status}.`;
  }
}

export async function cloneVoice(request, response, next) {
  try {
    const apiKey = requireApiKey(request);
    const audioFile = request.file;

    if (!audioFile) {
      response.status(400).json({ error: "Reference audio is required." });
      return;
    }

    const formData = new FormData();
    formData.append("name", request.body.name || "VoiceForge Voice");
    formData.append("description", "Voice profile created locally by VoiceForge.");
    formData.append("files", new Blob([audioFile.buffer], { type: audioFile.mimetype }), audioFile.originalname || "reference.webm");

    const elevenResponse = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData
    });

    if (!elevenResponse.ok) {
      const error = new Error(await readElevenLabsError(elevenResponse));
      error.status = elevenResponse.status;
      throw error;
    }

    const payload = await elevenResponse.json();
    response.json({
      voice_id: payload.voice_id,
      name: request.body.name || "VoiceForge Voice"
    });
  } catch (error) {
    next(error);
  }
}

export async function speak(request, response, next) {
  try {
    const apiKey = requireApiKey(request);
    const { text, voice_id: voiceId } = request.body;

    if (!text || !voiceId) {
      response.status(400).json({ error: "Both text and voice_id are required." });
      return;
    }

    const expiresAt = Date.now() + 60000;
    const token = encryptToken({ text, voiceId, apiKey, expiresAt });

    response.json({
      speechId: token,
      audioUrl: `/api/voice/speak/stream/${token}`
    });
  } catch (error) {
    next(error);
  }
}

export async function streamSpeech(request, response, next) {
  try {
    const { token } = request.params;
    const { text, voiceId, apiKey } = decryptToken(token);

    const elevenResponse = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true
        }
      })
    });

    if (!elevenResponse.ok) {
      const errorText = await readElevenLabsError(elevenResponse);
      response.status(elevenResponse.status).send(errorText);
      return;
    }

    response.setHeader("Content-Type", "audio/mpeg");
    response.setHeader("Transfer-Encoding", "chunked");

    const reader = elevenResponse.body.getReader();

    request.on("close", () => {
      reader.cancel().catch((err) => console.error("Error cancelling ElevenLabs reader:", err));
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(value);
    }
    response.end();
  } catch (error) {
    next(error);
  }
}
