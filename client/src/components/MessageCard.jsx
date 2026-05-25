/**
 * MessageCard.jsx
 * Renders a single speech history entry with replay, reuse, pin, copy, and delete actions.
 *
 * Props:
 *   message   – { id, text, timestamp }
 *   isPinned  – boolean
 *   onReuse   – (text) => void   — load text into the composer textarea
 *   onReplay  – (text) => void   — trigger speech synthesis
 *   onToggleFav – (id) => void
 *   onDelete  – (id) => void
 *   onCopy    – (text) => void
 */

import React from "react";

/** Formats a timestamp into a human-readable relative label. */
function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MessageCard({
  message,
  isPinned,
  onReuse,
  onReplay,
  onToggleFav,
  onDelete,
  onCopy,
}) {
  const { id, text, timestamp } = message;

  return (
    <article
      className={[
        "group relative rounded-lg border bg-white p-3 text-sm shadow-none",
        "transition-all duration-150 hover:border-blue-400 dark:bg-neutral-900",
        isPinned ? "border-l-4 border-l-amber-400 border-neutral-200" : "border-neutral-200 dark:border-neutral-700",
      ].join(" ")}
      aria-label={`Message: ${text}`}
    >
      {/* Message text */}
      <p className="mb-2 break-words leading-relaxed text-neutral-800 dark:text-neutral-100">
        {text}
      </p>

      {/* Footer row: timestamp + action buttons */}
      <div className="flex items-center justify-between">
        <time
          dateTime={new Date(timestamp).toISOString()}
          className="text-xs text-neutral-400 dark:text-neutral-500"
        >
          {formatTime(timestamp)}
        </time>

        {/* Action buttons – visible on hover/focus within the card */}
        <div
          className="flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          role="group"
          aria-label="Message actions"
        >
          {/* Replay */}
          <ActionBtn
            onClick={() => onReplay(text)}
            aria-label="Replay this message with speech synthesis"
            title="Replay"
          >
            <PlayIcon />
          </ActionBtn>

          {/* Reuse */}
          <ActionBtn
            onClick={() => onReuse(text)}
            aria-label="Load this message into the composer"
            title="Reuse"
          >
            <ReuseIcon />
          </ActionBtn>

          {/* Copy */}
          <ActionBtn
            onClick={() => onCopy(text)}
            aria-label="Copy message to clipboard"
            title="Copy"
          >
            <CopyIcon />
          </ActionBtn>

          {/* Pin / Unpin */}
          <ActionBtn
            onClick={() => onToggleFav(id)}
            aria-label={isPinned ? "Unpin message" : "Pin message"}
            aria-pressed={isPinned}
            title={isPinned ? "Unpin" : "Pin"}
            className={isPinned ? "text-amber-500" : ""}
          >
            <StarIcon filled={isPinned} />
          </ActionBtn>

          {/* Delete */}
          <ActionBtn
            onClick={() => onDelete(id)}
            aria-label="Delete message from history"
            title="Delete"
            className="hover:text-red-500"
          >
            <TrashIcon />
          </ActionBtn>
        </div>
      </div>

      {isPinned && (
        <span
          className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
          aria-label="Pinned"
        >
          pinned
        </span>
      )}
    </article>
  );
}

// ── Small reusable icon-button ───────────────────────────────────────────────
function ActionBtn({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={[
        "flex h-7 w-7 items-center justify-center rounded border border-neutral-200",
        "bg-white text-neutral-400 transition-all duration-100",
        "hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700",
        "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1",
        "dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500",
        "dark:hover:bg-neutral-700 dark:hover:text-neutral-200",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── Inline SVG icons (16 × 16, accessible, no external deps) ─────────────────
const PlayIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M3 2.5l10 5.5-10 5.5V2.5z" />
  </svg>
);

const ReuseIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 8H11M8 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
    <path d="M3 11V3h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StarIcon = ({ filled }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M8 2l1.5 4h4l-3 2.5 1 4L8 10l-3.5 2.5 1-4L2.5 6h4L8 2z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3 4h10M6 4V3h4v1M5 4l.5 8h5l.5-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);