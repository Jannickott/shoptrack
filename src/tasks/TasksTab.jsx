import { useState, useRef, useEffect } from "react";
import { notify } from "../components/Feedback";
import { C, card, inp, btn, tag, label, errMsg } from "../lib/theme";
import { fmtDate } from "../lib/util";
import { uploadPhoto, resizeImage } from "../lib/api";
import { PdfDrawings } from "../components/PdfDrawings";
import { taskState, stepState, stepsOf, stepLabel, withStep, TASK_STATE, operatorLoad, operatorsFor, visibleTasks } from "./taskUtil";

const dayLabel=d=>d?new Date(d+"T00:00").toLocaleDateString("da-DK",{day:"numeric",month:"short"}):"";
const isLate=d=>!!d&&new Date(d+"T23:59").getTime()<Date.now();
const toDay=ms=>{if(!ms)return "";const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const newStepId=()=>Date.now()+Math.floor(Math.random()*1000);

// ── New / edit task ────────────────────────────────────
function TaskForm({task,user,onSave,onCancel}){
  const [title,setTitle]=useState(task?.title||"");
  const [partNumber,setPartNumber]=useState(task?.partNumber||"");
  const [qty,setQty]=useState(task?.qty?String(task.qty):"");
  const [material,setMaterial]=useState(task?.material||"");
  const [note,setNote]=useState(task?.note||"");
  const [wantedBy,setWantedBy]=useState(task?.wantedBy||"");
  const [photo,setPhoto]=useState(task?.photo||null);
  const [drawings,setDrawings]=useState(task?.drawings||[]);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const fileRef=useRef(null);
  const pickPhoto=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>resizeImage(ev.target.result,1600,1200).then(setPhoto); r.readAsDataURL(f);
  };
  const save=async()=>{
    if(!title.trim()){setErr("Skriv hvad der skal laves");return;}
    setBusy(true);
    const now=Date.now();
    const id=task?.id||now;
    // A new picture is uploaded to the server's photo folder; an old one is already a /photos/ link
    const photoUrl=photo&&photo.startsWith("data:")?await uploadPhoto(photo,`task_${id}_${now}.jpg`):photo;
    onSave({
      ...(task||{id,createdAt:now,requesterId:user.id,requesterName:user.name,steps:[]}),
      title:title.trim(),partNumber:partNumber.trim(),qty:parseInt(qty)||0,material:material.trim(),
      note:note.trim(),wantedBy,photo:photoUrl||null,drawings,updatedAt:now,
    });
  };
  return(
    <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{task?"Ret opgave":"Ny opgave"}</div>
      <div style={{marginBottom:12}}>
        <label style={label}>Hvad skal laves? *</label>
        <input style={inp(err)} value={title} onChange={e=>{setTitle(e.target.value);setErr("");}} placeholder="f.eks. Prototype af holder til føler" autoFocus/>
        {err&&<div style={errMsg}>{err}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
        <div><label style={label}>Tegningsnr.</label><input style={inp()} value={partNumber} onChange={e=>setPartNumber(e.target.value)} placeholder="Hvis der er en"/></div>
        <div><label style={label}>Antal stk</label><input style={inp()} inputMode="numeric" value={qty} onChange={e=>setQty(e.target.value.replace(/\D/g,""))} placeholder="1"/></div>
        <div><label style={label}>Materiale</label><input style={inp()} value={material} onChange={e=>setMaterial(e.target.value)} placeholder="f.eks. Alu"/></div>
        <div><label style={label}>Ønskes færdig</label><input type="date" style={inp()} value={wantedBy} onChange={e=>setWantedBy(e.target.value)}/></div>
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Beskrivelse</label>
        <textarea style={{...inp(),minHeight:80,resize:"vertical"}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Mål, tolerancer, hvad det skal bruges til …"/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={label}>Foto / tegning</label>
        <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${photo?C.green:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:photo?10:20,textAlign:"center",cursor:"pointer"}}>
          {photo
            ?<><img src={photo} alt="" style={{maxHeight:140,maxWidth:"100%",borderRadius:6,display:"block",margin:"0 auto 6px"}}/><div style={{fontSize:14,color:C.green}}>Tryk for at skifte</div></>
            :<div style={{fontSize:15,color:C.muted}}><i className="ti ti-camera" style={{fontSize:22}}/><br/>Tag et foto eller vælg et billede</div>}
        </div>
        <input type="file" ref={fileRef} accept="image/*" style={{display:"none"}} onChange={pickPhoto}/>
        {photo&&<button style={{...btn("outline",false,true),marginTop:6}} onClick={()=>setPhoto(null)}><i className="ti ti-x"/> Fjern billede</button>}
      </div>
      <div style={{marginBottom:14}}>
        <label style={label}>Tegninger (PDF)</label>
        <PdfDrawings files={drawings} onChange={setDrawings}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button style={btn("outline",true)} onClick={onCancel}>Annuller</button>
        <button style={btn("success",true)} onClick={save} disabled={busy}><i className="ti ti-check"/> {busy?"Gemmer…":task?"Gem":"Opret opgave"}</button>
      </div>
    </div>
  );
}

// ── The task's details (shared by all three screens) ───
function TaskDetails({t}){
  const facts=[t.partNumber&&`Tegningsnr. ${t.partNumber}`,t.qty?`${t.qty} stk`:"",t.material].filter(Boolean);
  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:700,color:C.text}}>{t.title}</div>
        {facts.length>0&&<div style={{fontSize:14,color:C.text,marginTop:3}}>{facts.join(" · ")}</div>}
        <div style={{fontSize:13,color:C.muted,marginTop:3}}>
          Fra {t.requesterName} · {fmtDate(t.createdAt)}
          {t.wantedBy&&<span style={{color:isLate(t.wantedBy)?C.red:C.muted}}> · Ønskes færdig {dayLabel(t.wantedBy)}</span>}
        </div>
        {t.note&&<div style={{fontSize:15,color:C.text,marginTop:8,whiteSpace:"pre-wrap",background:C.raised,borderRadius:8,padding:"8px 10px"}}>{t.note}</div>}
        {(t.drawings||[]).length>0&&<div style={{marginTop:8}}><PdfDrawings files={t.drawings}/></div>}
      </div>
      {t.photo&&<a href={t.photo} target="_blank" rel="noreferrer" style={{flexShrink:0}}><img src={t.photo} alt="" style={{width:96,height:96,objectFit:"cover",borderRadius:8,border:`1px solid ${C.border}`}}/></a>}
    </div>
  );
}

