'use strict';
/* Local-only, on-demand Electron resource snapshot. This deliberately excludes
   PIDs, URLs, filesystem paths and the contents of browsing sessions. */
function runtimeMetrics({app, electronProcess, openTabs = 0, backendOwned = false}) {
  const metrics = app.getAppMetrics();
  const system = electronProcess.getSystemMemoryInfo();
  const validKiB = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const workingSets = metrics.map(metric => validKiB(metric?.memory?.workingSetSize));
  const cpuSamples = metrics.map(metric => metric?.cpu?.percentCPUUsage);
  const cpuValid = cpuSamples.length > 0 && cpuSamples.every(value => Number.isFinite(value) && value >= 0);
  return {
    kind: 'OPENRF_NATIVE_RUNTIME', read_only: true, unit: 'KiB',
    process_count: metrics.length,
    // Process working sets share physical pages. This is NOT unique app RAM.
    process_working_sets_kib: workingSets.length > 0 && workingSets.every(value => value !== null)
      ? workingSets.reduce((total, value) => total + value, 0) : null,
    cpu_sample_percent: cpuValid ? Math.round(cpuSamples.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    system_total_kib: validKiB(system?.total),
    system_available_kib: validKiB(system?.available),
    open_browser_tabs: openTabs,
    backend_owned: backendOwned,
  };
}
module.exports = {runtimeMetrics};
