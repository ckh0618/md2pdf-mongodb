#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import matter from 'gray-matter';
import { convertMarkdown } from './markdown.js';
import { buildHtml } from './template.js';
import { generateHtml } from './html.js';
import { generatePdf, generateReviewShots, generateAiReviewPackage } from './pdf.js';
import { writeArtifactPair } from './artifacts.js';
import type { DocumentMeta, Participant } from './types.js';
import {
  defaultOutputPath,
  defaultHtmlOutputPath,
  parsePdfStage,
  requireAudience,
  validateStageInputs,
} from './workflow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(__dirname, '../assets/styles.css');

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function metadataValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function asParticipant(raw: unknown): Participant | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rec = raw as Record<string, unknown>;
  const name = metadataValue(rec['name']);
  if (!name) return undefined;
  return {
    name,
    title: metadataValue(rec['title']),
    org: metadataValue(rec['org']) ?? metadataValue(rec['organization']),
    email: metadataValue(rec['email']),
  };
}

function asParticipants(raw: unknown): Participant[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw.map(asParticipant).filter((p): p is Participant => Boolean(p));
    return list.length > 0 ? list : undefined;
  }
  const single = asParticipant(raw);
  return single ? [single] : undefined;
}

const program = new Command();

program
  .name('md-to-pdf')
  .description('Convert a Markdown document to paired HTML and PDF artifacts')
  .argument('<input>', 'Input Markdown file path')
  .requiredOption('--stage <stage>', 'Output stage: review or customer')
  .option('-o, --output <path>', 'Output PDF path (default: stage-specific filename)')
  .option('--html-output <path>', 'Output HTML path (default: stage-specific filename)')
  .option('--review-appendix <path>', 'Sanitized validation-review Markdown; required for review')
  .option('--review-source-sha256 <hash>', 'Reviewed Runbook SHA-256; required for customer')
  .option('-t, --title <title>', 'Document title')
  .option('-v, --version <version>', 'Document version')
  .option('-d, --date <date>', 'Document date (default: today)')
  .option('-s, --subtitle <subtitle>', 'Document subtitle')
  .option('--language <tag>', 'Document BCP 47 language tag (default: front matter or filename)')
  .option('--customer <name>', 'Name shown on the cover and footer (default: Document)')
  .option('--brand <name>', 'Cover brand (default: Markdown Document)')
  .option('--project <name>', 'Project or application name shown on the cover')
  .option('--copyright-year <year>', 'Copyright year in the footer (default: current year)')
  .option('--review-shots <dir>', 'Generate per-page PNG screenshots for visual review into the given directory')
  .option('--ai-review <dir>', 'Generate per-page PNG screenshots plus a REVIEW_PROMPT.md for AI model evaluation')
  .action(async (input: string, opts: Record<string, string | undefined>) => {
    try {
      const inputPath = resolve(input);
      if (!existsSync(inputPath)) {
        throw new Error(`Input Markdown file does not exist: ${inputPath}`);
      }
      const raw = readFileSync(inputPath, 'utf-8');
      const { data: frontMatter, content } = matter(raw);
      const stage = parsePdfStage(opts['stage'] ?? '');
      validateStageInputs(stage, {
        reviewAppendix: opts['reviewAppendix'],
        reviewSourceSha256: opts['reviewSourceSha256'],
      });
      requireAudience(stage, 'document', frontMatter['audience']);
      const sourceSha256 = createHash('sha256').update(raw).digest('hex');
      if (
        stage === 'customer'
        && opts['reviewSourceSha256']
        && sourceSha256.toLowerCase() !== opts['reviewSourceSha256']!.toLowerCase()
      ) {
        throw new Error(
          'Runbook source changed after review. Generate and inspect new review artifacts before customer release.',
        );
      }

      let renderedContent = content;
      if (stage === 'review') {
        const reviewAppendixPath = resolve(opts['reviewAppendix']!);
        if (!existsSync(reviewAppendixPath)) {
          throw new Error(`Review appendix does not exist: ${reviewAppendixPath}`);
        }
        const reviewAppendixRaw = readFileSync(reviewAppendixPath, 'utf-8');
        const { data: reviewFrontMatter, content: reviewContent } = matter(reviewAppendixRaw);
        requireAudience(stage, 'review-appendix', reviewFrontMatter['audience']);
        renderedContent = `${content.trimEnd()}\n\n<div class="page-break"></div>\n\n${reviewContent.trimStart()}`;
      }

      const customer = (opts['customer'] ?? metadataValue(frontMatter['customer']) ?? 'Document').trim();

      const basePath = dirname(inputPath);
      const { html, toc } = await convertMarkdown(renderedContent, basePath);
      const inputBase = basename(inputPath, extname(inputPath));
      const languageFromFilename = inputBase.startsWith('RUNBOOK.')
        ? inputBase.slice('RUNBOOK.'.length)
        : 'en';

      const meta: DocumentMeta = {
        title: opts['title'] ?? metadataValue(frontMatter['title']) ?? toc[0]?.text ?? inputBase,
        customer,
        brand: opts['brand'] ?? metadataValue(frontMatter['brand']) ?? 'Markdown Document',
        language: opts['language']
          ?? metadataValue(frontMatter['language'])
          ?? languageFromFilename,
        version: opts['version'] ?? metadataValue(frontMatter['version']),
        date: opts['date'] ?? metadataValue(frontMatter['date']) ?? todayIso(),
        project: opts['project'] ?? metadataValue(frontMatter['project']) ?? metadataValue(frontMatter['app']),
        author: asParticipant(frontMatter['author']),
        participants: asParticipants(frontMatter['participants']),
        copyrightYear: opts['copyrightYear']
          ?? metadataValue(frontMatter['copyrightYear'])
          ?? metadataValue(frontMatter['copyright_year'])
          ?? String(new Date().getFullYear()),
        classification: 'Confidential',
        subtitle: opts['subtitle'] ?? metadataValue(frontMatter['subtitle']),
        stage,
      };

      const fullHtml = buildHtml(html, toc, meta, CSS_PATH);

      const outputPath = opts['output']
        ? resolve(opts['output'])
        : defaultOutputPath(inputPath, stage);
      const htmlOutputPath = opts['htmlOutput']
        ? resolve(opts['htmlOutput'])
        : defaultHtmlOutputPath(inputPath, stage);
      if (htmlOutputPath === outputPath) {
        throw new Error('HTML and PDF output paths must be different.');
      }
      if (htmlOutputPath === inputPath || outputPath === inputPath) {
        throw new Error('Rendered output paths must not overwrite the Markdown source.');
      }

      await writeArtifactPair(
        htmlOutputPath,
        outputPath,
        async (temporaryPath) => generateHtml(fullHtml, temporaryPath),
        async (temporaryPath) => generatePdf(fullHtml, temporaryPath, meta),
      );

      console.log(`HTML generated: ${htmlOutputPath}`);
      console.log(`PDF generated: ${outputPath}`);
      console.log(`Runbook source SHA-256: ${sourceSha256}`);

      if (opts['reviewShots']) {
        const shotsDir = resolve(opts['reviewShots']);
        const shotPaths = await generateReviewShots(fullHtml, shotsDir, meta);
        console.log(`Review screenshots generated: ${shotPaths.length} page(s) in ${shotsDir}`);
      }

      if (opts['aiReview']) {
        const reviewDir = resolve(opts['aiReview']);
        const { shotsDir, promptPath, shotPaths } = await generateAiReviewPackage(fullHtml, reviewDir, meta);
        console.log(`AI review package generated: ${shotPaths.length} screenshot(s) in ${shotsDir}`);
        console.log(`AI review prompt: ${promptPath}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
