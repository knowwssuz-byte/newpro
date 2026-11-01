// Generate one full-bleed, text-free Giveaway PNG for the homepage.
// A failure must fail the build: never substitute the tiny square gift icon.
// This file changes presentation assets only; no game or wallet behavior.
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'public', 'feature', 'game-banners');
const source = path.join(dir, 'giveaway-v1.webp');
const destination = path.join(dir, 'giveaway-premium-v4.png');
await mkdir(dir, { recursive: true });

const input = await readFile(source);
const metadata = await sharp(input).metadata();
if (!metadata.width || !metadata.height || metadata.width < 400 || metadata.height < 200) {
  throw new Error('Giveaway banner source image is missing or too small');
}

// The original v1 contains the old lettering on its LEFT. Only the image on
// the far right is used, so the new text can be real, crisp, accessible HTML.
const x = Math.round(metadata.width * .54);
const y = Math.round(metadata.height * .07);
const crop = {
  left: x, top: y,
  width: metadata.width - x,
  height: Math.round(metadata.height * .88),
};
const art = await sharp(input)
  .extract(crop)
  .resize(630, 460, { fit: 'fill', kernel: 'lanczos3' })
  .ensureAlpha()
  .composite([{
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="630" height="460">
    <defs><linearGradient id="a"><stop offset="0" stop-color="white" stop-opacity="0"/>
    <stop offset=".16" stop-color="white" stop-opacity=".95"/>
    <stop offset=".38" stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient></defs>
    <rect width="630" height="460" fill="url(#a)"/></svg>`),
    blend: 'dest-in'
  }])
  .png().toBuffer();

const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="460">
  <defs>
    <linearGradient id="bg" x1="0" y1=".2" x2="1" y2="1">
      <stop offset="0" stop-color="#5910bb"/>
      <stop offset=".48" stop-color="#8112d3"/>
      <stop offset="1" stop-color="#2d1fca"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#ed40f2" stop-opacity=".78"/>
      <stop offset="1" stop-color="#c52df5" stop-opacity="0"/></radialGradient>
    <linearGradient id="light"><stop offset="0" stop-color="#c76eff" stop-opacity=".32"/>
      <stop offset="1" stop-color="#e9a5ff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1440" height="460" fill="url(#bg)"/>
  <ellipse cx="1090" cy="345" rx="520" ry="350" fill="url(#glow)"/>
  <path d="M450 0L870 460 960 460 565 0Z" fill="url(#light)" opacity=".32"/>
  <path d="M650 0L1055 460 1090 460 760 0Z" fill="url(#light)" opacity=".2"/>
  <path d="M0 456Q650 490 1440 422V460H0Z" fill="#ff61ee" opacity=".15"/>
</svg>`);

await sharp(backdrop)
  .composite([{ input: art, left: 790, top: 0 }])
  .png({ compressionLevel: 9, palette: false })
  .toFile(destination);

const output = await sharp(destination).metadata();
if (output.width !== 1440 || output.height !== 460) {
  throw new Error('Giveaway full-width PNG has incorrect dimensions');
}
console.log('Giveaway: full-bleed text-free 1440×460 PNG generated successfully.');
