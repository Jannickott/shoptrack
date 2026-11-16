import { useState } from "react";
import { C } from "../lib/theme";
import { resizeImage } from "../lib/api";
import { PhotoDraw } from "./PhotoDraw";

// ═══════════════════════════════════════════════════════
// Photos you can draw on, plus a blank sheet to sketch on.
// A photo is {url, original?, marks?, mw?, mh?, sketch?} — url is what everyone sees.
// ═══════════════════════════════════════════════════════

// A white sheet the size of a shrunk photo, to sketch on
export function blankSketch(){
  const c=document.createElement("canvas");c.width=1200;c.height=900;
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,1200,900);
  return c.toDataURL("image/jpeg",0.9);
}

// A picked / taken picture → shrunk data URL
export async function fileToPhoto(file){
  const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(file);});
  return resizeImage(dataUrl);
}

// The draw window for photos[i]; a new sketch closed without drawing is removed again
export function useDrawOnPhotos(photos,onChange){
  const [drawing,setDrawing]=useState(null); // {i, fresh}
  const startSketch=()=>{const list=[...(photos||[]),{url:blankSketch(),sketch:true}];onChange(list);setDrawing({i:list.length-1,fresh:true});};
  const editor=drawing&&photos?.[drawing.i]?(
    <PhotoDraw photo={photos[drawing.i]}
      onClose={()=>{if(drawing.fresh) onChange(photos.filter((_,j)=>j!==drawing.i));setDrawing(null);}}
      onSave={x=>{
        const i=drawing.i,p=photos[i];
        // A sketch with nothing on it is not worth keeping
        if(p.sketch&&!x.marks?.length) onChange(photos.filter((_,j)=>j!==i));
        else onChange(photos.map((ph,j)=>j===i?{...ph,...x}:ph));
        setDrawing(null);
      }}/>
  ):null;
  return {editor,draw:i=>setDrawing({i,fresh:false}),startSketch};
}

// Thumbnails with Tegn / remove, and three buttons: camera, pictures, sketch
export function PhotoAttach({photos,onChange,color=C.amber}){
  const list=photos||[];
  const [busy,setBusy]=useState(false);
  const {editor,draw,startSketch}=useDrawOnPhotos(list,onChange);
  const add=async e=>{
    const files=[...e.target.files];e.target.value="";
    if(!files.length) return;
    setBusy(true);
    const added=[];for(const f of files) added.push({url:await fileToPhoto(f)});
    onChange([...list,...added]);setBusy(false);
  };
  const box={display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,minHeight:70,padding:"10px 6px",background:C.raised,border:`2px dashed ${C.border}`,borderRadius:10,cursor:"pointer",color:C.text,fontSize:14,textAlign:"center"};
  return(
    <div>
      {editor}
      {list.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:8}}>
          {list.map((p,i)=>(
            <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",background:C.raised,aspectRatio:"4/3"}}>
              <img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              <button onClick={()=>draw(i)} style={{position:"absolute",top:5,left:5,background:p.marks?.length?C.amber:"rgba(0,0,0,.7)",border:"none",borderRadius:8,color:p.marks?.length?"#000":"#fff",cursor:"pointer",padding:"7px 10px",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
                <i className="ti ti-pencil" style={{fontSize:16}}/> {p.marks?.length?"Ret":"Tegn"}
              </button>
              <button onClick={()=>onChange(list.filter((_,j)=>j!==i))} aria-label="Fjern billede" style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,.7)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",width:36,height:36,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="ti ti-x"/></button>
            </div>
          ))}
        </div>
      )}
      {busy
        ?<div style={{...box,flexDirection:"row",cursor:"default",color:C.muted}}><i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/> Henter billede…</div>
        :<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <label style={box}><i className="ti ti-camera" style={{fontSize:26,color}}/> Tag foto
            <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={add}/></label>
          <label style={box}><i className="ti ti-photo" style={{fontSize:26,color}}/> Vælg billede
            <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={add}/></label>
          <button style={{...box,font:"inherit",fontSize:14}} onClick={startSketch}><i className="ti ti-scribble" style={{fontSize:26,color}}/> Tegn skitse</button>
        </div>}
    </div>
  );
}

// Read-only thumbnails; a tap shows the picture big
export function PhotoStrip({photos,size=96}){
  const [big,setBig]=useState(null);
  if(!photos?.length) return null;
  return(
    <>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
        {photos.map((p,i)=>(
          <img key={i} src={p.url} alt="" onClick={e=>{e.stopPropagation();setBig(p);}}
            style={{width:size,height:size*0.75,objectFit:"cover",borderRadius:6,border:`1px solid ${C.border}`,cursor:"zoom-in",background:C.raised}}/>
        ))}
      </div>
      {big&&(
        <div onClick={()=>setBig(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:1001,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
          <img src={big.url} alt="" style={{maxWidth:"100%",maxHeight:"calc(100vh - 100px)",borderRadius:10,objectFit:"contain"}} onClick={e=>e.stopPropagation()}/>
          <button onClick={()=>setBig(null)} style={{marginTop:14,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,color:"#fff",fontSize:16,fontWeight:700,padding:"10px 28px",cursor:"pointer"}}><i className="ti ti-x"/> Luk</button>
        </div>
      )}
    </>
  );
}
