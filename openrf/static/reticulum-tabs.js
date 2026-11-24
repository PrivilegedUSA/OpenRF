/* OpenRF v0.2.165 — Reticulum settings grouped under Dashboard. */
(() => {
  'use strict';
  const root = document.getElementById('page-reticulum');
  const bar = document.getElementById('reticulum-tabs');
  const parent = document.getElementById('reticulum-panel');
  if (!root || !bar || !parent) return;

  const names = ['dashboard', 'inbox', 'contacts', 'files'];
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
    section.hidden = name !== 'dashboard';
    panels.set(name, section);
  }

  // Move the existing elements, never clone or re-create them. The original
  // LXMF, RNode, Bluetooth and contact listeners keep their state and nodes.
  const contents = [...parent.children];
  const categories = contents.map((element, index) => {
    if (element.id === 'reticulum-contacts-panel') return 'contacts';
    if (element.id === 'reticulum-history-panel' || index === contents.length - 1) return 'dashboard';
    if (index < 2 || ['reticulum-status', 'reticulum-start-help', 'reticulum-connection-brief'].includes(element.id) ||
        element.querySelector('#reticulum-enable, #reticulum-announce, #reticulum-address') ||
        element.previousElementSibling?.querySelector('#reticulum-address')) return 'dashboard';
    if (element.matches('.reticulum-tcp-settings, #reticulum-halow-panel, #reticulum-rnode-panel, #reticulum-diagnostics-panel')) return 'dashboard';
    if (element.id === 'reticulum-files-panel') return 'files';
    return 'inbox';
  });
  for (let i = 0; i < contents.length; i++) panels.get(categories[i]).append(contents[i]);

  const dashboard = panels.get('dashboard');
  const dashboardLinks = document.createElement('div');
  dashboardLinks.className = 'reticulum-tab-shortcuts';
  dashboardLinks.innerHTML = '<button type="button" class="btn outline" data-reticulum-open="inbox">Open inbox</button><button type="button" class="btn outline" data-reticulum-open="contacts">Contacts</button><button type="button" class="btn outline" data-reticulum-open="files">File sharing</button>';
  dashboard.append(dashboardLinks);

  // Keep Reticulum's start/stop/address controls immediately accessible. All
  // connection controls live further down on the same Dashboard, collapsed by
  // default. Moving their original nodes retains every existing event handler.
  const settings = document.createElement('section');
  settings.className = 'reticulum-dashboard-settings';
  settings.innerHTML = '<h3>Connection settings</h3><p class="small muted">Optional interfaces and diagnostics. Configure them before pressing Enable LAN messaging; nothing starts by opening these sections.</p>';
  const tcp = document.createElement('details');
  tcp.id = 'reticulum-tcp-details';
  tcp.className = 'reticulum-diagnostics';
  tcp.open = false;
  tcp.innerHTML = '<summary>LAN &amp; TCP settings</summary>';
  const tcpFields = document.querySelector('#reticulum-panel .reticulum-tcp-settings');
  if (tcpFields) tcp.append(tcpFields);
  settings.append(tcp);
  for (const id of ['reticulum-halow-panel', 'reticulum-rnode-panel', 'reticulum-diagnostics-panel']) {
    const detail = document.getElementById(id);
    if (detail) {
      detail.open = false;
      settings.append(detail);
    }
  }
  dashboard.append(settings);
  const history = document.getElementById('reticulum-history-panel');
  if (history) dashboard.append(history);
  const finalNote = contents[contents.length - 1];
  if (finalNote && finalNote.parentElement === dashboard) dashboard.append(finalNote);

  const contacts = panels.get('contacts');
  const contactsIntro = document.createElement('div');
  contactsIntro.className = 'reticulum-tab-intro';
  contactsIntro.innerHTML = '<h3>Saved contacts</h3><p>Private nicknames for verified LXMF addresses. Select Message to open a conversation in Inbox.</p>';
  contacts.prepend(contactsIntro);

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
    const wasInbox = !panels.get('inbox').hidden;
    for (const key of names) {
      const selected = key === name;
      panels.get(key).hidden = !selected;
      tabs.get(key).setAttribute('aria-selected', String(selected));
      tabs.get(key).tabIndex = selected ? 0 : -1;
    }
    if (name === 'contacts') {
      const addressBook = document.getElementById('reticulum-contacts-panel');
      if (addressBook) addressBook.open = true;
    }
    if (name === 'inbox' && !wasInbox) {
      const messages = document.getElementById('reticulum-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
    window.OpenRFWorkspaceTabs?.remember('reticulum',name);
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

  activate(window.OpenRFWorkspaceTabs?.restore('reticulum',names,'dashboard') || 'dashboard');
  window.OpenRFReticulumTabs = Object.freeze({
    open: name => activate(name),
    current: () => names.find(name => !panels.get(name).hidden)
  });
})();
