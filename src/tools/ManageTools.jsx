import { useState, useEffect, useRef } from "react";
import { sendToolOp, resizeImage } from "../lib/api";
import { C, ISO_MAT, DRAWER_ROWS, DRAWER_COLS, card, inp, btn, badge, label, errMsg } from "../lib/theme";
import { fmtDate, TOOL_ACTION_NAME } from "../lib/util";

// ═══════════════════════════════════════════════════════
// MANAGE TOOLS — admin view
// ═══════════════════════════════════════════════════════
export function ManageTools({tools,setTools,toolLog,setToolLog,saveNow,users,machines,cabinets,focusToolId,setFocusToolId}){
  const [subview,setSubview]=useState("list");
  const [selectedCabinet,setSelectedCabinet]=useState(null);
  const [editId,setEditId]=useState(null);
  const [restockId,setRestockId]=useState(null);
  const [restockQty,setRestockQty]=useState("");
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusToolId){
    const ft=tools.find(t2=>String(t2.id)===String(focusToolId));
    if(ft)setSelectedCabinet(String(ft.cabinetId));
    setSelectedId(focusToolId);setSubview("list");setFocusToolId&&setFocusToolId(null);
  }},[focusToolId]);
  const [toolFilter,setToolFilter]=useState("all");
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const blank={name:"",toolType:"",returnable:false,regrindable:false,hasConditionRating:false,cabinetId:"",drawerId:"",drawerPosition:"",quantity:"",minQuantity:"",description:"",material:[],recommendedSpeed:"",recommendedFeed:"",supplier:"",articleNumber:"",photoData:null};
  const [form,setForm]=useState(blank);
  const [errs,setErrs]=useState({});
  const photoRef=useRef();
  const photoCamRef=useRef();

  const openAdd=()=>{setForm(blank);setEditId(null);setErrs({});setSubview("form");};
  const openEdit=t=>{
    setForm({...blank,...t,quantity:String(t.quantity),minQuantity:String(t.minQuantity||0),
      material:Array.isArray(t.material)?t.material:[],
      photoData:t.photoData||null,
    });
    setEditId(t.id);setErrs({});setSubview("form");
  };

  // Set fields on one tool locally and on the server
  const updateTool=(toolId,set,extra={})=>{
    setTools(prev=>prev.map(t=>t.id===toolId?{...t,...set}:t));
    sendToolOp({type:"update",toolId,set,...extra});
  };

  const save=()=>{
    const e={};
    if(!form.name.trim()) e.name="Skal udfyldes";
    if(!form.cabinetId) e.cabinetId="Vælg et skab";
    if(!form.drawerId)  e.drawerId ="Vælg en skuffe";
    if(form.quantity===""||isNaN(parseInt(form.quantity))) e.quantity="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    if(editId){
      updateTool(editId,{...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0});
    } else {
      const tool={id:now,...form,quantity:parseInt(form.quantity),minQuantity:parseInt(form.minQuantity)||0,active:true};
      setTools(prev=>[...prev,tool]);
      sendToolOp({type:"add",tool});
    }
    setSubview("list");
  };

  const doRestock=tool=>{
    const qty=parseInt(restockQty)||0;
    if(qty<1) return;
    const set={ordered:tool.quantity+qty>(tool.minQuantity||0)?false:tool.ordered};
    if(tool.conditionOrdered){set.conditionOrdered=false;set.conditionStars=5;}
    const now=Date.now();
    const log={id:now,toolId:tool.id,toolName:tool.name,operatorId:null,operatorName:"Admin",quantity:qty,action:"restock",timestamp:now};
    setTools(prev=>prev.map(t=>t.id===tool.id?{...t,...set,quantity:t.quantity+qty}:t));
    setToolLog&&setToolLog(prev=>[...prev,log]);
    sendToolOp({type:"update",toolId:tool.id,set,inc:{quantity:qty},log});
    setRestockId(null);setRestockQty("");
  };

  const fi=k=>({...inp(errs[k])});

  if(subview==="form") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Tilbage
      </button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>{editId?"Rediger værktøj":"Tilføj nyt værktøj"}</div>
      {[["name","Værktøjets navn *","f.eks. CNMG 120408 skær"],["articleNumber","Varenr. / bestillingsnr.","f.eks. 979002-SG11M"],["supplier","Leverandør","f.eks. Hoffmann Group"]].map(([k,lbl,ph])=>(
        <div key={k} style={{marginBottom:10}}>
          <label style={label}>{lbl}</label>
          <input style={fi(k)} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}/>
          {errs[k]&&<div style={errMsg}>{errs[k]}</div>}
        </div>
      ))}
      <div style={{marginBottom:10}}>
        <label style={label}>Værktøjstype</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
          {["Endefræser","Bor","Skær","Drejestål","Borestang","Rival","Gevindtap","Gevindfræser","Planfræser","Stikstål","Undersænker","Centerbor"].map(t=>(
            <button key={t} type="button" style={{fontSize:13,padding:"4px 10px",borderRadius:20,border:`1px solid ${form.toolType===t?C.amber:C.border}`,background:form.toolType===t?C.amber+"22":C.raised,color:form.toolType===t?C.amber:C.muted,cursor:"pointer",fontWeight:form.toolType===t?700:400}} onClick={()=>setForm(p=>({...p,toolType:p.toolType===t?"":t}))}>{t}</button>
          ))}
        </div>
        <input style={{...fi("toolType"),marginTop:2}} value={form.toolType} onChange={e=>setForm(p=>({...p,toolType:e.target.value}))} placeholder="Eller skriv en anden type…"/>
      </div>
      <div style={{marginBottom:14}}>
        <button type="button" onClick={()=>setForm(p=>({...p,returnable:!p.returnable}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.returnable?"rgba(59,130,246,.12)":C.raised,border:`1px solid ${form.returnable?"#3b82f6":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.returnable?"#3b82f6":C.border}`,background:form.returnable?"#3b82f6":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.returnable&&<i className="ti ti-check" style={{fontSize:15,color:"#fff"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.returnable?"#3b82f6":C.text,fontWeight:600}}>Værktøj der afleveres</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Værktøjet lånes og afleveres efter brug — lageret bruges ikke op</div>
          </div>
        </button>
        <button type="button" onClick={()=>setForm(p=>({...p,regrindable:!p.regrindable}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.regrindable?"rgba(240,165,0,.1)":C.raised,border:`1px solid ${form.regrindable?C.amber:C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left",marginBottom:8}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.regrindable?C.amber:C.border}`,background:form.regrindable?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.regrindable&&<i className="ti ti-check" style={{fontSize:15,color:"#1a1a1a"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.regrindable?C.amber:C.text,fontWeight:600}}>Værktøj der kan omslibes</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Ved aflevering vælger operatøren: omslebet eller skal omslibes</div>
          </div>
        </button>
        <button type="button" onClick={()=>setForm(p=>({...p,hasConditionRating:!p.hasConditionRating}))}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:form.hasConditionRating?"rgba(250,204,21,.1)":C.raised,border:`1px solid ${form.hasConditionRating?"#facc15":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"left"}}>
          <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${form.hasConditionRating?"#facc15":C.border}`,background:form.hasConditionRating?"#facc15":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {form.hasConditionRating&&<i className="ti ti-check" style={{fontSize:15,color:"#1a1a1a"}}/>}
          </div>
          <div>
            <div style={{fontSize:15,color:form.hasConditionRating?"#facc15":C.text,fontWeight:600}}>Vurdering af stand ★</div>
            <div style={{fontSize:13,color:C.muted,marginTop:1}}>Operatør og admin kan vurdere værktøjets stand med 1–5 stjerner (1 = skal udskiftes)</div>
          </div>
        </button>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Skab *</label>
        {(cabinets||[]).length===0
          ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Ingen skabe oprettet endnu — gå til <strong>Skabe</strong> for at tilføje et først.</div>
          :<select style={{...fi("cabinetId"),color:form.cabinetId?C.text:C.muted}} value={form.cabinetId} onChange={e=>setForm(p=>({...p,cabinetId:e.target.value,drawerId:"",drawerPosition:""}))}>
            <option value="">Vælg skab…</option>
            {(cabinets||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>}
        {errs.cabinetId&&<div style={errMsg}>{errs.cabinetId}</div>}
      </div>
      {form.cabinetId&&(()=>{
        const cab=(cabinets||[]).find(c=>String(c.id)===String(form.cabinetId));
        const drawers=cab?.drawers||[];
        return(
          <div style={{marginBottom:10}}>
            <label style={label}>Skuffe *</label>
            {drawers.length===0
              ?<div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:8,padding:"10px 12px"}}>Skabet har ingen skuffer — gå til Skabe for at tilføje skuffer.</div>
              :<select style={{...fi("drawerId"),color:form.drawerId?C.text:C.muted}} value={form.drawerId} onChange={e=>setForm(p=>({...p,drawerId:e.target.value,drawerPosition:""}))}>
                <option value="">Vælg skuffe…</option>
                {drawers.map(d=><option key={d.id} value={d.id}>Skuffe {d.number}{d.label?` — ${d.label}`:""} ({String.fromCharCode(64+d.rows)}1–{d.cols})</option>)}
              </select>}
            {errs.drawerId&&<div style={errMsg}>{errs.drawerId}</div>}
          </div>
        );
      })()}
      {form.cabinetId&&form.drawerId&&(()=>{
        const cab=(cabinets||[]).find(c=>String(c.id)===String(form.cabinetId));
        const drawer=(cab?.drawers||[]).find(d=>String(d.id)===String(form.drawerId));
        if(!drawer) return null;
        const rows=Array.from({length:drawer.rows},(_,i)=>String.fromCharCode(65+i));
        const cols=Array.from({length:drawer.cols},(_,i)=>i+1);
        return(
          <div style={{marginBottom:16}}>
            <label style={label}>Plads i skuffen</label>
            <div style={{marginTop:8,background:C.raised,borderRadius:10,padding:"12px 10px"}}>
              <div style={{display:"grid",gridTemplateColumns:`18px repeat(${drawer.cols},1fr)`,gap:4,marginBottom:4}}>
                <div/>
                {cols.map(c=><div key={c} style={{textAlign:"center",fontSize:12,color:C.muted,fontWeight:600}}>{c}</div>)}
              </div>
              {rows.map(r=>(
                <div key={r} style={{display:"grid",gridTemplateColumns:`18px repeat(${drawer.cols},1fr)`,gap:4,marginBottom:4}}>
                  <div style={{fontSize:12,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{r}</div>
                  {cols.map(c=>{
                    const pos=`${r}${c}`;const on=form.drawerPosition===pos;
                    return <div key={c} onClick={()=>setForm(p=>({...p,drawerPosition:on?"":pos}))} style={{aspectRatio:"1",borderRadius:4,background:on?C.amber:"rgba(255,255,255,.06)",border:`1.5px solid ${on?C.amber:"rgba(255,255,255,.09)"}`,cursor:"pointer",transition:"all .12s"}}/>;
                  })}
                </div>
              ))}
              {form.drawerPosition
                ?<div style={{fontSize:15,color:C.amber,fontWeight:700,textAlign:"center",marginTop:6,fontFamily:"'Share Tech Mono',monospace",letterSpacing:2}}>Plads {form.drawerPosition}</div>
                :<div style={{fontSize:13,color:C.muted,textAlign:"center",marginTop:6}}>Tryk på en celle for at markere pladsen</div>}
            </div>
          </div>
        );
      })()}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Beholdning (stk) *</label>
          <input type="number" min="0" style={{...fi("quantity"),textAlign:"center",fontSize:20,color:C.amber}} value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} placeholder="0"/>
          {errs.quantity&&<div style={errMsg}>{errs.quantity}</div>}
        </div>
        <div>
          <label style={label}>Genbestil under (stk)</label>
          <input type="number" min="0" style={{...fi("minQuantity"),textAlign:"center",fontSize:20,color:C.red}} value={form.minQuantity} onChange={e=>setForm(p=>({...p,minQuantity:e.target.value}))} placeholder="0"/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={label}>Beskrivelse</label>
        <input style={fi("description")} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="f.eks. negativt drejeskær til stål og rustfrit"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label style={label}>Anbefalet skærehastighed</label>
          <input style={fi("recommendedSpeed")} value={form.recommendedSpeed} onChange={e=>setForm(p=>({...p,recommendedSpeed:e.target.value}))} placeholder="f.eks. 250–350 m/min"/>
        </div>
        <div>
          <label style={label}>Anbefalet tilspænding</label>
          <input style={fi("recommendedFeed")} value={form.recommendedFeed} onChange={e=>setForm(p=>({...p,recommendedFeed:e.target.value}))} placeholder="f.eks. 0,2–0,4 mm/omdr."/>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Materialer (ISO-grupper)</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
          {ISO_MAT.map(m=>{
            const on=(form.material||[]).includes(m.code);
            return(
              <button key={m.code} type="button"
                onClick={()=>setForm(p=>{const ms=p.material||[];return{...p,material:on?ms.filter(x=>x!==m.code):[...ms,m.code]};})}
                style={{padding:"8px 14px",borderRadius:10,border:`2px solid ${on?m.color:"rgba(255,255,255,.1)"}`,background:on?m.bg:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all .15s",textAlign:"center",minWidth:58}}>
                <div style={{fontSize:18,fontWeight:700,color:on?m.color:C.muted,letterSpacing:1}}>{m.code}</div>
                <div style={{fontSize:11,color:on?m.color:C.muted,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{m.name}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <label style={label}>Foto af værktøjet</label>
        {form.photoData
          ?<div style={{border:"2px dashed rgba(39,174,96,.4)",borderRadius:8,padding:12,textAlign:"center",background:"rgba(39,174,96,.05)"}}>
            <img src={form.photoData} style={{maxHeight:130,borderRadius:6,display:"block",margin:"0 auto 8px",border:`1px solid ${C.border}`}}/>
            <div style={{fontSize:14,color:C.green,letterSpacing:1,marginBottom:8}}>Foto vedhæftet</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button type="button" style={btn("outline",false,true)} onClick={()=>photoCamRef.current.click()}><i className="ti ti-camera"/> Tag igen</button>
              <button type="button" style={btn("outline",false,true)} onClick={()=>photoRef.current.click()}><i className="ti ti-upload"/> Udskift</button>
              <button type="button" style={{...btn("danger",false,true)}} onClick={()=>setForm(p=>({...p,photoData:null}))}><i className="ti ti-x"/> Fjern</button>
            </div>
          </div>
          :<div style={{display:"flex",gap:8}}>
            <button type="button" style={{...btn("outline",false,false),flex:1,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,borderRadius:8,fontSize:15}} onClick={()=>photoCamRef.current.click()}>
              <i className="ti ti-camera" style={{fontSize:24}}/>Tag foto
            </button>
            <button type="button" style={{...btn("outline",false,false),flex:1,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,borderRadius:8,fontSize:15}} onClick={()=>photoRef.current.click()}>
              <i className="ti ti-upload" style={{fontSize:24}}/>Upload
            </button>
          </div>}
        <input type="file" ref={photoCamRef} accept="image/*" capture="environment" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
        <input type="file" ref={photoRef} accept="image/*" style={{display:"none"}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>resizeImage(ev.target.result).then(d=>setForm(p=>({...p,photoData:d})));r.readAsDataURL(f);}}/>
      </div>
      <button style={btn("success",true)} onClick={save}><i className="ti ti-check"/> {editId?"Gem ændringer":"Tilføj værktøj"}</button>
    </div>
  );

  if(subview==="log") return(
    <div>
      <button style={{...btn("outline",false,true),marginBottom:14,display:"flex",alignItems:"center",gap:6}} onClick={()=>setSubview("list")}>
        <i className="ti ti-arrow-left"/> Tilbage
      </button>
      <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}><i className="ti ti-history"/> Log over værktøjsbrug</div>
      {(toolLog||[]).length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Intet forbrug registreret endnu.</div>}
      {[...(toolLog||[])].reverse().map(e=>(
        <div key={e.id} style={{...card(),marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className={`ti ti-${e.action==="restock"?"package-import":"minus"}`} style={{fontSize:16,color:e.action==="restock"?C.green:C.amber}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.toolName}</div>
            <div style={{fontSize:13,color:C.muted,marginTop:2}}>{e.operatorName} · {fmtDate(e.timestamp)}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:16,fontWeight:700,color:e.action==="restock"?C.green:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{e.action==="restock"?"+":"-"}{e.quantity}</div>
            <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase"}}>{TOOL_ACTION_NAME[e.action]||e.action}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const lowTools=tools.filter(t=>t.active&&t.quantity<=(t.minQuantity||0));
  const orderedTools=tools.filter(t=>t.ordered);
  const allFilteredTools=toolFilter==="low"?lowTools:toolFilter==="ordered"?orderedTools:tools;
  const filteredTools=selectedCabinet?allFilteredTools.filter(t=>String(t.cabinetId)===selectedCabinet):allFilteredTools;
  const selectedTool=selectedId?tools.find(t=>String(t.id)===String(selectedId)):null;
  const closeModal=()=>{setSelectedId(null);setRestockId(null);setRestockQty("");setDeleteConfirm(false);};

  // Cabinet gallery for admin
  if(!selectedCabinet) return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button style={btn("primary",false,true)} onClick={openAdd}><i className="ti ti-plus"/> Tilføj værktøj</button>
        <button style={btn("outline",false,true)} onClick={()=>setSubview("log")}><i className="ti ti-history"/> Forbrugslog</button>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          {[["all","Alle"],["low","Lav beholdning"],["ordered","Bestilt"]].map(([f,lb])=>(
            <button key={f} style={{...btn(toolFilter===f?"blue":"outline",false,true),position:"relative"}} onClick={()=>setToolFilter(f)}>
              {lb}
              {f==="low"&&lowTools.length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{lowTools.length}</span>}
              {f==="ordered"&&orderedTools.length>0&&<span style={{background:"#3b82f6",color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{orderedTools.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {(cabinets||[]).length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Ingen skabe endnu. Tilføj et under Skabe.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {(cabinets||[]).map(cab=>{
          const cabTools=allFilteredTools.filter(t=>String(t.cabinetId)===String(cab.id));
          const hasLow=cabTools.some(t=>t.active&&t.quantity<=(t.minQuantity||0));
          const hasAlert=cabTools.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0||t.broken||((t.conditionStars||0)===1&&t.hasConditionRating));
          return(
            <div key={cab.id} onClick={()=>setSelectedCabinet(String(cab.id))} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {cab.photoData?<img src={cab.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><i className="ti ti-archive" style={{fontSize:40,color:C.muted,opacity:0.2}}/><div style={{fontSize:16,fontWeight:700,color:C.muted,opacity:0.5}}>{cab.name}</div></div>}
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.75))",padding:"24px 12px 8px"}}>
                  <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{cab.name}</div>
                  <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{allFilteredTools.filter(t=>String(t.cabinetId)===String(cab.id)).length} værktøj</div>
                </div>
                {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button style={{...btn("outline",false,true),padding:"8px 10px"}} onClick={()=>setSelectedCabinet(null)}><i className="ti ti-arrow-left"/></button>
        <button style={btn("primary",false,true)} onClick={openAdd}><i className="ti ti-plus"/> Tilføj værktøj</button>
        <button style={btn("outline",false,true)} onClick={()=>setSubview("log")}><i className="ti ti-history"/> Forbrugslog</button>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
          {[["all","Alle"],["low","Lav beholdning"],["ordered","Bestilt"]].map(([f,lb])=>(
            <button key={f} style={{...btn(toolFilter===f?"blue":"outline",false,true),position:"relative"}} onClick={()=>setToolFilter(f)}>
              {lb}
              {f==="low"&&lowTools.length>0&&<span style={{background:C.red,color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{lowTools.length}</span>}
              {f==="ordered"&&orderedTools.length>0&&<span style={{background:"#3b82f6",color:"white",borderRadius:20,fontSize:11,padding:"0px 5px",marginLeft:5,fontWeight:700}}>{orderedTools.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {(()=>{const cab=(cabinets||[]).find(c=>String(c.id)===selectedCabinet);return cab?<div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}><i className="ti ti-archive"/> {cab.name}</div>:null;})()}
      {filteredTools.length===0&&<div style={{textAlign:"center",padding:"20px",color:C.muted,fontSize:15}}>Intet værktøj {selectedCabinet?"i dette skab":"matcher filteret"}.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {filteredTools.map(tool=>{
          const checkedOut=tool.returnable?(tool.checkedOutCount||0):0;
          const damaged=tool.returnable?(tool.damagedCount||0):0;
          const available=tool.returnable?tool.quantity-checkedOut-damaged:tool.quantity;
          const isLow=tool.active&&!tool.returnable&&tool.quantity<=(tool.minQuantity||0);
          const isOut=available<=0;
          const allInUse=tool.returnable&&isOut;
          const qColor=isOut?C.red:isLow?C.amber:C.green;
          return(
            <div key={tool.id} onClick={()=>setSelectedId(tool.id)}
              style={{background:C.surface,borderRadius:10,border:`1px solid ${allInUse?C.red:isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer",opacity:tool.active?1:0.45}}>
              <div style={{position:"relative",width:"100%",aspectRatio:"3/2",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {tool.photoData
                  ?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  :<i className="ti ti-tool" style={{fontSize:24,color:C.muted,opacity:0.3}}/>}
                <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:6,padding:"3px 8px",fontSize:19,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.3"}}>{available}</div>
                {!tool.active&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-eye-off" style={{fontSize:20,color:"rgba(255,255,255,.6)"}}/></div>}
                {tool.active&&isLow&&!tool.ordered&&!allInUse&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.88)",color:"#1a1a1a"}}>LAV BEHOLDNING</div>}
                {tool.active&&tool.regrindable&&tool.needsRegrinding&&!allInUse&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.92)",color:"#1a1a1a"}}><i className="ti ti-tool"/> Skal omslibes</div>}
                {tool.active&&damaged>0&&!allInUse&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.88)",color:"#fff"}}><i className="ti ti-alert-triangle"/> {damaged} Beskadiget</div>}
                {tool.active&&tool.broken&&!tool.ordered&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.95)",color:"#fff"}}><i className="ti ti-tools"/> I stykker — genbestil</div>}
                {tool.active&&tool.hasConditionRating&&(tool.conditionStars||0)===1&&!tool.broken&&!tool.ordered&&<div style={{position:"absolute",top:5,left:5,background:"rgba(248,113,113,.9)",borderRadius:4,padding:"1px 5px",fontSize:12,fontWeight:700,color:"#fff"}}>1★ Dårlig</div>}
                {tool.active&&(()=>{const byList=tool.returnable?(tool.checkedOutBy||[]):[];if(!byList.length||tool.ordered)return null;const bg=allInUse?"rgba(231,76,60,.88)":"rgba(0,0,0,.72)";return(<div style={{position:"absolute",inset:0,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"6px 4px"}}>
                  <i className="ti ti-clock" style={{fontSize:allInUse?22:16,color:"#fff",marginBottom:2}}/>
                  {allInUse&&<div style={{fontSize:14,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff",marginBottom:2}}>ALLE I BRUG</div>}
                  {byList.map((x,i)=><div key={i} style={{fontSize:13,color:"rgba(255,255,255,.9)",fontWeight:600,lineHeight:1.2,textAlign:"center",maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.operatorName}</div>)}
                  {tool.needsRegrinding&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",letterSpacing:.5,textTransform:"uppercase",marginTop:2}}>⚠ skal omslibes</div>}
                </div>);})()}
                {tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><i className="ti ti-checks" style={{fontSize:26,color:"#fff"}}/><div style={{fontSize:16,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>BESTILT</div></div>}
              </div>
              <div style={{padding:"8px 8px 10px"}}>
                <div style={{fontSize:16,color:C.text,fontWeight:700,lineHeight:1.3,marginBottom:5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  {tool.toolType&&<span style={{fontSize:13,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>{tool.toolType}</span>}
                  {tool.returnable&&<span style={{fontSize:13,fontWeight:600,color:"#22d3ee",background:"rgba(34,211,238,.1)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>↩ Afleveres</span>}
                  {tool.broken&&<span style={{fontSize:13,fontWeight:700,color:C.red,background:"rgba(231,76,60,.12)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>⚠ I stykker</span>}
                  {tool.hasConditionRating&&(tool.conditionStars||0)>0&&(
                    <span style={{fontSize:13,color:(tool.conditionStars||0)<=1?"#f87171":(tool.conditionStars||0)<=2?C.amber:"#facc15",letterSpacing:1}}>
                      {"★".repeat(tool.conditionStars||0)}{"☆".repeat(5-(tool.conditionStars||0))}
                    </span>
                  )}
                  {Array.isArray(tool.material)&&tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:13,fontWeight:700,color:m.color,background:m.bg,padding:"2px 5px",borderRadius:4,letterSpacing:.5}}>{code}</span>:null;})}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTool&&(
        <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"16px 16px 0 0",maxHeight:"90vh",overflowY:"auto",padding:"0 16px 36px"}}>
            <div style={{position:"sticky",top:0,background:C.surface,paddingTop:14,paddingBottom:6,zIndex:1}}>
              <div style={{width:36,height:4,background:C.raised,borderRadius:2,margin:"0 auto"}}/>
            </div>
            {selectedTool.photoData&&<img src={selectedTool.photoData} style={{width:"100%",maxHeight:180,objectFit:"contain",borderRadius:10,background:C.raised,marginBottom:14,border:`1px solid ${C.border}`,display:"block"}}/>}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
              <div style={{fontSize:20,color:C.text,fontWeight:700,lineHeight:1.3}}>{selectedTool.name}</div>
              {selectedTool.toolType&&<span style={{fontSize:14,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"3px 9px",borderRadius:20,border:"1px solid rgba(148,163,184,.25)",whiteSpace:"nowrap"}}>{selectedTool.toolType}</span>}
            </div>
            {selectedTool.articleNumber&&<div style={{fontSize:14,color:C.muted,marginBottom:6}}>{selectedTool.articleNumber}</div>}
            {!selectedTool.active&&<div style={{...badge("down"),display:"inline-flex",marginBottom:8,fontSize:12}}>SKJULT FOR OPERATØRER</div>}
            {Array.isArray(selectedTool.material)&&selectedTool.material.length>0&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Materiale</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {selectedTool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{padding:"5px 10px",borderRadius:8,border:`1.5px solid ${m.color}`,background:m.bg,fontSize:14,fontWeight:700,color:m.color}}>{code} <span style={{fontWeight:400,fontSize:12}}>{m.name}</span></span>:null;})}
                </div>
              </div>
            )}
            {selectedTool.description&&<div style={{fontSize:15,color:C.muted,marginBottom:12,lineHeight:1.55}}>{selectedTool.description}</div>}
            {(()=>{
              const cab=(cabinets||[]).find(c=>String(c.id)===String(selectedTool.cabinetId));
              const drawer=cab?(cab.drawers||[]).find(d=>String(d.id)===String(selectedTool.drawerId)):null;
              const cabinetName=cab?.name||(selectedTool.drawer||null);
              const rows=drawer?Array.from({length:drawer.rows},(_,i)=>String.fromCharCode(65+i)):DRAWER_ROWS;
              const cols=drawer?Array.from({length:drawer.cols},(_,i)=>i+1):DRAWER_COLS;
              if(!cabinetName&&!selectedTool.drawerPosition&&!selectedTool.location) return null;
              return(
                <div style={{background:C.raised,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Placering</div>
                  {cabinetName&&<div style={{fontSize:16,color:C.text,fontWeight:600,lineHeight:1.3,marginBottom:2}}>{cabinetName}</div>}
                  {drawer&&<div style={{fontSize:14,color:C.muted,marginBottom:selectedTool.drawerPosition?10:0}}>Skuffe {drawer.number}{drawer.label?` — ${drawer.label}`:""}</div>}
                  {selectedTool.drawerPosition?(
                    <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                          <div/>{cols.map(c=><div key={c} style={{textAlign:"center",fontSize:11,color:C.muted,fontWeight:600}}>{c}</div>)}
                        </div>
                        {rows.map(r=>(
                          <div key={r} style={{display:"grid",gridTemplateColumns:`16px repeat(${cols.length},20px)`,gap:3,marginBottom:3}}>
                            <div style={{fontSize:11,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center"}}>{r}</div>
                            {cols.map(c=>{const pos=`${r}${c}`;const active=selectedTool.drawerPosition===pos;return <div key={c} style={{width:20,height:20,borderRadius:3,background:active?C.amber:"rgba(255,255,255,.06)",border:`1px solid ${active?C.amber:"rgba(255,255,255,.08)"}`}}/>;  })}
                          </div>
                        ))}
                      </div>
                      <div style={{paddingTop:6}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Plads</div>
                        <div style={{fontSize:34,fontWeight:700,color:C.amber,fontFamily:"'Share Tech Mono',monospace",lineHeight:1}}>{selectedTool.drawerPosition}</div>
                      </div>
                    </div>
                  ):(selectedTool.location&&<div style={{fontSize:15,color:C.text}}>{selectedTool.location}</div>)}
                </div>
              );
            })()}
            {(()=>{
              const co=selectedTool.returnable?(selectedTool.checkedOutCount||0):0;
              const dmg=selectedTool.returnable?(selectedTool.damagedCount||0):0;
              const avail=selectedTool.returnable?selectedTool.quantity-co-dmg:selectedTool.quantity;
              const byList=selectedTool.returnable?(selectedTool.checkedOutBy||[]):[];
              return(
                <div style={{marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    {selectedTool.returnable?(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Ledig</div>
                        <div style={{fontSize:20,fontWeight:700,color:avail<=0?C.red:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{avail}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> / {selectedTool.quantity}</span></div>
                        {co>0&&<div style={{fontSize:13,color:C.amber,marginTop:2}}>{co} i brug</div>}
                        {dmg>0&&<div style={{fontSize:13,color:C.red,marginTop:1}}>{dmg} beskadiget</div>}
                      </div>
                    ):(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>På lager</div><div style={{fontSize:20,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    )}
                    <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Genbestil under</div><div style={{fontSize:16,fontWeight:700,color:C.red,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.minQuantity||0}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    {selectedTool.recommendedSpeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Hastighed</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedSpeed}</div></div>}
                    {selectedTool.recommendedFeed&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Tilspænding</div><div style={{fontSize:15,color:C.text}}>{selectedTool.recommendedFeed}</div></div>}
                    {selectedTool.supplier&&<div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Leverandør</div><div style={{fontSize:15,color:C.text}}>{selectedTool.supplier}</div></div>}
                  </div>
                  {byList.length>0&&(
                    <div style={{background:C.raised,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>I brug af</div>
                      {byList.map((x,i)=>(
                        <div key={i} style={{fontSize:15,color:C.text,display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:i<byList.length-1?`1px solid ${C.border}`:"none"}}>
                          <i className="ti ti-user" style={{fontSize:15,color:C.muted}}/>{x.operatorName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {selectedTool.hasConditionRating&&(
              <div style={{marginBottom:14,background:C.raised,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Værktøjets stand</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {[1,2,3,4,5].map(s=>(
                    <button key={s} onClick={()=>updateTool(selectedTool.id,{conditionStars:s})} style={{background:"none",border:"none",cursor:"pointer",padding:4,minWidth:44,minHeight:44,fontSize:24,color:(selectedTool.conditionStars||0)>=s?"#facc15":"rgba(255,255,255,.18)",lineHeight:1}}>★</button>
                  ))}
                  <span style={{fontSize:13,color:C.muted,marginLeft:4}}>
                    {!selectedTool.conditionStars?"Ikke vurderet endnu":selectedTool.conditionStars===1?"⚠ Dårlig — overvej at købe nyt":selectedTool.conditionStars===2?"Nogenlunde":selectedTool.conditionStars===3?"God":selectedTool.conditionStars===4?"Meget god":"Ny / som ny"}
                  </span>
                </div>
              </div>
            )}
            {selectedTool.broken&&(
              <div style={{background:"rgba(231,76,60,.12)",border:`1px solid rgba(231,76,60,.5)`,borderRadius:8,padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                <i className="ti ti-alert-triangle" style={{color:C.red,fontSize:18,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:2}}>Meldt i stykker — skal genbestilles</div>
                  <div style={{fontSize:13,color:C.muted}}>En operatør har meldt værktøjet i stykker.</div>
                </div>
                <button style={{...btn("outline",false,true),fontSize:13,padding:"4px 8px",borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>updateTool(selectedTool.id,{broken:false})}>Ryd</button>
              </div>
            )}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
              {restockId===selectedTool.id?(
                <div>
                  <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Hvor mange stk skal tilføjes?</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <input type="number" min="1" style={{...inp(),flex:1,fontSize:20,textAlign:"center",color:C.green}} value={restockQty} onChange={e=>setRestockQty(e.target.value)} placeholder="0"/>
                    <button style={btn("success",false,false)} onClick={()=>doRestock(selectedTool)}><i className="ti ti-check"/> Tilføj</button>
                    <button style={btn("outline",false,true)} onClick={()=>{setRestockId(null);setRestockQty("");}}>Annuller</button>
                  </div>
                </div>
              ):<button style={btn("success",true)} onClick={()=>{setRestockId(selectedTool.id);setRestockQty("");}}><i className="ti ti-package-import"/> Fyld op</button>}
              {selectedTool.regrindable&&selectedTool.needsRegrinding&&(
                <button style={{...btn("outline",true),borderColor:C.amber,color:C.amber}} onClick={()=>updateTool(selectedTool.id,{needsRegrinding:false})}>
                  <i className="ti ti-check"/> Marker som omslebet
                </button>
              )}
              {(selectedTool.damagedCount||0)>0&&(
                <button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.5)",color:C.red}} onClick={()=>updateTool(selectedTool.id,{damagedCount:0})}>
                  <i className="ti ti-refresh"/> Marker som udskiftet ({selectedTool.damagedCount} damaged)
                </button>
              )}
              {selectedTool.quantity<=(selectedTool.minQuantity||0)&&(
                <button style={btn(selectedTool.ordered?"blue":"outline",true)} onClick={()=>updateTool(selectedTool.id,{ordered:!selectedTool.ordered})}>
                  <i className={`ti ti-${selectedTool.ordered?"checks":"shopping-cart"}`}/> {selectedTool.ordered?"Bestilt — tryk for at fjerne markering":"Marker som bestilt"}
                </button>
              )}
              {selectedTool.hasConditionRating&&(selectedTool.conditionStars||0)===1&&(
                <button style={btn(selectedTool.conditionOrdered?"blue":"outline",true)} onClick={()=>updateTool(selectedTool.id,{conditionOrdered:!selectedTool.conditionOrdered})}>
                  <i className={`ti ti-${selectedTool.conditionOrdered?"checks":"alert-triangle"}`}/> {selectedTool.conditionOrdered?"Erstatning bestilt — tryk for at fjerne markering":"Bestil erstatning (dårlig stand)"}
                </button>
              )}
              <button style={btn("outline",true)} onClick={()=>{closeModal();openEdit(selectedTool);}}><i className="ti ti-edit"/> Rediger værktøj</button>
              <button style={btn(selectedTool.active?"danger":"outline",true)} onClick={()=>{updateTool(selectedTool.id,{active:!selectedTool.active});closeModal();}}>
                <i className={`ti ti-${selectedTool.active?"eye-off":"eye"}`}/> {selectedTool.active?"Skjul for operatører":"Gør synlig"}
              </button>
              {!deleteConfirm
                ?<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>setDeleteConfirm(true)}><i className="ti ti-trash"/> Slet værktøj</button>
                :<div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:14,color:C.red,marginBottom:10,fontWeight:600}}>Slet "{selectedTool.name}" permanent?</div>
                  <div style={{display:"flex",gap:8}}>
                    <button style={{...btn("danger",false,false),flex:1}} onClick={()=>{setTools(prev=>prev.filter(t=>t.id!==selectedTool.id));sendToolOp({type:"delete",toolId:selectedTool.id});closeModal();}}><i className="ti ti-trash"/> Ja, slet</button>
                    <button style={btn("outline",false,true)} onClick={()=>setDeleteConfirm(false)}>Annuller</button>
                  </div>
                </div>}
            </div>
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Luk</button>
          </div>
        </div>
      )}
    </div>
  );
}
