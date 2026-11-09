import { normPart } from "../planning/planEngine";

// ═══════════════════════════════════════════════════════
// TOOL LIFE — parts made with a tool on a machine since it was last changed.
// The limit is the setup sheet row's "Emner før skift / slibning" (or the tool's own).
// toolChanges: [{id,toolId,machine,at,by,kind:"ny"|"slebet",updatedAt}] — merged by id
// on the server. Counting on a machine starts at the first change registered there:
// before that nobody knows how worn the mounted tool is.
// ═══════════════════════════════════════════════════════

export function lastChange(changes,toolId,machine){
  let last=null;
  for(const c of changes||[]) if(String(c.toolId)===String(toolId)&&c.machine===machine&&(!last||c.at>last.at)) last=c;
  return last;
}

// The setup sheets a job ran with: the one chosen at start, else the sheets for its part on its machine
export function sheetsOfJob(job,sheets){
  if(job.setupSheetId){const s=(sheets||[]).find(x=>x.id===job.setupSheetId&&!x.deleted);if(s) return [s];}
  return (sheets||[]).filter(s=>!s.deleted&&s.machine===job.machine&&normPart(s.partNumber)===normPart(job.job));
}
const rowsOf=s=>[...(s.tools||[]),...(s.tools2||[]),...(s.tools3||[])];
const usesTool=(job,sheets,toolId)=>sheetsOfJob(job,sheets).some(s=>rowsOf(s).some(r=>r.toolId!=null&&String(r.toolId)===String(toolId)));
const piecesOf=j=>j.status==="done"?Math.max(j.pieces||0,j.pieces2||0):((j.counts||[]).slice(-1)[0]?.pieces||0);

// {started, used, limit, pct, since, last}
export function toolUsage({toolId,machine,limit,jobs,sheets,changes}){
  const last=lastChange(changes,toolId,machine);
  const lim=Number(limit)||null;
  if(!last) return {started:false,used:0,limit:lim,pct:null,last:null};
  const used=(jobs||[]).filter(j=>!j.deleted&&j.machine===machine&&(j.status==="done"?(j.completedAt||0)>last.at:true)&&usesTool(j,sheets,toolId))
    .reduce((s,j)=>s+piecesOf(j),0);
  return {started:true,used,limit:lim,pct:lim?used/lim:null,last};
}

// Every cabinet tool with a life on a sheet: [{row, tool, usage}]
export function sheetToolLife(sheet,{tools,jobs,sheets,changes}){
  return rowsOf(sheet).filter(r=>r.toolId!=null).map(r=>{
    const tool=(tools||[]).find(t=>String(t.id)===String(r.toolId));
    const limit=r.toolLife||tool?.toolLife;
    return {row:r,tool,usage:toolUsage({toolId:r.toolId,machine:sheet.machine,limit,jobs,sheets,changes})};
  }).filter(x=>x.tool&&x.usage.limit);
}

// Tools nearly or fully used on the sheets of a running job (≥ 90 %)
export function jobToolWarnings(job,ctx){
  const out=[],seen=new Set();
  sheetsOfJob(job,ctx.sheets).forEach(s=>sheetToolLife(s,ctx).forEach(x=>{
    const k=String(x.row.toolId);
    if(seen.has(k)||!x.usage.started||x.usage.pct<0.9) return;
    seen.add(k);out.push({...x,machine:s.machine});
  }));
  return out;
}

export const lifeColor=(pct,C)=>pct==null?C.muted:pct>=1?C.red:pct>=0.9?C.amber:C.green;
export const lifeText=u=>!u.started?"Tælling ikke startet":`${u.used} af ${u.limit} emner${u.pct>=1?" — skal skiftes":u.pct>=0.9?" — skift snart":""}`;
