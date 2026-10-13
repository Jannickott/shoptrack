import { useState } from "react";
import { C, card, inp, btn, errMsg } from "../lib/theme";
import { DAYS_KEY, DAY_NAME } from "../lib/util";

export function WorkHoursSettings({workHours,setWorkHours,saveNow}){
  const ORDER=["mon","tue","wed","thu","fri","sat","sun"];
  const todayKey=DAYS_KEY[new Date().getDay()];
  const [local,setLocal]=useState(()=>{
    const def={start:"07:00",end:"15:00",enabled:true};
    return ORDER.reduce((acc,d)=>({
      ...acc,
      [d]:workHours[d]||(workHours.start&&!workHours.mon
        ?{start:workHours.start,end:workHours.end,enabled:d!=="sat"&&d!=="sun"}
        :{...def,enabled:d!=="sat"&&d!=="sun"}),
    }),{});
  });
  const [saved,setSaved]=useState(false);
  const setDay=(day,field,val)=>setLocal(prev=>({...prev,[day]:{...prev[day],[field]:val}}));
  const save=()=>{setWorkHours(local);saveNow&&saveNow();setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const todayHours=local[todayKey];
  return(
    <div>
      <div style={{...card(),border:`1px solid ${C.amber}`}}>
        <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}><i className="ti ti-clock"/> Arbejdstid</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:14}}>
          Logger man ud inden for arbejdstiden, kører tidurene videre. Uden for arbejdstiden (eller på fridage) sættes de automatisk på pause.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
          {ORDER.map(day=>{
            const dh=local[day];
            const isToday=day===todayKey;
            return(
              <div key={day} style={{background:C.raised,borderRadius:8,padding:"8px 10px",border:`1px solid ${isToday?C.amber:C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  {/* Day toggle button */}
                  <button onClick={()=>setDay(day,"enabled",!dh.enabled)} style={{
                    display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,cursor:"pointer",
                    fontFamily:"inherit",fontSize:14,fontWeight:700,letterSpacing:1,
                    border:`1px solid ${dh.enabled?C.green:C.border}`,
                    background:dh.enabled?"rgba(39,174,96,.15)":"transparent",
                    color:dh.enabled?C.green:C.muted,
                    minWidth:120,
                  }}>
                    <i className={`ti ti-${dh.enabled?"check":"x"}`}/>
                    {DAY_NAME[day]}
                    {isToday&&<span style={{color:C.amber,fontWeight:400,marginLeft:2}}>· I dag</span>}
                  </button>
                  {dh.enabled?(
                    <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.green,padding:"4px 8px",fontFamily:"inherit",fontSize:16,width:100}}
                        value={dh.start} onChange={e=>setDay(day,"start",e.target.value)}/>
                      <span style={{color:C.muted,fontSize:15}}>—</span>
                      <input type="time"
                        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.amber,padding:"4px 8px",fontFamily:"inherit",fontSize:16,width:100}}
                        value={dh.end} onChange={e=>setDay(day,"end",e.target.value)}/>
                    </div>
                  ):(
                    <span style={{marginLeft:"auto",fontSize:13,color:C.muted,letterSpacing:1}}>Fridag — tidurene holder altid pause</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button style={btn(saved?"success":"primary",true)} onClick={save}>
          {saved?<><i className="ti ti-check"/> Gemt!</>:<><i className="ti ti-device-floppy"/> Gem arbejdstid</>}
        </button>
      </div>
      <div style={{...card(),marginTop:0}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>I dag ({DAY_NAME[todayKey]})</div>
        {todayHours&&todayHours.enabled
          ?<div style={{fontSize:16,color:C.text}}>
            Tidurene kører videre ved logud mellem <span style={{color:C.green}}>{todayHours.start}</span> og <span style={{color:C.amber}}>{todayHours.end}</span>
          </div>
          :<div style={{fontSize:16,color:C.muted}}>Fridag — tidurene sættes på pause ved logud.</div>
        }
      </div>
    </div>
  );
}

export function ManageEfficiencyGoals({efficiencyGoals,setEfficiencyGoals,machines,departments,saveNow}){
  const goals=efficiencyGoals||{overall:80,week:75,month:78,machines:{},departments:{}};

  const setPeriod=(key,v)=>{
    const n=Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>({...prev,[key]:n}));
    saveNow&&saveNow();
  };
  const setMachineGoal=(name,v)=>{
    const n=v===""?undefined:Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>{const m={...prev.machines};if(n===undefined)delete m[name];else m[name]=n;return{...prev,machines:m};});
    saveNow&&saveNow();
  };
  const setDeptGoal=(name,v)=>{
    const n=v===""?undefined:Math.max(0,Math.min(100,parseInt(v)||0));
    setEfficiencyGoals(prev=>{const d={...prev.departments};if(n===undefined)delete d[name];else d[name]=n;return{...prev,departments:d};});
    saveNow&&saveNow();
  };
  const toggleHideMachine=(name)=>{
    setEfficiencyGoals(prev=>{
      const hidden=prev.hiddenMachines||[];
      const next=hidden.includes(name)?hidden.filter(n=>n!==name):[...hidden,name];
      return{...prev,hiddenMachines:next};
    });
    saveNow&&saveNow();
  };
  const hiddenMachines=goals.hiddenMachines||[];

  const PeriodSlider=({label,icon,colorKey,goalKey,hint})=>{
    const val=goals[goalKey]??80;
    const color=C[colorKey]||C.blue;
    return(
      <div style={{...card(),marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <i className={`ti ${icon}`} style={{color,fontSize:18}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:15,color:C.text,fontWeight:700}}>{label}</div>
            <div style={{fontSize:13,color:C.muted}}>{hint}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,background:C.raised,borderRadius:8,padding:"4px 10px"}}>
            <input type="number" min="0" max="100" value={val} onChange={e=>setPeriod(goalKey,e.target.value)}
              style={{...inp(),width:52,fontSize:24,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",color,padding:"2px 4px",border:"none",background:"transparent"}}/>
            <span style={{fontSize:18,color:C.muted}}>%</span>
          </div>
        </div>
        <input type="range" min="0" max="100" value={val} onChange={e=>setPeriod(goalKey,e.target.value)}
          style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginTop:2}}>
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>
    );
  };

  const OverrideRow=({icon,iconColor,name,val,defaultVal,onChange,onClear,hidden,onToggleHide})=>(
    <div style={{...card(),marginBottom:6,opacity:hidden?0.45:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <i className={`ti ${icon}`} style={{color:hidden?C.muted:iconColor,flexShrink:0,fontSize:18}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:16,color:hidden?C.muted:C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:hidden?"line-through":"none"}}>{name}</div>
          <div style={{fontSize:12,color:hidden?C.muted:val!==undefined?iconColor:C.muted,letterSpacing:1}}>
            {hidden?"Skjult i data":val!==undefined?`Eget: ${val}%`:`Standard (${defaultVal}%)`}
          </div>
          {!hidden&&<div style={{height:4,background:C.border,borderRadius:2,marginTop:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${val!==undefined?val:defaultVal}%`,background:val!==undefined?iconColor:C.muted,borderRadius:2,transition:"width .3s"}}/>
          </div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {!hidden&&<><input type="number" min="0" max="100" placeholder={String(defaultVal)} value={val!==undefined?val:""}
            onChange={e=>onChange(e.target.value)}
            style={{...inp(),width:60,fontSize:20,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",color:iconColor,padding:"4px 6px"}}/>
          <span style={{fontSize:15,color:C.muted}}>%</span>
          {val!==undefined&&<button style={{...btn("danger",false,true),padding:"4px 8px"}} title="Nulstil til standard" onClick={onClear}><i className="ti ti-rotate-2"/></button>}</>}
          {onToggleHide&&<button style={{...btn(hidden?"success":"secondary",false,true),padding:"4px 8px"}} title={hidden?"Vis i data":"Skjul i data"} onClick={onToggleHide}>
            <i className={`ti ${hidden?"ti-eye":"ti-eye-off"}`}/>
          </button>}
        </div>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
        <i className="ti ti-calendar-stats"/> Mål pr. periode
      </div>
      <div style={{fontSize:14,color:C.muted,marginBottom:12}}>Angiv hvor effektivt værkstedet skal være i hver periode. Effektivitet = produktionstid ÷ (produktion + opstilling + nedetid).</div>

      <PeriodSlider label="Ugemål"  icon="ti-calendar-week"  colorKey="amber" goalKey="week"    hint="Mål for en uge"/>
      <PeriodSlider label="Månedsmål" icon="ti-calendar-month" colorKey="blue"  goalKey="month"   hint="Mål for en måned"/>
      <PeriodSlider label="Årsmål"  icon="ti-calendar"       colorKey="green" goalKey="overall" hint="Årsmål — bruges også som standard for maskiner &amp; afdelinger"/>

      {machines.filter(m=>m.active).length>0&&(
        <div style={{marginTop:16,marginBottom:4}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-robot"/> Mål pr. maskine <span style={{color:C.muted,fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:13}}>(lad stå tomt for at bruge årsmålet)</span>
          </div>
          {machines.filter(m=>m.active).map(m=>(
            <OverrideRow key={m.id} icon="ti-robot" iconColor={C.amber} name={m.name}
              val={goals.machines[m.name]} defaultVal={goals.overall}
              onChange={v=>setMachineGoal(m.name,v)} onClear={()=>setMachineGoal(m.name,"")}
              hidden={hiddenMachines.includes(m.name)} onToggleHide={()=>toggleHideMachine(m.name)}/>
          ))}
        </div>
      )}

      {(departments||[]).length>0&&(
        <div style={{marginTop:16}}>
          <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
            <i className="ti ti-tag"/> Mål pr. afdeling <span style={{color:C.muted,fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:13}}>(lad stå tomt for at bruge årsmålet)</span>
          </div>
          {(departments||[]).map(d=>(
            <OverrideRow key={d} icon="ti-tag" iconColor={C.green} name={d}
              val={goals.departments[d]} defaultVal={goals.overall}
              onChange={v=>setDeptGoal(d,v)} onClear={()=>setDeptGoal(d,"")}/>
          ))}
        </div>
      )}
      {(departments||[]).length===0&&machines.filter(m=>m.active).length===0&&(
        <div style={{fontSize:14,color:C.muted,textAlign:"center",padding:"20px 0"}}>Tilføj maskiner og afdelinger under deres faner for at sætte mål pr. maskine og afdeling.</div>
      )}
    </div>
  );
}

export function ManageDepartments({departments,setDepartments,saveNow}){
  const [adding,setAdding]=useState(false);
  const [newName,setNewName]=useState("");
  const [err,setErr]=useState("");
  const [editingDept,setEditingDept]=useState(null);
  const [editDeptVal,setEditDeptVal]=useState("");
  const [editDeptErr,setEditDeptErr]=useState("");

  const add=()=>{
    const name=newName.trim();
    if(!name){setErr("Skal udfyldes");return;}
    if((departments||[]).includes(name)){setErr("Findes allerede");return;}
    setDepartments(prev=>[...(prev||[]),name].sort());
    setNewName("");setAdding(false);setErr("");
    saveNow&&saveNow();
  };
  const remove=name=>{
    setDepartments(prev=>(prev||[]).filter(d=>d!==name));
    saveNow&&saveNow();
  };
  const startEditDept=d=>{setEditingDept(d);setEditDeptVal(d);setEditDeptErr("");};
  const saveDeptName=oldName=>{
    const nv=editDeptVal.trim();
    if(!nv){setEditDeptErr("Skal udfyldes");return;}
    if(nv!==oldName&&(departments||[]).includes(nv)){setEditDeptErr("Findes allerede");return;}
    setDepartments(prev=>(prev||[]).map(d=>d===oldName?nv:d).sort());
    setEditingDept(null);
    saveNow&&saveNow();
  };

  return(
    <div>
      <button style={{...btn("primary",false,true),marginBottom:14}} onClick={()=>{setAdding(true);setNewName("");setErr("");}}>
        <i className="ti ti-plus"/> Tilføj afdeling
      </button>
      {adding&&(
        <div style={{...card(),marginBottom:10}}>
          <div style={{fontSize:13,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Ny afdeling</div>
          <input style={inp(err)} value={newName} onChange={e=>{setNewName(e.target.value);setErr("");}} placeholder="f.eks. Drejning" autoFocus onKeyDown={e=>{if(e.key==="Enter")add();if(e.key==="Escape"){setAdding(false);setErr("");}}}/>
          {err&&<div style={errMsg}>{err}</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
            <button style={btn("outline",true)} onClick={()=>{setAdding(false);setErr("");}}>Annuller</button>
            <button style={btn("success",true)} onClick={add}><i className="ti ti-check"/> Tilføj</button>
          </div>
        </div>
      )}
      {(departments||[]).length===0&&!adding&&<div style={{textAlign:"center",padding:"30px",color:C.muted,fontSize:15}}>Ingen afdelinger endnu. Tilføj en for at organisere operatører, maskiner og skabe.</div>}
      {(departments||[]).map(d=>(
        <div key={d} style={{...card(),marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <i className="ti ti-tag" style={{color:C.amber,flexShrink:0}}/>
            <div style={{flex:1,fontSize:16,color:C.text,fontWeight:600}}>{d}</div>
            <button style={{...btn("outline",false,true),padding:"6px 8px"}} onClick={()=>startEditDept(editingDept===d?null:d)}><i className="ti ti-pencil"/></button>
            <button style={{...btn("danger",false,true),padding:"6px 8px"}} onClick={()=>remove(d)}><i className="ti ti-trash"/></button>
          </div>
          {editingDept===d&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Omdøb afdeling</div>
              <input style={inp(editDeptErr)} value={editDeptVal} onChange={e=>{setEditDeptVal(e.target.value);setEditDeptErr("");}} autoFocus onKeyDown={e=>{if(e.key==="Enter")saveDeptName(d);if(e.key==="Escape")setEditingDept(null);}}/>
              {editDeptErr&&<div style={errMsg}>{editDeptErr}</div>}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button style={btn("outline",true)} onClick={()=>setEditingDept(null)}>Annuller</button>
                <button style={btn("success",true)} onClick={()=>saveDeptName(d)}><i className="ti ti-check"/> Gem</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
