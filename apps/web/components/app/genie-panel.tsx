"use client";

import type { GenieResultTable, GenieStatus, GenieSuggestion } from "@campusquest/shared";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { askGenie } from "@/lib/data/client";
import { GenieAnswer } from "./genie-answer";
import { Label } from "@/components/ui/primitives";

const STATUS_COPY: Record<GenieStatus, string> = {
  pending: "Queued",
  interpreting: "Reading your profile",
  executing: "Querying campus data",
  complete: "Answered",
  failed: "Something went wrong",
};

/** One question and everything Genie returned for it. */
type Turn = {
  question: string;
  status: GenieStatus | null;
  text: string;
  sql: string | null;
  table: GenieResultTable | null;
  error: string | null;
};

const emptyTurn = (question: string): Turn => ({
  question, status: "pending", text: "", sql: null, table: null, error: null,
});

export function GeniePanel({
  suggestions,
  scopeLabel = "campus data",
  className,
}: {
  suggestions: GenieSuggestion[];
  /** What the current screen is about, so the header reads in context. */
  scopeLabel?: string;
  className?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [openSql, setOpenSql] = useState<number | null>(null);
  // Genie keeps prior turns as context; holding the id is what makes a
  // follow-up a continuation rather than a fresh, contextless question.
  const conversationId = useRef<string | null>(null);
  const running = useRef(false);

  const busy = turns.some((turn) =>
    turn.status === "pending" || turn.status === "interpreting" || turn.status === "executing");

  function patchLast(patch: Partial<Turn>) {
    setTurns((prev) => prev.map((turn, index) => (index === prev.length - 1 ? { ...turn, ...patch } : turn)));
  }

  async function ask(value: string) {
    const q = value.trim();
    if (running.current || !q) return;
    running.current = true;

    setQuestion("");
    setTurns((prev) => [...prev, emptyTurn(q)]);

    try {
      for await (const event of askGenie(q, conversationId.current ?? undefined)) {
        switch (event.type) {
          case "status": patchLast({ status: event.status }); break;
          case "delta": setTurns((prev) => prev.map((turn, i) => (i === prev.length - 1 ? { ...turn, text: turn.text + event.text } : turn))); break;
          case "table": patchLast({ table: event.table }); break;
          case "sql": patchLast({ sql: event.sql }); break;
          case "done":
            conversationId.current = event.conversationId;
            patchLast({ status: "complete" });
            break;
          case "error": patchLast({ status: "failed", error: event.message }); break;
        }
      }
    } catch (error) {
      patchLast({ status: "failed", error: error instanceof Error ? error.message : "Genie is unavailable." });
    } finally {
      running.current = false;
    }
  }

  function reset() {
    conversationId.current = null;
    setTurns([]);
    setOpenSql(null);
  }

  return (
    <section className={clsx("border-2 border-ink", className)}>
      <div className="flex items-center gap-3 border-b-2 border-ink px-5 py-3.5">
        <Label>Ask about {scopeLabel}</Label>
        {turns.length ? (
          <button
            type="button"
            onClick={reset}
            className="ml-auto font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase transition-colors hover:text-hot"
          >
            New thread
          </button>
        ) : (
          <span className="ml-auto font-mono text-[0.625rem] tracking-[0.1em] text-faint uppercase">
            Databricks Genie
          </span>
        )}
      </div>

      <div className="max-h-[32rem] overflow-y-auto p-5">
        {turns.length === 0 ? (
          <p className="mb-4 max-w-[52ch] text-[0.85rem] leading-relaxed text-muted">
            Ask in plain English. Every answer is produced by SQL against the
            campus warehouse — you can open the query behind any result.
          </p>
        ) : null}

        <ul className="flex flex-col gap-6">
          {turns.map((turn, index) => (
            <motion.li
              key={`${index}-${turn.question}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className={index > 0 ? "border-t-2 border-line-soft pt-5" : undefined}
            >
              <p className="font-display text-[1rem] font-bold tracking-[-0.02em]">{turn.question}</p>

              {turn.status && turn.status !== "complete" && turn.status !== "failed" ? (
                <p className="mt-3 flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.14em] text-muted uppercase">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping bg-hot opacity-70" />
                    <span className="relative inline-flex size-2 bg-hot" />
                  </span>
                  {STATUS_COPY[turn.status]}
                </p>
              ) : null}

              {turn.error ? (
                <p role="alert" className="mt-3 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed text-hot">
                  {turn.error}
                </p>
              ) : null}

              {turn.table ? (
                <div className="mt-4 overflow-x-auto border-2 border-line-soft">
                  <table className="w-full border-collapse text-left text-[0.78rem]">
                    <thead>
                      <tr className="border-b-2 border-line-soft bg-sunk">
                        {turn.table.columns.map((c) => (
                          <th key={c} className="px-3 py-2 font-mono text-[0.625rem] font-normal tracking-[0.14em] text-muted uppercase">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {turn.table.rows.map((row, i) => (
                        <tr key={i} className="border-b border-line-soft last:border-b-0">
                          {row.map((cell, j) => (
                            <td key={j} className={clsx("px-3 py-2 tabular-nums", j === 0 && "font-semibold")}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {turn.text ? (
                <GenieAnswer
                  text={turn.text}
                  className="mt-4 max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-2"
                />
              ) : null}

              {turn.sql ? (
                <div className="mt-4">
                  {/* Provenance is the point: a judge should be able to see that
                      the number above came out of the warehouse, not a model. */}
                  <button
                    type="button"
                    onClick={() => setOpenSql(openSql === index ? null : index)}
                    className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase underline decoration-line-soft underline-offset-4 transition-colors hover:text-ink"
                  >
                    {openSql === index ? "Hide" : "Show"} the SQL Databricks ran
                  </button>
                  <AnimatePresence initial={false}>
                    {openSql === index ? (
                      <motion.pre
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-3 overflow-x-auto border-2 border-line-soft bg-sunk p-4 font-mono text-[0.7rem] leading-relaxed whitespace-pre text-ink-2"
                      >
                        {turn.sql}
                      </motion.pre>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
            </motion.li>
          ))}
        </ul>

        {turns.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void ask(s.question)}
                className="border-2 border-line-soft px-3 py-1.5 text-left font-mono text-[0.6875rem] tracking-[0.06em] text-muted transition-colors duration-200 hover:border-ink hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(question); }}
        className="flex flex-col gap-3 border-t-2 border-ink p-5 sm:flex-row"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={turns.length ? "Ask a follow-up…" : "What should I learn next, and why?"}
          aria-label="Ask a question about your campus data"
          className="min-w-0 flex-1 border-2 border-ink bg-surface px-4 py-3 font-mono text-[0.8rem] placeholder:text-faint focus:outline-none focus-visible:border-volt"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="shrink-0 border-2 border-ink bg-ink px-6 py-3 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-paper uppercase transition-colors duration-300 hover:border-hot hover:bg-hot hover:text-on-hot disabled:opacity-40 disabled:hover:border-ink disabled:hover:bg-ink disabled:hover:text-paper"
        >
          {busy ? "Working" : turns.length ? "Follow up" : "Ask"}
        </button>
      </form>
    </section>
  );
}
