import { useState } from "react";
import { C, card, btn, avatar } from "../lib/theme";
import { roleName, initials } from "../lib/util";

// ═══════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════
export function LoginScreen({users,onLogin}){
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState("");
  const [err,setErr]=useState("");

  const pressKey=k=>{
    if(k==="del"){setPin(p=>p.slice(0,-1));return;}
    if(pin.length>=4) return;
    const np=pin+k; setPin(np);
    if(np.length===4&&sel){
      fetch("/api/verify-pin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:sel.id,pin:np})})
        .then(r=>r.json())
        .then(d=>{if(d.ok){onLogin(sel);setPin("");setSel(null);}else{setErr(d.locked?`For mange forkerte PIN — vent ${d.retryInSec} sek.`:"Forkert PIN");setPin("");setTimeout(()=>setErr(""),d.locked?3000:1500);}})
        .catch(()=>{setErr("Serverfejl — prøv igen");setPin("");setTimeout(()=>setErr(""),2000);});
    }
  };

  return(
    <div style={{fontFamily:"'Share Tech Mono',monospace",background:C.bg,minHeight:"100vh",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{fontSize:24,color:C.amber,letterSpacing:4,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>⚙ ShopTrack</div>
      <div style={{fontSize:14,color:C.muted,letterSpacing:2,marginBottom:28}}>Registrering af job i værkstedet</div>
      <div style={{width:"100%",maxWidth:360}}>
        {!sel?(
          <>
            <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Vælg dit navn</div>
            {users.filter(u=>u.active&&!u.removed).sort((a,b)=>{
              if(a.role==="admin"&&b.role!=="admin") return 1;
              if(b.role==="admin"&&a.role!=="admin") return -1;
              return a.name.localeCompare(b.name);
            }).map(u=>(
              <button key={u.id} style={{...card(),width:"100%",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",marginBottom:8}}
                onClick={()=>{setSel(u);setPin("");setErr("");}}>
                <div style={avatar()}>{initials(u.name)}</div>
                <div>
                  <div style={{fontSize:16,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:13,letterSpacing:1,textTransform:"uppercase",color:u.role==="admin"?C.amber:C.muted,marginTop:2}}>{roleName(u.role)}</div>
                </div>
              </button>
            ))}
          </>
        ):(
          <>
            <button style={{...btn("outline",false,true),marginBottom:16,display:"flex",alignItems:"center",gap:8}} onClick={()=>{setSel(null);setPin("");}}>
              <i className="ti ti-arrow-left"/> Tilbage
            </button>
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{...avatar(),margin:"0 auto 10px",width:52,height:52,fontSize:20}}>{initials(sel.name)}</div>
              <div style={{fontSize:16,color:C.text}}>{sel.name}</div>
              <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Indtast PIN</div>
            </div>
            <div style={{background:C.raised,borderRadius:8,padding:"14px",textAlign:"center",fontSize:28,letterSpacing:10,color:C.amber,marginBottom:4,border:`1px solid ${C.border}`,minHeight:56}}>
              {pin?"●".repeat(pin.length):" "}
            </div>
            {err&&<div style={{textAlign:"center",color:C.red,fontSize:15,marginBottom:8,letterSpacing:1}}>{err}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:16}}>
              {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i)=>(
                k===""?<div key={i}/>:
                <button key={i} style={{padding:"18px 0",border:`1px solid rgba(255,255,255,.1)`,borderRadius:10,background:C.raised,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"inherit",textAlign:"center",lineHeight:1}}
                  onClick={()=>pressKey(k)}>
                  {k==="del"?<i className="ti ti-backspace"/>:k}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
