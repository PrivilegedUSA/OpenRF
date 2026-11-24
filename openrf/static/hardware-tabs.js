/* v0.2.174: UI-only grouping; never probes, connects, or starts a driver. */
(() => {
  'use strict';
  const names=['dashboard','radios','sensors','system'];
  const contents={
    dashboard:['hardware-manager-panel','hardware-cards','wifi-driver-status'],
    radios:['mesh-connections-panel','field-network-panel','halow-panel'],
    sensors:['hardware-inventory-panel','sensor-registry-panel','usb-sensor-panel'],
    system:['hardware-readiness-panel','hardware-environment-panel'],
  };
  const parent=document.getElementById('page-hardware');
  const bar=document.getElementById('hardware-tabs');
  if(!parent||!bar)return;
  const sections=new Map(),tabs=new Map();
  // Before moving anything, ensure all original nodes exist. Never clone a
  // form, since this would break its existing event listeners and state.
  if(Object.values(contents).flat().some(id=>!document.getElementById(id)))return;
  for(const name of names){
    const button=document.getElementById(`hardware-tab-${name}`);
    if(!button)return;
    tabs.set(name,button);
  }
  for(const name of names){
    const section=document.createElement('section');
    section.className='hardware-tab-panel';
    section.id=`hardware-panel-${name}`;
    section.setAttribute('role','tabpanel');
    section.setAttribute('aria-labelledby',tabs.get(name).id);
    section.hidden=name!=='dashboard';
    for(const id of contents[name])section.append(document.getElementById(id));
    sections.set(name,section);
  }
  parent.append(...names.map(name=>sections.get(name)));
  function select(name,focus=false){
    if(!sections.has(name))return;
    for(const item of names){
      const active=item===name;
      sections.get(item).hidden=!active;
      tabs.get(item).setAttribute('aria-selected',String(active));
      tabs.get(item).tabIndex=active?0:-1;
    }
    window.OpenRFWorkspaceTabs?.remember('hardware',name);
    // No scrollIntoView or page navigation; touch and keyboard behave alike.
    if(focus)tabs.get(name).focus({preventScroll:true});
  }
  names.forEach((name,index)=>{
    const button=tabs.get(name);
    button.addEventListener('click',()=>select(name));
    button.addEventListener('keydown',event=>{
      let target;
      if(event.key==='ArrowRight')target=names[(index+1)%names.length];
      else if(event.key==='ArrowLeft')target=names[(index+names.length-1)%names.length];
      else if(event.key==='Home')target=names[0];
      else if(event.key==='End')target=names[names.length-1];
      else return;
      event.preventDefault();select(target,true);
    });
  });
  select(window.OpenRFWorkspaceTabs?.restore('hardware',names,'dashboard') || 'dashboard');
  window.OpenRFHardwareTabs=Object.freeze({open:select,
    current:()=>names.find(name=>!sections.get(name).hidden)});
})();
