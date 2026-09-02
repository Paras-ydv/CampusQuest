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
  const streams: { object: number; body: Buffer }[] = [];
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

    // The dictionary immediately before `stream` says what the stream holds.
    // Embedded fonts, images and colour profiles are the bulk of a PDF's
    // bytes, and decoding them as text produced tens of thousands of
    // characters of noise that buried the résumé — on a two-page CV the real
    // prose ended after 193 characters and everything downstream, including
    // the text sent for skill extraction, saw only garbage.
    // The window stops at this object's own `obj` keyword. A fixed lookback
    // reaches back into whatever preceded it, so a font declared just above a
    // page would reject the page as well.
    const window = pdf.subarray(Math.max(0, start - 600), start).toString("latin1");
    const objectStart = window.lastIndexOf(" obj");
    const dictionary = objectStart === -1 ? window : window.slice(objectStart);
    if (/\/Subtype\s*\/(Type1C|CIDFontType0C|TrueType|OpenType|Image)\b|\/Type\s*\/(Font|XObject|Metadata|XRef|ObjStm)\b|\/(FontFile[23]?|Length1)\b/.test(dictionary)) {
      cursor = end + endMarker.length;
      continue;
    }

    // The keyword is followed by CRLF or LF before the data begins.
    let from = start + marker.length;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    const raw = pdf.subarray(from, end);
    if (raw.length) {
      const decoded = inflate(raw) ?? raw;
      // The dictionary check above catches writers that label their fonts.
      // Others — Word and the browser print pipeline among them — emit every
      // stream as a bare `<< /Length N /Filter /FlateDecode >>`, so a font is
      // indistinguishable from a page by its dictionary alone. What separates
      // them is the content: a page is a sequence of operators and always
      // opens a text object, while a font is a binary table. Requiring the
      // text operators is what makes those résumés readable at all.
      if (isContentStream(decoded)) {
        // Read from the full window, not from `dictionary`: that was sliced to
        // begin at " obj", which cuts off the very number being looked for.
        const object = [...window.matchAll(/(\d+)\s+\d+\s+obj/g)].pop();
        streams.push({ object: object ? Number(object[1]) : Number.MAX_SAFE_INTEGER, body: decoded });
      }
    }
    cursor = end + endMarker.length;
  }

  // Byte order is not page order: a writer may lay page two down first, which
  // put the certificates page ahead of the name and left the name extractor
  // reading the wrong line. The /Kids array is the document's own ordering.
  const order = pageOrder(pdf);
  if (order.length) {
    streams.sort((left, right) => {
      const l = order.indexOf(left.object);
      const r = order.indexOf(right.object);
      return (l === -1 ? order.length : l) - (r === -1 ? order.length : r);
    });
  }
  return streams.map((stream) => stream.body);
}

/**
 * The content-stream object numbers, in the order the document presents its
 * pages.
 *
 * Read from the page tree: `/Kids [3 0 R 4 0 R]` lists the pages, and each
 * page's `/Contents` names the stream that draws it.
 */
function pageOrder(pdf: Buffer): number[] {
  const source = pdf.toString("latin1");
  const kids = source.match(/\/Kids\s*\[([^\]]*)\]/);
  if (!kids) return [];

  const contents = new Map<number, number>();
  for (const [, object, dictionary] of source.matchAll(/(\d+)\s+\d+\s+obj\s*(<<[\s\S]{0,600}?>>)/g)) {
    const reference = dictionary.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (reference) contents.set(Number(object), Number(reference[1]));
  }

  return [...kids[1].matchAll(/(\d+)\s+\d+\s+R/g)]
    .map(([, page]) => contents.get(Number(page)))
    .filter((object): object is number => object !== undefined);
}

/**
 * True when a decoded stream is page content rather than an embedded resource.
 *
 * A content stream opens a text object with `BT` and shows text with `Tj`, `TJ`
 * or a quote operator. Fonts, CMaps, colour profiles and image data contain
 * none of that — a TrueType font opens with its own `true` magic number — so
 * requiring both markers separates them without needing the dictionary to say
 * so, which many PDF writers do not.
 *
 * Only the head is examined: a page declares its text object early, and
 * scanning megabytes of font data for an operator that is not there is waste.
 */
