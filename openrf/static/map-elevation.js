/* OpenRF v0.2.143 — presentation of reported altitude only; never estimates it. */
(() => {
  'use strict';
  const root=document.getElementById('map-altimeter');
  const value=document.getElementById('map-altimeter-value');
  const detail=document.getElementById('map-altimeter-detail');
  if(!root || !value || !detail)return;
  const METERS_TO_FEET=3.280839895;
  const MAX_AGE_MS=45000;
  let last=null;
  let unavailable='GPS unavailable';

  function render(){
    const age=last?Date.now()-last.time:Infinity;
    if(!last || !Number.isFinite(age) || age< -5000 || age>MAX_AGE_MS){
      value.textContent='— ft';
      detail.textContent=last?'GPS altitude stale':unavailable;
      root.dataset.altitude='unavailable';
      root.title=last?'The last reported altitude is stale. A new GPS reading is required.':unavailable;
      return;
    }
    const feet=Math.round(last.meters*METERS_TO_FEET);
    value.textContent=`${feet.toLocaleString('en-US')} ft`;
    const sourceLabel=last.reference==='msl'?'MSL':'GPS altitude';
    const accuracy=Number.isFinite(last.accuracy)?` ±${Math.round(last.accuracy*METERS_TO_FEET)} ft`:'';
    detail.textContent=sourceLabel+accuracy;
    root.dataset.altitude='reported';
    root.title=`${last.source} reported ${feet} ft (${sourceLabel}). ${Number.isFinite(last.accuracy)?`Vertical uncertainty reported as ±${Math.round(last.accuracy*METERS_TO_FEET)} ft.`:'Vertical accuracy was not supplied.'} Not a surveyed terrain elevation; GPS height references can differ.`;
  }

  function update(position){
    const coords=position?.coords;
    const time=position?.timestamp;
    const age=Date.now()-time;
    const altitude=coords?.altitude;
    if(!Number.isFinite(time) || !Number.isFinite(age) || age< -5000 || age>MAX_AGE_MS){
      last=null;unavailable='GPS fix stale';render();return false;
    }
    if(!Number.isFinite(altitude) || altitude< -500 || altitude>9000){
      last=null;unavailable='Altitude unavailable';render();return false;
    }
    const vertical=coords.altitudeAccuracy;
    last={meters:altitude,time,
      accuracy:Number.isFinite(vertical) && vertical>=0 && vertical<=10000?vertical:null,
      reference:coords.altitudeReference==='msl'?'msl':'ellipsoid',
      source:position.origin==='gpsd'?'Local GNSS':'Browser GPS'};
    render();return true;
  }
  render();
  // Age out the display without asking for a new GPS fix or storing a track.
  setInterval(render,5000);
  window.OpenRFMapElevation=Object.freeze({update,refresh:render});
})();
