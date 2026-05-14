import { useState, useEffect, useRef } from "react";

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const INIT_USERS = [
  { id: 1, name: "Erik Hansen",    pin: "1234", role: "operator", active: true },
  { id: 2, name: "Lars Pedersen",  pin: "2222", role: "operator", active: true },
  { id: 3, name: "Maria Jensen",   pin: "3333", role: "operator", active: true },
  { id: 4, name: "Thomas Nielsen", pin: "4444", role: "operator", active: true },
  { id: 5, name: "Anna Andersen",  pin: "5555", role: "operator", active: true },
  { id: 6, name: "Admin",          pin: "0000", role: "admin",    active: true },
];
const INIT_MACHINES = [
  { id: 1, name: "CNC Mill #1",     active: true },
  { id: 2, name: "CNC Mill #2",     active: true },
  { id: 3, name: "Lathe #1",        active: true },
  { id: 4, name: "Lathe #2",        active: true },
  { id: 5, name: "Drill Press",     active: true },
  { id: 6, name: "Surface Grinder", active: true },
  { id: 7, name: "Band Saw",        active: true },
  { id: 8, name: "EDM #1",          active: true },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmt(s) {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`:
             `${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}
function fmtDate(ts){
  return new Date(ts).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function toDateInput(ts){ return new Date(ts).toISOString().slice(0,10); }
function initials(n){ return n.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase(); }

// ─── COLOURS ──────────────────────────────────────────────────────────────────
const C={
  bg:"#151e2b",surface:"#1d2b3d",raised:"#243044",
  border:"rgba(255,255,255,0.07)",
  amber:"#f0a500",green:"#27ae60",red:"#e74c3c",blue:"#3b82f6",
  text:"#e0e6f0",muted:"#8a9bb5",
};

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const card  =(accent)=>({background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:10,borderLeft:accent?`4px solid ${accent}`:`1px solid ${C.border}`});
const inp   =(err)=>({width:"100%",padding:"12px 14px",background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:14,boxSizing:"border-box"});
const sel   =(err)=>({width:"100%",padding:"12px 14px",background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:14,boxSizing:"border-box",WebkitAppearance:"none"});
const btn   =(v,full,sm)=>({width:full?"100%":"auto",padding:sm?"7px 11px":"12px 16px",border:v==="outline"?`1px solid ${C.border}`:"none",borderRadius:8,fontFamily:"inherit",fontSize:sm?10:12,letterSpacing:sm?1:2,textTransform:"uppercase",cursor:"pointer",fontWeight:700,
  background:v==="primary"?C.amber:v==="success"?C.green:v==="danger"?C.red:v==="blue"?C.blue:v==="outline"?"transparent":C.raised,
  color:(v==="primary"||v==="success"||v==="blue")?"#1a1a1a":v==="danger"?"white":C.muted});
const navBtn=(a)=>({flex:"0 0 auto",padding:"9px 14px",border:"none",borderRadius:8,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:11,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",fontWeight:a?700:400});
const badge =(s)=>({fontSize:10,letterSpacing:1.5,padding:"3px 8px",borderRadius:20,textTransform:"uppercase",
  background:s==="setup"?"rgba(240,165,0,.15)":s==="run"?"rgba(39,174,96,.15)":s==="admin"?"rgba(59,130,246,.15)":"rgba(138,155,181,.1)",
  color:s==="setup"?C.amber:s==="run"?C.green:s==="admin"?C.blue:C.muted});
const statBox={background:C.raised,borderRadius:8,padding:"12px 14px",textAlign:"center",border:`1px solid rgba(255,255,255,.05)`};
const tag   =(a)=>({display:"inline-flex",alignItems:"center",padding:"5px 10px",borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:10,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"});
const avatar=(bg)=>({width:38,height:38,borderRadius:"50%",background:bg||C.raised,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.amber,fontWeight:700,flexShrink:0,border:`1px solid rgba(255,255,255,.1)`});
const label ={display:"block",fontSize:10,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginBottom:6};
const errMsg={fontSize:11,color:C.red,letterSpacing:1,marginTop:6};
const meta  ={display:"flex",flexWrap:"wrap",gap:12,fontSize:11,color:C.muted,marginTop:6};
const th    ={textAlign:"left",padding:"8px 10px",borderBottom:`1px solid rgba(255,255,255,.08)`,color:C.muted,fontSize:10,letterSpacing:2,textTransform:"uppercase"};
const td    ={padding:"8px 10px",borderBottom:`1px solid rgba(255,255,255,.04)`,color:C.text,verticalAlign:"middle"};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportCSV(rows,from,to){
  if(!rows.length){alert("No jobs match the selected filters.");return;}
  const cols=[["Job/Part","Machine","Operator","Operation","Type","Completed","Setup (min)","Run (min)","Total (min)","Pieces","Photo"]];
  rows.forEach(j=>cols.push([j.job,j.machine,j.operatorName,j.op||"",j.quickEntry?"Quick Entry":"Timed",fmtDate(j.completedAt),(j.setupSec/60).toFixed(1),(j.runSec/60).toFixed(1),((j.setupSec+j.runSec)/60).toFixed(1),j.pieces,j.photoData?"Yes":"No"]));
  const csv=cols.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  const suffix=from&&to?`_${from}_to_${to}`:from?`_from_${from}`:to?`_to_${to}`:"";
  a.download=`ShopTrack${suffix}.csv`;
  a.click();
}

// ═══════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════
export default function App(){
  const [user,  setUser]     =useState(null);
  const [tab,   setTab]      =useState("new");
  const [jobs,  setJobs]     =useState([]);
  const [users, setUsers]    =useState(INIT_USERS);
  const [machines,setMachines]=useState(INIT_MACHINES);
  const [completeId,setCompleteId]=useState(null);
  const [clock, setClock]    =useState("");

  useEffect(()=>{
    const t=setInterval(()=>{const n=new Date();setClock([n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":"));},1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const t=setInterval(()=>{setJobs(prev=>prev.map(j=>j.status==="setup"?{...j,setupSec:j.setupSec+1}:j.status==="run"?{...j,runSec:j.runSec+1}:j));},1000);
    return()=>clearInterval(t);
  },[]);

  const login =u=>{setUser(u);setTab(u.role==="admin"?"admin":"new");};
  const logout =()=>{setUser(null);setTab("new");};

  if(!user) return <LoginScreen users={users} onLogin={login}/>;

  const activeCnt=jobs.filter(j=>j.status!=="done"&&j.operatorId===user.id).length;

  return(
    <div style={{fontFamily:"'Share Tech Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:13,letterSpacing:3,textTransform:"uppercase",color:C.amber,fontWeight:700}}>⚙ ShopTrack</div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:19,letterSpacing:3}}>{clock}</div>
          <div style={{fontSize:11,textAlign:"right"}}>
            <div style={{color:C.text}}>{user.name}</div>
            <div style={{fontSize:9,letterSpacing:1,textTransform:"uppercase",color:user.role==="admin"?C.amber:C.muted}}>{user.role}</div>
          </div>
          <button style={btn("outline",false,true)} onClick={logout}>Log out</button>
        </div>
      </div>

      {/* NAV */}
      {user.role==="operator"&&(
        <div style={{display:"flex",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
          {[["new","plus","New Job"],["quick","bolt","Quick Entry"],["active","player-play","Active"],["history","list","History"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
              <i className={`ti ti-${ic}`}/> {lb}
              {t==="active"&&activeCnt>0&&<span style={{background:C.amber,color:"#1a1a1a",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{activeCnt}</span>}
            </button>
          ))}
        </div>
      )}
      {user.role==="admin"&&(
        <div style={{display:"flex",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
          {[["admin","layout-dashboard","Dashboard"],["alljobs","tool","All Jobs"],["reports","chart-bar","Reports"],["manage","settings","Manage"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}><i className={`ti ti-${ic}`}/> {lb}</button>
          ))}
        </div>
      )}

      {/* CONTENT */}
      {tab==="new"    &&<NewJobTab      user={user} machines={machines} setJobs={setJobs}/>}
      {tab==="quick"  &&<QuickEntryTab  user={user} machines={machines} setJobs={setJobs} setTab={setTab}/>}
      {tab==="active" &&<ActiveTab      user={user} jobs={jobs} setJobs={setJobs} setCompleteId={setCompleteId}/>}
      {tab==="history"&&<HistoryTab     user={user} jobs={jobs}/>}
      {tab==="admin"  &&<AdminDash      jobs={jobs}/>}
      {tab==="alljobs"&&<AllJobsTab     jobs={jobs} setCompleteId={setCompleteId}/>}
      {tab==="reports"&&<ReportsTab     jobs={jobs}/>}
      {tab==="manage" &&<ManageTab      users={users} setUsers={setUsers} machines={machines} setMachines={setMachines}/>}

      {completeId&&<CompleteModal jobId={completeId} jobs={jobs} setJobs={setJobs} onClose={()=>setCompleteId(null)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════
function LoginScreen({users,onLogin}){
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");

  const pressKey=k=>{
    if(k==="del"){setPin(p=>p.slice(0,-1));return;}
    if(pin.length>=4) return;
    const np=pin+k; setPin(np);
    if(np.length===4&&sel){
      if(sel.pin===np){onLogin(sel);setPin("");setSel(null);}
      else{setErr("Wrong PIN");setPin("");setTimeout(()=>setErr(""),1500);}
    }
  };

  return(
    <div style={{fontFamily:"'Share Tech Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" rel="stylesheet"/>
      <div style={{fontSize:22,color:C.amber,letterSpacing:4,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>⚙ ShopTrack</div>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:28}}>Machine Shop Job Tracker</div>
      <div style={{width:"100%",maxWidth:360}}>
        {!sel?(
          <>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Select your name</div>
            {users.filter(u=>u.active).map(u=>(
              <button key={u.id} style={{...card(),width:"100%",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",marginBottom:8}}
                onClick={()=>{setSel(u);setPin("");setErr("");}}>
                <div style={avatar()}>{initials(u.name)}</div>
                <div>
                  <div style={{fontSize:14,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:10,letterSpacing:1,textTransform:"uppercase",color:u.role==="admin"?C.amber:C.muted,marginTop:2}}>{u.role}</div>
                </div>
              </button>
            ))}
          </>
        ):(
          <>
            <button style={{...btn("outline",false,true),marginBottom:16,display:"flex",alignItems:"center",gap:8}} onClick={()=>{setSel(null);setPin("");}}>
              <i className="ti ti-arrow-left"/> Back
            </button>
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{...avatar(),margin:"0 auto 10px",width:52,height:52,fontSize:18}}>{initials(sel.name)}</div>
              <div style={{fontSize:14,color:C.text}}>{sel.name}</div>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Enter PIN</div>
            </div>
            <div style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center",fontSize:28,letterSpacing:10,color:C.amber,marginBottom:4,border:`1px solid ${C.border}`,minHeight:56}}>
              {pin?"●".repeat(pin.length):" "}
            </div>
            {err&&<div style={{textAlign:"center",color:C.red,fontSize:12,marginBottom:8,letterSpacing:1}}>{err}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:16}}>
              {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i)=>(
                k===""?<div key={i}/>:
                <button key={i} style={{padding:"18px 0",border:`1px solid rgba(255,255,255,.1)`,borderRadius:10,background:C.raised,color:C.text,fontSize:20,cursor:"pointer",fontFamily:"inherit",textAlign:"center",lineHeight:1}}
                  onClick={()=>pressKey(k)}>
                  {k==="del"?<i className="ti ti-backspace"/>:k}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// NEW JOB
// ═══════════════════════════════════════════════════════
function NewJobTab({user,machines,setJobs}){
  const [job,setJob]=useState(""); const [machine,setMachine]=useState(""); const [op,setOp]=useState(""); const [errs,setErrs]=useState({});
  const start=()=>{
    const e={};if(!job.trim())e.job="Required";if(!machine)e.machine="Required";
    if(Object.keys(e).length){setErrs(e);return;}
    setJobs(prev=>[{id:Date.now(),job:job.trim(),machine,op:op.trim(),operatorId:user.id,operatorName:user.name,status:"setup",setupSec:0,runSec:0,createdAt:Date.now(),pieces:0,photoData:null},...prev]);
    setJob("");setMachine("");setOp("");setErrs({});
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Start New Job</div>
      <div style={{marginBottom:12}}>
        <label style={label}>Job / Part Number *</label>
        <input style={inp(errs.job)} value={job} onChange={e=>setJob(e.target.value)} placeholder="e.g. JOB-2025-0451"/>
        {errs.job&&<div style={errMsg}>{errs.job}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Machine *</label>
        <select style={sel(errs.machine)} value={machine} onChange={e=>setMachine(e.target.value)}>
          <option value="">— Select Machine —</option>
          {machines.filter(m=>m.active).map(m=><option key={m.id}>{m.name}</option>)}
        </select>
        {errs.machine&&<div style={errMsg}>{errs.machine}</div>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Operation / Description</label>
        <input style={inp()} value={op} onChange={e=>setOp(e.target.value)} placeholder="e.g. Face milling top surface"/>
      </div>
      <div style={{...card(),background:"#1a2535",marginBottom:16}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Logged in as</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={avatar()}>{initials(user.name)}</div><div style={{fontSize:14,color:C.text}}>{user.name}</div></div>
      </div>
      <button style={btn("primary",true)} onClick={start}><i className="ti ti-player-play"/> &nbsp;Begin Setup Timer</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// QUICK ENTRY — start + complete in one form
// ═══════════════════════════════════════════════════════
function QuickEntryTab({user,machines,setJobs,setTab}){
  const [job,    setJob]    =useState("");
  const [machine,setMachine]=useState("");
  const [op,     setOp]     =useState("");
  const [setupMin,setSetupMin]=useState("");
  const [runMin, setRunMin] =useState("");
  const [pieces, setPieces] =useState("");
  const [photo,  setPhoto]  =useState(null);
  const [errs,   setErrs]   =useState({});
  const [done,   setDone]   =useState(false);
  const fileRef=useRef();

  const handlePhoto=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>setPhoto(ev.target.result); r.readAsDataURL(f);
  };

  const submit=()=>{
    const e={};
    if(!job.trim())            e.job="Job / part number is required";
    if(!machine)               e.machine="Select a machine";
    if(!runMin||parseFloat(runMin)<=0) e.runMin="Enter the run time in minutes";
    if(!pieces||parseInt(pieces)<1)   e.pieces="Enter number of pieces produced";
    if(!photo)                 e.photo="Quality photo is required";
    if(Object.keys(e).length){setErrs(e);return;}

    const setupSec=Math.round((parseFloat(setupMin)||0)*60);
    const runSec  =Math.round(parseFloat(runMin)*60);
    setJobs(prev=>[{
      id:Date.now(), job:job.trim(), machine, op:op.trim(),
      operatorId:user.id, operatorName:user.name,
      status:"done",
      setupSec, runSec,
      createdAt:Date.now(), completedAt:Date.now(),
      pieces:parseInt(pieces), photoData:photo,
      quickEntry:true,
    },...prev]);
    setDone(true);
  };

  const reset=()=>{
    setJob("");setMachine("");setOp("");setSetupMin("");setRunMin("");
    setPieces("");setPhoto(null);setErrs({});setDone(false);
  };

  // ── completion screen ──
  if(done) return(
    <div style={{padding:"14px 16px"}}>
      <div style={{...card(C.green),textAlign:"center",padding:"28px 20px"}}>
        <i className="ti ti-circle-check" style={{fontSize:44,color:C.green,display:"block",marginBottom:12}}/>
        <div style={{fontSize:16,color:C.text,fontWeight:700,marginBottom:6}}>Job Logged!</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:20}}>Entry saved to history and reports.</div>
        <div style={{display:"flex",gap:10}}>
          <button style={btn("primary",true)}  onClick={reset}><i className="ti ti-plus"/> Log Another Job</button>
          <button style={btn("outline",true)}  onClick={()=>setTab("history")}><i className="ti ti-list"/> View History</button>
        </div>
      </div>
    </div>
  );

  // ── checklist progress bar ──
  const filled=[!!job.trim(),!!machine,!!runMin&&parseFloat(runMin)>0,!!pieces&&parseInt(pieces)>0,!!photo];
  const pct=Math.round((filled.filter(Boolean).length/filled.length)*100);

  return(
    <div style={{padding:"14px 16px"}}>

      {/* header + progress */}
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-bolt"/> Quick Job Entry</div>
          <div style={{fontSize:10,color:C.muted,letterSpacing:1}}>{pct}% complete</div>
        </div>
        <div style={{height:4,background:C.raised,borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",background:pct===100?C.green:C.amber,width:`${pct}%`,borderRadius:2,transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:10,color:C.muted,marginTop:6,letterSpacing:1}}>
          Fill in all fields below to log a completed job without using the live timers.
        </div>
      </div>

      {/* ── Job info ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-file-description"/> Job Details</div>
        <div style={{marginBottom:10}}>
          <label style={label}>Job / Part Number <span style={{color:C.red}}>*</span></label>
          <input style={inp(errs.job)} value={job} onChange={e=>{setJob(e.target.value);setErrs(p=>({...p,job:null}));}} placeholder="e.g. JOB-2025-0451"/>
          {errs.job&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.job}</div>}
        </div>
        <div style={{marginBottom:10}}>
          <label style={label}>Machine <span style={{color:C.red}}>*</span></label>
          <select style={sel(errs.machine)} value={machine} onChange={e=>{setMachine(e.target.value);setErrs(p=>({...p,machine:null}));}}>
            <option value="">— Select Machine —</option>
            {machines.filter(m=>m.active).map(m=><option key={m.id}>{m.name}</option>)}
          </select>
          {errs.machine&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.machine}</div>}
        </div>
        <div>
          <label style={label}>Operation / Description</label>
          <input style={inp()} value={op} onChange={e=>setOp(e.target.value)} placeholder="e.g. Face milling top surface"/>
        </div>
      </div>

      {/* ── Times ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-clock"/> Time Spent</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <label style={label}>Setup Time (min)</label>
            <input type="number" min="0" step="0.5" style={{...inp(),textAlign:"center",fontSize:18,color:C.amber}}
              value={setupMin} onChange={e=>setSetupMin(e.target.value)} placeholder="0"/>
            <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Optional</div>
          </div>
          <div>
            <label style={label}>Run Time (min) <span style={{color:C.red}}>*</span></label>
            <input type="number" min="0.1" step="0.5" style={{...inp(errs.runMin),textAlign:"center",fontSize:18,color:C.green}}
              value={runMin} onChange={e=>{setRunMin(e.target.value);setErrs(p=>({...p,runMin:null}));}} placeholder="0"/>
            {errs.runMin&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.runMin}</div>}
          </div>
        </div>
      </div>

      {/* ── Pieces ── */}
      <div style={{...card(),marginBottom:10}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-box"/> Production Output</div>
        <label style={label}>Pieces Produced <span style={{color:C.red}}>*</span></label>
        <input type="number" min="1" step="1"
          style={{...inp(errs.pieces),textAlign:"center",fontSize:26,color:C.amber,fontWeight:700}}
          value={pieces} onChange={e=>{setPieces(e.target.value);setErrs(p=>({...p,pieces:null}));}} placeholder="0"/>
        {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
      </div>

      {/* ── Photo ── */}
      <div style={{...card(),marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-camera"/> Quality Photo <span style={{color:C.red}}>*</span></div>
          <span style={{fontSize:10,letterSpacing:1,color:photo?C.green:C.red}}>{photo?"✓ Attached":"Required"}</span>
        </div>
        <div
          style={{border:`2px dashed ${errs.photo&&!photo?C.red:photo?C.green:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:photo?12:24,textAlign:"center",cursor:"pointer",background:photo?"rgba(39,174,96,.05)":"transparent",transition:"all 0.2s"}}
          onClick={()=>fileRef.current.click()}>
          {photo
            ?<><img src={photo} style={{maxHeight:110,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/><div style={{fontSize:11,color:C.green,letterSpacing:1}}>Photo attached — tap to replace</div></>
            :<><i className="ti ti-camera" style={{fontSize:32,opacity:0.3,display:"block",marginBottom:8}}/><div style={{fontSize:12,color:C.muted,letterSpacing:1}}>Tap to take or upload photo</div><div style={{fontSize:10,color:C.muted,marginTop:4,opacity:0.6}}>Camera or gallery</div></>}
        </div>
        <input type="file" ref={fileRef} accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{handlePhoto(e);setErrs(p=>({...p,photo:null}));}}/>
        {errs.photo&&!photo&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.photo}</div>}
      </div>

      {/* ── operator chip ── */}
      <div style={{...card(),background:"#1a2535",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <div style={avatar()}>{initials(user.name)}</div>
        <div><div style={{color:C.muted,letterSpacing:1,textTransform:"uppercase",fontSize:9,marginBottom:2}}>Logging as</div><div style={{fontSize:14,color:C.text}}>{user.name}</div></div>
      </div>

      {/* ── submit ── */}
      <button style={btn("success",true)} onClick={submit}>
        <i className="ti ti-circle-check"/> &nbsp;Submit Completed Job
      </button>
      <div style={{fontSize:10,color:C.muted,textAlign:"center",marginTop:10,letterSpacing:1}}>
        All fields marked <span style={{color:C.red}}>*</span> must be filled before submitting
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ACTIVE
// ═══════════════════════════════════════════════════════
function ActiveTab({user,jobs,setJobs,setCompleteId}){
  const active=jobs.filter(j=>j.status!=="done"&&j.operatorId===user.id);
  const startRun=id=>setJobs(prev=>prev.map(j=>j.id===id?{...j,status:"run"}:j));
  if(!active.length) return <div style={{padding:"14px 16px"}}><div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12,letterSpacing:1}}><i className="ti ti-tool" style={{fontSize:34,display:"block",marginBottom:10,opacity:0.3}}/> No active jobs.</div></div>;
  return(
    <div style={{padding:"14px 16px"}}>
      {active.map(j=>(
        <div key={j.id} style={card(j.status==="setup"?C.amber:C.green)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{fontSize:15,color:C.text,fontWeight:700}}>{j.job}</div>
            <span style={badge(j.status)}>{j.status==="setup"?"Setting Up":"Running"}</span>
          </div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span>{j.op&&<span><i className="ti ti-tools"/> {j.op}</span>}</div>
          <div style={{padding:"16px 0 8px",textAlign:"center"}}>
            <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",textAlign:"center",color:j.status==="setup"?C.amber:C.green,marginBottom:6}}>{j.status==="setup"?"Setup Time":"Run Time"}</div>
            <div style={{fontSize:46,letterSpacing:4,textAlign:"center",color:j.status==="setup"?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{fmt(j.status==="setup"?j.setupSec:j.runSec)}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div style={statBox}><div style={{fontSize:20,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmt(j.setupSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Setup {j.status==="run"?"✓":""}</div></div>
            <div style={{...statBox,opacity:j.status==="setup"?0.4:1}}><div style={{fontSize:20,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmt(j.runSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Run Time</div></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {j.status==="setup"&&<button style={{...btn("primary",true),flex:1}} onClick={()=>startRun(j.id)}><i className="ti ti-player-play"/> Start Running</button>}
            {j.status==="run"&&<button style={{...btn("success",true),flex:1}} onClick={()=>setCompleteId(j.id)}><i className="ti ti-check"/> Complete Job</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// COMPLETE MODAL
// ═══════════════════════════════════════════════════════
function CompleteModal({jobId,jobs,setJobs,onClose}){
  const j=jobs.find(x=>x.id===jobId);
  const [pieces,setPieces]=useState(""); const [photoData,setPhotoData]=useState(null); const [errs,setErrs]=useState({});
  const fileRef=useRef();
  if(!j) return null;
  const handlePhoto=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhotoData(ev.target.result);r.readAsDataURL(f);};
  const submit=()=>{
    const e={};
    if(!pieces||parseInt(pieces)<1) e.pieces="Enter number of pieces produced";
    if(!photoData) e.photo="Quality photo is required before completing";
    if(Object.keys(e).length){setErrs(e);return;}
    setJobs(prev=>prev.map(x=>x.id===jobId?{...x,status:"done",pieces:parseInt(pieces),photoData,completedAt:Date.now()}:x));
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-check-circle"/> Complete Job</div>
          <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>
        <div style={{...card(C.amber),background:"#151e2b",marginBottom:14}}>
          <div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={statBox}><div style={{fontSize:20,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmt(j.setupSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Setup</div></div>
          <div style={statBox}><div style={{fontSize:20,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmt(j.runSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Run</div></div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={label}>Pieces Produced <span style={{color:C.red}}>*</span></label>
          <input type="number" min="1" style={{...inp(errs.pieces),fontSize:22,textAlign:"center",color:C.amber}} value={pieces} onChange={e=>setPieces(e.target.value)} placeholder="0"/>
          {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
        </div>
        <div style={{marginBottom:16}}>
          <label style={label}>Quality Photo <span style={{color:C.red}}>*</span> &nbsp;<span style={{color:photoData?C.green:C.red}}>{photoData?"✓ Attached":"Required"}</span></label>
          <div style={{border:`2px dashed ${errs.photo&&!photoData?C.red:photoData?C.green:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:20,textAlign:"center",cursor:"pointer",background:photoData?"rgba(39,174,96,.05)":"transparent"}} onClick={()=>fileRef.current.click()}>
            {photoData?<><img src={photoData} style={{maxHeight:100,borderRadius:6,display:"block",margin:"0 auto 8px"}}/><div style={{fontSize:11,color:C.green,letterSpacing:1}}>Photo attached ✓ — tap to replace</div></>
              :<><i className="ti ti-camera" style={{fontSize:28,opacity:0.4,display:"block",marginBottom:8}}/><div style={{fontSize:11,color:C.muted,letterSpacing:1}}>Tap to take or upload quality photo</div></>}
          </div>
          <input type="file" ref={fileRef} accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhoto}/>
          {errs.photo&&!photoData&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.photo}</div>}
        </div>
        <button style={btn("success",true)} onClick={submit}><i className="ti ti-check"/> Submit &amp; Complete Job</button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// HISTORY (operator)
// ═══════════════════════════════════════════════════════
function HistoryTab({user,jobs}){
  const [filt,setFilt]=useState("all");
  const done=jobs.filter(j=>j.status==="done"&&j.operatorId===user.id&&(filt==="all"||j.machine.includes(filt)));
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","All"],["CNC Mill","CNC"],["Lathe","Lathes"],["Drill","Drill"]].map(([f,l])=>(
          <button key={f} style={tag(filt===f)} onClick={()=>setFilt(f)}>{l}</button>
        ))}
      </div>
      {!done.length?<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12}}><i className="ti ti-list" style={{fontSize:30,display:"block",marginBottom:10,opacity:0.3}}/> No completed jobs.</div>
        :done.map(j=>(
        <div key={j.id} style={{...card(),display:"flex",gap:12}}>
          {j.photoData?<img src={j.photoData} style={{width:52,height:52,borderRadius:8,objectFit:"cover",flexShrink:0,border:`1px solid ${C.border}`}}/>
            :<div style={{width:52,height:52,borderRadius:8,background:C.raised,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-camera-off" style={{color:C.muted,fontSize:18}}/></div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.job}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                <span style={{fontSize:10,color:C.muted}}>{j.pieces} pcs</span>
                {j.quickEntry&&<span style={{...badge("admin"),fontSize:9}}>Quick</span>}
              </div>
            </div>
            <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span></div>
            <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmt(j.setupSec)}</span>
              <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmt(j.runSec)}</span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{fmtDate(j.completedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════
function AdminDash({jobs}){
  const done=jobs.filter(j=>j.status==="done"); const active=jobs.filter(j=>j.status!=="done");
  const totalPieces=done.reduce((s,j)=>s+j.pieces,0);
  const avgRun=done.length?(done.reduce((s,j)=>s+j.runSec,0)/done.length/60).toFixed(1):0;
  const machMap={};done.forEach(j=>{if(!machMap[j.machine])machMap[j.machine]={run:0,setup:0,jobs:0};machMap[j.machine].run+=j.runSec;machMap[j.machine].setup+=j.setupSec;machMap[j.machine].jobs++;});
  const maxRun=Math.max(...Object.values(machMap).map(m=>m.run),1);
  const opMap={};done.forEach(j=>{if(!opMap[j.operatorName])opMap[j.operatorName]={jobs:0,pieces:0,run:0};opMap[j.operatorName].jobs++;opMap[j.operatorName].pieces+=j.pieces;opMap[j.operatorName].run+=j.runSec;});
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
        {[[active.length,"Active Jobs",C.amber],[done.length,"Completed",C.green],[totalPieces,"Total Pieces",C.text],[avgRun+"m","Avg Run",C.muted]].map(([v,l,c])=>(
          <div key={l} style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center"}}><div style={{fontSize:26,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{v}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{l}</div></div>
        ))}
      </div>
      {active.length>0&&<><div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Live Active Jobs</div>
        {active.map(j=>(
          <div key={j.id} style={{...card(j.status==="setup"?C.amber:C.green),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:13,color:C.text,fontWeight:700}}>{j.job}</div><div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div></div>
            <div style={{textAlign:"right"}}><span style={badge(j.status)}>{j.status==="setup"?"Setup":"Running"}</span><div style={{fontSize:13,color:j.status==="setup"?C.amber:C.green,marginTop:6,fontFamily:"'Share Tech Mono',monospace"}}>{fmt(j.status==="setup"?j.setupSec:j.runSec)}</div></div>
          </div>
        ))}</>}
      {Object.keys(machMap).length>0&&<><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Machine Run Time</div>
        {Object.entries(machMap).sort((a,b)=>b[1].run-a[1].run).map(([m,d])=>(
          <div key={m} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.text}}>{m}</span><span style={{color:C.muted}}>{(d.run/60).toFixed(0)}m · {d.jobs} jobs</span></div>
            <div style={{height:6,background:C.raised,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:C.green,width:`${(d.run/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{height:4,background:C.raised,borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",background:C.amber,width:`${(d.setup/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{fontSize:9,color:C.muted,marginTop:2,letterSpacing:1}}><span style={{color:C.green}}>■</span> Run &nbsp;<span style={{color:C.amber}}>■</span> Setup</div>
          </div>
        ))}</>}
      {Object.keys(opMap).length>0&&<><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Operator Summary</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Operator","Jobs","Pieces","Avg Run"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{Object.entries(opMap).map(([n,d])=><tr key={n}><td style={td}>{n}</td><td style={td}>{d.jobs}</td><td style={td}>{d.pieces}</td><td style={td}>{(d.run/d.jobs/60).toFixed(1)} min</td></tr>)}</tbody></table></div></>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ALL JOBS
// ═══════════════════════════════════════════════════════
function AllJobsTab({jobs,setCompleteId}){
  const [filt,setFilt]=useState("all");
  const filtered=jobs.filter(j=>filt==="all"||j.status===filt);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","All"],["setup","Setup"],["run","Running"],["done","Done"]].map(([f,l])=><button key={f} style={tag(filt===f)} onClick={()=>setFilt(f)}>{l}</button>)}
      </div>
      {!filtered.length?<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12}}>No jobs found.</div>:filtered.map(j=>(
        <div key={j.id} style={card(j.status==="setup"?C.amber:j.status==="run"?C.green:undefined)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.job}</div><div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span>{j.op&&<span><i className="ti ti-tools"/> {j.op}</span>}</div></div>
            <div style={{textAlign:"right"}}>
              <span style={badge(j.status)}>{j.status==="setup"?"Setup":j.status==="run"?"Running":"Done"}</span>
              {j.quickEntry&&<div style={{marginTop:4}}><span style={{...badge("admin"),fontSize:9}}>Quick Entry</span></div>}
              {j.status==="done"&&j.photoData&&<img src={j.photoData} style={{width:34,height:34,borderRadius:6,objectFit:"cover",marginTop:6,display:"block",marginLeft:"auto"}}/>}
          </div>
          <div style={{display:"flex",gap:14,marginTop:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmt(j.setupSec)}</span>
            <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmt(j.runSec)}</span>
            {j.status==="done"&&<span style={{fontSize:11,color:C.muted}}><i className="ti ti-box"/> {j.pieces} pcs · {fmtDate(j.completedAt)}</span>}
          </div>
          {j.status!=="done"&&<button style={{...btn("success",true),marginTop:10}} onClick={()=>setCompleteId(j.id)}><i className="ti ti-check"/> Complete</button>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// REPORTS — date range + filters + export
// ═══════════════════════════════════════════════════════
function ReportsTab({jobs}){
  const today=toDateInput(Date.now());
  const [from,setFrom]=useState(""); const [to,setTo]=useState("");
  const [opF,setOpF]=useState("all"); const [machF,setMachF]=useState("all");
  const allDone=jobs.filter(j=>j.status==="done");
  const ops=[...new Set(allDone.map(j=>j.operatorName))];
  const machs=[...new Set(allDone.map(j=>j.machine))];
  const filtered=allDone.filter(j=>{
    if(from&&j.completedAt<new Date(from).getTime()) return false;
    if(to  &&j.completedAt>new Date(to).getTime()+86399999) return false;
    if(opF !=="all"&&j.operatorName!==opF) return false;
    if(machF!=="all"&&j.machine!==machF) return false;
    return true;
  });
  const totalSetup=filtered.reduce((s,j)=>s+j.setupSec,0);
  const totalRun  =filtered.reduce((s,j)=>s+j.runSec,0);
  const totalPcs  =filtered.reduce((s,j)=>s+j.pieces,0);
  return(
    <div style={{padding:"14px 16px"}}>
      {/* Filter card */}
      <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
        <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}><i className="ti ti-filter"/> Filter &amp; Export</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={label}>From Date</label><input type="date" style={{...inp(),fontSize:12}} value={from} max={today} onChange={e=>setFrom(e.target.value)}/></div>
          <div><label style={label}>To Date</label><input type="date" style={{...inp(),fontSize:12}} value={to} max={today} onChange={e=>setTo(e.target.value)}/></div>
        </div>
        <div style={{marginBottom:10}}><label style={label}>Operator</label><select style={sel()} value={opF} onChange={e=>setOpF(e.target.value)}><option value="all">All Operators</option>{ops.map(o=><option key={o}>{o}</option>)}</select></div>
        <div style={{marginBottom:14}}><label style={label}>Machine</label><select style={sel()} value={machF} onChange={e=>setMachF(e.target.value)}><option value="all">All Machines</option>{machs.map(m=><option key={m}>{m}</option>)}</select></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button style={btn("primary",true)} onClick={()=>exportCSV(filtered,from,to)} disabled={!filtered.length}>
            <i className="ti ti-download"/> Export {filtered.length} Jobs to CSV
          </button>
          {(from||to||opF!=="all"||machF!=="all")&&<button style={btn("outline",false,true)} onClick={()=>{setFrom("");setTo("");setOpF("all");setMachF("all");}}>Clear</button>}
        </div>
      </div>
      {/* Summary */}
      {filtered.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {[[filtered.length,"Jobs",C.amber],[(totalPcs),"Pieces",C.text],[(totalRun/60).toFixed(0)+"m","Total Run",C.green]].map(([v,l,c])=>(
          <div key={l} style={{...statBox,padding:10}}><div style={{fontSize:20,color:c,fontFamily:"'Share Tech Mono',monospace"}}>{v}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{l}</div></div>
        ))}
      </div>}
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
        Log {filtered.length!==allDone.length?`(${filtered.length} of ${allDone.length})`:""}
      </div>
      {!filtered.length?<div style={{textAlign:"center",padding:"30px 16px",color:C.muted,fontSize:12}}><i className="ti ti-calendar-off" style={{fontSize:28,display:"block",marginBottom:10,opacity:0.3}}/>No jobs match filters.</div>
        :<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["Job","Machine","Operator","Type","Setup","Run","Pcs","✓","Date"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(j=><tr key={j.id}><td style={td}>{j.job}</td><td style={td}>{j.machine}</td><td style={td}>{j.operatorName}</td><td style={td}><span style={{...badge(j.quickEntry?"admin":"run"),fontSize:9}}>{j.quickEntry?"Quick":"Timed"}</span></td><td style={{...td,color:C.amber}}>{fmt(j.setupSec)}</td><td style={{...td,color:C.green}}>{fmt(j.runSec)}</td><td style={td}>{j.pieces}</td><td style={td}>{j.photoData?<span style={{color:C.green}}>✓</span>:<span style={{color:C.red}}>✗</span>}</td><td style={{...td,color:C.muted,fontSize:10}}>{fmtDate(j.completedAt)}</td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════
function ManageTab({users,setUsers,machines,setMachines}){
  const [view,setView]=useState("operators");
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button style={tag(view==="operators")} onClick={()=>setView("operators")}><i className="ti ti-users"/> Operators</button>
        <button style={tag(view==="machines")}  onClick={()=>setView("machines")} ><i className="ti ti-tool"/> Machines</button>
      </div>
      {view==="operators"&&<ManageOperators users={users} setUsers={setUsers}/>}
      {view==="machines" &&<ManageMachines  machines={machines} setMachines={setMachines}/>}
    </div>
  );
}

function ManageOperators({users,setUsers}){
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [pin,setPin]=useState(""); const [errs,setErrs]=useState({});
  const [editId,setEditId]=useState(null); const [editPin,setEditPin]=useState(""); const [editErr,setEditErr]=useState("");
  const operators=users.filter(u=>u.role==="operator");
  const save=()=>{
    const e={};
    if(!name.trim()) e.name="Name required";
    if(!/^\d{4}$/.test(pin)) e.pin="PIN must be exactly 4 digits";
    else if(users.find(u=>u.pin===pin)) e.pin="That PIN is already in use";
    if(Object.keys(e).length){setErrs(e);return;}
    setUsers(prev=>[...prev,{id:Date.now(),name:name.trim(),pin,role:"operator",active:true}]);
    setName("");setPin("");setErrs({});setAdding(false);
  };
  const toggle=id=>setUsers(prev=>prev.map(u=>u.id===id?{...u,active:!u.active}:u));
  const savePin=id=>{
    if(!/^\d{4}$/.test(editPin)){setEditErr("Must be 4 digits");return;}
    if(users.find(u=>u.pin===editPin&&u.id!==id)){setEditErr("PIN already in use");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,pin:editPin}:u));
    setEditId(null);setEditPin("");setEditErr("");
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{operators.length} operators</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Cancel":"Add Operator"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>New Operator</div>
          <div style={{marginBottom:10}}><label style={label}>Full Name *</label><input style={inp(errs.name)} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Jan Mortensen"/>{errs.name&&<div style={errMsg}>{errs.name}</div>}</div>
          <div style={{marginBottom:12}}><label style={label}>4-Digit PIN *</label><input type="password" inputMode="numeric" maxLength={4} style={{...inp(errs.pin),letterSpacing:8,fontSize:20,textAlign:"center"}} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="••••"/>{errs.pin&&<div style={errMsg}>{errs.pin}</div>}</div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-user-plus"/> Add Operator</button>
        </div>
      )}
      {operators.map(u=>(
        <div key={u.id} style={{...card(),opacity:u.active?1:0.5}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={avatar()}>{initials(u.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,color:C.text,fontWeight:700}}>{u.name}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>PIN: {"●".repeat(4)} &nbsp;·&nbsp; <span style={{color:u.active?C.green:C.red}}>{u.active?"Active":"Inactive"}</span></div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditId(editId===u.id?null:u.id);setEditPin("");setEditErr("");}}><i className="ti ti-key"/> PIN</button>
              <button style={btn(u.active?"danger":"success",false,true)} onClick={()=>toggle(u.id)}>{u.active?"Disable":"Enable"}</button>
            </div>
          </div>
          {editId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Change PIN for {u.name}</div>
              <div style={{display:"flex",gap:8}}>
                <input type="password" inputMode="numeric" maxLength={4} style={{...inp(!!editErr),flex:1,letterSpacing:8,fontSize:20,textAlign:"center"}} value={editPin} onChange={e=>setEditPin(e.target.value.replace(/\D/g,""))} placeholder="New PIN"/>
                <button style={btn("primary",false,false)} onClick={()=>savePin(u.id)}>Save</button>
              </div>
              {editErr&&<div style={errMsg}>{editErr}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ManageMachines({machines,setMachines}){
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [err,setErr]=useState("");
  const save=()=>{
    if(!name.trim()){setErr("Name required");return;}
    if(machines.find(m=>m.name.toLowerCase()===name.trim().toLowerCase())){setErr("Machine already exists");return;}
    setMachines(prev=>[...prev,{id:Date.now(),name:name.trim(),active:true}]);
    setName("");setErr("");setAdding(false);
  };
  const toggle=id=>setMachines(prev=>prev.map(m=>m.id===id?{...m,active:!m.active}:m));
  const del=id=>{ if(window.confirm("Remove this machine?")) setMachines(prev=>prev.filter(m=>m.id!==id)); };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{machines.filter(m=>m.active).length} active</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Cancel":"Add Machine"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>New Machine</div>
          <div style={{marginBottom:12}}><label style={label}>Machine Name *</label><input style={inp(!!err)} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. CNC Mill #3"/>{err&&<div style={errMsg}>{err}</div>}</div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-plus"/> Add Machine</button>
        </div>
      )}
      {machines.map(m=>(
        <div key={m.id} style={{...card(),display:"flex",alignItems:"center",gap:12,opacity:m.active?1:0.5}}>
          <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="ti ti-robot" style={{fontSize:18,color:m.active?C.amber:C.muted}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:C.text,fontWeight:700}}>{m.name}</div>
            <div style={{fontSize:10,letterSpacing:1,textTransform:"uppercase",marginTop:2,color:m.active?C.green:C.red}}>{m.active?"Active":"Inactive"}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button style={btn(m.active?"outline":"success",false,true)} onClick={()=>toggle(m.id)}>{m.active?"Disable":"Enable"}</button>
            <button style={btn("danger",false,true)} onClick={()=>del(m.id)}><i className="ti ti-trash"/></button>
          </div>
        </div>
      ))}
    </div>
  );
}
