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
function fmtHM(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
  return h>0?`${h}h ${m}m`:`${m}m`;
}
function fmtDetail(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${h}h ${m}m ${sc}s`:`${m}m ${sc}s`;
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
  background:s==="setup"?"rgba(240,165,0,.15)":s==="run"?"rgba(39,174,96,.15)":s==="admin"?"rgba(59,130,246,.15)":s==="down"?"rgba(231,76,60,.15)":s==="repair"?"rgba(240,165,0,.15)":"rgba(138,155,181,.1)",
  color:s==="setup"?C.amber:s==="run"?C.green:s==="admin"?C.blue:s==="down"?C.red:s==="repair"?C.amber:C.muted});
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
  const [workHours,setWorkHours]=useState({start:"07:00",end:"15:00"});
  const [completeId,setCompleteId]=useState(null);
  const [clock, setClock]    =useState("");
  const [machineIssues,setMachineIssues]=useState({});
  const [downtimeLog,setDowntimeLog]   =useState([]);

  useEffect(()=>{
    const t=setInterval(()=>{const n=new Date();setClock([n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":"));},1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const t=setInterval(()=>{
      const now=Date.now();
      setJobs(prev=>prev.map(j=>{
        if(j.status==="done") return j;
        if(j.nightMode&&j.nightModeEndsAt&&now>=j.nightModeEndsAt) return {...j,nightModeDone:true};
        if(j.paused||j.logoutPaused||j.nightModeDone) return j;
        if(j.status==="setup") return {...j,setupSec:j.setupSec+1};
        if(j.status==="run")   return {...j,runSec:j.runSec+1};
        return j;
      }));
    },1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const check=()=>{
      const now=new Date();
      const hhmm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      users.forEach(u=>{
        if(u.autoPauseTime&&u.autoPauseTime===hhmm){
          setJobs(prev=>prev.map(j=>j.operatorId===u.id&&j.status!=="done"&&!j.logoutPaused&&!j.nightMode?{...j,logoutPaused:true}:j));
        }
      });
    };
    const t=setInterval(check,60000);
    return()=>clearInterval(t);
  },[users]);

  const reportIssue=(machineName,status,reason)=>{
    setMachineIssues(prev=>({...prev,[machineName]:{status,reason,reportedBy:user.name,reportedAt:Date.now()}}));
    setJobs(prev=>prev.map(j=>j.machine===machineName&&j.status!=="done"?{...j,paused:true}:j));
  };
  const resolveIssue=(machineName)=>{
    const issue=machineIssues[machineName]; if(!issue) return;
    const resolvedAt=Date.now();
    setDowntimeLog(prev=>[...prev,{id:resolvedAt,machineName,...issue,resolvedBy:user.name,resolvedAt,downtimeSec:Math.round((resolvedAt-issue.reportedAt)/1000)}]);
    setMachineIssues(prev=>{const n={...prev};delete n[machineName];return n;});
    setJobs(prev=>prev.map(j=>j.machine===machineName&&j.paused?{...j,paused:false}:j));
  };

  const login =u=>{
    setJobs(prev=>prev.map(j=>j.operatorId===u.id&&j.logoutPaused?{...j,logoutPaused:false}:j));
    setUser(u);setTab(u.role==="admin"?"admin":"new");
  };
  const logout=()=>{
    const now=new Date();
    const hhmm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const inWorkHours=hhmm>=workHours.start&&hhmm<workHours.end;
    if(!inWorkHours) setJobs(prev=>prev.map(j=>j.operatorId===user.id&&j.status!=="done"&&!j.nightMode?{...j,logoutPaused:true}:j));
    setUser(null);setTab("new");
  };

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
          {[["new","plus","New Job"],["quick","bolt","Quick Entry"],["active","player-play","Active"],["machines","alert-triangle","Machines"],["history","list","History"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
              <i className={`ti ti-${ic}`}/> {lb}
              {t==="active"&&activeCnt>0&&<span style={{background:C.amber,color:"#1a1a1a",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{activeCnt}</span>}
              {t==="machines"&&Object.keys(machineIssues).length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{Object.keys(machineIssues).length}</span>}
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
      {tab==="new"      &&<NewJobTab         user={user} machines={machines} machineIssues={machineIssues} setJobs={setJobs}/>}
      {tab==="quick"    &&<QuickEntryTab     user={user} machines={machines} setJobs={setJobs} setTab={setTab}/>}
      {tab==="active"   &&<ActiveTab         user={user} jobs={jobs} setJobs={setJobs} setCompleteId={setCompleteId}/>}
      {tab==="machines" &&<MachineStatusTab  user={user} machines={machines} machineIssues={machineIssues} reportIssue={reportIssue} resolveIssue={resolveIssue}/>}
      {tab==="history"  &&<HistoryTab        user={user} jobs={jobs}/>}
      {tab==="admin"    &&<AdminDash         jobs={jobs} machineIssues={machineIssues} downtimeLog={downtimeLog}/>}
      {tab==="alljobs"  &&<AllJobsTab        jobs={jobs} setCompleteId={setCompleteId}/>}
      {tab==="reports"  &&<ReportsTab        jobs={jobs}/>}
      {tab==="manage"   &&<ManageTab         users={users} setUsers={setUsers} machines={machines} setMachines={setMachines} workHours={workHours} setWorkHours={setWorkHours}/>}

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
  const [setupH,  setSetupH]  =useState("");
  const [setupM,  setSetupM]  =useState("");
  const [runH,    setRunH]    =useState("");
  const [runM,    setRunM]    =useState("");
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
    if((parseInt(runH)||0)+(parseInt(runM)||0)===0) e.runTime="Enter the run time";
    if(!pieces||parseInt(pieces)<1)   e.pieces="Enter number of pieces produced";
    if(!photo)                 e.photo="Quality photo is required";
    if(Object.keys(e).length){setErrs(e);return;}

    const setupSec=(parseInt(setupH)||0)*3600+(parseInt(setupM)||0)*60;
    const runSec  =(parseInt(runH)||0)*3600+(parseInt(runM)||0)*60;
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
    setJob("");setMachine("");setOp("");setSetupH("");setSetupM("");setRunH("");setRunM("");
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
  const filled=[!!job.trim(),!!machine,(parseInt(runH)||0)+(parseInt(runM)||0)>0,!!pieces&&parseInt(pieces)>0,!!photo];
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
        <div style={{marginBottom:10}}>
          <label style={label}>Setup Time <span style={{fontSize:9,color:C.muted}}>(optional)</span></label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <input type="number" min="0" style={{...inp(),textAlign:"center",fontSize:18,color:C.amber}}
                value={setupH} onChange={e=>setSetupH(e.target.value)} placeholder="0"/>
              <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Hours</div>
            </div>
            <div>
              <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",fontSize:18,color:C.amber}}
                value={setupM} onChange={e=>setSetupM(e.target.value)} placeholder="0"/>
              <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Minutes</div>
            </div>
          </div>
        </div>
        <div>
          <label style={label}>Run Time <span style={{color:C.red}}>*</span></label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <input type="number" min="0" style={{...inp(errs.runTime),textAlign:"center",fontSize:18,color:C.green}}
                value={runH} onChange={e=>{setRunH(e.target.value);setErrs(p=>({...p,runTime:null}));}} placeholder="0"/>
              <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Hours</div>
            </div>
            <div>
              <input type="number" min="0" max="59" style={{...inp(errs.runTime),textAlign:"center",fontSize:18,color:C.green}}
                value={runM} onChange={e=>{setRunM(e.target.value);setErrs(p=>({...p,runTime:null}));}} placeholder="0"/>
              <div style={{fontSize:9,color:C.muted,marginTop:4,letterSpacing:1,textAlign:"center"}}>Minutes</div>
            </div>
          </div>
          {errs.runTime&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.runTime}</div>}
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
function JobCard({j,setJobs,startRun,setCompleteId}){
    const [nmForm,setNmForm]=useState(false);
    const [nmH,setNmH]=useState(""); const [nmM,setNmM]=useState("");
    const anyPaused=j.paused||j.logoutPaused;
    const nightColor="#7c5cbf";
    const color=j.paused?C.red:j.logoutPaused?C.muted:j.nightMode?nightColor:j.status==="setup"?C.amber:C.green;
    const remainingSec=j.nightMode&&!j.nightModeDone?Math.max(0,Math.round((j.nightModeEndsAt-Date.now())/1000)):0;

    const activateNightMode=()=>{
      const dur=(parseInt(nmH)||0)*3600+(parseInt(nmM)||0)*60;
      if(dur<=0) return;
      setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:true,nightModeEndsAt:Date.now()+dur*1000,nightModeDone:false}:x));
      setNmForm(false);setNmH("");setNmM("");
    };
    const cancelNightMode=()=>setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:false,nightModeEndsAt:null,nightModeDone:false}:x));

    return(
      <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${color}`,border:`1px solid ${C.border}`,borderTopColor:color,padding:"12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <i className={`ti ti-${j.nightMode?"moon":"robot"}`} style={{fontSize:14,color}}/>
          <div style={{fontSize:12,color,fontWeight:700,letterSpacing:1,textTransform:"uppercase",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.machine}</div>
          {j.paused?<span style={badge("down")}>Paused</span>
            :j.logoutPaused?<span style={badge("")}>Paused</span>
            :j.nightModeDone?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Done</span>
            :j.nightMode?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Night</span>
            :<span style={badge(j.status)}>{j.status==="setup"?"Setup":"Run"}</span>}
        </div>
        <div style={{fontSize:18,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.job}</div>
        {j.op&&<div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.op}</div>}
        {j.paused&&<div style={{background:"rgba(231,76,60,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:C.red}}><i className="ti ti-player-pause"/> Timer paused — machine down</div>}
        {j.logoutPaused&&<div style={{background:"rgba(138,155,181,0.1)",borderRadius:6,padding:"6px 8px",fontSize:10,color:C.muted}}><i className="ti ti-moon"/> Timer paused — operator away</div>}
        {j.nightMode&&!j.nightModeDone&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:nightColor}}>
          <i className="ti ti-moon-stars"/> Night mode — stops in {fmtHM(remainingSec)}
        </div>}
        {j.nightModeDone&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:nightColor}}>
          <i className="ti ti-check"/> Night run complete — ready to finish
        </div>}
        <div style={{textAlign:"center",padding:"8px 0",opacity:anyPaused?0.4:1}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color,marginBottom:4}}>{j.status==="setup"?"Setup":"Run"} Time</div>
          <div style={{fontSize:28,letterSpacing:2,color:anyPaused?C.muted:color,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{fmtHM(j.status==="setup"?j.setupSec:j.runSec)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
            <div style={{fontSize:13,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.setupSec)}</div>
            <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Setup{j.status==="run"?" ✓":""}</div>
          </div>
          <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center",opacity:j.status==="setup"?0.35:1}}>
            <div style={{fontSize:13,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.runSec)}</div>
            <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Run</div>
          </div>
        </div>
        {!anyPaused&&!j.nightMode&&(
          j.status==="setup"
            ?<button style={{...btn("primary",true,true),marginTop:2}} onClick={()=>startRun(j.id)}><i className="ti ti-player-play"/> Start Run</button>
            :<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
              <button style={btn("success",true,true)} onClick={()=>setCompleteId(j.id)}><i className="ti ti-check"/> Complete</button>
              <button style={{...btn("outline",true,true),color:nightColor,borderColor:nightColor}} onClick={()=>setNmForm(f=>!f)}><i className="ti ti-moon"/> Night Mode</button>
            </div>
        )}
        {(j.nightMode||j.nightModeDone)&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
            <button style={btn("success",true,true)} onClick={()=>setCompleteId(j.id)}><i className="ti ti-check"/> Complete</button>
            {!j.nightModeDone&&<button style={btn("outline",true,true)} onClick={cancelNightMode}><i className="ti ti-x"/> Cancel Night Mode</button>}
          </div>
        )}
        {nmForm&&(
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4}}>
            <div style={{fontSize:10,color:nightColor,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}><i className="ti ti-moon-stars"/> How long will the machine run?</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",fontSize:16,color:nightColor}} value={nmH} onChange={e=>setNmH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:4,letterSpacing:1}}>Hours</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",fontSize:16,color:nightColor}} value={nmM} onChange={e=>setNmM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:4,letterSpacing:1}}>Minutes</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...btn("outline",true,true),color:nightColor,borderColor:nightColor}} onClick={activateNightMode}><i className="ti ti-moon-stars"/> Start Night Mode</button>
              <button style={btn("outline",false,true)} onClick={()=>setNmForm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
}

