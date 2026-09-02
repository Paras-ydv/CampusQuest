/**
 * Minimal, dependency-free PDF text extraction.
 *
 * hiring-agent uses PyMuPDF here. There is no equivalent in this stack, and a
 * full PDF engine is a large dependency for one onboarding step, so this reads
 * the container directly: it inflates the content streams and pulls the string
 * operands out of the text-showing operators. Layout, columns, tables and
 * images are deliberately out of scope — the matcher downstream only needs the
 * words, in any order.
 *
 * A scanned (image-only) résumé yields nothing. The route reports that to the
 * student rather than guessing, and manual entry stays one click away.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

/** Bounds the work done for a hostile or pathological file. */
const MAX_TEXT_CHARS = 400_000;

/**
 * Kerning magnitude, in thousandths of an em, at or above which a gap in a TJ
 * array is treated as a word space rather than letter tightening.
 *
 * TeX's intra-word kerns are tens of units (75 between "Shiv" and "ansh");
 * its interword space is 250 or more. 150 sits in the empty band between the
 * two and is the standard threshold PDF text extractors use.
 */
const WORD_SPACE_KERN = 150;

/** Inflates a FlateDecode stream, tolerating a missing zlib header. */
function inflate(bytes: Buffer): Buffer | null {
  try {
    return inflateSync(bytes);
  } catch {
    try {
      return inflateRawSync(bytes);
    } catch {
      return null;
    }
  }
}

/**
 * Returns the bytes between `stream` and `endstream` for every object in the
 * file, inflating the ones that are Flate-compressed and passing through the
 * ones that are not.
 */
function contentStreams(pdf: Buffer): Buffer[] {
  const streams: Buffer[] = [];
  const marker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");

  let cursor = 0;
  while (cursor < pdf.length) {
    const start = pdf.indexOf(marker, cursor);
    if (start === -1) break;
    // `endstream` and `endobj` both contain "stream"; skip those matches.
    const preceding = pdf.subarray(Math.max(0, start - 3), start).toString("latin1");
    if (preceding.endsWith("end")) {
      cursor = start + marker.length;
      continue;
    }
    const end = pdf.indexOf(endMarker, start);
    if (end === -1) break;

    // The keyword is followed by CRLF or LF before the data begins.
    let from = start + marker.length;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    const raw = pdf.subarray(from, end);
    if (raw.length) streams.push(inflate(raw) ?? raw);
    cursor = end + endMarker.length;
  }
  return streams;
}

/** Resolves the escapes that may appear inside a PDF literal string. */
function decodeLiteral(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = source[++i];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let octal = next;
      while (octal.length < 3 && source[i + 1] >= "0" && source[i + 1] <= "7") octal += source[++i];
      out += String.fromCharCode(parseInt(octal, 8));
      continue;
    }
    out += next === "n" ? "\n" : next === "r" ? "\r" : next === "t" ? "\t" : next === "b" ? "\b" : next === "f" ? "\f" : next;
  }
  return out;
}

/** Decodes a hex string operand, e.g. `<48656C6C6F>`. */
function decodeHex(source: string): string {
  const digits = source.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  // UTF-16BE is common for hex strings; the heuristic is that a run of
  // alternating NUL high bytes means two-byte characters.
  const bytes: number[] = [];
  for (let i = 0; i + 1 < digits.length; i += 2) bytes.push(parseInt(digits.slice(i, i + 2), 16));
  const isUtf16 = bytes.length > 1 && bytes.filter((_, i) => i % 2 === 0).every((b) => b === 0);
  if (isUtf16) {
    for (let i = 1; i < bytes.length; i += 2) out += String.fromCharCode(bytes[i]!);
    return out;
  }
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/**
 * Pulls the operands of the text-showing operators (`Tj`, `TJ`, `'`, `"`) out
 * of one decoded content stream.
 */
function textFromStream(stream: string): string {
  let out = "";
  for (let i = 0; i < stream.length; i += 1) {
    const char = stream[i]!;

    if (char === "(") {
      // Literal string: track nesting, honouring backslash escapes.
      let depth = 1;
      let body = "";
      i += 1;
      for (; i < stream.length && depth > 0; i += 1) {
        const c = stream[i]!;
        if (c === "\\") {
          body += c + (stream[i + 1] ?? "");
          i += 1;
          continue;
        }
        if (c === "(") depth += 1;
        if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
        body += c;
      }
      out += decodeLiteral(body);
      continue;
    }

    if (char === "<" && stream[i + 1] !== "<") {
      const close = stream.indexOf(">", i);
      if (close === -1) break;
      out += decodeHex(stream.slice(i + 1, close));
      i = close;
      continue;
    }

    // Inside a TJ array the numbers between strings are kerning, expressed in
    // thousandths of an em and *negative* when they push text apart. TeX uses
    // small kerns to tighten letter pairs within a word — "[(Shiv)75(ansh)]"
    // is one word — and a large one where a space belongs:
    // "[(Bha)45(geria)-250(Bengaluru)]". Reading that magnitude is the only
    // way to recover word breaks, because these PDFs contain no space
    // characters at all.
    if (char === "-" || (char >= "0" && char <= "9")) {
      let literal = char;
      while (i + 1 < stream.length && /[0-9.]/.test(stream[i + 1]!)) literal += stream[++i]!;
      if (Math.abs(Number(literal)) >= WORD_SPACE_KERN) out += " ";
      continue;
    }

    // Word separation is the whole game here. TeX-produced PDFs — the format
    // most student résumés are built in — place *every word* at its own
    // coordinate and put no spaces inside the strings at all, so the only
    // evidence of a word break is the positioning operator between the runs.
    // Missing `Tm` here fused "Bachelor of Technology in Computer Science"
    // into one unmatchable token.
    //
    // Emitting a space for a text-showing operator too (`Tj`, `'`, `"`) is
    // safe: PDFs that do embed real spaces only gain a redundant one, and the
    // whitespace is collapsed on the way out.
    if (char === "T" && "dDmM*Jj".includes(stream[i + 1] ?? "")) out += " ";
    if (char === "'" || char === '"') out += " ";
    if (char === "]" || char === "\n" || char === "\r") out += " ";

    if (out.length > MAX_TEXT_CHARS) break;
  }
  return out;
}

/** True when the bytes begin with a PDF header. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/**
 * Extracts the readable text of a PDF. Returns an empty string for a scanned or
 * otherwise text-free document; callers must treat that as "nothing found"
 * rather than an error.
 */
export function extractPdfText(bytes: Uint8Array): string {
  const pdf = Buffer.from(bytes);
  let text = "";
  for (const stream of contentStreams(pdf)) {
    text += ` ${textFromStream(stream.toString("latin1"))}`;
    if (text.length > MAX_TEXT_CHARS) break;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}
