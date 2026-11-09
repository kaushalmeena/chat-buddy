import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { StreamingMarkdown } from "../stream.tsx";

// Lets React know this environment supports `act`.
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("StreamingMarkdown", () => {
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    container?.remove();
  });

  it("keeps the placeholder while the reveal is still holding text back", () => {
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    // Text has arrived in the store, but nothing is visible yet: this is the frame
    // that used to render an empty, zero-height reply and shift the transcript.
    act(() => {
      root.render(
        <StreamingMarkdown
          text="Hello there"
          isStreaming
          placeholder={<span data-testid="dots" />}
        />,
      );
    });

    expect(container.querySelector('[data-testid="dots"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
