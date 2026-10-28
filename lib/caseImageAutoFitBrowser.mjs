/**
 * Prepare a full-cover 1:1 case asset directly in the admin browser.
 *
 * The source is contained intact. A soft darkened copy covers the background
 * so horizontal/vertical images fit nicely without cropping the real subject.
 * Browser failures gracefully fall back to the original image; the case UI
 * also uses object-fit:contain + a blurred background.
 *
 * No server native image dependency; /api/browser-admin can always load.
 */
export async function prepareCaseArtwork(file) {
  if (!file || typeof document === 'undefined' || typeof Image === 'undefined'
      || typeof URL?.createObjectURL !== 'function') return file;

  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error('Image failed to load'));
      candidate.src = objectUrl;
    });
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h || w * h > 64000000) return file;

    const size = 1024;
    const pad = 18;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || typeof canvas.toBlob !== 'function') return file;

    ctx.fillStyle = '#141729';
    ctx.fillRect(0, 0, size, size);

    // Blurred backdrop fills spare letterbox regions, without sharp edges.
    const cover = Math.max(size / w, size / h) * 1.17;
    const bw = w * cover, bh = h * cover;
    ctx.save();
    ctx.filter = 'blur(26px) brightness(55%) saturate(85%)';
    ctx.drawImage(image, (size - bw) / 2, (size - bh) / 2, bw, bh);
    ctx.restore();

    const contain = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
    const fw = w * contain, fh = h * contain;
    ctx.drawImage(image, (size - fw) / 2, (size - fh) / 2, fw, fh);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || !blob.size) return file;
    const name = String(file.name || 'case').replace(/\.[^.]+$/, '');
    return new File([blob], name + '-auto-fit.png', { type: 'image/png' });
  } catch {
    // SVG with external assets may be canvas-tainted; preserve the source.
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
