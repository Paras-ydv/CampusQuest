"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";
import type { ResumeExtraction } from "@campusquest/shared";
import { Button } from "@/components/ui/button";

/**
 * The résumé half of the onboarding fork.
 *
 * It only ever *suggests*: the extracted skills are handed back to the wizard,
 * which drops the student on the skills step with those chips pre-selected and
 * fully editable. Nothing is written until the student finishes the flow, and
 * the file itself is never stored — the route parses it in memory.
 */
export function ResumeUpload({
  onExtracted,
  onSkip,
}: {
  onExtracted: (result: ResumeExtraction) => void;
  onSkip: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setReading(true);
    setError(null);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append("resume", file);
      const response = await fetch("/api/onboarding/resume", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // A rejected upload comes back as the shared VALIDATION_ERROR shape,
        // whose top-level message is the generic "Invalid request" — the part
        // worth showing ("Upload a PDF résumé") is the first issue's message.
        const detail = Array.isArray(payload?.details) ? payload.details[0]?.message : null;
        throw new Error(detail ?? payload?.message ?? `Could not read that résumé (${response.status}).`);
      }

      const result = payload as ResumeExtraction;
      if (result.empty) {
        // A scanned résumé parses successfully and contains no words. Saying so
        // is more useful than reporting zero skills as if we had read it.
        throw new Error("We couldn't find any text in that PDF — it may be a scan. Try another file, or add your skills manually.");
      }
      if (result.skillIds.length === 0) {
        throw new Error("We read your résumé but didn't recognise any skills we track. Add them manually instead.");
      }
      onExtracted(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that résumé.");
      setReading(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={clsx(
          "mt-9 border-2 border-dashed px-6 py-12 text-center transition-colors duration-250",
          dragging ? "border-hot bg-sunk" : "border-line-soft",
        )}
      >
        <p className="k-label">{fileName ?? "Drop your PDF here"}</p>
        <p className="mx-auto mt-3 max-w-[38ch] text-[0.88rem] leading-relaxed text-muted">
          {reading
            ? "Reading your résumé…"
            : "We read it in your browser's request, pull out the skills we recognise, and forget the file. It's never stored."}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            // Allows re-picking the same file after an error.
            event.target.value = "";
          }}
        />

        <div className="mt-7">
          <Button onClick={() => inputRef.current?.click()} disabled={reading} size="md">
            {reading ? "Reading…" : "Choose a PDF"}
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-6 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSkip}
        className="mt-8 font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase underline underline-offset-4 transition-colors hover:text-ink"
      >
        Skip — I&apos;ll add my skills manually
      </button>
    </div>
  );
}
