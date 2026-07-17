export type PdfStage = 'review' | 'customer';

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
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
  children: TocItem[];
}

export interface MarkdownResult {
  html: string;
  toc: TocItem[];
}
