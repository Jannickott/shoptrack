import { useState } from "react";
import { C, card, badge, tag, meta } from "../lib/theme";
import { fmtHM, fmtDetail, fmtDate } from "../lib/util";

// ═══════════════════════════════════════════════════════
// HISTORY (operator)
// ═══════════════════════════════════════════════════════
export function HistoryTab({user,jobs}){
  const [filt,setFilt]=useState("all");
  const mine=jobs.filter(j=>j.status==="done"&&j.operatorId===user.id);
  const machineNames=[...new Set(mine.map(j=>j.machine))].sort();
  const done=mine.filter(j=>filt==="all"||j.machine===filt);
  return(
    <div style={{padding:"14px 16px"}}>
      {machineNames.length>1&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","Alle"],...machineNames.map(m=>[m,m])].map(([f,l])=>(
          <button key={f} style={tag(filt===f)} onClick={()=>setFilt(f)}>{l}</button>
        ))}
      </div>}
      {!done.length?<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}><i className="ti ti-list" style={{fontSize:30,display:"block",marginBottom:10,opacity:0.3}}/> Ingen afsluttede job.</div>
        :done.map(j=>(
        <div key={j.id} style={{...card(),display:"flex",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            {j.photoData?<img src={j.photoData} title={j.twoSided?"Side 1":undefined} style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${j.twoSided?C.blue:C.border}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-camera-off" style={{color:C.muted,fontSize:20}}/></div>}
            {j.twoSided&&(j.photoData2?<img src={j.photoData2} title="Side 2" style={{width:52,height:52,borderRadius:8,objectFit:"cover",border:`1px solid ${C.blue}`}}/>
              :<div style={{width:52,height:52,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${C.red}`}}><i className="ti ti-camera-off" style={{color:C.red,fontSize:18}}/></div>)}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              {j.customer&&<div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.customer}</div>}
              <div style={{fontSize:14,color:C.muted}}><i className="ti ti-hash"/> {j.job}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                {j.quickEntry&&<span style={{...badge("admin"),fontSize:12}}>Hurtig</span>}
                {j.twoSided&&<span style={{...badge("admin"),background:"rgba(59,130,246,.1)",color:C.blue,fontSize:12}}><i className="ti ti-layers-intersect"/> 2 sider</span>}
              </div>
            </div>
            <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span></div>
            {j.twoSided?(
              <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8}}>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,color:C.muted,fontWeight:700,letterSpacing:1}}>S1</span>
                  <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                  <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                  {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
                  {j.pieces>0&&<span style={{fontSize:13,color:C.amber,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,color:C.blue,fontWeight:700,letterSpacing:1}}>S2</span>
                  <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec2||0)}</span>
                  <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec2||0)}</span>
                  {j.pieces2>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces2} stk</span>}
                  {j.pieces2>0&&<span style={{fontSize:13,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round(((j.setupSec2||0)+(j.runSec2||0))/j.pieces2))}/stk</span>}
                </div>
              </div>
            ):(
              <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
                <span style={{fontSize:14,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
                <span style={{fontSize:14,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
                {j.pieces>0&&<span style={{fontSize:14,color:C.muted}}>{j.pieces} stk</span>}
                {j.pieces>0&&<span style={{fontSize:14,color:C.blue,fontWeight:700}}>{fmtDetail(Math.round((j.setupSec+j.runSec)/j.pieces))}/stk</span>}
              </div>
            )}
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{fmtDate(j.completedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
