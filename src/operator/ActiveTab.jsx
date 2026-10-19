import { useState } from "react";
import { notify } from "../components/Feedback";
import { C, inp, btn, badge, tag } from "../lib/theme";
import { fmtHM, fmtDetail, liveTime } from "../lib/util";
import { StartRunModal } from "./JobModals";

// ═══════════════════════════════════════════════════════
// ACTIVE
// ═══════════════════════════════════════════════════════
export function JobCard({j,setJobs,startRun,setCompleteId,completeDeburring,pauseJob,resumeJob}){
    const [nmForm,setNmForm]=useState(false);
    const [nmH,setNmH]=useState(""); const [nmM,setNmM]=useState("");
    const [pauseConfirm,setPauseConfirm]=useState(false);
    const anyPaused=j.paused||j.logoutPaused||j.operatorPaused;
    const nightColor="#7c5cbf";
    const nightArmed=j.nightMode&&!j.nightModeEndsAt&&!j.nightModeDone;
    const nightActive=j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone;
    const isDebur=j.status==="deburring";
    const isSetup=j.status==="setup"||j.status==="side2_setup";
    const isRun=j.status==="run"||j.status==="side2_run";
    const lt=liveTime(j);
    const isSide2=j.status==="side2_setup"||j.status==="side2_run";
    const color=j.operatorPaused?C.red:j.paused?C.red:j.logoutPaused?C.muted:j.nightMode?nightColor:isDebur?C.deburr:isSetup?C.amber:C.green;
    const remainingSec=nightActive?Math.max(0,Math.round((j.nightModeEndsAt-Date.now())/1000)):0;

    const activateNightMode=()=>{
      const dur=(parseInt(nmH)||0)*3600+(parseInt(nmM)||0)*60;
      if(dur<=0) return;
      // Store duration only — timer starts when operator logs out
      setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:true,nightModeDuration:dur,nightModeEndsAt:null,nightModeDone:false,lastModifiedAt:Date.now()}:x));
      setNmForm(false);setNmH("");setNmM("");
      notify(`Natkørsel klar — kører ${fmtHM(dur)} efter du logger ud`);
    };
    const cancelNightMode=()=>{notify("Natkørsel annulleret","warn");setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:false,nightModeDuration:0,nightModeEndsAt:null,nightModeDone:false,nightPaused:false,lastModifiedAt:Date.now()}:x));};

    return(
      <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${color}`,border:`1px solid ${C.border}`,borderTopColor:color,padding:"12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <i className={`ti ti-${j.nightMode?"moon":"robot"}`} style={{fontSize:16,color}}/>
          <div style={{fontSize:15,color,fontWeight:700,letterSpacing:1,textTransform:"uppercase",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.machine}</div>
          {j.paused?<span style={badge("down")}>På pause</span>
            :j.logoutPaused?<span style={badge("")}>På pause</span>
            :nightActive?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Natkørsel i gang</span>
            :nightArmed?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Natkørsel klar</span>
            :isDebur?<span style={{...badge("run"),background:"rgba(230,126,34,.15)",color:C.deburr,borderColor:"rgba(230,126,34,.4)"}}>Afgratning</span>
            :isSide2?<span style={{...badge(isSetup?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.4)"}}>{isSetup?"Side 2 — opstilling":"Side 2 — produktion"}</span>
            :j.twoSided?<span style={badge(isSetup?"setup":"run")}>{isSetup?"Side 1 — opstilling":"Side 1 — produktion"}</span>
            :<span style={badge(isSetup?"setup":"run")}>{isSetup?"Opstilling":"Produktion"}</span>}
        </div>
        {j.customer&&<div style={{fontSize:20,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
        <div style={{fontSize:14,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
        {j.op&&<div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.op}</div>}
        {j.paused&&<div style={{background:"rgba(231,76,60,0.12)",borderRadius:6,padding:"6px 8px",fontSize:13,color:C.red}}><i className="ti ti-player-pause"/> Tiduret er på pause — maskinen er nede</div>}
        {j.logoutPaused&&!j.nightModeDone&&!j.operatorPaused&&<div style={{background:"rgba(138,155,181,0.1)",borderRadius:6,padding:"6px 8px",fontSize:13,color:C.muted}}><i className="ti ti-moon"/> Tiduret er på pause — operatøren er væk</div>}
        {j.logoutPaused&&j.nightModeDone&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:13,color:nightColor}}><i className="ti ti-moon-stars"/> Natkørsel færdig — fortsætter når du logger ind</div>}
        {j.operatorPaused&&(
          <div style={{background:"rgba(231,76,60,0.15)",border:`2px solid ${C.red}`,borderRadius:8,padding:"12px 10px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:800,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
              <i className="ti ti-player-pause"/> JOB PÅ PAUSE
            </div>
            <div style={{fontSize:13,color:"rgba(231,76,60,.7)",letterSpacing:.5}}>Tiduret er stoppet. Tryk Genoptag for at fortsætte.</div>
          </div>
        )}
        {nightArmed&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:13,color:nightColor}}>
          <i className="ti ti-moon-stars"/> Natkørsel klar — kører {fmtHM(j.nightModeDuration||0)} efter du logger ud
        </div>}
        {nightActive&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:13,color:nightColor}}>
          <i className="ti ti-moon-stars"/> Kører ubemandet — stopper om {fmtDetail(remainingSec)}
        </div>}
        {isDebur?(
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:C.deburr,marginBottom:4}}>Afgratningstid</div>
            <div style={{fontSize:28,letterSpacing:2,color:C.deburr,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{fmtHM(lt.debur)}</div>
          </div>
        ):(
          <div style={{textAlign:"center",padding:"8px 0",opacity:anyPaused?0.4:1}}>
            <div style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color,marginBottom:4}}>
              {isSide2?(isSetup?"Side 2 opstillingstid":"Side 2 produktionstid"):isSetup?"Opstillingstid":"Produktionstid"}
            </div>
            <div style={{fontSize:28,letterSpacing:2,color:anyPaused?C.muted:color,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>
              {j.nightMode
                ? fmtDetail(isSetup?(isSide2?lt.setup2:lt.setup):(isSide2?lt.run2:lt.run))
                : fmtHM(isSetup?(isSide2?lt.setup2:lt.setup):(isSide2?lt.run2:lt.run))}
            </div>
          </div>
        )}
        {/* Side 1 summary row (when on side 2) */}
        {isSide2&&(
          <div style={{background:"rgba(39,174,96,.08)",border:`1px solid rgba(39,174,96,.2)`,borderRadius:6,padding:"6px 8px",display:"flex",gap:10,marginBottom:2,justifyContent:"center"}}>
            <span style={{fontSize:13,color:C.amber}}><i className="ti ti-check"/> S1 opstilling: {fmtHM(lt.setup)}</span>
            <span style={{fontSize:13,color:C.green}}><i className="ti ti-check"/> S1 produktion: {fmtHM(lt.run)}</span>
            {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
          </div>
        )}
        {isDebur?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:15,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.setup)}</div>
              <div style={{fontSize:11,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Opstilling ✓</div>
            </div>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:15,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.run)}</div>
              <div style={{fontSize:11,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Produktion ✓</div>
            </div>
            <div style={{background:`rgba(230,126,34,.12)`,borderRadius:6,padding:"6px",textAlign:"center",border:`1px solid rgba(230,126,34,.3)`}}>
              <div style={{fontSize:15,color:C.deburr,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.debur)}</div>
              <div style={{fontSize:11,letterSpacing:1,color:C.deburr,textTransform:"uppercase",marginTop:2}}>Afgrat</div>
            </div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:16,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2?lt.setup2:lt.setup)}</div>
              <div style={{fontSize:11,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>{isSide2?"S2 opstilling":isRun?"Opstilling ✓":"Opstilling"}</div>
            </div>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center",opacity:isSetup?0.35:1}}>
              <div style={{fontSize:16,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2?lt.run2:lt.run)}</div>
              <div style={{fontSize:11,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>{isSide2?"S2 produktion":"Produktion"}</div>
            </div>
          </div>
        )}
        {j.operatorPaused&&(
          <button style={{...btn("outline",true,true),borderColor:C.green,color:C.green,marginTop:2,fontWeight:700}} onClick={()=>resumeJob&&resumeJob(j.id)}>
            <i className="ti ti-player-play"/> Genoptag job
          </button>
        )}
        {!anyPaused&&!j.nightMode&&(
          isDebur
            ?<button style={{...btn("primary",true,true),marginTop:2,background:C.deburr,borderColor:C.deburr}} onClick={()=>completeDeburring&&completeDeburring(j.id)}>
               <i className="ti ti-check"/> Afgratning færdig
             </button>
            :isSetup
              ?<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
                <button style={{...btn("primary",true,true),...(isSide2?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>startRun(j.id)}>
                  <i className="ti ti-player-play"/> {isSide2?"Start produktion side 2":"Start produktion"}
                </button>
                <button style={{...btn("outline",true,true),borderColor:"rgba(231,76,60,.4)",color:C.red,fontSize:14}} onClick={()=>{setPauseConfirm(true);setNmForm(false);}}>
                  <i className="ti ti-player-pause"/> Pause opstilling
                </button>
              </div>
              :<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
                <button style={{...btn("success",true,true),...(isSide2?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>setCompleteId(j.id)}>
                  <i className="ti ti-check"/> {isSide2?"Afslut side 2":j.twoSided?"Afslut side 1":"Afslut job"}
                </button>
                <button style={{...btn("outline",true,true),borderColor:"rgba(231,76,60,.4)",color:C.red,fontSize:14}} onClick={()=>{setPauseConfirm(true);setNmForm(false);}}>
                  <i className="ti ti-player-pause"/> Pause job
                </button>
                {!isSide2&&<button style={{...btn("outline",true,true),color:nightColor,borderColor:nightColor}} onClick={()=>setNmForm(f=>!f)}><i className="ti ti-moon"/> Natkørsel</button>}
              </div>
        )}
        {pauseConfirm&&(
          <div style={{background:"rgba(231,76,60,.1)",border:`1px solid rgba(231,76,60,.5)`,borderRadius:8,padding:"14px 12px",marginTop:2}}>
            <div style={{fontSize:16,color:C.red,fontWeight:700,textAlign:"center",marginBottom:6}}><i className="ti ti-player-pause"/> Sæt jobbet på pause?</div>
            <div style={{fontSize:13,color:"rgba(231,76,60,.75)",textAlign:"center",marginBottom:12,lineHeight:1.5}}>Tiduret stopper helt.<br/>Jobbet fortsætter IKKE, når du logger ind igen — du skal selv trykke Genoptag.</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...btn("outline",false,false),flex:1,borderColor:C.red,color:C.red,fontWeight:700}} onClick={()=>{pauseJob&&pauseJob(j.id);setPauseConfirm(false);}}>
                <i className="ti ti-player-pause"/> Ja, pause
              </button>
              <button style={{...btn("outline",false,true),flexShrink:0}} onClick={()=>setPauseConfirm(false)}>Annuller</button>
            </div>
          </div>
        )}
        {nightArmed&&(
          <button style={btn("outline",true,true)} onClick={cancelNightMode}><i className="ti ti-x"/> Annuller natkørsel</button>
        )}
        {nmForm&&(
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
            <div style={{fontSize:13,color:nightColor,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}><i className="ti ti-moon-stars"/> Hvor længe skal maskinen køre?</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",fontSize:18,color:nightColor}} value={nmH} onChange={e=>setNmH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:4,letterSpacing:1}}>Timer</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",fontSize:18,color:nightColor}} value={nmM} onChange={e=>setNmM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:4,letterSpacing:1}}>Minutter</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...btn("outline",true,true),color:nightColor,borderColor:nightColor}} onClick={activateNightMode}><i className="ti ti-moon-stars"/> Start natkørsel</button>
              <button style={btn("outline",false,true)} onClick={()=>setNmForm(false)}>Annuller</button>
            </div>
          </div>
        )}
      </div>
    );
}

export function ActiveTab({user,jobs,setJobs,setCompleteId,saveNow,stateRef}){
  const [machineFilt,setMachineFilt]=useState("all");
  const [startRunId,setStartRunId]=useState(null);
  const active=jobs.filter(j=>j.status!=="done"&&j.operatorId===user.id);
  const machines=[...new Set(active.map(j=>j.machine))].sort();
  const visible=active.filter(j=>machineFilt==="all"||j.machine===machineFilt);
  const setupJobs =visible.filter(j=>j.status==="setup"||j.status==="side2_setup").sort((a,b)=>(b.setupSec+b.setupSec2||0)-(a.setupSec+a.setupSec2||0));
  const runJobs   =visible.filter(j=>j.status==="run"  ||j.status==="side2_run")  .sort((a,b)=>(b.runSec+b.runSec2||0)-(a.runSec+a.runSec2||0));
  const deburJobs =visible.filter(j=>j.status==="deburring");
  const startRun=id=>setStartRunId(id);

  const pauseJob=id=>{
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.id!==id) return j;
      const lt=liveTime(j);
      return{...j,operatorPaused:true,setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,deburSec:lt.debur,phaseStartedAt:null,lastModifiedAt:n};
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Job sat på pause","warn");
  };

  const resumeJob=id=>{
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.id!==id) return j;
      return{...j,operatorPaused:false,logoutPaused:false,phaseStartedAt:n,lastModifiedAt:n};
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Job genoptaget");
  };

  if(!active.length) return <div style={{padding:"14px 16px"}}><div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15,letterSpacing:1}}><i className="ti ti-tool" style={{fontSize:34,display:"block",marginBottom:10,opacity:0.3}}/> Ingen aktive job.</div></div>;

  const completeDeburring=id=>{
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.id!==id) return j;
      const lt=liveTime(j);
      return{...j,status:"done",deburSec:lt.debur,phaseStartedAt:null,completedAt:n,lastModifiedAt:n};
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Afgratning færdig — job afsluttet");
  };

  return(
    <div style={{padding:"10px 12px"}}>
      {machines.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>Alle maskiner</button>
          {machines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
        </div>
      )}
      {deburJobs.length>0&&(
        <>
          <div style={{fontSize:13,color:C.deburr,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(230,126,34,0.2)`}}>
            <i className="ti ti-tool"/> Afgratning · {deburJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {deburJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring} pauseJob={pauseJob} resumeJob={resumeJob}/>)}
          </div>
        </>
      )}
      {setupJobs.length>0&&(
        <>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(240,165,0,0.2)`}}>
            <i className="ti ti-settings"/> Opstilling · {setupJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {setupJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring} pauseJob={pauseJob} resumeJob={resumeJob}/>)}
          </div>
        </>
      )}
      {runJobs.length>0&&(
        <>
          <div style={{fontSize:13,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(39,174,96,0.2)`}}>
            <i className="ti ti-player-play"/> Produktion · {runJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {runJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring} pauseJob={pauseJob} resumeJob={resumeJob}/>)}
          </div>
        </>
      )}
      {startRunId&&<StartRunModal jobId={startRunId} jobs={jobs} setJobs={setJobs} onClose={()=>setStartRunId(null)} saveNow={saveNow} stateRef={stateRef}/>}
    </div>
  );
}
