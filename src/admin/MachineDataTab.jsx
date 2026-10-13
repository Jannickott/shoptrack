import { useState } from "react";
import { DonutChart } from "./AdminDash";
import { C, card, inp, badge } from "../lib/theme";
import { fmtHM, fmtDetail, fmtDate, jRunAll, jSetupAll, jobEfficiency, liveTime, calcAvailableWorkSec } from "../lib/util";

// ═══════════════════════════════════════════════════════
// MACHINE DATA TAB
// ═══════════════════════════════════════════════════════
export function MachineDataTab({jobs,machines,downtimeLog,machineIssues,efficiencyGoals,workHours,clock}){
  const [selected,setSelected]=useState(null);
  const [search,setSearch]=useState("");

  const _hiddenMachines=efficiencyGoals?.hiddenMachines||[];
  const allMachineNames=[...new Set([
    ...machines.filter(m=>m.active).map(m=>m.name),
    ...jobs.map(j=>j.machine),
  ])].filter(n=>!_hiddenMachines.includes(n)).sort();

  // Per-machine aggregate stats — downtime from timestamps, always accurate
  const now=Date.now();
  // Week start = last Monday 00:00
  const todayD=new Date(); const dow=todayD.getDay();
  const monday=new Date(todayD); monday.setDate(todayD.getDate()-((dow+6)%7)); monday.setHours(0,0,0,0);
  const weekStart=monday.getTime();

  const machStats={};
  allMachineNames.forEach(name=>{
    const mj=jobs.filter(j=>j.machine===name);
    const weekJobs=mj.filter(j=>(j.createdAt||0)>=weekStart);
    const logDown=downtimeLog.filter(d=>d.machineName===name).reduce((s,d)=>s+(d.downtimeSec||0),0);
    const activeIssue=machineIssues[name];
    const activeDown=activeIssue?(activeIssue.downtimeSec||0):0;
    const machDef=machines.find(m=>m.name===name);
    const weeklyTargetSec=(machDef?.weeklyTargetHours||0)*3600;
    const weekRunSec=weekJobs.reduce((s,j)=>{const lt=liveTime(j);return s+lt.run+lt.run2;},0);
    machStats[name]={
      setupSec:mj.reduce((s,j)=>{const lt=liveTime(j);return s+lt.setup+lt.setup2;},0),
      runSec:mj.reduce((s,j)=>{const lt=liveTime(j);return s+lt.run+lt.run2;},0),
      weekRunSec,
      weeklyTargetSec,
      downtimeSec:logDown+activeDown,
      totalJobs:mj.length,
      doneJobs:mj.filter(j=>j.status==="done").length,
      activeJobs:mj.filter(j=>j.status!=="done").length,
    };
  });

  const q=search.toLowerCase();
  const listJobs=jobs
    .filter(j=>!selected||j.machine===selected)
    .filter(j=>!q||(j.customer||"").toLowerCase().includes(q)||(j.job||"").toLowerCase().includes(q)||(j.operatorName||"").toLowerCase().includes(q))
    .sort((a,b)=>(b.completedAt||b.id)-(a.completedAt||a.id));

  const selStats=selected?machStats[selected]:null;

  return(
    <div style={{padding:"14px 16px"}}>

      {/* Machine chips */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {allMachineNames.map(name=>{
          const active=selected===name;
          const hasIssue=!!machineIssues[name];
          return(
            <button key={name} onClick={()=>setSelected(active?null:name)} style={{
              padding:"5px 12px",borderRadius:20,border:"1px solid",
              borderColor:active?C.blue:hasIssue?C.red:C.border,
              background:active?`${C.blue}22`:hasIssue?`${C.red}15`:C.surface,
              color:active?C.blue:hasIssue?C.red:C.muted,
              fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",gap:5,
            }}>
              {hasIssue&&<span style={{width:6,height:6,borderRadius:"50%",background:C.red,display:"inline-block"}}/>}
              {name}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{position:"relative",marginBottom:14}}>
        <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
        <input style={{...inp(),paddingLeft:32,fontSize:15}} placeholder="Søg kunde, jobnr., operatør…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:2}}><i className="ti ti-x"/></button>}
      </div>

      {/* Donut + issue history — only when one machine selected */}
      {selStats&&(
        <>
          {/* Stats card */}
          <div style={{...card(),marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{fontSize:16,color:C.text,fontWeight:700}}>{selected}</div>
            <div style={{display:"flex",gap:28,alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center"}}>
              <DonutChart title="Tidsfordeling" segments={[
                {label:"Opstilling",   color:C.amber, value:selStats.setupSec},
                {label:"Produktion",     color:C.green, value:selStats.runSec},
                {label:"Nedetid",color:C.red,   value:selStats.downtimeSec},
              ]}/>
              <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"center"}}>
                {[[selStats.totalJobs,"Job i alt",C.text,"ti-tool"],[selStats.doneJobs,"Afsluttet",C.green,"ti-check"],[selStats.activeJobs,"Aktive",C.amber,"ti-player-play"]].map(([v,l,c,ic])=>(
                  <div key={l} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <i className={`ti ${ic}`} style={{color:c,fontSize:16,width:16,textAlign:"center"}}/>
                    <span style={{fontSize:24,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700,lineHeight:1}}>{v}</span>
                    <span style={{fontSize:13,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                  </div>
                ))}
                {(()=>{
                  const goals=efficiencyGoals||{overall:80,machines:{},departments:{}};
                  const effTarget=goals.machines[selected]!==undefined?goals.machines[selected]:goals.overall;
                  const denom=selStats.runSec+selStats.setupSec+selStats.downtimeSec;
                  const effPct=denom>0?Math.round(selStats.runSec/denom*100):null;
                  const ec=effPct===null?C.muted:effPct>=effTarget?C.green:effPct>=effTarget-10?C.amber:C.red;
                  // Also compute work-hours-based efficiency for this year
                  const yStart=new Date(); yStart.setMonth(0,1); yStart.setHours(0,0,0,0);
                  const availSec=calcAvailableWorkSec(workHours,yStart.getTime(),Date.now());
                  const utilizPct=availSec>0?Math.round(selStats.runSec/availSec*100):null;
                  return(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,minWidth:160}}>
                      <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Effektivitet (al tid)</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                        <span style={{fontSize:24,color:ec,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{effPct!==null?effPct+"%":"–"}</span>
                        <span style={{fontSize:13,color:C.muted}}>mål {effTarget}%</span>
                      </div>
                      <div style={{height:6,borderRadius:3,background:C.raised,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${Math.min(effPct||0,100)}%`,background:ec,borderRadius:3,transition:"width .3s"}}/>
                      </div>
                      <div style={{fontSize:12,color:C.muted}}>Produktion ÷ (produktion + opstilling + nedetid)</div>
                      {utilizPct!==null&&<div style={{fontSize:13,color:C.muted,marginTop:4}}><i className="ti ti-calendar"/> Udnyttelse år til dato: <span style={{color:utilizPct>=effTarget?C.green:C.amber,fontWeight:700}}>{utilizPct}%</span> af arbejdstiden</div>}
                    </div>
                  );
                })()}
              {selStats.weeklyTargetSec>0&&(()=>{
                  const pct=Math.min(100,Math.round(selStats.weekRunSec/selStats.weeklyTargetSec*100));
                  const over=selStats.weekRunSec>=selStats.weeklyTargetSec;
                  const tgtColor=pct>=100?C.green:pct>=60?C.amber:C.red;
                  return(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,minWidth:160}}>
                      <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Denne uge mod mål</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                        <span style={{fontSize:18,color:tgtColor,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(selStats.weekRunSec)}</span>
                        <span style={{fontSize:13,color:C.muted}}>af {fmtHM(selStats.weeklyTargetSec)}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:C.raised,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${pct}%`,background:tgtColor,borderRadius:4,transition:"width .3s"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,color:tgtColor,fontWeight:700}}>{pct}%</span>
                        <span style={{fontSize:13,color:tgtColor}}>{over?"✓ Nået":`${fmtHM(selStats.weeklyTargetSec-selStats.weekRunSec)} tilbage`}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Active issue */}
          {machineIssues[selected]&&(()=>{
            const iss=machineIssues[selected];
            const liveSec=iss.downtimeSec||0;
            return(
              <div style={{background:`${C.red}10`,border:`1px solid ${C.red}40`,borderLeft:`3px solid ${C.red}`,borderRadius:8,padding:"10px 12px",marginBottom:12,display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:C.red,display:"inline-block"}}/>
                    <span style={{fontSize:14,color:C.red,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Aktiv fejl · {iss.status==="down"?"Maskine nede":"Skal repareres"}</span>
                  </div>
                  <span style={{fontSize:15,color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{fmtDetail(liveSec)}</span>
                </div>
                {iss.reason&&<div style={{fontSize:15,color:C.text,marginTop:2}}>{iss.reason}</div>}
                <div style={{fontSize:13,color:C.muted,marginTop:2}}>Meldt af {iss.reportedBy} · {fmtDate(iss.reportedAt)}</div>
              </div>
            );
          })()}

          {/* Issue history for selected machine */}
          {(()=>{
            const history=[...downtimeLog].filter(d=>d.machineName===selected).reverse();
            if(!history.length) return null;
            return(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
                  <i className="ti ti-history"/> Fejlhistorik · {history.length}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {history.map(d=>(
                    <div key={d.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.red}40`,borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:3}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{...badge("down"),fontSize:12}}>{d.status==="down"?"Maskine nede":"Skal repareres"}</span>
                          {d.reason&&<span style={{fontSize:15,color:C.text}}>{d.reason}</span>}
                        </div>
                        <span style={{fontSize:15,color:C.red,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{fmtHM(d.downtimeSec)}</span>
                      </div>
                      <div style={{fontSize:13,color:C.muted}}>
                        Reported by {d.reportedBy} · {fmtDate(d.reportedAt)}
                      </div>
                      <div style={{fontSize:13,color:C.muted}}>
                        Resolved by {d.resolvedBy} · {fmtDate(d.resolvedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Below-target efficiency section */}
      {!selected&&!search&&(()=>{
        const goals=efficiencyGoals||{overall:80,machines:{},departments:{}};
        const jobEff=jobEfficiency;
        // Per-machine efficiency = run / (run + setup + downtime) — uses machStats which already has downtimeSec
        const machEffs=allMachineNames.map(name=>{
          const s=machStats[name];
          const denom=s.runSec+s.setupSec+s.downtimeSec;
          if(denom===0) return null;
          const avg=Math.round(s.runSec/denom*100);
          const target=goals.machines[name]!==undefined?goals.machines[name]:goals.overall;
          return{name,avg,target,below:avg<target,jobs:s.totalJobs};
        }).filter(Boolean);
        const belowMachines=machEffs.filter(m=>m.below);
        // Below-target jobs use job-level ratio (run vs setup — downtime is machine-level)
        const belowJobs=jobs.filter(j=>{
          if(j.status!=="done") return false;
          const e=jobEff(j); if(e===null) return false;
          const target=goals.machines[j.machine]!==undefined?goals.machines[j.machine]:goals.overall;
          return e<target;
        }).sort((a,b)=>(jobEff(a)||0)-(jobEff(b)||0));
        if(!belowMachines.length&&!belowJobs.length) return null;
        return(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:13,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.red}40`}}>
              <i className="ti ti-alert-triangle"/> Under effektivitetsmål
            </div>
            {/* Machines below target */}
            {belowMachines.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginBottom:10}}>
                {belowMachines.map(m=>(
                  <div key={m.name} onClick={()=>setSelected(m.name)} style={{background:C.surface,border:`1px solid ${C.red}40`,borderLeft:`3px solid ${C.red}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}}>
                    <div style={{fontSize:15,color:C.text,fontWeight:700,marginBottom:4}}>{m.name}</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.muted,marginBottom:4}}>
                      <span>Gns. eff.</span><span style={{color:C.red,fontWeight:700}}>{m.avg}%</span>
                    </div>
                    <div style={{height:5,borderRadius:3,background:C.raised,overflow:"hidden",marginBottom:4}}>
                      <div style={{height:"100%",width:`${m.avg}%`,background:C.red,borderRadius:3}}/>
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>Mål {m.target}% · {m.jobs} job</div>
                  </div>
                ))}
              </div>
            )}
            {/* Individual jobs below target */}
            {belowJobs.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {belowJobs.slice(0,10).map(j=>{
                  const e=Math.round(jobEff(j));
                  const target=goals.machines[j.machine]!==undefined?goals.machines[j.machine]:goals.overall;
                  return(
                    <div key={j.id} style={{background:C.surface,border:`1px solid ${C.red}20`,borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,color:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer||j.job} <span style={{fontSize:13,color:C.muted,fontWeight:400}}>#{j.job}</span></div>
                        <div style={{fontSize:13,color:C.muted}}><i className="ti ti-robot"/> {j.machine} · <i className="ti ti-user"/> {j.operatorName}</div>
                        <div style={{display:"flex",gap:6,marginTop:3}}>
                          <span style={{fontSize:13,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(jSetupAll(j))}</span>
                          <span style={{fontSize:13,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(jRunAll(j))}</span>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:22,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{e}%</div>
                        <div style={{fontSize:12,color:C.muted}}>mål {target}%</div>
                        {j.completedAt&&<div style={{fontSize:12,color:C.muted}}>{fmtDate(j.completedAt)}</div>}
                      </div>
                    </div>
                  );
                })}
                {belowJobs.length>10&&<div style={{fontSize:14,color:C.muted,textAlign:"center",paddingTop:4}}>{belowJobs.length-10} mere — vælg en maskine for at se detaljer</div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Overview cards — all machines, no selection, no search */}
      {!selected&&!search&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10,marginBottom:16}}>
          {allMachineNames.map(name=>{
            const s=machStats[name];
            const hasIssue=!!machineIssues[name];
            const pastIssues=downtimeLog.filter(d=>d.machineName===name).length;
            const hasTgt=s.weeklyTargetSec>0;
            const pct=hasTgt?Math.min(100,Math.round(s.weekRunSec/s.weeklyTargetSec*100)):0;
            const tgtColor=pct>=100?C.green:pct>=60?C.amber:C.red;
            const goals=efficiencyGoals||{overall:80,machines:{},departments:{}};
            // Machine efficiency = run / (run + setup + downtime) — includes downtime losses
            const mTotalRun=s.runSec; const mTotalSetup=s.setupSec; const mTotalDown=s.downtimeSec;
            const mDenom=mTotalRun+mTotalSetup+mTotalDown;
            const mAvgEff=mDenom>0?Math.round(mTotalRun/mDenom*100):null;
            const mEffTarget=goals.machines[name]!==undefined?goals.machines[name]:goals.overall;
            const mEffColor=mAvgEff===null?C.muted:mAvgEff>=mEffTarget?C.green:mAvgEff>=mEffTarget-10?C.amber:C.red;
            return(
              <div key={name} onClick={()=>setSelected(name)} style={{
                background:C.surface,borderRadius:10,padding:12,cursor:"pointer",
                border:`1px solid ${hasIssue?C.red:C.border}`,
                borderTop:`3px solid ${hasIssue?C.red:s.activeJobs>0?C.green:C.border}`,
                display:"flex",flexDirection:"column",gap:6,
              }}>
                <div style={{fontSize:16,color:C.text,fontWeight:700}}>{name}</div>
                {hasIssue&&<span style={{...badge("down"),alignSelf:"flex-start"}}>Aktiv fejl</span>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(s.setupSec)}</span>
                  <span style={{fontSize:13,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(s.runSec)}</span>
                </div>
                {mAvgEff!==null&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:3}}><span>Eff. (alle job)</span><span style={{color:mEffColor,fontWeight:700}}>{mAvgEff}%</span></div>
                    <div style={{height:4,borderRadius:2,background:C.raised,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${mAvgEff}%`,background:mEffColor,borderRadius:2}}/>
                    </div>
                  </div>
                )}
                {s.downtimeSec>0&&<span style={{fontSize:13,color:C.red}}><i className="ti ti-alert-triangle"/> {fmtHM(s.downtimeSec)} nede</span>}
                {hasTgt&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:3}}>
                      <span>Denne uge</span><span style={{color:tgtColor}}>{pct}%</span>
                    </div>
                    <div style={{height:5,borderRadius:3,background:C.raised,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:tgtColor,borderRadius:3,transition:"width .3s"}}/>
                    </div>
                    <div style={{fontSize:12,color:C.muted,marginTop:3}}>{fmtHM(s.weekRunSec)} af {fmtHM(s.weeklyTargetSec)}</div>
                  </div>
                )}
                <div style={{fontSize:13,color:C.muted}}>{s.totalJobs} job · {s.activeJobs} aktive</div>
                {pastIssues>0&&<div style={{fontSize:13,color:C.muted}}><i className="ti ti-history"/> {pastIssues} tidligere fejl</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Job list */}
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
        {selected?`${selected} — `:"Alle maskiner — "}{listJobs.length} Job
      </div>
      {!listJobs.length&&(
        <div style={{textAlign:"center",padding:"30px 16px",color:C.muted,fontSize:15}}>
          <i className="ti ti-search-off" style={{fontSize:28,display:"block",marginBottom:10,opacity:0.3}}/>Ingen job fundet.
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {listJobs.map(j=>(
          <div key={j.id} style={{...card(),display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                {(j.status==="side2_setup"||j.status==="side2_run")
                  ?<span style={{...badge(j.status==="side2_setup"?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> {j.status==="side2_setup"?"S2 opstilling":"S2 produktion"}</span>
                  :<span style={badge(j.status)}>{j.status==="setup"?"Opstilling":j.status==="run"?"Kører":"Færdig"}</span>}
                {j.paused&&<span style={badge("down")}>Nede</span>}
                {j.logoutPaused&&<span style={badge("")}>På pause</span>}
                {!selected&&<span style={{fontSize:13,color:C.muted,background:C.raised,padding:"2px 7px",borderRadius:10}}>{j.machine}</span>}
              </div>
              {j.customer&&<div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.customer}</div>}
              <div style={{fontSize:14,color:C.muted}}><i className="ti ti-hash"/> {j.job}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:1}}><i className="ti ti-user"/> {j.operatorName}</div>
              {j.twoSided&&j.status==="done"?(
                <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:6}}>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:1}}>S1</span>
                    <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                    <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                    {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
                    {j.pieces>0&&<span style={{fontSize:13,color:C.amber,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.blue,fontWeight:700,letterSpacing:1}}>S2</span>
                    <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec2||0)}</span>
                    <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec2||0)}</span>
                    {j.pieces2>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces2} stk</span>}
                    {j.pieces2>0&&<span style={{fontSize:13,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/stk</span>}
                  </div>
                  {j.deburSec>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.deburr,fontWeight:700,letterSpacing:1}}>AG</span>
                    <span style={{fontSize:14,color:C.deburr}}><i className="ti ti-tool"/> {fmtHM(j.deburSec)}</span>
                  </div>}
                </div>
              ):(
                <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                  <span style={{fontSize:14,color:j.status==="setup"?C.muted:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                  {j.deburSec>0&&<span style={{fontSize:14,color:C.deburr}}><i className="ti ti-tool"/> {fmtHM(j.deburSec)}</span>}
                  {j.pieces>0&&<span style={{fontSize:14,color:C.blue}}><i className="ti ti-box"/> {j.pieces} stk</span>}
                  {j.pieces>0&&<span style={{fontSize:14,color:C.muted,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,marginLeft:10,flexShrink:0}}>
              <div style={{display:"flex",gap:4}}>
                {j.photoData&&<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:42,height:42,borderRadius:6,objectFit:"cover",border:j.twoSided?`1px solid ${C.blue}`:undefined}}/>}
                {j.twoSided&&j.photoData2&&<img src={j.photoData2} title="Side 2" style={{width:42,height:42,borderRadius:6,objectFit:"cover",border:`1px solid ${C.blue}`}}/>}
              </div>
              {j.twoSided&&<span style={{fontSize:12,color:C.blue,letterSpacing:1}}><i className="ti ti-layers-intersect"/> 2 SIDER</span>}
              {j.completedAt&&<span style={{fontSize:13,color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(j.completedAt)}</span>}
              {(()=>{
                const ef=jobEfficiency(j);
                if(ef===null||j.status!=="done") return null;
                const e=Math.round(ef);
                const goals=efficiencyGoals||{overall:80,machines:{},departments:{}};
                const tgt=goals.machines[j.machine]!==undefined?goals.machines[j.machine]:goals.overall;
                const ec=e>=tgt?C.green:e>=tgt-10?C.amber:C.red;
                return <span style={{fontSize:14,color:ec,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{e}%</span>;
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
