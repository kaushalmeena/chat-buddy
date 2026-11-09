import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "../markdown.tsx";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("Markdown code blocks", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  function render(text: string): HTMLDivElement {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Markdown text={text} />));
    return container;
  }

  it("frames fenced code with its language and a copy button", () => {
    const view = render("Try this:\n\n```ts\nconst answer = 42;\n```\n");

    expect(view.textContent).toContain("ts");
    expect(view.querySelector("pre code")?.textContent).toBe("const answer = 42;");
    expect(
      [...view.querySelectorAll("button")].some(
        (button) => button.textContent === "Copy",
      ),
    ).toBe(true);
  });

  it("leaves inline code and plain text alone", () => {
    const view = render("Use `npm test` to check.");

    expect(view.querySelector("pre")).toBeNull();
    expect(view.querySelector("code")?.textContent).toBe("npm test");
  });
});
