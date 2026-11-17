'use strict';
/* v0.2.100: passive readiness and explicitly requested local link diagnostics. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('halow-panel'))return;
  const state={loading:false,checking:false,prior:null};
  const create=(tag,css,content)=>{
    const node=document.createElement(tag);node.className=css;node.textContent=content;
    return node;
  };
  function status(message,error=false){
    el('halow-status').textContent=message;
    el('halow-status').classList.toggle('error',error);
  }
  const counterNames={rx_bytes:'Received bytes',tx_bytes:'Sent bytes',
    rx_packets:'Received packets',tx_packets:'Sent packets',
    rx_errors:'Receive errors',tx_errors:'Send errors',
    rx_dropped:'Receive drops',tx_dropped:'Send drops'};
  function clearDiagnostics(message){
    state.prior=null;
    el('halow-diag-results')?.replaceChildren();
    if(el('halow-diag-status'))el('halow-diag-status').textContent=message;
  }
  function selectedInterface(){return el('halow-diag-interface')?.value||'';}
  function updateChoices(report){
    const choice=el('halow-diag-interface'),button=el('halow-diag-check');
    if(!choice||!button)return;
    const previously=choice.value;
    choice.replaceChildren();
    const candidates=report.candidate_interfaces||[];
    if(!candidates.length){
      const option=create('option','','No recognized interface yet');option.value='';choice.append(option);
      choice.disabled=true;button.disabled=true;
      clearDiagnostics('No Linux-visible candidate interface to inspect. No radio or packet check was performed.');
      return;
    }
    for(const iface of candidates){
      const option=create('option','',`${iface.name} · ${iface.driver_hint}`);
      option.value=iface.name;choice.append(option);
    }
    choice.value=candidates.some(item=>item.name===previously)?previously:candidates[0].name;
    choice.disabled=false;button.disabled=false;
    clearDiagnostics('Choose Inspect local link for a one-shot, read-only host check.');
  }
  function asCounter(value){
    if(typeof value!=='string'||!/^[0-9]{1,20}$/.test(value))return null;
    try{return BigInt(value);}catch(_error){return null;}
  }
  function renderDiagnostic(report){
    const output=el('halow-diag-results');if(!output)return;
    output.replaceChildren();
    const association={
      os_reports_associated:'Linux iw reports an existing Wi-Fi association (HaLow RF and peers NOT verified)',
      os_reports_not_associated:'Linux iw reports no current Wi-Fi association',
      tool_unavailable:'iw is not installed; association unavailable',
      timed_out:'Linux iw link query timed out',
      failed:'Linux iw link query failed',
      unsupported_or_failed:'Driver or iw could not report the association',
      unsupported_or_unknown:'Linux iw did not return a recognized association status',
    };
    const row=(label,value)=>{
      const item=create('div','halow-diag-row','');
      item.append(create('strong','',label),create('span','',value));output.append(item);
    };
    row('Interface',report.interface);
    row('Driver / OS',`${report.driver_hint||'unknown'} · ${report.os_operstate||'unknown'} · carrier ${report.os_carrier_reported===true?'reported':report.os_carrier_reported===false?'absent':'unknown'}`);
    row('IPv6 link-local',report.ipv6_link_local_present?'Present (multicast/peers untested)':'Not observed');
    row('Association',association[report.os_association]||'Not available');
    row('Reticulum preflight',report.reticulum_opt_in_eligible?'Eligible for separate manual opt-in; network untested':'Not eligible for manual opt-in yet');
    const previous=state.prior;
    const current=report.kernel_cumulative_counters||{};
    const same=previous&&previous.interface===report.interface&&previous.driver_hint===report.driver_hint;
    for(const [key,label] of Object.entries(counterNames)){
      const value=asCounter(current[key]);
      const previousValue=same?asCounter(previous.kernel_cumulative_counters?.[key]):null;
      let display=value===null?'Not reported':value.toString();
      if(value!==null&&previousValue!==null&&value>=previousValue)
        display+=` · +${(value-previousValue).toString()} since prior inspection`;
      else if(value!==null&&previousValue!==null&&value<previousValue)
        display+=' · counter reset, no comparison';
      row(label,display);
    }
    output.append(create('p','small muted','Counters are cumulative OS-local network totals. An increase does NOT verify 802.11ah RF reachability, an IP peer, Reticulum transport, or LXMF delivery. No SSID, BSSID/MAC or IP address is collected for display.'));
    state.prior=report;
  }
  async function inspect(){
    if(state.checking||state.loading||!selectedInterface())return;
    const interfaceName=selectedInterface();state.checking=true;
    el('halow-diag-check').disabled=true;
    el('halow-diag-status').textContent='Reading this Linux interface and its OS association status; no scan or traffic…';
    try{
      const response=await fetch(`/api/wifi-halow/diagnostics?interface=${encodeURIComponent(interfaceName)}`,{cache:'no-store'});
      if(!response.ok)throw Error(`Local diagnostic failed (${response.status}); refresh readiness and retry`);
      const report=await response.json();
      if(report.kind!=='PASSIVE_WIFI_HALOW_LINK_DIAGNOSTIC'||report.read_only!==true||
         report.interface!==interfaceName||report.performs_scan_or_connection!==false)
        throw Error('Unexpected local diagnostic response');
      if(selectedInterface()!==interfaceName)return;
      renderDiagnostic(report);
      el('halow-diag-status').textContent=`Linux-only snapshot · ${report.observed_at_utc}. RF and peer connectivity remain unverified.`;
    }catch(error){
      clearDiagnostics('Diagnostic unavailable: '+error.message+'. No network link was changed.');
    }finally{state.checking=false;el('halow-diag-check').disabled=!selectedInterface();}
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
        create('small','muted',`IPv6 link-local: ${iface.ipv6_link_local_present?'present':'not observed'} · Reticulum selection: ${iface.reticulum_opt_in_eligible?'eligible for manual opt-in':'not yet eligible'} · RF/multicast/peer unverified.`));
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
    updateChoices(report);
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
      updateChoices({candidate_interfaces:[]});
    }finally{state.loading=false;el('halow-refresh').disabled=false;}
  }
  el('halow-refresh').addEventListener('click',refresh);
  el('halow-diag-check')?.addEventListener('click',inspect);
  el('halow-diag-interface')?.addEventListener('change',()=>clearDiagnostics('Selection changed. Inspect the selected interface to see a new snapshot.'));
  document.addEventListener('openrf:hardware-shown',refresh);
  if(el('page-hardware')?.classList.contains('active'))refresh();
})();
