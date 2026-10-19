import { C } from "../lib/theme";

// Two big buttons: open the camera, or pick a picture already on the tablet.
// (A camera-only input can't reach the gallery, and a gallery picker often hides
// the camera — so each gets its own button.) onChange gets the input's change event.
export function PhotoChoice({onChange,color=C.amber,error=false}){
  const box={display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,minHeight:84,padding:"14px 8px",
    background:C.raised,border:`2px dashed ${error?C.red:C.border}`,borderRadius:10,cursor:"pointer",color:C.text,fontSize:15,letterSpacing:1,textAlign:"center"};
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <label style={box}>
        <i className="ti ti-camera" style={{fontSize:30,color}}/> Tag foto
        <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={onChange}/>
      </label>
      <label style={box}>
        <i className="ti ti-photo" style={{fontSize:30,color}}/> Vælg billede
        <input type="file" accept="image/*" style={{display:"none"}} onChange={onChange}/>
      </label>
    </div>
  );
}
