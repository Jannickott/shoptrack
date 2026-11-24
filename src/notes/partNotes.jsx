import { createContext, useContext, useState } from "react";
import { C, btn, inp, label } from "../lib/theme";
import { normPart } from "../planning/planEngine";
import { PhotoAttach, PhotoStrip } from "../components/PhotoAttach";
import { notify } from "../components/Feedback";

// ═══════════════════════════════════════════════════════
// JOB-NOTER — the admin leaves a note or a warning on a part (tegningsnr.), optionally
// for one machine, so it shows up next time: in planning, when the job is started, on
// the running job and on the setup sheet. The operator taps "Læst" (kept on the job).
// A note: {id, partNumber, machine ("" = all machines), level:"warn"|"info", text,
//   photos:[{url,…}], createdBy, createdAt, updatedBy, updatedAt,
//   done?, doneBy?, doneAt?, deleted?}
// Synced like guides: per note, newest updatedAt wins.
// On the job: notesSeen = {[noteId]: {by, at}}
// ═══════════════════════════════════════════════════════
export const LEVEL={
  warn:{label:"Advarsel",icon:"alert-triangle",color:"#e53e3e",bg:"rgba(229,62,62,.12)"},
  info:{label:"Note",icon:"info-circle",color:"#3b82f6",bg:"rgba(59,130,246,.10)"},
};

export const NotesCtx=createContext({notes:[],setNotes:()=>{},saveNow:null,user:null,machines:[]});
export const useNotes=()=>useContext(NotesCtx);

// Open notes for this part (and machine, when known) — warnings first, newest first
export function notesFor(notes,part,machine){
  const p=normPart(part);
  if(!p) return [];
  return (notes||[]).filter(n=>!n.deleted&&!n.done&&normPart(n.partNumber)===p&&(!machine||!n.machine||n.machine===machine))
    .sort((a,b)=>(a.level==="warn"?0:1)-(b.level==="warn"?0:1)||(b.createdAt||0)-(a.createdAt||0));
}

