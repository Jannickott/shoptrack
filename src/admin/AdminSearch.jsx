import { useState, useEffect, useRef } from "react";
import { C } from "../lib/theme";
import { fmtDate } from "../lib/util";
import { taskState, TASK_STATE, visibleTasks } from "../tasks/taskUtil";

// ═══════════════════════════════════════════════════════
// ADMIN SEARCH — one box in the admin menu: a drawing number, customer, machine
// or name finds jobs, setup sheets and tasks at once. A result opens in its own tab.
// ═══════════════════════════════════════════════════════
const PER_GROUP=6;
const JOB_STATUS={setup:"Opstilling",side2_setup:"Opstilling side 2",run:"Produktion",side2_run:"Produktion side 2",deburring:"Afgratning"};
const has=(q,...fields)=>fields.some(f=>(f||"").toString().toLowerCase().includes(q));

export function AdminSearch({jobs,setupSheets,tasks,onOpen}){
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const boxRef=useRef(null);
  useEffect(()=>{
    const away=e=>{if(boxRef.current&&!boxRef.current.contains(e.target))setOpen(false);};
    document.addEventListener("pointerdown",away);
    return()=>document.removeEventListener("pointerdown",away);
  },[]);
  const s=q.trim().toLowerCase();
  const ready=s.length>=2;
  const jobHits=ready?(jobs||[]).filter(j=>has(s,j.job,j.customer,j.machine,j.operatorName,j.op))
    .sort((a,b)=>(a.status==="done")-(b.status==="done")||(b.completedAt||b.createdAt||0)-(a.completedAt||a.createdAt||0)):[];
  const sheetHits=ready?(setupSheets||[]).filter(sh=>has(s,sh.partNumber,sh.customer,sh.machine,sh.operation,sh.department))
    .sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)):[];
  const taskHits=ready?visibleTasks(tasks).filter(t=>has(s,t.title,t.partNumber,t.requesterName,t.note,t.material))
    .map(t=>({t,st:taskState(t,jobs)})).sort((a,b)=>(a.st.key==="done")-(b.st.key==="done")||b.t.createdAt-a.t.createdAt):[];
  const total=jobHits.length+sheetHits.length+taskHits.length;
  const pick=(type,item)=>{setOpen(false);setQ("");onOpen(type,item);};
  const first=()=>jobHits[0]?pick("job",jobHits[0]):sheetHits[0]?pick("sheet",sheetHits[0]):taskHits[0]?pick("task",taskHits[0].t):null;

  const group=(icon,title,hits,render)=>hits.length>0&&(
    <div style={{marginBottom:6}}>
      <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",padding:"8px 12px 4px"}}><i className={`ti ti-${icon}`}/> {title} · {hits.length}{hits.length>PER_GROUP?` (viser ${PER_GROUP})`:""}</div>
      {hits.slice(0,PER_GROUP).map(render)}
    </div>
  );
  const row=(key,onClick,main,sub,right,rightColor)=>(
    <button key={key} onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",background:"none",border:"none",borderTop:`1px solid ${C.border}`,padding:"10px 12px",minHeight:50,cursor:"pointer",fontFamily:"inherit",color:C.text}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:15,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{main}</div>
        <div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</div>
      </div>
      {right&&<span style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:rightColor||C.muted,whiteSpace:"nowrap",flexShrink:0}}>{right}</span>}
    </button>
  );

  return(
    <div ref={boxRef} style={{position:"relative",flex:"1 1 220px",minWidth:200,maxWidth:420,marginLeft:"auto"}}>
      <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:17,pointerEvents:"none"}}/>
      <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
        onKeyDown={e=>{if(e.key==="Escape"){setQ("");setOpen(false);}if(e.key==="Enter")first();}}
        placeholder="Søg tegningsnr., kunde, maskine…"
        style={{width:"100%",boxSizing:"border-box",minHeight:48,padding:"10px 36px 10px 38px",background:C.raised,border:`1px solid ${open&&ready?C.amber:C.border}`,borderRadius:8,color:C.text,fontSize:15,fontFamily:"inherit",outline:"none"}}/>
      {q&&<button title="Ryd" onClick={()=>{setQ("");setOpen(false);}} style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",minWidth:40,minHeight:40,color:C.muted,cursor:"pointer",fontSize:16}}><i className="ti ti-x"/></button>}
      {open&&ready&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:"min(520px, calc(100vw - 32px))",maxHeight:"70vh",overflowY:"auto",background:C.surface,border:`1px solid ${C.amber}`,borderRadius:10,boxShadow:"0 12px 40px rgba(0,0,0,.5)",zIndex:300}}>
          {total===0&&<div style={{padding:"16px",color:C.muted,fontSize:15,textAlign:"center"}}>Intet fundet for "{q.trim()}"</div>}
          {group("tool","Job",jobHits,j=>row(`j${j.id}`,()=>pick("job",j),
            `${j.job}${j.customer?` · ${j.customer}`:""}`,
            [j.machine,j.operatorName,j.status==="done"?fmtDate(j.completedAt):""].filter(Boolean).join(" · "),
            j.status==="done"?"Færdig":JOB_STATUS[j.status]||j.status,j.status==="done"?C.muted:C.green))}
          {group("clipboard-list","Opstillingsark",sheetHits,sh=>row(`s${sh.id}`,()=>pick("sheet",sh),
            `${sh.partNumber}${sh.customer?` · ${sh.customer}`:""}`,
            [sh.machine,sh.operation,sh.department].filter(Boolean).join(" · "),
            sh.subDepartment||"",C.blue))}
          {group("clipboard-check","Opgaver",taskHits,({t,st})=>row(`t${t.id}`,()=>pick("task",t),
            t.title,
            [t.partNumber,`fra ${t.requesterName}`].filter(Boolean).join(" · "),
            TASK_STATE[st.key].label,TASK_STATE[st.key].color))}
        </div>
      )}
    </div>
  );
}
