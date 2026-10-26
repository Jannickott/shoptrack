import { useState } from "react";
import { notify } from "../components/Feedback";
import { C, inp, btn } from "../lib/theme";
import { intervalLabel, machineMaint, MAINT_STATE } from "./maintUtil";

const when=ms=>{
  const d=new Date(ms),now=new Date();
  const t=d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
  if(d.toDateString()===now.toDateString()) return `i dag ${t}`;
  return d.toLocaleDateString("da-DK",{day:"numeric",month:"short",year:d.getFullYear()!==now.getFullYear()?"numeric":undefined})+` ${t}`;
};

// Summary for a machine card: "2 skal gøres" / "Alt udført"
export function maintSummary(items){
  const due=items.filter(x=>x.st.state==="due").length;
  return {due,soon:items.filter(x=>x.st.state==="soon").length,total:items.length};
}

// The checklist for one machine: tick OK, or report a problem (note required)
export function MaintChecklist({machine,tasks,log,jobs,user,setMaintLog,saveNow,onReportFault}){
  const [problemFor,setProblemFor]=useState(null);
  const [note,setNote]=useState("");
  const [offerFault,setOfferFault]=useState(null); // after a problem: report the machine too?
  const items=machineMaint(machine,tasks,log,jobs);
  const record=(t,ok,text)=>{
    const now=Date.now();
    setMaintLog(prev=>[...prev,{id:now+Math.floor(Math.random()*1000),taskId:t.id,machine,title:t.title,doneAt:now,by:user.name,ok,note:text||"",updatedAt:now}]);
    saveNow&&saveNow();
    notify(ok?`Vedligehold udført: ${t.title}`:`Problem registreret: ${t.title}`,ok?"ok":"warn");
  };
  if(!items.length) return <div style={{fontSize:14,color:C.muted,padding:"6px 0"}}>Ingen vedligeholdspunkter for {machine} endnu.</div>;
  return(
    <div>
      {items.map(({t,st})=>{
        const s=MAINT_STATE[st.state];
        const statusText=st.state==="due"
          ?(t.unit==="hours"?st.label:st.lateDays>0?`Forsinket ${st.lateDays} dag${st.lateDays>1?"e":""}`:"Skal gøres i dag")
          :t.unit==="hours"?st.label:st.next?`Næste gang ${new Date(st.next).toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"})}`:"";
        return(
          <div key={t.id} style={{borderTop:`1px solid ${C.border}`,padding:"10px 0"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <i className={`ti ti-${s.icon}`} style={{fontSize:24,color:s.color,flexShrink:0,marginTop:2}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700}}>{t.title}</div>
                {t.description&&<div style={{fontSize:14,color:C.text,marginTop:2,whiteSpace:"pre-wrap"}}>{t.description}</div>}
                <div style={{fontSize:13,color:C.muted,marginTop:3}}>
                  {intervalLabel(t)} · <span style={{color:s.color}}>{statusText}</span>
                  {st.last&&<> · sidst {when(st.last.doneAt)} af {st.last.by}{st.last.ok===false&&<span style={{color:C.red}}> (problem)</span>}</>}
                </div>
              </div>
              {problemFor!==t.id&&(
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button style={{...btn(st.state==="ok"?"outline":"success",false,true),minWidth:84}} onClick={()=>record(t,true,"")}><i className="ti ti-check"/> OK</button>
                  <button style={{...btn("outline",false,true),color:C.red,borderColor:"rgba(231,76,60,.4)"}} onClick={()=>{setProblemFor(t.id);setNote("");}}><i className="ti ti-alert-triangle"/> Problem</button>
                </div>
              )}
            </div>
            {problemFor===t.id&&(
              <div style={{marginTop:8,marginLeft:34}}>
                <input autoFocus style={inp()} value={note} onChange={e=>setNote(e.target.value)} placeholder="Hvad er problemet? (skal udfyldes)"/>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button style={btn("outline",false,true)} onClick={()=>setProblemFor(null)}>Annuller</button>
                  <button style={{...btn("danger",true,true),flex:1}} disabled={!note.trim()} onClick={()=>{record(t,false,note.trim());setProblemFor(null);setOfferFault({title:t.title,note:note.trim()});}}><i className="ti ti-device-floppy"/> Gem problem</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {offerFault&&onReportFault&&(
        <div style={{background:"rgba(231,76,60,.08)",border:`1px solid rgba(231,76,60,.4)`,borderRadius:8,padding:"10px 12px",marginTop:6,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{flex:1,fontSize:15,color:C.text}}>Skal {machine} også meldes som fejl, så admin får besked?</span>
          <button style={btn("danger",false,true)} onClick={()=>{onReportFault(machine,`Vedligehold — ${offerFault.title}: ${offerFault.note}`);setOfferFault(null);}}>Meld fejl</button>
          <button style={btn("outline",false,true)} onClick={()=>setOfferFault(null)}>Nej</button>
        </div>
      )}
    </div>
  );
}