function StatePill({st,extra}){
  const s=TASK_STATE[st.key];
  return <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:13,letterSpacing:1,textTransform:"uppercase",padding:"4px 10px",borderRadius:20,color:s.color,background:s.color+"22",fontWeight:700,whiteSpace:"nowrap"}}><i className={`ti ti-${s.icon}`}/> {s.label}{extra?` · ${extra}`:""}</span>;
}

// The route as a row of steps: done ✓ · now · later. With editing on (admin),
// steps that haven't started can be moved earlier or removed, and departments added.
function RouteBar({t,jobs,departments,onChange}){
  const steps=stepsOf(t);
  const hasRoute=!!(t.steps&&t.steps.length&&t.steps.some(s=>s.dept));
  const states=steps.map(s=>stepState(s,jobs));
  const cur=states.findIndex(x=>x.key!=="done");
  const notStarted=i=>states[i].key==="waiting"; // no operator, no job
  const setSteps=next=>onChange({...t,steps:next,updatedAt:Date.now()});
  const add=dept=>{
    if(!dept) return;
    // First department on a task without a route: it becomes the first step (keeps any assignment)
    if(!hasRoute&&steps.length===1&&!steps[0].dept) return setSteps([{...steps[0],id:steps[0].id==="main"?newStepId():steps[0].id,dept}]);
    setSteps([...steps,{id:newStepId(),dept,assignedToId:null,assignedToName:"",assignedAt:null,jobId:null,doneAt:null,doneBy:""}]);
  };
  const remove=i=>setSteps(steps.filter((_,k)=>k!==i));
  const moveUp=i=>{const n=[...steps];[n[i-1],n[i]]=[n[i],n[i-1]];setSteps(n);};
  if(!onChange&&!hasRoute) return null;
  return(
    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6,marginTop:10}}>
      {onChange&&<span style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginRight:2}}><i className="ti ti-route"/> Rute</span>}
      {hasRoute&&steps.map((s,i)=>{
        const k=states[i].key, isCur=i===cur;
        const color=k==="done"?C.green:isCur?TASK_STATE[k].color:C.muted;
        return(
          <span key={s.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
            {i>0&&<i className="ti ti-chevron-right" style={{color:C.muted,fontSize:14}}/>}
            <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:14,padding:"5px 10px",borderRadius:20,border:`1px solid ${isCur?color:C.border}`,color,background:isCur?color+"18":"transparent",fontWeight:isCur?700:400}}>
              {k==="done"?<i className="ti ti-check"/>:<span>{i+1}.</span>} {s.dept||"Uden afdeling"}
              {k==="done"&&states[i].doneBy&&<span style={{color:C.muted,fontWeight:400}}>· {states[i].doneBy}</span>}
              {onChange&&notStarted(i)&&i>0&&notStarted(i-1)&&<button title="Flyt frem" onClick={()=>moveUp(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"0 2px",fontSize:16}}><i className="ti ti-arrow-left"/></button>}
              {onChange&&notStarted(i)&&<button title="Fjern trin" onClick={()=>remove(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",padding:"0 2px",fontSize:16}}><i className="ti ti-x"/></button>}
            </span>
          </span>
        );
      })}
      {!hasRoute&&onChange&&<span style={{fontSize:14,color:C.muted}}>Ingen afdelinger valgt endnu</span>}
      {onChange&&(departments||[]).length>0&&(
        <select style={{...inp(),width:"auto",minHeight:40,padding:"6px 10px",fontSize:14}} value="" onChange={e=>add(e.target.value)}>
          <option value="">+ Tilføj afdeling</option>
          {departments.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
      )}
    </div>
  );
}

// Small yes/no step for deleting
function ConfirmDelete({onYes,onNo}){
  return(
    <div style={{marginTop:10,padding:12,borderRadius:8,background:`${C.red}10`,border:`1px solid ${C.red}40`}}>
      <div style={{fontSize:15,color:C.text,fontWeight:600,marginBottom:10}}>Slet opgaven?</div>
      <div style={{display:"flex",gap:8}}>
        <button style={{...btn("danger",true,true),flex:1}} onClick={onYes}><i className="ti ti-trash"/> Ja, slet</button>
        <button style={btn("outline",false,true)} onClick={onNo}>Annuller</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// BESTILLER — own tasks only, no time information
// ═══════════════════════════════════════════════════════
export function RequesterTasksTab({user,tasks,setTasks,jobs,saveNow}){
  const [editing,setEditing]=useState(null); // null | "new" | task
  const [deleteId,setDeleteId]=useState(null);
  const [showDone,setShowDone]=useState(false);
  const mine=visibleTasks(tasks).filter(t=>t.requesterId===user.id).map(t=>({t,st:taskState(t,jobs)})).sort((a,b)=>b.t.createdAt-a.t.createdAt);
  const open=mine.filter(x=>x.st.key!=="done"), done=mine.filter(x=>x.st.key==="done");
  const save=t=>{
    setTasks(prev=>prev.some(x=>x.id===t.id)?prev.map(x=>x.id===t.id?t:x):[t,...prev]);
    saveNow();setEditing(null);
    notify(editing==="new"?"Opgave oprettet":"Opgave gemt");
  };
  const remove=id=>{setTasks(prev=>prev.map(x=>x.id===id?{...x,deleted:true,updatedAt:Date.now()}:x));saveNow();setDeleteId(null);notify("Opgave slettet","warn");};
  const row=({t,st})=>{
    const where=stepLabel(st);
    const extra=st.key==="done"?dayLabel(toDay(st.doneAt))
      :[where,st.key==="assigned"?st.step.assignedToName:st.key==="running"?st.job.operatorName:""].filter(Boolean).join(" · ");
    const untouched=st.index===0&&st.key==="waiting"; // nobody has it yet — still his to change
    return(
      <div key={t.id} style={{...card(st.key==="done"?null:TASK_STATE[st.key].color),opacity:st.key==="done"?0.7:1}}>
        <div style={{marginBottom:10}}><StatePill st={st} extra={extra}/></div>
        <TaskDetails t={t}/>
        <RouteBar t={t} jobs={jobs}/>
        {untouched&&deleteId!==t.id&&(
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button style={btn("outline",false,true)} onClick={()=>setEditing(t)}><i className="ti ti-pencil"/> Ret</button>
            <button style={btn("outline",false,true)} onClick={()=>setDeleteId(t.id)}><i className="ti ti-trash"/> Slet</button>
          </div>
        )}
        {deleteId===t.id&&<ConfirmDelete onYes={()=>remove(t.id)} onNo={()=>setDeleteId(null)}/>}
      </div>
    );
  };
  return(
    <div style={{padding:"14px 16px",maxWidth:900,margin:"0 auto"}}>
      {editing
        ?<TaskForm task={editing==="new"?null:editing} user={user} onSave={save} onCancel={()=>setEditing(null)}/>
        :<button style={{...btn("primary",true),marginBottom:16,fontSize:17}} onClick={()=>setEditing("new")}><i className="ti ti-plus"/> Ny opgave</button>}
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Mine opgaver · {open.length}</div>
      {open.length===0&&<div style={{...card(),color:C.muted,textAlign:"center",fontSize:15}}>Ingen åbne opgaver</div>}
      {open.map(row)}
      {done.length>0&&(
        <>
          <button style={{...tag(showDone),width:"100%",justifyContent:"space-between",marginTop:10}} onClick={()=>setShowDone(s=>!s)}>
            <span><i className="ti ti-circle-check"/> Færdige · {done.length}</span><i className={`ti ti-chevron-${showDone?"up":"down"}`}/>
          </button>
          {showDone&&<div style={{marginTop:8}}>{done.map(row)}</div>}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADMIN — all tasks; set the route, give each step to an operator, finish
// ═══════════════════════════════════════════════════════
export function AdminTasksTab({user,users,tasks,setTasks,jobs,departments,setCompleteId,saveNow,focusTaskId,setFocusTaskId}){
  const [view,setView]=useState("waiting");
  // Opened from the admin search: show the right group, scroll to the task and flash it
  useEffect(()=>{
    if(!focusTaskId) return;
    const t=(tasks||[]).find(x=>x.id===focusTaskId);
    if(t){const k=taskState(t,jobs).key;setView(k==="waiting"?"waiting":k==="done"?"done":"active");}
    const tm=setTimeout(()=>{
      const el=document.querySelector(`[data-task-id="${focusTaskId}"]`);
      if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.animate([{boxShadow:`0 0 0 4px ${C.amber}`},{boxShadow:"0 0 0 0 transparent"}],{duration:2400});}
      setFocusTaskId&&setFocusTaskId(null);
    },150);
    return()=>clearTimeout(tm);
  },[focusTaskId]);
  const [editing,setEditing]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const operators=users.filter(u=>u.role==="operator"&&u.active&&!u.removed);
  const all=visibleTasks(tasks).map(t=>({t,st:taskState(t,jobs)}));
  const groups={
    waiting:all.filter(x=>x.st.key==="waiting").sort((a,b)=>(a.t.wantedBy||"9999").localeCompare(b.t.wantedBy||"9999")||a.t.createdAt-b.t.createdAt),
    active:all.filter(x=>x.st.key==="assigned"||x.st.key==="running").sort((a,b)=>a.t.createdAt-b.t.createdAt),
    done:all.filter(x=>x.st.key==="done").sort((a,b)=>(b.st.doneAt||0)-(a.st.doneAt||0)),
  };
  const put=(t,msg)=>{setTasks(prev=>prev.map(x=>x.id===t.id?t:x));saveNow();if(msg)notify(msg);};
  const assign=(t,st,opId)=>{
    const op=operators.find(u=>String(u.id)===String(opId));
    if(!op) return;
    put(withStep(t,st.step.id,{assignedToId:op.id,assignedToName:op.name,assignedAt:Date.now()}),`${st.step.dept||"Opgaven"} er givet til ${op.name}`);
  };
  const save=t=>{
    setTasks(prev=>prev.some(x=>x.id===t.id)?prev.map(x=>x.id===t.id?t:x):[t,...prev]);
    saveNow();setEditing(null);notify("Opgave gemt");
  };
  const opLabel=u=>{const n=operatorLoad(u,jobs);return `${u.name} — ${n?`${n} job i gang`:"ledig"}`;};

  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:12}}>
        <button style={tag(view==="waiting")} onClick={()=>setView("waiting")}><i className="ti ti-hourglass"/> Venter · {groups.waiting.length}</button>
        <button style={tag(view==="active")}  onClick={()=>setView("active")}><i className="ti ti-user-check"/> Tildelt · {groups.active.length}</button>
        <button style={tag(view==="done")}    onClick={()=>setView("done")}><i className="ti ti-circle-check"/> Færdige · {groups.done.length}</button>
        <div style={{flex:1}}/>
        {!editing&&<button style={btn("primary",false,true)} onClick={()=>setEditing("new")}><i className="ti ti-plus"/> Ny opgave</button>}
      </div>

      {/* Who is free right now */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
        {operators.map(u=>{const n=operatorLoad(u,jobs);return(
          <span key={u.id} style={{fontSize:13,padding:"5px 10px",borderRadius:20,border:`1px solid ${n?C.border:C.green}`,color:n?C.muted:C.green,background:n?"transparent":"rgba(39,174,96,.1)"}}>
            <i className={`ti ti-${n?"tool":"circle-check"}`}/> {u.name} · {n?`${n} job`:"ledig"}
          </span>
        );})}
      </div>

      {editing&&<TaskForm task={editing==="new"?null:editing} user={user} onSave={save} onCancel={()=>setEditing(null)}/>}

      {groups[view].length===0&&<div style={{...card(),color:C.muted,textAlign:"center",fontSize:15}}>{view==="waiting"?"Ingen opgaver venter":view==="active"?"Ingen opgaver er tildelt":"Ingen færdige opgaver endnu"}</div>}
      {groups[view].map(({t,st})=>{
        const where=stepLabel(st);
        const multi=st.steps.length>1;
        const stepOps=operatorsFor(operators,st.step.dept);
        return(
        <div key={t.id} data-task-id={t.id} style={{...card(st.key==="done"?null:TASK_STATE[st.key].color)}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
            <StatePill st={st}/>
            {where&&st.key!=="done"&&<span style={{fontSize:15,color:C.text,fontWeight:700}}>{where}</span>}
            {st.key==="assigned"&&<span style={{fontSize:15,color:C.text}}>til <b>{st.step.assignedToName}</b> — ikke startet endnu</span>}
            {st.key==="running"&&<span style={{fontSize:15,color:C.text}}><b>{st.job.operatorName}</b> på {st.job.machine}</span>}
            {st.key==="done"&&<span style={{fontSize:15,color:C.muted}}>{fmtDate(st.doneAt)}{st.doneBy?` · ${st.doneBy}`:""}</span>}
          </div>
          <TaskDetails t={t}/>
          <RouteBar t={t} jobs={jobs} departments={departments} onChange={st.key==="done"?null:nt=>put(nt)}/>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12,alignItems:"center"}}>
            {(st.key==="waiting"||st.key==="assigned")&&(
              <select style={{...inp(),width:"auto",minWidth:240,minHeight:44}} value="" onChange={e=>assign(t,st,e.target.value)}>
                <option value="">{st.key==="waiting"?`Giv ${st.step.dept?st.step.dept.toLowerCase():"opgaven"} til …`:"Giv til en anden …"}</option>
                {stepOps.filter(u=>u.id!==st.step.assignedToId).map(u=><option key={u.id} value={u.id}>{opLabel(u)}</option>)}
              </select>
            )}
            {st.key==="assigned"&&<button style={btn("outline",false,true)} onClick={()=>put(withStep(t,st.step.id,{assignedToId:null,assignedToName:"",assignedAt:null}),"Tildeling fjernet")}><i className="ti ti-user-minus"/> Fjern tildeling</button>}
            {st.key==="running"&&<button style={btn("success",false,true)} onClick={()=>setCompleteId(st.job.id)}><i className="ti ti-flag"/> Afslut job</button>}
            {(st.key==="waiting"||st.key==="assigned")&&<button style={btn("success",false,true)} onClick={()=>put(withStep(t,st.step.id,{doneAt:Date.now(),doneBy:user.name}),multi&&st.index<st.steps.length-1?`${st.step.dept||"Trin"} markeret færdig — næste trin venter`:"Opgave markeret som færdig")}><i className="ti ti-check"/> {multi?"Marker trin færdig":"Marker færdig"}</button>}
            {st.key==="done"&&<button style={btn("outline",false,true)} onClick={()=>put(withStep(t,st.step.id,{doneAt:null,doneBy:"",jobId:null}),"Opgave genåbnet")}><i className="ti ti-arrow-back-up"/> Genåbn{multi?" sidste trin":""}</button>}
            <div style={{flex:1}}/>
            {st.key!=="running"&&<button style={btn("outline",false,true)} onClick={()=>setEditing(t)}><i className="ti ti-pencil"/></button>}
            {st.key!=="running"&&<button style={btn("outline",false,true)} onClick={()=>setDeleteId(deleteId===t.id?null:t.id)}><i className="ti ti-trash"/></button>}
          </div>
          {deleteId===t.id&&<ConfirmDelete onYes={()=>{put({...t,deleted:true,updatedAt:Date.now()});setDeleteId(null);notify("Opgave slettet","warn");}} onNo={()=>setDeleteId(null)}/>}
        </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// OPERATOR — task steps given to me, shown on top of "Nyt job"
// ═══════════════════════════════════════════════════════
export function MyTasksList({user,tasks,jobs,activeTaskId,onPick}){
  const mine=visibleTasks(tasks).map(t=>({t,st:taskState(t,jobs)})).filter(({st})=>st.key==="assigned"&&st.step.assignedToId===user.id);
  if(!mine.length) return null;
  return(
    <div style={{marginBottom:18}}>
      <div style={{fontSize:13,color:C.blue,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}><i className="ti ti-clipboard-check"/> Opgaver til dig · {mine.length}</div>
      {mine.map(({t,st})=>(
        <div key={t.id} style={{...card(C.blue),border:`1px solid ${activeTaskId===t.id?C.blue:C.border}`}}>
          {stepLabel(st)&&<div style={{fontSize:13,color:C.blue,letterSpacing:1,textTransform:"uppercase",fontWeight:700,marginBottom:6}}>{stepLabel(st)}</div>}
          <TaskDetails t={t}/>
          <RouteBar t={t} jobs={jobs}/>
          <button style={{...btn(activeTaskId===t.id?"outline":"blue",true),marginTop:10}} onClick={()=>onPick(activeTaskId===t.id?null:{task:t,step:st.step,label:stepLabel(st)})}>
            {activeTaskId===t.id?<><i className="ti ti-x"/> Fortryd</>:<><i className="ti ti-arrow-down"/> Brug opgaven — vælg maskine nedenfor</>}
          </button>
        </div>
      ))}
    </div>
  );
}
