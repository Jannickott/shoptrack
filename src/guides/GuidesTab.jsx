import { useState, useMemo } from "react";
import { C, inp, btn, tag, badge } from "../lib/theme";
import { fmtDate } from "../lib/util";
import { notify } from "../components/Feedback";
import { GuideView } from "./GuideView";
import { GuideForm } from "./GuideForm";
import { GUIDE_CATS, catLabel, catIcon, guideMatches, forMachine, videoCount, photoCount, loadGuideDraft } from "./guideUtil";

// ═══════════════════════════════════════════════════════
// VEJLEDNINGER tab — find a guide (search, machine, topic), read it, write a new one.
// Everyone can write and correct guides; the writer or an admin can delete one,
// and an admin can bring a deleted one back.
// ═══════════════════════════════════════════════════════
export function GuidesTab({user,guides,setGuides,machines,saveNow}){
  const [mode,setMode]=useState(null); // null = list · {view:id} · {edit:id|null}
  const [q,setQ]=useState("");
  const [machine,setMachine]=useState("");
  const [cat,setCat]=useState("");
  const [showDeleted,setShowDeleted]=useState(false);
  const isAdmin=user.role==="admin";

  const live=guides.filter(g=>!g.deleted);
  const deleted=guides.filter(g=>g.deleted);
  const shown=useMemo(()=>live.filter(g=>guideMatches(g,q)&&forMachine(g,machine)&&(!cat||g.category===cat))
    .sort((a,b)=>a.title.localeCompare(b.title,"da")),[guides,q,machine,cat]);
  // Machines that have guides of their own come first in the filter
  const machineNames=(machines||[]).filter(m=>m.active).map(m=>m.name);
  const catsInUse=GUIDE_CATS.filter(([k])=>live.some(g=>g.category===k));

  const save=form=>{
    const now=Date.now();
    const old=guides.find(g=>g.id===form.id);
    const g={...form,id:form.id??now,createdBy:old?.createdBy||user.name,createdAt:old?.createdAt||now,updatedBy:user.name,updatedAt:now};
    setGuides(prev=>old?prev.map(x=>x.id===g.id?g:x):[...prev,g]);
    saveNow();
    notify(old?"Vejledning gemt":"Vejledning oprettet");
    setMode({view:g.id});
  };
  const del=g=>{
    const now=Date.now();
    setGuides(prev=>prev.map(x=>x.id===g.id?{...x,deleted:true,deletedBy:user.name,deletedAt:now,updatedAt:now}:x));
    saveNow();notify("Vejledning slettet");setMode(null);
  };
  const restore=g=>{
    setGuides(prev=>prev.map(x=>x.id===g.id?{...x,deleted:false,deletedBy:undefined,deletedAt:undefined,updatedAt:Date.now()}:x));
    saveNow();notify(`"${g.title}" er hentet tilbage`);
  };

  if(mode?.edit!==undefined){
    const g=mode.edit!=null?guides.find(x=>x.id===mode.edit):null;
    return <GuideForm key={mode.edit??"new"} guide={g} user={user} machines={machines} onSave={save} onCancel={()=>setMode(g?{view:g.id}:null)}/>;
  }
  if(mode?.view!=null){
    const g=guides.find(x=>x.id===mode.view);
    if(g) return <GuideView guide={g} canDelete={isAdmin||g.createdBy===user.name} onBack={()=>setMode(null)} onEdit={()=>setMode({edit:g.id})} onDelete={()=>del(g)}/>;
  }

  const newDraft=loadGuideDraft(user.id,null);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",flex:1}}>Vejledninger · {live.length}</div>
        <button style={btn("primary",false,true)} onClick={()=>setMode({edit:null})}><i className="ti ti-plus"/> Ny vejledning</button>
      </div>
      {newDraft&&(
        <div style={{background:"rgba(59,130,246,.12)",border:`1px solid ${C.blue}`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200,fontSize:15,color:C.text}}><i className="ti ti-pencil"/> Du har en vejledning, der ikke er gemt: <b>{newDraft.form.title||"uden titel"}</b></div>
          <button style={btn("blue",false,true)} onClick={()=>setMode({edit:null})}>Fortsæt</button>
        </div>
      )}

      <div style={{position:"relative",marginBottom:10}}>
        <i className="ti ti-search" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:20,color:C.muted}}/>
        <input style={{...inp(),paddingLeft:44,fontSize:18}} value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg — f.eks. bakker, kølevæske, nulpunkt…"/>
        {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,fontSize:20,minWidth:44,minHeight:44,cursor:"pointer"}}><i className="ti ti-x"/></button>}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        <button style={tag(!machine)} onClick={()=>setMachine("")}>Alle maskiner</button>
        {machineNames.map(m=><button key={m} style={tag(machine===m)} onClick={()=>setMachine(machine===m?"":m)}>{m}</button>)}
      </div>
      {catsInUse.length>1&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        <button style={tag(!cat)} onClick={()=>setCat("")}>Alle emner</button>
        {catsInUse.map(([k,lb,ic])=><button key={k} style={tag(cat===k)} onClick={()=>setCat(cat===k?"":k)}><i className={`ti ti-${ic}`}/> {lb}</button>)}
      </div>}

      {!live.length&&(
        <div style={{textAlign:"center",color:C.muted,padding:"40px 16px",fontSize:16,lineHeight:1.6}}>
          <i className="ti ti-book-2" style={{fontSize:44,display:"block",marginBottom:8}}/>
          Ingen vejledninger endnu.<br/>Tryk <b style={{color:C.amber}}>Ny vejledning</b> og skriv den første — med billeder og video.
        </div>
      )}
      {live.length>0&&!shown.length&&<div style={{textAlign:"center",color:C.muted,padding:"30px 16px",fontSize:16}}>Ingen vejledninger passer — prøv et andet ord, eller vælg "Alle maskiner".</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
        {shown.map(g=>{
          const thumb=(g.steps||[]).flatMap(s=>s.photos||[])[0];
          const v=videoCount(g),p=photoCount(g),n=(g.steps||[]).length;
          return(
            <div key={g.id} onClick={()=>setMode({view:g.id})} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`4px solid ${C.amber}`,borderRadius:10,padding:12,cursor:"pointer",display:"flex",gap:12,minHeight:90}}>
              {thumb?<img src={thumb.url} alt="" style={{width:84,height:84,objectFit:"cover",borderRadius:8,flexShrink:0,background:C.raised}}/>
                :<div style={{width:84,height:84,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className={`ti ti-${g.category?catIcon(g.category):"book-2"}`} style={{fontSize:32,color:C.muted}}/></div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:17,fontWeight:700,color:C.text,fontFamily:"Arial, sans-serif",lineHeight:1.3,marginBottom:4}}>{g.title}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:4}}>
                  {g.category&&<span style={{...badge("setup"),fontSize:11,padding:"2px 8px"}}>{catLabel(g.category)}</span>}
                  <span style={{...badge((g.machines||[]).length?"admin":""),fontSize:11,padding:"2px 8px"}}>{(g.machines||[]).length?g.machines.join(", "):"Alle maskiner"}</span>
                </div>
                <div style={{fontSize:13,color:C.muted,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <span><i className="ti ti-list-numbers"/> {n} trin</span>
                  {p>0&&<span><i className="ti ti-photo"/> {p}</span>}
                  {v>0&&<span style={{color:C.blue}}><i className="ti ti-movie"/> {v} video</span>}
                  <span>{fmtDate(g.updatedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin&&deleted.length>0&&(
        <div style={{marginTop:24}}>
          <button style={{...btn("outline",false,true)}} onClick={()=>setShowDeleted(s=>!s)}><i className="ti ti-trash"/> Slettede vejledninger · {deleted.length} <i className={`ti ti-chevron-${showDeleted?"up":"down"}`}/></button>
          {showDeleted&&deleted.map(g=>(
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",marginTop:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:C.text,fontSize:15}}>{g.title}</div>
                <div style={{color:C.muted,fontSize:13}}>Slettet af {g.deletedBy||"—"} · {fmtDate(g.deletedAt)}</div>
              </div>
              <button style={btn("outline",false,true)} onClick={()=>restore(g)}><i className="ti ti-restore"/> Gendan</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