function ActiveTab({user,jobs,setJobs,setCompleteId}){
  const [machineFilt,setMachineFilt]=useState("all");
  const active=jobs.filter(j=>j.status!=="done"&&j.operatorId===user.id);
  const machines=[...new Set(active.map(j=>j.machine))].sort();
  const visible=active.filter(j=>machineFilt==="all"||j.machine===machineFilt);
  const setupJobs=visible.filter(j=>j.status==="setup").sort((a,b)=>b.setupSec-a.setupSec);
  const runJobs  =visible.filter(j=>j.status==="run").sort((a,b)=>b.runSec-a.runSec);
  const startRun=id=>setJobs(prev=>prev.map(j=>j.id===id?{...j,status:"run"}:j));

  if(!active.length) return <div style={{padding:"14px 16px"}}><div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12,letterSpacing:1}}><i className="ti ti-tool" style={{fontSize:34,display:"block",marginBottom:10,opacity:0.3}}/> No active jobs.</div></div>;

  return(
    <div style={{padding:"10px 12px"}}>
      {machines.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>All Machines</button>
          {machines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
        </div>
      )}
      {setupJobs.length>0&&(
        <>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(240,165,0,0.2)`}}>
            <i className="ti ti-settings"/> Setting Up · {setupJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {setupJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId}/>)}
          </div>
        </>
      )}
      {runJobs.length>0&&(
        <>
          <div style={{fontSize:10,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(39,174,96,0.2)`}}>
            <i className="ti ti-player-play"/> Running · {runJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {runJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId}/>)}
          </div>
        </>
      )}
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
          <div style={statBox}><div style={{fontSize:20,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.setupSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Setup</div></div>
          <div style={statBox}><div style={{fontSize:20,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.runSec)}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>Run</div></div>
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
// MACHINE STATUS (operator)
// ═══════════════════════════════════════════════════════
function MachineStatusTab({user,machines,machineIssues,reportIssue,resolveIssue}){
  const [reporting,setReporting]=useState(null);
  const [issueType,setIssueType]=useState("repair");
  const [note,setNote]=useState("");

  const submit=(machineName)=>{
    reportIssue(machineName,issueType,note.trim());
    setReporting(null);setNote("");
  };

  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Machine Status</div>
      {machines.filter(m=>m.active).map(m=>{
        const issue=machineIssues[m.name];
        const isReporting=reporting===m.name;
        return(
          <div key={m.id} style={card(issue?(issue.status==="down"?C.red:C.amber):C.green)}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="ti ti-robot" style={{fontSize:18,color:issue?(issue.status==="down"?C.red:C.amber):C.green}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,color:C.text,fontWeight:700}}>{m.name}</div>
                <span style={badge(issue?issue.status:"run")}>{issue?(issue.status==="down"?"Down":"Needs Repair"):"Running"}</span>
              </div>
              {!issue&&!isReporting&&(
                <button style={btn("outline",false,true)} onClick={()=>{setReporting(m.name);setIssueType("repair");setNote("");}}>
                  <i className="ti ti-alert-triangle"/> Report
                </button>
              )}
              {issue&&(
                <button style={btn("success",false,true)} onClick={()=>resolveIssue(m.name)}>
                  <i className="ti ti-check"/> Running Again
                </button>
              )}
            </div>
            {issue&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>
                {issue.reason&&<div style={{color:C.text,marginBottom:4}}>{issue.reason}</div>}
                <div>Reported by <span style={{color:C.text}}>{issue.reportedBy}</span> · {fmtDate(issue.reportedAt)}</div>
              </div>
            )}
            {isReporting&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>What is wrong?</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <button style={btn(issueType==="repair"?"primary":"outline",true)} onClick={()=>setIssueType("repair")}>Needs Repair</button>
                  <button style={btn(issueType==="down"?"danger":"outline",true)} onClick={()=>setIssueType("down")}>Machine Down</button>
                </div>
                <input style={{...inp(),marginBottom:10}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe the issue (optional)"/>
                <div style={{display:"flex",gap:8}}>
                  <button style={btn(issueType==="down"?"danger":"primary",true)} onClick={()=>submit(m.name)}>
                    <i className="ti ti-send"/> Submit Report
                  </button>
                  <button style={btn("outline",false,true)} onClick={()=>setReporting(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
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
              <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
              <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
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
function AdminDash({jobs,machineIssues,downtimeLog}){
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
        {active.map(j=>{
          const pauseColor=j.paused?C.red:j.logoutPaused?C.muted:null;
          return(
          <div key={j.id} style={{...card(pauseColor||(j.status==="setup"?C.amber:C.green)),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,color:C.text,fontWeight:700}}>{j.job}</div>
              <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
            </div>
            <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <span style={badge(j.status)}>{j.status==="setup"?"Setup":"Running"}</span>
              {j.paused&&<span style={badge("down")}>Machine Down</span>}
              {j.logoutPaused&&<span style={badge("")}>Paused</span>}
              <div style={{fontSize:13,color:pauseColor||(j.status==="setup"?C.amber:C.green),fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.status==="setup"?j.setupSec:j.runSec)}</div>
            </div>
          </div>
        );})}
      </>}
      {Object.keys(machMap).length>0&&<><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Machine Run Time</div>
        {Object.entries(machMap).sort((a,b)=>b[1].run-a[1].run).map(([m,d])=>(
          <div key={m} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}><span style={{color:C.text}}>{m}</span><span style={{color:C.muted}}>{fmtHM(d.run)} run · {d.jobs} jobs</span></div>
            <div style={{height:6,background:C.raised,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:C.green,width:`${(d.run/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{height:4,background:C.raised,borderRadius:3,overflow:"hidden",marginTop:2}}><div style={{height:"100%",background:C.amber,width:`${(d.setup/maxRun)*100}%`,borderRadius:3}}/></div>
            <div style={{fontSize:9,color:C.muted,marginTop:2,letterSpacing:1}}><span style={{color:C.green}}>■</span> Run &nbsp;<span style={{color:C.amber}}>■</span> Setup</div>
          </div>
        ))}</>}
      {Object.keys(opMap).length>0&&<><div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Operator Summary</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Operator","Jobs","Pieces","Avg Run"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{Object.entries(opMap).map(([n,d])=><tr key={n}><td style={td}>{n}</td><td style={td}>{d.jobs}</td><td style={td}>{d.pieces}</td><td style={td}>{fmtHM(Math.round(d.run/d.jobs))}</td></tr>)}</tbody></table></div></>}

      {Object.keys(machineIssues).length>0&&<>
        <div style={{fontSize:10,color:C.red,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}><i className="ti ti-alert-triangle"/> Current Machine Issues</div>
        {Object.entries(machineIssues).map(([name,issue])=>(
          <div key={name} style={card(issue.status==="down"?C.red:C.amber)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:13,color:C.text,fontWeight:700}}>{name}</div>
                <span style={badge(issue.status)}>{issue.status==="down"?"Down":"Needs Repair"}</span>
              </div>
              <div style={{textAlign:"right",fontSize:11,color:C.muted}}>
                <div>By {issue.reportedBy}</div>
                <div>{fmtDate(issue.reportedAt)}</div>
              </div>
            </div>
            {issue.reason&&<div style={{marginTop:8,fontSize:11,color:C.text}}>{issue.reason}</div>}
          </div>
        ))}
      </>}

      {downtimeLog.length>0&&<>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Downtime Log</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["Machine","Type","Duration","Reported By","Resolved By","Date"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{[...downtimeLog].reverse().map(d=>(
            <tr key={d.id}>
              <td style={td}>{d.machineName}</td>
              <td style={td}><span style={badge(d.status)}>{d.status==="down"?"Down":"Repair"}</span></td>
              <td style={{...td,color:C.amber}}>{fmtHM(d.downtimeSec)}</td>
              <td style={td}>{d.reportedBy}</td>
              <td style={td}>{d.resolvedBy}</td>
              <td style={{...td,color:C.muted,fontSize:10}}>{fmtDate(d.resolvedAt)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ALL JOBS
// ═══════════════════════════════════════════════════════
function AllJobsTab({jobs,setCompleteId}){
  const [statusFilt,setStatusFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const machines=[...new Set(jobs.map(j=>j.machine))].sort();
  const filtered=jobs.filter(j=>
    (statusFilt==="all"||j.status===statusFilt)&&
    (machineFilt==="all"||j.machine===machineFilt)
  );
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        {[["all","All"],["setup","Setup"],["run","Running"],["done","Done"]].map(([f,l])=><button key={f} style={tag(statusFilt===f)} onClick={()=>setStatusFilt(f)}>{l}</button>)}
      </div>
      {machines.length>0&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>All Machines</button>
        {machines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
      </div>}
      {!filtered.length?<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12}}>No jobs found.</div>:filtered.map(j=>{
        const accentColor=j.paused?C.red:j.logoutPaused?C.muted:j.status==="setup"?C.amber:j.status==="run"?C.green:undefined;
        return(
        <div key={j.id} style={card(accentColor)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.job}</div><div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span>{j.op&&<span><i className="ti ti-tools"/> {j.op}</span>}</div></div>
            <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <span style={badge(j.status)}>{j.status==="setup"?"Setup":j.status==="run"?"Running":"Done"}</span>
              {j.paused&&<span style={badge("down")}>Machine Down</span>}
              {j.logoutPaused&&<span style={badge("")}>Paused</span>}
              {j.quickEntry&&<span style={{...badge("admin"),fontSize:9}}>Quick Entry</span>}
              {j.status==="done"&&j.photoData&&<img src={j.photoData} style={{width:34,height:34,borderRadius:6,objectFit:"cover",marginTop:6,display:"block",marginLeft:"auto"}}/>}
            </div>
          </div>
          <div style={{display:"flex",gap:14,marginTop:10,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> Setup: {fmtHM(j.setupSec)}</span>
            <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> Run: {fmtHM(j.runSec)}</span>
            {j.status==="done"&&j.pieces>0&&<span style={{fontSize:11,color:C.blue}}><i className="ti ti-clock"/> Per piece: {fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}</span>}
            {j.status==="done"&&<span style={{fontSize:11,color:C.muted}}><i className="ti ti-box"/> {j.pieces} pcs · {fmtDate(j.completedAt)}</span>}
          </div>
          {j.status!=="done"&&<button style={{...btn("success",true),marginTop:10}} onClick={()=>setCompleteId(j.id)}><i className="ti ti-check"/> Complete</button>}
        </div>
      );})}

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
          <thead><tr>{["Job","Machine","Operator","Type","Setup","Run","Per Piece","Pcs","✓","Date"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(j=><tr key={j.id}><td style={td}>{j.job}</td><td style={td}>{j.machine}</td><td style={td}>{j.operatorName}</td><td style={td}><span style={{...badge(j.quickEntry?"admin":"run"),fontSize:9}}>{j.quickEntry?"Quick":"Timed"}</span></td><td style={{...td,color:C.amber}}>{fmtHM(j.setupSec)}</td><td style={{...td,color:C.green}}>{fmtHM(j.runSec)}</td><td style={{...td,color:C.blue}}>{j.pieces>0?fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces)):"-"}</td><td style={td}>{j.pieces}</td><td style={td}>{j.photoData?<span style={{color:C.green}}>✓</span>:<span style={{color:C.red}}>✗</span>}</td><td style={{...td,color:C.muted,fontSize:10}}>{fmtDate(j.completedAt)}</td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════
function ManageTab({users,setUsers,machines,setMachines,workHours,setWorkHours}){
  const [view,setView]=useState("operators");
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button style={tag(view==="operators")} onClick={()=>setView("operators")}><i className="ti ti-users"/> Operators</button>
        <button style={tag(view==="machines")}  onClick={()=>setView("machines")} ><i className="ti ti-tool"/> Machines</button>
        <button style={tag(view==="settings")}  onClick={()=>setView("settings")} ><i className="ti ti-adjustments"/> Settings</button>
      </div>
      {view==="operators"&&<ManageOperators users={users} setUsers={setUsers}/>}
      {view==="machines" &&<ManageMachines  machines={machines} setMachines={setMachines}/>}
      {view==="settings" &&<WorkHoursSettings workHours={workHours} setWorkHours={setWorkHours}/>}
    </div>
  );
}

function WorkHoursSettings({workHours,setWorkHours}){
  const [start,setStart]=useState(workHours.start);
  const [end,setEnd]    =useState(workHours.end);
  const [saved,setSaved]=useState(false);
  const save=()=>{
    setWorkHours({start,end});
    setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };
  return(
    <div>
      <div style={{...card(),border:`1px solid ${C.amber}`}}>
        <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}><i className="ti ti-clock"/> Work Hours</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:16}}>
          Logging out within these hours will <span style={{color:C.text}}>not</span> pause timers — accidental logouts are ignored. Outside these hours, timers pause automatically.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div>
            <label style={label}>Start of Day</label>
            <input type="time" style={{...inp(),fontSize:18,textAlign:"center",color:C.green}} value={start} onChange={e=>setStart(e.target.value)}/>
          </div>
          <div>
            <label style={label}>End of Day</label>
            <input type="time" style={{...inp(),fontSize:18,textAlign:"center",color:C.amber}} value={end} onChange={e=>setEnd(e.target.value)}/>
          </div>
        </div>
        <button style={btn(saved?"success":"primary",true)} onClick={save}>
          {saved?<><i className="ti ti-check"/> Saved!</>:<><i className="ti ti-device-floppy"/> Save Work Hours</>}
        </button>
      </div>
      <div style={{...card(),marginTop:0}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Current Setting</div>
        <div style={{fontSize:13,color:C.text}}>
          Timers keep running on logout between <span style={{color:C.green}}>{workHours.start}</span> and <span style={{color:C.amber}}>{workHours.end}</span>
        </div>
      </div>
    </div>
  );
}

function ManageOperators({users,setUsers}){
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [pin,setPin]=useState(""); const [errs,setErrs]=useState({});
  const [editId,setEditId]=useState(null); const [editPin,setEditPin]=useState(""); const [editErr,setEditErr]=useState("");
  const [editPauseId,setEditPauseId]=useState(null); const [editPauseTime,setEditPauseTime]=useState("");
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
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditId(editId===u.id?null:u.id);setEditPauseId(null);setEditPin("");setEditErr("");}}><i className="ti ti-key"/> PIN</button>
              <button style={btn("outline",false,true)} onClick={()=>{setEditPauseId(editPauseId===u.id?null:u.id);setEditId(null);setEditPauseTime(u.autoPauseTime||"");}}><i className="ti ti-clock"/> Auto-Pause</button>
              <button style={btn(u.active?"danger":"success",false,true)} onClick={()=>toggle(u.id)}>{u.active?"Disable":"Enable"}</button>
            </div>
          </div>
          {u.autoPauseTime&&editPauseId!==u.id&&(
            <div style={{marginTop:8,fontSize:11,color:C.muted}}>
              <i className="ti ti-clock"/> Auto-pauses at <span style={{color:C.amber}}>{u.autoPauseTime}</span>
            </div>
          )}
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
          {editPauseId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Auto-pause time for {u.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Jobs will automatically pause at this time every day, even if they forget to log out.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="time" style={{...inp(),flex:1,fontSize:18,textAlign:"center",color:C.amber}} value={editPauseTime} onChange={e=>setEditPauseTime(e.target.value)}/>
                <button style={btn("primary",false,false)} onClick={()=>{setUsers(prev=>prev.map(u2=>u2.id===u.id?{...u2,autoPauseTime:editPauseTime}:u2));setEditPauseId(null);}}>Save</button>
                {u.autoPauseTime&&<button style={btn("danger",false,true)} onClick={()=>{setUsers(prev=>prev.map(u2=>u2.id===u.id?{...u2,autoPauseTime:""}:u2));setEditPauseId(null);}}>Remove</button>}
              </div>
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
