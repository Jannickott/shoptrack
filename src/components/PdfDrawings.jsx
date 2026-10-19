import { useState } from "react";
import { C } from "../lib/theme";
import { uploadPdf } from "../lib/api";

// PDF drawings on a setup sheet or a task: [{url,name}]. Each opens in a new tab.
// With onChange the list can be added to (sent to the server at once) and trimmed.
export function PdfDrawings({files,onChange}){
  const [busy,setBusy]=useState(false);
  const list=files||[];
  const add=async e=>{
    const picked=[...e.target.files];
    e.target.value="";
    if(!picked.length) return;
    setBusy(true);
    const done=[];
    for(const f of picked){const r=await uploadPdf(f);if(r)done.push(r);}
    setBusy(false);
    if(done.length) onChange([...list,...done]);
  };
  if(!onChange&&!list.length) return null;
  return(
    <div>
      {list.map((f,i)=>(
        <div key={f.url} style={{display:"flex",alignItems:"center",gap:10,background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 6px 6px 12px",marginBottom:6}}>
          <i className="ti ti-file-type-pdf" style={{fontSize:24,color:C.red,flexShrink:0}}/>
          <a href={f.url} target="_blank" rel="noreferrer" style={{flex:1,minWidth:0,color:C.text,fontSize:15,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minHeight:40,display:"flex",alignItems:"center"}}>{f.name||"Tegning"}</a>
          <a href={f.url} target="_blank" rel="noreferrer" style={{color:C.blue,fontSize:14,textDecoration:"none",padding:"8px 10px",whiteSpace:"nowrap"}}><i className="ti ti-external-link"/> Åbn</a>
          {onChange&&<button title="Fjern" onClick={()=>onChange(list.filter((_,j)=>j!==i))} style={{background:"none",border:"none",minWidth:40,minHeight:40,color:C.red,cursor:"pointer",fontSize:17}}><i className="ti ti-x"/></button>}
        </div>
      ))}
      {onChange&&(
        <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:50,background:C.raised,border:`1px dashed ${C.border}`,borderRadius:8,padding:"10px 14px",cursor:busy?"wait":"pointer",color:C.text,fontSize:15}}>
          {busy?<><i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/> Sender PDF…</>:<><i className="ti ti-file-type-pdf" style={{fontSize:20,color:C.red}}/> Tilføj PDF-tegning</>}
          <input type="file" accept="application/pdf,.pdf" multiple style={{display:"none"}} disabled={busy} onChange={add}/>
        </label>
      )}
    </div>
  );
}
