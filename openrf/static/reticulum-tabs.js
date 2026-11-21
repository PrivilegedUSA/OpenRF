/* OpenRF v0.2.162 — Reticulum inbox-first tabs; no optional calling stack. */
(() => {
  'use strict';
  const root = document.getElementById('page-reticulum');
  const bar = document.getElementById('reticulum-tabs');
  const parent = document.getElementById('reticulum-panel');
  if (!root || !bar || !parent) return;

  const names = ['inbox', 'dashboard', 'connections', 'files'];
  const tabs = new Map();
  const panels = new Map();
  for (const name of names) {
    const button = document.getElementById(`reticulum-tab-${name}`);
    if (!button) return;
    tabs.set(name, button);
    const section = document.createElement('section');
    section.className = 'reticulum-tab-panel';
    section.id = `reticulum-tab-panel-${name}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', button.id);
    section.hidden = name !== 'inbox';
    panels.set(name, section);
  }

  // Move the existing elements, never clone or re-create them. The original
  // LXMF, RNode, Bluetooth and contact listeners keep their state and nodes.
  const contents = [...parent.children];
  const categories = contents.map((element, index) => {
    if (index < 4 || element.querySelector('#reticulum-enable, #reticulum-announce, #reticulum-address') ||
        element.previousElementSibling?.querySelector('#reticulum-address')) return 'dashboard';
    if (element.matches('.reticulum-tcp-settings, #reticulum-halow-panel, #reticulum-rnode-panel, #reticulum-diagnostics-panel')) return 'connections';
    if (element.id === 'reticulum-files-panel') return 'files';
    return 'inbox';
  });
  for (let i = 0; i < contents.length; i++) panels.get(categories[i]).append(contents[i]);

  const inbox = panels.get('inbox');
  const inboxIntro = document.createElement('div');
  inboxIntro.className = 'reticulum-tab-intro';
  inboxIntro.innerHTML = '<p>Conversations, attachments and voice notes. Reticulum must be enabled to exchange messages.</p><button type="button" class="btn mini outline" data-reticulum-open="dashboard">Enable or check messaging</button>';
  inbox.prepend(inboxIntro);

  const dashboard = panels.get('dashboard');
  const dashboardLinks = document.createElement('div');
  dashboardLinks.className = 'reticulum-tab-shortcuts';
  dashboardLinks.innerHTML = '<button type="button" class="btn outline" data-reticulum-open="inbox">Open inbox</button><button type="button" class="btn outline" data-reticulum-open="connections">Connection settings</button><button type="button" class="btn outline" data-reticulum-open="files">File sharing</button>';
  dashboard.append(dashboardLinks);

  const connections = panels.get('connections');
  const connectionIntro = document.createElement('div');
  connectionIntro.className = 'reticulum-tab-intro';
  connectionIntro.innerHTML = '<h3>Network connections</h3><p>Configure local TCP, Wi-Fi HaLow or RNode interfaces before enabling Reticulum. Nothing starts automatically.</p>';
  connections.prepend(connectionIntro);

  const files = panels.get('files');
  const bluetooth = document.getElementById('bluetooth-file-panel');
  if (bluetooth) files.prepend(bluetooth);
  const filesIntro = document.createElement('div');
  filesIntro.className = 'reticulum-tab-intro';
  filesIntro.innerHTML = '<h3>Send and receive files</h3><p>Choose Bluetooth Classic for a nearby paired OpenRF device or Reticulum Resource for a reachable Reticulum peer. Both require an explicit action to transfer.</p>';
  files.prepend(filesIntro);

  parent.append(...names.map(name => panels.get(name)));

  function activate(name, { focus = false } = {}) {
    if (!panels.has(name)) return;
    for (const key of names) {
      const selected = key === name;
      panels.get(key).hidden = !selected;
      tabs.get(key).setAttribute('aria-selected', String(selected));
      tabs.get(key).tabIndex = selected ? 0 : -1;
    }
    // No hash navigation, focus stealing or scrollIntoView on a tab change.
    if (focus) tabs.get(name).focus({ preventScroll: true });
  }

  for (const [index, name] of names.entries()) {
    const tab = tabs.get(name);
    tab.addEventListener('click', () => activate(name));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = names[(index + 1) % names.length];
      else if (event.key === 'ArrowLeft') target = names[(index + names.length - 1) % names.length];
      else if (event.key === 'Home') target = names[0];
      else if (event.key === 'End') target = names[names.length - 1];
      else return;
      event.preventDefault();
      activate(target, { focus: true });
    });
  }
  parent.addEventListener('click', event => {
    const shortcut = event.target.closest('[data-reticulum-open]');
    if (shortcut) activate(shortcut.dataset.reticulumOpen);
  });

  function updateUnread(count) {
    count = Number(count) || 0;
    const badge = document.getElementById('reticulum-tab-unread');
    if (!badge) return;
    badge.hidden = count <= 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    tabs.get('inbox').setAttribute('aria-label', count > 0 ? `Inbox, ${count} unread` : 'Inbox');
  }
  document.addEventListener('openrf:reticulum-unread', event => updateUnread(event.detail?.count));
  // The Reticulum controller might have published restored unread state before
  // this script's listener was attached. Pick up its existing text once.
  const previous = document.getElementById('reticulum-inbox-unread')?.textContent || '';
  updateUnread(Number(/^\s*(\d+) unread\b/.exec(previous)?.[1] || 0));

  activate('inbox');
  window.OpenRFReticulumTabs = Object.freeze({
    open: name => activate(name),
    current: () => names.find(name => !panels.get(name).hidden)
  });
})();
