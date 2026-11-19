'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let fix=null,sequence=0,checkins=[],markers=[];
  async function api(path,method='GET',data){
    const res=await fetch(path,{method,headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    const result=await res.json();if(!res.ok)throw Error(result.error||`HTTP ${res.status}`);return result;
  }
  function currentFix(){
    if(!fix)return null;
    const age=(Date.now()-fix.timestamp)/1000;
    if(!Number.isFinite(age)||age<0||age>60)return null;
    return {latitude:fix.lat,longitude:fix.lon,accuracy_m:fix.accuracy,age_seconds:age};
  }
  function sourceChanged(){
    const own=$('emergency-checkin-source').value==='SELF_REPORTED';
    $('emergency-checkin-locate').disabled=!own;
    if(!own){sequence++;fix=null;$('emergency-checkin-location').textContent='Secondhand report: no browser GPS location can be attached.';}
    else $('emergency-checkin-location').textContent=fix?'Browser location attached; refresh if over 60 seconds old.':'No location attached.';
  }
  function draw(){
    const board=$('emergency-checkin-board');board.replaceChildren();
    if(!checkins.length){board.textContent='No local check-ins yet.';return;}
    const latest=new Set();
    for(const item of checkins){
      const card=document.createElement('article');card.className='emergency-record';
      const headline=document.createElement('strong');headline.textContent=`${item.person}: ${item.status.replaceAll('_',' ')}`;card.append(headline);
      const detail=document.createElement('p');detail.className='muted small';
      const age=Math.max(0,Date.now()-Date.parse(item.recorded_utc));
      detail.textContent=`Recorded ${item.recorded_utc} · ${item.source.replaceAll('_',' ')} · ${Math.floor(age/60000)} min old${item.latitude===null?' · no location':` · browser-reported ${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)} ±${item.accuracy_m.toFixed(0)} m`}`;
      card.append(detail);
      if(item.note){const note=document.createElement('p');note.textContent=item.note;card.append(note);}
      if(!latest.has(item.person)){const tag=document.createElement('small');tag.textContent='Latest saved report for this label';card.append(tag);latest.add(item.person);}
      const remove=document.createElement('button');remove.type='button';remove.className='btn ghost';remove.textContent='Delete local report';
      remove.addEventListener('click',async()=>{if(!confirm('Delete this locally saved check-in?'))return;
        try{await api(`/api/emergency/checkins/${item.id}`,'DELETE');removeMarkers();await refresh();}
        catch(e){$('emergency-checkin-message').textContent=e.message;}});card.append(remove);board.append(card);
    }
  }
  async function refresh(){
    try{checkins=(await api('/api/emergency/checkins')).checkins;draw();}
    catch(e){$('emergency-checkin-message').textContent=e.message;}
  }
  $('emergency-checkin-source').addEventListener('change',sourceChanged);
  $('emergency-checkin-locate').addEventListener('click',()=>{
    if(!navigator.geolocation){$('emergency-checkin-location').textContent='Browser location not available.';return;}
    const token=++sequence;$('emergency-checkin-location').textContent='Requesting fresh browser location…';
    navigator.geolocation.getCurrentPosition(position=>{
      if(token!==sequence||$('emergency-checkin-source').value!=='SELF_REPORTED')return;
      const c=position.coords||{},age=(Date.now()-position.timestamp)/1000;
      if(![c.latitude,c.longitude,c.accuracy,age].every(Number.isFinite)||c.latitude< -90||c.latitude>90||c.longitude< -180||c.longitude>180||c.accuracy<0||c.accuracy>1000000||age<0||age>60){
        fix=null;$('emergency-checkin-location').textContent='Invalid or stale fix; please retry.';return;
      }
      fix={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,timestamp:position.timestamp};
      $('emergency-checkin-location').textContent=`Browser-reported ${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)} ±${fix.accuracy.toFixed(0)} m (unverified)`;
    },err=>{if(token!==sequence)return;fix=null;$('emergency-checkin-location').textContent=`No location: ${err.message||'permission/timeout'}`;},
    {enableHighAccuracy:true,maximumAge:0,timeout:12000});
  });
  $('emergency-checkin-clear').addEventListener('click',()=>{sequence++;fix=null;$('emergency-checkin-location').textContent='No location attached.';});
  $('emergency-checkin-form').addEventListener('submit',async event=>{
    event.preventDefault();const own=$('emergency-checkin-source').value==='SELF_REPORTED';
    if(fix&&!currentFix()){$('emergency-checkin-message').textContent='Location is stale. Refresh or remove it before saving.';return;}
    const payload={person:$('emergency-checkin-person').value,status:$('emergency-checkin-status').value,
      note:$('emergency-checkin-note').value,source:$('emergency-checkin-source').value,location:own?currentFix():null};
    try{
      await api('/api/emergency/checkins','POST',payload);
      let message='Check-in saved locally. Not transmitted.';
      if($('emergency-checkin-draft').checked){
        const response=await api('/api/emergency/sos/draft','POST',{template:payload.status,recipient:'Team check-in',
          message:`${payload.person}: ${payload.note}`.slice(0,600),location:payload.location});
        message+=` Unsent message draft #${response.record.id} prepared.`;
      }
      $('emergency-checkin-message').textContent=message;
      $('emergency-checkin-note').value='';fix=null;$('emergency-checkin-location').textContent='No location attached.';
      await refresh();document.dispatchEvent(new Event('openrf:emergency-shown'));
    }catch(e){$('emergency-checkin-message').textContent=e.message;}
  });
  function removeMarkers(){for(const marker of markers)marker.remove();markers=[];}
  function showMap(){
    removeMarkers();const map=window.OpenRFMapReadOnly?.();
    if(!map||typeof maplibregl==='undefined'){$('emergency-checkin-message').textContent='MapLibre map not ready; open the map and retry.';return;}
    const seen=new Set();let total=0;
    for(const item of checkins){
      if(seen.has(item.person)||total>=20)continue;
      seen.add(item.person);
      if(item.latitude===null)continue;
      total++;
      const node=document.createElement('div');node.className='emergency-checkin-pin';node.textContent='!';
      const details=document.createElement('div');
      details.textContent=`Reported ${item.person}: ${item.status}. Saved ${item.recorded_utc}. Browser-reported, NOT LIVE; accuracy ±${item.accuracy_m} m.`;
      const marker=new maplibregl.Marker({element:node}).setLngLat([item.longitude,item.latitude])
        .setPopup(new maplibregl.Popup().setDOMContent(details)).addTo(map);
      markers.push(marker);
    }
    $('emergency-checkin-message').textContent=`Showing ${total} latest browser-reported location pins on map (not live).`;
  }
  $('emergency-checkin-map').addEventListener('click',()=>{
    document.dispatchEvent(new Event('openrf:checkin-map-requested'));
    setTimeout(showMap,250);
  });
  $('emergency-checkin-export').addEventListener('click',()=>{
    if(!confirm('Export saved reported coordinates and person labels as GeoJSON? Sharing this file could reveal sensitive locations.'))return;
    const a=document.createElement('a');a.href='/api/emergency/checkins.geojson';
    a.download='openrf-reported-checkins.geojson';document.body.append(a);a.click();a.remove();
  });
  document.addEventListener('openrf:emergency-shown',refresh);
  document.addEventListener('openrf:checkins-cleared',removeMarkers);
  sourceChanged();
})();
