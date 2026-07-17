---
name: md2pdf
description: Convert Markdown documents into self-contained HTML and PDF files with consistent styling, embedded local images, table of contents, syntax highlighting, and optional review/customer release stages. Use when the user asks to render, export, or publish Markdown as HTML or PDF.
---

# Markdown to HTML/PDF

Use the bundled renderer at `md-to-pdf/`. Markdown is always the source of truth; never edit the
generated HTML or PDF directly.

## Workflow

1. Confirm the input Markdown path and requested output format(s). The renderer emits HTML and PDF
   together from the same rendered document.
2. If the input is raw/unstructured Markdown (meeting notes, a draft, an export from another tool,
   or anything not already written for this renderer), follow
   `md-to-pdf/AUTHORING_PROMPT.md` to produce a convention-compliant Markdown file first: fill in
   front matter (researching customer/project/participants when missing), promote/demote headings,
   convert non-standard image links to local paths, fix code block languages, and remove redundant
   manual page breaks next to headings. Save this as a new file; do not overwrite the user's
   original source. Check local image paths and front matter. Supported metadata is `title`,
   `subtitle`, `version`, `date`, `language`, `brand`, `customer`, `project`, `author`, and
   `participants` (see `md-to-pdf/CONVENTIONS.md` for full field mapping). CLI flags override front
   matter.
3. Install/build the renderer when needed:

   ```bash
   cd md-to-pdf
   npm ci
   npm run build
   npx playwright install chromium
   ```

4. Run the renderer with `--stage customer` for a normal release, or `--stage review` when a
   sanitized review appendix should be appended and the output marked `FOR REVIEW`.
5. Inspect the generated HTML in a browser and every PDF page for layout, links, headings, tables,
   code blocks, images, page breaks, and missing glyphs. HTML-scroll screenshots can misrepresent
   real print pagination; when in doubt, rasterize the actual PDF per page (e.g. with PyMuPDF) and
   review those images directly. If anything is wrong, fix the Markdown or stylesheet — never the
   generated HTML/PDF — and render again.
6. Report the exact output paths and the source SHA-256 printed by the command.

## Commands

```bash
node md-to-pdf/dist/cli.js input.md --stage customer
node md-to-pdf/dist/cli.js input.md --stage review --review-appendix review.md
node md-to-pdf/dist/cli.js input.md --stage customer --review-source-sha256 <reviewed-source-sha256>
node md-to-pdf/dist/cli.js input.md --stage customer --ai-review ai-review-dir
```

Use `--customer`, `--brand`, `--language`, `--title`, `--subtitle`, `--version`, and `--date` for
metadata. Use `--output` and `--html-output` when the default stage-specific names are unsuitable.
Use `--ai-review <dir>` to generate per-page PNG screenshots plus a `REVIEW_PROMPT.md` for a
vision-capable model to grade layout, typography, tables/images, and page breaks.

Review output requires a review appendix. Customer output after review requires the exact SHA-256
of the unchanged source; this prevents releasing a document that was not reviewed. Ordinary
customer conversion can omit the hash when no review stage is being used.

Do not claim visual validation without inspecting the actual HTML and PDF. Keep generated artifacts
beside the source or in the user-specified output directory, and preserve the source Markdown.
