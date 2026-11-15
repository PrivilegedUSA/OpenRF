'use strict';
/* v0.2.75: no fake mesh nodes, no background connections or transmission.
   A real USB Meshtastic radio is required; all text stays in server RAM. */
(() => {
  const el=id=>document.getElementById(id);
  if(!el('mesh-panel'))return;
  const state={connected:false,mode:'normal',busy:false,polling:false};
  const note=(text,error=false)=>{
    const node=el('mesh-status');node.textContent=text;node.classList.toggle('error',error);
  };
  async function request(path,body){
    const opts=body===undefined?{cache:'no-store'}:{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
    const response=await fetch(path,opts);
    let result;
    try{result=await response.json();}
    catch(_){throw Error('Local mesh service returned an unreadable response.');}
    if(!response.ok)throw Error(result.error||`Mesh operation failed (${response.status}).`);
    return result;
  }
  function renderButtons(){
    const canConnect=!state.connected&&!state.busy&&Boolean(el('mesh-serial').value)&&state.sdkAvailable;
    el('mesh-connect').disabled=!canConnect;
    el('mesh-disconnect').disabled=!state.connected||state.busy;
    el('mesh-set-mode').disabled=state.busy;
    el('mesh-send').disabled=!state.connected||state.mode!=='normal'||state.busy;
    el('mesh-link-badge').textContent=state.connected?'USB LINK CONNECTED':'NOT CONNECTED';
  }
  function renderStatus(info){
    state.connected=Boolean(info.connected);state.mode=info.mode==='relay_only'?'relay_only':'normal';
    state.sdkAvailable=Boolean(info.sdk_available);
    const options=el('mesh-serial'),old=options.value;
    options.replaceChildren();
    const ports=Array.isArray(info.available_serial_ports)?info.available_serial_ports:[];
    if(!ports.length){
      const none=new Option('No Linux USB serial ports detected','');options.append(none);
    }else{
      for(const port of ports)options.append(new Option(port,port));
      if(ports.includes(old))options.value=old;
      else if(ports.includes(info.port))options.value=info.port;
    }
    options.disabled=state.connected||state.busy;
    el('mesh-mode').value=state.mode;
    renderButtons();
    if(info.last_error)note(info.last_error,true);
    else if(state.connected)note(`${info.port||'USB node'} connected. ${state.mode==='relay_only'?'Relay-focused: composing disabled.':'Normal mode: user-started text sending available.'} Radio reception and mesh rebroadcast are controlled by its firmware; link status does not prove RF coverage.`);
    else note(info.sdk_available? 'No mesh radio connected. Select a visible USB serial port and press Connect; no automatic connection or transmissions.' :
      'Optional Meshtastic Python package not found in this Linux environment. Install meshtastic and attach a USB node before connecting. Nothing is transmitting.');
  }
  function renderMessages(rows){
    const box=el('mesh-messages');box.replaceChildren();
    if(!Array.isArray(rows)||!rows.length){
      const p=document.createElement('p');p.className='small muted';
      p.textContent='No real mesh messages this session. Nothing is recorded to disk.';box.append(p);return;
    }
    for(const m of rows.slice(-100)){
      const article=document.createElement('article');article.className='mesh-message';
      const title=document.createElement('div');title.className='mesh-message-head';
      const label=document.createElement('strong');label.textContent=`${m.direction==='IN'?'Received from':'Submitted to'} ${m.node||'unknown node'} · channel ${Number.isInteger(m.channel)?m.channel:'?'}`;
      const time=document.createElement('span');time.textContent=m.received_at_utc||'UTC unavailable';
      title.append(label,time);
      const text=document.createElement('p');text.textContent=String(m.text||'');
      const delivery=document.createElement('small');delivery.textContent=m.direction==='IN'?'Reported by connected radio; sender authenticity unverified.':'Submitted to connected radio; delivery not confirmed.';
      article.append(title,text,delivery);box.append(article);
    }
    box.scrollTop=box.scrollHeight;
  }
  async function loadMessages(){
    if(state.polling)return;
    state.polling=true;
    try{const result=await request('/api/mesh/messages');renderMessages(result.messages);}
    catch(error){note(error.message,true);}
    finally{state.polling=false;}
  }
  async function refresh(){
    try{renderStatus(await request('/api/mesh/status'));await loadMessages();}
    catch(error){note(error.message,true);}
  }
  async function run(body,path){
    state.busy=true;renderButtons();
    try{const result=await request(path,body);await refresh();return result;}
    catch(error){note(error.message,true);return null;}
    finally{state.busy=false;renderButtons();}
  }
  el('mesh-serial').addEventListener('change',renderButtons);
  el('mesh-connect').addEventListener('click',()=>run({port:el('mesh-serial').value},'/api/mesh/connect'));
  el('mesh-disconnect').addEventListener('click',()=>run({},'/api/mesh/disconnect'));
  el('mesh-set-mode').addEventListener('click',()=>run({mode:el('mesh-mode').value},'/api/mesh/mode'));
  el('mesh-refresh').addEventListener('click',refresh);
  el('mesh-compose').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.busy||!state.connected||state.mode!=='normal'){
      note('Connect a real USB node in Normal mode before sending.',true);return;
    }
    const text=el('mesh-text').value;
    if(new TextEncoder().encode(text).length>180){note('Message exceeds 180 UTF-8 bytes.',true);return;}
    const result=await run({text,destination:el('mesh-destination').value.trim(),
      channel:Number(el('mesh-channel').value)},'/api/mesh/send');
    if(result?.submitted_to_radio){
      el('mesh-text').value='';
      note('Message submitted to the USB radio. Recipient delivery is NOT confirmed.');
    }
  });
  document.addEventListener('openrf:radio-shown',refresh);
  // Poll the in-memory inbox only while the user views Radio with an explicitly
  // connected node; never trigger radio discovery or RF transmissions.
  setInterval(()=>{
    if(state.connected&&!state.busy&&el('page-radio')?.classList.contains('active'))loadMessages();
  },4000);
  renderButtons();
})();
