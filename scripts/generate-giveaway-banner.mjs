// Run before Next build so the browser receives a static PNG, never a Sharp
// serverless function. No game, wallet or Telegram APIs are touched.
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const cwd=process.cwd();
const directory=path.join(cwd,'public','feature','game-banners');
const src=path.join(directory,'giveaway-v1.webp');
const fallback=path.join(directory,'giveaway-art-v2.png');
const dst=path.join(directory,'giveaway-clean.png');
await mkdir(directory,{recursive:true});
try {
  const {default:sharp}=await import('sharp');
  const input=await readFile(src);
  const sourceMeta=await sharp(input).metadata();
  const left=Math.floor(sourceMeta.width*.54);
  const top=Math.floor(sourceMeta.height*.09);
  const extractWidth=sourceMeta.width-left;
  const extractHeight=Math.min(sourceMeta.height-top,Math.floor(sourceMeta.height*.81));
  if(extractWidth<10||extractHeight<10)throw new Error('Gift image too small');
  const art=await sharp(input).extract({left,top,width:extractWidth,height:extractHeight})
    .resize(300,260,{fit:'fill'})
    .ensureAlpha().composite([{input:Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="260"><defs><linearGradient id="fade"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".2" stop-color="white" stop-opacity="1"/><stop offset="1" stop-color="white" stop-opacity="1"/></linearGradient></defs><rect width="300" height="260" fill="url(#fade)"/></svg>'
    ),blend:'dest-in'}]).png().toBuffer();
  const backdrop=Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="650" height="260"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5710a3"/><stop offset=".55" stop-color="#7215cb"/><stop offset="1" stop-color="#5914aa"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="#a91bf0" stop-opacity=".75"/><stop offset="1" stop-color="#a91bf0" stop-opacity="0"/></radialGradient></defs><rect width="650" height="260" fill="url(#bg)"/><ellipse cx="330" cy="245" rx="420" ry="200" fill="url(#glow)"/></svg>'
  );
  await sharp(backdrop).composite([{input:art,left:350,top:0}])
    .resize(1300,520,{kernel:'lanczos3'})
    .sharpen({sigma:.6})
    .png({compressionLevel:9}).toFile(dst);
  const size=(await sharp(dst).metadata());
  if(size.width!==1300||size.height!==520)throw new Error('Unexpected PNG size');
  console.log('NewPro Giveaway: text-free 1300x520 PNG created before build.');
} catch (error) {
  // Never break a production build over a banner image.
  console.warn('NewPro Giveaway PNG fallback:',String(error.message||error).slice(0,120));
  await copyFile(fallback,dst);
}
