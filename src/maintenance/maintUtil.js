import { liveTime } from "../lib/util";

// ═══════════════════════════════════════════════════════
// MAINTENANCE (Vedligehold, ISO 9001) — admin sets what to check on each machine
// and how often; operators tick it off; every tick is kept as a record.
//   maintTasks: [{id,machine,title,description,every,unit,active,createdAt,updatedAt,deleted}]
//     unit: "day" | "week" | "month" | "hours" (machine production hours)
//   maintLog:   [{id,taskId,machine,title,doneAt,by,ok,note,updatedAt}] — never removed
// Both are merged by id on the server (newest updatedAt wins), like planning orders.
// ═══════════════════════════════════════════════════════
const DAY=86400000;
export const UNITS=[["day","Dage"],["week","Uger"],["month","Måneder"],["hours","Driftstimer"]];

export function intervalLabel(t){
  const n=Number(t.every)||1;
  if(t.unit==="hours") return `Hver ${n}. driftstime`;
  if(t.unit==="week") return n===1?"Hver uge":`Hver ${n}. uge`;
  if(t.unit==="month") return n===1?"Hver måned":`Hver ${n}. måned`;
  return n===1?"Hver dag":`Hver ${n}. dag`;
}

export const visibleMaint=list=>(list||[]).filter(x=>!x.deleted);

// Latest record for a task
export function lastDone(task,log){
  let last=null;
  for(const e of log||[]) if(e.taskId===task.id&&(!last||e.doneAt>last.doneAt)) last=e;
  return last;
}

// Production seconds on a machine since a moment (jobs still running count in full —
// close enough for "every 500 hours")
export function machineRunSecSince(jobs,machine,since){
  return (jobs||[]).filter(j=>j.machine===machine&&!j.deleted&&(j.status!=="done"||(j.completedAt||0)>since)&&(j.createdAt||0)<=Date.now())
    .reduce((s,j)=>{const lt=liveTime(j);return s+lt.run+lt.run2;},0);
}

// ok / soon / due — and when the next check falls due
export function maintStatus(task,log,jobs,now=Date.now()){
  const last=lastDone(task,log);
  const n=Math.max(1,Number(task.every)||1);
  if(task.unit==="hours"){
    const used=machineRunSecSince(jobs,task.machine,last?last.doneAt:task.createdAt)/3600;
    const state=!last||used>=n?"due":used>=n*0.9?"soon":"ok";
    return {state,last,used,label:`${Math.floor(used)} af ${n} driftstimer brugt`};
  }
  // Calendar: due from the start of the day the interval runs out (never done → due now)
  let next;
  if(!last) next=new Date(task.createdAt||now).setHours(0,0,0,0);
  else{
    const d=new Date(last.doneAt);d.setHours(0,0,0,0);
    if(task.unit==="month") d.setMonth(d.getMonth()+n);
    else d.setDate(d.getDate()+(task.unit==="week"?7*n:n));
    next=d.getTime();
  }
  const lateDays=Math.floor((now-next)/DAY);
  const state=now>=next?"due":task.unit!=="day"&&next-now<2*DAY?"soon":"ok";
  return {state,last,next,lateDays:Math.max(0,lateDays)};
}

export const MAINT_STATE={
  ok:  {label:"Udført", color:"#27ae60",icon:"circle-check"},
  soon:{label:"Snart",  color:"#f0a500",icon:"clock"},
  due: {label:"Skal gøres",color:"#e74c3c",icon:"alert-circle"},
};

// Tasks per machine with their status
export function machineMaint(machine,tasks,log,jobs,now){
  return visibleMaint(tasks).filter(t=>t.machine===machine&&t.active!==false)
    .map(t=>({t,st:maintStatus(t,log,jobs,now)}))
    .sort((a,b)=>({due:0,soon:1,ok:2}[a.st.state]-{due:0,soon:1,ok:2}[b.st.state])||a.t.title.localeCompare(b.t.title));
}