const when=t=>new Date(t).toLocaleString("da-DK",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const whenShort=t=>new Date(t).toLocaleString("da-DK",{weekday:"short",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"});

// One note, big and clear
function NoteBox({n,children,compact}){
  const L=LEVEL[n.level]||LEVEL.info;
  return(
    <div style={{background:L.bg,border:`2px solid ${L.color}`,borderRadius:10,padding:compact?"8px 10px":"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
        <i className={`ti ti-${L.icon}`} style={{fontSize:compact?18:22,color:L.color}}/>
        <span style={{fontSize:compact?13:15,fontWeight:800,color:L.color,letterSpacing:1,textTransform:"uppercase"}}>{L.label}</span>
        <span style={{fontSize:12,color:C.muted}}>{n.partNumber}{n.machine?` · ${n.machine}`:" · alle maskiner"} · {n.createdBy||"Admin"} · {when(n.createdAt)}</span>
      </div>
      <div style={{fontSize:compact?15:18,color:C.text,fontFamily:"Arial, sans-serif",lineHeight:1.45,whiteSpace:"pre-wrap"}}>{n.text}</div>
      {(n.photos||[]).length>0&&<div style={{marginTop:8}}><PhotoStrip photos={n.photos} size={compact?64:96}/></div>}
      {children}
    </div>
  );
}

// For the operator — on the running job: must be read once (tap "Læst"), then it folds up
export function JobNotes({j,setJobs}){
  const {notes,saveNow,user}=useNotes();
  const [open,setOpen]=useState({});
  const list=notesFor(notes,j.job,j.machine);
  if(!list.length) return null;
  const seen=j.notesSeen||{};
  const markSeen=n=>{
    const now=Date.now();
    setJobs(prev=>prev.map(x=>x.id!==j.id?x:{...x,notesSeen:{...(x.notesSeen||{}),[n.id]:{by:user?.name||"",at:now}},lastModifiedAt:now}));
    saveNow&&saveNow();
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {list.map(n=>{
        const s=seen[n.id];
        const L=LEVEL[n.level]||LEVEL.info;
        if(s&&!open[n.id]) return(
          <button key={n.id} onClick={()=>setOpen(o=>({...o,[n.id]:true}))} style={{textAlign:"left",background:L.bg,border:`1px solid ${L.color}`,borderRadius:6,padding:"6px 8px",fontSize:13,color:L.color,cursor:"pointer",minHeight:36}}>
            <i className={`ti ti-${L.icon}`}/> {L.label} læst af {s.by} · {whenShort(s.at)} — tryk for at se
          </button>
        );
        return(
          <NoteBox key={n.id} n={n} compact>
            {s
              ?<button style={{...btn("outline",true,true),marginTop:8}} onClick={()=>setOpen(o=>({...o,[n.id]:false}))}><i className="ti ti-chevron-up"/> Fold sammen</button>
              :<button style={{...btn(n.level==="warn"?"danger":"primary",true,true),marginTop:10,minHeight:48}} onClick={()=>markSeen(n)}><i className="ti ti-check"/> Jeg har læst den</button>}
          </NoteBox>
        );
      })}
    </div>
  );
}

// Read-only list (new job form, setup sheet, planning) — no "Læst" here
export function PartNotes({part,machine,compact,title}){
  const {notes}=useNotes();
  const list=notesFor(notes,part,machine);
  if(!list.length) return null;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {title&&<div style={{fontSize:13,color:C.red,letterSpacing:2,textTransform:"uppercase"}}><i className="ti ti-alert-triangle"/> {title}</div>}
      {list.map(n=><NoteBox key={n.id} n={n} compact={compact}/>)}
    </div>
  );
}

// One line for small cards (planning order, admin job card)
export function NotesLine({part,machine,onClick}){
  const {notes}=useNotes();
  const list=notesFor(notes,part,machine);
  if(!list.length) return null;
  const warn=list.some(n=>n.level==="warn");
  const L=LEVEL[warn?"warn":"info"];
  return(
    <div onClick={onClick} style={{fontSize:13,color:L.color,background:L.bg,border:`1px solid ${L.color}`,borderRadius:6,padding:"4px 8px",cursor:onClick?"pointer":"default",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
      <i className={`ti ti-${L.icon}`}/> {list.length>1?`${list.length} noter: `:""}{list[0].text.split("\n")[0]}
    </div>
  );
}

// Admin: write or change a note (modal)
export function NoteForm({note,onClose}){
  const {notes,setNotes,saveNow,user,machines}=useNotes();
  const [f,setF]=useState({partNumber:"",machine:"",level:"warn",text:"",photos:[],...note});
  const [err,setErr]=useState("");
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));setErr("");};
  const save=()=>{
    if(!f.partNumber.trim()) return setErr("Tegningsnr. skal udfyldes");
    if(!f.text.trim()) return setErr("Skriv hvad noten handler om");
    const now=Date.now();
    const out={...f,partNumber:f.partNumber.trim(),text:f.text.trim(),updatedAt:now,updatedBy:user?.name||""};
    if(!out.id){out.id=now;out.createdAt=now;out.createdBy=user?.name||"";}
    setNotes(prev=>[out,...prev.filter(x=>x.id!==out.id)]);
    saveNow&&saveNow();
    notify(out.level==="warn"?"Advarsel gemt — vises næste gang jobbet køres":"Note gemt — vises næste gang jobbet køres","ok");
    onClose();
  };
  const known=[...new Set((notes||[]).map(n=>n.partNumber))];
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:900,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"30px 12px",overflowY:"auto"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px",width:"100%",maxWidth:620}}>
        <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{f.id?"Ret note":"Note til næste gang"}</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {Object.entries(LEVEL).map(([k,L])=>(
            <button key={k} onClick={()=>set("level",k)} style={{flex:1,minHeight:52,borderRadius:8,cursor:"pointer",fontSize:16,fontWeight:700,
              background:f.level===k?L.bg:C.raised,border:`2px solid ${f.level===k?L.color:C.border}`,color:f.level===k?L.color:C.muted}}>
              <i className={`ti ti-${L.icon}`}/> {L.label}
            </button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={label}>Tegningsnr. *</label><input style={inp()} value={f.partNumber} list="note-parts" onChange={e=>set("partNumber",e.target.value)}/>
            <datalist id="note-parts">{known.map(p=><option key={p} value={p}/>)}</datalist></div>
          <div><label style={label}>Maskine</label>
            <select style={inp()} value={f.machine} onChange={e=>set("machine",e.target.value)}>
              <option value="">Alle maskiner</option>
              {(machines||[]).filter(m=>m.active&&!m.removed).map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select></div>
        </div>
        <label style={label}>Hvad skal gøres anderledes? *</label>
        <textarea style={{...inp(),minHeight:130,fontFamily:"Arial, sans-serif",fontSize:17,lineHeight:1.4}} value={f.text} onChange={e=>set("text",e.target.value)}
          placeholder="f.eks. Der var problemer med ... — næste gang: brug ..., kør ..."/>
        <div style={{marginTop:10}}><PhotoAttach photos={f.photos||[]} onChange={p=>set("photos",p)} color={LEVEL[f.level]?.color}/></div>
        {err&&<div style={{color:C.red,fontSize:14,marginTop:8}}>{err}</div>}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button style={btn("outline",true)} onClick={onClose}>Annuller</button>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-check"/> Gem</button>
        </div>
      </div>
    </div>
  );
}

// Admin button that opens the form prefilled (job card, planning order)
export function AddNoteButton({part,machine,small}){
  const {user}=useNotes();
  const [open,setOpen]=useState(false);
  if(user?.role!=="admin") return null;
  return(
    <>
      <button title="Note / advarsel til næste gang" style={small?{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:2}:btn("outline",false,true)}
        onClick={e=>{e.stopPropagation();setOpen(true);}}>
        <i className="ti ti-message-exclamation"/>{!small&&" Note"}
      </button>
      {open&&<NoteForm note={{partNumber:part||"",machine:machine||""}} onClose={()=>setOpen(false)}/>}
    </>
  );
}

// Who has read a note — from the jobs
export function readersOf(note,jobs){
  return (jobs||[]).filter(j=>j.notesSeen?.[note.id]).map(j=>({...j.notesSeen[note.id],job:j.job,machine:j.machine}))
    .sort((a,b)=>(b.at||0)-(a.at||0));
}
export { when as noteWhen, whenShort as noteWhenShort, NoteBox };
