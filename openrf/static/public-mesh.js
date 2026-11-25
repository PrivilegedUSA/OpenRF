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
  let snapshot={nodes:[],state:'empty'},busy=false,markers=[],activeMap=null,redraw=null;
  const enabled=()=>selected(snapshot.nodes,el('public-mesh-nodes')?.checked,el('public-mesh-repeaters')?.checked);
  function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
  function close(){const p=el('public-mesh-detail');if(p){p.hidden=true;p.replaceChildren();}}
  function details(g){
    window.OpenRFMapFeatureInfo?.close();const p=el('public-mesh-detail');if(!p)return;
    const title=text('strong',g.nodes.length===1?'Public MeshCore node':`${g.nodes.length} public MeshCore nodes in this map cluster`);
    const dismiss=text('button','');dismiss.type='button';dismiss.className='map-sheet-close';dismiss.setAttribute('aria-label','Close public mesh node details');dismiss.title='Close details';dismiss.addEventListener('click',close);
    const head=text('div','');head.className='public-mesh-detail-head';head.append(title,dismiss);
    const body=text('div','');body.className='public-mesh-detail-body';body.append(text('p','Official MeshCore Map · published locations, not verified reachability.'));
    p.replaceChildren(head,body);
    for(const n of g.nodes.slice(0,30)){
      const d=text('div','');d.className='public-mesh-node-detail';
      d.append(text('strong',n.name),text('p',`${n.role} · ${n.lat}, ${n.lon}`),text('p',`Directory updated: ${n.updated||'Unavailable'} · source: ${n.source||'Unavailable'}`),text('p',`Identifier: ${n.id}`));body.append(d);
    }
    if(g.nodes.length>30)body.append(text('p','Zoom in to inspect the remaining nodes.'));
    p.hidden=false;
  }
  function marker(g,raster=false){
    const b=text('button',g.nodes.length>1?String(g.nodes.length):g.nodes[0].role==='Repeater'?'P+':'P');
    b.type='button';b.className='public-mesh-pin'+(raster?' public-mesh-raster-pin':'');
    b.dataset.kind=g.nodes.length>1?'cluster':g.nodes[0].role==='Repeater'?'repeater':'node';
    b.title=g.nodes.length>1?`${g.nodes.length} public directory nodes`:g.nodes[0].name+' · public MeshCore directory';b.setAttribute('aria-label',b.title);
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
  function status(error=''){
    const s=el('public-mesh-status');if(!s)return;
    let msg=snapshot.state==='cached'?`${snapshot.cached_count.toLocaleString()} mapped public nodes · ${snapshot.rejected||0} rejected · ${snapshot.duplicates||0} duplicate records · downloaded ${new Date(snapshot.downloaded_at*1000).toLocaleString()}.`:
      snapshot.state==='expired'?'Cache expired (30 days); refresh to show nodes.':snapshot.state==='unavailable'?'Local public directory cache unavailable.':'No public directory downloaded yet.';
    if(busy)msg+=' Working…';if(error)msg+=' '+error;s.textContent=msg;
  }
  function progressView(data){
    const bar=el('public-mesh-progress'),wrap=el('public-mesh-progress-wrap'),label=el('public-mesh-progress-text');
    const phase=data.phase, received=data.received_bytes||0,total=data.total_bytes;
    const mib=n=>(n/1048576).toFixed(1)+' MiB';
    wrap.hidden=false;bar.hidden=false;bar.removeAttribute('value');
    if(phase==='failed'){bar.value=0;bar.hidden=true;label.textContent=data.error||'Download failed';return;}
    if(phase==='downloading'){
      if(total>0){bar.value=Math.min(100,100*received/total);label.textContent=`Downloading ${mib(received)} / ${mib(total)} · ${Math.floor(bar.value)}%`;}
      else label.textContent=`Downloading ${mib(received)} · total size unknown`;
    }else{
      label.textContent=({connecting:'Connecting to MeshCore…',parsing:'Reading downloaded JSON…',processing:'Validating node records…',saving:'Saving offline directory…',complete:'Download complete',failed:data.error||'Download failed',idle:'Connecting…'})[phase]||'Working…';
      if(phase==='complete')bar.value=100;
    }
  }
  async function request(action){
    if(busy)return;busy=true;status();for(const id of ['public-mesh-download','public-mesh-clear'])el(id).disabled=true;
    let error='',poll=null,finished=false;
    if(action==='refresh'){
      progressView({phase:'connecting'});
      const update=async()=>{try{const res=await fetch('/api/mesh/public/status',{cache:'no-store'});if(res.ok){const data=await res.json();if(!finished)progressView(data);}}catch(_){}finally{if(!finished)poll=setTimeout(update,500);}};
      poll=setTimeout(update,300);
    }
    try{
      const res=await fetch('/api/mesh/public'+(action?'/'+action:''),action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})}:{cache:'no-store'});
      const data=await res.json();if(!res.ok)throw Error(data.error||'HTTP '+res.status);snapshot=data;
      if(action==='refresh'){el('public-mesh-nodes').checked=true;progressView({phase:'complete'});}
      if(action==='clear')el('public-mesh-progress-wrap').hidden=true;
      close();redraw?.();
    }catch(e){error='Directory request failed: '+e.message;if(action==='refresh')progressView({phase:'failed',error:e.message});}
    finally{finished=true;clearTimeout(poll);busy=false;for(const id of ['public-mesh-download','public-mesh-clear'])el(id).disabled=false;status(error);}
  }
  window.OpenRFPublicMesh={vector,raster,close,set redraw(fn){redraw=fn;}};
  document.addEventListener('DOMContentLoaded',()=>{
    for(const id of ['public-mesh-nodes','public-mesh-repeaters'])el(id).addEventListener('change',()=>{close();redraw?.();});
    el('public-mesh-download').addEventListener('click',()=>request('refresh'));
    el('public-mesh-clear').addEventListener('click',()=>{if(window.confirm('Delete the downloaded public MeshCore snapshot? Local radio data is unaffected.'))request('clear');});
    request();
  });
})();
