'use strict';
/* v0.2.98: passive 802.11ah Linux prerequisites only; never configure RF/IP. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('halow-panel'))return;
  const state={loading:false};
  const create=(tag,css,content)=>{
    const node=document.createElement(tag);node.className=css;node.textContent=content;
    return node;
  };
  function status(message,error=false){
    el('halow-status').textContent=message;
    el('halow-status').classList.toggle('error',error);
  }
  function render(report){
    const label={
      candidate_interface_visible:'POSSIBLE DRIVER',
      candidate_usb_visible:'POSSIBLE USB ADAPTER',
      driver_module_only:'DRIVER ONLY',
      not_visible_in_wsl:'NOT VISIBLE IN WSL',
      no_halow_evidence:'NO HALOW EVIDENCE',
    };
    el('halow-state').textContent=label[report.state]||'UNVERIFIED';
    status(report.summary||'The host did not report usable HaLow evidence.');
    const box=el('halow-candidates');box.replaceChildren();
    for(const iface of report.candidate_interfaces||[]){
      const row=create('div','halow-row','');
      row.append(create('strong','',`Network interface: ${iface.name}`),
        create('span','',`Driver hint: ${iface.driver_hint} · OS: ${iface.os_operstate} · carrier: ${iface.os_carrier_reported===true?'reported':iface.os_carrier_reported===false?'absent':'unknown'}`),
        create('small','muted','Potential 802.11ah hardware only. RF peer, IP traffic and messaging unverified.'));
      box.append(row);
    }
    for(const usb of report.candidate_usb_descriptors||[]){
      const row=create('div','halow-row','');
      row.append(create('strong','',`USB descriptor hint: ${usb.vendor_id}:${usb.product_id}`),
        create('small','muted','A matching product description is not a driver, operating radio or established connection.'));
      box.append(row);
    }
    if(!box.children.length)box.append(create('p','small muted','No vendor-associated Linux network or USB device discovered. Ordinary wlan0/eth0 is not proof of HaLow.'));
    if((report.loaded_module_hints||[]).length)box.append(create('p','small muted',
      `Loaded driver-name hints: ${report.loaded_module_hints.join(', ')} (not hardware or link proof).`));
    const names=Object.entries(report.optional_tool_presence||{}).filter(([,present])=>present).map(([name])=>name);
    box.append(create('p','small muted',`Optional Linux commands visible: ${names.join(', ')||'none'}. Their presence does not prove hardware support.`));
    const list=el('halow-setup-steps');list.replaceChildren();
    for(const instruction of report.setup_steps||[])list.append(create('li','',instruction));
  }
  async function refresh(){
    if(state.loading)return;
    state.loading=true;
    el('halow-refresh').disabled=true;
    status('Checking Linux-only driver hints; no radio connection or scan…');
    try{
      const response=await fetch('/api/wifi-halow/status',{cache:'no-store'});
      if(!response.ok)throw Error(`Status request failed (${response.status})`);
      const report=await response.json();
      if(report.kind!=='PASSIVE_WIFI_HALOW_READINESS'||report.read_only!==true)
        throw Error('Unexpected local HaLow status format');
      render(report);
    }catch(error){
      el('halow-state').textContent='STATUS UNAVAILABLE';
      status(`HaLow readiness unavailable: ${error.message}`,true);
      el('halow-candidates').replaceChildren(create('p','small muted','Refresh to retry. No interface was started.'));
    }finally{state.loading=false;el('halow-refresh').disabled=false;}
  }
  el('halow-refresh').addEventListener('click',refresh);
  document.addEventListener('openrf:hardware-shown',refresh);
  if(el('page-hardware')?.classList.contains('active'))refresh();
})();
