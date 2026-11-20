/* v0.2.152 — user-triggered Linux NetworkManager quick-connect.
   No Wi-Fi password is stored in browser storage or an OpenRF database. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const button = el('header-wifi-button');
  const panel = el('header-wifi-panel');
  if (!button || !panel) return;
  const status = el('header-wifi-status');
  const list = el('header-wifi-list');
  const form = el('header-wifi-connect-form');
  const password = el('header-wifi-password');
  let selected = null;
  let busy = false;

  function showStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function closePanel(returnFocus = false) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    password.value = '';
    form.hidden = true;
    selected = null;
    if (returnFocus) button.focus();
  }
  async function jsonRequest(path, action, body) {
    const options = action ? {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-OpenRF-Wifi-Consent': action},
      body: JSON.stringify(body)
    } : {cache: 'no-store'};
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `Wi-Fi request failed (${response.status}).`);
    return data;
  }
  async function refreshStatus() {
    try {
      const data = await jsonRequest('/api/network/wifi/status');
      button.dataset.wifi = data.available ? (data.connected ? 'connected' : 'available') : 'unavailable';
      button.title = data.available ? (data.connected ? `Wi-Fi connected: ${data.connection || 'Linux connection'}` : 'Wi-Fi ready; select a network') : 'Wi-Fi management unavailable on this Linux host';
      showStatus(data.available ? (data.connected ? `Connected profile: ${data.connection || 'Linux Wi-Fi'} · Internet not verified` : `Wi-Fi ready on ${data.interface}. Tap Find nearby networks.`) : data.reason);
      el('header-wifi-scan').disabled = !data.available;
    } catch (error) {
      button.dataset.wifi = 'unavailable';
      el('header-wifi-scan').disabled = true;
      showStatus(`Could not check Linux Wi-Fi: ${error.message}`, true);
    }
  }
  function selectNetwork(item) {
    selected = item;
    form.hidden = false;
    el('header-wifi-selected').textContent = item.ssid;
    const passwordRequired = item.security_kind === 'password';
    el('header-wifi-password-row').hidden = !passwordRequired;
    password.value = '';
    el('header-wifi-connect').textContent = passwordRequired ? 'Connect' : 'Join open network';
    showStatus(`Selected ${item.ssid}. Joining may disconnect the current network.`);
    (passwordRequired ? password : el('header-wifi-connect')).focus();
  }
  function renderNetworks(networks) {
    list.replaceChildren();
    form.hidden = true;
    password.value = '';
    selected = null;
    if (!networks.length) {
      const empty = document.createElement('p');
      empty.className = 'small muted';
      empty.textContent = 'No named networks returned. Hidden and enterprise networks require system network settings.';
      list.append(empty);
      return;
    }
    for (const network of networks) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'header-wifi-network';
      const name = document.createElement('strong');
      name.textContent = network.ssid;
      const details = document.createElement('small');
      details.textContent = `${network.connected ? 'Connected · ' : ''}${network.signal_quality_percent}% signal · ${network.security_kind === 'open' ? 'Open' : network.security} · ${network.band}`;
      option.append(name, details);
      if (network.connected) option.dataset.connected = 'true';
      if (network.security_kind === 'unsupported' || network.connected) {
        option.disabled = true;
        if (network.security_kind === 'unsupported') option.title = 'Use system network settings for this security type';
      } else option.addEventListener('click', () => selectNetwork(network));
      list.append(option);
    }
  }
  button.addEventListener('click', async () => {
    if (!panel.hidden) { closePanel(); return; }
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    await refreshStatus();
  });
  el('header-wifi-close').addEventListener('click', () => closePanel(true));
  el('header-wifi-cancel').addEventListener('click', () => { form.hidden = true; selected = null; password.value = ''; });
  el('header-wifi-scan').addEventListener('click', async () => {
    if (busy) return;
    busy = true; el('header-wifi-scan').disabled = true;
    showStatus('Scanning with Linux NetworkManager…');
    try {
      const data = await jsonRequest('/api/network/wifi/scan', 'scan', {});
      renderNetworks(data.networks || []);
      showStatus(`Found ${(data.networks || []).length} named networks. Select one to connect. Results may include cached entries.`);
    } catch (error) { showStatus(error.message, true); }
    finally { busy = false; el('header-wifi-scan').disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected || busy) return;
    if (selected.security_kind === 'password' && !password.value) { showStatus('Enter the Wi-Fi password.', true); password.focus(); return; }
    busy = true; el('header-wifi-connect').disabled = true;
    const target = selected.ssid;
    showStatus(`Connecting to ${target}…`);
    try {
      const result = await jsonRequest('/api/network/wifi/connect', 'connect', {ssid: target, password: password.value, confirm: true});
      showStatus(`Connected to ${result.ssid}. Internet access is not verified.`);
      list.replaceChildren(); form.hidden = true; selected = null;
      await refreshStatus();
    } catch (error) { showStatus(error.message, true); }
    finally { password.value = ''; busy = false; el('header-wifi-connect').disabled = false; }
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !event.target.closest('#header-wifi-menu')) closePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); closePanel(true); }
  });
  // Only a read-only status query runs at startup; scans/joins are opt-in.
  void refreshStatus();
})();
