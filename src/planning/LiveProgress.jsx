import { useState, useMemo } from "react";
import { C, card, btn } from "../lib/theme";
import { fmtHM } from "../lib/util";
import { jobProgress, normPart } from "./planEngine";
import { CountReport } from "../components/CountReport";

// ═══════════════════════════════════════════════════════
// PLANLÆGNING → "I gang": how far each running job is, when it will be done,
// and whether that is in time for the order. Counts come from the operators'
// "Meld antal" — or are typed in here, e.g. at the 9 o'clock meeting.
// ═══════════════════════════════════════════════════════
const fmtWhen=ms=>{
  const d=new Date(ms),today=new Date();
  const sameDay=d.toDateString()===today.toDateString();
  const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
  const day=sameDay?"i dag":d.toDateString()===tomorrow.toDateString()?"i morgen":d.toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"});
  return `${day} kl. ${d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}`;
};
const PHASE={setup:["Opstilling",C.amber],side2_setup:["Opstilling side 2",C.amber],run:["Produktion",C.green],side2_run:["Produktion side 2",C.green],deburring:["Afgratning",C.deburr]};

export function LiveProgress({jobs,machines,workHours,planOrders,setJobs,saveNow,user,machineIssues}){
  const [countFor,setCountFor]=useState(null);
  const minute=Math.floor(Date.now()/60000); // estimates move once a minute
  const todayStart=new Date().setHours(0,0,0,0);
  const openOrders=(planOrders||[]).filter(o=>!o.deleted&&!o.done);
  const running=useMemo(()=>{
    const now=minute*60000;
    return jobs.filter(j=>j.status!=="done").map(j=>{
      const pg=jobProgress(j,{jobs,machines,workHours,now});
      const order=openOrders.find(o=>normPart(o.partNumber)===normPart(j.job));
      const dueEnd=order?.dueDate?new Date(order.dueDate+"T23:59:59").getTime():null;
      return {j,pg,order,late:!!(pg.finishAt&&dueEnd&&pg.finishAt>dueEnd),dueEnd};
    }).sort((a,b)=>(a.pg.paused-b.pg.paused)||((a.pg.finishAt??9e15)-(b.pg.finishAt??9e15)));
  },[jobs,machines,workHours,planOrders,minute]);
  const finishedToday=jobs.filter(j=>j.status==="done"&&(j.completedAt||0)>=todayStart).sort((a,b)=>b.completedAt-a.completedAt);
  const notCounted=running.filter(x=>!x.pg.countedToday&&(x.j.status==="run"||x.j.status==="side2_run")).length;

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Kører nu · {running.length} job</div>
        {notCounted>0&&<span style={{fontSize:14,color:C.amber}}><i className="ti ti-alert-circle"/> {notCounted} i produktion uden antal meldt i dag</span>}
      </div>
      {!running.length&&<div style={{...card(),color:C.muted,textAlign:"center",fontSize:15}}>Ingen job kører lige nu.</div>}
      {running.map(({j,pg,order,late,dueEnd})=>{
        const [phase,phaseColor]=machineIssues?.[j.machine]?["Maskinfejl",C.red]:pg.paused?["På pause",C.red]:PHASE[j.status]||[j.status,C.muted];
        const pct=pg.target&&pg.made!=null?Math.min(100,pg.made/pg.target*100):null;
        const soon=pg.finishAt&&!pg.paused&&pg.finishAt-Date.now()<3600000;
        return(
          <div key={j.id} style={{...card(late?C.red:soon?C.amber:phaseColor)}}>
            <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:15,color:C.amber,fontWeight:700,letterSpacing:1}}>{j.machine}</span>
              <span style={{fontSize:17,color:C.text,fontWeight:700}}>{j.job}</span>
              {j.customer&&<span style={{fontSize:15,color:C.muted}}>· {j.customer}</span>}
              <span style={{fontSize:14,color:C.muted}}>· {j.operatorName}</span>
              <span style={{flex:1}}/>
              <span style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:phaseColor,background:phaseColor+"22",padding:"3px 8px",borderRadius:20,fontWeight:700}}>{phase}</span>
              {soon&&<span style={{fontSize:12,letterSpacing:1,textTransform:"uppercase",color:"#1a1a1a",background:C.amber,padding:"3px 8px",borderRadius:20,fontWeight:700}}>Snart færdig</span>}
            </div>

            {/* Pieces */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
              <div style={{flex:1,height:14,background:C.raised,borderRadius:7,overflow:"hidden"}}>
                {pct!=null&&<div style={{width:`${pct}%`,height:"100%",background:late?C.red:C.green,transition:"width .5s"}}/>}
              </div>
              <span style={{fontSize:16,fontFamily:"'Share Tech Mono',monospace",color:C.text,whiteSpace:"nowrap",minWidth:110,textAlign:"right"}}>
                {pg.made!=null?`${pg.estimated?"≈ ":""}${pg.made}`:"?"} / {pg.target??"?"} stk
              </span>
            </div>

            {/* When */}
            <div style={{fontSize:15,color:C.text,marginTop:8,lineHeight:1.5}}>
              {pg.finishAt
                ?<><i className="ti ti-flag-check" style={{color:late?C.red:C.green}}/> Færdig ca. <b>{fmtWhen(pg.finishAt)}</b> <span style={{color:C.muted}}>· {fmtHM(pg.remainingSec)} produktion tilbage{pg.paused?" · står stille mens jobbet er på pause":""}</span></>
                :<span style={{color:C.muted}}><i className="ti ti-help-circle"/> {!pg.target?"Kan ikke regne sluttid ud — antal i ordren mangler":"Kan ikke regne sluttid ud endnu — meld antal når der er kørt lidt"}</span>}
            </div>
            {order&&dueEnd&&<div style={{fontSize:14,marginTop:2,color:late?C.red:C.green}}>
              <i className={`ti ti-${late?"alarm":"calendar-check"}`}/> Ordren skal leveres {new Date(dueEnd).toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"})} — {late?"bliver for sent":pg.finishAt?"når det":"—"}
            </div>}
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>
              {pg.pcsPerHour?`${pg.pcsPerHour>=10?Math.round(pg.pcsPerHour):pg.pcsPerHour.toFixed(1)} stk/t ${pg.basis==="job"?"(fra meldt antal)":"(fra tidligere kørsler)"}`:"Ingen tid pr. stk endnu"}
              {" · "}
              {pg.last?<span style={{color:pg.countedToday?C.muted:C.amber}}>meldt {pg.last.pieces} stk {fmtWhen(pg.last.at)}{pg.last.by?` (${pg.last.by})`:""}</span>:<span style={{color:C.amber}}>intet antal meldt</span>}
            </div>

            {countFor===j.id
              ?<CountReport j={j} setJobs={setJobs} by={user?.name} saveNow={saveNow} onClose={()=>setCountFor(null)}/>
              :<button style={{...btn("outline",false,true),marginTop:8}} onClick={()=>setCountFor(j.id)}><i className="ti ti-123"/> Meld antal</button>}
          </div>
        );
      })}

      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"18px 0 8px"}}>Blev færdige i dag · {finishedToday.length}</div>
      {!finishedToday.length&&<div style={{fontSize:14,color:C.muted}}>Ingen endnu.</div>}
      {finishedToday.map(j=>{
        const pcs=Math.max(j.pieces||0,j.pieces2||0);
        const short=j.targetQty&&pcs<j.targetQty?j.targetQty-pcs:0;
        return(
          <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
            <i className="ti ti-circle-check" style={{color:C.green,fontSize:20}}/>
            <span style={{fontSize:15,color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>{new Date(j.completedAt).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})}</span>
            <span style={{fontSize:15,color:C.amber,fontWeight:700}}>{j.machine}</span>
            <span style={{fontSize:15,color:C.text,fontWeight:700}}>{j.job}</span>
            <span style={{fontSize:14,color:C.muted,flex:1}}>{j.customer} · {j.operatorName}</span>
            <span style={{fontSize:15,color:short?C.amber:C.text,fontFamily:"'Share Tech Mono',monospace"}}>{pcs}{j.targetQty?` / ${j.targetQty}`:""} stk</span>
            {short>0&&<span style={{fontSize:13,color:C.amber}}>{short} mangler</span>}
          </div>
        );
      })}
      <div style={{fontSize:12,color:C.muted,marginTop:12,lineHeight:1.6}}>
        Sluttiden regnes ud fra antal i ordren og tempoet: det meldte antal pr. produktionstime, ellers tidligere kørsler af samme emne. Kun arbejdstid tæller — ikke natkørsel.
        Matcher et job en ordre under Ordrer (samme tegningsnr.), sammenlignes med ordrens leveringsdato.
      </div>
    </div>
  );
}
