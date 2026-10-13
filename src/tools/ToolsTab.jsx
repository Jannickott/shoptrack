import { useState, useEffect } from "react";
import { notify } from "../components/Feedback";
import { sendToolOp } from "../lib/api";
import { C, ISO_MAT, DRAWER_ROWS, DRAWER_COLS, inp, btn, badge } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// TOOLS TAB — operator view
// ═══════════════════════════════════════════════════════
export function ToolsTab({user,tools,setTools,toolLog,setToolLog,cabinets,saveNow,focusToolId,setFocusToolId}){
  const [search,setSearch]=useState("");
  const [selectedCabinet,setSelectedCabinet]=useState(null);
  const [selectedType,setSelectedType]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusToolId){
    const ft=tools.find(t2=>String(t2.id)===String(focusToolId));
    if(ft)setSelectedCabinet(String(ft.cabinetId));
    setSelectedId(focusToolId);setFocusToolId&&setFocusToolId(null);
  }},[focusToolId]);
  const [takeQty,setTakeQty]=useState(1);

  const userDepts=user.departments||[];

  // All tools visible to this operator (dept filter)
  const deptVisible=tools.filter(t=>{
    if(!t.active) return false;
    if(userDepts.length>0){
      const cab=(cabinets||[]).find(c=>String(c.id)===String(t.cabinetId));
      const cabDepts=cab?.departments||[];
      if(cabDepts.length>0&&!cabDepts.some(d=>userDepts.includes(d))) return false;
    }
    return true;
  });

  // Cabinets that have at least one visible tool, filtered by dept
  const visibleCabinets=(cabinets||[]).filter(c=>{
    if(userDepts.length>0){const cd=c.departments||[];if(cd.length>0&&!cd.some(d=>userDepts.includes(d)))return false;}
    return deptVisible.some(t=>String(t.cabinetId)===String(c.id));
  });

  // Tools in the selected cabinet (or all if no cabinet selected)
  const cabVisible=selectedCabinet?deptVisible.filter(t=>String(t.cabinetId)===selectedCabinet):deptVisible;

  // Group by toolType within selected cabinet, sort each group A→Z
  const grouped={};
  cabVisible.forEach(t=>{const key=t.toolType||"Andet";if(!grouped[key])grouped[key]=[];grouped[key].push(t);});
  Object.values(grouped).forEach(arr=>arr.sort((a,b)=>(a.name||"").localeCompare(b.name)));
  const categories=Object.keys(grouped).sort((a,b)=>{if(a==="Andet")return 1;if(b==="Andet")return -1;return a.localeCompare(b);});

  // If searching, show all matching tools across all cabinets sorted A→Z
  const searchQ=search.trim().toLowerCase();
  const searchResults=searchQ?deptVisible.filter(t=>(t.name||"").toLowerCase().includes(searchQ)||(t.articleNumber||"").toLowerCase().includes(searchQ)).sort((a,b)=>(a.name||"").localeCompare(b.name)):[];

  const typeTools=selectedType?(grouped[selectedType]||[]):[];
  const selectedTool=selectedId?tools.find(t=>String(t.id)===String(selectedId)):null;

  // Apply a tool op locally (instant feedback) and send it to the server
  const toolOp=(op,localUpdate)=>{
    setTools(prev=>prev.map(t=>t.id===selectedTool.id?localUpdate(t):t));
    if(op.log) setToolLog(prev=>[...prev,op.log]);
    sendToolOp({type:"update",toolId:selectedTool.id,...op});
  };
  const logEntry=(action,quantity)=>{const now=Date.now();return{id:now,toolId:selectedTool.id,toolName:selectedTool.name,operatorId:user.id,operatorName:user.name,quantity,action,timestamp:now};};
  const _removeOneCheckout=(byArr)=>{
    const myIdx=byArr.findIndex(x=>x.operatorId===user.id);
    return myIdx>=0?[...byArr.slice(0,myIdx),...byArr.slice(myIdx+1)]:byArr.slice(0,-1);
  };
  const doTake=()=>{
    if(!selectedTool) return;
    const qty=parseInt(takeQty)||1;
    if(qty<1||qty>selectedTool.quantity) return;
    toolOp({inc:{quantity:-qty},log:logEntry("take",qty)},t=>({...t,quantity:Math.max(0,t.quantity-qty)}));
    setSelectedId(null);setTakeQty(1);
    notify(`Taget: ${qty} stk ${selectedTool.name}`);
  };
  const doCheckout=()=>{
    if(!selectedTool||!selectedTool.returnable) return;
    const available=selectedTool.quantity-(selectedTool.checkedOutCount||0)-(selectedTool.damagedCount||0);
    if(available<1) return;
    const by={operatorId:user.id,operatorName:user.name,timestamp:Date.now()};
    toolOp({inc:{checkedOutCount:1},checkout:by,log:logEntry("checkout",1)},
      t=>({...t,checkedOutCount:(t.checkedOutCount||0)+1,checkedOutBy:[...(t.checkedOutBy||[]),by]}));
    setSelectedId(null);setTakeQty(1);
    notify(`Lånt: ${selectedTool.name}`);
  };
  const doReturn=(regrinded=null)=>{
    if(!selectedTool||!selectedTool.returnable) return;
    if((selectedTool.checkedOutCount||0)<1) return;
    const set=selectedTool.regrindable&&regrinded!==null?{needsRegrinding:!regrinded}:{};
    const action=regrinded===true?"return-regrinded":regrinded===false?"return-needs-regrind":"return";
    toolOp({inc:{checkedOutCount:-1},set,returnBy:user.id,log:logEntry(action,1)},
      t=>({...t,...set,checkedOutCount:Math.max(0,(t.checkedOutCount||0)-1),checkedOutBy:_removeOneCheckout(t.checkedOutBy||[])}));
    setSelectedId(null);setTakeQty(1);
    notify(`Afleveret: ${selectedTool.name}`);
  };
  const doReturnDamaged=()=>{
    if(!selectedTool||!selectedTool.returnable) return;
    if((selectedTool.checkedOutCount||0)<1) return;
    toolOp({inc:{checkedOutCount:-1,damagedCount:1},returnBy:user.id,log:logEntry("return-damaged",1)},
      t=>({...t,checkedOutCount:Math.max(0,(t.checkedOutCount||0)-1),damagedCount:(t.damagedCount||0)+1,checkedOutBy:_removeOneCheckout(t.checkedOutBy||[])}));
    setSelectedId(null);setTakeQty(1);
    notify(`Afleveret som beskadiget: ${selectedTool.name}`,"warn");
  };
  const doReportBroken=()=>{
    if(!selectedTool) return;
    const set={broken:true,quantity:0,checkedOutCount:0,checkedOutBy:[],damagedCount:0};
    toolOp({set},t=>({...t,...set}));
    setSelectedId(null);setTakeQty(1);
    notify(`Meldt i stykker: ${selectedTool.name} — admin får besked`,"warn");
  };
  const setConditionStars=(stars)=>{
    if(!selectedTool) return;
    toolOp({set:{conditionStars:stars}},t=>({...t,conditionStars:stars}));
  };
  const closeModal=()=>{setSelectedId(null);setTakeQty(1);};

  // Reusable tool card renderer
  const renderToolCard=(tool)=>{
    const checkedOut=tool.returnable?(tool.checkedOutCount||0):0;
    const damaged=tool.returnable?(tool.damagedCount||0):0;
    const available=tool.broken?0:tool.returnable?tool.quantity-checkedOut-damaged:tool.quantity;
    const isLow=!tool.returnable&&!tool.broken&&tool.quantity<=(tool.minQuantity||0);
    const isOut=available<=0;
    const allInUse=tool.returnable&&isOut&&!tool.broken;
    const qColor=tool.broken?C.red:isOut?C.red:isLow?C.amber:C.green;
    const stars=tool.hasConditionRating?(tool.conditionStars||0):0;
    const starColor=stars<=1?"#f87171":stars<=2?C.amber:"#facc15";
    return(
      <div key={tool.id} onClick={()=>{setSelectedId(tool.id);setTakeQty(1);}}
        style={{background:C.surface,borderRadius:10,border:`1px solid ${tool.broken?C.red:allInUse?C.red:isLow?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
        <div style={{position:"relative",width:"100%",aspectRatio:"3/2",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {tool.photoData?<img src={tool.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<i className="ti ti-tool" style={{fontSize:24,color:C.muted,opacity:0.3}}/>}
          <div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.78)",borderRadius:6,padding:"3px 8px",fontSize:19,fontWeight:700,color:qColor,fontFamily:"'Share Tech Mono',monospace",lineHeight:"1.3"}}>{available}</div>
          {/* Stars on photo — bottom-left */}
          {stars>0&&!tool.broken&&!tool.ordered&&!tool.conditionOrdered&&<div style={{position:"absolute",bottom:4,left:5,fontSize:39,lineHeight:1,letterSpacing:0,textShadow:"0 2px 6px rgba(0,0,0,.9)",color:starColor}}>{"★".repeat(stars)}{"☆".repeat(5-stars)}</div>}
          {isLow&&!tool.ordered&&!allInUse&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.88)",color:"#1a1a1a"}}>LAV BEHOLDNING</div>}
          {tool.regrindable&&tool.needsRegrinding&&!allInUse&&!tool.ordered&&!tool.broken&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(240,165,0,.92)",color:"#1a1a1a"}}><i className="ti ti-tool"/> Skal omslibes</div>}
          {damaged>0&&!allInUse&&!tool.ordered&&!tool.broken&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"5px 0",textAlign:"center",fontSize:14,letterSpacing:.8,textTransform:"uppercase",fontWeight:700,background:"rgba(231,76,60,.88)",color:"#fff"}}><i className="ti ti-alert-triangle"/> {damaged} Beskadiget</div>}
          {/* Broken — full red overlay */}
          {tool.broken&&!tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(231,76,60,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
            <i className="ti ti-tools" style={{fontSize:26,color:"#fff"}}/>
            <div style={{fontSize:15,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>I STYKKER</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)",letterSpacing:.5}}>Kontakt admin</div>
          </div>}
          {(()=>{const byList=tool.returnable?(tool.checkedOutBy||[]):[];if(!byList.length||tool.ordered||tool.broken)return null;const bg=allInUse?"rgba(231,76,60,.88)":"rgba(0,0,0,.72)";return(<div style={{position:"absolute",inset:0,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"6px 4px"}}>
            <i className="ti ti-clock" style={{fontSize:allInUse?22:16,color:"#fff",marginBottom:2}}/>
            {allInUse&&<div style={{fontSize:14,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff",marginBottom:2}}>ALLE I BRUG</div>}
            {byList.map((x,i)=><div key={i} style={{fontSize:13,color:"rgba(255,255,255,.9)",fontWeight:600,lineHeight:1.2,textAlign:"center",maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.operatorName}</div>)}
            {tool.needsRegrinding&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",letterSpacing:.5,textTransform:"uppercase",marginTop:2}}>⚠ skal omslibes</div>}
          </div>);})()}
          {tool.conditionOrdered&&!tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
            <i className="ti ti-alert-triangle" style={{fontSize:24,color:"#fff"}}/>
            <div style={{fontSize:13,letterSpacing:1.2,textTransform:"uppercase",fontWeight:800,color:"#fff",textAlign:"center",padding:"0 8px",lineHeight:1.3}}>DÅRLIG STAND</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.85)",letterSpacing:.5}}>Nyt værktøj er bestilt</div>
          </div>}
          {tool.ordered&&<div style={{position:"absolute",inset:0,background:"rgba(59,130,246,.82)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><i className="ti ti-checks" style={{fontSize:26,color:"#fff"}}/><div style={{fontSize:16,letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,color:"#fff"}}>BESTILT</div></div>}
        </div>
        <div style={{padding:"8px 8px 10px"}}>
          <div style={{fontSize:16,color:C.text,fontWeight:700,lineHeight:1.3,marginBottom:5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{tool.name}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            {tool.returnable&&<span style={{fontSize:13,fontWeight:600,color:"#22d3ee",background:"rgba(34,211,238,.1)",padding:"2px 6px",borderRadius:4,letterSpacing:.3}}>↩ Afleveres</span>}
            {Array.isArray(tool.material)&&tool.material.map(code=>{const m=ISO_MAT.find(x=>x.code===code);return m?<span key={code} style={{fontSize:13,fontWeight:700,color:m.color,background:m.bg,padding:"2px 5px",borderRadius:4,letterSpacing:.5}}>{code}</span>:null;})}
          </div>
        </div>
      </div>
    );
  };

  return(
    <div style={{padding:"14px 16px"}}>
      {/* Search — always visible */}
      <div style={{position:"relative",marginBottom:14,display:"flex",gap:8,alignItems:"center"}}>
        {!searchQ&&(selectedCabinet||selectedType)&&(
          <button style={{flexShrink:0,padding:"8px 12px",background:C.raised,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,cursor:"pointer",fontSize:16}}
            onClick={()=>{if(selectedType){setSelectedType(null);}else{setSelectedCabinet(null);}}}>
            <i className="ti ti-arrow-left"/>
          </button>
        )}
        <div style={{position:"relative",flex:1}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
          <input style={{...inp(),paddingLeft:32,width:"100%"}} value={search} onChange={e=>setSearch(e.target.value)} placeholder={selectedType&&!searchQ?`Søg i ${selectedType}…`:"Søg værktøj…"}/>
        </div>
      </div>

      {/* Cabinet gallery — shown first when no cabinet selected */}
      {!searchQ&&!selectedCabinet&&(
        <>
          {visibleCabinets.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj tilgængeligt.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {visibleCabinets.map(cab=>{
              const cabTools=deptVisible.filter(t=>String(t.cabinetId)===String(cab.id));
              const hasAlert=cabTools.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0);
              return(
                <div key={cab.id} onClick={()=>setSelectedCabinet(String(cab.id))} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
                  <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {cab.photoData?<img src={cab.photoData} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><i className="ti ti-archive" style={{fontSize:40,color:C.muted,opacity:0.2}}/><div style={{fontSize:16,fontWeight:700,color:C.muted,opacity:0.5}}>{cab.name}</div></div>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.75))",padding:"24px 12px 8px"}}>
                      <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{cab.name}</div>
                      <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{cabTools.length} værktøj</div>
                    </div>
                    {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Category view — within a cabinet */}
      {!searchQ&&selectedCabinet&&!selectedType&&(
        <>
          {categories.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj i dette skab.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {categories.map(type=>{
              const group=grouped[type];
              const photo=group.find(t=>t.photoData)?.photoData;
              const hasAlert=group.some(t=>(!t.returnable&&t.quantity<=(t.minQuantity||0))||(t.returnable&&t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0)<=0)||t.needsRegrinding||(t.damagedCount||0)>0);
              return(
                <div key={type} onClick={()=>setSelectedType(type)} style={{background:C.surface,borderRadius:12,border:`1px solid ${hasAlert?C.amber:C.border}`,overflow:"hidden",cursor:"pointer"}}>
                  <div style={{position:"relative",width:"100%",aspectRatio:"4/3",background:C.raised,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {photo?<img src={photo} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<i className="ti ti-tool" style={{fontSize:36,color:C.muted,opacity:0.2}}/>}
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,rgba(0,0,0,.7))",padding:"20px 12px 8px"}}>
                      <div style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:.3}}>{type}</div>
                      <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>{group.length} værktøj</div>
                    </div>
                    {hasAlert&&<div style={{position:"absolute",top:8,right:8,background:C.amber,borderRadius:20,width:10,height:10}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Type drill-down view */}
      {!searchQ&&selectedCabinet&&selectedType&&(
        <>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{selectedType} · {typeTools.length} værktøj</div>
          {typeTools.length===0&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Intet værktøj i denne kategori.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{typeTools.map(renderToolCard)}</div>
        </>
      )}

      {/* Global search results */}
      {searchQ&&(
        <>
          {searchResults.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted,fontSize:15}}>Intet værktøj fundet.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{searchResults.map(renderToolCard)}</div>
        </>
      )}

      {selectedTool&&(
        <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:1000,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div style={{background:C.surface,borderRadius:"16px 16px 0 0",maxHeight:"88vh",overflowY:"auto",padding:"0 16px 36px"}}>
            <div style={{position:"sticky",top:0,background:C.surface,paddingTop:14,paddingBottom:6,zIndex:1}}>
              <div style={{width:36,height:4,background:C.raised,borderRadius:2,margin:"0 auto"}}/>
            </div>
            {selectedTool.photoData&&<img src={selectedTool.photoData} style={{width:"100%",maxHeight:200,objectFit:"contain",borderRadius:10,background:C.raised,marginBottom:14,border:`1px solid ${C.border}`,display:"block"}}/>}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
              <div style={{fontSize:20,color:C.text,fontWeight:700,lineHeight:1.3}}>{selectedTool.name}</div>
              {selectedTool.toolType&&<span style={{fontSize:14,fontWeight:600,color:"#94a3b8",background:"rgba(148,163,184,.15)",padding:"3px 9px",borderRadius:20,border:"1px solid rgba(148,163,184,.25)",whiteSpace:"nowrap"}}>{selectedTool.toolType}</span>}
            </div>
            {selectedTool.articleNumber&&<div style={{fontSize:14,color:C.muted,marginBottom:6}}>{selectedTool.articleNumber}</div>}
            {selectedTool.ordered&&<div style={{background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.4)",borderRadius:8,padding:"7px 10px",marginBottom:10,fontSize:14,color:"#3b82f6",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-checks"/><span>Bestilt — admin har allerede bestilt dette værktøj</span></div>}
            {selectedTool.conditionOrdered&&<div style={{background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.4)",borderRadius:8,padding:"7px 10px",marginBottom:10,fontSize:14,color:"#3b82f6",display:"flex",alignItems:"center",gap:6}}><i className="ti ti-alert-triangle"/><span>Erstatning bestilt — værktøjet er i dårlig stand (1 stjerne)</span></div>}
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
              const checkedOut=selectedTool.returnable?(selectedTool.checkedOutCount||0):0;
              const damaged=selectedTool.returnable?(selectedTool.damagedCount||0):0;
              const available=selectedTool.returnable?selectedTool.quantity-checkedOut-damaged:selectedTool.quantity;
              const byList=selectedTool.returnable?(selectedTool.checkedOutBy||[]):[];
              return(
                <div style={{marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    {selectedTool.returnable?(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}>
                        <div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Ledig</div>
                        <div style={{fontSize:20,fontWeight:700,color:available<=0?C.red:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{available}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> / {selectedTool.quantity} i alt</span></div>
                        {checkedOut>0&&<div style={{fontSize:13,color:C.amber,marginTop:2}}>{checkedOut} i brug{damaged>0?`, ${damaged} damaged`:""}</div>}
                        {damaged>0&&checkedOut===0&&<div style={{fontSize:13,color:C.red,marginTop:2}}>{damaged} beskadiget</div>}
                      </div>
                    ):(
                      <div style={{background:C.raised,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:11,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>På lager</div><div style={{fontSize:20,fontWeight:700,color:selectedTool.quantity<=(selectedTool.minQuantity||0)?C.amber:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{selectedTool.quantity}<span style={{fontSize:13,fontWeight:400,color:C.muted}}> stk</span></div></div>
                    )}
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
                    <button key={s} onClick={()=>setConditionStars(s)} style={{background:"none",border:"none",cursor:"pointer",padding:4,minWidth:44,minHeight:44,fontSize:24,color:(selectedTool.conditionStars||0)>=s?"#facc15":"rgba(255,255,255,.18)",lineHeight:1}}>★</button>
                  ))}
                  <span style={{fontSize:13,color:C.muted,marginLeft:4}}>
                    {!selectedTool.conditionStars?"Ikke vurderet endnu":selectedTool.conditionStars===1?"⚠ Dårlig — overvej at udskifte":selectedTool.conditionStars===2?"Nogenlunde":selectedTool.conditionStars===3?"God":selectedTool.conditionStars===4?"Meget god":"Ny / som ny"}
                  </span>
                </div>
              </div>
            )}
            {selectedTool.broken&&(
              <div style={{background:"rgba(231,76,60,.12)",border:`1px solid rgba(231,76,60,.4)`,borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:14,color:C.red,display:"flex",alignItems:"center",gap:6}}>
                <i className="ti ti-alert-triangle"/><span>Meldt i stykker — admin har fået besked</span>
              </div>
            )}
            {selectedTool.returnable?(
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
                {(selectedTool.quantity-(selectedTool.checkedOutCount||0)-(selectedTool.damagedCount||0))>0
                  ?<button style={btn("primary",true)} onClick={doCheckout}><i className="ti ti-logout"/> Lån</button>
                  :<div style={{...badge("down"),textAlign:"center",padding:"10px",fontSize:14,display:"block"}}>ALLE I BRUG — vent til nogen afleverer</div>}
                {(selectedTool.checkedOutCount||0)>0&&(
                  <>
                    {selectedTool.regrindable?(
                      <div>
                        <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Aflever i skabet — stand?</div>
                        <div style={{display:"flex",gap:8}}>
                          <button style={{...btn("success",false,false),flex:1}} onClick={()=>doReturn(true)}><i className="ti ti-check"/> Omslebet</button>
                          <button style={{...btn("outline",false,false),flex:1,color:C.amber,borderColor:C.amber}} onClick={()=>doReturn(false)}><i className="ti ti-alert-triangle"/> Skal omslibes</button>
                        </div>
                      </div>
                    ):<button style={btn("success",true)} onClick={()=>doReturn()}><i className="ti ti-login"/> Aflever i skabet</button>}
                    <button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.5)",color:C.red}} onClick={doReturnDamaged}><i className="ti ti-alert-triangle"/> Aflever som beskadiget</button>
                  </>
                )}
                {!selectedTool.broken&&<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.35)",color:C.red,fontSize:14}} onClick={doReportBroken}><i className="ti ti-tools"/> Meld værktøj i stykker / skal genbestilles</button>}
              </div>
            ):selectedTool.quantity>0?(
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Hvor mange tager du?</div>
                <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"center",marginBottom:14}}>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:22}} onClick={()=>setTakeQty(q=>Math.max(1,q-1))}>−</button>
                  <div style={{fontSize:36,color:C.amber,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",minWidth:60,textAlign:"center"}}>{takeQty}</div>
                  <button style={{...btn("outline",false,false),padding:"10px 20px",fontSize:22}} onClick={()=>setTakeQty(q=>Math.min(selectedTool.quantity,q+1))}>+</button>
                </div>
                <button style={btn("primary",true)} onClick={doTake}><i className="ti ti-minus"/> Tag {takeQty} stk</button>
              </div>
            ):<div style={{...badge("down"),textAlign:"center",padding:"10px",fontSize:14,display:"block"}}>IKKE PÅ LAGER — kontakt admin</div>}
            <button style={{...btn("outline",true,true),marginTop:10}} onClick={closeModal}>Luk</button>
          </div>
        </div>
      )}
    </div>
  );
}
