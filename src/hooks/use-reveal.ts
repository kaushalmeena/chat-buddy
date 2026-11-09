import { useEffect, useEffectEvent, useState } from "react";

/**
 * Reveals text at the display's frame rate instead of the model's.
 *
 * The problem is rhythm, not throughput. Models do not emit at a constant rate:
 * WebGPU inference arrives in clumps as batches finish, and Chrome's Prompt API can
 * hand over a whole sentence at once after a pause. Rendering each chunk the moment
 * it lands makes text lurch — a paragraph appears, nothing happens, three words
 * appear.
 *
 * So this decouples what has *arrived* from what is *shown*. Arrived text is a
 * buffer; each frame releases a slice of it, sized from how much is waiting. Bursts
 * fill the buffer and drain evenly, and a genuinely fast model drains faster, so
 * nothing is held back for long.
 *
 * This replaces `throttleBasic` from llm-ui, which stopped being maintained in
 * early 2025.
 */

/**
 * Characters to keep buffered rather than revealing immediately.
 *
 * A small reserve is what stops the reveal stalling the instant a chunk runs out:
 * there is always a little left to show while the next batch is still computing.
 */
const READ_AHEAD_CHARS = 12;

/** Fraction of the releasable buffer to reveal per frame while streaming. */
const DRAIN_RATIO = 0.28;

/** Fraction per frame once the stream has finished; nothing is left to wait for. */
const FINISH_RATIO = 0.5;

/** Always release at least this much per frame, so long text never crawls. */
const MIN_CHARS_PER_FRAME = 2;

/**
 * Above this much pending text, reveal everything at once.
 *
 * Guards the case where a provider hands over a very long reply in a single chunk:
 * pacing thousands of characters would take seconds and read as broken rather than
 * smooth.
 */
const IMMEDIATE_THRESHOLD = 800;

/**
 * How far to advance the revealed length in one frame.
 *
 * Exported because it is the whole pacing policy, and testing it directly beats
 * driving a `requestAnimationFrame` loop to infer the same behaviour.
 */
export function nextLength(
  visible: number,
  total: number,
  isStreaming: boolean,
): number {
  const pending = total - visible;
  if (pending <= 0) return total;
  if (pending >= IMMEDIATE_THRESHOLD) return total;

  if (!isStreaming) {
    return Math.min(
      total,
      visible + Math.max(MIN_CHARS_PER_FRAME, Math.ceil(pending * FINISH_RATIO)),
    );
  }

  // While streaming, hold back the read-ahead reserve.
  const releasable = pending - READ_AHEAD_CHARS;
  if (releasable <= 0) return visible;

  return Math.min(
    total,
    visible + Math.max(MIN_CHARS_PER_FRAME, Math.ceil(releasable * DRAIN_RATIO)),
  );
}

/**
 * Returns the portion of `text` that should be on screen right now.
 *
 * Once `isStreaming` goes false the remainder drains quickly and the full string is
 * returned, so a settled message is never left truncated.
 */
export function useRevealedText(text: string, isStreaming: boolean): string {
  const [revealed, setRevealed] = useState(() => (isStreaming ? 0 : text.length));

  /*
   * Reset when the text shrinks: a different message is now shown in this position
   * (a retry discarding a reply, or a thread switch). Adjusting state during render
   * is React's documented pattern for this; it re-renders before committing.
   */
  if (revealed > text.length) setRevealed(text.length);

  /*
   * One frame of the reveal, reading the latest `text` and `isStreaming` without
   * making them effect dependencies — so arriving chunks do not tear the loop down.
   * Returns whether another frame is needed. `revealed` may be a frame stale here,
   * which costs at most one extra frame before the loop settles.
   */
  const tick = useEffectEvent((): boolean => {
    const total = text.length;
    setRevealed((current) => nextLength(current, total, isStreaming));
    return isStreaming || revealed < total;
  });

  const revealAll = useEffectEvent(() => {
    setRevealed(text.length);
  });

  // Restarted when streaming stops, so the tail drains and the loop can settle
  // rather than polling every frame forever.
  useEffect(() => {
    // Frames do not run in a background tab. Revealing progressively there would
    // stall until the tab is looked at again, so show everything instead.
    if (typeof document !== "undefined" && document.hidden) {
      revealAll();
      return;
    }

    let frame: number | undefined;

    const step = () => {
      frame = tick() ? requestAnimationFrame(step) : undefined;
    };

    frame = requestAnimationFrame(step);

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [isStreaming]);

  // A settled message must never render short, whatever the loop has managed.
  if (!isStreaming && revealed >= text.length) return text;

  return text.slice(0, revealed);
}
