import { useState } from "react";
import { C, btn, inp, label } from "../lib/theme";

import { ISSUE_TOPICS } from "../lib/issueTopics";
export { ISSUE_TOPICS, topicLabel, topicIcon } from "../lib/issueTopics";

// "Kører igen": what was it, what was done / missing, and was it really "nede" or "skal repareres"
export function ResolveIssueModal({machine,issue,onResolve,onClose}){
  const [status,setStatus]=useState(issue?.status||"down");
  const [topic,setTopic]=useState(issue?.topic||"");
  const [fix,setFix]=useState(issue?.fixDescription||"");
  const [err,setErr]=useState("");
  const done=()=>{
    if(!topic){setErr("Vælg hvad det handlede om");return;}
    onResolve({status,topic,fixDescription:fix.trim()});
  };
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"24px 12px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,width:"100%",maxWidth:560,padding:"16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <i className="ti ti-circle-check" style={{fontSize:26,color:C.green}}/>
          <div style={{flex:1,fontSize:19,fontWeight:700,color:C.text}}>{machine} kører igen</div>
          <button style={{...btn("outline",false,true),padding:"6px 10px"}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>
        {issue?.reason&&<div style={{fontSize:14,color:C.muted,marginBottom:12}}>Meldt: “{issue.reason}” · {issue.reportedBy}</div>}

        <div style={label}>Hvad var det?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <button style={btn(status==="repair"?"primary":"outline",true)} onClick={()=>setStatus("repair")}>Skal repareres</button>
          <button style={btn(status==="down"?"danger":"outline",true)} onClick={()=>setStatus("down")}>Maskine nede</button>
        </div>

        <div style={label}>Hvad handlede det om? *</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8,marginBottom:err?4:14}}>
          {ISSUE_TOPICS.map(t=>{const on=topic===t.key;return(
            <button key={t.key} onClick={()=>{setTopic(t.key);setErr("");}} style={{minHeight:56,display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",
              border:`2px solid ${on?C.amber:C.border}`,background:on?"rgba(240,165,0,.12)":C.raised,color:on?C.amber:C.text,fontSize:15,fontWeight:on?700:500}}>
              <i className={`ti ti-${t.icon}`} style={{fontSize:20,flexShrink:0}}/>{t.label}
            </button>
          );})}
        </div>
        {err&&<div style={{fontSize:13,color:C.red,marginBottom:12}}>{err}</div>}

        <div style={label}>Hvad blev lavet — eller hvad manglede?</div>
        <textarea style={{...inp(),minHeight:90,resize:"vertical",fontFamily:"inherit"}} value={fix} onChange={e=>setFix(e.target.value)} placeholder="f.eks. Skiftet slange på hydraulikpumpe · ventede på ny sensor"/>

        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button style={{...btn("success",true),flex:1}} onClick={done}><i className="ti ti-check"/> Kører igen</button>
          <button style={btn("outline",false)} onClick={onClose}>Annuller</button>
        </div>
      </div>
    </div>
  );
}
