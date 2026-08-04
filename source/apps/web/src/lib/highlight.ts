import hljs from "npm:highlight.js@11.11.1/lib/core";
import bash from "npm:highlight.js@11.11.1/lib/languages/bash";
import dockerfile from "npm:highlight.js@11.11.1/lib/languages/dockerfile";
import json from "npm:highlight.js@11.11.1/lib/languages/json";
import markdown from "npm:highlight.js@11.11.1/lib/languages/markdown";
import shell from "npm:highlight.js@11.11.1/lib/languages/shell";
import typescript from "npm:highlight.js@11.11.1/lib/languages/typescript";
import yaml from "npm:highlight.js@11.11.1/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("yaml", yaml);

const extensionToLanguage: Record<string, string> = {
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  sh: "bash",
  bash: "bash",
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  jsx: "typescript",
  md: "markdown",
};

export function languageForPath(path: string): string | undefined {
  const fileName = path.split("/").at(-1) ?? path;
  if (fileName.toLowerCase() === "dockerfile") return "dockerfile";

  const extension = fileName.split(".").at(-1)?.toLowerCase();
  return extension ? extensionToLanguage[extension] : undefined;
}

export function highlight(code: string, path: string): { html: string; language: string | undefined } {
  const language = languageForPath(path);
  if (!language) return { html: hljs.highlightAuto(code).value, language: undefined };
  return { html: hljs.highlight(code, { language }).value, language };
}

const OPEN_SPAN_RE = /^<span class="([^"]*)">/;

// hljs emits one flat HTML string where a single <span> can wrap several
// source lines (e.g. a multi-line comment). Splitting naively on "\n" would
// leave those spans unclosed on all but the last line, so this walks the
// markup and reopens/closes spans at each line break to keep every line's
// HTML self-contained and renderable on its own.
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const openStack: string[] = [];
  // Snapshot of openStack from before this line started, for reopening.
  let carriedIn: string[] = [];
  let lineBody = "";
  let index = 0;

  const flushLine = () => {
    const reopen = carriedIn.map((cls) => `<span class="${cls}">`).join("");
    lines.push(reopen + lineBody + "</span>".repeat(openStack.length));
    lineBody = "";
    carriedIn = [...openStack];
  };

  while (index < html.length) {
    if (html[index] === "\n") {
      flushLine();
      index += 1;
      continue;
    }

    const rest = html.slice(index);
    const openMatch = rest.match(OPEN_SPAN_RE);
    if (openMatch) {
      openStack.push(openMatch[1]);
      lineBody += openMatch[0];
      index += openMatch[0].length;
      continue;
    }

    if (rest.startsWith("</span>")) {
      openStack.pop();
      lineBody += "</span>";
      index += "</span>".length;
      continue;
    }

    lineBody += html[index];
    index += 1;
  }
  flushLine();

  return lines;
}
