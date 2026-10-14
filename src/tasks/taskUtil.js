import { C } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// TASKS (Opgaver) — prototypes and small projects from a "Bestiller" (requester).
// Admin gives each task to an operator; the operator starts it as a normal job
// (job.taskId points back). Task jobs are kept out of all efficiency figures.
// A task is never removed, only marked deleted:true, so the server can merge by id.
// ═══════════════════════════════════════════════════════

// Where a task stands, worked out from the task and the job started from it
export function taskState(t,jobs){
  const job=t.jobId?(jobs||[]).find(j=>j.id===t.jobId&&!j.deleted)||null:null;
  if(t.doneAt) return {key:"done",job,doneAt:t.doneAt,doneBy:t.doneBy||job?.operatorName||""};
  if(job&&job.status==="done") return {key:"done",job,doneAt:job.completedAt,doneBy:job.operatorName};
  if(job) return {key:"running",job};
  if(t.assignedToId) return {key:"assigned",job:null};
  return {key:"waiting",job:null};
}

export const TASK_STATE={
  waiting: {label:"Venter",  color:C.amber, icon:"hourglass"},
  assigned:{label:"Tildelt", color:C.blue,  icon:"user-check"},
  running: {label:"I gang",  color:C.green, icon:"player-play"},
  done:    {label:"Færdig",  color:C.muted, icon:"circle-check"},
};

// Jobs that count in efficiency figures (everything except task jobs)
export const statJobsOf=jobs=>(jobs||[]).filter(j=>!j.taskId);

// Is an operator free right now? (no unfinished job of their own)
export function operatorLoad(u,jobs){
  return (jobs||[]).filter(j=>j.operatorId===u.id&&j.status!=="done"&&!j.deleted).length;
}

export const visibleTasks=tasks=>(tasks||[]).filter(t=>!t.deleted);
