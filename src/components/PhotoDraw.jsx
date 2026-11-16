import { useState, useEffect, useRef } from "react";
import { C } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// Draw on a photo: pen, line, arrow, circle, box and text in a few strong colours.
// A text can be tapped afterwards to move it, recolour it, resize it, change or delete it.
// The drawing is kept as a list of marks over the untouched original, so it can be
// changed or removed later. Saving gives a flattened JPEG (shown everywhere the photo
// is shown, PDF included) plus {original, marks, mw, mh} to edit again.
// Two fingers zoom and move the picture; one finger draws.
// ═══════════════════════════════════════════════════════
const COLORS=[["#e53e3e","Rød"],["#f5c400","Gul"],["#2fbf71","Grøn"],["#ffffff","Hvid"],["#111111","Sort"]];
const TOOLS=[["pen","ti-pencil","Pen"],["line","ti-line","Streg"],["arrow","ti-arrow-up-right","Pil"],["circle","ti-circle","Cirkel"],["box","ti-square","Firkant"],["text","ti-letter-t","Tekst"]];

// One mark onto a canvas context. Sizes follow the picture width so a mark looks the
// same on a small or large photo.
function drawMark(ctx,m,W){
  const lw=W/(m.thick?75:150);
  ctx.save();
  ctx.strokeStyle=m.color;ctx.fillStyle=m.color;ctx.lineWidth=lw;ctx.lineCap="round";ctx.lineJoin="round";
  // A thin dark edge keeps light colours readable on a bright part and vice versa
  ctx.shadowColor=m.color==="#111111"?"rgba(255,255,255,.7)":"rgba(0,0,0,.6)";ctx.shadowBlur=lw*0.8;
  const p=m.pts;
  if(m.type==="pen"){
    ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);
    if(p.length===1) ctx.lineTo(p[0][0]+0.1,p[0][1]);
    for(let i=1;i<p.length;i++) ctx.lineTo(p[i][0],p[i][1]);
    ctx.stroke();
  }else if(m.type==="line"&&p.length>1){
    const [a,b]=[p[0],p[p.length-1]];
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  }else if(m.type==="arrow"&&p.length>1){
    const [a,b]=[p[0],p[p.length-1]];
    const ang=Math.atan2(b[1]-a[1],b[0]-a[0]), head=lw*5;
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0]-Math.cos(ang)*head*0.6,b[1]-Math.sin(ang)*head*0.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(b[0],b[1]);
    ctx.lineTo(b[0]-head*Math.cos(ang-0.45),b[1]-head*Math.sin(ang-0.45));
    ctx.lineTo(b[0]-head*Math.cos(ang+0.45),b[1]-head*Math.sin(ang+0.45));
    ctx.closePath();ctx.fill();
  }else if((m.type==="circle"||m.type==="box")&&p.length>1){
    const [a,b]=[p[0],p[p.length-1]];
    const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(b[0]-a[0]),h=Math.abs(b[1]-a[1]);
    ctx.beginPath();
    if(m.type==="circle") ctx.ellipse(x+w/2,y+h/2,Math.max(w/2,1),Math.max(h/2,1),0,0,Math.PI*2);
    else ctx.rect(x,y,w,h);
    ctx.stroke();
  }else if(m.type==="text"&&m.text){
    const fs=textSize(m,W);
    ctx.font=textFont(fs);ctx.textBaseline="middle";
    ctx.shadowBlur=0;ctx.lineWidth=fs/6;ctx.strokeStyle=m.color==="#111111"?"#fff":"#000";
    ctx.strokeText(m.text,p[0][0],p[0][1]);ctx.fillText(m.text,p[0][0],p[0][1]);
  }
  ctx.restore();
}

// Text: two sizes, and the box around it (to tap it and to show it is picked)
const textSize=(m,W)=>W/(m.thick?14:22);
const textFont=fs=>`800 ${fs}px Arial, sans-serif`;
function textBox(ctx,m,W){
  const fs=textSize(m,W);
  ctx.save();ctx.font=textFont(fs);const w=ctx.measureText(m.text||"").width;ctx.restore();
  const pad=fs*0.3;
  return {x:m.pts[0][0]-pad,y:m.pts[0][1]-fs/2-pad,w:w+pad*2,h:fs+pad*2};
}

function loadImage(src){
  return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});
}

