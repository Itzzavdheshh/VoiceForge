// Defines VoiceForge voice cloning and speech generation API routes.
import { Router } from "express";
import { cloneVoice, speak, streamSpeech } from "../controllers/voiceController.js";
import upload from "../middleware/upload.js";

const router = Router();

router.post("/clone", upload.single("audio"), cloneVoice);
router.post("/speak", speak);
router.get("/speak/stream/:token", streamSpeech);

export default router;
