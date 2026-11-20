/* OpenRF v0.2.145 — read-only Linux battery indicator, never a simulated gauge. */
(() => {
  'use strict';
  const root=document.getElementById('device-battery');
  const value=document.getElementById('device-battery-value');
  const fill=document.getElementById('device-battery-fill');
  if(!root || !value || !fill)return;

  function unavailable(reason){
    root.dataset.battery='unavailable';
    value.textContent='—';
    fill.setAttribute('width','0');
    root.title=reason||'Battery status unavailable';
  }
  function apply(payload){
    const report=payload?.battery;
    const devices=report?.batteries;
    if(!Array.isArray(devices) || devices.length===0){
      unavailable('Linux has not reported a battery gauge. WSL often has no battery, even on a powered laptop. A compatible Raspberry Pi power board must supply battery telemetry.');
      return false;
    }
    if(devices.length!==1){
      unavailable(`${devices.length} battery devices reported. OpenRF does not invent a combined charge percentage; inspect Device readiness for individual gauges.`);
      return false;
    }
    const battery=devices[0];
    const percent=battery.capacity_percent;
    if(!Number.isInteger(percent) || percent<0 || percent>100){
      unavailable(`${battery.name||'Linux battery'} has no usable charge percentage. No value was estimated.`);
      return false;
    }
    const status=['Charging','Discharging','Full','Not charging','Unknown'].includes(battery.status)?battery.status:'Status unknown';
    value.textContent=`${percent}%`;
    fill.setAttribute('width',String(Math.round(percent*16/100)));
    root.dataset.battery=percent<=10?'critical':percent<=20?'low':status==='Charging'?'charging':'reported';
    root.title=`${battery.name||'Linux battery'}: ${percent}% · ${status}. Linux kernel reading, not a calibrated OpenRF estimate. Remaining runtime and safe shutdown are unknown.`;
    return true;
  }
  async function refresh(){
    try{
      const response=await fetch('/api/device/power',{cache:'no-store',headers:{'Accept':'application/json'}});
      if(!response.ok)throw Error('power endpoint unavailable');
      apply(await response.json());
    }catch(_){unavailable('Unable to read Linux battery status. No percentage is being assumed.');}
  }
  window.OpenRFDeviceBattery=Object.freeze({apply,refresh});
  unavailable();
  refresh();
  setInterval(refresh,30000);
})();
