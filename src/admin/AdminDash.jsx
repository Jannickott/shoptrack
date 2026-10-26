import { useState, useEffect, useMemo } from "react";
import { C, card, badge, th, td, tag, btn } from "../lib/theme";
import { fmtHM, fmtDate, toDateInput, jRunAll, jSetupAll, liveTime, calcAvailableWorkSec } from "../lib/util";
import { jobProgress, normPart } from "../planning/planEngine";
import { visibleTasks, taskState } from "../tasks/taskUtil";
import { machineMaint, machineOperator, dueText } from "../maintenance/maintUtil";

// ═══════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════
// Sort: down/repair first → setup → running
export function sortActive(arr){
  const rank=j=>j.paused?0:j.status==="setup"?1:2;
  return [...arr].sort((a,b)=>rank(a)-rank(b));
}

// Shared 3-column grid with Down / Setup / Running sections
export function ActiveSection({label,color,items,renderCard}){
  if(!items.length) return null;
  return(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:13,color,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${color}40`}}>
        {label} · {items.length}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {items.map(j=>renderCard(j))}
      </div>
    </div>
  );
}

export function ActiveJobsGrid({jobs,renderCard}){
  const down   =jobs.filter(j=>j.paused);
  const setup  =jobs.filter(j=>!j.paused&&(j.status==="setup"||j.status==="side2_setup"));
  const running=jobs.filter(j=>!j.paused&&(j.status==="run"||j.status==="side2_run"||j.status==="deburring"));
  return(
    <>
      <ActiveSection label="Nede / reparation" color={C.red}   items={down}    renderCard={renderCard}/>
      <ActiveSection label="Opstilling"    color={C.amber} items={setup}   renderCard={renderCard}/>
      <ActiveSection label="Kører"       color={C.green} items={running} renderCard={renderCard}/>
    </>
  );
}

export function DonutChart({title,segments}){
  const total=segments.reduce((s,x)=>s+x.value,0);
  const size=130,thick=22,cx=size/2,cy=size/2,r=(size-thick)/2;
  const circ=2*Math.PI*r;
  let cum=0;
  const slices=segments.map(seg=>{
    const pct=total>0?seg.value/total:0;
    const dash=pct*circ;
    const startAngle=cum*360-90;
    cum+=pct;
    return{...seg,dash,startAngle};
  });
  const totalHM=fmtHM(total);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{title}</div>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size}>
          {total===0
            ?<circle cx={cx} cy={cy} r={r} fill="none" stroke={C.raised} strokeWidth={thick}/>
            :slices.map((s,i)=>s.dash>0&&(
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={s.color} strokeWidth={thick}
                strokeDasharray={`${s.dash} ${circ}`}
                strokeDashoffset={0}
                transform={`rotate(${s.startAngle} ${cx} ${cy})`}
              />
            ))}
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:14,color:C.text,fontWeight:700,fontFamily:"'Share Tech Mono',monospace"}}>{total>0?totalHM:"—"}</div>
          <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>i alt</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,width:"100%"}}>
        {segments.map((s,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:8,height:8,borderRadius:2,background:s.color,display:"inline-block"}}/>
              <span style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</span>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:13,color:s.color,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(s.value)}</span>
              <span style={{fontSize:12,color:C.muted}}>{total>0?Math.round(s.value/total*100):0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// OVERBLIK — three questions: what needs me, what is happening on the floor
// right now, and how are we doing against the goal
// ═══════════════════════════════════════════════════════
const HOUR=3600000;
const sinceLabel=ms=>{
  const d=new Date(ms),now=new Date();
  const t=d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
  if(d.toDateString()===now.toDateString()) return `siden ${t}`;
  const y=new Date(now);y.setDate(now.getDate()-1);
  if(d.toDateString()===y.toDateString()) return `siden i går ${t}`;
  return `siden ${d.toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"})}`;
};
const atLabel=ms=>{
  const d=new Date(ms),now=new Date();
  const t=d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
  if(d.toDateString()===now.toDateString()) return `kl. ${t}`;
  const tm=new Date(now);tm.setDate(now.getDate()+1);
  if(d.toDateString()===tm.toDateString()) return `i morgen ${t}`;
  return `${d.toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"})} ${t}`;
};
const Title=({children,color=C.muted,right})=>(
  <div style={{display:"flex",alignItems:"center",gap:8,margin:"18px 0 10px"}}>
    <div style={{fontSize:13,color,letterSpacing:2,textTransform:"uppercase",flex:1}}>{children}</div>{right}
  </div>
);
const PHASE={setup:["Opstilling",C.amber],side2_setup:["Opstilling S2",C.blue],run:["Produktion",C.green],side2_run:["Produktion S2",C.blue],deburring:["Afgratning",C.deburr]};

export function AdminDash({jobs,machineIssues,downtimeLog,machines,tools,efficiencyGoals,workHours,tasks,planOrders,setTab,onOpenJob,maintTasks,maintLog,onOpenMaint}){
  const [period,setPeriod]=useState("week");
  const [srv,setSrv]=useState(null);
  useEffect(()=>{
    const load=()=>fetch("/api/server-status").then(r=>r.ok?r.json():null).then(setSrv).catch(()=>{});
    load();const t=setInterval(load,5*60000);return()=>clearInterval(t);
  },[]);
  const nowMs=Date.now();
  const minute=Math.floor(nowMs/60000);
  const todayStart=new Date().setHours(0,0,0,0);
  // Task jobs (Opgaver) show on the floor but stay out of every figure
  const statJobs=jobs.filter(j=>!j.taskId);
  const done=statJobs.filter(j=>j.status==="done");
  const running=jobs.filter(j=>j.status!=="done");
  const hiddenGoal=efficiencyGoals?.hiddenMachines||[];
  const numActiveMachines=Math.max(machines.filter(m=>m.active&&!hiddenGoal.includes(m.name)).length,1);
  // Estimates for running jobs, refreshed once a minute
  const progress=useMemo(()=>{
    const map={};
    jobs.filter(j=>j.status!=="done").forEach(j=>{map[j.id]=jobProgress(j,{jobs,machines,workHours,now:minute*60000});});
    return map;
  },[jobs,machines,workHours,minute]);

  // ── 1. What needs my attention ──
  const openOrders=(planOrders||[]).filter(o=>!o.deleted&&!o.done&&o.dueDate);
  const lateJobs=running.filter(j=>{
    const pg=progress[j.id];const o=openOrders.find(x=>normPart(x.partNumber)===normPart(j.job));
    return pg?.finishAt&&o&&pg.finishAt>new Date(o.dueDate+"T23:59:59").getTime();
  });
  const issueEntries=Object.entries(machineIssues);
  const toOrder=(tools||[]).filter(t=>t.active&&t.quantity<=(t.minQuantity||0)&&!t.ordered);
  const waitingTasks=visibleTasks(tasks).filter(t=>taskState(t,jobs).key==="waiting");
  // Maintenance: late points (red, by name) apart from points due today (yellow)
  const maintAll=machines.filter(m=>m.active&&!m.removed).flatMap(m=>machineMaint(m.name,maintTasks,maintLog,jobs).filter(x=>x.st.state==="due").map(x=>({...x,machine:m.name})));
  const maintLate=maintAll.filter(x=>x.st.late), maintToday=maintAll.filter(x=>!x.st.late);
  const byMachine=list=>Object.entries(list.reduce((a,x)=>{a[x.machine]=(a[x.machine]||0)+1;return a;},{})).map(([m,n])=>`${m} (${n})`).join(", ");
  const noCount=running.filter(j=>(j.status==="run"||j.status==="side2_run")&&(j.createdAt||0)<todayStart&&!progress[j.id]?.countedToday);
  const longSetup=running.filter(j=>{const lt=liveTime(j);return (j.status==="setup"&&lt.setup>8*3600)||(j.status==="side2_setup"&&lt.setup2>8*3600);});
  const srvProblem=srv&&(()=>{
    const old=x=>!x||srv.now-x.at>14*HOUR;
    if(old(srv.lastBackup)) return "Ingen backup det sidste halve døgn";
    if(srv.copyDir&&srv.lastCopy&&!srv.lastCopy.ok) return "Kopien til den anden placering fejlede";
    if(srv.copyDir&&old(srv.copyLatest)) return "Kopien til den anden placering er for gammel";
    if(srv.disk&&srv.disk.free<2*1024**3) return "Serveren er ved at løbe tør for diskplads";
    return null;
  })();
  const attention=[
    issueEntries.length&&{color:C.red,icon:"alert-triangle",text:`${issueEntries.length} maskine${issueEntries.length>1?"r":""} nede eller til reparation: ${issueEntries.map(([n])=>n).join(", ")}`,tab:"alljobs"},
    lateJobs.length&&{color:C.red,icon:"alarm",text:`${lateJobs.length} job bliver ikke færdig${lateJobs.length>1?"e":""} til leveringsdatoen: ${lateJobs.map(j=>j.job).join(", ")}`,tab:"planning"},
    srvProblem&&{color:C.red,icon:"server",text:`Server: ${srvProblem} — se Administration → Server`,tab:"manage"},
    maintLate.length&&{color:C.red,icon:"tool",text:`Forsinket vedligehold: ${maintLate.slice(0,3).map(x=>`${x.t.title} på ${x.machine} (${dueText(x.t,x.st)}${machineOperator(jobs,x.machine)?`, ${machineOperator(jobs,x.machine).name}`:""})`).join("; ")}${maintLate.length>3?` + ${maintLate.length-3} mere`:""}`,go:onOpenMaint},
    maintToday.length&&{color:C.amber,icon:"tool",text:`Vedligehold skal gøres i dag: ${byMachine(maintToday)}`,go:onOpenMaint},
    waitingTasks.length&&{color:C.amber,icon:"clipboard-check",text:`${waitingTasks.length} opgave${waitingTasks.length>1?"r":""} venter på at blive givet til en operatør`,tab:"tasks"},
    toOrder.length&&{color:C.amber,icon:"package",text:`${toOrder.length} værktøj skal bestilles: ${toOrder.slice(0,3).map(t=>t.name).join(", ")}${toOrder.length>3?" …":""}`,tab:"admintools"},
    longSetup.length&&{color:C.amber,icon:"clock-exclamation",text:`${longSetup.length} job har stået i opstilling i over 8 timer — glemt at trykke Start produktion? ${longSetup.map(j=>j.machine).join(", ")}`,tab:"alljobs"},
    noCount.length&&{color:C.muted,icon:"123",text:`${noCount.length} job i produktion uden antal i dag`,tab:"planning"},
  ].filter(Boolean);

  // ── 2. The floor right now ──
  const floor=machines.filter(m=>m.active&&!m.removed).sort((a,b)=>(a.department||"").localeCompare(b.department||"")||a.name.localeCompare(b.name)).map(m=>{
    const mj=running.filter(j=>j.machine===m.name);
    const lastDone=jobs.filter(j=>j.machine===m.name&&j.status==="done").reduce((t,j)=>Math.max(t,j.completedAt||0),0);
    return {m,mj,issue:machineIssues[m.name],lastDone};
  });
  const busyCount=floor.filter(x=>x.mj.length&&!x.issue).length, idleCount=floor.filter(x=>!x.mj.length&&!x.issue).length;

  // ── 3. How are we doing ──
  const doneToday=done.filter(j=>(j.completedAt||0)>=todayStart);
  const piecesToday=doneToday.reduce((s,j)=>s+Math.max(j.pieces||0,j.pieces2||0),0);
  const downToday=downtimeLog.filter(d=>(d.resolvedAt||0)>=todayStart).reduce((s,d)=>s+(d.downtimeSec||0),0)+issueEntries.reduce((s,[,i])=>s+(i.downtimeSec||0),0);
  const soon=running.map(j=>({j,pg:progress[j.id]})).filter(x=>x.pg?.finishAt&&!x.pg.paused&&x.pg.finishAt-nowMs<3*HOUR).sort((a,b)=>a.pg.finishAt-b.pg.finishAt);

  // Goal: week + month (charts) and the year so far
  const targetEff=efficiencyGoals?.overall??80;
  const weekTarget=efficiencyGoals?.week??75, monthTarget=efficiencyGoals?.month??78;
  const monday=new Date(todayStart);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const weekStart=monday.getTime(), weekEnd=new Date(monday).setDate(monday.getDate()+7);
  const monthStart=new Date(todayStart);monthStart.setDate(1);
  const monthEnd=new Date(monthStart).setMonth(monthStart.getMonth()+1);
  const monthStr=toDateInput(nowMs).slice(0,7);
  const jSetup=j=>{const lt=liveTime(j);return lt.setup+lt.setup2;};
  const jRun=j=>{const lt=liveTime(j);return lt.run+lt.run2;};
  const weekJobs=statJobs.filter(j=>(j.createdAt||0)>=weekStart);
  const monthJobs=statJobs.filter(j=>toDateInput(j.createdAt).startsWith(monthStr));
  const downSince=from=>downtimeLog.filter(d=>(d.resolvedAt||0)>=from).reduce((s,d)=>s+d.downtimeSec,0)+Object.values(machineIssues).filter(i=>(i.reportedAt||0)>=from).reduce((s,i)=>s+(i.downtimeSec||0),0);
  const period3=(jobsIn,from,to,target,title)=>{
    const total=calcAvailableWorkSec(workHours,from,to)*numActiveMachines;
    const left=calcAvailableWorkSec(workHours,Math.max(nowMs,from),to)*numActiveMachines;
    const run=jobsIn.reduce((s,j)=>s+jRun(j),0), setup=jobsIn.reduce((s,j)=>s+jSetup(j),0);
    return {title,target,total,left,run,setup,down:downSince(from),eff:total>0?Math.round(run/total*100):null,need:Math.max(0,total*target/100-run)};
  };
  const goalPeriods=[period3(weekJobs,weekStart,weekEnd,weekTarget,"Denne uge"),period3(monthJobs,monthStart.getTime(),monthEnd,monthTarget,"Denne måned")];
  const yearStart=new Date(new Date().getFullYear(),0,1).getTime();
  const yearAvail=calcAvailableWorkSec(workHours,yearStart,nowMs)*numActiveMachines;
  const yearRun=done.filter(j=>(j.completedAt||0)>=yearStart).reduce((s,j)=>s+jRunAll(j),0);
  const yearEff=yearAvail>0?Math.round(yearRun/yearAvail*100):null;

  // Machines and operators for the chosen period (finished jobs)
  const periodFrom=period==="today"?todayStart:period==="week"?weekStart:monthStart.getTime();
  const periodDone=done.filter(j=>(j.completedAt||0)>=periodFrom);
  const machMap={};periodDone.forEach(j=>{const x=machMap[j.machine]||(machMap[j.machine]={run:0,setup:0,jobs:0,pieces:0});x.run+=jRunAll(j);x.setup+=jSetupAll(j);x.jobs++;x.pieces+=Math.max(j.pieces||0,j.pieces2||0);});
  const maxRun=Math.max(...Object.values(machMap).map(m=>m.run+m.setup),1);
  const opMap={};periodDone.forEach(j=>{const x=opMap[j.operatorName]||(opMap[j.operatorName]={jobs:0,pieces:0,run:0,setup:0});x.jobs++;x.pieces+=Math.max(j.pieces||0,j.pieces2||0);x.run+=jRunAll(j);x.setup+=jSetupAll(j);});
  const periodName={today:"i dag",week:"denne uge",month:"denne måned"}[period];

  const box=(v,l,c)=>(
    <div key={l} style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center"}}>
      <div style={{fontSize:26,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{v}</div>
      <div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{l}</div>
    </div>
  );

  return(
    <div style={{padding:"14px 16px"}}>
      {/* ── 1. Kræver opmærksomhed ── */}
      <div style={{...card(attention.some(a=>a.color===C.red)?C.red:attention.length?C.amber:C.green),marginBottom:4}}>
        {!attention.length
          ?<div style={{fontSize:17,color:C.green,fontWeight:700}}><i className="ti ti-circle-check"/> Alt ser fint ud — intet kræver din opmærksomhed</div>
          :<>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Kræver din opmærksomhed</div>
            {attention.map((a,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
                <i className={`ti ti-${a.icon}`} style={{fontSize:22,color:a.color,flexShrink:0}}/>
                <span style={{flex:1,fontSize:15,color:a.color===C.muted?C.muted:C.text}}>{a.text}</span>
                <button style={btn("outline",false,true)} onClick={()=>a.go?a.go():setTab(a.tab)}>Vis <i className="ti ti-arrow-right"/></button>
              </div>
            ))}
          </>}
      </div>

      {/* ── 2. Gulvet lige nu ── */}
      <Title right={<span style={{fontSize:13,color:C.muted}}>{busyCount} kører · {idleCount} står stille{issueEntries.length?` · ${issueEntries.length} nede`:""}</span>}>Maskinerne lige nu</Title>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
        {floor.map(({m,mj,issue,lastDone})=>{
          const j=mj[0];
          if(issue) return(
            <div key={m.id} style={{...card(C.red),marginBottom:0}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6}}><b style={{fontSize:16,color:C.text}}>{m.name}</b><span style={badge(issue.status==="down"?"down":"repair")}>{issue.status==="down"?"Nede":"Reparation"}</span></div>
              {issue.reason&&<div style={{fontSize:14,color:C.text,marginTop:6}}>{issue.reason}</div>}
              <div style={{fontSize:13,color:C.muted,marginTop:4}}>{issue.reportedBy} · {sinceLabel(issue.reportedAt)}</div>
              <div style={{fontSize:18,color:C.red,fontFamily:"'Share Tech Mono',monospace",marginTop:6,textAlign:"right"}}>{fmtHM(issue.downtimeSec||0)}</div>
            </div>
          );
          if(!j) return(
            <div key={m.id} style={{...card(),marginBottom:0,opacity:.75,borderStyle:"dashed"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6}}><b style={{fontSize:16,color:C.muted}}>{m.name}</b><span style={{fontSize:12,color:C.muted}}>{m.department}</span></div>
              <div style={{fontSize:15,color:C.muted,marginTop:8}}><i className="ti ti-zzz"/> Står stille</div>
              <div style={{fontSize:13,color:C.muted,marginTop:2}}>{lastDone?`Sidste job færdigt ${sinceLabel(lastDone).replace("siden ","")}`:"Ingen job endnu"}</div>
            </div>
          );
          const lt=liveTime(j),pg=progress[j.id];
          const paused=j.paused||j.logoutPaused||j.operatorPaused;
          const [phase,pc]=paused?["På pause",C.muted]:j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone?["Natkørsel","#7c5cbf"]:PHASE[j.status]||[j.status,C.muted];
          const phaseSec=j.status==="setup"?lt.setup:j.status==="side2_setup"?lt.setup2:j.status==="side2_run"?lt.run2:j.status==="deburring"?lt.debur:lt.run;
          return(
            <div key={m.id} onClick={()=>onOpenJob(j)} style={{...card(pc),marginBottom:0,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6,alignItems:"center"}}>
                <b style={{fontSize:16,color:C.text}}>{m.name}</b>
                <span style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:pc,background:pc+"22",padding:"2px 8px",borderRadius:20,fontWeight:700}}>{phase}</span>
              </div>
              <div style={{fontSize:15,color:C.text,fontWeight:700,marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.job}{j.customer?<span style={{color:C.muted,fontWeight:400}}> · {j.customer}</span>:""}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:4}}>
                <span style={{fontSize:13,color:C.muted}}><i className="ti ti-user"/> {j.operatorName}</span>
                <span style={{fontSize:18,color:paused?C.muted:pc,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(phaseSec)}</span>
              </div>
              {(pg?.finishAt||pg?.target)&&<div style={{fontSize:13,color:C.muted,marginTop:4}}>
                {pg.target?`${pg.made!=null?`${pg.estimated?"≈":""}${pg.made}`:"?"} / ${pg.target} stk`:""}{pg.target&&pg.finishAt?" · ":""}{pg.finishAt?<span style={{color:C.text}}>færdig ca. {atLabel(pg.finishAt)}</span>:""}
              </div>}
              {mj.length>1&&<div style={{fontSize:12,color:C.amber,marginTop:4}}>+ {mj.length-1} job mere på maskinen</div>}
            </div>
          );
        })}
      </div>

      {/* ── 3. Hvordan går det ── */}
      <Title>I dag</Title>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
        {box(doneToday.length,"Job færdige",C.green)}
        {box(piecesToday,"Stk. færdige",C.text)}
        {box(running.length,"Job i gang",C.amber)}
        {box(fmtHM(downToday),"Nedetid",downToday?C.red:C.muted)}
      </div>

      <Title>Mod målet</Title>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16,background:C.raised,borderRadius:10,padding:"14px 12px",border:`1px solid ${C.border}`}}>
        {goalPeriods.map(p=>{
          const c=p.eff==null?C.muted:p.eff>=p.target?C.green:p.eff>=p.target-10?C.amber:C.red;
          const reachable=p.need<=p.left;
          return(
            <div key={p.title}>
              <DonutChart title={p.title} segments={[
                {label:"Ledig",value:Math.max(0,p.total-p.run-p.setup-p.down),color:C.border},
                {label:"Fejl",value:p.down,color:C.red},
                {label:"Opstilling",value:p.setup,color:C.amber},
                {label:"Produktion",value:p.run,color:C.green},
              ]}/>
              {p.eff!=null&&<div style={{marginTop:6,textAlign:"center"}}>
                <span style={{fontSize:20,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{p.eff}%</span>
                <span style={{fontSize:12,color:C.muted,marginLeft:6}}>mål {p.target}% · {fmtHM(p.run)} / {fmtHM(p.total)}</span>
              </div>}
              {/* On track? production still needed vs machine time left in the period */}
              <div style={{fontSize:14,textAlign:"center",marginTop:6,color:p.need<=0?C.green:reachable?C.text:C.red}}>
                {p.need<=0
                  ?<><i className="ti ti-trophy"/> Målet er nået</>
                  :<>Mangler <b>{fmtHM(p.need)}</b> produktion — {fmtHM(p.left)} maskintid tilbage{!reachable&&" (kan ikke nås)"}</>}
              </div>
            </div>
          );
        })}
      </div>
      {yearEff!=null&&(()=>{
        const c=yearEff>=targetEff?C.green:yearEff>=targetEff-10?C.amber:C.red;
        return(
          <div style={{...card(),marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
              <span style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>År til dato</span>
              <span><span style={{fontSize:22,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{yearEff}%</span><span style={{fontSize:13,color:C.muted}}> · mål {targetEff}%</span></span>
            </div>
            <div style={{position:"relative",height:16,background:C.raised,borderRadius:8,overflow:"hidden"}}>
              <div style={{width:`${Math.min(100,yearEff)}%`,height:"100%",background:c}}/>
              <div title={`Mål ${targetEff}%`} style={{position:"absolute",top:0,bottom:0,left:`${Math.min(100,targetEff)}%`,width:3,background:"#fff"}}/>
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:6}}>Produktionstid på færdige job ÷ arbejdstid × {numActiveMachines} maskiner siden 1. januar. Den hvide streg er målet.</div>
          </div>
        );
      })()}

      {soon.length>0&&<>
        <Title>Snart færdige · næste 3 timer</Title>
        {soon.map(({j,pg})=>(
          <div key={j.id} onClick={()=>onOpenJob(j)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",flexWrap:"wrap"}}>
            <span style={{fontSize:16,color:C.amber,fontFamily:"'Share Tech Mono',monospace",minWidth:70}}>{new Date(pg.finishAt).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}</span>
            <span style={{fontSize:15,color:C.text,fontWeight:700}}>{j.machine}</span>
            <span style={{fontSize:15,color:C.text}}>{j.job}</span>
            <span style={{fontSize:14,color:C.muted,flex:1}}>{j.customer} · {j.operatorName}</span>
            {pg.target&&<span style={{fontSize:14,color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{pg.target} stk</span>}
          </div>
        ))}
      </>}

      <Title right={<div style={{display:"flex",gap:6}}>{[["today","I dag"],["week","Uge"],["month","Måned"]].map(([k,l])=><button key={k} style={tag(period===k)} onClick={()=>setPeriod(k)}>{l}</button>)}</div>}>
        Maskiner og operatører · færdige job {periodName}
      </Title>
      {!periodDone.length&&<div style={{fontSize:15,color:C.muted}}>Ingen færdige job {periodName} endnu.</div>}
      {Object.entries(machMap).sort((a,b)=>b[1].run-a[1].run).map(([m,d])=>(
        <div key={m} style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:4}}><span style={{color:C.text}}>{m}</span><span style={{color:C.muted}}>{fmtHM(d.run)} produktion · {fmtHM(d.setup)} opstilling · {d.jobs} job · {d.pieces} stk</span></div>
          <div style={{display:"flex",height:8,background:C.raised,borderRadius:4,overflow:"hidden"}}>
            <div style={{width:`${d.setup/maxRun*100}%`,background:C.amber}}/>
            <div style={{width:`${d.run/maxRun*100}%`,background:C.green}}/>
          </div>
        </div>
      ))}
      {Object.keys(opMap).length>0&&<div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
        <thead><tr>{["Operatør","Job","Stk.","Produktion","Opstilling"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{Object.entries(opMap).sort((a,b)=>b[1].run-a[1].run).map(([n,d])=><tr key={n}><td style={td}>{n}</td><td style={td}>{d.jobs}</td><td style={td}>{d.pieces}</td><td style={{...td,color:C.green}}>{fmtHM(d.run)}</td><td style={{...td,color:C.amber}}>{fmtHM(d.setup)}</td></tr>)}</tbody>
      </table></div>}

      {downtimeLog.length>0&&<>
        <Title>Seneste nedetid</Title>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Maskine","Type","Varighed","Meldt af","Løst af","Dato"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{[...downtimeLog].sort((a,b)=>(b.resolvedAt||0)-(a.resolvedAt||0)).slice(0,5).map(d=>(
            <tr key={d.id}>
              <td style={td}>{d.machineName}</td>
              <td style={td}><span style={badge(d.status)}>{d.status==="down"?"Nede":"Reparation"}</span></td>
              <td style={{...td,color:C.amber}}>{fmtHM(d.downtimeSec)}</td>
              <td style={td}>{d.reportedBy}</td>
              <td style={td}>{d.resolvedBy}</td>
              <td style={{...td,color:C.muted,fontSize:13}}>{fmtDate(d.resolvedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>}
    </div>
  );
}
