'use client';

import { useEffect, useState } from 'react';
import styles from './UpgradeGiftThumb.module.css';

const FALLBACK = '/feature/upgrade/gift-fallback.svg';
const cache = new Map();
const TGS_SUFFIX = /\.tgs(?:[?#]|$)/i;

export function getGiftPreview(item) {
  if (!item) return Promise.resolve(FALLBACK);
  const image = item.imageUrl || item.image_url || item.png_url || item.webp_url;
  if (typeof image === 'string' && image) return Promise.resolve(image);
  const animation = item.animationUrl || item.animation_url || '';
  if (!TGS_SUFFIX.test(animation)) {
    return Promise.resolve(/\.(png|jpe?g|svg|gif|webp)(?:[?#]|$)/i.test(animation) ? animation : FALLBACK);
  }
  if (!cache.has(animation)) {
    cache.set(animation, (async () => {
      const [{ default: lottie }, response] = await Promise.all([
        import('lottie-web'),
        fetch('/api/gift-animation?url=' + encodeURIComponent(animation), { cache: 'force-cache' }),
      ]);
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload.animationData) throw new Error('TGS preview unavailable');
      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;pointer-events:none;opacity:0;top:-9000px;left:-9000px;width:192px;height:192px;overflow:hidden;';
      document.body.appendChild(host);
      let player;
      try {
        player = lottie.loadAnimation({ container: host, renderer:'svg', loop:false, autoplay:false, animationData:payload.animationData });
        await new Promise((resolve, reject) => {
          let done = false;
          const timer = setTimeout(() => { if(!done){done=true;reject(new Error('Preview timed out'));} }, 6500);
          const settle = (error) => { if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(); };
          player.addEventListener('DOMLoaded', () => settle());
          player.addEventListener('data_failed', () => settle(new Error('Invalid animation')));
          if (host.querySelector('svg')) settle();
        });
        // Capture a representative frame of the real Telegram collectible.
        player.goToAndStop(Math.max(1, Math.round(player.totalFrames * .22)), true);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const svg = host.querySelector('svg');
        if (!svg) throw new Error('Gift preview SVG missing');
        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
        clone.setAttribute('width','256');
        clone.setAttribute('height','256');
        const xml = new XMLSerializer().serializeToString(clone);
        return URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
      } finally {
        try { player?.destroy(); } catch {}
        host.remove();
      }
    })().catch(() => {
      cache.delete(animation);
      return FALLBACK;
    }));
  }
  return cache.get(animation);
}

export function UpgradeGiftThumb({ item, className = '', priority = false, alt = '' }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc('');
    setFailed(false);
    getGiftPreview(item).then(value => { if(alive) setSrc(value || FALLBACK); });
    return () => { alive = false; };
  }, [item?.id, item?.imageUrl, item?.animationUrl, item?.image_url, item?.animation_url]);
  return (
    <span className={[styles.frame, className].filter(Boolean).join(' ')} data-loading={src ? 'false' : 'true'}>
      {src ? <img src={failed ? FALLBACK : src} alt={alt} loading={priority ? 'eager':'lazy'} decoding="async"
          draggable={false} onError={() => setFailed(true)} /> : <span className={styles.shimmer} aria-hidden="true" />}
    </span>
  );
}
