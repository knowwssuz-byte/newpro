import sharp from 'sharp';
import { gunzipSync } from 'node:zlib';
import { HttpError, readLimitedBytes } from './http.mjs';

const types = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export async function validateImage(buffer, { allowSvg = false, maxBytes = 12 * 1024 * 1024 } = {}) {
  if (!buffer.length || buffer.length > maxBytes) throw new HttpError(413, 'Rasm hajmi noto‘g‘ri.');
  try {
    const image = sharp(buffer, { limitInputPixels: 16 * 1024 * 1024, failOn: 'warning' }).timeout({ seconds: 5 });
    const info = await image.metadata();
    if (!info.width || !info.height || info.width * info.height * (info.pages || 1) > 16 * 1024 * 1024) throw Error();
    if (info.format === 'svg' && allowSvg) {
      const xml = buffer.toString('utf8');
      // Uploaded SVG is never served as an active document. Reject references
      // before rasterizing; entity encodings cannot hide local/remote URLs.
      if (/<!DOCTYPE|<!ENTITY|<\s*script|foreignObject|\son\w+\s*=|&|@import|url\s*\(/i.test(xml) ||
          /(?:href|src)\s*=\s*['"](?!#)/i.test(xml)) throw Error();
      const png = await image.png().toBuffer();
      return { buffer: png, contentType: 'image/png', ext: 'png' };
    }
    if (!types[info.format]) throw Error();
    return { buffer, contentType: types[info.format], ext: info.format === 'jpeg' ? 'jpg' : info.format };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Rasm fayli yaroqsiz yoki xavfsiz formatda emas.');
  }
}

export function validateVideo(buffer, contentType) {
  const mp4 = buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp';
  const webm = buffer.length >= 16 && buffer.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (contentType === 'video/mp4' && mp4) return 'mp4';
  if (contentType === 'video/webm' && webm) return 'webm';
  throw new HttpError(400, 'Video fayli yaroqsiz.');
}

export function allowedAnimationUrl(raw, supabaseUrl, bucket = 'gift-assets') {
  try {
    const url = new URL(raw);
    const expected = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.origin !== expected.origin || url.username || url.password ||
        url.hash || url.search || !url.pathname.startsWith(`/storage/v1/object/public/${bucket}/`)) return null;
    return url;
  } catch { return null; }
}

export function decodeAnimation(bytes, maxBytes = 8 * 1024 * 1024) {
  if (!bytes.length || bytes.length > maxBytes) throw new HttpError(422, 'Animatsiya hajmi noto‘g‘ri.');
  try {
    const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: maxBytes }) : bytes;
    const data = JSON.parse(json.toString('utf8'));
    if (!data || !Array.isArray(data.layers) || data.layers.length > 5000) throw Error();
    return data;
  } catch { throw new HttpError(422, 'Animatsiya fayli yaroqsiz yoki juda katta.'); }
}

export async function fetchAnimation(url) {
  const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000),
    cache: 'force-cache', next: { revalidate: 86400 } });
  if (!upstream.ok) throw new HttpError(502, 'Animatsiya topilmadi.');
  return decodeAnimation(await readLimitedBytes(upstream, 8 * 1024 * 1024));
}
