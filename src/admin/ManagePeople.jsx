import { useState } from "react";
import { C, card, inp, btn, tag, avatar, label, errMsg } from "../lib/theme";
import { initials } from "../lib/util";

export function ManageOperators({users,setUsers:setUsersRaw,machines,departments,jobs,setJobs,saveNow}){
  const setUsers=fn=>{setUsersRaw(fn);saveNow&&saveNow();};
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [pin,setPin]=useState(""); const [errs,setErrs]=useState({});
  const [editId,setEditId]=useState(null); const [editPin,setEditPin]=useState(""); const [editErr,setEditErr]=useState("");
  const [editDeptId,setEditDeptId]=useState(null);
  const [deleteId,setDeleteId]=useState(null);
  const [editNameId,setEditNameId]=useState(null); const [editNameVal,setEditNameVal]=useState(""); const [editNameErr,setEditNameErr]=useState("");
  const [showRemoved,setShowRemoved]=useState(false);
  const operators=users.filter(u=>u.role==="operator"&&!u.removed);
  const removed=users.filter(u=>u.role==="operator"&&u.removed);
  const allDepts=(departments||[]).length>0?(departments||[]):[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    const e={};
    if(!name.trim()) e.name="Navn skal udfyldes";
    if(!/^\d{4}$/.test(pin)) e.pin="PIN skal være præcis 4 cifre";
    if(Object.keys(e).length){setErrs(e);return;}
    setUsers(prev=>[...prev,{id:Date.now(),name:name.trim(),pin,role:"operator",active:true,departments:[]}]);
    setName("");setPin("");setErrs({});setAdding(false);
  };
  const toggleDept=(uid,dept)=>{
    setUsers(prev=>prev.map(u=>{
      if(u.id!==uid) return u;
      const depts=u.departments||[];
      const next=depts.includes(dept)?depts.filter(d=>d!==dept):[...depts,dept];
      return{...u,departments:next};
    }));
  };
  const toggle=id=>setUsers(prev=>prev.map(u=>u.id===id?{...u,active:!u.active}:u));
  const savePin=id=>{
    if(!/^\d{4}$/.test(editPin)){setEditErr("Skal være 4 cifre");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,pin:editPin}:u));
    setEditId(null);setEditPin("");setEditErr("");
  };
  const confirmDelete=id=>{
    // Mark as removed — keeps them in users array so their name stays on historical jobs
    setUsers(prev=>prev.map(u=>u.id===id?{...u,removed:true,active:false}:u));
    setDeleteId(null);
  };
  const saveOperatorName=id=>{
    const nv=editNameVal.trim();
    if(!nv){setEditNameErr("Navn skal udfyldes");return;}
    setUsers(prev=>prev.map(u=>u.id===id?{...u,name:nv}:u));
    setJobs(prev=>prev.map(j=>j.operatorId===id?{...j,operatorName:nv}:j));
    setEditNameId(null);setEditNameErr("");
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{operators.length} operatører</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Annuller":"Tilføj operatør"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Ny operatør</div>
          <div style={{marginBottom:10}}><label style={label}>Fulde navn *</label><input style={inp(errs.name)} value={name} onChange={e=>setName(e.target.value)} placeholder="f.eks. Jan Mortensen"/>{errs.name&&<div style={errMsg}>{errs.name}</div>}</div>
          <div style={{marginBottom:12}}><label style={label}>4-cifret PIN *</label><input type="password" inputMode="numeric" maxLength={4} style={{...inp(errs.pin),letterSpacing:8,fontSize:22,textAlign:"center"}} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="••••"/>{errs.pin&&<div style={errMsg}>{errs.pin}</div>}</div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-user-plus"/> Tilføj operatør</button>
        </div>
      )}
      {operators.map(u=>(
        <div key={u.id} style={{...card(),opacity:u.active?1:0.55}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={avatar()}>{initials(u.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,color:C.text,fontWeight:700}}>{u.name}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:2}}>PIN: {"●".repeat(4)} &nbsp;·&nbsp; <span style={{color:u.active?C.green:C.red}}>{u.active?"Aktive":"Inaktiv"}</span></div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditNameId(editNameId===u.id?null:u.id);setEditNameVal(u.name);setEditNameErr("");setEditId(null);setEditDeptId(null);setDeleteId(null);}}><i className="ti ti-pencil"/></button>
              <button style={btn("outline",false,true)} onClick={()=>{setEditId(editId===u.id?null:u.id);setEditDeptId(null);setDeleteId(null);setEditNameId(null);setEditPin("");setEditErr("");}}><i className="ti ti-key"/> PIN</button>
              {allDepts.length>0&&<button style={btn("blue",false,true)} onClick={()=>{setEditDeptId(editDeptId===u.id?null:u.id);setEditId(null);setDeleteId(null);setEditNameId(null);}}><i className="ti ti-building-factory"/> Afd.</button>}
              <button style={btn(u.active?"danger":"success",false,true)} onClick={()=>toggle(u.id)}>{u.active?"Deaktiver":"Aktiver"}</button>
              <button style={btn("danger",false,true)} onClick={()=>{setDeleteId(deleteId===u.id?null:u.id);setEditId(null);setEditDeptId(null);setEditNameId(null);}}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {editNameId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb operatør</div>
              <input style={inp(editNameErr)} value={editNameVal} onChange={e=>{setEditNameVal(e.target.value);setEditNameErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveOperatorName(u.id);if(e.key==="Escape")setEditNameId(null);}}/>
              {editNameErr&&<div style={errMsg}>{editNameErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditNameId(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveOperatorName(u.id)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
          {/* Auto-pause — always visible, saves on change */}
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <i className="ti ti-clock" style={{color:u.autoPauseTime?C.amber:C.muted,fontSize:16,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Automatisk pause kl.</div>
              <input
                type="time"
                style={{...inp(),fontSize:18,color:u.autoPauseTime?C.amber:C.text,padding:"8px 10px",width:"auto",minWidth:120}}
                value={u.autoPauseTime||""}
                onChange={e=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:e.target.value}:x))}
              />
            </div>
            {u.autoPauseTime&&(
              <button style={btn("danger",false,true)} onClick={()=>setUsers(prev=>prev.map(x=>x.id===u.id?{...x,autoPauseTime:""}:x))}>
                <i className="ti ti-x"/> Ryd
              </button>
            )}
          </div>
          {/* Department badges */}
          {(u.departments||[]).length>0&&editDeptId!==u.id&&(
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
              {(u.departments||[]).map(d=>(
                <span key={d} style={{fontSize:13,color:C.blue,background:"rgba(59,130,246,.12)",padding:"2px 8px",borderRadius:10}}>
                  <i className="ti ti-building-factory"/> {d}
                </span>
              ))}
            </div>
          )}
          {(u.departments||[]).length===0&&editDeptId!==u.id&&allDepts.length>0&&(
            <div style={{marginTop:6,fontSize:13,color:C.muted}}><i className="ti ti-eye"/> Ser alle afdelinger</div>
          )}
          {/* Department checkboxes panel */}
          {editDeptId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Afdelinger — {u.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Sæt kryds ved de afdelinger operatøren arbejder i. Lad alle være tomme for at vise alle maskiner.</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {allDepts.map(d=>{
                  const active=(u.departments||[]).includes(d);
                  return(
                    <button key={d} onClick={()=>toggleDept(u.id,d)} style={{
                      padding:"7px 12px",borderRadius:8,border:`1px solid ${active?C.blue:C.border}`,
                      background:active?"rgba(59,130,246,.18)":"transparent",
                      color:active?C.blue:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:15,
                    }}>
                      {active?<i className="ti ti-checkbox"/>:<i className="ti ti-square"/>} {d}
                    </button>
                  );
                })}
              </div>
              <div style={{marginTop:10}}>
                <button style={btn("outline",false,true)} onClick={()=>setEditDeptId(null)}>Færdig</button>
              </div>
            </div>
          )}
          {deleteId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}40`,background:`${C.red}08`,borderRadius:8,padding:12}}>
              <div style={{fontSize:15,color:C.text,marginBottom:4,fontWeight:600}}>Fjern {u.name}?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:12}}>Vedkommende kan ikke længere logge ind. Alle tidligere job og historik bliver gemt under navnet.</div>
              <div style={{display:"flex",gap:8}}>
                <button style={{...btn("danger",true,true),flex:1}} onClick={()=>confirmDelete(u.id)}><i className="ti ti-trash"/> Ja, fjern</button>
                <button style={btn("outline",false,true)} onClick={()=>setDeleteId(null)}>Annuller</button>
              </div>
            </div>
          )}
          {editId===u.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Skift PIN for {u.name}</div>
              <div style={{display:"flex",gap:8}}>
                <input type="password" inputMode="numeric" maxLength={4} style={{...inp(!!editErr),flex:1,letterSpacing:8,fontSize:22,textAlign:"center"}} value={editPin} onChange={e=>setEditPin(e.target.value.replace(/\D/g,""))} placeholder="Ny PIN"/>
                <button style={btn("primary",false,false)} onClick={()=>savePin(u.id)}>Gem</button>
              </div>
              {editErr&&<div style={errMsg}>{editErr}</div>}
            </div>
          )}
        </div>
      ))}

      {/* Removed operators — collapsed by default */}
      {removed.length>0&&(
        <div style={{marginTop:16}}>
          <button style={{...tag(showRemoved),width:"100%",justifyContent:"space-between",display:"flex",alignItems:"center"}} onClick={()=>setShowRemoved(s=>!s)}>
            <span><i className="ti ti-user-off"/> Tidligere ansatte · {removed.length}</span>
            <i className={`ti ti-chevron-${showRemoved?"up":"down"}`}/>
          </button>
          {showRemoved&&removed.map(u=>(
            <div key={u.id} style={{...card(),opacity:0.5,marginTop:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{...avatar(),background:C.raised,color:C.muted}}>{initials(u.name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,color:C.muted,fontWeight:700}}>{u.name}</div>
                  <div style={{fontSize:13,color:C.muted,marginTop:2}}>Fjernet · historik bevaret</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManageMachines({machines,setMachines:setMachinesRaw,departments,jobs,saveNow}){
  const setMachines=fn=>{setMachinesRaw(fn);saveNow&&saveNow();};
  const [adding,setAdding]=useState(false); const [name,setName]=useState(""); const [dept,setDept]=useState(""); const [err,setErr]=useState("");
  const [editTargetId,setEditTargetId]=useState(null); const [editTargetHours,setEditTargetHours]=useState("");
  const [editDeptId,setEditDeptId]=useState(null); const [editDeptVal,setEditDeptVal]=useState("");
  const [editNameId,setEditNameId]=useState(null); const [editNameVal,setEditNameVal]=useState(""); const [editNameErr,setEditNameErr]=useState("");
  const [confirmRemoveId,setConfirmRemoveId]=useState(null);
  const allDepts=(departments||[]).length>0?(departments||[]):[...new Set(machines.map(m=>m.department||"").filter(Boolean))].sort();
  const save=()=>{
    if(!name.trim()){setErr("Navn skal udfyldes");return;}
    if(machines.find(m=>m.name.toLowerCase()===name.trim().toLowerCase())){setErr("Maskinen findes allerede");return;}
    setMachines(prev=>[...prev,{id:Date.now(),name:name.trim(),department:dept.trim(),active:true,weeklyTargetHours:0}]);
    setName("");setDept("");setErr("");setAdding(false);
  };
  const saveDept=id=>{
    setMachines(prev=>prev.map(m=>m.id===id?{...m,department:editDeptVal.trim()}:m));
    setEditDeptId(null);
  };
  const toggle=id=>setMachines(prev=>prev.map(m=>m.id===id?{...m,active:!m.active}:m));
  const del=id=>{
    setConfirmRemoveId(id);
    setEditNameId(null);setEditDeptId(null);setEditTargetId(null);
  };
  const confirmRemove=id=>{
    setMachines(prev=>prev.map(m=>m.id===id?{...m,active:false,removed:true}:m));
    setConfirmRemoveId(null);
    if(saveNow) saveNow();
  };
  const openTarget=m=>{setEditTargetId(m.id);setEditTargetHours(m.weeklyTargetHours?String(m.weeklyTargetHours):"");};
  const saveMachineName=id=>{
    const nv=editNameVal.trim();
    if(!nv){setEditNameErr("Navn skal udfyldes");return;}
    if(machines.find(m=>m.id!==id&&m.name.toLowerCase()===nv.toLowerCase())){setEditNameErr("Navnet findes allerede");return;}
    setMachines(prev=>prev.map(m=>m.id===id?{...m,name:nv}:m));
    setEditNameId(null);setEditNameErr("");
  };
  const saveTarget=id=>{
    const h=parseFloat(editTargetHours)||0;
    setMachines(prev=>prev.map(m=>m.id===id?{...m,weeklyTargetHours:h}:m));
    setEditTargetId(null);
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{machines.filter(m=>m.active).length} aktive</div>
        <button style={btn("primary",false,true)} onClick={()=>setAdding(a=>!a)}><i className={`ti ti-${adding?"x":"plus"}`}/> {adding?"Annuller":"Tilføj maskine"}</button>
      </div>
      {adding&&(
        <div style={{...card(),border:`1px solid ${C.amber}`,marginBottom:16}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Ny maskine</div>
          <div style={{marginBottom:10}}><label style={label}>Maskinens navn *</label><input style={inp(!!err)} value={name} onChange={e=>setName(e.target.value)} placeholder="f.eks. CNC-fræser 3"/>{err&&<div style={errMsg}>{err}</div>}</div>
          <div style={{marginBottom:12}}>
            <label style={label}>Afdeling</label>
            <select style={{...inp(),color:dept?C.text:C.muted}} value={dept} onChange={e=>setDept(e.target.value)}>
              <option value="">Ingen afdeling (synlig for alle)</option>
              {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>Valgfrit — bestemmer hvilke operatører der ser maskinen</div>
          </div>
          <button style={btn("success",true)} onClick={save}><i className="ti ti-plus"/> Tilføj maskine</button>
        </div>
      )}
      {machines.filter(m=>!m.removed).map(m=>(
        <div key={m.id} style={{...card(),opacity:m.active?1:0.5}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:8,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <i className="ti ti-robot" style={{fontSize:20,color:m.active?C.amber:C.muted}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,color:C.text,fontWeight:700}}>{m.name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:13,letterSpacing:1,textTransform:"uppercase",color:m.active?C.green:C.red}}>{m.active?"Aktive":"Inaktiv"}</span>
                {m.department&&<span style={{fontSize:13,color:C.blue,background:"rgba(59,130,246,.12)",padding:"1px 7px",borderRadius:10}}><i className="ti ti-building-factory"/> {m.department}</span>}
              </div>
              {m.weeklyTargetHours>0&&editTargetId!==m.id&&(
                <div style={{fontSize:13,color:C.muted,marginTop:2}}><i className="ti ti-target"/> {m.weeklyTargetHours}t / uge mål</div>
              )}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={btn("outline",false,true)} onClick={()=>{setEditNameId(editNameId===m.id?null:m.id);setEditNameVal(m.name);setEditNameErr("");setEditDeptId(null);setEditTargetId(null);}}><i className="ti ti-pencil"/></button>
              <button style={btn("outline",false,true)} onClick={()=>{setEditDeptId(editDeptId===m.id?null:m.id);setEditDeptVal(m.department||"");setEditTargetId(null);setEditNameId(null);}}><i className="ti ti-building-factory"/> Afd.</button>
              <button style={btn("outline",false,true)} onClick={()=>{editTargetId===m.id?setEditTargetId(null):openTarget(m);setEditDeptId(null);setEditNameId(null);}}><i className="ti ti-target"/> Mål</button>
              <button style={btn(m.active?"outline":"success",false,true)} onClick={()=>toggle(m.id)}>{m.active?"Deaktiver":"Aktiver"}</button>
              <button style={btn("danger",false,true)} onClick={()=>del(m.id)}><i className="ti ti-trash"/></button>
            </div>
          </div>
          {editNameId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb maskine</div>
              <input style={inp(editNameErr)} value={editNameVal} onChange={e=>{setEditNameVal(e.target.value);setEditNameErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveMachineName(m.id);if(e.key==="Escape")setEditNameId(null);}}/>
              {editNameErr&&<div style={errMsg}>{editNameErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditNameId(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveMachineName(m.id)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
          {editDeptId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Afdeling — {m.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Operatører i denne afdeling ser maskinen. Lad stå tomt for at vise den for alle.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <select style={{...inp(),flex:1,color:editDeptVal?C.text:C.muted}} value={editDeptVal} onChange={e=>setEditDeptVal(e.target.value)}>
                  <option value="">Ingen afdeling (synlig for alle)</option>
                  {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                <button style={btn("primary",false,false)} onClick={()=>saveDept(m.id)}>Gem</button>
                {m.department&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,department:""}:x));setEditDeptId(null);}}>Ryd</button>}
              </div>
            </div>
          )}
          {editTargetId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Ugentligt produktionsmål — {m.name}</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>Antal timer maskinen skal producere pr. uge. Bruges til at følge udnyttelsen under Maskiner.</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" min="0" max="168" style={{...inp(),flex:1,fontSize:20,textAlign:"center",color:C.green}} value={editTargetHours} onChange={e=>setEditTargetHours(e.target.value)} placeholder="0"/>
                <div style={{fontSize:15,color:C.muted}}>timer</div>
                <button style={btn("primary",false,false)} onClick={()=>saveTarget(m.id)}>Gem</button>
                {m.weeklyTargetHours>0&&<button style={btn("danger",false,true)} onClick={()=>{setMachines(prev=>prev.map(x=>x.id===m.id?{...x,weeklyTargetHours:0}:x));setEditTargetId(null);}}>Ryd</button>}
              </div>
            </div>
          )}
          {confirmRemoveId===m.id&&(
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.red}`,background:"rgba(231,76,60,.07)",borderRadius:8,padding:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:6}}><i className="ti ti-alert-triangle"/> Fjern {m.name}?</div>
              <div style={{fontSize:14,color:C.muted,marginBottom:10}}>
                Maskinen skjules for operatørerne. Tidligere job bevares.
                {jobs&&(jobs.filter(j=>j.machine===m.name).length>0)&&(
                  <span style={{color:C.amber,fontWeight:600}}> {jobs.filter(j=>j.machine===m.name).length} job henviser til denne maskine.</span>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={btn("outline",false,false)} onClick={()=>setConfirmRemoveId(null)}>Annuller</button>
                <button style={btn("danger",false,false)} onClick={()=>confirmRemove(m.id)}><i className="ti ti-trash"/> Fjern</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