function isContentStream(decoded: Buffer): boolean {
  const head = decoded.subarray(0, 4096).toString("latin1");
  return /(^|[\s>\]])BT[\s/]/.test(head) && /(^|[\s>\])])(TJ|Tj|'|")[\s/]/.test(decoded.subarray(0, 65536).toString("latin1"));
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
function textFromStream(stream: string, fonts: Map<string, Map<number, string>>, fallback: Map<number, string>): string {
  let out = "";
  // The font in force, set by the most recent `/Name size Tf`. Each string is
  // decoded with its own font's glyph map, because two subsetted fonts number
  // their glyphs from the same zero.
  let active: Map<number, string> | null = null;
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
      out += decodeGlyphs(decodeLiteral(body), active ?? fallback);
      continue;
    }

    if (char === "<" && stream[i + 1] !== "<") {
      const close = stream.indexOf(">", i);
      if (close === -1) break;
      out += decodeGlyphs(decodeHex(stream.slice(i + 1, close)), active ?? fallback);
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
    if (char === "T" && stream[i + 1] === "f") {
      // "/F2 11 Tf" — the name sits before the size, a little way back.
      const selector = stream.slice(Math.max(0, i - 40), i).match(/\/([A-Za-z0-9]+)\s+[\d.]+\s*$/);
      if (selector) active = fonts.get(selector[1]) ?? active;
    }
    if (char === "T" && "dDmM*Jj".includes(stream[i + 1] ?? "")) out += " ";
    if (char === "'" || char === '"') out += " ";
    if (char === "]" || char === "\n" || char === "\r") out += " ";

    if (out.length > MAX_TEXT_CHARS) break;
  }
  return out;
}

/**
 * Builds the glyph-code to character map from every ToUnicode CMap in the file.
 *
 * A subsetted font renumbers its glyphs from zero, so the content stream holds
 * indices, not text. The CMap that accompanies it declares the meaning of each
 * index in one of two forms: `beginbfchar`, listing codes individually, and
 * `beginbfrange`, giving a contiguous run a starting character.
 *
 * The maps of different fonts are merged. That is not strictly correct — each
 * font has its own numbering, and resolving properly means tracking which font
 * is selected at each point in the content stream. In practice a résumé's
 * subsets agree far more often than they collide, and merging recovers the
 * text where doing nothing recovers none of it.
 */
function unicodeMap(pdf: Buffer): Map<number, string> {
  return mergedMap(cmapsByObject(pdf).values());
}

/** Unions several glyph maps, first definition winning. */
function mergedMap(maps: Iterable<Map<number, string>>): Map<number, string> {
  const merged = new Map<number, string>();
  for (const map of maps) {
    for (const [code, value] of map) if (!merged.has(code)) merged.set(code, value);
  }
  return merged;
}

/**
 * Every ToUnicode CMap in the file, keyed by the object number that holds it.
 *
 * Keeping them apart is what makes a multi-font résumé readable: two subsetted
 * fonts both number their glyphs from zero, so merging their maps decodes each
 * font's text with the other's alphabet.
 */
function cmapsByObject(pdf: Buffer): Map<number, Map<number, string>> {
  const cmaps = new Map<number, Map<number, string>>();
  const marker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");

  let cursor = 0;
  while (cursor < pdf.length) {
    const start = pdf.indexOf(marker, cursor);
    if (start === -1) break;
    if (pdf.subarray(Math.max(0, start - 3), start).toString("latin1").endsWith("end")) {
      cursor = start + marker.length;
      continue;
    }
    const end = pdf.indexOf(endMarker, start);
    if (end === -1) break;

    let from = start + marker.length;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    const decoded = inflate(pdf.subarray(from, end));
    const body = decoded?.toString("latin1") ?? "";
    if (body.includes("begincmap")) {
      // The object number precedes the dictionary: "42 0 obj << … >> stream".
      const header = pdf.subarray(Math.max(0, start - 600), start).toString("latin1");
      const object = [...header.matchAll(/(\d+)\s+\d+\s+obj/g)].pop();
      const map = new Map<number, string>();
      readCMap(body, map);
      if (map.size) cmaps.set(object ? Number(object[1]) : -cmaps.size - 1, map);
    }
    cursor = end + endMarker.length;
  }
  return cmaps;
}

/**
 * Maps each content-stream font name (`/F2`) to the glyph map it selects.
 *
 * The link runs through two dictionaries: a page's resources name the font
 * objects, and each font object points at its ToUnicode CMap.
 */
