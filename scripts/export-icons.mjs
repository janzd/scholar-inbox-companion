import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../assets/branding/companion-icon.svg', import.meta.url), 'utf8');
const output = new URL('../extension/icons/', import.meta.url);
const defaultFrame = 'viewBox="0 0 128 128"';
if (!source.includes(defaultFrame)) throw new Error('Update toolbar framing for the changed SVG viewBox.');
const toolbar = source.replace(defaultFrame, 'viewBox="4 4 120 120"');
const store = source.replace(defaultFrame, 'viewBox="-16 -16 160 160"');
await mkdir(output, { recursive: true });

for (const [prefix, svg, sizes] of [
  ['icon', source, [16, 24, 32, 48, 128]],
  ['toolbar', toolbar, [16, 24, 32, 48]],
  ['store', store, [128]],
]) {
  for (const size of sizes) {
    const file = new URL(`${prefix}-${size}.png`, output);
    await sharp(Buffer.from(svg), { density: 288 }).resize(size, size).png().toFile(fileURLToPath(file));
    console.log(`${prefix}-${size}.png`);
  }
}
