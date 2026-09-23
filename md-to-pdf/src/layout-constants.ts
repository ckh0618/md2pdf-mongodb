/**
 * Geometry shared by the Markdown stage (code wrapping), the browser layout
 * pass, and the PDF writer. styles.css must agree with these values;
 * styles.test.ts asserts the ones that are duplicated in CSS.
 */

export const MM_TO_PX = 96 / 25.4;

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;
export const PAGE_MARGIN_TOP_MM = 20;
export const PAGE_MARGIN_BOTTOM_MM = 15;
export const PAGE_MARGIN_SIDE_MM = 15;

export const CONTENT_WIDTH_PX = (PAGE_WIDTH_MM - 2 * PAGE_MARGIN_SIDE_MM) * MM_TO_PX;

/** `pre` horizontal padding (12px each side) + 1px borders. */
export const PRE_CHROME_PX = 2 * 12 + 2;
/** Code font: 9pt JetBrains Mono, advance width 0.6em. */
export const CODE_FONT_PX = 12;
export const CODE_CHAR_WIDTH_PX = CODE_FONT_PX * 0.6;
export const CODE_TEXT_WIDTH_PX = CONTENT_WIDTH_PX - PRE_CHROME_PX;

/**
 * Horizontal space consumed by one level of list item or blockquote/
 * admonition nesting (list padding-left 22px; admonition border+padding
 * 3+12+12 = 27px). The larger value is used so wrapped code always fits.
 */
export const NESTED_BLOCK_INDENT_PX = 27;

export const TABLE_KEEP_TOGETHER_MAX_ROWS = 12;
export const CODE_KEEP_TOGETHER_MAX_LINES = 20;

/** Page-fill thresholds for the layout check (fraction of content height). */
export const FILL_ERROR_BELOW = 0.5;
export const FILL_WARNING_BELOW = 0.7;

/** Smallest acceptable body glyph size in the PDF, in pt. */
export const MIN_FONT_PT = 7;
