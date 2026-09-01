"use client";

import type {
  GenieResultTable,
  GenieStatus,
  GenieSuggestion,
} from "@campusquest/shared";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { askGenie } from "@/lib/data/client";
import { Label } from "@/components/ui/primitives";

const STATUS_COPY: Record<GenieStatus, string> = {
  pending: "Queued",
  interpreting: "Reading your profile",
  executing: "Querying campus data",
  complete: "Answered",
  failed: "Something went wrong",
};

export function GeniePanel({
  suggestions,
}: {
  suggestions: GenieSuggestion[];
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [status, setStatus] = useState<GenieStatus | null>(null);
  const [text, setText] = useState("");
  const [table, setTable] = useState<GenieResultTable | null>(null);
  const [sql, setSql] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const running = useRef(false);

  async function ask(q: string) {
    if (running.current || !q.trim()) return;
    running.current = true;

    setAsked(q);
    setQuestion("");
    setText("");
    setTable(null);
    setSql(null);
    setShowSql(false);
    setStatus("pending");

    try {
      // Consumes exactly the frames `/api/genie/ask` will emit over SSE.
      for await (const event of askGenie(q)) {
        switch (event.type) {
          case "status":
            setStatus(event.status);
            break;
          case "delta":
            setText((prev) => prev + event.text);
            break;
          case "table":
            setTable(event.table);
            break;
          case "sql":
            setSql(event.sql);
            break;
          case "done":
            setStatus("complete");
            break;
          case "error":
            setStatus("failed");
            setText(event.message);
            break;
        }
      }
    } finally {
      running.current = false;
    }
  }

  const busy = status === "pending" || status === "interpreting" || status === "executing";

  return (
    <section className="border-2 border-ink">
      <div className="border-b-2 border-ink px-5 py-3.5">
        <Label>Ask the campus data</Label>
      </div>

      <div className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should I learn next, and why?"
            aria-label="Ask a question about your campus data"
            className="min-w-0 flex-1 border-2 border-ink bg-surface px-4 py-3 font-mono text-[0.8rem] placeholder:text-faint focus:outline-none focus-visible:border-volt"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="shrink-0 border-2 border-ink bg-ink px-6 py-3 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-paper uppercase transition-colors duration-300 hover:bg-hot hover:border-hot hover:text-on-hot disabled:opacity-40 disabled:hover:bg-ink disabled:hover:border-ink disabled:hover:text-paper"
          >
            {busy ? "Working" : "Ask"}
          </button>
        </form>

        {!asked ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void ask(s.question)}
                className="border-2 border-line-soft px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.06em] text-muted transition-colors duration-200 hover:border-ink hover:text-ink"
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {asked ? (
            <motion.div
              key={asked}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 border-t-2 border-line-soft pt-5"
            >
              <p className="font-display text-[1.02rem] font-bold tracking-[-0.02em]">
                {asked}
              </p>

              {status && status !== "complete" ? (
                <p className="mt-3 flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.14em] text-muted uppercase">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping bg-hot opacity-70" />
                    <span className="relative inline-flex size-2 bg-hot" />
                  </span>
                  {STATUS_COPY[status]}
                </p>
              ) : null}

              {table ? (
                <div className="mt-5 overflow-x-auto border-2 border-line-soft">
                  <table className="w-full border-collapse text-left text-[0.78rem]">
                    <thead>
                      <tr className="border-b-2 border-line-soft bg-sunk">
                        {table.columns.map((c) => (
                          <th
                            key={c}
                            className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.14em] font-normal text-muted uppercase"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-line-soft last:border-b-0"
                        >
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className={clsx(
                                "px-3 py-2 tabular-nums",
                                j === 0 && "font-semibold",
                              )}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {text ? (
                <p className="mt-5 max-w-[62ch] text-[0.9rem] leading-relaxed text-ink-2">
                  {text}
                  {busy ? (
                    <span className="ml-0.5 inline-block h-[0.9em] w-[0.45em] translate-y-[0.1em] bg-hot" />
                  ) : null}
                </p>
              ) : null}

              {sql ? (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowSql((v) => !v)}
                    className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted uppercase underline decoration-line-soft underline-offset-4 transition-colors hover:text-ink"
                  >
                    {showSql ? "Hide" : "Show"} the query behind this
                  </button>
                  <AnimatePresence initial={false}>
                    {showSql ? (
                      <motion.pre
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-3 overflow-x-auto border-2 border-line-soft bg-sunk p-4 font-mono text-[0.7rem] leading-relaxed text-ink-2"
                      >
                        {sql}
                      </motion.pre>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
