import { useState, useMemo } from "react";
import { toLocalInput, fromLocalInput } from "../admin/AllJobsTab";
import { C, card, inp, sel, btn, badge, tag, label, errMsg, th, td } from "../lib/theme";
import { fmtHM, fmtDate } from "../lib/util";
import { PLAN_COLORS, addDays, dueTs, partHistory, suggestRoute, stepDuration, dayWindow, effectiveDeptOrder, sortSteps, buildPlan, parseImport } from "./planEngine";

export function PlanningTab({jobs,machines,departments,workHours,planOrders,setPlanOrders,planSettings,setPlanSettings,saveNow}){
  const [view,setView]=useState("week");
  const [weekOffset,setWeekOffset]=useState(0);
  const [monthOffset,setMonthOffset]=useState(0);
  const [editing,setEditing]=useState(null); // copy of the order being edited
  const [selectedId,setSelectedId]=useState(null);
  const minute=Math.floor(Date.now()/60000); // re-plan once a minute, not every second
  const allDepts=useMemo(()=>[...new Set([...(departments||[]),...machines.map(m=>m.department).filter(Boolean)])].sort(),[departments,machines]);
  const deptOrder=useMemo(()=>effectiveDeptOrder(planSettings?.deptOrder,allDepts),[planSettings,allDepts]);
  const groupSameParts=!!planSettings?.groupSameParts;
  // Machines listed by department in route order, then by name
  const activeMachines=useMemo(()=>{
    const di=d=>{const i=deptOrder.indexOf(d);return i<0?999:i;};
    return machines.filter(m=>m.active&&!m.removed).sort((a,b)=>di(a.department)-di(b.department)||a.name.localeCompare(b.name));
  },[machines,deptOrder]);
  const plan=useMemo(()=>buildPlan({orders:planOrders||[],jobs,allMachines:machines,machines:activeMachines,workHours,now:minute*60000,groupSameParts}),[planOrders,jobs,machines,activeMachines,workHours,minute,groupSameParts]);
  const colorOf=id=>PLAN_COLORS[Math.max(0,plan.ordered.findIndex(o=>o.id===id))%PLAN_COLORS.length];

  const saveSettings=p=>{setPlanSettings(prev=>({...(prev||{}),...p}));saveNow&&saveNow();};
  const saveOrders=fn=>{setPlanOrders(fn);saveNow&&saveNow();};
  // Pin one step to a machine and start time (null = unpin)
  const setPin=(orderId,stepIdx,pin)=>{const now=Date.now();saveOrders(prev=>prev.map(o=>o.id===orderId?{...o,updatedAt:now,steps:o.steps.map((s,i)=>i===stepIdx?{...s,pin}:s)}:o));};
  const pinnedCount=plan.ordered.reduce((n,o)=>n+(o.steps||[]).filter(s=>s.pin).length,0);
  const unpinAll=()=>{const now=Date.now();saveOrders(prev=>prev.map(o=>(o.steps||[]).some(s=>s.pin)?{...o,updatedAt:now,steps:o.steps.map(s=>({...s,pin:null}))}:o));};
  // Drop a dragged block on a machine's day: it's pinned to start there (15-minute steps)
  const dropOn=(e,m,w)=>{
    e.preventDefault();
    let d;try{d=JSON.parse(e.dataTransfer.getData("text/plain"));}catch{return;}
    const o=plan.ordered.find(x=>x.id===d.orderId);const st=o?.steps?.[d.stepIdx];
    if(!st) return;
    if(st.department&&m.department!==st.department&&st.machine!==m.name){window.alert(`${m.name} hører ikke til ${st.department} — trin ${d.stepIdx+1} skal blive i ${st.department}.`);return;}
    const rect=e.currentTarget.getBoundingClientRect();
    const frac=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
    const t=Math.round((w[0]+frac*(w[1]-w[0]))/900000)*900000;
    setPin(o.id,d.stepIdx,{machine:m.name,start:Math.min(Math.max(t,w[0]),w[1]-900000)});
    setSelectedId(o.id);
  };
  const upsert=o=>saveOrders(prev=>{const n={...o,updatedAt:Date.now()};return prev.some(x=>x.id===o.id)?prev.map(x=>x.id===o.id?n:x):[...prev,n];});
  const patch=(o,p)=>upsert({...o,...p});
  const move=(o,dir)=>{
    const list=plan.ordered;const other=list[list.findIndex(x=>x.id===o.id)+dir];
    if(!other||!!other.urgent!==!!o.urgent) return;
    const rb=other.rank??dueTs(other),now=Date.now();
    saveOrders(prev=>prev.map(x=>x.id===o.id?{...x,rank:rb+dir,updatedAt:now}:x));
  };
  const sortByDue=()=>{const now=Date.now();saveOrders(prev=>prev.map(o=>o.deleted||o.done?o:{...o,rank:dueTs(o),updatedAt:now}));};
  const newOrder=()=>setEditing({id:Date.now(),customer:"",partNumber:"",quantity:"",dueDate:"",urgent:false,notes:"",steps:[],createdAt:Date.now(),isNew:true});

  const problems=plan.ordered.filter(o=>plan.results[o.id]?.problem||plan.results[o.id]?.warning);
  const lateCount=plan.ordered.filter(o=>plan.results[o.id]?.late).length;
  const fmtDay=ms=>new Date(ms).toLocaleDateString("da-DK",{weekday:"short",day:"2-digit",month:"short"});

  // Pieces of a machine's blocks inside one day's work window, as % positions,
  // split where setup ends so setup can be drawn darker
  const daySegments=(machine,w)=>{
    const out=[];
    const piece=(b,key,a,z,setup)=>{if(z>a)out.push({b,key,setup,left:(a-w[0])/(w[1]-w[0])*100,width:(z-a)/(w[1]-w[0])*100,sec:(z-a)/1000});};
    plan.blocks.filter(b=>b.machine===machine).forEach((b,bi)=>b.segs.forEach(([s,e],si)=>{
      if(e<=w[0]||s>=w[1]) return;
      const a=Math.max(s,w[0]),z=Math.min(e,w[1]);
      const cut=b.setupEnd==null?a:Math.min(Math.max(b.setupEnd,a),z);
      piece(b,`${bi}-${si}-s`,a,cut,true);
      piece(b,`${bi}-${si}-r`,cut,z,false);
    }));
    return out;
  };
  const blockInfo=b=>b.live
    ?`Kører nu: ${b.label} (${b.operator||""})${b.guess?" — ingen historik, regnes som færdig i dag":b.inSetup?" — i opstilling":""}`
    :`${b.pinned?"📌 Låst — træk igen for at flytte, lås op under Ordrer\n":"Træk for at flytte og låse den\n"}${b.label} · trin ${b.stepIdx+1}\nOpstilling ${b.setupSaved?`springes over (${b.machine} er allerede stillet op til emnet, sparer ${fmtHM(b.setupSaved)})`:fmtHM(b.setupSec)} + produktion ${fmtHM(b.runSec)}`;

  if(view==="import") return <PlanImport jobs={jobs} machines={machines} allDepts={allDepts} deptOrder={deptOrder} onCancel={()=>setView("orders")}
    onAdd={list=>{saveOrders(prev=>[...prev,...list.map(o=>({...o,rank:dueTs(o),updatedAt:Date.now()}))]);setView("month");}}/>;
  if(editing) return <PlanOrderForm order={editing} jobs={jobs} machines={machines} activeMachines={activeMachines} allDepts={allDepts} deptOrder={deptOrder}
    onCancel={()=>setEditing(null)}
    onSave={o=>{const {isNew,...clean}=o;upsert(isNew?{...clean,rank:dueTs(clean)}:clean);setEditing(null);setSelectedId(o.id);}}/>;

  // ── Week view ──
  const weekStart=(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+weekOffset*7);return d.getTime();})();
  const weekDays=[...Array(7)].map((_,i)=>addDays(weekStart,i));
  const todayStart=new Date().setHours(0,0,0,0);
  const weekNo=(()=>{const t=new Date(weekStart);t.setDate(t.getDate()+3);const w1=new Date(t.getFullYear(),0,4);return 1+Math.round(((t-w1)/86400000-3+((w1.getDay()+6)%7))/7);})();

  // Setup = same colour, darkened, so setup vs run shows at a glance
  const blockStyle=(b,selected,setup)=>({position:"absolute",top:3,bottom:3,overflow:"hidden",whiteSpace:"nowrap",fontSize:12,lineHeight:"14px",padding:"1px 3px",cursor:b.live?"default":"pointer",
    color:b.live||setup?C.text:"#111",fontWeight:700,
    background:b.live
      ?(setup?"repeating-linear-gradient(45deg,#2a3546,#2a3546 4px,#202a38 4px,#202a38 8px)":"repeating-linear-gradient(45deg,#3a4a60,#3a4a60 4px,#2e3b4e 4px,#2e3b4e 8px)")
      :setup?`linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.5)),${colorOf(b.orderId)}`:colorOf(b.orderId),
    opacity:selectedId&&!selected?0.3:1,boxSizing:"border-box",
    border:b.overlap?`2px solid ${C.red}`:selected?"2px solid #fff":b.pinned?"1px dashed #fff":"none"});

  const weekView=(
    <div style={{...card(),padding:"10px 8px",overflowX:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button style={btn("outline",false,true)} onClick={()=>setWeekOffset(w=>w-1)}><i className="ti ti-chevron-left"/></button>
        <div style={{fontSize:15,color:C.text,fontWeight:700}}>Uge {weekNo} · {fmtDay(weekDays[0])} – {fmtDay(weekDays[6])}</div>
        <button style={btn("outline",false,true)} onClick={()=>setWeekOffset(w=>w+1)}><i className="ti ti-chevron-right"/></button>
        {weekOffset!==0&&<button style={btn("outline",false,true)} onClick={()=>setWeekOffset(0)}>Denne uge</button>}
      </div>
      <div style={{minWidth:760}}>
        <div style={{display:"grid",gridTemplateColumns:"110px repeat(7,1fr)",gap:2,marginBottom:2}}>
          <div/>
          {weekDays.map(d=><div key={d} style={{fontSize:12,textAlign:"center",color:d===todayStart?C.amber:C.muted,fontWeight:d===todayStart?700:400,letterSpacing:1,textTransform:"uppercase"}}>{fmtDay(d)}</div>)}
        </div>
        {activeMachines.map(m=>(
          <div key={m.id} style={{display:"grid",gridTemplateColumns:"110px repeat(7,1fr)",gap:2,marginBottom:2}}>
            <div style={{fontSize:14,color:C.text,padding:"6px 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {m.name}{m.department&&<div style={{fontSize:11,color:C.muted}}>{m.department}</div>}
            </div>
            {weekDays.map(d=>{
              const w=dayWindow(workHours,d);
              if(!w) return <div key={d} style={{background:"rgba(255,255,255,.02)",borderRadius:4,minHeight:34}}/>;
              return(
                <div key={d} onDragOver={e=>e.preventDefault()} onDrop={e=>dropOn(e,m,w)}
                  style={{position:"relative",background:C.raised,borderRadius:4,minHeight:34,outline:d===todayStart?`1px solid ${C.amber}55`:"none"}}>
                  {daySegments(m.name,w).map(({b,key,left,width,setup})=>(
                    <div key={key} title={`${setup?"OPSTILLING — ":""}${blockInfo(b)}\n${fmtDate(b.segs[0]?.[0]??b.end)} → ${fmtDate(b.end)}`}
                      draggable={!b.live}
                      onDragStart={e=>{e.dataTransfer.setData("text/plain",JSON.stringify({orderId:b.orderId,stepIdx:b.stepIdx}));e.dataTransfer.effectAllowed="move";}}
                      onClick={()=>!b.live&&setSelectedId(id=>id===b.orderId?null:b.orderId)}
                      style={{...blockStyle(b,b.orderId===selectedId,setup),left:`${left}%`,width:`${width}%`,cursor:b.live?"default":"grab"}}>
                      {width>12?(setup?"Opstilling":(b.pinned?"📌 ":"")+b.label):""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:12,color:C.muted,marginTop:8}}>Hver dag viser arbejdstiden. Mørk del = opstilling, lys del = produktion. Stribet = kører nu (anslået). <b style={{color:C.text}}>Træk en blok</b> til en anden dag, tid eller maskine (samme afdeling) for at låse den dér 📌 — alt andet planlægges uden om. Tryk på en blok for at fremhæve ordren; hold musen over for tider.</div>
    </div>
  );

  // ── Month view ──
  const monthStart=(()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(1);d.setMonth(d.getMonth()+monthOffset);return d.getTime();})();
  const monthDays=(()=>{const out=[];let t=monthStart;const m=new Date(monthStart).getMonth();while(new Date(t).getMonth()===m){out.push(t);t=addDays(t,1);}return out;})();
  const monthLabel=new Date(monthStart).toLocaleDateString("da-DK",{month:"long",year:"numeric"});
  const monthEnd=addDays(monthDays[monthDays.length-1],1);
  const finishing=plan.ordered.filter(o=>{const r=plan.results[o.id];return r?.end&&r.end>=monthStart&&r.end<monthEnd;}).sort((a,b)=>plan.results[a.id].end-plan.results[b.id].end);

  const monthView=(
    <div style={{...card(),padding:"10px 8px",overflowX:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <button style={btn("outline",false,true)} onClick={()=>setMonthOffset(m=>m-1)}><i className="ti ti-chevron-left"/></button>
        <div style={{fontSize:15,color:C.text,fontWeight:700,textTransform:"capitalize"}}>{monthLabel}</div>
        <button style={btn("outline",false,true)} onClick={()=>setMonthOffset(m=>m+1)}><i className="ti ti-chevron-right"/></button>
        {monthOffset!==0&&<button style={btn("outline",false,true)} onClick={()=>setMonthOffset(0)}>Denne måned</button>}
      </div>
      <div style={{minWidth:760}}>
        <div style={{display:"grid",gridTemplateColumns:`110px repeat(${monthDays.length},1fr)`,gap:1,marginBottom:2}}>
          <div/>
          {monthDays.map(d=><div key={d} style={{fontSize:11,textAlign:"center",color:d===todayStart?C.amber:C.muted,fontWeight:d===todayStart?700:400}}>{new Date(d).getDate()}<br/>{"SMTOTFL"[new Date(d).getDay()]}</div>)}
        </div>
        {activeMachines.map(m=>(
          <div key={m.id} style={{display:"grid",gridTemplateColumns:`110px repeat(${monthDays.length},1fr)`,gap:1,marginBottom:1}}>
            <div style={{fontSize:14,color:C.text,padding:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
            {monthDays.map(d=>{
              const w=dayWindow(workHours,d);
              if(!w) return <div key={d} style={{background:"rgba(255,255,255,.02)",borderRadius:2,minHeight:24}}/>;
              const segs=daySegments(m.name,w);
              const daySec=(w[1]-w[0])/1000;
              const load=Math.min(1,segs.reduce((s,x)=>s+x.sec,0)/daySec);
              const setupLoad=Math.min(load,segs.filter(x=>x.setup).reduce((s,x)=>s+x.sec,0)/daySec);
              const sel=selectedId&&segs.some(x=>x.b.orderId===selectedId);
              return <div key={d} title={`${m.name} · ${fmtDay(d)}\n${Math.round(load*100)}% planlagt — ${Math.round(setupLoad*100)}% opstilling, ${Math.round((load-setupLoad)*100)}% produktion${segs.length?"\n"+[...new Set(segs.map(x=>x.b.label))].join("\n"):""}`}
                style={{position:"relative",overflow:"hidden",background:load?`rgba(59,130,246,${0.15+load*0.75})`:C.raised,borderRadius:2,minHeight:24,fontSize:11,color:"#fff",textAlign:"center",lineHeight:"24px",outline:sel?"2px solid #fff":d===todayStart?`1px solid ${C.amber}88`:"none"}}>
                {load>=0.05?Math.round(load*100):""}
                {setupLoad>0&&<div style={{position:"absolute",left:0,right:0,bottom:0,height:`${Math.max(8,setupLoad*100)}%`,background:"rgba(240,165,0,.75)"}}/>}
              </div>;
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:12,color:C.muted,marginTop:8,marginBottom:12}}>Tallene = % af dagens arbejdstid planlagt på maskinen; den <span style={{color:C.amber}}>gule del</span> er opstilling. Hold musen over en dag for at se jobbene.</div>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Bliver færdige i {monthLabel}</div>
      {!finishing.length&&<div style={{fontSize:14,color:C.muted}}>Ingen ordrer bliver færdige denne måned.</div>}
      {finishing.map(o=>{const r=plan.results[o.id];return(
        <div key={o.id} onClick={()=>setSelectedId(id=>id===o.id?null:o.id)} style={{display:"flex",gap:10,alignItems:"center",padding:"6px 8px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:o.id===selectedId?C.raised:"transparent"}}>
          <span style={{width:10,height:10,borderRadius:2,background:colorOf(o.id),flexShrink:0}}/>
          <span style={{flex:1,fontSize:15,color:C.text}}>{[o.customer,o.partNumber].filter(Boolean).join(" · ")} <span style={{color:C.muted}}>× {o.quantity}</span></span>
          <span style={{fontSize:14,color:r.late?C.red:C.green}}>{fmtDay(r.end)}</span>
          <span style={{fontSize:13,color:C.muted}}>leveres {o.dueDate?fmtDay(dueTs(o)):"—"}</span>
        </div>
      );})}
    </div>
  );

  // ── Orders view ──
  const ordersView=(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <button style={btn("outline",false,true)} onClick={sortByDue} title="Fortryd manuelle ▲▼-flytninger"><i className="ti ti-sort-ascending"/> Sorter efter leveringsdato</button>
        {pinnedCount>0&&<button style={btn("outline",false,true)} onClick={unpinAll} title="Lad planlæggeren placere alt igen"><i className="ti ti-pinned-off"/> Lås alle op ({pinnedCount})</button>}
        <button style={btn("outline",false,true)} onClick={()=>setView("import")}><i className="ti ti-file-import"/> Importer ordrer</button>
      </div>
      {!plan.ordered.length&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen ordrer endnu. Tryk "Ny ordre" for at tilføje en.</div>}
      {plan.ordered.map((o,i)=>{
        const r=plan.results[o.id]||{};
        return(
          <div key={o.id} style={{...card(colorOf(o.id)),cursor:"pointer",outline:o.id===selectedId?"1px solid #fff":"none"}} onClick={()=>setSelectedId(id=>id===o.id?null:o.id)}>
            <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{display:"flex",flexDirection:"column",gap:2}} onClick={e=>e.stopPropagation()}>
                <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===0} onClick={()=>move(o,-1)}><i className="ti ti-chevron-up"/></button>
                <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===plan.ordered.length-1} onClick={()=>move(o,1)}><i className="ti ti-chevron-down"/></button>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700}}>
                  {o.urgent&&<span style={{...badge("down"),marginRight:6}}>Haster</span>}
                  {[o.customer,o.partNumber].filter(Boolean).join(" · ")} <span style={{color:C.muted,fontWeight:400}}>× {o.quantity}</span>
                </div>
                <div style={{fontSize:13,color:C.muted,marginTop:2}}>Leveres {o.dueDate?fmtDay(dueTs(o)):"— (ingen leveringsdato)"}{r.end&&<> · planlagt færdig <span style={{color:r.late?C.red:C.green,fontWeight:700}}>{fmtDate(r.end)}</span></>}{r.late&&<span style={{color:C.red,fontWeight:700}}> · FORSINKET</span>}</div>
                {r.problem&&<div style={{fontSize:13,color:C.amber,marginTop:4}}><i className="ti ti-alert-triangle"/> {r.problem}</div>}
                {r.warning&&<div style={{fontSize:13,color:C.amber,marginTop:4}}><i className="ti ti-pin"/> {r.warning}</div>}
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                  {(o.steps||[]).map((st,si)=>{const b=r.steps?.[si];return(
                    <span key={st.id||si} style={{fontSize:12,padding:"2px 6px",borderRadius:4,background:C.raised,color:C.text,border:st.pin?"1px dashed #fff":"none",display:"inline-flex",alignItems:"center",gap:4}}>
                      {st.pin&&"📌"}{si+1}. {st.department||"—"} → {b?b.machine:(st.machine||"any")}{b&&<span style={{color:C.muted}}> · <span style={{color:C.amber}}>{b.setupSaved?"ingen opstilling":`${fmtHM(b.setupSec)} setup`}</span> + <span style={{color:C.green}}>{fmtHM(b.runSec)} produktion</span> · {st.pin?fmtDate(b.start):fmtDay(b.start)}</span>}
                      {st.pin&&<button title="Lås op — lad planlæggeren placere den" onClick={e=>{e.stopPropagation();setPin(o.id,si,null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",padding:0,fontSize:14}}><i className="ti ti-x"/></button>}
                    </span>
                  );})}
                </div>
              </div>
              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                <button style={btn(o.urgent?"danger":"outline",false,true)} title="Haster — planlæg før alt andet" onClick={()=>patch(o,{urgent:!o.urgent})}><i className="ti ti-flame"/></button>
                <button style={btn("outline",false,true)} title="Rediger" onClick={()=>setEditing({...o})}><i className="ti ti-pencil"/></button>
                <button style={btn("success",false,true)} title="Ordren er færdig — fjern fra planen" onClick={()=>patch(o,{done:true,doneAt:Date.now()})}><i className="ti ti-check"/></button>
                <button style={btn("outline",false,true)} title="Slet" onClick={()=>{if(window.confirm(`Slet ordre ${o.partNumber}?`))patch(o,{deleted:true});}}><i className="ti ti-trash"/></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontSize:15,color:C.amber,letterSpacing:2,textTransform:"uppercase",fontWeight:700}}><i className="ti ti-calendar-time"/> Planlægning <span style={{fontSize:12,background:C.blue,color:"#fff",borderRadius:4,padding:"1px 5px",letterSpacing:1}}>BETA</span></div>
        <div style={{flex:1}}/>
        {[["week","Uge"],["month","Måned"],["orders",`Ordrer (${plan.ordered.length})`],["settings","Indstillinger"]].map(([v,l])=><button key={v} style={tag(view===v)} onClick={()=>setView(v)}>{l}</button>)}
        <button style={btn("outline",false,true)} onClick={()=>setView("import")}><i className="ti ti-file-import"/> Importer</button>
        <button style={btn("primary",false,true)} onClick={newOrder}><i className="ti ti-plus"/> Ny ordre</button>
      </div>
      {(problems.length>0||lateCount>0)&&(
        <div style={{background:"rgba(240,165,0,.08)",border:`1px solid rgba(240,165,0,.3)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:14,color:C.amber}}>
          {lateCount>0&&<div><i className="ti ti-clock-exclamation"/> {lateCount} ordre{lateCount!==1?"r":""} planlagt til at blive færdig efter leveringsdatoen</div>}
          {problems.map(o=><div key={o.id}><i className="ti ti-alert-triangle"/> {o.partNumber}: {plan.results[o.id].problem||plan.results[o.id].warning}</div>)}
        </div>
      )}
      {view==="week"&&weekView}
      {view==="month"&&monthView}
      {view==="orders"&&ordersView}
      {view==="settings"&&(
        <div style={{...card(),maxWidth:520}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Afdelingernes rækkefølge</div>
          <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Den rækkefølge et job går gennem afdelingerne. En rute følger altid denne rækkefølge — et job der kun skal i nogle afdelinger, springer de andre over.</div>
          {deptOrder.length===0&&<div style={{fontSize:14,color:C.muted}}>Ingen afdelinger endnu — tilføj dem under Administration → Afdelinger og giv hver maskine sin afdeling.</div>}
          {deptOrder.map((d,i)=>(
            <div key={d} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:C.raised,borderRadius:6,marginBottom:4}}>
              <span style={{fontSize:16,color:C.amber,fontWeight:700,width:20}}>{i+1}</span>
              <span style={{flex:1,fontSize:16,color:C.text}}>{d} <span style={{fontSize:13,color:C.muted}}>· {machines.filter(m=>m.active&&m.department===d).map(m=>m.name).join(", ")||"ingen maskiner"}</span></span>
              <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===0} onClick={()=>{const n=[...deptOrder];[n[i-1],n[i]]=[n[i],n[i-1]];saveSettings({deptOrder:n});}}><i className="ti ti-chevron-up"/></button>
              <button style={{...btn("outline",false,true),padding:"2px 6px"}} disabled={i===deptOrder.length-1} onClick={()=>{const n=[...deptOrder];[n[i+1],n[i]]=[n[i],n[i+1]];saveSettings({deptOrder:n});}}><i className="ti ti-chevron-down"/></button>
            </div>
          ))}
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 6px"}}>Opstillinger</div>
          <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:15,color:C.text,cursor:"pointer"}}>
            <input type="checkbox" checked={groupSameParts} onChange={e=>saveSettings({groupSameParts:e.target.checked})} style={{marginTop:2}}/>
            <span>Saml samme emner for at spare opstillinger<div style={{fontSize:13,color:C.muted,marginTop:2}}>Ordrer på samme emne med leveringsdato inden for 7 dage af hinanden planlægges lige efter hinanden, så maskinen forbliver stillet op.</div></span>
          </label>
        </div>
      )}
      <div style={{fontSize:12,color:C.muted,marginTop:12,lineHeight:1.6}}>
        Beta: tider kommer fra medianen af tidligere afsluttede kørsler af samme emne (samme maskine først, ellers samme afdeling), eller de minutter du indtaster.
        Maskiner planlægges kun inden for arbejdstiden — ingen nat- eller ubemandet kørsel endnu. Job der kører, optager deres maskine i den typiske resterende tid.
      </div>
    </div>
  );
}

// New / edit planning order: customer, part, quantity, due date and the route
export function PlanOrderForm({order,jobs,machines,activeMachines,allDepts,deptOrder,onCancel,onSave}){
  const [o,setO]=useState(order);
  const [err,setErr]=useState("");
  const set=(k,v)=>setO(p=>({...p,[k]:v}));
  const hist=partHistory(jobs,machines,o.partNumber);
  const suggested=sortSteps(suggestRoute(hist),deptOrder);
  // Tick a department to add/remove its step; steps stay in department order
  const toggleDept=d=>setO(p=>{
    const has=p.steps.some(s=>s.department===d);
    const steps=has?p.steps.filter(s=>s.department!==d):sortSteps([...p.steps,{id:Date.now(),department:d,machine:"",setupMin:"",runMinPerPc:""}],deptOrder);
    return {...p,steps};
  });
  const knownParts=useMemo(()=>[...new Set(jobs.filter(j=>j.status==="done"&&j.job).map(j=>j.job.trim()))].sort(),[jobs]);
  const setStep=(i,p)=>setO(x=>({...x,steps:x.steps.map((s,si)=>si===i?{...s,...p}:s)}));
  const moveStep=(i,dir)=>setO(x=>{const s=[...x.steps];const j=i+dir;if(j<0||j>=s.length)return x;[s[i],s[j]]=[s[j],s[i]];return{...x,steps:s};});
  // Fill the route from history the first time a known part is typed
  const onPart=v=>setO(p=>{const n={...p,partNumber:v};if(!p.steps.length){const r=sortSteps(suggestRoute(partHistory(jobs,machines,v)),deptOrder);if(r.length)n.steps=r;}return n;});
  const save=()=>{
    if(!o.partNumber.trim()) return setErr("Tegningsnr. skal udfyldes");
    if(!(parseInt(o.quantity)>0)) return setErr("Antal skal være mindst 1");
    if(!o.steps.length) return setErr("Tilføj mindst ét trin");
    if(o.steps.some(s=>!s.department&&!s.machine)) return setErr("Hvert trin skal have en afdeling eller en maskine");
    onSave({...o,partNumber:o.partNumber.trim(),customer:o.customer.trim(),quantity:parseInt(o.quantity)});
  };
  const qty=parseInt(o.quantity)||0;
  return(
    <div style={{padding:"14px 16px",maxWidth:760}}>
      <button style={{...btn("outline",false,true),marginBottom:12}} onClick={onCancel}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{order.isNew?"Ny ordre":"Rediger ordre"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><label style={label}>Kunde</label><input style={inp()} value={o.customer} onChange={e=>set("customer",e.target.value)}/></div>
        <div><label style={label}>Tegningsnr. *</label><input style={inp()} list="plan-parts" value={o.partNumber} onChange={e=>onPart(e.target.value)}/>
          <datalist id="plan-parts">{knownParts.map(p=><option key={p} value={p}/>)}</datalist>
          <div style={{fontSize:12,color:hist.length?C.green:C.muted,marginTop:4}}>{hist.length?`${hist.length} tidligere ${hist.length!==1?"kørsler":"kørsel"} fundet`:o.partNumber?"Nyt emne — ingen historik, indtast minutter pr. trin":""}</div>
        </div>
        <div><label style={label}>Antal *</label><input type="number" min="1" style={inp()} value={o.quantity} onChange={e=>set("quantity",e.target.value)}/></div>
        <div><label style={label}>Leveringsdato</label><input type="date" style={inp()} value={o.dueDate} onChange={e=>set("dueDate",e.target.value)}/></div>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:o.urgent?C.red:C.muted,marginBottom:14,cursor:"pointer"}}>
        <input type="checkbox" checked={!!o.urgent} onChange={e=>set("urgent",e.target.checked)}/> Haster — planlæg før alt andet
      </label>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Rute — sæt kryds ved de afdelinger jobbet skal igennem</div>
        {suggested.length>0&&<button style={btn("outline",false,true)} onClick={()=>set("steps",suggested)}><i className="ti ti-history"/> Brug tidligere rute ({suggested.length})</button>}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
        {deptOrder.map((d,i)=>{const on=o.steps.some(s=>s.department===d);return(
          <span key={d} style={{display:"inline-flex",alignItems:"center",gap:6}}>
            {i>0&&<i className="ti ti-arrow-right" style={{color:C.muted,fontSize:15}}/>}
            <button type="button" onClick={()=>toggleDept(d)} style={{...tag(on),fontSize:14,padding:"6px 12px"}}>{on&&<i className="ti ti-check"/>} {d}</button>
          </span>
        );})}
      </div>
      {o.steps.map((st,i)=>{
        const {est,durationSec,setupSec,runSec}=stepDuration(st,qty,hist);
        const deptMachines=activeMachines.filter(m=>!st.department||m.department===st.department);
        return(
          <div key={st.id||i} style={{...card(),padding:"10px 12px"}}>
            <div style={{display:"grid",gridTemplateColumns:"24px 1fr 1fr 90px 100px auto",gap:8,alignItems:"end"}}>
              <div style={{fontSize:18,color:C.amber,fontWeight:700,paddingBottom:10}}>{i+1}</div>
              <div><label style={label}>Afdeling</label>
                <select style={sel()} value={st.department} onChange={e=>setStep(i,{department:e.target.value,machine:""})}>
                  <option value="">—</option>{allDepts.map(d=><option key={d}>{d}</option>)}
                </select></div>
              <div><label style={label}>Maskine</label>
                <select style={sel()} value={st.machine} onChange={e=>setStep(i,{machine:e.target.value})}>
                  <option value="">{st.department?`Alle i ${st.department}`:"—"}</option>{deptMachines.map(m=><option key={m.id}>{m.name}</option>)}
                </select></div>
              <div><label style={label}>Opstilling min</label><input type="number" min="0" style={inp()} value={st.setupMin} placeholder={est?String(Math.round(est.setupSec/60)):"?"} onChange={e=>setStep(i,{setupMin:e.target.value})}/></div>
              <div><label style={label}>Produktion min / stk</label><input type="number" min="0" step="0.1" style={inp()} value={st.runMinPerPc} placeholder={est?.runPerPcSec!=null?(est.runPerPcSec/60).toFixed(1):"?"} onChange={e=>setStep(i,{runMinPerPc:e.target.value})}/></div>
              <div style={{display:"flex",gap:2,paddingBottom:4}}>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>moveStep(i,-1)}><i className="ti ti-chevron-up"/></button>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>moveStep(i,1)}><i className="ti ti-chevron-down"/></button>
                <button style={{...btn("outline",false,true),padding:"4px 6px"}} onClick={()=>set("steps",o.steps.filter((_,si)=>si!==i))}><i className="ti ti-x"/></button>
              </div>
            </div>
            <div style={{fontSize:13,color:C.muted,marginTop:6,paddingLeft:32}}>
              {est?<>Historik: {Math.round(est.setupSec/60)} min opstilling{est.runPerPcSec!=null?` + ${(est.runPerPcSec/60).toFixed(1)} min/stk`:" (ingen stk.-tal)"} · median af {est.n} {est.n!==1?"kørsler":"kørsel"} {est.basis==="machine"?`på ${st.machine}`:`i ${st.department}`}</>:"Ingen historik for dette trin — indtast minutterne"}
              {durationSec!=null&&<span style={{color:C.text}}> · planlagt {fmtHM(durationSec)} for {qty} stk (<span style={{color:C.amber}}>{fmtHM(setupSec)} opstilling</span> + <span style={{color:C.green}}>{fmtHM(runSec)} produktion</span>)</span>}
            </div>
            {/* Fixed start = pin this step to a machine and time (same as dragging it in the week view) */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,paddingLeft:32,flexWrap:"wrap"}}>
              <span style={{fontSize:13,color:st.pin?C.text:C.muted}}>📌 Fast start</span>
              {st.pin?<>
                <input type="datetime-local" style={{...inp(),width:"auto",fontSize:15,padding:"4px 8px"}} value={toLocalInput(st.pin.start)}
                  onChange={e=>{const t=fromLocalInput(e.target.value);if(t)setStep(i,{pin:{...st.pin,start:t}});}}/>
                <span style={{fontSize:13,color:C.muted}}>på {st.pin.machine}</span>
                <button style={{...btn("outline",false,true),padding:"3px 8px"}} onClick={()=>setStep(i,{pin:null})}>Lås op</button>
              </>:st.machine
                ?<button style={{...btn("outline",false,true),padding:"3px 8px"}} onClick={()=>setStep(i,{pin:{machine:st.machine,start:Math.ceil(Date.now()/900000)*900000}})}>Sæt starttid</button>
                :<span style={{fontSize:13,color:C.muted}}>vælg en maskine først — eller træk blokken i ugevisningen</span>}
            </div>
          </div>
        );
      })}
      <button style={{...btn("outline",false,true),marginBottom:14}} onClick={()=>set("steps",[...o.steps,{id:Date.now(),department:"",machine:"",setupMin:"",runMinPerPc:""}])}><i className="ti ti-plus"/> Tilføj trin</button>
      <div><label style={label}>Noter</label><input style={inp()} value={o.notes||""} onChange={e=>set("notes",e.target.value)}/></div>
      {err&&<div style={{...errMsg,marginTop:10}}>{err}</div>}
      <button style={{...btn("success",true),marginTop:14}} onClick={save}><i className="ti ti-check"/> {order.isNew?"Tilføj til plan":"Gem"}</button>
    </div>
  );
}

// Paste many orders at once (from Excel or the ERP), check them, add them all
export function PlanImport({jobs,machines,allDepts,deptOrder,onAdd,onCancel}){
  const [text,setText]=useState("");
  const rows=useMemo(()=>parseImport(text,allDepts).map(r=>{
    if(r.error) return r;
    const hist=partHistory(jobs,machines,r.partNumber);
    const steps=r.depts.length
      ?sortSteps(r.depts.map((d,k)=>({id:Date.now()+k,department:d,machine:"",setupMin:"",runMinPerPc:""})),deptOrder)
      :sortSteps(suggestRoute(hist),deptOrder);
    if(!steps.length) return {...r,error:"Nyt emne og ingen afdelinger angivet — tilføj dem i kolonne 5"};
    const missing=steps.filter(s=>stepDuration(s,r.quantity,hist).durationSec==null).map(s=>s.department||s.machine);
    return {...r,steps,histN:hist.length,missing,routeFrom:r.depts.length?"list":"history"};
  }),[text,jobs,machines,allDepts,deptOrder]);
  const good=rows.filter(r=>!r.error);
  const add=()=>{
    const now=Date.now();
    onAdd(good.map((r,k)=>({id:now+k,customer:r.customer,partNumber:r.partNumber,quantity:r.quantity,dueDate:r.dueDate||"",
      urgent:false,notes:"Importeret",steps:r.steps,createdAt:now})));
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <button style={{...btn("outline",false,true),marginBottom:12}} onClick={onCancel}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}><i className="ti ti-file-import"/> Importer ordrer</div>
      <div style={{fontSize:14,color:C.muted,marginBottom:10,lineHeight:1.6}}>
        Indsæt én ordre pr. linje — direkte fra Excel virker. Kolonner: <b style={{color:C.text}}>Kunde · Tegningsnr. · Antal · Leveringsdato · Afdelinger</b> (afdelinger er valgfrie).<br/>
        Uden afdelinger hentes ruten fra emnets historik. Afdelinger kan forkortes og stå i vilkårlig rækkefølge: <code>Turning+Milling</code>, <code>T, F, M</code> — de sættes altid i afdelingernes rækkefølge ({deptOrder.join(" → ")||"sættes under Indstillinger"}).
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={8} spellCheck={false}
        placeholder={"Acme\tTEST-100\t200\t31-10-2026\nBeta Co\t5521-3\t50\t2026-11-05\tTurning+Milling"}
        style={{...inp(),fontFamily:"'Share Tech Mono',monospace",fontSize:15,resize:"vertical"}}/>
      {rows.length>0&&(
        <div style={{overflowX:"auto",marginTop:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead><tr>{["","Kunde","Tegningsnr.","Antal","Leveres","Rute","Tider"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=>r.error
              ?<tr key={i}><td style={{...td,color:C.red}}><i className="ti ti-x"/></td><td colSpan={6} style={{...td,color:C.red}}>{r.error} <span style={{color:C.muted}}>— “{r.line}”</span></td></tr>
              :<tr key={i}>
                <td style={{...td,color:r.missing.length?C.amber:C.green}}><i className={`ti ti-${r.missing.length?"alert-triangle":"check"}`}/></td>
                <td style={td}>{r.customer}</td><td style={td}>{r.partNumber}</td><td style={td}>{r.quantity}</td>
                <td style={td}>{r.dueDate||"—"}</td>
                <td style={td}>{r.steps.map(s=>s.department||s.machine).join(" → ")} <span style={{color:C.muted,fontSize:12}}>({r.routeFrom==="history"?"fra historik":"fra listen"})</span></td>
                <td style={{...td,color:r.missing.length?C.amber:C.muted,fontSize:13}}>{r.missing.length?`Ingen historik for ${r.missing.join(", ")} — indtast minutter efter import`:`fra ${r.histN} tidligere ${r.histN!==1?"kørsler":"kørsel"}`}</td>
              </tr>)}</tbody>
          </table>
        </div>
      )}
      <div style={{display:"flex",gap:8,alignItems:"center",marginTop:14}}>
        <button style={btn("success",false)} disabled={!good.length} onClick={add}><i className="ti ti-check"/> Tilføj {good.length} ordre{good.length!==1?"r":""} til planen</button>
        {rows.length>good.length&&<span style={{fontSize:14,color:C.red}}>{rows.length-good.length} linje{rows.length-good.length!==1?"r":""} med fejl springes over</span>}
      </div>
    </div>
  );
}
