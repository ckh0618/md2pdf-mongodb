import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeArtifactPair } from './artifacts.js';

test('publishes both artifacts only after both temporary writes succeed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'runbook-artifact-pair-'));
  const html = join(directory, 'runbook.html');
  const pdf = join(directory, 'runbook.pdf');
  await writeFile(html, 'old html');
  await writeFile(pdf, 'old pdf');

  try {
    await assert.rejects(
      writeArtifactPair(
        html,
        pdf,
        async (path) => writeFile(path, 'new html'),
        async () => { throw new Error('PDF generation failed'); },
      ),
      /PDF generation failed/,
    );
    assert.equal(await readFile(html, 'utf8'), 'old html');
    assert.equal(await readFile(pdf, 'utf8'), 'old pdf');

    await writeArtifactPair(
      html,
      pdf,
      async (path) => writeFile(path, 'new html'),
      async (path) => writeFile(path, 'new pdf'),
    );
    assert.equal(await readFile(html, 'utf8'), 'new html');
    assert.equal(await readFile(pdf, 'utf8'), 'new pdf');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
