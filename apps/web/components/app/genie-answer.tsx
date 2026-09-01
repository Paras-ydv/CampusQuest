import { Fragment, type ReactNode } from "react";

/**
 * Renders Genie's prose.
 *
 * Genie replies in light markdown — `**bold**` for the figures that matter and
 * `-` bullets for lists — which rendered as literal asterisks when the text was
 * dropped into a paragraph verbatim.
 *
 * This parses the small subset Genie actually emits and builds React elements
 * directly. It deliberately does not use `dangerouslySetInnerHTML`: the text is
 * model output, and model output is never markup we should trust.
 */

/** Splits `**bold**` runs into elements, leaving everything else as text. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else if (last?.type === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "p", lines: [line] });
    }
  }
  return blocks;
}

export function GenieAnswer({ text, className }: { text: string; className?: string }) {
  const blocks = toBlocks(text);
  if (!blocks.length) return null;

  return (
    <div className={className}>
      {blocks.map((block, index) =>
        block.type === "ul" ? (
          <ul key={index} className="mt-2 flex flex-col gap-1.5 first:mt-0">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[0.55em] size-1 shrink-0 bg-hot" aria-hidden />
                <span className="min-w-0 break-words">{inline(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="mt-2.5 break-words first:mt-0">
            {inline(block.lines.join(" "))}
          </p>
        ),
      )}
    </div>
  );
}
