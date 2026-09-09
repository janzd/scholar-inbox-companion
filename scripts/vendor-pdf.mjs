import {copyFile, mkdir} from 'node:fs/promises';
const target = new URL('../extension/vendor/', import.meta.url);
await mkdir(target, {recursive: true});
for (const [source, name] of [['legacy/build/pdf.mjs', 'pdf.mjs'], ['legacy/build/pdf.worker.mjs', 'pdf.worker.mjs'], ['LICENSE', 'PDFJS-LICENSE']]) {
  await copyFile(new URL(`../node_modules/pdfjs-dist/${source}`, import.meta.url), new URL(name, target));
}
