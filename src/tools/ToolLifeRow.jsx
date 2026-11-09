import { notify } from "../components/Feedback";
import { C, btn } from "../lib/theme";
import { lifeColor, lifeText } from "./toolLife";

// One tool's life on one machine: bar + "460 af 500 emner" + "Nyt værktøj sat i" / "Slebet"
export function ToolLifeRow({tool,usage,machine,user,setToolChanges,saveNow,compact}){
  const color=lifeColor(usage.pct,C);
  const record=kind=>{
    const now=Date.now();
    setToolChanges(prev=>[...prev,{id:now+Math.floor(Math.random()*1000),toolId:tool.id,toolName:tool.name,machine,at:now,by:user?.name||"",kind,updatedAt:now}]);
    saveNow&&saveNow();
    notify(kind==="slebet"?`${tool.name} slebet — tæller fra 0 på ${machine}`:`Nyt ${tool.name} sat i ${machine} — tæller fra 0`);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <i className="ti ti-refresh" style={{color,fontSize:16}}/>
        {usage.started&&<div style={{flex:"1 1 100px",minWidth:80,height:10,background:C.raised,borderRadius:5,overflow:"hidden"}}>
          <div style={{width:`${Math.min(100,(usage.pct||0)*100)}%`,height:"100%",background:color}}/>
        </div>}
        <span style={{fontSize:14,color,fontWeight:usage.pct>=0.9?700:400}}>{lifeText(usage)}</span>
      </div>
      {!compact&&usage.last&&<div style={{fontSize:12,color:C.muted}}>{usage.last.kind==="slebet"?"Slebet":"Nyt sat i"} {new Date(usage.last.at).toLocaleString("da-DK",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}{usage.last.by?` af ${usage.last.by}`:""}</div>}
      {setToolChanges&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button style={btn(usage.pct>=0.9?"primary":"outline",false,true)} onClick={()=>record("ny")}><i className="ti ti-replace"/> {usage.started?"Nyt værktøj sat i":"Start tælling — nyt værktøj sat i"}</button>
          {tool.regrindable&&<button style={btn("outline",false,true)} onClick={()=>record("slebet")}><i className="ti ti-tool"/> Slebet</button>}
        </div>
      )}
    </div>
  );
}
