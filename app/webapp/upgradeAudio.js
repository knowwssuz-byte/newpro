// Web Audio synthesis: short, non-intrusive musical feedback; no external audio request.
// Only triggered from an explicit user spin interaction. Audio is not gambling-related.
let context = null;
function getContext() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context || context.state === 'closed') context = new AudioContext();
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}
function tone(ctx, frequency, when, seconds, peak, type='sine', drop=0) {
  const oscillator=ctx.createOscillator();
  const amp=ctx.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(frequency,when);
  if(drop) oscillator.frequency.exponentialRampToValueAtTime(Math.max(65,frequency*drop),when+seconds);
  amp.gain.setValueAtTime(.0001,when);
  amp.gain.exponentialRampToValueAtTime(peak,when+.012);
  amp.gain.exponentialRampToValueAtTime(.0001,when+seconds);
  oscillator.connect(amp);
  amp.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when+seconds+.02);
}
export function upgradeSound(kind, enabled=true) {
  if (!enabled) return;
  try {
    const ctx=getContext();
    if (!ctx) return;
    const now=ctx.currentTime+.015;
    if(kind==='select') {
      tone(ctx,620,now,.09,.024,'triangle',1.24);
    }else if(kind==='start') {
      tone(ctx,210,now,.24,.047,'triangle',2.7);
      tone(ctx,520,now+.16,.18,.024,'sine',1.38);
    }else if(kind==='tick') {
      tone(ctx,680,now,.035,.016,'triangle',.82);
    }else if(kind==='win') {
      [659.25,830.61,987.77,1318.51].forEach((f,i)=>{
        tone(ctx,f,now+i*.115,.51,.063/(1+i*.12),'sine');
        tone(ctx,f*2,now+i*.115,.23,.012,'triangle');
      });
    }else if(kind==='miss') {
      tone(ctx,350,now,.18,.026,'sine',.75);
      tone(ctx,275,now+.13,.25,.018,'sine',.85);
    }
  }catch{ /* Telegram/iOS WebView sound permission may deny playback. */ }
}
