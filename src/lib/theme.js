// ─── COLOURS ──────────────────────────────────────────────────────────────────
export const C={
  bg:"#151e2b",surface:"#1d2b3d",raised:"#243044",
  border:"rgba(255,255,255,0.07)",
  amber:"#f0a500",green:"#27ae60",red:"#e74c3c",blue:"#3b82f6",deburr:"#e67e22",
  text:"#e0e6f0",muted:"#8a9bb5",
};

// ISO material group definitions
export const ISO_MAT=[
  {code:"P",name:"Stål",         color:"#3b82f6",bg:"rgba(59,130,246,.18)"},
  {code:"M",name:"Rustfrit",     color:"#f0a500",bg:"rgba(240,165,0,.18)"},
  {code:"K",name:"Støbejern",     color:"#e74c3c",bg:"rgba(231,76,60,.18)"},
  {code:"N",name:"Ikke-jern",   color:"#27ae60",bg:"rgba(39,174,96,.18)"},
  {code:"S",name:"Superlegeringer",  color:"#e67e22",bg:"rgba(230,126,34,.18)"},
  {code:"H",name:"Hærdet",      color:"#8b5cf6",bg:"rgba(139,92,246,.18)"},
];
export const DRAWER_ROWS=["A","B","C","D","E","F"];
export const DRAWER_COLS=[1,2,3,4,5,6,7];

// Tablet-friendly defaults for things inline styles can't reach
if(typeof document!=="undefined"&&!document.getElementById("st-global")){
  const st=document.createElement("style");st.id="st-global";
  st.textContent=`
    button,input,select,textarea,label{touch-action:manipulation}
    input[type=checkbox]{width:24px;height:24px;accent-color:${"#f0a500"};flex-shrink:0}
    input[type=date],input[type=time],input[type=datetime-local]{min-height:44px}
    select option{font-size:16px}
    html{-webkit-text-size-adjust:100%}
  `;
  document.head.appendChild(st);
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
export const card  =(accent)=>({background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:"14px 16px",marginBottom:10,borderLeft:accent?`4px solid ${accent}`:`1px solid ${C.border}`});
export const inp   =(err)=>({width:"100%",padding:"14px 14px",minHeight:50,background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:16,boxSizing:"border-box"});
export const sel   =(err)=>({width:"100%",padding:"14px 14px",minHeight:50,background:C.raised,border:`1px solid ${err?C.red:C.border}`,borderRadius:8,color:C.text,fontFamily:"inherit",fontSize:16,boxSizing:"border-box",WebkitAppearance:"none"});
export const btn   =(v,full,sm)=>({width:full?"100%":"auto",padding:sm?"10px 14px":"14px 18px",minHeight:sm?44:50,border:v==="outline"?`1px solid ${C.border}`:"none",borderRadius:8,fontFamily:"inherit",fontSize:sm?13:15,letterSpacing:sm?1:1.5,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,textTransform:"uppercase",cursor:"pointer",fontWeight:700,
  background:v==="primary"?C.amber:v==="success"?C.green:v==="danger"?C.red:v==="blue"?C.blue:v==="outline"?"transparent":C.raised,
  color:(v==="primary"||v==="success"||v==="blue")?"#1a1a1a":v==="danger"?"white":C.muted});
export const navBtn=(a)=>({flex:"0 0 auto",padding:"12px 16px",minHeight:48,border:"none",borderRadius:8,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:14,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit",fontWeight:a?700:400});
export const badge =(s)=>({fontSize:13,letterSpacing:1,padding:"4px 10px",borderRadius:20,textTransform:"uppercase",
  background:s==="setup"?"rgba(240,165,0,.15)":s==="run"?"rgba(39,174,96,.15)":s==="admin"?"rgba(59,130,246,.15)":s==="down"?"rgba(231,76,60,.15)":s==="repair"?"rgba(240,165,0,.15)":"rgba(138,155,181,.1)",
  color:s==="setup"?C.amber:s==="run"?C.green:s==="admin"?C.blue:s==="down"?C.red:s==="repair"?C.amber:C.muted});
export const statBox={background:C.raised,borderRadius:8,padding:"12px 14px",textAlign:"center",border:`1px solid rgba(255,255,255,.05)`};
export const tag   =(a)=>({display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",minHeight:40,borderRadius:20,border:`1px solid ${a?C.amber:C.border}`,background:a?C.amber:"transparent",color:a?"#1a1a1a":C.muted,fontSize:13,fontFamily:"inherit",cursor:"pointer",letterSpacing:1,textTransform:"uppercase"});
export const avatar=(bg)=>({width:44,height:44,borderRadius:"50%",background:bg||C.raised,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:C.amber,fontWeight:700,flexShrink:0,border:`1px solid rgba(255,255,255,.1)`});
export const label ={display:"block",fontSize:13,letterSpacing:2,color:C.muted,textTransform:"uppercase",marginBottom:6};
export const errMsg={fontSize:14,color:C.red,letterSpacing:1,marginTop:6};
export const meta  ={display:"flex",flexWrap:"wrap",gap:12,fontSize:14,color:C.muted,marginTop:6};
export const th    ={textAlign:"left",padding:"10px 10px",borderBottom:`1px solid rgba(255,255,255,.08)`,color:C.muted,fontSize:13,letterSpacing:2,textTransform:"uppercase"};
export const td    ={padding:"10px 10px",fontSize:15,borderBottom:`1px solid rgba(255,255,255,.04)`,color:C.text,verticalAlign:"middle"};
