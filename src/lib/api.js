import { notify, setSync } from "../components/Feedback";
import { fmtDate } from "./util";

// ─── SERVER SYNC ──────────────────────────────────────────────────────────────
export async function uploadPhoto(photoData, filename) {
  try {
    const res = await fetch("/api/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, data: photoData }),
    });
    const { url } = await res.json();
    return url; // e.g. /photos/quality_xxx.jpg
  } catch {
    return photoData; // fallback: keep base64 if server unreachable
  }
}

// Every tool change goes to the server as an operation, applied there one at a time
// (tools are not part of the regular 3 s save). The caller also updates local state
// so the screen changes at once; the next poll brings the server's result.
// op: {type:"add",tool} | {type:"delete",toolId} | {type:"update",toolId,set,inc,checkout,returnBy} + optional log
export function sendToolOp(op){
  setSync("saving");
  return fetch("/api/tool-op",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(op)})
    .then(r=>{setSync(r.ok?"saved":"offline");if(!r.ok)notify("Værktøjsændringen blev ikke gemt — prøv igen","error");})
    .catch(()=>{setSync("offline");notify("Ingen forbindelse — værktøjsændringen blev ikke gemt","error");});
}

// Shrink a photo before it's stored — phone camera shots are several MB
export function resizeImage(dataUrl,maxW=1200,maxH=900){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
      const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg",0.82));
    };
    img.onerror=()=>res(dataUrl);
    img.src=dataUrl;
  });
}

// Server owns machine issues and their downtimeSec. Keep a just-reported local issue
// until the server has it, keep a local edit until it's saved, and don't bring back
// an issue this tablet just resolved (its entry is already in the local downtimeLog).
export function mergeIssues(local,server,localLog){
  const resolved=new Set((localLog||[]).map(d=>`${d.machineName}|${d.reportedAt}`));
  const merged={};
  Object.entries(server||{}).forEach(([k,sv])=>{
    if(resolved.has(`${k}|${sv.reportedAt}`)) return;
    const lv=local[k];
    merged[k]=lv&&lv.reportedAt===sv.reportedAt&&(lv.updatedAt||0)>(sv.updatedAt||0)?{...lv,downtimeSec:sv.downtimeSec}:sv;
  });
  Object.entries(local||{}).forEach(([k,lv])=>{
    if(!merged[k]&&!resolved.has(`${k}|${lv.reportedAt}`)&&Date.now()-(lv.reportedAt||0)<30000) merged[k]=lv;
  });
  return merged;
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
export function exportCSV(rows,from,to){
  if(!rows.length){alert("Ingen job matcher de valgte filtre.");return;}
  const cols=[["Kunde","Tegningsnr.","Maskine","Operatør","Operation","Type","To sider","Afsluttet","S1 opstilling (min)","S1 produktion (min)","S2 opstilling (min)","S2 produktion (min)","I alt (min)","S1 stk.","S2 stk.","Foto S1","Foto S2"]];
  rows.forEach(j=>{
    const s1Setup=(j.setupSec/60).toFixed(1);
    const s1Run=(j.runSec/60).toFixed(1);
    const s2Setup=j.twoSided?((j.setupSec2||0)/60).toFixed(1):"N/A";
    const s2Run=j.twoSided?((j.runSec2||0)/60).toFixed(1):"N/A";
    const total=((j.setupSec+j.runSec+(j.setupSec2||0)+(j.runSec2||0))/60).toFixed(1);
    const s1Pcs=j.pieces||0;
    const s2Pcs=j.twoSided?(j.pieces2||0):"N/A";
    cols.push([j.customer||"",j.job,j.machine,j.operatorName,j.op||"",j.quickEntry?"Hurtig registrering":"Tidtaget",j.twoSided?"Ja":"Nej",fmtDate(j.completedAt),s1Setup,s1Run,s2Setup,s2Run,total,s1Pcs,s2Pcs,j.photoData?"Ja":"Nej",j.twoSided?(j.photoData2?"Ja":"Mangler"):"N/A"]);
  });
  const csv=cols.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  const suffix=from&&to?`_${from}_to_${to}`:from?`_from_${from}`:to?`_to_${to}`:"";
  a.download=`ShopTrack${suffix}.csv`;
  a.click();
}
