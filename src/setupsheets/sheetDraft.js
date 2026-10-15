// ═══════════════════════════════════════════════════════
// SETUP SHEET DRAFTS — what an operator has typed into a sheet but not saved yet.
// Kept on the tablet (localStorage), one per person per sheet ("new" for a new
// sheet), so a reload, a logout or leaving the app doesn't lose the work.
// Removed when the sheet is saved or the operator throws the draft away.
// ═══════════════════════════════════════════════════════
const PREFIX="st-sheet-draft-";
const MAX_AGE=14*24*3600*1000; // forgotten drafts are dropped after 14 days

const keyOf=(userId,sheetId)=>`${PREFIX}${userId}-${sheetId??"new"}`;

export function loadDraft(userId,sheetId){
  try{
    const d=JSON.parse(localStorage.getItem(keyOf(userId,sheetId))||"null");
    return d&&d.form&&Date.now()-(d.savedAt||0)<MAX_AGE?d:null;
  }catch{return null;}
}

// All of one person's drafts, newest first
export function listDrafts(userId){
  const out=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||!k.startsWith(`${PREFIX}${userId}-`)) continue;
      try{
        const d=JSON.parse(localStorage.getItem(k));
        if(d&&d.form&&Date.now()-(d.savedAt||0)<MAX_AGE) out.push(d);
        else localStorage.removeItem(k);
      }catch{/* broken entry — skip */}
    }
  }catch{/* storage not available */}
  return out.sort((a,b)=>b.savedAt-a.savedAt);
}

// Returns false when the photos didn't fit (the typing is still kept)
export function saveDraft(userId,sheetId,form){
  const d={sheetId:sheetId??null,savedAt:Date.now(),form};
  try{localStorage.setItem(keyOf(userId,sheetId),JSON.stringify(d));return true;}
  catch{
    try{localStorage.setItem(keyOf(userId,sheetId),JSON.stringify({...d,form:{...form,photos:[]},photosDropped:true}));}catch{/* nothing fits */}
    return false;
  }
}

export function clearDraft(userId,sheetId){
  try{localStorage.removeItem(keyOf(userId,sheetId));}catch{/* storage not available */}
}
