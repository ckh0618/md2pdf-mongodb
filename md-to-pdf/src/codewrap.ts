/**
 * Deterministic hard-wrapping of over-long code lines.
 *
 * Code blocks are never soft-wrapped by the browser and their font is never
 * shrunk. When a line is wider than the printable code column, a real
 * newline is inserted at the safest break point for the block's language so
 * the pasted text still runs:
 *
 * - shell/dockerfile: `␠\` line continuation (or a bare `\` mid-token, which
 *   bash removes together with the newline)
 * - powershell: `␠\`` continuation
 * - python: implicit continuation inside brackets, `␠\` outside
 * - C-like languages / JSON / CSS: break after `,` `(` `[` `{` or a binary
 *   operator, outside strings and comments (whitespace-insensitive grammars)
 * - SQL / text / markup: break at whitespace outside string literals
 *
 * A break that cannot be made without changing meaning (for example inside a
 * string literal) is still made — the user asked for forced newlines instead
 * of smaller fonts — but it is reported through `unsafe` so the author can
 * shorten the line in the Markdown source instead.
 */

export type WrapFamily = 'shell' | 'powershell' | 'python' | 'clike' | 'sql' | 'yaml' | 'text';

export interface WrapResult {
  text: string;
  /** Number of source lines that needed at least one forced newline. */
  wrappedLines: number;
  /** Source lines where a forced newline may change meaning (first 80 chars). */
  unsafe: string[];
}

const FAMILY_BY_LANG: Record<string, WrapFamily> = {
  bash: 'shell', sh: 'shell', shell: 'shell', zsh: 'shell', console: 'shell', shellscript: 'shell',
  shellsession: 'shell', fish: 'shell', dockerfile: 'shell', docker: 'shell', makefile: 'shell',
  powershell: 'powershell', ps1: 'powershell', pwsh: 'powershell', ps: 'powershell',
  python: 'python', py: 'python',
  javascript: 'clike', js: 'clike', typescript: 'clike', ts: 'clike', jsx: 'clike', tsx: 'clike',
  json: 'clike', jsonc: 'clike', json5: 'clike', java: 'clike', c: 'clike', cpp: 'clike',
  csharp: 'clike', cs: 'clike', go: 'clike', rust: 'clike', kotlin: 'clike', swift: 'clike',
  scala: 'clike', php: 'clike', css: 'clike', scss: 'clike', less: 'clike', groovy: 'clike',
  dart: 'clike', mongosh: 'clike', mongodb: 'clike', hcl: 'clike', terraform: 'clike',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', plsql: 'sql',
  yaml: 'yaml', yml: 'yaml',
};

export function wrapFamily(lang: string): WrapFamily {
  return FAMILY_BY_LANG[lang.toLocaleLowerCase()] ?? 'text';
}

const TAB_SIZE = 4;

function isWide(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0x303e)
    || (cp >= 0x3041 && cp <= 0x33ff)
    || (cp >= 0x3400 && cp <= 0x4dbf)
    || (cp >= 0x4e00 && cp <= 0x9fff)
    || (cp >= 0xa000 && cp <= 0xa4cf)
    || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x1f300 && cp <= 0x1faff)
    || (cp >= 0x20000 && cp <= 0x3fffd);
}

/** Display width in monospace columns (wide CJK = 2, tab = next stop). */
export function displayWidth(text: string, startCol = 0): number {
  let col = startCol;
  for (const ch of text) {
    if (ch === '\t') {
      col += TAB_SIZE - (col % TAB_SIZE);
    } else {
      col += isWide(ch.codePointAt(0)!) ? 2 : 1;
    }
  }
  return col - startCol;
}

type Kind = 'soft' | 'ws' | 'hard';

interface Candidate {
  /** Index where the current segment ends (exclusive). */
  end: number;
  /** Index where the next segment starts. */
  next: number;
  kind: Kind;
}

interface CharState {
  inString: boolean;
  /** Quote character of the enclosing string, when inString. */
  quote: string;
  inComment: boolean;
  depth: number;
}

interface CrossLineState {
  blockComment: boolean;
  template: boolean;
  tripleQuote: string;
  heredocEnd: string | null;
  heredocQuoted: boolean;
}

function newCrossLineState(): CrossLineState {
  return { blockComment: false, template: false, tripleQuote: '', heredocEnd: null, heredocQuoted: false };
}

const LINE_COMMENT: Record<WrapFamily, string[]> = {
  shell: ['#'],
  powershell: ['#'],
  python: ['#'],
  clike: ['//'],
  sql: ['--'],
  yaml: ['#'],
  text: [],
};

/**
 * Scans one line and returns, for every index, the lexical state *before*
 * that character, plus the comment marker if the line enters a line comment.
 */
