import { C, inp } from "../lib/theme";

// ═══════════════════════════════════════════════════════
// 150 (Eriks) gear trains, drawn like the paper sheet: two colour groups (amber/blue),
// circles overlap where gears mesh, a compound pair (e.g. b outside c) shares the shaft
// as concentric circles. Each wheel has a leader line to its value.
// The same drawing is used in the form (onChange → inputs) and on the sheet (read-only).
// flip=false: circles left, lines go right · flip=true: circles right, lines go left.
// ═══════════════════════════════════════════════════════
export const GEAR_TRAINS=[
  {key:"zahn",title:"Zahnzahl / Antal tænder",totalKey:"zahnzahl",totalPh:"80",ratioKey:"zahnzahlRatio",flip:false,gears:[
    {label:"d", inputKey:"zahnD", cx:124,cy:42, r:37,color:"amber"},
    {label:"Zw",inputKey:"zahnZw",cx:92, cy:94, r:24,color:"amber"},
    {label:"c", inputKey:"zahnC", cx:113,cy:163,r:48,color:"amber",exitDy:-30},
    {label:"b", inputKey:"zahnB", cx:113,cy:163,r:35,color:"blue", exitDy:+30},
    {label:"a", inputKey:"zahnA", cx:62, cy:224,r:44,color:"blue"},
  ]},
  {key:"steig",title:"Steigung / Stigning",totalKey:"steigung",totalPh:"",ratioKey:"",flip:true,gears:[
    {label:"a", inputKey:"steigA", cx:252,cy:33, r:24,color:"amber"},
    {label:"Zw",inputKey:"steigZw",cx:229,cy:88, r:37,color:"amber"},
    {label:"b", inputKey:"steigB", cx:183,cy:163,r:51,color:"amber",exitDy:-30},
    {label:"c", inputKey:"steigC", cx:183,cy:163,r:37,color:"blue", exitDy:+30},
    {label:"d", inputKey:"steigD", cx:167,cy:224,r:26,color:"blue"},
  ]},
  {key:"fraes",title:"Fräserdrehzahl / Fræser omdr.",totalKey:"fraesDrehzahl",totalPh:"1312",ratioKey:"",flip:true,gears:[
    {label:"a",inputKey:"fraesA",cx:234,cy:34, r:33,color:"amber"},
    {label:"b",inputKey:"fraesB",cx:197,cy:106,r:48,color:"amber",exitDy:-30},
    {label:"c",inputKey:"fraesC",cx:197,cy:106,r:35,color:"blue", exitDy:+30},
    {label:"d",inputKey:"fraesD",cx:173,cy:177,r:40,color:"blue"},
  ]},
  {key:"laengs",title:"Längsvorschub / Langs tilsp.",totalKey:"laengs",totalPh:"0,7",ratioKey:"",flip:false,gears:[
    {label:"a", inputKey:"laengsA", cx:70,cy:37, r:29,color:"amber"},
    {label:"b", inputKey:"laengsB", cx:70,cy:95, r:29,color:"amber",exitDy:-16},
    {label:"c", inputKey:"laengsC", cx:70,cy:95, r:20,color:"blue", exitDy:+16},
    {label:"Zw",inputKey:"laengsZw",cx:70,cy:143,r:18,color:"blue"},
    {label:"d", inputKey:"laengsD", cx:70,cy:201,r:40,color:"blue"},
  ]},
];

const mono={fontFamily:"'Share Tech Mono',monospace",fontWeight:700,color:C.green,fontSize:17};

