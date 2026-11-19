// ═══════════════════════════════════════════════════════
// FAST OPERATØR — each machine can have operators in priority order
// (machine.operators = [userId, …]; #1 is the machine's own operator, the rest cover).
// Who gets a job is decided when someone logs in (only for people on that machine's list):
//  · the job's operator isn't here (the job was paused at "fyraften" / ended night mode
//    and nobody has picked it up since) → the one logging in covers it
//    (Monday: the machine's own operator logs in and gets Friday's job)
//  · the job is held by a cover and the one logging in ranks higher on that machine
//    → it moves to them (the own operator arrives after the cover did)
// Every move is written on the job (handovers) and told to the operator.
// ═══════════════════════════════════════════════════════
export const rankOn=(machine,userId)=>{
  const i=(machine?.operators||[]).indexOf(userId);
  return i<0?Infinity:i;
};

// The job's operator isn't working it: paused when they went home, or night mode
// running/finished without them
export const ownerAway=j=>!!(j.logoutPaused||(j.nightModeEndsAt&&!j.nightModeDone)||j.nightModeDone);

// Returns {jobs, moves:[{job, machine, from, to, back}]} — jobs unchanged if nothing moves
export function handOverAtLogin(jobs,machines,user,now=Date.now()){
  if(!user||user.role!=="operator") return {jobs,moves:[]};
  const byName=new Map((machines||[]).filter(m=>m.active&&!m.removed).map(m=>[m.name,m]));
  const moves=[];
  const out=(jobs||[]).map(j=>{
    if(j.deleted||j.status==="done"||j.operatorId===user.id) return j;
    const m=byName.get(j.machine);
    const me=rankOn(m,user.id);
    if(me===Infinity) return j; // not on this machine's list
    const them=rankOn(m,j.operatorId);
    // Taking a job from someone who is working it only happens when they got it as
    // cover — not when someone chose to start or run a job on another's machine
    const last=(j.handovers||[])[(j.handovers||[]).length-1];
    const covering=!!last&&last.toId===j.operatorId&&last.why==="afløser";
    const higher=me<them&&covering;
    if(!higher&&!ownerAway(j)) return j;
    const back=me===0;
    moves.push({job:j,machine:j.machine,from:j.operatorName||"—",to:user.name,back});
    return{...j,operatorId:user.id,operatorName:user.name,lastModifiedAt:now,
      handovers:[...(j.handovers||[]),{from:j.operatorName||"",fromId:j.operatorId??null,to:user.name,toId:user.id,at:now,why:higher?(back?"tilbage":"prioritet"):"afløser"}].slice(-20)};
  });
  return {jobs:moves.length?out:jobs,moves};
}

// Short text for the operator after login
export function handoverText(moves){
  if(!moves.length) return "";
  // One entry per machine (and previous operator): "LB200 (7533-14-9, LIFE-1)"
  const group=list=>{
    const g=new Map();
    for(const d of list){const k=d.machine+"|"+d.from;if(!g.has(k))g.set(k,{machine:d.machine,from:d.from,nos:[]});if(d.job.job)g.get(k).nos.push(d.job.job);}
    return[...g.values()].map(x=>({...x,label:`${x.machine}${x.nos.length?` (${x.nos.join(", ")})`:""}`}));
  };
  const back=group(moves.filter(d=>d.back)), cover=group(moves.filter(d=>!d.back));
  const parts=[];
  if(back.length) parts.push(`Du har fået ${back.map(x=>x.label).join(", ")} tilbage`);
  if(cover.length) parts.push(`Du har overtaget ${cover.map(x=>`${x.label} fra ${x.from}`).join(", ")}`);
  return parts.join(" · ");
}
