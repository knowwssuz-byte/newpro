import sharp from 'sharp';

// Always keep the full object visible. The blurred cover is decorative,
// while the original source is centered and fitted *inside* the square.
export async function normalizeCaseArtwork(buffer, { size = 1024 } = {}) {
  const original = Buffer.from(buffer || []);
  if (!original.length) throw new Error('Empty image');
  if (!Number.isInteger(size) || size < 256 || size > 2048) throw new Error('Invalid size');

  const opts = { limitInputPixels: 64 * 1024 * 1024, failOn: 'error' };
  const source = sharp(original, opts);
  const meta = await source.metadata();
  if (!meta.width || !meta.height) throw new Error('Invalid artwork');

  const background = await sharp(original, opts).rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .blur(25)
    .modulate({ brightness: 0.52, saturation: 0.78 })
    .png()
    .toBuffer();

  const foreground = await sharp(original, opts).rotate()
    .resize(size - 32, size - 32, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  const frontMeta = await sharp(foreground).metadata();
  if (!frontMeta.width || !frontMeta.height) throw new Error('Invalid foreground');
  return sharp(background)
    .composite([{
      input: foreground,
      left: Math.round((size - frontMeta.width) / 2),
      top: Math.round((size - frontMeta.height) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
