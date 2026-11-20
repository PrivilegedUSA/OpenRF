'use strict';
/* v0.2.150 — small local browser workspace, not a third-party page proxy.
   The isolated preview is best-effort. Full browsing uses the browser's own
   engine in a separate tab; OpenRF never downloads untrusted HTML through its
   Python loopback API or grants a website access to its investigation data. */
(() => {
  const $=id=>document.getElementById(id);
  if(!$('page-browser'))return;
  const STORAGE_KEY='openrf.browser.workspace.v1';
  const MAX_TABS=8, MAX_BOOKMARKS=24, MAX_HISTORY=16, MAX_URL=1024;
  const SEARCH='https://duckduckgo.com/?q=';
  const blank=()=>({id:1,history:[],index:-1});

  function validatedUrl(candidate){
    if(typeof candidate!=='string'||!candidate.length||candidate.length>MAX_URL||/[\u0000-\u001f<>]/.test(candidate))
      throw Error('Use a short valid public website address');
    let url;
    try{url=new URL(candidate);}catch(_){throw Error('Invalid website address');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)
      throw Error('Only ordinary HTTP(S) website addresses without embedded passwords are allowed');
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    // Browser content must never use OpenRF as a launcher for internal devices,
    // localhost endpoints or a filesystem scheme. The backend never proxies.
    if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||
       host.endsWith('.local')||host.endsWith('.internal')||
       host.startsWith('[')||/^\d+(?:\.\d+)*$/.test(host)||
       !/^[a-z0-9.-]+$/.test(host)||host.includes('..'))
      throw Error('Only public website names are supported; local network addresses are blocked');
    if(url.href.length>MAX_URL)throw Error('Website address is too long');
    return url.href;
  }
  function normalizeAddress(input){
    const value=String(input||'').trim();
    if(!value||value.length>MAX_URL||/[\u0000-\u001f<>]/.test(value))
      throw Error('Enter a website address or search term');
    if(/^https?:\/\//i.test(value))return validatedUrl(value);
    if(/^[a-z][a-z\d+.-]*:/i.test(value))throw Error('Only HTTP(S) websites can be opened');
    if(!/\s/.test(value)&&/^[^/]+\.[^/]+/.test(value))return validatedUrl('https://'+value);
    return validatedUrl(SEARCH+encodeURIComponent(value));
  }
  function load(){
    const fallback={tabs:[blank()],active:1,bookmarks:[]};
    let stored;
    try{stored=JSON.parse(window.localStorage?.getItem(STORAGE_KEY)||'null');}catch(_){return fallback;}
    if(!stored||stored.version!==1||!Array.isArray(stored.tabs)||!Array.isArray(stored.bookmarks))return fallback;
    const ids=new Set(),tabs=[];
    for(const item of stored.tabs.slice(0,MAX_TABS)){
      if(!item||!Number.isSafeInteger(item.id)||item.id<=0||ids.has(item.id)||!Array.isArray(item.history))continue;
      const history=[];
      for(const value of item.history.slice(-MAX_HISTORY)){
        if(value===''){history.push('');continue;}
        try{history.push(validatedUrl(value));}catch(_){} // Never restore unsafe addresses.
      }
      ids.add(item.id);
      tabs.push({id:item.id,history,index:Math.min(history.length-1,Math.max(-1,Number.isInteger(item.index)?item.index:history.length-1))});
    }
    if(!tabs.length)tabs.push(blank());
    const bookmarks=[];
    for(const item of stored.bookmarks.slice(0,MAX_BOOKMARKS)){
      try{
        const url=validatedUrl(item?.url);
        if(bookmarks.some(b=>b.url===url))continue;
        const label=typeof item.label==='string'?item.label.slice(0,80):new URL(url).hostname;
        bookmarks.push({url,label:label||new URL(url).hostname});
      }catch(_){}
    }
    return {tabs,active:ids.has(stored.active)?stored.active:tabs[0].id,bookmarks};
  }
  const state=load();
  let nextId=Math.max(...state.tabs.map(t=>t.id))+1;
  const tabsEl=$('browser-tabs'),bookmarksEl=$('browser-bookmarks');
  const address=$('browser-address'),frame=$('browser-preview');
  const status=$('browser-status'),placeholder=$('browser-placeholder');
  const external=$('browser-open-external');
  const back=$('browser-back'),forward=$('browser-forward'),reload=$('browser-reload');

  const active=()=>state.tabs.find(tab=>tab.id===state.active)||state.tabs[0];
  const current=()=>active().history[active().index]||'';
  function save(){
    try{window.localStorage?.setItem(STORAGE_KEY,JSON.stringify({version:1,
      tabs:state.tabs,active:state.active,bookmarks:state.bookmarks}));}catch(_){}
  }
  function node(tag,text,css=''){
    const element=document.createElement(tag);
    element.textContent=text;
    element.className=css;
    return element;
  }
  function siteLabel(url){
    try{return new URL(url).hostname.replace(/^www\./,'').slice(0,35);}catch(_){return 'New tab';}
  }
  function network(){
    $('browser-network-status').textContent=navigator.onLine===false?
      'Browser reports offline · websites may be unavailable':
      'Network may be available · internet access not verified';
  }
  function renderTabs(){
    tabsEl.replaceChildren();
    for(const tab of state.tabs){
      const item=node('div','','browser-tab'+(tab.id===state.active?' active':''));
      const select=node('button',siteLabel(tab.history[tab.index]||''),'browser-tab-select');
      select.type='button';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(tab.id===state.active));
      select.title=tab.history[tab.index]||'New browser tab';
      select.addEventListener('click',()=>{state.active=tab.id;save();refresh(false);});
      const close=node('button','×','browser-tab-close');close.type='button';close.title='Close tab';
      close.setAttribute('aria-label',`Close ${select.textContent}`);
      close.addEventListener('click',()=>{
        if(state.tabs.length===1){tab.history=[];tab.index=-1;}
        else{state.tabs=state.tabs.filter(item=>item.id!==tab.id);
          if(state.active===tab.id)state.active=state.tabs[0].id;}
        save();refresh(false);
      });
      item.append(select,close);tabsEl.append(item);
    }
    $('browser-tab-add').disabled=state.tabs.length>=MAX_TABS;
  }
  function renderBookmarks(){
    bookmarksEl.replaceChildren();
    if(!state.bookmarks.length){bookmarksEl.append(node('small','No bookmarks saved yet.','muted'));return;}
    for(const item of state.bookmarks){
      const wrap=node('div','','browser-bookmark');
      const open=node('button',item.label,'browser-bookmark-open');open.type='button';open.title=item.url;
      open.addEventListener('click',()=>navigate(item.url));
      const remove=node('button','×','browser-bookmark-remove');remove.type='button';
      remove.setAttribute('aria-label',`Remove bookmark ${item.label}`);
      remove.addEventListener('click',()=>{state.bookmarks=state.bookmarks.filter(b=>b.url!==item.url);
        save();renderBookmarks();status.textContent='Bookmark removed from this browser only.';});
      wrap.append(open,remove);bookmarksEl.append(wrap);
    }
  }
  function showPreview(url){
    if(!url){frame.hidden=true;frame.src='about:blank';placeholder.hidden=false;
      status.textContent='New tab. Nothing is loaded until you choose a website.';return;}
    if(!url.startsWith('https://')){
      frame.hidden=true;frame.src='about:blank';placeholder.hidden=false;
      status.textContent='HTTP websites cannot be shown in the restricted preview. Use Full browser.';return;
    }
    frame.hidden=false;placeholder.hidden=true;frame.src=url;
    status.textContent='Trying an isolated website preview. If the site refuses embedding or login, use Full browser. This is not a full browser engine.';
  }
  function refresh(preview){
    const url=current();address.value=url;
    external.setAttribute('aria-disabled',String(!url));
    if(url){external.href=url;external.tabIndex=0;}
    else{external.removeAttribute('href');external.tabIndex=-1;}
    back.disabled=active().index<=0;
    forward.disabled=active().index>=active().history.length-1;
    reload.disabled=!url;
    $('browser-bookmark-add').disabled=!url;
    renderTabs();renderBookmarks();
    if(preview)showPreview(url);
    else{frame.hidden=true;frame.src='about:blank';placeholder.hidden=false;
      status.textContent=url?'Saved address restored. Choose Go to preview, or Full browser for normal browsing.':'New tab. Nothing has been loaded.';}
  }
  function navigate(url){
    const safe=validatedUrl(url),tab=active();
    if(tab.history[tab.index]!==safe){
      tab.history=tab.history.slice(0,tab.index+1);
      tab.history.push(safe);
      if(tab.history.length>MAX_HISTORY)tab.history.shift();
      tab.index=tab.history.length-1;
    }
    save();refresh(true);
  }
  $('browser-address-form').addEventListener('submit',event=>{
    event.preventDefault();
    try{navigate(normalizeAddress(address.value));}
    catch(error){status.textContent=`Address rejected: ${error.message}`;}
  });
  $('browser-tab-add').addEventListener('click',()=>{
    if(state.tabs.length>=MAX_TABS){status.textContent='Maximum 8 browser tabs. Close a tab to open another.';return;}
    const tab={id:nextId++,history:[],index:-1};state.tabs.push(tab);state.active=tab.id;
    save();refresh(false);address.focus({preventScroll:true});
  });
  back.addEventListener('click',()=>{if(active().index>0){active().index--;save();refresh(true);}});
  forward.addEventListener('click',()=>{if(active().index<active().history.length-1){active().index++;save();refresh(true);}});
  reload.addEventListener('click',()=>{if(current())showPreview(current());});
  $('browser-home').addEventListener('click',()=>{
    const tab=active();tab.history=tab.history.slice(0,tab.index+1);
    if(tab.history[tab.index]!=='')tab.history.push('');
    if(tab.history.length>MAX_HISTORY)tab.history.shift();
    tab.index=tab.history.length-1;save();refresh(false);
  });
  $('browser-bookmark-add').addEventListener('click',()=>{
    const url=current();if(!url)return;
    if(state.bookmarks.some(b=>b.url===url)){status.textContent='Already bookmarked on this device.';return;}
    if(state.bookmarks.length>=MAX_BOOKMARKS){status.textContent='Maximum 24 bookmarks. Remove one before saving more.';return;}
    state.bookmarks.push({url,label:siteLabel(url)});save();renderBookmarks();
    status.textContent='Saved bookmark locally; no website was contacted.';
  });
  external.addEventListener('click',event=>{
    if(!current()){event.preventDefault();return;}
    status.textContent='Opened in a separate full-browser tab. That browser manages downloads and internal page history.';
  });
  document.addEventListener('openrf:browser-shown',()=>{network();});
  window.addEventListener('online',network);window.addEventListener('offline',network);
  network();refresh(false); // No external website loads when OpenRF starts.
  window.OpenRFBrowserWorkspace=Object.freeze({normalizeAddress,validatedUrl,current:()=>current()});
})();
