import { useState } from "react";
import { notify } from "../components/Feedback";
import { uploadPhoto } from "../lib/api";
import { PhotoChoice } from "../components/PhotoChoice";
import { C, card, inp, sel, btn, avatar, label, errMsg } from "../lib/theme";
import { initials, recentCustomers, lastFinishedMachine } from "../lib/util";

// ═══════════════════════════════════════════════════════
// QUICK ENTRY — start + complete in one form
// ═══════════════════════════════════════════════════════
export function QuickEntryTab({user,machines,jobs,setJobs,setTab,saveNow}){
  const defaultMachine=lastFinishedMachine(jobs,user.id,machines);
  const [customer,setCustomer]=useState("");
  const [job,    setJob]    =useState("");
  const [machine,setMachine]=useState(defaultMachine);
  const [op,     setOp]     =useState("");
  const [setupH,  setSetupH]  =useState("");
  const [setupM,  setSetupM]  =useState("");
  const [runH,    setRunH]    =useState("");
  const [runM,    setRunM]    =useState("");
  const [pieces, setPieces] =useState("");
  const [photo,  setPhoto]  =useState(null);
  const [errs,   setErrs]   =useState({});
  const [done,   setDone]   =useState(false);

  const handlePhoto=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>setPhoto(ev.target.result); r.readAsDataURL(f);
  };

  const submit=async()=>{
    const e={};
    if(!customer.trim())       e.customer="Kunde skal udfyldes";
    if(!job.trim())            e.job="Tegningsnr. skal udfyldes";
    if(!machine)               e.machine="Vælg en maskine";
    if((parseInt(runH)||0)+(parseInt(runM)||0)===0) e.runTime="Indtast produktionstiden";
    if(!pieces||parseInt(pieces)<1)   e.pieces="Indtast antal producerede stk.";
    if(!photo)                 e.photo="Kvalitetsfoto er påkrævet";
    if(Object.keys(e).length){setErrs(e);return;}

    const setupSec=(parseInt(setupH)||0)*3600+(parseInt(setupM)||0)*60;
    const runSec  =(parseInt(runH)||0)*3600+(parseInt(runM)||0)*60;
    const completedAt=Date.now();
    const date=new Date(completedAt);
    const year=date.getFullYear();
    const month=String(date.getMonth()+1).padStart(2,"0");
    const dateStr=`${year}-${month}-${String(date.getDate()).padStart(2,"0")}`;
    const safeName=(s)=>s.replace(/[^a-z0-9]/gi,"_");
    const filename=`${year}/${month}/quality_${safeName(customer.trim())}_${safeName(job.trim())}_${dateStr}.jpg`;
    // Upload photo to server (falls back to base64 if offline)
    const photoUrl=await uploadPhoto(photo,filename);
    setJobs(prev=>[{
      id:completedAt, customer:customer.trim(), job:job.trim(), machine, op:op.trim(),
      operatorId:user.id, operatorName:user.name,
      status:"done",
      setupSec, runSec,
      createdAt:completedAt, completedAt, lastModifiedAt:completedAt,
      pieces:parseInt(pieces), photoData:photoUrl,
      quickEntry:true,
    },...prev]);
    // Auto-download
    const a=document.createElement("a"); a.href=photo; a.download=filename; a.click();
    saveNow&&saveNow();
    setDone(true);
    notify("Job registreret");
  };

  const reset=()=>{
    setCustomer("");setJob("");setMachine(defaultMachine);setOp("");setSetupH("");setSetupM("");setRunH("");setRunM("");
    setPieces("");setPhoto(null);setErrs({});setDone(false);
  };

  // ── completion screen ──
  if(done) return(
    <div style={{padding:"14px 16px"}}>
      <div style={{...card(C.green),textAlign:"center",padding:"28px 20px"}}>
        <i className="ti ti-circle-check" style={{fontSize:44,color:C.green,display:"block",marginBottom:12}}/>
        <div style={{fontSize:18,color:C.text,fontWeight:700,marginBottom:6}}>Job registreret!</div>
        <div style={{fontSize:15,color:C.muted,marginBottom:20}}>Gemt i historik og rapporter.</div>
        <div style={{display:"flex",gap:10}}>
          <button style={btn("primary",true)}  onClick={reset}><i className="ti ti-plus"/> Registrer et job mere</button>
          <button style={btn("outline",true)}  onClick={()=>setTab("history")}><i className="ti ti-list"/> Se historik</button>
        </div>
      </div>
    </div>
  );

  // ── checklist progress bar ──
  const filled=[!!customer.trim(),!!job.trim(),!!machine,(parseInt(runH)||0)+(parseInt(runM)||0)>0,!!pieces&&parseInt(pieces)>0,!!photo];
  const pct=Math.round((filled.filter(Boolean).length/filled.length)*100);

  return(
    <div style={{padding:"14px 16px"}}>

      {/* header + progress */}
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-bolt"/> Hurtig registrering af job</div>
          <div style={{fontSize:13,color:C.muted,letterSpacing:1}}>{pct}% udfyldt</div>
        </div>
        <div style={{height:4,background:C.raised,borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",background:pct===100?C.green:C.amber,width:`${pct}%`,borderRadius:2,transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:13,color:C.muted,marginTop:6,letterSpacing:1}}>
          Udfyld alle felter for at registrere et færdigt job uden at bruge tiduret.
        </div>
      </div>

      {/* ── Job info ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-file-description"/> Jobdetaljer</div>
        <div style={{marginBottom:10}}>
          <label style={label}>Kunde <span style={{color:C.red}}>*</span></label>
          <input style={inp(errs.customer)} value={customer} onChange={e=>{setCustomer(e.target.value);setErrs(p=>({...p,customer:null}));}} placeholder="f.eks. Firma A/S" list="st-customers-q" autoComplete="off"/>
          <datalist id="st-customers-q">{recentCustomers(jobs).map(c=><option key={c} value={c}/>)}</datalist>
          {errs.customer&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.customer}</div>}
        </div>
        <div style={{marginBottom:10}}>
          <label style={label}>Tegningsnr. <span style={{color:C.red}}>*</span></label>
          <input style={inp(errs.job)} value={job} onChange={e=>{setJob(e.target.value);setErrs(p=>({...p,job:null}));}} placeholder="f.eks. 7641-19"/>
          {errs.job&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.job}</div>}
        </div>
        <div style={{marginBottom:10}}>
          <label style={label}>Maskine <span style={{color:C.red}}>*</span></label>
          <select style={sel(errs.machine)} value={machine} onChange={e=>{setMachine(e.target.value);setErrs(p=>({...p,machine:null}));}}>
            <option value="">— Vælg maskine —</option>
            {machines.filter(m=>{
              if(!m.active) return false;
              const userDepts=user.departments||[];
              if(userDepts.length===0) return true;
              return !m.department||userDepts.includes(m.department);
            }).map(m=><option key={m.id}>{m.name}</option>)}
          </select>
          {errs.machine&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.machine}</div>}
        </div>
        <div>
          <label style={label}>Operation / beskrivelse</label>
          <input style={inp()} value={op} onChange={e=>setOp(e.target.value)} placeholder="f.eks. planfræsning af top"/>
        </div>
      </div>

      {/* ── Times ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-clock"/> Tidsforbrug</div>
        <div style={{marginBottom:10}}>
          <label style={label}>Opstillingstid <span style={{fontSize:12,color:C.muted}}>(valgfri)</span></label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <input type="number" min="0" style={{...inp(),textAlign:"center",fontSize:20,color:C.amber}}
                value={setupH} onChange={e=>setSetupH(e.target.value)} placeholder="0"/>
              <div style={{fontSize:12,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Timer</div>
            </div>
            <div>
              <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",fontSize:20,color:C.amber}}
                value={setupM} onChange={e=>setSetupM(e.target.value)} placeholder="0"/>
              <div style={{fontSize:12,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Minutter</div>
            </div>
          </div>
        </div>
        <div>
          <label style={label}>Produktionstid <span style={{color:C.red}}>*</span></label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <input type="number" min="0" style={{...inp(errs.runTime),textAlign:"center",fontSize:20,color:C.green}}
                value={runH} onChange={e=>{setRunH(e.target.value);setErrs(p=>({...p,runTime:null}));}} placeholder="0"/>
              <div style={{fontSize:12,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Timer</div>
            </div>
            <div>
              <input type="number" min="0" max="59" style={{...inp(errs.runTime),textAlign:"center",fontSize:20,color:C.green}}
                value={runM} onChange={e=>{setRunM(e.target.value);setErrs(p=>({...p,runTime:null}));}} placeholder="0"/>
              <div style={{fontSize:12,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Minutter</div>
            </div>
          </div>
          {errs.runTime&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.runTime}</div>}
        </div>
      </div>

      {/* ── Pieces ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-box"/> Produceret</div>
        <label style={label}>Producerede stk. <span style={{color:C.red}}>*</span></label>
        <input type="number" min="1" step="1"
          style={{...inp(errs.pieces),textAlign:"center",fontSize:26,color:C.amber,fontWeight:700}}
          value={pieces} onChange={e=>{setPieces(e.target.value);setErrs(p=>({...p,pieces:null}));}} placeholder="0"/>
        {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
      </div>

      {/* ── Photo ── */}
      <div style={{...card(),marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-camera"/> Kvalitetsfoto <span style={{color:C.red}}>*</span></div>
          <span style={{fontSize:13,letterSpacing:1,color:photo?C.green:C.red}}>{photo?"✓ Vedhæftet":"Skal udfyldes"}</span>
        </div>
        {photo&&<div style={{border:`2px solid ${C.green}`,borderRadius:8,padding:12,textAlign:"center",background:"rgba(39,174,96,.05)",marginBottom:8}}>
          <img src={photo} style={{maxHeight:110,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/>
          <div style={{fontSize:14,color:C.green,letterSpacing:1}}>Foto vedhæftet — vælg nedenfor for at skifte</div>
        </div>}
        <PhotoChoice error={!!errs.photo&&!photo} onChange={e=>{handlePhoto(e);setErrs(p=>({...p,photo:null}));}}/>
        {errs.photo&&!photo&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.photo}</div>}
      </div>

      {/* ── operator chip ── */}
      <div style={{...card(),background:"#1a2535",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <div style={avatar()}>{initials(user.name)}</div>
        <div><div style={{color:C.muted,letterSpacing:1,textTransform:"uppercase",fontSize:12,marginBottom:2}}>Registreres som</div><div style={{fontSize:16,color:C.text}}>{user.name}</div></div>
      </div>

      {/* ── submit ── */}
      <button style={btn("success",true)} onClick={submit}>
        <i className="ti ti-circle-check"/> &nbsp;Gem færdigt job
      </button>
      <div style={{fontSize:13,color:C.muted,textAlign:"center",marginTop:10,letterSpacing:1}}>
        Alle felter markeret med <span style={{color:C.red}}>*</span> skal udfyldes før du gemmer
      </div>
    </div>
  );
}
