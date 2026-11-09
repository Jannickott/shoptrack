import { useState } from "react";
import { notify } from "../components/Feedback";
import { sendToolOp } from "../lib/api";
import { C, card, inp, btn } from "../lib/theme";
import { supplierHref, toolLocation } from "./toolOps";

// ═══════════════════════════════════════════════════════
// INDKØBSLISTE — everything at or below its reorder level (or broken), grouped by
// supplier: suggested quantity, link to the supplier's page, Bestilt, Modtaget,
// and a list to copy into an e-mail or print for each supplier.
// ═══════════════════════════════════════════════════════
const needsOrder=t=>t.active!==false&&(t.broken||(!t.returnable&&t.quantity<=(t.minQuantity||0)));
const suggest=t=>t.broken&&t.returnable?1:Math.max(1,(t.minQuantity||0)*2-(t.quantity||0)); // back to twice the reorder level

export function OrderList({tools,setTools,setToolLog,cabinets}){
  const [qty,setQty]=useState({});        // tool id → quantity to order (string)
  const [receive,setReceive]=useState(null); // tool id being received
  const [recQty,setRecQty]=useState("");
  const list=(tools||[]).filter(needsOrder);
  const groups={};
  list.forEach(t=>{const k=(t.supplier||"").trim()||"Uden leverandør";(groups[k]=groups[k]||[]).push(t);});
  const names=Object.keys(groups).sort((a,b)=>a==="Uden leverandør"?1:b==="Uden leverandør"?-1:a.localeCompare(b));
  const q=t=>qty[t.id]??String(suggest(t));

  const update=(tool,set)=>{setTools(prev=>prev.map(x=>x.id===tool.id?{...x,...set}:x));sendToolOp({type:"update",toolId:tool.id,set});};
  const doReceive=tool=>{
    const n=parseInt(recQty,10)||0;
    if(n<1) return;
    const set={ordered:tool.quantity+n>(tool.minQuantity||0)?false:tool.ordered,...(tool.broken?{broken:false}:{})};
    const now=Date.now();
    const log={id:now,toolId:tool.id,toolName:tool.name,operatorId:null,operatorName:"Admin",quantity:n,action:"restock",timestamp:now};
    setTools(prev=>prev.map(x=>x.id===tool.id?{...x,...set,quantity:x.quantity+n}:x));
    setToolLog&&setToolLog(prev=>[...prev,log]);
    sendToolOp({type:"update",toolId:tool.id,set,inc:{quantity:n},log});
    setReceive(null);setRecQty("");
    notify(`Modtaget: ${n} stk ${tool.name}`);
  };
  const lines=name=>groups[name].map(t=>`${q(t)} stk\t${t.articleNumber||"—"}\t${t.name}`).join("\n");
  const copy=name=>{
    const text=`Bestilling${name!=="Uden leverandør"?` — ${name}`:""}\n\nAntal\tVarenr.\tVare\n${lines(name)}`;
    (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>notify("Listen er kopieret — sæt den ind i en mail"),()=>notify("Kunne ikke kopiere","error"));
  };
  const print=name=>{
    const w=window.open("","_blank","width=800,height=900");if(!w) return;
    const esc=s=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bestilling ${esc(name)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:8px;text-align:left;font-size:14px}th{background:#f0f0f0}</style></head><body>
      <h1>Bestilling — ${esc(name)}</h1><div>${new Date().toLocaleDateString("da-DK")}</div>
      <table><thead><tr><th>Antal</th><th>Varenr.</th><th>Vare</th></tr></thead><tbody>
      ${groups[name].map(t=>`<tr><td>${esc(q(t))}</td><td>${esc(t.articleNumber||"—")}</td><td>${esc(t.name)}</td></tr>`).join("")}
      </tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  };

  if(!list.length) return <div style={{...card(),color:C.green,fontSize:16}}><i className="ti ti-circle-check"/> Intet skal bestilles lige nu.</div>;
  return(
    <div>
      <div style={{fontSize:14,color:C.muted,marginBottom:12}}>{list.length} værktøj ved eller under genbestillingsniveau. Forslaget fylder op til det dobbelte af niveauet — ret antallet efter behov.</div>
      {names.map(name=>(
        <div key={name} style={{...card(),padding:0,overflow:"hidden",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:C.raised,flexWrap:"wrap"}}>
            <div style={{flex:1,fontSize:16,fontWeight:700,color:C.text}}><i className="ti ti-truck"/> {name} <span style={{fontSize:13,color:C.muted,fontWeight:400}}>· {groups[name].length} varer</span></div>
            <button style={btn("outline",false,true)} onClick={()=>copy(name)}><i className="ti ti-copy"/> Kopiér liste</button>
            <button style={btn("outline",false,true)} onClick={()=>print(name)}><i className="ti ti-printer"/> Print</button>
          </div>
          {groups[name].map(t=>{const href=supplierHref(t.supplierUrl);return(
            <div key={t.id} style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 220px",minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:700,color:C.text}}>{t.name}{t.broken&&<span style={{fontSize:12,color:C.red,marginLeft:8}}>I STYKKER</span>}</div>
                  <div style={{fontSize:13,color:C.muted}}>{t.articleNumber?`Varenr. ${t.articleNumber} · `:""}<span style={{color:C.red}}>{t.quantity} på lager</span> (genbestil under {t.minQuantity||0}){toolLocation(t,cabinets)?` · ${toolLocation(t,cabinets)}`:""}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input inputMode="numeric" style={{...inp(),width:70,textAlign:"center",fontWeight:700}} value={q(t)} onChange={e=>setQty(p=>({...p,[t.id]:e.target.value.replace(/\D/g,"")}))}/>
                  <span style={{fontSize:13,color:C.muted}}>stk</span>
                </div>
                {href&&<a href={href} target="_blank" rel="noreferrer" style={{...btn("outline",false,true),textDecoration:"none",color:C.blue}}><i className="ti ti-external-link"/> Åbn</a>}
                <button style={btn(t.ordered?"blue":"outline",false,true)} onClick={()=>update(t,{ordered:!t.ordered})}><i className={`ti ti-${t.ordered?"checks":"shopping-cart"}`}/> {t.ordered?"Bestilt":"Marker bestilt"}</button>
                <button style={btn("success",false,true)} onClick={()=>{setReceive(receive===t.id?null:t.id);setRecQty(q(t));}}><i className="ti ti-package-import"/> Modtaget</button>
              </div>
              {receive===t.id&&(
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,color:C.text}}>Hvor mange er kommet?</span>
                  <input autoFocus inputMode="numeric" style={{...inp(),width:80,textAlign:"center"}} value={recQty} onChange={e=>setRecQty(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&doReceive(t)}/>
                  <button style={btn("success",false,true)} onClick={()=>doReceive(t)}><i className="ti ti-check"/> Læg på lager</button>
                  <button style={btn("outline",false,true)} onClick={()=>setReceive(null)}>Annuller</button>
                </div>
              )}
            </div>
          );})}
        </div>
      ))}
    </div>
  );
}