// photo: {url, original?, marks?} · onSave(newPhotoFields) · onClose()
export function PhotoDraw({photo,onSave,onClose}){
  const canvasRef=useRef(null), wrapRef=useRef(null);
  const [img,setImg]=useState(null);
  const [failed,setFailed]=useState(false);
  const [marks,setMarks]=useState(photo.marks||[]);
  const [tool,setTool]=useState("arrow");
  const [color,setColor]=useState("#e53e3e");
  const [thick,setThick]=useState(false);
  const [view,setView]=useState({s:1,x:0,y:0}); // zoom and pan of the picture
  const [textAt,setTextAt]=useState(null); // [x,y] waiting for the text to be typed
  const [editIdx,setEditIdx]=useState(null); // a text being re-typed
  const [sel,setSel]=useState(null);       // index of the picked text (move / colour / size)
  const drag=useRef(null);
  const [text,setText]=useState("");
  const [saving,setSaving]=useState(false);
  const live=useRef(null);          // the mark being drawn right now
  const pointers=useRef(new Map()); // fingers on the screen
  const pinch=useRef(null);

  useEffect(()=>{loadImage(photo.original||photo.url).then(setImg).catch(()=>setFailed(true));},[]);

  const W=img?.naturalWidth||1, H=img?.naturalHeight||1;
  const redraw=()=>{
    const c=canvasRef.current;if(!c||!img) return;
    const ctx=c.getContext("2d");
    ctx.drawImage(img,0,0,W,H);
    marks.forEach(m=>drawMark(ctx,m,W));
    if(live.current) drawMark(ctx,live.current,W);
    // The picked text gets a dashed frame (only on screen, never in the saved picture)
    if(sel!=null&&marks[sel]){
      const b=textBox(ctx,marks[sel],W);
      ctx.save();ctx.lineWidth=W/300;ctx.setLineDash([W/80,W/120]);
      ctx.strokeStyle="#000";ctx.strokeRect(b.x,b.y,b.w,b.h);
      ctx.strokeStyle="#fff";ctx.lineDashOffset=W/80;ctx.strokeRect(b.x,b.y,b.w,b.h);
      ctx.restore();
    }
  };
  useEffect(redraw,[img,marks,sel]);
  const hitText=pt=>{
    const ctx=canvasRef.current?.getContext("2d");if(!ctx) return -1;
    for(let i=marks.length-1;i>=0;i--){
      const m=marks[i];if(m.type!=="text") continue;
      const b=textBox(ctx,m,W);
      if(pt[0]>=b.x&&pt[0]<=b.x+b.w&&pt[1]>=b.y&&pt[1]<=b.y+b.h) return i;
    }
    return -1;
  };
  const patchSel=obj=>{if(sel!=null) setMarks(x=>x.map((m,i)=>i===sel?{...m,...obj}:m));};
  const pickColor=c=>{setColor(c);patchSel({color:c});};
  const toggleThick=()=>{const t=!thick;setThick(t);patchSel({thick:t});};

  // Screen point → picture pixel (the bounding box already includes the zoom)
  const toImg=ev=>{
    const r=canvasRef.current.getBoundingClientRect();
    return [Math.round((ev.clientX-r.left)*W/r.width),Math.round((ev.clientY-r.top)*H/r.height)];
  };
  const pinchState=()=>{
    const [a,b]=[...pointers.current.values()];
    return {d:Math.hypot(a.x-b.x,a.y-b.y)||1,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
  };

  const down=ev=>{
    if(textAt) return;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(pointers.current.size===2){
      // Second finger: stop drawing, start zoom / move
      live.current=null;drag.current=null;redraw();
      pinch.current={start:pinchState(),view};
      return;
    }
    if(pointers.current.size>2) return;
    const pt=toImg(ev);
    // Tapping a text picks it; dragging moves it
    const hit=hitText(pt);
    if(hit>=0){
      const m=marks[hit];
      setSel(hit);setColor(m.color);setThick(!!m.thick);
      drag.current={idx:hit,dx:pt[0]-m.pts[0][0],dy:pt[1]-m.pts[0][1]};
      return;
    }
    if(sel!=null){setSel(null);if(tool==="text"){pointers.current.clear();return;}}
    if(tool==="text"){setTextAt(pt);setText("");setEditIdx(null);pointers.current.clear();return;}
    live.current={type:tool,color,thick,pts:[pt]};
    redraw();
  };
  const move=ev=>{
    if(!pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
    if(pinch.current&&pointers.current.size>=2){
      const now=pinchState(),st=pinch.current.start,v=pinch.current.view;
      const s=Math.min(5,Math.max(1,v.s*now.d/st.d));
      setView({s,x:v.x+(now.cx-st.cx),y:v.y+(now.cy-st.cy)});
      return;
    }
    if(drag.current){
      const pt=toImg(ev),d=drag.current;
      setMarks(x=>x.map((m,i)=>i===d.idx?{...m,pts:[[pt[0]-d.dx,pt[1]-d.dy]]}:m));
      return;
    }
    if(!live.current) return;
    const pt=toImg(ev);
    if(live.current.type==="pen") live.current.pts.push(pt);
    else live.current.pts=[live.current.pts[0],pt];
    redraw();
  };
  const up=ev=>{
    pointers.current.delete(ev.pointerId);
    if(pinch.current){if(pointers.current.size===0){pinch.current=null;if(view.s<=1.02)setView({s:1,x:0,y:0});}return;}
    if(drag.current){
      // The last position can come with the release itself
      const d=drag.current;drag.current=null;
      if(ev.type==="pointerup"){const pt=toImg(ev);setMarks(x=>x.map((m,i)=>i===d.idx?{...m,pts:[[pt[0]-d.dx,pt[1]-d.dy]]}:m));}
      return;
    }
    const m=live.current;live.current=null;
    if(!m) return;
    // A tap with a shape tool makes nothing; a tap with the pen makes a dot
    const far=m.pts.length>1&&Math.hypot(m.pts[m.pts.length-1][0]-m.pts[0][0],m.pts[m.pts.length-1][1]-m.pts[0][1])>W/80;
    if(m.type==="pen"||far) setMarks(x=>[...x,m]); else redraw();
  };

  const addText=()=>{
    const t=text.trim();
    if(editIdx!=null){
      // Re-typed: empty removes it
      if(t) setMarks(x=>x.map((m,i)=>i===editIdx?{...m,text:t}:m));
      else {setMarks(x=>x.filter((_,i)=>i!==editIdx));setSel(null);}
    }else if(t){
      // A new text is picked straight away, so it can be moved or recoloured
      setSel(marks.length);
      setMarks(x=>[...x,{type:"text",color,thick,pts:[textAt],text:t}]);
    }
    setTextAt(null);setText("");setEditIdx(null);
  };
  const closeText=()=>{setTextAt(null);setText("");setEditIdx(null);};

  const save=async()=>{
    setSaving(true);
    const original=photo.original||photo.url;
    if(!marks.length){onSave({url:original,original:undefined,marks:undefined,mw:undefined,mh:undefined});return;}
    const c=document.createElement("canvas");c.width=W;c.height=H;
    const ctx=c.getContext("2d");ctx.drawImage(img,0,0,W,H);marks.forEach(m=>drawMark(ctx,m,W));
    onSave({url:c.toDataURL("image/jpeg",0.85),original,marks,mw:W,mh:H});
  };

  const bar={display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"};
  const tbtn=on=>({minWidth:52,height:52,borderRadius:10,border:`2px solid ${on?C.amber:"rgba(255,255,255,.18)"}`,background:on?C.amber+"33":"rgba(255,255,255,.06)",color:on?C.amber:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,padding:"0 8px"});
  const abtn=(kind)=>({height:52,borderRadius:10,border:"none",padding:"0 18px",fontSize:16,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",gap:8,
    background:kind==="save"?C.green:"rgba(255,255,255,.1)",color:kind==="save"?"#06210f":"#fff"});

  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"#0b0d10",display:"flex",flexDirection:"column"}}>
      {/* Tools */}
      <div style={{padding:"10px 12px",display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",borderBottom:"1px solid rgba(255,255,255,.1)"}}>
        <div style={bar}>
          {TOOLS.map(([k,icon,lbl])=>(
            <button key={k} style={tbtn(tool===k)} onClick={()=>setTool(k)}><i className={`ti ${icon}`} style={{fontSize:22}}/>{lbl}</button>
          ))}
          <button style={tbtn(thick)} onClick={toggleThick} title="Tyk / tynd"><i className="ti ti-line-height" style={{fontSize:22}}/>{(tool==="text"||sel!=null)?(thick?"Stor":"Lille"):(thick?"Tyk":"Tynd")}</button>
        </div>
        <div style={bar}>
          {COLORS.map(([c,lbl])=>(
            <button key={c} title={lbl} aria-label={lbl} onClick={()=>pickColor(c)}
              style={{width:44,height:44,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${color===c?C.amber:"rgba(255,255,255,.35)"}`,boxShadow:color===c?`0 0 0 3px ${C.amber}55`:"none"}}/>
          ))}
        </div>
        <div style={bar}>
          <button style={{...tbtn(false),opacity:marks.length?1:.4}} disabled={!marks.length} onClick={()=>{setSel(null);setMarks(x=>x.slice(0,-1));}}><i className="ti ti-arrow-back-up" style={{fontSize:22}}/>Fortryd</button>
          <button style={{...tbtn(false),opacity:marks.length?1:.4}} disabled={!marks.length} onClick={()=>{setSel(null);setMarks([]);}}><i className="ti ti-eraser" style={{fontSize:22}}/>Ryd</button>
        </div>
      </div>

      {/* The picture */}
      <div ref={wrapRef} style={{flex:1,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",touchAction:"none",padding:10}}>
        {failed&&<div style={{color:"#fff",fontSize:16}}>Billedet kunne ikke åbnes.</div>}
        {!img&&!failed&&<div style={{color:"#aaa",fontSize:16}}><i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/> Henter billede…</div>}
        {img&&<canvas ref={canvasRef} width={W} height={H}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{maxWidth:"100%",maxHeight:"100%",touchAction:"none",cursor:tool==="text"?"text":"crosshair",borderRadius:6,
            transform:`translate(${view.x}px,${view.y}px) scale(${view.s})`,transformOrigin:"center center"}}/>}
        {view.s>1&&<button onClick={()=>setView({s:1,x:0,y:0})} style={{position:"absolute",top:12,right:12,...abtn(),height:42,fontSize:14}}><i className="ti ti-zoom-reset"/> Hele billedet</button>}
        {sel!=null&&marks[sel]&&!textAt&&(
          <div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",display:"flex",gap:8,alignItems:"center",background:"rgba(0,0,0,.8)",padding:"8px 10px",borderRadius:12,zIndex:1,whiteSpace:"nowrap"}}>
            <span style={{color:"#ddd",fontSize:14,padding:"0 4px"}}><i className="ti ti-hand-move"/> Træk for at flytte · vælg farve og størrelse</span>
            <button style={{...abtn(),height:44,fontSize:14,padding:"0 12px"}} onClick={()=>{setEditIdx(sel);setText(marks[sel].text);setTextAt(marks[sel].pts[0]);}}><i className="ti ti-pencil"/> Ret tekst</button>
            <button style={{...abtn(),height:44,fontSize:14,padding:"0 12px",background:"#e53e3e"}} onClick={()=>{setMarks(x=>x.filter((_,i)=>i!==sel));setSel(null);}}><i className="ti ti-trash"/> Slet</button>
            <button style={{...abtn("save"),height:44,fontSize:14,padding:"0 12px"}} onClick={()=>setSel(null)}><i className="ti ti-check"/> Færdig</button>
          </div>
        )}
        {tool==="text"&&!textAt&&sel==null&&<div style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,.7)",color:"#fff",padding:"8px 12px",borderRadius:8,fontSize:14,pointerEvents:"none"}}>Tryk hvor teksten skal stå · tryk på en tekst for at flytte den</div>}
      </div>

      {/* Typing a text mark */}
      {textAt&&(
        <div style={{position:"absolute",left:0,right:0,top:0,padding:16,background:"rgba(0,0,0,.85)",display:"flex",gap:8,zIndex:2}}>
          <input autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addText();}} placeholder="Skriv tekst, f.eks. 0,2 mm her"
            style={{flex:1,height:52,fontSize:20,padding:"0 14px",borderRadius:10,border:`2px solid ${color}`,background:"#1a1d22",color:"#fff",outline:"none"}}/>
          <button style={abtn("save")} onClick={addText}><i className="ti ti-check"/> OK</button>
          <button style={abtn()} onClick={closeText}>Annuller</button>
        </div>
      )}

      {/* Save / cancel */}
      <div style={{padding:"10px 12px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center",borderTop:"1px solid rgba(255,255,255,.1)"}}>
        <div style={{color:"#999",fontSize:13}}>To fingre: zoom og flyt billedet</div>
        <div style={{display:"flex",gap:10}}>
          <button style={abtn()} onClick={onClose}>Annuller</button>
          <button style={{...abtn("save"),opacity:img&&!saving?1:.5}} disabled={!img||saving} onClick={save}><i className="ti ti-device-floppy"/> Gem tegning</button>
        </div>
      </div>
    </div>
  );
}
