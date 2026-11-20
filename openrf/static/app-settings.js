/* OpenRF v0.2.149 — standalone, read-only device settings and field preflight. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if(!$('page-settings'))return;
  const IEC=1024;
  const bytes=value=>{
    if(!Number.isSafeInteger(value)||value<0)return '—';
    if(value<IEC)return `${value} B`;
    // Use successive divisions; no invented decimal capacity.
    const labels=['KiB','MiB','GiB','TiB'];
    let amount=value/IEC,index=0;
    while(amount>=IEC && index<labels.length-1){amount/=IEC;index++;}
    return `${amount.toFixed(1)} ${labels[index]}`;
  };
  const request=async path=>{
    const response=await fetch(path,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw Error(`Local check failed (${response.status})`);
    return response.json();
  };
  function storageReading(payload){
    const d=payload?.storage;
    if(payload?.read_only!==true || payload?.scope!=='filesystem-containing-openrf-data' || d?.state!=='OS_REPORTED')return null;
    const total=d.total_bytes,free=d.free_bytes;
    if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(free)||free<0||free>total)return null;
    const used=total-free,percent=100*used/total;
    return {total,free,used,percent,warning:free<1073741824 || free/total<0.1};
  }
  function renderStorage(payload){
    const reading=storageReading(payload);
    $('app-storage-free').textContent=reading?bytes(reading.free):'—';
    $('app-storage-used').textContent=reading?bytes(reading.used):'—';
    $('app-storage-total').textContent=reading?bytes(reading.total):'—';
    const gauge=$('app-storage-track'),pill=$('app-storage-status-pill');
    $('app-storage-fill').style.width=reading?`${Math.min(100,Math.max(0,reading.percent)).toFixed(1)}%`:'0%';
    if(reading){
      gauge.setAttribute('aria-valuenow',reading.percent.toFixed(1));
      gauge.setAttribute('aria-valuetext',`${bytes(reading.used)} used of ${bytes(reading.total)}`);
      pill.textContent=reading.warning?'LOW SPACE':'LINUX REPORTED';
      pill.dataset.level=reading.warning?'warning':'reported';
      $('app-storage-detail').textContent=`${bytes(reading.free)} available (${(100-reading.percent).toFixed(1)}% free). ${reading.warning?'Low disk space; consider freeing space before saving large maps or recordings. ':''}This is the filesystem holding OpenRF data, not an inventory of every disk or an estimate of how much OpenRF itself uses.`;
    }else{
      gauge.removeAttribute('aria-valuenow');gauge.setAttribute('aria-valuetext','Storage reading unavailable');
      pill.textContent='UNAVAILABLE';pill.dataset.level='unknown';
      $('app-storage-detail').textContent='Linux did not provide a usable filesystem capacity for OpenRF local data. No storage size was estimated.';
    }
    return reading;
  }
  let storageBusy=false,fieldBusy=false;
  async function refreshStorage(){
    if(storageBusy)return;
    storageBusy=true;$('app-storage-refresh').disabled=true;
    try{renderStorage(await request('/api/device/storage'));}
    catch(err){renderStorage(null);$('app-storage-detail').textContent=`Unable to read local device storage: ${err.message}`;}
    finally{storageBusy=false;$('app-storage-refresh').disabled=false;}
  }
  const item=(label,state,note)=>{
    const node=document.createElement('div');node.className='app-field-row';node.dataset.level=state;
    node.setAttribute('role','listitem');
    const title=document.createElement('strong');title.textContent=label;
    const status=document.createElement('span');status.className='app-field-state';
    status.textContent=state==='reported'?'REPORTED':state==='attention'?'NEEDS ATTENTION':'NOT VERIFIED';
    const detail=document.createElement('p');detail.textContent=note;
    node.append(title,status,detail);return node;
  };
  const validCount=value=>Number.isSafeInteger(value)&&value>=0;
  function batteryState(payload){
    const battery=payload?.battery?.batteries;
    if(!Array.isArray(battery)||battery.length!==1)return ['unknown','No single Linux battery capacity reported. WSL may omit the gauge; Raspberry Pi UPS support needs its own driver.'];
    const value=battery[0].capacity_percent;
    if(!Number.isInteger(value)||value<0||value>100)return ['unknown','A battery was reported without a valid percentage. No charge or runtime was estimated.'];
    return [value<=20?'attention':'reported',`${value}% reported by Linux (${battery[0].status||'status unknown'}). Remaining runtime and safe shutdown are unverified.`];
  }
  async function checkField(){
    if(fieldBusy)return;fieldBusy=true;$('app-field-check').disabled=true;
    $('app-field-status').textContent='Checking local readiness only. No GPS fix or external service request…';
    const services=['/api/navigation/offline-readiness','/api/device/power','/api/device/storage','/api/terrain/tiles'];
    try{
      const results=await Promise.allSettled(services.map(request));
      const [route,power,storage,terrain]=results.map(result=>result.status==='fulfilled'?result.value:null);
      const output=$('app-field-results');output.replaceChildren();
      if(route?.kind==='OFFLINE_NAVIGATION_PREFLIGHT' && route?.read_only===true && route?.external_requests===false){
        output.append(item('Road routing',route.routing_service_reachable?'reported':'attention',
          route.routing_service_reachable?'Local Valhalla responds; the route between your actual start and destination has not been verified.':'Local Valhalla is unavailable. Offline walking/driving directions are not ready.'));
        const rasters=route.local_raster_package_count;
        const hasLocalMap=route.local_vector_basemap_ready===true || (validCount(rasters)&&rasters>0);
        output.append(item('Offline map',hasLocalMap?'reported':'attention',
          hasLocalMap?`Local vectors: ${route.local_vector_basemap_ready===true?'installed':'not reported'}; raster packages: ${validCount(rasters)?rasters:'unknown'}. Map coverage for this trip is not verified.`:'No complete local vector map or raster package was reported. Internet-free map visuals may be unavailable.'));
      }else{
        output.append(item('Road routing','unknown','Local routing status could not be verified.'));
        output.append(item('Offline map','unknown','Local map package status could not be verified.'));
      }
      const localHgt=terrain?.tiles;
      output.append(item('Terrain elevation',Array.isArray(localHgt)?'reported':'unknown',
        Array.isArray(localHgt)?`${localHgt.length} imported HGT tile(s). Terrain heights are optional; coverage, source and datum are not verified.`:'Local HGT inventory unavailable.'));
      const [batteryLevel,batteryDetail]=batteryState(power);
      output.append(item('Battery',batteryLevel,batteryDetail));
      const disk=storageReading(storage);
      output.append(item('Storage',!disk?'unknown':disk.warning?'attention':'reported',
        disk?`${bytes(disk.free)} free of ${bytes(disk.total)} on the filesystem holding OpenRF data${disk.warning?' — low space.':'.'}`:'Usable Linux storage figures were not reported.'));
      output.append(item('GPS / route coverage','unknown','Not checked. Real GPS requires explicit navigation/recording consent; a location fix and valid local route are still needed.'));
      $('app-field-status').textContent='Local preflight complete. Green/reported items do not certify a field-ready trip; location, route coverage and hardware still need real checks.';
    }catch(err){
      $('app-field-results').replaceChildren();
      $('app-field-status').textContent=`Readiness check unavailable: ${err.message}. No GPS or radio operation started.`;
    }finally{fieldBusy=false;$('app-field-check').disabled=false;}
  }
  $('app-storage-refresh').addEventListener('click',refreshStorage);
  $('app-field-check').addEventListener('click',checkField);
  document.addEventListener('openrf:settings-shown',refreshStorage);
  if($('page-settings').classList.contains('active'))refreshStorage();
  window.OpenRFAppSettings=Object.freeze({refreshStorage,checkField,renderStorage});
})();
