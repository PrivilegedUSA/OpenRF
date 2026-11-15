'use strict';
/* GPS freshness is based on the source fix timestamp, not repeated polling.
   Never turn an old cached location into a fresh vehicle position. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.OpenRFNavigationHealth=api;
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function status(startedAt,lastValidAt,now=Date.now(),timeoutMs=15000){
    if(!Number.isFinite(startedAt)||startedAt<=0)return 'inactive';
    if(!Number.isFinite(now)||!Number.isFinite(timeoutMs)||timeoutMs<=0)return 'inactive';
    const last=Number.isFinite(lastValidAt)&&lastValidAt>0?lastValidAt:0;
    const reference=last||startedAt;
    if(now-reference>=timeoutMs)return 'lost';
    return last?'fresh':'waiting';
  }
  return {status};
});
