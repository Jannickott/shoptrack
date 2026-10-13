import { useState, useRef } from "react";
import { resizeImage } from "../lib/api";
import { C, card, inp, btn, label, errMsg } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// MANAGE CABINETS — admin configures cabinets & drawers
// ═══════════════════════════════════════════════════════
export function ManageCabinets({cabinets,setCabinets,departments,saveNow}){
  const [view,setView]=useState("list"); // "list"|"cabinet"|"drawer"
  const [editCabId,setEditCabId]=useState(null);
  const [cabForm,setCabForm]=useState({name:"",departments:[],photoData:null});
  const cabPhotoRef=useRef();
  const [editDrawer,setEditDrawer]=useState(null); // {cabinetId, drawerId|null}
  const [drawerForm,setDrawerForm]=useState({number:"",label:"",rows:6,cols:7});
  const [errs,setErrs]=useState({});
  const [confirmDeleteCabId,setConfirmDeleteCabId]=useState(null);

  const openAddCabinet=()=>{setCabForm({name:"",departments:[]});setEditCabId(null);setErrs({});setView("cabinet");};
  const openEditCabinet=c=>{setCabForm({name:c.name,departments:c.departments||[],photoData:c.photoData||null});setEditCabId(c.id);setErrs({});setView("cabinet");};
  const saveCabinet=()=>{
    if(!cabForm.name.trim()){setErrs({name:"Skal udfyldes"});return;}
    const now=Date.now();
    if(editCabId){
      setCabinets(prev=>prev.map(c=>c.id===editCabId?{...c,name:cabForm.name.trim(),departments:cabForm.departments||[],photoData:cabForm.photoData||null}:c));
    } else {
      setCabinets(prev=>[...prev,{id:now,name:cabForm.name.trim(),departments:cabForm.departments||[],drawers:[],photoData:cabForm.photoData||null}]);
    }
    setView("list");saveNow&&saveNow();
  };
  const deleteCabinet=id=>setConfirmDeleteCabId(id);
  const confirmDeleteCabinet=id=>{
    setCabinets(prev=>prev.filter(c=>c.id!==id));
    setConfirmDeleteCabId(null);
    saveNow&&saveNow();
  };

  const openAddDrawer=cabId=>{setDrawerForm({number:"",label:"",rows:6,cols:7});setEditDrawer({cabinetId:cabId,drawerId:null});setErrs({});setView("drawer");};
  const openEditDrawer=(cabId,d)=>{setDrawerForm({number:d.number,label:d.label||"",rows:d.rows,cols:d.cols});setEditDrawer({cabinetId:cabId,drawerId:d.id});setErrs({});setView("drawer");};
  const saveDrawer=()=>{
    const e={};
    if(!String(drawerForm.number).trim()) e.number="Skal udfyldes";
    if(!drawerForm.rows||drawerForm.rows<1||drawerForm.rows>26) e.rows="1–26";
    if(!drawerForm.cols||drawerForm.cols<1||drawerForm.cols>20) e.cols="1–20";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    const {cabinetId,drawerId}=editDrawer;
    setCabinets(prev=>prev.map(c=>{
      if(c.id!==cabinetId) return c;
      const drawers=drawerId
        ?c.drawers.map(d=>d.id===drawerId?{...d,...drawerForm,rows:parseInt(drawerForm.rows),cols:parseInt(drawerForm.cols),number:String(drawerForm.number).trim()}:d)
        :[...(c.drawers||[]),{id:now,...drawerForm,rows:parseInt(drawerForm.rows),cols:parseInt(drawerForm.cols),number:String(drawerForm.number).trim()}];
      return {...c,drawers};
    }));
    setView("list");saveNow&&saveNow();
  };
  const deleteDrawer=(cabId,drawerId)=>{
    setCabinets(prev=>prev.map(c=>c.id===cabId?{...c,drawers:(c.drawers||[]).filter(d=>d.id!==drawerId)}:c));
    saveNow&&saveNow();
  };

  if(view==="cabinet") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setView("list")}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editCabId?"Rediger skab":"Tilføj skab"}</div>
      <div style={{marginBottom:12}}>
        <label style={label}>Skabets navn *</label>
        <input style={{...inp(errs.name)}} value={cabForm.name} onChange={e=>setCabForm(p=>({...p,name:e.target.value}))} placeholder="f.eks. Skab A eller Hovedværktøjsskab"/>
        {errs.name&&<div style={errMsg}>{errs.name}</div>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Afdelinger</label>
        <div style={{fontSize:13,color:C.muted,marginBottom:8}}>Operatører i disse afdelinger ser værktøj fra dette skab. Lad stå tomt for at vise det for alle.</div>
        {(departments||[]).length===0
          ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Ingen afdelinger oprettet — gå til Administration → Afdelinger først.</div>
          :<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(departments||[]).map(d=>{
              const on=(cabForm.departments||[]).includes(d);
              return(
                <button key={d} type="button" onClick={()=>setCabForm(p=>{const ds=p.departments||[];return{...p,departments:on?ds.filter(x=>x!==d):[...ds,d]};})}
                  style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${on?C.amber:"rgba(255,255,255,.15)"}`,background:on?"rgba(240,165,0,.15)":"transparent",cursor:"pointer",fontFamily:"inherit",color:on?C.amber:C.muted,fontSize:15,fontWeight:on?700:400,transition:"all .12s"}}>
                  {d}
                </button>
              );
            })}
          </div>}
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Foto af skabet</label>
        <div style={{border:`2px dashed ${cabForm.photoData?"rgba(39,174,96,.4)":"rgba(255,255,255,.12)"}`,borderRadius:8,padding:cabForm.photoData?12:22,textAlign:"center",cursor:"pointer",background:cabForm.photoData?"rgba(39,174,96,.05)":"transparent",transition:"all .2s"}}
          onClick={()=>cabPhotoRef.current.click()}>
          {cabForm.photoData
            ?<><img src={cabForm.photoData} style={{maxHeight:130,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/><div style={{fontSize:14,color:C.green,letterSpacing:1}}>Foto vedhæftet — tryk for at skifte</div></>
            :<><i className="ti ti-camera" style={{fontSize:30,opacity:0.3,display:"block",marginBottom:8}}/><div style={{fontSize:15,color:C.muted}}>Tryk for at tilføje et foto af skabet</div></>}
        </div>
        <input type="file" ref={cabPhotoRef} accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setCabForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
        {cabForm.photoData&&<button style={{...btn("danger",false,true),marginTop:6,fontSize:12}} onClick={()=>setCabForm(p=>({...p,photoData:null}))}><i className="ti ti-x"/> Fjern foto</button>}
      </div>
      <button style={btn("success",true)} onClick={saveCabinet}><i className="ti ti-check"/> {editCabId?"Gem ændringer":"Tilføj skab"}</button>
    </div>
  );

  if(view==="drawer") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setView("list")}><i className="ti ti-arrow-left"/> Tilbage</button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editDrawer?.drawerId?"Rediger skuffe":"Tilføj skuffe"}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Skuffenummer *</label>
          <input style={inp(errs.number)} value={drawerForm.number} onChange={e=>setDrawerForm(p=>({...p,number:e.target.value}))} placeholder="f.eks. 1 eller A"/>
          {errs.number&&<div style={errMsg}>{errs.number}</div>}
        </div>
        <div>
          <label style={label}>Mærkat (valgfri)</label>
          <input style={inp()} value={drawerForm.label} onChange={e=>setDrawerForm(p=>({...p,label:e.target.value}))} placeholder="f.eks. Drejeskær"/>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={label}>Gitterstørrelse</label>
        <div style={{background:C.raised,borderRadius:10,padding:"14px",marginTop:6}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={{...label,marginBottom:4}}>Rækker (A–?)</label>
              <input type="number" min="1" max="26" style={{...inp(errs.rows),textAlign:"center",fontSize:18,color:C.amber}} value={drawerForm.rows} onChange={e=>setDrawerForm(p=>({...p,rows:e.target.value,rows_changed:true}))}/>
              {errs.rows&&<div style={errMsg}>{errs.rows}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:3,textAlign:"center"}}>A–{String.fromCharCode(64+(parseInt(drawerForm.rows)||1))}</div>
            </div>
            <div>
              <label style={{...label,marginBottom:4}}>Kolonner (1–?)</label>
              <input type="number" min="1" max="20" style={{...inp(errs.cols),textAlign:"center",fontSize:18,color:C.amber}} value={drawerForm.cols} onChange={e=>setDrawerForm(p=>({...p,cols:e.target.value}))}/>
              {errs.cols&&<div style={errMsg}>{errs.cols}</div>}
              <div style={{fontSize:12,color:C.muted,marginTop:3,textAlign:"center"}}>1–{parseInt(drawerForm.cols)||1}</div>
            </div>
          </div>
          {(()=>{
            const r=Math.min(Math.max(parseInt(drawerForm.rows)||1,1),26);
            const c=Math.min(Math.max(parseInt(drawerForm.cols)||1,1),20);
            const rows=Array.from({length:r},(_,i)=>String.fromCharCode(65+i));
            const cols=Array.from({length:c},(_,i)=>i+1);
            return(
              <div style={{overflowX:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:`16px repeat(${c},18px)`,gap:2,marginBottom:2,minWidth:"fit-content"}}>
                  <div/>{cols.map(n=><div key={n} style={{textAlign:"center",fontSize:10,color:C.muted}}>{n}</div>)}
                </div>
                {rows.map(rv=>(
                  <div key={rv} style={{display:"grid",gridTemplateColumns:`16px repeat(${c},18px)`,gap:2,marginBottom:2,minWidth:"fit-content"}}>
                    <div style={{fontSize:10,color:C.muted,display:"flex",alignItems:"center",justifyContent:"center"}}>{rv}</div>
                    {cols.map(n=><div key={n} style={{width:18,height:18,borderRadius:3,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)"}}/>)}
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{fontSize:13,color:C.muted,textAlign:"center",marginTop:8}}>{(parseInt(drawerForm.rows)||1)*(parseInt(drawerForm.cols)||1)} pladser i alt</div>
        </div>
      </div>
      <button style={btn("success",true)} onClick={saveDrawer}><i className="ti ti-check"/> {editDrawer?.drawerId?"Gem ændringer":"Tilføj skuffe"}</button>
    </div>
  );

  return(
    <div>
      <button style={{...btn("primary",false,true),marginBottom:14}} onClick={openAddCabinet}><i className="ti ti-plus"/> Tilføj skab</button>
      {(cabinets||[]).length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen skabe endnu. Tilføj et for at organisere dit værktøj.</div>}
      {(cabinets||[]).map(cab=>(
        <div key={cab.id} style={{...card(),marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:(cab.departments||[]).length>0?6:10}}>
            {cab.photoData
              ?<img src={cab.photoData} style={{width:40,height:40,borderRadius:7,objectFit:"cover",border:`1px solid ${C.border}`,flexShrink:0}}/>
              :<i className="ti ti-archive" style={{fontSize:18,color:C.amber,flexShrink:0}}/>}
            <div style={{flex:1,fontSize:16,color:C.text,fontWeight:700}}>{cab.name}</div>
            <button style={{...btn("outline",false,true),padding:"6px 8px"}} onClick={()=>openEditCabinet(cab)}><i className="ti ti-edit"/></button>
            <button style={{...btn("danger",false,true),padding:"6px 8px"}} onClick={()=>deleteCabinet(cab.id)}><i className="ti ti-trash"/></button>
          </div>
          {(cab.departments||[]).length>0&&(
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10,paddingLeft:26}}>
              {(cab.departments||[]).map(d=><span key={d} style={{fontSize:13,color:C.amber,background:"rgba(240,165,0,.12)",padding:"2px 8px",borderRadius:6,border:"1px solid rgba(240,165,0,.25)"}}>{d}</span>)}
            </div>
          )}
          <div style={{paddingLeft:6}}>
            {(cab.drawers||[]).length===0&&<div style={{fontSize:14,color:C.muted,marginBottom:8}}>Ingen skuffer endnu</div>}
            {(cab.drawers||[]).map(d=>{
              const rows=Array.from({length:d.rows},(_,i)=>String.fromCharCode(65+i));
              const colCount=d.cols;
              return(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:C.raised,borderRadius:8,marginBottom:6}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,color:C.text,fontWeight:600}}>Skuffe {d.number}{d.label?<span style={{color:C.muted,fontWeight:400}}> — {d.label}</span>:""}</div>
                    <div style={{fontSize:13,color:C.muted,marginTop:2}}>Gitter: A–{String.fromCharCode(64+d.rows)} × 1–{d.cols} ({d.rows*d.cols} pladser)</div>
                  </div>
                  <button style={{...btn("outline",false,true),padding:"5px 7px",fontSize:14}} onClick={()=>openEditDrawer(cab.id,d)}><i className="ti ti-edit"/></button>
                  <button style={{...btn("danger",false,true),padding:"5px 7px",fontSize:14}} onClick={()=>deleteDrawer(cab.id,d.id)}><i className="ti ti-trash"/></button>
                </div>
              );
            })}
            <button style={{...btn("outline",false,true),marginTop:4,fontSize:14}} onClick={()=>openAddDrawer(cab.id)}><i className="ti ti-plus"/> Tilføj skuffe</button>
          </div>
          {confirmDeleteCabId===cab.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}`,background:"rgba(231,76,60,.07)",borderRadius:8,padding:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:6}}><i className="ti ti-alert-triangle"/> Slet "{cab.name}" og alle dets skuffer?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Alle skuffer og værktøjspladser i dette skab fjernes permanent.</div>
              <div style={{display:"flex",gap:8}}>
                <button style={btn("outline",false,false)} onClick={()=>setConfirmDeleteCabId(null)}>Annuller</button>
                <button style={btn("danger",false,false)} onClick={()=>confirmDeleteCabinet(cab.id)}><i className="ti ti-trash"/> Slet</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
