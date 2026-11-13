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
  return Object.freeze({KINDS,WIRELESS,KIND_COLORS,METRIC_COLORS,WINDOWS,number,point,visible,display,counts,seriesForRecord,historySummary,recent});
});
