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
  assert.match(result.html, /<table>/);
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
