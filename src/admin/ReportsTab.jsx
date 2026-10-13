import { useState } from "react";
import { C, card, inp, sel, btn, label, th, td } from "../lib/theme";
import { fmtHM, fmtDate, jRunAll, jSetupAll, calcAvailableWorkSec } from "../lib/util";

// ═══════════════════════════════════════════════════════
// REPORTS — date range + filters + export
// ═══════════════════════════════════════════════════════
export function ReportsTab({jobs,machines,departments,efficiencyGoals,workHours,downtimeLog}){
  const MONTHS=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  const done=jobs.filter(j=>j.status==='done');
  const allMachNames=[...new Set([...machines.filter(m=>m.active).map(m=>m.name),...done.map(j=>j.machine)])].sort();
  const allDepts=departments||[];
  const dl=downtimeLog||[];

  const [mode,setMode]=useState('machine');
  const [period,setPeriod]=useState('month');
  const [count,setCount]=useState(6);
  const [entityA,setEntityA]=useState('');
  const [entityB,setEntityB]=useState('');
  const [showAll,setShowAll]=useState(false);
  const [jobSearch,setJobSearch]=useState('');
  const [machFilter,setMachFilter]=useState('all');
  const [weekNumInput,setWeekNumInput]=useState('');

  // ISO week helpers
  const getISOWeek=d=>{const t=new Date(d);t.setHours(0,0,0,0);t.setDate(t.getDate()+3-((t.getDay()+6)%7));const w1=new Date(t.getFullYear(),0,4);return 1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);};
  const isoWeekToMonday=(year,week)=>{const jan4=new Date(year,0,4);const dow=jan4.getDay()||7;const m=new Date(jan4);m.setDate(jan4.getDate()-dow+1+(week-1)*7);m.setHours(0,0,0,0);return m;};
  const currentISOWeek=getISOWeek(new Date());
  const weekRefMonday=weekNumInput?isoWeekToMonday(new Date().getFullYear(),parseInt(weekNumInput)):null;

  const entityJobs=name=>{
    if(mode==='machine') return jobs.filter(j=>j.machine===name);
    const ms=machines.filter(m=>m.department===name).map(m=>m.name);
    return jobs.filter(j=>ms.includes(j.machine));
  };

  // Same formula as dashboard: run / (availableWorkSec × machineCount)
  // Uses createdAt so jobs belong to the week they were started (matches dashboard)
  const bucketStats=(name,b)=>{
    const inRange=j=>(j.createdAt||0)>=b.start&&(j.createdAt||0)<b.end;
    const ej=entityJobs(name).filter(inRange);
    const runSec=ej.reduce((s,j)=>s+jRunAll(j),0);
    const setupSec=ej.reduce((s,j)=>s+jSetupAll(j),0);
    let machCount,machNames;
    if(mode==='machine'){machCount=1;machNames=[name];}
    else{machNames=machines.filter(m=>m.active&&m.department===name).map(m=>m.name);machCount=Math.max(machNames.length,1);}
    const issueSec=dl.filter(d=>(machNames.length===0||machNames.includes(d.machineName))&&(d.resolvedAt||0)>=b.start&&(d.resolvedAt||0)<b.end).reduce((s,d)=>s+(d.downtimeSec||0),0);
    const availSec=Math.max(calcAvailableWorkSec(workHours||{},b.start,b.end)*machCount,1);
    const eff=Math.round(runSec/availSec*100);
    return{runSec,setupSec,issueSec,availSec,eff};
  };

  // For job mode: keep run/(run+setup) ratio (comparing across machines for one job)
  const jEff=j=>{const t=jRunAll(j)+jSetupAll(j);return t>0?Math.round(jRunAll(j)/t*100):null;};
  const avgEff=arr=>{const v=arr.map(j=>jEff(j)).filter(e=>e!==null);return v.length?Math.round(v.reduce((s,e)=>s+e,0)/v.length):null;};

  const getBuckets=()=>{
    const now=new Date(); const res=[];
    for(let i=count-1;i>=0;i--){
      let start,end,label;
      if(period==='week'){
        // If a week number was entered, start from that week; otherwise start from current week
        const baseMonday=weekRefMonday||new Date(now);
        if(!weekRefMonday){baseMonday.setDate(now.getDate()-((now.getDay()+6)%7));baseMonday.setHours(0,0,0,0);}
        const mon=new Date(baseMonday); mon.setDate(baseMonday.getDate()-i*7);
        const nxt=new Date(mon); nxt.setDate(mon.getDate()+7);
        start=mon.getTime(); end=nxt.getTime();
        const wn=getISOWeek(mon);
        label=`W${wn}`;
      } else if(period==='month'){
        const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        const nxt=new Date(d.getFullYear(),d.getMonth()+1,1);
        start=d.getTime(); end=nxt.getTime();
        label=MONTHS[d.getMonth()]+(d.getMonth()===0||i===count-1?` '${String(d.getFullYear()).slice(2)}`:'');
      } else {
        const yr=now.getFullYear()-i;
        start=new Date(yr,0,1).getTime(); end=new Date(yr+1,0,1).getTime(); label=String(yr);
      }
      res.push({start,end,label});
    }
    return res;
  };

  const getTarget=(entityName)=>{
    const goals=efficiencyGoals||{};
    if(entityName&&mode==='machine'&&goals.machines?.[entityName]!=null) return goals.machines[entityName];
    if(entityName&&mode==='department'&&goals.departments?.[entityName]!=null) return goals.departments[entityName];
    if(period==='week') return goals.week??75;
    if(period==='month') return goals.month??78;
    return goals.overall??80;
  };
  const targetEff=getTarget(entityA||null);

  const hasB=!!entityB&&mode!=='job'&&!showAll;
  const buckets=getBuckets();

  let chartData=[];
  if(mode==='job'){
    const q=jobSearch.toLowerCase().trim();
    if(q){
      const matched=done
        .filter(j=>(j.job||'').toLowerCase().includes(q)||(j.customer||'').toLowerCase().includes(q))
        .filter(j=>machFilter==='all'||j.machine===machFilter);
      const byMach={};
      matched.forEach(j=>{if(!byMach[j.machine])byMach[j.machine]=[];byMach[j.machine].push(j);});
      chartData=Object.entries(byMach).sort((a,b)=>b[1].length-a[1].length).map(([mach,mj])=>({
        label:mach,sA:{eff:avgEff(mj),runSec:mj.reduce((s,j)=>s+jRunAll(j),0),setupSec:mj.reduce((s,j)=>s+jSetupAll(j),0),issueSec:0,availSec:mj.reduce((s,j)=>s+jRunAll(j)+jSetupAll(j),1)},countA:mj.length
      }));
    }
  } else if(showAll){
    const entities=mode==='machine'?allMachNames:allDepts;
    const b=buckets[buckets.length-1];
    chartData=entities.map(name=>({label:name,sA:bucketStats(name,b)}));
  } else if(entityA){
    chartData=buckets.map(b=>({
      label:b.label,
      sA:bucketStats(entityA,b),
      sB:entityB?bucketStats(entityB,b):null,
    }));
  }

  // SVG chart dimensions
  const W=560,H=220,ML=42,MT=14,MR=52,MB=50;
  const cW=W-ML-MR, cH=H-MT-MB;
  const n=Math.max(chartData.length,1);
  const grpW=cW/n;
  const barW=Math.min(hasB?grpW*0.34:grpW*0.52,36);
  const yPct=v=>MT+cH*(1-v/100);
  const xCtr=i=>ML+grpW*(i+0.5);
  const rotLabels=count>8||mode==='job'||showAll;

  const showChart=(mode==='job'?jobSearch.trim().length>0:showAll||!!entityA)&&chartData.length>0;

  const drawBar=(stats,bx,cntY)=>{
    if(!stats) return null;
    const{runSec=0,setupSec=0,issueSec=0,availSec=1,eff=0}=stats;
    if(availSec<=0) return null;
    const runPct=Math.min(runSec/availSec,1);
    const setupPct=Math.min(setupSec/availSec,Math.max(1-runPct,0));
    const issuePct=Math.min(issueSec/availSec,Math.max(1-runPct-setupPct,0));
    const freePct=Math.max(1-runPct-setupPct-issuePct,0);
    const freeH=cH*freePct, issueH=cH*issuePct, setupH=cH*setupPct, runH=cH*runPct;
    const y0=MT, y1=y0+freeH, y2=y1+issueH, y3=y2+setupH;
    const inside=runH>14;
    return(
      <g>
        {freeH>0.5&&<rect x={bx-barW/2} y={y0} width={barW} height={freeH} fill={C.border} fillOpacity={0.5} rx={2}/>}
        {issueH>0.5&&<rect x={bx-barW/2} y={y1} width={barW} height={issueH} fill={C.red} fillOpacity={0.85}/>}
        {setupH>0.5&&<rect x={bx-barW/2} y={y2} width={barW} height={setupH} fill={C.amber} fillOpacity={0.85}/>}
        {runH>0.5&&<rect x={bx-barW/2} y={y3} width={barW} height={runH} fill={C.green} fillOpacity={0.88} rx={2}/>}
        <text x={bx} y={inside?y3+runH/2+3.5:y3-3} textAnchor="middle" fontSize={9} fill={inside?'#fff':C.green} fontWeight="700">{eff}%</text>
        {cntY&&<text x={bx} y={cntY} textAnchor="middle" fontSize={7} fill={C.muted}>{stats.count||''}</text>}
      </g>
    );
  };

  // Weekly PDF report: last 12 weeks to choose from (the server builds the PDF)
  const reportWeeks=[...Array(12)].map((_,i)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)-7*i);return{start:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,week:getISOWeek(d),label:d.toLocaleDateString('da-DK',{day:'numeric',month:'short'})};});
  const [reportStart,setReportStart]=useState(reportWeeks[1].start);

  return(
    <div style={{padding:'14px 16px'}}>
      <div style={{...card(),display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <i className="ti ti-file-type-pdf" style={{fontSize:24,color:C.amber}}/>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:15,color:C.text,fontWeight:700}}>Ugerapport</div>
          <div style={{fontSize:13,color:C.muted}}>Laves også automatisk hver mandag morgen for sidste uge</div>
        </div>
        <select style={{...sel(),width:'auto',minWidth:200}} value={reportStart} onChange={e=>setReportStart(e.target.value)}>
          {reportWeeks.map((w,i)=><option key={w.start} value={w.start}>Uge {w.week} · fra {w.label}{i===0?' (denne uge)':i===1?' (sidste uge)':''}</option>)}
        </select>
        <button style={btn('primary',false,true)} onClick={()=>window.open(`/api/report/week?start=${reportStart}`,'_blank')}><i className="ti ti-download"/> Hent PDF</button>
      </div>
      {/* Mode + period controls */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        {[['machine','ti-robot','Maskine'],['department','ti-tag','Afdeling'],['job','ti-search','Job / tegningsnr.']].map(([m,ic,lb])=>(
          <button key={m} onClick={()=>{setMode(m);setEntityA('');setEntityB('');setJobSearch('');setShowAll(false);setMachFilter('all');}}
            style={{padding:'6px 12px',borderRadius:8,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:mode===m?700:400,
              border:`1px solid ${mode===m?C.blue:C.border}`,background:mode===m?`${C.blue}22`:C.surface,color:mode===m?C.blue:C.muted}}>
            <i className={`ti ${ic}`}/>{lb}
          </button>
        ))}
        <div style={{flex:1}}/>
        {mode!=='job'&&(
          <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
            {['week','month','year'].map(p=>(
              <button key={p} onClick={()=>setPeriod(p)}
                style={{padding:'4px 9px',borderRadius:6,fontSize:13,cursor:'pointer',fontWeight:period===p?700:400,
                  border:`1px solid ${period===p?C.amber:C.border}`,background:period===p?`${C.amber}22`:C.surface,color:period===p?C.amber:C.muted}}>
                {p==='week'?'Uge':p==='month'?'Måned':'År'}
              </button>
            ))}
            <select style={{...sel(),fontSize:13,padding:'4px 6px'}} value={count} onChange={e=>setCount(Number(e.target.value))}>
              {[4,6,8,12,24].map(v=><option key={v} value={v}>Sidste {v}</option>)}
            </select>
            {period==='week'&&(
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                <span style={{fontSize:13,color:C.muted,whiteSpace:'nowrap'}}>Uge nr.</span>
                <input
                  type="number" min="1" max="53"
                  placeholder={String(currentISOWeek)}
                  value={weekNumInput}
                  onChange={e=>setWeekNumInput(e.target.value)}
                  style={{...inp(),width:52,fontSize:13,padding:'3px 6px',textAlign:'center'}}
                />
                {weekNumInput&&<button onClick={()=>setWeekNumInput('')} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:15,padding:0}}><i className="ti ti-x"/></button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entity pickers */}
      {mode==='machine'&&(
        <div style={{marginBottom:14}}>
          <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
            <button onClick={()=>{setShowAll(!showAll);setEntityA('');setEntityB('');}}
              style={{padding:'5px 12px',borderRadius:7,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:showAll?700:400,
                border:`1px solid ${showAll?C.green:C.border}`,background:showAll?`${C.green}22`:C.surface,color:showAll?C.green:C.muted}}>
              <i className="ti ti-layout-grid"/> Alle maskiner
            </button>
            {showAll&&<span style={{fontSize:13,color:C.muted}}>Viser {allMachNames.length} maskiner · {period==='week'?'denne uge':period==='month'?'denne måned':'dette år'}</span>}
          </div>
          {!showAll&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={label}>Maskine A <span style={{color:C.blue,fontSize:13}}>●</span></label>
              <select style={sel()} value={entityA} onChange={e=>setEntityA(e.target.value)}>
                <option value=''>— Vælg maskine —</option>
                {allMachNames.filter(n=>n!==entityB).map(n=><option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Maskine B <span style={{color:C.amber,fontSize:13}}>●</span> <span style={{color:C.muted,fontWeight:400}}>(valgfri)</span></label>
              <select style={sel()} value={entityB} onChange={e=>setEntityB(e.target.value)}>
                <option value=''>— Ingen (kun udvikling) —</option>
                {allMachNames.filter(n=>n!==entityA).map(n=><option key={n}>{n}</option>)}
              </select>
            </div>
          </div>}
        </div>
      )}
      {mode==='department'&&(
        <div style={{marginBottom:14}}>
          <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
            <button onClick={()=>{setShowAll(!showAll);setEntityA('');setEntityB('');}}
              style={{padding:'5px 12px',borderRadius:7,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:showAll?700:400,
                border:`1px solid ${showAll?C.green:C.border}`,background:showAll?`${C.green}22`:C.surface,color:showAll?C.green:C.muted}}>
              <i className="ti ti-layout-grid"/> Alle afdelinger
            </button>
            {showAll&&<span style={{fontSize:13,color:C.muted}}>Viser {allDepts.length} afdelinger · {period==='week'?'denne uge':period==='month'?'denne måned':'dette år'}</span>}
          </div>
          {!showAll&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={label}>Afdeling A <span style={{color:C.blue,fontSize:13}}>●</span></label>
              <select style={sel()} value={entityA} onChange={e=>setEntityA(e.target.value)}>
                <option value=''>— Vælg afdeling —</option>
                {allDepts.filter(d=>d!==entityB).map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Afdeling B <span style={{color:C.amber,fontSize:13}}>●</span> <span style={{color:C.muted,fontWeight:400}}>(valgfri)</span></label>
              <select style={sel()} value={entityB} onChange={e=>setEntityB(e.target.value)}>
                <option value=''>— Ingen (kun udvikling) —</option>
                {allDepts.filter(d=>d!==entityA).map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
          </div>}
        </div>
      )}
      {mode==='job'&&(
        <div style={{marginBottom:14}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
            <div>
              <label style={label}>Jobnummer / tegningsnr. / kunde</label>
              <div style={{position:'relative'}}>
                <i className="ti ti-search" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:C.muted,fontSize:16,pointerEvents:'none'}}/>
                <input style={{...inp(),paddingLeft:32,fontSize:15}} placeholder="Søg jobnr., tegningsnr., kunde…"
                  value={jobSearch} onChange={e=>setJobSearch(e.target.value)}/>
                {jobSearch&&<button onClick={()=>setJobSearch('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16}}><i className="ti ti-x"/></button>}
              </div>
            </div>
            <div>
              <label style={label}>Maskine</label>
              <select style={{...sel(),minWidth:130}} value={machFilter} onChange={e=>setMachFilter(e.target.value)}>
                <option value='all'>Alle maskiner</option>
                {allMachNames.map(n=><option key={n}>{n}</option>)}
              </select>
            </div>
          </div>
          {jobSearch&&(()=>{
            const q=jobSearch.toLowerCase();
            const c=done.filter(j=>((j.job||'').toLowerCase().includes(q)||(j.customer||'').toLowerCase().includes(q))&&(machFilter==='all'||j.machine===machFilter)).length;
            return<div style={{fontSize:13,color:C.muted,marginTop:6}}>{c} afsluttede job{c!==1?'s':''} fundet{machFilter!=='all'?` on ${machFilter}`:''}</div>;
          })()}
        </div>
      )}

      {/* Chart */}
      {showChart?(
        <div style={{...card(),padding:'14px 10px',marginBottom:16}}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',display:'block'}} xmlns="http://www.w3.org/2000/svg">
            {[0,20,40,60,80,100].map(v=>(
              <g key={v}>
                <line x1={ML} x2={ML+cW} y1={yPct(v)} y2={yPct(v)} stroke={C.border} strokeWidth={v===0?1:0.5} strokeOpacity={0.6}/>
                <text x={ML-4} y={yPct(v)+3.5} textAnchor="end" fontSize={9} fill={C.muted}>{v}%</text>
              </g>
            ))}
            {targetEff>0&&targetEff<100&&(
              <g>
                <line x1={ML} x2={ML+cW} y1={yPct(targetEff)} y2={yPct(targetEff)} stroke={C.green} strokeWidth={1.2} strokeDasharray="5,3" strokeOpacity={0.8}/>
                <text x={ML+cW+3} y={yPct(targetEff)+3.5} fontSize={8} fill={C.green} fontWeight="600">mål {targetEff}%</text>
              </g>
            )}
            {chartData.map((d,i)=>{
              const cx=xCtr(i);
              const bxA=hasB?cx-barW*0.58:cx;
              const bxB=cx+barW*0.58;
              const lblY=MT+cH+(rotLabels?14:16);
              return(
                <g key={i}>
                  {drawBar(d.sA,bxA)}
                  {hasB&&drawBar(d.sB,bxB)}
                  {rotLabels
                    ?<text x={cx} y={MT+cH+8} textAnchor="end" fontSize={8} fill={C.muted} transform={`rotate(-35,${cx},${MT+cH+8})`}>{d.label}</text>
                    :<text x={cx} y={lblY} textAnchor="middle" fontSize={9} fill={C.muted}>{d.label}</text>
                  }
                </g>
              );
            })}
            <line x1={ML} x2={ML} y1={MT} y2={MT+cH} stroke={C.border} strokeWidth={1}/>
            <line x1={ML} x2={ML+cW} y1={MT+cH} y2={MT+cH} stroke={C.border} strokeWidth={1}/>
          </svg>
          <div style={{display:'flex',gap:14,justifyContent:'center',marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:13,color:C.green,display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.green,display:'inline-block'}}/> Produktion</span>
            <span style={{fontSize:13,color:C.amber,display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.amber,display:'inline-block'}}/> Opstilling</span>
            <span style={{fontSize:13,color:C.red,display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.red,display:'inline-block'}}/> Fejl</span>
            <span style={{fontSize:13,color:C.muted,display:'flex',alignItems:'center',gap:4}}><span style={{width:10,height:10,borderRadius:2,background:C.border,display:'inline-block'}}/> Ledig</span>
            <span style={{fontSize:13,color:C.green,display:'flex',alignItems:'center',gap:4}}>
              <span style={{width:14,height:2,background:C.green,display:'inline-block',borderTop:'2px dashed '+C.green}}/> Mål {targetEff}%
            </span>
            {hasB&&entityA&&<span style={{fontSize:13,color:C.blue,display:'flex',alignItems:'center',gap:4,fontWeight:600}}>{entityA}</span>}
            {hasB&&entityB&&<span style={{fontSize:13,color:C.amber,display:'flex',alignItems:'center',gap:4,fontWeight:600}}>{entityB}</span>}
          </div>
        </div>
      ):(
        <div style={{...card(),textAlign:'center',padding:'36px 16px',color:C.muted,marginBottom:16}}>
          <i className="ti ti-chart-bar" style={{fontSize:36,display:'block',marginBottom:10,opacity:0.2}}/>
          <div style={{fontSize:15}}>
            {mode==='machine'?'Vælg en maskine ovenfor for at se udviklingen i effektivitet'
             :mode==='department'?'Vælg en afdeling ovenfor for at se udviklingen i effektivitet'
             :'Søg et jobnummer, tegningsnr. eller en kunde for at sammenligne effektivitet på tværs af maskiner'}
          </div>
        </div>
      )}

      {/* Job search — table of matching runs */}
      {mode==='job'&&jobSearch&&(()=>{
        const q=jobSearch.toLowerCase();
        const matched=done.filter(j=>((j.job||'').toLowerCase().includes(q)||(j.customer||'').toLowerCase().includes(q))&&(machFilter==='all'||j.machine===machFilter))
          .sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
        if(!matched.length) return <div style={{textAlign:'center',padding:'20px',color:C.muted,fontSize:15}}>Ingen afsluttede job matcher "{jobSearch}".</div>;
        return(
          <div>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:'uppercase',marginBottom:8}}><i className="ti ti-list"/> {matched.length} kørsler fundet</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
                <thead><tr>{['Job','Maskine','Operatør','Opstilling','Produktion','Eff. %','Dato'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{matched.map(j=>{
                  const e=jEff(j);
                  const ec=e===null?C.muted:e>=targetEff?C.green:e>=targetEff-10?C.amber:C.red;
                  return(
                    <tr key={j.id}>
                      <td style={td}>{j.job}</td>
                      <td style={td}>{j.machine}</td>
                      <td style={td}>{j.operatorName}</td>
                      <td style={{...td,color:C.amber}}>{fmtHM(jSetupAll(j))}</td>
                      <td style={{...td,color:C.green}}>{fmtHM(jRunAll(j))}</td>
                      <td style={{...td,color:ec,fontWeight:700}}>{e!==null?e+'%':'—'}</td>
                      <td style={{...td,color:C.muted,fontSize:13}}>{fmtDate(j.completedAt)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
