import { useState, useEffect, useRef } from "react";
import { AdminDash } from "./admin/AdminDash";
import { AllJobsTab } from "./admin/AllJobsTab";
import { MachineDataTab } from "./admin/MachineDataTab";
import { ManageTab, AdminToolsTab } from "./admin/ManageTab";
import { ReportsTab } from "./admin/ReportsTab";
import { notify, setSync, Toasts, SyncIndicator } from "./components/Feedback";
import { mergeIssues } from "./lib/api";
import { C, btn, navBtn } from "./lib/theme";
import { AdminTasksTab, RequesterTasksTab } from "./tasks/TasksTab";
import { statJobsOf, visibleTasks, taskState } from "./tasks/taskUtil";
import { listDrafts } from "./setupsheets/sheetDraft";
import { AdminSearch } from "./admin/AdminSearch";
import { INIT_USERS, INIT_MACHINES, roleName, liveTime, INIT_WORK_HOURS, todayWorkHours, isInWorkHoursNow } from "./lib/util";
import { ActiveTab } from "./operator/ActiveTab";
import { HistoryTab } from "./operator/HistoryTab";
import { CompleteModal } from "./operator/JobModals";
import { LoginScreen } from "./operator/LoginScreen";
import { MachineStatusTab } from "./operator/MachineStatusTab";
import { NewJobTab } from "./operator/NewJobTab";
import { QuickEntryTab } from "./operator/QuickEntryTab";
import { PlanningTab } from "./planning/PlanningTab";
import { SetupSheetsTab } from "./setupsheets/SetupSheetsTab";
import { ToolsTab } from "./tools/ToolsTab";

