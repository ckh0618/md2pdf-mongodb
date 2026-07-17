import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateHtml } from './html.js';

test('writes a self-contained HTML artifact and creates parent directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'md-to-pdf-html-'));
  const outputPath = join(directory, 'nested', 'runbook.html');
  const html = '<!doctype html><html><body>Runbook</body></html>';

  try {
    await generateHtml(html, outputPath);
    assert.equal(await readFile(outputPath, 'utf-8'), html);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
