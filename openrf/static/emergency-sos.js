'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const labels={NEED_HELP:'I need assistance.',SAFE:'I am safe.',EVACUATING:'I am evacuating.',CHECK_IN:'Checking in. Please reply when you can.'};
  let position=null;
  let requestToken=0;
  let saving=false;
  function validatedPosition(raw){
    const coords=raw?.coords||{};
    const {latitude,longitude,accuracy}=coords;
    const fixTime=Number(raw?.timestamp);
    const age=(Date.now()-fixTime)/1000;
    if(![latitude,longitude,accuracy,fixTime,age].every(Number.isFinite) ||
       latitude< -90||latitude>90||longitude< -180||longitude>180||
       accuracy<0||accuracy>1000000||age< -5||age>60)throw Error('Browser location is invalid or older than 60 seconds. Request a new fix.');
    return {latitude,longitude,accuracy_m:accuracy,fixTime};
  }
  function currentLocation(){
    if(!position)return null;
    const age=(Date.now()-position.fixTime)/1000;
    if(!Number.isFinite(age)||age< -5||age>60)return null;
    return {latitude:position.latitude,longitude:position.longitude,accuracy_m:position.accuracy_m,age_seconds:Math.max(0,age)};
  }
  function preview(){
    const type=$('emergency-sos-template').value;
    const recipient=$('emergency-sos-recipient').value.trim()||'Unspecified recipient';
    const details=$('emergency-sos-message').value.trim();
    const fix=currentLocation();
    if(position&&!fix)$('emergency-sos-location').textContent='Previous fix is stale. Get a fresh location before attaching coordinates.';
    const lines=[`UNSENT EMERGENCY DRAFT — ${type.replace('_',' ')}`,`For: ${recipient}`,labels[type]||''];
    if(details)lines.push(details);
    if(fix){
      lines.push(`Browser-reported location (NOT independently verified): ${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`);
      lines.push(`Browser accuracy ±${fix.accuracy_m.toFixed(0)} m; fix age at drafting ${fix.age_seconds.toFixed(0)} s.`);
    }else lines.push('No location attached.');
    lines.push('LOCAL DRAFT ONLY. NOT TRANSMITTED. Delivery NOT attempted.');
    $('emergency-sos-preview').value=lines.join('\n');
  }
  for(const id of ['emergency-sos-template','emergency-sos-recipient','emergency-sos-message']){
    $(id).addEventListener('input',preview);$(id).addEventListener('change',preview);
  }
  $('emergency-sos-locate').addEventListener('click',()=>{
    if(!navigator.geolocation){$('emergency-sos-location').textContent='Browser geolocation is not supported.';return;}
    const token=++requestToken;
    $('emergency-sos-location').textContent='Requesting a fresh browser fix. Permission may be required…';
    navigator.geolocation.getCurrentPosition(raw=>{
      if(token!==requestToken)return;
      try{
        position=validatedPosition(raw);
        $('emergency-sos-location').textContent=`Browser reported ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)} (±${position.accuracy_m.toFixed(0)} m). This is not independently verified.`;
      }catch(e){position=null;$('emergency-sos-location').textContent=e.message;}
      preview();
    },err=>{if(token!==requestToken)return;position=null;
      $('emergency-sos-location').textContent=`No browser fix attached: ${err.message||'permission denied or timed out'}`;preview();},
    {enableHighAccuracy:true,maximumAge:0,timeout:12000});
  });
  $('emergency-sos-clear').addEventListener('click',()=>{requestToken++;position=null;
    $('emergency-sos-location').textContent='No browser location attached.';preview();});
  $('emergency-sos-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;preview();
    const prepareRadio=event.submitter?.id==='emergency-sos-prepare-radio';
    if(position&&!currentLocation()){
      $('emergency-sos-status').textContent='Your location fix expired. Refresh it or remove the location before saving.';return;
    }
    if(!confirm(prepareRadio?
      'Save this as a LOCAL draft, then open radio handoff? Nothing will transmit until you choose a recipient and explicitly confirm a radio send. This does NOT contact 911.':
      'Save this message as a LOCAL, UNSENT draft? No emergency service or contact will receive it.'))return;
    const payload={template:$('emergency-sos-template').value,recipient:$('emergency-sos-recipient').value,
                   message:$('emergency-sos-message').value,location:currentLocation()};
    saving=true;
    $('emergency-sos-save').disabled=true;
    $('emergency-sos-prepare-radio').disabled=true;
    let savedDraftId=null;
    try{
      const response=await fetch('/api/emergency/sos/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Save failed');
      savedDraftId=data.record.id;
      $('emergency-sos-status').textContent=`Saved local draft #${savedDraftId}. NOT transmitted.`;
      if(prepareRadio){
        if(!window.OpenRFEmergencyHandoff?.selectDraft || !window.OpenRFEmergencyTabs?.open){
          $('emergency-sos-status').textContent+=' Radio handoff could not be opened; select the draft under Radio & Messages.';
        }else{
          await window.OpenRFEmergencyHandoff.selectDraft(data.record.id);
          window.OpenRFEmergencyTabs.open('radio');
          $('emergency-handoff-status').textContent=`Draft #${data.record.id} selected. Enter a specific radio recipient, review the text and manually confirm send. Nothing has transmitted.`;
          $('emergency-handoff-destination').focus({preventScroll:true});
          // This explicit action should reveal the send form; ordinary tab
          // switching still preserves the user's scroll position.
          $('emergency-handoff-form').scrollIntoView({block:'center',behavior:'auto'});
        }
      }
      document.dispatchEvent(new Event('openrf:emergency-shown'));
    }catch(e){$('emergency-sos-status').textContent=savedDraftId===null?
      `SOS draft save failed: ${e.message}`:
      `Saved local draft #${savedDraftId}. NOT transmitted. Radio handoff could not be opened: ${e.message}. Select this draft under Radio & Messages.`;}
    finally{saving=false;$('emergency-sos-save').disabled=false;$('emergency-sos-prepare-radio').disabled=false;}
  });
  document.addEventListener('openrf:emergency-shown',preview);
  preview();
})();
