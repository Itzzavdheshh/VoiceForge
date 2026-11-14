// Decides whether an Escape keypress should interrupt speech.
// Escape must stay usable for closing dialogs, dropdowns and for editing
// other inputs, so it only interrupts when nothing else claims the key.

const TTS_TEXTAREA_SELECTOR = 'textarea[aria-label="Text to synthesize"]';
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="listbox"], [role="menu"], [aria-expanded="true"]';

function isEditable(element) {
  if (!element || typeof element.closest !== "function") return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable === true
  );
}

export function shouldInterruptOnEscape(event, isSpeechActive) {
  if (!isSpeechActive) return false; // never touch Escape when idle
  if (event.key !== "Escape") return false;
  if (event.defaultPrevented || event.isComposing) return false; // IME / handled
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }

  const target = event.target;
  if (target && typeof target.closest === "function") {
    if (target.closest(OVERLAY_SELECTOR)) return false;
    if (isEditable(target) && !target.closest(TTS_TEXTAREA_SELECTOR)) {
      return false;
    }
  }
  if (
    typeof document !== "undefined" &&
    document.querySelector('[role="dialog"][aria-modal="true"]')
  ) {
    return false;
  }
  return true;
}
