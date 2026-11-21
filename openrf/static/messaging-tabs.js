/* v0.2.167: shared navigation for Meshtastic and MeshCore; no radio operations. */
(() => {
  'use strict';
  const names = ['dashboard', 'inbox', 'contacts'];
  const configurations = [
    {key:'meshtastic', parent:'mesh-panel', messageBox:'mesh-messages',
      content:{
        dashboard:['mesh-dashboard-title','mesh-status','mesh-dashboard-intro',
          'mesh-device-settings','mesh-history-settings'],
        inbox:['mesh-inbox-heading','mesh-read-actions','mesh-chat-grid'],
        contacts:['mesh-node-directory']
      }},
    {key:'meshcore', parent:'meshcore-panel', messageBox:'meshcore-messages',
      content:{
        dashboard:['meshcore-dashboard-title','meshcore-status',
          'meshcore-device-settings','meshcore-privacy-note'],
        inbox:['meshcore-inbox-heading','meshcore-read-actions','meshcore-layout'],
        contacts:['meshcore-contact-directory']
      }}
  ];
  function setup(config) {
    const parent=document.getElementById(config.parent);
    const bar=document.getElementById(`${config.key}-tabs`);
    if (!parent || !bar) return null;
    const tabs=new Map(), panels=new Map();
    for (const name of names) {
      const tab=document.getElementById(`${config.key}-tab-${name}`);
      if (!tab || !config.content[name].every(id=>document.getElementById(id))) return null;
      tabs.set(name,tab);
      const section=document.createElement('section');
      section.className='messaging-tab-panel';
      section.id=`${config.key}-tab-panel-${name}`;
      section.setAttribute('role','tabpanel');
      section.setAttribute('aria-labelledby',tab.id);
      section.hidden=name!=='dashboard';
      for (const id of config.content[name]) section.append(document.getElementById(id));
      panels.set(name,section);
    }
    parent.append(...names.map(name=>panels.get(name)));
    // The USB Connect control should be readily accessible on the Dashboard.
    if (config.key==='meshtastic') {
      const connection=document.getElementById('mesh-device-settings');
      if (connection) connection.open=true;
    }
    function activate(name,{focus=false}={}) {
      if (!panels.has(name)) return;
      const wasInbox=!panels.get('inbox').hidden;
      for (const key of names) {
        const selected=key===name;
        panels.get(key).hidden=!selected;
        tabs.get(key).setAttribute('aria-selected',String(selected));
        tabs.get(key).tabIndex=selected?0:-1;
      }
      if (name==='contacts'&&config.key==='meshtastic') {
        const directory=document.getElementById('mesh-node-directory');
        if (directory) directory.open=true;
      }
      if (name==='inbox'&&!wasInbox) {
        const messages=document.getElementById(config.messageBox);
        if (messages) messages.scrollTop=messages.scrollHeight;
      }
      // No page jump, URL change, radio connect, or scrollIntoView on tab switch.
      if (focus) tabs.get(name).focus({preventScroll:true});
    }
    for (const [index,name] of names.entries()) {
      const tab=tabs.get(name);
      tab.addEventListener('click',()=>activate(name));
      tab.addEventListener('keydown',event=>{
        let target;
        if (event.key==='ArrowRight')target=names[(index+1)%names.length];
        else if (event.key==='ArrowLeft')target=names[(index+names.length-1)%names.length];
        else if (event.key==='Home')target=names[0];
        else if (event.key==='End')target=names[names.length-1];
        else return;
        event.preventDefault();activate(target,{focus:true});
      });
    }
    activate('dashboard');
    return Object.freeze({open:name=>activate(name),
      current:()=>names.find(name=>!panels.get(name).hidden)});
  }
  const meshtastic=setup(configurations[0]);
  const meshcore=setup(configurations[1]);
  window.OpenRFMessagingTabs=Object.freeze({meshtastic,meshcore});
})();
