import { useState } from "react";
import { notify } from "../components/Feedback";
import { C, card, inp, sel, btn, avatar, label, errMsg } from "../lib/theme";
import { fmtDate, initials } from "../lib/util";

// ═══════════════════════════════════════════════════════
// NEW JOB
// ═══════════════════════════════════════════════════════
export function NewJobTab({user,machines,setJobs,jobs,setupSheets,setTab,setFocusSheetId,setNewSheetFor}){
  const [customer,setCustomer]=useState(""); const [job,setJob]=useState(""); const [machine,setMachine]=useState(""); const [op,setOp]=useState(""); const [errs,setErrs]=useState({});
  const [twoSided,setTwoSided]=useState(false);
  const [showSuggestions,setShowSuggestions]=useState(true);
  const [sheetPickerOpen,setSheetPickerOpen]=useState(false);

  // Past completed jobs matching the typed part number (min 2 chars)
  const userDepts=user.departments||[];
  const suggestions=job.trim().length>=2
    ?(()=>{
      const q=job.trim().toLowerCase();
      const sorted=(jobs||[])
        .filter(j=>{
          if(j.status!=="done") return false;
          if(!j.job.toLowerCase().includes(q)) return false;
          // If machine already chosen, only show runs on that machine
          if(machine&&j.machine!==machine) return false;
          // Dept filter: only jobs on machines in the operator's departments
          if(userDepts.length>0){
            const mach=(machines||[]).find(m=>m.name===j.machine);
            const md=mach?.departments||[];
            if(md.length>0&&!md.some(d=>userDepts.includes(d))) return false;
          }
          return true;
        })
        .sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
      // If machine selected: just the most recent run on that machine
      return machine?sorted.slice(0,1):sorted.slice(0,5);
    })()
    :[];

  const applyJob=prev=>{
    setCustomer(prev.customer||"");
    setMachine(prev.machine||"");
    setOp(prev.op||"");
    setTwoSided(!!prev.twoSided);
    setJob(prev.job||"");
    setErrs({});
    setShowSuggestions(false);
  };

  const matchingSheets=job.trim()&&machine?(setupSheets||[]).filter(s=>s.partNumber.trim().toLowerCase()===job.trim().toLowerCase()&&s.machine===machine):[];
  const createJob=()=>{
    const now=Date.now();
    setJobs(prev=>[{id:now,customer:customer.trim(),job:job.trim(),machine,op:op.trim(),operatorId:user.id,operatorName:user.name,status:"setup",setupSec:0,runSec:0,phaseStartedAt:now,createdAt:now,pieces:0,photoData:null,photoData2:null,twoSided,lastModifiedAt:now},...prev]);
    setCustomer("");setJob("");setMachine("");setOp("");setErrs({});setTwoSided(false);setShowSuggestions(true);setSheetPickerOpen(false);
    notify(`Job startet — opstilling kører på ${machine}`);
  };
  const goToSheet=(sheetId)=>{setFocusSheetId&&setFocusSheetId(sheetId);setTab&&setTab("setup");};
  // No sheet yet: open a new one so it can be filled in while setting up
  const goToNewSheet=()=>{setNewSheetFor&&setNewSheetFor({partNumber:job.trim(),machine,customer:customer.trim()});setTab&&setTab("setup");};
  const start=(chosenSheetId)=>{
    const e={};if(!customer.trim())e.customer="Skal udfyldes";if(!job.trim())e.job="Skal udfyldes";if(!machine)e.machine="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    if(chosenSheetId===undefined&&matchingSheets.length>1){setSheetPickerOpen(true);return;}
    createJob();
    const sheetId=chosenSheetId!=null?chosenSheetId:matchingSheets.length===1?matchingSheets[0].id:null;
    if(sheetId) goToSheet(sheetId);
    else if(!matchingSheets.length) goToNewSheet();
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Start nyt job</div>

      {/* Two-sided toggle — TOP of form so it can't be missed */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Jobtype</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div onClick={()=>setTwoSided(false)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${!twoSided?C.amber:"rgba(255,255,255,.1)"}`,
            background:!twoSided?"rgba(240,165,0,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-square" style={{fontSize:24,color:!twoSided?C.amber:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:15,fontWeight:700,color:!twoSided?C.amber:C.muted,letterSpacing:1}}>Én side</div>
            {!twoSided&&<div style={{fontSize:12,color:C.amber,marginTop:4,letterSpacing:1}}>✓ VALGT</div>}
          </div>
          <div onClick={()=>setTwoSided(true)} style={{
            cursor:"pointer",borderRadius:10,padding:"14px 10px",textAlign:"center",
            border:`2px solid ${twoSided?C.blue:"rgba(255,255,255,.1)"}`,
            background:twoSided?"rgba(59,130,246,.12)":C.raised,
            transition:"all .15s",
          }}>
            <i className="ti ti-layers-intersect" style={{fontSize:24,color:twoSided?C.blue:C.muted,display:"block",marginBottom:6}}/>
            <div style={{fontSize:15,fontWeight:700,color:twoSided?C.blue:C.muted,letterSpacing:1}}>To sider</div>
            {twoSided&&<div style={{fontSize:12,color:C.blue,marginTop:4,letterSpacing:1}}>✓ VALGT</div>}
          </div>
        </div>
        {twoSided&&<div style={{fontSize:14,color:C.blue,marginTop:8,background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.25)`,borderRadius:8,padding:"8px 10px"}}>
          <i className="ti ti-info-circle"/> Side 1 køres først. Når side 1 er afsluttet, starter opstilling af side 2 automatisk.
        </div>}
      </div>

      <div style={{marginBottom:12}}>
        <label style={label}>Kunde *</label>
        <input style={inp(errs.customer)} value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="f.eks. Firma A/S"/>
        {errs.customer&&<div style={errMsg}>{errs.customer}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Tegningsnr. *</label>
        <input style={inp(errs.job)} value={job}
          onChange={e=>{setJob(e.target.value);setShowSuggestions(true);}}
          placeholder="f.eks. 7641-19"/>
        {errs.job&&<div style={errMsg}>{errs.job}</div>}
        {/* Previous job suggestions */}
        {showSuggestions&&suggestions.length>0&&(
          <div style={{marginTop:8,border:`1px solid ${C.amber}`,borderRadius:8,overflow:"hidden"}}>
            <div style={{background:"rgba(240,165,0,.1)",padding:"6px 10px",fontSize:12,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>
              <i className="ti ti-history"/> Tidligere kørsler — tryk for at hente
            </div>
            {suggestions.map((s,i)=>(
              <div key={s.id} style={{padding:"10px 12px",borderTop:i>0?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"transparent"}}
                onClick={()=>applyJob(s)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.job}</div>
                  <div style={{fontSize:13,color:C.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {s.customer} · {s.machine}{s.op?` · ${s.op}`:""}
                  </div>
                  <div style={{fontSize:12,color:C.muted,marginTop:1,letterSpacing:1}}>{fmtDate(s.completedAt)}</div>
                </div>
                <div style={{flexShrink:0,background:C.amber,color:"#1a1a1a",borderRadius:6,padding:"4px 10px",fontSize:12,letterSpacing:1,textTransform:"uppercase",fontWeight:700}}>
                  Hent
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Maskine *</label>
        <select style={sel(errs.machine)} value={machine} onChange={e=>setMachine(e.target.value)}>
          <option value="">— Vælg maskine —</option>
          {machines.filter(m=>{
            if(!m.active) return false;
            const userDepts=user.departments||[];
            if(userDepts.length===0) return true; // no dept filter → see everything
            // show machine if it has no dept, or its dept is in the user's depts
            return !m.department||userDepts.includes(m.department);
          }).map(m=><option key={m.id}>{m.name}</option>)}
        </select>
        {errs.machine&&<div style={errMsg}>{errs.machine}</div>}
      </div>
      <div style={{marginBottom:12}}>
        <label style={label}>Operation / beskrivelse</label>
        <input style={inp()} value={op} onChange={e=>setOp(e.target.value)} placeholder="f.eks. planfræsning af top"/>
      </div>
      <div style={{...card(),background:"#1a2535",marginBottom:16}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Logget ind som</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><div style={avatar()}>{initials(user.name)}</div><div style={{fontSize:16,color:C.text}}>{user.name}</div></div>
      </div>
      {matchingSheets.length>0?(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}><i className="ti ti-clipboard-list"/> {matchingSheets.length} opstillingsark fundet</div>
          {matchingSheets.map(s=>{
            const opColor={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted;
            return(
              <div key={s.id} style={{background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.3)",borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.text}}>{s.partNumber}</div>
                  {s.operation&&<div style={{fontSize:13,fontWeight:700,color:opColor,marginTop:2}}>{s.operation}</div>}
                  {s.revision&&<div style={{fontSize:12,color:C.muted}}>Rev. {s.revision}</div>}
                </div>
                <button style={{background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.4)",borderRadius:7,color:"#3b82f6",cursor:"pointer",fontSize:14,padding:"5px 12px",fontWeight:600}} onClick={()=>goToSheet(s.id)}>Vis</button>
              </div>
            );
          })}
        </div>
      ):job.trim()&&machine?(
        <div style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.3)",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <i className="ti ti-clipboard-x" style={{fontSize:20,color:C.amber,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:C.amber}}>Intet opstillingsark</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Intet ark for {job.trim()} på {machine}</div>
          </div>
          <button style={{background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.4)",borderRadius:7,color:C.amber,cursor:"pointer",fontSize:14,padding:"5px 12px",fontWeight:600}} onClick={goToNewSheet}>Opret</button>
        </div>
      ):null}
      <button style={btn("primary",true)} onClick={()=>start(undefined)}><i className="ti ti-player-play"/> &nbsp;Start opstilling</button>
      {sheetPickerOpen&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"flex-end"}}>
          <div style={{background:C.bg,width:"100%",borderRadius:"16px 16px 0 0",padding:"20px 16px 32px",maxHeight:"70vh",overflowY:"auto"}}>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Hvilket opstillingsark?</div>
            {matchingSheets.map(s=>{
              const opColor={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted;
              return(
                <button key={s.id} style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px",marginBottom:8,cursor:"pointer",textAlign:"left"}} onClick={()=>start(s.id)}>
                  <div style={{width:10,height:10,borderRadius:"50%",background:opColor,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:16,fontWeight:700,color:C.text}}>{s.operation||"(ingen operation)"}</div>
                    <div style={{fontSize:13,color:C.muted,marginTop:2}}>{s.partNumber} · {s.machine}{s.revision?` · Rev ${s.revision}`:""}</div>
                  </div>
                  <i className="ti ti-arrow-right" style={{color:C.muted,fontSize:18}}/>
                </button>
              );
            })}
            <button style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px",color:C.muted,cursor:"pointer",fontSize:15,marginTop:4}} onClick={()=>{createJob();}}>Start uden opstillingsark</button>
            <button style={{width:"100%",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,marginTop:8,padding:"8px"}} onClick={()=>setSheetPickerOpen(false)}>Annuller</button>
          </div>
        </div>
      )}
    </div>
  );
}
