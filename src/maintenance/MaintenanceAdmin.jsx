import { useState } from "react";
import { notify } from "../components/Feedback";
import { C, card, inp, sel, btn, tag, label, errMsg, th, td } from "../lib/theme";
import { UNITS, intervalLabel, visibleMaint, machineMaint, MAINT_STATE } from "./maintUtil";
import { MaintChecklist, maintSummary } from "./MaintChecklist";

const dayInput=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};

// New / edit a maintenance point. A new one can be put on several machines at once.
function MaintForm({task,machine,machines,onSave,onCancel}){
  const [title,setTitle]=useState(task?.title||"");
  const [description,setDescription]=useState(task?.description||"");
  const [every,setEvery]=useState(String(task?.every||1));
  const [unit,setUnit]=useState(task?.unit||"day");
  const [on,setOn]=useState(task?[task.machine]:[machine]);
  const [err,setErr]=useState("");
  const save=()=>{
    if(!title.trim()){setErr("Skriv hvad der skal tjekkes");return;}
    const n=parseInt(every,10);
    if(!n||n<1){setErr("Hvor ofte skal være mindst 1");return;}
    if(!on.length){setErr("Vælg mindst én maskine");return;}
    onSave({title:title.trim(),description:description.trim(),every:n,unit},on);
  };
  return(
    <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:12}}>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{task?"Ret vedligeholdspunkt":"Nyt vedligeholdspunkt"}</div>
      <div style={{marginBottom:10}}><label style={label}>Hvad skal tjekkes? *</label><input autoFocus style={inp(!!err&&!title.trim())} value={title} onChange={e=>{setTitle(e.target.value);setErr("");}} placeholder="f.eks. Tjek oliestand"/></div>
      <div style={{marginBottom:10}}><label style={label}>Beskrivelse / fremgangsmåde</label><textarea style={{...inp(),minHeight:70,resize:"vertical"}} value={description} onChange={e=>setDescription(e.target.value)} placeholder="f.eks. Oliestand skal være mellem min og max. Fyld op med Mobil Vactra 2."/></div>
      <label style={label}>Hvor ofte</label>
      <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:15,color:C.text}}>Hver</span>
        <input inputMode="numeric" style={{...inp(),width:90,textAlign:"center"}} value={every} onChange={e=>{setEvery(e.target.value.replace(/\D/g,""));setErr("");}}/>
        <select style={{...sel(),width:"auto",minWidth:150}} value={unit} onChange={e=>setUnit(e.target.value)}>{UNITS.map(([k,l])=><option key={k} value={k}>{l.toLowerCase()}</option>)}</select>
        <span style={{fontSize:14,color:C.muted}}>= {intervalLabel({every:parseInt(every,10)||1,unit})}</span>
      </div>
      {unit==="hours"&&<div style={{fontSize:13,color:C.muted,marginBottom:10}}>Driftstimer = maskinens produktionstid i ShopTrack siden punktet sidst blev udført.</div>}
      {!task&&(
        <>
          <label style={label}>Gælder for</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {machines.map(m=>{const a=on.includes(m.name);return(
              <button key={m.id} style={tag(a)} onClick={()=>{setOn(p=>a?p.filter(x=>x!==m.name):[...p,m.name]);setErr("");}}>{a?<i className="ti ti-check"/>:null} {m.name}</button>
            );})}
          </div>
        </>
      )}
      {err&&<div style={errMsg}>{err}</div>}
      <div style={{display:"flex",gap:8,marginTop:6}}>
        <button style={btn("outline",true)} onClick={onCancel}>Annuller</button>
        <button style={btn("success",true)} onClick={save}><i className="ti ti-check"/> {task?"Gem":on.length>1?`Opret på ${on.length} maskiner`:"Opret"}</button>
      </div>
    </div>
  );
}