function fontMaps(pdf: Buffer): Map<string, Map<number, string>> {
  const source = pdf.toString("latin1");
  const cmaps = cmapsByObject(pdf);
  const result = new Map<string, Map<number, string>>();

  // "10 0 obj << … /ToUnicode 42 0 R >>" — which CMap each font object uses.
  const toUnicode = new Map<number, number>();
  for (const [, object, dictionary] of source.matchAll(/(\d+)\s+\d+\s+obj\s*(<<[\s\S]{0,600}?>>)/g)) {
    const reference = dictionary.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (reference) toUnicode.set(Number(object), Number(reference[1]));
  }

  // "/Font << /F2 10 0 R /F3 11 0 R >>" — the names a content stream uses.
  for (const [, block] of source.matchAll(/\/Font\s*<<([\s\S]{0,2000}?)>>/g)) {
    for (const [, name, object] of block.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)) {
      const cmap = cmaps.get(toUnicode.get(Number(object)) ?? -1);
      if (cmap && !result.has(name)) result.set(name, cmap);
    }
  }
  return result;
}

/**
 * Reads one CMap's `bfchar` and `bfrange` sections into the map.
 *
 * The two are parsed from their own delimited blocks rather than by matching
 * hex pairs across the whole body: a `bfrange` entry is three values and a
 * `bfchar` entry is two, so a regex for either happily consumes the other and
 * assigns nonsense.
 */
function readCMap(body: string, map: Map<number, string>): void {
  for (const [, block] of body.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    // The value may hold several space-separated units: a ligature glyph maps
    // back to the letters it stands for, so "fi" is `<0066 0069>`. Without
    // allowing the space the entry is skipped and the word loses its letters —
    // "final-year" came out as " nal-year".
    for (const [, code, value] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]*)>/g)) {
      // A value may be several UTF-16 units, which is how a ligature maps back
      // to the letters it stands for ("fi" is one glyph, two characters).
      const characters = charactersFrom(value);
      if (characters) map.set(parseInt(code, 16), characters);
    }
  }

  for (const [, block] of body.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, first] of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const start = parseInt(lo, 16);
      const stop = parseInt(hi, 16);
      const base = parseInt(first, 16);
      // A malformed range must not spin: real ones cover a handful of glyphs.
      if (!Number.isFinite(base) || stop < start || stop - start > 0xffff) continue;
      for (let code = start; code <= stop; code += 1) {
        map.set(code, String.fromCharCode(base + (code - start)));
      }
    }
  }
}

/** Reads a CMap value, which is one or more UTF-16 code units in hex. */
function charactersFrom(hex: string): string {
  const digits = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 3 < digits.length + 1; i += 4) {
    const unit = parseInt(digits.slice(i, i + 4), 16);
    if (Number.isFinite(unit) && unit > 0) out += String.fromCharCode(unit);
  }
  return out;
}

/**
 * Applies the CMap to text pulled from a content stream.
 *
 * Returns the input untouched when the map explains none of it: a PDF whose
 * fonts are standard encodes real characters already, and remapping those
 * would destroy readable text.
 */
function decodeGlyphs(raw: string, map: Map<number, string>): string {
  if (map.size === 0) return raw;

  let mapped = 0;
  let out = "";
  for (const char of raw) {
    const replacement = map.get(char.charCodeAt(0));
    if (replacement === undefined) {
      out += char;
      continue;
    }
    mapped += 1;
    out += replacement;
  }
  // Under a tenth explained means these were already characters and the map
  // belongs to a font this text does not use.
  return mapped * 10 >= raw.length ? out : raw;
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
  // Writers that subset their fonts renumber the glyphs, so the bytes in a
  // content stream are indices into a font rather than characters. The
  // ToUnicode CMaps say what each index means; without applying them a résumé
  // from Word or a browser's print dialogue extracts as `( " % ) $ &`.
  const fonts = fontMaps(pdf);
  // Used where a stream shows text before selecting a font, or names one the
  // resource dictionaries do not resolve.
  const fallback = mergedMap(fonts.values());
  let text = "";
  for (const stream of contentStreams(pdf)) {
    text += ` ${textFromStream(stream.toString("latin1"), fonts, fallback)}`;
    if (text.length > MAX_TEXT_CHARS) break;
  }
  return text
    // Font and glyph tables inside the content streams decode to control
    // characters — a real résumé yields thousands, including NUL. They are not
    // text, they break Postgres `text` columns outright ("unsupported Unicode
    // escape sequence"), and they waste a model's context, so they are dropped
    // to spaces here rather than at each consumer.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
