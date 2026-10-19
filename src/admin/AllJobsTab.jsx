import { useState, useEffect } from "react";
import { sortActive, ActiveJobsGrid } from "./AdminDash";
import { notify } from "../components/Feedback";
import { C, inp, sel, btn, badge, tag, label, errMsg } from "../lib/theme";
import { fmtHM, fmtDetail, fmtDate, liveTime } from "../lib/util";

// ═══════════════════════════════════════════════════════
// ALL JOBS (ADMIN)
// ═══════════════════════════════════════════════════════
// <input type="datetime-local"> works in local time without seconds
export function toLocalInput(ms){const d=new Date(ms);const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
export function fromLocalInput(v){const t=new Date(v).getTime();return isNaN(t)?null:t;}

// Admin: an operator forgot to press Start Job or Start Run — set when it really
// happened. Job start adds/removes setup time; run start moves time between
// setup and run. Each fix is recorded in job.corrections.
export function StartTimeFix({j,onApply}){
  const anyPaused=j.paused||j.logoutPaused||j.operatorPaused;
  const lt=liveTime(j);
  const now=Date.now();
  const nightRunning=j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone;
  const reached1=["run","side2_setup","side2_run","deburring","done"].includes(j.status);
  const reached2=j.status==="side2_run"||(j.twoSided&&["deburring","done"].includes(j.status)&&j.run2StartedAt);
  // When Start Run was pressed: recorded since this feature; for older jobs only
  // known if the run hasn't been paused since (phaseStartedAt is reset on resume)
  const pressed=(key,status)=>j[key]??(j.status===status&&j.phaseStartedAt&&!anyPaused?j.phaseStartedAt:null);
  const fixes=[
    {key:"job",label:"Jobbet startede reelt",pressedAt:j.createdAt,show:!j.quickEntry,minT:null},
    {key:"run1",label:j.twoSided?"Produktion side 1 startede reelt":"Produktionen startede reelt",pressedAt:pressed("runStartedAt","run"),show:reached1&&!j.quickEntry,setupKey:"setupSec",runKey:"runSec",lt:["setup","run"],pressedKey:"runStartedAt",minT:j.createdAt},
    {key:"run2",label:"Produktion side 2 startede reelt",pressedAt:pressed("run2StartedAt","side2_run"),show:!!reached2,setupKey:"setupSec2",runKey:"runSec2",lt:["setup2","run2"],pressedKey:"run2StartedAt",minT:j.side1CompletedAt||j.createdAt},
  ].filter(f=>f.show);
  const [values,setValues]=useState({});
  if(!fixes.length) return null;
  // Untouched fields show when the button was actually pressed
  const valueOf=f=>values[f.key]??(f.pressedAt?toLocalInput(f.pressedAt):"");

  // Work out the result of one fix (null if nothing to do)
  const plan=f=>{
    const T=fromLocalInput(valueOf(f));
    if(!T||!f.pressedAt) return null;
    if(T>now) return {err:"Det tidspunkt er i fremtiden"};
    if(f.minT&&T<f.minT) return {err:`Kan ikke være før jobbet startede (${fmtDate(f.minT)})`};
    const delta=Math.round((f.pressedAt-T)/1000); // + = really started earlier than pressed
    if(Math.abs(delta)<60) return null;
    if(f.key==="job"){
      const setup=Math.max(0,lt.setup+delta);
      return {T,delta,moved:setup-lt.setup,before:{setup:lt.setup},after:{setup},
        patch:{setupSec:setup,createdAt:T}};
    }
    const [sk,rk]=f.lt;
    const move=delta>0?Math.min(delta,lt[sk]):-Math.min(-delta,lt[rk]);
    const setup=lt[sk]-move, run=lt[rk]+move;
    return {T,delta,moved:move,before:{setup:lt[sk],run:lt[rk]},after:{setup,run},
      patch:{[f.setupKey]:setup,[f.runKey]:run,[f.pressedKey]:T}};
  };

  const apply=(f,p)=>{
    // Freeze the live timers into the stored values, then apply the fix
    const frozen={setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,deburSec:lt.debur,
      ...(j.phaseStartedAt?{phaseStartedAt:Date.now()}:{})};
    onApply({...frozen,...p.patch,
      corrections:[...(j.corrections||[]),{at:Date.now(),what:f.key,from:f.pressedAt,to:p.T,movedSec:p.moved}]});
  };

  return(
    <div style={{marginTop:6,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:10}}>
      <div style={{...label,marginBottom:0}}><i className="ti ti-clock-edit"/> Ret starttider</div>
      {nightRunning?<div style={{fontSize:13,color:C.muted}}>Ikke muligt mens natkørsel er i gang.</div>:fixes.map(f=>{
        const p=plan(f);
        return(
          <div key={f.key}>
            <div style={{fontSize:13,color:C.muted,marginBottom:4}}>{f.label}</div>
            {!f.pressedAt
              ?<div style={{fontSize:13,color:C.muted}}>Tidspunktet hvor Start produktion blev trykket, blev ikke gemt for dette job (det har været på pause siden) — ret timerne ovenfor i stedet.</div>
              :<>
                <input type="datetime-local" style={{...inp(p?.err),fontSize:16,padding:"8px 10px"}} value={valueOf(f)} max={toLocalInput(now)}
                  onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}/>
                {p?.err&&<div style={errMsg}>{p.err}</div>}
                {p&&!p.err&&(
                  <div style={{fontSize:13,color:C.text,background:C.raised,borderRadius:6,padding:"6px 8px",marginTop:6,lineHeight:1.6}}>
                    {f.key==="job"
                      ?<>{p.moved>=0?"Tilføjer":"Fjerner"} <b>{fmtHM(Math.abs(p.moved))}</b> opstilling · Opstilling {fmtHM(p.before.setup)} → <span style={{color:C.amber}}>{fmtHM(p.after.setup)}</span></>
                      :<>Flytter <b>{fmtHM(Math.abs(p.moved))}</b> from {p.moved>=0?"opstilling til produktion":"produktion til opstilling"} · Opstilling <span style={{color:C.amber}}>{fmtHM(p.after.setup)}</span> · Produktion <span style={{color:C.green}}>{fmtHM(p.after.run)}</span></>}
                    {Math.abs(p.moved)<Math.abs(p.delta)-60&&<div style={{color:C.muted}}>Kun {fmtHM(Math.abs(p.moved))} af {fmtHM(Math.abs(p.delta))} — tiduret talte ikke hele den tid (f.eks. pause om natten).</div>}
                    <button style={{...btn("primary",true,true),marginTop:6}} onClick={()=>apply(f,p)}><i className="ti ti-check"/> Anvend</button>
                  </div>
                )}
              </>}
          </div>
        );
      })}
    </div>
  );
}

