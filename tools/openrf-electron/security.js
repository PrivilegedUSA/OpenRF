'use strict';
/* URL/geometry validation shared by the optional native Chromium shell. */
const net=require('node:net');

function urlObject(candidate){
  if(typeof candidate!=='string'||candidate.length<1||candidate.length>2048||/[\u0000-\u001f<>]/.test(candidate))return null;
  try{return new URL(candidate);}catch(_){return null;}
}
function isPublicWebUrl(candidate){
  const url=urlObject(candidate);if(!url||!['http:','https:'].includes(url.protocol)||url.username||url.password)return false;
  const host=url.hostname.toLowerCase().replace(/\.$/,'').replace(/^\[(.*)\]$/,'$1');
  return host.includes('.')&&!host.includes('..')&&/^[a-z0-9.-]+$/.test(host)&&
    !['localhost','local','internal','lan','test'].some(s=>host===s||host.endsWith('.'+s))&&
    !net.isIP(host)&&!/^\d+(?:\.\d+)*$/.test(host);
}
function isSafeRemoteRequest(candidate){
  const url=urlObject(candidate);if(!url)return false;
  if(['data:','blob:','about:'].includes(url.protocol))return true;
  return isPublicWebUrl(candidate);
}
function parseLocalAppUrl(candidate){
  const url=urlObject(candidate);
  if(!url||url.protocol!=='http:'||url.username||url.password||
     !['127.0.0.1','localhost','[::1]'].includes(url.hostname.toLowerCase())||
     !/^\/+$/.test(url.pathname)||url.search||url.hash||
     !Number.isInteger(Number(url.port))||Number(url.port)<1||Number(url.port)>65535)
    throw Error('OPENRF_URL must be an explicit http://127.0.0.1:PORT address');
  return url.origin+'/';
}
function safeBounds(input,size){
  if(!input||!size||!['x','y','width','height'].every(key=>Number.isFinite(input[key])))return null;
  const w=Math.round(size[0]),h=Math.round(size[1]);
  if(w<320||h<240)return null;
  const x=Math.max(0,Math.round(input.x)),y=Math.max(0,Math.round(input.y));
  const width=Math.min(w-x,Math.round(input.width)),height=Math.min(h-y,Math.round(input.height));
  if(x>=w||y>=h||width<150||height<120)return null;
  return {x,y,width,height};
}
module.exports={isPublicWebUrl,isSafeRemoteRequest,parseLocalAppUrl,safeBounds};
