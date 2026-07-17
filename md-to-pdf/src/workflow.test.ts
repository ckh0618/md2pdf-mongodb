import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultHtmlOutputPath,
  defaultOutputPath,
  parsePdfStage,
  requireAudience,
  validateStageInputs,
} from './workflow.js';

test('uses stage-specific output filenames', () => {
  assert.match(defaultOutputPath('/tmp/RUNBOOK.en.md', 'review'), /RUNBOOK\.en\.review\.pdf$/);
  assert.match(defaultOutputPath('/tmp/RUNBOOK.en.md', 'customer'), /RUNBOOK\.en\.customer\.pdf$/);
  assert.match(defaultHtmlOutputPath('/tmp/RUNBOOK.en.md', 'review'), /RUNBOOK\.en\.review\.html$/);
  assert.match(defaultHtmlOutputPath('/tmp/RUNBOOK.en.md', 'customer'), /RUNBOOK\.en\.customer\.html$/);
});

test('requires an appendix for review and validates an optional reviewed hash', () => {
  assert.doesNotThrow(() => validateStageInputs('review', { reviewAppendix: 'VALIDATION-REVIEW.en.md' }));
  assert.throws(() => validateStageInputs('review', {}), /require --review-appendix/);
  const sha256 = 'a'.repeat(64);
  assert.doesNotThrow(() => validateStageInputs('customer', {}));
  assert.doesNotThrow(() => validateStageInputs('customer', { reviewSourceSha256: sha256 }));
  assert.throws(() => validateStageInputs('customer', { reviewSourceSha256: 'bad' }), /valid SHA-256/);
  assert.throws(
    () => validateStageInputs('customer', {
      reviewAppendix: 'VALIDATION-REVIEW.en.md',
      reviewSourceSha256: sha256,
    }),
    /must not include --review-appendix/,
  );
});

test('accepts only known stages and optional source audiences', () => {
  assert.equal(parsePdfStage('review'), 'review');
  assert.equal(parsePdfStage('customer'), 'customer');
  assert.throws(() => parsePdfStage('final'), /either "review" or "customer"/);
  assert.doesNotThrow(() => requireAudience('customer', 'document', 'customer'));
  assert.doesNotThrow(() => requireAudience('review', 'review-appendix', 'internal-review'));
  assert.doesNotThrow(() => requireAudience('customer', 'document', undefined));
  assert.throws(() => requireAudience('customer', 'document', 'internal-review'), /audience: customer/);
});
