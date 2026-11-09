import { useState } from "react";
import { notify } from "../components/Feedback";
import { C, btn } from "../lib/theme";
import { takeOrBorrow, toolAvailable, toolLocation } from "../tools/toolOps";
import { sheetToolLife } from "../tools/toolLife";
import { ToolLifeRow } from "../tools/ToolLifeRow";

// "Klargør værktøj": the cabinet tools a setup sheet needs — where they are, how many
// are free, their life on this machine — and take / borrow them, one by one or all at once.
export function PrepareTools({sheet,tools,cabinets,user,setTools,setToolLog,jobs,sheets,toolChanges,setToolChanges,saveNow}){
  const [open,setOpen]=useState(true);
  const [taken,setTaken]=useState({}); // tool id → true, taken in this visit
  const rows=[...(sheet.tools||[]),...(sheet.tools2||[]),...(sheet.tools3||[])].filter(r=>r.toolId!=null);
  const items=[];
  rows.forEach(r=>{
    const tool=(tools||[]).find(t=>String(t.id)===String(r.toolId)&&t.active!==false);
    if(!tool) return;
    const ex=items.find(x=>x.tool.id===tool.id);
    if(ex) ex.positions.push(r.position); else items.push({tool,positions:[r.position]});
  });
  if(!items.length) return null;
  const life=sheetToolLife(sheet,{tools,jobs,sheets,changes:toolChanges});
  const canAct=!!(user&&setTools&&setToolLog);
  const take=tool=>{
    if(!takeOrBorrow(tool,user,setTools,setToolLog)){notify(`${tool.name}: ingen ledige`,"error");return false;}
    setTaken(p=>({...p,[tool.id]:true}));return true;
  };
  const left=items.filter(x=>!taken[x.tool.id]&&toolAvailable(x.tool)>0);
  const takeAll=()=>{
    let n=0;left.forEach(x=>{if(takeOrBorrow(x.tool,user,setTools,setToolLog)){n++;setTaken(p=>({...p,[x.tool.id]:true}));}});
    notify(`${n} værktøj taget / lånt`);
  };
  return(
    <div style={{background:C.surface,border:`1px solid ${C.blue}66`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"rgba(59,130,246,.08)",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <i className="ti ti-tools" style={{fontSize:20,color:C.blue}}/>
        <span style={{flex:1,fontSize:14,fontWeight:700,color:C.blue,letterSpacing:1.5,textTransform:"uppercase"}}>Klargør værktøj · {items.length}</span>
        <i className={`ti ti-chevron-${open?"up":"down"}`} style={{color:C.blue}}/>
      </button>
      {open&&<>
        {canAct&&left.length>1&&<div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
          <button style={{...btn("blue",true,true)}} onClick={takeAll}><i className="ti ti-hand-grab"/> Tag alle ({left.length})</button>
        </div>}
        {items.map(({tool,positions})=>{
          const av=toolAvailable(tool),done=taken[tool.id];
          const l=life.find(x=>String(x.row.toolId)===String(tool.id));
          return(
            <div key={tool.id} style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {tool.photoData?<img src={tool.photoData} alt="" style={{width:46,height:46,objectFit:"cover",borderRadius:6,flexShrink:0}}/>
                  :<div style={{width:46,height:46,borderRadius:6,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-tool" style={{color:C.muted,fontSize:22}}/></div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.text}}>{tool.name} <span style={{fontSize:13,color:C.muted,fontWeight:400}}>· pos. {positions.join(", ")}</span></div>
                  <div style={{fontSize:13,color:C.muted}}><i className="ti ti-map-pin"/> {toolLocation(tool,cabinets)||"—"} · <span style={{color:av>0?C.green:C.red}}>{av} {tool.returnable?"ledig":"på lager"}</span></div>
                </div>
                {canAct&&(done
                  ?<span style={{fontSize:14,color:C.green,fontWeight:700,whiteSpace:"nowrap"}}><i className="ti ti-check"/> {tool.returnable?"Lånt":"Taget"}</span>
                  :<button style={btn(av>0?"outline":"outline",false,true)} disabled={av<1} onClick={()=>take(tool)}>{tool.returnable?"Lån":"Tag"}</button>)}
              </div>
              {l&&<div style={{marginLeft:58}}><ToolLifeRow tool={tool} usage={l.usage} machine={sheet.machine} user={user} setToolChanges={setToolChanges} saveNow={saveNow}/></div>}
            </div>
          );
        })}
      </>}
    </div>
  );
}
