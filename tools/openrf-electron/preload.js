'use strict';
/* Trusted OpenRF UI only. Remote WebContentsViews never receive this preload. */
const {contextBridge,ipcRenderer}=require('electron');
const action=(kind,tabId=0,url='',bounds=null)=>ipcRenderer.invoke('openrf-browser:action',
  {kind,tabId,url,bounds});
contextBridge.exposeInMainWorld('openrfNativeBrowser',Object.freeze({
  available:true,
  open:(tabId,url,bounds)=>action('open',tabId,url,bounds),
  select:(tabId,bounds)=>action('select',tabId,'',bounds),
  resize:bounds=>action('resize',0,'',bounds),
  hide:()=>action('hide'),
  close:tabId=>action('close',tabId),
  back:tabId=>action('back',tabId),
  forward:tabId=>action('forward',tabId),
  reload:tabId=>action('reload',tabId),
  onLocation:handler=>{if(typeof handler==='function')ipcRenderer.on('openrf-browser:location',(_,detail)=>handler(detail));},
  onStatus:handler=>{if(typeof handler==='function')ipcRenderer.on('openrf-browser:status',(_,detail)=>handler(detail));},
}));
