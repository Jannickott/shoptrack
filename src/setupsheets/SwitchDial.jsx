import { C } from "../lib/theme";

// Schalterstellungen (150): one switch drawn as a dial with its markings. A dial can
// carry the same number twice (a4 is 1-2-2-1), so the position tapped is kept as well
// as the number: `pos` (index). Old sheets only have the number → first matching mark.
export const SWITCHES=[["schalterA2","a2",[1,2,3]],["schalterA3","a3",[0,1,2,3]],["schalterA4","a4",[1,2,2,1]],["schalterA5","a5",[1,2,3]]];

// Big enough to tap with a finger: the marks sit on a wide arc so they never touch
export function SwitchDial({label,labels=[1,2,3],value,pos,onPick,size=120}){
  const n=labels.length, span=n>3?150:120, step=n>1?span/(n-1):0;
  const cx=50,cy=52,r=33;
  const pts=labels.map((lbl,i)=>{const a=(-90-span/2+i*step)*Math.PI/180;return{lbl:String(lbl),x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};});
  const val=value!=null&&value!==""?String(value):null;
  const p=pos!=null&&pos!==""?Number(pos):NaN;
  const selIdx=val==null?-1:(Number.isInteger(p)&&pts[p]?.lbl===val?p:pts.findIndex(x=>x.lbl===val));
  const sel=selIdx>=0?pts[selIdx]:null;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
      <div style={{fontSize:14,color:C.amber,fontWeight:700,letterSpacing:.5}}>{label}</div>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={r+12} fill="none" stroke={C.border} strokeWidth="1.5"/>
        <circle cx={cx} cy={cy} r={4} fill={C.muted}/>
        {sel&&<line x1={cx} y1={cy} x2={sel.x} y2={sel.y} stroke="#e53e3e" strokeWidth="3" strokeLinecap="round"/>}
        {pts.map((q,i)=>{const on=i===selIdx;return(
          <g key={i} onClick={onPick?()=>onPick(on?null:i,on?"":q.lbl):undefined} style={{cursor:onPick?"pointer":"default"}}>
            <circle cx={q.x} cy={q.y} r={11.5} fill={on?"#e53e3e":C.raised} stroke={on?"#e53e3e":C.border} strokeWidth="1.5"/>
            <text x={q.x} y={q.y+4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill={on?"#fff":C.muted}>{q.lbl}</text>
          </g>
        );})}
      </svg>
    </div>
  );
}
