import { Component } from "react";
import { C } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// When something breaks on a tablet: show a way back instead of a blank screen,
// and send what happened to the server log (client-errors.log), so it can be fixed.
// ═══════════════════════════════════════════════════════
const sent=new Set();
export function reportError(err,where,extra){
  try{
    const message=String(err?.message||err||"Ukendt fejl").slice(0,500);
    const key=message+"|"+where;
    if(sent.has(key)) return; // the same error once per page load is enough
    sent.add(key);
    fetch("/api/client-error",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({
      message,where:where||"",stack:String(err?.stack||"").slice(0,2000),extra:String(extra||"").slice(0,1500),
      user:window.__stUser||"",ua:navigator.userAgent,url:location.href,
    })}).catch(()=>{});
  }catch{/* never let the reporter itself break anything */}
}

// Errors outside React rendering (timers, event handlers, promises)
export function installErrorReporting(){
  if(window.__stErrInstalled) return;
  window.__stErrInstalled=true;
  window.addEventListener("error",e=>reportError(e.error||e.message,"window"));
  window.addEventListener("unhandledrejection",e=>reportError(e.reason,"promise"));
}

// Wrap a part of the screen: if it breaks, only that part shows a message.
// fallback(reset) can replace the default box.
export class ErrorBoundary extends Component{
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(err){return{err};}
  componentDidCatch(err,info){reportError(err,this.props.where,info?.componentStack);}
  render(){
    if(!this.state.err) return this.props.children;
    const reset=()=>this.setState({err:null});
    if(this.props.fallback) return this.props.fallback(reset);
    return(
      <div style={{margin:16,padding:"18px 20px",background:C.surface,border:`1px solid ${C.red}`,borderRadius:10,color:C.text}}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:6}}><i className="ti ti-alert-triangle" style={{color:C.red}}/> Noget gik galt her</div>
        <div style={{fontSize:15,color:C.muted,marginBottom:12}}>Fejlen er sendt til serveren, så den kan blive rettet. Prøv igen, eller genindlæs siden — dine data er gemt.</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={reset} style={{minHeight:48,padding:"0 18px",borderRadius:8,border:"none",background:C.amber,color:"#1a1a1a",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Prøv igen</button>
          <button onClick={()=>location.reload()} style={{minHeight:48,padding:"0 18px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.text,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Genindlæs</button>
        </div>
      </div>
    );
  }
}
