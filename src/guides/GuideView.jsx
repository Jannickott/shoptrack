import { useState, useEffect } from "react";
import { C, btn, badge } from "../lib/theme";
import { fmtDate } from "../lib/util";
import { PdfDrawings } from "../components/PdfDrawings";
import { VideoPlayer } from "../components/VideoAttach";
import { catLabel, catIcon } from "./guideUtil";

// One guide, read on the tablet: numbered steps in big type, pictures and videos
// right where they belong.
export function GuideView({guide:g,canDelete,onBack,onEdit,onDelete}){
  const [big,setBig]=useState(null);
  useEffect(()=>{window.scrollTo(0,0);},[g.id]); // open at the top
  const [confirmDel,setConfirmDel]=useState(false);
  const steps=(g.steps||[]).filter(s=>s.text?.trim()||s.photos?.length||s.videos?.length);
  return(
    <div style={{padding:"14px 16px",maxWidth:980,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <button style={btn("outline",false,true)} onClick={onBack}><i className="ti ti-arrow-left"/> Alle vejledninger</button>
        <div style={{flex:1}}/>
        <button style={btn("primary",false,true)} onClick={onEdit}><i className="ti ti-pencil"/> Ret</button>
        {canDelete&&<button style={btn("outline",false,true)} onClick={()=>setConfirmDel(true)} title="Slet vejledning"><i className="ti ti-trash" style={{color:C.red}}/></button>}
      </div>
      {confirmDel&&(
        <div style={{background:"rgba(231,76,60,.12)",border:`1px solid ${C.red}`,borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200,color:C.text,fontSize:15}}>Slet "{g.title}"? En admin kan hente den tilbage igen.</div>
          <button style={btn("danger",false,true)} onClick={onDelete}><i className="ti ti-trash"/> Slet</button>
          <button style={btn("outline",false,true)} onClick={()=>setConfirmDel(false)}>Annuller</button>
        </div>
      )}

      <div style={{fontSize:28,fontWeight:700,color:C.text,fontFamily:"Arial, sans-serif",lineHeight:1.25,marginBottom:8}}>{g.title}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
        {g.category&&<span style={{...badge("setup")}}><i className={`ti ti-${catIcon(g.category)}`}/> {catLabel(g.category)}</span>}
        {(g.machines||[]).length?g.machines.map(m=><span key={m} style={badge("admin")}><i className="ti ti-robot"/> {m}</span>)
          :<span style={badge("")}>Alle maskiner</span>}
      </div>
      {g.intro?.trim()&&<div style={{fontSize:18,color:C.text,fontFamily:"Arial, sans-serif",lineHeight:1.5,whiteSpace:"pre-wrap",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>{g.intro}</div>}

      {steps.map((s,i)=>(
        <div key={s.id||i} style={{display:"flex",gap:14,marginBottom:18}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:C.amber,color:"#1a1a1a",fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
          <div style={{flex:1,minWidth:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px"}}>
            {s.text?.trim()&&<div style={{fontSize:19,color:C.text,fontFamily:"Arial, sans-serif",lineHeight:1.5,whiteSpace:"pre-wrap",marginBottom:(s.photos?.length||s.videos?.length)?12:0}}>{s.text}</div>}
            {s.photos?.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:s.photos.length===1?"1fr":"1fr 1fr",gap:8,marginBottom:s.videos?.length?10:0}}>
                {s.photos.map((p,j)=>(
                  <img key={j} src={p.url} alt="" onClick={()=>setBig(p)} style={{width:"100%",maxHeight:s.photos.length===1?480:300,objectFit:"contain",background:"#000",borderRadius:8,cursor:"zoom-in",display:"block"}}/>
                ))}
              </div>
            )}
            {(s.videos||[]).map(v=><div key={v.url} style={{marginTop:6}}><VideoPlayer video={v}/></div>)}
          </div>
        </div>
      ))}

      {(g.files||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Dokumenter (PDF)</div>
          <PdfDrawings files={g.files}/>
        </div>
      )}
      <div style={{fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
        Skrevet af {g.createdBy||"—"} · {fmtDate(g.createdAt)}
        {g.updatedBy&&g.updatedAt!==g.createdAt&&<> · Rettet af {g.updatedBy} · {fmtDate(g.updatedAt)}</>}
      </div>

      {big&&(
        <div onClick={()=>setBig(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.94)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
          <img src={big.url} alt="" style={{maxWidth:"100%",maxHeight:"calc(100vh - 100px)",objectFit:"contain",borderRadius:8}} onClick={e=>e.stopPropagation()}/>
          <button onClick={()=>setBig(null)} style={{marginTop:14,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,color:"#fff",fontSize:16,fontWeight:700,padding:"10px 28px",cursor:"pointer"}}><i className="ti ti-x"/> Luk</button>
        </div>
      )}
    </div>
  );
}
