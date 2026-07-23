import { useState, useEffect, useRef } from "react";

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const INIT_USERS = [
  { id: 1, name: "Admin", pin: "0000", role: "admin", active: true },
];
const INIT_MACHINES = [];

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
function liveTime(j){
  const now=Date.now();
  const ts=j.phaseStartedAt;
  const active=ts&&!j.paused&&!j.logoutPaused;
  // For night mode, cap elapsed at when night run ended
  const elapsed=active?Math.floor(((j.nightModeEndsAt&&now>j.nightModeEndsAt?j.nightModeEndsAt:now)-ts)/1000):0;
  return{
    setup: (j.setupSec ||0)+(j.status==="setup"       ?elapsed:0),
    run:   (j.runSec   ||0)+(j.status==="run"          ?elapsed:0),
    setup2:(j.setupSec2||0)+(j.status==="side2_setup"  ?elapsed:0),
    run2:  (j.runSec2  ||0)+(j.status==="side2_run"    ?elapsed:0),
    debur: (j.deburSec ||0)+(j.status==="deburring"    ?elapsed:0),
  };
}

// ─── WORK HOURS HELPERS ───────────────────────────────────────────────────────
const DAYS_KEY=["sun","mon","tue","wed","thu","fri","sat"];
const DAY_NAME={sun:"Sunday",mon:"Monday",tue:"Tuesday",wed:"Wednesday",thu:"Thursday",fri:"Friday",sat:"Saturday"};
const INIT_WORK_HOURS={
  mon:{start:"07:00",end:"15:00",enabled:true},
  tue:{start:"07:00",end:"15:00",enabled:true},
  wed:{start:"07:00",end:"15:00",enabled:true},
  thu:{start:"07:00",end:"15:00",enabled:true},
  fri:{start:"07:00",end:"15:00",enabled:true},
  sat:{start:"07:00",end:"15:00",enabled:false},
  sun:{start:"07:00",end:"15:00",enabled:false},
};
// Returns today's {start, end, enabled} — handles both old {start,end} and new per-day format
function todayWorkHours(wh){
  if(!wh) return null;
  if(wh.start&&!wh.mon) return{start:wh.start,end:wh.end,enabled:true}; // legacy format
  return wh[DAYS_KEY[new Date().getDay()]]||null;
}
function isInWorkHoursNow(wh){
  const dh=todayWorkHours(wh);
  if(!dh||!dh.enabled) return false;
  const n=new Date();
  const hhmm=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
  return hhmm>=dh.start&&hhmm<dh.end;
}

// ─── COLOURS ──────────────────────────────────────────────────────────────────
const C={
  bg:"#151e2b",surface:"#1d2b3d",raised:"#243044",
  border:"rgba(255,255,255,0.07)",
  amber:"#f0a500",green:"#27ae60",red:"#e74c3c",blue:"#3b82f6",deburr:"#e67e22",
  text:"#e0e6f0",muted:"#8a9bb5",
};

// ISO material group definitions
const ISO_MAT=[
  {code:"P",name:"Steel",         color:"#3b82f6",bg:"rgba(59,130,246,.18)"},
  {code:"M",name:"Stainless",     color:"#f0a500",bg:"rgba(240,165,0,.18)"},
  {code:"K",name:"Cast Iron",     color:"#e74c3c",bg:"rgba(231,76,60,.18)"},
  {code:"N",name:"Non-Ferrous",   color:"#27ae60",bg:"rgba(39,174,96,.18)"},
  {code:"S",name:"Super Alloys",  color:"#e67e22",bg:"rgba(230,126,34,.18)"},
  {code:"H",name:"Hardened",      color:"#8b5cf6",bg:"rgba(139,92,246,.18)"},
];

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

