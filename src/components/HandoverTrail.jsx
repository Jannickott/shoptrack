import { useState } from "react";
import { C } from "../lib/theme";

// Who has had the job (Fast operatør handovers): Helena → Moheeb → Helena.
// Tap to see when and why each move happened.
const WHY={"afløser":"afløser","tilbage":"tilbage","prioritet":"prioritet"};
const when=t=>new Date(t).toLocaleString("da-DK",{weekday:"short",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"});

export function HandoverTrail({j,compact}){
  const [open,setOpen]=useState(false);
  const hs=j.handovers||[];
  if(!hs.length) return null;
  const names=[hs[0].from||"—",...hs.map(h=>h.to)];
  const shown=names.length>5?["…",...names.slice(-4)]:names;
  return(
    <div onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} style={{fontSize:13,color:C.muted,cursor:"pointer",background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:6,padding:compact?"4px 8px":"6px 8px"}}>
      <i className="ti ti-arrows-exchange" style={{color:C.blue}}/> {shown.map((n,i)=><span key={i}>{i>0&&<span style={{color:C.blue}}> → </span>}<span style={{color:i===shown.length-1?C.text:C.muted,fontWeight:i===shown.length-1?700:400}}>{n}</span></span>)}
      <i className={`ti ti-chevron-${open?"up":"down"}`} style={{marginLeft:6,fontSize:12}}/>
      {open&&(
        <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
          {[...hs].reverse().map((h,i)=>(
            <div key={i} style={{color:C.text}}>
              <span style={{color:C.muted}}>{when(h.at)}</span> · {h.from||"—"} → <b>{h.to}</b> <span style={{color:C.muted}}>({WHY[h.why]||h.why})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
