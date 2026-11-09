import { useState } from "react";
import { C, btn } from "../lib/theme";

// Admin only: the PDF of every saved version of a setup sheet, kept by the server
// in setupsheets/historik/<id>/. Loaded when opened, newest first.
const when=t=>t?new Date(t).toLocaleString("da-DK",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"ukendt dato";

export function SheetHistory({sheetId}){
  const [open,setOpen]=useState(false);
  const [data,setData]=useState(null); // {current,history} | "error"
  const load=()=>{
    setData(null);
    fetch(`/api/setupsheet-history/${encodeURIComponent(sheetId)}`).then(r=>r.ok?r.json():Promise.reject()).then(setData,()=>setData("error"));
  };
  const toggle=()=>{if(!open) load();setOpen(o=>!o);};
  const row=(v,label,accent)=>(
    <a key={v.file} href={v.url} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderTop:`1px solid ${C.border}`,textDecoration:"none",minHeight:52}}>
      <i className="ti ti-file-type-pdf" style={{fontSize:24,color:accent}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:15,fontWeight:600,color:C.text}}>{when(v.savedAt)}{v.by?` · ${v.by}`:""}</div>
        <div style={{fontSize:13,color:C.muted}}>{label}</div>
      </div>
      <i className="ti ti-external-link" style={{color:C.muted}}/>
    </a>
  );
  const hist=data&&data!=="error"?data.history:[];
  return(
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:14}}>
      <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:C.raised,border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",minHeight:48}}>
        <i className="ti ti-history" style={{fontSize:20,color:C.amber}}/>
        <span style={{flex:1,fontSize:14,fontWeight:700,color:C.amber,letterSpacing:1.5,textTransform:"uppercase"}}>Historik <span style={{fontSize:12,color:C.muted,fontWeight:400,letterSpacing:0,textTransform:"none"}}>· kun admin</span></span>
        <i className={`ti ti-chevron-${open?"up":"down"}`} style={{color:C.amber}}/>
      </button>
      {open&&(
        data===null?<div style={{padding:14,color:C.muted,fontSize:14}}>Henter…</div>
        :data==="error"?<div style={{padding:14,color:C.red,fontSize:14}}>Kunne ikke hente historikken fra serveren. <button style={btn("outline",false,true)} onClick={load}>Prøv igen</button></div>
        :<>
          {data.current?row(data.current,"Nuværende version",C.green)
            :<div style={{padding:"12px 14px",fontSize:14,color:C.muted}}>Ingen PDF af den nuværende version endnu — den laves næste gang arket gemmes.</div>}
          {hist.map(h=>row(h,h.reason==="slettet"?`Sidste version før arket blev slettet${h.archivedBy?` af ${h.archivedBy}`:""}`:`Tidligere version · erstattet ${when(h.archivedAt)}${h.archivedBy?` af ${h.archivedBy}`:""}`,C.muted))}
          {!hist.length&&<div style={{padding:"12px 14px",fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`}}>Ingen tidligere versioner endnu. Hver gang arket gemmes, gemmes den forrige version her.</div>}
        </>
      )}
    </div>
  );
}
