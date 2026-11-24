// ═══════════════════════════════════════════════════════
// FAST OPERATØR — each machine can have operators in priority order
// (machine.operators = [userId, …]; #1 is the machine's own operator, the rest cover).
// Each operator can have work days (user.workDays = [1,2,3] — JS getDay, 0 = Sunday;
// none ticked = works every day). Who gets a job is decided when someone logs in
// (only for people on that machine's list):
//  · back to plan: a job held by a cover is paused (the cover went home) and someone
//    ranked higher on the machine is due today → it goes to them, still paused,
//    so it starts when they log in (the cover coming in early doesn't keep it)
//  · cover: the job's operator went home (paused at fyraften / night mode ended)
//    and today is NOT one of their work days → the one logging in covers it
//  · the job is held by a cover and the one logging in ranks higher → it moves to them
// Every move is written on the job (handovers) and told to the operator.
// ═══════════════════════════════════════════════════════
export const DAYS=[[1,"Ma"],[2,"Ti"],[3,"On"],[4,"To"],[5,"Fr"],[6,"Lø"],[0,"Sø"]];

export const rankOn=(machine,userId)=>{
  const i=(machine?.operators||[]).indexOf(userId);
  return i<0?Infinity:i;
};

// "2026-11-24" in local time — user.absentOn holds the day an admin marked them not in
export const dayKey=(t=Date.now())=>{const d=new Date(t);const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
export const absentToday=(user,now=Date.now())=>!!user?.absentOn&&user.absentOn===dayKey(now);

// Is this person expected at work on this day? No days ticked = every day.
// Unknown / removed / inactive / marked "not in today" = not coming.
export const dueOn=(user,now=Date.now())=>{
  if(!user||user.removed||!user.active||absentToday(user,now)) return false;
  const d=user.workDays||[];
  return !d.length||d.includes(new Date(now).getDay());
};

// The job's operator isn't working it: paused when they went home, or night mode
// running/finished without them
export const ownerAway=j=>!!(j.logoutPaused||(j.nightModeEndsAt&&!j.nightModeDone)||j.nightModeDone);

const lastHandover=j=>(j.handovers||[])[(j.handovers||[]).length-1];
// Held as cover = the last move gave it to the current operator as cover
const heldAsCover=j=>{const l=lastHandover(j);return !!l&&l.toId===j.operatorId&&l.why==="afløser";};

const move=(j,toUser,why,now)=>({...j,operatorId:toUser.id,operatorName:toUser.name,lastModifiedAt:now,
  handovers:[...(j.handovers||[]),{from:j.operatorName||"",fromId:j.operatorId??null,to:toUser.name,toId:toUser.id,at:now,why}].slice(-20)});

// Returns {jobs, moves:[{job, machine, from, to, kind:"back"|"cover"|"given"}]} — jobs unchanged if nothing moves
export function handOverAtLogin(jobs,machines,users,user,now=Date.now()){
  if(!user||user.role!=="operator") return {jobs,moves:[]};
  const byName=new Map((machines||[]).filter(m=>m.active&&!m.removed).map(m=>[m.name,m]));
  const byId=new Map((users||[]).map(u=>[u.id,u]));
  const moves=[];
  const out=(jobs||[]).map(j=>{
    if(j.deleted||j.status==="done") return j;
    const m=byName.get(j.machine);
    if(!m||!(m.operators||[]).length) return j;
    const them=rankOn(m,j.operatorId);
    const covering=heldAsCover(j);

    // 1) Back to plan: a paused cover job goes to the highest-ranked operator due today
    if(covering&&j.logoutPaused){
      const dueId=(m.operators||[]).slice(0,them===Infinity?undefined:them)
        .find(id=>id!==user.id&&dueOn(byId.get(id),now));
      const meRank=rankOn(m,user.id);
      const dueRank=dueId!=null?rankOn(m,dueId):Infinity;
      if(dueId!=null&&dueRank<meRank){
        const to=byId.get(dueId);
        if(j.operatorId===user.id) moves.push({job:j,machine:j.machine,from:j.operatorName||"—",to:to.name,kind:"given"});
        return move(j,to,"tilbage",now);
      }
    }

    if(j.operatorId===user.id) return j;
    const me=rankOn(m,user.id);
    if(me===Infinity) return j; // not on this machine's list

    // 2) Ranks higher than the cover holding it → take it (own operator back)
    const higher=me<them&&covering;
    // 3) Cover: owner went home and isn't due today
    const cover=!higher&&ownerAway(j)&&!dueOn(byId.get(j.operatorId),now);
    if(!higher&&!cover) return j;
    const back=me===0;
    moves.push({job:j,machine:j.machine,from:j.operatorName||"—",to:user.name,kind:higher&&back?"back":"cover"});
    return move(j,user,higher?(back?"tilbage":"prioritet"):"afløser",now);
  });
  return {jobs:moves.length||out.some((x,i)=>x!==jobs[i])?out:jobs,moves};
}

// Admin marks someone "not in today": all their open jobs (paused at fyraften, or still
// running if fyraften never came) go straight to the first one on each machine's list who is due today —
// as they are: paused ones the cover starts (Fortsæt, or at login), running ones keep running.
// users must already have the absentOn set. Returns {jobs, moves:[{job,machine,from,to}]}
export function coverAbsent(jobs,machines,users,absent,now=Date.now()){
  const byName=new Map((machines||[]).filter(m=>m.active&&!m.removed).map(m=>[m.name,m]));
  const byId=new Map((users||[]).map(u=>[u.id,u]));
  const moves=[];
  const out=(jobs||[]).map(j=>{
    if(j.deleted||j.status==="done"||j.taskId||j.operatorId!==absent.id) return j;
    const m=byName.get(j.machine);
    const toId=(m?.operators||[]).find(id=>id!==absent.id&&dueOn(byId.get(id),now));
    if(toId==null) return j;
    const to=byId.get(toId);
    moves.push({job:j,machine:j.machine,from:absent.name,to:to.name});
    return move(j,to,"afløser",now);
  });
  return {jobs:moves.length?out:jobs,moves};
}

// Short text for the operator after login
export function handoverText(moves){
  if(!moves.length) return "";
  // One entry per machine (and other operator): "LB200 (7533-14-9, LIFE-1)"
  const group=(list,key)=>{
    const g=new Map();
    for(const d of list){const who=d[key];const k=d.machine+"|"+who;if(!g.has(k))g.set(k,{machine:d.machine,who,nos:[]});if(d.job.job)g.get(k).nos.push(d.job.job);}
    return[...g.values()].map(x=>({...x,label:`${x.machine}${x.nos.length?` (${x.nos.join(", ")})`:""}`}));
  };
  const back=group(moves.filter(d=>d.kind==="back"),"from");
  const cover=group(moves.filter(d=>d.kind==="cover"),"from");
  const given=group(moves.filter(d=>d.kind==="given"),"to");
  const parts=[];
  if(back.length) parts.push(`Du har fået ${back.map(x=>x.label).join(", ")} tilbage`);
  if(cover.length) parts.push(`Du har overtaget ${cover.map(x=>`${x.label} fra ${x.who}`).join(", ")}`);
  if(given.length) parts.push(`${given.map(x=>`${x.label} er givet tilbage til ${x.who}`).join(", ")} — han/hun er på arbejde i dag`);
  return parts.join(" · ");
}
