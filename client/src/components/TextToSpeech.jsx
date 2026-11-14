import React from "react";
import { SendHorizontal, Eraser, Loader2, Square } from "lucide-react";
import { loadVoiceSettings } from "../utils/voiceSettings.js";


const EMOTION_PRESETS = [
  {
    id: "neutral",
    label: "Neutral",
    emoji: "😐",
    description: "Default balanced tone",
    promptPrefix: "",
    settingsOverride: {},
  },
  {
    id: "excited",
    label: "Excited",
    emoji: "🤩",
    description: "High energy and enthusiastic",
    promptPrefix: "[Excited and enthusiastic tone] ",
    settingsOverride: { stability: 0.3, style: 0.7 },
  },
  {
    id: "serious",
    label: "Serious",
    emoji: "🧐",
    description: "Calm and authoritative",
    promptPrefix: "[Serious and authoritative tone] ",
    settingsOverride: { stability: 0.8, style: 0.15 },
  },
  {
    id: "questioning",
    label: "Questioning",
    emoji: "🤔",
    description: "Curious and inquisitive",
    promptPrefix: "[Questioning and curious tone] ",
    settingsOverride: { stability: 0.4, style: 0.5 },
  },
  {
    id: "whispering",
    label: "Whispering",
    emoji: "🤫",
    description: "Soft and intimate",
    promptPrefix: "[Soft whispering tone] ",
    settingsOverride: { stability: 0.6, style: 0.35 },
  },
  {
    id: "cheerful",
    label: "Cheerful",
    emoji: "😊",
    description: "Warm and friendly",
    promptPrefix: "[Cheerful and warm tone] ",
    settingsOverride: { stability: 0.35, style: 0.6 },
  },
];

const MAX_CHARS = 300;
const DRAFT_KEY = "voiceforge_draft_text";

export default function TextToSpeech({
  onSpeak,
  disabled = false,
  status = "idle",
  isSpeechActive = false,
  onInterrupt = null,
  onTextChange = () => {},
  onSpoken = () => {},
}) {
  const [text, setText] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");
  const lastSpokenTextRef = React.useRef("");

  const trimmedText = text.trim();
  const charsLeft = MAX_CHARS - text.length;
  const characterCount = trimmedText.length;
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const estimatedDuration = wordCount
    ? ((wordCount / 150) * 60).toFixed(1)
    : "0.0";
  let durationCategory = "Short";
  if (estimatedDuration > 15) {
    durationCategory = "Medium";
  }
  if (estimatedDuration > 30) {
    durationCategory = "Long";
  }
  async function submit() {
    if (!trimmedText || disabled) return;
    const result = await onSpeak(trimmedText);
    // Interrupted before it finished: keep the text so it can be edited/resent.
    if (result?.aborted) return;
    setText("");
    onTextChange?.("");
    onSpoken?.();
  }
  function handleInterrupt() {
    setAnnouncement("Speech stopped.");
    onInterrupt?.();
  }
  React.useEffect(() => {
    if (isSpeechActive) setAnnouncement("");
  }, [isSpeechActive]);
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }
  return (
    <section className="flex h-full min-h-[420px] flex-col rounded-lg border border-ink/10 bg-white p-5 shadow-soft dark:border-border dark:bg-surface dark:text-neutral-100 dark:shadow-soft-dk">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Type to speak</h2>
          <p className="mt-1 text-sm text-ink/65 dark:text-muted">
            Press Enter to speak. Shift + Enter adds a new line.
          </p>
        </div>
      </div>
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement ||
          (status === "speaking" && "Synthesizing and playing speech audio...")}
        {status === "error" && "Speech synthesis encountered an error."}
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onTextChange?.(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Text to synthesize"
        aria-invalid={charsLeft < 0}
        aria-describedby="tts-char-hint"
        className={[
          "min-h-64 flex-1 resize-none rounded-md border bg-cloud p-4 text-lg leading-8 text-ink outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black dark:text-neutral-100 dark:placeholder:text-neutral-500",
          charsLeft < 0
            ? "border-red-400 focus:border-red-400 focus:ring-red-100 dark:border-red-700 dark:focus:ring-red-900/30"
            : "border-ink/15 focus:border-moss focus:ring-mint dark:border-border dark:focus:border-glow dark:focus:ring-glow/25",
        ].join(" ")}
        placeholder="Type what you want to say..."
        title="Type your message here and press Enter to speak"
      />
      <div
        id="tts-char-hint"
        className="mt-1 flex justify-between text-xs text-neutral-400"
      >
        <span>
          {wordCount} words ({characterCount} chars)
        </span>
        <span>
          Est: {estimatedDuration}s ({durationCategory})
        </span>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim() || status === "speaking"}
        title={
          status === "speaking"
            ? "Generating speech..."
            : "Speak the typed text"
        }
        aria-label={
          status === "speaking"
            ? "Generating speech..."
            : "Speak the typed text"
        }
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-coral px-5 py-3 font-bold text-white transition hover:bg-coral/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "speaking" ? (
          <>
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            Generating...
          </>
        ) : (
          <>
            <SendHorizontal size={18} aria-hidden="true" />
            Speak
          </>
        )}
      </button>
      {onInterrupt && isSpeechActive && (
        <button
          type="button"
          onClick={handleInterrupt}
          title="Stop speech (Esc)"
          aria-label="Stop speech"
          aria-keyshortcuts="Escape"
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-md border border-coral px-5 py-3 font-bold text-coral transition hover:bg-coral/10 focus:outline-none focus:ring-4 focus:ring-coral/30"
        >
          <Square size={16} fill="currentColor" aria-hidden="true" />
          Stop speech
          <kbd className="rounded border border-coral/40 px-1.5 text-xs font-semibold">
            Esc
          </kbd>
        </button>
      )}
    </section>
  );
}
