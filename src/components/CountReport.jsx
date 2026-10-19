import { useState } from "react";
import { notify } from "./Feedback";
import { C, inp, btn, label } from "../lib/theme";
import { makeCount, jobSide } from "../planning/planEngine";

// "Meld antal": how many pieces are done now, and how many the order is for.
// Used on the operator's job card and in Planlægning (e.g. at the morning meeting).
export function CountReport({j,setJobs,by,saveNow,onClose}){
  const side=jobSide(j);
  const last=[...(j.counts||[])].reverse().find(c=>(c.side||1)===side);
  const [pieces,setPieces]=useState("");
  const [target,setTarget]=useState(j.targetQty?String(j.targetQty):"");
  const [err,setErr]=useState("");
  const save=()=>{
    const p=pieces===""?null:parseInt(pieces,10);
    const t=target===""?null:parseInt(target,10);
    if(p==null&&t===(j.targetQty||null)){setErr("Skriv hvor mange der er lavet");return;}
    if(p!=null&&t&&p>t*1.5){setErr(`${p} stk er meget mere end ordren på ${t} — tjek tallet`);return;}
    const now=Date.now();
    setJobs(prev=>prev.map(x=>x.id!==j.id?x:{...x,
      ...(t!==(x.targetQty||null)?{targetQty:t}:{}),
      ...(p!=null?{counts:[...(x.counts||[]),makeCount(x,p,by)]}:{}),
      lastModifiedAt:now}));
    saveNow&&saveNow();
    notify(p!=null?`Meldt: ${p}${t?` af ${t}`:""} stk på ${j.machine}`:"Antal i ordren gemt");
    onClose&&onClose();
  };
  return(
    <div style={{background:C.raised,border:`1px solid ${C.blue}`,borderRadius:8,padding:12,marginTop:4}}>
      {j.twoSided&&<div style={{fontSize:13,color:C.blue,marginBottom:8}}>Side {side}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <label style={label}>Lavet nu</label>
          <input autoFocus inputMode="numeric" style={{...inp(!!err),fontSize:24,textAlign:"center",fontFamily:"'Share Tech Mono',monospace"}} value={pieces}
            onChange={e=>{setPieces(e.target.value.replace(/\D/g,""));setErr("");}} onKeyDown={e=>e.key==="Enter"&&save()} placeholder={last?String(last.pieces):"0"}/>
        </div>
        <div>
          <label style={label}>Antal i ordren</label>
          <input inputMode="numeric" style={{...inp(),fontSize:24,textAlign:"center",fontFamily:"'Share Tech Mono',monospace"}} value={target}
            onChange={e=>{setTarget(e.target.value.replace(/\D/g,""));setErr("");}} onKeyDown={e=>e.key==="Enter"&&save()} placeholder="?"/>
        </div>
      </div>
      {last&&<div style={{fontSize:13,color:C.muted,marginTop:6}}>Sidst meldt: {last.pieces} stk · {new Date(last.at).toLocaleString("da-DK",{weekday:"short",hour:"2-digit",minute:"2-digit"})}{last.by?` · ${last.by}`:""}</div>}
      {err&&<div style={{fontSize:14,color:C.red,marginTop:6}}>{err}</div>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <button style={btn("outline",false,true)} onClick={onClose}>Annuller</button>
        <button style={{...btn("blue",true,true),flex:1}} onClick={save}><i className="ti ti-check"/> Gem</button>
      </div>
    </div>
  );
}
