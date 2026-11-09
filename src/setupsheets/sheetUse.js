import { normPart } from "../planning/planEngine";

// When a setup sheet was last used for a job, and by whom. A job counts for the sheet it
// was started with (setupSheetId), or — for jobs from before that was stored — for the
// sheets with the same drawing number on the same machine. Tasks are one-offs: left out.
const pmKey=(part,machine)=>`pm:${normPart(part)}|${machine||""}`;

// One pass over the jobs: key → {at, by, count}
export function sheetUseMap(jobs){
  const map={};
  (jobs||[]).forEach(j=>{
    if(j.deleted||j.taskId) return;
    const k=j.setupSheetId!=null?`id:${j.setupSheetId}`:pmKey(j.job,j.machine);
    const at=j.createdAt||0, m=map[k]||(map[k]={at:0,by:"",count:0});
    m.count++;
    if(at>m.at){m.at=at;m.by=j.operatorName||"";}
  });
  return map;
}

// {at, by, count} or null when the sheet has never been used for a job
export function lastUse(sheet,map){
  const a=map[`id:${sheet.id}`], b=map[pmKey(sheet.partNumber,sheet.machine)];
  if(!a&&!b) return null;
  const newest=!b||(a&&a.at>=b.at)?a:b;
  return {at:newest.at,by:newest.by,count:(a?.count||0)+(b?.count||0)};
}

export const shortDate=t=>new Date(t).toLocaleDateString("da-DK",{day:"numeric",month:"short",...(new Date(t).getFullYear()!==new Date().getFullYear()?{year:"numeric"}:{})});
