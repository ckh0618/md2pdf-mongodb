import { existsSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import type { PdfStage } from './types.js';

export interface StageInputs {
  reviewAppendix?: string;
  reviewSourceSha256?: string;
}

export function parsePdfStage(value: string): PdfStage {
  if (value === 'review' || value === 'customer') return value;
  throw new Error('Output stage must be either "review" or "customer".');
}

export function defaultOutputPath(inputPath: string, stage: PdfStage): string {
  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  return resolve(dir, `${base}.${stage}.pdf`);
}

export function defaultHtmlOutputPath(inputPath: string, stage: PdfStage): string {
  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  return resolve(dir, `${base}.${stage}.html`);
}

export function validateStageInputs(stage: PdfStage, inputs: StageInputs): void {
  const reviewAppendix = inputs.reviewAppendix?.trim();
  const reviewSourceSha256 = inputs.reviewSourceSha256?.trim();

  if (stage === 'review') {
    if (!reviewAppendix) {
      throw new Error('Review artifacts require --review-appendix <path>.');
    }
    if (reviewSourceSha256) {
      throw new Error('--review-source-sha256 is valid only for customer artifacts.');
    }
    return;
  }

  if (reviewAppendix) {
    throw new Error('Customer artifacts must not include --review-appendix.');
  }
  if (reviewSourceSha256 && !/^[a-f0-9]{64}$/i.test(reviewSourceSha256)) {
    throw new Error('--review-source-sha256 must be a valid SHA-256 hash.');
  }
}

export function requireAudience(
  stage: PdfStage,
  source: 'document' | 'review-appendix',
  audience: unknown,
): void {
  const expected = source === 'document' ? 'customer' : 'internal-review';
  if (audience === undefined || audience === null || audience === '') return;
  if (audience !== expected) {
    throw new Error(
      `${source} front matter must set audience: ${expected} for ${stage} artifacts.`,
    );
  }
}
