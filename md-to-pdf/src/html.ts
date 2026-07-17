import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function generateHtml(htmlContent: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, htmlContent, 'utf-8');
}
