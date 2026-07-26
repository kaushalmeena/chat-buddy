import { markdownLookBack } from "@llm-ui/markdown";
import { type LLMOutputComponent, throttleBasic, useLLMOutput } from "@llm-ui/react";
import { useMemo } from "react";
import { Markdown } from "./Markdown.tsx";

/**
 * Renders streaming assistant output smoothly, using
 * [llm-ui](https://llm-ui.com/).
 *
 * The problem is rhythm, not throughput. Models do not emit at a constant rate:
 * WebGPU inference arrives in clumps as batches finish, and Chrome's Prompt API
 * can hand over a whole sentence at once after a pause. Rendering each chunk the
 * moment it lands makes text lurch — a paragraph appears, nothing happens, three
 * words appear.
 *
 * `useLLMOutput` decouples what has *arrived* from what is *shown*: it keeps a
 * buffer and reveals from it at the display's frame rate, speeding up or slowing
 * down to keep the buffer near a target size. Bursts fill the buffer and drain
 * evenly; a genuinely fast model drains faster, so nothing is held back for long.
 *
 * `markdownLookBack` is what makes that safe for markdown. Revealing a prefix of
 * raw markdown would otherwise flash half-parsed syntax — a lone `**` before its
 * closing pair, a table with one cell. The look-back function walks back to the
 * nearest boundary that renders cleanly, so partial output is always valid.
 */

const THROTTLE = throttleBasic({
  /*
   * Tuned for small on-device models, which are slower and burstier than a
   * hosted API. A larger buffer target absorbs the gaps between WebGPU batches;
   * reading a little ahead keeps the reveal from stalling the moment one lands.
   */
  readAheadChars: 12,
  targetBufferChars: 24,
  adjustPercentage: 0.35,
});

/**
 * Bridges llm-ui's block contract to the app's own markdown renderer.
 *
 * llm-ui pairs `markdownLookBack` with react-markdown in its docs, but the
 * look-back function only computes *where* it is safe to cut — it does not care
 * what renders the result. Keeping the existing renderer means output stays
 * React nodes with no `innerHTML` anywhere, which is the property worth
 * protecting given the text comes from a language model.
 */
const MarkdownBlock: LLMOutputComponent = ({ blockMatch }) => (
  <Markdown text={blockMatch.output} />
);

type StreamedMarkdownProps = {
  readonly text: string;
  readonly isStreaming: boolean;
};

function StreamedMarkdown({ text, isStreaming }: StreamedMarkdownProps) {
  const fallbackBlock = useMemo(
    () => ({ component: MarkdownBlock, lookBack: markdownLookBack() }),
    [],
  );

  const { blockMatches } = useLLMOutput({
    llmOutput: text,
    isStreamFinished: !isStreaming,
    fallbackBlock,
    throttle: THROTTLE,
  });

  return (
    <>
      {blockMatches.map((blockMatch, index) => {
        const Block = blockMatch.block.component;
        return (
          // Positional keys are what llm-ui's own contract implies: matches are
          // ordered segments of one growing string, so index *is* their identity.
          // With only a fallback block configured there is exactly one match.
          // biome-ignore lint/suspicious/noArrayIndexKey: block position is stable identity.
          <Block key={index} blockMatch={blockMatch} />
        );
      })}
    </>
  );
}

export { StreamedMarkdown };
