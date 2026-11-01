// Production artwork for NewPro's GIVEAWAY card.
// This asset is the newly generated full-width, text-free composition, NOT a
// cropped thumbnail of the previous banner. Fail the build if it is missing.
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'assets', 'giveaway-art-v7.avif');
const destinationDir = path.join(root, 'public', 'feature', 'game-banners');
const destination = path.join(destinationDir, 'giveaway-premium-v7.png');
const expectedHash = '56d4f05727b1b009c86d4bf41a143ce5065cb5ed104ba2e7c48cc6e19fd96374';

const bytes = await readFile(source);
if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
  throw new Error('Giveaway artwork integrity check failed');
}
const meta = await sharp(bytes).metadata();
if (meta.width !== 640 || meta.height !== 213) {
  throw new Error('Unexpected generated Giveaway source dimensions');
}
await mkdir(destinationDir, { recursive: true });
await sharp(bytes)
  .resize(960, 320, { fit: 'fill', kernel: 'lanczos3' })
  .sharpen({ sigma: 0.65, m1: 0.45, m2: 1.3 })
  .png({ compressionLevel: 9, palette: false })
  .toFile(destination);

const output = await sharp(destination).metadata();
if (output.width !== 960 || output.height !== 320 || output.format !== 'png') {
  throw new Error('Giveaway PNG was not generated correctly');
}
console.log('NewPro Giveaway: verified 960x320 PNG generated from new artwork');
