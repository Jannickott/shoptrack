import { C, card, badge, th, td } from "../lib/theme";
import { fmt, fmtHM, fmtDate, toDateInput, jRunAll, jSetupAll, jobEfficiency, liveTime, calcAvailableWorkSec } from "../lib/util";

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

export function AdminDash({jobs,machineIssues,downtimeLog,setJobs,setCompleteId,users,machines,tools,efficiencyGoals,workHours}){
  // Task jobs (Opgaver) are shown as active but kept out of every figure
  const statJobs=jobs.filter(j=>!j.taskId);
  const done=statJobs.filter(j=>j.status==="done"); const active=sortActive(jobs.filter(j=>j.status!=="done"));
  // Efficiency helpers
  const jobEff=jobEfficiency;
  const targetEff=efficiencyGoals?.overall??80;
  // YTD real efficiency: total run time / (available work hours × active machines) — includes work hours + downtime losses
  const yearStart=new Date(); yearStart.setMonth(0,1); yearStart.setHours(0,0,0,0);
  const yearStartMs=yearStart.getTime();
  const nowMs=Date.now();
  const yearStr=String(new Date().getFullYear());
  const yearDone=done.filter(j=>j.completedAt&&String(new Date(j.completedAt).getFullYear())===yearStr);
  const _hiddenGoalMachines=efficiencyGoals?.hiddenMachines||[];
  const numActiveMachines=Math.max(machines.filter(m=>m.active&&!_hiddenGoalMachines.includes(m.name)).length,1);
  const availableWorkSec=calcAvailableWorkSec(workHours,yearStartMs,nowMs);
  const totalAvailSec=availableWorkSec*numActiveMachines;
  const yearRunSec=yearDone.reduce((s,j)=>s+jRunAll(j),0);
  const realEff=totalAvailSec>0?Math.round(yearRunSec/totalAvailSec*100):null;
  // Below-target jobs use job-level efficiency (run vs setup ratio)
  const belowTarget=done.filter(j=>{const e=jobEff(j);return e!==null&&e<targetEff;});
  const machMap={};done.forEach(j=>{if(!machMap[j.machine])machMap[j.machine]={run:0,setup:0,jobs:0};machMap[j.machine].run+=jRunAll(j);machMap[j.machine].setup+=jSetupAll(j);machMap[j.machine].jobs++;});
  const maxRun=Math.max(...Object.values(machMap).map(m=>m.run),1);
  const opMap={};done.forEach(j=>{if(!opMap[j.operatorName])opMap[j.operatorName]={jobs:0,pieces:0,run:0};opMap[j.operatorName].jobs++;opMap[j.operatorName].pieces+=j.pieces||0;opMap[j.operatorName].run+=jRunAll(j);});
  const issueEntries=Object.entries(machineIssues);
  // Chart data
  const todayStr=toDateInput(nowMs);
  const monthStr=todayStr.slice(0,7);
  // Week: Monday → today
  const todayDate=new Date(); const dayOfWeek=todayDate.getDay();
  const monday=new Date(todayDate); monday.setDate(todayDate.getDate()-((dayOfWeek+6)%7)); monday.setHours(0,0,0,0);
  const weekStart=monday.getTime();
  const weekJobs=statJobs.filter(j=>(j.createdAt||0)>=weekStart);
  const monthJobs=statJobs.filter(j=>toDateInput(j.createdAt).startsWith(monthStr));
  // Use liveTime so donut values update every second for running jobs
  const jSetup=j=>{const lt=liveTime(j);return lt.setup+lt.setup2;};
  const jRun=j=>{const lt=liveTime(j);return lt.run+lt.run2;};
  const weekDowntime=
    downtimeLog.filter(d=>(d.resolvedAt||0)>=weekStart).reduce((s,d)=>s+d.downtimeSec,0)+
    Object.values(machineIssues).filter(i=>(i.reportedAt||0)>=weekStart).reduce((s,i)=>s+(i.downtimeSec||0),0);
  const monthDowntime=
    downtimeLog.filter(d=>toDateInput(d.resolvedAt).startsWith(monthStr)).reduce((s,d)=>s+d.downtimeSec,0)+
    Object.values(machineIssues).filter(i=>toDateInput(i.reportedAt).startsWith(monthStr)).reduce((s,i)=>s+(i.downtimeSec||0),0);
  // Full week capacity: Monday 00:00 → next Monday 00:00 (weekend days contribute 0 via workHours)
  const weekEnd=new Date(monday); weekEnd.setDate(monday.getDate()+7);
  const wkTotalAvailSec=calcAvailableWorkSec(workHours,weekStart,weekEnd.getTime())*numActiveMachines;
  // Full month capacity: first of month → first of next month
  const monthStart=new Date(nowMs); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const monthEnd=new Date(monthStart); monthEnd.setMonth(monthStart.getMonth()+1);
  const moTotalAvailSec=calcAvailableWorkSec(workHours,monthStart.getTime(),monthEnd.getTime())*numActiveMachines;
  return(
    <div style={{padding:"14px 16px"}}>
      {/* Week + Month donuts — full period capacity, run hours only */}
      {(()=>{
        const weekTarget=efficiencyGoals?.week??75;
        const monthTarget=efficiencyGoals?.month??78;
        const wkSetup=weekJobs.reduce((s,j)=>s+jSetup(j),0);
        const wkRun=weekJobs.reduce((s,j)=>s+jRun(j),0);
        const wkEff=wkTotalAvailSec>0?Math.round(wkRun/wkTotalAvailSec*100):null;
        const moSetup=monthJobs.reduce((s,j)=>s+jSetup(j),0);
        const moRun=monthJobs.reduce((s,j)=>s+jRun(j),0);
        const moEff=moTotalAvailSec>0?Math.round(moRun/moTotalAvailSec*100):null;
        const segs=(run,setup,down,total)=>[
          {label:"Ledig",value:Math.max(0,total-run-setup-down),color:C.border},
          {label:"Fejl",   value:down,                             color:C.red},
          {label:"Opstilling",    value:setup,                            color:C.amber},
          {label:"Produktion",      value:run,                              color:C.green},
        ];
        const EffLine=({eff,target,runSec,totalSec})=>{
          if(eff===null) return null;
          const c=eff>=target?C.green:eff>=target-10?C.amber:C.red;
          return(
            <div style={{marginTop:6,textAlign:"center"}}>
              <span style={{fontSize:20,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{eff}%</span>
              <span style={{fontSize:12,color:C.muted,marginLeft:6}}>mål {target}% · {fmtHM(runSec)} / {fmtHM(totalSec)}</span>
            </div>
          );
        };
        return(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16,background:C.raised,borderRadius:10,padding:"14px 12px",border:`1px solid ${C.border}`}}>
            <div>
              <DonutChart title="Denne uge" segments={segs(wkRun,wkSetup,weekDowntime,wkTotalAvailSec)}/>
              <EffLine eff={wkEff} target={weekTarget} runSec={wkRun} totalSec={wkTotalAvailSec}/>
            </div>
            <div>
              <DonutChart title="Denne måned" segments={segs(moRun,moSetup,monthDowntime,moTotalAvailSec)}/>
              <EffLine eff={moEff} target={monthTarget} runSec={moRun} totalSec={moTotalAvailSec}/>
            </div>
          </div>
        );
      })()}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
        {[
          [active.length,"Aktive job",C.amber],
          [done.length,"Afsluttet",C.green],
          [targetEff+"%","Årsmål",C.green],
          [realEff!==null?realEff+"%":"–","Reel effektivitet (år til dato)",realEff===null?C.muted:realEff>=targetEff?C.green:C.red],
          [belowTarget.length,"Under mål",belowTarget.length>0?C.red:C.green],
          ["–","Kommer snart",C.muted],
        ].map(([v,l,c])=>(
          <div key={l} style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center"}}><div style={{fontSize:26,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{v}</div><div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{l}</div></div>
        ))}
      </div>
      {issueEntries.length>0&&<>
        <div style={{fontSize:13,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.red}40`}}>
          <i className="ti ti-alert-triangle"/> Maskinfejl · {issueEntries.length}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {issueEntries.map(([name,issue])=>(
            <div key={name} style={card(issue.status==="down"?C.red:C.amber)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                <div style={{fontSize:15,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                <span style={badge(issue.status==="down"?"down":"repair")}>{issue.status==="down"?"Nede":"Reparation"}</span>
              </div>
              <div style={{fontSize:13,color:C.muted,marginTop:6}}><i className="ti ti-user"/> {issue.reportedBy}</div>
              <div style={{fontSize:13,color:C.muted}}><i className="ti ti-calendar"/> {fmtDate(issue.reportedAt)}</div>
              {issue.reason&&<div style={{marginTop:6,fontSize:13,color:C.text,borderTop:`1px solid ${C.border}`,paddingTop:6}}>{issue.reason}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Live</div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:C.red,display:"inline-block"}}/>
                  <span style={{fontSize:16,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(issue.downtimeSec||0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>}
      {(()=>{const lowT=(tools||[]).filter(t=>t.active&&t.quantity<=(t.minQuantity||0));if(!lowT.length)return null;return(<>
        <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.amber}40`}}>
          <i className="ti ti-tool"/> Værktøj der skal bestilles · {lowT.length}
        </div>
        <div style={{marginBottom:16}}>
          {lowT.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,background:C.raised,borderRadius:8,padding:"8px 10px",marginBottom:6,border:`1px solid ${t.ordered?"#3b82f640":C.amber+"30"}`}}>
              <div style={{flex:1,fontSize:15,color:C.text,fontWeight:600}}>{t.name}</div>
              {t.ordered
                ?<span style={{fontSize:12,fontWeight:700,color:"#3b82f6",background:"rgba(59,130,246,.15)",borderRadius:4,padding:"2px 6px",letterSpacing:.5,whiteSpace:"nowrap"}}><i className="ti ti-checks"/> BESTILT</span>
                :<span style={{fontSize:12,fontWeight:700,color:C.amber,background:"rgba(240,165,0,.15)",borderRadius:4,padding:"2px 6px",letterSpacing:.5,whiteSpace:"nowrap"}}>SKAL BESTILLES</span>}
              <div style={{fontSize:14,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700,whiteSpace:"nowrap"}}>{t.quantity} tilbage</div>
            </div>
          ))}
        </div>
      </>);})()}
      {active.length>0&&<>
        <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Aktive job lige nu · {active.length}</div>
        <ActiveJobsGrid jobs={active} renderCard={j=>{
          const nightColor="#7c5cbf";
          const nightArmed=j.nightMode&&!j.nightModeEndsAt&&!j.nightModeDone;
          const nightActive=j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone;
          const nightRemaining=nightActive?Math.max(0,Math.round((j.nightModeEndsAt-Date.now())/1000)):0;
          const pauseColor=j.paused?C.red:(j.logoutPaused&&!nightActive)?C.muted:null;
          const jIsSetup=j.status==="setup"||j.status==="side2_setup";
          const jIsSide2=j.status==="side2_setup"||j.status==="side2_run";
          const accentColor=pauseColor||(nightActive||nightArmed?nightColor:jIsSetup?C.amber:jIsSide2?C.blue:C.green);
          return(
          <div key={j.id} style={card(accentColor)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
              <div style={{minWidth:0}}>
                {j.customer&&<div style={{fontSize:15,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
                <div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                {j.paused&&<span style={badge("down")}>Nede</span>}
                {j.logoutPaused&&!nightActive&&<span style={badge("")}>På pause</span>}
                {nightActive&&<span style={{...badge("admin"),background:"rgba(124,92,191,.2)",color:nightColor,borderColor:"rgba(124,92,191,.4)",fontSize:11}}><i className="ti ti-moon"/> Nat</span>}
                {nightArmed&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor,fontSize:11}}><i className="ti ti-moon"/> Klar</span>}
                {!j.nightMode&&!j.paused&&!j.logoutPaused&&(jIsSide2
                  ?<span style={{...badge(jIsSetup?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)",fontSize:11}}>{jIsSetup?"S2 opstilling":"S2 produktion"}</span>
                  :<span style={badge(j.status)}>{jIsSetup?"Opstilling":"Produktion"}</span>)}
              </div>
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:6}}><i className="ti ti-robot"/> {j.machine}</div>
            <div style={{fontSize:13,color:C.muted}}><i className="ti ti-user"/> {j.operatorName}</div>
            {nightActive?(
              <div style={{marginTop:6,background:"rgba(124,92,191,.1)",border:`1px solid rgba(124,92,191,.25)`,borderRadius:6,padding:"5px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:nightColor,letterSpacing:1,textTransform:"uppercase"}}><i className="ti ti-moon-stars"/> Slutter om</span>
                <span style={{fontSize:17,color:nightColor,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmt(nightRemaining)}</span>
              </div>
            ):(
              <div style={{fontSize:20,color:pauseColor||accentColor,fontFamily:"'Share Tech Mono',monospace",marginTop:6,textAlign:"right"}}>
                {fmtHM(jIsSetup?(jIsSide2?liveTime(j).setup2:liveTime(j).setup):(jIsSide2?liveTime(j).run2:liveTime(j).run))}
              </div>
            )}
          </div>
        );}}/>
      </>}
      {Object.keys(machMap).length>0&&<><div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Produktionstid pr. maskine</div>
        {Object.entries(machMap).sort((a,b)=>b[1].run-a[1].run).map(([m,d])=>(
          <div key={m} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:4}}><span style={{color:C.text}}>{m}</span><span style={{color:C.muted}}>{fmtHM(d.run)} produktion · {d.jobs} job</span></div>
            <div style={{height:6,background:C.raised,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:C.green,width:`${(d.run/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{height:4,background:C.raised,borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",background:C.amber,width:`${(d.setup/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{fontSize:12,color:C.muted,marginTop:2,letterSpacing:1}}><span style={{color:C.green}}>■</span> Produktion &nbsp;<span style={{color:C.amber}}>■</span> Opstilling</div>
          </div>
        ))}</>}
      {Object.keys(opMap).length>0&&<><div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Operatøroversigt</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}><thead><tr>{["Operatør","Job","Stk.","Gns. produktion"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{Object.entries(opMap).map(([n,d])=><tr key={n}><td style={td}>{n}</td><td style={td}>{d.jobs}</td><td style={td}>{d.pieces}</td><td style={td}>{fmtHM(Math.round(d.run/d.jobs))}</td></tr>)}</tbody></table></div></>}


      {downtimeLog.length>0&&<>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Nedetidslog</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr>{["Maskine","Type","Varighed","Meldt af","Løst af","Dato"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{[...downtimeLog].reverse().slice(0,4).map(d=>(
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
