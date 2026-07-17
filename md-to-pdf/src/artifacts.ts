import { access, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sibling(path: string, label: string, token: string): string {
  return join(dirname(path), `.${basename(path)}.${label}-${token}`);
}

export async function writeArtifactPair(
  htmlOutputPath: string,
  pdfOutputPath: string,
  writeHtml: (temporaryPath: string) => Promise<void>,
  writePdf: (temporaryPath: string) => Promise<void>,
): Promise<void> {
  const token = `${process.pid}-${randomUUID()}`;
  const temporaryHtml = sibling(htmlOutputPath, 'next', token);
  const temporaryPdf = sibling(pdfOutputPath, 'next', token);
  const backupHtml = sibling(htmlOutputPath, 'previous', token);
  const backupPdf = sibling(pdfOutputPath, 'previous', token);
  let htmlBackedUp = false;
  let pdfBackedUp = false;
  let htmlPublished = false;
  let pdfPublished = false;

  try {
    await writeHtml(temporaryHtml);
    await writePdf(temporaryPdf);

    if (await exists(htmlOutputPath)) {
      await rename(htmlOutputPath, backupHtml);
      htmlBackedUp = true;
    }
    if (await exists(pdfOutputPath)) {
      await rename(pdfOutputPath, backupPdf);
      pdfBackedUp = true;
    }
    await rename(temporaryHtml, htmlOutputPath);
    htmlPublished = true;
    await rename(temporaryPdf, pdfOutputPath);
    pdfPublished = true;
  } catch (error) {
    if (htmlPublished) await rm(htmlOutputPath, { force: true });
    if (pdfPublished) await rm(pdfOutputPath, { force: true });
    if (htmlBackedUp) await rename(backupHtml, htmlOutputPath);
    if (pdfBackedUp) await rename(backupPdf, pdfOutputPath);
    throw error;
  } finally {
    await rm(temporaryHtml, { force: true });
    await rm(temporaryPdf, { force: true });
  }

  if (htmlBackedUp) await rm(backupHtml, { force: true });
  if (pdfBackedUp) await rm(backupPdf, { force: true });
}
