import { C } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// TASKS (Opgaver) — prototypes and small projects from a "Bestiller" (requester).
// Admin decides the route: task.steps, one step per department, in order.
// Each step is given to an operator, who starts it as a normal job (job.taskId
// and job.taskStepId point back). When a step's job is finished the next step
// waits for admin again; the task is done when every step is done.
// Task jobs are kept out of all efficiency figures.
// A task is never removed, only marked deleted:true, so the server can merge by id.
// ═══════════════════════════════════════════════════════

// The route. A task without a route yet is one step with no department.
// (Older tasks kept assignedToId/jobId/doneAt on the task itself — read those as that one step.)
export function stepsOf(t){
  if(t.steps&&t.steps.length) return t.steps;
  return [{id:"main",dept:"",assignedToId:t.assignedToId||null,assignedToName:t.assignedToName||"",assignedAt:t.assignedAt||null,jobId:t.jobId||null,doneAt:t.doneAt||null,doneBy:t.doneBy||""}];
}

// One step: done / running / assigned / waiting
export function stepState(s,jobs){
  const job=s.jobId?(jobs||[]).find(j=>j.id===s.jobId&&!j.deleted)||null:null;
  if(s.doneAt) return {key:"done",job,doneAt:s.doneAt,doneBy:s.doneBy||job?.operatorName||""};
  if(job&&job.status==="done") return {key:"done",job,doneAt:job.completedAt,doneBy:job.operatorName};
  if(job) return {key:"running",job};
  if(s.assignedToId) return {key:"assigned",job:null};
  return {key:"waiting",job:null};
}

// Where the whole task stands: the first step that isn't done decides
export function taskState(t,jobs){
  const steps=stepsOf(t);
  const states=steps.map(s=>stepState(s,jobs));
  const idx=states.findIndex(x=>x.key!=="done");
  if(idx<0){
    const last=states[states.length-1];
    return {key:"done",steps,states,index:steps.length-1,step:steps[steps.length-1],job:last.job,
      doneAt:Math.max(...states.map(x=>x.doneAt||0)),doneBy:last.doneBy};
  }
  return {...states[idx],steps,states,index:idx,step:steps[idx]};
}

// "trin 2 af 3 · Fræsning" — empty for a one-step task without a department
export function stepLabel(st){
  const n=st.steps.length, d=st.step?.dept;
  if(n<=1) return d||"";
  return `trin ${st.index+1} af ${n}${d?` · ${d}`:""}`;
}

export const TASK_STATE={
  waiting: {label:"Venter",  color:C.amber, icon:"hourglass"},
  assigned:{label:"Tildelt", color:C.blue,  icon:"user-check"},
  running: {label:"I gang",  color:C.green, icon:"player-play"},
  done:    {label:"Færdig",  color:C.muted, icon:"circle-check"},
};

// Jobs that count in efficiency figures (everything except task jobs)
export const statJobsOf=jobs=>(jobs||[]).filter(j=>!j.taskId);

// How many unfinished jobs an operator has right now (0 = free)
export function operatorLoad(u,jobs){
  return (jobs||[]).filter(j=>j.operatorId===u.id&&j.status!=="done"&&!j.deleted).length;
}

// Operators who work in a department (no departments set = works everywhere)
export function operatorsFor(operators,dept){
  if(!dept) return operators;
  const m=operators.filter(u=>!(u.departments||[]).length||(u.departments||[]).includes(dept));
  return m.length?m:operators;
}

// Change one step (materialises the route on a task that had none)
export function withStep(t,stepId,patch){
  return {...t,steps:stepsOf(t).map(s=>s.id===stepId?{...s,...patch}:s),updatedAt:Date.now()};
}

export const visibleTasks=tasks=>(tasks||[]).filter(t=>!t.deleted);
