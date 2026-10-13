import { useState, useEffect } from "react";
import { C } from "../lib/theme";

// ─── FEEDBACK ─────────────────────────────────────────────────────────────────
// notify("Job afsluttet") shows a short message at the bottom (and a tiny vibration
// on tablets that support it); setSync() drives the "Gemt / Gemmer… / Ikke gemt"
// indicator in the header.
export const feedbackBus=new EventTarget();
export function notify(text,kind="ok"){
  feedbackBus.dispatchEvent(new CustomEvent("toast",{detail:{text,kind,id:Date.now()+Math.random()}}));
  try{navigator.vibrate&&navigator.vibrate(kind==="error"?[60,40,60]:30);}catch{/* not supported */}
}
export function setSync(state){feedbackBus.dispatchEvent(new CustomEvent("sync",{detail:state}));}

export function Toasts(){
  const [list,setList]=useState([]);
  useEffect(()=>{
    const on=e=>{const t=e.detail;setList(l=>[...l.slice(-2),t]);setTimeout(()=>setList(l=>l.filter(x=>x.id!==t.id)),2600);};
    feedbackBus.addEventListener("toast",on);
    return()=>feedbackBus.removeEventListener("toast",on);
  },[]);
  return(
    <div style={{position:"fixed",left:0,right:0,bottom:24,display:"flex",flexDirection:"column",alignItems:"center",gap:8,zIndex:2000,pointerEvents:"none"}}>
      {list.map(t=>(
        <div key={t.id} style={{background:t.kind==="error"?C.red:t.kind==="warn"?C.amber:C.green,color:t.kind==="warn"?"#1a1a1a":"#fff",
          padding:"14px 22px",borderRadius:12,fontSize:17,fontWeight:700,boxShadow:"0 6px 24px rgba(0,0,0,.45)",display:"flex",alignItems:"center",gap:10,maxWidth:"90vw"}}>
          <i className={`ti ti-${t.kind==="error"?"alert-triangle":t.kind==="warn"?"info-circle":"circle-check"}`} style={{fontSize:22}}/>{t.text}
        </div>
      ))}
    </div>
  );
}

export function SyncIndicator(){
  const [s,setS]=useState("saved");
  useEffect(()=>{const on=e=>setS(e.detail);feedbackBus.addEventListener("sync",on);return()=>feedbackBus.removeEventListener("sync",on);},[]);
  const [color,text,icon,tip]={
    saved:[C.green,"Gemt","ti-cloud-check","Alt er gemt på serveren"],
    saving:[C.amber,"Gemmer…","ti-cloud-upload","Gemmer på serveren…"],
    offline:[C.red,"Ikke gemt","ti-cloud-off","Ingen forbindelse — ændringer gemmes, når forbindelsen er tilbage"],
  }[s]||[];
  return <div title={tip} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}><i className={`ti ${icon}`} style={{fontSize:20}}/>{text}</div>;
}
