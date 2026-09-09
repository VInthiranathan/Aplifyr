import {useEffect,useRef} from 'react';
export function useDialogFocus(open:boolean,onClose:()=>void) {
 const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const panel=ref.current;if(!open||!panel)return;
  const previous=document.activeElement as HTMLElement|null;
  const items=()=>Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
  const first=()=>items()[0]??panel;
  first().focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key!=='Tab')return;
   const nodes=items();const active=document.activeElement;
   if(!nodes.length){e.preventDefault();panel.focus();}
   else if(e.shiftKey&&(active===nodes[0]||active===panel)){e.preventDefault();nodes[nodes.length-1].focus();}
   else if(!e.shiftKey&&(active===nodes[nodes.length-1]||active===panel)){e.preventDefault();nodes[0].focus();}
  };
  const focus=(e:FocusEvent)=>{if(!panel.contains(e.target as Node))first().focus();};
  document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
  return ()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);if(previous?.isConnected)previous.focus();};
 },[open]);
 return ref;
}
