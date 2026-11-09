import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * Syntax highlighting, loaded only when a reply contains a code block.
 *
 * The highlight.js core plus a curated set of languages rather than the full
 * bundle: these cover what small models write most, at a fraction of the size.
 * Output is HTML whose only markup is `<span class="hljs-…">`; the code itself is
 * escaped by highlight.js, so it is safe to insert.
 */
const LANGUAGES = {
  bash,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

/** Highlights code; `undefined` when the language is unknown, so plain text stays. */
export function highlight(
  code: string,
  language: string | undefined,
): string | undefined {
  if (!language || !hljs.getLanguage(language)) return undefined;
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}
