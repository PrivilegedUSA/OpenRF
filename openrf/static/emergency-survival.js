'use strict';
(() => {
  const $=id=>document.getElementById(id);
  async function api(path,method='GET',body){
    const response=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
  }
  function tile(parent,title,value,note){
    const card=document.createElement('div');card.className='emergency-ops-stat';
    const heading=document.createElement('strong');heading.textContent=value;
    const label=document.createElement('span');label.textContent=title;
    const detail=document.createElement('small');detail.textContent=note;
    card.append(heading,label,detail);parent.append(card);
  }
  async function refresh(){
    $('emergency-survival-refresh').disabled=true;
    try{
      const [diagnostics,preflight]=await Promise.all([api('/api/emergency/device-readiness'),api('/api/emergency/preflight')]);
      const container=$('emergency-survival-readings');container.replaceChildren();
      const batteries=diagnostics.battery.batteries;
      tile(container,'Linux battery',batteries.length?batteries.map(b=>b.capacity_percent===null?'UNKNOWN':b.capacity_percent+'%').join(', '):'UNKNOWN',
        batteries.length?batteries.map(b=>`${b.name}: ${b.status}`).join('; '):'No battery gauge exposed to Linux/WSL');
      const sources=diagnostics.battery.external_power;
      tile(container,'External power',sources.length?sources.map(s=>s.online===true?'ONLINE':s.online===false?'OFFLINE':'UNKNOWN').join(', '):'UNKNOWN',
        sources.length?'Kernel-reported power supply only':'No external power state reported');
      const disk=diagnostics.storage;
      tile(container,'Disk available',disk.free_bytes===null?'UNKNOWN':(disk.free_bytes/1073741824).toFixed(1)+' GiB',
        disk.percent_free===null?'Not available':disk.percent_free+'% free (OS-reported)');
      tile(container,'Local database',diagnostics.database.quick_check,
        diagnostics.database.state+' · quick check is not a verified backup');
      $('emergency-survival-status').textContent=`Inspected ${diagnostics.collected_utc}. Runtime UNKNOWN; safe shutdown and low-power control NOT IMPLEMENTED. No radio hardware tested.`;
      const checks=$('emergency-survival-checks');checks.replaceChildren();
      for(const item of preflight.checks){
        const row=document.createElement('label');row.className='emergency-record emergency-survival-check';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=item.confirmed;
        const caption=document.createElement('span');caption.textContent=item.label;
        const stamp=document.createElement('small');stamp.className='muted';stamp.textContent=item.confirmed_utc?`Confirmed by operator: ${item.confirmed_utc}`:'Not yet confirmed';
        checkbox.addEventListener('change',async()=>{
          checkbox.disabled=true;
          try{const result=await api('/api/emergency/preflight','POST',{key:item.key,checked:checkbox.checked});
            stamp.textContent=result.confirmed_utc?`Confirmed by operator: ${result.confirmed_utc}`:'Not yet confirmed';}
          catch(error){checkbox.checked=!checkbox.checked;$('emergency-survival-status').textContent=error.message;}
          finally{checkbox.disabled=false;}
        });row.append(checkbox,caption,stamp);checks.append(row);
      }
    }catch(error){$('emergency-survival-status').textContent=`Device inspection unavailable: ${error.message}`;}
    finally{$('emergency-survival-refresh').disabled=false;}
  }
  $('emergency-survival-refresh').addEventListener('click',refresh);
  document.addEventListener('openrf:emergency-shown',refresh);
})();
