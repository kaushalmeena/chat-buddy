import { describe, expect, it } from "vitest";
import { nextLength } from "../useRevealedText.ts";

/**
 * Tests the pacing policy directly. The hook around it is a thin
 * `requestAnimationFrame` loop; the decisions worth pinning down all live here.
 */
describe("nextLength", () => {
  const STREAMING = true;
  const FINISHED = false;

  it("never moves backwards", () => {
    expect(nextLength(50, 50, STREAMING)).toBe(50);
    // Over-revealed (text shrank) clamps to the total rather than rewinding oddly.
    expect(nextLength(80, 50, STREAMING)).toBe(50);
  });

  it("never overshoots the total", () => {
    for (const visible of [0, 1, 10, 99]) {
      expect(nextLength(visible, 100, FINISHED)).toBeLessThanOrEqual(100);
      expect(nextLength(visible, 100, STREAMING)).toBeLessThanOrEqual(100);
    }
  });

  describe("while streaming", () => {
    it("holds back a small buffer so a pause does not stall the reveal", () => {
      // 10 pending is under the 12-character read-ahead reserve: show nothing yet.
      expect(nextLength(0, 10, STREAMING)).toBe(0);
    });

    it("starts releasing once the buffer exceeds the reserve", () => {
      expect(nextLength(0, 40, STREAMING)).toBeGreaterThan(0);
    });

    it("releases more when more is waiting", () => {
      const small = nextLength(0, 40, STREAMING);
      const large = nextLength(0, 400, STREAMING);
      expect(large).toBeGreaterThan(small);
    });

    it("reveals a very large burst immediately rather than pacing for seconds", () => {
      expect(nextLength(0, 5000, STREAMING)).toBe(5000);
    });

    it("converges to the total across repeated frames", () => {
      let visible = 0;
      const total = 300;
      // Bounded: this must not need an unreasonable number of frames.
      for (let frame = 0; frame < 200 && visible < total; frame += 1) {
        visible = nextLength(visible, total, STREAMING);
      }
      // Streaming stops short by the read-ahead reserve, which is the point.
      expect(total - visible).toBeLessThanOrEqual(12);
    });
  });

  describe("once finished", () => {
    it("keeps no reserve, so short tails still appear", () => {
      expect(nextLength(0, 10, FINISHED)).toBeGreaterThan(0);
    });

    it("drains fully within a small number of frames", () => {
      let visible = 0;
      const total = 300;
      let frames = 0;
      while (visible < total && frames < 100) {
        visible = nextLength(visible, total, FINISHED);
        frames += 1;
      }
      expect(visible).toBe(total);
      // Roughly log-scaled: it must not take one frame per character.
      expect(frames).toBeLessThan(40);
    });

    it("always advances by at least the minimum, so it cannot get stuck", () => {
      // 1 pending, ratio would round to under the floor.
      expect(nextLength(99, 100, FINISHED)).toBe(100);
    });
  });

  it("handles empty text", () => {
    expect(nextLength(0, 0, STREAMING)).toBe(0);
    expect(nextLength(0, 0, FINISHED)).toBe(0);
  });
});
