import { sendToolOp } from "../lib/api";

// Taking and borrowing a tool from outside the Værktøj tab (e.g. "Klargør værktøj" on a
// setup sheet). Same operations and log entries as the Værktøj tab: the local list
// changes at once, the server applies the operation (see /api/tool-op).

export function toolAvailable(t){
  if(t.broken) return 0;
  return t.returnable?t.quantity-(t.checkedOutCount||0)-(t.damagedCount||0):t.quantity;
}

const logEntry=(tool,user,action,quantity)=>{const now=Date.now();return{id:now+Math.floor(Math.random()*1000),toolId:tool.id,toolName:tool.name,operatorId:user.id,operatorName:user.name,quantity,action,timestamp:now};};

// Consumable: take qty. Returnable: borrow one. Returns false when none are available.
export function takeOrBorrow(tool,user,setTools,setToolLog,qty=1){
  if(toolAvailable(tool)<(tool.returnable?1:qty)) return false;
  if(tool.returnable){
    const by={operatorId:user.id,operatorName:user.name,timestamp:Date.now()};
    const log=logEntry(tool,user,"checkout",1);
    setTools(prev=>prev.map(t=>t.id===tool.id?{...t,checkedOutCount:(t.checkedOutCount||0)+1,checkedOutBy:[...(t.checkedOutBy||[]),by]}:t));
    setToolLog(prev=>[...prev,log]);
    sendToolOp({type:"update",toolId:tool.id,inc:{checkedOutCount:1},checkout:by,log});
  }else{
    const log=logEntry(tool,user,"take",qty);
    setTools(prev=>prev.map(t=>t.id===tool.id?{...t,quantity:Math.max(0,t.quantity-qty)}:t));
    setToolLog(prev=>[...prev,log]);
    sendToolOp({type:"update",toolId:tool.id,inc:{quantity:-qty},log});
  }
  return true;
}

// Where a tool lives: "Skab A · Skuffe 3"
export function toolLocation(tool,cabinets){
  const cab=(cabinets||[]).find(c=>String(c.id)===String(tool.cabinetId));
  const drw=cab?.drawers?.find(d=>String(d.id)===String(tool.drawerId));
  return [cab?.name,drw?`Skuffe ${drw.number}`:"",tool.drawerPosition?`plads ${tool.drawerPosition}`:""].filter(Boolean).join(" · ");
}

// The tool's page at the supplier ("www.x.dk/..." works too)
export const supplierHref=u=>{const s=(u||"").trim();return !s?null:/^https?:\/\//i.test(s)?s:`https://${s}`;};
