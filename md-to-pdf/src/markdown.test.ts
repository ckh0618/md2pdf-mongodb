import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { convertMarkdown } from './markdown.js';

test('converts GFM, headings, highlighted code, and admonitions', async () => {
  const markdown = `# 설치 안내

## 준비

> [!WARNING]
> 테스트 환경에서만 실행하세요.

| Name | Value |
| --- | --- |
| cluster | ready |

\`\`\`bash title="setup.sh"
echo ready
\`\`\`
`;

  const result = await convertMarkdown(markdown, process.cwd());

  assert.equal(result.toc[0]?.id, '설치-안내');
  assert.equal(result.toc[0]?.children[0]?.id, '준비');
  assert.match(result.html, /id="설치-안내"/);
  assert.match(result.html, /class="admonition admonition-warning"/);
  assert.match(result.html, /class="code-title">setup\.sh/);
  assert.match(result.html, /class="shiki/);
  assert.match(result.html, /<table class="keep-together">/);
});

test('creates unique heading ids', async () => {
  const result = await convertMarkdown('## Repeat\n\n## Repeat\n', process.cwd());
  assert.deepEqual(result.toc.map((item) => item.id), ['repeat', 'repeat-2']);
});

test('keeps a lone tilde literal instead of GFM strikethrough, but still supports ~~text~~', async () => {
  const markdown = '처리 시간은 1~10초이며, 데이터 규모는 20~30개 사이입니다. '
    + '홈 디렉토리는 ~/workspace 입니다.\n\n~~완전 삭제~~는 취소선 처리됩니다.';
  const result = await convertMarkdown(markdown, process.cwd());

  assert.match(result.html, /1~10초/);
  assert.match(result.html, /20~30개/);
  assert.match(result.html, /~\/workspace/);
  assert.match(result.html, /<del>완전 삭제<\/del>/);
});


test('embeds local images as data URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-'));
  try {
    const imagePath = join(directory, 'pixel.png');
    await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const result = await convertMarkdown('![pixel](./pixel.png)', directory);
    assert.match(result.html, /src="data:image\/png;base64,/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects remote and raw HTML images that would break self-contained output', async () => {
  await assert.rejects(
    convertMarkdown('![remote](https://example.com/image.png)', process.cwd()),
    /must be embedded data URLs/,
  );
  await assert.rejects(
    convertMarkdown('<img src=".\/local.png" alt="raw">', process.cwd()),
    /must be embedded data URLs/,
  );
});

test('renders CJK emphasis whose closing marker follows punctuation (no literal **)', async () => {
  const cases = [
    '**중요(필수)**입니다',
    '**"따옴표"**를 사용',
    '**100%**를 달성',
    '**`writeConcern`**은 기본값',
    '**설정값:**을 확인',
    '**注意（重要）**的问题',
    '這是**「重要」**的內容',
    '*기울임(설명)*을',
  ];
  for (const markdown of cases) {
    const result = await convertMarkdown(markdown, process.cwd());
    assert.doesNotMatch(result.html, /\*/, markdown);
    assert.match(result.html, /<(strong|em)>/, markdown);
    assert.deepEqual(result.issues.filter((i) => i.code === 'residual-markdown-marker'), [], markdown);
  }
});

test('reports emphasis markers that still leak into the output as errors', async () => {
  const result = await convertMarkdown('x **(bold)**y', process.cwd());
  const issue = result.issues.find((i) => i.code === 'residual-markdown-marker');
  assert.equal(issue?.severity, 'error');
  // Code is exempt: ** is legitimate there.
  const code = await convertMarkdown('Use `2**3` and\n\n```python\nx = 2**3\n```\n', process.cwd());
  assert.equal(code.issues.filter((i) => i.code === 'residual-markdown-marker').length, 0);
});

test('places the Priority Legend right after the Recommendations heading', async () => {
  const result = await convertMarkdown('# 3 Findings\n\nText.\n\n# 4 Recommendations\n\n## 4.1 Index [Priority: 1]\n', process.cwd());
  const heading = result.html.indexOf('4 Recommendations');
  const legend = result.html.indexOf('priority-legend');
  const findings = result.html.indexOf('Text.');
  assert.ok(findings < heading && heading < legend, 'legend must follow the heading');
  assert.match(result.html, /priority-badge priority-1/);
});

test('turns external links into numbered references listed at the end', async () => {
  const markdown = 'See [index docs](https://www.mongodb.com/docs/manual/indexes/) and '
    + '[again](https://www.mongodb.com/docs/manual/indexes/) and <https://example.com>.';
  const result = await convertMarkdown(markdown, process.cwd(), { language: 'ko' });
  assert.equal((result.html.match(/class="ref-mark"/g) ?? []).length, 2);
  assert.match(result.html, /href="#ref-1">\[1\]<\/a>/);
  assert.doesNotMatch(result.html, /href="#ref-2"/);
  assert.match(result.html, /<li id="ref-1">/);
  assert.equal(result.toc[result.toc.length - 1]?.text, '참고 링크');
  const inline = await convertMarkdown(markdown, process.cwd(), { references: false });
  assert.doesNotMatch(inline.html, /ref-mark/);
});

test('keeps short tables and code blocks together and lets long ones split', async () => {
  const rows = (n: number): string => Array.from({ length: n }, (_, i) => `| r${i} | v |`).join('\n');
  const short = await convertMarkdown(`| a | b |\n| --- | --- |\n${rows(12)}\n`, process.cwd());
  const long = await convertMarkdown(`| a | b |\n| --- | --- |\n${rows(13)}\n`, process.cwd());
  assert.match(short.html, /<table class="keep-together">/);
  assert.match(long.html, /<table class="table-long">/);

  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `echo ${i}`).join('\n');
  const shortCode = await convertMarkdown(`\`\`\`bash\n${lines(20)}\n\`\`\`\n`, process.cwd());
  const longCode = await convertMarkdown(`\`\`\`bash\n${lines(21)}\n\`\`\`\n`, process.cwd());
  assert.match(shortCode.html, /class="code-block keep-together"/);
  assert.match(longCode.html, /class="code-block"/);
});

test('hard-wraps over-long code lines instead of shrinking the font', async () => {
  const long = `mongosh ${'--option value '.repeat(12)}`.trimEnd();
  const result = await convertMarkdown(`\`\`\`bash\n${long}\n\`\`\`\n`, process.cwd());
  assert.match(result.html, / \\<\/span>|\\\n| \\/);
  assert.ok(result.issues.some((i) => i.code === 'code-line-wrapped'));
  assert.doesNotMatch(result.html, /font-size/);
});

test('marks an italic line right after an image as a figure caption', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-'));
  try {
    await writeFile(join(directory, 'p.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const result = await convertMarkdown('![x](./p.png)\n\n*Figure 1: Diagram*\n', directory);
    assert.match(result.html, /<p class="figure-caption"><em>Figure 1: Diagram<\/em><\/p>/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('joins soft line breaks inside Chinese text but keeps Korean word spaces', async () => {
  const zh = await convertMarkdown('提示框以及\n任务清单', process.cwd());
  assert.match(zh.html, /以及任务清单/);
  const ko = await convertMarkdown('문서 자동화\n흐름을 검증', process.cwd());
  assert.match(ko.html, /자동화\s흐름을/);
});

test('renders task list boxes as static spans, not form inputs', async () => {
  const result = await convertMarkdown('- [x] done\n- [ ] todo\n', process.cwd());
  assert.doesNotMatch(result.html, /<input/);
  assert.match(result.html, /class="task-list-item-checkbox checked"/);
  assert.match(result.html, /class="task-list-item-checkbox"/);
});
