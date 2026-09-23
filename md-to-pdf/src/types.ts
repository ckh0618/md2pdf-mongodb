export type PdfStage = 'review' | 'customer';

export type ChapterBreak = 'none' | 'page';

export interface Participant {
  name: string;
  title?: string;
  org?: string;
  email?: string;
}

export interface DocumentMeta {
  title: string;
  customer: string;
  brand: string;
  language: string;
  subtitle?: string;
  version?: string;
  date: string;
  project?: string;
  author?: Participant;
  participants?: Participant[];
  copyrightYear?: string;
  classification: 'Confidential';
  stage: PdfStage;
  /** Start every H1 chapter on a new page (default: none). */
  chapterBreak?: ChapterBreak;
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
  children: TocItem[];
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface RenderIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  page?: number;
}

export interface ConvertOptions {
  language?: string;
  /** Turn external links into numbered references (default true). */
  references?: boolean;
}

export interface MarkdownResult {
  html: string;
  toc: TocItem[];
  issues: RenderIssue[];
}
