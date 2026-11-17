'use strict';
/* v0.2.97 — read-only mesh connection inventory with explicit stop actions. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('mesh-connections-panel'))return;
  const state={report:null,polling:false,busy:false};
  const create=(tag,className,text)=>{
    const node=document.createElement(tag);
    node.className=className;
    node.textContent=text;
    return node;
  };
  function note(message,error=false){
    const target=el('mesh-connections-status');
    target.textContent=message;target.classList.toggle('error',error);
  }
  function controls(){
    el('mesh-connections-refresh').disabled=state.polling||state.busy;
    el('mesh-connections-disconnect').disabled=state.polling||state.busy||!state.report?.meshtastic?.connected;
    el('mesh-connections-stop-reticulum').disabled=state.polling||state.busy||!state.report?.reticulum?.enabled;
  }
  function fillCards(report){
    const overview=el('mesh-connection-overview');overview.replaceChildren();
    const mesh=create('article','mesh-connection-card','');
    mesh.append(create('strong','','Meshtastic · USB'),
      create('span','',report.meshtastic.connected?'USB session open (not an RF link)':'Not connected'),
      create('small','',`Port: ${report.meshtastic.port||'none'} · SDK ${report.meshtastic.sdk_available?'available':'missing'} · RF reachability unverified`));
    const ret=create('article','mesh-connection-card','');
    ret.append(create('strong','','Reticulum · LXMF / RNode'),
      create('span','',report.reticulum.enabled?'Worker enabled (not a delivery receipt)':'Stopped'),
      create('small','',`${report.reticulum.rnode_ports.length} USB RNode interface(s) requested · TCP ${report.reticulum.tcp_requested?'requested':'off'} · Forwarding ${report.reticulum.transport_forwarding_requested?'requested':'off'}`));
    overview.append(mesh,ret);
  }
  function fillPorts(report){
    const box=el('mesh-connection-ports');box.replaceChildren();
    if(!report.ports.length){
      box.append(create('p','small muted','No Linux USB serial ports visible or claimed by OpenRF. WSL may require USB passthrough.'));
      return;
    }
    for(const port of report.ports){
      const row=create('div','mesh-connection-row','');
      const owner=port.owner==='MESHTASTIC_USB_SESSION'?'Meshtastic USB session open':
        port.owner==='RETICULUM_RNODE_REQUESTED'?'Reticulum RNode requested':'Not claimed by OpenRF';
      const access=port.linux_status==='ready_to_probe'?'Linux read/write access available (firmware unknown)':
        port.linux_status==='permission_denied'?'Linux permission blocked':
        port.linux_status==='not_visible_in_linux_inventory'?'Not visible in latest Linux inventory':
        `Linux device state: ${port.linux_status}`;
      row.append(create('strong','',port.path),create('span','',owner),
        create('small','',`${access} · RF link unverified`));
      box.append(row);
    }
  }
  function fillInterfaces(report){
    const box=el('mesh-connection-interfaces');box.replaceChildren();
    if(!report.reticulum.enabled){
      box.append(create('p','small muted','Reticulum is stopped. No live interface report.'));
      return;
    }
    if(!report.reticulum.diagnostics_available){
      box.append(create('p','small muted',report.reticulum.diagnostics_note||'RNS interface counters unavailable.'));
      return;
    }
    if(!report.reticulum.interfaces.length){
      box.append(create('p','small muted','No RNS interfaces reported; no RF or peer connection is verified.'));
      return;
    }
    const number=value=>Number.isSafeInteger(value)&&value>=0?value:'unknown';
    for(const item of report.reticulum.interfaces){
      const row=create('div','mesh-connection-row','');
      const status=item.local_up===true?'RNS reports UP':item.local_up===false?'RNS reports DOWN':'RNS state unknown';
      row.append(create('strong','',item.name),create('span','',status),
        create('small','',`Reported peers: ${number(item.reachable_peers_reported)} · Received ${number(item.rx_bytes)} B · Sent ${number(item.tx_bytes)} B · RF link/delivery unverified`));
      box.append(row);
    }
  }
  function render(report){
    state.report=report;
    fillCards(report);fillPorts(report);fillInterfaces(report);
    const when=new Date(report.observed_at_utc);
    note(`Local status checked ${Number.isNaN(when.getTime())?'now':when.toLocaleTimeString()}. No radio was opened or probed.`);
    controls();
  }
  async function request(path,body){
    const response=await fetch(path,body===undefined?{cache:'no-store'}:{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let data;
    try{data=await response.json();}catch(_){throw Error('The local service returned an unreadable response.');}
    if(!response.ok)throw Error(data.error||`Request failed (${response.status}).`);
    return data;
  }
  async function refresh(){
    if(state.polling||state.busy)return;
    state.polling=true;controls();
    try{render(await request('/api/mesh/connections'));}
    catch(error){state.report=null;note(`Connection status unavailable: ${error.message}`,true);}
    finally{state.polling=false;controls();}
  }
  async function stop(path,prompt){
    if(state.busy||state.polling||!window.confirm(prompt))return;
    state.busy=true;controls();
    let stopped=false;
    try{
      await request(path,{});
      stopped=true;
      document.dispatchEvent(new Event('openrf:connections-changed'));
      note('Stop request completed; refreshing local connection status.');
    }catch(error){note(`Stop request failed: ${error.message}`,true);}
    finally{state.busy=false;controls();}
    if(stopped)await refresh();
  }
  el('mesh-connections-refresh').addEventListener('click',refresh);
  el('mesh-connections-disconnect').addEventListener('click',()=>stop('/api/mesh/disconnect',
    'Disconnect the current Meshtastic USB node? This ends the local USB session. Saved contacts and opted-in history remain.'));
  el('mesh-connections-stop-reticulum').addEventListener('click',()=>stop('/api/reticulum/stop',
    'Stop Reticulum now? This closes its LAN/TCP/RNode worker and stops its managed radio interfaces. Saved contacts and opted-in history remain.'));
  document.addEventListener('openrf:hardware-shown',refresh);
  if(el('page-hardware')?.classList.contains('active'))refresh();
  controls();
})();
