// Original synthesized arena audio: no external files, downloads or licensing.
// AudioContext is created only by a user gesture (Telegram / iOS Safari).
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function createArenaAudio() {
  let ctx=null,rolling=null,rollGain=null,lastHit=-Infinity,muted=true;
  const now=()=>ctx?.currentTime||0;
  const ready=()=>!muted && ctx && ctx.state==='running';
  function unlock(){
    if(typeof window==='undefined')return false;
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return false;
      if(!ctx)ctx=new Audio();
      // resume() must be requested synchronously from the user's click.
      muted=false;
      return ctx.resume().then(()=>true).catch(()=>false);
    }catch{return false;}
  }
  function tone({freq=440,endFreq=freq,duration=.15,level=.06,type='sine',delay=0}={}){
    if(!ready())return;
    try {
      const t=now()+delay;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=type;
      osc.frequency.setValueAtTime(Math.max(30,freq),t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),t+duration);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001,level),t+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(t);osc.stop(t+duration+.02);
      osc.onended=()=>{try{osc.disconnect();gain.disconnect();}catch{}};
    }catch{} // Audio must never affect betting, rendering or settlement.
  }
  function stopRoll(){
    if(!rolling)return;
    try {
      const t=now(),gain=rollGain;
      if(ctx?.state==='running' && gain){
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(.0001,t,.07);
        rolling.stop(t+.4);
      }else rolling.stop();
    }catch{}
    rolling=null;rollGain=null;
  }
  function startRoll(){
    if(!ready())return;
    stopRoll();
    try {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='triangle';
      osc.frequency.setValueAtTime(110,now());
      gain.gain.value=.0001;
      gain.gain.setTargetAtTime(.016,now(),.1);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start();rolling=osc;rollGain=gain;
      osc.onended=()=>{try{osc.disconnect();gain.disconnect()}catch{}};
      tone({freq:740,endFreq:250,duration:.3,level:.055,type:'sawtooth'});
    }catch{}
  }
  function progress(t){
    if(!ready()||!rolling||!rollGain)return;
    try {
      const time=now();
      rolling.frequency.setTargetAtTime(80+90*(1-clamp(t,0,1)),time,.08);
      rollGain.gain.setTargetAtTime(Math.max(.0001,.016*(1-t)),time,.1);
    }catch{}
  }
  function impact(strength=1){
    if(!ready()||now()-lastHit<.075)return;
    lastHit=now();
    const amp=clamp(strength,.2,1);
    tone({freq:400+amp*160,endFreq:160+amp*35,duration:.11,level:.06*amp,type:'triangle'});
    tone({freq:1480,endFreq:630,duration:.045,level:.018*amp,type:'square'});
  }
  function win(){
    if(!ready())return;
    stopRoll();
    [523.25,659.25,783.99,1046.5].forEach((freq,i)=>
      tone({freq,endFreq:freq*1.01,duration:.36,level:.045,type:'sine',delay:i*.12}));
  }
  function setMuted(value){
    muted=Boolean(value);
    if(muted){stopRoll();try{void ctx?.suspend().catch(()=>{})}catch{}return Promise.resolve(false);}
    return unlock();
  }
  function dispose(){
    stopRoll();muted=true;
    if(ctx){try{void ctx.close().catch(()=>{})}catch{}ctx=null;}
  }
  return {unlock,setMuted,startRoll,progress,impact,win,stopRoll,dispose};
}
