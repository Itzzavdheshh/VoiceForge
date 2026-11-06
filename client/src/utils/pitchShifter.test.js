import { describe, it, expect, vi, beforeEach } from "vitest";
import { PitchShifter } from "./pitchShifter.js";

function createMockAudioContext({ supportConstantSource = true } = {}) {
  const createAudioParam = (initialValue = 0) => ({
    value: initialValue,
  });

  const createMockNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  const context = {
    createGain: vi.fn(() => ({
      ...createMockNode(),
      gain: createAudioParam(1),
    })),
    createDelay: vi.fn(() => ({
      ...createMockNode(),
      delayTime: createAudioParam(0),
    })),
    createOscillator: vi.fn(() => ({
      ...createMockNode(),
      type: "sine",
      frequency: createAudioParam(440),
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };

  if (supportConstantSource) {
    context.createConstantSource = vi.fn(() => ({
      ...createMockNode(),
      offset: createAudioParam(0),
      start: vi.fn(),
      stop: vi.fn(),
    }));
  }

  return context;
}

describe("PitchShifter", () => {
  let mockContext;

  beforeEach(() => {
    mockContext = createMockAudioContext();
  });

  describe("Oscillator Lifecycle", () => {
    it("starts osc1, osc2, fadeOsc1, and fadeOsc2 upon instantiation", () => {
      const shifter = new PitchShifter(mockContext);

      expect(shifter.osc1).toBeDefined();
      expect(shifter.osc2).toBeDefined();
      expect(shifter.fadeOsc1).toBeDefined();
      expect(shifter.fadeOsc2).toBeDefined();

      expect(shifter.osc1.start).toHaveBeenCalledTimes(1);
      expect(shifter.osc2.start).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc1.start).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc2.start).toHaveBeenCalledTimes(1);
    });

    it("stops and disconnects all 4 oscillators when dispose() is called", () => {
      const shifter = new PitchShifter(mockContext);

      shifter.dispose();

      // Verify all 4 oscillators are stopped
      expect(shifter.osc1.stop).toHaveBeenCalledTimes(1);
      expect(shifter.osc2.stop).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc1.stop).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc2.stop).toHaveBeenCalledTimes(1);

      // Verify all 4 oscillators are disconnected
      expect(shifter.osc1.disconnect).toHaveBeenCalledTimes(1);
      expect(shifter.osc2.disconnect).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc1.disconnect).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc2.disconnect).toHaveBeenCalledTimes(1);
    });

    it("handles contexts without createConstantSource gracefully", () => {
      const fallbackContext = createMockAudioContext({
        supportConstantSource: false,
      });
      const shifter = new PitchShifter(fallbackContext);

      expect(shifter.constSource).toBeNull();
      expect(shifter.osc1.start).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc1.start).toHaveBeenCalledTimes(1);

      expect(() => shifter.dispose()).not.toThrow();
      expect(shifter.fadeOsc1.stop).toHaveBeenCalledTimes(1);
      expect(shifter.fadeOsc1.disconnect).toHaveBeenCalledTimes(1);
    });

    it("catches errors during dispose() without crashing", () => {
      const shifter = new PitchShifter(mockContext);
      shifter.osc1.stop.mockImplementation(() => {
        throw new Error("Already stopped");
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => shifter.dispose()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        "Error disposing PitchShifter nodes:",
        expect.any(Error),
      );
      warnSpy.mockRestore();
    });
  });
});
