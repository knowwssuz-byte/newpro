import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeCaseArtwork } from '../lib/caseImageProcessing.mjs';

for (const dimensions of [
  {width:1536,height:1024}, // wide generated art
  {width:1024,height:1024}, // normal square art
  {width:768,height:1200}, // phone portrait art
]) {
  test(`case artwork ${dimensions.width}x${dimensions.height} automatically becomes uncropped square PNG`, async () => {
    const original = await sharp({
      create: { ...dimensions, channels: 4, background: {r: 36, g: 71, b: 155, alpha: 1} }
    }).png().toBuffer();
    const normalized = await normalizeCaseArtwork(original);
    const meta = await sharp(normalized).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1024);
    const centerPixel = await sharp(normalized).extract({ left:512, top:512, width:1,height:1 }).raw().toBuffer();
    assert.deepEqual([...centerPixel].slice(0,3), [36,71,155]);
  });
}
