// What a machine fault was about — picked when the machine runs again ("Kører igen").
// Plain JS (no JSX) so the server's weekly PDF report can use the same list.
export const ISSUE_TOPICS=[
  {key:"mekanisk",   label:"Mekanisk",            icon:"settings"},
  {key:"elektrisk",  label:"Elektrisk",           icon:"bolt"},
  {key:"hydraulik",  label:"Hydraulik / olie",    icon:"droplet"},
  {key:"koeling",    label:"Køling / kølevæske",  icon:"snowflake"},
  {key:"styring",    label:"Styring / alarm",     icon:"alert-octagon"},
  {key:"spaending",  label:"Spænding / værktøj",  icon:"tool"},
  {key:"reservedel", label:"Manglede reservedel", icon:"package"},
  {key:"andet",      label:"Andet",               icon:"dots"},
];
export const topicLabel=k=>ISSUE_TOPICS.find(t=>t.key===k)?.label||"";
export const topicIcon=k=>ISSUE_TOPICS.find(t=>t.key===k)?.icon||"alert-circle";

const DAY=24*3600*1000;
export const REPEAT_DAYS=30;

// Faults (downtimeLog entries) grouped by topic, most downtime first.
// "Uden emne" collects faults solved before topics existed.
export function byTopic(list){
  const g={};
  (list||[]).forEach(d=>{
    const k=d.topic||"";
    const t=g[k]||(g[k]={key:k,label:topicLabel(k)||"Uden emne",sec:0,count:0,items:[],machines:{}});
    t.sec+=d.downtimeSec||0;t.count++;t.items.push(d);
    t.machines[d.machineName]=(t.machines[d.machineName]||0)+(d.downtimeSec||0);
  });
  return Object.values(g).sort((a,b)=>(a.key==="")-(b.key==="")||b.sec-a.sec||b.count-a.count);
}

// The same topic on the same machine at least twice within the last `days` days
// (by when it was reported). Faults without a topic can't be judged and are left out.
export function repeatFaults(log,now=Date.now(),days=REPEAT_DAYS){
  const from=now-days*DAY, g={};
  (log||[]).forEach(d=>{
    if(!d.topic||(d.reportedAt||0)<from) return;
    const k=`${d.machineName}|${d.topic}`;
    const r=g[k]||(g[k]={machine:d.machineName,topic:d.topic,label:topicLabel(d.topic),count:0,sec:0,last:0,items:[]});
    r.count++;r.sec+=d.downtimeSec||0;r.last=Math.max(r.last,d.reportedAt||0);r.items.push(d);
  });
  return Object.values(g).filter(r=>r.count>=2).sort((a,b)=>b.count-a.count||b.sec-a.sec);
}

// For one fault: how many times the same topic was on the same machine in the
// `days` days up to and including this one (1 = first time)
export function repeatNumber(d,log,days=REPEAT_DAYS){
  if(!d.topic) return 0;
  const to=d.reportedAt||0, from=to-days*DAY;
  return (log||[]).filter(x=>x.topic===d.topic&&x.machineName===d.machineName&&(x.reportedAt||0)>=from&&(x.reportedAt||0)<=to).length;
}