// ═══════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════
// ── Stay logged in on this tablet ──────────────────────────────────────────────
// A reload (the tablet dropped the page, a trip to the camera app, an update) used to
// log the operator out. The login is remembered until Log ud, the automatic pause,
// or 12 hours have passed. Each operator has their own tablet.
const SESSION_KEY="st-session", SESSION_MAX=12*3600*1000;
function readSession(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");return s&&s.userId!=null?s:null;}catch{return null;}}
function writeSession(patch){try{localStorage.setItem(SESSION_KEY,JSON.stringify({...(readSession()||{}),...patch}));}catch{/* storage not available */}}
function clearSession(){try{localStorage.removeItem(SESSION_KEY);}catch{/* storage not available */}}
const homeTab=u=>u?.role==="admin"?"admin":u?.role==="requester"?"mytasks":"new";

export default function App(){
  const [loaded,setLoaded]   =useState(false);
  const [user,  setUser]     =useState(null);
  const loginTimeRef         =useRef(0); // when current user logged in on this device
  const [tab,   setTab]      =useState("new");
  const [focusToolId,setFocusToolId]=useState(null);
  const [focusSheetId,setFocusSheetId]=useState(null);
  const [focusJob,setFocusJob]=useState(null);       // admin search → open in Alle job
  const [focusTaskId,setFocusTaskId]=useState(null); // admin search → open in Opgaver
  const [newSheetFor,setNewSheetFor]=useState(null); // {partNumber,machine,customer} — open a new sheet for this
  const [jobs,  setJobs]     =useState([]);
  const [users, setUsers]    =useState(INIT_USERS);
  const [machines,setMachines]=useState(INIT_MACHINES);
  const [workHours,setWorkHours]=useState(INIT_WORK_HOURS);
  const workHoursRef=useRef(INIT_WORK_HOURS);
  useEffect(()=>{workHoursRef.current=workHours;},[workHours]);
  const userRef=useRef(null); // always mirrors current user so tick can read it
  useEffect(()=>{userRef.current=user;},[user]);
  useEffect(()=>{if(user)writeSession({tab});},[tab,user]); // reopen on the same screen
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
  const [tasks,setTasks]=useState([]); // Opgaver — see tasks/taskUtil.js

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
          if(data.tasks) setTasks(data.tasks);
          if(data.settingsVersion) settingsVersionRef.current=data.settingsVersion;
          // Still logged in on this tablet (page reloaded, app reopened) → carry on without the PIN
          const s=readSession();
          const su=s&&(data.users||[]).find(x=>x.id===s.userId&&x.active&&!x.removed);
          if(su&&!(su.forcedLogoutAt&&su.forcedLogoutAt>s.loginAt)&&Date.now()-s.loginAt<SESSION_MAX){loginTimeRef.current=s.loginAt;setUser(su);setTab(s.tab||homeTab(su));}
          else if(s) clearSession();
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
            tasks:data.tasks,
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
  const saveFailedRef=useRef(false);    // last full save failed → retried by the 3 s loop
  const doSaveRef=useRef(null);         // doSave, for the 3 s loop (defined further down)
  const [serverOnline,setServerOnline]=useState(true);
  useEffect(()=>{
    stateRef.current={jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings,tasks};
  },[jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings,tasks]);

  // Save to server every 3 seconds — only when data has changed, with retry on failure
  useEffect(()=>{
    const t=setInterval(()=>{
      if(!dataLoadedRef.current) return;
      if(saveFailedRef.current){doSaveRef.current&&doSaveRef.current();return;} // an earlier save failed — retry it (sends everything)
      const state=stateRef.current;
      const hash=JSON.stringify([state.jobs,settingsVersionRef.current]);
      if(hash===lastSavedHashRef.current) return; // nothing changed — skip
      setSync("saving");
      fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...state,settingsVersion:settingsVersionRef.current})})
        .then(r=>{if(r.ok){lastSavedHashRef.current=hash;setServerOnline(true);setSync("saved");}else{setServerOnline(false);setSync("offline");}})
        .catch(()=>{setServerOnline(false);setSync("offline");}); // will retry next tick
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
        // Tasks: same rule as planning orders
        if(data.tasks&&JSON.stringify(data.tasks)!==JSON.stringify(last.tasks)) setTasks(local=>{
          const m=new Map(local.map(o=>[o.id,o]));
          data.tasks.forEach(o=>{const l=m.get(o.id);if(!l||(o.updatedAt||0)>=(l.updatedAt||0))m.set(o.id,o);});
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
              clearSession();setUser(null);setTab("new");
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
        lastServerRef.current={workHours:data.workHours,users:data.users,machines:data.machines,downtimeLog:data.downtimeLog,tools:data.tools,toolLog:data.toolLog,cabinets:data.cabinets,departments:data.departments,setupSheets:data.setupSheets,setupDeptParams:data.setupDeptParams,subDepartments:data.subDepartments,efficiencyGoals:data.efficiencyGoals,planOrders:data.planOrders,planSettings:data.planSettings,tasks:data.tasks};
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
    setSync("saving");
    return fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...state,settingsVersion:settingsVersionRef.current})})
      .then(r=>{saveFailedRef.current=!r.ok;setSync(r.ok?"saved":"offline");}).catch(()=>{saveFailedRef.current=true;setSync("offline");});
  };
  useEffect(()=>{doSaveRef.current=doSave;});
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
  },[jobs,users,machines,workHours,downtimeLog,machineIssues,tools,toolLog,cabinets,departments,setupSheets,setupDeptParams,subDepartments,efficiencyGoals,planOrders,planSettings,tasks]);

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
            clearSession();setUser(null);setTab("new");
          }
          saveNow();
        });
      }
    },1000);
    return()=>clearInterval(t);
  },[]);

  // ── Tablet: full screen (remembered per tablet) and keep the screen on ──
  const [isFull,setIsFull]=useState(()=>!!document.fullscreenElement);
  const installedApp=window.matchMedia&&(matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: standalone)").matches);
  useEffect(()=>{
    const onChange=()=>{
      setIsFull(!!document.fullscreenElement);
      // Left full screen on a computer (Esc) → stop remembering it on this browser
      if(!document.fullscreenElement&&window.matchMedia&&matchMedia("(pointer: fine)").matches){try{localStorage.setItem("st-fullscreen","0");}catch{/* storage not available */}}
    };
    document.addEventListener("fullscreenchange",onChange);
    // Browsers only allow full screen after a tap — re-enter on the first tap if this tablet wants it
    const wantFull=()=>{try{return localStorage.getItem("st-fullscreen")==="1";}catch{return false;}};
    // Only for a finger tap — on a computer (mouse) Esc means "leave full screen", so don't pull it back
    const onTap=e=>{if(e.pointerType==="touch"&&wantFull()&&!document.fullscreenElement&&document.fullscreenEnabled)document.documentElement.requestFullscreen().catch(()=>{});};
    document.addEventListener("pointerdown",onTap,true);
    // Keep the screen on while ShopTrack is open (only where the browser allows it)
    let lock=null;
    const keepAwake=()=>{if(document.visibilityState==="visible"&&navigator.wakeLock)navigator.wakeLock.request("screen").then(l=>{lock=l;}).catch(()=>{});};
    keepAwake();
    document.addEventListener("visibilitychange",keepAwake);
    return()=>{document.removeEventListener("fullscreenchange",onChange);document.removeEventListener("pointerdown",onTap,true);document.removeEventListener("visibilitychange",keepAwake);if(lock)lock.release().catch(()=>{});};
  },[]);
  const toggleFull=()=>{
    try{
      if(document.fullscreenElement){localStorage.setItem("st-fullscreen","0");document.exitFullscreen();}
      else{localStorage.setItem("st-fullscreen","1");document.documentElement.requestFullscreen().catch(()=>{});}
    }catch{/* storage or full screen not available */}
  };

  const reportIssue=(machineName,status,reason)=>{
    const now=new Date();
    const hhmm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const dhR=todayWorkHours(workHours);
    const counting=!!(dhR&&dhR.enabled&&hhmm>=dhR.start&&hhmm<dhR.end);
    setMachineIssues(prev=>({...prev,[machineName]:{status,reason,reportedBy:user.name,reportedAt:Date.now(),downtimeSec:0,counting}}));
    notify(`Fejl meldt på ${machineName} — job på maskinen er sat på pause`,"warn");
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
    notify(`${machineName} kører igen`);
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
    // A setup sheet left unsaved recently (app closed, logged out) → straight back to it
    const recentDraft=u.role!=="requester"&&listDrafts(u.id).find(d=>n-d.savedAt<12*3600*1000);
    setUser(u);setTab(recentDraft?"setup":homeTab(u));
    writeSession({userId:u.id,loginAt:n,tab:null});
    // (after the main screen is up — the message bar isn't there on the login screen)
    if(recentDraft) setTimeout(()=>notify("Du har et opstillingsark, der ikke er gemt — tryk Fortsæt","warn"),300);
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
    clearSession();setUser(null);setTab("new");
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
  // Task jobs stay out of efficiency figures; badges for tasks waiting on someone
  const statJobs=statJobsOf(visibleJobs);
  const taskStates=visibleTasks(tasks).map(t=>taskState(t,visibleJobs));
  const myTaskCnt=taskStates.filter(x=>x.key==="assigned"&&x.step.assignedToId===user.id).length;
  const waitingTaskCnt=taskStates.filter(x=>x.key==="waiting").length;
  // A hit from the admin search opens where it lives
  const openSearchHit=(type,item)=>{
    if(type==="job"){setFocusJob(item);setTab("alljobs");}
    else if(type==="sheet"){setFocusSheetId(item.id);setTab("setup");}
    else if(type==="task"){setFocusTaskId(item.id);setTab("tasks");}
  };
  const badgeStyle=bg=>({background:bg,color:bg===C.amber?"#1a1a1a":"white",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700});

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
        <div style={{fontSize:16,letterSpacing:3,textTransform:"uppercase",color:C.amber,fontWeight:700,cursor:"pointer",userSelect:"none"}} onClick={()=>setTab(homeTab(user))} title="Til forsiden">⚙ ShopTrack</div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <SyncIndicator/>
          <div style={{fontSize:21,letterSpacing:3}}>{clock}</div>
          <div style={{fontSize:14,textAlign:"right"}}>
            <div style={{color:C.text}}>{user.name}</div>
            <div style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:user.role==="admin"?C.amber:C.muted}}>{roleName(user.role)}</div>
          </div>
          {!installedApp&&document.fullscreenEnabled&&(
            <button style={btn("outline",false,true)} onClick={toggleFull} title={isFull?"Afslut fuld skærm":"Fuld skærm — huskes på denne tablet"}>
              <i className={`ti ti-${isFull?"minimize":"maximize"}`} style={{fontSize:18}}/>
            </button>
          )}
          <button style={btn("outline",false,true)} onClick={logout}>Log ud</button>
        </div>
      </div>

      {/* NAV */}
      {user.role==="operator"&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`}}>
          {[["new","plus","Nyt job"],["quick","bolt","Hurtig registrering"],["active","player-play","Aktive"],["machines","alert-triangle","Maskiner"],["tools","package","Værktøj"],["setup","clipboard-list","Opstillingsark"],["history","list","Historik"]].map(([t,ic,lb])=>(
            <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
              <i className={`ti ti-${ic}`}/> {lb}
              {t==="new"&&myTaskCnt>0&&<span style={badgeStyle(C.blue)}>{myTaskCnt}</span>}
              {t==="active"&&activeCnt>0&&<span style={{background:C.amber,color:"#1a1a1a",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{activeCnt}</span>}
              {t==="machines"&&Object.keys(machineIssues).length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{Object.keys(machineIssues).length}</span>}
            </button>
          ))}
        </div>
      )}
      {user.role==="admin"&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`}}>
          {[["admin","layout-dashboard","Overblik"],["planning","calendar-time","Planlægning β"],["alljobs","tool","Alle job"],["tasks","clipboard-check","Opgaver"],["machdata","cpu","Maskiner"],["admintools","package","Værktøj"],["setup","clipboard-list","Opstillingsark"],["reports","chart-bar","Rapporter"],["manage","settings","Administration"]].map(([t,ic,lb])=>{
            const lowCnt=t==="admintools"?tools.filter(tl=>tl.active&&((!tl.returnable&&tl.quantity<=(tl.minQuantity||0))||tl.broken||(tl.hasConditionRating&&(tl.conditionStars||5)<=2&&!tl.ordered))).length:0;
            return(
              <button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>
                <i className={`ti ti-${ic}`}/> {lb}
                {t==="tasks"&&waitingTaskCnt>0&&<span style={badgeStyle(C.amber)}>{waitingTaskCnt}</span>}
                {t==="admintools"&&lowCnt>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:12,padding:"1px 6px",marginLeft:6,fontWeight:700}}>{lowCnt}</span>}
              </button>
            );
          })}
          <AdminSearch jobs={visibleJobs} setupSheets={setupSheets} tasks={tasks} onOpen={openSearchHit}/>
        </div>
      )}

      {user.role==="requester"&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"10px 16px",background:"#1a2535",borderBottom:`1px solid ${C.border}`}}>
          <button style={navBtn(true)}><i className="ti ti-clipboard-check"/> Mine opgaver</button>
        </div>
      )}

      {/* CONTENT */}
      {user.role==="requester"?<RequesterTasksTab user={user} tasks={tasks} setTasks={setTasks} jobs={visibleJobs} saveNow={saveNow}/>:<>
      {tab==="new"      &&<NewJobTab         user={user} machines={machines} machineIssues={machineIssues} setJobs={setJobs} jobs={visibleJobs} setupSheets={setupSheets} setTab={setTab} setFocusSheetId={setFocusSheetId} setNewSheetFor={setNewSheetFor} tasks={tasks} setTasks={setTasks}/>}
      {tab==="tasks"    &&<AdminTasksTab     user={user} users={users} tasks={tasks} setTasks={setTasks} jobs={visibleJobs} focusTaskId={focusTaskId} setFocusTaskId={setFocusTaskId} departments={departments} setCompleteId={setCompleteId} saveNow={saveNow}/>}
      {tab==="quick"    &&<QuickEntryTab     user={user} machines={machines} jobs={visibleJobs} setJobs={setJobs} setTab={setTab} saveNow={saveNow}/>}
      {tab==="active"   &&<ActiveTab         user={user} jobs={visibleJobs} setJobs={setJobs} setCompleteId={setCompleteId} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machines" &&<MachineStatusTab  user={user} machines={machines} jobs={visibleJobs} machineIssues={machineIssues} reportIssue={reportIssue} resolveIssue={resolveIssue}/>}
      {tab==="tools"    &&<ToolsTab          user={user} tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} cabinets={cabinets} saveNow={saveNow} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {tab==="history"  &&<HistoryTab        user={user} jobs={visibleJobs}/>}
      {tab==="admin"    &&<AdminDash         jobs={visibleJobs} machineIssues={machineIssues} downtimeLog={downtimeLog} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} tools={tools} efficiencyGoals={efficiencyGoals} workHours={workHours}/>}
      {tab==="alljobs"  &&<AllJobsTab        jobs={visibleJobs} focusJob={focusJob} setFocusJob={setFocusJob} setJobs={setJobs} setCompleteId={setCompleteId} users={users} machines={machines} machineIssues={machineIssues} setMachineIssues={setMachineIssues} resolveIssue={resolveIssue} downtimeLog={downtimeLog} setDowntimeLog={setDowntimeLog} saveNow={saveNow} stateRef={stateRef}/>}
      {tab==="machdata" &&<MachineDataTab     jobs={statJobs} machines={machines} downtimeLog={downtimeLog} machineIssues={machineIssues} efficiencyGoals={efficiencyGoals} workHours={workHours} clock={clock}/>}
      {tab==="planning" &&<PlanningTab       jobs={visibleJobs} machines={machines} departments={departments} workHours={workHours} planOrders={planOrders} setPlanOrders={setPlanOrders} planSettings={planSettings} setPlanSettings={setPlanSettings} saveNow={saveNow}/>}
      {tab==="reports"  &&<ReportsTab       jobs={statJobs} machines={machines} departments={departments} efficiencyGoals={efficiencyGoals} workHours={workHours} downtimeLog={downtimeLog}/>}
      {tab==="admintools"&&<AdminToolsTab     tools={tools} setTools={setTools} toolLog={toolLog} setToolLog={setToolLog} cabinets={cabinets} setCabinets={setCabinets} departments={departments} users={users} machines={machines} saveNow={saveNow} focusToolId={focusToolId} setFocusToolId={setFocusToolId}/>}
      {tab==="setup"    &&<SetupSheetsTab    user={user} setupSheets={setupSheets} setSetupSheets={setSetupSheets} machines={machines} saveNow={saveNow} stateRef={stateRef} setupDeptParams={setupDeptParams} setSetupDeptParams={setSetupDeptParams} subDepartments={subDepartments} setSubDepartments={setSubDepartments} tools={tools} cabinets={cabinets} setTab={setTab} setFocusToolId={setFocusToolId} focusSheetId={focusSheetId} setFocusSheetId={setFocusSheetId} newSheetFor={newSheetFor} setNewSheetFor={setNewSheetFor}/>}
      {tab==="manage"   &&<ManageTab         users={users} setUsers={setUsers} machines={machines} setMachines={setMachines} workHours={workHours} setWorkHours={setWorkHours} departments={departments} setDepartments={setDepartments} saveNow={saveNow} efficiencyGoals={efficiencyGoals} setEfficiencyGoals={setEfficiencyGoals} jobs={jobs} setJobs={setJobs}/>}
      </>}

      <Toasts/>
      {completeId&&<CompleteModal jobId={completeId} jobs={jobs} setJobs={setJobs} onClose={()=>setCompleteId(null)} saveNow={saveNow} stateRef={stateRef}/>}
    </div>
  );
}