export function GearTrain({train,e,onChange}){
  const {title,totalKey,totalPh,ratioKey,gears,flip}=train;
  const VW=300, LINE_END=flip?125:165, LABEL_X=flip?90:170, INPUT_X=flip?5:215, INPUT_W=80, INPUT_H=20;
  const maxY=Math.max(...gears.map(g=>g.cy+g.r))+15;
  const edit=!!onChange;
  // Total / ratio above the drawing: an input in the form, the value on the sheet
  const top=(k,label,ph)=>(
    <div style={{flex:1}}>
      <div style={{fontSize:13,color:C.muted,marginBottom:2}}>{label} =</div>
      {edit
        ?<input inputMode="decimal" style={{...inp(),...mono,width:"100%",textAlign:"right",fontSize:18}} value={e[k]||""} onChange={ev=>onChange(k,ev.target.value)} placeholder={ph||"—"}/>
        :<div style={{...mono,fontSize:20,textAlign:"right",padding:"6px 10px",background:C.raised,borderRadius:8,color:e[k]?C.green:C.muted}}>{e[k]||"—"}</div>}
    </div>
  );
  return(
    <div style={{padding:"8px 10px 10px"}}>
      <div style={{fontSize:15,color:C.amber,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:5}}>{title}</div>
      {(totalKey||ratioKey)&&<div style={{display:"flex",gap:8,marginBottom:6}}>
        {totalKey&&top(totalKey,title.split("/")[0].trim(),totalPh)}
        {ratioKey&&top(ratioKey,"i","2:45")}
      </div>}
      <svg viewBox={`0 0 ${VW} ${maxY}`} style={{width:"100%",display:"block"}} overflow="visible">
        {[...gears].sort((a,b)=>b.r-a.r).map(g=>{
          const stroke=g.color==="blue"?C.blue:C.amber;
          const edy=g.exitDy||0, edx=Math.sqrt(Math.max(0,g.r*g.r-edy*edy));
          const ex=flip?g.cx-edx:g.cx+edx, ey=g.cy+edy;
          const v=e[g.inputKey]||"";
          return(
            <g key={g.label}>
              <circle cx={g.cx} cy={g.cy} r={g.r} fill={stroke+"1a"} stroke={stroke} strokeWidth="2"/>
              <line x1={g.cx-g.r*0.38} y1={g.cy} x2={g.cx+g.r*0.38} y2={g.cy} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
              <line x1={g.cx} y1={g.cy-g.r*0.38} x2={g.cx} y2={g.cy+g.r*0.38} stroke={stroke} strokeWidth="0.9" strokeDasharray="2,1.5"/>
              <line x1={ex} y1={ey} x2={LINE_END} y2={ey} stroke={stroke} strokeWidth="1.3"/>
              <text x={LABEL_X} y={ey+5} textAnchor="start" fontSize="14" fontWeight="700" fill={stroke} fontFamily="monospace">{g.label} =</text>
              {edit
                ?<foreignObject x={INPUT_X} y={ey-INPUT_H/2} width={INPUT_W} height={INPUT_H}>
                  <input inputMode="decimal"
                    style={{width:"100%",height:"100%",background:C.raised,border:`1px solid ${stroke}55`,borderRadius:"4px",color:C.green,fontSize:"13px",fontWeight:"700",textAlign:"right",padding:"0 4px",fontFamily:"'Share Tech Mono',monospace",outline:"none",boxSizing:"border-box"}}
                    value={v} onChange={ev=>onChange(g.inputKey,ev.target.value)}/>
                </foreignObject>
                :<>
                  <rect x={INPUT_X} y={ey-INPUT_H/2} width={INPUT_W} height={INPUT_H} rx="4" fill={C.raised} stroke={stroke+"55"}/>
                  <text x={INPUT_X+INPUT_W-5} y={ey+5} textAnchor="end" fontSize="15" fontWeight="700" fill={v?C.green:C.muted} fontFamily="'Share Tech Mono',monospace">{v||"—"}</text>
                </>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// The four trains in a 2×2 grid, as on the paper
export function GearTrains({e,onChange}){
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${C.border}`}}>
      {GEAR_TRAINS.map((t,i)=>(
        <div key={t.key} style={{borderRight:i%2===0?`1px solid ${C.border}`:"none",borderBottom:i<2?`1px solid ${C.border}`:"none"}}>
          <GearTrain train={t} e={e} onChange={onChange}/>
        </div>
      ))}
    </div>
  );
}
