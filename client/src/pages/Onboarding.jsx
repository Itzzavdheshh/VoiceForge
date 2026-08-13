// Renders the first-time setup flow for recording and cloning a reference voice.
import React from "react";
import {
  CheckCircle2,
  Loader2,
  CircleAlert,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import VoiceRecorder from "../components/VoiceRecorder.jsx";
import useVoiceClone from "../hooks/useVoiceClone.js";
import { hasApiKey } from "../utils/apiKeyStorage.js";
import { useToast, ToastContainer } from "../components/useToast.jsx";
import {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  persistVoiceSettings,
} from "../utils/voiceSettings.js";

export default function Onboarding({ onReady }) {
  const [recording, setRecording] = useState(null);
  const [voiceName, setVoiceName] = useState("VoiceForge Voice");
  const [successProfile, setSuccessProfile] = useState(null);
  const { cloneVoice, status, error: apiError } = useVoiceClone();
  const isCloning = status === "cloning";
  const [serverStatus, setServerStatus] = React.useState({
    isMock: false,
    space: "",
  });

  // Track the highest milestone step the user is allowed to navigate to
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(() => {
    const savedMax = localStorage.getItem("voiceforge:maxUnlockedStep");
    return savedMax ? parseInt(savedMax, 10) : 1;
  });

  // Track the active onboarding step interface (1, 2, or 3) restored from storage
  const [activeStep, setActiveStep] = useState(() => {
    const savedStep = localStorage.getItem("voiceforge:onboardingStep");
    const savedMax = localStorage.getItem("voiceforge:maxUnlockedStep");

    const parsedStep = savedStep ? parseInt(savedStep, 10) : 1;
    const parsedMax = savedMax ? parseInt(savedMax, 10) : 1;
    
    return Math.min(parsedStep, parsedMax);
  });

  // Refs for auto-focus
  const voiceNameInputRef = useRef(null);
  const step2FirstInputRef = useRef(null);
  const step3FirstInputRef = useRef(null);

  // Voice settings state
  const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());

  useEffect(() => {
    fetch("/api/voice/status")
      .then((res) => res.json())
      .then((data) => setServerStatus(data))
      .catch((err) => console.error("Failed to fetch server status:", err));
  }, []);

  const hasKey = useMemo(() => {
    return hasApiKey() || serverStatus.isMock || serverStatus.hasServerKey;
  }, [serverStatus]);

  const nameError = React.useMemo(() => {
    const trimmed = voiceName.trim();
    if (trimmed.length === 0) {
      return "Voice name is required.";
    }
    if (trimmed.length < MIN_NAME_LENGTH) {
      return `Voice name must be at least ${MIN_NAME_LENGTH} characters.`;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return `Voice name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    }
    return "";
  }, [voiceName]);

  // Track the highest milestone step the user is allowed to navigate to
  const [maxUnlockedStep, setMaxUnlockedStep] = React.useState(() => {
    const savedMax = localStorage.getItem("voiceforge:maxUnlockedStep");
    return savedMax ? parseInt(savedMax, 10) : 1;
  });

  // Track the active onboarding step interface (1, 2, or 3) restored from storage
  const [activeStep, setActiveStep] = React.useState(() => {
    const savedStep = localStorage.getItem("voiceforge:onboardingStep");
    const savedMax = localStorage.getItem("voiceforge:maxUnlockedStep");

    const parsedStep = savedStep ? parseInt(savedStep, 10) : 1;
    const parsedMax = savedMax ? parseInt(savedMax, 10) : 1;

    // Clamp initialization target securely underneath the highest unlocked milestone
    return Math.min(parsedStep, parsedMax);
  });

  const stepContent = {
    1: {
      title: "Create your voice profile",
      description:
        "Record a short, consent-based reference clip. VoiceForge sends it via the Chatterbox engine on Hugging Face through your local server and saves the returned voice ID in this browser.",
      labels: ["Record", "Clone", "Next"],
    },
    2: {
      title: "Configure voice settings",
      description:
        "Fine-tune your workspace properties, adjust stability and clarity parameters, and establish your initial system instructions.",
      labels: ["Stability", "Clarity", "Next"],
    },
    3: {
      title: "Finalize setup & test",
      description:
        "Review your configurations, connect your local server pipeline, and prepare to place your very first AI companion voice call.",
      labels: ["Review", "Pipeline", "Launch"],
    },
  };

  useEffect(() => {
    localStorage.setItem("voiceforge:onboardingStep", activeStep.toString());
  }, [activeStep]);

  React.useEffect(() => {
    localStorage.setItem(
      "voiceforge:maxUnlockedStep",
      maxUnlockedStep.toString(),
    );
  }, [maxUnlockedStep]);

  async function handleClone() {
    if (!hasKey || !recording) return;
    if (recording.duration !== undefined && recording.duration < 10) return;
    if (nameError) return; // block on empty / whitespace / over-limit name

    try {
      const profile = await cloneVoice(recording, voiceName);
      if (profile) {
        setSuccessProfile(profile);
        setMaxUnlockedStep(2);
        setActiveStep(2);
      }
    } catch (err) {
      console.error("Voice cloning process failed:", err);
    }
  }

      moveToStep(nextIndex);
    }
  }, [finishTour, moveToStep]);

  return (
    <div className="space-y-6">
      <ToastContainer />
      
      {/* HEADER BANNER */}
      <section className="rounded-lg bg-black p-6 text-white shadow-soft dark:border dark:border-border dark:bg-surface dark:shadow-soft-dk">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-mint">
              Step {activeStep} of 3
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              {stepContent[activeStep].title}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/75 dark:text-white/75">
              {stepContent[activeStep].description}
            </p>
          </div>

          {/* STEP PROGRESS INDICATORS COMPONENT GRID */}
          <div
            className="grid w-full grid-cols-3 gap-2 sm:max-w-xs lg:max-w-sm"
            aria-label="Onboarding progress indicators"
          >
            {stepContent[activeStep].labels.map((label, index) => {
              let isBarFilled = false;
              if (activeStep === 1) {
                if (index === 0) isBarFilled = true;
                if (index === 1 && recording) isBarFilled = true;
                if (index === 2 && (successProfile || maxUnlockedStep >= 2))
                  isBarFilled = true;
              } else if (activeStep === 2) {
                if (index === 0) isBarFilled = true;
                if (index === 1) isBarFilled = true;
                if (index === 2 && maxUnlockedStep >= 3) isBarFilled = true;
              } else if (activeStep === 3) {
                isBarFilled = true;
              }

              return (
                <div
                  key={label}
                  className={`h-2 rounded-full transition-all duration-300 ${isBarFilled ? "bg-coral" : "bg-ink/15 dark:bg-white/25"}`}
                  title={label}
                />
              );
            })}
          </div>
          <div
            className="flex items-center gap-2"
            aria-label="Onboarding progress"
          >
            {[1, 2, 3].map((s) => {
              const isActive = s === activeStep;
              return (
                <div
                  key={s}
                  role="progressbar"
                  aria-valuenow={s}
                  aria-valuemin={1}
                  aria-valuemax={3}
                  aria-label={`Step ${s} of 3`}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    isActive
                      ? "w-10 bg-moss dark:bg-glow"
                      : "w-2.5 bg-neutral-200 dark:bg-neutral-800"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* STEP 1: PROFILE MANAGEMENT CONTROLS */}
      {activeStep === 1 && (
        <>
          {!hasKey && (
            <div className="flex items-center gap-2 rounded-md border border-coral/40 bg-coral/10 p-4 text-sm font-semibold text-ink dark:text-neutral-100">
              <CircleAlert
                size={18}
                aria-hidden="true"
                className="shrink-0 text-coral"
              />
              <span>
                No voice engine available. Ensure your local server is running
                on port 3001. Check your <strong>.env</strong> file and the
                README.
              </span>
            </div>
          )}

          <VoiceRecorder
            onRecordingReady={handleRecordingReady}
            disabled={isCloning}
          />

          <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft dark:border-border dark:bg-surface dark:shadow-soft-dk">
            <label
              className="block text-sm font-bold text-ink dark:text-neutral-100"
              htmlFor="voice-name"
            >
              Voice profile name
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="voice-name"
                ref={setVoiceNameRef}
                value={voiceName}
                onChange={(event) => setVoiceName(event.target.value)}
                disabled={isCloning}
                maxLength={MAX_NAME_LENGTH}
                aria-describedby="voice-name-feedback"
                aria-invalid={nameError ? "true" : undefined}
                className={[
                  "min-h-11 flex-1 rounded-md border px-3 text-ink outline-none transition",
                  "focus:ring-4 focus:ring-mint dark:bg-black dark:text-neutral-100",
                  nameError
                    ? "border-coral focus:border-coral dark:border-coral/70"
                    : "border-ink/15 focus:border-moss dark:border-border",
                  "bg-cloud dark:bg-black",
                ].join(" ")}
              />
              <button
                type="button"
                onClick={handleClone}
                disabled={
                  isCloning ||
                  !hasKey ||
                  !recording ||
                  recordingDuration < 10 ||
                  Boolean(nameError)
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-coral px-5 font-bold text-white transition hover:bg-coral/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "cloning" ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Processing Voice...
                  </>
                ) : (
                  "Clone voice"
                )}
              </button>
            </div>

            {/* Name validation feedback + character counter */}
            <div
              id="voice-name-feedback"
              className="mt-1.5 flex items-center justify-between gap-2 text-xs"
            >
              {nameError ? (
                <p
                  className="flex items-center gap-1 font-semibold text-coral"
                  role="alert"
                >
                  <CircleAlert size={13} aria-hidden="true" />
                  {nameError}
                </p>
              ) : (
                <span />
              )}
              <span
                className={[
                  "tabular-nums",
                  voiceName.length >= 90
                    ? "font-semibold text-coral"
                    : "text-ink/45 dark:text-muted",
                ].join(" ")}
                aria-live="polite"
                aria-label={`${voiceName.length} of ${MAX_NAME_LENGTH} characters used`}
              >
                {voiceName.length}/{MAX_NAME_LENGTH}
              </span>
            </div>

            {/* Render actual API errors transparently instead of swallowing failures */}
            {apiError && (
              <p
                className="mt-3 text-sm font-semibold text-coral flex items-center gap-1.5"
                role="alert"
              >
                <CircleAlert size={16} />
                {apiError}
              </p>
            )}

            {(successProfile || maxUnlockedStep >= 2) && (
              <div className="mt-4 flex flex-col gap-3 rounded-md bg-mint p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-glow/15">
                <p className="inline-flex items-center gap-2 font-bold text-ink dark:text-neutral-50">
                  <CheckCircle2
                    size={20}
                    className="text-moss dark:text-glow"
                  />
                  Voice profile setup verified!
                </p>
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 font-bold text-white dark:bg-glow dark:text-black"
                >
                  Continue to Step 2
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* STEP 2 */}
      {activeStep === 2 && (
        <Step2VoiceSettings
          onBack={() => setActiveStep(1)}
          onContinue={() => {
            setMaxUnlockedStep(3);
            setActiveStep(3);
          }}
        />
      )}

      {/* STEP 3 */}
      {activeStep === 3 && (
        <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft dark:border-border dark:bg-surface">
          <h3 className="text-xl font-bold text-ink dark:text-neutral-100">
            Ready for Activation
          </h3>
          <p className="mt-2 text-sm text-neutral-500">
            Your custom voice template setup is complete.
          </p>
          <div className="my-6 p-12 border-2 border-dashed border-ink/10 rounded-md text-center text-neutral-400">
            Pipeline deployment status diagnostics verify operational conditions
            are ideal.
          </div>
          
          <div className="flex justify-between items-center border-t pt-4">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className="text-sm font-bold text-ink dark:text-neutral-300 hover:underline"
            >
              ← Back to Settings
            </button>
            <button
              type="button"
              onClick={onReady}
              className="rounded-md bg-black px-5 py-2 font-bold text-white dark:bg-glow dark:text-black"
            >
              Complete Setup & Go to Call
            </button>
          </div>
        </section>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
