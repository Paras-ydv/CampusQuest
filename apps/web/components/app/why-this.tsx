"use client";

import { useState } from "react";
import { clsx } from "clsx";

/**
 * "Why is this recommended for me?" on a recommendation card.
 *
 * The facts passed in are the ones the server already computed for this card —
 * gap impact, shared interests, openings, XP. Genie is asked only to phrase
 * them, so the explanation cannot introduce a number the card does not show.
 *
 * It is on demand rather than eager: an explanation per card would mean one
 * Genie round-trip per card on every page load.
 */
export function WhyThis({
  kind,
  title,
  facts,
  className,
}: {
  kind: "quest" | "person" | "opportunity" | "research";
  title: string;
  facts: string[];
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");

  async function explain() {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const response = await fetch("/api/genie/rationale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, facts }),
      });
      if (!response.ok) throw new Error(`Genie could not explain this (${response.status}).`);
      const body = (await response.json()) as { rationale?: string };
      setText(body.rationale?.trim() || "No explanation available.");
      setState("done");
    } catch (error) {
      setText(error instanceof Error ? error.message : "Genie is unavailable.");
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => void explain()}
        className={clsx(
          "font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase underline decoration-line-soft underline-offset-4 transition-colors hover:text-hot",
          className,
        )}
      >
        Why this?
      </button>
    );
  }

  return (
    <p
      className={clsx(
        "border-l-2 pl-3 text-[0.8rem] leading-relaxed",
        state === "error" ? "border-hot text-hot" : "border-volt text-ink-2",
        className,
      )}
      aria-live="polite"
    >
      {state === "loading" ? (
        <span className="font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase">
          Genie is reading your data…
        </span>
      ) : (
        text
      )}
    </p>
  );
}