function scanLine(line: string, family: WrapFamily, cross: CrossLineState): {
  states: CharState[];
  commentStart: number;
  commentMarker: string;
} {
  const states: CharState[] = [];
  let quote = cross.template ? '`' : cross.tripleQuote ? cross.tripleQuote : '';
  let inString = quote !== '';
  let inBlock = cross.blockComment;
  let depth = 0;
  let commentStart = -1;
  let commentMarker = '';
  const markers = LINE_COMMENT[family];

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    states.push({ inString, quote, inComment: commentStart >= 0 || inBlock, depth });
    if (commentStart >= 0) continue;

    if (inBlock) {
      if (ch === '*' && line[i + 1] === '/') {
        inBlock = false;
        states.push({ inString, quote, inComment: true, depth });
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (ch === '\\' && quote !== "'" ) {
        states.push({ inString, quote, inComment: false, depth });
        i += 1;
        continue;
      }
      if (quote.length === 3) {
        if (line.startsWith(quote, i)) {
          states.push({ inString, quote, inComment: false, depth }, { inString, quote, inComment: false, depth });
          i += 2;
          inString = false;
          quote = '';
        }
        continue;
      }
      if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (family === 'clike' && ch === '/' && line[i + 1] === '*') {
      inBlock = true;
      continue;
    }
    const marker = markers.find((m) => line.startsWith(m, i));
    if (marker && (family !== 'shell' || i === 0 || /\s/.test(line[i - 1]!))) {
      commentStart = i;
      commentMarker = marker;
      states[states.length - 1]!.inComment = true;
      continue;
    }
    if (family === 'python' && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
      inString = true;
      quote = line.slice(i, i + 3);
      states.push({ inString: true, quote, inComment: false, depth }, { inString: true, quote, inComment: false, depth });
      i += 2;
      continue;
    }
    const quoteChars = family === 'clike' || family === 'shell' || family === 'powershell'
      ? ['"', "'", '`']
      : ['"', "'"];
    if (quoteChars.includes(ch)) {
      // Shell backticks are command substitution; treat like a string span.
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth -= 1;
  }

  cross.blockComment = inBlock;
  cross.template = family === 'clike' && inString && quote === '`';
  cross.tripleQuote = family === 'python' && inString && quote.length === 3 ? quote : '';
  return { states, commentStart, commentMarker };
}

const OPERATOR_AFTER = ['&&', '||', '=>', '??', '+=', '-=', '==', '!=', '<=', '>=', '=', '+', '-', '*', '/', '?', ':', '|', '&'];

function collectCandidates(
  line: string,
  family: WrapFamily,
  lang: string,
  states: CharState[],
): Candidate[] {
  const out: Candidate[] = [];
  const skipWs = (i: number): number => {
    let j = i;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j += 1;
    return j;
  };
  const leading = skipWs(0);

  for (let i = leading; i < line.length; i += 1) {
    const st = states[i]!;
    const ch = line[i]!;

    if (st.inComment) {
      if (ch === ' ' && line[i - 1] !== ' ') out.push({ end: i, next: skipWs(i), kind: 'ws' });
      continue;
    }
    if (st.inString) continue;

    if (family === 'clike' || (family === 'python' && st.depth > 0) || (family === 'yaml' && st.depth > 0)) {
      if (ch === ',' || ch === '(' || ch === '[' || ch === '{') {
        const next = skipWs(i + 1);
        if (next < line.length) out.push({ end: i + 1, next, kind: 'soft' });
        continue;
      }
      if (ch === ' ') {
        // Break after a binary operator: "a && b" -> "a &&" / "b".
        const before = line.slice(0, i).trimEnd();
        const op = OPERATOR_AFTER.find((o) => before.endsWith(` ${o}`) || before.endsWith(o) && o.length > 1);
        if (op && before.length > leading) {
          const next = skipWs(i);
          if (next < line.length) out.push({ end: before.length, next, kind: 'soft' });
        }
        continue;
      }
      // JS/TS method chains: break before ".call(" when preceded by ")".
      if (ch === '.' && family === 'clike' && /^(javascript|js|typescript|ts|jsx|tsx|mongosh|mongodb)$/.test(lang)
        && (line[i - 1] === ')' || line[i - 1] === ']') && /[A-Za-z_$]/.test(line[i + 1] ?? '')) {
        out.push({ end: i, next: i, kind: 'soft' });
      }
      continue;
    }

    if (ch === ' ' && line[i - 1] !== ' ') {
      out.push({ end: i, next: skipWs(i), kind: 'ws' });
    }
  }
  return out;
}

interface SegmentPlan {
  /** Appended to the end of the segment (e.g. " \\"). */
  suffix: string;
  /** Prefix of the continuation line. */
  prefix: string;
  safe: boolean;
}

function planFor(
  family: WrapFamily,
  kind: Kind,
  st: CharState,
  indent: string,
  commentMarker: string,
  cross: CrossLineState,
): SegmentPlan {
  const cont = `${indent}  `;
  if (st.inComment) return { suffix: '', prefix: `${indent}${commentMarker} `, safe: true };

  switch (family) {
    case 'shell': {
      if (cross.heredocEnd) {
        return cross.heredocQuoted
          ? { suffix: '', prefix: '', safe: false }
          : { suffix: kind === 'hard' ? '\\' : ' \\', prefix: kind === 'hard' ? '' : '', safe: kind === 'hard' };
      }
      if (kind === 'hard') {
        // Backslash-newline is removed by the shell, even mid-token, except
        // inside single quotes.
        return { suffix: '\\', prefix: '', safe: !(st.inString && st.quote === "'") };
      }
      return { suffix: ' \\', prefix: cont, safe: true };
    }
    case 'powershell':
      return kind === 'hard'
        ? { suffix: '', prefix: cont, safe: false }
        : { suffix: ' `', prefix: cont, safe: true };
    case 'python':
      if (kind === 'hard') return { suffix: '', prefix: cont, safe: false };
      return st.depth > 0 || kind === 'soft'
        ? { suffix: '', prefix: cont, safe: true }
        : { suffix: ' \\', prefix: cont, safe: true };
    case 'clike':
      return { suffix: '', prefix: cont, safe: kind !== 'hard' };
    case 'sql':
      return { suffix: '', prefix: cont, safe: kind !== 'hard' };
    case 'yaml':
      return { suffix: '', prefix: cont, safe: kind === 'soft' };
    default:
      return { suffix: '', prefix: cont, safe: true };
  }
}

function wrapLine(
  line: string,
  family: WrapFamily,
  lang: string,
  maxCols: number,
  cross: CrossLineState,
): { lines: string[]; unsafe: boolean } {
  const heredocBefore = cross.heredocEnd;
  const { states, commentMarker } = scanLine(line, family, cross);
  if (displayWidth(line) <= maxCols) return { lines: [line], unsafe: false };

  const indent = /^[ \t]*/.exec(line)![0];
  const candidates = collectCandidates(line, family, lang, states);
  const heredocCross = { ...cross, heredocEnd: heredocBefore };
  const out: string[] = [];
  let unsafe = false;
  let start = 0;
  let prefix = '';

  // Guard: the continuation prefix itself must leave room for content.
  const minContent = Math.max(8, Math.floor(maxCols / 4));

  while (displayWidth(prefix + line.slice(start)) > maxCols) {
    const prefixWidth = displayWidth(prefix);
    let chosen: Candidate | undefined;
    let chosenPlan: SegmentPlan | undefined;

    for (let c = candidates.length - 1; c >= 0; c -= 1) {
      const cand = candidates[c]!;
      if (cand.end <= start || cand.next <= start) continue;
      const st = states[Math.min(cand.end, states.length - 1)]!;
      const plan = planFor(family, cand.kind, st, indent, commentMarker, heredocCross);
      const segment = line.slice(start, cand.end).trimEnd();
      if (segment.trim().length === 0) continue;
      if (prefixWidth + displayWidth(segment) + displayWidth(plan.suffix) <= maxCols
        && displayWidth(plan.prefix) <= maxCols - minContent) {
        chosen = cand;
        chosenPlan = plan;
        break;
      }
    }

    if (!chosen || !chosenPlan) {
      // No safe break point fits: force a hard break at the column limit.
      const st = states[start] ?? { inString: false, quote: '', inComment: false, depth: 0 };
      const plan = planFor(family, 'hard', st, indent, commentMarker, heredocCross);
      const budget = maxCols - prefixWidth - displayWidth(plan.suffix);
      let end = start;
      let width = 0;
      for (const ch of line.slice(start)) {
        const w = displayWidth(ch, prefixWidth + width);
        if (width + w > budget) break;
        width += w;
        end += ch.length;
      }
      if (end <= start) end = start + 1;
      const hardState = states[end] ?? st;
      const hardPlan = planFor(family, 'hard', hardState, indent, commentMarker, heredocCross);
      if (!hardPlan.safe) unsafe = true;
      out.push(prefix + line.slice(start, end) + hardPlan.suffix);
      start = end;
      prefix = hardPlan.prefix;
      continue;
    }

    if (!chosenPlan.safe) unsafe = true;
    out.push(prefix + line.slice(start, chosen.end).trimEnd() + chosenPlan.suffix);
    start = chosen.next;
    prefix = chosenPlan.prefix;
  }
  out.push(prefix + line.slice(start));
  return { lines: out, unsafe };
}

function updateHeredoc(line: string, cross: CrossLineState): void {
  if (cross.heredocEnd) {
    if (line.trim() === cross.heredocEnd) cross.heredocEnd = null;
    return;
  }
  const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
  if (m) {
    cross.heredocEnd = m[2]!;
    cross.heredocQuoted = m[1] !== '';
  }
}

export function wrapCode(code: string, lang: string, maxCols: number): WrapResult {
  const family = wrapFamily(lang);
  const cross = newCrossLineState();
  const out: string[] = [];
  const unsafe: string[] = [];
  let wrappedLines = 0;

  for (const line of code.split('\n')) {
    const { lines, unsafe: isUnsafe } = wrapLine(line, family, lang.toLocaleLowerCase(), maxCols, cross);
    if (family === 'shell') updateHeredoc(line, cross);
    if (lines.length > 1) wrappedLines += 1;
    if (isUnsafe) unsafe.push(line.trim().slice(0, 80));
    out.push(...lines);
  }
  return { text: out.join('\n'), wrappedLines, unsafe };
}
