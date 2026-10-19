import { useState, useEffect, useRef } from "react";
import { C, inp, sel, btn, label, errMsg } from "../lib/theme";
import { saveDraft, clearDraft } from "./sheetDraft";
import { PdfDrawings } from "../components/PdfDrawings";
import { ERIKS_BLANK } from "./SetupSheetDetail";
import { resizeImage } from "../lib/api";

export function SetupSheetForm({sheet,prefill,draft,machines,user,setupDeptParams,subDepartments,tools,cabinets,onBack,onSave}){
  const migrateParams=s=>{if(!s)return[];if(s.params)return s.params;const p=[];if(s.chuckName)p.push({key:"Chuck Name",value:s.chuckName});if(s.chuckOverhang)p.push({key:"Chuck Overhang",value:s.chuckOverhang});if(s.clampingPressure)p.push({key:"Clamping Pressure",value:s.clampingPressure});if(s.zeroPoint)p.push({key:"Zero Point",value:s.zeroPoint});if(s.workpieceStop)p.push({key:"Workpiece Stop",value:s.workpieceStop});return p;};
  const getDept=machineName=>(machines||[]).find(m=>m.name===machineName)?.department||"";
  const MZ_BLANK={fraesForlaenger:"",fraesMn:"",stopDia:"",tangTryk:"",vaerktoejITang:false,tangNummer:"",tangForm:"Spids",pinoltryk:"",pinoldokType:"Pinol",hastighed:"",luft:false,spindel:"",olie:"",emneUdhaeng:"",pinoldokUdhaeng:""};
  const blank={id:null,partNumber:"",customer:"",machine:"",department:"",subDepartment:"",material:"",revision:"",operation:"",subProgram:"",planProgram:"",restartPrefix:"NAT",restartPad:2,tools:[],tools2:[],tools3:[],params:[],notes:"",toolModul:"",mzSetup:{},mzAdvanced:{schnecke:{},werkstuck:{},entgratenVorne:{},entgratenHinten:{}},eriksSetup:{}};
  const baseForm=()=>sheet?{...blank,...sheet,department:sheet.department||getDept(sheet?.machine||""),subDepartment:sheet.subDepartment||"",params:migrateParams(sheet)}
    :prefill?{...blank,partNumber:prefill.partNumber||"",machine:prefill.machine||"",customer:prefill.customer||"",department:getDept(prefill.machine||"")}
    :blank;
  // Unsaved work from last time (see sheetDraft.js) wins over the saved sheet
  const [init]=useState(()=>draft?{...blank,...draft.form}:baseForm());
  const [form,setForm]=useState(init);
  const [baseline,setBaseline]=useState(()=>JSON.stringify(init)); // "nothing typed yet" — no draft needed
  const [restored,setRestored]=useState(draft||null);
  const [photosDropped,setPhotosDropped]=useState(false);
  const draftId=sheet?.id??null;
  // Keep a draft on the tablet while typing — and at once when the app is left
  const formRef=useRef(form); formRef.current=form;
  const keepDraft=()=>{const f=formRef.current;if(JSON.stringify(f)!==baseline)setPhotosDropped(!saveDraft(user.id,draftId,f));};
  useEffect(()=>{const t=setTimeout(keepDraft,500);return()=>clearTimeout(t);},[form]);
  useEffect(()=>{
    const onHide=()=>{if(document.visibilityState==="hidden")keepDraft();};
    document.addEventListener("visibilitychange",onHide);
    return()=>document.removeEventListener("visibilitychange",onHide);
  },[baseline]);
  const startOver=()=>{clearDraft(user.id,draftId);const b=baseForm();setForm(b);setBaseline(JSON.stringify(b));setRestored(null);setPhotosDropped(false);};
  // Sub-depts available for current dept
  const deptSubDepts=(subDepartments||{})[form.department]||[];
  // Param options: use sub-dept key if available, else dept key
  const paramKey=form.subDepartment||form.department;
  const setupParamOptions=(setupDeptParams||{})[paramKey]||[];
  const [errs,setErrs]=useState({});
  const [showList2,setShowList2]=useState(!!(init.tools2?.length));
  const [showList3,setShowList3]=useState(!!(init.tools3?.length));
  const [uploading,setUploading]=useState(false);
  // Photos from the camera or the tablet's pictures — shrunk, then added to the sheet
  const addPhotos=async e=>{
    const files=[...e.target.files];
    e.target.value="";
    if(!files.length) return;
    setUploading(true);
    const uploaded=[];
    for(const file of files){
      const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(file);});
      uploaded.push({url:await resizeImage(dataUrl),caption:""});
    }
    setForm(p=>({...p,photos:[...(p.photos||[]),...uploaded]}));
    setUploading(false);
  };
  const [lastPos,setLastPos]=useState({}); // per tool list: position of the tool made last
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));
  const rc=pos=>{if(!pos)return"";return(form.restartPrefix||"NAT")+String(pos).padStart(form.restartPad||2,"0");};
  const allPos=[...Array(99)].map((_,i)=>i+1);
  // Only show tools from cabinets assigned to the current department (cabinets with no dept = all depts)
  const deptCabinets=(cabinets||[]).filter(c=>!(c.departments||[]).length||(c.departments||[]).includes(form.department));
  const deptCabinetIds=new Set(deptCabinets.map(c=>String(c.id)));
  const activeCabinetTools=(tools||[]).filter(t=>t.active!==false&&t.name&&deptCabinetIds.has(String(t.cabinetId)));
  const toolListEditor=(listKey,accent)=>{
    const listTools=form[listKey]||[];
    const used=new Set(listTools.map(t=>t.position));
    const avail=allPos.filter(n=>!used.has(n));
    const setTool=(pos,fld,val)=>setForm(p=>{const arr=[...(p[listKey]||[])];const idx=arr.findIndex(t=>t.position===pos);if(idx>=0)arr[idx]={...arr[idx],[fld]:val};return{...p,[listKey]:arr};});
    const removeTool=pos=>setForm(p=>({...p,[listKey]:(p[listKey]||[]).filter(t=>t.position!==pos)}));
    // New tool goes to the first free position after the one made last (or after the highest),
    // so it lands right below — only wraps to the lowest free position when nothing is free above
    const addEmpty=()=>{
      const after=lastPos[listKey]??Math.max(0,...listTools.map(t=>t.position));
      const pos=avail.find(n=>n>after)??avail[0];
      if(!pos)return;
      setLastPos(p=>({...p,[listKey]:pos}));
      setForm(p=>({...p,[listKey]:[...(p[listKey]||[]),{position:pos,description:"",label:"",toolId:null}].sort((a,b)=>a.position-b.position)}));
    };
    const changePos=(old,nv)=>{const n=parseInt(nv);if(!n||used.has(n))return;setLastPos(p=>({...p,[listKey]:n}));setForm(p=>({...p,[listKey]:p[listKey].map(t=>t.position===old?{...t,position:n}:t).sort((a,b)=>a.position-b.position)}));};
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${accent}`,overflow:"hidden",marginBottom:14}}>
        {listTools.length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Intet værktøj tilføjet endnu</div>}
        {listTools.map(t=>(
          <div key={t.position} style={{borderBottom:`1px solid ${C.border}`}}>
            <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
              <select style={{...sel(),width:60,flexShrink:0,fontWeight:700,color:accent}} value={t.position} onChange={e=>changePos(t.position,e.target.value)}>
                <option value={t.position}>{t.position}</option>
                {avail.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                <input style={inp()} value={t.description||""} onChange={e=>setTool(t.position,"description",e.target.value)} placeholder="Beskrivelse af værktøj — skal udfyldes"/>
                <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool(t.position,"toolId",e.target.value||null)}>
                  <option value="">— Intet værktøj fra skab —</option>
                  {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
                </select>
                <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool(t.position,"label",e.target.value)} placeholder="Noter — valgfrit"/>
              </div>
              <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:18,padding:"4px 2px",flexShrink:0,marginTop:4}} onClick={()=>removeTool(t.position)}><i className="ti ti-x"/></button>
            </div>
          </div>
        ))}
        <div style={{padding:"10px 12px",borderTop:listTools.length>0?`1px solid ${C.border}`:"none"}}>
          <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:accent,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",gap:6}} onClick={addEmpty} disabled={avail.length===0}><i className="ti ti-plus"/> Tilføj værktøj{avail.length===0?" (alle 99 brugt)":""}</button>
        </div>
      </div>
    );
  };
  const fortandingToolEditor=()=>{
    const fTools=(form.tools||[]).sort((a,b)=>a.position-b.position);
    const hasPos1=fTools.some(t=>t.position===1);
    const setTool=(pos,fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];const idx=arr.findIndex(t=>t.position===pos);if(idx>=0)arr[idx]={...arr[idx],[fld]:val};return{...p,tools:arr};});
    const addTool=pos=>setForm(p=>({...p,tools:[...(p.tools||[]),{position:pos,description:"",label:"",toolId:null}].sort((a,b)=>a.position-b.position)}));
    const removeTool=pos=>setForm(p=>({...p,tools:(p.tools||[]).filter(t=>t.position!==pos)}));
    const slotLabels={1:"Øverste værktøj",2:"Nederste værktøj"};
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,9"/>
        </div>
        {[1,2].map(pos=>{
          const t=fTools.find(x=>x.position===pos);
          if(t) return(
            <div key={pos} style={{borderBottom:pos===1&&fTools.some(x=>x.position===2)?`1px solid ${C.border}`:"none"}}>
              <div style={{padding:"8px 14px 4px",display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",flex:1}}>{slotLabels[pos]}</div>
                {form.toolModul&&<span style={{fontSize:13,color:C.muted,fontFamily:"'Share Tech Mono',monospace"}}>Modul {form.toolModul}</span>}
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16}} onClick={()=>removeTool(pos)}><i className="ti ti-x"/></button>
              </div>
              <div style={{padding:"4px 14px 10px",display:"flex",flexDirection:"column",gap:6}}>
                <input style={inp()} value={t.description||""} onChange={e=>setTool(pos,"description",e.target.value)} placeholder="Beskrivelse af værktøj — valgfrit"/>
                <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool(pos,"toolId",e.target.value||null)}>
                  <option value="">— Intet værktøj fra skab —</option>
                  {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
                </select>
                <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool(pos,"label",e.target.value)} placeholder="Noter — valgfrit"/>
              </div>
            </div>
          );
          if(pos===1||hasPos1) return(
            <div key={pos} style={{padding:"10px 14px",borderTop:pos===2?`1px solid ${C.border}`:"none"}}>
              <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.amber,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",gap:6}} onClick={()=>addTool(pos)}><i className="ti ti-plus"/> Tilføj {slotLabels[pos]}</button>
            </div>
          );
          return null;
        })}
      </div>
    );
  };
  const eriksToolEditor=()=>{
    const t=(form.tools||[])[0]||{position:1,description:"",label:"",toolId:null};
    const setTool=(fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];if(arr.length===0)arr.push({position:1,description:"",label:"",toolId:null});arr[0]={...arr[0],[fld]:val};return{...p,tools:arr};});
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,8"/>
        </div>
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
          <input style={inp()} value={t.description||""} onChange={e=>setTool("description",e.target.value)} placeholder="Beskrivelse af fræser — valgfrit"/>
          <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool("toolId",e.target.value||null)}>
            <option value="">— Intet værktøj fra skab —</option>
            {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
          </select>
          <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool("label",e.target.value)} placeholder="Noter — valgfrit"/>
        </div>
      </div>
    );
  };
  const eriksSetupEditor=()=>{
    const e={...ERIKS_BLANK,...(form.eriksSetup||{})};
    const setE=(k,v)=>setF("eriksSetup",{...(form.eriksSetup||{}),[k]:v});
    const mono={fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17};
    const numInp=(k,ph="—")=>(<input style={{...inp(),...mono,width:"100%",textAlign:"right",fontSize:18}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder={ph}/>);
    const secHdr=(t)=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
    // Gear section: two color groups (amber/blue) matching the paper.
    // Circles OVERLAP where gears mesh. The "inner" gear of a compound pair
    // (e.g. c inside b) shares the shaft — drawn as a smaller circle inside
    // the larger one. Amber group drawn first so blue renders on top.
    // Input column on right, color-coded to match, space-evenly distributed.
    // Gear section: full-width SVG shows circles + leader lines + letter labels only.
    // Input fields are rendered below the SVG so circles get the full width (matching reference).
    // flip=false: circles on left, lines go right. flip=true: circles on right, lines go left.
    const gearSvgSection=(title,totalKey,totalPh,ratioKey,gears,flip=false)=>{
      const VW=300;
      const LINE_END=flip?125:165;
      const LABEL_X=flip?90:170;
      const INPUT_X=flip?5:215;
      const INPUT_W=80;
      const INPUT_H=20;
      const maxY=Math.max(...gears.map(g=>g.cy+g.r))+15;
      return(
        <div style={{padding:"8px 10px 10px"}}>
          <div style={{fontSize:15,color:C.amber,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:5}}>{title}</div>
          {(totalKey||ratioKey)&&<div style={{display:"flex",gap:8,marginBottom:6}}>
            {totalKey&&<div style={{flex:1}}><div style={{fontSize:13,color:C.muted,marginBottom:2}}>{title.split("/")[0].trim()} =</div>{numInp(totalKey,totalPh)}</div>}
            {ratioKey&&<div style={{flex:1}}><div style={{fontSize:13,color:C.muted,marginBottom:2}}>i =</div>{numInp(ratioKey,"2:45")}</div>}
          </div>}
          <svg viewBox={`0 0 ${VW} ${maxY}`} style={{width:"100%",display:"block"}} overflow="visible">
            {[...gears].sort((a,b)=>b.r-a.r).map(g=>{
              const stroke=g.color==="blue"?C.blue:C.amber;
              const fill=stroke+"1a";
              const edy=g.exitDy||0;
              const edx=Math.sqrt(Math.max(0,g.r*g.r-edy*edy));
              const ex=flip?g.cx-edx:g.cx+edx;
              const ey=g.cy+edy;
              return(
                <g key={g.label}>
                  <circle cx={g.cx} cy={g.cy} r={g.r} fill={fill} stroke={stroke} strokeWidth="2"/>
                  <line x1={g.cx-g.r*0.38} y1={g.cy} x2={g.cx+g.r*0.38} y2={g.cy} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
                  <line x1={g.cx} y1={g.cy-g.r*0.38} x2={g.cx} y2={g.cy+g.r*0.38} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
                  <line x1={ex} y1={ey} x2={LINE_END} y2={ey} stroke={stroke} strokeWidth="1.3"/>
                  <text x={LABEL_X} y={ey+5} textAnchor="start" fontSize="14" fontWeight="700" fill={stroke} fontFamily="monospace">{g.label} =</text>
                  <foreignObject x={INPUT_X} y={ey-INPUT_H/2} width={INPUT_W} height={INPUT_H}>
                    <input
                      style={{width:"100%",height:"100%",background:C.raised,border:`1px solid ${stroke}55`,borderRadius:"4px",color:C.green,fontSize:"13px",fontWeight:"700",textAlign:"right",padding:"0 4px",fontFamily:"'Share Tech Mono',monospace",outline:"none",boxSizing:"border-box"}}
                      value={e[g.inputKey]||""}
                      onChange={ev=>setE(g.inputKey,ev.target.value)}
                    />
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>
      );
    };
    // Rotary switch selector
    const switchDial=(k,label,opts={})=>{
      const labels=opts.labels||[1,2,3];
      const n=labels.length;
      const step=n>1?120/(n-1):0;
      const cx=40,cy=40,r=26;
      const pos=labels.map((lbl,i)=>{const a=(-150+i*step)*Math.PI/180;return{lbl:String(lbl),x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};});
      const val=e[k]!=null&&e[k]!==""?String(e[k]):null;
      const selPos=val!=null?pos.find(p=>p.lbl===val):null;
      return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <div style={{fontSize:12,color:C.amber,fontWeight:700,letterSpacing:.5}}>{label}</div>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx={cx} cy={cy} r={r+10} fill="none" stroke={C.border} strokeWidth="1.5"/>
            <circle cx={cx} cy={cy} r={4} fill={C.muted}/>
            {selPos&&<line x1={cx} y1={cy} x2={selPos.x} y2={selPos.y} stroke="#e53e3e" strokeWidth="3" strokeLinecap="round"/>}
            {pos.map((p,i)=>{const sel=val===p.lbl;return(
              <g key={i} onClick={()=>setE(k,sel?"":p.lbl)} style={{cursor:"pointer"}}>
                <circle cx={p.x} cy={p.y} r={10} fill={sel?"#e53e3e":C.raised} stroke={sel?"#e53e3e":C.border} strokeWidth="1.5"/>
                <text x={p.x} y={p.y+4} textAnchor="middle" fontSize="11" fontWeight="800" fill={sel?"#fff":C.muted}>{p.lbl}</text>
              </g>
            );})}
          </svg>
        </div>
      );
    };
    // ── Gear circle positions ─────────────────────────────────────────────
    // Compound pairs share the SAME cx,cy (concentric circles): outer amber ring (b),
    // inner blue circle (c). exitDy splits their leader lines above/below center.
    // flip=true: circles RIGHT side (cx ~200-255), lines LEFT.
    // flip=false: circles LEFT side (cx ≤ 85), lines RIGHT.
    //
    // Steigung (flip=true, circles right): a→Zw→b[outer]/c[inner]→d
    const steigungGears=[
      {label:"a",  inputKey:"steigA",  cx:252, cy:33,  r:24, color:"amber"},
      {label:"Zw", inputKey:"steigZw", cx:229, cy:88,  r:37, color:"amber"},
      {label:"b",  inputKey:"steigB",  cx:183, cy:163, r:51, color:"amber", exitDy:-30},
      {label:"c",  inputKey:"steigC",  cx:183, cy:163, r:37, color:"blue",  exitDy:+30},
      {label:"d",  inputKey:"steigD",  cx:167, cy:224, r:26, color:"blue"},
    ];
    // Zahnzahl (flip=false, circles left): d→Zw→b[outer]/c[inner]→a
    const zahnzahlGears=[
      {label:"d",  inputKey:"zahnD",  cx:124, cy:42,  r:37, color:"amber"},
      {label:"Zw", inputKey:"zahnZw", cx:92,  cy:94,  r:24, color:"amber"},
      {label:"c",  inputKey:"zahnC",  cx:113, cy:163, r:48, color:"amber", exitDy:-30},
      {label:"b",  inputKey:"zahnB",  cx:113, cy:163, r:35, color:"blue",  exitDy:+30},
      {label:"a",  inputKey:"zahnA",  cx:62,  cy:224, r:44, color:"blue"},
    ];
    // Fräserdrehzahl (flip=true, circles right): a→b[outer]/c[inner]→d
    const fraesDrehzahlGears=[
      {label:"a",  inputKey:"fraesA",  cx:234, cy:34,  r:33, color:"amber"},
      {label:"b",  inputKey:"fraesB",  cx:197, cy:106, r:48, color:"amber", exitDy:-30},
      {label:"c",  inputKey:"fraesC",  cx:197, cy:106, r:35, color:"blue",  exitDy:+30},
      {label:"d",  inputKey:"fraesD",  cx:173, cy:177, r:40, color:"blue"},
    ];
    // Längsvorschub (flip=false, circles left): a→b[outer]/c[inner]→Zw→d
    const laengsGears=[
      {label:"a",  inputKey:"laengsA",  cx:70, cy:37,  r:29, color:"amber"},
      {label:"b",  inputKey:"laengsB",  cx:70, cy:95,  r:29, color:"amber", exitDy:-16},
      {label:"c",  inputKey:"laengsC",  cx:70, cy:95,  r:20, color:"blue",  exitDy:+16},
      {label:"Zw", inputKey:"laengsZw", cx:70, cy:143, r:18, color:"blue"},
      {label:"d",  inputKey:"laengsD",  cx:70, cy:201, r:40, color:"blue"},
    ];
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {/* Cutter parameters */}
        {secHdr("Fräser / Fræser")}
        <div style={{padding:"10px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
            {["mn","z","beta","dk","uo","df"].map(k=>(
              <div key={k}><div style={{fontSize:12,color:C.muted,marginBottom:3}}>{k==="z"?"Z":k==="beta"?"β":k}</div>
                <input style={{...inp(),...mono,width:"100%",textAlign:"right"}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder="—"/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:12,color:C.muted,fontWeight:600,flexShrink:0}}>Fräser Ø</div>
            <input style={{...inp(),...mono,flex:1}} value={e.fraeserDia||""} onChange={ev=>setE("fraeserDia",ev.target.value)} placeholder="e.g. 20 H55"/>
          </div>
        </div>
        {/* Fräslagerstellung — 4-position image grid, no white background */}
        {secHdr("Fräslagerstellung / Fræserposition")}
        <div style={{padding:"10px 14px 12px"}}>
          {(()=>{
            const isDark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&window.matchMedia("(prefers-color-scheme:dark)").matches);
            return(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[["fraesLagerLinks","Oben Links / Øverst venstre",0,0],["fraesLagerRechts","Oben Rechts / Øverst højre",1,0],["fraesLag3","Unten Links / Nederst venstre",0,1],["fraesLag4","Unten Rechts / Nederst højre",1,1]].map(([k,lbl,xi,yi])=>(
                  <div key={k} style={{display:"flex",flexDirection:"column",gap:0,border:`2px solid ${e[k]?C.amber:C.border}`,borderRadius:10,overflow:"hidden",background:C.surface}}>
                    {/* image quadrant */}
                    <div style={{aspectRatio:"4/3",backgroundImage:"url(/eriks-fraeslager-grid.png)",backgroundSize:"200% 200%",backgroundPosition:`${xi*100}% ${yi*100}%`,backgroundRepeat:"no-repeat",backgroundColor:isDark?C.raised:"#fff",filter:isDark?"invert(1)":"none"}}/>
                    {/* label + input row */}
                    <div style={{padding:"8px 10px",borderTop:`1px solid ${C.border}`,background:C.raised}}>
                      <div style={{fontSize:13,color:C.amber,fontWeight:700,letterSpacing:.5,marginBottom:4}}>{lbl}</div>
                      <div style={{position:"relative"}}>
                        <input style={{...inp(),...mono,width:"100%",textAlign:"right",fontSize:24,fontWeight:700,paddingRight:32,height:44,boxSizing:"border-box",border:`1px solid ${e[k]?C.amber:C.border}`,color:C.green}} value={e[k]||""} onChange={ev=>setE(k,ev.target.value)} placeholder="—"/>
                        <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:20,color:C.amber,fontWeight:700,pointerEvents:"none"}}>°</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Direction + differential */}
        {secHdr("Laufrichtung / Retning")}
        <div style={{padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap"}}>
          {["Gegenlauf","Gleichlauf"].map(v=>{const a=e.richtung===v;return(<button key={v} type="button" style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?"rgba(240,165,0,.15)":C.raised,color:a?C.amber:C.muted,fontSize:15,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("richtung",v)}>{v}</button>);})}
          <div style={{width:"100%",height:1,background:C.border,margin:"4px 0"}}/>
          {["ausgerastet","eingerastet"].map(v=>{const a=e.differential===v;const lbl=v==="ausgerastet"?"Diff.-Indexbolzen ausgerastet":"Diff.-Indexbolzen eingerastet";return(<button key={v} type="button" style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${a?C.blue:C.border}`,background:a?"rgba(59,130,246,.15)":C.raised,color:a?C.blue:C.muted,fontSize:14,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("differential",v)}>{lbl}</button>);})}
        </div>
        {/* Gear trains — 2×2 grid, each cell matches the paper layout */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${C.border}`}}>
          <div style={{borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>{gearSvgSection("Zahnzahl / Antal tænder","zahnzahl","80","zahnzahlRatio",zahnzahlGears,false)}</div>
          <div style={{borderBottom:`1px solid ${C.border}`}}>{gearSvgSection("Steigung / Stigning","steigung","","",steigungGears,true)}</div>
          <div style={{borderRight:`1px solid ${C.border}`}}>{gearSvgSection("Fräserdrehzahl / Fræser omdr.","fraesDrehzahl","1312","",fraesDrehzahlGears,true)}</div>
          <div>{gearSvgSection("Längsvorschub / Langs tilsp.","laengs","0,7","",laengsGears,false)}</div>
        </div>
        {/* Switch positions */}
        {secHdr("Schalterstellungen / Kontaktstillinger — auf rot einstellen")}
        <div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["schalterA2","a2",{}],["schalterA3","a3",{labels:[0,1,2,3]}],["schalterA4","a4",{labels:[1,2,2,1]}],["schalterA5","a5",{}]].map(([k,lbl,opts])=>switchDial(k,lbl,opts))}
        </div>
        {/* Tauchsteuerung + production */}
        {secHdr("Tauchsteuerung / Indstik + produktion")}
        <div style={{padding:"10px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["tauchsteuerung","Tauchsteuerung"],["stckStd","Stck/Std"],["stckSpannung","Stck/Spannung"]].map(([k,lbl])=>(<div key={k}><div style={{fontSize:12,color:C.muted,marginBottom:3}}>{lbl}</div>{numInp(k,"")}</div>))}
        </div>
        {/* Eingang */}
        {secHdr("Eingang / Indgang")}
        <div style={{padding:"10px 14px",display:"flex",gap:8,flexWrap:"wrap"}}>
          {["m. Zwischenrad","ohne Zwischenrad"].map(v=>{const a=e.eingang===v;return(<button key={v} type="button" style={{padding:"7px 18px",borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?"rgba(240,165,0,.15)":C.raised,color:a?C.amber:C.muted,fontSize:15,fontWeight:a?700:400,cursor:"pointer"}} onClick={()=>setE("eingang",v)}>{v}</button>);})}</div>
      </div>
    );
  };
  const mzToolEditor=()=>{
    const t=(form.tools||[])[0]||{position:1,description:"",label:"",toolId:null};
    const setTool=(fld,val)=>setForm(p=>{const arr=[...(p.tools||[])];if(arr.length===0)arr.push({position:1,description:"",label:"",toolId:null});arr[0]={...arr[0],[fld]:val};return{...p,tools:arr};});
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.amber,flexShrink:0,minWidth:80}}>Modul</div>
          <input style={{...inp(),flex:1,fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber}} value={form.toolModul||""} onChange={e=>setF("toolModul",e.target.value)} placeholder="e.g. 0,9"/>
        </div>
        <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
          <input style={inp()} value={t.description||""} onChange={e=>setTool("description",e.target.value)} placeholder="Beskrivelse af værktøj — valgfrit"/>
          <select style={sel()} value={t.toolId!=null?String(t.toolId):""} onChange={e=>setTool("toolId",e.target.value||null)}>
            <option value="">— Intet værktøj fra skab —</option>
            {activeCabinetTools.map(ct=>{const ctCab=(cabinets||[]).find(c=>String(c.id)===String(ct.cabinetId));const ctDrw=ctCab?.drawers?.find(d=>String(d.id)===String(ct.drawerId));return(<option key={ct.id} value={ct.id}>{ct.name}{ctCab?` (${ctCab.name}${ctDrw?`, Drawer ${ctDrw.number}`:""})`:""}  </option>);})}
          </select>
          <input style={{...inp(),fontSize:14}} value={t.label||""} onChange={e=>setTool("label",e.target.value)} placeholder="Noter — valgfrit"/>
        </div>
      </div>
    );
  };
  const mzSetupEditor=()=>{
    const mz={...MZ_BLANK,...(form.mzSetup||{})};
    const setMz=(k,v)=>setF("mzSetup",{...(form.mzSetup||{}),[k]:v});
    const togRow=(lbl,k,opts)=>(
      <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {opts.map(o=>{const active=mz[k]===o;return(<button key={o} type="button" style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${active?C.amber:C.border}`,background:active?"rgba(240,165,0,.15)":C.raised,color:active?C.amber:C.muted,fontSize:15,fontWeight:active?700:400,cursor:"pointer"}} onClick={()=>setMz(k,o)}>{o}</button>);})}
        </div>
      </div>
    );
    const yesNoRow=(lbl,k)=>{
      const isYes=mz[k]===true||mz[k]==="Ja";
      return(
        <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
          <div style={{display:"flex",gap:4}}>
            {[["Ja",true],[" Nej",false]].map(([lbl2,val])=>{const active=(mz[k]===val||(val===true&&mz[k]==="Ja")||(val===false&&mz[k]==="Nej"));const col=val?C.green:C.red;return(<button key={String(val)} type="button" style={{padding:"4px 14px",borderRadius:20,border:`1px solid ${active?col:C.border}`,background:active?`${col}22`:C.raised,color:active?col:C.muted,fontSize:15,fontWeight:active?700:400,cursor:"pointer"}} onClick={()=>setMz(k,val)}>{lbl2.trim()}</button>);})}
          </div>
        </div>
      );
    };
    const txtRow=(lbl,k,ph,mono=true,w="100%")=>(
      <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>{lbl}</div>
        <input style={{...inp(),width:w,...(mono?{fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17}:{})}} value={mz[k]||""} onChange={e=>setMz(k,e.target.value)} placeholder={ph}/>
      </div>
    );
    return(
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {togRow("Forlænger","fraesForlaenger",["Kort","Mellem","Lang"])}
        {txtRow("Fræser Mn","fraesMn","0,6 20°")}
        {txtRow("Stop Ø","stopDia","13/8/4 – 172")}
        {txtRow("Tang tryk","tangTryk","7",true,"80px")}
        {yesNoRow("Værktøj i tang","vaerktoejITang")}
        {txtRow("Tang nr.","tangNummer","X055")}
        {togRow("Tang form","tangForm",["Spids","Flad"])}
        {txtRow("Pinoltryk","pinoltryk","8",true,"80px")}
        {togRow("Pinoldok","pinoldokType",["Pinol","Værktøj"])}
        {txtRow("Hastighed","hastighed","2",true,"80px")}
        {yesNoRow("Luft","luft")}
        {txtRow("Spindel","spindel","",false)}
        {txtRow("Olie","olie","",false)}
        {txtRow("Emne udhæng","emneUdhaeng","42 mm til forkant",false)}
        <div style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,alignItems:"center",padding:"9px 14px"}}>
          <div style={{fontSize:13,color:C.muted,fontWeight:600,letterSpacing:.4}}>Pinoldok udhæng</div>
          <input style={{...inp(),width:"100%"}} value={mz.pinoldokUdhaeng||""} onChange={e=>setMz("pinoldokUdhaeng",e.target.value)} placeholder=""/>
        </div>
      </div>
    );
  };
  const [mzOpenSec,setMzOpenSec]=useState({schnecke:false,werkstuck:false,entgraten:false});
  const setMzAdv=(sec,k,v)=>setF("mzAdvanced",{...(form.mzAdvanced||{}),[sec]:{...((form.mzAdvanced||{})[sec]||{}),[k]:v}});
  const getMzAdv=sec=>(form.mzAdvanced||{})[sec]||{};
  const mzAdvancedEditor=()=>{
    const accHdr=(key,labelDe,labelEn,icon)=>(
      <button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:mzOpenSec[key]?"rgba(240,165,0,.1)":C.surface,border:"none",borderBottom:mzOpenSec[key]?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left"}} onClick={()=>setMzOpenSec(p=>({...p,[key]:!p[key]}))}>
        <i className={`ti ${icon}`} style={{color:C.amber,fontSize:17,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{labelDe}</div>
          <div style={{fontSize:13,color:C.muted}}>{labelEn}</div>
        </div>
        <i className={`ti ti-chevron-${mzOpenSec[key]?"up":"down"}`} style={{color:C.muted,fontSize:16}}/>
      </button>
    );
    const fld=(sec,k,de,en,unit)=>{const d=getMzAdv(sec);return(
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 88px",gap:6,alignItems:"center",padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{de}</div><div style={{fontSize:12,color:C.muted}}>{en}</div></div>
        {unit?<div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap",textAlign:"right"}}>{unit}</div>:<div/>}
        <input style={{...inp(),fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:16,textAlign:"right"}} value={d[k]||""} onChange={e=>setMzAdv(sec,k,e.target.value)} placeholder="—"/>
      </div>
    );};
    const subHdr=t=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
    const entSec=(sec,de,en)=>(<div>{subHdr(`${de} / ${en}`)}
      {fld(sec,"entgraten","Entgraten","Afgratning","0=Nein 1=Ja")}
      {fld(sec,"startpunktX","Startpunkt in X","Startpunkt X","[mm]")}
      {fld(sec,"startdurchmesser","Startdurchmesser","Startdiameter","[mm]")}
      {fld(sec,"kerndurchmesser","Kerndurchmesser","Kernediameter","[mm]")}
      {fld(sec,"verdrehungZ","Verdrehung in Z","Drejning i Z","[Grad]")}
      {fld(sec,"steigung","Steigung","Stigning","[mm]")}
      {fld(sec,"versatz","Versatz","Forskydning","[mm]")}
      {fld(sec,"entgratwinkel","Entgratwinkel","Afgratningsvinkel","[Grad]")}
      {fld(sec,"gangzahlFraeser","Gangzahl Fräser","Fræserens gange","[1, 2]")}
    </div>);
    return(<>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:10,overflow:"hidden"}}>
        {accHdr("schnecke","Schnecke","Snekke","ti-rotate-clockwise")}
        {mzOpenSec.schnecke&&<div>
          {subHdr("Parameter Schnecke / Snekkeparametre")}
          {fld("schnecke","gewindesteigung","Gewindesteigung","Gevindstigning","[mm]")}
          {fld("schnecke","steigungswinkel","Steigungswinkel","Stigningsvinkel","[Grad]")}
          {fld("schnecke","vorlauf","Vorlauf","Forløb","[mm]")}
          {fld("schnecke","eintauchlaengeX","Eintauchlänge X","Indstikslængde X","[mm]")}
          {fld("schnecke","fraeslaenge","Fräslänge","Fræselængde","[mm]")}
          {fld("schnecke","austauchlaengeX","Austauchlänge X","Udløbslængde X","[mm]")}
          {fld("schnecke","ausgangsstellungX","Ausgangsstellung X","Startposition X","[mm]")}
          {fld("schnecke","konizitaet","Konizität","Konicitet","[mm/Fräslänge]")}
          {fld("schnecke","steigungskorrektur","Steigungskorrektur","Stigningskorrektion","[mm/Messlänge]")}
          {fld("schnecke","messlaenge","Messlänge","Målelængde","[mm]")}
          {subHdr("Durchmesser / Diametre")}
          {fld("schnecke","startdurchmesser","Startdurchmesser","Startdiameter","[mm]")}
          {fld("schnecke","eintauchdurchmesser","Eintauchdurchmesser","Indstiksdiameter","[mm]")}
          {fld("schnecke","kerndurchmesser","Kerndurchmesser","Kernediameter","[mm]")}
          {fld("schnecke","austauchdurchmesser","Austauchdurchmesser","Udløbsdiameter","[mm]")}
          {fld("schnecke","enddurchmesser","Enddurchmesser","Slutdiameter","[mm]")}
          {fld("schnecke","schlichtzustellung","Schlichtzustellung","Sletfremføring","[mm]")}
          {fld("schnecke","rechtsLinks","Rechts = 1, Links = 2","Højre = 1, Venstre = 2","")}
          {fld("schnecke","gleichlaufGegenlauf","Gleichlauf = 1, Gegenlauf = 2","Medløb = 1, Modløb = 2","")}
        </div>}
      </div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:10,overflow:"hidden"}}>
        {accHdr("werkstuck","Werkstückparameter","Emneparametre","ti-settings")}
        {mzOpenSec.werkstuck&&<div>
          {fld("werkstuck","fraeserdurchmesser","Fräserdurchmesser","Fræserdiameter","[mm]")}
          {fld("werkstuck","stueckzahl","Stückzahl","Antal","")}
          {fld("werkstuck","teilung","Teilung","Stigning","[1–99]")}
          {fld("werkstuck","vorschubTauchen","Vorschub Tauchen","Tilspænding indstik","[mm/min]")}
          {fld("werkstuck","vorschubFraesen","Vorschub Fräsen","Tilspænding fræsning","[mm/min]")}
          {fld("werkstuck","phasenverschiebung","Phasenverschiebung","Faseforskydning","[Grad]")}
          {fld("werkstuck","ladestellungX","Ladestellung X-Achse","Ladeposition X","[mm]")}
          {fld("werkstuck","ladestellungY","Ladestellung Y-Achse","Ladeposition Y","[mm]")}
          {fld("werkstuck","drehrichtungFraeser","Drehrichtung Fräser","Fræserens omløbsretning","[+1 / -1]")}
          {subHdr("Nute / Not")}
          {fld("werkstuck","nuteEinstechen","Nute einstechen","Indstik not","[1=Ja, 0=Nein]")}
          {fld("werkstuck","einstechposition","Einstechposition","Indstiksposition","[mm]")}
          {fld("werkstuck","kerndurchmesserNut","Kerndurchmesser Nut","Kernediameter not","[mm]")}
          {fld("werkstuck","schwenkwinkel","Schwenkwinkel","Svingvinkel","[Grad]")}
          {fld("werkstuck","lader","Lader","Lader","[1, 2, 3, 4]")}
          {fld("werkstuck","zangeType","Zange=1, Tasseau=2, Spitze=3","Tang=1, Tasseau=2, Spids=3","")}
        </div>}
      </div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14,overflow:"hidden"}}>
        {accHdr("entgraten","Entgratunsparameter","Afgratningsparametre","ti-tool")}
        {mzOpenSec.entgraten&&<div>
          {entSec("entgratenVorne","Vorne","Forrest")}
          {entSec("entgratenHinten","Hinten","Bagerst")}
        </div>}
      </div>
    </>);
  };
  const save=()=>{
    const e={};
    if(!form.partNumber.trim()) e.partNumber="Skal udfyldes";
    if(!form.machine) e.machine="Skal udfyldes";
    if(!form.department) e.department="Skal udfyldes";
    if(deptSubDepts.length>0&&!form.subDepartment) e.subDepartment="Skal udfyldes";
    if(Object.keys(e).length){setErrs(e);return;}
    const now=Date.now();
    const out={...form};
    if(!showList2){out.tools2=[];out.tools3=[];}
    if(!showList3) out.tools3=[];
    clearDraft(user.id,draftId);
    setBaseline(JSON.stringify(form)); // saved — nothing left to keep
    onSave({...out,id:out.id||now,createdAt:out.createdAt||now,updatedAt:now,createdBy:out.createdBy||user.name});
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <button style={{...btn("outline",false,true),padding:"8px 12px",flexShrink:0}} onClick={onBack}><i className="ti ti-arrow-left"/></button>
        <div style={{fontSize:15,color:C.amber,letterSpacing:2,textTransform:"uppercase"}}>{sheet?"Rediger opstillingsark":"Nyt opstillingsark"}</div>
      </div>
      {restored&&(
        <div style={{background:"rgba(39,174,96,.08)",border:"1px solid rgba(39,174,96,.4)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:15,color:C.text,lineHeight:1.5,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:220}}>
            <i className="ti ti-restore" style={{color:C.green}}/> <b>Hentet tilbage:</b> det du skrev kl. {new Date(restored.savedAt).toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"})} {new Date(restored.savedAt).toDateString()!==new Date().toDateString()?`d. ${new Date(restored.savedAt).toLocaleDateString("da-DK",{day:"numeric",month:"short"})} `:""}er ikke gemt endnu.
            <div style={{fontSize:14,color:C.muted,marginTop:2}}>Fortsæt og tryk Gem nederst, når du er færdig.{restored.photosDropped?" Billederne kunne ikke huskes — tag dem igen.":""}</div>
          </div>
          <button style={btn("outline",false,true)} onClick={startOver}><i className="ti ti-trash"/> Start forfra</button>
        </div>
      )}
      {!sheet&&prefill&&(
        <div style={{background:"rgba(240,165,0,.08)",border:"1px solid rgba(240,165,0,.35)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:15,color:C.text,lineHeight:1.5}}>
          <i className="ti ti-clipboard-plus" style={{color:C.amber}}/> Der er intet opstillingsark for <b>{prefill.partNumber}</b> på <b>{prefill.machine}</b> endnu.
          <div style={{fontSize:14,color:C.muted,marginTop:4}}>Jobbet er startet. Udfyld arket mens du stiller op, og tryk Gem nederst — så er det klar næste gang.</div>
        </div>
      )}
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Identifikation</div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{marginBottom:10}}><label style={label}>Tegningsnr. *</label><input style={inp(errs.partNumber)} value={form.partNumber} onChange={e=>setF("partNumber",e.target.value)} placeholder="f.eks. CV-155"/>{errs.partNumber&&<div style={errMsg}>{errs.partNumber}</div>}</div>
        <div style={{marginBottom:10}}><label style={label}>Maskine *</label><select style={sel(errs.machine)} value={form.machine} onChange={e=>{const d=getDept(e.target.value);setForm(p=>({...p,machine:e.target.value,department:d||p.department}));}}><option value="">— Vælg maskine —</option>{(machines||[]).filter(m=>m.active).map(m=><option key={m.id}>{m.name}</option>)}</select>{errs.machine&&<div style={errMsg}>{errs.machine}</div>}</div>
        <div style={{marginBottom:10}}><label style={label}><i className="ti ti-building" style={{fontSize:14}}/> Afdeling *</label><select style={sel(errs.department)} value={form.department||""} onChange={e=>setForm(p=>({...p,department:e.target.value,subDepartment:"",params:[]}))}><option value="">— Vælg afdeling —</option>{[...new Set([...Object.keys(subDepartments||{}),...Object.keys(setupDeptParams||{}).filter(k=>!Object.values(subDepartments||{}).flat().includes(k))])].sort().map(d=><option key={d} value={d}>{d}</option>)}</select>{errs.department&&<div style={errMsg}>{errs.department}</div>}</div>
        {deptSubDepts.length>0&&<div style={{marginBottom:10}}><label style={label}><i className="ti ti-git-branch" style={{fontSize:14}}/> Underafdeling *</label><select style={sel(errs.subDepartment)} value={form.subDepartment||""} onChange={e=>{const sd=e.target.value;const autoParams=((setupDeptParams||{})[sd]||[]).map(k=>({key:k,value:""}));setForm(p=>({...p,subDepartment:sd,params:autoParams}));}}><option value="">— Vælg underafdeling —</option>{deptSubDepts.map(sd=><option key={sd} value={sd}>{sd}</option>)}</select>{errs.subDepartment&&<div style={errMsg}>{errs.subDepartment}</div>}</div>}
        <div style={{marginBottom:10}}><label style={{...label,color:C.amber}}>Programnavn</label><input style={{...inp(),fontSize:20,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.amber,letterSpacing:1}} value={form.subProgram||""} onChange={e=>setF("subProgram",e.target.value)} placeholder="e.g. O1234"/></div>
        {[["customer","Kunde","f.eks. SPX"],["material","Materiale","f.eks. JM3"],["revision","Revision","e.g. A"],...(deptSubDepts.length===0?[["planProgram","Planprogram",""]]:[])] .map(([k,lbl,ph])=>(<div key={k} style={{marginBottom:10}}><label style={label}>{lbl}</label><input style={inp()} value={form[k]||""} onChange={e=>setF(k,e.target.value)} placeholder={ph}/></div>))}
        <div style={{marginBottom:10}}>
          <label style={{...label,color:{" Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[form.operation]||undefined}}>Operation</label>
          <select style={{...sel(),fontWeight:700,color:{"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[form.operation]||C.text}} value={form.operation||""} onChange={e=>setF("operation",e.target.value)}>
            <option value="">— Vælg operation —</option>
            <option value="Side 1">Side 1</option>
            <option value="Side 2">Side 2</option>
            <option value="Finish Part">Finish Part</option>
          </select>
        </div>
      </div>
      {deptSubDepts.length===0&&<>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Format for genstartskode</div>
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
          <div><label style={label}>Præfiks</label><input style={inp()} value={form.restartPrefix||"NAT"} onChange={e=>setF("restartPrefix",e.target.value)} placeholder="f.eks. NAT"/></div>
          <div><label style={label}>Antal cifre</label><select style={sel()} value={form.restartPad||2} onChange={e=>setF("restartPad",parseInt(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} digits</option>)}</select></div>
        </div>
        <div style={{fontSize:14,color:C.muted,background:C.raised,borderRadius:6,padding:"6px 10px"}}>Værktøj 8 → <span style={{color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{rc(8)}</span>&nbsp;·&nbsp;Værktøj 1 → <span style={{color:C.amber,fontFamily:"'Share Tech Mono',monospace"}}>{rc(1)}</span></div>
      </div>
      </>}
      {deptSubDepts.length>0&&form.subDepartment!=="MZ"&&form.subDepartment!=="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Opspændingsværktøj</div>}
      {deptSubDepts.length>0&&form.subDepartment!=="MZ"&&form.subDepartment!=="150"&&fortandingToolEditor()}
      {form.subDepartment==="MZ"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Værktøj</div>}
      {form.subDepartment==="MZ"&&mzToolEditor()}
      {form.subDepartment==="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Fräser / værktøj</div>}
      {form.subDepartment==="150"&&eriksToolEditor()}
      {deptSubDepts.length===0&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Værktøjsliste — hoved</div>}
      {deptSubDepts.length===0&&toolListEditor("tools",C.amber)}
      {deptSubDepts.length===0&&(showList2?(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase"}}>Værktøjsliste — under</div>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.red,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:4}} onClick={()=>{setShowList2(false);setShowList3(false);setForm(p=>({...p,tools2:[],tools3:[]}));}}><i className="ti ti-x"/> Fjern</button>
          </div>
          {toolListEditor("tools2",C.blue)}
          {showList3?(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase"}}>Værktøjsliste — 3.</div>
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,justifyContent:"center",color:C.red,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:4}} onClick={()=>{setShowList3(false);setForm(p=>({...p,tools3:[]}));}}><i className="ti ti-x"/> Fjern</button>
              </div>
              {toolListEditor("tools3",C.green)}
            </>
          ):(
            <button style={{...btn("outline",true,true),borderColor:C.green,color:C.green,marginBottom:14}} onClick={()=>setShowList3(true)}><i className="ti ti-plus"/> Tilføj tredje værktøjsliste</button>
          )}
        </>
      ):(
        <button style={{...btn("outline",true,true),borderColor:C.blue,color:C.blue,marginBottom:14}} onClick={()=>setShowList2(true)}><i className="ti ti-plus"/> Tilføj underværktøjsliste</button>
      ))}
      {form.subDepartment==="150"&&<div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Einstellplan — 150</div>}
      {form.subDepartment==="150"&&eriksSetupEditor()}
      {form.subDepartment==="MZ"&&<div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Opstillingsparametre</div>}
      {form.subDepartment==="MZ"&&mzSetupEditor()}
      {form.subDepartment==="MZ"&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {(form.params||[]).length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Ingen ekstra parametre tilføjet endnu</div>}
        {(form.params||[]).map((p,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,width:130,flexShrink:0}}>{p.key}</div>
            <input style={{...inp(),flex:1,fontSize:16,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}} value={p.value||""} onChange={e=>setForm(pr=>({...pr,params:pr.params.map((x,j)=>j===i?{...x,value:e.target.value}:x)}))} placeholder="Værdi…"/>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:17,padding:"2px 4px",flexShrink:0}} onClick={()=>setForm(pr=>({...pr,params:pr.params.filter((_,j)=>j!==i)}))}><i className="ti ti-x"/></button>
          </div>
        ))}
        <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
          <select style={{...sel(),flex:1}} defaultValue="" onChange={e=>{const v=e.target.value;if(!v)return;setForm(pr=>({...pr,params:[...(pr.params||[]),{key:v,value:""}]}));e.target.value="";}}>
            <option value="">+ Tilføj parameter…</option>
            {(setupParamOptions||[]).map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>}
      {form.subDepartment!=="MZ"&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Opstillingsparametre</div>
      </div>}
      {form.subDepartment!=="MZ"&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:14}}>
        {(form.params||[]).length===0&&<div style={{padding:"14px",textAlign:"center",color:C.muted,fontSize:14}}>Ingen parametre tilføjet endnu</div>}
        {(form.params||[]).map((p,i)=>(
          <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,width:130,flexShrink:0}}>{p.key}</div>
            <input style={{...inp(),flex:1,fontSize:16,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}} value={p.value||""} onChange={e=>setForm(pr=>({...pr,params:pr.params.map((x,j)=>j===i?{...x,value:e.target.value}:x)}))} placeholder="Værdi…"/>
            <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:17,padding:"2px 4px",flexShrink:0}} onClick={()=>setForm(pr=>({...pr,params:pr.params.filter((_,j)=>j!==i)}))}><i className="ti ti-x"/></button>
          </div>
        ))}
        <div style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
          <select style={{...sel(),flex:1}} defaultValue="" onChange={e=>{const v=e.target.value;if(!v)return;setForm(pr=>({...pr,params:[...(pr.params||[]),{key:v,value:""}]}));e.target.value="";}} >
            <option value="">+ Tilføj parameter…</option>
            {(setupParamOptions||[]).map(name=><option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>}
      <div style={{marginBottom:20}}><label style={label}>Noter</label><textarea style={{...inp(),minHeight:80,resize:"vertical",display:"block"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)} placeholder="f.eks. EMNE TID 1 MINUT OG 22 SEKUNDER"/></div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Fotos</div>
        {(form.photos||[]).length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {(form.photos||[]).map((p,i)=>(
              <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",background:C.raised,aspectRatio:"4/3"}}>
                <img src={p.url} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                <button onClick={()=>setF("photos",(form.photos||[]).filter((_,j)=>j!==i))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.7)",border:"none",borderRadius:4,color:"#fff",cursor:"pointer",padding:"2px 6px",fontSize:15}}><i className="ti ti-x"/></button>
                {p.caption!==undefined&&<input style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",fontSize:17,fontWeight:500,padding:"10px 10px",outline:"none"}} value={p.caption||""} onChange={e=>setF("photos",(form.photos||[]).map((x,j)=>j===i?{...x,caption:e.target.value}:x))} placeholder="Billedtekst…"/>}
              </div>
            ))}
          </div>
        )}
        {/* Two ways in: the camera right away, or pictures already on the tablet
            (a "multiple" picker on Android goes straight to the gallery, so the camera needs its own button) */}
        {uploading
          ?<div style={{display:"flex",alignItems:"center",gap:8,background:C.raised,border:`1px dashed ${C.border}`,borderRadius:8,padding:"14px",color:C.muted,fontSize:15}}><i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/> Uploader…</div>
          :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["camera","Tag foto",true],["photo","Vælg billeder",false]].map(([icon,text,camera])=>(
              <label key={icon} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:50,background:C.raised,border:`1px dashed ${C.border}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",color:C.text,fontSize:15}}>
                <i className={`ti ti-${icon}`} style={{fontSize:20,color:C.amber}}/> {text}
                <input type="file" accept="image/*" {...(camera?{capture:"environment"}:{multiple:true})} style={{display:"none"}} onChange={addPhotos}/>
              </label>
            ))}
          </div>}
        {photosDropped&&<div style={{fontSize:14,color:C.amber,marginTop:8}}><i className="ti ti-alert-triangle"/> Billederne fylder for meget til at blive husket, hvis appen lukker — tryk Gem snart for at beholde dem.</div>}
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Tegninger (PDF)</div>
        <PdfDrawings files={form.drawings} onChange={v=>setF("drawings",v)}/>
      </div>
      {form.subDepartment==="MZ"&&mzAdvancedEditor()}
      <button style={btn("primary",true)} onClick={save}><i className="ti ti-check"/> Gem opstillingsark</button>
    </div>
  );
}
