import { useCallback, useEffect, useRef, useState } from "react";

/** How far from the bottom still counts as "pinned", in pixels. */
const PIN_THRESHOLD_PX = 64;

/**
 * Keeps a scroll container pinned to the bottom as content streams in — but only
 * while the person has not scrolled away.
 *
 * Scrolling up during a long reply is how you read it; a transcript that yanks
 * itself back down every frame is unusable. Once they scroll up, auto-scroll
 * disengages and a "jump to latest" affordance takes over until they return.
 */
function useAutoScroll<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T | null>(null);
  const [isPinned, setIsPinned] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setIsPinned(true);
  }, []);

  // Track whether the view is near the bottom. Passive: this fires often.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      setIsPinned(distance <= PIN_THRESHOLD_PX);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  /*
   * Follow new content only while pinned. Assigning `scrollTop` directly rather
   * than animating, because a smooth scroll restarted every frame fights itself.
   *
   * `dependency` is a change trigger, not a value the effect reads: the caller
   * passes something derived from the content (message count and streamed
   * length) so this re-runs whenever the container has grown. Biome's rule
   * cannot model that, hence the suppression.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `dependency` is the intentional change trigger.
  useEffect(() => {
    if (!isPinned) return;
    const element = ref.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [dependency, isPinned]);

  return { ref, isPinned, scrollToBottom };
}

export { useAutoScroll };
