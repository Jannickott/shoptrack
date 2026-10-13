import { jRunAll, jSetupAll, liveTime, DAYS_KEY } from "../lib/util";

// ═══════════════════════════════════════════════════════
// PLANNING (beta, admin) — orders with a route of steps (one per department),
// timed from previous runs of the part, placed onto machines within work hours
// ═══════════════════════════════════════════════════════
export const PLAN_COLORS=["#3b82f6","#27ae60","#f0a500","#8b5cf6","#06b6d4","#ec4899","#e67e22","#84cc16"];
export const normPart=s=>(s||"").trim().toLowerCase();
export function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
export function addDays(ms,n){const d=new Date(ms);d.setDate(d.getDate()+n);return d.getTime();}
export function dueTs(o){return o.dueDate?new Date(o.dueDate+"T00:00:00").getTime():9e15;}
// Urgent first, then rank (defaults to due date; ▲▼ changes it), then oldest
export function orderCmp(a,b){return (b.urgent?1:0)-(a.urgent?1:0)||(a.rank??dueTs(a))-(b.rank??dueTs(b))||a.id-b.id;}

// Finished runs of a part — one row per job, both sides together
export function partHistory(jobs,machines,part){
  const p=normPart(part); if(!p) return [];
  const dept=name=>(machines.find(m=>m.name===name)||{}).department||"";
  return jobs.filter(j=>j.status==="done"&&!j.deleted&&normPart(j.job)===p).map(j=>({
    machine:j.machine,department:dept(j.machine),setupSec:jSetupAll(j),runSec:jRunAll(j),
    pieces:Math.max(j.pieces||0,j.pieces2||0),createdAt:j.createdAt||0,
  }));
}

// Typical time for a step: runs on the same machine, else anywhere in the department.
// Median, so one odd run doesn't throw it off.
export function estimateStep(hist,step){
  let rows=step.machine?hist.filter(h=>h.machine===step.machine):[],basis="machine";
  if(!rows.length){rows=hist.filter(h=>h.department&&h.department===step.department);basis="department";}
  if(!rows.length) return null;
  const perPc=rows.filter(h=>h.pieces>0).map(h=>h.runSec/h.pieces);
  return {setupSec:Math.round(median(rows.map(h=>h.setupSec))),runPerPcSec:perPc.length?median(perPc):null,n:rows.length,basis};
}

// The route the part took before: departments in the order they were first done,
// each with the machine it ran on most
export function suggestRoute(hist){
  const steps=[];
  [...hist].sort((a,b)=>a.createdAt-b.createdAt).forEach(h=>{
    const key=h.department||h.machine;
    if(!key||steps.some(s=>(s.department||s.machine)===key)) return;
    const counts={};hist.filter(x=>(x.department||x.machine)===key).forEach(x=>{counts[x.machine]=(counts[x.machine]||0)+1;});
    steps.push({id:Date.now()+steps.length,department:h.department,machine:Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0],setupMin:"",runMinPerPc:""});
  });
  return steps;
}

// Planned seconds for a step: typed minutes win, else the history estimate.
// Setup is once per step, run grows with the quantity.
export function stepDuration(step,qty,hist){
  const est=estimateStep(hist,step);
  const num=v=>v===""||v==null||isNaN(Number(v))?null:Number(v);
  const setup=num(step.setupMin)!=null?num(step.setupMin)*60:est?.setupSec;
  const perPc=num(step.runMinPerPc)!=null?num(step.runMinPerPc)*60:est?.runPerPcSec;
  if(setup==null||perPc==null) return {est,durationSec:null};
  const setupSec=Math.round(setup),runSec=Math.round(perPc*(qty||0));
  return {est,setupSec,runSec,durationSec:setupSec+runSec};
}

// The moment `sec` of work time has passed inside a block's segments
export function workPoint(segs,sec){
  let left=sec*1000;
  for(const [s,e] of segs){if(left<=e-s) return s+left;left-=e-s;}
  return segs.length?segs[segs.length-1][1]:null;
}

