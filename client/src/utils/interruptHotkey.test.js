import { describe, it, expect, afterEach } from "vitest";
import { shouldInterruptOnEscape } from "./interruptHotkey.js";

function press(target, init = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldInterruptOnEscape", () => {
  it("ignores Escape when no speech is active", () => {
    expect(shouldInterruptOnEscape(press(document.body), false)).toBe(false);
  });

  it("interrupts from the page body while speaking", () => {
    expect(shouldInterruptOnEscape(press(document.body), true)).toBe(true);
  });

  it("interrupts from the speak textarea while speaking", () => {
    document.body.innerHTML =
      '<textarea aria-label="Text to synthesize"></textarea>';
    const ta = document.querySelector("textarea");
    expect(shouldInterruptOnEscape(press(ta), true)).toBe(true);
  });

  it("does not hijack other inputs", () => {
    document.body.innerHTML = "<input />";
    expect(
      shouldInterruptOnEscape(press(document.querySelector("input")), true),
    ).toBe(false);
  });

  it("yields to open dialogs and other keys", () => {
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true"><button id="b"></button></div>';
    expect(
      shouldInterruptOnEscape(press(document.getElementById("b")), true),
    ).toBe(false);
    document.body.innerHTML = "";
    expect(
      shouldInterruptOnEscape(press(document.body, { key: "a" }), true),
    ).toBe(false);
  });
});
