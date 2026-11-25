'use strict';
(() => {
  // Screen-space groups bound DOM marker count on both renderers. No invented
  // RF links, locations or reachability. A group is a display bin, not a node.
  function groups(nodes,project,w,h,cell=48){
    const bins=new Map();
    for(const n of nodes){
      const p=project(n);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=w||p.y>=h)continue;
      const key=`${n.network||""}:${Math.floor(p.x/cell)}:${Math.floor(p.y/cell)}`;
      let g=bins.get(key);if(!g){g={x:0,y:0,nodes:[]};bins.set(key,g);}
      g.x+=p.x;g.y+=p.y;g.nodes.push(n);
    }
    return [...bins.values()].map(g=>({...g,x:g.x/g.nodes.length,y:g.y/g.nodes.length}));
  }
  // Network clusters retain independent membership. A compact multi-network
  // badge replaces overlapping pins at an existing anchor, never displaced pins.
  const networkOrder=['MeshCore','Meshtastic','Reticulum'];
  const shortName=n=>({MeshCore:'C',Meshtastic:'M',Reticulum:'R'})[n]||'?';
  function layout(nodes,project,w,h){
    const raw=groups(nodes,project,w,h,48).sort((a,b)=>a.x-b.x||a.y-b.y||networkOrder.indexOf(a.nodes[0].network)-networkOrder.indexOf(b.nodes[0].network));
    const used=new Map(),result=[],tile=56;
    // Use a fixed maximum badge footprint so widening a badge cannot hide a
    // nearby independent pin. Keep the first anchor rather than repelling pins.
    for(const g of raw){
      const i=Math.floor(g.x/tile),j=Math.floor(g.y/tile);let hit=null,best=Infinity;
      for(let x=i-1;x<=i+1;x++)for(let y=j-1;y<=j+1;y++)for(const q of used.get(`${x}:${y}`)||[]){
        const dx=Math.abs(g.x-q.x),dy=Math.abs(g.y-q.y),d=dx*dx+dy*dy;
        if(dx<50&&dy<29&&d<best){hit=q;best=d;}
      }
      if(hit){hit.parts.push(g);for(const n of g.nodes)hit.nodes.push(n);}
      else{const q={x:g.x,y:g.y,nodes:[...g.nodes],parts:[g]};result.push(q);const key=`${i}:${j}`;if(!used.has(key))used.set(key,[]);used.get(key).push(q);}
    }
    return result;
  }
  function selected(nodes,all,repeaters){return all?nodes:repeaters?nodes.filter(n=>n.role==='Repeater'):[];}
  if(typeof module!=='undefined'){module.exports={groups,selected,layout};return;}
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
    const body=text('div','');body.className='public-mesh-detail-body';body.append(text('p','Public directory snapshots · reported positions, not verified reachability. Meshtastic and Reticulum positions are approximate. An overlapping badge lists separate networks at a shared display anchor; individual reported coordinates are shown below.'));
    p.replaceChildren(head,body);
    const snap=n=>window.OpenRFMapFeatureInfo?.snapButton?.(n.lon,n.lat);
    if(g.nodes.length===1){const action=snap(g.nodes[0]);if(action)head.insertBefore(action,dismiss);}
    const nets=[...new Set(g.nodes.map(n=>n.network))].sort((a,b)=>networkOrder.indexOf(a)-networkOrder.indexOf(b));
    for(const net of nets){
      const nodes=g.nodes.filter(n=>n.network===net);
      if(nets.length>1){const heading=text('strong',`${net} · ${nodes.length} reported node${nodes.length===1?'':'s'}`);heading.className='public-mesh-detail-network';heading.dataset.network=net;body.append(heading);}
    for(const n of nodes.slice(0,30)){
      const d=text('div','');d.className='public-mesh-node-detail';
      d.append(text('strong',n.name),text('p',`${n.network} · ${n.reported_role||n.role} · ${n.lat}, ${n.lon}`),text('p',`Directory updated: ${n.updated||'Unavailable'} · source: ${n.source||'Unavailable'}`),text('p',`Identifier: ${n.id}`));if(g.nodes.length>1){const action=snap(n);if(action)d.append(action);}body.append(d);
    }
    if(nodes.length>30)body.append(text('p','Zoom in to inspect the remaining nodes in this network.'));
    }
    p.hidden=false;
  }
  function marker(g,raster=false){
    const net=network(g),mixed=net==='Mixed';
    const b=text('button',mixed?'':shortName(net));
    b.type='button';b.className='public-mesh-pin'+(raster?' public-mesh-raster-pin':'');
    if(g.nodes.length>1)b.dataset.count=g.nodes.length>99?'99+':String(g.nodes.length);
    b.dataset.network=net;b.dataset.kind=mixed?'overlap':g.nodes.length>1?'cluster':g.nodes[0].role==='Repeater'?'repeater':'node';
    if(mixed){
      const names=networkOrder.filter(n=>g.nodes.some(node=>node.network===n));
      for(const n of names){const dot=text('span',shortName(n));dot.className='public-mesh-overlap-dot';dot.dataset.network=n;b.append(dot);}
      b.title=names.map(n=>`${n}: ${g.nodes.filter(node=>node.network===n).length}`).join(' · ')+' · Select to inspect overlapping nodes';
    }else b.title=g.nodes.length>1?`${g.nodes.length} public ${net} directory nodes`:g.nodes[0].name+' · public '+net+' directory · '+(g.nodes[0].reported_role||g.nodes[0].role||'Unknown role');
    b.setAttribute('aria-label',b.title);
    b.addEventListener('click',e=>{e.stopPropagation();details(g);});return b;
  }
  function clearMarkers(){for(const m of markers)m.remove();markers=[];}
  function drawVector(){
    clearMarkers();const map=activeMap;if(!map||!window.maplibregl?.Marker)return;
    const canvas=map.getCanvas();const w=canvas.clientWidth,h=canvas.clientHeight;
    const center=map.getCenter().lng;
    for(const g of layout(enabled(),n=>map.project([n.lon+360*Math.round((center-n.lon)/360),n.lat]),w,h)){
      markers.push(new window.maplibregl.Marker({element:marker(g),offset:[0,0]}).setLngLat(map.unproject([g.x,g.y])).addTo(map));
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
    for(const g of layout(enabled(),n=>{const p=project(n.lon,n.lat,r.zoom);return {x:w/2+((p[0]-c[0]+size*1.5)%size)-size/2,y:h/2+p[1]-c[1]};},w,h)){
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
