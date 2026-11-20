'use strict';
/* v0.2.155 optional Raspberry Pi / Linux Chromium-based OpenRF window.
   OpenRF's loopback UI is trusted; remote websites are NOT. They use separate
   sandboxed WebContentsViews without Node, preload, local API access or permissions. */
const path=require('node:path');
const {app,BrowserWindow,WebContentsView,ipcMain,session}=require('electron');
const {isPublicWebUrl,isSafeRemoteRequest,parseLocalAppUrl,safeBounds}=require('./security');
const {ensureBackend,stopBackend,rootFor}=require('./backend');
const {runtimeMetrics}=require('./runtime-metrics');

const LOCAL_URL=parseLocalAppUrl(process.env.OPENRF_URL||'http://127.0.0.1:8765/');
const MAX_TABS=8;
let win=null,activeId=null,lastBounds=null,backendOwned=false;
const views=new Map();
const blank={x:0,y:0,width:0,height:0};

function display(){
  if(!win||win.isDestroyed())return;
  for(const [id,view] of views){
    const visible=Boolean(id===activeId&&lastBounds);
    // True visibility (not just 0x0 bounds) lets Chromium throttle background
    // tabs while preserving each page's DOM, session and history in memory.
    view.setVisible(visible);
    if(visible)view.setBounds(lastBounds);
  }
}
function tell(channel,detail){if(win&&!win.isDestroyed())win.webContents.send(channel,detail);}
function openView(id){
  if(views.has(id))return views.get(id);
  if(views.size>=MAX_TABS)throw Error('Close a browser tab before opening another');
  // Each remote tab has an in-memory, non-persistent Chromium cookie jar.
  const isolated=session.fromPartition('openrf-external-tab-'+id);
  isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  isolated.setPermissionCheckHandler(()=>false);
  isolated.webRequest.onBeforeRequest((details,callback)=>{
    callback({cancel:!isSafeRemoteRequest(details.url)});
  });
  // Unsolicited downloads and pop-ups require a later explicit, audited flow.
  isolated.on('will-download',(event)=>{event.preventDefault();tell('openrf-browser:status',
    {id,text:'Downloads are blocked in the embedded Chromium shell. Use a full external browser to save files.'});});
  const view=new WebContentsView({webPreferences:{session:isolated,
    sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,
    javascript:true,backgroundThrottling:true,allowRunningInsecureContent:false}});
  view.setBounds(blank);
  view.setVisible(false);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.webContents.on('will-navigate',(event,url)=>{if(!isPublicWebUrl(url))event.preventDefault();});
  const location=(_event,url)=>{if(isPublicWebUrl(url))tell('openrf-browser:location',{id,url});};
  view.webContents.on('did-navigate',location);
  view.webContents.on('did-navigate-in-page',location);
  view.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{
    if(isMainFrame&&code!==-3)tell('openrf-browser:status',{id,text:`Chromium could not open this page (${description}). Check Wi-Fi or try another URL.`});
  });
  view.webContents.on('render-process-gone',(_event,details)=>{
    tell('openrf-browser:status',{id,text:`This Chromium tab stopped (${details.reason}). Reload it or close the tab. OpenRF's map and saved data are unaffected.`});
  });
  win.contentView.addChildView(view);
  views.set(id,view);
  return view;
}
async function handle(event,request){
  if(!win||win.isDestroyed()||event.sender!==win.webContents||
     !event.senderFrame?.url.startsWith(LOCAL_URL))throw Error('Only OpenRF local UI can control the native browser');
  if(!request||typeof request!=='object')throw Error('Invalid browser request');
  const {kind,tabId,url,bounds}=request;
  if(!['open','select','resize','hide','close','back','forward','reload','runtime'].includes(kind))throw Error('Unknown browser command');
  if(kind==='runtime')return runtimeMetrics({app,electronProcess:process,openTabs:views.size,backendOwned});
  if(kind==='hide'){activeId=null;display();return {ok:true};}
  if(kind==='resize'){
    const valid=safeBounds(bounds,win.getContentSize());
    if(valid)lastBounds=valid;
    display();return {ok:Boolean(valid)};
  }
  if(!Number.isSafeInteger(tabId)||tabId<=0||tabId>1_000_000)throw Error('Invalid browser tab ID');
  if(kind==='close'){
    const view=views.get(tabId);
    if(view){views.delete(tabId);win.contentView.removeChildView(view);view.webContents.close();}
    if(activeId===tabId)activeId=null;
    display();return {ok:true};
  }
  if(kind==='open'&&!isPublicWebUrl(url))throw Error('Only public HTTP(S) website names are supported');
  if(kind==='open'||kind==='select'){
    const valid=safeBounds(bounds,win.getContentSize());
    if(!valid)throw Error('Native browser viewport is not visible');
    lastBounds=valid;
    if(kind==='select'&&!views.has(tabId)){activeId=null;display();return {ok:true,loaded:false};}
    const view=kind==='open'?openView(tabId):views.get(tabId);
    activeId=tabId;display();
    if(kind==='open'){
      // Start only on explicit Go. A native tab switched or restored never loads a URL by itself.
      void view.webContents.loadURL(url).catch(error=>tell('openrf-browser:status',
        {id:tabId,text:`Page load failed: ${error.message}`}));
    }
    return {ok:true,loaded:true};
  }
  const view=views.get(tabId);
  if(!view)return {ok:false,loaded:false};
  const history=view.webContents.navigationHistory;
  if(kind==='back'&&history.canGoBack())history.goBack();
  if(kind==='forward'&&history.canGoForward())history.goForward();
  if(kind==='reload')view.webContents.reload();
  return {ok:true,loaded:true};
}

async function createWindow(){
  win=new BrowserWindow({width:1280,height:800,minWidth:600,minHeight:420,
    backgroundColor:'#0b1620',autoHideMenuBar:true,show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
      backgroundThrottling:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(LOCAL_URL))event.preventDefault();});
  win.on('closed',()=>{
    for(const view of views.values())view.webContents.close();
    views.clear();win=null;
  });
  win.on('resize',display);
  await win.loadURL(LOCAL_URL);
  if(process.env.OPENRF_KIOSK==='1')win.setFullScreen(true);
  win.show();
}

// A second shell instance wastes memory and can race the same loopback port.
// Focus the first window; never parse or execute second-instance arguments.
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{
    if(win&&!win.isDestroyed()){
      if(win.isMinimized())win.restore();
      win.show();win.focus();
    }
  });
  ipcMain.handle('openrf-browser:action',handle);
  app.whenReady().then(async ()=>{
    const backend=await ensureBackend({url:LOCAL_URL,
      projectRoot:rootFor(process.resourcesPath,__dirname),
      python:process.env.OPENRF_PYTHON||'python3'});
    backendOwned=backend.owned;
    await createWindow();
  }).catch(error=>{console.error('OpenRF native shell:',error.message);stopBackend();app.quit();});
}
app.on('before-quit',stopBackend);
app.on('window-all-closed',()=>app.quit());
