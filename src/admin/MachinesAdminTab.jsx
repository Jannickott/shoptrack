import { useState } from "react";
import { tag } from "../lib/theme";
import { MachineDataTab } from "./MachineDataTab";
import { MaintenanceAdmin } from "../maintenance/MaintenanceAdmin";
import { machineMaint } from "../maintenance/maintUtil";

// Admin "Maskiner": the machine figures, and the maintenance points (ISO 9001)
export function MachinesAdminTab(props){
  const {machines,allJobs,maintTasks,maintLog}=props;
  const [view,setView]=useState(props.initialView||"data");
  const due=machines.filter(m=>m.active&&!m.removed).reduce((n,m)=>n+machineMaint(m.name,maintTasks,maintLog,allJobs).filter(x=>x.st.state==="due").length,0);
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:4,flexWrap:"wrap"}}>
        <button style={tag(view==="data")} onClick={()=>setView("data")}><i className="ti ti-chart-bar"/> Maskindata</button>
        <button style={tag(view==="maint")} onClick={()=>setView("maint")}><i className="ti ti-tool"/> Vedligehold{due>0&&<span style={{marginLeft:6,background:"#e74c3c",color:"#fff",borderRadius:20,fontSize:12,padding:"0 6px",fontWeight:700}}>{due}</span>}</button>
      </div>
      {view==="data"
        ?<div style={{margin:"0 -16px"}}><MachineDataTab {...props}/></div>
        :<div style={{marginTop:10}}><MaintenanceAdmin {...props} jobs={allJobs}/></div>}
    </div>
  );
}
