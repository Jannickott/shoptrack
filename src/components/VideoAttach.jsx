import { useState } from "react";
import { C } from "../lib/theme";
import { notify } from "./Feedback";

// ═══════════════════════════════════════════════════════
// Videos: recorded on the tablet or picked from its gallery, sent straight to the
// server as a file (with a progress bar), stored as {url, name, size}.
// ═══════════════════════════════════════════════════════
const MAX=2*1024*1024*1024;
const mb=b=>b>=1e9?`${(b/1e9).toFixed(1)} GB`:`${Math.max(1,Math.round(b/1e6))} MB`;

export function uploadVideo(file,onProgress){
  return new Promise(resolve=>{
    const x=new XMLHttpRequest();
    x.open("POST",`/api/video?name=${encodeURIComponent(file.name||"video.mp4")}`);
    x.setRequestHeader("Content-Type","application/octet-stream");
    x.upload.onprogress=e=>{if(e.lengthComputable) onProgress(e.loaded/e.total);};
    x.onload=()=>{
      try{const r=JSON.parse(x.responseText);if(x.status===200&&r.url) return resolve(r);notify(r.error||"Videoen kunne ikke gemmes","error");}
      catch{notify("Videoen kunne ikke gemmes","error");}
      resolve(null);
    };
    x.onerror=()=>{notify("Videoen kunne ikke sendes — tjek forbindelsen og prøv igen","error");resolve(null);};
    x.send(file);
  });
}

// A player that fits a tablet: full width, controls, plays inline
export function VideoPlayer({video,maxHeight=420}){
  return(
    <div style={{background:"#000",borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
      <video src={video.url} controls playsInline preload="metadata" style={{width:"100%",maxHeight,display:"block",background:"#000"}}/>
    </div>
  );
}

export function VideoAttach({videos,onChange}){
  const list=videos||[];
  const [up,setUp]=useState(null); // {name, p}
  const add=async e=>{
    const files=[...e.target.files];e.target.value="";
    const added=[];
    for(const f of files){
      if(f.size>MAX){notify(`${f.name} er for stor (over 2 GB)`,"error");continue;}
      setUp({name:f.name,size:f.size,p:0});
      const r=await uploadVideo(f,p=>setUp({name:f.name,size:f.size,p}));
      if(r) added.push({url:r.url,name:f.name,size:f.size});
    }
    setUp(null);
    if(added.length) onChange([...list,...added]);
  };
  const box={display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minHeight:70,padding:"10px 6px",background:C.raised,border:`2px dashed ${C.border}`,borderRadius:10,cursor:"pointer",color:C.text,fontSize:14,textAlign:"center"};
  return(
    <div>
      {list.map((v,i)=>(
        <div key={v.url} style={{marginBottom:8,position:"relative"}}>
          <VideoPlayer video={v} maxHeight={260}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,fontSize:13,color:C.muted}}>
            <i className="ti ti-movie"/><span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.name||"Video"}{v.size?` · ${mb(v.size)}`:""}</span>
            <button onClick={()=>onChange(list.filter((_,j)=>j!==i))} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.red,cursor:"pointer",minHeight:40,padding:"0 12px",fontSize:14,fontFamily:"inherit"}}><i className="ti ti-trash"/> Fjern</button>
          </div>
        </div>
      ))}
      {up
        ?<div style={{...box,cursor:"default",alignItems:"stretch",gap:8,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:14}}>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><i className="ti ti-upload"/> Sender {up.name}</span>
            <b style={{color:C.amber}}>{Math.round(up.p*100)}%</b>
          </div>
          <div style={{height:10,background:C.surface,borderRadius:5,overflow:"hidden"}}><div style={{height:"100%",width:`${up.p*100}%`,background:C.amber,transition:"width .2s"}}/></div>
          <div style={{fontSize:13,color:C.muted}}>{mb(up.size)} — bliv på siden, til den er sendt</div>
        </div>
        :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <label style={box}><i className="ti ti-video" style={{fontSize:26,color:C.blue}}/> Optag video
            <input type="file" accept="video/*" capture="environment" style={{display:"none"}} onChange={add}/></label>
          <label style={box}><i className="ti ti-movie" style={{fontSize:26,color:C.blue}}/> Vælg video
            <input type="file" accept="video/*" multiple style={{display:"none"}} onChange={add}/></label>
        </div>}
    </div>
  );
}
