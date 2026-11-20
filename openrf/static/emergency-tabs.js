/* OpenRF v0.2.142 — emergency tabs switch in place without forced page scrolling. */
(() => {
  'use strict';
  const root=document.getElementById('page-emergency');
  const tabs=document.getElementById('emergency-tabs');
  if(!root || !tabs)return;
  const keys=['dashboard','sos','radio','plans','device'];
  const buttons=keys.map(key=>tabs.querySelector(`[data-emergency-tab="${key}"]`));
  const container=document.createElement('div');
  container.id='emergency-tab-content';
  container.className='emergency-tab-content';
  const panels=new Map();
  for(const key of keys){
    const panel=document.createElement('section');
    panel.id=`emergency-tab-panel-${key}`;
    panel.className='emergency-tab-panel';
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',`emergency-tab-${key}`);
    panel.setAttribute('tabindex','0');
    panel.hidden=key!=='dashboard';
    panels.set(key,panel);
    container.append(panel);
  }
  // Use the original elements, not copies, so every existing event handler,
  // form state, saved record and API integration survives the layout change.
  const originals=[...root.children].filter(node=>node.classList?.contains('panel') &&
    !node.classList.contains('emergency-notice'));
  function category(panel){
    if(panel.id==='emergency-ops-panel' || panel.id==='emergency-survival-panel' ||
      panel.querySelector('#emergency-readiness'))return 'dashboard';
    if(panel.querySelector('#emergency-sos-form,#emergency-checkin-form'))return 'sos';
    if(panel.querySelector('#emergency-protocol-form,#emergency-inbox-board,#emergency-handoff-form,#emergency-team-form'))return 'radio';
    if(panel.id==='emergency-backup-panel')return 'device';
    return 'plans';
  }
  for(const panel of originals)panels.get(category(panel)).append(panel);
  const dash=panels.get('dashboard');
  // First see the operations snapshot, then departure/power readiness; the
  // full SOS/check-in and radio forms remain one tap away in their own tabs.
  const operations=document.getElementById('emergency-ops-panel');
  if(operations)dash.prepend(operations);
  const survival=document.getElementById('emergency-survival-panel');
  const shortcuts=document.createElement('div');
  shortcuts.className='emergency-quick-access';
  shortcuts.innerHTML=`<strong>Quick access <span>Choose a tool — nothing is sent automatically</span></strong>
    <div class="emergency-quick-buttons">
      <button type="button" data-emergency-open="sos" data-emergency-focus="emergency-sos-template">Prepare SOS draft</button>
      <button type="button" data-emergency-open="sos" data-emergency-focus="emergency-checkin-person">Family check-in</button>
      <button type="button" data-emergency-open="radio" data-emergency-focus="emergency-handoff-draft">Radio handoff</button>
      <button type="button" data-emergency-open="dashboard" data-emergency-focus="emergency-survival-refresh">Device readiness</button>
    </div>`;
  // The dashboard's four one-tap actions must be reachable immediately,
  // before operations statistics, device checks and longer readiness cards.
  dash.prepend(shortcuts);
  tabs.after(container);

  function activate(key,{focusTab=false}={}){
    if(!panels.has(key))return;
    for(let i=0;i<keys.length;i++){
      const current=keys[i],selected=current===key;
      panels.get(current).hidden=!selected;
      buttons[i].setAttribute('aria-selected',String(selected));
      buttons[i].tabIndex=selected?0:-1;
    }
    if(focusTab)buttons[keys.indexOf(key)].focus({preventScroll:true});
  }
  for(const [index,button] of buttons.entries()){
    // A tab click changes content only; never move the document to the tab row.
    button.addEventListener('click',()=>activate(keys[index]));
    button.addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%keys.length;
      else if(event.key==='ArrowLeft')next=(index+keys.length-1)%keys.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=keys.length-1;
      else return;
      event.preventDefault();activate(keys[next],{focusTab:true});
    });
  }
  shortcuts.addEventListener('click',event=>{
    const action=event.target.closest('[data-emergency-open]');
    if(!action)return;
    activate(action.dataset.emergencyOpen);
    const focus=document.getElementById(action.dataset.emergencyFocus);
    focus?.focus?.({preventScroll:true});
    focus?.scrollIntoView?.({block:'center',behavior:'auto'});
  });
  window.OpenRFEmergencyTabs=Object.freeze({open:key=>activate(key),current:()=>keys.find(key=>!panels.get(key).hidden)});
})();
