'use strict';
/* v0.2.101: explicit inventory and field topology planning, never network control. */
(()=>{
  const el=id=>document.getElementById(id);
  if(!el('field-network-panel'))return;
  let busy=false,report=null;
  const create=(tag,cl,value)=>{const node=document.createElement(tag);node.className=cl;node.textContent=value;return node;};
  const bool=value=>value===true?'OS reports yes':value===false?'OS reports no':'Not established';
  function show(){
    const modes=el('field-network-mode-detail'),interfaces=el('field-network-interfaces');
    modes.replaceChildren();interfaces.replaceChildren();
    if(!report)return;
    const mode=el('field-network-mode').value;
    const item=(report.proposed_roles||[]).find(role=>role.id===mode);
    if(item){
      const entry=create('div','field-network-row','');
      entry.append(create('strong','',item.label),
        create('span','',item.description),
        create('small','muted',report.mode_candidates?.[mode]===true?
          'Some OS prerequisites reported. Configuration, security, hardware operation and connectivity are UNVERIFIED.':
          'Required hardware or mode support has not been demonstrated. No network can be started from this panel.'));
      modes.append(entry);
    }
    const candidates=report.interfaces||[];
    if(!candidates.length){
      interfaces.append(create('p','small muted','No Linux-visible wireless interfaces with supported PHY hints were found. WSL may not see Windows wireless adapters.'));
    }
    for(const iface of candidates){
      const row=create('div','field-network-row','');
      row.append(create('strong','',`${iface.name} · ${iface.classification==='halow_driver_candidate'?'Possible HaLow':'Possible regular Wi-Fi'}`),
        create('span','',`Linux PHY ${iface.phy||'unknown'} · OS ${iface.os_operstate||'unknown'}`),
        create('small','muted',`AP: ${bool(iface.os_reports_ap_mode)} · Station: ${bool(iface.os_reports_station_mode)} · simultaneous roles: unverified · remote peer: unverified`));
      interfaces.append(row);
    }
    const known=Object.entries(report.tool_presence||{}).filter(([,present])=>present).map(([name])=>name);
    interfaces.append(create('p','small muted',`Available local network tools: ${known.join(', ')||'none reported'}. Having tools installed is not proof of adapter support.`));
  }
  async function inspect(){
    if(busy)return;busy=true;
    const button=el('field-network-refresh');button.disabled=true;
    el('field-network-status').textContent='Inspecting local Linux interface and supported-mode hints; no radio action…';
    try{
      const response=await fetch('/api/network/field-readiness',{cache:'no-store'});
      if(!response.ok)throw Error(`Host request failed (${response.status})`);
      const data=await response.json();
      if(data.kind!=='PASSIVE_FIELD_NETWORK_FOUNDATION'||data.read_only!==true||
          data.activation_available!==false||data.radio_actions_performed!==false)
        throw Error('Unexpected network readiness format');
      report=data;
      show();
      el('field-network-status').textContent=`Linux-only inspection · ${data.observed_at_utc}. No hotspot, gateway or long-range RF connection was activated.`;
    }catch(error){
      report=null;show();
      el('field-network-status').textContent=`Field networking readiness unavailable: ${error.message}. No configuration changed.`;
    }finally{button.disabled=false;busy=false;}
  }
  el('field-network-refresh').addEventListener('click',inspect);
  el('field-network-mode').addEventListener('change',show);
})();
