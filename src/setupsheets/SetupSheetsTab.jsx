import { useState, useEffect } from "react";
import { notify } from "../components/Feedback";
import { C, inp, btn } from "../lib/theme";
import { fmtDate } from "../lib/util";
import { SetupSheetDetail } from "./SetupSheetDetail";
import { SetupSheetForm } from "./SetupSheetForm";

// ═══════════════════════════════════════════════════════
// SETUP SHEETS — list + detail + form (turning)
// ═══════════════════════════════════════════════════════
export function SetupSheetsTab({user,setupSheets,setSetupSheets,machines,saveNow,stateRef,setupDeptParams,setSetupDeptParams,subDepartments,setSubDepartments,tools,cabinets,setTab,setFocusToolId,focusSheetId,setFocusSheetId,newSheetFor,setNewSheetFor}){
  const [view,setView]=useState("list");
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(focusSheetId){setSelectedId(focusSheetId);setView("detail");setFocusSheetId&&setFocusSheetId(null);}},[focusSheetId]);
  // Started a job with no sheet → open a new sheet with the job filled in
  const [prefill,setPrefill]=useState(null);
  useEffect(()=>{if(newSheetFor){setSelectedId(null);setPrefill(newSheetFor);setView("edit");setNewSheetFor&&setNewSheetFor(null);}},[newSheetFor]);
  const [search,setSearch]=useState("");
  const [deptFilt,setDeptFilt]=useState("all");
  const [subDeptFilt,setSubDeptFilt]=useState("all");
  const [machineFilt,setMachineFilt]=useState("all");
  const [showParamAdmin,setShowParamAdmin]=useState(false);
  const [adminParamDept,setAdminParamDept]=useState("");
  const [adminSubDept,setAdminSubDept]=useState("");
  const [newParamName,setNewParamName]=useState("");
  const [newSubDeptName,setNewSubDeptName]=useState("");
  const selected=selectedId?(setupSheets||[]).find(s=>s.id===selectedId):null;
  // All unique depts from subDepartments keys + machines
  const allDepts=[...new Set([...Object.keys(subDepartments||{}),...(machines||[]).map(m=>m.department).filter(Boolean)])].sort();
  // Current dept has sub-depts?
  const curSubDepts=(subDepartments||{})[deptFilt]||[];
  // Operator filtering: non-admins only see their assigned departments
  const userDepts=user?.departments||[];
  const visibleSheets=(user?.role==="admin"||userDepts.length===0)?(setupSheets||[]):(setupSheets||[]).filter(s=>userDepts.includes(s.department)||!s.department);
  // Sheets visible in current dept/sub-dept filter
  const deptSheets=visibleSheets.filter(s=>{
    if(deptFilt!=="all"&&(s.department||"")!==deptFilt) return false;
    if(subDeptFilt!=="all"&&(s.subDepartment||"")!==subDeptFilt) return false;
    return true;
  });
  const machineNames=[...new Set(deptSheets.map(s=>s.machine).filter(Boolean))].sort();
  const filtered=deptSheets.filter(s=>{
    if(machineFilt!=="all"&&s.machine!==machineFilt) return false;
    const q=search.trim().toLowerCase();
    if(q&&!(s.partNumber||"").toLowerCase().includes(q)&&!(s.customer||"").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  const saveSheets=(updated)=>{
    setSetupSheets(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupSheets:updated};
    saveNow&&saveNow();
  };
  const saveDeptParams=(updated)=>{
    setSetupDeptParams(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupDeptParams:updated};
    saveNow&&saveNow();
  };
  const saveSubDepts=(updated)=>{
    setSubDepartments(updated);
    if(stateRef) stateRef.current={...stateRef.current,subDepartments:updated};
    saveNow&&saveNow();
  };
  // Admin: which dept + sub-dept is being edited
  const editingAdminDept=adminParamDept||(allDepts[0]||"");
  const editingAdminDeptSubDepts=(subDepartments||{})[editingAdminDept]||[];
  const editingSubDept=adminSubDept||(editingAdminDeptSubDepts[0]||"");
  // The key into setupDeptParams for the currently-edited slot
  const editingKey=editingAdminDeptSubDepts.length>0?editingSubDept:editingAdminDept;
  const editingParams=(setupDeptParams||{})[editingKey]||[];
  const addParamOption=()=>{
    const v=newParamName.trim();
    if(!v||editingParams.includes(v)) return;
    saveDeptParams({...(setupDeptParams||{}),[editingKey]:[...editingParams,v]});
    setNewParamName("");
  };
  const removeParamOption=name=>saveDeptParams({...(setupDeptParams||{}),[editingKey]:editingParams.filter(x=>x!==name)});
  const addSubDept=()=>{
    const v=newSubDeptName.trim();
    if(!v) return;
    const cur=(subDepartments||{})[editingAdminDept]||[];
    if(cur.includes(v)) return;
    saveSubDepts({...(subDepartments||{}),[editingAdminDept]:[...cur,v]});
    setNewSubDeptName("");
    setAdminSubDept(v);
  };
  const removeSubDept=name=>{
    const cur=(subDepartments||{})[editingAdminDept]||[];
    saveSubDepts({...(subDepartments||{}),[editingAdminDept]:cur.filter(x=>x!==name)});
    if(adminSubDept===name) setAdminSubDept("");
  };
  const duplicateSheet=sheet=>{
    const now=Date.now();
    const copy={...sheet,id:now,partNumber:sheet.partNumber+" (kopi)",createdAt:now,updatedAt:now,createdBy:user?.name||""};
    const updated=[copy,...(setupSheets||[])];
    setSetupSheets(updated);
    if(stateRef) stateRef.current={...stateRef.current,setupSheets:updated};
    setSelectedId(now);
    setView("edit");
  };
  const backupPdf=async(sheet)=>{
    try{await fetch("/api/setupsheet-pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sheet})});}
    catch{}
  };
  // Compute dept-specific params for the form
  const sheetDept=selected?(machines||[]).find(m=>m.name===selected.machine)?.department||"":"";
  const formParamOptions=(setupDeptParams||{})[sheetDept]||(setupDeptParams||{})[""]||[];
  if(view==="edit") return(<SetupSheetForm sheet={selected} prefill={selected?null:prefill} machines={machines} user={user} setupDeptParams={setupDeptParams||{}} subDepartments={subDepartments||{}} tools={tools||[]} cabinets={cabinets||[]} onBack={()=>{setPrefill(null);setView(selected?"detail":"list");}} onSave={sheet=>{const updated=selected?(setupSheets||[]).map(s=>s.id===sheet.id?sheet:s):[sheet,...(setupSheets||[])];saveSheets(updated);backupPdf(sheet);setPrefill(null);notify("Opstillingsark gemt");setSelectedId(sheet.id);setView("detail");}}/>);
  const onGoToTool=toolId=>{setFocusToolId&&setFocusToolId(toolId);setTab&&setTab("tools");};
  if(view==="detail"&&selected) return(<SetupSheetDetail sheet={selected} tools={tools||[]} cabinets={cabinets||[]} onBack={()=>setView("list")} onEdit={()=>setView("edit")} onGoToTool={onGoToTool} onDuplicate={()=>duplicateSheet(selected)} onDelete={()=>{saveSheets((setupSheets||[]).filter(s=>s.id!==selected.id));setView("list");setSelectedId(null);}}/>);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <div style={{flex:1,position:"relative"}}>
          <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:16,pointerEvents:"none"}}/>
          <input style={{...inp(),paddingLeft:32}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Søg tegningsnr. eller kunde…"/>
        </div>
        {user?.role==="admin"&&<button style={{...btn("outline",false,true),padding:"8px 12px",background:showParamAdmin?C.amber+"22":"none",borderColor:showParamAdmin?C.amber:C.border,color:showParamAdmin?C.amber:C.muted}} onClick={()=>setShowParamAdmin(p=>!p)} title="Administrer parametre"><i className="ti ti-settings"/></button>}
        <button style={btn("primary",false,true)} onClick={()=>{setSelectedId(null);setPrefill(null);setView("edit");}}><i className="ti ti-plus"/></button>
      </div>
      {showParamAdmin&&user?.role==="admin"&&(
        <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,padding:"14px",marginBottom:12}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Opstillingsparametre — admin</div>
          {/* Dept tabs */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {allDepts.map(d=>(
              <button key={d} style={{fontSize:13,padding:"4px 12px",borderRadius:20,border:`1px solid ${editingAdminDept===d?C.amber:C.border}`,background:editingAdminDept===d?C.amber+"22":C.raised,color:editingAdminDept===d?C.amber:C.muted,cursor:"pointer",fontWeight:editingAdminDept===d?700:400}} onClick={()=>{setAdminParamDept(d);setAdminSubDept("");setNewParamName("");setNewSubDeptName("");}}>{d}</button>
            ))}
          </div>
          {/* Sub-dept management (for depts that use sub-depts like Fortanding) */}
          {editingAdminDeptSubDepts.length>0&&(
            <div style={{background:C.raised,borderRadius:8,padding:"10px 12px",marginBottom:10,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Underafdelinger i {editingAdminDept}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {editingAdminDeptSubDepts.map(sd=>(
                  <div key={sd} style={{display:"flex",alignItems:"center",gap:4,background:editingSubDept===sd?C.amber+"22":C.surface,borderRadius:16,padding:"3px 6px 3px 10px",border:`1px solid ${editingSubDept===sd?C.amber:C.border}`,cursor:"pointer"}} onClick={()=>{setAdminSubDept(sd);setNewParamName("");}}>
                    <span style={{fontSize:14,color:editingSubDept===sd?C.amber:C.text,fontWeight:editingSubDept===sd?700:400}}>{sd}</span>
                    <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px"}} onClick={e=>{e.stopPropagation();removeSubDept(sd);}}><i className="ti ti-x"/></button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp(),flex:1,fontSize:14}} value={newSubDeptName} onChange={e=>setNewSubDeptName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSubDept()} placeholder="Tilføj underafdeling…"/>
                <button style={btn("primary",false,true)} onClick={addSubDept}><i className="ti ti-plus"/></button>
              </div>
            </div>
          )}
          {/* Add sub-dept support to a plain dept */}
          {editingAdminDeptSubDepts.length===0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,color:C.muted,marginBottom:6}}>Tilføj underafdelinger til <strong>{editingAdminDept}</strong></div>
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp(),flex:1,fontSize:14}} value={newSubDeptName} onChange={e=>setNewSubDeptName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSubDept()} placeholder="Navn på underafdeling (f.eks. Affolter 160)"/>
                <button style={btn("primary",false,true)} onClick={addSubDept}><i className="ti ti-plus"/></button>
              </div>
            </div>
          )}
          {/* Param list for the editing key */}
          {editingKey&&(
            <>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Parametre for {editingKey}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {editingParams.length===0&&<div style={{fontSize:14,color:C.muted}}>Ingen parametre endnu.</div>}
                {editingParams.map(name=>(
                  <div key={name} style={{display:"flex",alignItems:"center",gap:4,background:C.raised,borderRadius:16,padding:"4px 8px 4px 10px",border:`1px solid ${C.border}`}}>
                    <span style={{fontSize:14,color:C.text}}>{name}</span>
                    <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.red,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 2px"}} onClick={()=>removeParamOption(name)}><i className="ti ti-x"/></button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...inp(),flex:1}} value={newParamName} onChange={e=>setNewParamName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addParamOption()} placeholder={`Tilføj parameter for ${editingKey}…`}/>
                <button style={btn("primary",false,true)} onClick={addParamOption}><i className="ti ti-plus"/></button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Department tabs */}
      {allDepts.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {["all",...allDepts].map(d=><button key={d} style={{fontSize:13,padding:"4px 12px",borderRadius:20,border:`1px solid ${deptFilt===d?C.blue:C.border}`,background:deptFilt===d?"rgba(59,130,246,.15)":C.raised,color:deptFilt===d?"#3b82f6":C.muted,cursor:"pointer",fontWeight:deptFilt===d?700:400}} onClick={()=>{setDeptFilt(d);setSubDeptFilt("all");setMachineFilt("all");}}>{d==="all"?"Alle afdelinger":d}</button>)}
        </div>
      )}
      {/* Sub-dept tabs (shown when current dept has sub-depts) */}
      {curSubDepts.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {["all",...curSubDepts].map(sd=><button key={sd} style={{fontSize:13,padding:"3px 10px",borderRadius:20,border:`1px solid ${subDeptFilt===sd?"#a78bfa":C.border}`,background:subDeptFilt===sd?"rgba(167,139,250,.15)":C.raised,color:subDeptFilt===sd?"#a78bfa":C.muted,cursor:"pointer",fontWeight:subDeptFilt===sd?700:400}} onClick={()=>{setSubDeptFilt(sd);setMachineFilt("all");}}>{sd==="all"?"Alle underafd.":sd}</button>)}
        </div>
      )}
      {/* Machine sub-filter */}
      {machineNames.length>1&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{["all",...machineNames].map(m=><button key={m} style={{fontSize:13,padding:"3px 10px",borderRadius:20,border:`1px solid ${machineFilt===m?C.amber:C.border}`,background:machineFilt===m?C.amber+"22":C.raised,color:machineFilt===m?C.amber:C.muted,cursor:"pointer",fontWeight:machineFilt===m?700:400}} onClick={()=>setMachineFilt(m)}>{m==="all"?"Alle maskiner":m}</button>)}</div>}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}><i className="ti ti-clipboard-list" style={{fontSize:40,display:"block",marginBottom:12,opacity:.25}}/><div style={{fontSize:16,marginBottom:6}}>Ingen opstillingsark endnu.</div><div style={{fontSize:14,color:C.amber,cursor:"pointer"}} onClick={()=>{setSelectedId(null);setPrefill(null);setView("edit");}}>+ Opret dit første opstillingsark</div></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(s=>(
          <div key={s.id} onClick={()=>{setSelectedId(s.id);setView("detail");}} style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:6}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:2}}>{s.partNumber}</div><div style={{fontSize:14,color:C.muted}}>{[s.customer,s.material].filter(Boolean).join(" · ")}</div></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                <button style={{background:"none",border:"none",minWidth:40,minHeight:40,display:"inline-flex",alignItems:"center",justifyContent:"center",color:C.muted,cursor:"pointer",fontSize:16,padding:"2px 4px",borderRadius:4}} title="Kopier ark" onClick={e=>{e.stopPropagation();duplicateSheet(s);}}><i className="ti ti-copy"/></button>
                {s.department&&deptFilt==="all"&&<span style={{fontSize:12,fontWeight:700,color:C.blue,background:"rgba(59,130,246,.12)",padding:"2px 7px",borderRadius:6}}>{s.department}</span>}{s.subDepartment&&subDeptFilt==="all"&&<span style={{fontSize:12,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,.12)",padding:"2px 7px",borderRadius:6}}>{s.subDepartment}</span>}<span style={{fontSize:13,fontWeight:700,color:C.amber,background:"rgba(240,165,0,.12)",padding:"3px 8px",borderRadius:6}}>{s.machine}</span>{s.operation&&<span style={{fontSize:12,fontWeight:700,padding:"2px 7px",borderRadius:6,color:{"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber}[s.operation]||C.muted,background:{"Side 1":"rgba(59,130,246,.12)","Side 2":"rgba(46,213,115,.12)","Finish Part":"rgba(240,165,0,.12)"}[s.operation]||"transparent"}}>{s.operation}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:12,fontSize:12,color:C.muted,letterSpacing:.5}}>
              <span><i className="ti ti-tool"/> {(s.tools||[]).filter(t=>t.description).length} værktøj</span>
              {(s.tools2||[]).filter(t=>t.description).length>0&&<span><i className="ti ti-tool"/> {(s.tools2||[]).filter(t=>t.description).length} sub</span>}
              <span><i className="ti ti-calendar"/> {fmtDate(s.updatedAt||s.createdAt)}</span>
              {s.createdBy&&<span><i className="ti ti-user"/> {s.createdBy}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
