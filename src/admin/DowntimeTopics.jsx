import { useState } from "react";
import { C, card } from "../lib/theme";
import { fmtHM, fmtDate } from "../lib/util";
import { byTopic, repeatFaults, topicIcon, REPEAT_DAYS } from "../lib/issueTopics";

// ═══════════════════════════════════════════════════════
// NEDETID EFTER EMNE (Rapporter) — where the downtime goes, per topic, for a period
// and one or all machines; tap a topic to see its faults. Plus faults that keep coming
// back: the same topic on the same machine twice or more in 30 days.
// ═══════════════════════════════════════════════════════
const DAY=24*3600*1000;
const PERIODS=[["30","30 dage"],["90","90 dage"],["365","12 måneder"],["year","I år"]];
const periodStart=p=>p==="year"?new Date(new Date().getFullYear(),0,1).getTime():Date.now()-Number(p)*DAY;

export function DowntimeTopics({downtimeLog,machines}){
  const [period,setPeriod]=useState("90");
  const [machine,setMachine]=useState("all");
  const [open,setOpen]=useState(null); // topic key ("" = Uden emne)
  const log=downtimeLog||[];
  const from=periodStart(period);
  const list=log.filter(d=>(d.resolvedAt||0)>=from&&(machine==="all"||d.machineName===machine));
  const groups=byTopic(list);
  const total=list.reduce((s,d)=>s+(d.downtimeSec||0),0);
  const maxSec=Math.max(1,...groups.map(g=>g.sec));
  const names=[...new Set([...(machines||[]).filter(m=>m.active&&!m.removed).map(m=>m.name),...log.map(d=>d.machineName)])].sort();
  const repeats=repeatFaults(log).filter(r=>machine==="all"||r.machine===machine);
  const chip=(on,color)=>({padding:"6px 12px",borderRadius:8,fontSize:14,cursor:"pointer",minHeight:36,fontWeight:on?700:400,border:`1px solid ${on?color:C.border}`,background:on?`${color}22`:C.surface,color:on?color:C.muted});

  return(
    <div style={{...card(),marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <i className="ti ti-alert-triangle" style={{fontSize:24,color:C.red}}/>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:15,color:C.text,fontWeight:700}}>Nedetid efter emne</div>
          <div style={{fontSize:13,color:C.muted}}>{list.length?`${fmtHM(total)} nedetid · ${list.length} fejl`:"Ingen fejl i perioden"}</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {PERIODS.map(([k,l])=><button key={k} style={chip(period===k,C.amber)} onClick={()=>setPeriod(k)}>{l}</button>)}
        </div>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {["all",...names].map(n=><button key={n} style={chip(machine===n,C.blue)} onClick={()=>{setMachine(n);setOpen(null);}}>{n==="all"?"Alle maskiner":n}</button>)}
      </div>

      {/* Faults that keep coming back */}
      {repeats.length>0&&(
        <div style={{background:"rgba(231,76,60,.08)",border:`1px solid ${C.red}66`,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:13,color:C.red,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,marginBottom:6}}><i className="ti ti-repeat"/> Gentagne fejl · de sidste {REPEAT_DAYS} dage</div>
          {repeats.map(r=>(
            <div key={r.machine+r.topic} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
              <i className={`ti ti-${topicIcon(r.topic)}`} style={{fontSize:20,color:r.count>=3?C.red:C.amber}}/>
              <div style={{flex:"1 1 200px",fontSize:15,color:C.text}}><b>{r.machine}</b> · {r.label}</div>
              <span style={{fontSize:15,fontWeight:700,color:r.count>=3?C.red:C.amber}}>{r.count} gange</span>
              <span style={{fontSize:14,color:C.muted}}>{fmtHM(r.sec)} nedetid · sidst {fmtDate(r.last)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Downtime per topic */}
      {groups.map(g=>{const isOpen=open===g.key;const color=g.key?C.red:C.muted;return(
        <div key={g.key||"none"} style={{borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>setOpen(isOpen?null:g.key)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",minHeight:48}}>
            <i className={`ti ti-${g.key?topicIcon(g.key):"help-circle"}`} style={{fontSize:20,color,width:22,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:4}}>
                <span style={{fontSize:15,fontWeight:700,color:g.key?C.text:C.muted}}>{g.label} <span style={{fontSize:13,color:C.muted,fontWeight:400}}>· {g.count} fejl</span></span>
                <span style={{fontSize:15,fontWeight:700,color,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{fmtHM(g.sec)}</span>
              </div>
              <div style={{height:8,background:C.raised,borderRadius:4,overflow:"hidden"}}><div style={{width:`${Math.max(2,g.sec/maxSec*100)}%`,height:"100%",background:color,opacity:g.key?.85:.4}}/></div>
              {machine==="all"&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>{Object.entries(g.machines).sort((a,b)=>b[1]-a[1]).map(([m,s])=>`${m} ${fmtHM(s)}`).join(" · ")}</div>}
            </div>
            <i className={`ti ti-chevron-${isOpen?"up":"down"}`} style={{color:C.muted}}/>
          </button>
          {isOpen&&(
            <div style={{display:"flex",flexDirection:"column",gap:6,paddingBottom:10,paddingLeft:32}}>
              {!g.key&&<div style={{fontSize:13,color:C.muted}}>Fejl løst før emner kom til. Sæt emne med blyanten under Alle job → Løste fejl.</div>}
              {[...g.items].sort((a,b)=>(b.resolvedAt||0)-(a.resolvedAt||0)).map(d=>(
                <div key={d.id} style={{background:C.raised,borderRadius:8,padding:"8px 10px",fontSize:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <span style={{color:C.text,fontWeight:700}}>{d.machineName} <span style={{color:C.muted,fontWeight:400}}>· {fmtDate(d.reportedAt)} · {d.status==="down"?"Maskine nede":"Skal repareres"}</span></span>
                    <span style={{color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(d.downtimeSec||0)}</span>
                  </div>
                  {d.reason&&<div style={{color:C.text}}><i className="ti ti-alert-circle" style={{color:C.muted}}/> {d.reason}</div>}
                  {d.fixDescription&&<div style={{color:C.text}}><i className="ti ti-tools" style={{color:C.muted}}/> {d.fixDescription}</div>}
                  <div style={{fontSize:12,color:C.muted}}>Meldt af {d.reportedBy||"—"} · løst af {d.resolvedBy||"—"}{d.fixCost?` · ${d.fixCost}`:""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );})}
      {!groups.length&&<div style={{fontSize:14,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:10}}><i className="ti ti-circle-check" style={{color:C.green}}/> Ingen nedetid i perioden{machine!=="all"?` på ${machine}`:""}.</div>}
    </div>
  );
}

