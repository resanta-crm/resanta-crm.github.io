/* RESANTA CRM v23.5.9 · GPS physical stops worker */
'use strict';
const R=6371000,rad=x=>x*Math.PI/180;
function dist(a,b,c,d){const p1=rad(a),p2=rad(c),dp=rad(c-a),dl=rad(d-b),q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function med(a){if(!a.length)return 0;const x=a.slice().sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;}
function center(rows){return{lat:med(rows.map(x=>x.lat)),lng:med(rows.map(x=>x.lng))};}
self.onmessage=e=>{
  let p=(e.data||[]).filter(x=>x.valid&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&Number.isFinite(x.t)&&(!x.acc||x.acc<=180)).sort((a,b)=>a.t-b.t);
  p=p.filter((x,i,a)=>!i||x.t!==a[i-1].t||dist(a[i-1].lat,a[i-1].lng,x.lat,x.lng)>2);
  const out=[];let i=0;
  while(i<p.length-2){
    const cluster=[p[i]];let lastGood=i,misses=0,j=i+1;
    for(;j<p.length;j++){
      const row=p[j],last=p[lastGood];if(row.t-last.t>12*60000)break;
      const c=center(cluster),tol=130+Math.min(45,Math.max(0,(row.acc||30)-20)),d=dist(c.lat,c.lng,row.lat,row.lng);
      if(d<=tol){cluster.push(row);lastGood=j;misses=0;}else{const gap=(row.t-last.t)/60000;if(gap<=4&&misses<2){misses++;continue;}break;}
    }
    if(cluster.length>=3){
      const first=cluster[0],last=cluster[cluster.length-1],mins=(last.t-first.t)/60000,c=center(cluster);
      const ds=cluster.map(x=>dist(c.lat,c.lng,x.lat,x.lng)).sort((a,b)=>a-b),p80=ds[Math.min(ds.length-1,Math.floor(ds.length*.80))]||0;
      let path=0;for(let k=1;k<cluster.length;k++)path+=dist(cluster[k-1].lat,cluster[k-1].lng,cluster[k].lat,cluster[k].lng);
      const avgSpeed=mins>0?(path/1000)/(mins/60):0;
      if(mins>=5&&p80<=155&&avgSpeed<=9){out.push({id:'stop-'+first.t+'-'+last.t,start:first.recorded_at,end:last.recorded_at,startMs:first.t,endMs:last.t,mins:Math.round(mins),lat:c.lat,lng:c.lng,points:cluster,pointCount:cluster.length,spread80:Math.round(p80),medianAccuracy:Math.round(med(cluster.map(x=>x.acc).filter(Number.isFinite))||0),avgSpeedKmh:Math.round(avgSpeed*10)/10});i=lastGood+1;continue;}
    }i++;
  }
  const merged=[];
  out.forEach(st=>{const prev=merged[merged.length-1];if(prev){const gap=(st.startMs-prev.endMs)/60000,d=dist(prev.lat,prev.lng,st.lat,st.lng);if(gap>=0&&gap<=8&&d<=120){const rows=[...(prev.points||[]),...(st.points||[])],c=center(rows);prev.end=st.end;prev.endMs=st.endMs;prev.mins=Math.round((prev.endMs-prev.startMs)/60000);prev.lat=c.lat;prev.lng=c.lng;prev.points=rows;prev.pointCount=rows.length;const ds=rows.map(x=>dist(c.lat,c.lng,x.lat,x.lng)).sort((a,b)=>a-b);prev.spread80=Math.round(ds[Math.min(ds.length-1,Math.floor(ds.length*.80))]||0);return;}}merged.push({...st});});
  self.postMessage(merged);
};
