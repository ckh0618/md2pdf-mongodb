import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundled fonts. Every glyph in the output must come from one of these
 * faces so rendering is identical on every machine and agent sandbox; the
 * layout check fails when Chromium falls back to a system font.
 *
 * Only the unicode-range subsets that intersect the document's characters
 * are inlined (base64) into the HTML, keeping the file self-contained.
 * All fonts are licensed under the SIL Open Font License 1.1.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES = resolve(__dirname, '../node_modules');

export const FONT_FAMILY = {
  sans: 'md2pdf Sans',
  sc: 'md2pdf CJK SC',
  tc: 'md2pdf CJK TC',
  mono: 'md2pdf Mono',
} as const;

/** Family names Chromium reports for the bundled font files. */
export const BUNDLED_FONT_NAMES = ['Pretendard', 'Noto Sans SC', 'Noto Sans TC', 'JetBrains Mono'];

type Role = keyof typeof FONT_FAMILY;

interface FaceSource {
  role: Role;
  weight: number;
  css: string;
}

const SOURCES: FaceSource[] = [
  { role: 'sans', weight: 400, css: 'pretendard/dist/web/static/Pretendard-Regular.css' },
  { role: 'sans', weight: 700, css: 'pretendard/dist/web/static/Pretendard-Bold.css' },
  { role: 'sc', weight: 400, css: '@fontsource/noto-sans-sc/400.css' },
  { role: 'sc', weight: 700, css: '@fontsource/noto-sans-sc/700.css' },
  { role: 'tc', weight: 400, css: '@fontsource/noto-sans-tc/400.css' },
  { role: 'tc', weight: 700, css: '@fontsource/noto-sans-tc/700.css' },
  { role: 'mono', weight: 400, css: '@fontsource/jetbrains-mono/400.css' },
  { role: 'mono', weight: 700, css: '@fontsource/jetbrains-mono/700.css' },
];

interface Face {
  role: Role;
  weight: number;
  file: string;
  ranges: Array<[number, number]>;
}

let cachedFaces: Face[] | undefined;

function parseRanges(text: string): Array<[number, number]> {
  return text.split(',').map((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
    const start = parseInt(a!, 16);
    return [start, b ? parseInt(b, 16) : start] as [number, number];
  });
}

function loadFaces(): Face[] {
  if (cachedFaces) return cachedFaces;
  const faces: Face[] = [];
  for (const source of SOURCES) {
    const cssPath = resolve(MODULES, source.css);
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf-8');
    } catch {
      throw new Error(`Bundled font stylesheet is missing: ${cssPath}. Run "npm ci" in md-to-pdf/.`);
    }
    for (const block of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const body = block[1]!;
      if (!/font-style:\s*normal/.test(body)) continue;
      const src = /url\(([^)]+?\.woff2)\)/.exec(body)?.[1];
      if (!src) continue;
      const declared = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? 'U+0-10FFFF';
      faces.push({
        role: source.role,
        weight: source.weight,
        file: resolve(dirname(cssPath), src.replace(/^['"]|['"]$/g, '')),
        ranges: parseRanges(declared),
      });
    }
  }
  cachedFaces = faces;
  return faces;
}

function covers(face: Face, cp: number): boolean {
  return face.ranges.some(([a, b]) => cp >= a && cp <= b);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&middot;', '·')
    .replaceAll('&copy;', '©')
    .replaceAll('&amp;', '&');
}

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/\b(?:src|href)="data:[^"]*"/gi, '')
      .replace(/<[^>]+>/g, ' '),
  );
}

function codePoints(text: string): Set<number> {
  const set = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0x20) set.add(cp);
  }
  return set;
}

/**
 * Han ideographs, CJK punctuation and fullwidth forms. Pretendard carries
 * Korean-style Hanja for these; Chinese documents must take them from Noto
 * Sans SC/TC instead so glyph shapes are consistent.
 */
const CJK_RANGES: Array<[number, number]> = [
  [0x2e80, 0x2fdf], [0x3000, 0x303f], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xffef], [0x20000, 0x3fffd],
];

function subtractRanges(ranges: Array<[number, number]>, remove: Array<[number, number]>): Array<[number, number]> {
  let out = ranges;
  for (const [ra, rb] of remove) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of out) {
      if (b < ra || a > rb) {
        next.push([a, b]);
        continue;
      }
      if (a < ra) next.push([a, ra - 1]);
      if (b > rb) next.push([rb + 1, b]);
    }
    out = next;
  }
  return out;
}

function rangeText(ranges: Array<[number, number]>): string {
  return ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(',');
}

function isChinese(language: string): boolean {
  return /^zh\b/i.test(language);
}

function faceCss(face: Face, family: string): string {
  const data = readFileSync(face.file).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${face.weight};font-display:block;`
    + `src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${rangeText(face.ranges)};}`;
}

export interface FontSelection {
  css: string;
  bytes: number;
  faces: number;
}

/**
 * Builds @font-face rules for the faces needed to render `html` plus any
 * extra strings drawn outside the document body (PDF header/footer).
 */
export function buildFontFaceCss(html: string, extraText = '', language = 'en'): FontSelection {
  const zh = isChinese(language);
  const faces = loadFaces()
    .map((face) => (zh && face.role === 'sans' ? { ...face, ranges: subtractRanges(face.ranges, CJK_RANGES) } : face))
    .filter((face) => face.ranges.length > 0);
  const all = codePoints(visibleText(html) + extraText);
  const codeText = [...html.matchAll(/<(pre|code)\b[\s\S]*?<\/\1>/gi)].map((m) => visibleText(m[0])).join(' ');
  const code = codePoints(codeText);

  const sansFaces = faces.filter((f) => f.role === 'sans');
  const uncoveredBySans = new Set([...all].filter((cp) => !sansFaces.some((f) => covers(f, cp))));

  // The primary CJK family follows the document script; the other one only
  // supplies glyphs the primary lacks.
  const primaryCjk: Role = /^zh-(hant|tw|hk|mo)\b/i.test(language) ? 'tc' : 'sc';
  const primaryFaces = faces.filter((f) => f.role === primaryCjk);
  const uncoveredByPrimary = new Set([...uncoveredBySans].filter((cp) => !primaryFaces.some((f) => covers(f, cp))));

  const selected = faces.filter((face) => {
    switch (face.role) {
      case 'sans':
        return [...all].some((cp) => covers(face, cp));
      case 'sc':
      case 'tc':
        return [...(face.role === primaryCjk ? uncoveredBySans : uncoveredByPrimary)].some((cp) => covers(face, cp));
      case 'mono':
        return [...code].some((cp) => covers(face, cp));
      default:
        return false;
    }
  });

  let bytes = 0;
  const rules = selected.map((face) => {
    const rule = faceCss(face, FONT_FAMILY[face.role]);
    bytes += rule.length;
    return rule;
  });
  return { css: rules.join('\n'), bytes, faces: selected.length };
}
