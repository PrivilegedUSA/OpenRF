'use strict';
(() => {
  // Screen-space groups bound DOM marker count on both renderers. No invented
  // RF links, locations or reachability. A group is a display bin, not a node.
  function groups(nodes,project,w,h,cell=48){
    const bins=new Map();
    for(const n of nodes){
      const p=project(n);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=w||p.y>=h)continue;
      const key=`${Math.floor(p.x/cell)}:${Math.floor(p.y/cell)}`;
      let g=bins.get(key);if(!g){g={x:0,y:0,nodes:[]};bins.set(key,g);}
      g.x+=p.x;g.y+=p.y;g.nodes.push(n);
    }
    return [...bins.values()].map(g=>({...g,x:g.x/g.nodes.length,y:g.y/g.nodes.length}));
  }
  function selected(nodes,all,repeaters){return all?nodes:repeaters?nodes.filter(n=>n.role==='Repeater'):[];}
  if(typeof module!=='undefined'){module.exports={groups,selected};return;}
  const el=id=>document.getElementById(id);
  let markers=[],activeMap=null,redraw=null;
  const directories=[{prefix:'public-mesh',label:'MeshCore',endpoint:'/api/mesh/public',age:30},{prefix:'public-meshtastic',label:'Meshtastic',endpoint:'/api/mesh/public/meshtastic',age:7},{prefix:'public-reticulum',label:'Reticulum',endpoint:'/api/mesh/public/reticulum',age:7}].map(d=>({...d,snapshot:{nodes:[],state:'empty'},busy:false}));
  const enabled=()=>directories.flatMap(d=>selected(d.snapshot.nodes,el(d.prefix+'-nodes')?.checked,el(d.prefix+'-repeaters')?.checked).map(n=>({...n,network:d.label})));
  const network=g=>new Set(g.nodes.map(n=>n.network)).size===1?g.nodes[0].network:'Mixed';
  function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
  function close(){const p=el('public-mesh-detail');if(p){p.hidden=true;p.replaceChildren();}}
  function details(g){
    window.OpenRFMapFeatureInfo?.close();const p=el('public-mesh-detail');if(!p)return;
    const title=text('strong',g.nodes.length===1?`Public ${network(g)} node`:`${g.nodes.length} public ${network(g)==='Mixed'?'mesh':network(g)} nodes in this map cluster`);
    const dismiss=text('button','');dismiss.type='button';dismiss.className='map-sheet-close';dismiss.setAttribute('aria-label','Close public mesh node details');dismiss.title='Close details';dismiss.addEventListener('click',close);
    const head=text('div','');head.className='public-mesh-detail-head';head.append(title,dismiss);
    const body=text('div','');body.className='public-mesh-detail-body';body.append(text('p','Public directory snapshots · reported positions, not verified reachability. Meshtastic and Reticulum positions are approximate.'));
    p.replaceChildren(head,body);
    for(const n of g.nodes.slice(0,30)){
      const d=text('div','');d.className='public-mesh-node-detail';
      d.append(text('strong',n.name),text('p',`${n.network} · ${n.reported_role||n.role} · ${n.lat}, ${n.lon}`),text('p',`Directory updated: ${n.updated||'Unavailable'} · source: ${n.source||'Unavailable'}`),text('p',`Identifier: ${n.id}`));body.append(d);
    }
    if(g.nodes.length>30)body.append(text('p','Zoom in to inspect the remaining nodes.'));
    p.hidden=false;
  }
  function marker(g,raster=false){
    const b=text('button',g.nodes.length>1?String(g.nodes.length):g.nodes[0].network==='Reticulum'?(g.nodes[0].role==='Repeater'?'R+':'R'):g.nodes[0].network==='Meshtastic'?(g.nodes[0].role==='Repeater'?'M+':'M'):(g.nodes[0].role==='Repeater'?'P+':'P'));
    b.type='button';b.className='public-mesh-pin'+(raster?' public-mesh-raster-pin':'');
    b.dataset.network=network(g);b.dataset.kind=g.nodes.length>1?'cluster':g.nodes[0].role==='Repeater'?'repeater':'node';
    b.title=g.nodes.length>1?`${g.nodes.length} public directory nodes`:g.nodes[0].name+' · public '+g.nodes[0].network+' directory';b.setAttribute('aria-label',b.title);
    b.addEventListener('click',e=>{e.stopPropagation();details(g);});return b;
  }
  function clearMarkers(){for(const m of markers)m.remove();markers=[];}
  function drawVector(){
    clearMarkers();const map=activeMap;if(!map||!window.maplibregl?.Marker)return;
    const canvas=map.getCanvas();const w=canvas.clientWidth,h=canvas.clientHeight;
    const center=map.getCenter().lng;
    for(const g of groups(enabled(),n=>map.project([n.lon+360*Math.round((center-n.lon)/360),n.lat]),w,h)){
      markers.push(new window.maplibregl.Marker({element:marker(g)}).setLngLat(map.unproject([g.x,g.y])).addTo(map));
    }
  }
  function vector(map,force=false){
    if(map!==activeMap){
      if(activeMap){activeMap.off('moveend',drawVector);activeMap.off('resize',drawVector);activeMap.off('remove',removed);}
      clearMarkers();activeMap=map;
      if(map){map.on('moveend',drawVector);map.on('resize',drawVector);map.on('remove',removed);}
      drawVector();
    }else if(force)drawVector();
  }
  function removed(){vector(null);}
  function raster(parent,r,w,h,project){
    const c=project(r.center[0],r.center[1],r.zoom),size=256*2**r.zoom;
    for(const g of groups(enabled(),n=>{const p=project(n.lon,n.lat,r.zoom);return {x:w/2+((p[0]-c[0]+size*1.5)%size)-size/2,y:h/2+p[1]-c[1]};},w,h)){
      const b=marker(g,true);b.style.left=`${g.x}px`;b.style.top=`${g.y}px`;parent.append(b);
    }
  }
  function status(d,error=''){
    const {snapshot,busy}=d;const s=el(d.prefix+'-status');if(!s)return;
    let msg=snapshot.state==='cached'?`${snapshot.cached_count.toLocaleString()} mapped public nodes · ${snapshot.rejected||0} rejected · ${snapshot.duplicates||0} duplicate records · downloaded ${new Date(snapshot.downloaded_at*1000).toLocaleString()}.`:
      snapshot.state==='expired'?`Cache expired (${d.age} days); refresh to show nodes.`:snapshot.state==='unavailable'?'Local public directory cache unavailable.':'No public directory downloaded yet.';
    if(snapshot.state==='cached'&&snapshot.unmapped)msg+=` ${snapshot.unmapped.toLocaleString()} inferred or missing positions omitted.`;if(busy)msg+=' Working…';if(error)msg+=' '+error;s.textContent=msg;
  }
  function progressView(d,data){
    const bar=el(d.prefix+'-progress'),wrap=el(d.prefix+'-progress-wrap'),label=el(d.prefix+'-progress-text');
    const phase=data.phase, received=data.received_bytes||0,total=data.total_bytes;
    const mib=n=>(n/1048576).toFixed(1)+' MiB';
    wrap.hidden=false;bar.hidden=false;bar.removeAttribute('value');
    if(phase==='failed'){bar.value=0;bar.hidden=true;label.textContent=data.error||'Download failed';return;}
    if(phase==='downloading'){
      if(total>0){bar.value=Math.min(100,100*received/total);label.textContent=`Downloading ${mib(received)} / ${mib(total)} · ${Math.floor(bar.value)}%`;}
      else label.textContent=`Downloading ${mib(received)} · total size unknown`;
    }else{
      label.textContent=({connecting:`Connecting to ${d.label}…`,parsing:'Reading downloaded JSON…',processing:'Validating node records…',saving:'Saving offline directory…',complete:'Download complete',failed:data.error||'Download failed',idle:'Connecting…'})[phase]||'Working…';
      if(phase==='complete')bar.value=100;
    }
  }
  async function request(d,action){
    if(d.busy)return;d.busy=true;status(d);for(const suffix of ['download','clear'])el(d.prefix+'-'+suffix).disabled=true;
    let error='',poll=null,finished=false;
    if(action==='refresh'){
      progressView(d,{phase:'connecting'});
      const update=async()=>{try{const res=await fetch(d.endpoint+'/status',{cache:'no-store'});if(res.ok){const data=await res.json();if(!finished)progressView(d,data);}}catch(_){}finally{if(!finished)poll=setTimeout(update,500);}};
      poll=setTimeout(update,300);
    }
    try{
      const res=await fetch(d.endpoint+(action?'/'+action:''),action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})}:{cache:'no-store'});
      const data=await res.json();if(!res.ok)throw Error(data.error||'HTTP '+res.status);d.snapshot=data;
      if(action==='refresh'){el(d.prefix+'-nodes').checked=true;window.OpenRFMapLayerPreferences?.save?.();progressView(d,{phase:'complete'});el(d.prefix+'-progress-wrap').hidden=true;}
      if(action==='clear')el(d.prefix+'-progress-wrap').hidden=true;
      close();redraw?.();
    }catch(e){error='Directory request failed: '+e.message;if(action==='refresh')progressView(d,{phase:'failed',error:e.message});}
    finally{finished=true;clearTimeout(poll);d.busy=false;for(const suffix of ['download','clear'])el(d.prefix+'-'+suffix).disabled=false;status(d,error);}
  }
  window.OpenRFPublicMesh={vector,raster,close,set redraw(fn){redraw=fn;}};
  document.addEventListener('DOMContentLoaded',()=>{
    for(const d of directories){
      if(!el(d.prefix+'-nodes'))continue;
      for(const suffix of ['nodes','repeaters'])el(d.prefix+'-'+suffix).addEventListener('change',()=>{window.OpenRFMapLayerPreferences?.save?.();close();redraw?.();});
      el(d.prefix+'-download').addEventListener('click',()=>request(d,'refresh'));
      el(d.prefix+'-clear').addEventListener('click',()=>{if(window.confirm(`Delete the downloaded public ${d.label} snapshot? Local radio data is unaffected.`))request(d,'clear');});
      request(d);
    }
  });
})();
