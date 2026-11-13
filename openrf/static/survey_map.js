/* OpenRF v0.2.40 — offline, read-only observer-position survey presentation.
 * Never derives a transmitter position, combines % with dBm, or collects data.
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OpenRFSurveyMap = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const KINDS = Object.freeze(['WIFI','BLE','RF','CELLULAR','INFRASTRUCTURE','MANUAL']);
  const WIRELESS = Object.freeze(['WIFI','BLE','RF','CELLULAR']);
  const KIND_COLORS = Object.freeze({WIFI:'#53a9ff',BLE:'#ae8cff',RF:'#efaa53',CELLULAR:'#f07b8d',INFRASTRUCTURE:'#e9f0f1',MANUAL:'#30dec0'});
  const METRIC_COLORS = Object.freeze({high:'#34c9b1',medium:'#f6cd69',low:'#ec8293',unavailable:'#728b95',demo:'#efa947'});
  const WINDOWS = Object.freeze({all:0,day:86400000,week:604800000,month:2592000000});
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const point = observation => observation && number(observation.latitude) && number(observation.longitude) &&
    Number(observation.latitude) >= -90 && Number(observation.latitude) <= 90 &&
    Number(observation.longitude) >= -180 && Number(observation.longitude) <= 180;
  function visible(observations, options = {}, now = Date.now()) {
    const kinds = Array.isArray(options.kinds) ? options.kinds : KINDS;
    const days = Object.prototype.hasOwnProperty.call(WINDOWS, options.window) ? WINDOWS[options.window] : 0;
    return (observations || []).filter(o => {
      if (!point(o) || !kinds.includes(o.kind) || (!options.includeDemo && o.source === 'DEMO')) return false;
      if (!days) return true;
      const instant = Date.parse(o.observed_at);
      return Number.isFinite(instant) && instant <= now && instant >= now - days;
    });
  }
  function display(observation, mode = 'kind') {
    if (observation.source === 'DEMO') return {color:METRIC_COLORS.demo, category:'demo', label:'DEMO / HISTORICAL — not live'};
    if (mode === 'rssi') {
      if (!WIRELESS.includes(observation.kind) || !number(observation.rssi_dbm))
        return {color:METRIC_COLORS.unavailable, category:'unavailable', label:'No recorded RSSI in dBm'};
      const value = Number(observation.rssi_dbm);
      const category = value >= -60 ? 'high' : value >= -80 ? 'medium' : 'low';
      return {color:METRIC_COLORS[category], category, label:`Recorded RSSI ${value} dBm`};
    }
    if (mode === 'quality') {
      if (observation.kind !== 'WIFI' || !number(observation.signal_quality_percent))
        return {color:METRIC_COLORS.unavailable, category:'unavailable', label:'No recorded Wi-Fi quality percentage'};
      const value=Number(observation.signal_quality_percent);
      if (value < 0 || value > 100) return {color:METRIC_COLORS.unavailable,category:'unavailable',label:'Invalid Wi-Fi quality percentage'};
      const category = value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low';
      return {color:METRIC_COLORS[category], category, label:`Recorded NetworkManager quality ${value}% (NOT RSSI)`};
    }
    return {color:KIND_COLORS[observation.kind] || METRIC_COLORS.unavailable, category:observation.kind || 'unavailable', label:`Recorded category: ${observation.kind}`};
  }
  function counts(items) {
    const wireless = items.filter(o=>WIRELESS.includes(o.kind));
    return {total:items.length, wireless:wireless.length, wifi:wireless.filter(o=>o.kind==='WIFI').length,
      ble:wireless.filter(o=>o.kind==='BLE').length,
      rssi:wireless.filter(o=>number(o.rssi_dbm)).length,
      quality:wireless.filter(o=>o.kind==='WIFI' && number(o.signal_quality_percent)).length,
      noCoordinates:0};
  }
  function seriesForRecord(observations, record, engine, includeDemo=false) {
    if (!engine || !record || !WIRELESS.includes(record.kind)) return [];
    return engine.makeSeries(observations || [], includeDemo).filter(series =>
      series.rows.some(row=>row.id === record.id));
  }
  function historySummary(series, engine) {
    if (!series || !engine) return null;
    const history=engine.history(series,'all');
    const comparison=engine.compare(series,{mode:'time'});
    return {series, history, comparison:comparison.error ? null : comparison};
  }
  function recent(items, limit=12) {
    return items.filter(o=>WIRELESS.includes(o.kind)).slice().sort((a,b)=>
      (Date.parse(b.observed_at)||0)-(Date.parse(a.observed_at)||0) || (Number(b.id)||0)-(Number(a.id)||0))
      .slice(0,limit);
  }
  // A "survey" is a set of SAVED measurements at receiver positions, never a
  // transmitter location, travel track, signal heatmap or distance estimate.
  function spatialSeries(series, limit=80) {
    const rows = ((series && series.rows) || []).filter(point).filter(r=>number(r._value) && Number.isFinite(Date.parse(r.observed_at)));
    const sites = new Set(rows.map(r=>`${Number(r.latitude).toFixed(5)},${Number(r.longitude).toFixed(5)}`));
    const cap = Math.max(2,Math.min(200,Math.floor(limit)||80));
    const samples = rows.slice(-cap).map(r=>({
      id:r.id, lat:Number(r.latitude), lon:Number(r.longitude), value:Number(r._value),
      observed_at:r.observed_at, accuracy_m:number(r.accuracy_m) && Number(r.accuracy_m)>=0?Number(r.accuracy_m):null,
      location_source:r.location_source || 'UNSPECIFIED', session_id:r.session_id ?? null,
      source:r.source, timestamp_basis:r.timestamp_basis || null
    }));
    // Count nonoverlapping uncertainty circles only where BOTH reported accuracies
    // exist. This is descriptive evidence, not a localization algorithm.
    let definiteSeparation=0, comparablePairs=0;
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1], b=samples[i];
      if(a.accuracy_m===null || b.accuracy_m===null)continue;
      comparablePairs++;
      const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
      const dlat=(b.lat-a.lat)*Math.PI/180, dlon=(b.lon-a.lon)*Math.PI/180;
      const hav=Math.sin(dlat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
      const distance=6371000*2*Math.asin(Math.min(1,Math.sqrt(hav)));
      if(distance>a.accuracy_m+b.accuracy_m)definiteSeparation++;
    }
    return {rows, samples, total:rows.length, displayed:samples.length, reportedSites:sites.size,
      definiteSeparation, comparablePairs, truncated:rows.length>samples.length,
      metric:series?.metric || null, unit:series?.unit || null};
  }
  function timeline(samples) {
    if(!samples.length)return null;
    const times=samples.map(r=>Date.parse(r.observed_at));
    const values=samples.map(r=>r.value);
    const first=times[0],last=times[times.length-1],low=Math.min(...values),high=Math.max(...values);
    const pts=samples.map((r,i)=>({
      x:18+((last===first?(samples.length===1?.5:i/(samples.length-1)):(times[i]-first)/(last-first))*330),
      y:110-((r.value-low)/(high-low||1))*90
    }));
    return {points:pts,polyline:pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),low,high,
      first:samples[0].observed_at,last:samples[samples.length-1].observed_at,equalTimestamps:last===first};
  }
  return Object.freeze({KINDS,WIRELESS,KIND_COLORS,METRIC_COLORS,WINDOWS,number,point,visible,display,counts,seriesForRecord,historySummary,recent,spatialSeries,timeline});
});
