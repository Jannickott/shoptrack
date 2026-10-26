import { useState } from "react";
import { C, card, inp, btn, badge } from "../lib/theme";
import { fmtHM, fmtDate, liveTime } from "../lib/util";
import { machineMaint } from "../maintenance/maintUtil";
import { MaintChecklist, maintSummary } from "../maintenance/MaintChecklist";

// ═══════════════════════════════════════════════════════
// MACHINE STATUS (operator)
// ═══════════════════════════════════════════════════════
// What a job is doing right now, for a one-line summary
export function jobPhase(j){
  const lt=liveTime(j);
  if(j.paused) return {label:"Maskine nede",color:C.red,sec:null};
  if(j.operatorPaused||j.logoutPaused) return {label:"På pause",color:C.muted,sec:null};
  if(j.status==="deburring") return {label:"Afgratning",color:C.deburr,sec:lt.debur};
  if(j.status==="setup") return {label:j.twoSided?"Opstilling side 1":"Opstilling",color:C.amber,sec:lt.setup};
  if(j.status==="side2_setup") return {label:"Opstilling side 2",color:C.amber,sec:lt.setup2};
  if(j.status==="side2_run") return {label:"Produktion side 2",color:C.blue,sec:lt.run2};
  return {label:j.twoSided?"Produktion side 1":"Produktion",color:j.nightMode?"#7c5cbf":C.green,sec:lt.run};
}

export function MachineStatusTab({user,machines,jobs,machineIssues,reportIssue,resolveIssue,maintTasks,maintLog,setMaintLog,saveNow}){
  const [openMaint,setOpenMaint]=useState(null); // machine whose maintenance checklist is open
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
            {/* Maintenance (ISO 9001) — what the admin has set up for this machine */}
            {(()=>{
              const items=machineMaint(m.name,maintTasks,maintLog,jobs);
              if(!items.length) return null;
              const s=maintSummary(items),open=openMaint===m.name;
              return(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                  <button style={{...btn("outline",true,true),justifyContent:"space-between",borderColor:s.due?C.amber:C.border,color:s.due?C.amber:C.text}} onClick={()=>setOpenMaint(open?null:m.name)}>
                    <span><i className="ti ti-tool"/> Vedligehold</span>
                    <span>{s.due?`${s.due} skal gøres`:"Alt udført ✓"} <i className={`ti ti-chevron-${open?"up":"down"}`}/></span>
                  </button>
                  {open&&<div style={{marginTop:6}}>
                    <MaintChecklist machine={m.name} tasks={maintTasks} log={maintLog} jobs={jobs} user={user} setMaintLog={setMaintLog} saveNow={saveNow} onReportFault={(mn,txt)=>reportIssue(mn,"repair",txt)}/>
                  </div>}
                </div>
              );
            })()}
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
