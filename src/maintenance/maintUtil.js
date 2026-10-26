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
export const UNITS=[["day","Dage"],["week","Uger"],["month","Måneder"],["year","År"],["hours","Driftstimer"]];
// A fixed day (optional): task.weekday 0–6 (søndag=0) for weeks, task.monthDay 1–31 for
// months (31 = last day in shorter months), task.yearDate "MM-DD" for years
export const WEEKDAYS=["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
const MONTHS=["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
const hasFixedDay=t=>(t.unit==="week"&&t.weekday!=null&&t.weekday!=="")||(t.unit==="month"&&!!t.monthDay)||(t.unit==="year"&&!!t.yearDate);

export function intervalLabel(t){
  const n=Number(t.every)||1;
  if(t.unit==="hours") return `Hver ${n}. driftstime`;
  if(t.unit==="week"){
    if(hasFixedDay(t)) return n===1?`Hver ${WEEKDAYS[t.weekday]}`:`Hver ${n}. ${WEEKDAYS[t.weekday]}`;
    return n===1?"Hver uge":`Hver ${n}. uge`;
  }
  if(t.unit==="month"){
    if(hasFixedDay(t)) return n===1?`Den ${t.monthDay}. i hver måned`:`Den ${t.monthDay}. hver ${n}. måned`;
    return n===1?"Hver måned":`Hver ${n}. måned`;
  }
  if(t.unit==="year"){
    const [mm,dd]=(t.yearDate||"").split("-").map(Number);
    const on=hasFixedDay(t)?` d. ${dd}. ${MONTHS[mm-1]}`:"";
    return (n===1?"Hvert år":`Hvert ${n}. år`)+on;
  }
  return n===1?"Hver dag":`Hver ${n}. dag`;
}

// First date on or after `from` (a day start) that is the task's fixed day
function firstFixedDay(t,from){
  const d=new Date(from);
  if(t.unit==="week"){while(d.getDay()!==Number(t.weekday))d.setDate(d.getDate()+1);return d;}
  if(t.unit==="month"){
    const dayIn=x=>Math.min(Number(t.monthDay),new Date(x.getFullYear(),x.getMonth()+1,0).getDate());
    if(d.getDate()>dayIn(d)){d.setDate(1);d.setMonth(d.getMonth()+1);}
    d.setDate(dayIn(d));return d;
  }
  const [mm,dd]=t.yearDate.split("-").map(Number);
  let c=new Date(d.getFullYear(),mm-1,dd);
  if(c<d) c=new Date(d.getFullYear()+1,mm-1,dd);
  return c;
}

export const visibleMaint=list=>(list||[]).filter(x=>!x.deleted);

// Latest record for a task
export function lastDone(task,log){
  let last=null;
  for(const e of log||[]) if(e.taskId===task.id&&(!last||e.doneAt>last.doneAt)) last=e;
  return last;
}

// All production seconds a machine has ever had in ShopTrack. Stored on each check
// (log.runTotal) and on a new point (task.runTotalAtCreate), so hours since = now − then.
export function machineRunTotal(jobs,machine){
  return (jobs||[]).filter(j=>j.machine===machine&&!j.deleted).reduce((s,j)=>{const lt=liveTime(j);return s+lt.run+lt.run2;},0);
}

// Older checks without runTotal: production seconds since a moment (a job still
// running counts in full)
export function machineRunSecSince(jobs,machine,since){
  return (jobs||[]).filter(j=>j.machine===machine&&!j.deleted&&(j.status!=="done"||(j.completedAt||0)>since)&&(j.createdAt||0)<=Date.now())
    .reduce((s,j)=>{const lt=liveTime(j);return s+lt.run+lt.run2;},0);
}

// ok / soon / due — and when the next check falls due
export function maintStatus(task,log,jobs,now=Date.now()){
  const last=lastDone(task,log);
  const n=Math.max(1,Number(task.every)||1);
  if(task.unit==="hours"){
    const base=last?last.runTotal:task.runTotalAtCreate;
    const used=(base!=null?Math.max(0,machineRunTotal(jobs,task.machine)-base):machineRunSecSince(jobs,task.machine,last?last.doneAt:task.createdAt))/3600;
    const state=!last||used>=n?"due":used>=n*0.9?"soon":"ok";
    // Late = 10 % past the hours (a day or two of production)
    return {state,last,used,late:!!last&&used>=n*1.1,label:`${Math.floor(used)} af ${n} driftstimer brugt`};
  }
  // Calendar: due from the start of the day the interval runs out (never done → due now).
  // With a fixed day: the next such day after the last check (never done → the first one).
  let next;
  if(hasFixedDay(task)){
    const from=new Date(last?last.doneAt:(task.createdAt||now));from.setHours(0,0,0,0);
    if(last) from.setDate(from.getDate()+1);
    const d=firstFixedDay(task,from);
    if(last&&n>1){
      if(task.unit==="week") d.setDate(d.getDate()+7*(n-1));
      else if(task.unit==="month"){d.setDate(1);d.setMonth(d.getMonth()+n-1);next=firstFixedDay(task,d).getTime();}
      else d.setFullYear(d.getFullYear()+n-1);
    }
    if(next==null) next=d.getTime();
  }else if(!last) next=new Date(task.createdAt||now).setHours(0,0,0,0);
  else{
    const d=new Date(last.doneAt);d.setHours(0,0,0,0);
    if(task.unit==="month") d.setMonth(d.getMonth()+n);
    else if(task.unit==="year") d.setFullYear(d.getFullYear()+n);
    else d.setDate(d.getDate()+(task.unit==="week"?7*n:n));
    next=d.getTime();
  }
  const lateDays=Math.floor((now-next)/DAY);
  const state=now>=next?"due":task.unit!=="day"&&next-now<2*DAY?"soon":"ok";
  return {state,last,next,lateDays:Math.max(0,lateDays),late:state==="due"&&lateDays>=1};
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

// Who looks after a machine right now: the operator with a job running on it,
// else the operator of the last job there. null when the machine has had no jobs.
export function machineOperator(jobs,machine){
  const on=(jobs||[]).filter(j=>j.machine===machine&&!j.deleted);
  const running=on.filter(j=>j.status!=="done").sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
  const j=running||on.sort((a,b)=>Math.max(b.completedAt||0,b.createdAt||0)-Math.max(a.completedAt||0,a.createdAt||0))[0];
  return j?{id:j.operatorId,name:j.operatorName}:null;
}

// Maintenance due on the machines this operator looks after: [{machine,t,st}]
export function myMaint(userId,machines,tasks,log,jobs){
  const out=[];
  (machines||[]).filter(m=>m.active&&!m.removed).forEach(m=>{
    if(machineOperator(jobs,m.name)?.id!==userId) return;
    machineMaint(m.name,tasks,log,jobs).filter(x=>x.st.state==="due").forEach(x=>out.push({machine:m.name,...x}));
  });
  return out.sort((a,b)=>(b.st.late?1:0)-(a.st.late?1:0));
}

// "forsinket 3 dage" / "skal gøres i dag" / "450 af 500 driftstimer brugt"
export function dueText(t,st){
  if(t.unit==="hours") return st.late?`forsinket — ${st.label}`:st.label;
  return st.lateDays>0?`forsinket ${st.lateDays} dag${st.lateDays>1?"e":""}`:"skal gøres i dag";
}
