import { useState } from "react";
import { C, inp, btn, tag } from "../lib/theme";
import { toolAvailable, toolLocation } from "./toolOps";

// Picking a cabinet tool on a setup sheet: a button that opens a searchable list
// (name / article no., tool type, photo, drawer and stock) instead of a long dropdown.
export function ToolPickerField({value,tools,cabinets,onPick}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [type,setType]=useState(null);
  const cur=value!=null?(tools||[]).find(t=>String(t.id)===String(value)):null;
  const types=[...new Set((tools||[]).map(t=>t.toolType||"Andet"))].sort();
  const s=q.trim().toLowerCase();
  const list=(tools||[]).filter(t=>(!type||(t.toolType||"Andet")===type)&&(!s||(t.name||"").toLowerCase().includes(s)||(t.articleNumber||"").toLowerCase().includes(s)||(t.description||"").toLowerCase().includes(s)))
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const pick=id=>{onPick(id);setOpen(false);setQ("");setType(null);};
  const thumb=(t,size)=>t.photoData
    ?<img src={t.photoData} alt="" style={{width:size,height:size,objectFit:"cover",borderRadius:6,flexShrink:0,background:C.raised}}/>
    :<div style={{width:size,height:size,borderRadius:6,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="ti ti-tool" style={{color:C.muted,fontSize:size/2}}/></div>;
  return(
    <>
      <button type="button" onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",minHeight:48,padding:"6px 10px",background:C.raised,border:`1px solid ${cur?C.blue+"88":C.border}`,borderRadius:8,cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:C.text}}>
        {cur?<>
          {thumb(cur,36)}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.name}</div>
            <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{toolLocation(cur,cabinets)}</div>
          </div>
          <span style={{fontSize:13,color:C.blue}}>Skift</span>
        </>:<span style={{color:C.muted,fontSize:15}}><i className="ti ti-search"/> Vælg værktøj fra skab — valgfrit</span>}
      </button>
      {open&&(
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:400,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"5vh 12px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,width:"min(640px,100%)",maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:12,borderBottom:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:8}}>
                <input autoFocus style={{...inp(),flex:1}} value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg navn eller varenr…"/>
                <button style={btn("outline",false,true)} onClick={()=>setOpen(false)}><i className="ti ti-x"/></button>
              </div>
              {types.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button style={tag(!type)} onClick={()=>setType(null)}>Alle</button>
                {types.map(t=><button key={t} style={tag(type===t)} onClick={()=>setType(type===t?null:t)}>{t}</button>)}
              </div>}
            </div>
            <div style={{overflowY:"auto"}}>
              {cur&&<button onClick={()=>pick(null)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,color:C.red,cursor:"pointer",fontSize:15,fontFamily:"inherit"}}><i className="ti ti-x"/> Intet værktøj fra skab</button>}
              {!list.length&&<div style={{padding:20,color:C.muted,textAlign:"center"}}>Intet værktøj fundet</div>}
              {list.map(t=>{const av=toolAvailable(t);const sel=cur&&cur.id===t.id;return(
                <button key={t.id} onClick={()=>pick(t.id)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"10px 12px",background:sel?C.blue+"18":"none",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:C.text}}>
                  {thumb(t,48)}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:16,fontWeight:700}}>{t.name}</div>
                    <div style={{fontSize:13,color:C.muted}}>{[t.toolType,t.articleNumber&&`Varenr. ${t.articleNumber}`].filter(Boolean).join(" · ")}</div>
                    <div style={{fontSize:13,color:C.muted}}><i className="ti ti-map-pin"/> {toolLocation(t,cabinets)||"—"}{t.toolLife?` · ${t.toolLife} emner før skift`:""}</div>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,color:av>0?C.green:C.red,whiteSpace:"nowrap"}}>{av} {t.returnable?"ledig":"stk"}</span>
                </button>
              );})}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