export function MaintenanceAdmin({user,machines,jobs,maintTasks,setMaintTasks,maintLog,setMaintLog,saveNow,reportIssue}){
  const active=machines.filter(m=>m.active&&!m.removed);
  const [view,setView]=useState("machine");
  const [machine,setMachine]=useState(active[0]?.name||"");
  const [editing,setEditing]=useState(null); // null | "new" | task
  const [deleteId,setDeleteId]=useState(null);
  const [tick,setTick]=useState(false);
  const putTasks=fn=>{setMaintTasks(fn);saveNow&&saveNow();};
  const items=machineMaint(machine,maintTasks,maintLog,jobs);
  const paused=visibleMaint(maintTasks).filter(t=>t.machine===machine&&t.active===false);

  // History filters
  const monthStart=new Date();monthStart.setDate(1);
  const [hMachine,setHMachine]=useState("all");
  const [from,setFrom]=useState(dayInput(monthStart));
  const [to,setTo]=useState(dayInput(Date.now()));
  const fromMs=new Date(from+"T00:00:00").getTime(), toMs=new Date(to+"T23:59:59").getTime();
  const history=(maintLog||[]).filter(e=>(hMachine==="all"||e.machine===hMachine)&&e.doneAt>=fromMs&&e.doneAt<=toMs).sort((a,b)=>b.doneAt-a.doneAt);
  const exportCsv=()=>{
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const rows=[["Dato","Tid","Maskine","Vedligeholdspunkt","Udført af","Resultat","Note"],
      ...history.map(e=>{const d=new Date(e.doneAt);return [d.toLocaleDateString("da-DK"),d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"}),e.machine,e.title,e.by,e.ok?"OK":"Problem",e.note];})];
    const blob=new Blob(["﻿"+rows.map(r=>r.map(esc).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Vedligehold ${from} til ${to}${hMachine!=="all"?` ${hMachine}`:""}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button style={tag(view==="machine")} onClick={()=>setView("machine")}><i className="ti ti-tool"/> Punkter pr. maskine</button>
        <button style={tag(view==="history")} onClick={()=>setView("history")}><i className="ti ti-history"/> Historik (ISO)</button>
      </div>

      {view==="machine"&&<>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {active.map(m=>{const s=maintSummary(machineMaint(m.name,maintTasks,maintLog,jobs));return(
            <button key={m.id} style={tag(machine===m.name)} onClick={()=>{setMachine(m.name);setEditing(null);setTick(false);}}>
              {m.name}{s.total>0&&<span style={{marginLeft:6,fontSize:12,fontWeight:700,color:machine===m.name?"#1a1a1a":s.due?C.red:C.green}}>{s.due?`${s.due} skal gøres`:"✓"}</span>}
            </button>
          );})}
        </div>
        {editing&&<MaintForm key={editing==="new"?"new":editing.id} task={editing==="new"?null:editing} machine={machine} machines={active}
          onCancel={()=>setEditing(null)}
          onSave={(data,on)=>{
            const now=Date.now();
            if(editing==="new"){
              putTasks(prev=>[...prev,...on.map((m,i)=>({id:now+i,machine:m,...data,active:true,createdAt:now,updatedAt:now}))]);
              notify(on.length>1?`Vedligeholdspunkt oprettet på ${on.length} maskiner`:"Vedligeholdspunkt oprettet");
            }else{
              putTasks(prev=>prev.map(t=>t.id===editing.id?{...t,...data,updatedAt:now}:t));
              notify("Vedligeholdspunkt gemt");
            }
            setEditing(null);
          }}/>}
        <div style={card()}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            <div style={{fontSize:16,color:C.text,fontWeight:700,flex:1}}>{machine} <span style={{fontSize:14,color:C.muted,fontWeight:400}}>· {items.length} punkt{items.length!==1?"er":""}</span></div>
            {!editing&&<button style={btn("primary",false,true)} onClick={()=>setEditing("new")}><i className="ti ti-plus"/> Nyt punkt</button>}
            {items.length>0&&<button style={btn(tick?"blue":"outline",false,true)} onClick={()=>setTick(x=>!x)}><i className="ti ti-checkbox"/> {tick?"Luk afkrydsning":"Afkryds selv"}</button>}
          </div>
          {tick
            ?<MaintChecklist machine={machine} tasks={maintTasks} log={maintLog} jobs={jobs} user={user} setMaintLog={setMaintLog} saveNow={saveNow} onReportFault={(m,txt)=>reportIssue(m,"repair",txt)}/>
            :<>
              {!items.length&&!paused.length&&<div style={{fontSize:15,color:C.muted,padding:"8px 0"}}>Ingen vedligeholdspunkter endnu. Tryk "Nyt punkt" for at lave det første.</div>}
              {[...items,...paused.map(t=>({t,st:null}))].map(({t,st})=>{
                const s=st?MAINT_STATE[st.state]:null;
                return(
                  <div key={t.id} style={{borderTop:`1px solid ${C.border}`,padding:"10px 0",opacity:st?1:.5}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <i className={`ti ti-${s?s.icon:"player-pause"}`} style={{fontSize:22,color:s?s.color:C.muted,marginTop:2}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:16,color:C.text,fontWeight:700}}>{t.title}{!st&&<span style={{fontSize:13,color:C.muted,fontWeight:400}}> · sat på pause</span>}</div>
                        {t.description&&<div style={{fontSize:14,color:C.muted,marginTop:2,whiteSpace:"pre-wrap"}}>{t.description}</div>}
                        <div style={{fontSize:13,color:C.muted,marginTop:3}}>{intervalLabel(t)}{st?.last?` · sidst ${new Date(st.last.doneAt).toLocaleString("da-DK",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} af ${st.last.by}`:st?" · aldrig udført":""}</div>
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button title="Ret" style={btn("outline",false,true)} onClick={()=>setEditing(t)}><i className="ti ti-pencil"/></button>
                        <button title={st?"Sæt på pause":"Genoptag"} style={btn("outline",false,true)} onClick={()=>putTasks(prev=>prev.map(x=>x.id===t.id?{...x,active:!st,updatedAt:Date.now()}:x))}><i className={`ti ti-player-${st?"pause":"play"}`}/></button>
                        <button title="Slet" style={btn("outline",false,true)} onClick={()=>setDeleteId(deleteId===t.id?null:t.id)}><i className="ti ti-trash"/></button>
                      </div>
                    </div>
                    {deleteId===t.id&&(
                      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,marginLeft:32,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,color:C.text,flex:1}}>Slet punktet? Historikken bevares.</span>
                        <button style={btn("danger",false,true)} onClick={()=>{putTasks(prev=>prev.map(x=>x.id===t.id?{...x,deleted:true,updatedAt:Date.now()}:x));setDeleteId(null);notify("Vedligeholdspunkt slettet","warn");}}>Ja, slet</button>
                        <button style={btn("outline",false,true)} onClick={()=>setDeleteId(null)}>Annuller</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>}
        </div>
      </>}

      {view==="history"&&<>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:12}}>
          <div><label style={label}>Maskine</label><select style={{...sel(),width:"auto",minWidth:160}} value={hMachine} onChange={e=>setHMachine(e.target.value)}><option value="all">Alle maskiner</option>{machines.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select></div>
          <div><label style={label}>Fra</label><input type="date" style={{...inp(),width:"auto"}} value={from} onChange={e=>setFrom(e.target.value)}/></div>
          <div><label style={label}>Til</label><input type="date" style={{...inp(),width:"auto"}} value={to} onChange={e=>setTo(e.target.value)}/></div>
          <div style={{flex:1}}/>
          <button style={btn("primary",false,true)} disabled={!history.length} onClick={exportCsv}><i className="ti ti-download"/> Eksporter til Excel (CSV)</button>
        </div>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>{history.length} registrering{history.length!==1?"er":""} · {history.filter(e=>!e.ok).length} med problem</div>
        {!history.length?<div style={{...card(),color:C.muted,textAlign:"center"}}>Ingen registreringer i perioden.</div>:
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Dato","Maskine","Vedligeholdspunkt","Udført af","Resultat","Note"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{history.map(e=>(
            <tr key={e.id}>
              <td style={{...td,whiteSpace:"nowrap"}}>{new Date(e.doneAt).toLocaleString("da-DK",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
              <td style={td}>{e.machine}</td>
              <td style={td}>{e.title}</td>
              <td style={td}>{e.by}</td>
              <td style={{...td,color:e.ok?C.green:C.red,fontWeight:700}}>{e.ok?"OK":"Problem"}</td>
              <td style={td}>{e.note}</td>
            </tr>
          ))}</tbody>
        </table></div>}
        <div style={{fontSize:12,color:C.muted,marginTop:10}}>Registreringer kan ikke slettes eller ændres — de er dokumentationen for vedligeholdet.</div>
      </>}
    </div>
  );
}
