/**
 * Batches streamed text into one store write per animation frame.
 *
 * This is a *performance* concern, not a visual one. A model emitting 60 tokens a
 * second would otherwise drive 60 store updates and 60 React renders a second;
 * buffering outside React and flushing once per frame makes that one, regardless
 * of the incoming rate.
 *
 * Visual smoothing is a separate job, handled downstream by `useRevealedText`: it
 * decides how fast the arrived text is *revealed*. Keeping the two apart means
 * neither has to compromise — this file never withholds text, and the renderer never
 * has to guess at network timing.
 */

export type ChunkBatcher = {
  /** Queues an incoming chunk. Cheap; never touches React state. */
  push(chunk: string): void;
  /** Commits anything still queued immediately and cancels the pending frame. */
  flush(): void;
};

/**
 * Creates a batcher that commits through `commit`.
 *
 * `commit` receives incremental text, never a cumulative snapshot, matching the
 * `ChatProvider` contract.
 */
export function createChunkBatcher(commit: (text: string) => void): ChunkBatcher {
  let pending = "";
  let frame: number | undefined;

  const drain = () => {
    frame = undefined;
    if (pending.length === 0) return;
    const text = pending;
    pending = "";
    commit(text);
  };

  return {
    push(chunk) {
      if (chunk.length === 0) return;
      pending += chunk;
      frame ??= requestAnimationFrame(drain);
    },

    flush() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      drain();
    },
  };
}
