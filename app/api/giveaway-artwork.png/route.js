import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint creates a high-resolution, text-free PNG from the existing
// NewPro prize artwork. Text and buttons are always native HTML/CSS overlays.
let imagePromise;
async function makeArtwork() {
  const source = await readFile(path.join(process.cwd(), 'public', 'feature', 'game-banners', 'giveaway-v1.webp'));
  const width = 650, height = 260;
  const overlay = await sharp(source)
    .extract({left: 350, top: 30, width: 300, height})
    .ensureAlpha()
    .composite([{input: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="260"><defs><linearGradient id="fade"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".2" stop-color="white" stop-opacity="1"/><stop offset="1" stop-color="white" stop-opacity="1"/></linearGradient></defs><rect width="300" height="260" fill="url(#fade)"/></svg>'
    ), blend: 'dest-in'}])
    .png()
    .toBuffer();
  const backdrop = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="260"><defs><linearGradient id="bg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#510d9b"/><stop offset=".52" stop-color="#7414ca"/><stop offset="1" stop-color="#4b0eae"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="#ae26ee" stop-opacity=".8"/><stop offset="1" stop-color="#ae26ee" stop-opacity="0"/></radialGradient></defs><rect width="650" height="260" fill="url(#bg)"/><ellipse cx="310" cy="260" rx="375" ry="185" fill="url(#glow)"/></svg>'
  );
  return sharp(backdrop)
    .composite([{input: overlay, left: 350, top: 0}])
    .resize(1300, 520, {kernel: 'lanczos3'})
    .sharpen({sigma: .65})
    .png({compressionLevel: 9})
    .toBuffer();
}
export async function GET() {
  try {
    imagePromise ??= makeArtwork().catch(e => {imagePromise=null; throw e;});
    const buffer = await imagePromise;
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    console.error('[giveaway-art]', error.code || 'render_failed');
    return new Response('Giveaway artwork unavailable', {status: 503});
  }
}
