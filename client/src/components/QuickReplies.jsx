/**
 * QuickReplies.jsx
 * Renders a row of one-click phrase buttons for common assistive-speech phrases.
 * Clicking any button calls `onSelect(phrase)` to load it into the composer.
 *
 * Props:
 *   onSelect – (phrase: string) => void
 *
 * To add / remove quick replies, edit the QUICK_REPLIES array below.
 */

import React from "react";

const QUICK_REPLIES = [
  { label: "Hello 👋",            phrase: "Hello 👋" },
  { label: "Thank you 🙌",        phrase: "Thank you 🙌" },
  { label: "Please wait ⏳",      phrase: "Please wait ⏳" },
  { label: "I need help ❗",      phrase: "I need help ❗" },
  { label: "Can you repeat that? 🔁", phrase: "Can you repeat that? 🔁" },
  { label: "Yes ✅",              phrase: "Yes, I understand ✅" },
  { label: "No thanks 🙏",        phrase: "No, thank you 🙏" },
];

export function QuickReplies({ onSelect }) {
  return (
    <section
      aria-labelledby="qr-heading"
      className="flex-shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700"
    >
      <h3
        id="qr-heading"
        className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      >
        Quick replies
      </h3>

      {/* Keyboard-navigable group of pill buttons */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Quick reply phrases"
      >
        {QUICK_REPLIES.map(({ label, phrase }) => (
          <button
            key={phrase}
            onClick={() => onSelect(phrase)}
            className={[
              "rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5",
              "text-sm text-neutral-700 transition-all duration-150",
              "hover:-translate-y-px hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700",
              "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1",
              "active:translate-y-0 active:scale-95",
              "dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
              "dark:hover:border-blue-500 dark:hover:bg-blue-950 dark:hover:text-blue-300",
            ].join(" ")}
            aria-label={`Quick reply: ${phrase}`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}