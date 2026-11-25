import { catLabel } from "./guideUtil";

// Print a guide (or save it as PDF from the print dialog) — same look as the printed
// setup sheet: dark header, numbered steps, pictures with their GO / NO GO frame.
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const VERD={go:["GO","#27ae60"],nogo:["NO GO","#e53e3e"]};

export function printGuide(g){
  const w=window.open("","_blank","width=860,height=1100");
  if(!w) return false;
  const steps=(g.steps||[]).filter(s=>s.text?.trim()||s.photos?.length||s.videos?.length);
  const photo=p=>{
    const v=VERD[p.verdict];
    return `<div class="photo"${v?` style="border:4px solid ${v[1]}"`:""}><img src="${esc(p.url)}" onerror="this.style.display='none'"/>${v?`<div class="verdict" style="background:${v[1]}">${v[0]}</div>`:""}</div>`;
  };
  const step=(s,i)=>`<div class="step">
  <div class="num">${i+1}</div>
  <div class="content">
    ${s.text?.trim()?`<div class="text">${esc(s.text)}</div>`:""}
    ${(s.photos||[]).length?`<div class="photos ${s.photos.length===1?"one":""}">${s.photos.map(photo).join("")}</div>`:""}
    ${(s.videos||[]).length?`<div class="video">▶ Video: ${s.videos.map(v=>esc(v.name||"video")).join(", ")} — se den i ShopTrack under Vejledninger</div>`:""}
  </div>
</div>`;
  const machines=(g.machines||[]).length?g.machines.map(esc).join(", "):"Alle maskiner";
  const date=t=>t?new Date(t).toLocaleDateString("da-DK",{day:"2-digit",month:"short",year:"numeric"}):"";
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(g.title)} — vejledning</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff}
.header{background:#1a2233;color:#fff;padding:18px 24px 14px}
.header .kind{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#aab;margin-bottom:4px}
.header h1{font-size:24px;color:#f0a500;margin-bottom:6px;line-height:1.2}
.header .sub{font-size:12px;color:#ccd}
.body{padding:18px 24px}
h2{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 10px}
.intro{font-size:15px;line-height:1.5;white-space:pre-wrap;background:#f4f6ff;border:1px solid #dde;border-radius:8px;padding:12px 14px;margin-bottom:6px}
.step{display:flex;gap:14px;margin-bottom:16px;page-break-inside:avoid}
.num{width:34px;height:34px;border-radius:50%;background:#f0a500;color:#1a1a1a;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.content{flex:1;min-width:0;border-bottom:1px solid #eee;padding-bottom:12px}
.text{font-size:15px;line-height:1.5;white-space:pre-wrap;margin:5px 0 8px}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.photos.one{grid-template-columns:1fr}
.photo{position:relative;border-radius:6px;overflow:hidden;background:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.photo img{width:100%;max-height:300px;object-fit:contain;display:block}
.photos.one .photo img{max-height:420px}
.verdict{position:absolute;top:6px;left:6px;color:#fff;font-weight:800;font-size:13px;padding:3px 10px;border-radius:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.video{font-size:12px;color:#1a6eb5;margin-top:6px}
.files{font-size:13px;line-height:1.6}
footer{font-size:10px;color:#999;border-top:1px solid #ddd;margin:10px 24px 0;padding:8px 0 16px}
@media print{.no-print{display:none}@page{margin:12mm}}
</style></head><body>
<div class="header">
  <div class="kind">Vejledning${g.category?` · ${esc(catLabel(g.category))}`:""}</div>
  <h1>${esc(g.title)}</h1>
  <div class="sub">Maskine: ${machines}</div>
</div>
<div class="body">
${g.intro?.trim()?`<div class="intro">${esc(g.intro)}</div>`:""}
${steps.length?`<h2>Trin for trin</h2>${steps.map(step).join("")}`:""}
${(g.files||[]).length?`<h2>Dokumenter (PDF)</h2><div class="files">${g.files.map(f=>`• ${esc(f.name||"dokument")}`).join("<br>")}<br><span style="color:#888;font-size:11px">Åbnes i ShopTrack under Vejledninger</span></div>`:""}
</div>
<footer>ShopTrack vejledning &nbsp;·&nbsp; Skrevet af ${esc(g.createdBy||"—")} ${date(g.createdAt)}${g.updatedBy&&g.updatedAt!==g.createdAt?` &nbsp;·&nbsp; Rettet af ${esc(g.updatedBy)} ${date(g.updatedAt)}`:""} &nbsp;·&nbsp; Udskrevet ${date(Date.now())}</footer>
<div class="no-print" style="position:fixed;top:10px;right:10px">
<button onclick="window.print()" style="background:#1a2233;color:#f0a500;border:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Udskriv / gem som PDF</button>
</div>
</body></html>`);
  w.document.close();
  return true;
}
