'use client';

import {useEffect,useRef,useState} from 'react';
import {Gift, Sparkles} from 'lucide-react';
import styles from './ColorArena.module.css';

// A Telegram TGS is gzipped Lottie data, NOT a browser-displayable image.
// Decode through the existing secured endpoint and cache the verified JSON.
const tgsCache=new Map();
function cachedAnimation(src){
  if(!tgsCache.has(src)){
    const promise=fetch('/api/gift-animation?url='+encodeURIComponent(src),{cache:'force-cache'})
      .then(async response=>{
        const result=await response.json();
        if(!response.ok||!result?.ok||!result.animationData)throw Error('Invalid gift art');
        return result.animationData;
      }).catch(error=>{tgsCache.delete(src);throw error;});
    tgsCache.set(src,promise);
  }
  return tgsCache.get(src);
}
const extension=(s,re)=>re.test(String(s||'').split('?')[0]);

export default function ArenaGiftArtwork({gift,selected=false}){
  const root=useRef(null),canvas=useRef(null),animation=useRef(null);
  const [visible,setVisible]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [imageFailed,setImageFailed]=useState(false);
  const image=gift?.imageUrl||'';
  const animationUrl=gift?.animationUrl||'';
  const tgs=extension(animationUrl,/\.tgs$/i)||/\/telegram\/animations\//.test(animationUrl);
  const movie=extension(animationUrl,/\.(mp4|webm)$/i);
  const animatedImage=extension(animationUrl,/\.(gif|webp|png|jpe?g)$/i);
  useEffect(()=>{
    setLoaded(false);setImageFailed(false);
  },[gift?.historyId,image,animationUrl]);
  useEffect(()=>{
    const node=root.current;
    if(!node)return;
    if(!('IntersectionObserver' in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'130px'});
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible||!tgs||!canvas.current)return;
    let cancelled=false;let instance;
    Promise.all([import('lottie-web'),cachedAnimation(animationUrl)])
      .then(([mod,data])=>{
        if(cancelled||!canvas.current)return;
        // Lottie modifies some data as it renders; do not share mutable data.
        const cloned=typeof structuredClone==='function'?structuredClone(data):
          JSON.parse(JSON.stringify(data));
        instance=mod.default.loadAnimation({
          container:canvas.current,renderer:'svg',animationData:cloned,
          loop:selected,autoplay:selected,rendererSettings:{preserveAspectRatio:'xMidYMid meet'}
        });
        animation.current=instance;
        instance.addEventListener('DOMLoaded',()=>{
          if(cancelled)return;
          if(!selected)instance.goToAndStop(0,true);
          setLoaded(true);
        });
        instance.addEventListener('data_failed',()=>{if(!cancelled)setLoaded(false);});
      }).catch(()=>{if(!cancelled)setLoaded(false);});
    return()=>{cancelled=true;animation.current=null;try{instance?.destroy();}catch{}};
  },[visible,tgs,animationUrl]);
  useEffect(()=>{
    const a=animation.current;
    if(!a)return;
    if(selected){a.loop=true;a.play();}
    else {a.loop=false;a.goToAndStop(0,true);}
  },[selected]);
  const showTgs=tgs&&visible;
  const mediaSource=image&&!imageFailed?image:
    animatedImage?animationUrl:'';
  return <span className={styles.giftArtwork} ref={root} aria-hidden="true">
    <span className={styles.giftArtworkGlow}/>
    {visible&&mediaSource?<img src={mediaSource} alt="" loading="lazy"
      decoding="async" onLoad={()=>setLoaded(true)}
      onError={()=>setImageFailed(true)}
      className={styles.giftArtworkImage}/>:null}
    {showTgs?<span ref={canvas} className={styles.giftArtworkLottie}
      data-ready={loaded?'yes':'no'}/>:null}
    {visible&&movie&&!showTgs&&!mediaSource?
      <video src={animationUrl} muted playsInline autoPlay={selected}
        loop={selected} preload="metadata" className={styles.giftArtworkImage}
        onLoadedData={()=>setLoaded(true)}/>:null}
    {!loaded?<span className={styles.giftArtworkLoading}>
      <Gift size={24} strokeWidth={1.3}/>
    </span>:null}
    {selected?<span className={styles.giftArtworkSparkle}><Sparkles size={13}/></span>:null}
  </span>;
}
