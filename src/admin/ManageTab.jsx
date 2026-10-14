import { useState, useEffect } from "react";
import { ManageCabinets } from "./ManageCabinets";
import { ManageOperators, ManageMachines } from "./ManagePeople";
import { WorkHoursSettings, ManageEfficiencyGoals, ManageDepartments } from "./ManageSettings";
import { C, btn, tag } from "../lib/theme";
import { ManageTools } from "../tools/ManageTools";

// ═══════════════════════════════════════════════════════
// DELEGATE JOBS — reassign active jobs when operator is away
// ═══════════════════════════════════════════════════════
export function DelegateJobs({users,jobs,setJobs,saveNow}){
  const operators=users.filter(u=>u.active&&!u.removed&&u.role==="operator");
  const [fromId,setFromId]=useState("");
  // assignments: { [jobId]: operatorId string }
  const [assignments,setAssignments]=useState({});
  const [delegated,setDelegated]=useState([]); // summary after confirm

  const fromUser=operators.find(u=>String(u.id)===fromId);
  const activeJobs=fromUser?jobs.filter(j=>j.operatorId===fromUser.id&&j.status!=="done"&&!j.deleted):[];

  const setAssign=(jobId,toId)=>setAssignments(prev=>({...prev,[jobId]:toId}));

  const readyJobs=activeJobs.filter(j=>assignments[j.id]);
  const canConfirm=readyJobs.length>0;

  const confirm=()=>{
    const now=Date.now();
    const summary=[];
    setJobs(prev=>prev.map(j=>{
      const toId=assignments[j.id];
      if(!toId) return j;
      const toUser=operators.find(u=>String(u.id)===toId);
      if(!toUser) return j;
      summary.push({job:j.job||j.partNumber||"Job",machine:j.machine||"",to:toUser.name});
      return{...j,operatorId:toUser.id,operatorName:toUser.name,lastModifiedAt:now};
    }));
    saveNow&&saveNow();
    setDelegated(summary);
  };

  const reset=()=>{setFromId("");setAssignments({});setDelegated([]);};

  const selStyle={background:"#1a2535",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:15,padding:"4px 8px",outline:"none"};

  if(delegated.length>0) return(
    <div style={{maxWidth:480}}>
      <div style={{color:C.green,fontWeight:700,fontSize:16,marginBottom:12}}><i className="ti ti-circle-check"/> {delegated.length} job uddelegeret</div>
      {delegated.map((d,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:15}}>
          <span style={{color:C.text,fontWeight:600}}>{d.job}</span>
          <span style={{color:C.muted}}>{d.machine}</span>
          <span style={{color:C.amber}}>→ {d.to}</span>
        </div>
      ))}
      <button style={{...btn("outline"),marginTop:16}} onClick={reset}>Uddeleger igen</button>
    </div>
  );

  return(
    <div style={{maxWidth:560}}>
      <div style={{color:C.muted,fontSize:15,marginBottom:16,lineHeight:1.6}}>
        Vælg den fraværende operatør, og giv hvert job til den der skal overtage det. Lad et job stå uden for at holde det i bero.
      </div>

      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:6}}>FRAVÆRENDE OPERATØR</div>
        <select style={{...selStyle,width:220,fontSize:16,padding:"6px 10px"}} value={fromId} onChange={e=>{setFromId(e.target.value);setAssignments({});}}>
          <option value="">— Vælg operatør —</option>
          {operators.map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
        </select>
      </div>

      {fromUser&&activeJobs.length===0&&(
        <div style={{color:C.muted,fontSize:15}}>{fromUser.name} har ingen aktive job.</div>
      )}

      {fromUser&&activeJobs.length>0&&(<>
        <div style={{fontSize:14,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:8}}>
          FORDEL JOB — {readyJobs.length} af {activeJobs.length} fordelt
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
          {activeJobs.map(j=>{
            const assigned=assignments[j.id]||"";
            return(
              <div key={j.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center",background:"#1a2535",border:`1px solid ${assigned?C.amber:C.border}`,borderRadius:8,padding:"8px 12px"}}>
                <div>
                  <div style={{color:C.text,fontWeight:600,fontSize:16}}>{j.job||j.partNumber||"Job"}</div>
                  <div style={{color:C.muted,fontSize:14}}>{j.machine||""}{j.op?` · Op ${j.op}`:""}</div>
                </div>
                <select style={selStyle} value={assigned} onChange={e=>setAssign(j.id,e.target.value)}>
                  <option value="">— Hold i bero —</option>
                  {operators.filter(u=>u.id!==fromUser.id).map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
                </select>
                {assigned&&<i className="ti ti-check" style={{color:C.green,fontSize:16}}/>}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button style={{...btn("filled"),background:canConfirm?C.amber:"#333",color:canConfirm?"#000":C.muted,fontWeight:700,cursor:canConfirm?"pointer":"default"}} onClick={canConfirm?confirm:undefined}>
            <i className="ti ti-arrows-exchange"/> Bekræft {readyJobs.length} uddelegering{readyJobs.length!==1?"er":""}
          </button>
          {activeJobs.length>1&&(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14,color:C.muted,whiteSpace:"nowrap"}}>Giv alle til:</span>
              <select style={{...selStyle,fontSize:15,padding:"4px 8px"}} defaultValue="" onChange={e=>{
                const toId=e.target.value;
                if(!toId) return;
                const all={};activeJobs.forEach(j=>{all[j.id]=toId;});
                setAssignments(all);
                e.target.value="";
              }}>
                <option value="">— Vælg operatør —</option>
                {operators.filter(u=>u.id!==fromUser.id).map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════
export function ManageTab({users,setUsers,machines,setMachines,workHours,setWorkHours,departments,setDepartments,saveNow,efficiencyGoals,setEfficiencyGoals,jobs,setJobs}){
  const [view,setView]=useState("operators");
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button style={tag(view==="operators")}   onClick={()=>setView("operators")}  ><i className="ti ti-users"/> Operatører</button>
        <button style={tag(view==="machines")}    onClick={()=>setView("machines")}   ><i className="ti ti-robot"/> Maskiner</button>
        <button style={tag(view==="departments")} onClick={()=>setView("departments")}><i className="ti ti-tag"/> Afdelinger</button>
        <button style={tag(view==="goals")}       onClick={()=>setView("goals")}      ><i className="ti ti-target"/> Mål</button>
        <button style={tag(view==="settings")}    onClick={()=>setView("settings")}   ><i className="ti ti-adjustments"/> Indstillinger</button>
        <button style={tag(view==="delegate")}    onClick={()=>setView("delegate")}   ><i className="ti ti-arrows-exchange"/> Uddeleger</button>
      </div>
      {view==="operators"  &&<ManageOperators   users={users} setUsers={setUsers} machines={machines} departments={departments} jobs={jobs} setJobs={setJobs} saveNow={saveNow}/>}
      {view==="machines"   &&<ManageMachines    machines={machines} setMachines={setMachines} departments={departments} jobs={jobs} saveNow={saveNow}/>}
      {view==="departments"&&<ManageDepartments departments={departments} setDepartments={setDepartments} saveNow={saveNow}/>}
      {view==="goals"      &&<ManageEfficiencyGoals efficiencyGoals={efficiencyGoals} setEfficiencyGoals={setEfficiencyGoals} machines={machines} departments={departments} saveNow={saveNow}/>}
      {view==="settings"   &&<WorkHoursSettings workHours={workHours} setWorkHours={setWorkHours} saveNow={saveNow}/>}
      {view==="delegate"   &&<DelegateJobs      users={users} jobs={jobs} setJobs={setJobs} saveNow={saveNow}/>}
    </div>
  );
}

export function AdminToolsTab({tools,setTools,toolLog,setToolLog,cabinets,setCabinets,departments,users,machines,saveNow,focusToolId,setFocusToolId}){
  const [view,setView]=useState("tools");
  useEffect(()=>{if(focusToolId) setView("tools");},[focusToolId]);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button style={tag(view==="tools")}    onClick={()=>setView("tools")}   ><i className="ti ti-package"/> Værktøj</button>
        <button style={tag(view==="cabinets")} onClick={()=>setView("cabinets")}><i className="ti ti-archive"/> Skabe</button>
      </div>
      {view==="tools"    &&<ManageTools    tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} saveNow={saveNow} users={users} machines={machines} cabinets={cabinets} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {view==="cabinets" &&<ManageCabinets cabinets={cabinets} setCabinets={setCabinets} departments={departments} saveNow={saveNow}/>}
    </div>
  );
}
