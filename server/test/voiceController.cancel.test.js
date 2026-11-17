// Covers issue #448: cancelling speech (POST /speak/cancel) and aborting
// upstream Gradio jobs when the client interrupts playback.
import test from "node:test";
import assert from "node:assert/strict";

import { createRequest, createResponse, invoke } from "./helpers.js";
import {
  speak,
  streamSpeech,
  cancelSpeech,
  runCancellablePrediction,
} from "../controllers/voiceController.js";

process.env.MOCK_CHATTERBOX = "true";

async function newToken(apiKey = "") {
  const request = createRequest({
    headers: apiKey ? { "X-ElevenLabs-Api-Key": apiKey } : {},
    body: { text: "Hello there", voice_id: "voice_1" },
  });
  const response = createResponse();
  await invoke(speak, request, response);
  return response.jsonBody.speechId;
}

test("cancelSpeech drops a pending token so it can no longer stream", async () => {
  const token = await newToken();
  const res = createResponse();
  await invoke(cancelSpeech, createRequest({ body: { speechId: token } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonBody.cancelled, true);

  const streamRes = createResponse();
  await invoke(streamSpeech, createRequest({ query: { t: token } }), streamRes);
  assert.equal(streamRes.statusCode, 410);
});

test("cancelSpeech is idempotent for already-cancelled tokens", async () => {
  const token = await newToken();
  const call = async () => {
    const res = createResponse();
    await invoke(cancelSpeech, createRequest({ body: { speechId: token } }), res);
    return res;
  };
  assert.equal((await call()).jsonBody.cancelled, true);
  const second = await call();
  assert.equal(second.statusCode, 200);
  assert.equal(second.jsonBody.cancelled, false);
});

test("cancelSpeech rejects a mismatched API key and keeps the token valid", async () => {
  const token = await newToken("key-a");
  const res = createResponse();
  await invoke(
    cancelSpeech,
    createRequest({
      headers: { "X-ElevenLabs-Api-Key": "key-b" },
      body: { speechId: token },
    }),
    res,
  );
  assert.equal(res.statusCode, 403);

  const streamRes = createResponse();
  await invoke(
    streamSpeech,
    createRequest({
      headers: { "X-ElevenLabs-Api-Key": "key-a" },
      query: { t: token },
    }),
    streamRes,
  );
  assert.equal(streamRes.statusCode, 200);
});

test("cancelSpeech validates input without throwing", async () => {
  const missing = createResponse();
  await invoke(cancelSpeech, createRequest({ body: {} }), missing);
  assert.equal(missing.statusCode, 400);

  const garbage = createResponse();
  await invoke(
    cancelSpeech,
    createRequest({ body: { speechId: "not-a-real-token" } }),
    garbage,
  );
  assert.equal(garbage.statusCode, 200);
  assert.equal(garbage.jsonBody.cancelled, false);
});

test("runCancellablePrediction cancels the Gradio job on abort", async () => {
  let cancelCalls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const app = {
    submit() {
      return {
        cancel: async () => {
          cancelCalls += 1;
          release();
        },
        async *[Symbol.asyncIterator]() {
          await gate; // blocks like a queued job until cancelled
        },
      };
    },
  };
  const controller = new AbortController();
  const pending = runCancellablePrediction(app, "/x", [], controller.signal);
  controller.abort();
  await assert.rejects(pending, /Request aborted by client/);
  assert.equal(cancelCalls, 1);
});

test("runCancellablePrediction returns the data message on success", async () => {
  const app = {
    submit() {
      return {
        cancel: async () => {},
        async *[Symbol.asyncIterator]() {
          yield { type: "status" };
          yield { type: "data", data: [{ url: "http://x/a.wav" }] };
        },
      };
    },
  };
  const result = await runCancellablePrediction(app, "/x", [], null);
  assert.equal(result.data[0].url, "http://x/a.wav");
});
