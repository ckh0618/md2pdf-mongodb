# Markdown to HTML and PDF renderer

This package converts one Markdown source into a self-contained HTML file and a PDF generated from
that exact HTML. It supports ordinary Markdown documents and an optional two-stage review/customer
release flow.

## Usage

```bash
npm ci
npm run build
npx playwright install chromium
node dist/cli.js ./document.md --stage customer
```

The default files are `document.customer.html` and `document.customer.pdf`. Use `--output` and
`--html-output` to choose explicit paths. The customer name is optional and defaults to `Document`;
set it with `--customer` or front matter. Cover metadata can be supplied with CLI flags or YAML
front matter (`title`, `subtitle`, `version`, `date`, `language`, `brand`, `customer`).

For review output, pass `--stage review --review-appendix ./review.md`. For a customer release after
review, pass `--stage customer --review-source-sha256 <sha256>` using the source hash printed by the
review conversion. Review appendices may set `audience: internal-review`; a document may set
`audience: customer`, but neither field is required for ordinary documents.

Run `npm test` for deterministic tests. Set `RUN_PDF_INTEGRATION=1` to also run the Chromium PDF
integration test after installing the Playwright browser.
