import { useState } from "react";
import { C, btn } from "../lib/theme";
import { PdfDrawings } from "../components/PdfDrawings";

// Blank Eriks/150 setup values — used by both the detail view and the form
export const ERIKS_BLANK={mn:"",z:"",beta:"",dk:"",uo:"",df:"",fraeserDia:"",fraesLagerLinks:"",fraesLagerRechts:"",fraesLag3:"",fraesLag4:"",richtung:"Gegenlauf",differential:"ausgerastet",zahnzahl:"",zahnzahlRatio:"",zahnD:"",zahnZw:"",zahnC:"",zahnB:"",zahnA:"",steigung:"",steigA:"",steigZw:"",steigB:"",steigC:"",steigD:"",fraesDrehzahl:"",fraesA:"",fraesB:"",fraesC:"",fraesD:"",laengs:"",laengsA:"",laengsB:"",laengsC:"",laengsZw:"",laengsD:"",schalterA2:"",schalterA3:"",schalterA4:"",schalterA5:"",tauchsteuerung:"",eingang:"m. Zwischenrad",stckStd:"",stckSpannung:""};

export function SetupSheetDetail({sheet,tools,cabinets,onBack,onEdit,onDelete,onGoToTool,onDuplicate}){
  const [deleteConfirmSS,setDeleteConfirmSS]=useState(false);
  const [lightboxPhoto,setLightboxPhoto]=useState(null);
  const [mzDetOpen,setMzDetOpen]=useState({schnecke:false,werkstuck:false,entgraten:false});
  const rc=pos=>{if(!pos)return"";return(sheet.restartPrefix||"NAT")+String(pos).padStart(sheet.restartPad||2,"0");};
  const filledTools=(sheet.tools||[]).filter(t=>t.description||t.label);
  const filledTools2=(sheet.tools2||[]).filter(t=>t.description||t.label);
  const filledTools3=(sheet.tools3||[]).filter(t=>t.description||t.label);
  const findLoc=toolId=>{if(!toolId)return null;const t=(tools||[]).find(x=>String(x.id)===String(toolId));if(!t)return null;const cab=(cabinets||[]).find(c=>String(c.id)===String(t.cabinetId));const drw=cab?.drawers?.find(d=>String(d.id)===String(t.drawerId));if(!cab)return null;return{cab:cab.name,drw:drw?`Drawer ${drw.number}${drw.label?` — ${drw.label}`:""}`:null};};
  const opColors={"Side 1":"#3b82f6","Side 2":C.green,"Finish Part":C.amber};
  const opColor=opColors[sheet.operation]||C.muted;
  const renderToolList=(toolArr,accent)=>(
    <div style={{background:C.surface,borderRadius:10,border:`1px solid ${accent||C.border}`,overflow:"hidden"}}>
      {toolArr.map((t,i)=>{
        const cabTool=t.toolId?(tools||[]).find(x=>String(x.id)===String(t.toolId)):null;
        const loc=findLoc(t.toolId);
        return(
        <div key={t.position} style={{borderBottom:i<toolArr.length-1?`1px solid ${C.border}`:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px"}}>
            <div style={{width:30,height:30,borderRadius:6,background:C.raised,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:accent||C.amber,flexShrink:0}}>{t.position}</div>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontSize:16,fontWeight:600,color:C.text}}>{t.description}</div>
              {cabTool&&(
                <button onClick={()=>onGoToTool&&onGoToTool(t.toolId)} style={{background:C.blue+"18",border:`1px solid ${C.blue}44`,borderRadius:7,padding:"5px 10px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,alignSelf:"flex-start",maxWidth:"100%"}}>
                  <i className="ti ti-map-pin" style={{fontSize:15,color:C.blue,flexShrink:0}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.blue,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cabTool.name}</div>
                    {loc&&<div style={{fontSize:12,color:C.muted}}>{loc.cab}{loc.drw?` · ${loc.drw}`:""}</div>}
                  </div>
                  <i className="ti ti-arrow-right" style={{fontSize:14,color:C.blue,marginLeft:4,flexShrink:0}}/>
                </button>
              )}
              {t.label&&<div style={{fontSize:13,color:C.muted}}>{t.label}</div>}
            </div>
            <div style={{fontSize:13,color:C.muted,fontFamily:"'Share Tech Mono',monospace",flexShrink:0}}>{rc(t.position)}</div>
          </div>
        </div>
      );})}
    </div>
  );
  const sheetParams=(sheet.params&&sheet.params.length)?sheet.params:[["Chuck Name",sheet.chuckName],["Chuck Overhang",sheet.chuckOverhang],["Clamping Pressure",sheet.clampingPressure],["Zero Point",sheet.zeroPoint],["Workpiece Stop",sheet.workpieceStop]].filter(([,v])=>v).map(([k,v])=>({key:k,value:v}));
  const params=sheetParams.filter(p=>p.value);

  const printPdf=()=>{
    const w=window.open("","_blank","width=860,height=1100");
    if(!w) return;
    const rows=t=>`<tr><td class="mono">${t.position}</td><td>${t.description||""}</td><td class="grey">${t.label||""}</td><td class="mono amber">${rc(t.position)}</td></tr>`;
    const toolTable=(title,accent,toolArr)=>{const filled=(toolArr||[]).filter(t=>t.description);if(!filled.length)return"";return`<h2 style="color:${accent}">${title}</h2><table><thead><tr><th>Pos.</th><th>Beskrivelse</th><th>Mærkat</th><th>Genstart</th></tr></thead><tbody>${filled.map(rows).join("")}</tbody></table>`;};
    const pdfParams=params;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sheet.partNumber} — opstillingsark</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:0}
.header{background:#1a2233;color:#fff;padding:18px 24px 14px}
.header h1{font-size:22px;color:#f0a500;margin-bottom:4px}
.header .sub{font-size:11px;color:#aab;letter-spacing:.5px}
.body{padding:18px 24px}
h2{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 10px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:4px}
.field{font-size:12px}.field b{color:#111}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px}
th{text-align:left;padding:5px 8px;background:#f0f0f0;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#666}
td{padding:6px 8px;border-bottom:1px solid #f0f0f0}
tr:nth-child(even) td{background:#fafafa}
.mono{font-family:monospace;font-weight:700}
.amber{color:#b07d00}.grey{color:#888}
.params{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
.pbox{background:#f4f6ff;border:1px solid #dde;border-radius:6px;padding:10px 14px}
.plabel{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:4px}
.pval{font-size:18px;font-family:monospace;font-weight:700;color:#1a2233}
.notes{background:#f8f8f8;border-radius:4px;padding:10px 14px;font-size:12px;white-space:pre-wrap;line-height:1.6}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
.photo-box{border-radius:6px;overflow:hidden;border:1px solid #e0e0e0}
.photo-box img{width:100%;display:block;max-height:220px;object-fit:cover}
.photo-cap{font-size:10px;color:#666;padding:4px 8px;background:#f8f8f8}
footer{margin-top:24px;padding-top:8px;border-top:1px solid #eee;font-size:9px;color:#aaa;text-align:center}
@media print{@page{margin:12mm}body{padding:0}.no-print{display:none}}
</style></head><body>
<div class="header"><h1>${sheet.partNumber||""}</h1>
<div class="sub">${[sheet.customer,sheet.machine,sheet.material,sheet.operation&&"Op. "+sheet.operation].filter(Boolean).join(" &nbsp;·&nbsp; ")}</div></div>
<div class="body">
<h2>Identifikation</h2>
${sheet.subProgram?`<div style="background:#fffbea;border:2px solid #b07d00;border-radius:8px;padding:12px 16px;margin-bottom:14px"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#b07d00;margin-bottom:4px">Programnavn</div><div style="font-size:26px;font-family:monospace;font-weight:800;color:#b07d00;letter-spacing:2px">${sheet.subProgram}</div></div>`:""}
<div class="meta">${[["Maskine",sheet.machine],["Kunde",sheet.customer],["Materiale",sheet.material],["Revision",sheet.revision],["Operation",sheet.operation],["Planprogram",sheet.planProgram]].filter(([,v])=>v).map(([k,v])=>`<div class="field"><span class="grey">${k}: </span><b>${v}</b></div>`).join("")}</div>
${toolTable("Værktøjsliste — hoved","#b07d00",sheet.tools)}
${toolTable("Værktøjsliste — under","#1a6eb5",sheet.tools2)}
${toolTable("Værktøjsliste — 3.","#1a8c55",sheet.tools3)}
${pdfParams.length?`<h2>Opstillingsparametre</h2><div class="params">${pdfParams.map(p=>`<div class="pbox"><div class="plabel">${p.key}</div><div class="pval">${p.value}</div></div>`).join("")}</div>`:""}
${sheet.notes?`<h2>Noter</h2><div class="notes">${sheet.notes}</div>`:""}
${(sheet.photos||[]).length?`<h2>Fotos</h2><div class="photos">${sheet.photos.map(p=>`<div class="photo-box"><img src="${p.url}" onerror="this.style.display='none'"/>${p.caption?`<div class="photo-cap">${p.caption}</div>`:""}</div>`).join("")}</div>`:""}
<footer>ShopTrack opstillingsark &nbsp;·&nbsp; ${sheet.partNumber||""} / ${sheet.machine||""} &nbsp;·&nbsp; ${new Date().toLocaleDateString("da-DK",{day:"2-digit",month:"short",year:"numeric"})}</footer>
</div>
<div class="no-print" style="position:fixed;top:10px;right:10px">
<button onclick="window.print()" style="background:#1a2233;color:#f0a500;border:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Udskriv / gem som PDF</button>
</div>
</body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };
  return(
    <div style={{padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <button style={{...btn("outline",false,true),padding:"8px 12px",flexShrink:0}} onClick={onBack}><i className="ti ti-arrow-left"/></button>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:20,fontWeight:700,color:C.text}}>{sheet.partNumber}</div><div style={{fontSize:14,color:C.muted}}>{[sheet.customer,sheet.machine,sheet.operation&&`Op ${sheet.operation}`].filter(Boolean).join(" · ")}</div></div>
        {onDuplicate&&<button style={{...btn("outline",false,true),padding:"10px 16px",flexShrink:0,fontSize:24}} title="Kopier ark" onClick={onDuplicate}><i className="ti ti-copy"/></button>}
        <button style={{...btn("outline",false,true),padding:"10px 16px",flexShrink:0,fontSize:24}} onClick={onEdit}><i className="ti ti-edit"/></button>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        {sheet.department&&<span style={{fontSize:13,fontWeight:700,color:C.blue,background:"rgba(59,130,246,.12)",border:"1px solid rgba(59,130,246,.3)",borderRadius:6,padding:"3px 10px"}}><i className="ti ti-building" style={{fontSize:13}}/> {sheet.department}</span>}
        {sheet.subDepartment&&<span style={{fontSize:13,fontWeight:700,color:"#a78bfa",background:"rgba(167,139,250,.12)",border:"1px solid rgba(167,139,250,.3)",borderRadius:6,padding:"3px 10px"}}><i className="ti ti-git-branch" style={{fontSize:13}}/> {sheet.subDepartment}</span>}
        {sheet.machine&&<span style={{fontSize:13,fontWeight:700,color:C.amber,background:"rgba(240,165,0,.12)",border:"1px solid rgba(240,165,0,.3)",borderRadius:6,padding:"3px 10px"}}>{sheet.machine}</span>}
      </div>
      {sheet.operation&&(
        <div style={{background:`${opColor}18`,border:`2px solid ${opColor}`,borderRadius:10,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10}}>
          <i className="ti ti-refresh" style={{fontSize:20,color:opColor,flexShrink:0}}/>
          <div><div style={{fontSize:11,color:opColor,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>Operation</div><div style={{fontSize:22,fontWeight:800,color:opColor,letterSpacing:1}}>{sheet.operation}</div></div>
        </div>
      )}
      {sheet.subProgram&&(
        <div style={{background:"rgba(240,165,0,.1)",border:`2px solid ${C.amber}`,borderRadius:10,padding:"12px 16px",marginBottom:10}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Programnavn</div>
          <div style={{fontSize:28,fontWeight:800,color:C.amber,fontFamily:"'Share Tech Mono',monospace",letterSpacing:2,lineHeight:1}}>{sheet.subProgram}</div>
        </div>
      )}
      <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Maskine",sheet.machine],["Materiale",sheet.material],["Revision",sheet.revision],...(sheet.subDepartment?[]:[["Planprogram",sheet.planProgram]])].filter(([,v])=>v).map(([k,v])=>(<div key={k}><div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>{k}</div><div style={{fontSize:16,fontWeight:600,color:C.text}}>{v}</div></div>))}
        </div>
      </div>
      {sheet.subDepartment&&filledTools.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opspændingsværktøj</div>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.amber}`,overflow:"hidden"}}>
            {sheet.toolModul&&<div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:13,color:C.amber,fontWeight:700,minWidth:60}}>Modul</span><span style={{fontSize:20,fontWeight:800,fontFamily:"'Share Tech Mono',monospace",color:C.amber}}>{sheet.toolModul}</span></div>}
            {filledTools.map((t,i)=>{
              const slotLabel=i===0?"Øverste værktøj":"Nederste værktøj";
              const cabTool=t.toolId?(tools||[]).find(x=>String(x.id)===String(t.toolId)):null;
              const loc=findLoc(t.toolId);
              return(
                <div key={t.position} style={{borderBottom:i<filledTools.length-1?`1px solid ${C.border}`:"none",padding:"10px 14px"}}>
                  <div style={{fontSize:11,color:C.amber,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{slotLabel}</div>
                  {t.description&&<div style={{fontSize:16,fontWeight:600,color:C.text,marginBottom:4}}>{t.description}</div>}
                  {cabTool&&(<button onClick={()=>onGoToTool&&onGoToTool(t.toolId)} style={{background:C.blue+"18",border:`1px solid ${C.blue}44`,borderRadius:7,padding:"5px 10px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8,marginBottom:4}}><i className="ti ti-map-pin" style={{fontSize:15,color:C.blue}}/><div><div style={{fontSize:14,fontWeight:700,color:C.blue}}>{cabTool.name}</div>{loc&&<div style={{fontSize:12,color:C.muted}}>{loc.cab}{loc.drw?` · ${loc.drw}`:""}</div>}</div><i className="ti ti-arrow-right" style={{fontSize:14,color:C.blue,marginLeft:4}}/></button>)}
                  {t.label&&<div style={{fontSize:13,color:C.muted}}>{t.label}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!sheet.subDepartment&&filledTools.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.amber,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — hoved</div>{renderToolList(filledTools,C.amber)}</div>}
      {filledTools2.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.blue,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — under</div>{renderToolList(filledTools2,C.blue)}</div>}
      {filledTools3.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.green,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Værktøjsliste — 3.</div>{renderToolList(filledTools3,C.green)}</div>}
      {sheet.subDepartment==="MZ"&&(()=>{
        const mz=sheet.mzSetup||{};
        const bool=v=>(v===true||v==="Ja")?"Ja":"Nej";
        const items=[
          ["Forlænger",mz.fraesForlaenger||null],
          ["Fræser Mn",mz.fraesMn||null],
          ["Stop Ø",mz.stopDia||null],
          ["Tang tryk",mz.tangTryk!=null&&mz.tangTryk!==""?String(mz.tangTryk):null],
          ["Værktøj i tang",mz.vaerktoejITang!=null?bool(mz.vaerktoejITang):null],
          ["Tang nr.",mz.tangNummer||null],
          ["Tang form",mz.tangForm||null],
          ["Pinoltryk",mz.pinoltryk!=null&&mz.pinoltryk!==""?String(mz.pinoltryk):null],
          ["Pinoldok",mz.pinoldokType||null],
          ["Hastighed",mz.hastighed!=null&&mz.hastighed!==""?String(mz.hastighed):null],
          ["Luft",mz.luft!=null?bool(mz.luft):null],
          ["Spindel",mz.spindel||null],
          ["Olie",mz.olie||null],
          ["Emne udhæng",mz.emneUdhaeng||null],
          ["Pinoldok udhæng",mz.pinoldokUdhaeng||null],
        ].filter(([,v])=>v!==null);
        if(!items.length) return null;
        return(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opstillingsparametre</div>
            <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              {items.map(([k,v])=>(
                <div key={k} style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:8,alignItems:"center",padding:"8px 14px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontSize:13,color:C.muted,fontWeight:600}}>{k}</div>
                  <div style={{fontSize:18,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {sheet.subDepartment!=="MZ"&&params.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Opstillingsparametre</div>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {params.map((p,pi)=>(<div key={pi}><div style={{fontSize:11,color:C.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{p.key}</div><div style={{fontSize:22,fontWeight:700,color:C.green,fontFamily:"'Share Tech Mono',monospace"}}>{p.value}</div></div>))}
            </div>
          </div>
        </div>
      )}
      {sheet.notes&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Noter</div><div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 14px",fontSize:15,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{sheet.notes}</div></div>}
      {(sheet.drawings||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Tegninger (PDF)</div>
          <PdfDrawings files={sheet.drawings}/>
        </div>
      )}
      {(sheet.photos||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Fotos</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {sheet.photos.map((p,i)=>(
              <div key={i} style={{borderRadius:8,overflow:"hidden",background:C.raised,aspectRatio:"4/3",position:"relative",cursor:"zoom-in"}} onClick={()=>setLightboxPhoto(p)}>
                <img src={p.url} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                {p.caption&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",color:"#fff",fontSize:16,fontWeight:500,padding:"8px 10px",lineHeight:1.4}}>{p.caption}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {lightboxPhoto&&(
        <div onClick={()=>setLightboxPhoto(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
          <img src={lightboxPhoto.url} style={{maxWidth:"100%",maxHeight:"calc(100vh - 120px)",borderRadius:10,objectFit:"contain",boxShadow:"0 8px 40px rgba(0,0,0,.6)"}} onClick={e=>e.stopPropagation()}/>
          {lightboxPhoto.caption&&(
            <div onClick={e=>e.stopPropagation()} style={{marginTop:14,background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"14px 20px",maxWidth:600,width:"100%",color:"#fff",fontSize:20,fontWeight:500,lineHeight:1.5,textAlign:"center"}}>
              {lightboxPhoto.caption}
            </div>
          )}
          <button onClick={()=>setLightboxPhoto(null)} style={{marginTop:14,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,color:"#fff",fontSize:16,fontWeight:700,padding:"10px 28px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}><i className="ti ti-x"/> Luk</button>
        </div>
      )}
      {sheet.subDepartment==="150"&&(()=>{
        const e={...ERIKS_BLANK,...(sheet.eriksSetup||{})};
        const mono={fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17};
        const kv=(lbl,val,unit)=>val?(<div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:13,color:C.muted,fontWeight:600,minWidth:130}}>{lbl}</div><div style={{...mono,flex:1}}>{val}</div>{unit&&<div style={{fontSize:12,color:C.muted}}>{unit}</div>}</div>):null;
        const secH=(t)=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
        const gearRow=(label,fields)=>{
          const vals=fields.filter(([,v])=>v);
          if(!vals.length) return null;
          return(<div style={{padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,color:C.muted,fontWeight:600}}>{label}: </span>{vals.map(([k,v])=><span key={k} style={{marginRight:12}}><span style={{fontSize:12,color:C.muted}}>{k}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>)}</div>);
        };
        const fraesImg=(side)=>(
          <svg width="90" height="80" viewBox="0 0 100 90">
            <rect x="5" y="72" width="90" height="6" rx="1" fill="none" stroke={C.muted} strokeWidth="1.2"/>
            <ellipse cx="50" cy="68" rx="14" ry="6" fill="none" stroke={C.muted} strokeWidth="1.2"/>
            <g transform={`rotate(${side==="L"?-28:28},50,68)`}>
              <line x1="50" y1="68" x2="50" y2="18" stroke={C.muted} strokeWidth="2"/>
              <circle cx="50" cy="14" r="13" fill="none" stroke={C.amber} strokeWidth="1.5"/>
              <circle cx="50" cy="14" r="3" fill={C.amber} opacity="0.6"/>
              {[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>(<line key={a} x1={50+13*Math.cos(a*Math.PI/180)} y1={14+13*Math.sin(a*Math.PI/180)} x2={50+16*Math.cos(a*Math.PI/180)} y2={14+16*Math.sin(a*Math.PI/180)} stroke={C.muted} strokeWidth="1"/>))}
            </g>
            <text x="50" y="88" textAnchor="middle" fontSize="8" fill={C.muted}>{side==="L"?"Links":"Rechts"}</text>
          </svg>
        );
        return(<div style={{marginBottom:14}}>
          <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:8}}>
            {secH("Fräser / Fræser")}
            <div style={{padding:"8px 14px",display:"flex",gap:16,flexWrap:"wrap",borderBottom:`1px solid ${C.border}`}}>
              {[["mn",e.mn],["Z",e.z],["β",e.beta],["dk",e.dk],["uo",e.uo],["df",e.df]].filter(([,v])=>v).map(([lbl,v])=>(<span key={lbl} style={{marginRight:8}}><span style={{fontSize:12,color:C.muted}}>{lbl}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>))}
              {e.fraeserDia&&<span><span style={{fontSize:12,color:C.muted}}>Fräser Ø </span><span style={{...mono,fontSize:16}}>{e.fraeserDia}</span></span>}
            </div>
            {(e.fraesLagerLinks||e.fraesLagerRechts||e.fraesLag3||e.fraesLag4)&&(<>
              {secH("Fräslagerstellung / Fræserposition")}
              <div style={{padding:"10px 14px"}}>
                {(()=>{
                  const isDark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&window.matchMedia("(prefers-color-scheme:dark)").matches);
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[["fraesLagerLinks",e.fraesLagerLinks,0,0],["fraesLagerRechts",e.fraesLagerRechts,1,0],["fraesLag3",e.fraesLag3,0,1],["fraesLag4",e.fraesLag4,1,1]].map(([k,val,xi,yi])=>(
                        <div key={k} style={{display:"flex",flexDirection:"column",gap:0,border:`2px solid ${val?C.amber:C.border}`,borderRadius:10,overflow:"hidden"}}>
                          <div style={{aspectRatio:"4/3",backgroundImage:"url(/eriks-fraeslager-grid.png)",backgroundSize:"200% 200%",backgroundPosition:`${xi*100}% ${yi*100}%`,backgroundRepeat:"no-repeat",backgroundColor:isDark?C.raised:"#fff",filter:isDark?"invert(1)":"none"}}/>
                          <div style={{padding:"6px 10px",background:C.raised,borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"baseline",justifyContent:"center",gap:4}}>
                            <span style={{...mono,fontSize:24,color:val?C.green:C.muted}}>{val||"—"}</span>
                            {val&&<span style={{fontSize:18,color:C.amber,fontWeight:700}}>°</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>)}
            {secH("Laufrichtung / Retning")}
            <div style={{padding:"8px 14px",display:"flex",gap:16,borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:15,fontWeight:700,color:C.amber}}>{e.richtung}</span>
              <span style={{fontSize:15,color:C.blue}}>Diff. {e.differential}</span>
            </div>
            {secH("Zahnzahl / Antal tænder")}
            {kv("Zahnzahl",e.zahnzahl,"")}
            {kv("i",e.zahnzahlRatio,"")}
            {gearRow("Räder",[["d",e.zahnD],["Zw",e.zahnZw],["c",e.zahnC],["b",e.zahnB],["a",e.zahnA]])}
            {secH("Steigung / Stigning")}
            {kv("Steigung",e.steigung,"")}
            {gearRow("Räder",[["a",e.steigA],["Zw",e.steigZw],["b",e.steigB],["C",e.steigC],["d",e.steigD]])}
            {secH("Fräserdrehzahl / Fræser omdr.")}
            {kv("Fräserdrehzahl",e.fraesDrehzahl,"")}
            {gearRow("Räder",[["a",e.fraesA],["b",e.fraesB],["c",e.fraesC],["d",e.fraesD]])}
            {secH("Längsvorschub / Langsgående tilspænding")}
            {kv("Längsvorschub",e.laengs,"")}
            {gearRow("Räder",[["a",e.laengsA],["b",e.laengsB],["c",e.laengsC],["Zw",e.laengsZw],["d",e.laengsD]])}
            {(e.schalterA2||e.schalterA3||e.schalterA4||e.schalterA5)&&(<>
              {secH("Schalterstellungen / Kontaktstillinger")}
              <div style={{padding:"8px 14px",display:"flex",gap:16,flexWrap:"wrap",borderBottom:`1px solid ${C.border}`}}>
                {[["a2",e.schalterA2],["a3",e.schalterA3],["a4",e.schalterA4],["a5",e.schalterA5]].filter(([,v])=>v).map(([lbl,v])=>(<span key={lbl}><span style={{fontSize:12,color:C.muted}}>{lbl}=</span><span style={{...mono,fontSize:16}}>{v}</span></span>))}
              </div>
            </>)}
            {kv("Tauchsteuerung",e.tauchsteuerung,"")}
            {kv("Stck/Std",e.stckStd,"")}
            {kv("Stck/Spannung",e.stckSpannung,"")}
            {secH("Eingang / Indgang")}
            <div style={{padding:"8px 14px"}}><span style={{fontSize:15,fontWeight:700,color:C.amber}}>{e.eingang||"—"}</span></div>
          </div>
        </div>);
      })()}
      {sheet.subDepartment==="MZ"&&(()=>{
        const adv=sheet.mzAdvanced||{};
        const hdr=(key,de,en,icon)=>(
          <button type="button" style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:mzDetOpen[key]?"rgba(240,165,0,.1)":C.surface,border:"none",borderBottom:mzDetOpen[key]?`1px solid ${C.border}`:"none",cursor:"pointer",textAlign:"left"}} onClick={()=>setMzDetOpen(p=>({...p,[key]:!p[key]}))}>
            <i className={`ti ${icon}`} style={{color:C.amber,fontSize:17,flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:C.text}}>{de}</div><div style={{fontSize:13,color:C.muted}}>{en}</div></div>
            <i className={`ti ti-chevron-${mzDetOpen[key]?"up":"down"}`} style={{color:C.muted,fontSize:16}}/>
          </button>
        );
        const row=(de,en,val,unit)=>val!=null&&val!==""?(<div style={{display:"grid",gridTemplateColumns:"1fr auto 70px",gap:6,alignItems:"center",padding:"7px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{de}</div><div style={{fontSize:12,color:C.muted}}>{en}</div></div>
          {unit?<div style={{fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{unit}</div>:<div/>}
          <div style={{fontSize:17,fontWeight:700,fontFamily:"'Share Tech Mono',monospace",color:C.green,textAlign:"right"}}>{val}</div>
        </div>):null;
        const subHdr=t=>(<div style={{padding:"7px 14px",background:C.raised,fontSize:12,fontWeight:700,color:C.amber,letterSpacing:1,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{t}</div>);
        const s=adv.schnecke||{},w=adv.werkstuck||{},ev=adv.entgratenVorne||{},eh=adv.entgratenHinten||{};
        const entRows=(d,de,en)=>(<div>{subHdr(`${de} / ${en}`)}{row("Entgraten","Afgratning",d.entgraten,"0=Nein 1=Ja")}{row("Startpunkt in X","Startpunkt X",d.startpunktX,"[mm]")}{row("Startdurchmesser","Startdiameter",d.startdurchmesser,"[mm]")}{row("Kerndurchmesser","Kernediameter",d.kerndurchmesser,"[mm]")}{row("Verdrehung in Z","Drejning i Z",d.verdrehungZ,"[Grad]")}{row("Steigung","Stigning",d.steigung,"[mm]")}{row("Versatz","Forskydning",d.versatz,"[mm]")}{row("Entgratwinkel","Afgratningsvinkel",d.entgratwinkel,"[Grad]")}{row("Gangzahl Fräser","Fræserens gange",d.gangzahlFraeser,"[1,2]")}</div>);
        const hasSchnecke=Object.values(s).some(v=>v!=="");
        const hasWerk=Object.values(w).some(v=>v!=="");
        const hasEntgraten=Object.values(ev).some(v=>v!=="")||Object.values(eh).some(v=>v!=="");
        if(!hasSchnecke&&!hasWerk&&!hasEntgraten) return null;
        return(<div style={{marginBottom:14}}>
          {hasSchnecke&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("schnecke","Schnecke","Snekke","ti-rotate-clockwise")}
            {mzDetOpen.schnecke&&<div>
              {subHdr("Parameter Schnecke / Snekkeparametre")}
              {row("Gewindesteigung","Gevindstigning",s.gewindesteigung,"[mm]")}{row("Steigungswinkel","Stigningsvinkel",s.steigungswinkel,"[Grad]")}{row("Vorlauf","Forløb",s.vorlauf,"[mm]")}{row("Eintauchlänge X","Indstikslængde X",s.eintauchlaengeX,"[mm]")}{row("Fräslänge","Fræselængde",s.fraeslaenge,"[mm]")}{row("Austauchlänge X","Udløbslængde X",s.austauchlaengeX,"[mm]")}{row("Ausgangsstellung X","Startposition X",s.ausgangsstellungX,"[mm]")}{row("Konizität","Konicitet",s.konizitaet,"[mm/Fräslänge]")}{row("Steigungskorrektur","Stigningskorrektion",s.steigungskorrektur,"[mm/Messlänge]")}{row("Messlänge","Målelængde",s.messlaenge,"[mm]")}
              {subHdr("Durchmesser / Diametre")}
              {row("Startdurchmesser","Startdiameter",s.startdurchmesser,"[mm]")}{row("Eintauchdurchmesser","Indstiksdiameter",s.eintauchdurchmesser,"[mm]")}{row("Kerndurchmesser","Kernediameter",s.kerndurchmesser,"[mm]")}{row("Austauchdurchmesser","Udløbsdiameter",s.austauchdurchmesser,"[mm]")}{row("Enddurchmesser","Slutdiameter",s.enddurchmesser,"[mm]")}{row("Schlichtzustellung","Sletfremføring",s.schlichtzustellung,"[mm]")}{row("Rechts=1, Links=2","Højre=1, Venstre=2",s.rechtsLinks,"")}{row("Gleichlauf=1, Gegenlauf=2","Medløb=1, Modløb=2",s.gleichlaufGegenlauf,"")}
            </div>}
          </div>}
          {hasWerk&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("werkstuck","Werkstückparameter","Emneparametre","ti-settings")}
            {mzDetOpen.werkstuck&&<div>
              {row("Fräserdurchmesser","Fræserdiameter",w.fraeserdurchmesser,"[mm]")}{row("Stückzahl","Antal",w.stueckzahl,"")}{row("Teilung","Stigning",w.teilung,"[1–99]")}{row("Vorschub Tauchen","Tilspænding indstik",w.vorschubTauchen,"[mm/min]")}{row("Vorschub Fräsen","Tilspænding fræsning",w.vorschubFraesen,"[mm/min]")}{row("Phasenverschiebung","Faseforskydning",w.phasenverschiebung,"[Grad]")}{row("Ladestellung X-Achse","Ladeposition X",w.ladestellungX,"[mm]")}{row("Ladestellung Y-Achse","Ladeposition Y",w.ladestellungY,"[mm]")}{row("Drehrichtung Fräser","Fræserens omløbsretning",w.drehrichtungFraeser,"[+1/-1]")}
              {subHdr("Nute / Not")}
              {row("Nute einstechen","Indstik not",w.nuteEinstechen,"[1=Ja, 0=Nein]")}{row("Einstechposition","Indstiksposition",w.einstechposition,"[mm]")}{row("Kerndurchmesser Nut","Kernediameter not",w.kerndurchmesserNut,"[mm]")}{row("Schwenkwinkel","Svingvinkel",w.schwenkwinkel,"[Grad]")}{row("Lader","Lader",w.lader,"[1,2,3,4]")}{row("Zange=1, Tasseau=2, Spitze=3","Tang=1, Tasseau=2, Spids=3",w.zangeType,"")}
            </div>}
          </div>}
          {hasEntgraten&&<div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:8,overflow:"hidden"}}>
            {hdr("entgraten","Entgratunsparameter","Afgratningsparametre","ti-tool")}
            {mzDetOpen.entgraten&&<div>{entRows(ev,"Vorne","Forrest")}{entRows(eh,"Hinten","Bagerst")}</div>}
          </div>}
        </div>);
      })()}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
        <button style={btn("primary",true)} onClick={printPdf}><i className="ti ti-file-type-pdf"/> Eksporter PDF</button>
        <button style={btn("outline",true)} onClick={onEdit}><i className="ti ti-edit"/> Rediger opstillingsark</button>
        {onDuplicate&&<button style={btn("outline",true)} onClick={onDuplicate}><i className="ti ti-copy"/> Kopier ark</button>}
        {!deleteConfirmSS
          ?<button style={{...btn("outline",true),borderColor:"rgba(231,76,60,.4)",color:C.red}} onClick={()=>setDeleteConfirmSS(true)}><i className="ti ti-trash"/> Slet</button>
          :<div style={{background:"rgba(231,76,60,.1)",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:14,color:C.red,marginBottom:10,fontWeight:600}}>Slet "{sheet.partNumber}" on {sheet.machine}?</div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...btn("danger",false,false),flex:1}} onClick={onDelete}><i className="ti ti-trash"/> Ja, slet</button>
              <button style={btn("outline",false,true)} onClick={()=>setDeleteConfirmSS(false)}>Annuller</button>
            </div>
          </div>}
      </div>
    </div>
  );
}