// Work window [start,end] of the day containing ms, or null on a day off
export function dayWindow(wh,ms){
  const d=new Date(ms);d.setHours(0,0,0,0);
  const dh=(wh||{})[DAYS_KEY[d.getDay()]]||(wh?.start?{start:wh.start,end:wh.end,enabled:true}:null);
  if(!dh||!dh.enabled||!dh.start||!dh.end) return null;
  const [sh,sm]=dh.start.split(":").map(Number),[eh,em]=dh.end.split(":").map(Number);
  const s=new Date(d);s.setHours(sh,sm,0,0);const e=new Date(d);e.setHours(eh,em,0,0);
  return e>s?[s.getTime(),e.getTime()]:null;
}

// Spend `sec` of work time from startMs on, skipping nights and days off.
// Returns the end and the [from,to] pieces per day (for drawing).
export function addWorkTime(wh,startMs,sec){
  const segs=[];let t=startMs,left=sec*1000;
  for(let i=0;i<730&&left>0;i++){
    const w=dayWindow(wh,t);
    if(w&&t<w[1]){const s=Math.max(t,w[0]),take=Math.min(left,w[1]-s);segs.push([s,s+take]);left-=take;t=s+take;if(left<=0)break;}
    const next=new Date(t);next.setHours(0,0,0,0);next.setDate(next.getDate()+1);t=next.getTime();
  }
  return {end:segs.length?segs[segs.length-1][1]:startMs,segs,ok:left<=0};
}

