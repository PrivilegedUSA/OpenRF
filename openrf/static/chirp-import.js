'use strict';
/* Import local CHIRP channel lists only. No programming, CAT, PTT or capture. */
(() => {
  const get=id=>document.getElementById(id);
  if(!get('chirp-import-form'))return;
  const status=get('chirp-status'),list=get('chirp-profiles');
  let profiles=[];
  const setStatus=(msg,error=false)=>{status.textContent=msg;status.classList.toggle('error',error);};
  async function refreshProfiles(){
    try{
      const result=await fetch('/api/radio/profiles');
      const data=await result.json();if(!result.ok)throw Error(data.error||'Cannot load profiles');
      profiles=data.profiles||[];list.replaceChildren();
      if(!profiles.length){const p=document.createElement('p');p.className='small muted';p.textContent='No imported profiles yet.';list.append(p);return;}
      for(const profile of profiles){
        const details=document.createElement('details');details.className='chirp-profile';
        const summary=document.createElement('summary');summary.textContent=`${profile.name} · ${profile.model} · ${profile.channels.length} saved channels`;details.append(summary);
        const explanation=document.createElement('p');explanation.className='small muted';
        explanation.textContent='Stored CHIRP memories, not live tuning or a connected radio.';details.append(explanation);
        const rows=document.createElement('div');rows.className='chirp-channels';
        for(const channel of profile.channels){
          const row=document.createElement('div');row.className='chirp-channel-row';
          const desc=document.createElement('span');desc.textContent=`#${channel.location} ${channel.name||'(unnamed)'} · ${channel.frequency_mhz.toFixed(5)} MHz · ${channel.mode||'mode not set'}`;
          const tune=document.createElement('button');tune.type='button';tune.className='btn mini outline';tune.textContent='Copy to RTL-SDR tuner';
          tune.title='Fill the separate receive-only RTL-SDR frequency form; does not tune Baofeng';
          tune.addEventListener('click',()=>{get('radio-frequency').value=channel.frequency_mhz;get('radio-mode').value='nfm';
            setStatus(`Loaded ${channel.frequency_mhz.toFixed(5)} MHz into the RTL-SDR form only. Your Baofeng was not controlled.`);
            // Ham Radio now has its own page; reveal the receive-only tuner.
            document.querySelector('.nav-btn[data-page="radio"]')?.click();
            get('radio-frequency').focus({preventScroll:true});
          });
          row.append(desc,tune);rows.append(row);
        }
        details.append(rows);
        const del=document.createElement('button');del.type='button';del.className='btn mini danger-outline';del.textContent='Delete local profile';
        del.addEventListener('click',async()=>{
          if(!confirm(`Delete the local copy of ${profile.name}? Your radio is unaffected.`))return;
          try{const result=await fetch(`/api/radio/profiles/${profile.id}`,{method:'DELETE'});
            const data=await result.json();if(!result.ok)throw Error(data.error);await refreshProfiles();setStatus('Local profile deleted. Radio was not modified.');
          }catch(e){setStatus(`Could not delete profile: ${e.message}`,true);}
        });details.append(del);list.append(details);
      }
    }catch(e){setStatus(`Could not list radio profiles: ${e.message}`,true);}
  }
  get('chirp-import-form').addEventListener('submit',async event=>{
    event.preventDefault();const file=get('chirp-file').files?.[0],button=event.currentTarget.querySelector('[type=submit]');
    if(!file){setStatus('Choose a CHIRP CSV export first.',true);return;}
    if(file.size>262144){setStatus('CHIRP CSV is too large (maximum 256 KiB).',true);return;}
    button.disabled=true;
    try{
      const body={name:get('chirp-name').value,model:get('chirp-model').value,csv:await file.text()};
      const response=await fetch('/api/radio/profiles/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Import failed');
      await refreshProfiles();setStatus(`${data.profile.channel_count} CHIRP channels imported to private offline storage. No write to your Baofeng.`);
    }catch(e){setStatus(`Import failed: ${e.message}`,true);}
    finally{button.disabled=false;}
  });
  refreshProfiles();
})();
