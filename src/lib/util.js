// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
export const INIT_USERS = [
  { id: 1, name: "Admin", pin: "0000", role: "admin", active: true },
];
export const INIT_MACHINES = [];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
export function fmt(s) {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`:
             `${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}
export function fmtHM(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
  return h>0?`${h}t ${m}m`:`${m}m`;
}
export function fmtDetail(s){
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0?`${h}t ${m}m ${sc}s`:`${m}m ${sc}s`;
}
export function fmtDate(ts){
  return new Date(ts).toLocaleString("da-DK",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
export function toDateInput(ts){ const d=new Date(ts); return isNaN(d)?"":d.toISOString().slice(0,10); }
// Saved times for a job, both sides together (two-sided jobs keep side 2 in setupSec2/runSec2)
export function jRunAll(j){ return (j.runSec||0)+(j.runSec2||0); }
export function jSetupAll(j){ return (j.setupSec||0)+(j.setupSec2||0); }
// Job efficiency = production ÷ (production + setup), both sides; null if no time
export function jobEfficiency(j){ const t=jRunAll(j)+jSetupAll(j); return t>0?jRunAll(j)/t*100:null; }
// Tool log actions as shown on screen
export const TOOL_ACTION_NAME={take:"Taget",checkout:"Lånt",return:"Afleveret","return-regrinded":"Afleveret omslebet","return-needs-regrind":"Afleveret — skal omslibes","return-damaged":"Afleveret beskadiget",restock:"Fyldt op"};
// Role as shown on screen (stored as "admin" / "operator")
export function roleName(r){ return r==="admin"?"Admin":r==="requester"?"Bestiller":"Operatør"; }
export function initials(n){ return n.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase(); }
export function liveTime(j){
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
export const DAYS_KEY=["sun","mon","tue","wed","thu","fri","sat"];
export const DAY_NAME={sun:"Søndag",mon:"Mandag",tue:"Tirsdag",wed:"Onsdag",thu:"Torsdag",fri:"Fredag",sat:"Lørdag"};
export const INIT_WORK_HOURS={
  mon:{start:"07:00",end:"15:00",enabled:true},
  tue:{start:"07:00",end:"15:00",enabled:true},
  wed:{start:"07:00",end:"15:00",enabled:true},
  thu:{start:"07:00",end:"15:00",enabled:true},
  fri:{start:"07:00",end:"15:00",enabled:true},
  sat:{start:"07:00",end:"15:00",enabled:false},
  sun:{start:"07:00",end:"15:00",enabled:false},
};
// Returns today's {start, end, enabled} — handles both old {start,end} and new per-day format
export function todayWorkHours(wh){
  if(!wh) return null;
  if(wh.start&&!wh.mon) return{start:wh.start,end:wh.end,enabled:true}; // legacy format
  return wh[DAYS_KEY[new Date().getDay()]]||null;
}
export function isInWorkHoursNow(wh){
  const dh=todayWorkHours(wh);
  if(!dh||!dh.enabled) return false;
  const n=new Date();
  const hhmm=`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
  return hhmm>=dh.start&&hhmm<dh.end;
}
// Returns total available work seconds between two timestamps, based on work hours settings
export function calcAvailableWorkSec(wh,fromMs,toMs){
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

// Customers used before, newest first — suggestions while typing (tasks left out)
export function recentCustomers(jobs){
  const seen=new Map();
  [...(jobs||[])].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(j=>{
    const c=(j.customer||"").trim();
    if(c&&!c.startsWith("Opgave ·")&&!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(),c);
  });
  return [...seen.values()];
}

// The machine of the operator's last finished job — the likely one for the next job
export function lastFinishedMachine(jobs,userId,machines){
  const j=(jobs||[]).filter(x=>x.operatorId===userId&&x.status==="done"&&!x.deleted).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))[0];
  return j&&(machines||[]).some(m=>m.name===j.machine&&m.active)?j.machine:"";
}
