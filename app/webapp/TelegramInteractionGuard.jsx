'use client';
import {useEffect} from 'react';
// Disables native long-press URL/media previews inside Telegram's mini app.
// Does not block taps, keyboard focus or selecting text in form controls.
export default function TelegramInteractionGuard(){
 useEffect(()=>{
  if(!/^\/webapp(?:\/|$)/.test(window.location.pathname))return;
  const blocked=(event)=>{
   const node=event.target;
   if(!(node instanceof Element))return;
   if(node.closest('input, textarea, select, [contenteditable="true"]'))return;
   event.preventDefault();
  };
  const drag=(event)=>{
    if(event.target instanceof Element&&event.target.closest('img,svg,video,picture,a'))event.preventDefault();
  };
  document.addEventListener('contextmenu',blocked,true);
  document.addEventListener('dragstart',drag,true);
  return ()=>{document.removeEventListener('contextmenu',blocked,true);document.removeEventListener('dragstart',drag,true)};
 },[]);
 return null;
}
