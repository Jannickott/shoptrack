import { C, btn } from "../lib/theme";
import { dueText } from "./maintUtil";

// On the operator's start page: maintenance due on the machines they look after
// (see myMaint). Late points are red. A tap opens that machine's checklist.
export function MaintReminder({items,onOpen}){
  if(!items?.length) return null;
  const late=items.some(x=>x.st.late);
  const color=late?C.red:C.amber;
  const machines=[...new Set(items.map(x=>x.machine))];
  return(
    <div style={{background:late?"rgba(231,76,60,.08)":"rgba(240,165,0,.08)",border:`1px solid ${color}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
      <div style={{fontSize:13,color,letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>
        <i className="ti ti-tool"/> Vedligehold på dine maskiner · {items.length}
      </div>
      {items.map(({machine,t,st})=>(
        <div key={t.id} style={{display:"flex",alignItems:"baseline",gap:8,fontSize:15,padding:"3px 0",flexWrap:"wrap"}}>
          <b style={{color:C.text}}>{machine}</b>
          <span style={{color:C.text}}>{t.title}</span>
          <span style={{color:st.late?C.red:C.amber,fontSize:14}}>· {dueText(t,st)}</span>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        {machines.map(m=>(
          <button key={m} style={{...btn(late?"danger":"primary",false,true)}} onClick={()=>onOpen(m)}><i className="ti ti-checklist"/> Åbn tjekliste — {m}</button>
        ))}
      </div>
    </div>
  );
}