export function AdminJobCard({j,setJobs,setCompleteId,users,machines,saveNow,stateRef,selected,onToggleSelect}){
  const [editing,setEditing]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [editCustomer,setEditCustomer]=useState("");
  const [editJob,setEditJob]=useState("");
  const [editPieces,setEditPieces]=useState("");
  const [editTarget,setEditTarget]=useState(""); // pieces in the order
  const [editOpId,setEditOpId]=useState("");
  const [editMachine,setEditMachine]=useState("");
  const [setupH,setSetupH]=useState(""); const [setupM,setSetupM]=useState("");
  const [runH,  setRunH  ]=useState(""); const [runM,  setRunM  ]=useState("");
  const openEdit=()=>{
    setEditCustomer(j.customer||"");
    setEditJob(j.job||"");
    setEditPieces(j.pieces!=null?String(j.pieces):"");
    setEditTarget(j.targetQty?String(j.targetQty):"");
    setEditOpId(String(j.operatorId||""));
    setEditMachine(j.machine||"");
    setSetupH(String(Math.floor(j.setupSec/3600)));
    setSetupM(String(Math.floor((j.setupSec%3600)/60)));
    setRunH  (String(Math.floor(j.runSec/3600)));
    setRunM  (String(Math.floor((j.runSec%3600)/60)));
    setEditing(true);
  };
  const saveEdit=()=>{
    const s=(parseInt(setupH)||0)*3600+(parseInt(setupM)||0)*60;
    const r=(parseInt(runH  )||0)*3600+(parseInt(runM  )||0)*60;
    const opUser=users.find(u=>u.id===parseInt(editOpId));
    const patch={
      setupSec:s,runSec:r,
      customer:editCustomer,job:editJob,
      pieces:parseInt(editPieces)||j.pieces||0,
      targetQty:parseInt(editTarget,10)||null,
      machine:editMachine,
      operatorId:opUser?opUser.id:j.operatorId,
      operatorName:opUser?opUser.name:j.operatorName,
      lastModifiedAt:Date.now(),
    };
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Job opdateret");
    setEditing(false);
  };
  const nightColor="#7c5cbf";
  const nightArmed=j.nightMode&&!j.nightModeEndsAt&&!j.nightModeDone;
  const nightActive=j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone;
  const isSide2Active=j.status==="side2_setup"||j.status==="side2_run";
  const accentColor=j.paused?C.red:j.logoutPaused?C.muted:nightActive||nightArmed?nightColor:j.status==="setup"||j.status==="side2_setup"?C.amber:j.status==="run"||j.status==="side2_run"?C.green:j.status==="done"?C.border:C.border;
  const nightRemaining=nightActive?Math.max(0,Math.round((j.nightModeEndsAt-Date.now())/1000)):0;
  const lt=liveTime(j);
  const togglePause=()=>{
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>{
      if(x.id!==j.id) return x;
      if(x.logoutPaused){
        return{...x,logoutPaused:false,phaseStartedAt:n,lastModifiedAt:n};
      } else {
        const lt=liveTime(x);
        return{...x,logoutPaused:true,setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,phaseStartedAt:null,lastModifiedAt:n};
      }
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
  };
  const startRun=()=>{
    const n=Date.now();
    const newStatus=j.status==="side2_setup"?"side2_run":"run";
    const lt=liveTime(j);
    const patch=j.status==="side2_setup"?{setupSec2:lt.setup2,run2StartedAt:n}:{setupSec:lt.setup,runStartedAt:n};
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch,status:newStatus,phaseStartedAt:n,lastModifiedAt:n}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Produktion startet");
  };
  // Start-time correction from StartTimeFix
  const applyFix=patch=>{
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch,lastModifiedAt:Date.now()}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Starttid rettet");
    setEditing(false);
  };
  const deleteJob=()=>{
    // Soft-delete: mark as deleted rather than removing from the array.
    // The server merges by lastModifiedAt — if we just removed the job,
    // another device that still has it would re-add it on its next save.
    const now=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>
      x.id===j.id?{...x,deleted:true,status:"done",phaseStartedAt:null,lastModifiedAt:now}:x
    );
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
    notify("Job slettet","warn");
  };

  return(
    <div data-job-id={j.id} style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          {j.customer&&<div style={{fontSize:16,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
          <div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {onToggleSelect&&<button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:selected?C.blue:C.muted,cursor:"pointer",fontSize:18,padding:2}} onClick={onToggleSelect}><i className={`ti ti-${selected?"square-check":"square"}`}/></button>}
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:2}} onClick={()=>{setConfirmDelete(false);editing?setEditing(false):openEdit();}}><i className={`ti ti-${editing?"x":"pencil"}`}/></button>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:confirmDelete?C.red:C.muted,cursor:"pointer",fontSize:16,padding:2}} onClick={()=>{setConfirmDelete(d=>!d);setEditing(false);}}><i className="ti ti-trash"/></button>
        </div>
      </div>

      {/* badges */}
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {isSide2Active
          ?<span style={{...badge(j.status==="side2_setup"?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> {j.status==="side2_setup"?"Side 2 opstilling":"Side 2 produktion"}</span>
          :j.twoSided&&j.status!=="done"
            ?<span style={badge(j.status==="setup"?"setup":"run")}>{j.status==="setup"?"Side 1 opstilling":"Side 1 produktion"}</span>
            :<span style={badge(j.status)}>{j.status==="setup"?"Opstilling":j.status==="run"?"Produktion":j.status==="done"?"Færdig":j.status}</span>}
        {j.twoSided&&j.status!=="done"&&<span style={{...badge("admin"),background:"rgba(59,130,246,.1)",color:C.blue,fontSize:12}}><i className="ti ti-layers-intersect"/> 2 sider</span>}
        {j.paused&&<span style={badge("down")}>Maskine nede</span>}
        {j.logoutPaused&&!j.nightModeDone&&<span style={badge("")}>På pause</span>}
        {j.logoutPaused&&j.nightModeDone&&<span style={{...badge(""),background:"rgba(124,92,191,.15)",color:nightColor}}>Nat-pause</span>}
        {nightActive&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Nat</span>}
        {nightArmed&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Klar</span>}
        {j.status==="deburring"&&<span style={{...badge("run"),background:"rgba(230,126,34,.15)",color:C.deburr,borderColor:"rgba(230,126,34,.4)"}}>Afgratning</span>}
      </div>

      {/* edit panel */}
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
          {/* customer + part# always editable */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <div style={label}>Kunde</div>
              <input style={inp()} value={editCustomer} onChange={e=>setEditCustomer(e.target.value)} placeholder="Kunde"/>
            </div>
            <div>
              <div style={label}>Tegningsnr.</div>
              <input style={inp()} value={editJob} onChange={e=>setEditJob(e.target.value)} placeholder="Tegningsnr."/>
            </div>
          </div>
          {/* operator + machine always editable */}
          <div>
            <div style={label}>Operatør</div>
            <select style={sel()} value={editOpId} onChange={e=>setEditOpId(e.target.value)}>
              {users.filter(u=>u.active&&u.role==="operator"&&!u.removed).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Maskine</div>
            <select style={sel()} value={editMachine} onChange={e=>setEditMachine(e.target.value)}>
              {machines.filter(m=>m.active).map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          {/* pieces made (done jobs) + pieces in the order */}
          <div style={{display:"grid",gridTemplateColumns:j.status==="done"?"1fr 1fr":"1fr",gap:6}}>
            {j.status==="done"&&(
              <div>
                <div style={label}>Stk. lavet</div>
                <input type="number" min="0" style={inp()} value={editPieces} onChange={e=>setEditPieces(e.target.value)} placeholder="0"/>
              </div>
            )}
            <div>
              <div style={label}>Antal i ordren</div>
              <input inputMode="numeric" style={inp()} value={editTarget} onChange={e=>setEditTarget(e.target.value.replace(/\D/g,""))} placeholder="—"/>
            </div>
          </div>
          {/* times */}
          <div>
            <div style={label}>Opstillingstid</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",color:C.amber}} value={setupH} onChange={e=>setSetupH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Timer</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",color:C.amber}} value={setupM} onChange={e=>setSetupM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Minutter</div>
              </div>
            </div>
          </div>
          <div>
            <div style={label}>Produktionstid</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",color:C.green}} value={runH} onChange={e=>setRunH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Timer</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",color:C.green}} value={runM} onChange={e=>setRunM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Minutter</div>
              </div>
            </div>
          </div>
          <button style={btn("primary",true,true)} onClick={saveEdit}><i className="ti ti-check"/> Gem</button>
          <StartTimeFix j={j} onApply={applyFix}/>
        </div>
      )}

      {/* times */}
      <div style={{display:"grid",gridTemplateColumns:j.deburSec>0?"1fr 1fr 1fr":"1fr 1fr",gap:4}}>
        <div style={{background:C.raised,borderRadius:6,padding:"5px 6px",textAlign:"center"}}>
          <div style={{fontSize:15,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Active?lt.setup2:lt.setup)}</div>
          <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>{isSide2Active?"S2 opstilling":"Opstilling"}</div>
        </div>
        <div style={{background:C.raised,borderRadius:6,padding:"5px 6px",textAlign:"center",opacity:(j.status==="setup"||j.status==="side2_setup")?0.35:1}}>
          <div style={{fontSize:15,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{nightActive?fmtDetail(nightRemaining):fmtHM(isSide2Active?lt.run2:lt.run)}</div>
          <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>{nightActive?"Stopper om":isSide2Active?"S2 produktion":"Produktion"}</div>
        </div>
        {j.deburSec>0&&(
          <div style={{background:`rgba(230,126,34,.1)`,borderRadius:6,padding:"5px 6px",textAlign:"center",border:`1px solid rgba(230,126,34,.25)`}}>
            <div style={{fontSize:15,color:C.deburr,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.status==="deburring"?lt.debur:j.deburSec)}</div>
            <div style={{fontSize:11,color:C.deburr,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>Afgrat</div>
          </div>
        )}
      </div>

      {/* machine + operator */}
      <div style={{fontSize:13,color:C.muted,display:"flex",flexDirection:"column",gap:2}}>
        <span><i className="ti ti-robot"/> {j.machine}</span>
        <span><i className="ti ti-user"/> {j.operatorName}</span>
        {j.targetQty>0&&(()=>{
          // Order quantity — with the last count while running, or what's missing when done
          const made=j.status==="done"?Math.max(j.pieces||0,j.pieces2||0):null;
          const last=(j.counts||[])[(j.counts||[]).length-1];
          const short=made!=null&&made<j.targetQty?j.targetQty-made:0;
          return <span style={{color:short?C.amber:C.muted}}><i className="ti ti-clipboard-list"/> Ordre: {j.targetQty} stk
            {made==null&&last?` · meldt ${last.pieces}`:""}{short?` · ${short} mangler`:""}</span>;
        })()}
      </div>

      {/* done job extras */}
      {j.status==="done"&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {j.photoData&&<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:34,height:34,borderRadius:6,objectFit:"cover",border:j.twoSided?`1px solid ${C.blue}`:undefined}}/>}
          {j.twoSided&&j.photoData2&&<img src={j.photoData2} title="Side 2" style={{width:34,height:34,borderRadius:6,objectFit:"cover",border:`1px solid ${C.blue}`}}/>}
          {j.twoSided?(
            <>
              <span style={{fontSize:12,color:C.blue,letterSpacing:1}}><i className="ti ti-layers-intersect"/> 2 SIDER</span>
              {j.pieces>0&&<span style={{fontSize:13,color:C.amber}}><i className="ti ti-1"/> {j.pieces}stk · {fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
              {j.pieces2>0&&<span style={{fontSize:13,color:C.blue}}><i className="ti ti-2"/> {j.pieces2}stk · {fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/stk</span>}
            </>
          ):(
            <>
              {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}><i className="ti ti-box"/> {j.pieces} stk</span>}
              {j.pieces>0&&<span style={{fontSize:13,color:C.blue}}><i className="ti ti-clock"/> {fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
            </>
          )}
          {j.completedAt&&<span style={{fontSize:13,color:C.muted}}>{fmtDate(j.completedAt)}</span>}
        </div>
      )}
      {/* side2 in-progress badge */}
      {isSide2Active&&(
        <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:6,padding:"4px 8px",fontSize:13,color:C.blue}}>
          <i className="ti ti-layers-intersect"/> Side 2 {j.status==="side2_setup"?"Opstilling":"Kører"} — S1: {fmtHM(lt.setup)} opstilling / {fmtHM(lt.run)} produktion / {j.pieces||0} stk
        </div>
      )}

      {/* actions — active jobs */}
      {j.status!=="done"&&!confirmDelete&&(
        <div style={{display:"flex",gap:4,marginTop:2}}>
          {(j.status==="setup"||j.status==="side2_setup")&&(
            <button style={{...btn("primary",true,true),flex:1,...(isSide2Active?{background:C.blue,borderColor:C.blue}:{})}} onClick={startRun}>
              <i className="ti ti-player-play"/> {isSide2Active?"Start produktion S2":"Start produktion"}
            </button>
          )}
          {(j.status==="run"||j.status==="side2_run")&&(
            <button style={{...btn("success",true,true),flex:1,...(isSide2Active?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>setCompleteId(j.id)}>
              <i className="ti ti-check"/> {isSide2Active?"Afslut S2":j.twoSided?"Afslut S1":"Afslut job"}
            </button>
          )}
          {!j.paused&&<button style={{...btn(j.logoutPaused?"primary":"outline",false,true)}} onClick={togglePause}>
            <i className={`ti ti-${j.logoutPaused?"player-play":"player-pause"}`}/>
          </button>}
        </div>
      )}

      {/* delete confirmation */}
      {confirmDelete&&(
        <div style={{background:`${C.red}10`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:14,color:C.red,fontWeight:700}}><i className="ti ti-alert-triangle"/> Slet dette job?</div>
          <div style={{fontSize:14,color:C.muted}}>Alle data for jobbet slettes permanent og kan ikke gendannes.</div>
          <div style={{display:"flex",gap:6}}>
            <button style={{...btn("danger",true,true),flex:1}} onClick={deleteJob}><i className="ti ti-trash"/> Slet</button>
            <button style={{...btn("outline",false,true),flex:1}} onClick={()=>setConfirmDelete(false)}>Annuller</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function IssueCard({name,issue,setMachineIssues,resolveIssue,saveNow}){
  const [editing,setEditing]=useState(false);
  const [reason,setReason]=useState(issue.reason||"");
  const [status,setStatus]=useState(issue.status);
  const [fixDescription,setFixDescription]=useState(issue.fixDescription||"");
  const [fixCost,setFixCost]=useState(issue.fixCost||"");
  const accentColor=issue.status==="down"?C.red:C.amber;
  const save=()=>{
    setMachineIssues(prev=>({...prev,[name]:{...prev[name],status,reason,fixDescription:fixDescription.trim(),fixCost:fixCost.trim(),updatedAt:Date.now()}}));
    setEditing(false);
    saveNow&&saveNow();
    notify("Fejl opdateret");
  };
  return(
    <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
          <div style={{fontSize:13,color:C.muted}}><i className="ti ti-user"/> {issue.reportedBy}</div>
        </div>
        <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:2}} onClick={()=>{setReason(issue.reason||"");setStatus(issue.status);setFixDescription(issue.fixDescription||"");setFixCost(issue.fixCost||"");setEditing(e=>!e);}}>
          <i className={`ti ti-${editing?"x":"pencil"}`}/>
        </button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        <span style={badge(issue.status==="down"?"down":"repair")}>{issue.status==="down"?"Nede":"Reparation"}</span>
        {issue.reason&&!editing&&<span style={{fontSize:13,color:C.muted,alignSelf:"center"}}>{issue.reason}</span>}
      </div>
      {!editing&&(issue.fixDescription||issue.fixCost)&&(
        <div style={{background:C.raised,borderRadius:7,padding:"7px 10px",fontSize:13,color:C.muted}}>
          {issue.fixDescription&&<div style={{color:C.text,marginBottom:issue.fixCost?3:0}}><i className="ti ti-tools"/> {issue.fixDescription}</div>}
          {issue.fixCost&&<div><i className="ti ti-coin"/> Pris: {issue.fixCost}</div>}
        </div>
      )}
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
          <div>
            <div style={label}>Status</div>
            <select style={sel()} value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="down">Nede</option>
              <option value="repair">Skal repareres</option>
            </select>
          </div>
          <div>
            <div style={label}>Beskrivelse af fejlen</div>
            <input style={inp()} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Hvad er der galt med maskinen?"/>
          </div>
          <div>
            <div style={label}>Løsning</div>
            <input style={inp()} value={fixDescription} onChange={e=>setFixDescription(e.target.value)} placeholder="Hvad blev der gjort for at løse det?"/>
          </div>
          <div>
            <div style={label}>Pris</div>
            <input style={inp()} value={fixCost} onChange={e=>setFixCost(e.target.value)} placeholder="f.eks. 250 kr i reservedele"/>
          </div>
          <button style={btn("primary",true,true)} onClick={save}><i className="ti ti-check"/> Gem</button>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Nedetid</div>
          {!issue.counting&&<span style={{fontSize:12,color:C.muted,letterSpacing:.5,textTransform:"uppercase",background:C.raised,padding:"1px 5px",borderRadius:4}}>pause</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:issue.counting?C.red:"rgba(255,255,255,.2)",display:"inline-block"}}/>
          <span style={{fontSize:17,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(issue.downtimeSec||0)}</span>
        </div>
      </div>
      <button style={btn("success",true,true)} onClick={()=>resolveIssue(name)}><i className="ti ti-check"/> Løst</button>
    </div>
  );
}

export function AllJobsTab({jobs,setJobs,setCompleteId,users,machines,machineIssues,setMachineIssues,resolveIssue,downtimeLog,setDowntimeLog,saveNow,stateRef,focusJob,setFocusJob}){
  const [statusFilt,setStatusFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const [search,setSearch]=useState("");
  // Opened from the admin search: filter down to the job, then scroll to it and flash it
  useEffect(()=>{
    if(!focusJob) return;
    const done=focusJob.status==="done";
    setStatusFilt(done?"done":"all");setMachineFilt(focusJob.machine||"all");setSearch(done?focusJob.job||"":"");
    const t=setTimeout(()=>{
      const el=document.querySelector(`[data-job-id="${focusJob.id}"]`);
      if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.animate([{boxShadow:`0 0 0 4px ${C.amber}`},{boxShadow:"0 0 0 0 transparent"}],{duration:2400});}
      setFocusJob&&setFocusJob(null);
    },150);
    return()=>clearTimeout(t);
  },[focusJob]);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [confirmBulkDelete,setConfirmBulkDelete]=useState(false);
  // Machine chips: machines with jobs, open faults or resolved faults
  const allMachines=[...new Set([...jobs.map(j=>j.machine),...Object.keys(machineIssues),...(downtimeLog||[]).map(d=>d.machineName)].filter(Boolean))].sort();
  // Faults follow the machine filter too
  const openIssues=Object.entries(machineIssues).filter(([name])=>machineFilt==="all"||name===machineFilt);
  const resolvedIssues=(downtimeLog||[]).filter(d=>machineFilt==="all"||d.machineName===machineFilt);
  const showIssues=statusFilt==="all"||statusFilt==="issues";
  const showJobs=statusFilt!=="issues";
  const filtered=showJobs?jobs.filter(j=>
    // "Opstilling"/"Kører" include side 2 (and deburring counts as running)
    (statusFilt==="all"||j.status===statusFilt||(statusFilt==="setup"&&j.status==="side2_setup")||(statusFilt==="run"&&(j.status==="side2_run"||j.status==="deburring")))&&
    (machineFilt==="all"||j.machine===machineFilt)
  ):[];
  const active=sortActive(filtered.filter(j=>j.status!=="done"));
  const q=search.trim().toLowerCase();
  const done=filtered.filter(j=>j.status==="done").filter(j=>
    !q||
    (j.customer||"").toLowerCase().includes(q)||
    (j.job||"").toLowerCase().includes(q)||
    (j.machine||"").toLowerCase().includes(q)||
    (j.operatorName||"").toLowerCase().includes(q)||
    (j.op||"").toLowerCase().includes(q)
  );
  const allVisibleSelected=done.length>0&&done.every(j=>selectedIds.has(j.id));
  const toggleSelectAll=()=>{
    if(allVisibleSelected){setSelectedIds(new Set());}
    else{setSelectedIds(new Set(done.map(j=>j.id)));}
  };
  const toggleOne=id=>setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const bulkDelete=()=>{
    const ids=new Set(selectedIds);
    const now=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>
      ids.has(x.id)?{...x,deleted:true,status:"done",phaseStartedAt:null,lastModifiedAt:now}:x
    );
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    saveNow&&saveNow();
    notify(`${ids.size} job slettet`,"warn");
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        {[["all","Alle"],["setup","Opstilling"],["run","Kører"],["done","Færdig"],["issues","Løste fejl"]].map(([f,l])=>(
          <button key={f} style={tag(statusFilt===f)} onClick={()=>setStatusFilt(f)}>
            {l}
            {f==="issues"&&resolvedIssues.length>0&&<span style={{background:"rgba(255,255,255,.15)",borderRadius:20,fontSize:12,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{resolvedIssues.length}</span>}
          </button>
        ))}
      </div>
      {allMachines.length>0&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>Alle</button>
        {allMachines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
      </div>}
      {showIssues&&openIssues.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.red}40`}}>
            <i className="ti ti-alert-triangle"/> Maskinfejl · {openIssues.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {openIssues.map(([name,issue])=>(
              <IssueCard key={name} name={name} issue={issue} setMachineIssues={setMachineIssues} resolveIssue={resolveIssue} saveNow={saveNow}/>
            ))}
          </div>
        </div>
      )}
      {showJobs&&!filtered.length&&!openIssues.length&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Ingen job fundet.</div>}
      {showJobs&&active.length>0&&(
        <ActiveJobsGrid jobs={active} renderCard={j=>(
          <AdminJobCard key={j.id} j={j} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} saveNow={saveNow} stateRef={stateRef}/>
        )}/>
      )}
      {showIssues&&resolvedIssues.length>0&&(
        <>
          <div style={{paddingTop:4,borderTop:`1px solid ${C.border}`,marginBottom:10,marginTop:6}}>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
              <i className="ti ti-history"/> Løste fejl · {resolvedIssues.length}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
            {[...resolvedIssues].reverse().map(entry=>(
              <ResolvedIssueCard key={entry.id} entry={entry} setDowntimeLog={setDowntimeLog} saveNow={saveNow}/>
            ))}
          </div>
        </>
      )}
      {showJobs&&filtered.filter(j=>j.status==="done").length>0&&(
        <>
          <div style={{paddingTop:4,borderTop:`1px solid ${C.border}`,marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Afsluttede · {done.length}{q&&` of ${filtered.filter(j=>j.status==="done").length}`}</div>
              {q&&<button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:0}} onClick={()=>{setSearch("");setSelectedIds(new Set());setConfirmBulkDelete(false);}}><i className="ti ti-x"/></button>}
            </div>
            <div style={{position:"relative"}}>
              <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
              <input
                style={{...inp(),paddingLeft:32,fontSize:16}}
                value={search}
                onChange={e=>{setSearch(e.target.value);setSelectedIds(new Set());setConfirmBulkDelete(false);}}
                placeholder="Søg kunde, tegningsnr., maskine, operatør…"
              />
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
              <button style={{...btn("outline",false,true),fontSize:14,padding:"4px 10px"}} onClick={toggleSelectAll}>
                <i className={`ti ti-${allVisibleSelected?"square-check":"square"}`}/>
                {allVisibleSelected?` Fravælg alle (${done.length})`:" Vælg alle"}
              </button>
              {selectedIds.size>0&&!confirmBulkDelete&&(
                <button style={{...btn("danger",false,true),fontSize:14,padding:"4px 10px"}} onClick={()=>setConfirmBulkDelete(true)}>
                  <i className="ti ti-trash"/> Slet {selectedIds.size} job
                </button>
              )}
              {confirmBulkDelete&&(
                <div style={{display:"flex",alignItems:"center",gap:6,background:`${C.red}12`,border:`1px solid ${C.red}40`,borderRadius:8,padding:"6px 10px"}}>
                  <span style={{fontSize:14,color:C.red,fontWeight:700}}><i className="ti ti-alert-triangle"/> Slet {selectedIds.size} job?</span>
                  <button style={{...btn("danger",true,true),fontSize:14,padding:"3px 10px"}} onClick={bulkDelete}><i className="ti ti-check"/> Ja</button>
                  <button style={{...btn("outline",false,true),fontSize:14,padding:"3px 10px"}} onClick={()=>setConfirmBulkDelete(false)}>Annuller</button>
                </div>
              )}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:16}}>
            {done.map(j=>(
              <AdminJobCard key={j.id} j={j} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} saveNow={saveNow} stateRef={stateRef} selected={selectedIds.has(j.id)} onToggleSelect={()=>toggleOne(j.id)}/>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ResolvedIssueCard({entry,setDowntimeLog,saveNow}){
  const [editing,setEditing]=useState(false);
  const [reason,setReason]=useState(entry.reason||"");
  const [fixDescription,setFixDescription]=useState(entry.fixDescription||"");
  const [fixCost,setFixCost]=useState(entry.fixCost||"");
  const accentColor=entry.status==="down"?C.red:C.amber;
  const save=()=>{
    setDowntimeLog(prev=>prev.map(e=>e.id===entry.id?{...e,reason:reason.trim(),fixDescription:fixDescription.trim(),fixCost:fixCost.trim(),updatedAt:Date.now()}:e));
    setEditing(false);
    saveNow&&saveNow();
    notify("Gemt");
  };
  return(
    <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.machineName}</div>
          <div style={{fontSize:13,color:C.muted}}>{fmtDate(entry.reportedAt)}</div>
        </div>
        <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:2}} onClick={()=>{setReason(entry.reason||"");setFixDescription(entry.fixDescription||"");setFixCost(entry.fixCost||"");setEditing(e=>!e);}}>
          <i className={`ti ti-${editing?"x":"pencil"}`}/>
        </button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        <span style={badge("run")}>Løst</span>
        <span style={badge(entry.status==="down"?"down":"repair")}>{entry.status==="down"?"Var nede":"Var til reparation"}</span>
      </div>
      {!editing&&(
        <div style={{fontSize:13,color:C.muted,display:"flex",flexDirection:"column",gap:3}}>
          {entry.reason&&<div style={{color:C.text}}><i className="ti ti-alert-circle"/> {entry.reason}</div>}
          {entry.fixDescription&&<div><i className="ti ti-tools"/> {entry.fixDescription}</div>}
          {entry.fixCost&&<div><i className="ti ti-coin"/> {entry.fixCost}</div>}
          <div style={{marginTop:2}}><i className="ti ti-user-check"/> Løst af {entry.resolvedBy}</div>
        </div>
      )}
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
          <div>
            <div style={label}>Beskrivelse af fejlen</div>
            <input style={inp()} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Hvad var galt?"/>
          </div>
          <div>
            <div style={label}>Løsning</div>
            <input style={inp()} value={fixDescription} onChange={e=>setFixDescription(e.target.value)} placeholder="Hvad blev der gjort for at løse det?"/>
          </div>
          <div>
            <div style={label}>Pris</div>
            <input style={inp()} value={fixCost} onChange={e=>setFixCost(e.target.value)} placeholder="f.eks. 250 kr i reservedele"/>
          </div>
          <button style={btn("primary",true,true)} onClick={save}><i className="ti ti-check"/> Gem</button>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:2}}>
        <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Nedetid</div>
        <span style={{fontSize:16,color:C.muted,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(entry.downtimeSec||0)}</span>
      </div>
    </div>
  );
}
