import { afterEach, describe, expect, it } from "vitest";

import { ACCENTS, isAccent, startThemeSync, useConfig } from "../config.ts";

describe("accent", () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    delete document.documentElement.dataset.accent;
    useConfig.setState({ accent: undefined });
  });

  it("persists the accent dealt before first paint", () => {
    document.documentElement.dataset.accent = "orange";
    stop = startThemeSync();

    expect(useConfig.getState().accent).toBe("orange");
  });

  it("falls back to the first accent when nothing valid was dealt", () => {
    document.documentElement.dataset.accent = "violet";
    stop = startThemeSync();

    expect(useConfig.getState().accent).toBe(ACCENTS[0]);
  });

  it("keeps a stored choice and applies it to the document", () => {
    useConfig.setState({ accent: "blue" });
    document.documentElement.dataset.accent = "pink";
    stop = startThemeSync();

    expect(useConfig.getState().accent).toBe("blue");
    expect(document.documentElement.dataset.accent).toBe("blue");
  });

  it("applies a change to the document", () => {
    stop = startThemeSync();
    useConfig.getState().setAccent("green");

    expect(document.documentElement.dataset.accent).toBe("green");
  });

  it("recognises only known accents", () => {
    expect(isAccent("teal")).toBe(true);
    expect(isAccent("violet")).toBe(false);
    expect(isAccent(undefined)).toBe(false);
  });
});
