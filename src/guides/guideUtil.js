// ═══════════════════════════════════════════════════════
// VEJLEDNINGER — how-to guides collected in one place instead of notes on paper.
// A guide: {id, title, category, machines:[name] (empty = all machines), intro,
//   steps:[{id, text, photos:[{url,…}], videos:[{url,name,size}]}], files:[{url,name}],
//   createdBy, createdAt, updatedBy, updatedAt, deleted?, deletedBy?, deletedAt?}
// Synced like setup sheets: per guide, newest updatedAt wins.
// ═══════════════════════════════════════════════════════
export const GUIDE_CATS=[
  ["opstilling","Opstilling","adjustments"],
  ["betjening","Betjening","hand-click"],
  ["vedligehold","Vedligehold","tool"],
  ["fejl","Fejlfinding","alert-triangle"],
  ["program","Programmering","code"],
  ["maaling","Måling / kontrol","ruler-measure"],
  ["sikkerhed","Sikkerhed","shield-check"],
  ["andet","Andet","dots"],
];
export const catLabel=k=>(GUIDE_CATS.find(c=>c[0]===k)||[,"Andet"])[1];
export const catIcon=k=>(GUIDE_CATS.find(c=>c[0]===k)||[,,"dots"])[2];

export const newStep=()=>({id:Date.now()+Math.random(),text:"",photos:[],videos:[]});
export const blankGuide=()=>({id:null,title:"",category:"",machines:[],intro:"",steps:[newStep()],files:[]});

// Lower case without accents, so "kølevæske" also finds "kolevaeske"-ish typing
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");

// Every word typed must be somewhere in the guide (title, text, category, machines)
export function guideMatches(g,q){
  const words=norm(q).split(/\s+/).filter(Boolean);
  if(!words.length) return true;
  const hay=norm([g.title,g.intro,catLabel(g.category),...(g.machines||[]),...(g.steps||[]).map(s=>s.text),...(g.files||[]).map(f=>f.name)].join(" "));
  return words.every(w=>hay.includes(w));
}

export const forMachine=(g,m)=>!m||!(g.machines||[]).length||g.machines.includes(m);
export const videoCount=g=>(g.steps||[]).reduce((n,s)=>n+(s.videos||[]).length,0);
export const photoCount=g=>(g.steps||[]).reduce((n,s)=>n+(s.photos||[]).length,0);
export const mb=b=>b>=1e9?`${(b/1e9).toFixed(1)} GB`:`${Math.max(1,Math.round(b/1e6))} MB`;

// ── Drafts: what someone is writing is kept on the tablet until it is saved ──
const PREFIX="st-guide-draft-";
const keyOf=(userId,id)=>`${PREFIX}${userId}-${id??"new"}`;
export function loadGuideDraft(userId,id){
  try{const d=JSON.parse(localStorage.getItem(keyOf(userId,id))||"null");return d&&d.form&&Date.now()-(d.savedAt||0)<14*864e5?d:null;}catch{return null;}
}
export function saveGuideDraft(userId,id,form){
  const d={savedAt:Date.now(),form};
  try{localStorage.setItem(keyOf(userId,id),JSON.stringify(d));return true;}
  catch{
    // Too big with the pictures — keep the typing and the videos (they are on the server already)
    try{
      const lite={...form,steps:form.steps.map(s=>({...s,photos:(s.photos||[]).filter(p=>!String(p.url).startsWith("data:"))}))};
      localStorage.setItem(keyOf(userId,id),JSON.stringify({...d,form:lite,photosDropped:true}));
    }catch{/* storage full */}
    return false;
  }
}
export function clearGuideDraft(userId,id){try{localStorage.removeItem(keyOf(userId,id));}catch{/* */}}
