/* OpenRF saved-observation comparison. Pure, offline, read-only; no network/telemetry. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OpenRFHistoryAnalysis = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const wirelessKinds = new Set(['WIFI', 'BLE', 'RF', 'CELLULAR']);
  const measures = [
    {field:'rssi_dbm', name:'RSSI', unit:'dBm'},
    {field:'signal_quality_percent', name:'NetworkManager quality', unit:'%'}
  ];
  function finite(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }
  function identity(obs, measure) {
    // The same identifier from two receivers/frequencies/sources is NOT one series.
    const frequency = finite(obs.frequency_mhz) ? Number(obs.frequency_mhz) : null;
    return [obs.kind, obs.identifier, measure.field, obs.source,
      obs.source_device || '', obs.hardware_id || '', frequency];
  }
  function makeSeries(observations, includeDemo = false) {
    const groups = new Map();
    for (const obs of observations || []) {
      if (!obs || !wirelessKinds.has(obs.kind) || !obs.identifier || (!includeDemo && obs.source === 'DEMO')) continue;
      const instant = timestamp(obs.observed_at);
      if (instant === null) continue;
      for (const measure of measures) {
        if (!finite(obs[measure.field])) continue;
        const signature = identity(obs, measure);
        const key = JSON.stringify(signature);
        if (!groups.has(key)) {
          groups.set(key, {key, kind:obs.kind, identifier:obs.identifier, metric:measure.field,
            metricName:measure.name, unit:measure.unit, source:obs.source,
            source_device:obs.source_device || 'Unspecified device',
            hardware_id:obs.hardware_id || null, frequency_mhz:signature[6], rows:[]});
        }
        groups.get(key).rows.push({...obs, _time:instant, _value:Number(obs[measure.field])});
      }
    }
    return [...groups.values()].map(g => ({...g, rows:g.rows.sort((a,b)=>a._time-b._time || (a.id || 0)-(b.id || 0))}))
      .sort((a,b)=>`${a.kind} ${a.identifier} ${a.metricName} ${a.source} ${a.source_device}`.localeCompare(`${b.kind} ${b.identifier} ${b.metricName} ${b.source} ${b.source_device}`));
  }
  function median(values) {
    if (!values.length) return null;
    const ordered = values.slice().sort((a,b)=>a-b);
    const center = Math.floor(ordered.length/2);
    return ordered.length % 2 ? ordered[center] : (ordered[center-1]+ordered[center])/2;
  }
  function statistics(rows) {
    if (!rows.length) return null;
    const values = rows.map(o=>o._value);
    return {count:rows.length, median:median(values), min:Math.min(...values), max:Math.max(...values),
      first:rows[0].observed_at, last:rows[rows.length-1].observed_at};
  }
  function sessionKey(value) {
    return value === null || value === undefined ? '' : String(value);
  }
  function compare(series, options = {}) {
    if (!series) return {error:'Select a saved measurement series.', before:[], after:[]};
    const mode = options.mode === 'sessions' ? 'sessions' : 'time';
    const rows = series.rows;
    let before = [], after = [];
    if (mode === 'sessions') {
      const a = String(options.beforeSession || '');
      const b = String(options.afterSession || '');
      if (!a || !b || a === b) return {error:'Choose two different investigation sessions.', before, after};
      before = rows.filter(row=>sessionKey(row.session_id) === a);
      after = rows.filter(row=>sessionKey(row.session_id) === b);
    } else if (rows.length >= 2) {
      const mid = Math.floor(rows.length/2);
      before = rows.slice(0,mid);
      after = rows.slice(mid);
    }
    if (!before.length || !after.length) {
      return {error:mode === 'sessions' ? 'This series needs at least one saved reading in each selected session.' : 'At least two timestamped saved readings are needed for an earlier/later comparison.', before, after};
    }
    const base = statistics(before), follow = statistics(after);
    const warning = [];
    if (series.source === 'DEMO') warning.push('SYNTHETIC DEMO / HISTORICAL — never live RF data.');
    if (series.source === 'MANUAL' || series.source === 'IMPORTED') warning.push('Manual/imported measurements are not independently verified.');
    if (!series.hardware_id && series.source === 'SENSOR') warning.push('Sensor hardware identity is missing or unverified.');
    if (series.metric === 'signal_quality_percent') warning.push('NetworkManager quality percentages are not RSSI dBm; Wi-Fi scans may be cached.');
    if (rows.some(r=>r.timestamp_basis === 'HOST_RETRIEVAL' || r.timestamp_basis === 'HOST_RECEIPT' || r.timestamp_basis === 'RETRIEVAL_ONLY' || r.timestamp_basis === 'HOST_RETRIEVAL_ONLY')) warning.push('At least one sensor time reflects host retrieval, not a verified measurement instant.');
    const locationKey = r=> Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) && r.latitude !== null && r.longitude !== null ? `${Number(r.latitude).toFixed(3)},${Number(r.longitude).toFixed(3)}` : '';
    const sites = new Set([...before,...after].map(locationKey).filter(Boolean));
    if (sites.size > 1) warning.push('Readings have different observer locations; signal variation does not establish direction, distance, or transmitter position.');
    if (!sites.size) warning.push('No observer coordinates available for these readings.');
    if (mode === 'time' && before[before.length-1]._time === after[0]._time) warning.push('Some readings share a timestamp; the split is by saved-record order, not a verified elapsed interval.');
    if (rows.length >= 10000) warning.push('The API loads at most the latest 10,000 observations; earlier history may be incomplete.');
    warning.push('Descriptive comparison only. Receiver orientation, antenna, location and conditions affect values.');
    return {mode, before, after, baseline:base, followup:follow, delta:follow.median-base.median, warnings:warning};
  }
  return Object.freeze({makeSeries, median, compare});
});