// ─── SERVER SYNC ──────────────────────────────────────────────────────────────
async function uploadPhoto(photoData, filename) {
  try {
    const res = await fetch("/api/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, data: photoData }),
    });
    const { url } = await res.json();
    return url; // e.g. /photos/quality_xxx.jpg
  } catch {
    return photoData; // fallback: keep base64 if server unreachable
  }
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportCSV(rows,from,to){
  if(!rows.length){alert("No jobs match the selected filters.");return;}
  const cols=[["Customer","Part Number","Machine","Operator","Operation","Type","Two-Sided","Completed","S1 Setup (min)","S1 Run (min)","S2 Setup (min)","S2 Run (min)","Total (min)","S1 Pieces","S2 Pieces","Photo S1","Photo S2"]];
  rows.forEach(j=>{
    const s1Setup=(j.setupSec/60).toFixed(1);
    const s1Run=(j.runSec/60).toFixed(1);
    const s2Setup=j.twoSided?((j.setupSec2||0)/60).toFixed(1):"N/A";
    const s2Run=j.twoSided?((j.runSec2||0)/60).toFixed(1):"N/A";
    const total=((j.setupSec+j.runSec+(j.setupSec2||0)+(j.runSec2||0))/60).toFixed(1);
    const s1Pcs=j.pieces||0;
    const s2Pcs=j.twoSided?(j.pieces2||0):"N/A";
    cols.push([j.customer||"",j.job,j.machine,j.operatorName,j.op||"",j.quickEntry?"Quick Entry":"Timed",j.twoSided?"Yes":"No",fmtDate(j.completedAt),s1Setup,s1Run,s2Setup,s2Run,total,s1Pcs,s2Pcs,j.photoData?"Yes":"No",j.twoSided?(j.photoData2?"Yes":"Missing"):"N/A"]);
  });
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
  const [loaded,setLoaded]   =useState(false);
  const [user,  setUser]     =useState(null);
  const loginTimeRef         =useRef(0); // when current user logged in on this device
  const [tab,   setTab]      =useState("new");
  const [jobs,  setJobs]     =useState([]);
  const [users, setUsers]    =useState(INIT_USERS);
  const [machines,setMachines]=useState(INIT_MACHINES);
  const [workHours,setWorkHours]=useState(INIT_WORK_HOURS);
  const workHoursRef=useRef(INIT_WORK_HOURS);
  useEffect(()=>{workHoursRef.current=workHours;},[workHours]);
  const userRef=useRef(null); // always mirrors current user so tick can read it
  useEffect(()=>{userRef.current=user;},[user]);
  const lastAutoPauseMinuteRef=useRef(""); // tracks last hhmm we fired auto-pause
  const [completeId,setCompleteId]=useState(null);
  const [clock, setClock]    =useState("");
  const [machineIssues,setMachineIssues]=useState({});
  const [downtimeLog,setDowntimeLog]   =useState([]);
  const [tools,      setTools]         =useState([]);
  const [toolLog,    setToolLog]       =useState([]);

  // ── Load state from server on startup ─────────────────────
  useEffect(()=>{
    fetch("/api/data")
      .then(r=>r.json())
      .then(data=>{
        if(data){
          if(data.jobs)         setJobs(data.jobs);
          if(data.users)        setUsers(data.users);
          if(data.machines)     setMachines(data.machines);
          if(data.workHours){
            // Migrate legacy {start,end} format to per-day
            let wh=data.workHours;
            if(wh.start&&!wh.mon){
              wh={
                mon:{start:wh.start,end:wh.end,enabled:true},
                tue:{start:wh.start,end:wh.end,enabled:true},
                wed:{start:wh.start,end:wh.end,enabled:true},
                thu:{start:wh.start,end:wh.end,enabled:true},
                fri:{start:wh.start,end:wh.end,enabled:true},
                sat:{start:wh.start,end:wh.end,enabled:false},
                sun:{start:wh.start,end:wh.end,enabled:false},
              };
            }
            setWorkHours(wh);workHoursRef.current=wh;
          }
          if(data.downtimeLog)  setDowntimeLog(data.downtimeLog);
          if(data.machineIssues)setMachineIssues(data.machineIssues);
          if(data.tools)        setTools(data.tools);
          if(data.toolLog)      setToolLog(data.toolLog);
          // Seed lastServerRef so the first poll doesn't overwrite local edits
          lastServerRef.current={
            workHours:data.workHours,
            users:data.users,
            machines:data.machines,
            downtimeLog:data.downtimeLog,
            tools:data.tools,
            toolLog:data.toolLog,
          };
        }
      })
      .catch(()=>{}) // no server — run standalone
      .finally(()=>{setLoaded(true);dataLoadedRef.current=true;});
  },[]);

  // ── Sync: save every 3 s, fetch every 5 s ─────────────────
  const stateRef=useRef({});
  const lastServerRef=useRef({});
  const dataLoadedRef=useRef(false); // prevents saving before server data is loaded
  useEffect(()=>{
    stateRef.current={jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog};
  },[jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog]);

  // Save to server every 3 seconds — only after data has been loaded
  useEffect(()=>{
    const t=setInterval(()=>{
      if(!dataLoadedRef.current) return;
      fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(stateRef.current)}).catch(()=>{});
    },3000);
    return()=>clearInterval(t);
  },[]);

  // Poll server every 5 seconds — merge carefully so local timers aren't overwritten
  // For settings (workHours/users/machines): only update if SERVER changed them,
  // so a local edit isn't overwritten before the 3 s save fires.
  useEffect(()=>{
    const t=setInterval(()=>{
      fetch("/api/data").then(r=>r.json()).then(data=>{
        if(!data) return;
        const last=lastServerRef.current;
        // Jobs: always trust server for status/pause/completion — it's the source of truth.
        // Only keep local timer values (setupSec/runSec) when the SERVER confirms the job is running,
        // so the 1-second tick isn't overwritten mid-count.
        if(data.jobs) setJobs(local=>{
          const serverIds=new Set(data.jobs.map(j=>j.id));
          const localOnly=local.filter(j=>!serverIds.has(j.id));
          const merged=data.jobs.map(sj=>{
            const lj=local.find(j=>j.id===sj.id);
            if(!lj) return sj;
            return sj;
          });
          return [...localOnly,...merged];
        });
        // Machine issues: keep local downtimeSec (more up-to-date)
        if(data.machineIssues) setMachineIssues(local=>{
          const merged={...data.machineIssues};
          Object.keys(local).forEach(k=>{if(merged[k])merged[k]={...merged[k],downtimeSec:local[k].downtimeSec,counting:local[k].counting};});
          return merged;
        });
        // Settings: only apply if the server value actually changed (another device saved it)
        const s=JSON.stringify;
        if(data.workHours  &&s(data.workHours) !==s(last.workHours)) {setWorkHours(data.workHours);workHoursRef.current=data.workHours;}
        if(data.users&&s(data.users)!==s(last.users)){
          setUsers(data.users);
          // Force logout if auto-pause fired on another device after we logged in
          if(user){
            const su=data.users.find(x=>x.id===user.id);
            if(su&&su.forcedLogoutAt&&su.forcedLogoutAt>loginTimeRef.current){
              setUser(null);setTab("new");
            }
          }
        }
        if(data.machines   &&s(data.machines)  !==s(last.machines))   setMachines(data.machines);
        if(data.downtimeLog&&s(data.downtimeLog)!==s(last.downtimeLog))setDowntimeLog(data.downtimeLog);
        if(data.tools      &&s(data.tools)      !==s(last.tools))      setTools(data.tools);
        if(data.toolLog    &&s(data.toolLog)    !==s(last.toolLog))    setToolLog(data.toolLog);
        // Remember what the server last sent
        lastServerRef.current={workHours:data.workHours,users:data.users,machines:data.machines,downtimeLog:data.downtimeLog,tools:data.tools,toolLog:data.toolLog};
      }).catch(()=>{});
    },5000);
    return()=>clearInterval(t);
  },[]);

  const saveNow=()=>fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(stateRef.current)}).catch(()=>{});

  // ── Refresh immediately when tab becomes visible again ────
  useEffect(()=>{
    const onVisible=()=>{
      if(document.visibilityState!=="visible") return;
      fetch("/api/data").then(r=>r.json()).then(data=>{
        if(!data) return;
        if(data.jobs) setJobs(local=>{
          const serverIds=new Set(data.jobs.map(j=>j.id));
          const localOnly=local.filter(j=>!serverIds.has(j.id));
          return [...localOnly,...data.jobs];
        });
        if(data.machineIssues) setMachineIssues(local=>{
          const merged={...data.machineIssues};
          Object.keys(local).forEach(k=>{if(merged[k])merged[k]={...merged[k],downtimeSec:local[k].downtimeSec,counting:local[k].counting};});
          return merged;
        });
        const s=JSON.stringify;
        const last=lastServerRef.current;
        if(data.workHours  &&s(data.workHours) !==s(last.workHours)) {setWorkHours(data.workHours);workHoursRef.current=data.workHours;}
        if(data.users      &&s(data.users)      !==s(last.users))     setUsers(data.users);
        if(data.machines   &&s(data.machines)   !==s(last.machines))  setMachines(data.machines);
        if(data.downtimeLog&&s(data.downtimeLog)!==s(last.downtimeLog))setDowntimeLog(data.downtimeLog);
        lastServerRef.current={workHours:data.workHours,users:data.users,machines:data.machines,downtimeLog:data.downtimeLog};
      }).catch(()=>{});
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  useEffect(()=>{
    const t=setInterval(()=>{const n=new Date();setClock([n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,"0")).join(":"));},1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const t=setInterval(()=>{
      const now=Date.now();
      setJobs(prev=>{
        let changed=false;
        const nd=new Date();
        const hhmmNow=`${String(nd.getHours()).padStart(2,"0")}:${String(nd.getMinutes()).padStart(2,"0")}`;
        const wh=workHoursRef.current;
        const dhNow=todayWorkHours(wh);
        const outsideWork=!dhNow||!dhNow.enabled||hhmmNow<dhNow.start||hhmmNow>=dhNow.end;
        const next=prev.map(j=>{
          // Night mode countdown finished — pause the job
          if(j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone&&now>=j.nightModeEndsAt){
            changed=true;
            const lt=liveTime(j);
            return{...j,nightModeDone:true,logoutPaused:true,runSec:lt.run,phaseStartedAt:null};
          }
          // Night mode armed and operator has left (nightModeWaiting) — activate once outside work hours
          if(j.nightMode&&j.nightModeDuration&&!j.nightModeEndsAt&&!j.nightModeDone&&j.nightModeWaiting&&j.status!=="done"&&outsideWork){
            changed=true;
            return{...j,nightModeEndsAt:now+j.nightModeDuration*1000,nightModeWaiting:false,lastModifiedAt:now};
          }
          return j;
        });
        return changed?next:prev;
      });
      setMachineIssues(prev=>{
        const wh=workHoursRef.current;
        const inWork=isInWorkHoursNow(wh);
        const updated={...prev};
        let changed=false;
        Object.keys(updated).forEach(k=>{
          const issue=updated[k];
          const shouldCount=inWork;
          if(issue.counting!==shouldCount){updated[k]={...issue,counting:shouldCount};changed=true;}
          else if(issue.counting){updated[k]={...issue,downtimeSec:(issue.downtimeSec||0)+1};changed=true;}
        });
        return changed?updated:prev;
      });
      // ── Auto-pause check — runs every second, fires once per minute ──
      const n2=new Date();
      const hhmm2=`${String(n2.getHours()).padStart(2,"0")}:${String(n2.getMinutes()).padStart(2,"0")}`;
      if(hhmm2!==lastAutoPauseMinuteRef.current){
        lastAutoPauseMinuteRef.current=hhmm2;
        const currentUsers=stateRef.current.users||[];
        currentUsers.forEach(u=>{
          if(!u.autoPauseTime||u.autoPauseTime!==hhmm2) return;
          // Pause all active jobs — same logic as manual logout
          const nowMs=Date.now();
          const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
            if(j.operatorId!==u.id||j.status==="done"||j.logoutPaused) return j;
            // Activate night mode countdown if armed
            if(j.nightMode&&j.nightModeDuration&&!j.nightModeEndsAt)
              return{...j,nightModeEndsAt:nowMs+j.nightModeDuration*1000,lastModifiedAt:nowMs};
            // Otherwise freeze the timer
            const lt=liveTime(j);
            return{...j,logoutPaused:true,setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,phaseStartedAt:null,lastModifiedAt:nowMs};
          });
          const forcedAt=Date.now();
          const updatedUsers=(stateRef.current.users||[]).map(x=>x.id===u.id?{...x,forcedLogoutAt:forcedAt}:x);
          stateRef.current={...stateRef.current,jobs:updatedJobs,users:updatedUsers};
          setJobs(updatedJobs);
          setUsers(updatedUsers);
          // Force logout on THIS device if this operator is currently logged in
          if(userRef.current&&userRef.current.id===u.id){
            setUser(null);setTab("new");
          }
          saveNow();
        });
      }
    },1000);
    return()=>clearInterval(t);
  },[]);

  const reportIssue=(machineName,status,reason)=>{
    const now=new Date();
    const hhmm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const dhR=todayWorkHours(workHours);
    const counting=!!(dhR&&dhR.enabled&&hhmm>=dhR.start&&hhmm<dhR.end);
    setMachineIssues(prev=>({...prev,[machineName]:{status,reason,reportedBy:user.name,reportedAt:Date.now(),downtimeSec:0,counting}}));
    setJobs(prev=>prev.map(j=>{
      if(j.machine!==machineName||j.status==="done") return j;
      const lt=liveTime(j);
      return{...j,paused:true,setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,phaseStartedAt:null,lastModifiedAt:Date.now()};
    }));
  };
  const resolveIssue=(machineName)=>{
    const issue=machineIssues[machineName]; if(!issue) return;
    const resolvedAt=Date.now();
    // Calculate downtime from actual timestamps — reliable regardless of counting state
    const downtimeSec=Math.round((resolvedAt-(issue.reportedAt||resolvedAt))/1000);
    setDowntimeLog(prev=>[...prev,{id:resolvedAt,machineName,...issue,resolvedBy:user.name,resolvedAt,downtimeSec}]);
    setMachineIssues(prev=>{const n={...prev};delete n[machineName];return n;});
    setJobs(prev=>prev.map(j=>j.machine===machineName&&j.paused?{...j,paused:false,phaseStartedAt:Date.now(),lastModifiedAt:Date.now()}:j));
  };

  const login =u=>{
    // Compute synchronously from stateRef so saveNow() gets correct state immediately
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.operatorId!==u.id||!j.logoutPaused) return j;
      if(j.nightModeDone) return{...j,logoutPaused:false,nightMode:false,nightModeDone:false,nightModeDuration:0,nightModeEndsAt:null,lastModifiedAt:n};
      return{...j,logoutPaused:false,nightModeWaiting:false,phaseStartedAt:n,lastModifiedAt:n};
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    loginTimeRef.current=n;
    setUser(u);setTab(u.role==="admin"?"admin":"new");
    saveNow();
  };
  const logout=()=>{
    const inWorkHours=isInWorkHoursNow(workHours);
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.operatorId!==user.id||j.status==="done") return j;
      if(!inWorkHours){
        // Outside work hours: activate night mode if armed, otherwise pause
        if(j.nightMode&&j.nightModeDuration&&!j.nightModeEndsAt)
          return{...j,nightModeEndsAt:n+j.nightModeDuration*1000,lastModifiedAt:n};
        const lt=liveTime(j);
        return{...j,logoutPaused:true,setupSec:lt.setup,runSec:lt.run,setupSec2:lt.setup2,runSec2:lt.run2,phaseStartedAt:null,lastModifiedAt:n};
      }
      // Inside work hours: timer keeps running
      if(j.nightMode&&j.nightModeDuration&&!j.nightModeEndsAt){
        // Mark night mode as waiting — will activate once work hours end
        return{...j,nightModeWaiting:true,lastModifiedAt:n};
      }
      return j; // timer keeps counting, job untouched
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    setUser(null);setTab("new");
    saveNow();
  };

  if(!loaded) return(
    <div style={{fontFamily:"'Share Tech Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      <div style={{fontSize:22,color:C.amber,letterSpacing:4,textTransform:"uppercase",fontWeight:700}}>⚙ ShopTrack</div>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2}}>Connecting to server…</div>
      <div style={{width:40,height:40,border:`3px solid ${C.raised}`,borderTop:`3px solid ${C.amber}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if(!user) return <LoginScreen users={users} onLogin={login}/>;

  // Exclude soft-deleted jobs from all display — they stay in state/stateRef for server sync
  const visibleJobs=jobs.filter(j=>!j.deleted);
  const activeCnt=visibleJobs.filter(j=>j.status!=="done"&&j.operatorId===user.id).length;

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
          {[["new","plus","New Job"],["quick","bolt","Quick Entry"],["active","player-play","Active"],["machines","alert-triangle","Machines"],["tools","package","Tools"],["history","list","History"]].map(([t,ic,lb])=>{
            const userDepts=user.departments||[];
            const lowTools=tools.filter(tl=>tl.active&&tl.quantity<=tl.minQuantity&&(userDepts.length===0||!tl.department||userDepts.includes(tl.department))).length;
            return(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
              <i className={`ti ti-${ic}`}/> {lb}
              {t==="active"&&activeCnt>0&&<span style={{background:C.amber,color:"#1a1a1a",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{activeCnt}</span>}
              {t==="machines"&&Object.keys(machineIssues).length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{Object.keys(machineIssues).length}</span>}
              {t==="tools"&&lowTools>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:9,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{lowTools}</span>}
            </button>
            );
          })}
        </div>
      )}
      {user.role==="admin"&&(
        <div style={{display:"flex",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
          {[["admin","layout-dashboard","Dashboard"],["alljobs","tool","All Jobs"],["machdata","cpu","Machines"],["reports","chart-bar","Reports"],["manage","settings","Manage"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}><i className={`ti ti-${ic}`}/> {lb}</button>
          ))}
        </div>
      )}

      {/* CONTENT */}
      {tab==="new"      &&<NewJobTab         user={user} machines={machines} machineIssues={machineIssues} setJobs={setJobs} jobs={visibleJobs}/>}
      {tab==="quick"    &&<QuickEntryTab     user={user} machines={machines} setJobs={setJobs} setTab={setTab} saveNow={saveNow}/>}
      {tab==="active"   &&<ActiveTab         user={user} jobs={visibleJobs} setJobs={setJobs} setCompleteId={setCompleteId} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machines" &&<MachineStatusTab  user={user} machines={machines} machineIssues={machineIssues} reportIssue={reportIssue} resolveIssue={resolveIssue}/>}
      {tab==="tools"    &&<ToolsTab          user={user} tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} saveNow={saveNow}/>}
      {tab==="history"  &&<HistoryTab        user={user} jobs={visibleJobs}/>}
      {tab==="admin"    &&<AdminDash         jobs={visibleJobs} machineIssues={machineIssues} downtimeLog={downtimeLog} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} tools={tools}/>}
      {tab==="alljobs"  &&<AllJobsTab        jobs={visibleJobs} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} machineIssues={machineIssues} setMachineIssues={setMachineIssues} resolveIssue={resolveIssue} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machdata" &&<MachineDataTab     jobs={visibleJobs} machines={machines} downtimeLog={downtimeLog} machineIssues={machineIssues}/>}
      {tab==="reports"  &&<ReportsTab        jobs={visibleJobs}/>}
      {tab==="manage"   &&<ManageTab         users={users} setUsers={setUsers} machines={machines} setMachines={setMachines} workHours={workHours} setWorkHours={setWorkHours} tools={tools} setTools={setTools} toolLog={toolLog} saveNow={saveNow}/>}

      {completeId&&<CompleteModal jobId={completeId} jobs={jobs} setJobs={setJobs} onClose={()=>setCompleteId(null)} saveNow={saveNow} stateRef={stateRef}/>}
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
            {users.filter(u=>u.active&&!u.removed).sort((a,b)=>{
              if(a.role==="admin"&&b.role!=="admin") return 1;
              if(b.role==="admin"&&a.role!=="admin") return -1;
              return a.name.localeCompare(b.name);
            }).map(u=>(
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
function NewJobTab({user,machines,setJobs,jobs}){
  const [customer,setCustomer]=useState(""); const [job,setJob]=useState(""); const [machine,setMachine]=useState(""); const [op,setOp]=useState(""); const [errs,setErrs]=useState({});
  const [twoSided,setTwoSided]=useState(false);
  const [showSuggestions,setShowSuggestions]=useState(true);

  // Past completed jobs matching the typed part number (min 2 chars)
  const suggestions=job.trim().length>=2
    ?(jobs||[]).filter(j=>j.status==="done"&&j.job.toLowerCase().includes(job.trim().toLowerCase()))
       .sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))
       .slice(0,5)
    :[];

  const applyJob=prev=>{
    setCustomer(prev.customer||"");
    setMachine(prev.machine||"");
    setOp(prev.op||"");
    setTwoSided(!!prev.twoSided);
    setJob(prev.job||"");
    setErrs({});
    setShowSuggestions(false);
  };

  const start=()=>{
    const e={};if(!customer.trim())e.customer="Required";if(!job.trim())e.job="Required";if(!machine)e.machine="Required";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();setJobs(prev=>[{id:now,customer:customer.trim(),job:job.trim(),machine,op:op.trim(),operatorId:user.id,operatorName:user.name,status:"setup",setupSec:0,runSec:0,phaseStartedAt:now,createdAt:now,pieces:0,photoData:null,photoData2:null,twoSided,lastModifiedAt:now},...prev]);
    setCustomer("");setJob("");setMachine("");setOp("");setErrs({});setTwoSided(false);setShowSuggestions(true);
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Start New Job</div>

      {/* Two-sided toggle — TOP of form so it can't be missed */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Job Type</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div onClick={()=>setTwoSided(false)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${!twoSided?C.amber:"rgba(255,255,255,.1)"}`,
            background:!twoSided?"rgba(240,165,0,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-square" style={{fontSize:22,color:!twoSided?C.amber:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:12,fontWeight:700,color:!twoSided?C.amber:C.muted,letterSpacing:1}}>Single Side</div>
            {!twoSided&&<div style={{fontSize:9,color:C.amber,marginTop:4,letterSpacing:1}}>✓ SELECTED</div>}
          </div>
          <div onClick={()=>setTwoSided(true)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${twoSided?C.blue:"rgba(255,255,255,.1)"}`,
            background:twoSided?"rgba(59,130,246,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-layers-intersect" style={{fontSize:22,color:twoSided?C.blue:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:12,fontWeight:700,color:twoSided?C.blue:C.muted,letterSpacing:1}}>Two Sides</div>
            {twoSided&&<div style={{fontSize:9,color:C.blue,marginTop:4,letterSpacing:1}}>✓ SELECTED</div>}
          </div>
        </div>
        {twoSided&&<div style={{fontSize:11,color:C.blue,marginTop:8,background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 10px"}}>
          <i className="ti ti-info-circle"/> Side 1 runs first. After completing Side 1, Side 2 setup starts automatically.
        </div>}
      </div>

      <div style={{marginBottom:12}}>
        <label style={label}>Customer *</label>
        <input style={inp(errs.customer)} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="e.g. Acme Corp"/>
        {errs.customer&&<div style={errMsg}>{errs.customer}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Part Number *</label>
        <input style={inp(errs.job)} value={job}
          onChange={e=>{setJob(e.target.value);setShowSuggestions(true);}}
          placeholder="e.g. JOB-2025-0451"/>
        {errs.job&&<div style={errMsg}>{errs.job}</div>}
        {/* Previous job suggestions */}
        {showSuggestions&&suggestions.length>0&&(
          <div style={{marginTop:8,border:`1px solid ${C.amber}`,borderRadius:8,overflow:"hidden"}}>
            <div style={{background:"rgba(240,165,0,.1)",padding:"6px 10px",fontSize:9,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>
              <i className="ti ti-history"/> Previous runs — tap to load
            </div>
            {suggestions.map((s,i)=>(
              <div key={s.id} style={{padding:"10px 12px",borderTop:i>0?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"transparent"}}
                onClick={()=>applyJob(s)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.job}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {s.customer} · {s.machine}{s.op?` · ${s.op}`:""}
                  </div>
                  <div style={{fontSize:9,color:C.muted,marginTop:1,letterSpacing:1}}>{fmtDate(s.completedAt)}</div>
                </div>
                <div style={{flexShrink:0,background:C.amber,color:"#1a1a1a",borderRadius:6,padding:"4px 10px",fontSize:9,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>
                  Load
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Machine *</label>
        <select style={sel(errs.machine)} value={machine} onChange={e=>setMachine(e.target.value)}>
          <option value="">— Select Machine —</option>
          {machines.filter(m=>{
            if(!m.active) return false;
            const userDepts=user.departments||[];
            if(userDepts.length===0) return true; // no dept filter → see everything
            // show machine if it has no dept, or its dept is in the user's depts
            return !m.department||userDepts.includes(m.department);
          }).map(m=><option key={m.id}>{m.name}</option>)}
        </select>
        {errs.machine&&<div style={errMsg}>{errs.machine}</div>}
      </div>
      <div style={{marginBottom:12}}>
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
function QuickEntryTab({user,machines,setJobs,setTab,saveNow}){
  const [customer,setCustomer]=useState("");
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

  const submit=async()=>{
    const e={};
    if(!customer.trim())       e.customer="Customer is required";
    if(!job.trim())            e.job="Part number is required";
    if(!machine)               e.machine="Select a machine";
    if((parseInt(runH)||0)+(parseInt(runM)||0)===0) e.runTime="Enter the run time";
    if(!pieces||parseInt(pieces)<1)   e.pieces="Enter number of pieces produced";
    if(!photo)                 e.photo="Quality photo is required";
    if(Object.keys(e).length){setErrs(e);return;}

    const setupSec=(parseInt(setupH)||0)*3600+(parseInt(setupM)||0)*60;
    const runSec  =(parseInt(runH)||0)*3600+(parseInt(runM)||0)*60;
    const completedAt=Date.now();
    const date=new Date(completedAt);
    const dateStr=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const safeName=(s)=>s.replace(/[^a-z0-9]/gi,"_");
    const filename=`quality_${safeName(customer.trim())}_${safeName(job.trim())}_${dateStr}.jpg`;
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
  };

  const reset=()=>{
    setCustomer("");setJob("");setMachine("");setOp("");setSetupH("");setSetupM("");setRunH("");setRunM("");
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
  const filled=[!!customer.trim(),!!job.trim(),!!machine,(parseInt(runH)||0)+(parseInt(runM)||0)>0,!!pieces&&parseInt(pieces)>0,!!photo];
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
          <label style={label}>Customer <span style={{color:C.red}}>*</span></label>
          <input style={inp(errs.customer)} value={customer} onChange={e=>{setCustomer(e.target.value);setErrs(p=>({...p,customer:null}));}} placeholder="e.g. Acme Corp"/>
          {errs.customer&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.customer}</div>}
        </div>
        <div style={{marginBottom:10}}>
          <label style={label}>Part Number <span style={{color:C.red}}>*</span></label>
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
function JobCard({j,setJobs,startRun,setCompleteId,completeDeburring}){
    const [nmForm,setNmForm]=useState(false);
    const [nmH,setNmH]=useState(""); const [nmM,setNmM]=useState("");
    const anyPaused=j.paused||j.logoutPaused;
    const nightColor="#7c5cbf";
    const nightArmed=j.nightMode&&!j.nightModeEndsAt&&!j.nightModeDone;
    const nightActive=j.nightMode&&j.nightModeEndsAt&&!j.nightModeDone;
    const isDebur=j.status==="deburring";
    const isSetup=j.status==="setup"||j.status==="side2_setup";
    const isRun=j.status==="run"||j.status==="side2_run";
    const lt=liveTime(j);
    const isSide2=j.status==="side2_setup"||j.status==="side2_run";
    const color=j.paused?C.red:j.logoutPaused?C.muted:j.nightMode?nightColor:isDebur?C.deburr:isSetup?C.amber:C.green;
    const remainingSec=nightActive?Math.max(0,Math.round((j.nightModeEndsAt-Date.now())/1000)):0;

    const activateNightMode=()=>{
      const dur=(parseInt(nmH)||0)*3600+(parseInt(nmM)||0)*60;
      if(dur<=0) return;
      // Store duration only — timer starts when operator logs out
      setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:true,nightModeDuration:dur,nightModeEndsAt:null,nightModeDone:false}:x));
      setNmForm(false);setNmH("");setNmM("");
    };
    const cancelNightMode=()=>setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:false,nightModeDuration:0,nightModeEndsAt:null,nightModeDone:false,nightPaused:false}:x));

    return(
      <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${color}`,border:`1px solid ${C.border}`,borderTopColor:color,padding:"12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <i className={`ti ti-${j.nightMode?"moon":"robot"}`} style={{fontSize:14,color}}/>
          <div style={{fontSize:12,color,fontWeight:700,letterSpacing:1,textTransform:"uppercase",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.machine}</div>
          {j.paused?<span style={badge("down")}>Paused</span>
            :j.logoutPaused?<span style={badge("")}>Paused</span>
            :nightActive?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Night Running</span>
            :nightArmed?<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Night Armed</span>
            :isDebur?<span style={{...badge("run"),background:"rgba(230,126,34,.15)",color:C.deburr,borderColor:"rgba(230,126,34,.4)"}}>Deburring</span>
            :isSide2?<span style={{...badge(isSetup?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.4)"}}>{isSetup?"Side 2 — Setup":"Side 2 — Run"}</span>
            :j.twoSided?<span style={badge(isSetup?"setup":"run")}>{isSetup?"Side 1 — Setup":"Side 1 — Run"}</span>
            :<span style={badge(isSetup?"setup":"run")}>{isSetup?"Setup":"Run"}</span>}
        </div>
        {j.customer&&<div style={{fontSize:18,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
        <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
        {j.op&&<div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.op}</div>}
        {j.paused&&<div style={{background:"rgba(231,76,60,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:C.red}}><i className="ti ti-player-pause"/> Timer paused — machine down</div>}
        {j.logoutPaused&&!j.nightModeDone&&<div style={{background:"rgba(138,155,181,0.1)",borderRadius:6,padding:"6px 8px",fontSize:10,color:C.muted}}><i className="ti ti-moon"/> Timer paused — operator away</div>}
        {j.logoutPaused&&j.nightModeDone&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:nightColor}}><i className="ti ti-moon-stars"/> Night run complete — resumes on login</div>}
        {nightArmed&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:nightColor}}>
          <i className="ti ti-moon-stars"/> Night mode armed — runs {fmtHM(j.nightModeDuration||0)} after you log out
        </div>}
        {nightActive&&<div style={{background:"rgba(124,92,191,0.12)",borderRadius:6,padding:"6px 8px",fontSize:10,color:nightColor}}>
          <i className="ti ti-moon-stars"/> Running unattended — stops in {fmtDetail(remainingSec)}
        </div>}
        {isDebur?(
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:C.deburr,marginBottom:4}}>Deburring Time</div>
            <div style={{fontSize:28,letterSpacing:2,color:C.deburr,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{fmtHM(lt.debur)}</div>
          </div>
        ):(
          <div style={{textAlign:"center",padding:"8px 0",opacity:anyPaused?0.4:1}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color,marginBottom:4}}>
              {isSide2?(isSetup?"Side 2 Setup":"Side 2 Run"):isSetup?"Setup":"Run"} Time
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
            <span style={{fontSize:10,color:C.amber}}><i className="ti ti-check"/> S1 Setup: {fmtHM(lt.setup)}</span>
            <span style={{fontSize:10,color:C.green}}><i className="ti ti-check"/> S1 Run: {fmtHM(lt.run)}</span>
            {j.pieces>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces} pcs</span>}
          </div>
        )}
        {isDebur?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:12,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.setup)}</div>
              <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Setup ✓</div>
            </div>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:12,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.run)}</div>
              <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>Run ✓</div>
            </div>
            <div style={{background:`rgba(230,126,34,.12)`,borderRadius:6,padding:"6px",textAlign:"center",border:`1px solid rgba(230,126,34,.3)`}}>
              <div style={{fontSize:12,color:C.deburr,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(lt.debur)}</div>
              <div style={{fontSize:8,letterSpacing:1,color:C.deburr,textTransform:"uppercase",marginTop:2}}>Deburr</div>
            </div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center"}}>
              <div style={{fontSize:13,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2?lt.setup2:lt.setup)}</div>
              <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>{isSide2?"S2 Setup":isRun?"Setup ✓":"Setup"}</div>
            </div>
            <div style={{background:C.raised,borderRadius:6,padding:"6px",textAlign:"center",opacity:isSetup?0.35:1}}>
              <div style={{fontSize:13,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2?lt.run2:lt.run)}</div>
              <div style={{fontSize:8,letterSpacing:1,color:C.muted,textTransform:"uppercase",marginTop:2}}>{isSide2?"S2 Run":"Run"}</div>
            </div>
          </div>
        )}
        {!anyPaused&&!j.nightMode&&(
          isDebur
            ?<button style={{...btn("primary",true,true),marginTop:2,background:C.deburr,borderColor:C.deburr}} onClick={()=>completeDeburring&&completeDeburring(j.id)}>
               <i className="ti ti-check"/> Done Deburring
             </button>
            :isSetup
              ?<button style={{...btn("primary",true,true),marginTop:2,...(isSide2?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>startRun(j.id)}>
                 <i className="ti ti-player-play"/> {isSide2?"Start Side 2 Run":"Start Run"}
               </button>
              :<div style={{display:"flex",flexDirection:"column",gap:6,marginTop:2}}>
                <button style={{...btn("success",true,true),...(isSide2?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>setCompleteId(j.id)}>
                  <i className="ti ti-check"/> {isSide2?"Complete Side 2":j.twoSided?"Complete Side 1":"Complete Job"}
                </button>
                {!isSide2&&<button style={{...btn("outline",true,true),color:nightColor,borderColor:nightColor}} onClick={()=>setNmForm(f=>!f)}><i className="ti ti-moon"/> Night Mode</button>}
              </div>
        )}
        {nightArmed&&(
          <button style={btn("outline",true,true)} onClick={cancelNightMode}><i className="ti ti-x"/> Cancel Night Mode</button>
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

function ActiveTab({user,jobs,setJobs,setCompleteId,saveNow,stateRef}){
  const [machineFilt,setMachineFilt]=useState("all");
  const active=jobs.filter(j=>j.status!=="done"&&j.operatorId===user.id);
  const machines=[...new Set(active.map(j=>j.machine))].sort();
  const visible=active.filter(j=>machineFilt==="all"||j.machine===machineFilt);
  const setupJobs =visible.filter(j=>j.status==="setup"||j.status==="side2_setup").sort((a,b)=>(b.setupSec+b.setupSec2||0)-(a.setupSec+a.setupSec2||0));
  const runJobs   =visible.filter(j=>j.status==="run"  ||j.status==="side2_run")  .sort((a,b)=>(b.runSec+b.runSec2||0)-(a.runSec+a.runSec2||0));
  const deburJobs =visible.filter(j=>j.status==="deburring");
  const startRun=id=>{
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.id!==id) return j;
      const newStatus=j.status==="side2_setup"?"side2_run":"run";
      const lt=liveTime(j);
      const patch=j.status==="side2_setup"
        ?{setupSec2:lt.setup2}
        :{setupSec:lt.setup};
      return{...j,...patch,status:newStatus,phaseStartedAt:n,lastModifiedAt:n};
    });
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
  };

  if(!active.length) return <div style={{padding:"14px 16px"}}><div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12,letterSpacing:1}}><i className="ti ti-tool" style={{fontSize:34,display:"block",marginBottom:10,opacity:0.3}}/> No active jobs.</div></div>;

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
  };

  return(
    <div style={{padding:"10px 12px"}}>
      {machines.length>1&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>All Machines</button>
          {machines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
        </div>
      )}
      {deburJobs.length>0&&(
        <>
          <div style={{fontSize:10,color:C.deburr,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(230,126,34,0.2)`}}>
            <i className="ti ti-tool"/> Deburring · {deburJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {deburJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring}/>)}
          </div>
        </>
      )}
      {setupJobs.length>0&&(
        <>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(240,165,0,0.2)`}}>
            <i className="ti ti-settings"/> Setting Up · {setupJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {setupJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring}/>)}
          </div>
        </>
      )}
      {runJobs.length>0&&(
        <>
          <div style={{fontSize:10,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid rgba(39,174,96,0.2)`}}>
            <i className="ti ti-player-play"/> Running · {runJobs.length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {runJobs.map(j=><JobCard key={j.id} j={j} setJobs={setJobs} startRun={startRun} setCompleteId={setCompleteId} completeDeburring={completeDeburring}/>)}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// COMPLETE MODAL
// ═══════════════════════════════════════════════════════
function CompleteModal({jobId,jobs,setJobs,onClose,saveNow,stateRef}){
  const j=jobs.find(x=>x.id===jobId);
  const [pieces,setPieces]=useState("");
  const [photoData,setPhotoData]=useState(null);
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const [deburring,setDeburring]=useState(false);
  const fileRef=useRef();
  if(!j) return null;

  // Which phase are we completing?
  const isSide1Completion=j.twoSided&&j.status==="run";
  const isSide2Completion=j.twoSided&&j.status==="side2_run";
  const headerColor=isSide2Completion?C.blue:C.amber;
  const ltModal=liveTime(j);
  const sideLabel=isSide1Completion?"Side 1 Complete — Start Side 2":isSide2Completion?"Side 2 — Final Complete":"Complete Job";

  const handlePhoto=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhotoData(ev.target.result);r.readAsDataURL(f);};

  const submit=async()=>{
    const e={};
    if(!pieces||parseInt(pieces)<1) e.pieces="Enter number of pieces produced";
    if(!photoData) e.photo=`Quality photo required${isSide1Completion?" for Side 1":isSide2Completion?" for Side 2":""}`;
    if(Object.keys(e).length){setErrs(e);return;}
    setSaving(true);
    const now=Date.now();
    const date=new Date(now);
    const dateStr=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const safeName=(s)=>s.replace(/[^a-z0-9]/gi,"_");
    const base=`quality_${safeName(j.customer||"unknown")}_${safeName(j.job)}_${dateStr}`;

    if(isSide1Completion){
      // Save side 1 data, auto-advance to side2_setup
      const filename=`${base}_side1.jpg`;
      const photoUrl=await uploadPhoto(photoData,filename);
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"side2_setup",
        pieces:parseInt(pieces),       // side 1 pieces
        photoData:photoUrl,            // side 1 photo
        setupSec2:0, runSec2:0,        // reset side 2 timers
        runSec:ltModal.run,            // freeze side1 run time
        phaseStartedAt:now,            // start side2 setup timer
        side1CompletedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      const a=document.createElement("a");a.href=photoData;a.download=filename;a.click();
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    } else if(deburring){
      // Start manual deburring timer — freeze run, save photo/pieces, then deburr phase begins
      const filename=isSide2Completion?`${base}_side2.jpg`:`${base}.jpg`;
      const photoUrl=await uploadPhoto(photoData,filename);
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"deburring",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), photoData2:photoUrl, runSec2:ltModal.run2}
          : {pieces:parseInt(pieces),  photoData:photoUrl,  runSec:ltModal.run}),
        deburSec:0,
        phaseStartedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      const a=document.createElement("a");a.href=photoData;a.download=filename;a.click();
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    } else {
      // Final completion (single-sided or side 2)
      const filename=isSide2Completion?`${base}_side2.jpg`:`${base}.jpg`;
      const photoUrl=await uploadPhoto(photoData,filename);
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"done",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), photoData2:photoUrl, runSec2:ltModal.run2}   // side 2
          : {pieces:parseInt(pieces),  photoData:photoUrl,  runSec:ltModal.run}),  // single-sided
        phaseStartedAt:null,
        completedAt:now, lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      const a=document.createElement("a");a.href=photoData;a.download=filename;a.click();
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:11,color:headerColor,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-check-circle"/> {sideLabel}</div>
          <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>

        {/* Job info */}
        <div style={{...card(headerColor),background:"#151e2b",marginBottom:14}}>
          <div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
          {j.twoSided&&(
            <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> Two-Sided</span>
              {isSide1Completion&&<span style={{...badge("setup"),fontSize:9}}>Completing Side 1</span>}
              {isSide2Completion&&<span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,fontSize:9}}>Completing Side 2</span>}
            </div>
          )}
        </div>

        {/* Side 1 recap when completing side 2 */}
        {isSide2Completion&&(
          <div style={{background:"rgba(39,174,96,.08)",border:`1px solid rgba(39,174,96,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:C.green,letterSpacing:1}}><i className="ti ti-check"/> Side 1 done</span>
            <span style={{fontSize:10,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
            <span style={{fontSize:10,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
            {j.pieces>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces} pcs</span>}
          </div>
        )}

        {/* Timer stats for current side */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={statBox}>
            <div style={{fontSize:20,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.setup2:ltModal.setup)}</div>
            <div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 Setup":"Setup"}</div>
          </div>
          <div style={statBox}>
            <div style={{fontSize:20,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.run2:ltModal.run)}</div>
            <div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 Run":"Run"}</div>
          </div>
        </div>

        {/* Pieces */}
        <div style={{marginBottom:14}}>
          <label style={label}>{isSide2Completion?"Side 2 Pieces":"Pieces Produced"} <span style={{color:C.red}}>*</span></label>
          <input type="number" min="1" style={{...inp(errs.pieces),fontSize:22,textAlign:"center",color:headerColor}} value={pieces} onChange={e=>setPieces(e.target.value)} placeholder="0"/>
          {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
        </div>

        {/* Photo */}
        <div style={{marginBottom:16}}>
          <label style={label}>
            {isSide1Completion?"Side 1 — Quality Photo":isSide2Completion?"Side 2 — Quality Photo":"Quality Photo"} <span style={{color:C.red}}>*</span> &nbsp;
            <span style={{color:photoData?C.green:C.red}}>{photoData?"✓ Attached":"Required"}</span>
          </label>
          <div style={{border:`2px dashed ${errs.photo&&!photoData?C.red:photoData?C.green:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:16,textAlign:"center",cursor:"pointer",background:photoData?"rgba(39,174,96,.05)":"transparent"}} onClick={()=>fileRef.current.click()}>
            {photoData
              ?<><img src={photoData} style={{maxHeight:90,borderRadius:6,display:"block",margin:"0 auto 8px"}}/><div style={{fontSize:11,color:C.green,letterSpacing:1}}>Photo attached ✓ — tap to replace</div></>
              :<><i className="ti ti-camera" style={{fontSize:26,opacity:0.4,display:"block",marginBottom:8}}/><div style={{fontSize:11,color:C.muted,letterSpacing:1}}>Tap to take or upload quality photo</div></>}
          </div>
          <input type="file" ref={fileRef} accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhoto}/>
          {errs.photo&&!photoData&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.photo}</div>}
        </div>

        {isSide1Completion&&(
          <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:C.blue}}>
            <i className="ti ti-info-circle"/> After submitting, Side 2 setup timer will start automatically.
          </div>
        )}

        {/* Manual deburring checkbox — only on final completion */}
        {!isSide1Completion&&(
          <div
            onClick={()=>setDeburring(d=>!d)}
            style={{...card(),marginBottom:12,cursor:"pointer",border:`1px solid ${deburring?"rgba(230,126,34,.5)":C.border}`,background:deburring?"rgba(230,126,34,.06)":"transparent"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <i className={`ti ti-${deburring?"checkbox":"square"}`} style={{fontSize:22,color:deburring?C.deburr:C.muted,flexShrink:0}}/>
              <div>
                <div style={{fontSize:13,color:deburring?C.deburr:C.text,fontWeight:700,letterSpacing:1}}>Manual Deburring</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>Starts a deburring timer — tap "Done Deburring" when finished</div>
              </div>
            </div>
          </div>
        )}

        <button
          style={{...btn(saving?"outline":"success",true),
            background:saving?undefined:deburring?C.deburr:isSide2Completion?C.blue:undefined,
            borderColor:saving?undefined:deburring?C.deburr:isSide2Completion?C.blue:undefined}}
          onClick={submit} disabled={saving}>
          {saving
            ?<><i className="ti ti-loader-2"/> Saving…</>
            :isSide1Completion
              ?<><i className="ti ti-arrow-right"/> Submit Side 1 &amp; Start Side 2</>
              :deburring
                ?<><i className="ti ti-tool"/> Submit &amp; Start Deburring</>
                :<><i className="ti ti-check"/> Submit &amp; Complete Job</>}
        </button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose} disabled={saving}>Cancel</button>
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
          <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            {j.photoData?<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${j.twoSided?C.blue:C.border}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-camera-off" style={{color:C.muted,fontSize:18}}/></div>}
            {j.twoSided&&(j.photoData2?<img src={j.photoData2} title="Side 2" style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${C.blue}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.red}`}}><i className="ti ti-camera-off" style={{color:C.red,fontSize:16}}/></div>)}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              {j.customer&&<div style={{fontSize:14,color:C.text,fontWeight:700}}>{j.customer}</div>}
              <div style={{fontSize:11,color:C.muted}}><i className="ti ti-hash"/> {j.job}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                {j.quickEntry&&<span style={{...badge("admin"),fontSize:9}}>Quick</span>}
                {j.twoSided&&<span style={{...badge("admin"),background:"rgba(59,130,246,.1)",color:C.blue,fontSize:9}}><i className="ti ti-layers-intersect"/> 2-Sided</span>}
              </div>
            </div>
            <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span></div>
            {j.twoSided?(
              <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8}}>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1}}>S1</span>
                  <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                  <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                  {j.pieces>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces} pcs</span>}
                  {j.pieces>0&&<span style={{fontSize:10,color:C.amber,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:10,color:C.blue,fontWeight:700,letterSpacing:1}}>S2</span>
                  <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec2||0)}</span>
                  <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec2||0)}</span>
                  {j.pieces2>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces2} pcs</span>}
                  {j.pieces2>0&&<span style={{fontSize:10,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/pc</span>}
                </div>
              </div>
            ):(
              <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                {j.pieces>0&&<span style={{fontSize:11,color:C.muted}}>{j.pieces} pcs</span>}
                {j.pieces>0&&<span style={{fontSize:11,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
              </div>
            )}
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
// Sort: down/repair first → setup → running
function sortActive(arr){
  const rank=j=>j.paused?0:j.status==="setup"?1:2;
  return [...arr].sort((a,b)=>rank(a)-rank(b));
}

// Shared 3-column grid with Down / Setup / Running sections
function ActiveSection({label,color,items,renderCard}){
  if(!items.length) return null;
  return(
    <div style={{marginBottom:16}}>
      <div style={{fontSize:10,color,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${color}40`}}>
        {label} · {items.length}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {items.map(j=>renderCard(j))}
      </div>
    </div>
  );
}

function ActiveJobsGrid({jobs,renderCard}){
  const down   =jobs.filter(j=>j.paused);
  const setup  =jobs.filter(j=>!j.paused&&(j.status==="setup"||j.status==="side2_setup"));
  const running=jobs.filter(j=>!j.paused&&(j.status==="run"||j.status==="side2_run"||j.status==="deburring"));
  return(
    <>
      <ActiveSection label="Down / Repair" color={C.red}   items={down}    renderCard={renderCard}/>
      <ActiveSection label="Setting Up"    color={C.amber} items={setup}   renderCard={renderCard}/>
      <ActiveSection label="Running"       color={C.green} items={running} renderCard={renderCard}/>
    </>
  );
}

function DonutChart({title,segments}){
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
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{title}</div>
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
          <div style={{fontSize:11,color:C.text,fontWeight:700,fontFamily:"'Share Tech Mono',monospace"}}>{total>0?totalHM:"—"}</div>
          <div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>total</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,width:"100%"}}>
        {segments.map((s,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{width:8,height:8,borderRadius:2,background:s.color,display:"inline-block"}}/>
              <span style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</span>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:10,color:s.color,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(s.value)}</span>
              <span style={{fontSize:9,color:C.muted}}>{total>0?Math.round(s.value/total*100):0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDash({jobs,machineIssues,downtimeLog,setJobs,setCompleteId,users,machines}){
  const done=jobs.filter(j=>j.status==="done"); const active=sortActive(jobs.filter(j=>j.status!=="done"));
  const totalPieces=done.reduce((s,j)=>s+j.pieces,0);
  const avgRun=done.length?(done.reduce((s,j)=>s+j.runSec,0)/done.length/60).toFixed(1):0;
  const machMap={};done.forEach(j=>{if(!machMap[j.machine])machMap[j.machine]={run:0,setup:0,jobs:0};machMap[j.machine].run+=j.runSec;machMap[j.machine].setup+=j.setupSec;machMap[j.machine].jobs++;});
  const maxRun=Math.max(...Object.values(machMap).map(m=>m.run),1);
  const opMap={};done.forEach(j=>{if(!opMap[j.operatorName])opMap[j.operatorName]={jobs:0,pieces:0,run:0};opMap[j.operatorName].jobs++;opMap[j.operatorName].pieces+=j.pieces;opMap[j.operatorName].run+=j.runSec;});
  const issueEntries=Object.entries(machineIssues);
  // Chart data
  const nowMs=Date.now();
  const todayStr=toDateInput(nowMs);
  const monthStr=todayStr.slice(0,7);
  // Week: Monday → today
  const todayDate=new Date(); const dayOfWeek=todayDate.getDay();
  const monday=new Date(todayDate); monday.setDate(todayDate.getDate()-((dayOfWeek+6)%7)); monday.setHours(0,0,0,0);
  const weekStart=monday.getTime();
  const weekJobs=jobs.filter(j=>(j.createdAt||0)>=weekStart);
  const monthJobs=jobs.filter(j=>toDateInput(j.createdAt).startsWith(monthStr));
  const weekDowntime=
    downtimeLog.filter(d=>(d.resolvedAt||0)>=weekStart).reduce((s,d)=>s+d.downtimeSec,0)+
    Object.values(machineIssues).filter(i=>(i.reportedAt||0)>=weekStart).reduce((s,i)=>s+Math.round((nowMs-(i.reportedAt||nowMs))/1000),0);
  const monthDowntime=
    downtimeLog.filter(d=>toDateInput(d.resolvedAt).startsWith(monthStr)).reduce((s,d)=>s+d.downtimeSec,0)+
    Object.values(machineIssues).filter(i=>toDateInput(i.reportedAt).startsWith(monthStr)).reduce((s,i)=>s+Math.round((nowMs-(i.reportedAt||nowMs))/1000),0);
  const chartSegs=(setup,run,down)=>[
    {label:"Issues",  value:down,  color:C.red},
    {label:"Setup",   value:setup, color:C.amber},
    {label:"Run",     value:run,   color:C.green},
  ];
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16,background:C.raised,borderRadius:10,padding:"14px 12px",border:`1px solid ${C.border}`}}>
        <DonutChart title="This Week" segments={chartSegs(
          weekJobs.reduce((s,j)=>s+j.setupSec,0),
          weekJobs.reduce((s,j)=>s+j.runSec,0),
          weekDowntime
        )}/>
        <DonutChart title="This Month" segments={chartSegs(
          monthJobs.reduce((s,j)=>s+j.setupSec,0),
          monthJobs.reduce((s,j)=>s+j.runSec,0),
          monthDowntime
        )}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
        {[[active.length,"Active Jobs",C.amber],[done.length,"Completed",C.green],[totalPieces,"Total Pieces",C.text],[avgRun+"m","Avg Run",C.muted]].map(([v,l,c])=>(
          <div key={l} style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center"}}><div style={{fontSize:26,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{v}</div><div style={{fontSize:9,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{l}</div></div>
        ))}
      </div>
      {issueEntries.length>0&&<>
        <div style={{fontSize:10,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.red}40`}}>
          <i className="ti ti-alert-triangle"/> Machine Issues · {issueEntries.length}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {issueEntries.map(([name,issue])=>(
            <div key={name} style={card(issue.status==="down"?C.red:C.amber)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                <div style={{fontSize:12,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                <span style={badge(issue.status==="down"?"down":"repair")}>{issue.status==="down"?"Down":"Repair"}</span>
              </div>
              <div style={{fontSize:10,color:C.muted,marginTop:6}}><i className="ti ti-user"/> {issue.reportedBy}</div>
              <div style={{fontSize:10,color:C.muted}}><i className="ti ti-calendar"/> {fmtDate(issue.reportedAt)}</div>
              {issue.reason&&<div style={{marginTop:6,fontSize:10,color:C.text,borderTop:`1px solid ${C.border}`,paddingTop:6}}>{issue.reason}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Live</div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:C.red,display:"inline-block"}}/>
                  <span style={{fontSize:13,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(Math.round((Date.now()-(issue.reportedAt||Date.now()))/1000))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>}
      {active.length>0&&<>
        <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Live Active Jobs · {active.length}</div>
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
                {j.customer&&<div style={{fontSize:12,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
                <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                {j.paused&&<span style={badge("down")}>Down</span>}
                {j.logoutPaused&&!nightActive&&<span style={badge("")}>Paused</span>}
                {nightActive&&<span style={{...badge("admin"),background:"rgba(124,92,191,.2)",color:nightColor,borderColor:"rgba(124,92,191,.4)",fontSize:8}}><i className="ti ti-moon"/> Night</span>}
                {nightArmed&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor,fontSize:8}}><i className="ti ti-moon"/> Armed</span>}
                {!j.nightMode&&!j.paused&&!j.logoutPaused&&(jIsSide2
                  ?<span style={{...badge(jIsSetup?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)",fontSize:8}}>{jIsSetup?"S2 Setup":"S2 Run"}</span>
                  :<span style={badge(j.status)}>{jIsSetup?"Setup":"Run"}</span>)}
              </div>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:6}}><i className="ti ti-robot"/> {j.machine}</div>
            <div style={{fontSize:10,color:C.muted}}><i className="ti ti-user"/> {j.operatorName}</div>
            {nightActive?(
              <div style={{marginTop:6,background:"rgba(124,92,191,.1)",border:`1px solid rgba(124,92,191,.25)`,borderRadius:6,padding:"5px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:9,color:nightColor,letterSpacing:1,textTransform:"uppercase"}}><i className="ti ti-moon-stars"/> Ends in</span>
                <span style={{fontSize:15,color:nightColor,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmt(nightRemaining)}</span>
              </div>
            ):(
              <div style={{fontSize:18,color:pauseColor||accentColor,fontFamily:"'Share Tech Mono',monospace",marginTop:6,textAlign:"right"}}>
                {fmtHM(jIsSetup?(jIsSide2?liveTime(j).setup2:liveTime(j).setup):(jIsSide2?liveTime(j).run2:liveTime(j).run))}
              </div>
            )}
          </div>
        );}}/>
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


      {downtimeLog.length>0&&<>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 10px"}}>Downtime Log</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr>{["Machine","Type","Duration","Reported By","Resolved By","Date"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{[...downtimeLog].reverse().slice(0,4).map(d=>(
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
// ALL JOBS (ADMIN)
// ═══════════════════════════════════════════════════════
function AdminJobCard({j,setJobs,setCompleteId,users,machines,saveNow,stateRef}){
  const [editing,setEditing]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [editCustomer,setEditCustomer]=useState("");
  const [editJob,setEditJob]=useState("");
  const [editPieces,setEditPieces]=useState("");
  const [editOpId,setEditOpId]=useState("");
  const [editMachine,setEditMachine]=useState("");
  const [setupH,setSetupH]=useState(""); const [setupM,setSetupM]=useState("");
  const [runH,  setRunH  ]=useState(""); const [runM,  setRunM  ]=useState("");
  const openEdit=()=>{
    setEditCustomer(j.customer||"");
    setEditJob(j.job||"");
    setEditPieces(j.pieces!=null?String(j.pieces):"");
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
      machine:editMachine,
      operatorId:opUser?opUser.id:j.operatorId,
      operatorName:opUser?opUser.name:j.operatorName,
      lastModifiedAt:Date.now(),
    };
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
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
    const patch=j.status==="side2_setup"?{setupSec2:lt.setup2}:{setupSec:lt.setup};
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch,status:newStatus,phaseStartedAt:n,lastModifiedAt:n}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
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
  };

  return(
    <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          {j.customer&&<div style={{fontSize:13,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.customer}</div>}
          <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-hash"/> {j.job}</div>
        </div>
        <div style={{display:"flex",gap:4}}>
          <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:2}} onClick={()=>{setConfirmDelete(false);editing?setEditing(false):openEdit();}}><i className={`ti ti-${editing?"x":"pencil"}`}/></button>
          <button style={{background:"none",border:"none",color:confirmDelete?C.red:C.muted,cursor:"pointer",fontSize:14,padding:2}} onClick={()=>{setConfirmDelete(d=>!d);setEditing(false);}}><i className="ti ti-trash"/></button>
        </div>
      </div>

      {/* badges */}
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {isSide2Active
          ?<span style={{...badge(j.status==="side2_setup"?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> {j.status==="side2_setup"?"Side 2 Setup":"Side 2 Run"}</span>
          :j.twoSided&&j.status!=="done"
            ?<span style={badge(j.status==="setup"?"setup":"run")}>{j.status==="setup"?"Side 1 Setup":"Side 1 Run"}</span>
            :<span style={badge(j.status)}>{j.status==="setup"?"Setup":j.status==="run"?"Run":j.status==="done"?"Done":j.status}</span>}
        {j.twoSided&&j.status!=="done"&&<span style={{...badge("admin"),background:"rgba(59,130,246,.1)",color:C.blue,fontSize:9}}><i className="ti ti-layers-intersect"/> 2-Sided</span>}
        {j.paused&&<span style={badge("down")}>Machine Down</span>}
        {j.logoutPaused&&!j.nightModeDone&&<span style={badge("")}>Paused</span>}
        {j.logoutPaused&&j.nightModeDone&&<span style={{...badge(""),background:"rgba(124,92,191,.15)",color:nightColor}}>Night Paused</span>}
        {nightActive&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Night</span>}
        {nightArmed&&<span style={{...badge("admin"),background:"rgba(124,92,191,.15)",color:nightColor}}>Armed</span>}
        {j.status==="deburring"&&<span style={{...badge("run"),background:"rgba(230,126,34,.15)",color:C.deburr,borderColor:"rgba(230,126,34,.4)"}}>Deburring</span>}
      </div>

      {/* edit panel */}
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
          {/* customer + part# always editable */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div>
              <div style={label}>Customer</div>
              <input style={inp()} value={editCustomer} onChange={e=>setEditCustomer(e.target.value)} placeholder="Customer"/>
            </div>
            <div>
              <div style={label}>Part / Job #</div>
              <input style={inp()} value={editJob} onChange={e=>setEditJob(e.target.value)} placeholder="Job #"/>
            </div>
          </div>
          {/* operator + machine always editable */}
          <div>
            <div style={label}>Operator</div>
            <select style={sel()} value={editOpId} onChange={e=>setEditOpId(e.target.value)}>
              {users.filter(u=>u.active&&u.role==="operator"&&!u.removed).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Machine</div>
            <select style={sel()} value={editMachine} onChange={e=>setEditMachine(e.target.value)}>
              {machines.filter(m=>m.active).map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          {/* pieces only for done jobs */}
          {j.status==="done"&&(
            <div>
              <div style={label}>Pieces</div>
              <input type="number" min="0" style={inp()} value={editPieces} onChange={e=>setEditPieces(e.target.value)} placeholder="0"/>
            </div>
          )}
          {/* times */}
          <div>
            <div style={label}>Setup Time</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",color:C.amber}} value={setupH} onChange={e=>setSetupH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Hours</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",color:C.amber}} value={setupM} onChange={e=>setSetupM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Minutes</div>
              </div>
            </div>
          </div>
          <div>
            <div style={label}>Run Time</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div>
                <input type="number" min="0" style={{...inp(),textAlign:"center",color:C.green}} value={runH} onChange={e=>setRunH(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Hours</div>
              </div>
              <div>
                <input type="number" min="0" max="59" style={{...inp(),textAlign:"center",color:C.green}} value={runM} onChange={e=>setRunM(e.target.value)} placeholder="0"/>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:3,letterSpacing:1}}>Minutes</div>
              </div>
            </div>
          </div>
          <button style={btn("primary",true,true)} onClick={saveEdit}><i className="ti ti-check"/> Save</button>
        </div>
      )}

      {/* times */}
      <div style={{display:"grid",gridTemplateColumns:j.deburSec>0?"1fr 1fr 1fr":"1fr 1fr",gap:4}}>
        <div style={{background:C.raised,borderRadius:6,padding:"5px 6px",textAlign:"center"}}>
          <div style={{fontSize:12,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Active?lt.setup2:lt.setup)}</div>
          <div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>{isSide2Active?"S2 Setup":"Setup"}</div>
        </div>
        <div style={{background:C.raised,borderRadius:6,padding:"5px 6px",textAlign:"center",opacity:(j.status==="setup"||j.status==="side2_setup")?0.35:1}}>
          <div style={{fontSize:12,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{nightActive?fmtDetail(nightRemaining):fmtHM(isSide2Active?lt.run2:lt.run)}</div>
          <div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>{nightActive?"Stops in":isSide2Active?"S2 Run":"Run"}</div>
        </div>
        {j.deburSec>0&&(
          <div style={{background:`rgba(230,126,34,.1)`,borderRadius:6,padding:"5px 6px",textAlign:"center",border:`1px solid rgba(230,126,34,.25)`}}>
            <div style={{fontSize:12,color:C.deburr,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(j.status==="deburring"?lt.debur:j.deburSec)}</div>
            <div style={{fontSize:8,color:C.deburr,letterSpacing:1,textTransform:"uppercase",marginTop:1}}>Deburr</div>
          </div>
        )}
      </div>

      {/* machine + operator */}
      <div style={{fontSize:10,color:C.muted,display:"flex",flexDirection:"column",gap:2}}>
        <span><i className="ti ti-robot"/> {j.machine}</span>
        <span><i className="ti ti-user"/> {j.operatorName}</span>
      </div>

      {/* done job extras */}
      {j.status==="done"&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {j.photoData&&<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:34,height:34,borderRadius:6,objectFit:"cover",border:j.twoSided?`1px solid ${C.blue}`:undefined}}/>}
          {j.twoSided&&j.photoData2&&<img src={j.photoData2} title="Side 2" style={{width:34,height:34,borderRadius:6,objectFit:"cover",border:`1px solid ${C.blue}`}}/>}
          {j.twoSided?(
            <>
              <span style={{fontSize:9,color:C.blue,letterSpacing:1}}><i className="ti ti-layers-intersect"/> 2-SIDED</span>
              {j.pieces>0&&<span style={{fontSize:10,color:C.amber}}><i className="ti ti-1"/> {j.pieces}pcs · {fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
              {j.pieces2>0&&<span style={{fontSize:10,color:C.blue}}><i className="ti ti-2"/> {j.pieces2}pcs · {fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/pc</span>}
            </>
          ):(
            <>
              {j.pieces>0&&<span style={{fontSize:10,color:C.muted}}><i className="ti ti-box"/> {j.pieces} pcs</span>}
              {j.pieces>0&&<span style={{fontSize:10,color:C.blue}}><i className="ti ti-clock"/> {fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
            </>
          )}
          {j.completedAt&&<span style={{fontSize:10,color:C.muted}}>{fmtDate(j.completedAt)}</span>}
        </div>
      )}
      {/* side2 in-progress badge */}
      {isSide2Active&&(
        <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:6,padding:"4px 8px",fontSize:10,color:C.blue}}>
          <i className="ti ti-layers-intersect"/> Side 2 {j.status==="side2_setup"?"Setup":"Running"} — S1: {fmtHM(lt.setup)} setup / {fmtHM(lt.run)} run / {j.pieces||0} pcs
        </div>
      )}

      {/* actions — active jobs */}
      {j.status!=="done"&&!confirmDelete&&(
        <div style={{display:"flex",gap:4,marginTop:2}}>
          {(j.status==="setup"||j.status==="side2_setup")&&(
            <button style={{...btn("primary",true,true),flex:1,...(isSide2Active?{background:C.blue,borderColor:C.blue}:{})}} onClick={startRun}>
              <i className="ti ti-player-play"/> {isSide2Active?"Start S2 Run":"Start Run"}
            </button>
          )}
          {(j.status==="run"||j.status==="side2_run")&&(
            <button style={{...btn("success",true,true),flex:1,...(isSide2Active?{background:C.blue,borderColor:C.blue}:{})}} onClick={()=>setCompleteId(j.id)}>
              <i className="ti ti-check"/> {isSide2Active?"Complete S2":j.twoSided?"Complete S1":"Complete Job"}
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
          <div style={{fontSize:11,color:C.red,fontWeight:700}}><i className="ti ti-alert-triangle"/> Delete this job?</div>
          <div style={{fontSize:11,color:C.muted}}>All data for this job will be permanently deleted and cannot be recovered.</div>
          <div style={{display:"flex",gap:6}}>
            <button style={{...btn("danger",true,true),flex:1}} onClick={deleteJob}><i className="ti ti-trash"/> Delete</button>
            <button style={{...btn("outline",false,true),flex:1}} onClick={()=>setConfirmDelete(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueCard({name,issue,setMachineIssues,resolveIssue}){
  const [editing,setEditing]=useState(false);
  const [reason,setReason]=useState(issue.reason||"");
  const [status,setStatus]=useState(issue.status);
  const accentColor=issue.status==="down"?C.red:C.amber;
  const save=()=>{
    setMachineIssues(prev=>({...prev,[name]:{...prev[name],status,reason}}));
    setEditing(false);
  };
  return(
    <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
          <div style={{fontSize:10,color:C.muted}}><i className="ti ti-user"/> {issue.reportedBy}</div>
        </div>
        <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:2}} onClick={()=>{setReason(issue.reason||"");setStatus(issue.status);setEditing(e=>!e);}}>
          <i className={`ti ti-${editing?"x":"pencil"}`}/>
        </button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        <span style={badge(issue.status==="down"?"down":"repair")}>{issue.status==="down"?"Down":"Repair"}</span>
        {issue.reason&&!editing&&<span style={{fontSize:10,color:C.muted,alignSelf:"center"}}>{issue.reason}</span>}
      </div>
      {editing&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
          <div>
            <div style={label}>Status</div>
            <select style={sel()} value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="down">Down</option>
              <option value="repair">Needs Repair</option>
            </select>
          </div>
          <div>
            <div style={label}>Reason</div>
            <input style={inp()} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the issue"/>
          </div>
          <button style={btn("primary",true,true)} onClick={save}><i className="ti ti-check"/> Save</button>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Live</div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:C.red,display:"inline-block"}}/>
          <span style={{fontSize:15,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(Math.round((Date.now()-(issue.reportedAt||Date.now()))/1000))}</span>
        </div>
      </div>
      <button style={btn("success",true,true)} onClick={()=>resolveIssue(name)}><i className="ti ti-check"/> Resolve</button>
    </div>
  );
}

function AllJobsTab({jobs,setJobs,setCompleteId,users,machines,machineIssues,setMachineIssues,resolveIssue,saveNow,stateRef}){
  const [statusFilt,setStatusFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const [search,setSearch]=useState("");
  const allMachines=[...new Set(jobs.map(j=>j.machine))].sort();
  const filtered=jobs.filter(j=>
    (statusFilt==="all"||j.status===statusFilt)&&
    (machineFilt==="all"||j.machine===machineFilt)
  );
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
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        {[["all","All"],["setup","Setup"],["run","Running"],["done","Done"]].map(([f,l])=><button key={f} style={tag(statusFilt===f)} onClick={()=>setStatusFilt(f)}>{l}</button>)}
      </div>
      {allMachines.length>0&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <button style={tag(machineFilt==="all")} onClick={()=>setMachineFilt("all")}>All</button>
        {allMachines.map(m=><button key={m} style={tag(machineFilt===m)} onClick={()=>setMachineFilt(m)}>{m}</button>)}
      </div>}
      {Object.keys(machineIssues).length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.red}40`}}>
            <i className="ti ti-alert-triangle"/> Machine Issues · {Object.keys(machineIssues).length}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {Object.entries(machineIssues).map(([name,issue])=>(
              <IssueCard key={name} name={name} issue={issue} setMachineIssues={setMachineIssues} resolveIssue={resolveIssue}/>
            ))}
          </div>
        </div>
      )}
      {!filtered.length&&!Object.keys(machineIssues).length&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12}}>No jobs found.</div>}
      {active.length>0&&(
        <ActiveJobsGrid jobs={active} renderCard={j=>(
          <AdminJobCard key={j.id} j={j} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} saveNow={saveNow} stateRef={stateRef}/>
        )}/>
      )}
      {filtered.filter(j=>j.status==="done").length>0&&(
        <>
          <div style={{paddingTop:4,borderTop:`1px solid ${C.border}`,marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Completed · {done.length}{q&&` of ${filtered.filter(j=>j.status==="done").length}`}</div>
              {q&&<button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0}} onClick={()=>setSearch("")}><i className="ti ti-x"/></button>}
            </div>
            <div style={{position:"relative"}}>
              <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14,pointerEvents:"none"}}/>
              <input
                style={{...inp(),paddingLeft:32,fontSize:13}}
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Search customer, part number, machine, operator…"
              />
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:16}}>
            {done.map(j=>(
              <AdminJobCard key={j.id} j={j} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} saveNow={saveNow} stateRef={stateRef}/>
            ))}
          </div>
        </>
      )}
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
          <thead><tr>{["Job","Machine","Operator","Type","Setup","Run","Deburr","Per Piece","Pcs","Photo","Date"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(j=><tr key={j.id}><td style={td}>{j.job}{j.twoSided&&<span style={{marginLeft:4,fontSize:9,color:C.blue}}><i className="ti ti-layers-intersect"/></span>}</td><td style={td}>{j.machine}</td><td style={td}>{j.operatorName}</td><td style={td}><span style={{...badge(j.quickEntry?"admin":"run"),fontSize:9}}>{j.quickEntry?"Quick":"Timed"}</span></td><td style={{...td,color:C.amber}}>{fmtHM(j.setupSec)}</td><td style={{...td,color:C.green}}>{fmtHM(j.runSec)}</td><td style={{...td,color:C.deburr}}>{j.deburSec>0?fmtHM(j.deburSec):"-"}</td><td style={{...td,color:C.blue}}>{j.pieces>0?fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces)):"-"}</td><td style={td}>{j.pieces}</td><td style={td}>{j.twoSided?<span style={{color:j.photoData&&j.photoData2?C.green:C.red}}>{j.photoData&&j.photoData2?"✓✓":"✗"}</span>:(j.photoData?<span style={{color:C.green}}>✓</span>:<span style={{color:C.red}}>✗</span>)}</td><td style={{...td,color:C.muted,fontSize:10}}>{fmtDate(j.completedAt)}</td></tr>)}</tbody>
        </table></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MACHINE DATA TAB
// ═══════════════════════════════════════════════════════
function MachineDataTab({jobs,machines,downtimeLog,machineIssues}){
  const [selected,setSelected]=useState(null);
  const [search,setSearch]=useState("");

  const allMachineNames=[...new Set([
    ...machines.filter(m=>m.active).map(m=>m.name),
    ...jobs.map(j=>j.machine),
  ])].sort();

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
    const activeDown=activeIssue?Math.round((now-(activeIssue.reportedAt||now))/1000):0;
    const machDef=machines.find(m=>m.name===name);
    const weeklyTargetSec=(machDef?.weeklyTargetHours||0)*3600;
    const weekRunSec=weekJobs.reduce((s,j)=>s+(j.runSec||0),0);
    machStats[name]={
      setupSec:mj.reduce((s,j)=>s+(j.setupSec||0),0),
      runSec:mj.reduce((s,j)=>s+(j.runSec||0),0),
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
              fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,
            }}>
              {hasIssue&&<span style={{width:6,height:6,borderRadius:"50%",background:C.red,display:"inline-block"}}/>}
              {name}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{position:"relative",marginBottom:14}}>
        <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14,pointerEvents:"none"}}/>
        <input style={{...inp(),paddingLeft:32,fontSize:12}} placeholder="Search customer, job #, operator…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:2}}><i className="ti ti-x"/></button>}
      </div>

      {/* Donut + issue history — only when one machine selected */}
      {selStats&&(
        <>
          {/* Stats card */}
          <div style={{...card(),marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{fontSize:13,color:C.text,fontWeight:700}}>{selected}</div>
            <div style={{display:"flex",gap:28,alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center"}}>
              <DonutChart title="Time Breakdown" segments={[
                {label:"Setup",   color:C.amber, value:selStats.setupSec},
                {label:"Run",     color:C.green, value:selStats.runSec},
                {label:"Downtime",color:C.red,   value:selStats.downtimeSec},
              ]}/>
              <div style={{display:"flex",flexDirection:"column",gap:10,justifyContent:"center"}}>
                {[[selStats.totalJobs,"Total Jobs",C.text,"ti-tool"],[selStats.doneJobs,"Completed",C.green,"ti-check"],[selStats.activeJobs,"Active",C.amber,"ti-player-play"]].map(([v,l,c,ic])=>(
                  <div key={l} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <i className={`ti ${ic}`} style={{color:c,fontSize:14,width:16,textAlign:"center"}}/>
                    <span style={{fontSize:22,color:c,fontFamily:"'Share Tech Mono',monospace",fontWeight:700,lineHeight:1}}>{v}</span>
                    <span style={{fontSize:10,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                  </div>
                ))}
                {selStats.weeklyTargetSec>0&&(()=>{
                  const pct=Math.min(100,Math.round(selStats.weekRunSec/selStats.weeklyTargetSec*100));
                  const over=selStats.weekRunSec>=selStats.weeklyTargetSec;
                  const tgtColor=pct>=100?C.green:pct>=60?C.amber:C.red;
                  return(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,minWidth:160}}>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>This Week vs Target</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
                        <span style={{fontSize:16,color:tgtColor,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{fmtHM(selStats.weekRunSec)}</span>
                        <span style={{fontSize:10,color:C.muted}}>of {fmtHM(selStats.weeklyTargetSec)}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:C.raised,overflow:"hidden",marginBottom:4}}>
                        <div style={{height:"100%",width:`${pct}%`,background:tgtColor,borderRadius:4,transition:"width .3s"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:10,color:tgtColor,fontWeight:700}}>{pct}%</span>
                        <span style={{fontSize:10,color:tgtColor}}>{over?"✓ On target":`${fmtHM(selStats.weeklyTargetSec-selStats.weekRunSec)} remaining`}</span>
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
            const liveSec=Math.round((Date.now()-(iss.reportedAt||Date.now()))/1000);
            return(
              <div style={{background:`${C.red}10`,border:`1px solid ${C.red}40`,borderLeft:`3px solid ${C.red}`,borderRadius:8,padding:"10px 12px",marginBottom:12,display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:C.red,display:"inline-block"}}/>
                    <span style={{fontSize:11,color:C.red,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Active Issue · {iss.status==="down"?"Machine Down":"Needs Repair"}</span>
                  </div>
                  <span style={{fontSize:12,color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{fmtDetail(liveSec)}</span>
                </div>
                {iss.reason&&<div style={{fontSize:12,color:C.text,marginTop:2}}>{iss.reason}</div>}
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>Reported by {iss.reportedBy} · {fmtDate(iss.reportedAt)}</div>
              </div>
            );
          })()}

          {/* Issue history for selected machine */}
          {(()=>{
            const history=[...downtimeLog].filter(d=>d.machineName===selected).reverse();
            if(!history.length) return null;
            return(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
                  <i className="ti ti-history"/> Issue History · {history.length}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {history.map(d=>(
                    <div key={d.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.red}40`,borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:3}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{...badge("down"),fontSize:9}}>{d.status==="down"?"Machine Down":"Needs Repair"}</span>
                          {d.reason&&<span style={{fontSize:12,color:C.text}}>{d.reason}</span>}
                        </div>
                        <span style={{fontSize:12,color:C.red,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{fmtHM(d.downtimeSec)}</span>
                      </div>
                      <div style={{fontSize:10,color:C.muted}}>
                        Reported by {d.reportedBy} · {fmtDate(d.reportedAt)}
                      </div>
                      <div style={{fontSize:10,color:C.muted}}>
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
            return(
              <div key={name} onClick={()=>setSelected(name)} style={{
                background:C.surface,borderRadius:10,padding:12,cursor:"pointer",
                border:`1px solid ${hasIssue?C.red:C.border}`,
                borderTop:`3px solid ${hasIssue?C.red:s.activeJobs>0?C.green:C.border}`,
                display:"flex",flexDirection:"column",gap:6,
              }}>
                <div style={{fontSize:13,color:C.text,fontWeight:700}}>{name}</div>
                {hasIssue&&<span style={{...badge("down"),alignSelf:"flex-start"}}>Issue Active</span>}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(s.setupSec)}</span>
                  <span style={{fontSize:10,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(s.runSec)}</span>
                </div>
                {s.downtimeSec>0&&<span style={{fontSize:10,color:C.red}}><i className="ti ti-alert-triangle"/> {fmtHM(s.downtimeSec)} down</span>}
                {hasTgt&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginBottom:3}}>
                      <span>This week</span><span style={{color:tgtColor}}>{pct}%</span>
                    </div>
                    <div style={{height:5,borderRadius:3,background:C.raised,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:tgtColor,borderRadius:3,transition:"width .3s"}}/>
                    </div>
                    <div style={{fontSize:9,color:C.muted,marginTop:3}}>{fmtHM(s.weekRunSec)} of {fmtHM(s.weeklyTargetSec)}</div>
                  </div>
                )}
                <div style={{fontSize:10,color:C.muted}}>{s.totalJobs} jobs · {s.activeJobs} active</div>
                {pastIssues>0&&<div style={{fontSize:10,color:C.muted}}><i className="ti ti-history"/> {pastIssues} past issue{pastIssues!==1?"s":""}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Job list */}
      <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
        {selected?`${selected} — `:"All Machines — "}{listJobs.length} Jobs
      </div>
      {!listJobs.length&&(
        <div style={{textAlign:"center",padding:"30px 16px",color:C.muted,fontSize:12}}>
          <i className="ti ti-search-off" style={{fontSize:28,display:"block",marginBottom:10,opacity:0.3}}/>No jobs found.
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {listJobs.map(j=>(
          <div key={j.id} style={{...card(),display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                {(j.status==="side2_setup"||j.status==="side2_run")
                  ?<span style={{...badge(j.status==="side2_setup"?"setup":"run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> {j.status==="side2_setup"?"S2 Setup":"S2 Run"}</span>
                  :<span style={badge(j.status)}>{j.status==="setup"?"Setup":j.status==="run"?"Running":"Done"}</span>}
                {j.paused&&<span style={badge("down")}>Down</span>}
                {j.logoutPaused&&<span style={badge("")}>Paused</span>}
                {!selected&&<span style={{fontSize:10,color:C.muted,background:C.raised,padding:"2px 7px",borderRadius:10}}>{j.machine}</span>}
              </div>
              {j.customer&&<div style={{fontSize:13,color:C.text,fontWeight:700}}>{j.customer}</div>}
              <div style={{fontSize:11,color:C.muted}}><i className="ti ti-hash"/> {j.job}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}><i className="ti ti-user"/> {j.operatorName}</div>
              {j.twoSided&&j.status==="done"?(
                <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:6}}>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:1}}>S1</span>
                    <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                    <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                    {j.pieces>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces} pcs</span>}
                    {j.pieces>0&&<span style={{fontSize:10,color:C.amber,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:9,color:C.blue,fontWeight:700,letterSpacing:1}}>S2</span>
                    <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec2||0)}</span>
                    <span style={{fontSize:11,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec2||0)}</span>
                    {j.pieces2>0&&<span style={{fontSize:10,color:C.muted}}>{j.pieces2} pcs</span>}
                    {j.pieces2>0&&<span style={{fontSize:10,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/pc</span>}
                  </div>
                  {j.deburSec>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:9,color:C.deburr,fontWeight:700,letterSpacing:1}}>DB</span>
                    <span style={{fontSize:11,color:C.deburr}}><i className="ti ti-tool"/> {fmtHM(j.deburSec)}</span>
                  </div>}
                </div>
              ):(
                <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                  <span style={{fontSize:11,color:j.status==="setup"?C.muted:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                  {j.deburSec>0&&<span style={{fontSize:11,color:C.deburr}}><i className="ti ti-tool"/> {fmtHM(j.deburSec)}</span>}
                  {j.pieces>0&&<span style={{fontSize:11,color:C.blue}}><i className="ti ti-box"/> {j.pieces} pcs</span>}
                  {j.pieces>0&&<span style={{fontSize:11,color:C.muted,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/pc</span>}
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,marginLeft:10,flexShrink:0}}>
              <div style={{display:"flex",gap:4}}>
                {j.photoData&&<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:42,height:42,borderRadius:6,objectFit:"cover",border:j.twoSided?`1px solid ${C.blue}`:undefined}}/>}
                {j.twoSided&&j.photoData2&&<img src={j.photoData2} title="Side 2" style={{width:42,height:42,borderRadius:6,objectFit:"cover",border:`1px solid ${C.blue}`}}/>}
              </div>
              {j.twoSided&&<span style={{fontSize:9,color:C.blue,letterSpacing:1}}><i className="ti ti-layers-intersect"/> 2-SIDED</span>}
              {j.completedAt&&<span style={{fontSize:10,color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(j.completedAt)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════
function ManageTab({users,setUsers,machines,setMachines,workHours,setWorkHours,tools,setTools,toolLog,saveNow}){
  const [view,setView]=useState("operators");
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button style={tag(view==="operators")} onClick={()=>setView("operators")}><i className="ti ti-users"/> Operators</button>
        <button style={tag(view==="machines")}  onClick={()=>setView("machines")} ><i className="ti ti-robot"/> Machines</button>
        <button style={tag(view==="tools")}     onClick={()=>setView("tools")}    ><i className="ti ti-package"/> Tools</button>
        <button style={tag(view==="settings")}  onClick={()=>setView("settings")} ><i className="ti ti-adjustments"/> Settings</button>
      </div>
      {view==="operators"&&<ManageOperators users={users} setUsers={setUsers} machines={machines}/>}
      {view==="machines" &&<ManageMachines  machines={machines} setMachines={setMachines}/>}
      {view==="tools"    &&<ManageTools     tools={tools} setTools={setTools} toolLog={toolLog} saveNow={saveNow} users={users} machines={machines}/>}
      {view==="settings" &&<WorkHoursSettings workHours={workHours} setWorkHours={setWorkHours}/>}
    </div>
  );
}

function WorkHoursSettings({workHours,setWorkHours}){
  const ORDER=["mon","tue","wed","thu","fri","sat","sun"];
  const todayKey=DAYS_KEY[new Date().getDay()];
  const [local,setLocal]=useState(()=>{
    const def={start:"07:00",end:"15:00",enabled:true};
    return ORDER.reduce((acc,d)=>({
      ...acc,
      [d]:workHours[d]||(workHours.start&&!workHours.mon
        ?{start:workHours.start,end:workHours.end,enabled:d!=="sat"&&d!=="sun"}
        :{...def,enabled:d!=="sat"&&d!=="sun"}),
    }),{});
  });
  const [saved,setSaved]=useState(false);
  const setDay=(day,field,val)=>setLocal(prev=>({...prev,[day]:{...prev[day],[field]:val}}));
  const save=()=>{setWorkHours(local);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const todayHours=local[todayKey];
  return(
    <div>
      <div style={{...card(),border:`1px solid ${C.amber}`}}>
        <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}><i className="ti ti-clock"/> Work Hours</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
          Logging out within these hours keeps timers running. Outside these hours (or on days off), timers pause automatically.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
          {ORDER.map(day=>{
            const dh=local[day];
            const isToday=day===todayKey;
            return(
              <div key={day} style={{background:C.raised,borderRadius:8,padding:"8px 10px",border:`1px solid ${isToday?C.amber:C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  {/* Day toggle button */}
                  <button onClick={()=>setDay(day,"enabled",!dh.enabled)} style={{
                    display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,cursor:"pointer",
                    fontFamily:"inherit",fontSize:11,fontWeight:700,letterSpacing:1,
                    border:`1px solid ${dh.enabled?C.green:C.border}`,
                    background:dh.enabled?"rgba(39,174,96,.15)":"transparent",
                    color:dh.enabled?C.green:C.muted,
                    minWidth:120,
                  }}>
                    <i className={`ti ti-${dh.enabled?"check":"x"}`}/>
                    {DAY_NAME[day]}
                    {isToday&&<span style={{color:C.amber,fontWeight:400,marginLeft:2}}>· Today</span>}
                  </button>
                  {dh.enabled?(
                    <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.green,padding:"4px 8px",fontFamily:"inherit",fontSize:14,width:100}}
                        value={dh.start} onChange={e=>setDay(day,"start",e.target.value)}/>
                      <span style={{color:C.muted,fontSize:12}}>—</span>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.amber,padding:"4px 8px",fontFamily:"inherit",fontSize:14,width:100}}
                        value={dh.end} onChange={e=>setDay(day,"end",e.target.value)}/>
                    </div>
                  ):(
                    <span style={{marginLeft:"auto",fontSize:10,color:C.muted,letterSpacing:1}}>Day off — timers always pause</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button style={btn(saved?"success":"primary",true)} onClick={save}>
          {saved?<><i className="ti ti-check"/> Saved!</>:<><i className="ti ti-device-floppy"/> Save Work Hours</>}
        </button>
      </div>
      <div style={{...card(),marginTop:0}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Today ({DAY_NAME[todayKey]})</div>
        {todayHours&&todayHours.enabled
          ?<div style={{fontSize:13,color:C.text}}>
            Timers keep running on logout between <span style={{color:C.green}}>{todayHours.start}</span> and <span style={{color:C.amber}}>{todayHours.end}</span>
          </div>
          :<div style={{fontSize:13,color:C.muted}}>Day off — timers will pause on logout.</div>
        }
      </div>
    </div>
  );
}

function ManageOperators({users,setUsers,machines}){
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [pin,setPin]=useState(""); const [errs,setErrs]=useState({});
  const [editId,setEditId]=useState(null); const [editPin,setEditPin]=useState(""); const [editErr,setEditErr]=useState("");
  const [editDeptId,setEditDeptId]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const [showRemoved,setShowRemoved]=useState(false);
  const operators=users.filter(u=>u.role==="operator"&&!u.removed);
  const removed=users.filter(u=>u.role==="operator"&&u.removed);
  // All unique departments from machines
  const allDepts=[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    const e={};
    if(!name.trim()) e.name="Name required";
    if(!/^\d{4}$/.test(pin)) e.pin="PIN must be exactly 4 digits";
    if(Object.keys(e).length){setErrs(e);return;}
    setUsers(prev=>[...prev,{id:Date.now(),name:name.trim(),pin,role:"operator",active:true,departments:[]}]);
    setName("");setPin("");setErrs({});setAdding(false);
  };
  const toggleDept=(uid,dept)=>{
    setUsers(prev=>prev.map(u=>{
      if(u.id!==uid) return u;
      const depts=u.departments||[];
      const next=depts.includes(dept)?depts.filter(d=>d!==dept):[...depts,dept];
      return{...u,departments:next};
    }));
  };
  const toggle=id=>setUsers(prev=>prev.map(u=>u.id===id?{...u,active:!u.active}:u));
  const savePin=id=>{
    if(!/^\d{4}$/.test(editPin)){setEditErr("Must be 4 digits");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,pin:editPin}:u));
    setEditId(null);setEditPin("");setEditErr("");
  };
  const confirmDelete=id=>{
    // Mark as removed — keeps them in users array so their name stays on historical jobs
    setUsers(prev=>prev.map(u=>u.id===id?{...u,removed:true,active:false}:u));
    setDeleteId(null);
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
        <div key={u.id} style={{...card(),opacity:u.active?1:0.55}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={avatar()}>{initials(u.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,color:C.text,fontWeight:700}}>{u.name}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>PIN: {"●".repeat(4)} &nbsp;·&nbsp; <span style={{color:u.active?C.green:C.red}}>{u.active?"Active":"Inactive"}</span></div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditId(editId===u.id?null:u.id);setEditDeptId(null);setDeleteId(null);setEditPin("");setEditErr("");}}><i className="ti ti-key"/> PIN</button>
              {allDepts.length>0&&<button style={btn("blue",false,true)} onClick={()=>{setEditDeptId(editDeptId===u.id?null:u.id);setEditId(null);setDeleteId(null);}}><i className="ti ti-building-factory"/> Depts</button>}
              <button style={btn(u.active?"danger":"success",false,true)} onClick={()=>toggle(u.id)}>{u.active?"Disable":"Enable"}</button>
              <button style={btn("danger",false,true)} onClick={()=>{setDeleteId(deleteId===u.id?null:u.id);setEditId(null);setEditDeptId(null);}}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {/* Auto-pause — always visible, saves on change */}
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <i className="ti ti-clock" style={{color:u.autoPauseTime?C.amber:C.muted,fontSize:14,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Auto-pause time</div>
              <input
                type="time"
                style={{...inp(),fontSize:16,color:u.autoPauseTime?C.amber:C.text,padding:"8px 10px",width:"auto",minWidth:120}}
                value={u.autoPauseTime||""}
                onChange={e=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:e.target.value}:x))}
              />
            </div>
            {u.autoPauseTime&&(
              <button style={btn("danger",false,true)} onClick={()=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:""}:x))}>
                <i className="ti ti-x"/> Clear
              </button>
            )}
          </div>
          {/* Department badges */}
          {(u.departments||[]).length>0&&editDeptId!==u.id&&(
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
              {(u.departments||[]).map(d=>(
                <span key={d} style={{fontSize:10,color:C.blue,background:"rgba(59,130,246,.12)",padding:"2px 8px",borderRadius:10}}>
                  <i className="ti ti-building-factory"/> {d}
                </span>
              ))}
            </div>
          )}
          {(u.departments||[]).length===0&&editDeptId!==u.id&&allDepts.length>0&&(
            <div style={{marginTop:6,fontSize:10,color:C.muted}}><i className="ti ti-eye"/> Sees all departments</div>
          )}
          {/* Department checkboxes panel */}
          {editDeptId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Departments — {u.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Tick the departments this operator works in. Leave all unticked to show all machines.</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {allDepts.map(d=>{
                  const active=(u.departments||[]).includes(d);
                  return(
                    <button key={d} onClick={()=>toggleDept(u.id,d)} style={{
                      padding:"7px 12px",borderRadius:8,border:`1px solid ${active?C.blue:C.border}`,
                      background:active?"rgba(59,130,246,.18)":"transparent",
                      color:active?C.blue:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:12,
                    }}>
                      {active?<i className="ti ti-checkbox"/>:<i className="ti ti-square"/>} {d}
                    </button>
                  );
                })}
              </div>
              <div style={{marginTop:10}}>
                <button style={btn("outline",false,true)} onClick={()=>setEditDeptId(null)}>Done</button>
              </div>
            </div>
          )}
          {deleteId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}40`,background:`${C.red}08`,borderRadius:8,padding:12}}>
              <div style={{fontSize:12,color:C.text,marginBottom:4,fontWeight:600}}>Remove {u.name}?</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12}}>They will no longer be able to log in. All their past jobs and history will stay saved under their name.</div>
              <div style={{display:"flex",gap:8}}>
                <button style={{...btn("danger",true,true),flex:1}} onClick={()=>confirmDelete(u.id)}><i className="ti ti-trash"/> Yes, Remove</button>
                <button style={btn("outline",false,true)} onClick={()=>setDeleteId(null)}>Cancel</button>
              </div>
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
        </div>
      ))}

      {/* Removed operators — collapsed by default */}
      {removed.length>0&&(
        <div style={{marginTop:16}}>
          <button style={{...tag(showRemoved),width:"100%",justifyContent:"space-between",display:"flex",alignItems:"center"}} onClick={()=>setShowRemoved(s=>!s)}>
            <span><i className="ti ti-user-off"/> Former Employees · {removed.length}</span>
            <i className={`ti ti-chevron-${showRemoved?"up":"down"}`}/>
          </button>
          {showRemoved&&removed.map(u=>(
            <div key={u.id} style={{...card(),opacity:0.5,marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{...avatar(),background:C.raised,color:C.muted}}>{initials(u.name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:C.muted,fontWeight:700}}>{u.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>Removed · history preserved</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageMachines({machines,setMachines}){
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [dept,setDept]=useState(""); const [err,setErr]=useState("");
  const [editTargetId,setEditTargetId]=useState(null); const [editTargetHours,setEditTargetHours]=useState("");
  const [editDeptId,setEditDeptId]=useState(null); const [editDeptVal,setEditDeptVal]=useState("");
  // All unique departments across machines (for datalist suggestions)
  const allDepts=[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    if(!name.trim()){setErr("Name required");return;}
    if(machines.find(m=>m.name.toLowerCase()===name.trim().toLowerCase())){setErr("Machine already exists");return;}
    setMachines(prev=>[...prev,{id:Date.now(),name:name.trim(),department:dept.trim(),active:true,weeklyTargetHours:0}]);
    setName("");setDept("");setErr("");setAdding(false);
  };
  const saveDept=id=>{
    setMachines(prev=>prev.map(m=>m.id===id?{...m,department:editDeptVal.trim()}:m));
    setEditDeptId(null);
  };
  const toggle=id=>setMachines(prev=>prev.map(m=>m.id===id?{...m,active:!m.active}:m));
  const del=id=>{ if(window.confirm("Remove this machine?")) setMachines(prev=>prev.filter(m=>m.id!==id)); };
  const openTarget=m=>{setEditTargetId(m.id);setEditTargetHours(m.weeklyTargetHours?String(m.weeklyTargetHours):"");};
  const saveTarget=id=>{
    const h=parseFloat(editTargetHours)||0;
    setMachines(prev=>prev.map(m=>m.id===id?{...m,weeklyTargetHours:h}:m));
    setEditTargetId(null);
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{machines.filter(m=>m.active).length} active</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Cancel":"Add Machine"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>New Machine</div>
          <div style={{marginBottom:10}}><label style={label}>Machine Name *</label><input style={inp(!!err)} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. CNC Mill #3"/>{err&&<div style={errMsg}>{err}</div>}</div>
          <div style={{marginBottom:12}}>
            <label style={label}>Department</label>
            <input style={inp()} value={dept} onChange={e=>setDept(e.target.value)} placeholder="e.g. Milling" list="dept-suggestions"/>
            <datalist id="dept-suggestions">{allDepts.map(d=><option key={d} value={d}/>)}</datalist>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>Optional — used to restrict which operators see this machine</div>
          </div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-plus"/> Add Machine</button>
        </div>
      )}
      {machines.map(m=>(
        <div key={m.id} style={{...card(),opacity:m.active?1:0.5}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <i className="ti ti-robot" style={{fontSize:18,color:m.active?C.amber:C.muted}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,color:C.text,fontWeight:700}}>{m.name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:10,letterSpacing:1,textTransform:"uppercase",color:m.active?C.green:C.red}}>{m.active?"Active":"Inactive"}</span>
                {m.department&&<span style={{fontSize:10,color:C.blue,background:"rgba(59,130,246,.12)",padding:"1px 7px",borderRadius:10}}><i className="ti ti-building-factory"/> {m.department}</span>}
              </div>
              {m.weeklyTargetHours>0&&editTargetId!==m.id&&(
                <div style={{fontSize:10,color:C.muted,marginTop:2}}><i className="ti ti-target"/> {m.weeklyTargetHours}h / week target</div>
              )}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditDeptId(editDeptId===m.id?null:m.id);setEditDeptVal(m.department||"");setEditTargetId(null);}}><i className="ti ti-building-factory"/> Dept</button>
              <button style={btn("outline",false,true)} onClick={()=>{editTargetId===m.id?setEditTargetId(null):openTarget(m);setEditDeptId(null);}}><i className="ti ti-target"/> Target</button>
              <button style={btn(m.active?"outline":"success",false,true)} onClick={()=>toggle(m.id)}>{m.active?"Disable":"Enable"}</button>
              <button style={btn("danger",false,true)} onClick={()=>del(m.id)}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {editDeptId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Department — {m.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Operators assigned to this department will see this machine. Leave blank to show to everyone.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input style={{...inp(),flex:1}} value={editDeptVal} onChange={e=>setEditDeptVal(e.target.value)} placeholder="e.g. Milling" list="dept-suggestions2"/>
                <datalist id="dept-suggestions2">{allDepts.map(d=><option key={d} value={d}/>)}</datalist>
                <button style={btn("primary",false,false)} onClick={()=>saveDept(m.id)}>Save</button>
                {m.department&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,department:""}:x));setEditDeptId(null);}}>Clear</button>}
              </div>
            </div>
          )}
          {editTargetId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Weekly Run Target — {m.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Total hours this machine should be running per week. Used to track utilisation in the Machines tab.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" min="0" max="168" style={{...inp(),flex:1,fontSize:18,textAlign:"center",color:C.green}} value={editTargetHours} onChange={e=>setEditTargetHours(e.target.value)} placeholder="0"/>
                <div style={{fontSize:12,color:C.muted}}>hours</div>
                <button style={btn("primary",false,false)} onClick={()=>saveTarget(m.id)}>Save</button>
                {m.weeklyTargetHours>0&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,weeklyTargetHours:0}:x));setEditTargetId(null);}}>Clear</button>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TOOLS TAB — operator view
// ═══════════════════════════════════════════════════════
function ToolsTab({user,tools,setTools,toolLog,setToolLog,saveNow}){
  const [search,setSearch]=useState("");
  const [selectedId,setSelectedId]=useState(null);
  const [takeQty,setTakeQty]=useState(1);

  const userDepts=user.departments||[];
  const visible=tools.filter(t=>{
    if(!t.active) return false;
    if(userDepts.length>0&&t.department&&!userDepts.includes(t.department)) return false;
    if(search.trim()){const q=search.trim().toLowerCase();return(t.name||"").toLowerCase().includes(q)||(t.location||"").toLowerCase().includes(q)||(t.articleNumber||"").toLowerCase().includes(q);}
    return true;
  });

  const byLoc={};
  visible.forEach(t=>{const loc=t.location||"Other";if(!byLoc[loc])byLoc[loc]=[];byLoc[loc].push(t);});
  const locs=Object.keys(byLoc).sort();
  const lowCount=visible.filter(t=>t.quantity<=(t.minQuantity||0)).length;
  const selectedTool=selectedId?tools.find(t=>t.id===selectedId):null;

  const doTake=()=>{
    if(!selectedTool) return;
    const qty=parseInt(takeQty)||1;
    if(qty<1||qty>selectedTool.quantity) return;
    const now=Date.now();
    setTools(prev=>prev.map(t=>t.id===selectedTool.id?{...t,quantity:t.quantity-qty}:t));
    setToolLog(prev=>[...prev,{id:now,toolId:selectedTool.id,toolName:selectedTool.name,operatorId:user.id,operatorName:user.name,quantity:qty,action:"take",timestamp:now}]);
    setSelectedId(null);setTakeQty(1);saveNow();
  };
  const closeModal=()=>{setSelectedId(null);setTakeQty(1);};

  return(
    <div style={{padding:"14px 16px"}}>
      {lowCount>0&&(
        <div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:C.red}}>
          <i className="ti ti-alert-triangle"/> {lowCount} tool{lowCount>1?"s":""} running low — notify admin to reorder
        </div>
      )}
      <div style={{position:"relative",marginBottom:14}}>
        <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14,pointerEvents:"none"}}/>
        <input style={{...inp(),paddingLeft:32}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, drawer or article number…"/>
      </div>
      {locs.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:12}}>No tools found.</div>}
      {locs.map(loc=>(
        <div key={loc} style={{marginBottom:22}}>
          <div style={{fontSize:9,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
            <i className="ti ti-box-seam"/> {loc}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {byLoc[loc].map(tool=>{
              const isLow=tool.quantity<=(tool.minQuantity||0);
              const isOut=tool.quantity===0;
              const qColor=isOut?C.red:isLow?C.amber:C.green;
              return(
                <div key={tool.id} onClick={()=>{setSelectedId(tool.id);setTakeQty(1);}}
                  style={{background:C.surface,borderRadius:10,border:`1px solid ${isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
                  <div style={{position:"relative",width:"100%",aspectRatio:"1",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {tool.photoData
                      ?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                      :<i className="ti ti-tool" style={{fontSize:28,color:C.muted,opacity:0.3}}/>}
                    <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:5,padding:"1px 5px",fontSize:11,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.4"}}>{tool.quantity}</div>
                    {isLow&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"2px 0",textAlign:"center",fontSize:7,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:isOut?"rgba(231,76,60,.88)":"rgba(240,165,0,.88)",color:isOut?"#fff":"#1a1a1a"}}>{isOut?"OUT OF STOCK":"LOW STOCK"}</div>}
                  </div>
                  <div style={{padding:"7px 7px 9px"}}>
                    <div style={{fontSize:11,color:C.text,fontWeight:700,lineHeight:1.25,marginBottom:4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
                    {Array.isArray(tool.material)&&tool.material.length>0&&(
                      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                        {tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:8,fontWeight:700,color:m.color,background:m.bg,padding:"1px 4px",borderRadius:3,letterSpacing:.5}}>{code}</span>:null;})}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {selectedTool&&(
        <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"16px 16px 0 0",maxHeight:"88vh",overflowY:"auto",padding:"0 16px 36px"}}>
            <div style={{position:"sticky",top:0,background:C.surface,paddingTop:14,paddingBottom:6,zIndex:1}}>
              <div style={{width:36,height:4,background:C.raised,borderRadius:2,margin:"0 auto"}}/>
            </div>
            {selectedTool.photoData&&<img src={selectedTool.photoData} style={{width:"100%",maxHeight:200,objectFit:"contain",borderRadius:10,background:C.raised,marginBottom:14,border:`1px solid ${C.border}`,display:"block"}}/>}
            <div style={{fontSize:18,color:C.text,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{selectedTool.name}</div>
            {selectedTool.articleNumber&&<div style={{fontSize:11,color:C.muted,marginBottom:10}}>{selectedTool.articleNumber}</div>}
            {Array.isArray(selectedTool.material)&&selectedTool.material.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:8,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Material</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedTool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${m.color}`,background:m.bg,fontSize:11,fontWeight:700,color:m.color}}>{code} <span style={{fontWeight:400,fontSize:9}}>{m.name}</span></span>:null;})}
                </div>
              </div>
            )}
            {selectedTool.description&&<div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.55}}>{selectedTool.description}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {selectedTool.location&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Location</div><div style={{fontSize:12,color:C.text,fontWeight:600}}>{selectedTool.location}</div></div>}
              <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>In Stock</div><div style={{fontSize:18,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:10,fontWeight:400,color:C.muted}}> pcs</span></div></div>
              {selectedTool.recommendedSpeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Speed</div><div style={{fontSize:12,color:C.text}}>{selectedTool.recommendedSpeed}</div></div>}
              {selectedTool.recommendedFeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Feed</div><div style={{fontSize:12,color:C.text}}>{selectedTool.recommendedFeed}</div></div>}
              {selectedTool.supplier&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Supplier</div><div style={{fontSize:12,color:C.text}}>{selectedTool.supplier}</div></div>}
            </div>
            {selectedTool.quantity>0?(
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>How many are you taking?</div>
                <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"center",marginBottom:14}}>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:20}} onClick={()=>setTakeQty(q=>Math.max(1,q-1))}>−</button>
                  <div style={{fontSize:36,color:C.amber,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",minWidth:60,textAlign:"center"}}>{takeQty}</div>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:20}} onClick={()=>setTakeQty(q=>Math.min(selectedTool.quantity,q+1))}>+</button>
                </div>
                <button style={btn("primary",true)} onClick={doTake}><i className="ti ti-minus"/> Take {takeQty} {takeQty===1?"piece":"pieces"}</button>
              </div>
            ):<div style={{...badge("down"),textAlign:"center",padding:"10px",fontSize:11,display:"block"}}>OUT OF STOCK — contact admin to restock</div>}
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TOOLS — admin view
// ═══════════════════════════════════════════════════════
function ManageTools({tools,setTools,toolLog,saveNow,users,machines}){
  const [subview,setSubview]=useState("list");
  const [editId,setEditId]=useState(null);
  const [restockId,setRestockId]=useState(null);
  const [restockQty,setRestockQty]=useState("");
  const [selectedId,setSelectedId]=useState(null);
  const blank={name:"",department:"",location:"",quantity:"",minQuantity:"",description:"",material:[],recommendedSpeed:"",recommendedFeed:"",supplier:"",articleNumber:"",photoData:null};
  const [form,setForm]=useState(blank);
  const [errs,setErrs]=useState({});
  const photoRef=useRef();

  const allDepts=[...new Set([...(users||[]).map(u=>u.departments||[]).flat(),...(machines||[]).map(m=>m.department).filter(Boolean)])].sort();

  const openAdd=()=>{setForm(blank);setEditId(null);setErrs({});setSubview("form");};
  const openEdit=t=>{
    setForm({...blank,...t,quantity:String(t.quantity),minQuantity:String(t.minQuantity||0),
      material:Array.isArray(t.material)?t.material:[],
      photoData:t.photoData||null,
    });
    setEditId(t.id);setErrs({});setSubview("form");
  };

  const save=()=>{
    const e={};
    if(!form.name.trim()) e.name="Required";
    if(!form.location.trim()) e.location="Required";
    if(form.quantity===""||isNaN(parseInt(form.quantity))) e.quantity="Required";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    if(editId){
      setTools(prev=>prev.map(t=>t.id===editId?{...t,...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0}:t));
    } else {
      setTools(prev=>[...prev,{id:now,...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0,active:true}]);
    }
    setSubview("list");saveNow&&saveNow();
  };

  const doRestock=tool=>{
    const qty=parseInt(restockQty)||0;
    if(qty<1) return;
    setTools(prev=>prev.map(t=>t.id===tool.id?{...t,quantity:t.quantity+qty}:t));
    setRestockId(null);setRestockQty("");
    saveNow&&saveNow();
  };

  const fi=k=>({...inp(errs[k])});

  if(subview==="form") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Back
      </button>
      <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editId?"Edit Tool":"Add New Tool"}</div>
      {[["name","Tool Name *","e.g. CNMG 120408 Insert"],["articleNumber","Article / Order Number","e.g. 979002-SG11M"],["supplier","Supplier","e.g. Hoffmann Group"]].map(([k,lbl,ph])=>(
        <div key={k} style={{marginBottom:10}}>
          <label style={label}>{lbl}</label>
          <input style={fi(k)} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}/>
          {errs[k]&&<div style={errMsg}>{errs[k]}</div>}
        </div>
      ))}
      <div style={{marginBottom:10}}>
        <label style={label}>Department</label>
        <input style={fi("department")} value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))} placeholder="e.g. Turning" list="tool-dept-list"/>
        <datalist id="tool-dept-list">{allDepts.map(d=><option key={d} value={d}/>)}</datalist>
        <div style={{fontSize:10,color:C.muted,marginTop:4}}>Leave blank to show to all operators</div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Drawer / Location *</label>
        <input style={fi("location")} value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="e.g. Drawer A3"/>
        {errs.location&&<div style={errMsg}>{errs.location}</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Current Stock (pcs) *</label>
          <input type="number" min="0" style={{...fi("quantity"),textAlign:"center",fontSize:18,color:C.amber}} value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} placeholder="0"/>
          {errs.quantity&&<div style={errMsg}>{errs.quantity}</div>}
        </div>
        <div>
          <label style={label}>Reorder Below (pcs)</label>
          <input type="number" min="0" style={{...fi("minQuantity"),textAlign:"center",fontSize:18,color:C.red}} value={form.minQuantity} onChange={e=>setForm(p=>({...p,minQuantity:e.target.value}))} placeholder="0"/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Description</label>
        <input style={fi("description")} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="e.g. Negative turning insert for steel and stainless"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Recommended Speed</label>
          <input style={fi("recommendedSpeed")} value={form.recommendedSpeed} onChange={e=>setForm(p=>({...p,recommendedSpeed:e.target.value}))} placeholder="e.g. 250–350 m/min"/>
        </div>
        <div>
          <label style={label}>Recommended Feed</label>
          <input style={fi("recommendedFeed")} value={form.recommendedFeed} onChange={e=>setForm(p=>({...p,recommendedFeed:e.target.value}))} placeholder="e.g. 0.2–0.4 mm/rev"/>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Material Compatibility (ISO groups)</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
          {ISO_MAT.map(m=>{
            const on=(form.material||[]).includes(m.code);
            return(
              <button key={m.code} type="button"
                onClick={()=>setForm(p=>{const ms=p.material||[];return{...p,material:on?ms.filter(x=>x!==m.code):[...ms,m.code]};})}
                style={{padding:"8px 14px",borderRadius:10,border:`2px solid ${on?m.color:"rgba(255,255,255,.1)"}`,background:on?m.bg:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all .15s",textAlign:"center",minWidth:58}}>
                <div style={{fontSize:16,fontWeight:700,color:on?m.color:C.muted,letterSpacing:1}}>{m.code}</div>
                <div style={{fontSize:8,color:on?m.color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{m.name}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Tool Photo</label>
        <div style={{border:`2px dashed ${form.photoData?"rgba(39,174,96,.4)":"rgba(255,255,255,.12)"}`,borderRadius:8,padding:form.photoData?12:22,textAlign:"center",cursor:"pointer",background:form.photoData?"rgba(39,174,96,.05)":"transparent",transition:"all .2s"}}
          onClick={()=>photoRef.current.click()}>
          {form.photoData
            ?<><img src={form.photoData} style={{maxHeight:130,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/><div style={{fontSize:11,color:C.green,letterSpacing:1}}>Photo attached — tap to replace</div></>
            :<><i className="ti ti-camera" style={{fontSize:30,opacity:0.3,display:"block",marginBottom:8}}/><div style={{fontSize:12,color:C.muted}}>Tap to add a photo of the tool</div></>}
        </div>
        <input type="file" ref={photoRef} accept="image/*" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setForm(p=>({...p,photoData:ev.target.result}));r.readAsDataURL(f);}}/>
        {form.photoData&&<button style={{...btn("danger",false,true),marginTop:6,fontSize:9}} onClick={()=>setForm(p=>({...p,photoData:null}))}>
          <i className="ti ti-x"/> Remove photo
        </button>}
      </div>
      <button style={btn("success",true)} onClick={save}><i className="ti ti-check"/> {editId?"Save Changes":"Add Tool"}</button>
    </div>
  );

  if(subview==="log") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Back
      </button>
      <div style={{fontSize:10,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}><i className="ti ti-history"/> Tool Usage Log</div>
      {(toolLog||[]).length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:12}}>No usage recorded yet.</div>}
      {[...(toolLog||[])].reverse().map(e=>(
        <div key={e.id} style={{...card(),marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className={`ti ti-${e.action==="restock"?"package-import":"minus"}`} style={{fontSize:14,color:e.action==="restock"?C.green:C.amber}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.toolName}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{e.operatorName} · {fmtDate(e.timestamp)}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:14,fontWeight:700,color:e.action==="restock"?C.green:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{e.action==="restock"?"+":"-"}{e.quantity}</div>
            <div style={{fontSize:9,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{e.action}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const lowTools=tools.filter(t=>t.active&&t.quantity<=(t.minQuantity||0));
  const selectedTool=selectedId?tools.find(t=>t.id===selectedId):null;
  const closeModal=()=>{setSelectedId(null);setRestockId(null);setRestockQty("");};

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button style={btn("primary",false,true)} onClick={openAdd}><i className="ti ti-plus"/> Add Tool</button>
        <button style={btn("outline",false,true)} onClick={()=>setSubview("log")}><i className="ti ti-history"/> Usage Log</button>
      </div>
      {lowTools.length>0&&(
        <div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:10,color:C.red,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}><i className="ti ti-alert-triangle"/> Needs Reordering</div>
          {lowTools.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{flex:1,fontSize:12,color:C.text}}>{t.name}</div>
              <div style={{fontSize:12,color:C.red,fontFamily:"'Share Tech Mono',monospace",fontWeight:700}}>{t.quantity} left</div>
              {t.articleNumber&&<div style={{fontSize:10,color:C.muted}}>{t.articleNumber}</div>}
            </div>
          ))}
        </div>
      )}
      {tools.length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:12}}>No tools yet. Use Add Tool to get started.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {tools.map(tool=>{
          const isLow=tool.active&&tool.quantity<=(tool.minQuantity||0);
          const isOut=tool.quantity===0;
          const qColor=isOut?C.red:isLow?C.amber:C.green;
          return(
            <div key={tool.id} onClick={()=>setSelectedId(tool.id)}
              style={{background:C.surface,borderRadius:10,border:`1px solid ${isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer",opacity:tool.active?1:0.45}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"1",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {tool.photoData
                  ?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  :<i className="ti ti-tool" style={{fontSize:28,color:C.muted,opacity:0.3}}/>}
                <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:5,padding:"1px 5px",fontSize:11,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.4"}}>{tool.quantity}</div>
                {!tool.active&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-eye-off" style={{fontSize:18,color:"rgba(255,255,255,.6)"}}/></div>}
                {tool.active&&isLow&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"2px 0",textAlign:"center",fontSize:7,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:isOut?"rgba(231,76,60,.88)":"rgba(240,165,0,.88)",color:isOut?"#fff":"#1a1a1a"}}>{isOut?"OUT OF STOCK":"LOW STOCK"}</div>}
              </div>
              <div style={{padding:"7px 7px 9px"}}>
                <div style={{fontSize:11,color:C.text,fontWeight:700,lineHeight:1.25,marginBottom:4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
                {Array.isArray(tool.material)&&tool.material.length>0&&(
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:8,fontWeight:700,color:m.color,background:m.bg,padding:"1px 4px",borderRadius:3,letterSpacing:.5}}>{code}</span>:null;})}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTool&&(
        <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"16px 16px 0 0",maxHeight:"90vh",overflowY:"auto",padding:"0 16px 36px"}}>
            <div style={{position:"sticky",top:0,background:C.surface,paddingTop:14,paddingBottom:6,zIndex:1}}>
              <div style={{width:36,height:4,background:C.raised,borderRadius:2,margin:"0 auto"}}/>
            </div>
            {selectedTool.photoData&&<img src={selectedTool.photoData} style={{width:"100%",maxHeight:180,objectFit:"contain",borderRadius:10,background:C.raised,marginBottom:14,border:`1px solid ${C.border}`,display:"block"}}/>}
            <div style={{fontSize:18,color:C.text,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{selectedTool.name}</div>
            {selectedTool.articleNumber&&<div style={{fontSize:11,color:C.muted,marginBottom:6}}>{selectedTool.articleNumber}</div>}
            {!selectedTool.active&&<div style={{...badge("down"),display:"inline-flex",marginBottom:8,fontSize:9}}>HIDDEN FROM OPERATORS</div>}
            {Array.isArray(selectedTool.material)&&selectedTool.material.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:8,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Material</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedTool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${m.color}`,background:m.bg,fontSize:11,fontWeight:700,color:m.color}}>{code} <span style={{fontWeight:400,fontSize:9}}>{m.name}</span></span>:null;})}
                </div>
              </div>
            )}
            {selectedTool.description&&<div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.55}}>{selectedTool.description}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {selectedTool.location&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Location</div><div style={{fontSize:12,color:C.text,fontWeight:600}}>{selectedTool.location}</div></div>}
              {selectedTool.department&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Department</div><div style={{fontSize:12,color:C.blue}}>{selectedTool.department}</div></div>}
              <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>In Stock</div><div style={{fontSize:18,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:10,fontWeight:400,color:C.muted}}> pcs</span></div></div>
              <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Reorder Below</div><div style={{fontSize:14,fontWeight:700,color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.minQuantity||0}<span style={{fontSize:10,fontWeight:400,color:C.muted}}> pcs</span></div></div>
              {selectedTool.recommendedSpeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Speed</div><div style={{fontSize:12,color:C.text}}>{selectedTool.recommendedSpeed}</div></div>}
              {selectedTool.recommendedFeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Feed</div><div style={{fontSize:12,color:C.text}}>{selectedTool.recommendedFeed}</div></div>}
              {selectedTool.supplier&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:8,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Supplier</div><div style={{fontSize:12,color:C.text}}>{selectedTool.supplier}</div></div>}
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
              {restockId===selectedTool.id?(
                <div>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>How many pieces to add?</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <input type="number" min="1" style={{...inp(),flex:1,fontSize:18,textAlign:"center",color:C.green}} value={restockQty} onChange={e=>setRestockQty(e.target.value)} placeholder="0"/>
                    <button style={btn("success",false,false)} onClick={()=>doRestock(selectedTool)}><i className="ti ti-check"/> Add</button>
                    <button style={btn("outline",false,true)} onClick={()=>{setRestockId(null);setRestockQty("");}}>Cancel</button>
                  </div>
                </div>
              ):<button style={btn("success",true)} onClick={()=>{setRestockId(selectedTool.id);setRestockQty("");}}><i className="ti ti-package-import"/> Restock</button>}
              <button style={btn("outline",true)} onClick={()=>{closeModal();openEdit(selectedTool);}}><i className="ti ti-edit"/> Edit Tool</button>
              <button style={btn(selectedTool.active?"danger":"outline",true)} onClick={()=>{setTools(prev=>prev.map(t=>t.id===selectedTool.id?{...t,active:!t.active}:t));closeModal();saveNow&&saveNow();}}>
                <i className={`ti ti-${selectedTool.active?"eye-off":"eye"}`}/> {selectedTool.active?"Hide from Operators":"Make Visible"}
              </button>
            </div>
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
