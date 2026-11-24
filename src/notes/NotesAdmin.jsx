import { useState } from "react";
import { C, btn, inp } from "../lib/theme";
import { useNotes, NoteBox, NoteForm, readersOf, noteWhenShort, noteWhen } from "./partNotes";
import { normPart } from "../planning/planEngine";

// Administration → Job-noter: every note in one place — add, change, close when done
export function NotesAdmin({jobs}){
  const {notes,setNotes,saveNow,user}=useNotes();
  const [editing,setEditing]=useState(null);
  const [showDone,setShowDone]=useState(false);
  const [q,setQ]=useState("");
  const patch=(n,p)=>{const now=Date.now();setNotes(prev=>prev.map(x=>x.id===n.id?{...x,...p,updatedAt:now,updatedBy:user?.name||""}:x));saveNow&&saveNow();};
  const live=(notes||[]).filter(n=>!n.deleted);
  const match=n=>!q.trim()||normPart(n.partNumber).includes(normPart(q))||(n.text||"").toLowerCase().includes(q.trim().toLowerCase());
  const open=live.filter(n=>!n.done&&match(n)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const done=live.filter(n=>n.done&&match(n)).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const Card=({n})=>{
    const rd=readersOf(n,jobs);
    return(
      <div style={{opacity:n.done?.6:1}}>
        <NoteBox n={n} compact>
          <div style={{fontSize:13,color:C.muted,marginTop:8}}>
            {rd.length
              ?<><i className="ti ti-eye-check" style={{color:C.green}}/> Læst: {rd.slice(0,4).map((r,i)=><span key={i}>{i>0&&", "}{r.by} ({r.job} · {noteWhenShort(r.at)})</span>)}{rd.length>4&&` + ${rd.length-4} mere`}</>
              :<><i className="ti ti-eye-off"/> Ikke læst endnu — vises næste gang jobbet køres</>}
          </div>
          {n.done&&<div style={{fontSize:13,color:C.green,marginTop:4}}><i className="ti ti-check"/> Afsluttet af {n.doneBy||"—"} · {noteWhen(n.doneAt)}</div>}
          <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
            {!n.done&&<button style={btn("outline",false,true)} onClick={()=>setEditing(n)}><i className="ti ti-pencil"/> Ret</button>}
            {!n.done
              ?<button style={btn("success",false,true)} onClick={()=>patch(n,{done:true,doneAt:Date.now(),doneBy:user?.name||""})}><i className="ti ti-check"/> Færdig — vis ikke mere</button>
              :<button style={btn("outline",false,true)} onClick={()=>patch(n,{done:false,doneAt:null,doneBy:null})}><i className="ti ti-arrow-back-up"/> Aktivér igen</button>}
            <button style={btn("outline",false,true)} title="Slet" onClick={()=>{if(window.confirm("Slet noten?"))patch(n,{deleted:true});}}><i className="ti ti-trash" style={{color:C.red}}/></button>
          </div>
        </NoteBox>
      </div>
    );
  };
  return(
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:200,fontSize:14,color:C.muted,lineHeight:1.4}}>Noter og advarsler på et tegningsnr. Vises i planlægningen, når jobbet startes, på det kørende job og på opstillingsarket — indtil du trykker <b>Færdig</b>.</div>
        <button style={btn("primary",false,true)} onClick={()=>setEditing({})}><i className="ti ti-plus"/> Ny note</button>
      </div>
      <input style={{...inp(),marginBottom:12}} value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg tegningsnr. eller tekst…"/>
      {!open.length&&<div style={{textAlign:"center",color:C.muted,padding:"30px 10px"}}><i className="ti ti-message-exclamation" style={{fontSize:36,opacity:.3,display:"block",marginBottom:8}}/>Ingen åbne noter. Tilføj en her, eller fra et job under Alle job.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>{open.map(n=><Card key={n.id} n={n}/>)}</div>
      {done.length>0&&(
        <div style={{marginTop:18}}>
          <button style={btn("outline",false,true)} onClick={()=>setShowDone(s=>!s)}><i className={`ti ti-chevron-${showDone?"up":"down"}`}/> Afsluttede noter ({done.length})</button>
          {showDone&&<div style={{display:"flex",flexDirection:"column",gap:10,marginTop:10}}>{done.map(n=><Card key={n.id} n={n}/>)}</div>}
        </div>
      )}
      {editing&&<NoteForm note={editing} onClose={()=>setEditing(null)}/>}
    </div>
  );
}
