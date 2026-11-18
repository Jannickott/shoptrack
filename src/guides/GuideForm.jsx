import { useState, useEffect, useRef } from "react";
import { C, inp, btn, tag, label, errMsg } from "../lib/theme";
import { PhotoAttach } from "../components/PhotoAttach";
import { VideoAttach } from "../components/VideoAttach";
import { PdfDrawings } from "../components/PdfDrawings";
import { GUIDE_CATS, newStep, blankGuide, loadGuideDraft, saveGuideDraft, clearGuideDraft } from "./guideUtil";

// Write or change a guide. Step by step: text, pictures (draw on them / sketch) and video.
// What is typed is kept on the tablet as a draft until it is saved.
export function GuideForm({guide,user,machines,onSave,onCancel}){
  const base=()=>guide?JSON.parse(JSON.stringify({...blankGuide(),...guide,steps:guide.steps?.length?guide.steps:[newStep()]})):blankGuide();
  const draftId=guide?.id??null;
  const [restored]=useState(()=>{const d=loadGuideDraft(user.id,draftId);return d&&(!guide||d.savedAt>(guide.updatedAt||0))?d:null;});
  const [form,setForm]=useState(()=>restored?restored.form:base());
  const [errs,setErrs]=useState({});
  const [showRestored,setShowRestored]=useState(!!restored);
  const first=useRef(true);
  useEffect(()=>{window.scrollTo(0,0);},[]); // open at the top
  // Keep the draft on every change (not the very first render)
  useEffect(()=>{if(first.current){first.current=false;return;}saveGuideDraft(user.id,draftId,form);},[form]);

  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const setStep=(i,k,v)=>setForm(p=>({...p,steps:p.steps.map((s,j)=>j===i?{...s,[k]:v}:s)}));
  const moveStep=(i,d)=>setForm(p=>{const s=[...p.steps];const t=s[i];s[i]=s[i+d];s[i+d]=t;return{...p,steps:s};});
  const delStep=i=>setForm(p=>({...p,steps:p.steps.length>1?p.steps.filter((_,j)=>j!==i):[newStep()]}));
  const addStep=()=>setForm(p=>({...p,steps:[...p.steps,newStep()]}));
  const toggleMachine=m=>setF("machines",form.machines.includes(m)?form.machines.filter(x=>x!==m):[...form.machines,m]);

  const startOver=()=>{clearGuideDraft(user.id,draftId);setForm(base());setShowRestored(false);};
  const cancel=()=>{clearGuideDraft(user.id,draftId);onCancel();};
  const save=()=>{
    const e={};
    if(!form.title.trim()) e.title="Skriv en titel";
    const steps=form.steps.filter(s=>s.text?.trim()||s.photos?.length||s.videos?.length);
    if(!steps.length) e.steps="Skriv mindst ét trin";
    setErrs(e);
    if(Object.keys(e).length){window.scrollTo({top:0,behavior:"smooth"});return;}
    clearGuideDraft(user.id,draftId);
    onSave({...form,title:form.title.trim(),steps});
  };

  const active=(machines||[]).filter(m=>m.active).map(m=>m.name);
  const section={background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",marginBottom:12};
  const small={background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",minWidth:44,minHeight:44,fontSize:17,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"};

  return(
    <div style={{padding:"14px 16px",maxWidth:980,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <button style={btn("outline",false,true)} onClick={cancel}><i className="ti ti-arrow-left"/> Annuller</button>
        <div style={{fontSize:14,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>{guide?"Ret vejledning":"Ny vejledning"}</div>
      </div>
      {showRestored&&(
        <div style={{background:"rgba(59,130,246,.12)",border:`1px solid ${C.blue}`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200,fontSize:15,color:C.text}}><i className="ti ti-history"/> Det du skrev sidst er hentet frem — fortsæt og tryk Gem.{restored?.photosDropped?" Billederne kunne ikke huskes — tag dem igen.":""}</div>
          <button style={btn("outline",false,true)} onClick={startOver}>Start forfra</button>
        </div>
      )}

      <div style={section}>
        <label style={label}>Titel *</label>
        <input style={{...inp(errs.title),fontSize:20}} value={form.title} onChange={e=>setF("title",e.target.value)} placeholder="f.eks. Skift af spændebakker på LB200"/>
        {errs.title&&<div style={errMsg}>{errs.title}</div>}

        <label style={{...label,marginTop:14}}>Hvad handler den om?</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {GUIDE_CATS.map(([k,lb,ic])=>(
            <button key={k} style={tag(form.category===k)} onClick={()=>setF("category",form.category===k?"":k)}><i className={`ti ti-${ic}`}/> {lb}</button>
          ))}
        </div>

        <label style={{...label,marginTop:14}}>Maskiner <span style={{textTransform:"none",letterSpacing:0}}>— ingen valgt = gælder alle</span></label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          <button style={tag(!form.machines.length)} onClick={()=>setF("machines",[])}>Alle maskiner</button>
          {active.map(m=><button key={m} style={tag(form.machines.includes(m))} onClick={()=>toggleMachine(m)}>{m}</button>)}
        </div>

        <label style={{...label,marginTop:14}}>Kort beskrivelse (valgfri)</label>
        <textarea style={{...inp(),minHeight:70,resize:"vertical",display:"block",fontFamily:"Arial, sans-serif",fontSize:17}} value={form.intro} onChange={e=>setF("intro",e.target.value)} placeholder="Hvornår bruges den, hvad skal man have klar…"/>
      </div>

      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",margin:"18px 0 8px"}}>Trin for trin</div>
      {errs.steps&&<div style={{...errMsg,marginBottom:8}}>{errs.steps}</div>}
      {form.steps.map((s,i)=>(
        <div key={s.id} style={{...section,borderLeft:`4px solid ${C.amber}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:C.amber,color:"#1a1a1a",fontWeight:800,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</div>
            <div style={{flex:1,fontSize:14,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>Trin {i+1}</div>
            <button style={{...small,opacity:i===0?.35:1}} disabled={i===0} onClick={()=>moveStep(i,-1)} title="Flyt op"><i className="ti ti-arrow-up"/></button>
            <button style={{...small,opacity:i===form.steps.length-1?.35:1}} disabled={i===form.steps.length-1} onClick={()=>moveStep(i,1)} title="Flyt ned"><i className="ti ti-arrow-down"/></button>
            <button style={{...small,color:C.red}} onClick={()=>delStep(i)} title="Slet trin"><i className="ti ti-trash"/></button>
          </div>
          <textarea style={{...inp(),minHeight:90,resize:"vertical",display:"block",fontFamily:"Arial, sans-serif",fontSize:17,marginBottom:10}} value={s.text} onChange={e=>setStep(i,"text",e.target.value)} placeholder="Hvad skal man gøre?"/>
          <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Billeder / skitse <span style={{textTransform:"none",letterSpacing:0}}>— marker GO (sådan skal det være) eller NO GO (forkert)</span></div>
          <div style={{marginBottom:10}}><PhotoAttach goNo photos={s.photos} onChange={v=>setStep(i,"photos",v)}/></div>
          <div style={{fontSize:12,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Video</div>
          <VideoAttach videos={s.videos} onChange={v=>setStep(i,"videos",v)}/>
        </div>
      ))}
      <button style={{...btn("outline",true),marginBottom:16,borderStyle:"dashed"}} onClick={addStep}><i className="ti ti-plus"/> Tilføj trin</button>

      <div style={section}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Dokumenter (PDF, valgfri)</div>
        <PdfDrawings files={form.files} onChange={v=>setF("files",v)}/>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:30}}>
        <button style={btn("primary",true)} onClick={save}><i className="ti ti-device-floppy"/> Gem vejledning</button>
        <button style={btn("outline")} onClick={cancel}>Annuller</button>
      </div>
    </div>
  );
}
