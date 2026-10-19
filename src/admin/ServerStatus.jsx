import { useState, useEffect } from "react";
import { C, card, btn } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// SERVER STATUS — is the safety net in place? (backups, second copy, disk)
// ═══════════════════════════════════════════════════════
const ago=(ms,now)=>{
  const m=Math.round((now-ms)/60000);
  if(m<1) return "lige nu";
  if(m<60) return `for ${m} min siden`;
  const h=Math.round(m/60);
  if(h<48) return `for ${h} t siden`;
  return `for ${Math.round(h/24)} dage siden`;
};
const when=ms=>new Date(ms).toLocaleString("da-DK",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const gb=b=>`${(b/1024**3).toFixed(1)} GB`;
const BACKUP_MAX_AGE=14*3600*1000; // backups run 06:00 and 16:00 (+ at every start)

function Row({state,icon,title,main,sub}){
  const color=state==="ok"?C.green:state==="warn"?C.amber:C.red;
  return(
    <div style={{...card(color),display:"flex",gap:14,alignItems:"center"}}>
      <i className={`ti ti-${icon}`} style={{fontSize:30,color,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>{title}</div>
        <div style={{fontSize:17,fontWeight:700,color:C.text,marginTop:2}}>{main}</div>
        {sub&&<div style={{fontSize:14,color:C.muted,marginTop:2,wordBreak:"break-word"}}>{sub}</div>}
      </div>
      <i className={`ti ti-${state==="ok"?"circle-check":state==="warn"?"alert-circle":"alert-triangle"}`} style={{fontSize:26,color,flexShrink:0}}/>
    </div>
  );
}

export function ServerStatus(){
  const [s,setS]=useState(null);
  const [err,setErr]=useState(false);
  const load=()=>fetch("/api/server-status").then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{setS(d);setErr(false);}).catch(()=>setErr(true));
  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t);},[]);

  if(err) return <Row state="bad" icon="server-off" title="Server" main="Kan ikke få kontakt til serveren" sub="Tjek at servercomputeren er tændt, og at ShopTrack kører (start-shoptrack.bat)."/>;
  if(!s) return <div style={{color:C.muted,fontSize:15}}>Henter status…</div>;
  const now=s.now;
  const backupOk=s.lastBackup&&now-s.lastBackup.at<BACKUP_MAX_AGE;
  // Second copy: not set up / failed last time / too old / fine
  let copy;
  if(!s.copyDir) copy={state:"warn",main:"Ikke sat op",sub:"Backups ligger kun på servercomputeren. Skriv \"backupCopyDir\" i shoptrack-config.json (fx en OneDrive-mappe)."};
  else if(s.lastCopy&&!s.lastCopy.ok) copy={state:"bad",main:"Sidste kopi fejlede",sub:`${s.copyDir} — ${s.lastCopy.error||"ukendt fejl"}`};
  else if(!s.copyLatest) copy={state:"bad",main:"Ingen backups i mappen",sub:s.copyDir};
  else if(now-s.copyLatest.at>BACKUP_MAX_AGE) copy={state:"bad",main:`Seneste kopi er ${ago(s.copyLatest.at,now).replace("for ","")} gammel`,sub:s.copyDir};
  else copy={state:"ok",main:`Kopieret ${ago(s.copyLatest.at,now)}`,sub:s.copyDir};
  const free=s.disk?.free;
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:13,color:C.muted,letterSpacing:2,textTransform:"uppercase"}}>Serverens tilstand · opdateres hvert 30. sekund</div>
        <button style={btn("outline",false,true)} onClick={load}><i className="ti ti-refresh"/> Opdater</button>
      </div>
      <Row state="ok" icon="server" title="Server" main={`Kører · startet ${ago(s.startedAt,now)}`} sub={`${when(s.startedAt)} · version ${s.version}`}/>
      <Row state={backupOk?"ok":"bad"} icon="database" title="Backup på serveren"
        main={s.lastBackup?`Seneste ${ago(s.lastBackup.at,now)}`:"Ingen backup fundet"}
        sub={s.lastBackup?`${when(s.lastBackup.at)} · ${s.backupCount} backups gemt (laves kl. 06 og 16)`:"Backups laves kl. 06 og 16 og ved hver opstart."}/>
      <Row state={copy.state} icon="cloud-upload" title="Kopi til anden placering" main={copy.main} sub={copy.sub}/>
      {free!=null&&<Row state={free<2*1024**3?"bad":free<10*1024**3?"warn":"ok"} icon="device-floppy" title="Diskplads" main={`${gb(free)} ledig`} sub={`af ${gb(s.disk.total)}`}/>}
      {s.dataFile&&<Row state="ok" icon="file-database" title="Data" main={`Sidst gemt ${ago(s.dataFile.savedAt,now)}`} sub={`${(s.dataFile.size/1024/1024).toFixed(1)} MB`}/>}
      <Row state={s.lastReport?"ok":"warn"} icon="file-type-pdf" title="Ugerapport" main={s.lastReport?s.lastReport.name.replace(/\.pdf$/,""):"Ingen endnu"} sub={s.lastReport?`Lavet ${when(s.lastReport.at)}`:"Laves automatisk mandag kl. 06:05."}/>
    </div>
  );
}
