import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFontFaceCss } from './fonts.js';

test('embeds only the font subsets the document needs', () => {
  const latin = buildFontFaceCss('<p>Hello world</p>');
  const korean = buildFontFaceCss('<p>안녕하세요 문서</p><pre><code>db.x.find()</code></pre>');
  assert.match(latin.css, /font-family:'md2pdf Sans'/);
  assert.doesNotMatch(latin.css, /md2pdf Mono|md2pdf CJK/);
  assert.match(korean.css, /font-family:'md2pdf Mono'/);
  assert.ok(korean.faces > latin.faces);
  assert.match(korean.css, /src:url\(data:font\/woff2;base64,/);
});

test('Chinese documents take Han glyphs from Noto Sans SC/TC, not Pretendard', () => {
  const hans = buildFontFaceCss('<p>简体中文示例</p>', '', 'zh-Hans');
  const hant = buildFontFaceCss('<p>繁體中文範例</p>', '', 'zh-Hant');
  assert.match(hans.css, /md2pdf CJK SC/);
  assert.doesNotMatch(hans.css, /md2pdf CJK TC/);
  assert.match(hant.css, /md2pdf CJK TC/);
  const sansRanges = [...hans.css.matchAll(/font-family:'md2pdf Sans'[^}]*unicode-range:([^;}]*)/g)].map((m) => m[1]!);
  for (const ranges of sansRanges) assert.doesNotMatch(ranges, /U\+4e00|U\+7b80/);
});
