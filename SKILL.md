---
name: md2pdf
description: Convert Markdown documents into self-contained HTML and PDF files for customer delivery with consistent, dense layout, bundled fonts, TOC with page numbers, syntax highlighting, and an automated layout check. Use when the user asks to render, export, normalize, or publish Markdown as HTML or PDF.
---

# Markdown to HTML/PDF

The renderer lives in `md-to-pdf/` next to this file. Every agent must produce identical output
for the same Markdown, so follow this procedure exactly and do not improvise layout fixes.

## Hard rules

1. **Edit only Markdown.** Never edit generated HTML/PDF. Never edit `md-to-pdf/assets/`,
   `md-to-pdf/src/`, or `package.json` during a render task, and never add CSS or inline styles to
   the document. If the renderer prints `WARNING renderer-modified`, stop and report it.
2. **Never overwrite the user's source.** Normalized drafts go to `<basename>.convention.md`.
3. **Never ship a failed check.** `LAYOUT CHECK FAILED` (exit code 2) means the document is not
   deliverable. Do not use `--no-check` for customer output.
4. **Do not claim visual validation you did not do.** Look at the page PNGs yourself.

## Workflow

1. **Locate input.** Confirm the Markdown path and the stage (`customer`, or `review` with an
   appendix).
2. **Normalize if needed.** If the Markdown was not written for this renderer, create
   `<basename>.convention.md` following `md-to-pdf/CONVENTIONS.md` (the single rulebook: front
   matter, headings, emphasis, tables, code, admonitions, images, links, characters). Research
   missing metadata; ask the user for the customer name if it cannot be found.
3. **Build once per install** (skip if `md-to-pdf/dist/cli.js` exists and is current):

   ```bash
   cd md-to-pdf && npm ci && npm run build && npx playwright install chromium
   ```

4. **Render with page images:**

   ```bash
   node md-to-pdf/dist/cli.js <doc>.md --stage customer --pages <doc>-pages
   ```

   Outputs: `<doc>.customer.html`, `<doc>.customer.pdf`, `<doc>.customer.layout.json`, and
   `<doc>-pages/page-NN.png` rasterized from the PDF itself.
5. **Fix every error and warning in the Markdown**, using the code table in CONVENTIONS.md §15,
   then render again. Repeat until the check passes. Acceptable remaining items: `info` entries and
   `page-fill` warnings that cannot be removed without changing meaning (state why in the report).
6. **Inspect every page PNG** and walk through the Layout QA checklist below.
7. **Report** the output paths, page count, source SHA-256, check status, remaining warnings with
   reasons, and every Markdown change you made.

## Commands

```bash
node md-to-pdf/dist/cli.js doc.md --stage customer --pages doc-pages
node md-to-pdf/dist/cli.js doc.md --stage review --review-appendix review.md --pages doc-pages
node md-to-pdf/dist/cli.js doc.md --stage customer --review-source-sha256 <sha256-from-review>
node md-to-pdf/dist/cli.js doc.md --stage customer --ai-review doc-ai-review
```

Metadata flags (`--title`, `--customer`, `--language`, `--chapter-break page`, …) override front
matter; prefer front matter so the source is self-describing. `--output` / `--html-output` set
explicit paths. `--ai-review <dir>` writes the page PNGs plus a `REVIEW_PROMPT.md` for a second
vision pass.

## Layout QA checklist (run last, on the page PNGs)

Automated by the renderer — confirm `LAYOUT CHECK PASSED` in the output and `"status": "pass"` in
the layout report:

- [ ] No literal `**`, `__`, or `~~` in the output (`residual-markdown-marker`).
- [ ] Every glyph comes from the bundled fonts (`fallback-font`).
- [ ] No body page ends below 50% fill; pages below 70% are explained (`page-fill`).
- [ ] No heading stranded at a page bottom (`orphan-heading`).
- [ ] Nothing wider than the text column: tables, code, images (`*-overflow`).
- [ ] `code-wrap-unsafe` warnings resolved in the source.

Checked by you on the images:

- [ ] **Cover:** title on one line; customer, project, date, participants correct.
- [ ] **TOC:** every H1–H3 listed with a page number; numbering matches the headings.
- [ ] **Density:** no empty bands other than before an intentional break; block spacing looks even.
- [ ] **Hierarchy:** H1/H2/H3 are distinct; numbering is continuous (1, 1.1, 1.2, 2, …).
- [ ] **Tables:** header distinct; short values, identifiers and numbers on one line; only prose
      and long URIs wrap; numeric columns right-aligned; no table split right after its header.
- [ ] **Code:** language highlighting applied; forced line breaks fall at sensible points; no
      glyph ligatures; titles shown where given.
- [ ] **Emphasis:** bold appears bold (especially next to Korean particles and CJK punctuation).
- [ ] **Boxes:** admonitions, Q&A, Priority badges and the Priority Legend render as boxes/badges,
      the legend directly under the Recommendations heading.
- [ ] **Images:** legible, captions directly below, no clipped text inside diagrams.
- [ ] **Links:** reference numbers `[n]` present and the References list is complete.
- [ ] **Text:** no raw HTML, `[!NOTE]`, `[Priority: N]`, or front matter visible; no missing glyphs.

If any item fails, fix the Markdown (never the renderer or generated files), render again, and
re-run this checklist.
