import { useState } from "react";
import { notify } from "../components/Feedback";
import { uploadPhoto } from "../lib/api";
import { PhotoChoice } from "../components/PhotoChoice";
import { C, card, inp, btn, badge, statBox, label, errMsg, meta } from "../lib/theme";
import { fmtHM, liveTime } from "../lib/util";

// ═══════════════════════════════════════════════════════
// COMPLETE MODAL
// ═══════════════════════════════════════════════════════
export function CompleteModal({jobId,jobs,setJobs,onClose,saveNow,stateRef}){
  const j=jobs.find(x=>x.id===jobId);
  const [pieces,setPieces]=useState("");
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const [deburring,setDeburring]=useState(false);
  if(!j) return null;

  // Which phase are we completing?
  const isSide1Completion=j.twoSided&&j.status==="run";
  const isSide2Completion=j.twoSided&&j.status==="side2_run";
  const headerColor=isSide2Completion?C.blue:C.amber;
  const ltModal=liveTime(j);
  const sideLabel=isSide1Completion?"Side 1 færdig — start side 2":isSide2Completion?"Side 2 — afslut job":"Afslut job";

  const submit=async()=>{
    const e={};
    if(!pieces||parseInt(pieces)<1) e.pieces="Indtast antal producerede stk.";
    if(Object.keys(e).length){setErrs(e);return;}
    setSaving(true);
    const now=Date.now();

    if(isSide1Completion){
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"side2_setup",
        pieces:parseInt(pieces),
        setupSec2:0, runSec2:0,
        runSec:ltModal.run,
        phaseStartedAt:now,
        side1CompletedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      notify("Side 1 færdig — opstilling af side 2 er startet");
      setSaving(false);
      onClose();
    } else if(deburring){
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"deburring",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), runSec2:ltModal.run2}
          : {pieces:parseInt(pieces),  runSec:ltModal.run}),
        deburSec:0,
        phaseStartedAt:now,
        lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      notify("Afgratning startet");
      setSaving(false);
      onClose();
    } else {
      const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
        ...x,
        status:"done",
        ...(isSide2Completion
          ? {pieces2:parseInt(pieces), runSec2:ltModal.run2}
          : {pieces:parseInt(pieces),  runSec:ltModal.run}),
        phaseStartedAt:null,
        completedAt:now, lastModifiedAt:now,
      }:x);
      if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
      setJobs(updatedJobs);
      saveNow&&saveNow();
      notify("Job afsluttet");
      setSaving(false);
      onClose();
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,color:headerColor,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-check-circle"/> {sideLabel}</div>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>

        {/* Job info */}
        <div style={{...card(headerColor),background:"#151e2b",marginBottom:14}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
          {j.twoSided&&(
            <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> To sider</span>
              {isSide1Completion&&<span style={{...badge("setup"),fontSize:12}}>Afslutter side 1</span>}
              {isSide2Completion&&<span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,fontSize:12}}>Afslutter side 2</span>}
            </div>
          )}
        </div>

        {/* Side 1 recap when completing side 2 */}
        {isSide2Completion&&(
          <div style={{background:"rgba(39,174,96,.08)",border:`1px solid rgba(39,174,96,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:14,display:"flex",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:C.green,letterSpacing:1}}><i className="ti ti-check"/> Side 1 færdig</span>
            <span style={{fontSize:13,color:C.amber}}><i className="ti ti-settings"/> {fmtHM(j.setupSec)}</span>
            <span style={{fontSize:13,color:C.green}}><i className="ti ti-player-play"/> {fmtHM(j.runSec)}</span>
            {j.pieces>0&&<span style={{fontSize:13,color:C.muted}}>{j.pieces} stk</span>}
          </div>
        )}

        {/* Timer stats for current side */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={statBox}>
            <div style={{fontSize:22,color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.setup2:ltModal.setup)}</div>
            <div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 opstilling":"Opstilling"}</div>
          </div>
          <div style={statBox}>
            <div style={{fontSize:22,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{fmtHM(isSide2Completion?ltModal.run2:ltModal.run)}</div>
            <div style={{fontSize:12,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginTop:4}}>{isSide2Completion?"S2 produktion":"Produktion"}</div>
          </div>
        </div>

        {/* Pieces */}
        <div style={{marginBottom:14}}>
          <label style={label}>{isSide2Completion?"Side 2 stk.":"Producerede stk."} <span style={{color:C.red}}>*</span></label>
          <input type="number" min="1" style={{...inp(errs.pieces),fontSize:24,textAlign:"center",color:headerColor}} value={pieces} onChange={e=>setPieces(e.target.value)} placeholder="0"/>
          {errs.pieces&&<div style={errMsg}><i className="ti ti-alert-triangle"/> {errs.pieces}</div>}
        </div>

        {isSide1Completion&&(
          <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:14,color:C.blue}}>
            <i className="ti ti-info-circle"/> Når du gemmer, starter opstillingstiden for side 2 automatisk.
          </div>
        )}

        {/* Manual deburring checkbox — only on final completion */}
        {!isSide1Completion&&(
          <div
            onClick={()=>setDeburring(d=>!d)}
            style={{...card(),marginBottom:12,cursor:"pointer",border:`1px solid ${deburring?"rgba(230,126,34,.5)":C.border}`,background:deburring?"rgba(230,126,34,.06)":"transparent"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <i className={`ti ti-${deburring?"checkbox":"square"}`} style={{fontSize:24,color:deburring?C.deburr:C.muted,flexShrink:0}}/>
              <div>
                <div style={{fontSize:16,color:deburring?C.deburr:C.text,fontWeight:700,letterSpacing:1}}>Manuel afgratning</div>
                <div style={{fontSize:13,color:C.muted,marginTop:2}}>Starter et tidur for afgratning — tryk "Afgratning færdig" når du er færdig</div>
              </div>
            </div>
          </div>
        )}

        <button
          style={{...btn(saving?"outline":"success",true),
            background:saving?undefined:deburring?C.deburr:isSide2Completion?C.blue:undefined,
            borderColor:saving?undefined:deburring?C.deburr:isSide2Completion?C.blue:undefined}}
          onClick={submit} disabled={saving}>
          {saving
            ?<><i className="ti ti-loader-2"/> Gemmer…</>
            :isSide1Completion
              ?<><i className="ti ti-arrow-right"/> Gem side 1 &amp; start side 2</>
              :deburring
                ?<><i className="ti ti-tool"/> Gem &amp; start afgratning</>
                :<><i className="ti ti-check"/> Gem &amp; afslut job</>}
        </button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose} disabled={saving}>Annuller</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// START RUN MODAL — quality photo required before run
// ═══════════════════════════════════════════════════════
export function StartRunModal({jobId,jobs,setJobs,onClose,saveNow,stateRef}){
  const j=jobs.find(x=>x.id===jobId);
  const [photoData,setPhotoData]=useState(null);
  const [saving,setSaving]=useState(false);
  if(!j) return null;
  const isSide2=j.status==="side2_setup";
  const accentColor=isSide2?C.blue:C.amber;

  const handlePhoto=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhotoData(ev.target.result);r.readAsDataURL(f);};

  const confirm=async()=>{
    if(!photoData||saving) return;
    setSaving(true);
    const now=Date.now();
    const date=new Date(now);
    const dateStr=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const safeName=s=>s.replace(/[^a-z0-9]/gi,"_");
    const runDate=new Date(j.createdAt||now);
    const folder=`${runDate.getFullYear()}/${String(runDate.getMonth()+1).padStart(2,"0")}`;
    const filename=isSide2
      ?`${folder}/quality_${safeName(j.customer||"unknown")}_${safeName(j.job)}_${dateStr}_side2.jpg`
      :`${folder}/quality_${safeName(j.customer||"unknown")}_${safeName(j.job)}_${dateStr}.jpg`;
    const photoUrl=await uploadPhoto(photoData,filename);
    const lt=liveTime(j);
    const newStatus=isSide2?"side2_run":"run";
    // runStartedAt: when Start Run was pressed — lets admin correct it later
    const timePatch=isSide2?{setupSec2:lt.setup2,run2StartedAt:now}:{setupSec:lt.setup,runStartedAt:now};
    const photoPatch=isSide2?{photoData2:photoUrl}:{photoData:photoUrl};
    const updatedJobs=(stateRef?stateRef.current.jobs:jobs).map(x=>x.id===jobId?{
      ...x,...timePatch,...photoPatch,status:newStatus,phaseStartedAt:now,lastModifiedAt:now,
    }:x);
    if(stateRef) stateRef.current={...stateRef.current,jobs:updatedJobs};
    setJobs(updatedJobs);
    const a=document.createElement("a");a.href=photoData;a.download=filename;a.click();
    saveNow&&saveNow();
    notify(isSide2?"Produktion side 2 startet":"Produktion startet");
    setSaving(false);
    onClose();
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:14,width:"100%",maxWidth:460,padding:20,border:`1px solid rgba(255,255,255,.1)`,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:14,color:accentColor,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-camera"/> Kvalitetsfoto — {isSide2?"Start produktion side 2":"Start produktion"}</div>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}} onClick={onClose}><i className="ti ti-x"/></button>
        </div>
        <div style={{...card(accentColor),background:"#151e2b",marginBottom:16}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700}}>{j.job}</div>
          <div style={meta}><span><i className="ti ti-robot"/> {j.machine}</span><span><i className="ti ti-user"/> {j.operatorName}</span></div>
          {isSide2&&<div style={{marginTop:6}}><span style={{...badge("run"),background:"rgba(59,130,246,.15)",color:C.blue,borderColor:"rgba(59,130,246,.3)"}}><i className="ti ti-layers-intersect"/> Side 2 opstilling</span></div>}
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,color:accentColor,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-camera"/> Kvalitetsfoto <span style={{color:C.red}}>*</span>
          </div>
          {photoData?(
            <div style={{position:"relative"}}>
              <img src={photoData} style={{width:"100%",borderRadius:10,maxHeight:260,objectFit:"cover",border:`1px solid ${C.border}`}} alt="quality"/>
              <button onClick={()=>setPhotoData(null)} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.65)",border:"none",borderRadius:20,color:"#fff",cursor:"pointer",padding:"5px 10px",fontSize:14}}>
                <i className="ti ti-refresh"/> Tag igen
              </button>
            </div>
          ):(
            <>
              <div style={{fontSize:14,color:C.muted,marginBottom:8}}>Kvalitetsfoto — skal tages før produktionen starter</div>
              <PhotoChoice onChange={handlePhoto} color={accentColor}/>
            </>
          )}
        </div>
        <button
          style={{...btn("primary",true),opacity:!photoData||saving?0.45:1,...(isSide2?{background:C.blue,borderColor:C.blue}:{})}}
          disabled={!photoData||saving}
          onClick={confirm}>
          {saving?<><i className="ti ti-loader-2"/> Uploader…</>:<><i className="ti ti-player-play"/> {isSide2?"Start produktion side 2":"Start produktion"}</>}
        </button>
        <button style={{...btn("outline",true),marginTop:8}} onClick={onClose} disabled={saving}>Annuller</button>
      </div>
    </div>
  );
}