// Department order for routes (e.g. Turning → Fortanding → Milling): the saved
// order first, then any departments not in it yet, alphabetically
export function effectiveDeptOrder(saved,allDepts){
  const s=(saved||[]).filter(d=>allDepts.includes(d));
  return [...s,...allDepts.filter(d=>!s.includes(d)).sort()];
}
// Put steps in department order; steps without a known department keep their place at the end
export function sortSteps(steps,deptOrder){
  const rank=s=>{const i=deptOrder.indexOf(s.department);return i<0?999:i;};
  return steps.map((s,i)=>[s,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);
}

// Priority order, optionally pulling the same part (due within 7 days) right
// behind it so the machine stays set up
export function orderQueue(orders,groupSameParts){
  const ordered=orders.filter(o=>!o.deleted&&!o.done).sort(orderCmp);
  if(!groupSameParts) return ordered;
  const out=[],rest=[...ordered];
  while(rest.length){
    const o=rest.shift();out.push(o);
    const p=normPart(o.partNumber);
    for(let i=0;i<rest.length;){
      const q=rest[i];
      if(normPart(q.partNumber)===p&&!!q.urgent===!!o.urgent&&dueTs(q)-dueTs(o)<=7*86400000){out.push(q);rest.splice(i,1);}else i++;
    }
  }
  return out;
}

// Forward plan with a busy list per machine:
// 1. running jobs block their machine for their estimated remaining time
// 2. pinned steps (dragged or given a fixed start) are placed where they were put
// 3. the other steps, orders in priority order: each step waits for the previous
//    one and goes to the machine in its department that can finish it first, in
//    the first gap long enough. A machine already set up for the same part and
//    step (the block right before) needs no new setup.
export function buildPlan({orders,jobs,allMachines,machines,workHours,now,groupSameParts}){
  const busy={};machines.forEach(m=>{busy[m.name]=[];}); // [{s,e,part,stepIdx,orderId,live}]
  const reserve=(m,iv)=>{busy[m].push(iv);busy[m].sort((a,b)=>a.s-b.s);};
  // Earliest placement of `sec` work seconds on machine m, not before `from`, that doesn't overlap a busy block
  const findSlot=(m,from,sec)=>{
    let start=from;
    for(let k=0;k<500;k++){
      const r=addWorkTime(workHours,start,sec);
      if(!r.ok) return null;
      const s0=r.segs[0]?.[0]??start;
      const clash=busy[m].find(b=>b.s<r.end&&b.e>s0);
      if(!clash) return r;
      start=clash.e;
    }
    return null;
  };
  const before=(m,t)=>busy[m].filter(b=>b.e<=t).sort((a,b)=>b.e-a.e)[0]; // block just before time t
  const blocks=[];
  const liveFree={};machines.forEach(m=>{liveFree[m.name]=now;});
  jobs.filter(j=>j.status!=="done"&&j.status!=="deburring"&&busy[j.machine]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).forEach(j=>{
    const h=partHistory(jobs,allMachines,j.job).filter(x=>x.machine===j.machine);
    const typSetup=median(h.map(x=>x.setupSec)),typRun=median(h.map(x=>x.runSec));
    const lt=liveTime(j);
    const inSetup=j.status==="setup"||j.status==="side2_setup";
    let r,setupLeft=0;
    if(typSetup!=null&&typRun!=null){
      const remaining=Math.max(0,typSetup+typRun-(lt.setup+lt.run+lt.setup2+lt.run2));
      if(inSetup) setupLeft=Math.min(remaining,Math.max(0,typSetup-(j.status==="setup"?lt.setup:lt.setup2)));
      r=addWorkTime(workHours,liveFree[j.machine],remaining);
    }else{const w=dayWindow(workHours,now);r=w&&now<w[1]?{end:w[1],segs:[[Math.max(now,w[0]),w[1]]]}:{end:now,segs:[]};} // unknown: assume it finishes today
    blocks.push({live:true,guess:typSetup==null,inSetup,machine:j.machine,end:r.end,segs:r.segs,setupEnd:workPoint(r.segs,setupLeft),
      label:[j.customer,j.job].filter(Boolean).join(" · "),operator:j.operatorName});
    liveFree[j.machine]=Math.max(liveFree[j.machine],r.end);
    reserve(j.machine,{s:now,e:r.end,part:normPart(j.job),live:true});
  });

  const ordered=orderQueue(orders,groupSameParts);
  const results={};
  const mk=(o,i,m,r,setupSec,sd,extra)=>({orderId:o.id,stepIdx:i,machine:m,start:r.segs[0]?.[0]??r.end,end:r.end,segs:r.segs,
    setupSec,runSec:sd.runSec,durationSec:setupSec+sd.runSec,setupEnd:workPoint(r.segs,setupSec),
    label:[o.customer,o.partNumber].filter(Boolean).join(" · "),...extra});

  // Pass 1 — pinned steps go exactly where they were put
  const pinned={}; // `${orderId}|${stepIdx}` → block
  ordered.forEach(o=>{
    const hist=partHistory(jobs,allMachines,o.partNumber);
    (o.steps||[]).forEach((st,i)=>{
      if(!st.pin||!busy[st.pin.machine]) return;
      const sd=stepDuration(st,o.quantity,hist);
      if(sd.durationSec==null) return;
      const r=addWorkTime(workHours,st.pin.start,sd.durationSec);
      if(!r.ok) return;
      const b=mk(o,i,st.pin.machine,r,sd.setupSec,sd,{pinned:true,setupSaved:0});
      b.overlap=busy[st.pin.machine].some(x=>x.s<b.end&&x.e>b.start); // pinned on top of something else
      pinned[`${o.id}|${i}`]=b;blocks.push(b);
      reserve(st.pin.machine,{s:b.start,e:b.end,part:normPart(o.partNumber),stepIdx:i,orderId:o.id});
    });
  });

  // Pass 2 — everything else, in priority order
  ordered.forEach(o=>{
    const hist=partHistory(jobs,allMachines,o.partNumber);
    let prevEnd=now,problem=null,warning=null;const steps=[];
    const part=normPart(o.partNumber);
    for(const [i,st] of (o.steps||[]).entries()){
      const name=st.machine||st.department||"?";
      const pb=pinned[`${o.id}|${i}`];
      if(pb){
        if(pb.overlap) warning=`Trin ${i+1} er låst oven i andet arbejde på ${pb.machine}`;
        if(pb.start<prevEnd-60000) warning=`Trin ${i+1} er låst til at starte før trin ${i} er færdigt`;
        prevEnd=Math.max(prevEnd,pb.end);steps.push(pb);continue;
      }
      const sd=stepDuration(st,o.quantity,hist);
      if(sd.durationSec==null){problem=`Trin ${i+1} (${name}) har ingen tid — ingen historik, indtast minutter`;break;}
      const cands=st.machine?machines.filter(m=>m.name===st.machine):machines.filter(m=>m.department===st.department);
      if(!cands.length){problem=`Ingen aktiv maskine til trin ${i+1} (${name})`;break;}
      let best=null;
      cands.forEach(m=>{
        let r=findSlot(m.name,prevEnd,sd.durationSec);
        if(!r) return;
        // Same part and same step right before on this machine (another order, or
        // the job running now) → already set up, the step is shorter
        const p=before(m.name,(r.segs[0]?.[0]??r.end)+1);
        const setUp=!!p&&p.part===part&&p.orderId!==o.id&&(p.live||p.stepIdx===i);
        let setupSec=sd.setupSec;
        if(setUp&&sd.setupSec>0){const r2=findSlot(m.name,r.segs[0]?.[0]??prevEnd,sd.runSec);if(r2){r=r2;setupSec=0;}}
        if(!best||r.end<best.r.end) best={m,r,setupSec,setUp:setupSec===0&&sd.setupSec>0};
      });
      if(!best){problem=`Ingen plads til at planlægge trin ${i+1} (${name}) — tjek arbejdstiden`;break;}
      const b=mk(o,i,best.m.name,best.r,best.setupSec,sd,{setupSaved:best.setUp?sd.setupSec:0});
      reserve(best.m.name,{s:b.start,e:b.end,part,stepIdx:i,orderId:o.id});
      prevEnd=b.end;blocks.push(b);steps.push(b);
    }
    const end=!problem&&steps.length?prevEnd:null;
    const dueEnd=o.dueDate?new Date(o.dueDate+"T23:59:59").getTime():null;
    results[o.id]={steps,end,problem,warning,late:!!(end&&dueEnd&&end>dueEnd)};
  });
  return {blocks,results,ordered};
}

// ── Import: paste rows from Excel/ERP ──
// Columns: customer, part number, quantity, due date, departments (optional).
// Tab (Excel), ; or , separated. A header row is skipped (its quantity isn't a number).
export function parseDate(s){
  s=(s||"").trim();if(!s) return "";
  let y,mo,d,m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) [y,mo,d]=[m[1],m[2],m[3]];
  else if((m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) [d,mo,y]=[m[1],m[2],m[3].length===2?"20"+m[3]:m[3]]; // Danish day.month.year
  else return null;
  const iso=`${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  const t=new Date(iso+"T00:00:00");
  return !isNaN(t)&&t.getDate()===Number(d)&&t.getMonth()+1===Number(mo)?iso:null; // rejects 31-02, 32-13…
}
export function parseImport(text,allDepts){
  return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map((line,n)=>{
    const sep=line.includes("\t")?"\t":line.includes(";")?";":",";
    const [customer="",part="",qtyS="",dueS="",deptS=""]=line.split(sep).map(c=>c.trim());
    const qty=parseInt(qtyS);
    if(isNaN(qty)) return n===0?null:{line,error:`Antal "${qtyS}" er ikke et tal`};
    const dueDate=parseDate(dueS);
    if(dueDate===null) return {line,error:`Kan ikke læse datoen "${dueS}" (brug 31-10-2026 eller 2026-10-31)`};
    const depts=[],unknown=[];
    deptS.split(/[+,/>|]+|\s+/).map(t=>t.trim()).filter(Boolean).forEach(t=>{
      const lt=t.toLowerCase();
      const d=allDepts.find(x=>x.toLowerCase()===lt)||(allDepts.filter(x=>x.toLowerCase().startsWith(lt)).length===1?allDepts.find(x=>x.toLowerCase().startsWith(lt)):null);
      if(d){if(!depts.includes(d))depts.push(d);}else unknown.push(t);
    });
    if(unknown.length) return {line,error:`Ukendt afdeling: ${unknown.join(", ")}`};
    if(!part) return {line,error:"Intet tegningsnr."};
    if(qty<1) return {line,error:"Antal skal være mindst 1"};
    return {line,customer,partNumber:part,quantity:qty,dueDate,depts};
  }).filter(Boolean);
}
