/**
 * Tiny Markdown renderer for dialogue content.
 *
 * The dialogue files we author (`content/.../dialogue.md`) are short and use a
 * very limited subset of Markdown - paragraphs, headings, lists, **bold**,
 * *italic*, `inline code`, and [links](url). Pulling in a full parser would be
 * overkill, so we ship this ~80-line subset instead.
 *
 * Inputs are author-controlled (bundled with the app), so we don't bother with
 * sanitisation beyond escaping HTML in raw text segments.
 */

import { type ReactNode } from "react";

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c] ?? c);
}

/**
 * Render a single line of markdown as a list of ReactNodes, supporting:
 *   `code`, **bold**, *italic*, [text](url)
 */
export function renderInline(line: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let buf = "";
  let key = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  while (i < line.length) {
    const ch = line[i];
    // inline code
    if (ch === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push(
          <code
            key={`${keyPrefix}-${key++}`}
            className="rounded bg-cosmos-panel-2 px-1 font-mono text-phosphor-200"
          >
            {line.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    // bold
    if (ch === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end > i) {
        flush();
        out.push(
          <strong key={`${keyPrefix}-${key++}`} className="font-semibold">
            {renderInline(line.slice(i + 2, end), `${keyPrefix}-${key}b`)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // italic (single *)
    if (ch === "*") {
      const end = line.indexOf("*", i + 1);
      if (end > i) {
        flush();
        out.push(
          <em key={`${keyPrefix}-${key++}`} className="italic">
            {renderInline(line.slice(i + 1, end), `${keyPrefix}-${key}i`)}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    // link [text](url)
    if (ch === "[") {
      const close = line.indexOf("]", i + 1);
      if (close > i && line[close + 1] === "(") {
        const urlEnd = line.indexOf(")", close + 2);
        if (urlEnd > close) {
          flush();
          const text = line.slice(i + 1, close);
          const url = line.slice(close + 2, urlEnd);
          out.push(
            <a
              key={`${keyPrefix}-${key++}`}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-phosphor-400 underline underline-offset-2 hover:text-phosphor-200"
            >
              {text}
            </a>,
          );
          i = urlEnd + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** One top-level segment of a markdown document: either a fenced code block
 *  (which may span blank lines and must NOT be paragraph-split) or a run of
 *  ordinary text to be processed block-by-block. */
type Segment =
  | { type: "code"; lang: string; content: string }
  | { type: "text"; content: string };

/** Split a document into fenced-code vs text segments. Fences are ```lang on
 *  their own line, closed by a line that is just ```. An unclosed fence runs
 *  to the end of the document (lenient - author content is trusted). */
function splitFences(source: string): Segment[] {
  const lines = source.split("\n");
  const segments: Segment[] = [];
  let text: string[] = [];
  let i = 0;
  const flushText = () => {
    if (text.length) {
      segments.push({ type: "text", content: text.join("\n") });
      text = [];
    }
  };
  while (i < lines.length) {
    const fence = /^```(.*)$/.exec(lines[i]);
    if (fence) {
      flushText();
      const lang = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip the closing ```
      segments.push({ type: "code", lang, content: body.join("\n") });
      continue;
    }
    text.push(lines[i]);
    i++;
  }
  flushText();
  return segments;
}

/**
 * Render block-level markdown: paragraphs, ATX headings (# ## ###), unordered
 * lists (-, *), ordered lists (1.), fenced code blocks (```), blockquotes (>),
 * and horizontal rules (---). Returns a single React fragment.
 */
export function renderMarkdown(source: string): ReactNode {
  const blocks: ReactNode[] = [];
  let bk = 0;

  for (const seg of splitFences(source.replace(/\r\n/g, "\n"))) {
    if (seg.type === "code") {
      blocks.push(
        <pre
          key={`b-${bk++}`}
          className="overflow-x-auto rounded-md border border-cosmos-border bg-cosmos-panel-2 p-3 font-mono text-sm leading-relaxed text-cosmos-text"
        >
          <code>{seg.content}</code>
        </pre>,
      );
      continue;
    }

    const paragraphs = seg.content.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const p = bk;

      // Horizontal rule (--- / *** / ___ on its own line)
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        blocks.push(
          <hr key={`b-${bk++}`} className="my-2 border-cosmos-border" />,
        );
        continue;
      }

      // Heading
      const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (heading) {
        const level = heading[1].length;
        const inline = renderInline(heading[2], `h-${p}`);
        const cls =
          level === 1
            ? "text-2xl font-semibold text-phosphor-200"
            : level === 2
              ? "text-xl font-semibold text-phosphor-200"
              : "text-lg font-semibold text-cosmos-text";
        const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as
          | "h1"
          | "h2"
          | "h3";
        blocks.push(
          <Tag key={`b-${bk++}`} className={cls}>
            {inline}
          </Tag>,
        );
        continue;
      }

      const lines = trimmed.split("\n");

      // Table (GitHub-flavored): a header row, a `|---|---|` separator, then
      // body rows - all pipe-delimited. Renders as a bordered, scrollable table.
      if (
        lines.length >= 2 &&
        lines[0].includes("|") &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]) &&
        lines[1].includes("-")
      ) {
        const parseRow = (l: string): string[] =>
          l
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
        const header = parseRow(lines[0]);
        const body = lines.slice(2).map(parseRow);
        blocks.push(
          <div key={`b-${bk++}`} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-cosmos-border">
                  {header.map((cell, ci) => (
                    <th
                      key={ci}
                      className="px-3 py-2 text-left font-semibold text-phosphor-200"
                    >
                      {renderInline(cell, `th-${p}-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className="border-b border-cosmos-border/50">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2 align-top text-cosmos-text"
                      >
                        {renderInline(cell, `td-${p}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      // Blockquote: every line starts with `>` → callout. Recurse so the inner
      // text keeps headings/lists/inline formatting.
      if (lines.every((l) => /^\s*>\s?/.test(l))) {
        const inner = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
        blocks.push(
          <blockquote
            key={`b-${bk++}`}
            className="space-y-2 border-l-2 border-phosphor-600/50 pl-4 text-cosmos-muted"
          >
            {renderMarkdown(inner)}
          </blockquote>,
        );
        continue;
      }

      // Unordered list
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        blocks.push(
          <ul key={`b-${bk++}`} className="ml-5 list-disc space-y-1">
            {lines.map((l, li) => (
              <li key={li}>
                {renderInline(l.replace(/^\s*[-*]\s+/, ""), `l-${p}-${li}`)}
              </li>
            ))}
          </ul>,
        );
        continue;
      }
      // Ordered list
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        blocks.push(
          <ol key={`b-${bk++}`} className="ml-5 list-decimal space-y-1">
            {lines.map((l, li) => (
              <li key={li}>
                {renderInline(l.replace(/^\s*\d+\.\s+/, ""), `o-${p}-${li}`)}
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      // Paragraph (line breaks within → <br>)
      const nodes: ReactNode[] = [];
      lines.forEach((l, li) => {
        if (li > 0) nodes.push(<br key={`br-${p}-${li}`} />);
        nodes.push(...renderInline(l, `p-${p}-${li}`));
      });
      blocks.push(
        <p key={`b-${bk++}`} className="leading-relaxed">
          {nodes}
        </p>,
      );
    }
  }

  return <>{blocks}</>;
}

/** Strip markdown formatting to plain text - used for typewriter sizing. */
export function stripMarkdown(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/^```.*$/gm, "") // fence delimiters
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "") // blockquote markers
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "");
}

// Force-export the escape helper so it can't be tree-shaken into oblivion if
// someone wants to reuse it from a future component.
export { escapeHtml };
