'use strict';
/* v0.2.102: user-triggered ordinary Wi-Fi AP; NEVER activate on page load. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('field-hotspot-interface'))return;
  const adapter=el('field-hotspot-interface');
  const ssid=el('field-hotspot-ssid');
  const password=el('field-hotspot-passphrase');
  const start=el('field-hotspot-start');
  const stop=el('field-hotspot-stop');
  const refresh=el('field-hotspot-refresh');
  const generate=el('field-hotspot-generate');
  const visibility=el('field-hotspot-visibility');
  const output=el('field-hotspot-status');
  let busy=false;
  let current=null;
  let lastAdapter='';
  const message=value=>{output.textContent=value;};
  const option=(value,label)=>{
    const node=document.createElement('option');
    node.value=value;node.textContent=label;
    return node;
  };
  const setButtons=()=>{
    const tracked=current?.managed_profile_present===true;
    adapter.disabled=busy||tracked||!(current?.eligible_idle_status_not_verified||[]).length;
    start.disabled=busy||tracked||!current?.network_manager_available||!adapter.value;
    stop.disabled=busy||!tracked;
    refresh.disabled=busy;
    generate.disabled=busy||tracked;
    ssid.disabled=busy||tracked;
    password.disabled=busy||tracked;
  };
  function showStatus(data){
    if(data?.kind!=='OPT_IN_LOCAL_WIFI_HOTSPOT')throw Error('Unexpected hotspot status response');
    current=data;
    const supported=Array.isArray(data.eligible_idle_status_not_verified)?data.eligible_idle_status_not_verified:[];
    const selected=adapter.value||lastAdapter;
    adapter.replaceChildren(option('','Select an AP-capable adapter'));
    for(const name of supported){
      if(typeof name==='string')adapter.append(option(name,name));
    }
    if(data.interface && !supported.includes(data.interface))adapter.append(option(data.interface,`${data.interface} (tracked)`));
    adapter.value=data.interface||(supported.includes(selected)?selected:(supported[0]||''));
    lastAdapter=adapter.value;
    if(data.managed_profile_present){
      message(data.active_on_adapter?
        `ACTIVE: ${data.ssid} on ${data.interface}. The OpenRF HTTP dashboard is still localhost-only. NetworkManager may share an existing internet connection.`:
        `ATTENTION: an OpenRF-owned profile is recorded on ${data.interface} but the adapter is not verified active. Press Stop to safely remove the tracked profile.`);
    }else if(!data.network_manager_available){
      message('NetworkManager is unavailable on this Linux host. WSL may not expose your Windows Wi-Fi adapter. Nothing was changed.');
    }else if(!supported.length){
      message('No Linux-visible ordinary Wi-Fi adapter with OS-reported AP support. A HaLow adapter alone is not enough. Nothing was changed.');
    }else{
      message('Compatible AP capability was reported by Linux, but NetworkManager idle status and physical hotspot support still require a Start test. No network is active.');
    }
    setButtons();
  }
  async function request(path,body){
    const response=await fetch(path,{
      method:body?'POST':'GET',cache:'no-store',
      ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data?.error||`Local request failed (${response.status})`);
    return data;
  }
  async function update(){
    if(busy)return;
    busy=true;setButtons();message('Checking local NetworkManager and Wi-Fi AP support…');
    try{showStatus(await request('/api/network/hotspot/status'));}
    catch(error){current=null;message(`Hotspot status unavailable: ${error.message}. No network changes occurred.`);}
    finally{busy=false;setButtons();}
  }
  function generatedPassword(){
    if(!globalThis.crypto?.getRandomValues){message('Secure system randomness is unavailable. Enter a strong password manually.');return;}
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    // Rejection sampling avoids modulo bias; password is never persisted by the UI.
    const bytes=new Uint8Array(48);globalThis.crypto.getRandomValues(bytes);
    const unbiasedLimit=256-(256%alphabet.length);
    const accepted=Array.from(bytes).filter(n=>n<unbiasedLimit).slice(0,22);
    if(accepted.length<22)return generatedPassword();
    password.value=accepted.map(n=>alphabet[n%alphabet.length]).join('');
    message('Strong password generated. It remains in this password field until you clear it, stop the hotspot, or close this page.');
  }
  async function action(kind){
    if(busy)return;
    const starting=kind==='start';
    const selected=adapter.value;
    const network=ssid.value;
    const secret=password.value;
    if(starting){
      if(!selected){message('Choose an AP-capable Linux Wi-Fi adapter.');return;}
      if(!/^[A-Za-z0-9 _.-]{1,32}$/.test(network)||network.trim()!==network){message('Use a network name of 1–32 letters, numbers, spaces, dots or dashes.');return;}
      if(secret.length<12||secret.length>63||Array.from(secret).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>126)){
        message('Enter a WPA password of 12–63 printable ASCII characters.');return;
      }
    }
    const warning=starting?
      `Start WPA2 Wi-Fi hotspot “${network}” on ${selected}? Only an idle adapter will be used. NetworkManager may share an existing internet uplink with connected devices. The OpenRF dashboard stays localhost-only. Wi-Fi credentials stay in NetworkManager until Stop.`:
      'Stop and remove the OpenRF-owned local Wi-Fi hotspot profile? Connected devices will lose this Wi-Fi link.';
    if(!window.confirm(warning))return;
    busy=true;setButtons();message(starting?'Starting the selected WPA2 hotspot…':'Stopping the OpenRF-owned hotspot…');
    try{
      const result=await request(`/api/network/hotspot/${kind}`,starting?
        {interface:selected,ssid:network,passphrase:secret,confirm:true}:{confirm:true});
      if(!starting)password.value='';
      if(!starting){password.type='password';visibility.textContent='Show password';visibility.setAttribute('aria-pressed','false');}
      showStatus(result);
    }catch(error){
      const failure=`Hotspot ${kind} failed: ${error.message}. Refresh status before retrying. The connection state is not assumed.`;
      message(failure);
      try{current=await request('/api/network/hotspot/status');showStatus(current);}
      catch{current=null;}
      message(failure);
    }finally{busy=false;setButtons();}
  }
  adapter.addEventListener('change',()=>{lastAdapter=adapter.value;setButtons();});
  refresh.addEventListener('click',update);
  generate.addEventListener('click',generatedPassword);
  visibility.addEventListener('click',()=>{
    const showing=password.type==='password';
    password.type=showing?'text':'password';
    visibility.textContent=showing?'Hide password':'Show password';
    visibility.setAttribute('aria-pressed',showing?'true':'false');
  });
  start.addEventListener('click',()=>action('start'));
  stop.addEventListener('click',()=>action('stop'));
  document.addEventListener('openrf:hardware-shown',update);
  if(el('page-hardware')?.classList.contains('active'))update();
})();
