# md-to-pdf renderer

Converts one Markdown source into a self-contained HTML file and a PDF laid out from the same DOM,
then checks the PDF layout. Authoring rules: [`CONVENTIONS.md`](CONVENTIONS.md).

## Usage

```bash
npm ci
npm run build
npx playwright install chromium
node dist/cli.js ./document.md --stage customer --pages ./document-pages
```

Outputs:

| File | Content |
| --- | --- |
| `document.customer.pdf` | A4 PDF with cover, TOC page numbers, header/footer, outline |
| `document.customer.html` | Same laid-out DOM as the PDF, fonts and images inlined |
| `document.customer.layout.json` | Renderer identity, per-page fill, every layout issue |
| `document-pages/page-NN.png` | Pages rasterized from the PDF (with `--pages`) |

Exit codes: `0` success, `1` input/usage error, `2` layout check failed (artifacts are still written
for inspection).

For review output pass `--stage review --review-appendix ./review.md`. For a customer release after
review pass `--stage customer --review-source-sha256 <sha256>` with the hash printed by the review
conversion.

## Pipeline

1. `markdown.ts` — remark (GFM + CJK-friendly emphasis) → admonitions, Q&A, Priority badges/legend,
   numbered link references, table/code keep-together classes, forced code line breaks
   (`codewrap.ts`), residual-marker lint → HTML.
2. `template.ts` + `fonts.ts` — cover, TOC, and only the needed subsets of the bundled fonts.
3. `pdf.ts` + `layout.ts` — Chromium at the printable width: table column fitting (no font
   shrinking), overflow and fallback-font checks, PDF passes until TOC page numbers settle.
4. `check.ts` — pdf.js analysis: page fill, orphan headings, tiny text, page PNGs.

Geometry shared by CSS and code is in `layout-constants.ts`; `styles.test.ts` keeps them in sync.

## Development

```bash
npm test                          # unit tests
RUN_PDF_INTEGRATION=1 npm test    # plus the Chromium integration test
```

Bundled fonts (SIL Open Font License 1.1): Pretendard, Noto Sans SC, Noto Sans TC, JetBrains Mono,
installed from npm (`pretendard`, `@fontsource/*`).
