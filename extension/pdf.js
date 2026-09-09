import {normalizeArxivId, normalizeDoi} from "./core.js";
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function titleFromItems(items) {
  const text = items.filter(i => i.str?.trim() && i.transform && i.height > 0).slice(0, 1500);
  // Ignore tiny text, vertical watermarks and the lower half of the first page.
  const top = Math.max(0, ...text.map(i => i.transform[5]));
  const upper = text.filter(i => i.transform[5] > top * 0.55 && Math.abs(i.transform[1]) < 0.01 && i.str.trim().length > 1);
  const size = Math.max(0, ...upper.map(i => i.height));
  const largest = upper.filter(i => i.height >= size * 0.9);
  if (!largest.length) return "";
  const firstY = Math.max(...largest.map(i => i.transform[5]));
  return largest.filter(i => firstY - i.transform[5] < size * 5)
    .sort((a, b) => Math.abs(a.transform[5] - b.transform[5]) > size / 2 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4])
    .map(i => i.str.trim()).join(" ").replace(/\s+/g, " ").trim().slice(0, 1000);
}

export async function readPdf(bytes) {
  if (!bytes?.length || bytes.length > MAX_PDF_BYTES) throw new Error("Choose a PDF smaller than 25 MB, or enter its title.");
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) throw new Error("The site returned a web page instead of a PDF. Enter the title, or choose a downloaded PDF.");
  const pdfjs = await import("./vendor/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;
  const task = pdfjs.getDocument({data: bytes, isEvalSupported: false, useWasm: false,
    disableFontFace: true, useSystemFonts: true, stopAtErrors: true});
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        const [metadata, page] = await Promise.all([pdf.getMetadata(), pdf.getPage(1)]);
        const infoTitle = String(metadata.info?.Title || "").replace(/\s+/g, " ").trim();
        const content = await page.getTextContent();
        const firstPage = content.items.map(item => item.str || "").join(" ").slice(0, 50000);
        const arxivHints = [...new Set([...firstPage.matchAll(/arXiv:\s*((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?)/gi)].map(m => normalizeArxivId(m[1])).filter(Boolean))];
        const doiHints = [...new Set([...firstPage.matchAll(/(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[^\s<>]+)/gi)].map(m => normalizeDoi(m[1])).filter(Boolean))];
        const title = infoTitle.length >= 8 && infoTitle.length <= 1000 && !/^(?:untitled|microsoft|latex|arxiv|document|paper\.pdf)/i.test(infoTitle)
          ? infoTitle : titleFromItems(content.items);
        // PDF text is a suggestion, never an authoritative identity or a query
        // sent automatically. The user reviews it before searching.
        return {title, authors: String(metadata.info?.Author || "").slice(0, 1000), identifierHints: [...arxivHints, ...doiHints]};
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Reading the PDF timed out. Enter its title instead.")), 12000); })
    ]);
  } finally { clearTimeout(timer); await task.destroy(); }
}
