import { useState, useEffect, useRef, useMemo } from "react";

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
  return h>0?`${h}t ${m}m`:`${m}m`;
}
function fmtDetail(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${h}t ${m}m ${sc}s`:`${m}m ${sc}s`;
}
function fmtDate(ts){
  return new Date(ts).toLocaleString("da-DK",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function toDateInput(ts){ const d=new Date(ts); return isNaN(d)?"":d.toISOString().slice(0,10); }
// Saved times for a job, both sides together (two-sided jobs keep side 2 in setupSec2/runSec2)
function jRunAll(j){ return (j.runSec||0)+(j.runSec2||0); }
function jSetupAll(j){ return (j.setupSec||0)+(j.setupSec2||0); }
// Tool log actions as shown on screen
const TOOL_ACTION_NAME={take:"Taget",checkout:"Lånt",return:"Afleveret","return-regrinded":"Afleveret omslebet","return-needs-regrind":"Afleveret — skal omslibes","return-damaged":"Afleveret beskadiget",restock:"Fyldt op"};
// Role as shown on screen (stored as "admin" / "operator")
function roleName(r){ return r==="admin"?"Admin":"Operatør"; }
function initials(n){ return n.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase(); }
function liveTime(j){
  const now=Date.now();
  const ts=j.phaseStartedAt;
  const active=ts&&!j.paused&&!j.logoutPaused&&!j.operatorPaused;
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
const DAY_NAME={sun:"Søndag",mon:"Mandag",tue:"Tirsdag",wed:"Onsdag",thu:"Torsdag",fri:"Fredag",sat:"Lørdag"};
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
// Returns total available work seconds between two timestamps, based on work hours settings
function calcAvailableWorkSec(wh,fromMs,toMs){
  if(!wh||toMs<=fromMs) return 0;
  let total=0;
  const cur=new Date(fromMs); cur.setHours(0,0,0,0);
  const end=new Date(toMs);
  while(cur<=end){
    const dk=DAYS_KEY[cur.getDay()];
    const dh=wh[dk]||(wh.start?{start:wh.start,end:wh.end,enabled:true}:null);
    if(dh&&dh.enabled&&dh.start&&dh.end){
      const [sh,sm]=dh.start.split(":").map(Number);
      const [eh,em]=dh.end.split(":").map(Number);
      const dayStart=new Date(cur); dayStart.setHours(sh,sm,0,0);
      const dayEnd=new Date(cur); dayEnd.setHours(eh,em,0,0);
      const s=Math.max(dayStart.getTime(),fromMs);
      const e=Math.min(dayEnd.getTime(),toMs);
      if(e>s) total+=(e-s)/1000;
    }
    cur.setDate(cur.getDate()+1);
  }
  return total;
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
  {code:"P",name:"Stål",         color:"#3b82f6",bg:"rgba(59,130,246,.18)"},
  {code:"M",name:"Rustfrit",     color:"#f0a500",bg:"rgba(240,165,0,.18)"},
  {code:"K",name:"Støbejern",     color:"#e74c3c",bg:"rgba(231,76,60,.18)"},
  {code:"N",name:"Ikke-jern",   color:"#27ae60",bg:"rgba(39,174,96,.18)"},
  {code:"S",name:"Superlegeringer",  color:"#e67e22",bg:"rgba(230,126,34,.18)"},
  {code:"H",name:"Hærdet",      color:"#8b5cf6",bg:"rgba(139,92,246,.18)"},
];
const DRAWER_ROWS=["A","B","C","D","E","F"];
const DRAWER_COLS=[1,2,3,4,5,6,7];

// Tablet-friendly defaults for things inline styles can't reach
if(typeof document!=="undefined"&&!document.getElementById("st-global")){
  const st=document.createElement("style");st.id="st-global";
  st.textContent=`
    button,input,select,textarea,label{touch-action:manipulation}
    input[type=checkbox]{width:24px;height:24px;accent-color:${"#f0a500"};flex-shrink:0}
    input[type=date],input[type=time],input[type=datetime-local]{min-height:44px}
    select option{font-size:16px}
    html{-webkit-text-size-adjust:100%}
  `;
  document.head.appendChild(st);
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const card  =(accent)=>({background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:10,borderLeft:accent?`4px solid ${accent}`:`1px solid ${C.border}`});
const inp   =(err)=>({width:"100%",padding:"14px 14px",minHeight:50,background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:16,boxSizing:"border-box"});
const sel   =(err)=>({width:"100%",padding:"14px 14px",minHeight:50,background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:16,boxSizing:"border-box",WebkitAppearance:"none"});
const btn   =(v,full,sm)=>({width:full?"100%":"auto",padding:sm?"10px 14px":"14px 18px",minHeight:sm?44:50,border:v==="outline"?`1px solid ${C.border}`:"none",borderRadius:8,fontFamily:"inherit",fontSize:sm?13:15,letterSpacing:sm?1:1.5,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,textTransform:"uppercase",cursor:"pointer",fontWeight:700,
  background:v==="primary"?C.amber:v==="success"?C.green:v==="danger"?C.red:v==="blue"?C.blue:v==="outline"?"transparent":C.raised,
  color:(v==="primary"||v==="success"||v==="blue")?"#1a1a1a":v==="danger"?"white":C.muted});
const navBtn=(a)=>({flex:"0 0 auto",padding:"12px 16px",minHeight:48,border:"none",borderRadius:8,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:14,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",fontWeight:a?700:400});
const badge =(s)=>({fontSize:13,letterSpacing:1,padding:"4px 10px",borderRadius:20,textTransform:"uppercase",
  background:s==="setup"?"rgba(240,165,0,.15)":s==="run"?"rgba(39,174,96,.15)":s==="admin"?"rgba(59,130,246,.15)":s==="down"?"rgba(231,76,60,.15)":s==="repair"?"rgba(240,165,0,.15)":"rgba(138,155,181,.1)",
  color:s==="setup"?C.amber:s==="run"?C.green:s==="admin"?C.blue:s==="down"?C.red:s==="repair"?C.amber:C.muted});
const statBox={background:C.raised,borderRadius:8,padding:"12px 14px",textAlign:"center",border:`1px solid rgba(255,255,255,.05)`};
const tag   =(a)=>({display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",minHeight:40,borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:13,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"});
const avatar=(bg)=>({width:44,height:44,borderRadius:"50%",background:bg||C.raised,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:C.amber,fontWeight:700,flexShrink:0,border:`1px solid rgba(255,255,255,.1)`});
const label ={display:"block",fontSize:13,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginBottom:6};
const errMsg={fontSize:14,color:C.red,letterSpacing:1,marginTop:6};
const meta  ={display:"flex",flexWrap:"wrap",gap:12,fontSize:14,color:C.muted,marginTop:6};
const th    ={textAlign:"left",padding:"10px 10px",borderBottom:`1px solid rgba(255,255,255,.08)`,color:C.muted,fontSize:13,letterSpacing:2,textTransform:"uppercase"};
const td    ={padding:"10px 10px",fontSize:15,borderBottom:`1px solid rgba(255,255,255,.04)`,color:C.text,verticalAlign:"middle"};

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

// Every tool change goes to the server as an operation, applied there one at a time
// (tools are not part of the regular 3 s save). The caller also updates local state
// so the screen changes at once; the next poll brings the server's result.
// op: {type:"add",tool} | {type:"delete",toolId} | {type:"update",toolId,set,inc,checkout,returnBy} + optional log
function sendToolOp(op){
  return fetch("/api/tool-op",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(op)}).catch(()=>{});
}

// Shrink a photo before it's stored — phone camera shots are several MB
function resizeImage(dataUrl,maxW=1200,maxH=900){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
      const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg",0.82));
    };
    img.onerror=()=>res(dataUrl);
    img.src=dataUrl;
  });
}

// Server owns machine issues and their downtimeSec. Keep a just-reported local issue
// until the server has it, keep a local edit until it's saved, and don't bring back
// an issue this tablet just resolved (its entry is already in the local downtimeLog).
function mergeIssues(local,server,localLog){
  const resolved=new Set((localLog||[]).map(d=>`${d.machineName}|${d.reportedAt}`));
  const merged={};
  Object.entries(server||{}).forEach(([k,sv])=>{
    if(resolved.has(`${k}|${sv.reportedAt}`)) return;
    const lv=local[k];
    merged[k]=lv&&lv.reportedAt===sv.reportedAt&&(lv.updatedAt||0)>(sv.updatedAt||0)?{...lv,downtimeSec:sv.downtimeSec}:sv;
  });
  Object.entries(local||{}).forEach(([k,lv])=>{
    if(!merged[k]&&!resolved.has(`${k}|${lv.reportedAt}`)&&Date.now()-(lv.reportedAt||0)<30000) merged[k]=lv;
  });
  return merged;
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
function exportCSV(rows,from,to){
  if(!rows.length){alert("Ingen job matcher de valgte filtre.");return;}
  const cols=[["Kunde","Tegningsnr.","Maskine","Operatør","Operation","Type","To sider","Afsluttet","S1 opstilling (min)","S1 produktion (min)","S2 opstilling (min)","S2 produktion (min)","I alt (min)","S1 stk.","S2 stk.","Foto S1","Foto S2"]];
  rows.forEach(j=>{
    const s1Setup=(j.setupSec/60).toFixed(1);
    const s1Run=(j.runSec/60).toFixed(1);
    const s2Setup=j.twoSided?((j.setupSec2||0)/60).toFixed(1):"N/A";
    const s2Run=j.twoSided?((j.runSec2||0)/60).toFixed(1):"N/A";
    const total=((j.setupSec+j.runSec+(j.setupSec2||0)+(j.runSec2||0))/60).toFixed(1);
    const s1Pcs=j.pieces||0;
    const s2Pcs=j.twoSided?(j.pieces2||0):"N/A";
    cols.push([j.customer||"",j.job,j.machine,j.operatorName,j.op||"",j.quickEntry?"Hurtig registrering":"Tidtaget",j.twoSided?"Ja":"Nej",fmtDate(j.completedAt),s1Setup,s1Run,s2Setup,s2Run,total,s1Pcs,s2Pcs,j.photoData?"Ja":"Nej",j.twoSided?(j.photoData2?"Ja":"Mangler"):"N/A"]);
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
  const [focusToolId,setFocusToolId]=useState(null);
  const [focusSheetId,setFocusSheetId]=useState(null);
  const [newSheetFor,setNewSheetFor]=useState(null); // {partNumber,machine,customer} — open a new sheet for this
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
  const [cabinets,   setCabinets]      =useState([]);
  const [departments,setDepartments]   =useState([]);
  const [setupSheets,setSetupSheets]   =useState([]);
  const DEFAULT_DEPT_PARAMS={
    "Turning":["Chuck Name","Chuck Overhang","Clamping Pressure","Zero Point","Workpiece Stop","Spindle Speed","Feed Rate","Coolant Pressure","Tool Offset","Bar Diameter","Chuck Jaw","RPM","Cutting Speed","DOC"],
    "Affolter":["Modul","Fræser nummer","Fræser diameter","Cycle tid","Måleprogram","Opspændningsværktøj top","Opspændningsværktøj bund","Griber 1","Griber 2","Emnegriber","Skinne"],
  };
  const DEFAULT_SUB_DEPTS={"Fortanding":["Affolter","MZ","150"]};
  const [setupDeptParams,setSetupDeptParams]=useState(DEFAULT_DEPT_PARAMS);
  const [subDepartments,setSubDepartments]=useState(DEFAULT_SUB_DEPTS);
  const [efficiencyGoals,setEfficiencyGoals]=useState({overall:80,week:75,month:78,machines:{},departments:{},hiddenMachines:[]});
  const [planOrders,setPlanOrders]=useState([]);
  const [planSettings,setPlanSettings]=useState({deptOrder:[],groupSameParts:false});

  // New version on the server? The first /api/data response tells us which build
  // this page is; a different X-App-Version later means the server was updated.
  const appVersionRef=useRef(null);
  const [updateReady,setUpdateReady]=useState(false);
  const checkVersion=r=>{
    const v=r.headers.get("X-App-Version");
    if(!v) return;
    if(!appVersionRef.current) appVersionRef.current=v;
    else if(v!==appVersionRef.current) setUpdateReady(true);
  };

  // ── Load state from server on startup ─────────────────────
  useEffect(()=>{
    fetch("/api/data")
      .then(r=>{checkVersion(r);return r.json();})
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
          if(data.cabinets)     setCabinets(data.cabinets);
          if(data.departments)  setDepartments(data.departments);
          if(data.setupSheets)       setSetupSheets(data.setupSheets);
          if(data.setupDeptParams){
            const dp=data.setupDeptParams;
            // Migrate old "Fortanding" key → "Affolter"
            if(dp["Fortanding"]&&!dp["Affolter"]){dp["Affolter"]=dp["Fortanding"];delete dp["Fortanding"];}
            // Migrate old "Affolter 160" key → "Affolter"
            if(dp["Affolter 160"]&&!dp["Affolter"]){dp["Affolter"]=dp["Affolter 160"];delete dp["Affolter 160"];}
            setSetupDeptParams(dp);
          } else if(data.setupParamOptions) setSetupDeptParams(p=>({...p,Turning:data.setupParamOptions}));
          if(data.subDepartments){
            // Migrate "Affolter 160" → "Affolter" in sub-dept lists
            const sd=data.subDepartments;
            Object.keys(sd).forEach(k=>{sd[k]=sd[k].map(v=>v==="Affolter 160"?"Affolter":v);});
            // Ensure MZ is always in Fortanding sub-depts
            if(sd["Fortanding"]&&!sd["Fortanding"].includes("MZ")) sd["Fortanding"].push("MZ");
            if(sd["Fortanding"]&&!sd["Fortanding"].includes("150")) sd["Fortanding"].push("150");
            setSubDepartments(sd);
          }
          if(data.efficiencyGoals) setEfficiencyGoals(data.efficiencyGoals);
          if(data.planOrders) setPlanOrders(data.planOrders);
          if(data.planSettings) setPlanSettings(data.planSettings);
          if(data.settingsVersion) settingsVersionRef.current=data.settingsVersion;
          // Seed lastServerRef so the first poll doesn't overwrite local edits
          lastServerRef.current={
            workHours:data.workHours,
            users:data.users,
            machines:data.machines,
            downtimeLog:data.downtimeLog,
            tools:data.tools,
            toolLog:data.toolLog,
            cabinets:data.cabinets,
            departments:data.departments,
            setupSheets:data.setupSheets,
            setupDeptParams:data.setupDeptParams,
            subDepartments:data.subDepartments,
            efficiencyGoals:data.efficiencyGoals,
            planOrders:data.planOrders,
            planSettings:data.planSettings,
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
  const settingsVersionRef=useRef(0);   // bumped whenever settings change locally
  const prevSettingsHashRef=useRef(''); // tracks last-saved settings hash
  const lastSavedHashRef=useRef('');    // hash of what we last successfully sent — skip identical saves
  const [serverOnline,setServerOnline]=useState(true);
  useEffect(()=>{
    stateRef.current={jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings};
  },[jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings]);

  // Save to server every 3 seconds — only when data has changed, with retry on failure
  useEffect(()=>{
    const t=setInterval(()=>{
      if(!dataLoadedRef.current) return;
      const state=stateRef.current;
      const hash=JSON.stringify([state.jobs,settingsVersionRef.current]);
      if(hash===lastSavedHashRef.current) return; // nothing changed — skip
      fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...state,settingsVersion:settingsVersionRef.current})})
        .then(r=>{if(r.ok){lastSavedHashRef.current=hash;setServerOnline(true);}else setServerOnline(false);})
        .catch(()=>setServerOnline(false)); // will retry next tick
    },3000);
    return()=>clearInterval(t);
  },[]);

  // Poll server every 5 seconds — merge carefully so local timers aren't overwritten
  // For settings (workHours/users/machines): only update if SERVER changed them,
  // so a local edit isn't overwritten before the 3 s save fires.
  useEffect(()=>{
    const t=setInterval(()=>{
      fetch("/api/data").then(r=>{checkVersion(r);return r.json();}).then(data=>{
        setServerOnline(true);
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
            // Local is newer (unsaved change in flight) — keep it to avoid flicker
            if((lj.lastModifiedAt||0)>(sj.lastModifiedAt||0)) return lj;
            return sj;
          });
          return [...localOnly,...merged];
        });
        if(data.machineIssues) setMachineIssues(local=>mergeIssues(local,data.machineIssues,stateRef.current.downtimeLog));
        if(data.efficiencyGoals&&JSON.stringify(data.efficiencyGoals)!==JSON.stringify(last.efficiencyGoals)) setEfficiencyGoals(data.efficiencyGoals);
        if(data.planSettings&&JSON.stringify(data.planSettings)!==JSON.stringify(last.planSettings)) setPlanSettings(data.planSettings);
        // Planning orders are never removed (deleted:true), so merge by id, newest edit wins
        if(data.planOrders&&JSON.stringify(data.planOrders)!==JSON.stringify(last.planOrders)) setPlanOrders(local=>{
          const m=new Map(local.map(o=>[o.id,o]));
          data.planOrders.forEach(o=>{const l=m.get(o.id);if(!l||(o.updatedAt||0)>=(l.updatedAt||0))m.set(o.id,o);});
          return [...m.values()];
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
        if(data.cabinets   &&s(data.cabinets)   !==s(last.cabinets))   setCabinets(data.cabinets);
        if(data.departments&&s(data.departments)!==s(last.departments)) setDepartments(data.departments);
        if(data.setupSheets&&s(data.setupSheets)!==s(last.setupSheets)){
          setSetupSheets(local=>{
            const serverMap=new Map((data.setupSheets||[]).map(sh=>[sh.id,sh]));
            const localOnly=local.filter(sh=>!serverMap.has(sh.id)); // unsaved new sheets
            const merged=(data.setupSheets||[]).map(ssh=>{
              const lsh=local.find(sh=>sh.id===ssh.id);
              if(!lsh) return ssh;
              if((lsh.updatedAt||0)>(ssh.updatedAt||0)) return lsh; // local edit is newer
              return ssh;
            });
            return [...localOnly,...merged];
          });
        }
        if(data.setupDeptParams&&s(data.setupDeptParams)!==s(last.setupDeptParams)) setSetupDeptParams(data.setupDeptParams);
        if(data.subDepartments&&s(data.subDepartments)!==s(last.subDepartments)) setSubDepartments(data.subDepartments);
        // Keep settingsVersion in sync with server (take the max — never go backwards)
        if((data.settingsVersion||0)>settingsVersionRef.current) settingsVersionRef.current=data.settingsVersion;
        // Remember what the server last sent
        lastServerRef.current={workHours:data.workHours,users:data.users,machines:data.machines,downtimeLog:data.downtimeLog,tools:data.tools,toolLog:data.toolLog,cabinets:data.cabinets,departments:data.departments,setupSheets:data.setupSheets,setupDeptParams:data.setupDeptParams,subDepartments:data.subDepartments,efficiencyGoals:data.efficiencyGoals,planOrders:data.planOrders,planSettings:data.planSettings};
      }).catch(()=>setServerOnline(false));
    },5000);
    return()=>clearInterval(t);
  },[]);

  const doSave=()=>{
    const state=stateRef.current;
    // Detect settings changes — bump version so server knows this save has authoritative settings
    const hash=JSON.stringify([state.users,state.machines,state.departments,state.cabinets,state.workHours,state.setupDeptParams,state.subDepartments,state.efficiencyGoals,state.planSettings]);
    // Always newer than anything seen — the server's version can be ahead of this clock
    // (another device's clock, or the stress test), and a lower number would be rejected
    if(hash!==prevSettingsHashRef.current){prevSettingsHashRef.current=hash;settingsVersionRef.current=Math.max(Date.now(),settingsVersionRef.current+1);}
    return fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...state,settingsVersion:settingsVersionRef.current})}).catch(()=>{});
  };
  // Most handlers call setX(...) and then saveNow() in the same click, before stateRef
  // has the new value — so save once now and again after the re-render has landed.
  // Save, then load the new version. Jobs and timers live on the server, so nothing
  // is lost — the operator just logs in again.
  const reloadForUpdate=()=>{doSave().finally(()=>window.location.reload());};
  // Nobody logged in on this tablet (login screen, or just logged out) → update right away
  useEffect(()=>{if(updateReady&&!user) reloadForUpdate();},[updateReady,user]);
  const savePendingRef=useRef(false);
  const saveNow=()=>{savePendingRef.current=true;return doSave();};
  useEffect(()=>{
    if(!savePendingRef.current) return;
    savePendingRef.current=false;
    doSave();
  },[jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings]);

  // ── Refresh immediately when tab becomes visible again ────
  useEffect(()=>{
    const onVisible=()=>{
      if(document.visibilityState!=="visible") return;
      fetch("/api/data").then(r=>{checkVersion(r);return r.json();}).then(data=>{
        if(!data) return;
        if(data.jobs) setJobs(local=>{
          const serverIds=new Set(data.jobs.map(j=>j.id));
          const localOnly=local.filter(j=>!serverIds.has(j.id));
          return [...localOnly,...data.jobs];
        });
        if(data.machineIssues) setMachineIssues(local=>mergeIssues(local,data.machineIssues,stateRef.current.downtimeLog));
        const s=JSON.stringify;
        const last=lastServerRef.current;
        if(data.workHours  &&s(data.workHours) !==s(last.workHours)) {setWorkHours(data.workHours);workHoursRef.current=data.workHours;}
        if(data.users      &&s(data.users)      !==s(last.users))     setUsers(data.users);
        if(data.machines   &&s(data.machines)   !==s(last.machines))  setMachines(data.machines);
        if(data.downtimeLog&&s(data.downtimeLog)!==s(last.downtimeLog))setDowntimeLog(data.downtimeLog);
        lastServerRef.current={workHours:data.workHours,users:data.users,machines:data.machines,downtimeLog:data.downtimeLog,tools:data.tools,toolLog:data.toolLog,cabinets:data.cabinets,departments:data.departments,setupSheets:data.setupSheets,setupDeptParams:data.setupDeptParams,subDepartments:data.subDepartments};
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
          // downtimeSec is authoritative on the server (30s tick) — clients only update the counting flag
          if(issue.counting!==shouldCount){updated[k]={...issue,counting:shouldCount};changed=true;}
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
    saveNow();
  };
  const resolveIssue=(machineName)=>{
    const issue=machineIssues[machineName]; if(!issue) return;
    const resolvedAt=Date.now();
    const downtimeSec=issue.downtimeSec||0; // work-hours-only counter
    setDowntimeLog(prev=>[...prev,{id:resolvedAt,machineName,...issue,resolvedBy:user.name,resolvedAt,downtimeSec}]);
    setMachineIssues(prev=>{const n={...prev};delete n[machineName];return n;});
    setJobs(prev=>prev.map(j=>j.machine===machineName&&j.paused?{...j,paused:false,phaseStartedAt:Date.now(),lastModifiedAt:Date.now()}:j));
    saveNow();
  };

  const login =u=>{
    // Compute synchronously from stateRef so saveNow() gets correct state immediately
    const n=Date.now();
    const updatedJobs=(stateRef.current.jobs||[]).map(j=>{
      if(j.operatorId!==u.id||!j.logoutPaused||j.operatorPaused) return j;
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
      <div style={{fontSize:24,color:C.amber,letterSpacing:4,textTransform:"uppercase",fontWeight:700}}>⚙ ShopTrack</div>
      <div style={{fontSize:14,color:C.muted,letterSpacing:2}}>Forbinder til serveren…</div>
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
      {/* OFFLINE BANNER */}
      {updateReady&&<div style={{background:C.blue,color:"#fff",padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:15,fontWeight:700,letterSpacing:1}}>
        <span><i className="ti ti-refresh"/> Ny version af ShopTrack er klar</span>
        <button style={{...btn("outline",false,true),color:"#fff",borderColor:"rgba(255,255,255,.7)"}} onClick={reloadForUpdate}>Opdater nu</button>
      </div>}
      {!serverOnline&&<div style={{background:"rgba(231,76,60,.92)",color:"#fff",textAlign:"center",padding:"6px 12px",fontSize:14,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}><i className="ti ti-wifi-off"/> Ingen forbindelse til serveren — ændringer gemmes automatisk, når forbindelsen er tilbage</div>}
      {/* HEADER */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:16,letterSpacing:3,textTransform:"uppercase",color:C.amber,fontWeight:700,cursor:"pointer",userSelect:"none"}} onClick={()=>{setUser(null);setTab("new");}}>⚙ ShopTrack</div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:21,letterSpacing:3}}>{clock}</div>
          <div style={{fontSize:14,textAlign:"right"}}>
            <div style={{color:C.text}}>{user.name}</div>
            <div style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:user.role==="admin"?C.amber:C.muted}}>{roleName(user.role)}</div>
          </div>
          <button style={btn("outline",false,true)} onClick={logout}>Log ud</button>
        </div>
      </div>

      {/* NAV */}
      {user.role==="operator"&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`}}>
          {[["new","plus","Nyt job"],["quick","bolt","Hurtig registrering"],["active","player-play","Aktive"],["machines","alert-triangle","Maskiner"],["tools","package","Værktøj"],["setup","clipboard-list","Opstillingsark"],["history","list","Historik"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
              <i className={`ti ti-${ic}`}/> {lb}
              {t==="active"&&activeCnt>0&&<span style={{background:C.amber,color:"#1a1a1a",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{activeCnt}</span>}
              {t==="machines"&&Object.keys(machineIssues).length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{Object.keys(machineIssues).length}</span>}
            </button>
          ))}
        </div>
      )}
      {user.role==="admin"&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`}}>
          {[["admin","layout-dashboard","Overblik"],["planning","calendar-time","Planlægning β"],["alljobs","tool","Alle job"],["machdata","cpu","Maskiner"],["admintools","package","Værktøj"],["setup","clipboard-list","Opstillingsark"],["reports","chart-bar","Rapporter"],["manage","settings","Administration"]].map(([t,ic,lb])=>{
            const lowCnt=t==="admintools"?tools.filter(tl=>tl.active&&((!tl.returnable&&tl.quantity<=(tl.minQuantity||0))||tl.broken||(tl.hasConditionRating&&(tl.conditionStars||5)<=2&&!tl.ordered))).length:0;
            return(
              <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
                <i className={`ti ti-${ic}`}/> {lb}
                {t==="admintools"&&lowCnt>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{lowCnt}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* CONTENT */}
      {tab==="new"      &&<NewJobTab         user={user} machines={machines} machineIssues={machineIssues} setJobs={setJobs} jobs={visibleJobs} setupSheets={setupSheets} setTab={setTab} setFocusSheetId={setFocusSheetId} setNewSheetFor={setNewSheetFor}/>}
      {tab==="quick"    &&<QuickEntryTab     user={user} machines={machines} setJobs={setJobs} setTab={setTab} saveNow={saveNow}/>}
      {tab==="active"   &&<ActiveTab         user={user} jobs={visibleJobs} setJobs={setJobs} setCompleteId={setCompleteId} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machines" &&<MachineStatusTab  user={user} machines={machines} jobs={visibleJobs} machineIssues={machineIssues} reportIssue={reportIssue} resolveIssue={resolveIssue}/>}
      {tab==="tools"    &&<ToolsTab          user={user} tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} cabinets={cabinets} saveNow={saveNow} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {tab==="history"  &&<HistoryTab        user={user} jobs={visibleJobs}/>}
      {tab==="admin"    &&<AdminDash         jobs={visibleJobs} machineIssues={machineIssues} downtimeLog={downtimeLog} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} tools={tools} efficiencyGoals={efficiencyGoals} workHours={workHours}/>}
      {tab==="alljobs"  &&<AllJobsTab        jobs={visibleJobs} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} machineIssues={machineIssues} setMachineIssues={setMachineIssues} resolveIssue={resolveIssue} downtimeLog={downtimeLog} setDowntimeLog={setDowntimeLog} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machdata" &&<MachineDataTab     jobs={visibleJobs} machines={machines} downtimeLog={downtimeLog} machineIssues={machineIssues} efficiencyGoals={efficiencyGoals} workHours={workHours} clock={clock}/>}
      {tab==="planning" &&<PlanningTab       jobs={visibleJobs} machines={machines} departments={departments} workHours={workHours} planOrders={planOrders} setPlanOrders={setPlanOrders} planSettings={planSettings} setPlanSettings={setPlanSettings} saveNow={saveNow}/>}
      {tab==="reports"  &&<ReportsTab       jobs={visibleJobs} machines={machines} departments={departments} efficiencyGoals={efficiencyGoals} workHours={workHours} downtimeLog={downtimeLog}/>}
      {tab==="admintools"&&<AdminToolsTab     tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} cabinets={cabinets} setCabinets={setCabinets} departments={departments} users={users} machines={machines} saveNow={saveNow} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {tab==="setup"    &&<SetupSheetsTab    user={user} setupSheets={setupSheets} setSetupSheets={setSetupSheets} machines={machines} saveNow={saveNow} stateRef={stateRef} setupDeptParams={setupDeptParams} setSetupDeptParams={setSetupDeptParams} subDepartments={subDepartments} setSubDepartments={setSubDepartments} tools={tools} cabinets={cabinets} setTab={setTab} setFocusToolId={setFocusToolId} focusSheetId={focusSheetId} setFocusSheetId={setFocusSheetId} newSheetFor={newSheetFor} setNewSheetFor={setNewSheetFor}/>}
      {tab==="manage"   &&<ManageTab         users={users} setUsers={setUsers} machines={machines} setMachines={setMachines} workHours={workHours} setWorkHours={setWorkHours} departments={departments} setDepartments={setDepartments} saveNow={saveNow} efficiencyGoals={efficiencyGoals} setEfficiencyGoals={setEfficiencyGoals} jobs={jobs} setJobs={setJobs}/>}

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
      fetch("/api/verify-pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:sel.id,pin:np})})
        .then(r=>r.json())
        .then(d=>{if(d.ok){onLogin(sel);setPin("");setSel(null);}else{setErr(d.locked?`For mange forkerte PIN — vent ${d.retryInSec} sek.`:"Forkert PIN");setPin("");setTimeout(()=>setErr(""),d.locked?3000:1500);}})
        .catch(()=>{setErr("Serverfejl — prøv igen");setPin("");setTimeout(()=>setErr(""),2000);});
    }
  };

  return(
    <div style={{fontFamily:"'Share Tech Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{fontSize:24,color:C.amber,letterSpacing:4,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>⚙ ShopTrack</div>
      <div style={{fontSize:14,color:C.muted,letterSpacing:2,marginBottom:28}}>Registrering af job i værkstedet</div>
      <div style={{width:"100%",maxWidth:360}}>
        {!sel?(
          <>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Vælg dit navn</div>
            {users.filter(u=>u.active&&!u.removed).sort((a,b)=>{
              if(a.role==="admin"&&b.role!=="admin") return 1;
              if(b.role==="admin"&&a.role!=="admin") return -1;
              return a.name.localeCompare(b.name);
            }).map(u=>(
              <button key={u.id} style={{...card(),width:"100%",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",marginBottom:8}}
                onClick={()=>{setSel(u);setPin("");setErr("");}}>
                <div style={avatar()}>{initials(u.name)}</div>
                <div>
                  <div style={{fontSize:16,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:13,letterSpacing:1,textTransform:"uppercase",color:u.role==="admin"?C.amber:C.muted,marginTop:2}}>{roleName(u.role)}</div>
                </div>
              </button>
            ))}
          </>
        ):(
          <>
            <button style={{...btn("outline",false,true),marginBottom:16,display:"flex",alignItems:"center",gap:8}} onClick={()=>{setSel(null);setPin("");}}>
              <i className="ti ti-arrow-left"/> Tilbage
            </button>
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{...avatar(),margin:"0 auto 10px",width:52,height:52,fontSize:20}}>{initials(sel.name)}</div>
              <div style={{fontSize:16,color:C.text}}>{sel.name}</div>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Indtast PIN</div>
            </div>
            <div style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center",fontSize:28,letterSpacing:10,color:C.amber,marginBottom:4,border:`1px solid ${C.border}`,minHeight:56}}>
              {pin?"●".repeat(pin.length):" "}
            </div>
            {err&&<div style={{textAlign:"center",color:C.red,fontSize:15,marginBottom:8,letterSpacing:1}}>{err}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:16}}>
              {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i)=>(
                k===""?<div key={i}/>:
                <button key={i} style={{padding:"18px 0",border:`1px solid rgba(255,255,255,.1)`,borderRadius:10,background:C.raised,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"inherit",textAlign:"center",lineHeight:1}}
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
function NewJobTab({user,machines,setJobs,jobs,setupSheets,setTab,setFocusSheetId,setNewSheetFor}){
  const [customer,setCustomer]=useState(""); const [job,setJob]=useState(""); const [machine,setMachine]=useState(""); const [op,setOp]=useState(""); const [errs,setErrs]=useState({});
  const [twoSided,setTwoSided]=useState(false);
  const [showSuggestions,setShowSuggestions]=useState(true);
  const [sheetPickerOpen,setSheetPickerOpen]=useState(false);

  // Past completed jobs matching the typed part number (min 2 chars)
  const userDepts=user.departments||[];
  const suggestions=job.trim().length>=2
    ?(()=>{
      const q=job.trim().toLowerCase();
      const sorted=(jobs||[])
        .filter(j=>{
          if(j.status!=="done") return false;
          if(!j.job.toLowerCase().includes(q)) return false;
          // If machine already chosen, only show runs on that machine
          if(machine&&j.machine!==machine) return false;
          // Dept filter: only jobs on machines in the operator's departments
          if(userDepts.length>0){
            const mach=(machines||[]).find(m=>m.name===j.machine);
            const md=mach?.departments||[];
            if(md.length>0&&!md.some(d=>userDepts.includes(d))) return false;
          }
          return true;
        })
        .sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
      // If machine selected: just the most recent run on that machine
      return machine?sorted.slice(0,1):sorted.slice(0,5);
    })()
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

  const matchingSheets=job.trim()&&machine?(setupSheets||[]).filter(s=>s.partNumber.trim().toLowerCase()===job.trim().toLowerCase()&&s.machine===machine):[];
  const createJob=()=>{
    const now=Date.now();
    setJobs(prev=>[{id:now,customer:customer.trim(),job:job.trim(),machine,op:op.trim(),operatorId:user.id,operatorName:user.name,status:"setup",setupSec:0,runSec:0,phaseStartedAt:now,createdAt:now,pieces:0,photoData:null,photoData2:null,twoSided,lastModifiedAt:now},...prev]);
    setCustomer("");setJob("");setMachine("");setOp("");setErrs({});setTwoSided(false);setShowSuggestions(true);setSheetPickerOpen(false);
  };
  const goToSheet=(sheetId)=>{setFocusSheetId&&setFocusSheetId(sheetId);setTab&&setTab("setup");};
  // No sheet yet: open a new one so it can be filled in while setting up
  const goToNewSheet=()=>{setNewSheetFor&&setNewSheetFor({partNumber:job.trim(),machine,customer:customer.trim()});setTab&&setTab("setup");};
  const start=(chosenSheetId)=>{
    const e={};if(!customer.trim())e.customer="Skal udfyldes";if(!job.trim())e.job="Skal udfyldes";if(!machine)e.machine="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    if(chosenSheetId===undefined&&matchingSheets.length>1){setSheetPickerOpen(true);return;}
    createJob();
    const sheetId=chosenSheetId!=null?chosenSheetId:matchingSheets.length===1?matchingSheets[0].id:null;
    if(sheetId) goToSheet(sheetId);
    else if(!matchingSheets.length) goToNewSheet();
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Start nyt job</div>

      {/* Two-sided toggle — TOP of form so it can't be missed */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Jobtype</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div onClick={()=>setTwoSided(false)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${!twoSided?C.amber:"rgba(255,255,255,.1)"}`,
            background:!twoSided?"rgba(240,165,0,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-square" style={{fontSize:24,color:!twoSided?C.amber:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:15,fontWeight:700,color:!twoSided?C.amber:C.muted,letterSpacing:1}}>Én side</div>
            {!twoSided&&<div style={{fontSize:12,color:C.amber,marginTop:4,letterSpacing:1}}>✓ VALGT</div>}
          </div>
          <div onClick={()=>setTwoSided(true)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${twoSided?C.blue:"rgba(255,255,255,.1)"}`,
            background:twoSided?"rgba(59,130,246,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-layers-intersect" style={{fontSize:24,color:twoSided?C.blue:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:15,fontWeight:700,color:twoSided?C.blue:C.muted,letterSpacing:1}}>To sider</div>
            {twoSided&&<div style={{fontSize:12,color:C.blue,marginTop:4,letterSpacing:1}}>✓ VALGT</div>}
          </div>
        </div>
        {twoSided&&<div style={{fontSize:14,color:C.blue,marginTop:8,background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 10px"}}>
          <i className="ti ti-info-circle"/> Side 1 køres først. Når side 1 er afsluttet, starter opstilling af side 2 automatisk.
        </div>}
      </div>

      <div style={{marginBottom:12}}>
        <label style={label}>Kunde *</label>
        <input style={inp(errs.customer)} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="f.eks. Firma A/S"/>
        {errs.customer&&<div style={errMsg}>{errs.customer}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Tegningsnr. *</label>
        <input style={inp(errs.job)} value={job}
          onChange={e=>{setJob(e.target.value);setShowSuggestions(true);}}
          placeholder="f.eks. 7641-19"/>
        {errs.job&&<div style={errMsg}>{errs.job}</div>}
        {/* Previous job suggestions */}
        {showSuggestions&&suggestions.length>0&&(
          <div style={{marginTop:8,border:`1px solid ${C.amber}`,borderRadius:8,overflow:"hidden"}}>
            <div style={{background:"rgba(240,165,0,.1)",padding:"6px 10px",fontSize:12,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>
              <i className="ti ti-history"/> Tidligere kørsler — tryk for at hente
            </div>
            {suggestions.map((s,i)=>(
              <div key={s.id} style={{padding:"10px 12px",borderTop:i>0?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"transparent"}}
                onClick={()=>applyJob(s)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.job}</div>
                  <div style={{fontSize:13,color:C.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {s.customer} · {s.machine}{s.op?` · ${s.op}`:""}
                  </div>
                  <div style={{fontSize:12,color:C.muted,marginTop:1,letterSpacing:1}}>{fmtDate(s.completedAt)}</div>
                </div>
                <div style={{flexShrink:0,background:C.amber,color:"#1a1a1a",borderRadius:6,padding:"4px 10px",fontSize:12,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>
                  Hent
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Maskine *</label>
        <select style={sel(errs.machine)} value={machine} onChange={e=>setMachine(e.target.value)}>
          <option value="">— Vælg maskine —</option>
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
        <label style={label}>Operation / beskrivelse</label>
        <input style={inp()} value={op} onChange={e=>setOp(e.target.value)} placeholder="f.eks. planfræsning af top"/>
      </div>
      <div style={{...card(),background:"#1a2535",marginBottom:16}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Logget ind som</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={avatar()}>{initials(user.name)}</div><div style={{fontSize:16,color:C.text}}>{user.name}</div></div>
      </div>
      {matchingSheets.length>0?(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}><i className="ti ti-clipboard-list"/> {matchingSheets.length} opstillingsark fundet</div>
          {matchingSheets.map(s=>{
            const opColor={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted;
            return(
              <div key={s.id} style={{background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.3)",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.text}}>{s.partNumber}</div>
                  {s.operation&&<div style={{fontSize:13,fontWeight:700,color:opColor,marginTop:2}}>{s.operation}</div>}
                  {s.revision&&<div style={{fontSize:12,color:C.muted}}>Rev. {s.revision}</div>}
                </div>
                <button style={{background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.4)",borderRadius:7,color:"#3b82f6",cursor:"pointer",fontSize:14,padding:"5px 12px",fontWeight:600}} onClick={()=>goToSheet(s.id)}>Vis</button>
              </div>
            );
          })}
        </div>
      ):job.trim()&&machine?(
        <div style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.3)",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <i className="ti ti-clipboard-x" style={{fontSize:20,color:C.amber,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:C.amber}}>Intet opstillingsark</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Intet ark for {job.trim()} på {machine}</div>
          </div>
          <button style={{background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.4)",borderRadius:7,color:C.amber,cursor:"pointer",fontSize:14,padding:"5px 12px",fontWeight:600}} onClick={goToNewSheet}>Opret</button>
        </div>
      ):null}
      <button style={btn("primary",true)} onClick={()=>start(undefined)}><i className="ti ti-player-play"/> &nbsp;Start opstilling</button>
      {sheetPickerOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:C.bg,width:"100%",borderRadius:"16px 16px 0 0",padding:"20px 16px 32px",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Hvilket opstillingsark?</div>
            {matchingSheets.map(s=>{
              const opColor={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted;
              return(
                <button key={s.id} style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",marginBottom:8,cursor:"pointer",textAlign:"left"}} onClick={()=>start(s.id)}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:opColor,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:16,fontWeight:700,color:C.text}}>{s.operation||"(ingen operation)"}</div>
                    <div style={{fontSize:13,color:C.muted,marginTop:2}}>{s.partNumber} · {s.machine}{s.revision?` · Rev ${s.revision}`:""}</div>
                  </div>
                  <i className="ti ti-arrow-right" style={{color:C.muted,fontSize:18}}/>
                </button>
              );
            })}
            <button style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px",color:C.muted,cursor:"pointer",fontSize:15,marginTop:4}} onClick={()=>{createJob();}}>Start uden opstillingsark</button>
            <button style={{width:"100%",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginTop:8,padding:"8px"}} onClick={()=>setSheetPickerOpen(false)}>Annuller</button>
          </div>
        </div>
      )}
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
          <input style={inp(errs.customer)} value={customer} onChange={e=>{setCustomer(e.target.value);setErrs(p=>({...p,customer:null}));}} placeholder="f.eks. Firma A/S"/>
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
        <div
          style={{border:`2px dashed ${errs.photo&&!photo?C.red:photo?C.green:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:photo?12:24,textAlign:"center",cursor:"pointer",background:photo?"rgba(39,174,96,.05)":"transparent",transition:"all 0.2s"}}
          onClick={()=>fileRef.current.click()}>
          {photo
            ?<><img src={photo} style={{maxHeight:110,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/><div style={{fontSize:14,color:C.green,letterSpacing:1}}>Foto vedhæftet — tryk for at skifte</div></>
            :<><i className="ti ti-camera" style={{fontSize:32,opacity:0.3,display:"block",marginBottom:8}}/><div style={{fontSize:15,color:C.muted,letterSpacing:1}}>Tryk for at tage eller vælge foto</div><div style={{fontSize:13,color:C.muted,marginTop:4,opacity:0.6}}>Kamera eller galleri</div></>}
        </div>
        <input type="file" ref={fileRef} accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{handlePhoto(e);setErrs(p=>({...p,photo:null}));}}/>
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

// ═══════════════════════════════════════════════════════
// ACTIVE
// ═══════════════════════════════════════════════════════
function JobCard({j,setJobs,startRun,setCompleteId,completeDeburring,pauseJob,resumeJob}){
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
    };
    const cancelNightMode=()=>setJobs(prev=>prev.map(x=>x.id===j.id?{...x,nightMode:false,nightModeDuration:0,nightModeEndsAt:null,nightModeDone:false,nightPaused:false,lastModifiedAt:Date.now()}:x));

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

function ActiveTab({user,jobs,setJobs,setCompleteId,saveNow,stateRef}){
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

// ═══════════════════════════════════════════════════════
// COMPLETE MODAL
// ═══════════════════════════════════════════════════════
function CompleteModal({jobId,jobs,setJobs,onClose,saveNow,stateRef}){
  const j=jobs.find(x=>x.id===jobId);
  const [pieces,setPieces]=useState("");
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const [deburring,setDeburring]=useState(false);
  if(!j) return null;

  // Which phase are we completing?
  const isSide1Completion=j.twoSided&&j.status==="run";
  const isSide2Completion=j.twoSided&&j.status==="side2_run";
  const headerColor=isSide2Completion?C.blue:C.amber;
  const ltModal=liveTime(j);
  const sideLabel=isSide1Completion?"Side 1 færdig — start side 2":isSide2Completion?"Side 2 — afslut job":"Afslut job";

  const submit=async()=>{
    const e={};
    if(!pieces||parseInt(pieces)<1) e.pieces="Indtast antal producerede stk.";
    if(Object.keys(e).length){setErrs(e);return;}
    setSaving(true);
    const now=Date.now();

    if(isSide1Completion){
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"side2_setup",
        pieces:parseInt(pieces),
        setupSec2:0, runSec2:0,
        runSec:ltModal.run,
        phaseStartedAt:now,
        side1CompletedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    } else if(deburring){
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"deburring",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), runSec2:ltModal.run2}
          : {pieces:parseInt(pieces),  runSec:ltModal.run}),
        deburSec:0,
        phaseStartedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    } else {
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"done",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), runSec2:ltModal.run2}
          : {pieces:parseInt(pieces),  runSec:ltModal.run}),
        phaseStartedAt:null,
        completedAt:now, lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      setSaving(false);
      onClose();
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,color:headerColor,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-check-circle"/> {sideLabel}</div>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>

        {/* Job info */}
        <div style={{...card(headerColor),background:"#151e2b",marginBottom:14}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
          {j.twoSided&&(
            <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> To sider</span>
              {isSide1Completion&&<span style={{...badge("setup"),fontSize:12}}>Afslutter side 1</span>}
              {isSide2Completion&&<span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,fontSize:12}}>Afslutter side 2</span>}
            </div>
          )}
        </div>

        {/* Side 1 recap when completing side 2 */}
        {isSide2Completion&&(
          <div style={{background:"rgba(39,174,96,.08)",border:`1px solid rgba(39,174,96,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:C.green,letterSpacing:1}}><i className="ti ti-check"/> Side 1 færdig</span>
            <span style={{fontSize:13,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
            <span style={{fontSize:13,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
            {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
          </div>
        )}

        {/* Timer stats for current side */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={statBox}>
            <div style={{fontSize:22,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.setup2:ltModal.setup)}</div>
            <div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 opstilling":"Opstilling"}</div>
          </div>
          <div style={statBox}>
            <div style={{fontSize:22,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.run2:ltModal.run)}</div>
            <div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 produktion":"Produktion"}</div>
          </div>
        </div>

        {/* Pieces */}
        <div style={{marginBottom:14}}>
          <label style={label}>{isSide2Completion?"Side 2 stk.":"Producerede stk."} <span style={{color:C.red}}>*</span></label>
          <input type="number" min="1" style={{...inp(errs.pieces),fontSize:24,textAlign:"center",color:headerColor}} value={pieces} onChange={e=>setPieces(e.target.value)} placeholder="0"/>
          {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
        </div>

        {isSide1Completion&&(
          <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:14,color:C.blue}}>
            <i className="ti ti-info-circle"/> Når du gemmer, starter opstillingstiden for side 2 automatisk.
          </div>
        )}

        {/* Manual deburring checkbox — only on final completion */}
        {!isSide1Completion&&(
          <div
            onClick={()=>setDeburring(d=>!d)}
            style={{...card(),marginBottom:12,cursor:"pointer",border:`1px solid ${deburring?"rgba(230,126,34,.5)":C.border}`,background:deburring?"rgba(230,126,34,.06)":"transparent"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <i className={`ti ti-${deburring?"checkbox":"square"}`} style={{fontSize:24,color:deburring?C.deburr:C.muted,flexShrink:0}}/>
              <div>
                <div style={{fontSize:16,color:deburring?C.deburr:C.text,fontWeight:700,letterSpacing:1}}>Manuel afgratning</div>
                <div style={{fontSize:13,color:C.muted,marginTop:2}}>Starter et tidur for afgratning — tryk "Afgratning færdig" når du er færdig</div>
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
            ?<><i className="ti ti-loader-2"/> Gemmer…</>
            :isSide1Completion
              ?<><i className="ti ti-arrow-right"/> Gem side 1 &amp; start side 2</>
              :deburring
                ?<><i className="ti ti-tool"/> Gem &amp; start afgratning</>
                :<><i className="ti ti-check"/> Gem &amp; afslut job</>}
        </button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose} disabled={saving}>Annuller</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// START RUN MODAL — quality photo required before run
// ═══════════════════════════════════════════════════════
function StartRunModal({jobId,jobs,setJobs,onClose,saveNow,stateRef}){
  const j=jobs.find(x=>x.id===jobId);
  const [photoData,setPhotoData]=useState(null);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef();
  if(!j) return null;
  const isSide2=j.status==="side2_setup";
  const accentColor=isSide2?C.blue:C.amber;

  const handlePhoto=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhotoData(ev.target.result);r.readAsDataURL(f);};

  const confirm=async()=>{
    if(!photoData||saving) return;
    setSaving(true);
    const now=Date.now();
    const date=new Date(now);
    const dateStr=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const safeName=s=>s.replace(/[^a-z0-9]/gi,"_");
    const runDate=new Date(j.createdAt||now);
    const folder=`${runDate.getFullYear()}/${String(runDate.getMonth()+1).padStart(2,"0")}`;
    const filename=isSide2
      ?`${folder}/quality_${safeName(j.customer||"unknown")}_${safeName(j.job)}_${dateStr}_side2.jpg`
      :`${folder}/quality_${safeName(j.customer||"unknown")}_${safeName(j.job)}_${dateStr}.jpg`;
    const photoUrl=await uploadPhoto(photoData,filename);
    const lt=liveTime(j);
    const newStatus=isSide2?"side2_run":"run";
    // runStartedAt: when Start Run was pressed — lets admin correct it later
    const timePatch=isSide2?{setupSec2:lt.setup2,run2StartedAt:now}:{setupSec:lt.setup,runStartedAt:now};
    const photoPatch=isSide2?{photoData2:photoUrl}:{photoData:photoUrl};
    const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
      ...x,...timePatch,...photoPatch,status:newStatus,phaseStartedAt:now,lastModifiedAt:now,
    }:x);
    if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    const a=document.createElement("a");a.href=photoData;a.download=filename;a.click();
    saveNow&&saveNow();
    setSaving(false);
    onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,color:accentColor,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-camera"/> Kvalitetsfoto — {isSide2?"Start produktion side 2":"Start produktion"}</div>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>
        <div style={{...card(accentColor),background:"#151e2b",marginBottom:16}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
          {isSide2&&<div style={{marginTop:6}}><span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> Side 2 opstilling</span></div>}
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,color:accentColor,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-camera"/> Kvalitetsfoto <span style={{color:C.red}}>*</span>
          </div>
          {photoData?(
            <div style={{position:"relative"}}>
              <img src={photoData} style={{width:"100%",borderRadius:10,maxHeight:260,objectFit:"cover",border:`1px solid ${C.border}`}} alt="quality"/>
              <button onClick={()=>setPhotoData(null)} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.65)",border:"none",borderRadius:20,color:"#fff",cursor:"pointer",padding:"5px 10px",fontSize:14}}>
                <i className="ti ti-refresh"/> Tag igen
              </button>
            </div>
          ):(
            <button onClick={()=>fileRef.current.click()} style={{width:"100%",padding:"28px 16px",background:C.raised,border:`2px dashed ${C.border}`,borderRadius:10,color:accentColor,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,fontFamily:"inherit"}}>
              <i className="ti ti-camera" style={{fontSize:36}}/>
              <span style={{fontSize:16,letterSpacing:1}}>Tryk for at tage kvalitetsfoto</span>
              <span style={{fontSize:13,color:C.muted}}>Skal tages før produktionen starter</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhoto}/>
        </div>
        <button
          style={{...btn("primary",true),opacity:!photoData||saving?0.45:1,...(isSide2?{background:C.blue,borderColor:C.blue}:{})}}
          disabled={!photoData||saving}
          onClick={confirm}>
          {saving?<><i className="ti ti-loader-2"/> Uploader…</>:<><i className="ti ti-player-play"/> {isSide2?"Start produktion side 2":"Start produktion"}</>}
        </button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose} disabled={saving}>Annuller</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MACHINE STATUS (operator)
// ═══════════════════════════════════════════════════════
// What a job is doing right now, for a one-line summary
function jobPhase(j){
  const lt=liveTime(j);
  if(j.paused) return {label:"Maskine nede",color:C.red,sec:null};
  if(j.operatorPaused||j.logoutPaused) return {label:"På pause",color:C.muted,sec:null};
  if(j.status==="deburring") return {label:"Afgratning",color:C.deburr,sec:lt.debur};
  if(j.status==="setup") return {label:j.twoSided?"Opstilling side 1":"Opstilling",color:C.amber,sec:lt.setup};
  if(j.status==="side2_setup") return {label:"Opstilling side 2",color:C.amber,sec:lt.setup2};
  if(j.status==="side2_run") return {label:"Produktion side 2",color:C.blue,sec:lt.run2};
  return {label:j.twoSided?"Produktion side 1":"Produktion",color:j.nightMode?"#7c5cbf":C.green,sec:lt.run};
}

function MachineStatusTab({user,machines,jobs,machineIssues,reportIssue,resolveIssue}){
  const [reporting,setReporting]=useState(null);
  const [issueType,setIssueType]=useState("repair");
  const [note,setNote]=useState("");

  const submit=(machineName)=>{
    reportIssue(machineName,issueType,note.trim());
    setReporting(null);setNote("");
  };

  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Maskinstatus</div>
      {machines.filter(m=>{
        if(!m.active) return false;
        const userDepts=user.departments||[];
        if(userDepts.length===0) return true;
        return !m.department||userDepts.includes(m.department);
      }).map(m=>{
        const issue=machineIssues[m.name];
        const isReporting=reporting===m.name;
        const onMachine=(jobs||[]).filter(j=>j.machine===m.name&&j.status!=="done");
        return(
          <div key={m.id} style={card(issue?(issue.status==="down"?C.red:C.amber):C.green)}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="ti ti-robot" style={{fontSize:20,color:issue?(issue.status==="down"?C.red:C.amber):C.green}}/>
              </div>
              <div style={{width:150,flexShrink:0}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700}}>{m.name}</div>
                <span style={badge(issue?issue.status:"run")}>{issue?(issue.status==="down"?"Nede":"Skal repareres"):"Kører"}</span>
              </div>
              {/* The job(s) on this machine right now */}
              <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
                {!onMachine.length&&<div style={{fontSize:14,color:C.muted}}>Ingen job</div>}
                {onMachine.map(j=>{const ph=jobPhase(j);return(
                  <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:ph.color,flexShrink:0}}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontSize:15,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[j.customer,j.job].filter(Boolean).join(" · ")}</div>
                      <div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        <span style={{color:ph.color,fontWeight:700}}>{ph.label}</span> · <i className="ti ti-user"/> {j.operatorName}
                      </div>
                    </div>
                    {ph.sec!=null&&<div style={{fontSize:18,color:ph.color,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{fmtHM(ph.sec)}</div>}
                  </div>
                );})}
              </div>
              {!issue&&!isReporting&&(
                <button style={btn("outline",false,true)} onClick={()=>{setReporting(m.name);setIssueType("repair");setNote("");}}>
                  <i className="ti ti-alert-triangle"/> Meld fejl
                </button>
              )}
              {issue&&(
                <button style={btn("success",false,true)} onClick={()=>resolveIssue(m.name)}>
                  <i className="ti ti-check"/> Kører igen
                </button>
              )}
            </div>
            {issue&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,fontSize:14,color:C.muted}}>
                {issue.reason&&<div style={{color:C.text,marginBottom:4}}>{issue.reason}</div>}
                <div>Meldt af <span style={{color:C.text}}>{issue.reportedBy}</span> · {fmtDate(issue.reportedAt)}</div>
              </div>
            )}
            {isReporting&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Hvad er galt?</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <button style={btn(issueType==="repair"?"primary":"outline",true)} onClick={()=>setIssueType("repair")}>Skal repareres</button>
                  <button style={btn(issueType==="down"?"danger":"outline",true)} onClick={()=>setIssueType("down")}>Maskine nede</button>
                </div>
                <input style={{...inp(),marginBottom:10}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Beskriv problemet (valgfrit)"/>
                <div style={{display:"flex",gap:8}}>
                  <button style={btn(issueType==="down"?"danger":"primary",true)} onClick={()=>submit(m.name)}>
                    <i className="ti ti-send"/> Send melding
                  </button>
                  <button style={btn("outline",false,true)} onClick={()=>setReporting(null)}>Annuller</button>
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
  const mine=jobs.filter(j=>j.status==="done"&&j.operatorId===user.id);
  const machineNames=[...new Set(mine.map(j=>j.machine))].sort();
  const done=mine.filter(j=>filt==="all"||j.machine===filt);
  return(
    <div style={{padding:"14px 16px"}}>
      {machineNames.length>1&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","Alle"],...machineNames.map(m=>[m,m])].map(([f,l])=>(
          <button key={f} style={tag(filt===f)} onClick={()=>setFilt(f)}>{l}</button>
        ))}
      </div>}
      {!done.length?<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}><i className="ti ti-list" style={{fontSize:30,display:"block",marginBottom:10,opacity:0.3}}/> Ingen afsluttede job.</div>
        :done.map(j=>(
        <div key={j.id} style={{...card(),display:"flex",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            {j.photoData?<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${j.twoSided?C.blue:C.border}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-camera-off" style={{color:C.muted,fontSize:20}}/></div>}
            {j.twoSided&&(j.photoData2?<img src={j.photoData2} title="Side 2" style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${C.blue}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.red}`}}><i className="ti ti-camera-off" style={{color:C.red,fontSize:18}}/></div>)}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              {j.customer&&<div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.customer}</div>}
              <div style={{fontSize:14,color:C.muted}}><i className="ti ti-hash"/> {j.job}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                {j.quickEntry&&<span style={{...badge("admin"),fontSize:12}}>Hurtig</span>}
                {j.twoSided&&<span style={{...badge("admin"),background:"rgba(59,130,246,.1)",color:C.blue,fontSize:12}}><i className="ti ti-layers-intersect"/> 2 sider</span>}
              </div>
            </div>
            <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span></div>
            {j.twoSided?(
              <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8}}>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,color:C.muted,fontWeight:700,letterSpacing:1}}>S1</span>
                  <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                  <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                  {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
                  {j.pieces>0&&<span style={{fontSize:13,color:C.amber,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,color:C.blue,fontWeight:700,letterSpacing:1}}>S2</span>
                  <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec2||0)}</span>
                  <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec2||0)}</span>
                  {j.pieces2>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces2} stk</span>}
                  {j.pieces2>0&&<span style={{fontSize:13,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/stk</span>}
                </div>
              </div>
            ):(
              <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
                <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                {j.pieces>0&&<span style={{fontSize:14,color:C.muted}}>{j.pieces} stk</span>}
                {j.pieces>0&&<span style={{fontSize:14,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
              </div>
            )}
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{fmtDate(j.completedAt)}</div>
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
      <div style={{fontSize:13,color,letterSpacing:2,textTransform:"uppercase",marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${color}40`}}>
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
      <ActiveSection label="Nede / reparation" color={C.red}   items={down}    renderCard={renderCard}/>
      <ActiveSection label="Opstilling"    color={C.amber} items={setup}   renderCard={renderCard}/>
      <ActiveSection label="Kører"       color={C.green} items={running} renderCard={renderCard}/>
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

function AdminDash({jobs,machineIssues,downtimeLog,setJobs,setCompleteId,users,machines,tools,efficiencyGoals,workHours}){
  const done=jobs.filter(j=>j.status==="done"); const active=sortActive(jobs.filter(j=>j.status!=="done"));
  // Efficiency helpers
  const jobEff=j=>{const t=(j.setupSec||0)+(j.runSec||0);return t>0?(j.runSec||0)/t*100:null;};
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
  const machMap={};done.forEach(j=>{if(!machMap[j.machine])machMap[j.machine]={run:0,setup:0,jobs:0};machMap[j.machine].run+=j.runSec;machMap[j.machine].setup+=j.setupSec;machMap[j.machine].jobs++;});
  const maxRun=Math.max(...Object.values(machMap).map(m=>m.run),1);
  const opMap={};done.forEach(j=>{if(!opMap[j.operatorName])opMap[j.operatorName]={jobs:0,pieces:0,run:0};opMap[j.operatorName].jobs++;opMap[j.operatorName].pieces+=j.pieces;opMap[j.operatorName].run+=j.runSec;});
  const issueEntries=Object.entries(machineIssues);
  // Chart data
  const todayStr=toDateInput(nowMs);
  const monthStr=todayStr.slice(0,7);
  // Week: Monday → today
  const todayDate=new Date(); const dayOfWeek=todayDate.getDay();
  const monday=new Date(todayDate); monday.setDate(todayDate.getDate()-((dayOfWeek+6)%7)); monday.setHours(0,0,0,0);
  const weekStart=monday.getTime();
  const weekJobs=jobs.filter(j=>(j.createdAt||0)>=weekStart);
  const monthJobs=jobs.filter(j=>toDateInput(j.createdAt).startsWith(monthStr));
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

// ═══════════════════════════════════════════════════════
// ALL JOBS (ADMIN)
// ═══════════════════════════════════════════════════════
// <input type="datetime-local"> works in local time without seconds
function toLocalInput(ms){const d=new Date(ms);const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function fromLocalInput(v){const t=new Date(v).getTime();return isNaN(t)?null:t;}

// Admin: an operator forgot to press Start Job or Start Run — set when it really
// happened. Job start adds/removes setup time; run start moves time between
// setup and run. Each fix is recorded in job.corrections.
function StartTimeFix({j,onApply}){
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

function AdminJobCard({j,setJobs,setCompleteId,users,machines,saveNow,stateRef,selected,onToggleSelect}){
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
    const patch=j.status==="side2_setup"?{setupSec2:lt.setup2,run2StartedAt:n}:{setupSec:lt.setup,runStartedAt:n};
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch,status:newStatus,phaseStartedAt:n,lastModifiedAt:n}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
  };
  // Start-time correction from StartTimeFix
  const applyFix=patch=>{
    const updatedJobs=(stateRef.current.jobs||[]).map(x=>x.id===j.id?{...x,...patch,lastModifiedAt:Date.now()}:x);
    stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    saveNow&&saveNow();
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
  };

  return(
    <div style={{background:C.surface,borderRadius:10,borderTop:`3px solid ${accentColor}`,border:`1px solid ${C.border}`,borderTopColor:accentColor,padding:"10px",display:"flex",flexDirection:"column",gap:6}}>
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
          {/* pieces only for done jobs */}
          {j.status==="done"&&(
            <div>
              <div style={label}>Stk.</div>
              <input type="number" min="0" style={inp()} value={editPieces} onChange={e=>setEditPieces(e.target.value)} placeholder="0"/>
            </div>
          )}
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

function IssueCard({name,issue,setMachineIssues,resolveIssue,saveNow}){
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

function AllJobsTab({jobs,setJobs,setCompleteId,users,machines,machineIssues,setMachineIssues,resolveIssue,downtimeLog,setDowntimeLog,saveNow,stateRef}){
  const [statusFilt,setStatusFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const [search,setSearch]=useState("");
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
    (statusFilt==="all"||j.status===statusFilt)&&
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

function ResolvedIssueCard({entry,setDowntimeLog,saveNow}){
  const [editing,setEditing]=useState(false);
  const [reason,setReason]=useState(entry.reason||"");
  const [fixDescription,setFixDescription]=useState(entry.fixDescription||"");
  const [fixCost,setFixCost]=useState(entry.fixCost||"");
  const accentColor=entry.status==="down"?C.red:C.amber;
  const save=()=>{
    setDowntimeLog(prev=>prev.map(e=>e.id===entry.id?{...e,reason:reason.trim(),fixDescription:fixDescription.trim(),fixCost:fixCost.trim(),updatedAt:Date.now()}:e));
    setEditing(false);
    saveNow&&saveNow();
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

// ═══════════════════════════════════════════════════════
// REPORTS — date range + filters + export
// ═══════════════════════════════════════════════════════
function ReportsTab({jobs,machines,departments,efficiencyGoals,workHours,downtimeLog}){
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

  return(
    <div style={{padding:'14px 16px'}}>
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

// ═══════════════════════════════════════════════════════
// MACHINE DATA TAB
// ═══════════════════════════════════════════════════════
function MachineDataTab({jobs,machines,downtimeLog,machineIssues,efficiencyGoals,workHours,clock}){
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
        const jobEff=j=>{const t=(j.setupSec||0)+(j.runSec||0);return t>0?(j.runSec||0)/t*100:null;};
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
                          <span style={{fontSize:13,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                          <span style={{fontSize:13,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
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
                const t=(j.setupSec||0)+(j.runSec||0);
                if(t===0||j.status!=="done") return null;
                const e=Math.round((j.runSec||0)/t*100);
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

// ═══════════════════════════════════════════════════════
// PLANNING (beta, admin) — orders with a route of steps (one per department),
// timed from previous runs of the part, placed onto machines within work hours
// ═══════════════════════════════════════════════════════
const PLAN_COLORS=["#3b82f6","#27ae60","#f0a500","#8b5cf6","#06b6d4","#ec4899","#e67e22","#84cc16"];
const normPart=s=>(s||"").trim().toLowerCase();
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function addDays(ms,n){const d=new Date(ms);d.setDate(d.getDate()+n);return d.getTime();}
function dueTs(o){return o.dueDate?new Date(o.dueDate+"T00:00:00").getTime():9e15;}
// Urgent first, then rank (defaults to due date; ▲▼ changes it), then oldest
function orderCmp(a,b){return (b.urgent?1:0)-(a.urgent?1:0)||(a.rank??dueTs(a))-(b.rank??dueTs(b))||a.id-b.id;}

// Finished runs of a part — one row per job, both sides together
function partHistory(jobs,machines,part){
  const p=normPart(part); if(!p) return [];
  const dept=name=>(machines.find(m=>m.name===name)||{}).department||"";
  return jobs.filter(j=>j.status==="done"&&!j.deleted&&normPart(j.job)===p).map(j=>({
    machine:j.machine,department:dept(j.machine),setupSec:jSetupAll(j),runSec:jRunAll(j),
    pieces:Math.max(j.pieces||0,j.pieces2||0),createdAt:j.createdAt||0,
  }));
}

// Typical time for a step: runs on the same machine, else anywhere in the department.
// Median, so one odd run doesn't throw it off.
function estimateStep(hist,step){
  let rows=step.machine?hist.filter(h=>h.machine===step.machine):[],basis="machine";
  if(!rows.length){rows=hist.filter(h=>h.department&&h.department===step.department);basis="department";}
  if(!rows.length) return null;
  const perPc=rows.filter(h=>h.pieces>0).map(h=>h.runSec/h.pieces);
  return {setupSec:Math.round(median(rows.map(h=>h.setupSec))),runPerPcSec:perPc.length?median(perPc):null,n:rows.length,basis};
}

// The route the part took before: departments in the order they were first done,
// each with the machine it ran on most
function suggestRoute(hist){
  const steps=[];
  [...hist].sort((a,b)=>a.createdAt-b.createdAt).forEach(h=>{
    const key=h.department||h.machine;
    if(!key||steps.some(s=>(s.department||s.machine)===key)) return;
    const counts={};hist.filter(x=>(x.department||x.machine)===key).forEach(x=>{counts[x.machine]=(counts[x.machine]||0)+1;});
    steps.push({id:Date.now()+steps.length,department:h.department,machine:Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0],setupMin:"",runMinPerPc:""});
  });
  return steps;
}

// Planned seconds for a step: typed minutes win, else the history estimate.
// Setup is once per step, run grows with the quantity.
function stepDuration(step,qty,hist){
  const est=estimateStep(hist,step);
  const num=v=>v===""||v==null||isNaN(Number(v))?null:Number(v);
  const setup=num(step.setupMin)!=null?num(step.setupMin)*60:est?.setupSec;
  const perPc=num(step.runMinPerPc)!=null?num(step.runMinPerPc)*60:est?.runPerPcSec;
  if(setup==null||perPc==null) return {est,durationSec:null};
  const setupSec=Math.round(setup),runSec=Math.round(perPc*(qty||0));
  return {est,setupSec,runSec,durationSec:setupSec+runSec};
}

// The moment `sec` of work time has passed inside a block's segments
function workPoint(segs,sec){
  let left=sec*1000;
  for(const [s,e] of segs){if(left<=e-s) return s+left;left-=e-s;}
  return segs.length?segs[segs.length-1][1]:null;
}

// Work window [start,end] of the day containing ms, or null on a day off
function dayWindow(wh,ms){
  const d=new Date(ms);d.setHours(0,0,0,0);
  const dh=(wh||{})[DAYS_KEY[d.getDay()]]||(wh?.start?{start:wh.start,end:wh.end,enabled:true}:null);
  if(!dh||!dh.enabled||!dh.start||!dh.end) return null;
  const [sh,sm]=dh.start.split(":").map(Number),[eh,em]=dh.end.split(":").map(Number);
  const s=new Date(d);s.setHours(sh,sm,0,0);const e=new Date(d);e.setHours(eh,em,0,0);
  return e>s?[s.getTime(),e.getTime()]:null;
}

// Spend `sec` of work time from startMs on, skipping nights and days off.
// Returns the end and the [from,to] pieces per day (for drawing).
function addWorkTime(wh,startMs,sec){
  const segs=[];let t=startMs,left=sec*1000;
  for(let i=0;i<730&&left>0;i++){
    const w=dayWindow(wh,t);
    if(w&&t<w[1]){const s=Math.max(t,w[0]),take=Math.min(left,w[1]-s);segs.push([s,s+take]);left-=take;t=s+take;if(left<=0)break;}
    const next=new Date(t);next.setHours(0,0,0,0);next.setDate(next.getDate()+1);t=next.getTime();
  }
  return {end:segs.length?segs[segs.length-1][1]:startMs,segs,ok:left<=0};
}

// Department order for routes (e.g. Turning → Fortanding → Milling): the saved
// order first, then any departments not in it yet, alphabetically
function effectiveDeptOrder(saved,allDepts){
  const s=(saved||[]).filter(d=>allDepts.includes(d));
  return [...s,...allDepts.filter(d=>!s.includes(d)).sort()];
}
// Put steps in department order; steps without a known department keep their place at the end
function sortSteps(steps,deptOrder){
  const rank=s=>{const i=deptOrder.indexOf(s.department);return i<0?999:i;};
  return steps.map((s,i)=>[s,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);
}

// Priority order, optionally pulling the same part (due within 7 days) right
// behind it so the machine stays set up
function orderQueue(orders,groupSameParts){
  const ordered=orders.filter(o=>!o.deleted&&!o.done).sort(orderCmp);
  if(!groupSameParts) return ordered;
  const out=[],rest=[...ordered];
  while(rest.length){
    const o=rest.shift();out.push(o);
    const p=normPart(o.partNumber);
    for(let i=0;i<rest.length;){
      const q=rest[i];
      if(normPart(q.partNumber)===p&&!!q.urgent===!!o.urgent&&dueTs(q)-dueTs(o)<=7*86400000){out.push(q);rest.splice(i,1);}else i++;
    }
  }
  return out;
}

// Forward plan with a busy list per machine:
// 1. running jobs block their machine for their estimated remaining time
// 2. pinned steps (dragged or given a fixed start) are placed where they were put
// 3. the other steps, orders in priority order: each step waits for the previous
//    one and goes to the machine in its department that can finish it first, in
//    the first gap long enough. A machine already set up for the same part and
//    step (the block right before) needs no new setup.
function buildPlan({orders,jobs,allMachines,machines,workHours,now,groupSameParts}){
  const busy={};machines.forEach(m=>{busy[m.name]=[];}); // [{s,e,part,stepIdx,orderId,live}]
  const reserve=(m,iv)=>{busy[m].push(iv);busy[m].sort((a,b)=>a.s-b.s);};
  // Earliest placement of `sec` work seconds on machine m, not before `from`, that doesn't overlap a busy block
  const findSlot=(m,from,sec)=>{
    let start=from;
    for(let k=0;k<500;k++){
      const r=addWorkTime(workHours,start,sec);
      if(!r.ok) return null;
      const s0=r.segs[0]?.[0]??start;
      const clash=busy[m].find(b=>b.s<r.end&&b.e>s0);
      if(!clash) return r;
      start=clash.e;
    }
    return null;
  };
  const before=(m,t)=>busy[m].filter(b=>b.e<=t).sort((a,b)=>b.e-a.e)[0]; // block just before time t
  const blocks=[];
  const liveFree={};machines.forEach(m=>{liveFree[m.name]=now;});
  jobs.filter(j=>j.status!=="done"&&j.status!=="deburring"&&busy[j.machine]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).forEach(j=>{
    const h=partHistory(jobs,allMachines,j.job).filter(x=>x.machine===j.machine);
    const typSetup=median(h.map(x=>x.setupSec)),typRun=median(h.map(x=>x.runSec));
    const lt=liveTime(j);
    const inSetup=j.status==="setup"||j.status==="side2_setup";
    let r,setupLeft=0;
    if(typSetup!=null&&typRun!=null){
      const remaining=Math.max(0,typSetup+typRun-(lt.setup+lt.run+lt.setup2+lt.run2));
      if(inSetup) setupLeft=Math.min(remaining,Math.max(0,typSetup-(j.status==="setup"?lt.setup:lt.setup2)));
      r=addWorkTime(workHours,liveFree[j.machine],remaining);
    }else{const w=dayWindow(workHours,now);r=w&&now<w[1]?{end:w[1],segs:[[Math.max(now,w[0]),w[1]]]}:{end:now,segs:[]};} // unknown: assume it finishes today
    blocks.push({live:true,guess:typSetup==null,inSetup,machine:j.machine,end:r.end,segs:r.segs,setupEnd:workPoint(r.segs,setupLeft),
      label:[j.customer,j.job].filter(Boolean).join(" · "),operator:j.operatorName});
    liveFree[j.machine]=Math.max(liveFree[j.machine],r.end);
    reserve(j.machine,{s:now,e:r.end,part:normPart(j.job),live:true});
  });

  const ordered=orderQueue(orders,groupSameParts);
  const results={};
  const mk=(o,i,m,r,setupSec,sd,extra)=>({orderId:o.id,stepIdx:i,machine:m,start:r.segs[0]?.[0]??r.end,end:r.end,segs:r.segs,
    setupSec,runSec:sd.runSec,durationSec:setupSec+sd.runSec,setupEnd:workPoint(r.segs,setupSec),
    label:[o.customer,o.partNumber].filter(Boolean).join(" · "),...extra});

  // Pass 1 — pinned steps go exactly where they were put
  const pinned={}; // `${orderId}|${stepIdx}` → block
  ordered.forEach(o=>{
    const hist=partHistory(jobs,allMachines,o.partNumber);
    (o.steps||[]).forEach((st,i)=>{
      if(!st.pin||!busy[st.pin.machine]) return;
      const sd=stepDuration(st,o.quantity,hist);
      if(sd.durationSec==null) return;
      const r=addWorkTime(workHours,st.pin.start,sd.durationSec);
      if(!r.ok) return;
      const b=mk(o,i,st.pin.machine,r,sd.setupSec,sd,{pinned:true,setupSaved:0});
      b.overlap=busy[st.pin.machine].some(x=>x.s<b.end&&x.e>b.start); // pinned on top of something else
      pinned[`${o.id}|${i}`]=b;blocks.push(b);
      reserve(st.pin.machine,{s:b.start,e:b.end,part:normPart(o.partNumber),stepIdx:i,orderId:o.id});
    });
  });

  // Pass 2 — everything else, in priority order
  ordered.forEach(o=>{
    const hist=partHistory(jobs,allMachines,o.partNumber);
    let prevEnd=now,problem=null,warning=null;const steps=[];
    const part=normPart(o.partNumber);
    for(const [i,st] of (o.steps||[]).entries()){
      const name=st.machine||st.department||"?";
      const pb=pinned[`${o.id}|${i}`];
      if(pb){
        if(pb.overlap) warning=`Trin ${i+1} er låst oven i andet arbejde på ${pb.machine}`;
        if(pb.start<prevEnd-60000) warning=`Trin ${i+1} er låst til at starte før trin ${i} er færdigt`;
        prevEnd=Math.max(prevEnd,pb.end);steps.push(pb);continue;
      }
      const sd=stepDuration(st,o.quantity,hist);
      if(sd.durationSec==null){problem=`Trin ${i+1} (${name}) har ingen tid — ingen historik, indtast minutter`;break;}
      const cands=st.machine?machines.filter(m=>m.name===st.machine):machines.filter(m=>m.department===st.department);
      if(!cands.length){problem=`Ingen aktiv maskine til trin ${i+1} (${name})`;break;}
      let best=null;
      cands.forEach(m=>{
        let r=findSlot(m.name,prevEnd,sd.durationSec);
        if(!r) return;
        // Same part and same step right before on this machine (another order, or
        // the job running now) → already set up, the step is shorter
        const p=before(m.name,(r.segs[0]?.[0]??r.end)+1);
        const setUp=!!p&&p.part===part&&p.orderId!==o.id&&(p.live||p.stepIdx===i);
        let setupSec=sd.setupSec;
        if(setUp&&sd.setupSec>0){const r2=findSlot(m.name,r.segs[0]?.[0]??prevEnd,sd.runSec);if(r2){r=r2;setupSec=0;}}
        if(!best||r.end<best.r.end) best={m,r,setupSec,setUp:setupSec===0&&sd.setupSec>0};
      });
      if(!best){problem=`Ingen plads til at planlægge trin ${i+1} (${name}) — tjek arbejdstiden`;break;}
      const b=mk(o,i,best.m.name,best.r,best.setupSec,sd,{setupSaved:best.setUp?sd.setupSec:0});
      reserve(best.m.name,{s:b.start,e:b.end,part,stepIdx:i,orderId:o.id});
      prevEnd=b.end;blocks.push(b);steps.push(b);
    }
    const end=!problem&&steps.length?prevEnd:null;
    const dueEnd=o.dueDate?new Date(o.dueDate+"T23:59:59").getTime():null;
    results[o.id]={steps,end,problem,warning,late:!!(end&&dueEnd&&end>dueEnd)};
  });
  return {blocks,results,ordered};
}

// ── Import: paste rows from Excel/ERP ──
// Columns: customer, part number, quantity, due date, departments (optional).
// Tab (Excel), ; or , separated. A header row is skipped (its quantity isn't a number).
function parseDate(s){
  s=(s||"").trim();if(!s) return "";
  let y,mo,d,m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) [y,mo,d]=[m[1],m[2],m[3]];
  else if((m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) [d,mo,y]=[m[1],m[2],m[3].length===2?"20"+m[3]:m[3]]; // Danish day.month.year
  else return null;
  const iso=`${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  const t=new Date(iso+"T00:00:00");
  return !isNaN(t)&&t.getDate()===Number(d)&&t.getMonth()+1===Number(mo)?iso:null; // rejects 31-02, 32-13…
}
function parseImport(text,allDepts){
  return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map((line,n)=>{
    const sep=line.includes("\t")?"\t":line.includes(";")?";":",";
    const [customer="",part="",qtyS="",dueS="",deptS=""]=line.split(sep).map(c=>c.trim());
    const qty=parseInt(qtyS);
    if(isNaN(qty)) return n===0?null:{line,error:`Antal "${qtyS}" er ikke et tal`};
    const dueDate=parseDate(dueS);
    if(dueDate===null) return {line,error:`Kan ikke læse datoen "${dueS}" (brug 31-10-2026 eller 2026-10-31)`};
    const depts=[],unknown=[];
    deptS.split(/[+,/>|]+|\s+/).map(t=>t.trim()).filter(Boolean).forEach(t=>{
      const lt=t.toLowerCase();
      const d=allDepts.find(x=>x.toLowerCase()===lt)||(allDepts.filter(x=>x.toLowerCase().startsWith(lt)).length===1?allDepts.find(x=>x.toLowerCase().startsWith(lt)):null);
      if(d){if(!depts.includes(d))depts.push(d);}else unknown.push(t);
    });
    if(unknown.length) return {line,error:`Ukendt afdeling: ${unknown.join(", ")}`};
    if(!part) return {line,error:"Intet tegningsnr."};
    if(qty<1) return {line,error:"Antal skal være mindst 1"};
    return {line,customer,partNumber:part,quantity:qty,dueDate,depts};
  }).filter(Boolean);
}

function PlanningTab({jobs,machines,departments,workHours,planOrders,setPlanOrders,planSettings,setPlanSettings,saveNow}){
  const [view,setView]=useState("week");
  const [weekOffset,setWeekOffset]=useState(0);
  const [monthOffset,setMonthOffset]=useState(0);
  const [editing,setEditing]=useState(null); // copy of the order being edited
  const [selectedId,setSelectedId]=useState(null);
  const minute=Math.floor(Date.now()/60000); // re-plan once a minute, not every second
  const allDepts=useMemo(()=>[...new Set([...(departments||[]),...machines.map(m=>m.department).filter(Boolean)])].sort(),[departments,machines]);
  const deptOrder=useMemo(()=>effectiveDeptOrder(planSettings?.deptOrder,allDepts),[planSettings,allDepts]);
  const groupSameParts=!!planSettings?.groupSameParts;
  // Machines listed by department in route order, then by name
  const activeMachines=useMemo(()=>{
    const di=d=>{const i=deptOrder.indexOf(d);return i<0?999:i;};
    return machines.filter(m=>m.active&&!m.removed).sort((a,b)=>di(a.department)-di(b.department)||a.name.localeCompare(b.name));
  },[machines,deptOrder]);
  const plan=useMemo(()=>buildPlan({orders:planOrders||[],jobs,allMachines:machines,machines:activeMachines,workHours,now:minute*60000,groupSameParts}),[planOrders,jobs,machines,activeMachines,workHours,minute,groupSameParts]);
  const colorOf=id=>PLAN_COLORS[Math.max(0,plan.ordered.findIndex(o=>o.id===id))%PLAN_COLORS.length];

  const saveSettings=p=>{setPlanSettings(prev=>({...(prev||{}),...p}));saveNow&&saveNow();};
  const saveOrders=fn=>{setPlanOrders(fn);saveNow&&saveNow();};
  // Pin one step to a machine and start time (null = unpin)
  const setPin=(orderId,stepIdx,pin)=>{const now=Date.now();saveOrders(prev=>prev.map(o=>o.id===orderId?{...o,updatedAt:now,steps:o.steps.map((s,i)=>i===stepIdx?{...s,pin}:s)}:o));};
  const pinnedCount=plan.ordered.reduce((n,o)=>n+(o.steps||[]).filter(s=>s.pin).length,0);
  const unpinAll=()=>{const now=Date.now();saveOrders(prev=>prev.map(o=>(o.steps||[]).some(s=>s.pin)?{...o,updatedAt:now,steps:o.steps.map(s=>({...s,pin:null}))}:o));};
  // Drop a dragged block on a machine's day: it's pinned to start there (15-minute steps)
  const dropOn=(e,m,w)=>{
    e.preventDefault();
    let d;try{d=JSON.parse(e.dataTransfer.getData("text/plain"));}catch{return;}
    const o=plan.ordered.find(x=>x.id===d.orderId);const st=o?.steps?.[d.stepIdx];
    if(!st) return;
    if(st.department&&m.department!==st.department&&st.machine!==m.name){window.alert(`${m.name} hører ikke til ${st.department} — trin ${d.stepIdx+1} skal blive i ${st.department}.`);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const frac=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
    const t=Math.round((w[0]+frac*(w[1]-w[0]))/900000)*900000;
    setPin(o.id,d.stepIdx,{machine:m.name,start:Math.min(Math.max(t,w[0]),w[1]-900000)});
    setSelectedId(o.id);
  };
  const upsert=o=>saveOrders(prev=>{const n={...o,updatedAt:Date.now()};return prev.some(x=>x.id===o.id)?prev.map(x=>x.id===o.id?n:x):[...prev,n];});
  const patch=(o,p)=>upsert({...o,...p});
  const move=(o,dir)=>{
    const list=plan.ordered;const other=list[list.findIndex(x=>x.id===o.id)+dir];
    if(!other||!!other.urgent!==!!o.urgent) return;
    const rb=other.rank??dueTs(other),now=Date.now();
    saveOrders(prev=>prev.map(x=>x.id===o.id?{...x,rank:rb+dir,updatedAt:now}:x));
  };
  const sortByDue=()=>{const now=Date.now();saveOrders(prev=>prev.map(o=>o.deleted||o.done?o:{...o,rank:dueTs(o),updatedAt:now}));};
  const newOrder=()=>setEditing({id:Date.now(),customer:"",partNumber:"",quantity:"",dueDate:"",urgent:false,notes:"",steps:[],createdAt:Date.now(),isNew:true});

  const problems=plan.ordered.filter(o=>plan.results[o.id]?.problem||plan.results[o.id]?.warning);
  const lateCount=plan.ordered.filter(o=>plan.results[o.id]?.late).length;
  const fmtDay=ms=>new Date(ms).toLocaleDateString("da-DK",{weekday:"short",day:"2-digit",month:"short"});

  // Pieces of a machine's blocks inside one day's work window, as % positions,
  // split where setup ends so setup can be drawn darker
  const daySegments=(machine,w)=>{
    const out=[];
    const piece=(b,key,a,z,setup)=>{if(z>a)out.push({b,key,setup,left:(a-w[0])/(w[1]-w[0])*100,width:(z-a)/(w[1]-w[0])*100,sec:(z-a)/1000});};
    plan.blocks.filter(b=>b.machine===machine).forEach((b,bi)=>b.segs.forEach(([s,e],si)=>{
      if(e<=w[0]||s>=w[1]) return;
      const a=Math.max(s,w[0]),z=Math.min(e,w[1]);
      const cut=b.setupEnd==null?a:Math.min(Math.max(b.setupEnd,a),z);
      piece(b,`${bi}-${si}-s`,a,cut,true);
      piece(b,`${bi}-${si}-r`,cut,z,false);
    }));
    return out;
  };
  const blockInfo=b=>b.live
    ?`Kører nu: ${b.label} (${b.operator||""})${b.guess?" — ingen historik, regnes som færdig i dag":b.inSetup?" — i opstilling":""}`
    :`${b.pinned?"📌 Låst — træk igen for at flytte, lås op under Ordrer\n":"Træk for at flytte og låse den\n"}${b.label} · trin ${b.stepIdx+1}\nOpstilling ${b.setupSaved?`springes over (${b.machine} er allerede stillet op til emnet, sparer ${fmtHM(b.setupSaved)})`:fmtHM(b.setupSec)} + produktion ${fmtHM(b.runSec)}`;

  if(view==="import") return <PlanImport jobs={jobs} machines={machines} allDepts={allDepts} deptOrder={deptOrder} onCancel={()=>setView("orders")}
    onAdd={list=>{saveOrders(prev=>[...prev,...list.map(o=>({...o,rank:dueTs(o),updatedAt:Date.now()}))]);setView("month");}}/>;
  if(editing) return <PlanOrderForm order={editing} jobs={jobs} machines={machines} activeMachines={activeMachines} allDepts={allDepts} deptOrder={deptOrder}
    onCancel={()=>setEditing(null)}
    onSave={o=>{const {isNew,...clean}=o;upsert(isNew?{...clean,rank:dueTs(clean)}:clean);setEditing(null);setSelectedId(o.id);}}/>;

  // ── Week view ──
  const weekStart=(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+weekOffset*7);return d.getTime();})();
  const weekDays=[...Array(7)].map((_,i)=>addDays(weekStart,i));
  const todayStart=new Date().setHours(0,0,0,0);
  const weekNo=(()=>{const t=new Date(weekStart);t.setDate(t.getDate()+3);const w1=new Date(t.getFullYear(),0,4);return 1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);})();

  // Setup = same colour, darkened, so setup vs run shows at a glance
  const blockStyle=(b,selected,setup)=>({position:"absolute",top:3,bottom:3,overflow:"hidden",whiteSpace:"nowrap",fontSize:12,lineHeight:"14px",padding:"1px 3px",cursor:b.live?"default":"pointer",
    color:b.live||setup?C.text:"#111",fontWeight:700,
    background:b.live
      ?(setup?"repeating-linear-gradient(45deg,#2a3546,#2a3546 4px,#202a38 4px,#202a38 8px)":"repeating-linear-gradient(45deg,#3a4a60,#3a4a60 4px,#2e3b4e 4px,#2e3b4e 8px)")
      :setup?`linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.5)),${colorOf(b.orderId)}`:colorOf(b.orderId),
    opacity:selectedId&&!selected?0.3:1,boxSizing:"border-box",
    border:b.overlap?`2px solid ${C.red}`:selected?"2px solid #fff":b.pinned?"1px dashed #fff":"none"});

  const weekView=(
    <div style={{...card(),padding:"10px 8px",overflowX:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button style={btn("outline",false,true)} onClick={()=>setWeekOffset(w=>w-1)}><i className="ti ti-chevron-left"/></button>
        <div style={{fontSize:15,color:C.text,fontWeight:700}}>Uge {weekNo} · {fmtDay(weekDays[0])} – {fmtDay(weekDays[6])}</div>
        <button style={btn("outline",false,true)} onClick={()=>setWeekOffset(w=>w+1)}><i className="ti ti-chevron-right"/></button>
        {weekOffset!==0&&<button style={btn("outline",false,true)} onClick={()=>setWeekOffset(0)}>Denne uge</button>}
      </div>
      <div style={{minWidth:760}}>
        <div style={{display:"grid",gridTemplateColumns:"110px repeat(7,1fr)",gap:2,marginBottom:2}}>
          <div/>
          {weekDays.map(d=><div key={d} style={{fontSize:12,textAlign:"center",color:d===todayStart?C.amber:C.muted,fontWeight:d===todayStart?700:400,letterSpacing:1,textTransform:"uppercase"}}>{fmtDay(d)}</div>)}
        </div>
        {activeMachines.map(m=>(
          <div key={m.id} style={{display:"grid",gridTemplateColumns:"110px repeat(7,1fr)",gap:2,marginBottom:2}}>
            <div style={{fontSize:14,color:C.text,padding:"6px 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {m.name}{m.department&&<div style={{fontSize:11,color:C.muted}}>{m.department}</div>}
            </div>
            {weekDays.map(d=>{
              const w=dayWindow(workHours,d);
              if(!w) return <div key={d} style={{background:"rgba(255,255,255,.02)",borderRadius:4,minHeight:34}}/>;
              return(
                <div key={d} onDragOver={e=>e.preventDefault()} onDrop={e=>dropOn(e,m,w)}
                  style={{position:"relative",background:C.raised,borderRadius:4,minHeight:34,outline:d===todayStart?`1px solid ${C.amber}55`:"none"}}>
                  {daySegments(m.name,w).map(({b,key,left,width,setup})=>(
                    <div key={key} title={`${setup?"OPSTILLING — ":""}${blockInfo(b)}\n${fmtDate(b.segs[0]?.[0]??b.end)} → ${fmtDate(b.end)}`}
                      draggable={!b.live}
                      onDragStart={e=>{e.dataTransfer.setData("text/plain",JSON.stringify({orderId:b.orderId,stepIdx:b.stepIdx}));e.dataTransfer.effectAllowed="move";}}
                      onClick={()=>!b.live&&setSelectedId(id=>id===b.orderId?null:b.orderId)}
                      style={{...blockStyle(b,b.orderId===selectedId,setup),left:`${left}%`,width:`${width}%`,cursor:b.live?"default":"grab"}}>
                      {width>12?(setup?"Opstilling":(b.pinned?"📌 ":"")+b.label):""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:12,color:C.muted,marginTop:8}}>Hver dag viser arbejdstiden. Mørk del = opstilling, lys del = produktion. Stribet = kører nu (anslået). <b style={{color:C.text}}>Træk en blok</b> til en anden dag, tid eller maskine (samme afdeling) for at låse den dér 📌 — alt andet planlægges uden om. Tryk på en blok for at fremhæve ordren; hold musen over for tider.</div>
    </div>
  );

  // ── Month view ──
  const monthStart=(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(1);d.setMonth(d.getMonth()+monthOffset);return d.getTime();})();
  const monthDays=(()=>{const out=[];let t=monthStart;const m=new Date(monthStart).getMonth();while(new Date(t).getMonth()===m){out.push(t);t=addDays(t,1);}return out;})();
  const monthLabel=new Date(monthStart).toLocaleDateString("da-DK",{month:"long",year:"numeric"});
  const monthEnd=addDays(monthDays[monthDays.length-1],1);
  const finishing=plan.ordered.filter(o=>{const r=plan.results[o.id];return r?.end&&r.end>=monthStart&&r.end<monthEnd;}).sort((a,b)=>plan.results[a.id].end-plan.results[b.id].end);

  const monthView=(
    <div style={{...card(),padding:"10px 8px",overflowX:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button style={btn("outline",false,true)} onClick={()=>setMonthOffset(m=>m-1)}><i className="ti ti-chevron-left"/></button>
        <div style={{fontSize:15,color:C.text,fontWeight:700,textTransform:"capitalize"}}>{monthLabel}</div>
        <button style={btn("outline",false,true)} onClick={()=>setMonthOffset(m=>m+1)}><i className="ti ti-chevron-right"/></button>
        {monthOffset!==0&&<button style={btn("outline",false,true)} onClick={()=>setMonthOffset(0)}>Denne måned</button>}
      </div>
      <div style={{minWidth:760}}>
        <div style={{display:"grid",gridTemplateColumns:`110px repeat(${monthDays.length},1fr)`,gap:1,marginBottom:2}}>
          <div/>
          {monthDays.map(d=><div key={d} style={{fontSize:11,textAlign:"center",color:d===todayStart?C.amber:C.muted,fontWeight:d===todayStart?700:400}}>{new Date(d).getDate()}<br/>{"SMTOTFL"[new Date(d).getDay()]}</div>)}
        </div>
        {activeMachines.map(m=>(
          <div key={m.id} style={{display:"grid",gridTemplateColumns:`110px repeat(${monthDays.length},1fr)`,gap:1,marginBottom:1}}>
            <div style={{fontSize:14,color:C.text,padding:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
            {monthDays.map(d=>{
              const w=dayWindow(workHours,d);
              if(!w) return <div key={d} style={{background:"rgba(255,255,255,.02)",borderRadius:2,minHeight:24}}/>;
              const segs=daySegments(m.name,w);
              const daySec=(w[1]-w[0])/1000;
              const load=Math.min(1,segs.reduce((s,x)=>s+x.sec,0)/daySec);
              const setupLoad=Math.min(load,segs.filter(x=>x.setup).reduce((s,x)=>s+x.sec,0)/daySec);
              const sel=selectedId&&segs.some(x=>x.b.orderId===selectedId);
              return <div key={d} title={`${m.name} · ${fmtDay(d)}\n${Math.round(load*100)}% planlagt — ${Math.round(setupLoad*100)}% opstilling, ${Math.round((load-setupLoad)*100)}% produktion${segs.length?"\n"+[...new Set(segs.map(x=>x.b.label))].join("\n"):""}`}
                style={{position:"relative",overflow:"hidden",background:load?`rgba(59,130,246,${0.15+load*0.75})`:C.raised,borderRadius:2,minHeight:24,fontSize:11,color:"#fff",textAlign:"center",lineHeight:"24px",outline:sel?"2px solid #fff":d===todayStart?`1px solid ${C.amber}88`:"none"}}>
                {load>=0.05?Math.round(load*100):""}
                {setupLoad>0&&<div style={{position:"absolute",left:0,right:0,bottom:0,height:`${Math.max(8,setupLoad*100)}%`,background:"rgba(240,165,0,.75)"}}/>}
              </div>;
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:12,color:C.muted,marginTop:8,marginBottom:12}}>Tallene = % af dagens arbejdstid planlagt på maskinen; den <span style={{color:C.amber}}>gule del</span> er opstilling. Hold musen over en dag for at se jobbene.</div>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Bliver færdige i {monthLabel}</div>
      {!finishing.length&&<div style={{fontSize:14,color:C.muted}}>Ingen ordrer bliver færdige denne måned.</div>}
      {finishing.map(o=>{const r=plan.results[o.id];return(
        <div key={o.id} onClick={()=>setSelectedId(id=>id===o.id?null:o.id)} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 8px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:o.id===selectedId?C.raised:"transparent"}}>
          <span style={{width:10,height:10,borderRadius:2,background:colorOf(o.id),flexShrink:0}}/>
          <span style={{flex:1,fontSize:15,color:C.text}}>{[o.customer,o.partNumber].filter(Boolean).join(" · ")} <span style={{color:C.muted}}>× {o.quantity}</span></span>
          <span style={{fontSize:14,color:r.late?C.red:C.green}}>{fmtDay(r.end)}</span>
          <span style={{fontSize:13,color:C.muted}}>leveres {o.dueDate?fmtDay(dueTs(o)):"—"}</span>
        </div>
      );})}
    </div>
  );

  // ── Orders view ──
  const ordersView=(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <button style={btn("outline",false,true)} onClick={sortByDue} title="Fortryd manuelle ▲▼-flytninger"><i className="ti ti-sort-ascending"/> Sorter efter leveringsdato</button>
        {pinnedCount>0&&<button style={btn("outline",false,true)} onClick={unpinAll} title="Lad planlæggeren placere alt igen"><i className="ti ti-pinned-off"/> Lås alle op ({pinnedCount})</button>}
        <button style={btn("outline",false,true)} onClick={()=>setView("import")}><i className="ti ti-file-import"/> Importer ordrer</button>
      </div>
      {!plan.ordered.length&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen ordrer endnu. Tryk "Ny ordre" for at tilføje en.</div>}
      {plan.ordered.map((o,i)=>{
        const r=plan.results[o.id]||{};
        return(
          <div key={o.id} style={{...card(colorOf(o.id)),cursor:"pointer",outline:o.id===selectedId?"1px solid #fff":"none"}} onClick={()=>setSelectedId(id=>id===o.id?null:o.id)}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}} onClick={e=>e.stopPropagation()}>
                <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===0} onClick={()=>move(o,-1)}><i className="ti ti-chevron-up"/></button>
                <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===plan.ordered.length-1} onClick={()=>move(o,1)}><i className="ti ti-chevron-down"/></button>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700}}>
                  {o.urgent&&<span style={{...badge("down"),marginRight:6}}>Haster</span>}
                  {[o.customer,o.partNumber].filter(Boolean).join(" · ")} <span style={{color:C.muted,fontWeight:400}}>× {o.quantity}</span>
                </div>
                <div style={{fontSize:13,color:C.muted,marginTop:2}}>Leveres {o.dueDate?fmtDay(dueTs(o)):"— (ingen leveringsdato)"}{r.end&&<> · planlagt færdig <span style={{color:r.late?C.red:C.green,fontWeight:700}}>{fmtDate(r.end)}</span></>}{r.late&&<span style={{color:C.red,fontWeight:700}}> · FORSINKET</span>}</div>
                {r.problem&&<div style={{fontSize:13,color:C.amber,marginTop:4}}><i className="ti ti-alert-triangle"/> {r.problem}</div>}
                {r.warning&&<div style={{fontSize:13,color:C.amber,marginTop:4}}><i className="ti ti-pin"/> {r.warning}</div>}
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                  {(o.steps||[]).map((st,si)=>{const b=r.steps?.[si];return(
                    <span key={st.id||si} style={{fontSize:12,padding:"2px 6px",borderRadius:4,background:C.raised,color:C.text,border:st.pin?"1px dashed #fff":"none",display:"inline-flex",alignItems:"center",gap:4}}>
                      {st.pin&&"📌"}{si+1}. {st.department||"—"} → {b?b.machine:(st.machine||"any")}{b&&<span style={{color:C.muted}}> · <span style={{color:C.amber}}>{b.setupSaved?"ingen opstilling":`${fmtHM(b.setupSec)} setup`}</span> + <span style={{color:C.green}}>{fmtHM(b.runSec)} produktion</span> · {st.pin?fmtDate(b.start):fmtDay(b.start)}</span>}
                      {st.pin&&<button title="Lås op — lad planlæggeren placere den" onClick={e=>{e.stopPropagation();setPin(o.id,si,null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:0,fontSize:14}}><i className="ti ti-x"/></button>}
                    </span>
                  );})}
                </div>
              </div>
              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                <button style={btn(o.urgent?"danger":"outline",false,true)} title="Haster — planlæg før alt andet" onClick={()=>patch(o,{urgent:!o.urgent})}><i className="ti ti-flame"/></button>
                <button style={btn("outline",false,true)} title="Rediger" onClick={()=>setEditing({...o})}><i className="ti ti-pencil"/></button>
                <button style={btn("success",false,true)} title="Ordren er færdig — fjern fra planen" onClick={()=>patch(o,{done:true,doneAt:Date.now()})}><i className="ti ti-check"/></button>
                <button style={btn("outline",false,true)} title="Slet" onClick={()=>{if(window.confirm(`Slet ordre ${o.partNumber}?`))patch(o,{deleted:true});}}><i className="ti ti-trash"/></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontSize:15,color:C.amber,letterSpacing:2,textTransform:"uppercase",fontWeight:700}}><i className="ti ti-calendar-time"/> Planlægning <span style={{fontSize:12,background:C.blue,color:"#fff",borderRadius:4,padding:"1px 5px",letterSpacing:1}}>BETA</span></div>
        <div style={{flex:1}}/>
        {[["week","Uge"],["month","Måned"],["orders",`Ordrer (${plan.ordered.length})`],["settings","Indstillinger"]].map(([v,l])=><button key={v} style={tag(view===v)} onClick={()=>setView(v)}>{l}</button>)}
        <button style={btn("outline",false,true)} onClick={()=>setView("import")}><i className="ti ti-file-import"/> Importer</button>
        <button style={btn("primary",false,true)} onClick={newOrder}><i className="ti ti-plus"/> Ny ordre</button>
      </div>
      {(problems.length>0||lateCount>0)&&(
        <div style={{background:"rgba(240,165,0,.08)",border:`1px solid rgba(240,165,0,.3)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:14,color:C.amber}}>
          {lateCount>0&&<div><i className="ti ti-clock-exclamation"/> {lateCount} ordre{lateCount!==1?"r":""} planlagt til at blive færdig efter leveringsdatoen</div>}
          {problems.map(o=><div key={o.id}><i className="ti ti-alert-triangle"/> {o.partNumber}: {plan.results[o.id].problem||plan.results[o.id].warning}</div>)}
        </div>
      )}
      {view==="week"&&weekView}
      {view==="month"&&monthView}
      {view==="orders"&&ordersView}
      {view==="settings"&&(
        <div style={{...card(),maxWidth:520}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Afdelingernes rækkefølge</div>
          <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Den rækkefølge et job går gennem afdelingerne. En rute følger altid denne rækkefølge — et job der kun skal i nogle afdelinger, springer de andre over.</div>
          {deptOrder.length===0&&<div style={{fontSize:14,color:C.muted}}>Ingen afdelinger endnu — tilføj dem under Administration → Afdelinger og giv hver maskine sin afdeling.</div>}
          {deptOrder.map((d,i)=>(
            <div key={d} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:C.raised,borderRadius:6,marginBottom:4}}>
              <span style={{fontSize:16,color:C.amber,fontWeight:700,width:20}}>{i+1}</span>
              <span style={{flex:1,fontSize:16,color:C.text}}>{d} <span style={{fontSize:13,color:C.muted}}>· {machines.filter(m=>m.active&&m.department===d).map(m=>m.name).join(", ")||"ingen maskiner"}</span></span>
              <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===0} onClick={()=>{const n=[...deptOrder];[n[i-1],n[i]]=[n[i],n[i-1]];saveSettings({deptOrder:n});}}><i className="ti ti-chevron-up"/></button>
              <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===deptOrder.length-1} onClick={()=>{const n=[...deptOrder];[n[i+1],n[i]]=[n[i],n[i+1]];saveSettings({deptOrder:n});}}><i className="ti ti-chevron-down"/></button>
            </div>
          ))}
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 6px"}}>Opstillinger</div>
          <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:15,color:C.text,cursor:"pointer"}}>
            <input type="checkbox" checked={groupSameParts} onChange={e=>saveSettings({groupSameParts:e.target.checked})} style={{marginTop:2}}/>
            <span>Saml samme emner for at spare opstillinger<div style={{fontSize:13,color:C.muted,marginTop:2}}>Ordrer på samme emne med leveringsdato inden for 7 dage af hinanden planlægges lige efter hinanden, så maskinen forbliver stillet op.</div></span>
          </label>
        </div>
      )}
      <div style={{fontSize:12,color:C.muted,marginTop:12,lineHeight:1.6}}>
        Beta: tider kommer fra medianen af tidligere afsluttede kørsler af samme emne (samme maskine først, ellers samme afdeling), eller de minutter du indtaster.
        Maskiner planlægges kun inden for arbejdstiden — ingen nat- eller ubemandet kørsel endnu. Job der kører, optager deres maskine i den typiske resterende tid.
      </div>
    </div>
  );
}

// New / edit planning order: customer, part, quantity, due date and the route
function PlanOrderForm({order,jobs,machines,activeMachines,allDepts,deptOrder,onCancel,onSave}){
  const [o,setO]=useState(order);
  const [err,setErr]=useState("");
  const set=(k,v)=>setO(p=>({...p,[k]:v}));
  const hist=partHistory(jobs,machines,o.partNumber);
  const suggested=sortSteps(suggestRoute(hist),deptOrder);
  // Tick a department to add/remove its step; steps stay in department order
  const toggleDept=d=>setO(p=>{
    const has=p.steps.some(s=>s.department===d);
    const steps=has?p.steps.filter(s=>s.department!==d):sortSteps([...p.steps,{id:Date.now(),department:d,machine:"",setupMin:"",runMinPerPc:""}],deptOrder);
    return {...p,steps};
  });
  const knownParts=useMemo(()=>[...new Set(jobs.filter(j=>j.status==="done"&&j.job).map(j=>j.job.trim()))].sort(),[jobs]);
  const setStep=(i,p)=>setO(x=>({...x,steps:x.steps.map((s,si)=>si===i?{...s,...p}:s)}));
  const moveStep=(i,dir)=>setO(x=>{const s=[...x.steps];const j=i+dir;if(j<0||j>=s.length)return x;[s[i],s[j]]=[s[j],s[i]];return{...x,steps:s};});
  // Fill the route from history the first time a known part is typed
  const onPart=v=>setO(p=>{const n={...p,partNumber:v};if(!p.steps.length){const r=sortSteps(suggestRoute(partHistory(jobs,machines,v)),deptOrder);if(r.length)n.steps=r;}return n;});
  const save=()=>{
    if(!o.partNumber.trim()) return setErr("Tegningsnr. skal udfyldes");
    if(!(parseInt(o.quantity)>0)) return setErr("Antal skal være mindst 1");
    if(!o.steps.length) return setErr("Tilføj mindst ét trin");
    if(o.steps.some(s=>!s.department&&!s.machine)) return setErr("Hvert trin skal have en afdeling eller en maskine");
    onSave({...o,partNumber:o.partNumber.trim(),customer:o.customer.trim(),quantity:parseInt(o.quantity)});
  };
  const qty=parseInt(o.quantity)||0;
  return(
    <div style={{padding:"14px 16px",maxWidth:760}}>
      <button style={{...btn("outline",false,true),marginBottom:12}} onClick={onCancel}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{order.isNew?"Ny ordre":"Rediger ordre"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><label style={label}>Kunde</label><input style={inp()} value={o.customer} onChange={e=>set("customer",e.target.value)}/></div>
        <div><label style={label}>Tegningsnr. *</label><input style={inp()} list="plan-parts" value={o.partNumber} onChange={e=>onPart(e.target.value)}/>
          <datalist id="plan-parts">{knownParts.map(p=><option key={p} value={p}/>)}</datalist>
          <div style={{fontSize:12,color:hist.length?C.green:C.muted,marginTop:4}}>{hist.length?`${hist.length} tidligere ${hist.length!==1?"kørsler":"kørsel"} fundet`:o.partNumber?"Nyt emne — ingen historik, indtast minutter pr. trin":""}</div>
        </div>
        <div><label style={label}>Antal *</label><input type="number" min="1" style={inp()} value={o.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
        <div><label style={label}>Leveringsdato</label><input type="date" style={inp()} value={o.dueDate} onChange={e=>set("dueDate",e.target.value)}/></div>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:o.urgent?C.red:C.muted,marginBottom:14,cursor:"pointer"}}>
        <input type="checkbox" checked={!!o.urgent} onChange={e=>set("urgent",e.target.checked)}/> Haster — planlæg før alt andet
      </label>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Rute — sæt kryds ved de afdelinger jobbet skal igennem</div>
        {suggested.length>0&&<button style={btn("outline",false,true)} onClick={()=>set("steps",suggested)}><i className="ti ti-history"/> Brug tidligere rute ({suggested.length})</button>}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        {deptOrder.map((d,i)=>{const on=o.steps.some(s=>s.department===d);return(
          <span key={d} style={{display:"inline-flex",alignItems:"center",gap:6}}>
            {i>0&&<i className="ti ti-arrow-right" style={{color:C.muted,fontSize:15}}/>}
            <button type="button" onClick={()=>toggleDept(d)} style={{...tag(on),fontSize:14,padding:"6px 12px"}}>{on&&<i className="ti ti-check"/>} {d}</button>
          </span>
        );})}
      </div>
      {o.steps.map((st,i)=>{
        const {est,durationSec,setupSec,runSec}=stepDuration(st,qty,hist);
        const deptMachines=activeMachines.filter(m=>!st.department||m.department===st.department);
        return(
          <div key={st.id||i} style={{...card(),padding:"10px 12px"}}>
            <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 90px 100px auto",gap:8,alignItems:"end"}}>
              <div style={{fontSize:18,color:C.amber,fontWeight:700,paddingBottom:10}}>{i+1}</div>
              <div><label style={label}>Afdeling</label>
                <select style={sel()} value={st.department} onChange={e=>setStep(i,{department:e.target.value,machine:""})}>
                  <option value="">—</option>{allDepts.map(d=><option key={d}>{d}</option>)}
                </select></div>
              <div><label style={label}>Maskine</label>
                <select style={sel()} value={st.machine} onChange={e=>setStep(i,{machine:e.target.value})}>
                  <option value="">{st.department?`Alle i ${st.department}`:"—"}</option>{deptMachines.map(m=><option key={m.id}>{m.name}</option>)}
                </select></div>
              <div><label style={label}>Opstilling min</label><input type="number" min="0" style={inp()} value={st.setupMin} placeholder={est?String(Math.round(est.setupSec/60)):"?"} onChange={e=>setStep(i,{setupMin:e.target.value})}/></div>
              <div><label style={label}>Produktion min / stk</label><input type="number" min="0" step="0.1" style={inp()} value={st.runMinPerPc} placeholder={est?.runPerPcSec!=null?(est.runPerPcSec/60).toFixed(1):"?"} onChange={e=>setStep(i,{runMinPerPc:e.target.value})}/></div>
              <div style={{display:"flex",gap:2,paddingBottom:4}}>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>moveStep(i,-1)}><i className="ti ti-chevron-up"/></button>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>moveStep(i,1)}><i className="ti ti-chevron-down"/></button>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>set("steps",o.steps.filter((_,si)=>si!==i))}><i className="ti ti-x"/></button>
              </div>
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:6,paddingLeft:32}}>
              {est?<>Historik: {Math.round(est.setupSec/60)} min opstilling{est.runPerPcSec!=null?` + ${(est.runPerPcSec/60).toFixed(1)} min/stk`:" (ingen stk.-tal)"} · median af {est.n} {est.n!==1?"kørsler":"kørsel"} {est.basis==="machine"?`på ${st.machine}`:`i ${st.department}`}</>:"Ingen historik for dette trin — indtast minutterne"}
              {durationSec!=null&&<span style={{color:C.text}}> · planlagt {fmtHM(durationSec)} for {qty} stk (<span style={{color:C.amber}}>{fmtHM(setupSec)} opstilling</span> + <span style={{color:C.green}}>{fmtHM(runSec)} produktion</span>)</span>}
            </div>
            {/* Fixed start = pin this step to a machine and time (same as dragging it in the week view) */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,paddingLeft:32,flexWrap:"wrap"}}>
              <span style={{fontSize:13,color:st.pin?C.text:C.muted}}>📌 Fast start</span>
              {st.pin?<>
                <input type="datetime-local" style={{...inp(),width:"auto",fontSize:15,padding:"4px 8px"}} value={toLocalInput(st.pin.start)}
                  onChange={e=>{const t=fromLocalInput(e.target.value);if(t)setStep(i,{pin:{...st.pin,start:t}});}}/>
                <span style={{fontSize:13,color:C.muted}}>på {st.pin.machine}</span>
                <button style={{...btn("outline",false,true),padding:"3px 8px"}} onClick={()=>setStep(i,{pin:null})}>Lås op</button>
              </>:st.machine
                ?<button style={{...btn("outline",false,true),padding:"3px 8px"}} onClick={()=>setStep(i,{pin:{machine:st.machine,start:Math.ceil(Date.now()/900000)*900000}})}>Sæt starttid</button>
                :<span style={{fontSize:13,color:C.muted}}>vælg en maskine først — eller træk blokken i ugevisningen</span>}
            </div>
          </div>
        );
      })}
      <button style={{...btn("outline",false,true),marginBottom:14}} onClick={()=>set("steps",[...o.steps,{id:Date.now(),department:"",machine:"",setupMin:"",runMinPerPc:""}])}><i className="ti ti-plus"/> Tilføj trin</button>
      <div><label style={label}>Noter</label><input style={inp()} value={o.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
      {err&&<div style={{...errMsg,marginTop:10}}>{err}</div>}
      <button style={{...btn("success",true),marginTop:14}} onClick={save}><i className="ti ti-check"/> {order.isNew?"Tilføj til plan":"Gem"}</button>
    </div>
  );
}

// Paste many orders at once (from Excel or the ERP), check them, add them all
function PlanImport({jobs,machines,allDepts,deptOrder,onAdd,onCancel}){
  const [text,setText]=useState("");
  const rows=useMemo(()=>parseImport(text,allDepts).map(r=>{
    if(r.error) return r;
    const hist=partHistory(jobs,machines,r.partNumber);
    const steps=r.depts.length
      ?sortSteps(r.depts.map((d,k)=>({id:Date.now()+k,department:d,machine:"",setupMin:"",runMinPerPc:""})),deptOrder)
      :sortSteps(suggestRoute(hist),deptOrder);
    if(!steps.length) return {...r,error:"Nyt emne og ingen afdelinger angivet — tilføj dem i kolonne 5"};
    const missing=steps.filter(s=>stepDuration(s,r.quantity,hist).durationSec==null).map(s=>s.department||s.machine);
    return {...r,steps,histN:hist.length,missing,routeFrom:r.depts.length?"list":"history"};
  }),[text,jobs,machines,allDepts,deptOrder]);
  const good=rows.filter(r=>!r.error);
  const add=()=>{
    const now=Date.now();
    onAdd(good.map((r,k)=>({id:now+k,customer:r.customer,partNumber:r.partNumber,quantity:r.quantity,dueDate:r.dueDate||"",
      urgent:false,notes:"Importeret",steps:r.steps,createdAt:now})));
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <button style={{...btn("outline",false,true),marginBottom:12}} onClick={onCancel}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}><i className="ti ti-file-import"/> Importer ordrer</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:10,lineHeight:1.6}}>
        Indsæt én ordre pr. linje — direkte fra Excel virker. Kolonner: <b style={{color:C.text}}>Kunde · Tegningsnr. · Antal · Leveringsdato · Afdelinger</b> (afdelinger er valgfrie).<br/>
        Uden afdelinger hentes ruten fra emnets historik. Afdelinger kan forkortes og stå i vilkårlig rækkefølge: <code>Turning+Milling</code>, <code>T, F, M</code> — de sættes altid i afdelingernes rækkefølge ({deptOrder.join(" → ")||"sættes under Indstillinger"}).
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} spellCheck={false}
        placeholder={"Acme\tTEST-100\t200\t31-10-2026\nBeta Co\t5521-3\t50\t2026-11-05\tTurning+Milling"}
        style={{...inp(),fontFamily:"'Share Tech Mono',monospace",fontSize:15,resize:"vertical"}}/>
      {rows.length>0&&(
        <div style={{overflowX:"auto",marginTop:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead><tr>{["","Kunde","Tegningsnr.","Antal","Leveres","Rute","Tider"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=>r.error
              ?<tr key={i}><td style={{...td,color:C.red}}><i className="ti ti-x"/></td><td colSpan={6} style={{...td,color:C.red}}>{r.error} <span style={{color:C.muted}}>— “{r.line}”</span></td></tr>
              :<tr key={i}>
                <td style={{...td,color:r.missing.length?C.amber:C.green}}><i className={`ti ti-${r.missing.length?"alert-triangle":"check"}`}/></td>
                <td style={td}>{r.customer}</td><td style={td}>{r.partNumber}</td><td style={td}>{r.quantity}</td>
                <td style={td}>{r.dueDate||"—"}</td>
                <td style={td}>{r.steps.map(s=>s.department||s.machine).join(" → ")} <span style={{color:C.muted,fontSize:12}}>({r.routeFrom==="history"?"fra historik":"fra listen"})</span></td>
                <td style={{...td,color:r.missing.length?C.amber:C.muted,fontSize:13}}>{r.missing.length?`Ingen historik for ${r.missing.join(", ")} — indtast minutter efter import`:`fra ${r.histN} tidligere ${r.histN!==1?"kørsler":"kørsel"}`}</td>
              </tr>)}</tbody>
          </table>
        </div>
      )}
      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:14}}>
        <button style={btn("success",false)} disabled={!good.length} onClick={add}><i className="ti ti-check"/> Tilføj {good.length} ordre{good.length!==1?"r":""} til planen</button>
        {rows.length>good.length&&<span style={{fontSize:14,color:C.red}}>{rows.length-good.length} linje{rows.length-good.length!==1?"r":""} med fejl springes over</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DELEGATE JOBS — reassign active jobs when operator is away
// ═══════════════════════════════════════════════════════
function DelegateJobs({users,jobs,setJobs,saveNow}){
  const operators=users.filter(u=>u.active&&!u.removed&&u.role!=="admin");
  const [fromId,setFromId]=useState("");
  // assignments: { [jobId]: operatorId string }
  const [assignments,setAssignments]=useState({});
  const [delegated,setDelegated]=useState([]); // summary after confirm

  const fromUser=operators.find(u=>String(u.id)===fromId);
  const activeJobs=fromUser?jobs.filter(j=>j.operatorId===fromUser.id&&j.status!=="done"&&!j.deleted):[];

  const setAssign=(jobId,toId)=>setAssignments(prev=>({...prev,[jobId]:toId}));

  const readyJobs=activeJobs.filter(j=>assignments[j.id]);
  const canConfirm=readyJobs.length>0;

  const confirm=()=>{
    const now=Date.now();
    const summary=[];
    setJobs(prev=>prev.map(j=>{
      const toId=assignments[j.id];
      if(!toId) return j;
      const toUser=operators.find(u=>String(u.id)===toId);
      if(!toUser) return j;
      summary.push({job:j.job||j.partNumber||"Job",machine:j.machine||"",to:toUser.name});
      return{...j,operatorId:toUser.id,operatorName:toUser.name,lastModifiedAt:now};
    }));
    saveNow&&saveNow();
    setDelegated(summary);
  };

  const reset=()=>{setFromId("");setAssignments({});setDelegated([]);};

  const selStyle={background:"#1a2535",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:15,padding:"4px 8px",outline:"none"};

  if(delegated.length>0) return(
    <div style={{maxWidth:480}}>
      <div style={{color:C.green,fontWeight:700,fontSize:16,marginBottom:12}}><i className="ti ti-circle-check"/> {delegated.length} job uddelegeret</div>
      {delegated.map((d,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:15}}>
          <span style={{color:C.text,fontWeight:600}}>{d.job}</span>
          <span style={{color:C.muted}}>{d.machine}</span>
          <span style={{color:C.amber}}>→ {d.to}</span>
        </div>
      ))}
      <button style={{...btn("outline"),marginTop:16}} onClick={reset}>Uddeleger igen</button>
    </div>
  );

  return(
    <div style={{maxWidth:560}}>
      <div style={{color:C.muted,fontSize:15,marginBottom:16,lineHeight:1.6}}>
        Vælg den fraværende operatør, og giv hvert job til den der skal overtage det. Lad et job stå uden for at holde det i bero.
      </div>

      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:6}}>FRAVÆRENDE OPERATØR</div>
        <select style={{...selStyle,width:220,fontSize:16,padding:"6px 10px"}} value={fromId} onChange={e=>{setFromId(e.target.value);setAssignments({});}}>
          <option value="">— Vælg operatør —</option>
          {operators.map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
        </select>
      </div>

      {fromUser&&activeJobs.length===0&&(
        <div style={{color:C.muted,fontSize:15}}>{fromUser.name} har ingen aktive job.</div>
      )}

      {fromUser&&activeJobs.length>0&&(<>
        <div style={{fontSize:14,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:8}}>
          FORDEL JOB — {readyJobs.length} af {activeJobs.length} fordelt
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
          {activeJobs.map(j=>{
            const assigned=assignments[j.id]||"";
            return(
              <div key={j.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center",background:"#1a2535",border:`1px solid ${assigned?C.amber:C.border}`,borderRadius:8,padding:"8px 12px"}}>
                <div>
                  <div style={{color:C.text,fontWeight:600,fontSize:16}}>{j.job||j.partNumber||"Job"}</div>
                  <div style={{color:C.muted,fontSize:14}}>{j.machine||""}{j.op?` · Op ${j.op}`:""}</div>
                </div>
                <select style={selStyle} value={assigned} onChange={e=>setAssign(j.id,e.target.value)}>
                  <option value="">— Hold i bero —</option>
                  {operators.filter(u=>u.id!==fromUser.id).map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
                </select>
                {assigned&&<i className="ti ti-check" style={{color:C.green,fontSize:16}}/>}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button style={{...btn("filled"),background:canConfirm?C.amber:"#333",color:canConfirm?"#000":C.muted,fontWeight:700,cursor:canConfirm?"pointer":"default"}} onClick={canConfirm?confirm:undefined}>
            <i className="ti ti-arrows-exchange"/> Bekræft {readyJobs.length} uddelegering{readyJobs.length!==1?"er":""}
          </button>
          {activeJobs.length>1&&(
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14,color:C.muted,whiteSpace:"nowrap"}}>Giv alle til:</span>
              <select style={{...selStyle,fontSize:15,padding:"4px 8px"}} defaultValue="" onChange={e=>{
                const toId=e.target.value;
                if(!toId) return;
                const all={};activeJobs.forEach(j=>{all[j.id]=toId;});
                setAssignments(all);
                e.target.value="";
              }}>
                <option value="">— Vælg operatør —</option>
                {operators.filter(u=>u.id!==fromUser.id).map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════
function ManageTab({users,setUsers,machines,setMachines,workHours,setWorkHours,departments,setDepartments,saveNow,efficiencyGoals,setEfficiencyGoals,jobs,setJobs}){
  const [view,setView]=useState("operators");
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button style={tag(view==="operators")}   onClick={()=>setView("operators")}  ><i className="ti ti-users"/> Operatører</button>
        <button style={tag(view==="machines")}    onClick={()=>setView("machines")}   ><i className="ti ti-robot"/> Maskiner</button>
        <button style={tag(view==="departments")} onClick={()=>setView("departments")}><i className="ti ti-tag"/> Afdelinger</button>
        <button style={tag(view==="goals")}       onClick={()=>setView("goals")}      ><i className="ti ti-target"/> Mål</button>
        <button style={tag(view==="settings")}    onClick={()=>setView("settings")}   ><i className="ti ti-adjustments"/> Indstillinger</button>
        <button style={tag(view==="delegate")}    onClick={()=>setView("delegate")}   ><i className="ti ti-arrows-exchange"/> Uddeleger</button>
      </div>
      {view==="operators"  &&<ManageOperators   users={users} setUsers={setUsers} machines={machines} departments={departments} jobs={jobs} setJobs={setJobs} saveNow={saveNow}/>}
      {view==="machines"   &&<ManageMachines    machines={machines} setMachines={setMachines} departments={departments} jobs={jobs} saveNow={saveNow}/>}
      {view==="departments"&&<ManageDepartments departments={departments} setDepartments={setDepartments} saveNow={saveNow}/>}
      {view==="goals"      &&<ManageEfficiencyGoals efficiencyGoals={efficiencyGoals} setEfficiencyGoals={setEfficiencyGoals} machines={machines} departments={departments} saveNow={saveNow}/>}
      {view==="settings"   &&<WorkHoursSettings workHours={workHours} setWorkHours={setWorkHours} saveNow={saveNow}/>}
      {view==="delegate"   &&<DelegateJobs      users={users} jobs={jobs} setJobs={setJobs} saveNow={saveNow}/>}
    </div>
  );
}

function AdminToolsTab({tools,setTools,toolLog,setToolLog,cabinets,setCabinets,departments,users,machines,saveNow,focusToolId,setFocusToolId}){
  const [view,setView]=useState("tools");
  useEffect(()=>{if(focusToolId) setView("tools");},[focusToolId]);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button style={tag(view==="tools")}    onClick={()=>setView("tools")}   ><i className="ti ti-package"/> Værktøj</button>
        <button style={tag(view==="cabinets")} onClick={()=>setView("cabinets")}><i className="ti ti-archive"/> Skabe</button>
      </div>
      {view==="tools"    &&<ManageTools    tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} saveNow={saveNow} users={users} machines={machines} cabinets={cabinets} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {view==="cabinets" &&<ManageCabinets cabinets={cabinets} setCabinets={setCabinets} departments={departments} saveNow={saveNow}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE CABINETS — admin configures cabinets & drawers
// ═══════════════════════════════════════════════════════
function ManageCabinets({cabinets,setCabinets,departments,saveNow}){
  const [view,setView]=useState("list"); // "list"|"cabinet"|"drawer"
  const [editCabId,setEditCabId]=useState(null);
  const [cabForm,setCabForm]=useState({name:"",departments:[],photoData:null});
  const cabPhotoRef=useRef();
  const [editDrawer,setEditDrawer]=useState(null); // {cabinetId, drawerId|null}
  const [drawerForm,setDrawerForm]=useState({number:"",label:"",rows:6,cols:7});
  const [errs,setErrs]=useState({});
  const [confirmDeleteCabId,setConfirmDeleteCabId]=useState(null);

  const openAddCabinet=()=>{setCabForm({name:"",departments:[]});setEditCabId(null);setErrs({});setView("cabinet");};
  const openEditCabinet=c=>{setCabForm({name:c.name,departments:c.departments||[],photoData:c.photoData||null});setEditCabId(c.id);setErrs({});setView("cabinet");};
  const saveCabinet=()=>{
    if(!cabForm.name.trim()){setErrs({name:"Skal udfyldes"});return;}
    const now=Date.now();
    if(editCabId){
      setCabinets(prev=>prev.map(c=>c.id===editCabId?{...c,name:cabForm.name.trim(),departments:cabForm.departments||[],photoData:cabForm.photoData||null}:c));
    } else {
      setCabinets(prev=>[...prev,{id:now,name:cabForm.name.trim(),departments:cabForm.departments||[],drawers:[],photoData:cabForm.photoData||null}]);
    }
    setView("list");saveNow&&saveNow();
  };
  const deleteCabinet=id=>setConfirmDeleteCabId(id);
  const confirmDeleteCabinet=id=>{
    setCabinets(prev=>prev.filter(c=>c.id!==id));
    setConfirmDeleteCabId(null);
    saveNow&&saveNow();
  };

  const openAddDrawer=cabId=>{setDrawerForm({number:"",label:"",rows:6,cols:7});setEditDrawer({cabinetId:cabId,drawerId:null});setErrs({});setView("drawer");};
  const openEditDrawer=(cabId,d)=>{setDrawerForm({number:d.number,label:d.label||"",rows:d.rows,cols:d.cols});setEditDrawer({cabinetId:cabId,drawerId:d.id});setErrs({});setView("drawer");};
  const saveDrawer=()=>{
    const e={};
    if(!String(drawerForm.number).trim()) e.number="Skal udfyldes";
    if(!drawerForm.rows||drawerForm.rows<1||drawerForm.rows>26) e.rows="1–26";
    if(!drawerForm.cols||drawerForm.cols<1||drawerForm.cols>20) e.cols="1–20";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    const {cabinetId,drawerId}=editDrawer;
    setCabinets(prev=>prev.map(c=>{
      if(c.id!==cabinetId) return c;
      const drawers=drawerId
        ?c.drawers.map(d=>d.id===drawerId?{...d,...drawerForm,rows:parseInt(drawerForm.rows),cols:parseInt(drawerForm.cols),number:String(drawerForm.number).trim()}:d)
        :[...(c.drawers||[]),{id:now,...drawerForm,rows:parseInt(drawerForm.rows),cols:parseInt(drawerForm.cols),number:String(drawerForm.number).trim()}];
      return {...c,drawers};
    }));
    setView("list");saveNow&&saveNow();
  };
  const deleteDrawer=(cabId,drawerId)=>{
    setCabinets(prev=>prev.map(c=>c.id===cabId?{...c,drawers:(c.drawers||[]).filter(d=>d.id!==drawerId)}:c));
    saveNow&&saveNow();
  };

  if(view==="cabinet") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setView("list")}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editCabId?"Rediger skab":"Tilføj skab"}</div>
      <div style={{marginBottom:12}}>
        <label style={label}>Skabets navn *</label>
        <input style={{...inp(errs.name)}} value={cabForm.name} onChange={e=>setCabForm(p=>({...p,name:e.target.value}))} placeholder="f.eks. Skab A eller Hovedværktøjsskab"/>
        {errs.name&&<div style={errMsg}>{errs.name}</div>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Afdelinger</label>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>Operatører i disse afdelinger ser værktøj fra dette skab. Lad stå tomt for at vise det for alle.</div>
        {(departments||[]).length===0
          ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Ingen afdelinger oprettet — gå til Administration → Afdelinger først.</div>
          :<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(departments||[]).map(d=>{
              const on=(cabForm.departments||[]).includes(d);
              return(
                <button key={d} type="button" onClick={()=>setCabForm(p=>{const ds=p.departments||[];return{...p,departments:on?ds.filter(x=>x!==d):[...ds,d]};})}
                  style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${on?C.amber:"rgba(255,255,255,.15)"}`,background:on?"rgba(240,165,0,.15)":"transparent",cursor:"pointer",fontFamily:"inherit",color:on?C.amber:C.muted,fontSize:15,fontWeight:on?700:400,transition:"all .12s"}}>
                  {d}
                </button>
              );
            })}
          </div>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Foto af skabet</label>
        <div style={{border:`2px dashed ${cabForm.photoData?"rgba(39,174,96,.4)":"rgba(255,255,255,.12)"}`,borderRadius:8,padding:cabForm.photoData?12:22,textAlign:"center",cursor:"pointer",background:cabForm.photoData?"rgba(39,174,96,.05)":"transparent",transition:"all .2s"}}
          onClick={()=>cabPhotoRef.current.click()}>
          {cabForm.photoData
            ?<><img src={cabForm.photoData} style={{maxHeight:130,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/><div style={{fontSize:14,color:C.green,letterSpacing:1}}>Foto vedhæftet — tryk for at skifte</div></>
            :<><i className="ti ti-camera" style={{fontSize:30,opacity:0.3,display:"block",marginBottom:8}}/><div style={{fontSize:15,color:C.muted}}>Tryk for at tilføje et foto af skabet</div></>}
        </div>
        <input type="file" ref={cabPhotoRef} accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setCabForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
        {cabForm.photoData&&<button style={{...btn("danger",false,true),marginTop:6,fontSize:12}} onClick={()=>setCabForm(p=>({...p,photoData:null}))}><i className="ti ti-x"/> Fjern foto</button>}
      </div>
      <button style={btn("success",true)} onClick={saveCabinet}><i className="ti ti-check"/> {editCabId?"Gem ændringer":"Tilføj skab"}</button>
    </div>
  );

  if(view==="drawer") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setView("list")}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editDrawer?.drawerId?"Rediger skuffe":"Tilføj skuffe"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Skuffenummer *</label>
          <input style={inp(errs.number)} value={drawerForm.number} onChange={e=>setDrawerForm(p=>({...p,number:e.target.value}))} placeholder="f.eks. 1 eller A"/>
          {errs.number&&<div style={errMsg}>{errs.number}</div>}
        </div>
        <div>
          <label style={label}>Mærkat (valgfri)</label>
          <input style={inp()} value={drawerForm.label} onChange={e=>setDrawerForm(p=>({...p,label:e.target.value}))} placeholder="f.eks. Drejeskær"/>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={label}>Gitterstørrelse</label>
        <div style={{background:C.raised,borderRadius:10,padding:"14px",marginTop:6}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={{...label,marginBottom:4}}>Rækker (A–?)</label>
              <input type="number" min="1" max="26" style={{...inp(errs.rows),textAlign:"center",fontSize:18,color:C.amber}} value={drawerForm.rows} onChange={e=>setDrawerForm(p=>({...p,rows:e.target.value,rows_changed:true}))}/>
              {errs.rows&&<div style={errMsg}>{errs.rows}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:3,textAlign:"center"}}>A–{String.fromCharCode(64+(parseInt(drawerForm.rows)||1))}</div>
            </div>
            <div>
              <label style={{...label,marginBottom:4}}>Kolonner (1–?)</label>
              <input type="number" min="1" max="20" style={{...inp(errs.cols),textAlign:"center",fontSize:18,color:C.amber}} value={drawerForm.cols} onChange={e=>setDrawerForm(p=>({...p,cols:e.target.value}))}/>
              {errs.cols&&<div style={errMsg}>{errs.cols}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:3,textAlign:"center"}}>1–{parseInt(drawerForm.cols)||1}</div>
            </div>
          </div>
          {(()=>{
            const r=Math.min(Math.max(parseInt(drawerForm.rows)||1,1),26);
            const c=Math.min(Math.max(parseInt(drawerForm.cols)||1,1),20);
            const rows=Array.from({length:r},(_,i)=>String.fromCharCode(65+i));
            const cols=Array.from({length:c},(_,i)=>i+1);
            return(
              <div style={{overflowX:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:`16px repeat(${c},18px)`,gap:2,marginBottom:2,minWidth:"fit-content"}}>
                  <div/>{cols.map(n=><div key={n} style={{textAlign:"center",fontSize:10,color:C.muted}}>{n}</div>)}
                </div>
                {rows.map(rv=>(
                  <div key={rv} style={{display:"grid",gridTemplateColumns:`16px repeat(${c},18px)`,gap:2,marginBottom:2,minWidth:"fit-content"}}>
                    <div style={{fontSize:10,color:C.muted,display:"flex",alignItems:"center",justifyContent:"center"}}>{rv}</div>
                    {cols.map(n=><div key={n} style={{width:18,height:18,borderRadius:3,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)"}}/>)}
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{fontSize:13,color:C.muted,textAlign:"center",marginTop:8}}>{(parseInt(drawerForm.rows)||1)*(parseInt(drawerForm.cols)||1)} pladser i alt</div>
        </div>
      </div>
      <button style={btn("success",true)} onClick={saveDrawer}><i className="ti ti-check"/> {editDrawer?.drawerId?"Gem ændringer":"Tilføj skuffe"}</button>
    </div>
  );

  return(
    <div>
      <button style={{...btn("primary",false,true),marginBottom:14}} onClick={openAddCabinet}><i className="ti ti-plus"/> Tilføj skab</button>
      {(cabinets||[]).length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen skabe endnu. Tilføj et for at organisere dit værktøj.</div>}
      {(cabinets||[]).map(cab=>(
        <div key={cab.id} style={{...card(),marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:(cab.departments||[]).length>0?6:10}}>
            {cab.photoData
              ?<img src={cab.photoData} style={{width:40,height:40,borderRadius:7,objectFit:"cover",border:`1px solid ${C.border}`,flexShrink:0}}/>
              :<i className="ti ti-archive" style={{fontSize:18,color:C.amber,flexShrink:0}}/>}
            <div style={{flex:1,fontSize:16,color:C.text,fontWeight:700}}>{cab.name}</div>
            <button style={{...btn("outline",false,true),padding:"6px 8px"}} onClick={()=>openEditCabinet(cab)}><i className="ti ti-edit"/></button>
            <button style={{...btn("danger",false,true),padding:"6px 8px"}} onClick={()=>deleteCabinet(cab.id)}><i className="ti ti-trash"/></button>
          </div>
          {(cab.departments||[]).length>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10,paddingLeft:26}}>
              {(cab.departments||[]).map(d=><span key={d} style={{fontSize:13,color:C.amber,background:"rgba(240,165,0,.12)",padding:"2px 8px",borderRadius:6,border:"1px solid rgba(240,165,0,.25)"}}>{d}</span>)}
            </div>
          )}
          <div style={{paddingLeft:6}}>
            {(cab.drawers||[]).length===0&&<div style={{fontSize:14,color:C.muted,marginBottom:8}}>Ingen skuffer endnu</div>}
            {(cab.drawers||[]).map(d=>{
              const rows=Array.from({length:d.rows},(_,i)=>String.fromCharCode(65+i));
              const colCount=d.cols;
              return(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:C.raised,borderRadius:8,marginBottom:6}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,color:C.text,fontWeight:600}}>Skuffe {d.number}{d.label?<span style={{color:C.muted,fontWeight:400}}> — {d.label}</span>:""}</div>
                    <div style={{fontSize:13,color:C.muted,marginTop:2}}>Gitter: A–{String.fromCharCode(64+d.rows)} × 1–{d.cols} ({d.rows*d.cols} pladser)</div>
                  </div>
                  <button style={{...btn("outline",false,true),padding:"5px 7px",fontSize:14}} onClick={()=>openEditDrawer(cab.id,d)}><i className="ti ti-edit"/></button>
                  <button style={{...btn("danger",false,true),padding:"5px 7px",fontSize:14}} onClick={()=>deleteDrawer(cab.id,d.id)}><i className="ti ti-trash"/></button>
                </div>
              );
            })}
            <button style={{...btn("outline",false,true),marginTop:4,fontSize:14}} onClick={()=>openAddDrawer(cab.id)}><i className="ti ti-plus"/> Tilføj skuffe</button>
          </div>
          {confirmDeleteCabId===cab.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}`,background:"rgba(231,76,60,.07)",borderRadius:8,padding:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:6}}><i className="ti ti-alert-triangle"/> Slet "{cab.name}" og alle dets skuffer?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Alle skuffer og værktøjspladser i dette skab fjernes permanent.</div>
              <div style={{display:"flex",gap:8}}>
                <button style={btn("outline",false,false)} onClick={()=>setConfirmDeleteCabId(null)}>Annuller</button>
                <button style={btn("danger",false,false)} onClick={()=>confirmDeleteCabinet(cab.id)}><i className="ti ti-trash"/> Slet</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WorkHoursSettings({workHours,setWorkHours,saveNow}){
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
  const save=()=>{setWorkHours(local);saveNow&&saveNow();setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const todayHours=local[todayKey];
  return(
    <div>
      <div style={{...card(),border:`1px solid ${C.amber}`}}>
        <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}><i className="ti ti-clock"/> Arbejdstid</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:14}}>
          Logger man ud inden for arbejdstiden, kører tidurene videre. Uden for arbejdstiden (eller på fridage) sættes de automatisk på pause.
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
                    fontFamily:"inherit",fontSize:14,fontWeight:700,letterSpacing:1,
                    border:`1px solid ${dh.enabled?C.green:C.border}`,
                    background:dh.enabled?"rgba(39,174,96,.15)":"transparent",
                    color:dh.enabled?C.green:C.muted,
                    minWidth:120,
                  }}>
                    <i className={`ti ti-${dh.enabled?"check":"x"}`}/>
                    {DAY_NAME[day]}
                    {isToday&&<span style={{color:C.amber,fontWeight:400,marginLeft:2}}>· I dag</span>}
                  </button>
                  {dh.enabled?(
                    <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.green,padding:"4px 8px",fontFamily:"inherit",fontSize:16,width:100}}
                        value={dh.start} onChange={e=>setDay(day,"start",e.target.value)}/>
                      <span style={{color:C.muted,fontSize:15}}>—</span>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.amber,padding:"4px 8px",fontFamily:"inherit",fontSize:16,width:100}}
                        value={dh.end} onChange={e=>setDay(day,"end",e.target.value)}/>
                    </div>
                  ):(
                    <span style={{marginLeft:"auto",fontSize:13,color:C.muted,letterSpacing:1}}>Fridag — tidurene holder altid pause</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button style={btn(saved?"success":"primary",true)} onClick={save}>
          {saved?<><i className="ti ti-check"/> Gemt!</>:<><i className="ti ti-device-floppy"/> Gem arbejdstid</>}
        </button>
      </div>
      <div style={{...card(),marginTop:0}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>I dag ({DAY_NAME[todayKey]})</div>
        {todayHours&&todayHours.enabled
          ?<div style={{fontSize:16,color:C.text}}>
            Tidurene kører videre ved logud mellem <span style={{color:C.green}}>{todayHours.start}</span> og <span style={{color:C.amber}}>{todayHours.end}</span>
          </div>
          :<div style={{fontSize:16,color:C.muted}}>Fridag — tidurene sættes på pause ved logud.</div>
        }
      </div>
    </div>
  );
}

function ManageEfficiencyGoals({efficiencyGoals,setEfficiencyGoals,machines,departments,saveNow}){
  const goals=efficiencyGoals||{overall:80,week:75,month:78,machines:{},departments:{}};

  const setPeriod=(key,v)=>{
    const n=Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>({...prev,[key]:n}));
    saveNow&&saveNow();
  };
  const setMachineGoal=(name,v)=>{
    const n=v===""?undefined:Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>{const m={...prev.machines};if(n===undefined)delete m[name];else m[name]=n;return{...prev,machines:m};});
    saveNow&&saveNow();
  };
  const setDeptGoal=(name,v)=>{
    const n=v===""?undefined:Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>{const d={...prev.departments};if(n===undefined)delete d[name];else d[name]=n;return{...prev,departments:d};});
    saveNow&&saveNow();
  };
  const toggleHideMachine=(name)=>{
    setEfficiencyGoals(prev=>{
      const hidden=prev.hiddenMachines||[];
      const next=hidden.includes(name)?hidden.filter(n=>n!==name):[...hidden,name];
      return{...prev,hiddenMachines:next};
    });
    saveNow&&saveNow();
  };
  const hiddenMachines=goals.hiddenMachines||[];

  const PeriodSlider=({label,icon,colorKey,goalKey,hint})=>{
    const val=goals[goalKey]??80;
    const color=C[colorKey]||C.blue;
    return(
      <div style={{...card(),marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <i className={`ti ${icon}`} style={{color,fontSize:18}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:15,color:C.text,fontWeight:700}}>{label}</div>
            <div style={{fontSize:13,color:C.muted}}>{hint}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,background:C.raised,borderRadius:8,padding:"4px 10px"}}>
            <input type="number" min="0" max="100" value={val} onChange={e=>setPeriod(goalKey,e.target.value)}
              style={{...inp(),width:52,fontSize:24,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",color,padding:"2px 4px",border:"none",background:"transparent"}}/>
            <span style={{fontSize:18,color:C.muted}}>%</span>
          </div>
        </div>
        <input type="range" min="0" max="100" value={val} onChange={e=>setPeriod(goalKey,e.target.value)}
          style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginTop:2}}>
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>
    );
  };

  const OverrideRow=({icon,iconColor,name,val,defaultVal,onChange,onClear,hidden,onToggleHide})=>(
    <div style={{...card(),marginBottom:6,opacity:hidden?0.45:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <i className={`ti ${icon}`} style={{color:hidden?C.muted:iconColor,flexShrink:0,fontSize:18}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:16,color:hidden?C.muted:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:hidden?"line-through":"none"}}>{name}</div>
          <div style={{fontSize:12,color:hidden?C.muted:val!==undefined?iconColor:C.muted,letterSpacing:1}}>
            {hidden?"Skjult i data":val!==undefined?`Eget: ${val}%`:`Standard (${defaultVal}%)`}
          </div>
          {!hidden&&<div style={{height:4,background:C.border,borderRadius:2,marginTop:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${val!==undefined?val:defaultVal}%`,background:val!==undefined?iconColor:C.muted,borderRadius:2,transition:"width .3s"}}/>
          </div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {!hidden&&<><input type="number" min="0" max="100" placeholder={String(defaultVal)} value={val!==undefined?val:""}
            onChange={e=>onChange(e.target.value)}
            style={{...inp(),width:60,fontSize:20,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",color:iconColor,padding:"4px 6px"}}/>
          <span style={{fontSize:15,color:C.muted}}>%</span>
          {val!==undefined&&<button style={{...btn("danger",false,true),padding:"4px 8px"}} title="Nulstil til standard" onClick={onClear}><i className="ti ti-rotate-2"/></button>}</>}
          {onToggleHide&&<button style={{...btn(hidden?"success":"secondary",false,true),padding:"4px 8px"}} title={hidden?"Vis i data":"Skjul i data"} onClick={onToggleHide}>
            <i className={`ti ${hidden?"ti-eye":"ti-eye-off"}`}/>
          </button>}
        </div>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
        <i className="ti ti-calendar-stats"/> Mål pr. periode
      </div>
      <div style={{fontSize:14,color:C.muted,marginBottom:12}}>Angiv hvor effektivt værkstedet skal være i hver periode. Effektivitet = produktionstid ÷ (produktion + opstilling + nedetid).</div>

      <PeriodSlider label="Ugemål"  icon="ti-calendar-week"  colorKey="amber" goalKey="week"    hint="Mål for en uge"/>
      <PeriodSlider label="Månedsmål" icon="ti-calendar-month" colorKey="blue"  goalKey="month"   hint="Mål for en måned"/>
      <PeriodSlider label="Årsmål"  icon="ti-calendar"       colorKey="green" goalKey="overall" hint="Årsmål — bruges også som standard for maskiner &amp; afdelinger"/>

      {machines.filter(m=>m.active).length>0&&(
        <div style={{marginTop:16,marginBottom:4}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-robot"/> Mål pr. maskine <span style={{color:C.muted,fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:13}}>(lad stå tomt for at bruge årsmålet)</span>
          </div>
          {machines.filter(m=>m.active).map(m=>(
            <OverrideRow key={m.id} icon="ti-robot" iconColor={C.amber} name={m.name}
              val={goals.machines[m.name]} defaultVal={goals.overall}
              onChange={v=>setMachineGoal(m.name,v)} onClear={()=>setMachineGoal(m.name,"")}
              hidden={hiddenMachines.includes(m.name)} onToggleHide={()=>toggleHideMachine(m.name)}/>
          ))}
        </div>
      )}

      {(departments||[]).length>0&&(
        <div style={{marginTop:16}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-tag"/> Mål pr. afdeling <span style={{color:C.muted,fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:13}}>(lad stå tomt for at bruge årsmålet)</span>
          </div>
          {(departments||[]).map(d=>(
            <OverrideRow key={d} icon="ti-tag" iconColor={C.green} name={d}
              val={goals.departments[d]} defaultVal={goals.overall}
              onChange={v=>setDeptGoal(d,v)} onClear={()=>setDeptGoal(d,"")}/>
          ))}
        </div>
      )}
      {(departments||[]).length===0&&machines.filter(m=>m.active).length===0&&(
        <div style={{fontSize:14,color:C.muted,textAlign:"center",padding:"20px 0"}}>Tilføj maskiner og afdelinger under deres faner for at sætte mål pr. maskine og afdeling.</div>
      )}
    </div>
  );
}

function ManageDepartments({departments,setDepartments,saveNow}){
  const [adding,setAdding]=useState(false);
  const [newName,setNewName]=useState("");
  const [err,setErr]=useState("");
  const [editingDept,setEditingDept]=useState(null);
  const [editDeptVal,setEditDeptVal]=useState("");
  const [editDeptErr,setEditDeptErr]=useState("");

  const add=()=>{
    const name=newName.trim();
    if(!name){setErr("Skal udfyldes");return;}
    if((departments||[]).includes(name)){setErr("Findes allerede");return;}
    setDepartments(prev=>[...(prev||[]),name].sort());
    setNewName("");setAdding(false);setErr("");
    saveNow&&saveNow();
  };
  const remove=name=>{
    setDepartments(prev=>(prev||[]).filter(d=>d!==name));
    saveNow&&saveNow();
  };
  const startEditDept=d=>{setEditingDept(d);setEditDeptVal(d);setEditDeptErr("");};
  const saveDeptName=oldName=>{
    const nv=editDeptVal.trim();
    if(!nv){setEditDeptErr("Skal udfyldes");return;}
    if(nv!==oldName&&(departments||[]).includes(nv)){setEditDeptErr("Findes allerede");return;}
    setDepartments(prev=>(prev||[]).map(d=>d===oldName?nv:d).sort());
    setEditingDept(null);
    saveNow&&saveNow();
  };

  return(
    <div>
      <button style={{...btn("primary",false,true),marginBottom:14}} onClick={()=>{setAdding(true);setNewName("");setErr("");}}>
        <i className="ti ti-plus"/> Tilføj afdeling
      </button>
      {adding&&(
        <div style={{...card(),marginBottom:10}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Ny afdeling</div>
          <input style={inp(err)} value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} placeholder="f.eks. Drejning" autoFocus onKeyDown={e=>{if(e.key==="Enter")add();if(e.key==="Escape"){setAdding(false);setErr("");}}}/>
          {err&&<div style={errMsg}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
            <button style={btn("outline",true)} onClick={()=>{setAdding(false);setErr("");}}>Annuller</button>
            <button style={btn("success",true)} onClick={add}><i className="ti ti-check"/> Tilføj</button>
          </div>
        </div>
      )}
      {(departments||[]).length===0&&!adding&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen afdelinger endnu. Tilføj en for at organisere operatører, maskiner og skabe.</div>}
      {(departments||[]).map(d=>(
        <div key={d} style={{...card(),marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <i className="ti ti-tag" style={{color:C.amber,flexShrink:0}}/>
            <div style={{flex:1,fontSize:16,color:C.text,fontWeight:600}}>{d}</div>
            <button style={{...btn("outline",false,true),padding:"6px 8px"}} onClick={()=>startEditDept(editingDept===d?null:d)}><i className="ti ti-pencil"/></button>
            <button style={{...btn("danger",false,true),padding:"6px 8px"}} onClick={()=>remove(d)}><i className="ti ti-trash"/></button>
          </div>
          {editingDept===d&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb afdeling</div>
              <input style={inp(editDeptErr)} value={editDeptVal} onChange={e=>{setEditDeptVal(e.target.value);setEditDeptErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveDeptName(d);if(e.key==="Escape")setEditingDept(null);}}/>
              {editDeptErr&&<div style={errMsg}>{editDeptErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditingDept(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveDeptName(d)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ManageOperators({users,setUsers:setUsersRaw,machines,departments,jobs,setJobs,saveNow}){
  const setUsers=fn=>{setUsersRaw(fn);saveNow&&saveNow();};
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [pin,setPin]=useState(""); const [errs,setErrs]=useState({});
  const [editId,setEditId]=useState(null); const [editPin,setEditPin]=useState(""); const [editErr,setEditErr]=useState("");
  const [editDeptId,setEditDeptId]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const [editNameId,setEditNameId]=useState(null); const [editNameVal,setEditNameVal]=useState(""); const [editNameErr,setEditNameErr]=useState("");
  const [showRemoved,setShowRemoved]=useState(false);
  const operators=users.filter(u=>u.role==="operator"&&!u.removed);
  const removed=users.filter(u=>u.role==="operator"&&u.removed);
  const allDepts=(departments||[]).length>0?(departments||[]):[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    const e={};
    if(!name.trim()) e.name="Navn skal udfyldes";
    if(!/^\d{4}$/.test(pin)) e.pin="PIN skal være præcis 4 cifre";
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
    if(!/^\d{4}$/.test(editPin)){setEditErr("Skal være 4 cifre");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,pin:editPin}:u));
    setEditId(null);setEditPin("");setEditErr("");
  };
  const confirmDelete=id=>{
    // Mark as removed — keeps them in users array so their name stays on historical jobs
    setUsers(prev=>prev.map(u=>u.id===id?{...u,removed:true,active:false}:u));
    setDeleteId(null);
  };
  const saveOperatorName=id=>{
    const nv=editNameVal.trim();
    if(!nv){setEditNameErr("Navn skal udfyldes");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,name:nv}:u));
    setJobs(prev=>prev.map(j=>j.operatorId===id?{...j,operatorName:nv}:j));
    setEditNameId(null);setEditNameErr("");
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{operators.length} operatører</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Annuller":"Tilføj operatør"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Ny operatør</div>
          <div style={{marginBottom:10}}><label style={label}>Fulde navn *</label><input style={inp(errs.name)} value={name} onChange={e=>setName(e.target.value)} placeholder="f.eks. Jan Mortensen"/>{errs.name&&<div style={errMsg}>{errs.name}</div>}</div>
          <div style={{marginBottom:12}}><label style={label}>4-cifret PIN *</label><input type="password" inputMode="numeric" maxLength={4} style={{...inp(errs.pin),letterSpacing:8,fontSize:22,textAlign:"center"}} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="••••"/>{errs.pin&&<div style={errMsg}>{errs.pin}</div>}</div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-user-plus"/> Tilføj operatør</button>
        </div>
      )}
      {operators.map(u=>(
        <div key={u.id} style={{...card(),opacity:u.active?1:0.55}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={avatar()}>{initials(u.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,color:C.text,fontWeight:700}}>{u.name}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:2}}>PIN: {"●".repeat(4)} &nbsp;·&nbsp; <span style={{color:u.active?C.green:C.red}}>{u.active?"Aktive":"Inaktiv"}</span></div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditNameId(editNameId===u.id?null:u.id);setEditNameVal(u.name);setEditNameErr("");setEditId(null);setEditDeptId(null);setDeleteId(null);}}><i className="ti ti-pencil"/></button>
              <button style={btn("outline",false,true)} onClick={()=>{setEditId(editId===u.id?null:u.id);setEditDeptId(null);setDeleteId(null);setEditNameId(null);setEditPin("");setEditErr("");}}><i className="ti ti-key"/> PIN</button>
              {allDepts.length>0&&<button style={btn("blue",false,true)} onClick={()=>{setEditDeptId(editDeptId===u.id?null:u.id);setEditId(null);setDeleteId(null);setEditNameId(null);}}><i className="ti ti-building-factory"/> Afd.</button>}
              <button style={btn(u.active?"danger":"success",false,true)} onClick={()=>toggle(u.id)}>{u.active?"Deaktiver":"Aktiver"}</button>
              <button style={btn("danger",false,true)} onClick={()=>{setDeleteId(deleteId===u.id?null:u.id);setEditId(null);setEditDeptId(null);setEditNameId(null);}}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {editNameId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb operatør</div>
              <input style={inp(editNameErr)} value={editNameVal} onChange={e=>{setEditNameVal(e.target.value);setEditNameErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveOperatorName(u.id);if(e.key==="Escape")setEditNameId(null);}}/>
              {editNameErr&&<div style={errMsg}>{editNameErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditNameId(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveOperatorName(u.id)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
          {/* Auto-pause — always visible, saves on change */}
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <i className="ti ti-clock" style={{color:u.autoPauseTime?C.amber:C.muted,fontSize:16,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Automatisk pause kl.</div>
              <input
                type="time"
                style={{...inp(),fontSize:18,color:u.autoPauseTime?C.amber:C.text,padding:"8px 10px",width:"auto",minWidth:120}}
                value={u.autoPauseTime||""}
                onChange={e=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:e.target.value}:x))}
              />
            </div>
            {u.autoPauseTime&&(
              <button style={btn("danger",false,true)} onClick={()=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:""}:x))}>
                <i className="ti ti-x"/> Ryd
              </button>
            )}
          </div>
          {/* Department badges */}
          {(u.departments||[]).length>0&&editDeptId!==u.id&&(
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
              {(u.departments||[]).map(d=>(
                <span key={d} style={{fontSize:13,color:C.blue,background:"rgba(59,130,246,.12)",padding:"2px 8px",borderRadius:10}}>
                  <i className="ti ti-building-factory"/> {d}
                </span>
              ))}
            </div>
          )}
          {(u.departments||[]).length===0&&editDeptId!==u.id&&allDepts.length>0&&(
            <div style={{marginTop:6,fontSize:13,color:C.muted}}><i className="ti ti-eye"/> Ser alle afdelinger</div>
          )}
          {/* Department checkboxes panel */}
          {editDeptId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Afdelinger — {u.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Sæt kryds ved de afdelinger operatøren arbejder i. Lad alle være tomme for at vise alle maskiner.</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {allDepts.map(d=>{
                  const active=(u.departments||[]).includes(d);
                  return(
                    <button key={d} onClick={()=>toggleDept(u.id,d)} style={{
                      padding:"7px 12px",borderRadius:8,border:`1px solid ${active?C.blue:C.border}`,
                      background:active?"rgba(59,130,246,.18)":"transparent",
                      color:active?C.blue:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:15,
                    }}>
                      {active?<i className="ti ti-checkbox"/>:<i className="ti ti-square"/>} {d}
                    </button>
                  );
                })}
              </div>
              <div style={{marginTop:10}}>
                <button style={btn("outline",false,true)} onClick={()=>setEditDeptId(null)}>Færdig</button>
              </div>
            </div>
          )}
          {deleteId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}40`,background:`${C.red}08`,borderRadius:8,padding:12}}>
              <div style={{fontSize:15,color:C.text,marginBottom:4,fontWeight:600}}>Fjern {u.name}?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:12}}>Vedkommende kan ikke længere logge ind. Alle tidligere job og historik bliver gemt under navnet.</div>
              <div style={{display:"flex",gap:8}}>
                <button style={{...btn("danger",true,true),flex:1}} onClick={()=>confirmDelete(u.id)}><i className="ti ti-trash"/> Ja, fjern</button>
                <button style={btn("outline",false,true)} onClick={()=>setDeleteId(null)}>Annuller</button>
              </div>
            </div>
          )}
          {editId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Skift PIN for {u.name}</div>
              <div style={{display:"flex",gap:8}}>
                <input type="password" inputMode="numeric" maxLength={4} style={{...inp(!!editErr),flex:1,letterSpacing:8,fontSize:22,textAlign:"center"}} value={editPin} onChange={e=>setEditPin(e.target.value.replace(/\D/g,""))} placeholder="Ny PIN"/>
                <button style={btn("primary",false,false)} onClick={()=>savePin(u.id)}>Gem</button>
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
            <span><i className="ti ti-user-off"/> Tidligere ansatte · {removed.length}</span>
            <i className={`ti ti-chevron-${showRemoved?"up":"down"}`}/>
          </button>
          {showRemoved&&removed.map(u=>(
            <div key={u.id} style={{...card(),opacity:0.5,marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{...avatar(),background:C.raised,color:C.muted}}>{initials(u.name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,color:C.muted,fontWeight:700}}>{u.name}</div>
                  <div style={{fontSize:13,color:C.muted,marginTop:2}}>Fjernet · historik bevaret</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageMachines({machines,setMachines:setMachinesRaw,departments,jobs,saveNow}){
  const setMachines=fn=>{setMachinesRaw(fn);saveNow&&saveNow();};
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [dept,setDept]=useState(""); const [err,setErr]=useState("");
  const [editTargetId,setEditTargetId]=useState(null); const [editTargetHours,setEditTargetHours]=useState("");
  const [editDeptId,setEditDeptId]=useState(null); const [editDeptVal,setEditDeptVal]=useState("");
  const [editNameId,setEditNameId]=useState(null); const [editNameVal,setEditNameVal]=useState(""); const [editNameErr,setEditNameErr]=useState("");
  const [confirmRemoveId,setConfirmRemoveId]=useState(null);
  const allDepts=(departments||[]).length>0?(departments||[]):[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    if(!name.trim()){setErr("Navn skal udfyldes");return;}
    if(machines.find(m=>m.name.toLowerCase()===name.trim().toLowerCase())){setErr("Maskinen findes allerede");return;}
    setMachines(prev=>[...prev,{id:Date.now(),name:name.trim(),department:dept.trim(),active:true,weeklyTargetHours:0}]);
    setName("");setDept("");setErr("");setAdding(false);
  };
  const saveDept=id=>{
    setMachines(prev=>prev.map(m=>m.id===id?{...m,department:editDeptVal.trim()}:m));
    setEditDeptId(null);
  };
  const toggle=id=>setMachines(prev=>prev.map(m=>m.id===id?{...m,active:!m.active}:m));
  const del=id=>{
    setConfirmRemoveId(id);
    setEditNameId(null);setEditDeptId(null);setEditTargetId(null);
  };
  const confirmRemove=id=>{
    setMachines(prev=>prev.map(m=>m.id===id?{...m,active:false,removed:true}:m));
    setConfirmRemoveId(null);
    if(saveNow) saveNow();
  };
  const openTarget=m=>{setEditTargetId(m.id);setEditTargetHours(m.weeklyTargetHours?String(m.weeklyTargetHours):"");};
  const saveMachineName=id=>{
    const nv=editNameVal.trim();
    if(!nv){setEditNameErr("Navn skal udfyldes");return;}
    if(machines.find(m=>m.id!==id&&m.name.toLowerCase()===nv.toLowerCase())){setEditNameErr("Navnet findes allerede");return;}
    setMachines(prev=>prev.map(m=>m.id===id?{...m,name:nv}:m));
    setEditNameId(null);setEditNameErr("");
  };
  const saveTarget=id=>{
    const h=parseFloat(editTargetHours)||0;
    setMachines(prev=>prev.map(m=>m.id===id?{...m,weeklyTargetHours:h}:m));
    setEditTargetId(null);
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{machines.filter(m=>m.active).length} aktive</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Annuller":"Tilføj maskine"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Ny maskine</div>
          <div style={{marginBottom:10}}><label style={label}>Maskinens navn *</label><input style={inp(!!err)} value={name} onChange={e=>setName(e.target.value)} placeholder="f.eks. CNC-fræser 3"/>{err&&<div style={errMsg}>{err}</div>}</div>
          <div style={{marginBottom:12}}>
            <label style={label}>Afdeling</label>
            <select style={{...inp(),color:dept?C.text:C.muted}} value={dept} onChange={e=>setDept(e.target.value)}>
              <option value="">Ingen afdeling (synlig for alle)</option>
              {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>Valgfrit — bestemmer hvilke operatører der ser maskinen</div>
          </div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-plus"/> Tilføj maskine</button>
        </div>
      )}
      {machines.filter(m=>!m.removed).map(m=>(
        <div key={m.id} style={{...card(),opacity:m.active?1:0.5}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <i className="ti ti-robot" style={{fontSize:20,color:m.active?C.amber:C.muted}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,color:C.text,fontWeight:700}}>{m.name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:13,letterSpacing:1,textTransform:"uppercase",color:m.active?C.green:C.red}}>{m.active?"Aktive":"Inaktiv"}</span>
                {m.department&&<span style={{fontSize:13,color:C.blue,background:"rgba(59,130,246,.12)",padding:"1px 7px",borderRadius:10}}><i className="ti ti-building-factory"/> {m.department}</span>}
              </div>
              {m.weeklyTargetHours>0&&editTargetId!==m.id&&(
                <div style={{fontSize:13,color:C.muted,marginTop:2}}><i className="ti ti-target"/> {m.weeklyTargetHours}t / uge mål</div>
              )}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditNameId(editNameId===m.id?null:m.id);setEditNameVal(m.name);setEditNameErr("");setEditDeptId(null);setEditTargetId(null);}}><i className="ti ti-pencil"/></button>
              <button style={btn("outline",false,true)} onClick={()=>{setEditDeptId(editDeptId===m.id?null:m.id);setEditDeptVal(m.department||"");setEditTargetId(null);setEditNameId(null);}}><i className="ti ti-building-factory"/> Afd.</button>
              <button style={btn("outline",false,true)} onClick={()=>{editTargetId===m.id?setEditTargetId(null):openTarget(m);setEditDeptId(null);setEditNameId(null);}}><i className="ti ti-target"/> Mål</button>
              <button style={btn(m.active?"outline":"success",false,true)} onClick={()=>toggle(m.id)}>{m.active?"Deaktiver":"Aktiver"}</button>
              <button style={btn("danger",false,true)} onClick={()=>del(m.id)}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {editNameId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb maskine</div>
              <input style={inp(editNameErr)} value={editNameVal} onChange={e=>{setEditNameVal(e.target.value);setEditNameErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveMachineName(m.id);if(e.key==="Escape")setEditNameId(null);}}/>
              {editNameErr&&<div style={errMsg}>{editNameErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditNameId(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveMachineName(m.id)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
          {editDeptId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Afdeling — {m.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Operatører i denne afdeling ser maskinen. Lad stå tomt for at vise den for alle.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <select style={{...inp(),flex:1,color:editDeptVal?C.text:C.muted}} value={editDeptVal} onChange={e=>setEditDeptVal(e.target.value)}>
                  <option value="">Ingen afdeling (synlig for alle)</option>
                  {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                <button style={btn("primary",false,false)} onClick={()=>saveDept(m.id)}>Gem</button>
                {m.department&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,department:""}:x));setEditDeptId(null);}}>Ryd</button>}
              </div>
            </div>
          )}
          {editTargetId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Ugentligt produktionsmål — {m.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Antal timer maskinen skal producere pr. uge. Bruges til at følge udnyttelsen under Maskiner.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" min="0" max="168" style={{...inp(),flex:1,fontSize:20,textAlign:"center",color:C.green}} value={editTargetHours} onChange={e=>setEditTargetHours(e.target.value)} placeholder="0"/>
                <div style={{fontSize:15,color:C.muted}}>timer</div>
                <button style={btn("primary",false,false)} onClick={()=>saveTarget(m.id)}>Gem</button>
                {m.weeklyTargetHours>0&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,weeklyTargetHours:0}:x));setEditTargetId(null);}}>Ryd</button>}
              </div>
            </div>
          )}
          {confirmRemoveId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}`,background:"rgba(231,76,60,.07)",borderRadius:8,padding:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:6}}><i className="ti ti-alert-triangle"/> Fjern {m.name}?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>
                Maskinen skjules for operatørerne. Tidligere job bevares.
                {jobs&&(jobs.filter(j=>j.machine===m.name).length>0)&&(
                  <span style={{color:C.amber,fontWeight:600}}> {jobs.filter(j=>j.machine===m.name).length} job henviser til denne maskine.</span>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={btn("outline",false,false)} onClick={()=>setConfirmRemoveId(null)}>Annuller</button>
                <button style={btn("danger",false,false)} onClick={()=>confirmRemove(m.id)}><i className="ti ti-trash"/> Fjern</button>
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
function ToolsTab({user,tools,setTools,toolLog,setToolLog,cabinets,saveNow,focusToolId,setFocusToolId}){
  const [search,setSearch]=useState("");
  const [selectedCabinet,setSelectedCabinet]=useState(null);
  const [selectedType,setSelectedType]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusToolId){
    const ft=tools.find(t2=>String(t2.id)===String(focusToolId));
    if(ft)setSelectedCabinet(String(ft.cabinetId));
    setSelectedId(focusToolId);setFocusToolId&&setFocusToolId(null);
  }},[focusToolId]);
  const [takeQty,setTakeQty]=useState(1);

  const userDepts=user.departments||[];

  // All tools visible to this operator (dept filter)
  const deptVisible=tools.filter(t=>{
    if(!t.active) return false;
    if(userDepts.length>0){
      const cab=(cabinets||[]).find(c=>String(c.id)===String(t.cabinetId));
      const cabDepts=cab?.departments||[];
      if(cabDepts.length>0&&!cabDepts.some(d=>userDepts.includes(d))) return false;
    }
    return true;
  });

  // Cabinets that have at least one visible tool, filtered by dept
  const visibleCabinets=(cabinets||[]).filter(c=>{
    if(userDepts.length>0){const cd=c.departments||[];if(cd.length>0&&!cd.some(d=>userDepts.includes(d)))return false;}
    return deptVisible.some(t=>String(t.cabinetId)===String(c.id));
  });

  // Tools in the selected cabinet (or all if no cabinet selected)
  const cabVisible=selectedCabinet?deptVisible.filter(t=>String(t.cabinetId)===selectedCabinet):deptVisible;

  // Group by toolType within selected cabinet, sort each group A→Z
  const grouped={};
  cabVisible.forEach(t=>{const key=t.toolType||"Andet";if(!grouped[key])grouped[key]=[];grouped[key].push(t);});
  Object.values(grouped).forEach(arr=>arr.sort((a,b)=>(a.name||"").localeCompare(b.name)));
  const categories=Object.keys(grouped).sort((a,b)=>{if(a==="Andet")return 1;if(b==="Andet")return -1;return a.localeCompare(b);});

  // If searching, show all matching tools across all cabinets sorted A→Z
  const searchQ=search.trim().toLowerCase();
  const searchResults=searchQ?deptVisible.filter(t=>(t.name||"").toLowerCase().includes(searchQ)||(t.articleNumber||"").toLowerCase().includes(searchQ)).sort((a,b)=>(a.name||"").localeCompare(b.name)):[];

  const typeTools=selectedType?(grouped[selectedType]||[]):[];
  const selectedTool=selectedId?tools.find(t=>String(t.id)===String(selectedId)):null;

  // Apply a tool op locally (instant feedback) and send it to the server
  const toolOp=(op,localUpdate)=>{
    setTools(prev=>prev.map(t=>t.id===selectedTool.id?localUpdate(t):t));
    if(op.log) setToolLog(prev=>[...prev,op.log]);
    sendToolOp({type:"update",toolId:selectedTool.id,...op});
  };
  const logEntry=(action,quantity)=>{const now=Date.now();return{id:now,toolId:selectedTool.id,toolName:selectedTool.name,operatorId:user.id,operatorName:user.name,quantity,action,timestamp:now};};
  const _removeOneCheckout=(byArr)=>{
    const myIdx=byArr.findIndex(x=>x.operatorId===user.id);
    return myIdx>=0?[...byArr.slice(0,myIdx),...byArr.slice(myIdx+1)]:byArr.slice(0,-1);
  };
  const doTake=()=>{
    if(!selectedTool) return;
    const qty=parseInt(takeQty)||1;
    if(qty<1||qty>selectedTool.quantity) return;
    toolOp({inc:{quantity:-qty},log:logEntry("take",qty)},t=>({...t,quantity:Math.max(0,t.quantity-qty)}));
    setSelectedId(null);setTakeQty(1);
  };
  const doCheckout=()=>{
    if(!selectedTool||!selectedTool.returnable) return;
    const available=selectedTool.quantity-(selectedTool.checkedOutCount||0)-(selectedTool.damagedCount||0);
    if(available<1) return;
    const by={operatorId:user.id,operatorName:user.name,timestamp:Date.now()};
    toolOp({inc:{checkedOutCount:1},checkout:by,log:logEntry("checkout",1)},
      t=>({...t,checkedOutCount:(t.checkedOutCount||0)+1,checkedOutBy:[...(t.checkedOutBy||[]),by]}));
    setSelectedId(null);setTakeQty(1);
  };
  const doReturn=(regrinded=null)=>{
    if(!selectedTool||!selectedTool.returnable) return;
    if((selectedTool.checkedOutCount||0)<1) return;
    const set=selectedTool.regrindable&&regrinded!==null?{needsRegrinding:!regrinded}:{};
    const action=regrinded===true?"return-regrinded":regrinded===false?"return-needs-regrind":"return";
    toolOp({inc:{checkedOutCount:-1},set,returnBy:user.id,log:logEntry(action,1)},
      t=>({...t,...set,checkedOutCount:Math.max(0,(t.checkedOutCount||0)-1),checkedOutBy:_removeOneCheckout(t.checkedOutBy||[])}));
    setSelectedId(null);setTakeQty(1);
  };
  const doReturnDamaged=()=>{
    if(!selectedTool||!selectedTool.returnable) return;
    if((selectedTool.checkedOutCount||0)<1) return;
    toolOp({inc:{checkedOutCount:-1,damagedCount:1},returnBy:user.id,log:logEntry("return-damaged",1)},
      t=>({...t,checkedOutCount:Math.max(0,(t.checkedOutCount||0)-1),damagedCount:(t.damagedCount||0)+1,checkedOutBy:_removeOneCheckout(t.checkedOutBy||[])}));
    setSelectedId(null);setTakeQty(1);
  };
  const doReportBroken=()=>{
    if(!selectedTool) return;
    const set={broken:true,quantity:0,checkedOutCount:0,checkedOutBy:[],damagedCount:0};
    toolOp({set},t=>({...t,...set}));
    setSelectedId(null);setTakeQty(1);
  };
  const setConditionStars=(stars)=>{
    if(!selectedTool) return;
    toolOp({set:{conditionStars:stars}},t=>({...t,conditionStars:stars}));
  };
  const closeModal=()=>{setSelectedId(null);setTakeQty(1);};

  // Reusable tool card renderer
  const renderToolCard=(tool)=>{
    const checkedOut=tool.returnable?(tool.checkedOutCount||0):0;
    const damaged=tool.returnable?(tool.damagedCount||0):0;
    const available=tool.broken?0:tool.returnable?tool.quantity-checkedOut-damaged:tool.quantity;
    const isLow=!tool.returnable&&!tool.broken&&tool.quantity<=(tool.minQuantity||0);
    const isOut=available<=0;
    const allInUse=tool.returnable&&isOut&&!tool.broken;
    const qColor=tool.broken?C.red:isOut?C.red:isLow?C.amber:C.green;
    const stars=tool.hasConditionRating?(tool.conditionStars||0):0;
    const starColor=stars<=1?"#f87171":stars<=2?C.amber:"#facc15";
    return(
      <div key={tool.id} onClick={()=>{setSelectedId(tool.id);setTakeQty(1);}}
        style={{background:C.surface,borderRadius:10,border:`1px solid ${tool.broken?C.red:allInUse?C.red:isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
        <div style={{position:"relative",width:"100%",aspectRatio:"3/2",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {tool.photoData?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<i className="ti ti-tool" style={{fontSize:24,color:C.muted,opacity:0.3}}/>}
          <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:6,padding:"3px 8px",fontSize:19,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.3"}}>{available}</div>
          {/* Stars on photo — bottom-left */}
          {stars>0&&!tool.broken&&!tool.ordered&&!tool.conditionOrdered&&<div style={{position:"absolute",bottom:4,left:5,fontSize:39,lineHeight:1,letterSpacing:0,textShadow:"0 2px 6px rgba(0,0,0,.9)",color:starColor}}>{"★".repeat(stars)}{"☆".repeat(5-stars)}</div>}
          {isLow&&!tool.ordered&&!allInUse&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.88)",color:"#1a1a1a"}}>LAV BEHOLDNING</div>}
          {tool.regrindable&&tool.needsRegrinding&&!allInUse&&!tool.ordered&&!tool.broken&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.92)",color:"#1a1a1a"}}><i className="ti ti-tool"/> Skal omslibes</div>}
          {damaged>0&&!allInUse&&!tool.ordered&&!tool.broken&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.88)",color:"#fff"}}><i className="ti ti-alert-triangle"/> {damaged} Beskadiget</div>}
          {/* Broken — full red overlay */}
          {tool.broken&&!tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(231,76,60,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
            <i className="ti ti-tools" style={{fontSize:26,color:"#fff"}}/>
            <div style={{fontSize:15,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>I STYKKER</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)",letterSpacing:.5}}>Kontakt admin</div>
          </div>}
          {(()=>{const byList=tool.returnable?(tool.checkedOutBy||[]):[];if(!byList.length||tool.ordered||tool.broken)return null;const bg=allInUse?"rgba(231,76,60,.88)":"rgba(0,0,0,.72)";return(<div style={{position:"absolute",inset:0,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"6px 4px"}}>
            <i className="ti ti-clock" style={{fontSize:allInUse?22:16,color:"#fff",marginBottom:2}}/>
            {allInUse&&<div style={{fontSize:14,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff",marginBottom:2}}>ALLE I BRUG</div>}
            {byList.map((x,i)=><div key={i} style={{fontSize:13,color:"rgba(255,255,255,.9)",fontWeight:600,lineHeight:1.2,textAlign:"center",maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.operatorName}</div>)}
            {tool.needsRegrinding&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",letterSpacing:.5,textTransform:"uppercase",marginTop:2}}>⚠ skal omslibes</div>}
          </div>);})()}
          {tool.conditionOrdered&&!tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
            <i className="ti ti-alert-triangle" style={{fontSize:24,color:"#fff"}}/>
            <div style={{fontSize:13,letterSpacing:1.2,textTransform:"uppercase",fontWeight:800,color:"#fff",textAlign:"center",padding:"0 8px",lineHeight:1.3}}>DÅRLIG STAND</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.85)",letterSpacing:.5}}>Nyt værktøj er bestilt</div>
          </div>}
          {tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><i className="ti ti-checks" style={{fontSize:26,color:"#fff"}}/><div style={{fontSize:16,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>BESTILT</div></div>}
        </div>
        <div style={{padding:"8px 8px 10px"}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700,lineHeight:1.3,marginBottom:5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            {tool.returnable&&<span style={{fontSize:13,fontWeight:600,color:"#22d3ee",background:"rgba(34,211,238,.1)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>↩ Afleveres</span>}
            {Array.isArray(tool.material)&&tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:13,fontWeight:700,color:m.color,background:m.bg,padding:"2px 5px",borderRadius:4,letterSpacing:.5}}>{code}</span>:null;})}
          </div>
        </div>
      </div>
    );
  };

  return(
    <div style={{padding:"14px 16px"}}>
      {/* Search — always visible */}
      <div style={{position:"relative",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
        {!searchQ&&(selectedCabinet||selectedType)&&(
          <button style={{flexShrink:0,padding:"8px 12px",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,cursor:"pointer",fontSize:16}}
            onClick={()=>{if(selectedType){setSelectedType(null);}else{setSelectedCabinet(null);}}}>
            <i className="ti ti-arrow-left"/>
          </button>
        )}
        <div style={{position:"relative",flex:1}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
          <input style={{...inp(),paddingLeft:32,width:"100%"}} value={search} onChange={e=>setSearch(e.target.value)} placeholder={selectedType&&!searchQ?`Søg i ${selectedType}…`:"Søg værktøj…"}/>
        </div>
      </div>

      {/* Cabinet gallery — shown first when no cabinet selected */}
      {!searchQ&&!selectedCabinet&&(
        <>
          {visibleCabinets.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj tilgængeligt.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {visibleCabinets.map(cab=>{
              const cabTools=deptVisible.filter(t=>String(t.cabinetId)===String(cab.id));
              const hasAlert=cabTools.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0);
              return(
                <div key={cab.id} onClick={()=>setSelectedCabinet(String(cab.id))} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
                  <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {cab.photoData?<img src={cab.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><i className="ti ti-archive" style={{fontSize:40,color:C.muted,opacity:0.2}}/><div style={{fontSize:16,fontWeight:700,color:C.muted,opacity:0.5}}>{cab.name}</div></div>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.75))",padding:"24px 12px 8px"}}>
                      <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{cab.name}</div>
                      <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{cabTools.length} værktøj</div>
                    </div>
                    {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Category view — within a cabinet */}
      {!searchQ&&selectedCabinet&&!selectedType&&(
        <>
          {categories.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj i dette skab.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {categories.map(type=>{
              const group=grouped[type];
              const photo=group.find(t=>t.photoData)?.photoData;
              const hasAlert=group.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0);
              return(
                <div key={type} onClick={()=>setSelectedType(type)} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
                  <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {photo?<img src={photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<i className="ti ti-tool" style={{fontSize:36,color:C.muted,opacity:0.2}}/>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.7))",padding:"20px 12px 8px"}}>
                      <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{type}</div>
                      <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{group.length} værktøj</div>
                    </div>
                    {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Type drill-down view */}
      {!searchQ&&selectedCabinet&&selectedType&&(
        <>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{selectedType} · {typeTools.length} værktøj</div>
          {typeTools.length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Intet værktøj i denne kategori.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{typeTools.map(renderToolCard)}</div>
        </>
      )}

      {/* Global search results */}
      {searchQ&&(
        <>
          {searchResults.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj fundet.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{searchResults.map(renderToolCard)}</div>
        </>
      )}

      {selectedTool&&(
        <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"16px 16px 0 0",maxHeight:"88vh",overflowY:"auto",padding:"0 16px 36px"}}>
            <div style={{position:"sticky",top:0,background:C.surface,paddingTop:14,paddingBottom:6,zIndex:1}}>
              <div style={{width:36,height:4,background:C.raised,borderRadius:2,margin:"0 auto"}}/>
            </div>
            {selectedTool.photoData&&<img src={selectedTool.photoData} style={{width:"100%",maxHeight:200,objectFit:"contain",borderRadius:10,background:C.raised,marginBottom:14,border:`1px solid ${C.border}`,display:"block"}}/>}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
              <div style={{fontSize:20,color:C.text,fontWeight:700,lineHeight:1.3}}>{selectedTool.name}</div>
              {selectedTool.toolType&&<span style={{fontSize:14,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"3px 9px",borderRadius:20,border:"1px solid rgba(148,163,184,.25)",whiteSpace:"nowrap"}}>{selectedTool.toolType}</span>}
            </div>
            {selectedTool.articleNumber&&<div style={{fontSize:14,color:C.muted,marginBottom:6}}>{selectedTool.articleNumber}</div>}
            {selectedTool.ordered&&<div style={{background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.4)",borderRadius:8,padding:"7px 10px",marginBottom:10,fontSize:14,color:"#3b82f6",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-checks"/><span>Bestilt — admin har allerede bestilt dette værktøj</span></div>}
            {selectedTool.conditionOrdered&&<div style={{background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.4)",borderRadius:8,padding:"7px 10px",marginBottom:10,fontSize:14,color:"#3b82f6",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-alert-triangle"/><span>Erstatning bestilt — værktøjet er i dårlig stand (1 stjerne)</span></div>}
            {Array.isArray(selectedTool.material)&&selectedTool.material.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Materiale</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedTool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${m.color}`,background:m.bg,fontSize:14,fontWeight:700,color:m.color}}>{code} <span style={{fontWeight:400,fontSize:12}}>{m.name}</span></span>:null;})}
                </div>
              </div>
            )}
            {selectedTool.description&&<div style={{fontSize:15,color:C.muted,marginBottom:12,lineHeight:1.55}}>{selectedTool.description}</div>}
            {(()=>{
              const cab=(cabinets||[]).find(c=>String(c.id)===String(selectedTool.cabinetId));
              const drawer=cab?(cab.drawers||[]).find(d=>String(d.id)===String(selectedTool.drawerId)):null;
              const cabinetName=cab?.name||(selectedTool.drawer||null);
              const rows=drawer?Array.from({length:drawer.rows},(_,i)=>String.fromCharCode(65+i)):DRAWER_ROWS;
              const cols=drawer?Array.from({length:drawer.cols},(_,i)=>i+1):DRAWER_COLS;
              if(!cabinetName&&!selectedTool.drawerPosition&&!selectedTool.location) return null;
              return(
                <div style={{background:C.raised,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Placering</div>
                  {cabinetName&&<div style={{fontSize:16,color:C.text,fontWeight:600,lineHeight:1.3,marginBottom:2}}>{cabinetName}</div>}
                  {drawer&&<div style={{fontSize:14,color:C.muted,marginBottom:selectedTool.drawerPosition?10:0}}>Skuffe {drawer.number}{drawer.label?` — ${drawer.label}`:""}</div>}
                  {selectedTool.drawerPosition?(
                    <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                          <div/>{cols.map(c=><div key={c} style={{textAlign:"center",fontSize:11,color:C.muted,fontWeight:600}}>{c}</div>)}
                        </div>
                        {rows.map(r=>(
                          <div key={r} style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                            <div style={{fontSize:11,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{r}</div>
                            {cols.map(c=>{const pos=`${r}${c}`;const active=selectedTool.drawerPosition===pos;return <div key={c} style={{width:20,height:20,borderRadius:3,background:active?C.amber:"rgba(255,255,255,.06)",border:`1px solid ${active?C.amber:"rgba(255,255,255,.08)"}`}}/>;  })}
                          </div>
                        ))}
                      </div>
                      <div style={{paddingTop:6}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Plads</div>
                        <div style={{fontSize:34,fontWeight:700,color:C.amber,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{selectedTool.drawerPosition}</div>
                      </div>
                    </div>
                  ):(selectedTool.location&&<div style={{fontSize:15,color:C.text}}>{selectedTool.location}</div>)}
                </div>
              );
            })()}
            {(()=>{
              const checkedOut=selectedTool.returnable?(selectedTool.checkedOutCount||0):0;
              const damaged=selectedTool.returnable?(selectedTool.damagedCount||0):0;
              const available=selectedTool.returnable?selectedTool.quantity-checkedOut-damaged:selectedTool.quantity;
              const byList=selectedTool.returnable?(selectedTool.checkedOutBy||[]):[];
              return(
                <div style={{marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    {selectedTool.returnable?(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Ledig</div>
                        <div style={{fontSize:20,fontWeight:700,color:available<=0?C.red:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{available}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> / {selectedTool.quantity} i alt</span></div>
                        {checkedOut>0&&<div style={{fontSize:13,color:C.amber,marginTop:2}}>{checkedOut} i brug{damaged>0?`, ${damaged} damaged`:""}</div>}
                        {damaged>0&&checkedOut===0&&<div style={{fontSize:13,color:C.red,marginTop:2}}>{damaged} beskadiget</div>}
                      </div>
                    ):(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>På lager</div><div style={{fontSize:20,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    )}
                    {selectedTool.recommendedSpeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Hastighed</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedSpeed}</div></div>}
                    {selectedTool.recommendedFeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Tilspænding</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedFeed}</div></div>}
                    {selectedTool.supplier&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Leverandør</div><div style={{fontSize:15,color:C.text}}>{selectedTool.supplier}</div></div>}
                  </div>
                  {byList.length>0&&(
                    <div style={{background:C.raised,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>I brug af</div>
                      {byList.map((x,i)=>(
                        <div key={i} style={{fontSize:15,color:C.text,display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:i<byList.length-1?`1px solid ${C.border}`:"none"}}>
                          <i className="ti ti-user" style={{fontSize:15,color:C.muted}}/>{x.operatorName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {selectedTool.hasConditionRating&&(
              <div style={{marginBottom:14,background:C.raised,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Værktøjets stand</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {[1,2,3,4,5].map(s=>(
                    <button key={s} onClick={()=>setConditionStars(s)} style={{background:"none",border:"none",cursor:"pointer",padding:4,minWidth:44,minHeight:44,fontSize:24,color:(selectedTool.conditionStars||0)>=s?"#facc15":"rgba(255,255,255,.18)",lineHeight:1}}>★</button>
                  ))}
                  <span style={{fontSize:13,color:C.muted,marginLeft:4}}>
                    {!selectedTool.conditionStars?"Ikke vurderet endnu":selectedTool.conditionStars===1?"⚠ Dårlig — overvej at udskifte":selectedTool.conditionStars===2?"Nogenlunde":selectedTool.conditionStars===3?"God":selectedTool.conditionStars===4?"Meget god":"Ny / som ny"}
                  </span>
                </div>
              </div>
            )}
            {selectedTool.broken&&(
              <div style={{background:"rgba(231,76,60,.12)",border:`1px solid rgba(231,76,60,.4)`,borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:14,color:C.red,display:"flex",alignItems:"center",gap:6}}>
                <i className="ti ti-alert-triangle"/><span>Meldt i stykker — admin har fået besked</span>
              </div>
            )}
            {selectedTool.returnable?(
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
                {(selectedTool.quantity-(selectedTool.checkedOutCount||0)-(selectedTool.damagedCount||0))>0
                  ?<button style={btn("primary",true)} onClick={doCheckout}><i className="ti ti-logout"/> Lån</button>
                  :<div style={{...badge("down"),textAlign:"center",padding:"10px",fontSize:14,display:"block"}}>ALLE I BRUG — vent til nogen afleverer</div>}
                {(selectedTool.checkedOutCount||0)>0&&(
                  <>
                    {selectedTool.regrindable?(
                      <div>
                        <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Aflever i skabet — stand?</div>
                        <div style={{display:"flex",gap:8}}>
                          <button style={{...btn("success",false,false),flex:1}} onClick={()=>doReturn(true)}><i className="ti ti-check"/> Omslebet</button>
                          <button style={{...btn("outline",false,false),flex:1,color:C.amber,borderColor:C.amber}} onClick={()=>doReturn(false)}><i className="ti ti-alert-triangle"/> Skal omslibes</button>
                        </div>
                      </div>
                    ):<button style={btn("success",true)} onClick={()=>doReturn()}><i className="ti ti-login"/> Aflever i skabet</button>}
                    <button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.5)",color:C.red}} onClick={doReturnDamaged}><i className="ti ti-alert-triangle"/> Aflever som beskadiget</button>
                  </>
                )}
                {!selectedTool.broken&&<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.35)",color:C.red,fontSize:14}} onClick={doReportBroken}><i className="ti ti-tools"/> Meld værktøj i stykker / skal genbestilles</button>}
              </div>
            ):selectedTool.quantity>0?(
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Hvor mange tager du?</div>
                <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"center",marginBottom:14}}>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:22}} onClick={()=>setTakeQty(q=>Math.max(1,q-1))}>−</button>
                  <div style={{fontSize:36,color:C.amber,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",minWidth:60,textAlign:"center"}}>{takeQty}</div>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:22}} onClick={()=>setTakeQty(q=>Math.min(selectedTool.quantity,q+1))}>+</button>
                </div>
                <button style={btn("primary",true)} onClick={doTake}><i className="ti ti-minus"/> Tag {takeQty} stk</button>
              </div>
            ):<div style={{...badge("down"),textAlign:"center",padding:"10px",fontSize:14,display:"block"}}>IKKE PÅ LAGER — kontakt admin</div>}
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Luk</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MANAGE TOOLS — admin view
// ═══════════════════════════════════════════════════════
function ManageTools({tools,setTools,toolLog,setToolLog,saveNow,users,machines,cabinets,focusToolId,setFocusToolId}){
  const [subview,setSubview]=useState("list");
  const [selectedCabinet,setSelectedCabinet]=useState(null);
  const [editId,setEditId]=useState(null);
  const [restockId,setRestockId]=useState(null);
  const [restockQty,setRestockQty]=useState("");
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusToolId){
    const ft=tools.find(t2=>String(t2.id)===String(focusToolId));
    if(ft)setSelectedCabinet(String(ft.cabinetId));
    setSelectedId(focusToolId);setSubview("list");setFocusToolId&&setFocusToolId(null);
  }},[focusToolId]);
  const [toolFilter,setToolFilter]=useState("all");
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const blank={name:"",toolType:"",returnable:false,regrindable:false,hasConditionRating:false,cabinetId:"",drawerId:"",drawerPosition:"",quantity:"",minQuantity:"",description:"",material:[],recommendedSpeed:"",recommendedFeed:"",supplier:"",articleNumber:"",photoData:null};
  const [form,setForm]=useState(blank);
  const [errs,setErrs]=useState({});
  const photoRef=useRef();
  const photoCamRef=useRef();

  const openAdd=()=>{setForm(blank);setEditId(null);setErrs({});setSubview("form");};
  const openEdit=t=>{
    setForm({...blank,...t,quantity:String(t.quantity),minQuantity:String(t.minQuantity||0),
      material:Array.isArray(t.material)?t.material:[],
      photoData:t.photoData||null,
    });
    setEditId(t.id);setErrs({});setSubview("form");
  };

  // Set fields on one tool locally and on the server
  const updateTool=(toolId,set,extra={})=>{
    setTools(prev=>prev.map(t=>t.id===toolId?{...t,...set}:t));
    sendToolOp({type:"update",toolId,set,...extra});
  };

  const save=()=>{
    const e={};
    if(!form.name.trim()) e.name="Skal udfyldes";
    if(!form.cabinetId) e.cabinetId="Vælg et skab";
    if(!form.drawerId)  e.drawerId ="Vælg en skuffe";
    if(form.quantity===""||isNaN(parseInt(form.quantity))) e.quantity="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    if(editId){
      updateTool(editId,{...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0});
    } else {
      const tool={id:now,...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0,active:true};
      setTools(prev=>[...prev,tool]);
      sendToolOp({type:"add",tool});
    }
    setSubview("list");
  };

  const doRestock=tool=>{
    const qty=parseInt(restockQty)||0;
    if(qty<1) return;
    const set={ordered:tool.quantity+qty>(tool.minQuantity||0)?false:tool.ordered};
    if(tool.conditionOrdered){set.conditionOrdered=false;set.conditionStars=5;}
    const now=Date.now();
    const log={id:now,toolId:tool.id,toolName:tool.name,operatorId:null,operatorName:"Admin",quantity:qty,action:"restock",timestamp:now};
    setTools(prev=>prev.map(t=>t.id===tool.id?{...t,...set,quantity:t.quantity+qty}:t));
    setToolLog&&setToolLog(prev=>[...prev,log]);
    sendToolOp({type:"update",toolId:tool.id,set,inc:{quantity:qty},log});
    setRestockId(null);setRestockQty("");
  };

  const fi=k=>({...inp(errs[k])});

  if(subview==="form") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Tilbage
      </button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editId?"Rediger værktøj":"Tilføj nyt værktøj"}</div>
      {[["name","Værktøjets navn *","f.eks. CNMG 120408 skær"],["articleNumber","Varenr. / bestillingsnr.","f.eks. 979002-SG11M"],["supplier","Leverandør","f.eks. Hoffmann Group"]].map(([k,lbl,ph])=>(
        <div key={k} style={{marginBottom:10}}>
          <label style={label}>{lbl}</label>
          <input style={fi(k)} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}/>
          {errs[k]&&<div style={errMsg}>{errs[k]}</div>}
        </div>
      ))}
      <div style={{marginBottom:10}}>
        <label style={label}>Værktøjstype</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
          {["Endefræser","Bor","Skær","Drejestål","Borestang","Rival","Gevindtap","Gevindfræser","Planfræser","Stikstål","Undersænker","Centerbor"].map(t=>(
            <button key={t} type="button" style={{fontSize:13,padding:"4px 10px",borderRadius:20,border:`1px solid ${form.toolType===t?C.amber:C.border}`,background:form.toolType===t?C.amber+"22":C.raised,color:form.toolType===t?C.amber:C.muted,cursor:"pointer",fontWeight:form.toolType===t?700:400}} onClick={()=>setForm(p=>({...p,toolType:p.toolType===t?"":t}))}>{t}</button>
          ))}
        </div>
        <input style={{...fi("toolType"),marginTop:2}} value={form.toolType} onChange={e=>setForm(p=>({...p,toolType:e.target.value}))} placeholder="Eller skriv en anden type…"/>
      </div>
      <div style={{marginBottom:14}}>
        <button type="button" onClick={()=>setForm(p=>({...p,returnable:!p.returnable}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.returnable?"rgba(59,130,246,.12)":C.raised,border:`1px solid ${form.returnable?"#3b82f6":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.returnable?"#3b82f6":C.border}`,background:form.returnable?"#3b82f6":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.returnable&&<i className="ti ti-check" style={{fontSize:15,color:"#fff"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.returnable?"#3b82f6":C.text,fontWeight:600}}>Værktøj der afleveres</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Værktøjet lånes og afleveres efter brug — lageret bruges ikke op</div>
          </div>
        </button>
        <button type="button" onClick={()=>setForm(p=>({...p,regrindable:!p.regrindable}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.regrindable?"rgba(240,165,0,.1)":C.raised,border:`1px solid ${form.regrindable?C.amber:C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.regrindable?C.amber:C.border}`,background:form.regrindable?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.regrindable&&<i className="ti ti-check" style={{fontSize:15,color:"#1a1a1a"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.regrindable?C.amber:C.text,fontWeight:600}}>Værktøj der kan omslibes</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Ved aflevering vælger operatøren: omslebet eller skal omslibes</div>
          </div>
        </button>
        <button type="button" onClick={()=>setForm(p=>({...p,hasConditionRating:!p.hasConditionRating}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.hasConditionRating?"rgba(250,204,21,.1)":C.raised,border:`1px solid ${form.hasConditionRating?"#facc15":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left"}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.hasConditionRating?"#facc15":C.border}`,background:form.hasConditionRating?"#facc15":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.hasConditionRating&&<i className="ti ti-check" style={{fontSize:15,color:"#1a1a1a"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.hasConditionRating?"#facc15":C.text,fontWeight:600}}>Vurdering af stand ★</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Operatør og admin kan vurdere værktøjets stand med 1–5 stjerner (1 = skal udskiftes)</div>
          </div>
        </button>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Skab *</label>
        {(cabinets||[]).length===0
          ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Ingen skabe oprettet endnu — gå til <strong>Skabe</strong> for at tilføje et først.</div>
          :<select style={{...fi("cabinetId"),color:form.cabinetId?C.text:C.muted}} value={form.cabinetId} onChange={e=>setForm(p=>({...p,cabinetId:e.target.value,drawerId:"",drawerPosition:""}))}>
            <option value="">Vælg skab…</option>
            {(cabinets||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>}
        {errs.cabinetId&&<div style={errMsg}>{errs.cabinetId}</div>}
      </div>
      {form.cabinetId&&(()=>{
        const cab=(cabinets||[]).find(c=>String(c.id)===String(form.cabinetId));
        const drawers=cab?.drawers||[];
        return(
          <div style={{marginBottom:10}}>
            <label style={label}>Skuffe *</label>
            {drawers.length===0
              ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Skabet har ingen skuffer — gå til Skabe for at tilføje skuffer.</div>
              :<select style={{...fi("drawerId"),color:form.drawerId?C.text:C.muted}} value={form.drawerId} onChange={e=>setForm(p=>({...p,drawerId:e.target.value,drawerPosition:""}))}>
                <option value="">Vælg skuffe…</option>
                {drawers.map(d=><option key={d.id} value={d.id}>Skuffe {d.number}{d.label?` — ${d.label}`:""} ({String.fromCharCode(64+d.rows)}1–{d.cols})</option>)}
              </select>}
            {errs.drawerId&&<div style={errMsg}>{errs.drawerId}</div>}
          </div>
        );
      })()}
      {form.cabinetId&&form.drawerId&&(()=>{
        const cab=(cabinets||[]).find(c=>String(c.id)===String(form.cabinetId));
        const drawer=(cab?.drawers||[]).find(d=>String(d.id)===String(form.drawerId));
        if(!drawer) return null;
        const rows=Array.from({length:drawer.rows},(_,i)=>String.fromCharCode(65+i));
        const cols=Array.from({length:drawer.cols},(_,i)=>i+1);
        return(
          <div style={{marginBottom:16}}>
            <label style={label}>Plads i skuffen</label>
            <div style={{marginTop:8,background:C.raised,borderRadius:10,padding:"12px 10px"}}>
              <div style={{display:"grid",gridTemplateColumns:`18px repeat(${drawer.cols},1fr)`,gap:4,marginBottom:4}}>
                <div/>
                {cols.map(c=><div key={c} style={{textAlign:"center",fontSize:12,color:C.muted,fontWeight:600}}>{c}</div>)}
              </div>
              {rows.map(r=>(
                <div key={r} style={{display:"grid",gridTemplateColumns:`18px repeat(${drawer.cols},1fr)`,gap:4,marginBottom:4}}>
                  <div style={{fontSize:12,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{r}</div>
                  {cols.map(c=>{
                    const pos=`${r}${c}`;const on=form.drawerPosition===pos;
                    return <div key={c} onClick={()=>setForm(p=>({...p,drawerPosition:on?"":pos}))} style={{aspectRatio:"1",borderRadius:4,background:on?C.amber:"rgba(255,255,255,.06)",border:`1.5px solid ${on?C.amber:"rgba(255,255,255,.09)"}`,cursor:"pointer",transition:"all .12s"}}/>;
                  })}
                </div>
              ))}
              {form.drawerPosition
                ?<div style={{fontSize:15,color:C.amber,fontWeight:700,textAlign:"center",marginTop:6,fontFamily:"'Share Tech Mono',monospace",letterSpacing:2}}>Plads {form.drawerPosition}</div>
                :<div style={{fontSize:13,color:C.muted,textAlign:"center",marginTop:6}}>Tryk på en celle for at markere pladsen</div>}
            </div>
          </div>
        );
      })()}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Beholdning (stk) *</label>
          <input type="number" min="0" style={{...fi("quantity"),textAlign:"center",fontSize:20,color:C.amber}} value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} placeholder="0"/>
          {errs.quantity&&<div style={errMsg}>{errs.quantity}</div>}
        </div>
        <div>
          <label style={label}>Genbestil under (stk)</label>
          <input type="number" min="0" style={{...fi("minQuantity"),textAlign:"center",fontSize:20,color:C.red}} value={form.minQuantity} onChange={e=>setForm(p=>({...p,minQuantity:e.target.value}))} placeholder="0"/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Beskrivelse</label>
        <input style={fi("description")} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="f.eks. negativt drejeskær til stål og rustfrit"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Anbefalet skærehastighed</label>
          <input style={fi("recommendedSpeed")} value={form.recommendedSpeed} onChange={e=>setForm(p=>({...p,recommendedSpeed:e.target.value}))} placeholder="f.eks. 250–350 m/min"/>
        </div>
        <div>
          <label style={label}>Anbefalet tilspænding</label>
          <input style={fi("recommendedFeed")} value={form.recommendedFeed} onChange={e=>setForm(p=>({...p,recommendedFeed:e.target.value}))} placeholder="f.eks. 0,2–0,4 mm/omdr."/>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Materialer (ISO-grupper)</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
          {ISO_MAT.map(m=>{
            const on=(form.material||[]).includes(m.code);
            return(
              <button key={m.code} type="button"
                onClick={()=>setForm(p=>{const ms=p.material||[];return{...p,material:on?ms.filter(x=>x!==m.code):[...ms,m.code]};})}
                style={{padding:"8px 14px",borderRadius:10,border:`2px solid ${on?m.color:"rgba(255,255,255,.1)"}`,background:on?m.bg:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all .15s",textAlign:"center",minWidth:58}}>
                <div style={{fontSize:18,fontWeight:700,color:on?m.color:C.muted,letterSpacing:1}}>{m.code}</div>
                <div style={{fontSize:11,color:on?m.color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{m.name}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Foto af værktøjet</label>
        {form.photoData
          ?<div style={{border:"2px dashed rgba(39,174,96,.4)",borderRadius:8,padding:12,textAlign:"center",background:"rgba(39,174,96,.05)"}}>
            <img src={form.photoData} style={{maxHeight:130,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/>
            <div style={{fontSize:14,color:C.green,letterSpacing:1,marginBottom:8}}>Foto vedhæftet</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button type="button" style={btn("outline",false,true)} onClick={()=>photoCamRef.current.click()}><i className="ti ti-camera"/> Tag igen</button>
              <button type="button" style={btn("outline",false,true)} onClick={()=>photoRef.current.click()}><i className="ti ti-upload"/> Udskift</button>
              <button type="button" style={{...btn("danger",false,true)}} onClick={()=>setForm(p=>({...p,photoData:null}))}><i className="ti ti-x"/> Fjern</button>
            </div>
          </div>
          :<div style={{display:"flex",gap:8}}>
            <button type="button" style={{...btn("outline",false,false),flex:1,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,borderRadius:8,fontSize:15}} onClick={()=>photoCamRef.current.click()}>
              <i className="ti ti-camera" style={{fontSize:24}}/>Tag foto
            </button>
            <button type="button" style={{...btn("outline",false,false),flex:1,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,borderRadius:8,fontSize:15}} onClick={()=>photoRef.current.click()}>
              <i className="ti ti-upload" style={{fontSize:24}}/>Upload
            </button>
          </div>}
        <input type="file" ref={photoCamRef} accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
        <input type="file" ref={photoRef} accept="image/*" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
      </div>
      <button style={btn("success",true)} onClick={save}><i className="ti ti-check"/> {editId?"Gem ændringer":"Tilføj værktøj"}</button>
    </div>
  );

  if(subview==="log") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Tilbage
      </button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}><i className="ti ti-history"/> Log over værktøjsbrug</div>
      {(toolLog||[]).length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Intet forbrug registreret endnu.</div>}
      {[...(toolLog||[])].reverse().map(e=>(
        <div key={e.id} style={{...card(),marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className={`ti ti-${e.action==="restock"?"package-import":"minus"}`} style={{fontSize:16,color:e.action==="restock"?C.green:C.amber}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.toolName}</div>
            <div style={{fontSize:13,color:C.muted,marginTop:2}}>{e.operatorName} · {fmtDate(e.timestamp)}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:16,fontWeight:700,color:e.action==="restock"?C.green:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{e.action==="restock"?"+":"-"}{e.quantity}</div>
            <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{TOOL_ACTION_NAME[e.action]||e.action}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const lowTools=tools.filter(t=>t.active&&t.quantity<=(t.minQuantity||0));
  const orderedTools=tools.filter(t=>t.ordered);
  const allFilteredTools=toolFilter==="low"?lowTools:toolFilter==="ordered"?orderedTools:tools;
  const filteredTools=selectedCabinet?allFilteredTools.filter(t=>String(t.cabinetId)===selectedCabinet):allFilteredTools;
  const selectedTool=selectedId?tools.find(t=>String(t.id)===String(selectedId)):null;
  const closeModal=()=>{setSelectedId(null);setRestockId(null);setRestockQty("");setDeleteConfirm(false);};

  // Cabinet gallery for admin
  if(!selectedCabinet) return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button style={btn("primary",false,true)} onClick={openAdd}><i className="ti ti-plus"/> Tilføj værktøj</button>
        <button style={btn("outline",false,true)} onClick={()=>setSubview("log")}><i className="ti ti-history"/> Forbrugslog</button>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          {[["all","Alle"],["low","Lav beholdning"],["ordered","Bestilt"]].map(([f,lb])=>(
            <button key={f} style={{...btn(toolFilter===f?"blue":"outline",false,true),position:"relative"}} onClick={()=>setToolFilter(f)}>
              {lb}
              {f==="low"&&lowTools.length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{lowTools.length}</span>}
              {f==="ordered"&&orderedTools.length>0&&<span style={{background:"#3b82f6",color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{orderedTools.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {(cabinets||[]).length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Ingen skabe endnu. Tilføj et under Skabe.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {(cabinets||[]).map(cab=>{
          const cabTools=allFilteredTools.filter(t=>String(t.cabinetId)===String(cab.id));
          const hasLow=cabTools.some(t=>t.active&&t.quantity<=(t.minQuantity||0));
          const hasAlert=cabTools.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0||t.broken||((t.conditionStars||0)===1&&t.hasConditionRating));
          return(
            <div key={cab.id} onClick={()=>setSelectedCabinet(String(cab.id))} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {cab.photoData?<img src={cab.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><i className="ti ti-archive" style={{fontSize:40,color:C.muted,opacity:0.2}}/><div style={{fontSize:16,fontWeight:700,color:C.muted,opacity:0.5}}>{cab.name}</div></div>}
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.75))",padding:"24px 12px 8px"}}>
                  <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{cab.name}</div>
                  <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{allFilteredTools.filter(t=>String(t.cabinetId)===String(cab.id)).length} værktøj</div>
                </div>
                {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button style={{...btn("outline",false,true),padding:"8px 10px"}} onClick={()=>setSelectedCabinet(null)}><i className="ti ti-arrow-left"/></button>
        <button style={btn("primary",false,true)} onClick={openAdd}><i className="ti ti-plus"/> Tilføj værktøj</button>
        <button style={btn("outline",false,true)} onClick={()=>setSubview("log")}><i className="ti ti-history"/> Forbrugslog</button>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          {[["all","Alle"],["low","Lav beholdning"],["ordered","Bestilt"]].map(([f,lb])=>(
            <button key={f} style={{...btn(toolFilter===f?"blue":"outline",false,true),position:"relative"}} onClick={()=>setToolFilter(f)}>
              {lb}
              {f==="low"&&lowTools.length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{lowTools.length}</span>}
              {f==="ordered"&&orderedTools.length>0&&<span style={{background:"#3b82f6",color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{orderedTools.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {(()=>{const cab=(cabinets||[]).find(c=>String(c.id)===selectedCabinet);return cab?<div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}><i className="ti ti-archive"/> {cab.name}</div>:null;})()}
      {filteredTools.length===0&&<div style={{textAlign:"center",padding:"20px",color:C.muted,fontSize:15}}>Intet værktøj {selectedCabinet?"i dette skab":"matcher filteret"}.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {filteredTools.map(tool=>{
          const checkedOut=tool.returnable?(tool.checkedOutCount||0):0;
          const damaged=tool.returnable?(tool.damagedCount||0):0;
          const available=tool.returnable?tool.quantity-checkedOut-damaged:tool.quantity;
          const isLow=tool.active&&!tool.returnable&&tool.quantity<=(tool.minQuantity||0);
          const isOut=available<=0;
          const allInUse=tool.returnable&&isOut;
          const qColor=isOut?C.red:isLow?C.amber:C.green;
          return(
            <div key={tool.id} onClick={()=>setSelectedId(tool.id)}
              style={{background:C.surface,borderRadius:10,border:`1px solid ${allInUse?C.red:isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer",opacity:tool.active?1:0.45}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"3/2",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {tool.photoData
                  ?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  :<i className="ti ti-tool" style={{fontSize:24,color:C.muted,opacity:0.3}}/>}
                <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:6,padding:"3px 8px",fontSize:19,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.3"}}>{available}</div>
                {!tool.active&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-eye-off" style={{fontSize:20,color:"rgba(255,255,255,.6)"}}/></div>}
                {tool.active&&isLow&&!tool.ordered&&!allInUse&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.88)",color:"#1a1a1a"}}>LAV BEHOLDNING</div>}
                {tool.active&&tool.regrindable&&tool.needsRegrinding&&!allInUse&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.92)",color:"#1a1a1a"}}><i className="ti ti-tool"/> Skal omslibes</div>}
                {tool.active&&damaged>0&&!allInUse&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.88)",color:"#fff"}}><i className="ti ti-alert-triangle"/> {damaged} Beskadiget</div>}
                {tool.active&&tool.broken&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.95)",color:"#fff"}}><i className="ti ti-tools"/> I stykker — genbestil</div>}
                {tool.active&&tool.hasConditionRating&&(tool.conditionStars||0)===1&&!tool.broken&&!tool.ordered&&<div style={{position:"absolute",top:5,left:5,background:"rgba(248,113,113,.9)",borderRadius:4,padding:"1px 5px",fontSize:12,fontWeight:700,color:"#fff"}}>1★ Dårlig</div>}
                {tool.active&&(()=>{const byList=tool.returnable?(tool.checkedOutBy||[]):[];if(!byList.length||tool.ordered)return null;const bg=allInUse?"rgba(231,76,60,.88)":"rgba(0,0,0,.72)";return(<div style={{position:"absolute",inset:0,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"6px 4px"}}>
                  <i className="ti ti-clock" style={{fontSize:allInUse?22:16,color:"#fff",marginBottom:2}}/>
                  {allInUse&&<div style={{fontSize:14,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff",marginBottom:2}}>ALLE I BRUG</div>}
                  {byList.map((x,i)=><div key={i} style={{fontSize:13,color:"rgba(255,255,255,.9)",fontWeight:600,lineHeight:1.2,textAlign:"center",maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.operatorName}</div>)}
                  {tool.needsRegrinding&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",letterSpacing:.5,textTransform:"uppercase",marginTop:2}}>⚠ skal omslibes</div>}
                </div>);})()}
                {tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><i className="ti ti-checks" style={{fontSize:26,color:"#fff"}}/><div style={{fontSize:16,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>BESTILT</div></div>}
              </div>
              <div style={{padding:"8px 8px 10px"}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700,lineHeight:1.3,marginBottom:5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {tool.toolType&&<span style={{fontSize:13,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>{tool.toolType}</span>}
                  {tool.returnable&&<span style={{fontSize:13,fontWeight:600,color:"#22d3ee",background:"rgba(34,211,238,.1)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>↩ Afleveres</span>}
                  {tool.broken&&<span style={{fontSize:13,fontWeight:700,color:C.red,background:"rgba(231,76,60,.12)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>⚠ I stykker</span>}
                  {tool.hasConditionRating&&(tool.conditionStars||0)>0&&(
                    <span style={{fontSize:13,color:(tool.conditionStars||0)<=1?"#f87171":(tool.conditionStars||0)<=2?C.amber:"#facc15",letterSpacing:1}}>
                      {"★".repeat(tool.conditionStars||0)}{"☆".repeat(5-(tool.conditionStars||0))}
                    </span>
                  )}
                  {Array.isArray(tool.material)&&tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:13,fontWeight:700,color:m.color,background:m.bg,padding:"2px 5px",borderRadius:4,letterSpacing:.5}}>{code}</span>:null;})}
                </div>
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
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
              <div style={{fontSize:20,color:C.text,fontWeight:700,lineHeight:1.3}}>{selectedTool.name}</div>
              {selectedTool.toolType&&<span style={{fontSize:14,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"3px 9px",borderRadius:20,border:"1px solid rgba(148,163,184,.25)",whiteSpace:"nowrap"}}>{selectedTool.toolType}</span>}
            </div>
            {selectedTool.articleNumber&&<div style={{fontSize:14,color:C.muted,marginBottom:6}}>{selectedTool.articleNumber}</div>}
            {!selectedTool.active&&<div style={{...badge("down"),display:"inline-flex",marginBottom:8,fontSize:12}}>SKJULT FOR OPERATØRER</div>}
            {Array.isArray(selectedTool.material)&&selectedTool.material.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Materiale</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedTool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${m.color}`,background:m.bg,fontSize:14,fontWeight:700,color:m.color}}>{code} <span style={{fontWeight:400,fontSize:12}}>{m.name}</span></span>:null;})}
                </div>
              </div>
            )}
            {selectedTool.description&&<div style={{fontSize:15,color:C.muted,marginBottom:12,lineHeight:1.55}}>{selectedTool.description}</div>}
            {(()=>{
              const cab=(cabinets||[]).find(c=>String(c.id)===String(selectedTool.cabinetId));
              const drawer=cab?(cab.drawers||[]).find(d=>String(d.id)===String(selectedTool.drawerId)):null;
              const cabinetName=cab?.name||(selectedTool.drawer||null);
              const rows=drawer?Array.from({length:drawer.rows},(_,i)=>String.fromCharCode(65+i)):DRAWER_ROWS;
              const cols=drawer?Array.from({length:drawer.cols},(_,i)=>i+1):DRAWER_COLS;
              if(!cabinetName&&!selectedTool.drawerPosition&&!selectedTool.location) return null;
              return(
                <div style={{background:C.raised,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Placering</div>
                  {cabinetName&&<div style={{fontSize:16,color:C.text,fontWeight:600,lineHeight:1.3,marginBottom:2}}>{cabinetName}</div>}
                  {drawer&&<div style={{fontSize:14,color:C.muted,marginBottom:selectedTool.drawerPosition?10:0}}>Skuffe {drawer.number}{drawer.label?` — ${drawer.label}`:""}</div>}
                  {selectedTool.drawerPosition?(
                    <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                          <div/>{cols.map(c=><div key={c} style={{textAlign:"center",fontSize:11,color:C.muted,fontWeight:600}}>{c}</div>)}
                        </div>
                        {rows.map(r=>(
                          <div key={r} style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                            <div style={{fontSize:11,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{r}</div>
                            {cols.map(c=>{const pos=`${r}${c}`;const active=selectedTool.drawerPosition===pos;return <div key={c} style={{width:20,height:20,borderRadius:3,background:active?C.amber:"rgba(255,255,255,.06)",border:`1px solid ${active?C.amber:"rgba(255,255,255,.08)"}`}}/>;  })}
                          </div>
                        ))}
                      </div>
                      <div style={{paddingTop:6}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Plads</div>
                        <div style={{fontSize:34,fontWeight:700,color:C.amber,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{selectedTool.drawerPosition}</div>
                      </div>
                    </div>
                  ):(selectedTool.location&&<div style={{fontSize:15,color:C.text}}>{selectedTool.location}</div>)}
                </div>
              );
            })()}
            {(()=>{
              const co=selectedTool.returnable?(selectedTool.checkedOutCount||0):0;
              const dmg=selectedTool.returnable?(selectedTool.damagedCount||0):0;
              const avail=selectedTool.returnable?selectedTool.quantity-co-dmg:selectedTool.quantity;
              const byList=selectedTool.returnable?(selectedTool.checkedOutBy||[]):[];
              return(
                <div style={{marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    {selectedTool.returnable?(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Ledig</div>
                        <div style={{fontSize:20,fontWeight:700,color:avail<=0?C.red:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{avail}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> / {selectedTool.quantity}</span></div>
                        {co>0&&<div style={{fontSize:13,color:C.amber,marginTop:2}}>{co} i brug</div>}
                        {dmg>0&&<div style={{fontSize:13,color:C.red,marginTop:1}}>{dmg} beskadiget</div>}
                      </div>
                    ):(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>På lager</div><div style={{fontSize:20,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    )}
                    <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Genbestil under</div><div style={{fontSize:16,fontWeight:700,color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.minQuantity||0}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    {selectedTool.recommendedSpeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Hastighed</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedSpeed}</div></div>}
                    {selectedTool.recommendedFeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Tilspænding</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedFeed}</div></div>}
                    {selectedTool.supplier&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Leverandør</div><div style={{fontSize:15,color:C.text}}>{selectedTool.supplier}</div></div>}
                  </div>
                  {byList.length>0&&(
                    <div style={{background:C.raised,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>I brug af</div>
                      {byList.map((x,i)=>(
                        <div key={i} style={{fontSize:15,color:C.text,display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:i<byList.length-1?`1px solid ${C.border}`:"none"}}>
                          <i className="ti ti-user" style={{fontSize:15,color:C.muted}}/>{x.operatorName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {selectedTool.hasConditionRating&&(
              <div style={{marginBottom:14,background:C.raised,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Værktøjets stand</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {[1,2,3,4,5].map(s=>(
                    <button key={s} onClick={()=>updateTool(selectedTool.id,{conditionStars:s})} style={{background:"none",border:"none",cursor:"pointer",padding:4,minWidth:44,minHeight:44,fontSize:24,color:(selectedTool.conditionStars||0)>=s?"#facc15":"rgba(255,255,255,.18)",lineHeight:1}}>★</button>
                  ))}
                  <span style={{fontSize:13,color:C.muted,marginLeft:4}}>
                    {!selectedTool.conditionStars?"Ikke vurderet endnu":selectedTool.conditionStars===1?"⚠ Dårlig — overvej at købe nyt":selectedTool.conditionStars===2?"Nogenlunde":selectedTool.conditionStars===3?"God":selectedTool.conditionStars===4?"Meget god":"Ny / som ny"}
                  </span>
                </div>
              </div>
            )}
            {selectedTool.broken&&(
              <div style={{background:"rgba(231,76,60,.12)",border:`1px solid rgba(231,76,60,.5)`,borderRadius:8,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <i className="ti ti-alert-triangle" style={{color:C.red,fontSize:18,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:2}}>Meldt i stykker — skal genbestilles</div>
                  <div style={{fontSize:13,color:C.muted}}>En operatør har meldt værktøjet i stykker.</div>
                </div>
                <button style={{...btn("outline",false,true),fontSize:13,padding:"4px 8px",borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>updateTool(selectedTool.id,{broken:false})}>Ryd</button>
              </div>
            )}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
              {restockId===selectedTool.id?(
                <div>
                  <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Hvor mange stk skal tilføjes?</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <input type="number" min="1" style={{...inp(),flex:1,fontSize:20,textAlign:"center",color:C.green}} value={restockQty} onChange={e=>setRestockQty(e.target.value)} placeholder="0"/>
                    <button style={btn("success",false,false)} onClick={()=>doRestock(selectedTool)}><i className="ti ti-check"/> Tilføj</button>
                    <button style={btn("outline",false,true)} onClick={()=>{setRestockId(null);setRestockQty("");}}>Annuller</button>
                  </div>
                </div>
              ):<button style={btn("success",true)} onClick={()=>{setRestockId(selectedTool.id);setRestockQty("");}}><i className="ti ti-package-import"/> Fyld op</button>}
              {selectedTool.regrindable&&selectedTool.needsRegrinding&&(
                <button style={{...btn("outline",true),borderColor:C.amber,color:C.amber}} onClick={()=>updateTool(selectedTool.id,{needsRegrinding:false})}>
                  <i className="ti ti-check"/> Marker som omslebet
                </button>
              )}
              {(selectedTool.damagedCount||0)>0&&(
                <button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.5)",color:C.red}} onClick={()=>updateTool(selectedTool.id,{damagedCount:0})}>
                  <i className="ti ti-refresh"/> Marker som udskiftet ({selectedTool.damagedCount} damaged)
                </button>
              )}
              {selectedTool.quantity<=(selectedTool.minQuantity||0)&&(
                <button style={btn(selectedTool.ordered?"blue":"outline",true)} onClick={()=>updateTool(selectedTool.id,{ordered:!selectedTool.ordered})}>
                  <i className={`ti ti-${selectedTool.ordered?"checks":"shopping-cart"}`}/> {selectedTool.ordered?"Bestilt — tryk for at fjerne markering":"Marker som bestilt"}
                </button>
              )}
              {selectedTool.hasConditionRating&&(selectedTool.conditionStars||0)===1&&(
                <button style={btn(selectedTool.conditionOrdered?"blue":"outline",true)} onClick={()=>updateTool(selectedTool.id,{conditionOrdered:!selectedTool.conditionOrdered})}>
                  <i className={`ti ti-${selectedTool.conditionOrdered?"checks":"alert-triangle"}`}/> {selectedTool.conditionOrdered?"Erstatning bestilt — tryk for at fjerne markering":"Bestil erstatning (dårlig stand)"}
                </button>
              )}
              <button style={btn("outline",true)} onClick={()=>{closeModal();openEdit(selectedTool);}}><i className="ti ti-edit"/> Rediger værktøj</button>
              <button style={btn(selectedTool.active?"danger":"outline",true)} onClick={()=>{updateTool(selectedTool.id,{active:!selectedTool.active});closeModal();}}>
                <i className={`ti ti-${selectedTool.active?"eye-off":"eye"}`}/> {selectedTool.active?"Skjul for operatører":"Gør synlig"}
              </button>
              {!deleteConfirm
                ?<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>setDeleteConfirm(true)}><i className="ti ti-trash"/> Slet værktøj</button>
                :<div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:14,color:C.red,marginBottom:10,fontWeight:600}}>Slet "{selectedTool.name}" permanent?</div>
                  <div style={{display:"flex",gap:8}}>
                    <button style={{...btn("danger",false,false),flex:1}} onClick={()=>{setTools(prev=>prev.filter(t=>t.id!==selectedTool.id));sendToolOp({type:"delete",toolId:selectedTool.id});closeModal();}}><i className="ti ti-trash"/> Ja, slet</button>
                    <button style={btn("outline",false,true)} onClick={()=>setDeleteConfirm(false)}>Annuller</button>
                  </div>
                </div>}
            </div>
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Luk</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SETUP SHEETS — list + detail + form (turning)
// ═══════════════════════════════════════════════════════
function SetupSheetsTab({user,setupSheets,setSetupSheets,machines,saveNow,stateRef,setupDeptParams,setSetupDeptParams,subDepartments,setSubDepartments,tools,cabinets,setTab,setFocusToolId,focusSheetId,setFocusSheetId,newSheetFor,setNewSheetFor}){
  const [view,setView]=useState("list");
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusSheetId){setSelectedId(focusSheetId);setView("detail");setFocusSheetId&&setFocusSheetId(null);}},[focusSheetId]);
  // Started a job with no sheet → open a new sheet with the job filled in
  const [prefill,setPrefill]=useState(null);
  useEffect(()=>{if(newSheetFor){setSelectedId(null);setPrefill(newSheetFor);setView("edit");setNewSheetFor&&setNewSheetFor(null);}},[newSheetFor]);
  const [search,setSearch]=useState("");
  const [deptFilt,setDeptFilt]=useState("all");
  const [subDeptFilt,setSubDeptFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const [showParamAdmin,setShowParamAdmin]=useState(false);
  const [adminParamDept,setAdminParamDept]=useState("");
  const [adminSubDept,setAdminSubDept]=useState("");
  const [newParamName,setNewParamName]=useState("");
  const [newSubDeptName,setNewSubDeptName]=useState("");
  const selected=selectedId?(setupSheets||[]).find(s=>s.id===selectedId):null;
  // All unique depts from subDepartments keys + machines
  const allDepts=[...new Set([...Object.keys(subDepartments||{}),...(machines||[]).map(m=>m.department).filter(Boolean)])].sort();
  // Current dept has sub-depts?
  const curSubDepts=(subDepartments||{})[deptFilt]||[];
  // Operator filtering: non-admins only see their assigned departments
  const userDepts=user?.departments||[];
  const visibleSheets=(user?.role==="admin"||userDepts.length===0)?(setupSheets||[]):(setupSheets||[]).filter(s=>userDepts.includes(s.department)||!s.department);
  // Sheets visible in current dept/sub-dept filter
  const deptSheets=visibleSheets.filter(s=>{
    if(deptFilt!=="all"&&(s.department||"")!==deptFilt) return false;
    if(subDeptFilt!=="all"&&(s.subDepartment||"")!==subDeptFilt) return false;
    return true;
  });
  const machineNames=[...new Set(deptSheets.map(s=>s.machine).filter(Boolean))].sort();
  const filtered=deptSheets.filter(s=>{
    if(machineFilt!=="all"&&s.machine!==machineFilt) return false;
    const q=search.trim().toLowerCase();
    if(q&&!(s.partNumber||"").toLowerCase().includes(q)&&!(s.customer||"").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  const saveSheets=(updated)=>{
    setSetupSheets(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupSheets:updated};
    saveNow&&saveNow();
  };
  const saveDeptParams=(updated)=>{
    setSetupDeptParams(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupDeptParams:updated};
    saveNow&&saveNow();
  };
  const saveSubDepts=(updated)=>{
    setSubDepartments(updated);
    if(stateRef) stateRef.current={...stateRef.current,subDepartments:updated};
    saveNow&&saveNow();
  };
  // Admin: which dept + sub-dept is being edited
  const editingAdminDept=adminParamDept||(allDepts[0]||"");
  const editingAdminDeptSubDepts=(subDepartments||{})[editingAdminDept]||[];
  const editingSubDept=adminSubDept||(editingAdminDeptSubDepts[0]||"");
  // The key into setupDeptParams for the currently-edited slot
  const editingKey=editingAdminDeptSubDepts.length>0?editingSubDept:editingAdminDept;
  const editingParams=(setupDeptParams||{})[editingKey]||[];
  const addParamOption=()=>{
    const v=newParamName.trim();
    if(!v||editingParams.includes(v)) return;
    saveDeptParams({...(setupDeptParams||{}),[editingKey]:[...editingParams,v]});
    setNewParamName("");
  };
  const removeParamOption=name=>saveDeptParams({...(setupDeptParams||{}),[editingKey]:editingParams.filter(x=>x!==name)});
  const addSubDept=()=>{
    const v=newSubDeptName.trim();
    if(!v) return;
    const cur=(subDepartments||{})[editingAdminDept]||[];
    if(cur.includes(v)) return;
    saveSubDepts({...(subDepartments||{}),[editingAdminDept]:[...cur,v]});
    setNewSubDeptName("");
    setAdminSubDept(v);
  };
  const removeSubDept=name=>{
    const cur=(subDepartments||{})[editingAdminDept]||[];
    saveSubDepts({...(subDepartments||{}),[editingAdminDept]:cur.filter(x=>x!==name)});
    if(adminSubDept===name) setAdminSubDept("");
  };
  const duplicateSheet=sheet=>{
    const now=Date.now();
    const copy={...sheet,id:now,partNumber:sheet.partNumber+" (kopi)",createdAt:now,updatedAt:now,createdBy:user?.name||""};
    const updated=[copy,...(setupSheets||[])];
    setSetupSheets(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupSheets:updated};
    setSelectedId(now);
    setView("edit");
  };
  const backupPdf=async(sheet)=>{
    try{await fetch("/api/setupsheet-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sheet})});}
    catch{}
  };
  // Compute dept-specific params for the form
  const sheetDept=selected?(machines||[]).find(m=>m.name===selected.machine)?.department||"":"";
  const formParamOptions=(setupDeptParams||{})[sheetDept]||(setupDeptParams||{})[""]||[];
  if(view==="edit") return(<SetupSheetForm sheet={selected} prefill={selected?null:prefill} machines={machines} user={user} setupDeptParams={setupDeptParams||{}} subDepartments={subDepartments||{}} tools={tools||[]} cabinets={cabinets||[]} onBack={()=>{setPrefill(null);setView(selected?"detail":"list");}} onSave={sheet=>{const updated=selected?(setupSheets||[]).map(s=>s.id===sheet.id?sheet:s):[sheet,...(setupSheets||[])];saveSheets(updated);backupPdf(sheet);setPrefill(null);setSelectedId(sheet.id);setView("detail");}}/>);
  const onGoToTool=toolId=>{setFocusToolId&&setFocusToolId(toolId);setTab&&setTab("tools");};
  if(view==="detail"&&selected) return(<SetupSheetDetail sheet={selected} tools={tools||[]} cabinets={cabinets||[]} onBack={()=>setView("list")} onEdit={()=>setView("edit")} onGoToTool={onGoToTool} onDuplicate={()=>duplicateSheet(selected)} onDelete={()=>{saveSheets((setupSheets||[]).filter(s=>s.id!==selected.id));setView("list");setSelectedId(null);}}/>);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{flex:1,position:"relative"}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
          <input style={{...inp(),paddingLeft:32}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søg tegningsnr. eller kunde…"/>
        </div>
        {user?.role==="admin"&&<button style={{...btn("outline",false,true),padding:"8px 12px",background:showParamAdmin?C.amber+"22":"none",borderColor:showParamAdmin?C.amber:C.border,color:showParamAdmin?C.amber:C.muted}} onClick={()=>setShowParamAdmin(p=>!p)} title="Administrer parametre"><i className="ti ti-settings"/></button>}
        <button style={btn("primary",false,true)} onClick={()=>{setSelectedId(null);setPrefill(null);setView("edit");}}><i className="ti ti-plus"/></button>
      </div>
      {showParamAdmin&&user?.role==="admin"&&(
        <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,padding:"14px",marginBottom:12}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Opstillingsparametre — admin</div>
          {/* Dept tabs */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {allDepts.map(d=>(
              <button key={d} style={{fontSize:13,padding:"4px 12px",borderRadius:20,border:`1px solid ${editingAdminDept===d?C.amber:C.border}`,background:editingAdminDept===d?C.amber+"22":C.raised,color:editingAdminDept===d?C.amber:C.muted,cursor:"pointer",fontWeight:editingAdminDept===d?700:400}} onClick={()=>{setAdminParamDept(d);setAdminSubDept("");setNewParamName("");setNewSubDeptName("");}}>{d}</button>
            ))}
          </div>
          {/* Sub-dept management (for depts that use sub-depts like Fortanding) */}
          {editingAdminDeptSubDepts.length>0&&(
            <div style={{background:C.raised,borderRadius:8,padding:"10px 12px",marginBottom:10,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Underafdelinger i {editingAdminDept}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {editingAdminDeptSubDepts.map(sd=>(
                  <div key={sd} style={{display:"flex",alignItems:"center",gap:4,background:editingSubDept===sd?C.amber+"22":C.surface,borderRadius:16,padding:"3px 6px 3px 10px",border:`1px solid ${editingSubDept===sd?C.amber:C.border}`,cursor:"pointer"}} onClick={()=>{setAdminSubDept(sd);setNewParamName("");}}>
                    <span style={{fontSize:14,color:editingSubDept===sd?C.amber:C.text,fontWeight:editingSubDept===sd?700:400}}>{sd}</span>
                    <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px"}} onClick={e=>{e.stopPropagation();removeSubDept(sd);}}><i className="ti ti-x"/></button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp(),flex:1,fontSize:14}} value={newSubDeptName} onChange={e=>setNewSubDeptName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSubDept()} placeholder="Tilføj underafdeling…"/>
                <button style={btn("primary",false,true)} onClick={addSubDept}><i className="ti ti-plus"/></button>
              </div>
            </div>
          )}
          {/* Add sub-dept support to a plain dept */}
          {editingAdminDeptSubDepts.length===0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,color:C.muted,marginBottom:6}}>Tilføj underafdelinger til <strong>{editingAdminDept}</strong></div>
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp(),flex:1,fontSize:14}} value={newSubDeptName} onChange={e=>setNewSubDeptName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSubDept()} placeholder="Navn på underafdeling (f.eks. Affolter 160)"/>
                <button style={btn("primary",false,true)} onClick={addSubDept}><i className="ti ti-plus"/></button>
              </div>
            </div>
          )}
          {/* Param list for the editing key */}
          {editingKey&&(
            <>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Parametre for {editingKey}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {editingParams.length===0&&<div style={{fontSize:14,color:C.muted}}>Ingen parametre endnu.</div>}
                {editingParams.map(name=>(
                  <div key={name} style={{display:"flex",alignItems:"center",gap:4,background:C.raised,borderRadius:16,padding:"4px 8px 4px 10px",border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:14,color:C.text}}>{name}</span>
                    <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px"}} onClick={()=>removeParamOption(name)}><i className="ti ti-x"/></button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...inp(),flex:1}} value={newParamName} onChange={e=>setNewParamName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addParamOption()} placeholder={`Tilføj parameter for ${editingKey}…`}/>
                <button style={btn("primary",false,true)} onClick={addParamOption}><i className="ti ti-plus"/></button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Department tabs */}
      {allDepts.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {["all",...allDepts].map(d=><button key={d} style={{fontSize:13,padding:"4px 12px",borderRadius:20,border:`1px solid ${deptFilt===d?C.blue:C.border}`,background:deptFilt===d?"rgba(59,130,246,.15)":C.raised,color:deptFilt===d?"#3b82f6":C.muted,cursor:"pointer",fontWeight:deptFilt===d?700:400}} onClick={()=>{setDeptFilt(d);setSubDeptFilt("all");setMachineFilt("all");}}>{d==="all"?"Alle afdelinger":d}</button>)}
        </div>
      )}
      {/* Sub-dept tabs (shown when current dept has sub-depts) */}
      {curSubDepts.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {["all",...curSubDepts].map(sd=><button key={sd} style={{fontSize:13,padding:"3px 10px",borderRadius:20,border:`1px solid ${subDeptFilt===sd?"#a78bfa":C.border}`,background:subDeptFilt===sd?"rgba(167,139,250,.15)":C.raised,color:subDeptFilt===sd?"#a78bfa":C.muted,cursor:"pointer",fontWeight:subDeptFilt===sd?700:400}} onClick={()=>{setSubDeptFilt(sd);setMachineFilt("all");}}>{sd==="all"?"Alle underafd.":sd}</button>)}
        </div>
      )}
      {/* Machine sub-filter */}
      {machineNames.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{["all",...machineNames].map(m=><button key={m} style={{fontSize:13,padding:"3px 10px",borderRadius:20,border:`1px solid ${machineFilt===m?C.amber:C.border}`,background:machineFilt===m?C.amber+"22":C.raised,color:machineFilt===m?C.amber:C.muted,cursor:"pointer",fontWeight:machineFilt===m?700:400}} onClick={()=>setMachineFilt(m)}>{m==="all"?"Alle maskiner":m}</button>)}</div>}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}><i className="ti ti-clipboard-list" style={{fontSize:40,display:"block",marginBottom:12,opacity:.25}}/><div style={{fontSize:16,marginBottom:6}}>Ingen opstillingsark endnu.</div><div style={{fontSize:14,color:C.amber,cursor:"pointer"}} onClick={()=>{setSelectedId(null);setPrefill(null);setView("edit");}}>+ Opret dit første opstillingsark</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(s=>(
          <div key={s.id} onClick={()=>{setSelectedId(s.id);setView("detail");}} style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:2}}>{s.partNumber}</div><div style={{fontSize:14,color:C.muted}}>{[s.customer,s.material].filter(Boolean).join(" · ")}</div></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:"2px 4px",borderRadius:4}} title="Kopier ark" onClick={e=>{e.stopPropagation();duplicateSheet(s);}}><i className="ti ti-copy"/></button>
                {s.department&&deptFilt==="all"&&<span style={{fontSize:12,fontWeight:700,color:C.blue,background:"rgba(59,130,246,.12)",padding:"2px 7px",borderRadius:6}}>{s.department}</span>}{s.subDepartment&&subDeptFilt==="all"&&<span style={{fontSize:12,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,.12)",padding:"2px 7px",borderRadius:6}}>{s.subDepartment}</span>}<span style={{fontSize:13,fontWeight:700,color:C.amber,background:"rgba(240,165,0,.12)",padding:"3px 8px",borderRadius:6}}>{s.machine}</span>{s.operation&&<span style={{fontSize:12,fontWeight:700,padding:"2px 7px",borderRadius:6,color:{"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted,background:{"Side 1":"rgba(59,130,246,.12)","Side 2":"rgba(46,213,115,.12)","Finish Part":"rgba(240,165,0,.12)"}[s.operation]||"transparent"}}>{s.operation}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:12,fontSize:12,color:C.muted,letterSpacing:.5}}>
              <span><i className="ti ti-tool"/> {(s.tools||[]).filter(t=>t.description).length} værktøj</span>
              {(s.tools2||[]).filter(t=>t.description).length>0&&<span><i className="ti ti-tool"/> {(s.tools2||[]).filter(t=>t.description).length} sub</span>}
              <span><i className="ti ti-calendar"/> {fmtDate(s.updatedAt||s.createdAt)}</span>
              {s.createdBy&&<span><i className="ti ti-user"/> {s.createdBy}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Blank Eriks/150 setup values — used by both the detail view and the form
const ERIKS_BLANK={mn:"",z:"",beta:"",dk:"",uo:"",df:"",fraeserDia:"",fraesLagerLinks:"",fraesLagerRechts:"",fraesLag3:"",fraesLag4:"",richtung:"Gegenlauf",differential:"ausgerastet",zahnzahl:"",zahnzahlRatio:"",zahnD:"",zahnZw:"",zahnC:"",zahnB:"",zahnA:"",steigung:"",steigA:"",steigZw:"",steigB:"",steigC:"",steigD:"",fraesDrehzahl:"",fraesA:"",fraesB:"",fraesC:"",fraesD:"",laengs:"",laengsA:"",laengsB:"",laengsC:"",laengsZw:"",laengsD:"",schalterA2:"",schalterA3:"",schalterA4:"",schalterA5:"",tauchsteuerung:"",eingang:"m. Zwischenrad",stckStd:"",stckSpannung:""};

function SetupSheetDetail({sheet,tools,cabinets,onBack,onEdit,onDelete,onGoToTool,onDuplicate}){
  const [deleteConfirmSS,setDeleteConfirmSS]=useState(false);
  const [lightboxPhoto,setLightboxPhoto]=useState(null);
  const [mzDetOpen,setMzDetOpen]=useState({schnecke:false,werkstuck:false,entgraten:false});
  const rc=pos=>{if(!pos)return"";return(sheet.restartPrefix||"NAT")+String(pos).padStart(sheet.restartPad||2,"0");};
  const filledTools=(sheet.tools||[]).filter(t=>t.description||t.label);
  const filledTools2=(sheet.tools2||[]).filter(t=>t.description||t.label);
  const filledTools3=(sheet.tools3||[]).filter(t=>t.description||t.label);
  const findLoc=toolId=>{if(!toolId)return null;const t=(tools||[]).find(x=>String(x.id)===String(toolId));if(!t)return null;const cab=(cabinets||[]).find(c=>String(c.id)===String(t.cabinetId));const drw=cab?.drawers?.find(d=>String(d.id)===String(t.drawerId));if(!cab)return null;return{cab:cab.name,drw:drw?`Drawer ${drw.number}${drw.label?` — ${drw.label}`:""}`:null};};
  const opColors={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber};
  const opColor=opColors[sheet.operation]||C.muted;
  const renderToolList=(toolArr,accent)=>(
    <div style={{background:C.surface,borderRadius:10,border:`1px solid ${accent||C.border}`,overflow:"hidden"}}>
      {toolArr.map((t,i)=>{
        const cabTool=t.toolId?(tools||[]).find(x=>String(x.id)===String(t.toolId)):null;
        const loc=findLoc(t.toolId);
        return(
        <div key={t.position} style={{borderBottom:i<toolArr.length-1?`1px solid ${C.border}`:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px"}}>
            <div style={{width:30,height:30,borderRadius:6,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:accent||C.amber,flexShrink:0}}>{t.position}</div>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:16,fontWeight:600,color:C.text}}>{t.description}</div>
              {cabTool&&(
                <button onClick={()=>onGoToTool&&onGoToTool(t.toolId)} style={{background:C.blue+"18",border:`1px solid ${C.blue}44`,borderRadius:7,padding:"5px 10px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,alignSelf:"flex-start",maxWidth:"100%"}}>
                  <i className="ti ti-map-pin" style={{fontSize:15,color:C.blue,flexShrink:0}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.blue,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cabTool.name}</div>
                    {loc&&<div style={{fontSize:12,color:C.muted}}>{loc.cab}{loc.drw?` · ${loc.drw}`:""}</div>}
                  </div>
                  <i className="ti ti-arrow-right" style={{fontSize:14,color:C.blue,marginLeft:4,flexShrink:0}}/>
                </button>
              )}
              {t.label&&<div style={{fontSize:13,color:C.muted}}>{t.label}</div>}
            </div>
            <div style={{fontSize:13,color:C.muted,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{rc(t.position)}</div>
          </div>
        </div>
      );})}
    </div>
  );
  const sheetParams=(sheet.params&&sheet.params.length)?sheet.params:[["Chuck Name",sheet.chuckName],["Chuck Overhang",sheet.chuckOverhang],["Clamping Pressure",sheet.clampingPressure],["Zero Point",sheet.zeroPoint],["Workpiece Stop",sheet.workpieceStop]].filter(([,v])=>v).map(([k,v])=>({key:k,value:v}));
  const params=sheetParams.filter(p=>p.value);

  const printPdf=()=>{
    const w=window.open("","_blank","width=860,height=1100");
    if(!w) return;
    const rows=t=>`<tr><td class="mono">${t.position}</td><td>${t.description||""}</td><td class="grey">${t.label||""}</td><td class="mono amber">${rc(t.position)}</td></tr>`;
    const toolTable=(title,accent,toolArr)=>{const filled=(toolArr||[]).filter(t=>t.description);if(!filled.length)return"";return`<h2 style="color:${accent}">${title}</h2><table><thead><tr><th>Pos.</th><th>Beskrivelse</th><th>Mærkat</th><th>Genstart</th></tr></thead><tbody>${filled.map(rows).join("")}</tbody></table>`;};
    const pdfParams=params;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sheet.partNumber} — opstillingsark</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:0}
.header{background:#1a2233;color:#fff;padding:18px 24px 14px}
.header h1{font-size:22px;color:#f0a500;margin-bottom:4px}
.header .sub{font-size:11px;color:#aab;letter-spacing:.5px}
.body{padding:18px 24px}
h2{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 10px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:4px}
.field{font-size:12px}.field b{color:#111}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
th{text-align:left;padding:5px 8px;background:#f0f0f0;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#666}
td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
tr:nth-child(even) td{background:#fafafa}
.mono{font-family:monospace;font-weight:700}
.amber{color:#b07d00}.grey{color:#888}
.params{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
.pbox{background:#f4f6ff;border:1px solid #dde;border-radius:6px;padding:10px 14px}
.plabel{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:4px}
.pval{font-size:18px;font-family:monospace;font-weight:700;color:#1a2233}
.notes{background:#f8f8f8;border-radius:4px;padding:10px 14px;font-size:12px;white-space:pre-wrap;line-height:1.6}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
.photo-box{border-radius:6px;overflow:hidden;border:1px solid #e0e0e0}
.photo-box img{width:100%;display:block;max-height:220px;object-fit:cover}
.photo-cap{font-size:10px;color:#666;padding:4px 8px;background:#f8f8f8}
footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:9px;color:#aaa;text-align:center}
@media print{@page{margin:12mm}body{padding:0}.no-print{display:none}}
</style></head><body>
<div class="header"><h1>${sheet.partNumber||""}</h1>
<div class="sub">${[sheet.customer,sheet.machine,sheet.material,sheet.operation&&"Op. "+sheet.operation].filter(Boolean).join(" &nbsp;·&nbsp; ")}</div></div>
<div class="body">
<h2>Identifikation</h2>
${sheet.subProgram?`<div style="background:#fffbea;border:2px solid #b07d00;border-radius:8px;padding:12px 16px;margin-bottom:14px"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#b07d00;margin-bottom:4px">Programnavn</div><div style="font-size:26px;font-family:monospace;font-weight:800;color:#b07d00;letter-spacing:2px">${sheet.subProgram}</div></div>`:""}
<div class="meta">${[["Maskine",sheet.machine],["Kunde",sheet.customer],["Materiale",sheet.material],["Revision",sheet.revision],["Operation",sheet.operation],["Planprogram",sheet.planProgram]].filter(([,v])=>v).map(([k,v])=>`<div class="field"><span class="grey">${k}: </span><b>${v}</b></div>`).join("")}</div>
${toolTable("Værktøjsliste — hoved","#b07d00",sheet.tools)}
${toolTable("Værktøjsliste — under","#1a6eb5",sheet.tools2)}
${toolTable("Værktøjsliste — 3.","#1a8c55",sheet.tools3)}
${pdfParams.length?`<h2>Opstillingsparametre</h2><div class="params">${pdfParams.map(p=>`<div class="pbox"><div class="plabel">${p.key}</div><div class="pval">${p.value}</div></div>`).join("")}</div>`:""}
${sheet.notes?`<h2>Noter</h2><div class="notes">${sheet.notes}</div>`:""}
${(sheet.photos||[]).length?`<h2>Fotos</h2><div class="photos">${sheet.photos.map(p=>`<div class="photo-box"><img src="${p.url}" onerror="this.style.display='none'"/>${p.caption?`<div class="photo-cap">${p.caption}</div>`:""}</div>`).join("")}</div>`:""}
<footer>ShopTrack opstillingsark &nbsp;·&nbsp; ${sheet.partNumber||""} / ${sheet.machine||""} &nbsp;·&nbsp; ${new Date().toLocaleDateString("da-DK",{day:"2-digit",month:"short",year:"numeric"})}</footer>
</div>
<div class="no-print" style="position:fixed;top:10px;right:10px">
<button onclick="window.print()" style="background:#1a2233;color:#f0a500;border:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Udskriv / gem som PDF</button>
</div>
</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <button style={{...btn("outline",false,true),padding:"8px 12px",flexShrink:0}} onClick={onBack}><i className="ti ti-arrow-left"/></button>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:20,fontWeight:700,color:C.text}}>{sheet.partNumber}</div><div style={{fontSize:14,color:C.muted}}>{[sheet.customer,sheet.machine,sheet.operation&&`Op ${sheet.operation}`].filter(Boolean).join(" · ")}</div></div>
        {onDuplicate&&<button style={{...btn("outline",false,true),padding:"10px 16px",flexShrink:0,fontSize:24}} title="Kopier ark" onClick={onDuplicate}><i className="ti ti-copy"/></button>}
        <button style={{...btn("outline",false,true),padding:"10px 16px",flexShrink:0,fontSize:24}} onClick={onEdit}><i className="ti ti-edit"/></button>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {sheet.department&&<span style={{fontSize:13,fontWeight:700,color:C.blue,background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.3)",borderRadius:6,padding:"3px 10px"}}><i className="ti ti-building" style={{fontSize:13}}/> {sheet.department}</span>}
        {sheet.subDepartment&&<span style={{fontSize:13,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,.12)",border:"1px solid rgba(167,139,250,.3)",borderRadius:6,padding:"3px 10px"}}><i className="ti ti-git-branch" style={{fontSize:13}}/> {sheet.subDepartment}</span>}
        {sheet.machine&&<span style={{fontSize:13,fontWeight:700,color:C.amber,background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",borderRadius:6,padding:"3px 10px"}}>{sheet.machine}</span>}
      </div>
      {sheet.operation&&(
        <div style={{background:`${opColor}18`,border:`2px solid ${opColor}`,borderRadius:10,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
          <i className="ti ti-refresh" style={{fontSize:20,color:opColor,flexShrink:0}}/>
          <div><div style={{fontSize:11,color:opColor,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>Operation</div><div style={{fontSize:22,fontWeight:800,color:opColor,letterSpacing:1}}>{sheet.operation}</div></div>
        </div>
      )}
      {sheet.subProgram&&(
        <div style={{background:"rgba(240,165,0,.1)",border:`2px solid ${C.amber}`,borderRadius:10,padding:"12px 16px",marginBottom:10}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Programnavn</div>
          <div style={{fontSize:28,fontWeight:800,color:C.amber,fontFamily:"'Share Tech Mono',monospace",letterSpacing:2,lineHeight:1}}>{sheet.subProgram}</div>
        </div>
      )}
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Maskine",sheet.machine],["Materiale",sheet.material],["Revision",sheet.revision],...(sheet.subDepartment?[]:[["Planprogram",sheet.planProgram]])].filter(([,v])=>v).map(([k,v])=>(<div key={k}><div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>{k}</div><div style={{fontSize:16,fontWeight:600,color:C.text}}>{v}</div></div>))}
        </div>
      </div>
      {sheet.subDepartment&&filledTools.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opspændingsværktøj</div>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden"}}>
            {sheet.toolModul&&<div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:13,color:C.amber,fontWeight:700,minWidth:60}}>Modul</span><span style={{fontSize:20,fontWeight:800,fontFamily:"'Share Tech Mono',monospace",color:C.amber}}>{sheet.toolModul}</span></div>}
            {filledTools.map((t,i)=>{
              const slotLabel=i===0?"Øverste værktøj":"Nederste værktøj";
              const cabTool=t.toolId?(tools||[]).find(x=>String(x.id)===String(t.toolId)):null;
              const loc=findLoc(t.toolId);
              return(
                <div key={t.position} style={{borderBottom:i<filledTools.length-1?`1px solid ${C.border}`:"none",padding:"10px 14px"}}>
                  <div style={{fontSize:11,color:C.amber,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{slotLabel}</div>
                  {t.description&&<div style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:4}}>{t.description}</div>}
                  {cabTool&&(<button onClick={()=>onGoToTool&&onGoToTool(t.toolId)} style={{background:C.blue+"18",border:`1px solid ${C.blue}44`,borderRadius:7,padding:"5px 10px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,marginBottom:4}}><i className="ti ti-map-pin" style={{fontSize:15,color:C.blue}}/><div><div style={{fontSize:14,fontWeight:700,color:C.blue}}>{cabTool.name}</div>{loc&&<div style={{fontSize:12,color:C.muted}}>{loc.cab}{loc.drw?` · ${loc.drw}`:""}</div>}</div><i className="ti ti-arrow-right" style={{fontSize:14,color:C.blue,marginLeft:4}}/></button>)}
                  {t.label&&<div style={{fontSize:13,color:C.muted}}>{t.label}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!sheet.subDepartment&&filledTools.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — hoved</div>{renderToolList(filledTools,C.amber)}</div>}
      {filledTools2.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — under</div>{renderToolList(filledTools2,C.blue)}</div>}
      {filledTools3.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — 3.</div>{renderToolList(filledTools3,C.green)}</div>}
      {sheet.subDepartment==="MZ"&&(()=>{
        const mz=sheet.mzSetup||{};
        const bool=v=>(v===true||v==="Ja")?"Ja":"Nej";
        const items=[
          ["Forlænger",mz.fraesForlaenger||null],
          ["Fræser Mn",mz.fraesMn||null],
          ["Stop Ø",mz.stopDia||null],
          ["Tang tryk",mz.tangTryk!=null&&mz.tangTryk!==""?String(mz.tangTryk):null],
          ["Værktøj i tang",mz.vaerktoejITang!=null?bool(mz.vaerktoejITang):null],
          ["Tang nr.",mz.tangNummer||null],
          ["Tang form",mz.tangForm||null],
          ["Pinoltryk",mz.pinoltryk!=null&&mz.pinoltryk!==""?String(mz.pinoltryk):null],
          ["Pinoldok",mz.pinoldokType||null],
          ["Hastighed",mz.hastighed!=null&&mz.hastighed!==""?String(mz.hastighed):null],
          ["Luft",mz.luft!=null?bool(mz.luft):null],
          ["Spindel",mz.spindel||null],
          ["Olie",mz.olie||null],
          ["Emne udhæng",mz.emneUdhaeng||null],
          ["Pinoldok udhæng",mz.pinoldokUdhaeng||null],
        ].filter(([,v])=>v!==null);
        if(!items.length) return null;
        return(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opstillingsparametre</div>
            <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              {items.map(([k,v])=>(
                <div key={k} style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:8,alignItems:"center",padding:"8px 14px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontSize:13,color:C.muted,fontWeight:600}}>{k}</div>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {sheet.subDepartment!=="MZ"&&params.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opstillingsparametre</div>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {params.map((p,pi)=>(<div key={pi}><div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{p.key}</div><div style={{fontSize:22,fontWeight:700,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{p.value}</div></div>))}
            </div>
          </div>
        </div>
      )}
      {sheet.notes&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Noter</div><div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",fontSize:15,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{sheet.notes}</div></div>}
      {(sheet.photos||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Fotos</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {sheet.photos.map((p,i)=>(
              <div key={i} style={{borderRadius:8,overflow:"hidden",background:C.raised,aspectRatio:"4/3",position:"relative",cursor:"zoom-in"}} onClick={()=>setLightboxPhoto(p)}>
                <img src={p.url} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                {p.caption&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",color:"#fff",fontSize:16,fontWeight:500,padding:"8px 10px",lineHeight:1.4}}>{p.caption}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {lightboxPhoto&&(
        <div onClick={()=>setLightboxPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
          <img src={lightboxPhoto.url} style={{maxWidth:"100%",maxHeight:"calc(100vh - 120px)",borderRadius:10,objectFit:"contain",boxShadow:"0 8px 40px rgba(0,0,0,.6)"}} onClick={e=>e.stopPropagation()}/>
          {lightboxPhoto.caption&&(
            <div onClick={e=>e.stopPropagation()} style={{marginTop:14,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"14px 20px",maxWidth:600,width:"100%",color:"#fff",fontSize:20,fontWeight:500,lineHeight:1.5,textAlign:"center"}}>
              {lightboxPhoto.caption}
            </div>
          )}
          <button onClick={()=>setLightboxPhoto(null)} style={{marginTop:14,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,color:"#fff",fontSize:16,fontWeight:700,padding:"10px 28px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><i className="ti ti-x"/> Luk</button>
        </div>
      )}
      {sheet.subDepartment==="150"&&(()=>{
        const e={...ERIKS_BLANK,...(sheet.eriksSetup||{})};
        const mono={fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17};
        const kv=(lbl,val,unit)=>val?(<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:13,color:C.muted,fontWeight:600,minWidth:130}}>{lbl}</div><div style={{...mono,flex:1}}>{val}</div>{unit&&<div style={{fontSize:12,color:C.muted}}>{unit}</div>}</div>):null;
        const secH=(t)=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
        const gearRow=(label,fields)=>{
          const vals=fields.filter(([,v])=>v);
          if(!vals.length) return null;
          return(<div style={{padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,color:C.muted,fontWeight:600}}>{label}: </span>{vals.map(([k,v])=><span key={k} style={{marginRight:12}}><span style={{fontSize:12,color:C.muted}}>{k}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>)}</div>);
        };
        const fraesImg=(side)=>(
          <svg width="90" height="80" viewBox="0 0 100 90">
            <rect x="5" y="72" width="90" height="6" rx="1" fill="none" stroke={C.muted} strokeWidth="1.2"/>
            <ellipse cx="50" cy="68" rx="14" ry="6" fill="none" stroke={C.muted} strokeWidth="1.2"/>
            <g transform={`rotate(${side==="L"?-28:28},50,68)`}>
              <line x1="50" y1="68" x2="50" y2="18" stroke={C.muted} strokeWidth="2"/>
              <circle cx="50" cy="14" r="13" fill="none" stroke={C.amber} strokeWidth="1.5"/>
              <circle cx="50" cy="14" r="3" fill={C.amber} opacity="0.6"/>
              {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(<line key={a} x1={50+13*Math.cos(a*Math.PI/180)} y1={14+13*Math.sin(a*Math.PI/180)} x2={50+16*Math.cos(a*Math.PI/180)} y2={14+16*Math.sin(a*Math.PI/180)} stroke={C.muted} strokeWidth="1"/>))}
            </g>
            <text x="50" y="88" textAnchor="middle" fontSize="8" fill={C.muted}>{side==="L"?"Links":"Rechts"}</text>
          </svg>
        );
        return(<div style={{marginBottom:14}}>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:8}}>
            {secH("Fräser / Fræser")}
            <div style={{padding:"8px 14px",display:"flex",gap:16,flexWrap:"wrap",borderBottom:`1px solid ${C.border}`}}>
              {[["mn",e.mn],["Z",e.z],["β",e.beta],["dk",e.dk],["uo",e.uo],["df",e.df]].filter(([,v])=>v).map(([lbl,v])=>(<span key={lbl} style={{marginRight:8}}><span style={{fontSize:12,color:C.muted}}>{lbl}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>))}
              {e.fraeserDia&&<span><span style={{fontSize:12,color:C.muted}}>Fräser Ø </span><span style={{...mono,fontSize:16}}>{e.fraeserDia}</span></span>}
            </div>
            {(e.fraesLagerLinks||e.fraesLagerRechts||e.fraesLag3||e.fraesLag4)&&(<>
              {secH("Fräslagerstellung / Fræserposition")}
              <div style={{padding:"10px 14px"}}>
                {(()=>{
                  const isDark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&window.matchMedia("(prefers-color-scheme:dark)").matches);
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[["fraesLagerLinks",e.fraesLagerLinks,0,0],["fraesLagerRechts",e.fraesLagerRechts,1,0],["fraesLag3",e.fraesLag3,0,1],["fraesLag4",e.fraesLag4,1,1]].map(([k,val,xi,yi])=>(
                        <div key={k} style={{display:"flex",flexDirection:"column",gap:0,border:`2px solid ${val?C.amber:C.border}`,borderRadius:10,overflow:"hidden"}}>
                          <div style={{aspectRatio:"4/3",backgroundImage:"url(/eriks-fraeslager-grid.png)",backgroundSize:"200% 200%",backgroundPosition:`${xi*100}% ${yi*100}%`,backgroundRepeat:"no-repeat",backgroundColor:isDark?C.raised:"#fff",filter:isDark?"invert(1)":"none"}}/>
                          <div style={{padding:"6px 10px",background:C.raised,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"baseline",justifyContent:"center",gap:4}}>
                            <span style={{...mono,fontSize:24,color:val?C.green:C.muted}}>{val||"—"}</span>
                            {val&&<span style={{fontSize:18,color:C.amber,fontWeight:700}}>°</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>)}
            {secH("Laufrichtung / Retning")}
            <div style={{padding:"8px 14px",display:"flex",gap:16,borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:15,fontWeight:700,color:C.amber}}>{e.richtung}</span>
              <span style={{fontSize:15,color:C.blue}}>Diff. {e.differential}</span>
            </div>
            {secH("Zahnzahl / Antal tænder")}
            {kv("Zahnzahl",e.zahnzahl,"")}
            {kv("i",e.zahnzahlRatio,"")}
            {gearRow("Räder",[["d",e.zahnD],["Zw",e.zahnZw],["c",e.zahnC],["b",e.zahnB],["a",e.zahnA]])}
            {secH("Steigung / Stigning")}
            {kv("Steigung",e.steigung,"")}
            {gearRow("Räder",[["a",e.steigA],["Zw",e.steigZw],["b",e.steigB],["C",e.steigC],["d",e.steigD]])}
            {secH("Fräserdrehzahl / Fræser omdr.")}
            {kv("Fräserdrehzahl",e.fraesDrehzahl,"")}
            {gearRow("Räder",[["a",e.fraesA],["b",e.fraesB],["c",e.fraesC],["d",e.fraesD]])}
            {secH("Längsvorschub / Langsgående tilspænding")}
            {kv("Längsvorschub",e.laengs,"")}
            {gearRow("Räder",[["a",e.laengsA],["b",e.laengsB],["c",e.laengsC],["Zw",e.laengsZw],["d",e.laengsD]])}
            {(e.schalterA2||e.schalterA3||e.schalterA4||e.schalterA5)&&(<>
              {secH("Schalterstellungen / Kontaktstillinger")}
              <div style={{padding:"8px 14px",display:"flex",gap:16,flexWrap:"wrap",borderBottom:`1px solid ${C.border}`}}>
                {[["a2",e.schalterA2],["a3",e.schalterA3],["a4",e.schalterA4],["a5",e.schalterA5]].filter(([,v])=>v).map(([lbl,v])=>(<span key={lbl}><span style={{fontSize:12,color:C.muted}}>{lbl}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>))}
              </div>
            </>)}
            {kv("Tauchsteuerung",e.tauchsteuerung,"")}
            {kv("Stck/Std",e.stckStd,"")}
            {kv("Stck/Spannung",e.stckSpannung,"")}
            {secH("Eingang / Indgang")}
            <div style={{padding:"8px 14px"}}><span style={{fontSize:15,fontWeight:700,color:C.amber}}>{e.eingang||"—"}</span></div>
          </div>
        </div>);
      })()}
      {sheet.subDepartment==="MZ"&&(()=>{
        const adv=sheet.mzAdvanced||{};
        const hdr=(key,de,en,icon)=>(
          <button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:mzDetOpen[key]?"rgba(240,165,0,.1)":C.surface,border:"none",borderBottom:mzDetOpen[key]?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left"}} onClick={()=>setMzDetOpen(p=>({...p,[key]:!p[key]}))}>
            <i className={`ti ${icon}`} style={{color:C.amber,fontSize:17,flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:C.text}}>{de}</div><div style={{fontSize:13,color:C.muted}}>{en}</div></div>
            <i className={`ti ti-chevron-${mzDetOpen[key]?"up":"down"}`} style={{color:C.muted,fontSize:16}}/>
          </button>
        );
        const row=(de,en,val,unit)=>val!=null&&val!==""?(<div style={{display:"grid",gridTemplateColumns:"1fr auto 70px",gap:6,alignItems:"center",padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{de}</div><div style={{fontSize:12,color:C.muted}}>{en}</div></div>
          {unit?<div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{unit}</div>:<div/>}
          <div style={{fontSize:17,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green,textAlign:"right"}}>{val}</div>
        </div>):null;
        const subHdr=t=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
        const s=adv.schnecke||{},w=adv.werkstuck||{},ev=adv.entgratenVorne||{},eh=adv.entgratenHinten||{};
        const entRows=(d,de,en)=>(<div>{subHdr(`${de} / ${en}`)}{row("Entgraten","Afgratning",d.entgraten,"0=Nein 1=Ja")}{row("Startpunkt in X","Startpunkt X",d.startpunktX,"[mm]")}{row("Startdurchmesser","Startdiameter",d.startdurchmesser,"[mm]")}{row("Kerndurchmesser","Kernediameter",d.kerndurchmesser,"[mm]")}{row("Verdrehung in Z","Drejning i Z",d.verdrehungZ,"[Grad]")}{row("Steigung","Stigning",d.steigung,"[mm]")}{row("Versatz","Forskydning",d.versatz,"[mm]")}{row("Entgratwinkel","Afgratningsvinkel",d.entgratwinkel,"[Grad]")}{row("Gangzahl Fräser","Fræserens gange",d.gangzahlFraeser,"[1,2]")}</div>);
        const hasSchnecke=Object.values(s).some(v=>v!=="");
        const hasWerk=Object.values(w).some(v=>v!=="");
        const hasEntgraten=Object.values(ev).some(v=>v!=="")||Object.values(eh).some(v=>v!=="");
        if(!hasSchnecke&&!hasWerk&&!hasEntgraten) return null;
        return(<div style={{marginBottom:14}}>
          {hasSchnecke&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("schnecke","Schnecke","Snekke","ti-rotate-clockwise")}
            {mzDetOpen.schnecke&&<div>
              {subHdr("Parameter Schnecke / Snekkeparametre")}
              {row("Gewindesteigung","Gevindstigning",s.gewindesteigung,"[mm]")}{row("Steigungswinkel","Stigningsvinkel",s.steigungswinkel,"[Grad]")}{row("Vorlauf","Forløb",s.vorlauf,"[mm]")}{row("Eintauchlänge X","Indstikslængde X",s.eintauchlaengeX,"[mm]")}{row("Fräslänge","Fræselængde",s.fraeslaenge,"[mm]")}{row("Austauchlänge X","Udløbslængde X",s.austauchlaengeX,"[mm]")}{row("Ausgangsstellung X","Startposition X",s.ausgangsstellungX,"[mm]")}{row("Konizität","Konicitet",s.konizitaet,"[mm/Fräslänge]")}{row("Steigungskorrektur","Stigningskorrektion",s.steigungskorrektur,"[mm/Messlänge]")}{row("Messlänge","Målelængde",s.messlaenge,"[mm]")}
              {subHdr("Durchmesser / Diametre")}
              {row("Startdurchmesser","Startdiameter",s.startdurchmesser,"[mm]")}{row("Eintauchdurchmesser","Indstiksdiameter",s.eintauchdurchmesser,"[mm]")}{row("Kerndurchmesser","Kernediameter",s.kerndurchmesser,"[mm]")}{row("Austauchdurchmesser","Udløbsdiameter",s.austauchdurchmesser,"[mm]")}{row("Enddurchmesser","Slutdiameter",s.enddurchmesser,"[mm]")}{row("Schlichtzustellung","Sletfremføring",s.schlichtzustellung,"[mm]")}{row("Rechts=1, Links=2","Højre=1, Venstre=2",s.rechtsLinks,"")}{row("Gleichlauf=1, Gegenlauf=2","Medløb=1, Modløb=2",s.gleichlaufGegenlauf,"")}
            </div>}
          </div>}
          {hasWerk&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("werkstuck","Werkstückparameter","Emneparametre","ti-settings")}
            {mzDetOpen.werkstuck&&<div>
              {row("Fräserdurchmesser","Fræserdiameter",w.fraeserdurchmesser,"[mm]")}{row("Stückzahl","Antal",w.stueckzahl,"")}{row("Teilung","Stigning",w.teilung,"[1–99]")}{row("Vorschub Tauchen","Tilspænding indstik",w.vorschubTauchen,"[mm/min]")}{row("Vorschub Fräsen","Tilspænding fræsning",w.vorschubFraesen,"[mm/min]")}{row("Phasenverschiebung","Faseforskydning",w.phasenverschiebung,"[Grad]")}{row("Ladestellung X-Achse","Ladeposition X",w.ladestellungX,"[mm]")}{row("Ladestellung Y-Achse","Ladeposition Y",w.ladestellungY,"[mm]")}{row("Drehrichtung Fräser","Fræserens omløbsretning",w.drehrichtungFraeser,"[+1/-1]")}
              {subHdr("Nute / Not")}
              {row("Nute einstechen","Indstik not",w.nuteEinstechen,"[1=Ja, 0=Nein]")}{row("Einstechposition","Indstiksposition",w.einstechposition,"[mm]")}{row("Kerndurchmesser Nut","Kernediameter not",w.kerndurchmesserNut,"[mm]")}{row("Schwenkwinkel","Svingvinkel",w.schwenkwinkel,"[Grad]")}{row("Lader","Lader",w.lader,"[1,2,3,4]")}{row("Zange=1, Tasseau=2, Spitze=3","Tang=1, Tasseau=2, Spids=3",w.zangeType,"")}
            </div>}
          </div>}
          {hasEntgraten&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("entgraten","Entgratunsparameter","Afgratningsparametre","ti-tool")}
            {mzDetOpen.entgraten&&<div>{entRows(ev,"Vorne","Forrest")}{entRows(eh,"Hinten","Bagerst")}</div>}
          </div>}
        </div>);
      })()}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
        <button style={btn("primary",true)} onClick={printPdf}><i className="ti ti-file-type-pdf"/> Eksporter PDF</button>
        <button style={btn("outline",true)} onClick={onEdit}><i className="ti ti-edit"/> Rediger opstillingsark</button>
        {onDuplicate&&<button style={btn("outline",true)} onClick={onDuplicate}><i className="ti ti-copy"/> Kopier ark</button>}
        {!deleteConfirmSS
          ?<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>setDeleteConfirmSS(true)}><i className="ti ti-trash"/> Slet</button>
          :<div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:14,color:C.red,marginBottom:10,fontWeight:600}}>Slet "{sheet.partNumber}" on {sheet.machine}?</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...btn("danger",false,false),flex:1}} onClick={onDelete}><i className="ti ti-trash"/> Ja, slet</button>
              <button style={btn("outline",false,true)} onClick={()=>setDeleteConfirmSS(false)}>Annuller</button>
            </div>
          </div>}
      </div>
    </div>
  );
}

function SetupSheetForm({sheet,prefill,machines,user,setupDeptParams,subDepartments,tools,cabinets,onBack,onSave}){
  const migrateParams=s=>{if(!s)return[];if(s.params)return s.params;const p=[];if(s.chuckName)p.push({key:"Chuck Name",value:s.chuckName});if(s.chuckOverhang)p.push({key:"Chuck Overhang",value:s.chuckOverhang});if(s.clampingPressure)p.push({key:"Clamping Pressure",value:s.clampingPressure});if(s.zeroPoint)p.push({key:"Zero Point",value:s.zeroPoint});if(s.workpieceStop)p.push({key:"Workpiece Stop",value:s.workpieceStop});return p;};
  const getDept=machineName=>(machines||[]).find(m=>m.name===machineName)?.department||"";
  const MZ_BLANK={fraesForlaenger:"",fraesMn:"",stopDia:"",tangTryk:"",vaerktoejITang:false,tangNummer:"",tangForm:"Spids",pinoltryk:"",pinoldokType:"Pinol",hastighed:"",luft:false,spindel:"",olie:"",emneUdhaeng:"",pinoldokUdhaeng:""};
  const blank={id:null,partNumber:"",customer:"",machine:"",department:"",subDepartment:"",material:"",revision:"",operation:"",subProgram:"",planProgram:"",restartPrefix:"NAT",restartPad:2,tools:[],tools2:[],tools3:[],params:[],notes:"",toolModul:"",mzSetup:{},mzAdvanced:{schnecke:{},werkstuck:{},entgratenVorne:{},entgratenHinten:{}},eriksSetup:{}};
  const [form,setForm]=useState(sheet?{...blank,...sheet,department:sheet.department||getDept(sheet?.machine||""),subDepartment:sheet.subDepartment||"",params:migrateParams(sheet)}
    :prefill?{...blank,partNumber:prefill.partNumber||"",machine:prefill.machine||"",customer:prefill.customer||"",department:getDept(prefill.machine||"")}
    :blank);
  // Sub-depts available for current dept
  const deptSubDepts=(subDepartments||{})[form.department]||[];
  // Param options: use sub-dept key if available, else dept key
  const paramKey=form.subDepartment||form.department;
  const setupParamOptions=(setupDeptParams||{})[paramKey]||[];
  const [errs,setErrs]=useState({});
  const [showList2,setShowList2]=useState(!!(sheet?.tools2?.length));
  const [showList3,setShowList3]=useState(!!(sheet?.tools3?.length));
  const [uploading,setUploading]=useState(false);
  const [lastPos,setLastPos]=useState({}); // per tool list: position of the tool made last
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const rc=pos=>{if(!pos)return"";return(form.restartPrefix||"NAT")+String(pos).padStart(form.restartPad||2,"0");};
  const allPos=[...Array(99)].map((_,i)=>i+1);
  // Only show tools from cabinets assigned to the current department (cabinets with no dept = all depts)
  const deptCabinets=(cabinets||[]).filter(c=>!(c.departments||[]).length||(c.departments||[]).includes(form.department));
  const deptCabinetIds=new Set(deptCabinets.map(c=>String(c.id)));
  const activeCabinetTools=(tools||[]).filter(t=>t.active!==false&&t.name&&deptCabinetIds.has(String(t.cabinetId)));
  const toolListEditor=(listKey,accent)=>{
    const listTools=form[listKey]||[];
    const used=new Set(listTools.map(t=>t.position));
    const avail=allPos.filter(n=>!used.has(n));
    const setTool=(pos,fld,val)=>setForm(p=>{const arr=[...(p[listKey]||[])];const idx=arr.findIndex(t=>t.position===pos);if(idx>=0)arr[idx]={...arr[idx],[fld]:val};return{...p,[listKey]:arr};});
    const removeTool=pos=>setForm(p=>({...p,[listKey]:(p[listKey]||[]).filter(t=>t.position!==pos)}));
    // New tool goes to the first free position after the one made last (or after the highest),
    // so it lands right below — only wraps to the lowest free position when nothing is free above
    const addEmpty=()=>{
      const after=lastPos[listKey]??Math.max(0,...listTools.map(t=>t.position));
      const pos=avail.find(n=>n>after)??avail[0];
      if(!pos)return;
      setLastPos(p=>({...p,[listKey]:pos}));
      setForm(p=>({...p,[listKey]:[...(p[listKey]||[]),{position:pos,description:"",label:"",toolId:null}].sort((a,b)=>a.position-b.position)}));
    };
    const changePos=(old,nv)=>{const n=parseInt(nv);if(!n||used.has(n))return;setLastPos(p=>({...p,[listKey]:n}));setForm(p=>({...p,[listKey]:p[listKey].map(t=>t.position===old?{...t,position:n}:t).sort((a,b)=>a.position-b.position)}));};
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${accent}`,overflow:"hidden",marginBottom:14}}>
        {listTools.length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Intet værktøj tilføjet endnu</div>}
        {listTools.map(t=>(
          <div key={t.position} style={{borderBottom:`1px solid ${C.border}`}}>
            <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
              <select style={{...sel(),width:60,flexShrink:0,fontWeight:700,color:accent}} value={t.position} onChange={e=>changePos(t.position,e.target.value)}>
                <option value={t.position}>{t.position}</option>
                {avail.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                <input style={inp()} value={t.description||""} onChange={e=>setTool(t.position,"description",e.target.value)} placeholder="Beskrivelse af værktøj — skal udfyldes"/>
                <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool(t.position,"toolId",e.target.value||null)}>
                  <option value="">— Intet værktøj fra skab —</option>
                  {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
                </select>
                <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool(t.position,"label",e.target.value)} placeholder="Noter — valgfrit"/>
              </div>
              <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:18,padding:"4px 2px",flexShrink:0,marginTop:4}} onClick={()=>removeTool(t.position)}><i className="ti ti-x"/></button>
            </div>
          </div>
        ))}
        <div style={{padding:"10px 12px",borderTop:listTools.length>0?`1px solid ${C.border}`:"none"}}>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:accent,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",gap:6}} onClick={addEmpty} disabled={avail.length===0}><i className="ti ti-plus"/> Tilføj værktøj{avail.length===0?" (alle 99 brugt)":""}</button>
        </div>
      </div>
    );
  };
  const fortandingToolEditor=()=>{
    const fTools=(form.tools||[]).sort((a,b)=>a.position-b.position);
    const hasPos1=fTools.some(t=>t.position===1);
    const setTool=(pos,fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];const idx=arr.findIndex(t=>t.position===pos);if(idx>=0)arr[idx]={...arr[idx],[fld]:val};return{...p,tools:arr};});
    const addTool=pos=>setForm(p=>({...p,tools:[...(p.tools||[]),{position:pos,description:"",label:"",toolId:null}].sort((a,b)=>a.position-b.position)}));
    const removeTool=pos=>setForm(p=>({...p,tools:(p.tools||[]).filter(t=>t.position!==pos)}));
    const slotLabels={1:"Øverste værktøj",2:"Nederste værktøj"};
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,9"/>
        </div>
        {[1,2].map(pos=>{
          const t=fTools.find(x=>x.position===pos);
          if(t) return(
            <div key={pos} style={{borderBottom:pos===1&&fTools.some(x=>x.position===2)?`1px solid ${C.border}`:"none"}}>
              <div style={{padding:"8px 14px 4px",display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",flex:1}}>{slotLabels[pos]}</div>
                {form.toolModul&&<span style={{fontSize:13,color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>Modul {form.toolModul}</span>}
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16}} onClick={()=>removeTool(pos)}><i className="ti ti-x"/></button>
              </div>
              <div style={{padding:"4px 14px 10px",display:"flex",flexDirection:"column",gap:6}}>
                <input style={inp()} value={t.description||""} onChange={e=>setTool(pos,"description",e.target.value)} placeholder="Beskrivelse af værktøj — valgfrit"/>
                <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool(pos,"toolId",e.target.value||null)}>
                  <option value="">— Intet værktøj fra skab —</option>
                  {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
                </select>
                <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool(pos,"label",e.target.value)} placeholder="Noter — valgfrit"/>
              </div>
            </div>
          );
          if(pos===1||hasPos1) return(
            <div key={pos} style={{padding:"10px 14px",borderTop:pos===2?`1px solid ${C.border}`:"none"}}>
              <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.amber,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",gap:6}} onClick={()=>addTool(pos)}><i className="ti ti-plus"/> Tilføj {slotLabels[pos]}</button>
            </div>
          );
          return null;
        })}
      </div>
    );
  };
  const eriksToolEditor=()=>{
    const t=(form.tools||[])[0]||{position:1,description:"",label:"",toolId:null};
    const setTool=(fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];if(arr.length===0)arr.push({position:1,description:"",label:"",toolId:null});arr[0]={...arr[0],[fld]:val};return{...p,tools:arr};});
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,8"/>
        </div>
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
          <input style={inp()} value={t.description||""} onChange={e=>setTool("description",e.target.value)} placeholder="Beskrivelse af fræser — valgfrit"/>
          <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool("toolId",e.target.value||null)}>
            <option value="">— Intet værktøj fra skab —</option>
            {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
          </select>
          <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool("label",e.target.value)} placeholder="Noter — valgfrit"/>
        </div>
      </div>
    );
  };
  const eriksSetupEditor=()=>{
    const e={...ERIKS_BLANK,...(form.eriksSetup||{})};
    const setE=(k,v)=>setF("eriksSetup",{...(form.eriksSetup||{}),[k]:v});
    const mono={fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17};
    const numInp=(k,ph="—")=>(<input style={{...inp(),...mono,width:"100%",textAlign:"right",fontSize:18}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder={ph}/>);
    const secHdr=(t)=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
    // Gear section: two color groups (amber/blue) matching the paper.
    // Circles OVERLAP where gears mesh. The "inner" gear of a compound pair
    // (e.g. c inside b) shares the shaft — drawn as a smaller circle inside
    // the larger one. Amber group drawn first so blue renders on top.
    // Input column on right, color-coded to match, space-evenly distributed.
    // Gear section: full-width SVG shows circles + leader lines + letter labels only.
    // Input fields are rendered below the SVG so circles get the full width (matching reference).
    // flip=false: circles on left, lines go right. flip=true: circles on right, lines go left.
    const gearSvgSection=(title,totalKey,totalPh,ratioKey,gears,flip=false)=>{
      const VW=300;
      const LINE_END=flip?125:165;
      const LABEL_X=flip?90:170;
      const INPUT_X=flip?5:215;
      const INPUT_W=80;
      const INPUT_H=20;
      const maxY=Math.max(...gears.map(g=>g.cy+g.r))+15;
      return(
        <div style={{padding:"8px 10px 10px"}}>
          <div style={{fontSize:15,color:C.amber,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:5}}>{title}</div>
          {(totalKey||ratioKey)&&<div style={{display:"flex",gap:8,marginBottom:6}}>
            {totalKey&&<div style={{flex:1}}><div style={{fontSize:13,color:C.muted,marginBottom:2}}>{title.split("/")[0].trim()} =</div>{numInp(totalKey,totalPh)}</div>}
            {ratioKey&&<div style={{flex:1}}><div style={{fontSize:13,color:C.muted,marginBottom:2}}>i =</div>{numInp(ratioKey,"2:45")}</div>}
          </div>}
          <svg viewBox={`0 0 ${VW} ${maxY}`} style={{width:"100%",display:"block"}} overflow="visible">
            {[...gears].sort((a,b)=>b.r-a.r).map(g=>{
              const stroke=g.color==="blue"?C.blue:C.amber;
              const fill=stroke+"1a";
              const edy=g.exitDy||0;
              const edx=Math.sqrt(Math.max(0,g.r*g.r-edy*edy));
              const ex=flip?g.cx-edx:g.cx+edx;
              const ey=g.cy+edy;
              return(
                <g key={g.label}>
                  <circle cx={g.cx} cy={g.cy} r={g.r} fill={fill} stroke={stroke} strokeWidth="2"/>
                  <line x1={g.cx-g.r*0.38} y1={g.cy} x2={g.cx+g.r*0.38} y2={g.cy} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
                  <line x1={g.cx} y1={g.cy-g.r*0.38} x2={g.cx} y2={g.cy+g.r*0.38} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
                  <line x1={ex} y1={ey} x2={LINE_END} y2={ey} stroke={stroke} strokeWidth="1.3"/>
                  <text x={LABEL_X} y={ey+5} textAnchor="start" fontSize="14" fontWeight="700" fill={stroke} fontFamily="monospace">{g.label} =</text>
                  <foreignObject x={INPUT_X} y={ey-INPUT_H/2} width={INPUT_W} height={INPUT_H}>
                    <input
                      style={{width:"100%",height:"100%",background:C.raised,border:`1px solid ${stroke}55`,borderRadius:"4px",color:C.green,fontSize:"13px",fontWeight:"700",textAlign:"right",padding:"0 4px",fontFamily:"'Share Tech Mono',monospace",outline:"none",boxSizing:"border-box"}}
                      value={e[g.inputKey]||""}
                      onChange={ev=>setE(g.inputKey,ev.target.value)}
                    />
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>
      );
    };
    // Rotary switch selector
    const switchDial=(k,label,opts={})=>{
      const labels=opts.labels||[1,2,3];
      const n=labels.length;
      const step=n>1?120/(n-1):0;
      const cx=40,cy=40,r=26;
      const pos=labels.map((lbl,i)=>{const a=(-150+i*step)*Math.PI/180;return{lbl:String(lbl),x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};});
      const val=e[k]!=null&&e[k]!==""?String(e[k]):null;
      const selPos=val!=null?pos.find(p=>p.lbl===val):null;
      return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <div style={{fontSize:12,color:C.amber,fontWeight:700,letterSpacing:.5}}>{label}</div>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx={cx} cy={cy} r={r+10} fill="none" stroke={C.border} strokeWidth="1.5"/>
            <circle cx={cx} cy={cy} r={4} fill={C.muted}/>
            {selPos&&<line x1={cx} y1={cy} x2={selPos.x} y2={selPos.y} stroke="#e53e3e" strokeWidth="3" strokeLinecap="round"/>}
            {pos.map((p,i)=>{const sel=val===p.lbl;return(
              <g key={i} onClick={()=>setE(k,sel?"":p.lbl)} style={{cursor:"pointer"}}>
                <circle cx={p.x} cy={p.y} r={10} fill={sel?"#e53e3e":C.raised} stroke={sel?"#e53e3e":C.border} strokeWidth="1.5"/>
                <text x={p.x} y={p.y+4} textAnchor="middle" fontSize="11" fontWeight="800" fill={sel?"#fff":C.muted}>{p.lbl}</text>
              </g>
            );})}
          </svg>
        </div>
      );
    };
    // ── Gear circle positions ─────────────────────────────────────────────
    // Compound pairs share the SAME cx,cy (concentric circles): outer amber ring (b),
    // inner blue circle (c). exitDy splits their leader lines above/below center.
    // flip=true: circles RIGHT side (cx ~200-255), lines LEFT.
    // flip=false: circles LEFT side (cx ≤ 85), lines RIGHT.
    //
    // Steigung (flip=true, circles right): a→Zw→b[outer]/c[inner]→d
    const steigungGears=[
      {label:"a",  inputKey:"steigA",  cx:252, cy:33,  r:24, color:"amber"},
      {label:"Zw", inputKey:"steigZw", cx:229, cy:88,  r:37, color:"amber"},
      {label:"b",  inputKey:"steigB",  cx:183, cy:163, r:51, color:"amber", exitDy:-30},
      {label:"c",  inputKey:"steigC",  cx:183, cy:163, r:37, color:"blue",  exitDy:+30},
      {label:"d",  inputKey:"steigD",  cx:167, cy:224, r:26, color:"blue"},
    ];
    // Zahnzahl (flip=false, circles left): d→Zw→b[outer]/c[inner]→a
    const zahnzahlGears=[
      {label:"d",  inputKey:"zahnD",  cx:124, cy:42,  r:37, color:"amber"},
      {label:"Zw", inputKey:"zahnZw", cx:92,  cy:94,  r:24, color:"amber"},
      {label:"c",  inputKey:"zahnC",  cx:113, cy:163, r:48, color:"amber", exitDy:-30},
      {label:"b",  inputKey:"zahnB",  cx:113, cy:163, r:35, color:"blue",  exitDy:+30},
      {label:"a",  inputKey:"zahnA",  cx:62,  cy:224, r:44, color:"blue"},
    ];
    // Fräserdrehzahl (flip=true, circles right): a→b[outer]/c[inner]→d
    const fraesDrehzahlGears=[
      {label:"a",  inputKey:"fraesA",  cx:234, cy:34,  r:33, color:"amber"},
      {label:"b",  inputKey:"fraesB",  cx:197, cy:106, r:48, color:"amber", exitDy:-30},
      {label:"c",  inputKey:"fraesC",  cx:197, cy:106, r:35, color:"blue",  exitDy:+30},
      {label:"d",  inputKey:"fraesD",  cx:173, cy:177, r:40, color:"blue"},
    ];
    // Längsvorschub (flip=false, circles left): a→b[outer]/c[inner]→Zw→d
    const laengsGears=[
      {label:"a",  inputKey:"laengsA",  cx:70, cy:37,  r:29, color:"amber"},
      {label:"b",  inputKey:"laengsB",  cx:70, cy:95,  r:29, color:"amber", exitDy:-16},
      {label:"c",  inputKey:"laengsC",  cx:70, cy:95,  r:20, color:"blue",  exitDy:+16},
      {label:"Zw", inputKey:"laengsZw", cx:70, cy:143, r:18, color:"blue"},
      {label:"d",  inputKey:"laengsD",  cx:70, cy:201, r:40, color:"blue"},
    ];
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {/* Cutter parameters */}
        {secHdr("Fräser / Fræser")}
        <div style={{padding:"10px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
            {["mn","z","beta","dk","uo","df"].map(k=>(
              <div key={k}><div style={{fontSize:12,color:C.muted,marginBottom:3}}>{k==="z"?"Z":k==="beta"?"β":k}</div>
                <input style={{...inp(),...mono,width:"100%",textAlign:"right"}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder="—"/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:12,color:C.muted,fontWeight:600,flexShrink:0}}>Fräser Ø</div>
            <input style={{...inp(),...mono,flex:1}} value={e.fraeserDia||""} onChange={ev=>setE("fraeserDia",ev.target.value)} placeholder="e.g. 20 H55"/>
          </div>
        </div>
        {/* Fräslagerstellung — 4-position image grid, no white background */}
        {secHdr("Fräslagerstellung / Fræserposition")}
        <div style={{padding:"10px 14px 12px"}}>
          {(()=>{
            const isDark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&window.matchMedia("(prefers-color-scheme:dark)").matches);
            return(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["fraesLagerLinks","Oben Links / Øverst venstre",0,0],["fraesLagerRechts","Oben Rechts / Øverst højre",1,0],["fraesLag3","Unten Links / Nederst venstre",0,1],["fraesLag4","Unten Rechts / Nederst højre",1,1]].map(([k,lbl,xi,yi])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:0,border:`2px solid ${e[k]?C.amber:C.border}`,borderRadius:10,overflow:"hidden",background:C.surface}}>
                    {/* image quadrant */}
                    <div style={{aspectRatio:"4/3",backgroundImage:"url(/eriks-fraeslager-grid.png)",backgroundSize:"200% 200%",backgroundPosition:`${xi*100}% ${yi*100}%`,backgroundRepeat:"no-repeat",backgroundColor:isDark?C.raised:"#fff",filter:isDark?"invert(1)":"none"}}/>
                    {/* label + input row */}
                    <div style={{padding:"8px 10px",borderTop:`1px solid ${C.border}`,background:C.raised}}>
                      <div style={{fontSize:13,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:4}}>{lbl}</div>
                      <div style={{position:"relative"}}>
                        <input style={{...inp(),...mono,width:"100%",textAlign:"right",fontSize:24,fontWeight:700,paddingRight:32,height:44,boxSizing:"border-box",border:`1px solid ${e[k]?C.amber:C.border}`,color:C.green}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder="—"/>
                        <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:20,color:C.amber,fontWeight:700,pointerEvents:"none"}}>°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Direction + differential */}
        {secHdr("Laufrichtung / Retning")}
        <div style={{padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Gegenlauf","Gleichlauf"].map(v=>{const a=e.richtung===v;return(<button key={v} type="button" style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?"rgba(240,165,0,.15)":C.raised,color:a?C.amber:C.muted,fontSize:15,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("richtung",v)}>{v}</button>);})}
          <div style={{width:"100%",height:1,background:C.border,margin:"4px 0"}}/>
          {["ausgerastet","eingerastet"].map(v=>{const a=e.differential===v;const lbl=v==="ausgerastet"?"Diff.-Indexbolzen ausgerastet":"Diff.-Indexbolzen eingerastet";return(<button key={v} type="button" style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${a?C.blue:C.border}`,background:a?"rgba(59,130,246,.15)":C.raised,color:a?C.blue:C.muted,fontSize:14,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("differential",v)}>{lbl}</button>);})}
        </div>
        {/* Gear trains — 2×2 grid, each cell matches the paper layout */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${C.border}`}}>
          <div style={{borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>{gearSvgSection("Zahnzahl / Antal tænder","zahnzahl","80","zahnzahlRatio",zahnzahlGears,false)}</div>
          <div style={{borderBottom:`1px solid ${C.border}`}}>{gearSvgSection("Steigung / Stigning","steigung","","",steigungGears,true)}</div>
          <div style={{borderRight:`1px solid ${C.border}`}}>{gearSvgSection("Fräserdrehzahl / Fræser omdr.","fraesDrehzahl","1312","",fraesDrehzahlGears,true)}</div>
          <div>{gearSvgSection("Längsvorschub / Langs tilsp.","laengs","0,7","",laengsGears,false)}</div>
        </div>
        {/* Switch positions */}
        {secHdr("Schalterstellungen / Kontaktstillinger — auf rot einstellen")}
        <div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["schalterA2","a2",{}],["schalterA3","a3",{labels:[0,1,2,3]}],["schalterA4","a4",{labels:[1,2,2,1]}],["schalterA5","a5",{}]].map(([k,lbl,opts])=>switchDial(k,lbl,opts))}
        </div>
        {/* Tauchsteuerung + production */}
        {secHdr("Tauchsteuerung / Indstik + produktion")}
        <div style={{padding:"10px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["tauchsteuerung","Tauchsteuerung"],["stckStd","Stck/Std"],["stckSpannung","Stck/Spannung"]].map(([k,lbl])=>(<div key={k}><div style={{fontSize:12,color:C.muted,marginBottom:3}}>{lbl}</div>{numInp(k,"")}</div>))}
        </div>
        {/* Eingang */}
        {secHdr("Eingang / Indgang")}
        <div style={{padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap"}}>
          {["m. Zwischenrad","ohne Zwischenrad"].map(v=>{const a=e.eingang===v;return(<button key={v} type="button" style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?"rgba(240,165,0,.15)":C.raised,color:a?C.amber:C.muted,fontSize:15,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("eingang",v)}>{v}</button>);})}</div>
      </div>
    );
  };
  const mzToolEditor=()=>{
    const t=(form.tools||[])[0]||{position:1,description:"",label:"",toolId:null};
    const setTool=(fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];if(arr.length===0)arr.push({position:1,description:"",label:"",toolId:null});arr[0]={...arr[0],[fld]:val};return{...p,tools:arr};});
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,9"/>
        </div>
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
          <input style={inp()} value={t.description||""} onChange={e=>setTool("description",e.target.value)} placeholder="Beskrivelse af værktøj — valgfrit"/>
          <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool("toolId",e.target.value||null)}>
            <option value="">— Intet værktøj fra skab —</option>
            {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
          </select>
          <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool("label",e.target.value)} placeholder="Noter — valgfrit"/>
        </div>
      </div>
    );
  };
  const mzSetupEditor=()=>{
    const mz={...MZ_BLANK,...(form.mzSetup||{})};
    const setMz=(k,v)=>setF("mzSetup",{...(form.mzSetup||{}),[k]:v});
    const togRow=(lbl,k,opts)=>(
      <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {opts.map(o=>{const active=mz[k]===o;return(<button key={o} type="button" style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?C.amber:C.border}`,background:active?"rgba(240,165,0,.15)":C.raised,color:active?C.amber:C.muted,fontSize:15,fontWeight:active?700:400,cursor:"pointer"}} onClick={()=>setMz(k,o)}>{o}</button>);})}
        </div>
      </div>
    );
    const yesNoRow=(lbl,k)=>{
      const isYes=mz[k]===true||mz[k]==="Ja";
      return(
        <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
          <div style={{display:"flex",gap:4}}>
            {[["Ja",true],[" Nej",false]].map(([lbl2,val])=>{const active=(mz[k]===val||(val===true&&mz[k]==="Ja")||(val===false&&mz[k]==="Nej"));const col=val?C.green:C.red;return(<button key={String(val)} type="button" style={{padding:"4px 14px",borderRadius:20,border:`1px solid ${active?col:C.border}`,background:active?`${col}22`:C.raised,color:active?col:C.muted,fontSize:15,fontWeight:active?700:400,cursor:"pointer"}} onClick={()=>setMz(k,val)}>{lbl2.trim()}</button>);})}
          </div>
        </div>
      );
    };
    const txtRow=(lbl,k,ph,mono=true,w="100%")=>(
      <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
        <input style={{...inp(),width:w,...(mono?{fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17}:{})}} value={mz[k]||""} onChange={e=>setMz(k,e.target.value)} placeholder={ph}/>
      </div>
    );
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {togRow("Forlænger","fraesForlaenger",["Kort","Mellem","Lang"])}
        {txtRow("Fræser Mn","fraesMn","0,6 20°")}
        {txtRow("Stop Ø","stopDia","13/8/4 – 172")}
        {txtRow("Tang tryk","tangTryk","7",true,"80px")}
        {yesNoRow("Værktøj i tang","vaerktoejITang")}
        {txtRow("Tang nr.","tangNummer","X055")}
        {togRow("Tang form","tangForm",["Spids","Flad"])}
        {txtRow("Pinoltryk","pinoltryk","8",true,"80px")}
        {togRow("Pinoldok","pinoldokType",["Pinol","Værktøj"])}
        {txtRow("Hastighed","hastighed","2",true,"80px")}
        {yesNoRow("Luft","luft")}
        {txtRow("Spindel","spindel","",false)}
        {txtRow("Olie","olie","",false)}
        {txtRow("Emne udhæng","emneUdhaeng","42 mm til forkant",false)}
        <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px"}}>
          <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>Pinoldok udhæng</div>
          <input style={{...inp(),width:"100%"}} value={mz.pinoldokUdhaeng||""} onChange={e=>setMz("pinoldokUdhaeng",e.target.value)} placeholder=""/>
        </div>
      </div>
    );
  };
  const [mzOpenSec,setMzOpenSec]=useState({schnecke:false,werkstuck:false,entgraten:false});
  const setMzAdv=(sec,k,v)=>setF("mzAdvanced",{...(form.mzAdvanced||{}),[sec]:{...((form.mzAdvanced||{})[sec]||{}),[k]:v}});
  const getMzAdv=sec=>(form.mzAdvanced||{})[sec]||{};
  const mzAdvancedEditor=()=>{
    const accHdr=(key,labelDe,labelEn,icon)=>(
      <button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:mzOpenSec[key]?"rgba(240,165,0,.1)":C.surface,border:"none",borderBottom:mzOpenSec[key]?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left"}} onClick={()=>setMzOpenSec(p=>({...p,[key]:!p[key]}))}>
        <i className={`ti ${icon}`} style={{color:C.amber,fontSize:17,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{labelDe}</div>
          <div style={{fontSize:13,color:C.muted}}>{labelEn}</div>
        </div>
        <i className={`ti ti-chevron-${mzOpenSec[key]?"up":"down"}`} style={{color:C.muted,fontSize:16}}/>
      </button>
    );
    const fld=(sec,k,de,en,unit)=>{const d=getMzAdv(sec);return(
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 88px",gap:6,alignItems:"center",padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{de}</div><div style={{fontSize:12,color:C.muted}}>{en}</div></div>
        {unit?<div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap",textAlign:"right"}}>{unit}</div>:<div/>}
        <input style={{...inp(),fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:16,textAlign:"right"}} value={d[k]||""} onChange={e=>setMzAdv(sec,k,e.target.value)} placeholder="—"/>
      </div>
    );};
    const subHdr=t=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
    const entSec=(sec,de,en)=>(<div>{subHdr(`${de} / ${en}`)}
      {fld(sec,"entgraten","Entgraten","Afgratning","0=Nein 1=Ja")}
      {fld(sec,"startpunktX","Startpunkt in X","Startpunkt X","[mm]")}
      {fld(sec,"startdurchmesser","Startdurchmesser","Startdiameter","[mm]")}
      {fld(sec,"kerndurchmesser","Kerndurchmesser","Kernediameter","[mm]")}
      {fld(sec,"verdrehungZ","Verdrehung in Z","Drejning i Z","[Grad]")}
      {fld(sec,"steigung","Steigung","Stigning","[mm]")}
      {fld(sec,"versatz","Versatz","Forskydning","[mm]")}
      {fld(sec,"entgratwinkel","Entgratwinkel","Afgratningsvinkel","[Grad]")}
      {fld(sec,"gangzahlFraeser","Gangzahl Fräser","Fræserens gange","[1, 2]")}
    </div>);
    return(<>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:10,overflow:"hidden"}}>
        {accHdr("schnecke","Schnecke","Snekke","ti-rotate-clockwise")}
        {mzOpenSec.schnecke&&<div>
          {subHdr("Parameter Schnecke / Snekkeparametre")}
          {fld("schnecke","gewindesteigung","Gewindesteigung","Gevindstigning","[mm]")}
          {fld("schnecke","steigungswinkel","Steigungswinkel","Stigningsvinkel","[Grad]")}
          {fld("schnecke","vorlauf","Vorlauf","Forløb","[mm]")}
          {fld("schnecke","eintauchlaengeX","Eintauchlänge X","Indstikslængde X","[mm]")}
          {fld("schnecke","fraeslaenge","Fräslänge","Fræselængde","[mm]")}
          {fld("schnecke","austauchlaengeX","Austauchlänge X","Udløbslængde X","[mm]")}
          {fld("schnecke","ausgangsstellungX","Ausgangsstellung X","Startposition X","[mm]")}
          {fld("schnecke","konizitaet","Konizität","Konicitet","[mm/Fräslänge]")}
          {fld("schnecke","steigungskorrektur","Steigungskorrektur","Stigningskorrektion","[mm/Messlänge]")}
          {fld("schnecke","messlaenge","Messlänge","Målelængde","[mm]")}
          {subHdr("Durchmesser / Diametre")}
          {fld("schnecke","startdurchmesser","Startdurchmesser","Startdiameter","[mm]")}
          {fld("schnecke","eintauchdurchmesser","Eintauchdurchmesser","Indstiksdiameter","[mm]")}
          {fld("schnecke","kerndurchmesser","Kerndurchmesser","Kernediameter","[mm]")}
          {fld("schnecke","austauchdurchmesser","Austauchdurchmesser","Udløbsdiameter","[mm]")}
          {fld("schnecke","enddurchmesser","Enddurchmesser","Slutdiameter","[mm]")}
          {fld("schnecke","schlichtzustellung","Schlichtzustellung","Sletfremføring","[mm]")}
          {fld("schnecke","rechtsLinks","Rechts = 1, Links = 2","Højre = 1, Venstre = 2","")}
          {fld("schnecke","gleichlaufGegenlauf","Gleichlauf = 1, Gegenlauf = 2","Medløb = 1, Modløb = 2","")}
        </div>}
      </div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:10,overflow:"hidden"}}>
        {accHdr("werkstuck","Werkstückparameter","Emneparametre","ti-settings")}
        {mzOpenSec.werkstuck&&<div>
          {fld("werkstuck","fraeserdurchmesser","Fräserdurchmesser","Fræserdiameter","[mm]")}
          {fld("werkstuck","stueckzahl","Stückzahl","Antal","")}
          {fld("werkstuck","teilung","Teilung","Stigning","[1–99]")}
          {fld("werkstuck","vorschubTauchen","Vorschub Tauchen","Tilspænding indstik","[mm/min]")}
          {fld("werkstuck","vorschubFraesen","Vorschub Fräsen","Tilspænding fræsning","[mm/min]")}
          {fld("werkstuck","phasenverschiebung","Phasenverschiebung","Faseforskydning","[Grad]")}
          {fld("werkstuck","ladestellungX","Ladestellung X-Achse","Ladeposition X","[mm]")}
          {fld("werkstuck","ladestellungY","Ladestellung Y-Achse","Ladeposition Y","[mm]")}
          {fld("werkstuck","drehrichtungFraeser","Drehrichtung Fräser","Fræserens omløbsretning","[+1 / -1]")}
          {subHdr("Nute / Not")}
          {fld("werkstuck","nuteEinstechen","Nute einstechen","Indstik not","[1=Ja, 0=Nein]")}
          {fld("werkstuck","einstechposition","Einstechposition","Indstiksposition","[mm]")}
          {fld("werkstuck","kerndurchmesserNut","Kerndurchmesser Nut","Kernediameter not","[mm]")}
          {fld("werkstuck","schwenkwinkel","Schwenkwinkel","Svingvinkel","[Grad]")}
          {fld("werkstuck","lader","Lader","Lader","[1, 2, 3, 4]")}
          {fld("werkstuck","zangeType","Zange=1, Tasseau=2, Spitze=3","Tang=1, Tasseau=2, Spids=3","")}
        </div>}
      </div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14,overflow:"hidden"}}>
        {accHdr("entgraten","Entgratunsparameter","Afgratningsparametre","ti-tool")}
        {mzOpenSec.entgraten&&<div>
          {entSec("entgratenVorne","Vorne","Forrest")}
          {entSec("entgratenHinten","Hinten","Bagerst")}
        </div>}
      </div>
    </>);
  };
  const save=()=>{
    const e={};
    if(!form.partNumber.trim()) e.partNumber="Skal udfyldes";
    if(!form.machine) e.machine="Skal udfyldes";
    if(!form.department) e.department="Skal udfyldes";
    if(deptSubDepts.length>0&&!form.subDepartment) e.subDepartment="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    const out={...form};
    if(!showList2){out.tools2=[];out.tools3=[];}
    if(!showList3) out.tools3=[];
    onSave({...out,id:out.id||now,createdAt:out.createdAt||now,updatedAt:now,createdBy:out.createdBy||user.name});
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <button style={{...btn("outline",false,true),padding:"8px 12px",flexShrink:0}} onClick={onBack}><i className="ti ti-arrow-left"/></button>
        <div style={{fontSize:15,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>{sheet?"Rediger opstillingsark":"Nyt opstillingsark"}</div>
      </div>
      {!sheet&&prefill&&(
        <div style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.35)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:15,color:C.text,lineHeight:1.5}}>
          <i className="ti ti-clipboard-plus" style={{color:C.amber}}/> Der er intet opstillingsark for <b>{prefill.partNumber}</b> på <b>{prefill.machine}</b> endnu.
          <div style={{fontSize:14,color:C.muted,marginTop:4}}>Jobbet er startet. Udfyld arket mens du stiller op, og tryk Gem nederst — så er det klar næste gang.</div>
        </div>
      )}
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Identifikation</div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{marginBottom:10}}><label style={label}>Tegningsnr. *</label><input style={inp(errs.partNumber)} value={form.partNumber} onChange={e=>setF("partNumber",e.target.value)} placeholder="f.eks. CV-155"/>{errs.partNumber&&<div style={errMsg}>{errs.partNumber}</div>}</div>
        <div style={{marginBottom:10}}><label style={label}>Maskine *</label><select style={sel(errs.machine)} value={form.machine} onChange={e=>{const d=getDept(e.target.value);setForm(p=>({...p,machine:e.target.value,department:d||p.department}));}}><option value="">— Vælg maskine —</option>{(machines||[]).filter(m=>m.active).map(m=><option key={m.id}>{m.name}</option>)}</select>{errs.machine&&<div style={errMsg}>{errs.machine}</div>}</div>
        <div style={{marginBottom:10}}><label style={label}><i className="ti ti-building" style={{fontSize:14}}/> Afdeling *</label><select style={sel(errs.department)} value={form.department||""} onChange={e=>setForm(p=>({...p,department:e.target.value,subDepartment:"",params:[]}))}><option value="">— Vælg afdeling —</option>{[...new Set([...Object.keys(subDepartments||{}),...Object.keys(setupDeptParams||{}).filter(k=>!Object.values(subDepartments||{}).flat().includes(k))])].sort().map(d=><option key={d} value={d}>{d}</option>)}</select>{errs.department&&<div style={errMsg}>{errs.department}</div>}</div>
        {deptSubDepts.length>0&&<div style={{marginBottom:10}}><label style={label}><i className="ti ti-git-branch" style={{fontSize:14}}/> Underafdeling *</label><select style={sel(errs.subDepartment)} value={form.subDepartment||""} onChange={e=>{const sd=e.target.value;const autoParams=((setupDeptParams||{})[sd]||[]).map(k=>({key:k,value:""}));setForm(p=>({...p,subDepartment:sd,params:autoParams}));}}><option value="">— Vælg underafdeling —</option>{deptSubDepts.map(sd=><option key={sd} value={sd}>{sd}</option>)}</select>{errs.subDepartment&&<div style={errMsg}>{errs.subDepartment}</div>}</div>}
        <div style={{marginBottom:10}}><label style={{...label,color:C.amber}}>Programnavn</label><input style={{...inp(),fontSize:20,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber,letterSpacing:1}} value={form.subProgram||""} onChange={e=>setF("subProgram",e.target.value)} placeholder="e.g. O1234"/></div>
        {[["customer","Kunde","f.eks. SPX"],["material","Materiale","f.eks. JM3"],["revision","Revision","e.g. A"],...(deptSubDepts.length===0?[["planProgram","Planprogram",""]]:[])] .map(([k,lbl,ph])=>(<div key={k} style={{marginBottom:10}}><label style={label}>{lbl}</label><input style={inp()} value={form[k]||""} onChange={e=>setF(k,e.target.value)} placeholder={ph}/></div>))}
        <div style={{marginBottom:10}}>
          <label style={{...label,color:{" Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[form.operation]||undefined}}>Operation</label>
          <select style={{...sel(),fontWeight:700,color:{"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[form.operation]||C.text}} value={form.operation||""} onChange={e=>setF("operation",e.target.value)}>
            <option value="">— Vælg operation —</option>
            <option value="Side 1">Side 1</option>
            <option value="Side 2">Side 2</option>
            <option value="Finish Part">Finish Part</option>
          </select>
        </div>
      </div>
      {deptSubDepts.length===0&&<>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Format for genstartskode</div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
          <div><label style={label}>Præfiks</label><input style={inp()} value={form.restartPrefix||"NAT"} onChange={e=>setF("restartPrefix",e.target.value)} placeholder="f.eks. NAT"/></div>
          <div><label style={label}>Antal cifre</label><select style={sel()} value={form.restartPad||2} onChange={e=>setF("restartPad",parseInt(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} digits</option>)}</select></div>
        </div>
        <div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:6,padding:"6px 10px"}}>Værktøj 8 → <span style={{color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{rc(8)}</span>&nbsp;·&nbsp;Værktøj 1 → <span style={{color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{rc(1)}</span></div>
      </div>
      </>}
      {deptSubDepts.length>0&&form.subDepartment!=="MZ"&&form.subDepartment!=="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Opspændingsværktøj</div>}
      {deptSubDepts.length>0&&form.subDepartment!=="MZ"&&form.subDepartment!=="150"&&fortandingToolEditor()}
      {form.subDepartment==="MZ"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Værktøj</div>}
      {form.subDepartment==="MZ"&&mzToolEditor()}
      {form.subDepartment==="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Fräser / værktøj</div>}
      {form.subDepartment==="150"&&eriksToolEditor()}
      {deptSubDepts.length===0&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Værktøjsliste — hoved</div>}
      {deptSubDepts.length===0&&toolListEditor("tools",C.amber)}
      {deptSubDepts.length===0&&(showList2?(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase"}}>Værktøjsliste — under</div>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.red,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:4}} onClick={()=>{setShowList2(false);setShowList3(false);setForm(p=>({...p,tools2:[],tools3:[]}));}}><i className="ti ti-x"/> Fjern</button>
          </div>
          {toolListEditor("tools2",C.blue)}
          {showList3?(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase"}}>Værktøjsliste — 3.</div>
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.red,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:4}} onClick={()=>{setShowList3(false);setForm(p=>({...p,tools3:[]}));}}><i className="ti ti-x"/> Fjern</button>
              </div>
              {toolListEditor("tools3",C.green)}
            </>
          ):(
            <button style={{...btn("outline",true,true),borderColor:C.green,color:C.green,marginBottom:14}} onClick={()=>setShowList3(true)}><i className="ti ti-plus"/> Tilføj tredje værktøjsliste</button>
          )}
        </>
      ):(
        <button style={{...btn("outline",true,true),borderColor:C.blue,color:C.blue,marginBottom:14}} onClick={()=>setShowList2(true)}><i className="ti ti-plus"/> Tilføj underværktøjsliste</button>
      ))}
      {form.subDepartment==="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Einstellplan — 150</div>}
      {form.subDepartment==="150"&&eriksSetupEditor()}
      {form.subDepartment==="MZ"&&<div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Opstillingsparametre</div>}
      {form.subDepartment==="MZ"&&mzSetupEditor()}
      {form.subDepartment==="MZ"&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {(form.params||[]).length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Ingen ekstra parametre tilføjet endnu</div>}
        {(form.params||[]).map((p,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,width:130,flexShrink:0}}>{p.key}</div>
            <input style={{...inp(),flex:1,fontSize:16,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}} value={p.value||""} onChange={e=>setForm(pr=>({...pr,params:pr.params.map((x,j)=>j===i?{...x,value:e.target.value}:x)}))} placeholder="Værdi…"/>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:17,padding:"2px 4px",flexShrink:0}} onClick={()=>setForm(pr=>({...pr,params:pr.params.filter((_,j)=>j!==i)}))}><i className="ti ti-x"/></button>
          </div>
        ))}
        <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
          <select style={{...sel(),flex:1}} defaultValue="" onChange={e=>{const v=e.target.value;if(!v)return;setForm(pr=>({...pr,params:[...(pr.params||[]),{key:v,value:""}]}));e.target.value="";}}>
            <option value="">+ Tilføj parameter…</option>
            {(setupParamOptions||[]).map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>}
      {form.subDepartment!=="MZ"&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Opstillingsparametre</div>
      </div>}
      {form.subDepartment!=="MZ"&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {(form.params||[]).length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Ingen parametre tilføjet endnu</div>}
        {(form.params||[]).map((p,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,width:130,flexShrink:0}}>{p.key}</div>
            <input style={{...inp(),flex:1,fontSize:16,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}} value={p.value||""} onChange={e=>setForm(pr=>({...pr,params:pr.params.map((x,j)=>j===i?{...x,value:e.target.value}:x)}))} placeholder="Værdi…"/>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:17,padding:"2px 4px",flexShrink:0}} onClick={()=>setForm(pr=>({...pr,params:pr.params.filter((_,j)=>j!==i)}))}><i className="ti ti-x"/></button>
          </div>
        ))}
        <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
          <select style={{...sel(),flex:1}} defaultValue="" onChange={e=>{const v=e.target.value;if(!v)return;setForm(pr=>({...pr,params:[...(pr.params||[]),{key:v,value:""}]}));e.target.value="";}} >
            <option value="">+ Tilføj parameter…</option>
            {(setupParamOptions||[]).map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>}
      <div style={{marginBottom:20}}><label style={label}>Noter</label><textarea style={{...inp(),minHeight:80,resize:"vertical",display:"block"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)} placeholder="f.eks. EMNE TID 1 MINUT OG 22 SEKUNDER"/></div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Fotos</div>
        {(form.photos||[]).length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {(form.photos||[]).map((p,i)=>(
              <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",background:C.raised,aspectRatio:"4/3"}}>
                <img src={p.url} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                <button onClick={()=>setF("photos",(form.photos||[]).filter((_,j)=>j!==i))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.7)",border:"none",borderRadius:4,color:"#fff",cursor:"pointer",padding:"2px 6px",fontSize:15}}><i className="ti ti-x"/></button>
                {p.caption!==undefined&&<input style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",fontSize:17,fontWeight:500,padding:"10px 10px",outline:"none"}} value={p.caption||""} onChange={e=>setF("photos",(form.photos||[]).map((x,j)=>j===i?{...x,caption:e.target.value}:x))} placeholder="Billedtekst…"/>}
              </div>
            ))}
          </div>
        )}
        <label style={{display:"flex",alignItems:"center",gap:8,background:C.raised,border:`1px dashed ${C.border}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",color:C.muted,fontSize:15}}>
          {uploading?<><i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/> Uploader…</>:<><i className="ti ti-camera"/> Tilføj foto</>}
          <input type="file" accept="image/*" multiple style={{display:"none"}} disabled={uploading} onChange={async e=>{
            const files=[...e.target.files];
            if(!files.length) return;
            setUploading(true);
            const resize=(dataUrl,maxW=1200,maxH=900)=>new Promise(res=>{
              const img=new Image();
              img.onload=()=>{
                let w=img.width,h=img.height;
                if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
                if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
                const c=document.createElement("canvas");c.width=w;c.height=h;
                c.getContext("2d").drawImage(img,0,0,w,h);
                res(c.toDataURL("image/jpeg",0.82));
              };
              img.src=dataUrl;
            });
            const uploaded=[];
            for(const file of files){
              const reader=new FileReader();
              const dataUrl=await new Promise(res=>{reader.onload=ev=>res(ev.target.result);reader.readAsDataURL(file);});
              const resized=await resize(dataUrl);
              uploaded.push({url:resized,caption:""});
            }
            setForm(p=>({...p,photos:[...(p.photos||[]),...uploaded]}));
            setUploading(false);
            e.target.value="";
          }}/>
        </label>
      </div>
      {form.subDepartment==="MZ"&&mzAdvancedEditor()}
      <button style={btn("primary",true)} onClick={save}><i className="ti ti-check"/> Gem opstillingsark</button>
    </div>
  );
}
