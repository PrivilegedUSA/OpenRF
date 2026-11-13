/* OpenRF 0.2.46: browser-local, read-only SDR frequency-bin inspection.
 * No signal classification, source location, power calibration, time-zone inference,
 * recording, uploading, or hidden background scan.
 */
(function (global) {
  'use strict';
  const MAX_BINS = 4096;
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function checkRange(range) {
    if (!range || !finite(range.min) || !finite(range.max) || range.min < 0 || range.max > 30000 || range.min >= range.max) {
      throw Error('Select a valid display frequency range before analyzing data.');
    }
  }
  function averagedBins(data, range) {
    checkRange(range);
    if (!data || !Array.isArray(data.frames) || !data.frames.length) throw Error('Load a recorded or historical CSV or an explicitly marked DEMO.');
    const map = new Map();
    let sampleCount = 0;
    for (const frame of data.frames.slice(0, 160)) {
      if (!frame || !Array.isArray(frame.bins)) continue;
      for (const bin of frame.bins.slice(0, MAX_BINS)) {
        if (!bin || !finite(bin.mhz) || !finite(bin.db) || bin.mhz < range.min || bin.mhz > range.max || bin.db < -300 || bin.db > 150) continue;
        // 1-Hz exact bin centers. Do not interpolate between different tuner/step grids.
        const hz = Math.round(bin.mhz * 1e6);
        if (!Number.isSafeInteger(hz) || hz < 0) continue;
        let item = map.get(hz);
        if (!item) {
          if (map.size >= MAX_BINS) continue;
          item = {hz, sum: 0, samples: 0}; map.set(hz, item);
        }
        item.sum += bin.db;
        item.samples++;
        sampleCount++;
      }
    }
    const bins = [...map.values()].map(b => ({hz: b.hz, mhz: b.hz / 1e6, db: b.sum / b.samples, samples: b.samples}));
    bins.sort((a, b) => a.hz - b.hz);
    if (!bins.length) throw Error('There are no valid measured bins inside the selected display range.');
    return {bins, sampleCount, frames: data.frames.length, demo: data.kind === 'SYNTHETIC_DEMO_NOT_LIVE'};
  }
  function median(values) {
    if (!values.length) return NaN;
    const sorted = values.slice().sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  }
  function spacing(bins) {
    const steps = [];
    for (let i = 1; i < bins.length; i++) if (bins[i].hz > bins[i - 1].hz) steps.push(bins[i].hz - bins[i - 1].hz);
    return median(steps) || 1;
  }
  function distinctStrongest(bins, key, limit = 8, absolute = true) {
    const apart = spacing(bins) * 2;
    const selected = [];
    for (const bin of bins.slice().sort((a, b) => (absolute ? Math.abs(b[key]) - Math.abs(a[key]) : b[key] - a[key]) || a.hz - b.hz)) {
      if (selected.every(x => Math.abs(x.hz - bin.hz) >= apart)) selected.push(bin);
      if (selected.length >= limit) break;
    }
    return selected;
  }
  function analyzeSpectrum(data, range) {
    const avg = averagedBins(data, range), center = median(avg.bins.map(b => b.db));
    const strongest = distinctStrongest(avg.bins.map(b => ({...b, relativeDb: b.db - center})), 'db', 8, false);
    return {binCount: avg.bins.length, sampleCount: avg.sampleCount, frames: avg.frames, demo: avg.demo,
      medianDb: center, strongest};
  }
  function compareSpectra(current, baseline, range) {
    const a = averagedBins(current, range), b = averagedBins(baseline, range);
    const base = new Map(b.bins.map(x => [x.hz, x]));
    const matched = [];
    for (const x of a.bins) {
      const y = base.get(x.hz);
      if (y) matched.push({hz: x.hz, mhz: x.mhz, currentDb: x.db, baselineDb: y.db,
        deltaDb: x.db - y.db, currentSamples: x.samples, baselineSamples: y.samples});
    }
    const overlapRatio = matched.length / Math.min(a.bins.length, b.bins.length);
    if (matched.length < 3 || overlapRatio < 0.6) {
      throw Error(`Frequency grids do not align sufficiently (${matched.length} shared bins; ${Math.round(overlapRatio * 100)}% of smaller grid). Use recordings with the same tuning/step settings; no interpolation is applied.`);
    }
    const notable = distinctStrongest(matched, 'deltaDb');
    return {matched, notable, matchedBins: matched.length, currentBins: a.bins.length,
      baselineBins: b.bins.length, overlapRatio, demo: a.demo || b.demo,
      medianDeltaDb: median(matched.map(x => x.deltaDb))};
  }
  function comparisonCsv(result) {
    if (!result || !Array.isArray(result.matched)) throw Error('Run a comparison before exporting.');
    const lines = ['# OpenRF OFFLINE BIN COMPARISON - not calibrated dBm; no signal or source identification',
      `# ${result.demo ? 'SYNTHETIC DEMO INVOLVED - NOT MEASURED' : 'RECORDED / HISTORICAL DATA - NOT LIVE'}; receiver configuration and gain not verified`,
      'frequency_mhz,current_mean_reported_db,baseline_mean_reported_db,current_minus_baseline_db,current_bin_samples,baseline_bin_samples'];
    for (const x of result.matched) lines.push([x.mhz.toFixed(6), x.currentDb.toFixed(3), x.baselineDb.toFixed(3),
      x.deltaDb.toFixed(3), x.currentSamples, x.baselineSamples].join(','));
    return lines.join('\r\n') + '\r\n';
  }
  const api = {averagedBins, analyzeSpectrum, compareSpectra, comparisonCsv};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.OpenRFSpectrumAnalysis = api;
})(typeof window === 'undefined' ? globalThis : window);
