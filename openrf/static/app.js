'use strict';

const $ = (id) => document.getElementById(id);
const SELECTED_PAGE_SESSION_KEY = 'openrf.selected-page.v1';
const MAP_VECTOR_PREFERENCE_KEY = 'openrf.map.vector-preference.v1';
const MAP_BASEMAP_PREFERENCE_KEY = 'openrf.map.basemap.v1';
const VALID_PAGES = new Set(['map','overview','emergency','scanner','spectrum','radio','weather','messages','reticulum','meshcore','hamradio','discoveries','trips','browser','sessions','hardware','settings','surveillance','mesh-network']);
function rememberedBaseMap(){
  try {const value=window.localStorage?.getItem(MAP_BASEMAP_PREFERENCE_KEY);
    return ['default','satellite','topographic'].includes(value)?value:'default';}
  catch (_) {return 'default';} // Private browsing or blocked storage.
}
function rememberBaseMap(value){
  try {window.localStorage?.setItem(MAP_BASEMAP_PREFERENCE_KEY,value);} catch (_) { /* Current choice still works. */ }
}
function rememberedVectorPreference(){
  try {const value=window.localStorage?.getItem(MAP_VECTOR_PREFERENCE_KEY);return value==='offline'||value==='online'?value:'auto';}
  catch (_) {return 'auto';}
}
function rememberVectorPreference(value){
  try {window.localStorage?.setItem(MAP_VECTOR_PREFERENCE_KEY,value);} catch (_) { /* Private browsing is okay. */ }
}
function rememberedPage(){
  // sessionStorage can survive closing/reopening Electron and browser session restore.
  // Only a true page reload restores its selection; a fresh navigation opens Overview.
  try {
    const navigation = window.performance?.getEntriesByType?.('navigation')?.[0];
    const saved = window.sessionStorage?.getItem(SELECTED_PAGE_SESSION_KEY);
    return navigation?.type === 'reload' && VALID_PAGES.has(saved) ? saved : 'overview';
  } catch (_) {return 'overview';}
}
function rememberPage(page){
  try {window.sessionStorage?.setItem(SELECTED_PAGE_SESSION_KEY,page);} catch (_) { /* Overview remains the fallback. */ }
}
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (val, suffix = '') => val === null || val === undefined || val === '' ? '—' : `${val}${suffix}`;
const stamp = (s) => s ? new Date(s).toLocaleString() : 'Not available';
const state = { observations: [], sessions: [], waypoints: [], sdrSites: [], waypointsTruncated: false, captures: [], diagnostics: null, readiness: null, hardware: null, hardwareManager: null, map: null, mapReady: false, style: 'dark', mapVectorOffline:false, vectorStatus:null, navPinDragging:false, navPinJustDraggedAt:0, navFollowId:null, navFollowMode:null, navVoiceEnabled:false, navVoiceMemory:null, navVoiceFailed:false, navGnssTimer:null, navGnssBusy:false, navGnssLast:0, navGnssEpoch:0, navFollowLast:0, navFollowProgress:0, navFollowPriorFix:null, navFollowHeading:null, navFollowCameraSuspended:false, navFollowLastPosition:null, navFollowStartedAt:0, navFollowLastValidAt:0, navFollowSignalState:'waiting',navCameraAvoidTypes:null,navCameraComparison:null,navCameraRouteEpoch:0,navCameraReport:null,navCameraPanelOpen:false,navRouteChoices:null,navChoiceSelection:"standard",navChoicePanelClosed:false,navAvoidSession:[],navAvoidSaved:[],navAvoidAnchor:null,navAvoidPicking:false,navRoadPrefsDirty:false,navFollowEpoch:0,navRerouteBusy:false,navOffrouteCount:0,navOffrouteSince:0,navRerouteLast:0,
  navDemoActive:false,navDemoPaused:false,navDemoProgress:0,navDemoTimer:null,navDemoLastTime:0,
  navDemoMarker:null,navDemoMarkerMap:null,navDemoFix:null,rasterMap: null, mapAttempt: 0, showDemo: false, browserLocation: null, geoMarker: null, autoLocateAttempted: false, mapNavigationEpoch: 0, preferredView: null, wifiScan: null, bleScan: null, sensors: [], serialTransport: null, pendingLocationView: null, offlineMaps: [], offlineMap: null, areaPlans: [], selectedArea: null, areaChoosing: false, areaFirstCorner: null, areaDraftBounds: null, navPicking:false, navPickedPoint:null, navPickPointerStart:null, navPickSwallowClickUntil:0, navPreview:null, navFitPending:false, navPickPanRestore:null, navDestinations:[], navOriginManual:false, navAddressResults:[], navSelectedAddress:null, navSearchToken:0, mapObservationId:null, mapSurveySeriesKey:null, mapKinds: new Set(['WIFI','BLE','RF','CELLULAR','INFRASTRUCTURE','MANUAL']) };
state.navPickKind='destination';
state.navPickedOrigin=null;
state.mapVectorPreference=rememberedVectorPreference();
state.mapOfflineRecoveryTried=false;
// The operator's explicitly selected basemap is remembered locally. Restoring
// Satellite or Topographic may request USGS tiles when OpenRF reopens.
state.baseMap=rememberedBaseMap();
window.OpenRFMapReadOnly = () => state.map;
document.addEventListener('openrf:checkin-map-requested',()=>showPage('map'));
state.mapStartupError=null;
state.navCameraAlertPrefs=null;state.navCameraAlertCatalog=null;
state.navCameraAlertSeen=new Set();state.navCameraAlertVoiceSeen=new Set();state.navCameraAlertLastVoice=0;
state.navCameraAlertLastQualifiedAt=0;
state.navVoiceLastTurnAt=0;

// In the compact route card, keep GPS freshness visible without opening details.
const navSignalIndicator=document.createElement('span');
navSignalIndicator.id='map-follow-signal';navSignalIndicator.className='map-follow-signal';
navSignalIndicator.textContent='GPS: waiting';navSignalIndicator.dataset.gps='waiting';
$('map-follow-hud').querySelector('.map-follow-extras').append(navSignalIndicator);

// v0.2.65 — remember map-layer visibility on this browser only. No server writes,
// camera locations, observations or coordinates enter this preference record.
const MAP_LAYER_STORAGE_KEY = 'openrf-map-layer-visibility-v1';
function mapLayerInputs() {
  return [...document.querySelectorAll('#map-survey-panel [data-map-kind], #map-survey-panel [data-camera-type], #map-survey-panel [data-mesh-layer], #map-survey-panel [data-public-mesh-layer]')];
}
function saveMapLayerVisibility() {
  const prefs = {version:1, kinds:{}, cameras:{}, mesh:{}, publicMesh:{}};
  for (const input of mapLayerInputs()) {
    const kind = input.dataset.mapKind;
    if (kind) prefs.kinds[kind] = Boolean(input.checked);
    else if (input.dataset.cameraType) prefs.cameras[input.dataset.cameraType] = Boolean(input.checked);
    else if (input.dataset.meshLayer) prefs.mesh[input.dataset.meshLayer] = Boolean(input.checked);
    else if (input.dataset.publicMeshLayer) prefs.publicMesh[input.dataset.publicMeshLayer] = Boolean(input.checked);
  }
  try { window.localStorage?.setItem(MAP_LAYER_STORAGE_KEY, JSON.stringify(prefs)); return true; }
  catch (_) { return false; } // Disabled storage/private browsing: use current session.
}
function restoreMapLayerVisibility() {
  let saved = null;
  try { saved = JSON.parse(window.localStorage?.getItem(MAP_LAYER_STORAGE_KEY) || 'null'); }
  catch (_) { /* Malformed or inaccessible browser storage: use HTML defaults. */ }
  if (saved && !Array.isArray(saved) && saved.version === 1) {
    for (const input of mapLayerInputs()) {
      const kind = input.dataset.mapKind;
      const group = kind ? saved.kinds : input.dataset.cameraType ? saved.cameras : input.dataset.meshLayer ? saved.mesh : saved.publicMesh;
      const key = kind || input.dataset.cameraType || input.dataset.meshLayer || input.dataset.publicMeshLayer;
      if (group && Object.prototype.hasOwnProperty.call(group, key) && typeof group[key] === 'boolean')
        input.checked = group[key];
    }
  }
  state.mapKinds = new Set(mapLayerInputs().filter(input => input.dataset.mapKind && input.checked).map(input => input.dataset.mapKind));
}
restoreMapLayerVisibility(); // Before either camera/map module computes its first visible markers.
window.OpenRFMapLayerPreferences = {save:saveMapLayerVisibility};

async function api(url, method = 'GET', body = null) {
  const options = {method, headers: {}};
  if (url.startsWith('/api/navigation/geocode?') && url.includes('&online=1')) options.headers['X-OpenRF-Address-Consent']='yes';
  if (body !== null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) throw Error(json.error || `Request failed (${res.status})`);
  return json;
}

function flash(message, error = false) {
  const el = $('flash'); el.textContent = message; el.hidden = false; el.classList.toggle('error', error);
}
// The five-inch UI uses a real, accessible drawer, not a horizontally scrolling tab bar.
const compactNavigation = window.matchMedia('(max-width:900px), (max-width:1400px) and (max-height:850px) and (pointer:coarse)');
const menuButton = $('menu-toggle');
const menuBackdrop = $('menu-backdrop');
const mainSidebar = $('main-sidebar');
let navigationOpen = false;
// The nav is its own scroll container on wide/7-inch layouts. On narrow
// drawer layouts the entire sidebar scrolls instead. Reveal the selected
// button *inside that container*, never by scrolling the whole document.
function revealSelectedSidebarPage(page) {
  if (compactNavigation.matches && !navigationOpen) return;
  const nav = mainSidebar.querySelector('.nav');
  const selected = mainSidebar.querySelector(`.nav-btn[data-page="${page}"]`);
  if (!nav || !selected || typeof selected.getBoundingClientRect !== 'function') return;
  if (typeof nav.contains === 'function' && !nav.contains(selected)) return;
  const scroller = nav.scrollHeight > nav.clientHeight + 2 ? nav : mainSidebar;
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 2 ||
      typeof scroller.getBoundingClientRect !== 'function') return;
  const viewport = scroller.getBoundingClientRect();
  const selectedRect = selected.getBoundingClientRect();
  const margin = 10;
  if (selectedRect.top < viewport.top + margin)
    scroller.scrollTop -= viewport.top + margin - selectedRect.top;
  else if (selectedRect.bottom > viewport.bottom - margin)
    scroller.scrollTop += selectedRect.bottom - viewport.bottom + margin;
}
function syncNavigation() {
  const compact = compactNavigation.matches;
  if (!compact) navigationOpen = false;
  document.body.classList.toggle('menu-open', compact && navigationOpen);
  menuBackdrop.hidden = !(compact && navigationOpen);
  menuButton.setAttribute('aria-expanded', String(compact && navigationOpen));
  menuButton.setAttribute('aria-label', navigationOpen ? 'Close navigation menu' : 'Open navigation menu');
  mainSidebar.inert = compact && !navigationOpen;
  document.querySelector('.main').inert = compact && navigationOpen;
}
function setNavigationOpen(open, restoreFocus = true) {
  if(open)closeMapFeatureInfo();
  const wasOpen = navigationOpen;
  navigationOpen = !!open && compactNavigation.matches;
  syncNavigation();
  if (navigationOpen) {
    mainSidebar.querySelector('.nav-btn.active')?.focus({preventScroll:true});
    revealSelectedSidebarPage(rememberedPage());
  }
  else if (wasOpen && restoreFocus) menuButton.focus();
}
menuButton.addEventListener('click', () => setNavigationOpen(!navigationOpen));
$('menu-close').addEventListener('click', () => setNavigationOpen(false));
menuBackdrop.addEventListener('click', () => setNavigationOpen(false));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigationOpen) { event.preventDefault(); setNavigationOpen(false); }
});
if (compactNavigation.addEventListener) compactNavigation.addEventListener('change', syncNavigation);
else compactNavigation.addListener(syncNavigation);
syncNavigation();

// v0.2.50: one map-first layout. Search stays compact until the operator opens
// the existing route form; these controls do not initiate GPS, scans or routing.
const mapSearchPanel = $('map-destination-panel');
const mapSearchToggle = $('map-search-toggle');
const mapSearchForm = $('map-destination-form');
// Select transport mode before entering a destination. This is UI-only
// preference for the next route request, not a request for GPS or internet.
state.navTravelMode='auto';
// Only highlight OSM ways that are ACTUALLY in the selected vector tile set.
// This adds no route geometry, GPS collection, external request or claim of
// public access. Installed regional tiles may have sparse trail coverage.
function syncWalkingPathOverlay(){
  const walking=state.navTravelMode==='pedestrian';
  const note=$('map-walking-layer-note');
  if(note)note.hidden=!walking;
  const map=state.map;
  if(!map || !state.mapReady)return;
  try{
    if(!map.getSource('openmaptiles'))return;
    const overlays=[
      {id:'openrf-walking-paths',classes:['path','footway','bridleway'],color:state.style==='dark'?'#86f5d4':'#137963',width:2.6},
      {id:'openrf-walking-tracks',classes:['track'],color:state.style==='dark'?'#ffcb78':'#92620c',width:2.0}
    ];
    for(const layer of overlays){
      if(!map.getLayer(layer.id))map.addLayer({
        id:layer.id,type:'line',source:'openmaptiles','source-layer':'transportation',minzoom:11,
        filter:['in',['get','class'],['literal',layer.classes]],
        layout:{'line-cap':'round','line-join':'round',visibility:walking?'visible':'none'},
        paint:{'line-color':layer.color,'line-width':['interpolate',['linear'],['zoom'],11,1.3,16,layer.width],
          'line-dasharray':[2.5,2],'line-opacity':0.92}
      });
      else map.setLayoutProperty(layer.id,'visibility',walking?'visible':'none');
    }
  }catch(error){console.warn('Mapped walking path overlay unavailable:',error);}
}
function setMapTravelMode(mode){
  state.navTravelMode=mode==='pedestrian'?'pedestrian':'auto';
  const walking=state.navTravelMode==='pedestrian';
  $('map-mode-drive').setAttribute('aria-pressed',String(!walking));
  $('map-mode-walk').setAttribute('aria-pressed',String(walking));
  $('map-route-action-text').textContent=walking?'Plan walking route':'Get driving directions';
  $('map-travel-mode-note').textContent=walking?
    'Walking · plans from local mapped paths. Optional GPS follow starts only when you tap Start walking navigation; trail access is unverified.' :
    'Driving · local road routes only. Live GPS navigation requires a valid route.';
  $('map-start-navigation').title=walking?'Plan pedestrian paths with local Valhalla':'Calculate a road route with local Valhalla';
  $('map-picked-route').textContent=walking?'Walking directions':'Driving directions';
  $('map-picked-camera-options').hidden=walking;
  $('map-search-camera-options').hidden=walking;
  $('map-begin-guidance').hidden=walking;
  syncWalkingPathOverlay();
}
$('map-mode-drive').addEventListener('click',()=>setMapTravelMode('auto'));
$('map-mode-walk').addEventListener('click',()=>setMapTravelMode('pedestrian'));
setMapTravelMode('auto');
// Quick "Where to?" and the optional trip planner intentionally share one
// starting point. No second route-origin state or background GPS requests.
function syncMapOriginSummary(){
  const manual=Boolean(state.navOriginManual);
  const typed=$('nav-start-query').value.trim();
  $('map-origin-caption').textContent=manual ? (typed || 'Custom starting point') : 'Current location';
  if($('map-origin-query').value!==typed)$('map-origin-query').value=typed;
  $('map-origin-control').classList.toggle('is-custom',manual);
}
function setMapOriginEditor(open,focus=false){
  $('map-origin-editor').hidden=!open;
  $('map-origin-edit').setAttribute('aria-expanded',String(open));
  syncMapOriginSummary();
  if(typeof updateNavOverlayLayout==='function')updateNavOverlayLayout();
  if(open&&focus)$('map-origin-query').focus({preventScroll:true});
}
$('map-origin-edit').addEventListener('click',()=>setMapOriginEditor($('map-origin-editor').hidden,true));
$('map-origin-use-location').addEventListener('click',()=>{
  // Returning to the default is immediate; Get directions obtains an actual
  // recent browser fix, if permitted, when the operator requests a route.
  state.navOriginManual=false;
  state.navPickedOrigin=null;
  $('nav-start-query').value='';
  $('map-origin-query').value='';
  $('nav-start-lat').value='';$('nav-start-lon').value='';
  if(state.navPreview||state.navRouteChoices||state.navCameraComparison)resetRouteForNewDestination();
  $('nav-origin-status').textContent='Current browser location selected. Get directions will request a fresh fix if needed.';
  syncMapOriginSummary();renderNavigationOverlay();
  setMapDestinationStatus('Starting point: current browser location (permission and accuracy permitting).');
  setMapOriginEditor(false);
});
function setMapSearchCollapsed(collapsed, restoreFocus = false) {
  const isCollapsed = Boolean(collapsed);
  // Opening the text/address editor cancels an unfinished map tap so that
  // the next explicit 'Choose destination on map' always starts fresh.
  if (!isCollapsed && state.navPicking) {
    state.navPicking=false;
    syncDestinationPickMode();
    renderNavigationOverlay();
  }
  mapSearchForm.hidden = isCollapsed;
  mapSearchPanel.classList.toggle('is-collapsed', isCollapsed);
  // When opening search, immediately take the old route chooser out of the
  // pointer/keyboard path. It may return if search is simply dismissed;
  // starting a new destination pick invalidates it for good.
  if (!isCollapsed) {closeMapFeatureInfo();$('map-route-choices').hidden = true;}
  // Editing a destination and reviewing a route are mutually exclusive map
  // surfaces. Hide the old route sheets without discarding their route data.
  $('page-map').classList.toggle('map-search-editing', !isCollapsed);
  mapSearchToggle.setAttribute('aria-expanded', String(!isCollapsed));
  mapSearchToggle.setAttribute('aria-label', isCollapsed ? 'Open destination search' : 'Close destination search');
  mapSearchToggle.innerHTML = isCollapsed
    ? '<span class="map-search-icon" aria-hidden="true">⌕</span><span class="map-search-caption">Where to?</span><span class="map-search-chevron" aria-hidden="true">▾</span>'
    : '<span class="map-search-close-mark" aria-hidden="true">×</span>';
  if (typeof updateNavOverlayLayout === 'function') updateNavOverlayLayout();
  // Clear any position computed while the tall search form was on screen.
  // Closing it must bring Directions and its choice cards back to the top.
  if (state.navRouteChoices) {
    renderRouteChoices();
    requestAnimationFrame(() => {
      updateNavOverlayLayout();
      renderRouteChoices();
    });
  }
  if (!isCollapsed) $('map-destination-query').focus({preventScroll: true});
  else if (restoreFocus) mapSearchToggle.focus({preventScroll: true});
}
mapSearchToggle.addEventListener('click', () => { if (activeMapTool) closeMapToolOverlay(); setMapSearchCollapsed(!mapSearchForm.hidden, true); syncMapPickedAction(); });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('map-workspace') &&
      !mapSearchForm.hidden && !navigationOpen && !state.navPicking) {
    event.preventDefault();
    setMapSearchCollapsed(true, true);
  }
});
setMapSearchCollapsed(true);
// v0.2.51: one overlay workspace, with a compact floating icon rail.
// Move the *existing* panels, rather than cloning their IDs or forms. All
// existing event listeners and local-only data operations remain intact.
const mapToolGroups = {
  trip: {title: 'Plan a trip', ids: ['map-trip-planner']},
  settings: {title: 'Map settings', ids: ['map-control-settings']},
  gps: {title: 'GPS and walking trails', ids: ['map-breadcrumbs-panel','offline-trail-library','survey-waypoint-manager','sdr-site-map-manager']},
  offline: {title: 'Offline maps', ids: ['offline-basemap-settings','map-area-manager']}
};
// v0.2.108: Offline navigation readiness belongs in the bottom-right gear,
// not as a card below the map. Keep the separate right-rail Map settings tool.
const readinessPanel = $('map-offline-readiness');
$('map-gear-readiness-slot').append(readinessPanel);
const mapToolOverlay = $('map-tool-overlay');
const mapToolContent = $('map-tool-content');
const mapToolNodes = {};
const mapToolPanes = {};
let activeMapTool = null;
for (const [kind, group] of Object.entries(mapToolGroups)) {
  // Keep every panel attached to the document, even when its tab is hidden.
  // Many existing startup handlers use document.getElementById on these inputs.
  const pane = document.createElement('section');
  pane.className = 'map-tool-pane';
  pane.dataset.toolPane = kind;
  pane.hidden = true;
  mapToolNodes[kind] = group.ids.map(id => $(id));
  pane.append(...mapToolNodes[kind]);
  mapToolContent.append(pane);
  mapToolPanes[kind] = pane;
}
// Keep the live browser-location status with the right-rail Map settings tool.
mapToolNodes.settings[0].append($('map-location-status'));
$('map-tools-anchor').remove(); // former scroll-to-tools target
function closeMapToolOverlay(restoreFocus = false) {
  const old = activeMapTool;
  mapToolOverlay.hidden = true;
  activeMapTool = null;
  for (const button of document.querySelectorAll('[data-map-tool]')) {
    button.setAttribute('aria-expanded', 'false');
    button.classList.remove('active');
  }
  // Retain form state while hidden; no page navigation or GPS request occurs.
  syncMapPickedAction();
  if (old && restoreFocus) document.querySelector(`[data-map-tool="${old}"]`)?.focus({preventScroll:true});
}
function openMapToolOverlay(kind) {
  closeMapFeatureInfo();
  if (!Object.hasOwn(mapToolGroups, kind)) return;
  if (activeMapTool === kind && !mapToolOverlay.hidden) {closeMapToolOverlay(true);return;}
  if (state.navPicking) {state.navPicking=false;syncDestinationPickMode();renderNavigationOverlay();}
  if (state.areaChoosing) cancelAreaChoosing();
  setMapSurveyOpen(false);
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  const group = mapToolGroups[kind];
  for (const [name, pane] of Object.entries(mapToolPanes)) pane.hidden = name !== kind;
  for (const node of mapToolNodes[kind]) node.open = true;
  activeMapTool = kind;
  syncMapPickedAction();
  $('map-tool-title').textContent = group.title;
  mapToolOverlay.hidden = false;
  // Search and tool overlays should not compete on a 5-inch screen.
  setMapSearchCollapsed(true);
  $('map-navigation-options').open = false;
  for (const button of document.querySelectorAll('[data-map-tool]')) {
    const selected = button.dataset.mapTool === kind;
    button.setAttribute('aria-expanded', String(selected));
    button.classList.toggle('active', selected);
  }
  mapToolOverlay.scrollTop = 0;
  mapToolContent.scrollTop = 0;
}
for (const button of document.querySelectorAll('[data-map-tool]')) {
  button.addEventListener('click', () => openMapToolOverlay(button.dataset.mapTool));
}
$('map-tool-close').addEventListener('click', () => closeMapToolOverlay(true));
$('map-open-address-setup').addEventListener('click', () => {
  closeMapToolOverlay();
  $('map-navigation-options').open = true;
  $('map-navigation-options').querySelector('summary').focus({preventScroll:true});
});
window.addEventListener('keydown',event => {
  if (event.key==='Escape' && !mapToolOverlay.hidden) {
    event.preventDefault();closeMapToolOverlay(true);
  }
});

// v0.2.68: a newly chosen destination is not an alternative to the old
// destination. Invalidate the previous plan, its route-choice cards and any
// in-flight camera comparison together. Saved route preferences are retained.
function resetRouteForNewDestination() {
  // A pending road/gate point pick is specific to the old route. Never let
  // its capture listener steal a tap intended for a newly selected place.
  state.navAvoidPicking=false;
  stopNavigationFollow();
  state.navDestinationEpoch=(state.navDestinationEpoch||0)+1;
  state.navCameraRouteEpoch=(state.navCameraRouteEpoch||0)+1;
  state.navPreview=null;
  state.navCameraComparison=null;
  state.navCameraReport=null;
  if(typeof updateCameraApproachCandidates==='function')updateCameraApproachCandidates();
  state.navRouteChoices=null;
  state.navChoiceSelection='standard';
  state.navChoicePanelClosed=false;
  state.navFitPending=false;
  $('map-route-choices').hidden=true;
  $('map-begin-guidance').disabled=true;
  $('map-compare-camera-routes').disabled=true;
  $('map-use-camera-alternate').hidden=true;
  $('nav-preview-summary').textContent='';
  $('nav-directions').replaceChildren();
  $('map-camera-comparison-status').textContent='Get directions to compare routes for the new destination.';
  renderDirectionsReview(null);
  // Trip-only road exclusions must not leak into a different destination.
  if(state.navAvoidSession?.length){state.navAvoidSession=[];renderRoadAvoidList();}
  renderNavigationOverlay();
}
// A manually started breadcrumb follow is a standalone GPS reference. Make a
// clean visual map before showing it, without treating its line as a route.
if(typeof window!=='undefined')window.OpenRFPrepareTrackBacktrack=()=>{
  resetRouteForNewDestination();
  closeMapToolOverlay();
  $('map-picked-action').hidden=true;
};
function syncMapPickedAction() {
  const selected = Array.isArray(state.navPickedPoint) && !state.navPicking;
  const popup = $('map-picked-action');
  popup.hidden = !selected || Boolean(activeMapTool) || !mapSearchForm.hidden || state.navPreview?.type==='ROAD_ROUTE' || state.navFollowId!==null;
  if (!selected) return;
  const [lon,lat] = state.navPickedPoint;
  $('map-picked-coordinates').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} · map-selected point`;
  const routeStatus=$('map-destination-status');
  if (!routeStatus.hidden) $('map-picked-status').textContent=routeStatus.textContent;
  const roadReady = !$('map-begin-guidance').disabled;
  $('map-picked-begin').hidden = !roadReady;
}
$('map-picked-route').addEventListener('click', () => {
  // Reuse the one existing route submit path and its Valhalla-only safety gate.
  $('map-destination-form').requestSubmit($('map-start-navigation'));
});
$('map-picked-origin').addEventListener('click',()=>{
  // Destination may have been chosen on the map while search was collapsed.
  // Open its existing editor and focus From, keeping the destination pin.
  setMapSearchCollapsed(false);
  setMapOriginEditor(true,true);
  syncMapPickedAction();
});
$('map-picked-begin').addEventListener('click', () => {
  if (!$('map-begin-guidance').disabled) $('map-begin-guidance').click();
});
$('map-picked-change').addEventListener('click', () => beginDestinationMapPick());
$('map-picked-close').addEventListener('click', () => { $('map-picked-action').hidden = true; });

function closeHeaderMessageMenu(returnFocus = false){
  const choices=$('header-messages-choices');
  if(choices.hidden)return;
  choices.hidden=true;
  $('mesh-header-button').setAttribute('aria-expanded','false');
  if(returnFocus)$('mesh-header-button').focus();
}
// Only primary-map feature info is dismissed; preserve navigation and route state.
function closeMapFeatureInfo() {
  window.OpenRFPublicMesh?.close();
  const popup=state.mapFeaturePopup;
  state.mapFeaturePopup=null;
  popup?.remove();
  const camera=$('camera-selected');
  if(camera){camera.hidden=true;camera.textContent='';}
  if(state.mapObservationId!=null){
    state.mapObservationId=null;
    renderMapObservationDetail();
    updateMap();
  }
}
function showMapFeaturePopup(popup,map) {
  closeMapFeatureInfo();
  state.mapFeaturePopup=popup;
  popup.on('close',()=>{if(state.mapFeaturePopup===popup)state.mapFeaturePopup=null;});
  popup.addTo(map);
}
window.OpenRFMapFeatureInfo={close:closeMapFeatureInfo,show:showMapFeaturePopup};
function showPage(page, options = {}) {
  closeMapFeatureInfo();
  if(page!=='map' && !$('map-survey-panel').hidden)setMapSurveyOpen(false);
  if(!VALID_PAGES.has(page))page='map';
  closeHeaderMessageMenu();
  rememberPage(page);
  if(page!=='map' && state.navFollowId!==null) stopNavigationFollow();
  if(page!=='map' && typeof window!=='undefined')window.OpenRFBreadcrumbs?.stopFollow?.('GPS backtrack stopped when you left the Map page.');
  const wasMap = document.body.classList.contains('map-workspace');
  document.body.classList.toggle('map-workspace', page === 'map');
  // Do not collapse an open search when another action selects the same page.
  if (page === 'map' && !wasMap) setMapSearchCollapsed(true);
  if (page !== 'map' && activeMapTool) closeMapToolOverlay();
  const wasNavigationOpen=navigationOpen;
  if (navigationOpen) {
    setNavigationOpen(false, false);
  }
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'messages' || page === 'reticulum' || page === 'meshcore') setMessagesSubpagesOpen(true);
  $('messages-nav-toggle').classList.toggle('active', page === 'messages' || page === 'reticulum' || page === 'meshcore');
  revealSelectedSidebarPage(page);
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  const titles = {overview:'Field overview',emergency:'Emergency readiness',map:'Survey map',scanner:'Signal analysis',spectrum:'Spectrum & Waterfall',radio:'Radio receiver',weather:'Weather Station',surveillance:'Surveillance','mesh-network':'Mesh Network',messages:'Meshtastic messages',reticulum:'Reticulum messages',meshcore:'MeshCore messages',hamradio:'Ham radio channel lists',discoveries:'Saved discoveries',trips:'Trips & Maps',browser:'Web browser',sessions:'Investigations',hardware:'Hardware manager',settings:'App settings'};
  $('page-title').textContent = titles[page] || 'OpenRF'; $('page-crumb').textContent = page === 'messages' ? 'MESHTASTIC' : page.toUpperCase();
  // Page-specific headings are the one visible title on non-map workspaces.
  // The old topbar H1 is intentionally hidden; do not focus a hidden node.
  if (wasNavigationOpen) {
    const heading=page==='map' ? $('map-search-toggle') :
      (document.querySelector(`#page-${page} .section-heading h2`) || document.querySelector(`#page-${page} h2`));
    if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  }
  if (page === 'spectrum') document.dispatchEvent(new Event('openrf:spectrum-shown'));
  if (page === 'radio') document.dispatchEvent(new Event('openrf:radio-shown'));
  document.dispatchEvent(new Event(page === 'surveillance' ? 'openrf:surveillance-shown' : 'openrf:surveillance-hidden'));
  if (page === 'weather') document.dispatchEvent(new Event('openrf:weather-shown'));
  else document.dispatchEvent(new Event('openrf:weather-hidden'));
  if (page === 'messages') document.dispatchEvent(new Event('openrf:messages-shown'));
  if (page === 'reticulum') document.dispatchEvent(new Event('openrf:reticulum-shown'));
  if (page === 'mesh-network') document.dispatchEvent(new Event('openrf:mesh-network-shown'));
  if (page === 'meshcore') document.dispatchEvent(new Event('openrf:meshcore-shown'));
  if (page === 'hardware') document.dispatchEvent(new Event('openrf:hardware-shown'));
  if (page === 'emergency') document.dispatchEvent(new Event('openrf:emergency-shown'));
  if (page === 'settings') document.dispatchEvent(new Event('openrf:settings-shown'));
  if (page === 'browser') document.dispatchEvent(new Event('openrf:browser-shown'));
  else document.dispatchEvent(new Event('openrf:browser-hidden'));
  if (page === 'trips') document.dispatchEvent(new Event('openrf:trips-shown'));
  if (page === 'map') { document.dispatchEvent(new Event('openrf:map-shown')); startMap(); if (options.autoLocate !== false) locateMap(false); renderMapSurveyPanel(); setTimeout(() => { state.map?.resize(); state.rasterMap?.resize(); }, 80); }
  window.scrollTo(0, 0);
}

async function refresh() {
  const [records, sessions, stats, hardware, sensorData, captureData, diagnostics, readiness, waypointData, hardwareManager, sdrSites] = await Promise.all([
    api('/api/observations'), api('/api/sessions'), api('/api/stats'), api('/api/hardware'), api('/api/sensors'),
    api('/api/captures'), api('/api/sensors/diagnostics'), api('/api/hardware/readiness'), api('/api/survey/waypoints'), api('/api/hardware/manager'), api('/api/sdr/survey/sites')
  ]);
  state.observations = records.observations;
  state.sessions = sessions.sessions;
  state.waypoints = waypointData.waypoints || [];
  state.sdrSites = sdrSites.sites || [];
  renderSdrSiteMapStatus();
  state.waypointsTruncated = Boolean(waypointData.truncated);
  state.hardware = hardware;
  state.hardwareManager = hardwareManager;
  state.sensors = sensorData.sensors || [];
  state.serialTransport = sensorData.serial_transport || null;
  state.captures = captureData.captures || [];
  state.diagnostics = diagnostics;
  state.readiness = readiness;
  $('metric-observations').textContent = stats.observations;
  $('metric-mapped').textContent = stats.mapped;
  $('metric-sessions').textContent = stats.sessions;
  $('metric-demo').textContent = stats.demo;
  $('runtime-pill').textContent = hardware.environment;
  $('scanner-connection-pill').textContent = hardware.wifi_one_shot?.possible ? 'ON-DEMAND WI-FI POSSIBLE' : 'NO LINUX WI-FI SCANNER';
  refreshDiscoverySessions(); renderDiscoveries(); renderSessions(); renderCaptures(); renderHardware(); renderHardwareManager(); renderSensorRegistry(); renderSerialPorts(); renderHardwareReadiness(); renderSignals(); updateMap(); renderMapSurveyPanel(); renderWaypoints();
}

// Browser geolocation is used only at the operator's request in the manual
// observation dialog. Coordinates are the observer's approximate position,
// never an automatically detected camera/transmitter position.
let observationLocationRequestId = 0;
let observationLocationFix = null;
function openObservation(lat = '', lon = '') {
  ++observationLocationRequestId; // invalidate callbacks from any previous dialog
  observationLocationFix = null;
  const dialog=$('observation-dialog');
  const fromMap=$('page-map').classList.contains('active');
  dialog.classList.toggle('map-observation-popup',fromMap);
  if(fromMap){
    setMapSurveyOpen(false);
    $('map-navigation-options').open=false;
    if(activeMapTool)closeMapToolOverlay();
    alignBottomMapPopup(dialog);
  }
  const form = $('observation-form');
  form.reset();
  form.elements.latitude.value = lat;
  form.elements.longitude.value = lon;
  form.elements.location_source.value = lat !== '' && lon !== '' ? 'MANUAL_ENTRY' : 'UNSPECIFIED';
  form.elements.fix_age_seconds.value = '';
  $('observation-use-location').disabled = false;
  $('observation-location-status').textContent = lat !== '' && lon !== ''
    ? 'Coordinates selected on map. Use my location will replace them with a fresh browser-reported observer position.'
    : 'No location selected. Use my location only when you are at the observation site, or enter coordinates manually.';
  dialog.showModal();
}
function observationCoordinateEdited() {
  // A manual edit wins over a pending asynchronous geolocation callback.
  ++observationLocationRequestId;
  $('observation-use-location').disabled = false;
  const form = $('observation-form');
  if (form.elements.location_source.value === 'BROWSER_REPORTED') {
    form.elements.accuracy_m.value = ''; // old accuracy no longer applies to edited coordinates
    form.elements.fix_age_seconds.value = '';
    observationLocationFix = null;
  }
  form.elements.location_source.value = form.elements.latitude.value && form.elements.longitude.value
    ? 'MANUAL_ENTRY' : 'UNSPECIFIED';
  $('observation-location-status').textContent = 'Coordinates entered manually; browser accuracy and fix age are not attached.';
}
function useLocationForObservation() {
  const status = $('observation-location-status');
  const button = $('observation-use-location');
  if (!navigator.geolocation) {
    status.textContent = 'Browser location is unavailable. Enter coordinates or choose a map point.';
    return;
  }
  const requestId = ++observationLocationRequestId;
  button.disabled = true;
  status.textContent = 'Requesting a fresh browser location… Nothing is saved yet.';
  const finish = () => {
    if (requestId !== observationLocationRequestId || !$('observation-dialog').open) return false;
    button.disabled = false;
    return true;
  };
  navigator.geolocation.getCurrentPosition(pos => {
    if (!finish()) return;
    const {latitude, longitude, accuracy} = pos.coords || {};
    const ageSeconds = (Date.now() - pos.timestamp) / 1000;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1000000 ||
        !Number.isFinite(ageSeconds) || ageSeconds < -5 || ageSeconds > 60) {
      status.textContent = 'Browser location was invalid or stale. Retry or enter coordinates manually.';
      return;
    }
    const form = $('observation-form');
    form.elements.latitude.value = latitude.toFixed(7);
    form.elements.longitude.value = longitude.toFixed(7);
    form.elements.accuracy_m.value = accuracy.toFixed(1);
    form.elements.location_source.value = 'BROWSER_REPORTED';
    form.elements.fix_age_seconds.value = Math.max(0,ageSeconds).toFixed(1);
    observationLocationFix = {reportedAt: pos.timestamp};
    status.textContent = `Browser observer position filled (±${Math.round(accuracy)} m; fix age ${Math.round(Math.max(0,ageSeconds))} s). Check the coordinates before saving. Desktop/VPN location may be approximate.`;
  }, err => {
    if (!finish()) return;
    const reason = err.code === 1 ? 'permission denied' : err.code === 3 ? 'request timed out' : 'position unavailable';
    status.textContent = `Location ${reason}. Existing coordinates were not changed; retry or enter them manually.`;
  }, {enableHighAccuracy:true, maximumAge:0, timeout:15000});
}

// v0.2.16: browse only stored observations. Filters do not request hardware,
// infer transmitter positions, or mutate the SQLite investigation database.
function refreshDiscoverySessions() {
  const select = $('discovery-session');
  const chosen = select.value || 'ALL';
  select.replaceChildren();
  for (const [value, label] of [['ALL','All investigations'],['NONE','Not linked to a session']]) {
    const opt = document.createElement('option'); opt.value = value; opt.textContent = label; select.append(opt);
  }
  state.sessions.forEach(session => {
    const opt = document.createElement('option');
    opt.value = String(session.id); opt.textContent = `${session.name} (#${session.id})`;
    select.append(opt);
  });
  select.value = [...select.options].some(opt=>opt.value === chosen) ? chosen : 'ALL';
}
function filteredDiscoveries(now = Date.now()) {
  const keyword = $('discovery-search').value.trim().toLowerCase();
  const kind = $('discovery-kind').value;
  const source = $('discovery-source').value;
  const session = $('discovery-session').value;
  const age = $('discovery-age').value;
  const mapped = $('discovery-mapped').checked;
  const includeDemo = $('show-demo-list').checked;
  const cutoff = age === 'ALL' ? null : now - Number(age) * 86400000;
  const items = state.observations.filter(o =>
    (includeDemo || o.source !== 'DEMO') &&
    (kind === 'ALL' || kind === o.kind) &&
    (source === 'ALL' || source === o.source) &&
    (session === 'ALL' || (session === 'NONE' ? o.session_id == null : String(o.session_id) === session)) &&
    (!mapped || (o.latitude != null && o.longitude != null)) &&
    (cutoff === null || (Number.isFinite(Date.parse(o.observed_at)) && Date.parse(o.observed_at) >= cutoff && Date.parse(o.observed_at) <= now)) &&
    (!keyword || [o.label, o.identifier, o.notes, o.source_device].some(s => String(s || '').toLowerCase().includes(keyword)))
  );
  // Timestamp sorts are explicitly historical; stable ID resolves duplicate times.
  items.sort((a,b) => {
    const order = (Date.parse(a.observed_at) || 0) - (Date.parse(b.observed_at) || 0) || a.id - b.id;
    return $('discovery-sort').value === 'OLDEST' ? order : -order;
  });
  return items;
}
function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value ?? '');
  // Never let exported labels/notes from imports become spreadsheet formulas.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g,'""') + '"';
}
function discoveriesCsv(items) {
  const cols = ['id','observed_at','kind','source','label','identifier','notes','source_device','frequency_mhz','rssi_dbm','signal_quality_percent','latitude','longitude','accuracy_m','location_source','fix_age_seconds','session_id','survey_capture_id','timestamp_basis','device_reported_at_utc','hardware_id'];
  return '\uFEFF' + cols.join(',') + '\r\n' + items.map(item => cols.map(col=>csvCell(item[col])).join(',')).join('\r\n') + '\r\n';
}
function downloadShownDiscoveries() {
  const items = filteredDiscoveries();
  if (!items.length) return;
  const blob = new Blob([discoveriesCsv(items)], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'openrf-filtered-observations.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash(`Prepared local CSV for ${items.length} matching saved record(s). No upload performed.`);
}
function resetDiscoveryFilters() {
  $('discovery-search').value = '';
  $('discovery-kind').value = 'ALL';
  $('discovery-source').value = 'ALL';
  $('discovery-session').value = 'ALL';
  $('discovery-age').value = 'ALL';
  $('discovery-sort').value = 'NEWEST';
  $('discovery-mapped').checked = false;
  $('show-demo-list').checked = false;
  $('discovery-refine').open = false;
  renderDiscoveries();
}
function renderDiscoveries() {
  const items = filteredDiscoveries();
  $('discovery-results-count').textContent = `${items.length} of ${state.observations.length} saved observation(s) shown${state.observations.length >= 10000 ? ' (latest 10,000 records loaded)' : ''}`;
  $('discovery-export').disabled = !items.length;
  $('discoveries-list').innerHTML = items.length ? items.map(o => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(o.label)}</h4>
    <span class="badge">${escapeHTML(o.kind)}</span><span class="badge ${o.source === 'DEMO'?'demo':'manual'}">${escapeHTML(o.source)}</span></div>
    <p>${escapeHTML(o.notes || (o.identifier ? `Identifier: ${o.identifier}` : 'No notes'))}</p>
    <div class="tiny">${escapeHTML(stamp(o.observed_at))} · ${o.latitude === null ? 'No survey coordinates' : `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)} — observer position`} · ${escapeHTML(o.source_device)}</div>
    ${o.rssi_dbm !== null ? `<div class="tiny">RSSI ${escapeHTML(o.rssi_dbm)} dBm ${o.frequency_mhz !== null ? `· ${escapeHTML(o.frequency_mhz)} MHz` : ''}</div>` : ''}
    ${o.signal_quality_percent !== null && o.signal_quality_percent !== undefined ? `<div class="tiny">NetworkManager quality ${escapeHTML(o.signal_quality_percent)}% (not RSSI) · ${escapeHTML(o.location_source || 'UNSPECIFIED')} observer location ${o.fix_age_seconds !== null ? `· fix age ${escapeHTML(o.fix_age_seconds)} seconds` : ''}</div>` : ''}
    </div><div class="item-actions">${o.latitude !== null ? `<button class="btn mini outline" data-zoom="${o.id}">Map</button>` : ''}<button class="btn mini danger-outline" data-delete="${o.id}">Delete</button></div></article>`).join('') :
    '<div class="empty">No saved observations match these filters. DEMO data requires explicit opt-in. Clear filters to view all available non-demo records.</div>';
}

function updateSessionReportSelector() {
  const select = $('session-report-select');
  const previous = select.value;
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'Select an investigation';
  select.append(placeholder);
  for (const session of state.sessions) {
    const opt = document.createElement('option');
    opt.value = String(session.id);
    opt.textContent = `#${session.id} · ${session.name} (${session.status})`;
    select.append(opt);
  }
  if (state.sessions.some(s => String(s.id) === previous)) select.value = previous;
  else if (state.sessions.length === 1) select.value = String(state.sessions[0].id);
  const active = !!select.value;
  ['session-report-preview', 'session-report-html', 'session-report-json'].forEach(id => $(id).disabled = !active);
  $('session-report-status').textContent = active
    ? 'Ready for a historical report. DEMO and exact coordinates are opt-in. Review notes and identifiers before sharing.'
    : 'Choose an investigation. No files are generated automatically.';
}

function sessionReportUrl(kind, download = false) {
  const selected = $('session-report-select').value;
  if (!/^[0-9]+$/.test(selected) || !state.sessions.some(s => String(s.id) === selected)) {
    throw Error('Choose an investigation first.');
  }
  const query = new URLSearchParams({
    include_demo: $('session-report-demo').checked ? '1' : '0',
    include_coordinates: $('session-report-coordinates').checked ? '1' : '0',
    download: download ? '1' : '0'
  });
  return `/api/reports/sessions/${selected}.${kind}?${query.toString()}`;
}

function openSessionReport(kind, download = false) {
  const url = sessionReportUrl(kind, download);
  // A trusted local same-origin URL is built solely from an existing numeric
  // session ID, validated options and a fixed HTML/JSON format.
  if (download) {
    const link = document.createElement('a');
    link.href = url; link.download = `openrf-investigation-${$('session-report-select').value}.${kind}`;
    document.body.append(link); link.click(); link.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  $('session-report-status').textContent = download
    ? 'Historical report download requested. File remains on this device unless you share it.'
    : 'Report opened in a new tab. Use Ctrl+P or your browser’s Print menu to print or Save as PDF.';
}

const FIELD_RECEIVERS = Object.freeze({
  UNASSIGNED: {label:'Unassigned receiver',page:'hardware',status:'No receiver has been selected.'},
  WIFI_NM: {label:'Linux Wi-Fi · NetworkManager',page:'scanner',status:'Requires a Linux-visible Wi-Fi interface and NetworkManager.'},
  BLE_BLUEZ: {label:'Linux BLE · BlueZ',page:'scanner',status:'Requires a Linux-visible Bluetooth controller and BlueZ.'},
  USB_SERIAL: {label:'OpenRF USB serial',page:'hardware',status:'A visible tty port does not confirm compatible firmware.'},
  RTL_POWER_FILE: {label:'Offline SDR CSV',page:'spectrum',status:'Offline historical CSV review and user-started short RTL-SDR captures, when compatible Linux-visible hardware and rtl_power are available.'},
  MANUAL: {label:'Manual field notes',page:'map',status:'Manual records are not verified RF measurements.'},
});
function activeFieldSurvey() { return state.sessions.find(s=>s.status==='ACTIVE') || null; }
function renderActiveFieldSurvey() {
  const active=activeFieldSurvey();
  $('field-action-row').hidden=!active;
  $('field-active-state').textContent=active?'ACTIVE · MANUAL SAVE':'NONE ACTIVE';
  const receiver=FIELD_RECEIVERS[active?.receiver_plan] || FIELD_RECEIVERS.UNASSIGNED;
  $('field-active-summary').innerHTML=active
    ? `<h4>${escapeHTML(active.name)} · #${active.id}</h4><p class="small">Planned: <strong>${escapeHTML(receiver.label)}</strong> · ${escapeHTML(active.site_label || 'No site label')}</p>
       <p class="small">${escapeHTML(active.objective || 'No objective recorded.')}</p>
       <div class="field-counts"><span>${active.observation_count} saved observations</span><span>${active.positioned_observations} non-DEMO records with observer coordinates</span><span>${active.sensor_observations} SENSOR readings</span><span>${active.capture_count} scan snapshots</span><span>${active.waypoint_count} manually recorded waypoints</span></div>
       <p class="small muted">${escapeHTML(receiver.status)} No scanning or location tracking is running because this investigation exists.</p>`
    : '<p class="small muted">No field survey is active. Start one to group manually saved observations with a survey objective and planned receiver.</p>';
  const linked=active
    ? `Active investigation #${active.id} · ${active.name} · ${receiver.label} (planned only). A saved reading will be linked to this investigation; unsaved scans are temporary.`
    : 'No active investigation. A saved reading remains unlinked unless you start one; a scan never saves automatically.';
  $('field-scanner-link').textContent=linked;
  $('field-map-link').textContent=linked;
  $('field-open-receiver').textContent=active ? `Open ${receiver.label}` : 'Open receiver workspace';
}
function renderSessions() {
  renderActiveFieldSurvey();
  $('session-count').textContent = `${state.sessions.length} sessions`;
  $('session-list').innerHTML = state.sessions.length ? state.sessions.map(s => `
    <article class="item"><div><div class="item-top"><h4>${escapeHTML(s.name)}</h4><span class="badge ${s.status === 'ACTIVE' ? '' : 'manual'}">${escapeHTML(s.status)}</span></div>
    <p>${escapeHTML(FIELD_RECEIVERS[s.receiver_plan]?.label || 'Unassigned receiver')} <span class="tiny">(planned, not verified)</span> · ${escapeHTML(s.site_label || 'No site label')}</p>
    <p class="small">${escapeHTML(s.objective || 'No survey objective recorded')}</p>
    <div class="field-counts"><span>${Number(s.observation_count)||0} saved</span><span>${Number(s.positioned_observations)||0} observer-coordinate records (non-DEMO)</span><span>${Number(s.sensor_observations)||0} SENSOR records</span><span>${Number(s.demo_observations)||0} DEMO</span><span>${Number(s.capture_count)||0} snapshots</span><span>${Number(s.waypoint_count)||0} waypoints</span></div>
    <div class="tiny">Started ${escapeHTML(stamp(s.started_at))} · ${s.ended_at ? `Ended ${escapeHTML(stamp(s.ended_at))}` : 'Not stopped'} · Saved data is local and historical${s.last_observed_at?` · Last record ${escapeHTML(stamp(s.last_observed_at))}`:''}</div>
    </div><div class="item-actions"><button class="btn mini outline" data-session-filter="${s.id}">Records</button><button class="btn mini outline" data-session-report="${s.id}">Report</button>
    ${s.status === 'ACTIVE' ? `<button class="btn mini danger-outline" data-stop="${s.id}">Stop</button>` : ''}</div></article>`).join('') :
    '<div class="empty">No sessions started. You can record notes against a session, but no background collection occurs.</div>';
  updateSessionReportSelector();
}

function renderCaptures() {
  const dest = $('captures-list');
  $('capture-count').textContent = `${state.captures.length} captures`;
  dest.innerHTML = state.captures.length ? state.captures.slice(0, 50).map(c => `
    <div class="capture-entry"><div><strong>${escapeHTML(c.sensor_id === 'openrf-serial-v1' ? 'USB sensor snapshot' : 'Wi-Fi survey')} #${escapeHTML(c.id)} · ${escapeHTML(c.saved_count)} saved of ${escapeHTML(c.result_count)} returned</strong>
    <p>Retrieved ${escapeHTML(stamp(c.retrieved_at_utc))} · ${escapeHTML(c.interface)} · ${escapeHTML(c.freshness)} · ${escapeHTML(c.location_source === 'BROWSER_REPORTED' ? `browser survey fix ±${c.accuracy_m} m; reported age ${c.fix_age_seconds}s` : 'no survey location')} · ${c.session_id ? `session #${escapeHTML(c.session_id)}` : 'not linked to a session'}</p></div><span class="badge">SENSOR</span></div>`).join('') :
    '<div class="empty">No wireless survey snapshots saved. Start a supported Wi-Fi scan from Map or Analysis, then choose Save scan snapshot.</div>';
}

function renderSensorRegistry() {
  const dest = $('sensor-registry-list');
  const diag = state.diagnostics;
  if (diag) $('sensor-diagnostics').textContent = `Inventory ${stamp(diag.collected_at_utc)} · Wi-Fi ${diag.wifi.prerequisites.possible ? 'prerequisites visible; scan not guaranteed' : 'unavailable'} · Last retrieval: ${diag.wifi.last_retrieval.last_scan} · ${diag.receiver_status}`;
  dest.innerHTML = state.sensors.map(sensor => `<div class="sensor-row">
    <div><strong>${escapeHTML(sensor.label)}</strong><div class="tiny">${escapeHTML(sensor.description)} · ${escapeHTML(sensor.sensor_id)}</div></div>
    <span class="pill ${sensor.status === 'ready' ? 'green' : 'amber'}">${escapeHTML(sensor.status.replaceAll('_',' '))}</span>
  </div>`).join('') || '<div class="empty">No sensor adapters registered.</div>';
}

function renderSerialPorts() {
  const select = $('usb-sensor-port');
  const previouslySelected = select.value;
  const ports = state.serialTransport?.ports || state.hardware?.serial_ports || [];
  const diagnostics = state.hardware?.serial_port_diagnostics || [];
  select.replaceChildren();
  if (!ports.length) {
    const option = document.createElement('option'); option.value = ''; option.textContent = 'No Linux USB-serial ports visible'; select.append(option);
    $('usb-sensor-status').textContent = 'No ttyUSB/ttyACM device is visible to Linux. On WSL, a physical USB board usually needs passthrough. This does not indicate RF coverage or a working receiver.';
  } else {
    for (const port of ports) { const option = document.createElement('option'); option.value = port; const info = diagnostics.find(d=>d.port===port); option.textContent = `/dev/${port} — ${info?.access === 'permission_denied' ? 'permission denied' : 'protocol unverified'}`; select.append(option); }
    if (ports.includes(previouslySelected)) select.value = previouslySelected;
  }
  for (const id of ['usb-sensor-probe','usb-sensor-capture']) $(id).disabled = ports.length === 0;
}
function recentSerialSurveyLocation() {
  if (!$('usb-sensor-location').checked) return null;
  const loc = state.browserLocation;
  const seconds = loc ? (Date.now() - loc.capturedAt) / 1000 : Infinity;
  if (!loc || seconds < 0 || seconds > 60) throw Error('No recent browser fix. Open Map → My location, then capture within 60 seconds, or uncheck the location option.');
  return {latitude:loc.lat, longitude:loc.lon, accuracy_m:loc.accuracy, fix_age_seconds:Math.round(seconds*10)/10};
}
async function runSerialSensor(snapshot) {
  const button = $(snapshot ? 'usb-sensor-capture' : 'usb-sensor-probe');
  const port = $('usb-sensor-port').value;
  if (!port) return flash('No inventoried USB serial port is available.', true);
  const survey_location = snapshot ? recentSerialSurveyLocation() : null;
  if (snapshot && !confirm('Request and save ONE snapshot from the selected, device-reported OpenRF Serial v1 module? No location is attached unless selected. The sensor identity and readings are not independently verified.')) return;
  const active = state.sessions.find(s=>s.status === 'ACTIVE');
  const body = snapshot ? {port, survey_location, session_id: active?.id || null} : {port};
  const buttons = [$('usb-sensor-probe'), $('usb-sensor-capture')];
  buttons.forEach(b=>b.disabled=true);
  $('usb-sensor-status').textContent = snapshot ? 'Requesting a single sensor snapshot over USB…' : 'Probing selected Linux USB serial port…';
  try {
    const result = await api(snapshot ? '/api/sensors/serial/snapshot' : '/api/sensors/serial/probe', 'POST', body);
    if (snapshot) {
      const cap = result.capture; const data = result.snapshot;
      $('usb-sensor-status').textContent = `Saved snapshot #${cap.id}: ${cap.saved_count} device-reported records from ${data.hardware_id} at ${stamp(data.retrieved_at_utc)}. ${data.freshness}. Identity and calibration unverified. ${cap.location_source === 'BROWSER_REPORTED' ? 'Browser observer position attached.' : 'No GPS position attached.'}`;
      flash(`USB snapshot saved: ${cap.saved_count} unverified device-reported observation(s).`);
    } else {
      $('usb-sensor-status').textContent = `Protocol ${result.protocol}; device-reported ID ${result.hardware_id}; declared measurements: ${result.capabilities.join(', ') || 'none'}. ${result.warning}`;
      flash(`OpenRF serial protocol responded on /dev/${port}. This is not a measurement or hardware identity verification.`);
    }
    await refresh();
  } catch(error) { $('usb-sensor-status').textContent = `USB sensor unavailable: ${error.message}`; flash(error.message,true); }
  finally {
    buttons.forEach(b=>b.disabled=!($('usb-sensor-port').value));
    try {
      state.diagnostics = await api('/api/sensors/diagnostics');
      state.readiness = await api('/api/hardware/readiness');
      renderSensorRegistry(); renderHardwareReadiness();
    } catch (_) { /* Never mask the actual probe outcome if diagnostics fail. */ }
  }
}

function renderHardwareReadiness() {
  const report = state.readiness;
  const items = $('hardware-readiness-items');
  const updated = $('hardware-readiness-updated');
  const exportButton = $('hardware-readiness-export');
  if (!report || !Array.isArray(report.checklist)) {
    items.innerHTML = '<div class="empty">No read-only readiness report is available.</div>';
    updated.textContent = 'Readiness unavailable. Try Refresh inventory.';
    exportButton.disabled = true;
    return;
  }
  exportButton.disabled = false;
  updated.textContent = `Checked ${stamp(report.collected_at_utc)} · ${report.summary.usb_serial_ports_visible} Linux serial port(s) visible · No RF scan started.`;
  items.innerHTML = report.checklist.map(check => `
    <div class="readiness-item"><div class="readiness-heading"><strong>${escapeHTML(check.label)}</strong><span class="pill">${escapeHTML(check.status.replaceAll('_', ' '))}</span></div>
      <p>${escapeHTML(check.explanation)}</p><div class="tiny"><strong>Next:</strong> ${escapeHTML(check.next_step)}</div></div>`).join('');
}
function downloadHardwareReadiness() {
  if (!state.readiness) return flash('Refresh hardware readiness before exporting.', true);
  if (!confirm('Save a read-only hardware readiness report? It contains Linux environment and device counts, not private investigations, GPS, USB serial numbers, or RF samples.')) return;
  const content = JSON.stringify(state.readiness, null, 2);
  const url = URL.createObjectURL(new Blob([content], {type:'application/json;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url;
  a.download = 'openrf-hardware-readiness.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHardwareManager() {
  const report = state.hardwareManager;
  const summary = $('hardware-manager-summary');
  const entries = $('hardware-manager-entries');
  if (!report || !Array.isArray(report.entries)) {
    summary.textContent = 'Hardware manager unavailable. Refresh inventory to retry.';
    entries.innerHTML = '<div class="empty">No current read-only device status.</div>';
    return;
  }
  const counts = report.summary || {};
  summary.textContent = `Read-only check ${stamp(report.collected_at_utc)} · ${counts.linux_usb_descriptors_visible ?? 0} USB descriptors, ${counts.linux_serial_ports_visible ?? 0} serial ports, ${counts.linux_wifi_interfaces_visible ?? 0} Linux Wi-Fi interfaces, ${counts.linux_bluetooth_controllers_visible ?? 0} BLE controllers. No continuous RF capture is running or verified by this screen.`;
  entries.innerHTML = report.entries.map(entry => `
    <div class="hardware-manager-row">
      <div class="hardware-manager-heading"><strong>${escapeHTML(entry.title)}</strong><span class="pill">${escapeHTML(entry.state.replaceAll('_', ' '))}</span></div>
      <p>${escapeHTML(entry.evidence)}</p>
      <div class="tiny"><strong>Next:</strong> ${escapeHTML(entry.next_step)}</div>
    </div>`).join('');
}

function renderHardware() {
  const hw = state.hardware; if (!hw) return;
  $('hardware-platform').textContent = hw.environment;
  $('hardware-cards').innerHTML = hw.capabilities.map(c => `
    <div class="hardware-card"><div class="panel-title"><h3>${escapeHTML(c.title)}</h3><span class="pill ${c.status === 'ready'?'green':'amber'}">${escapeHTML(c.status.replaceAll('_',' '))}</span></div>
    <p>${escapeHTML(c.description)}</p><small>Requires: ${escapeHTML(c.requires)}</small></div>`).join('');
  $('wifi-driver-status').textContent = hw.wifi_one_shot?.possible ?
    `Adapter ${hw.wifi_one_shot.interface} and nmcli found. A user-started survey is possible; actual operation unverified.` :
    `Not ready: ${hw.wifi_one_shot?.reason || 'No supported Linux interface'}. No WSL internal Wi-Fi passthrough.`;
  $('environment-info').textContent = [
    `Runtime: ${hw.environment}`, `Python: ${hw.python}`,
    `Inventory collected (UTC): ${hw.inventory_collected_utc || 'unknown'}`,
    `Network interfaces: ${hw.network_interfaces.join(', ') || 'none'}`,
    `Linux Wi-Fi interfaces: ${hw.network_details?.filter(n=>n.wireless).map(n=>n.name).join(', ') || 'none visible'}`,
    `Bluetooth controller interfaces: ${hw.bluetooth_adapters?.join(', ') || 'none visible'}`,
    `Bluetooth readiness: ${hw.bluetooth_readiness?.reason || 'unknown'}; no BLE scan running`,
    `NetworkManager utility: ${hw.command_availability.nmcli ? 'present' : 'not found'}`,
    `BlueZ utility: ${hw.command_availability.bluetoothctl ? 'present' : 'not found'}`,
    `RF tools: ${['iw','rtl_test','rtl_power','hackrf_info','gpsd'].filter(x=>hw.command_availability[x]).join(', ') || 'none found'}`,
    `SDR spectrum: opt-in bounded rtl_power captures when supported plus browser-local CSV/DEMO analysis; receiver hardware unverified`,
    `USB serial endpoints: ${(hw.serial_ports || []).join(', ') || 'none visible'}` ,
    `RF capture: INACTIVE — ${hw.scan_status}`
  ].join('\n');
  const inventory = $('device-inventory');
  const usb = hw.usb_devices || [];
  const ports = hw.serial_ports || [];
  const portDetails = hw.serial_port_diagnostics || [];
  const nets = hw.network_details || [];
  inventory.innerHTML = `
    <div class="device-group"><h4>USB descriptors (${usb.length})</h4>
      ${usb.length ? usb.map(d=>`<div class="device-line">${escapeHTML(d.product || 'Unnamed USB device')} <small>${escapeHTML(d.manufacturer || 'Unknown manufacturer')} · ${escapeHTML(d.vendor_id)}:${escapeHTML(d.product_id)} · Port ${escapeHTML(d.port)}</small></div>`).join('') : '<div class="device-empty">No USB device descriptors visible. WSL USB passthrough may not be configured.</div>'}
    </div>
    <div class="device-group"><h4>Network and serial interfaces</h4>
      ${nets.map(d=>`<div class="device-line">${escapeHTML(d.name)} <small>${d.wireless ? 'Linux wireless interface visible; scan unverified' : 'Not identified as Linux wireless'}</small></div>`).join('')}
      ${ports.map(d=>{ const info=portDetails.find(p=>p.port===d); return `<div class="device-line">/dev/${escapeHTML(d)}<small>${escapeHTML(info?.access || 'unverified')} · ${escapeHTML(info?.device_type || 'unknown')} · group ${escapeHTML(info?.group || 'unknown')}<br>${escapeHTML(info?.guidance || 'No sensor protocol verified')}</small></div>`; }).join('')}
      ${!(nets.length || ports.length) ? '<div class="device-empty">No relevant interfaces visible.</div>' : ''}
    </div>`;
}

function renderSignals() {
  const signals = state.observations.filter(o => ['WIFI','BLE','RF','CELLULAR'].includes(o.kind));
  const rows = signals.filter(o => o.source !== 'DEMO').slice(0, 100);
  $('scan-count').textContent = `${signals.filter(o=>o.source !== 'DEMO').length} saved · DEMO excluded`;
  renderWifiScan();
  $('signal-table').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>IDENTIFIER</th><th>KIND</th><th>RSSI</th><th>QUALITY</th><th>FREQUENCY</th><th>PROVENANCE</th><th>TIME</th></tr></thead><tbody>${rows.map(o=>`<tr><td data-label="Identifier">${escapeHTML(o.identifier || o.label)}</td><td data-label="Kind">${escapeHTML(o.kind)}</td><td data-label="RSSI">${format(o.rssi_dbm, ' dBm')}</td><td data-label="Quality">${format(o.signal_quality_percent, '%')}</td><td data-label="Frequency">${format(o.frequency_mhz, ' MHz')}</td><td data-label="Source">${escapeHTML(o.source)}</td><td data-label="Time">${escapeHTML(stamp(o.observed_at))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No saved RF measurements yet. One-shot Wi-Fi results above are temporary and not stored automatically.</div>';
  refreshHistorySeries();
  renderComparison();
}

// Map-first workflow: display stored observations only at actual survey coordinates.
// A one-shot NetworkManager result has no coordinates; keep its temporary list
// in the sheet, never plot it at a presumed transmitter position.
function mapVisibleObservations() {
  const mapModule=window.OpenRFSurveyMap;
  if (!mapModule) return state.observations.filter(o=>o.latitude != null && o.longitude != null &&
    state.mapKinds.has(o.kind) && (state.showDemo || o.source!=='DEMO'));
  return mapModule.visible(state.observations,{
    kinds:[...state.mapKinds], includeDemo:state.showDemo, window:$('map-survey-age').value
  });
}
function mapMetricMode() { return $('map-metric-mode').value; }
function markerAppearance(o) {
  return window.OpenRFSurveyMap?.display(o,mapMetricMode()) || {color:'#30dec0',label:'Observer point'};
}
function mapMetricLegend() {
  const mode=mapMetricMode();
  if(mode==='rssi') return 'RSSI (dBm) at the RECEIVER: teal ≥ −60, yellow −80 to −61, pink < −80, gray = no RSSI. Different receivers/locations are not directly comparable; colors do NOT indicate transmitter proximity.';
  if(mode==='quality') return 'NetworkManager quality (%) at the RECEIVER: teal ≥70%, yellow 40–69%, pink <40%, gray = no Wi-Fi quality. Quality is NOT RSSI dBm or distance.';
  return 'Marker color identifies the saved observation category. DEMO is orange. All points mark observer positions, never transmitter positions.';
}
// Only previously saved, location-bearing rows visible under the chosen layer/date
// filter are eligible for spatial comparison. History engine enforces identical
// signal identifier, receiver identity, frequency, provenance and measurement unit.
function activeMapSpatialSurvey() {
  if(!state.mapSurveySeriesKey) return null;
  const engine=window.OpenRFHistoryAnalysis,tools=window.OpenRFSurveyMap;
  if(!engine || !tools) return null;
  const series=engine.makeSeries(mapVisibleObservations(),state.showDemo).find(s=>s.key===state.mapSurveySeriesKey);
  if(!series) return null;
  const spatial=tools.spatialSeries(series);
  return spatial.total>=2 && spatial.reportedSites>=2 ? {series,spatial} : null;
}
function surveySampleColor(series, sample) {
  return markerAppearance({kind:series.kind,source:series.source,rssi_dbm:series.metric==='rssi_dbm'?sample.value:null,
    signal_quality_percent:series.metric==='signal_quality_percent'?sample.value:null}).color;
}
function renderMapSpatialSurvey() {
  const el=$('map-series-detail');
  const active=activeMapSpatialSurvey();
  if(!active){el.hidden=true;el.replaceChildren();return;}
  const {series,spatial}=active,graph=window.OpenRFSurveyMap.timeline(spatial.samples);
  const span=spatial.rows.length, locations=spatial.reportedSites;
  const warnings=[
    `Saved observer coordinates are NOT transmitter locations. Points are not a travel track or a distance/direction estimate.`,
    `Receiver: ${series.source_device || 'unspecified'} · ${series.frequency_mhz ?? 'unknown'} MHz · ${series.source}.`,
    `Reported GPS accuracy circles do not overlap for ${spatial.definiteSeparation} of ${spatial.comparablePairs} consecutive comparable sample pairs. This is not proof of distinct physical sites or transmitter localization.`,
    ...(series.metric==='signal_quality_percent'?['NetworkManager quality percentages are not RSSI; cached Wi-Fi scan results are possible.']:[]),
    ...(['MANUAL','IMPORTED'].includes(series.source)?['Manual/imported measurements are not independently verified.']:[]),
    ...(series.source==='SENSOR' && !series.hardware_id?['No verified hardware ID is attached to this saved series.']:[]),
    ...(spatial.rows.some(r=>['HOST_RETRIEVAL','HOST_RECEIPT','RETRIEVAL_ONLY','HOST_RETRIEVAL_ONLY'].includes(r.timestamp_basis))?['Some timestamps reflect host retrieval rather than actual radio emission time.']:[]),
    ...(series.source==='DEMO'?['SYNTHETIC DEMO / HISTORICAL — NOT LIVE.']:[]),
    ...(spatial.truncated?[`Only the latest ${spatial.displayed} of ${spatial.total} located samples are drawn; older saved measurements remain on the map in category view.`]:[])
  ];
  const svg=graph ? `<svg viewBox="0 0 366 134" role="img" aria-label="Historical ${escapeHTML(series.metricName)} at saved observer sites, chronological time axis, ${span} located readings">
    <path d="M18 20 H348 M18 110 H348" stroke="#355363" stroke-dasharray="3 4" fill="none"/>
    <polyline points="${graph.polyline}" fill="none" stroke="#34c9b1" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
    ${graph.points.length===1?`<circle cx="${graph.points[0].x}" cy="${graph.points[0].y}" r="4" fill="#34c9b1"/>`:''}
    <text x="18" y="130" fill="#9bb8c1">Oldest</text><text x="295" y="130" fill="#9bb8c1">Newest</text>
    </svg>` : '';
  el.hidden=false;
  el.innerHTML=`<div class="map-sheet-head"><div><strong>Saved multi-location signal survey</strong><small>${escapeHTML(series.kind)} · ${escapeHTML(series.identifier)} · ${escapeHTML(series.metricName)} (${escapeHTML(series.unit)})</small></div><button type="button" class="map-sheet-close" data-map-series-clear aria-label="Close multi-location signal survey">×</button></div>
    <p><strong>${span} located historical readings</strong> at ${locations} differing reported coordinate(s). No continuous tracking.</p>
    <div class="map-survey-plot">${svg}<small>Time-scaled historical ${escapeHTML(series.unit)} measurements, not an inferred transmitter location.${graph?.equalTimestamps?' All samples have the same timestamp.':''}</small></div>
    <div class="map-series-buttons"><button type="button" class="btn mini outline" data-map-series-fit>Show sample area</button><button type="button" class="btn mini outline" data-map-series-export>Export sample CSV</button></div>
    <details><summary>Recorded receiver positions (${Math.min(spatial.samples.length,30)} recent of ${span})</summary><div class="map-survey-samples">${spatial.samples.slice(-30).reverse().map(row=>`<div class="map-survey-sample"><strong>${escapeHTML(stamp(row.observed_at))} · ${escapeHTML(row.value)} ${escapeHTML(series.unit)}</strong><small>${row.lat.toFixed(6)}, ${row.lon.toFixed(6)} · ${row.accuracy_m===null?'accuracy unreported':`±${row.accuracy_m} m`} · ${escapeHTML(row.location_source)} · session ${escapeHTML(row.session_id??'—')}</small></div>`).join('')}</div></details>
    ${warnings.map(w=>`<p class="small muted">${escapeHTML(w)}</p>`).join('')}`;
}
function renderMapObservationDetail() {
  const out=$('map-observation-detail');
  const record=mapVisibleObservations().find(o=>o.id===state.mapObservationId);
  if(!record){ out.hidden=true;out.replaceChildren();return; }
  const metric=markerAppearance(record);
  const engine=window.OpenRFHistoryAnalysis;
  const matches=window.OpenRFSurveyMap?.seriesForRecord(state.observations,record,engine,state.showDemo) || [];
  const seriesBlocks=matches.map(series=>{
    const result=window.OpenRFSurveyMap.historySummary(series,engine);
    const n=result?.history?.stats?.count || 0;
    const median=result?.history?.stats?.median;
    const delta=result?.comparison?.delta;
    const warning=result?.history?.warnings?.slice(0,2) || [];
    const filteredSeries=engine.makeSeries(mapVisibleObservations(),state.showDemo).find(item=>item.key===series.key);
    const sites=window.OpenRFSurveyMap.spatialSeries(filteredSeries);
    const siteAction=sites.total>=2 && sites.reportedSites>=2
      ? `<button type="button" class="btn mini outline" data-map-series="${escapeHTML(series.key)}">Compare ${sites.total} saved readings at ${sites.reportedSites} coordinates</button>`
      : `<small>${sites.total} located reading(s), ${sites.reportedSites} reported coordinate(s) — multiple locations required for a spatial comparison.</small>`;
    return `<div class="map-history-metric"><strong>${escapeHTML(series.metricName)}: ${n} compatible saved reading(s)</strong>
      <span>${n ? `Historical median ${escapeHTML(median?.toFixed(1))} ${escapeHTML(series.unit)}` : 'No compatible history'}${Number.isFinite(delta) ? ` · Later−earlier median ${delta>=0?'+':''}${escapeHTML(delta.toFixed(1))} ${escapeHTML(series.unit)}` : ''}</span>
      <button type="button" class="btn mini outline" data-map-history="${escapeHTML(series.key)}">Open history / comparison</button>
      ${siteAction}
      ${warning.map(item=>`<small>${escapeHTML(item)}</small>`).join('')}</div>`;
  }).join('');
  out.hidden=false;
  out.innerHTML=`<div class="map-detail-head"><strong>Saved survey observation #${escapeHTML(record.id)}</strong><button type="button" id="map-detail-close" class="map-detail-close" aria-label="Close observation details">×</button></div>
    <p><strong>${escapeHTML(record.label)}</strong> · ${escapeHTML(record.kind)} · ${escapeHTML(record.source)}</p>
    ${record.identifier ? `<p class="small muted">Identifier ${escapeHTML(record.identifier)}</p>` : ''}
    <p class="small muted">${escapeHTML(stamp(record.observed_at))} · ${escapeHTML(record.source_device || 'Source device unspecified')}</p>
    <div class="map-detail-measure"><span class="map-legend-dot" style="--mark-color:${metric.color}"></span>${escapeHTML(metric.label)}
    ${record.rssi_dbm != null ? ` · RSSI ${escapeHTML(record.rssi_dbm)} dBm` : ''}
    ${record.signal_quality_percent != null ? ` · Quality ${escapeHTML(record.signal_quality_percent)}% (not dBm)` : ''}
    ${record.frequency_mhz != null ? ` · ${escapeHTML(record.frequency_mhz)} MHz` : ''}</div>
    <p class="small muted">Observer position ${Number(record.latitude).toFixed(5)}, ${Number(record.longitude).toFixed(5)}${record.accuracy_m != null ? ` · reported ±${escapeHTML(record.accuracy_m)} m` : ' · accuracy not reported'} · ${escapeHTML(record.location_source || 'Location source unspecified')}. This is NOT a transmitter position.</p>
    ${record.notes ? `<p class="small muted">${escapeHTML(record.notes)}</p>` : ''}
    ${record.source==='DEMO' ? '<strong class="map-demo-warning">SYNTHETIC DEMO / HISTORICAL — NOT LIVE</strong>' : ''}
    ${seriesBlocks || '<p class="small muted">No compatible recorded signal-history series. An identifier and real numeric measurement are needed for comparison.</p>'}
    <div class="button-line"><button type="button" class="btn mini outline" data-map-detail-zoom="${escapeHTML(record.id)}">Center on saved point</button></div>`;
}
function selectMapObservation(id) {
  if(!mapVisibleObservations().some(o=>o.id===id)) return;
  setMapSurveyOpen(true);
  state.mapObservationId=id;
  renderMapObservationDetail();
  // Scroll only the Layers sheet; never shift the map viewport on a five-inch display.
  const sheet=$('map-survey-panel'),detail=$('map-observation-detail');
  sheet.scrollTop=Math.max(0,detail.offsetTop-sheet.offsetTop-18);
  updateMap();
}
function renderMapSurveyPanel() {
  const all=mapVisibleObservations();
  const tools=window.OpenRFSurveyMap;
  const counts=tools?.counts(all) || {wireless:all.filter(o=>['WIFI','BLE','RF','CELLULAR'].includes(o.kind)).length,wifi:0,ble:0,rssi:0,quality:0};
  $('map-layer-count').textContent=String(all.length);
  $('map-layer-count').hidden=all.length===0;
  $('map-survey-toggle').setAttribute('aria-label',`Layers and scan (${all.length} mapped points)`);
  $('map-survey-summary').textContent=`${all.length} saved mapped observer point(s): ${counts.wireless} wireless · ${counts.wifi} Wi-Fi · ${counts.ble} BLE · ${counts.rssi} recorded RSSI value(s) · ${counts.quality} Wi-Fi quality value(s). No scan initiated. Observer positions only, not transmitter locations.`;
  $('map-metric-legend').textContent=mapMetricLegend();
  const recent=tools?.recent(all,12) || [];
  $('map-wireless-count').textContent=String(counts.wireless);
  $('map-wireless-recent').innerHTML=recent.length?recent.map(o=>{
    const metric=markerAppearance(o);
    return `<div class="map-survey-recent-row"><span class="map-legend-dot" style="--mark-color:${metric.color}"></span><div><strong>${escapeHTML(o.label || o.identifier || '(unnamed)')}</strong><small>${escapeHTML(o.kind)} · ${escapeHTML(stamp(o.observed_at))} · ${escapeHTML(metric.label)}</small></div><button type="button" class="btn mini outline" data-map-inspect="${escapeHTML(o.id)}">Inspect</button></div>`;
  }).join(''):'<p class="small muted">No saved Wi-Fi/BLE/RF/cellular reading with an observer coordinate matches the selected layers and date range.</p>';
  if(counts.wireless>recent.length) $('map-wireless-recent').insertAdjacentHTML('beforeend',`<p class="small muted">Showing latest ${recent.length} of ${counts.wireless} mapped wireless records. Use Discoveries for full history.</p>`);
  renderMapObservationDetail();
  renderMapSpatialSurvey();
  const output=$('map-wifi-readings'),scan=state.wifiScan;
  if(!scan){output.innerHTML='<p class="small muted">No temporary Wi-Fi retrieval in memory. Scans must be started manually.</p>';}
  else{
    const entries=(scan.records||[]).slice(0,6);
    output.innerHTML=`<div class="map-live-heading"><strong>Temporary Wi-Fi retrieval · NOT MAPPED</strong><span>${escapeHTML(stamp(scan.retrieved_at_utc))}</span></div>
      <p>${escapeHTML(scan.interface)} · ${escapeHTML(scan.freshness)} · ${scan.records?.length||0} entry/entries. Not GPS-located. Quality % is NOT RSSI.</p>
      ${entries.map(n=>`<div class="map-live-row"><div><strong>${escapeHTML(n.ssid||'Hidden SSID')}</strong><span>${escapeHTML(format(n.frequency_mhz,' MHz'))} · quality ${escapeHTML(format(n.signal_quality_percent,'%'))}</span></div><button type="button" class="btn mini outline" data-save-wifi="${escapeHTML(n.bssid)}" ${scan.scan_id?'':'disabled'}>Save</button></div>`).join('')}
      ${scan.records?.length>entries.length?`<p>Showing ${entries.length} of ${scan.records.length} results; use Detailed analysis for the rest.</p>`:''}`;
  }
  const bleOut=$('map-ble-readings'),ble=state.bleScan;
  if(!ble){bleOut.innerHTML='<p class="small muted">No temporary Bluetooth LE retrieval in memory. Linux-visible hardware is required.</p>';}
  else{
    const entries=(ble.records||[]).slice(0,6);
    bleOut.innerHTML=`<div class="map-live-heading"><strong>Temporary BLE retrieval · NOT MAPPED</strong><span>${escapeHTML(stamp(ble.retrieved_at_utc))}</span></div>
      <p>${escapeHTML(ble.controller||'Linux BlueZ')} · ${ble.records?.length||0} entry/entries · retrieval time, not verified advertisement time. BLE identifiers may rotate.</p>
      ${entries.map(n=>`<div class="map-live-row"><div><strong>${escapeHTML(n.name||'(unnamed LE device)')}</strong><span>${escapeHTML(format(n.rssi_dbm,' dBm'))} · ${escapeHTML(n.address||'Address unavailable')}</span></div><button type="button" class="btn mini outline" data-save-ble="${escapeHTML(n.address)}" ${ble.scan_id?'':'disabled'}>Save</button></div>`).join('')}
      ${ble.records?.length>entries.length?`<p>Showing ${entries.length} of ${ble.records.length}; see Detailed analysis for the rest.</p>`:''}`;
  }
  updateCaptureButtons();
}
function setMapSurveyOpen(open) {
  closeMapFeatureInfo();
  if(open)$('map-navigation-options').open=false;
  $('map-survey-panel').hidden = !open;
  $('map-survey-toggle').setAttribute('aria-expanded', String(open));
  if(open)alignBottomMapPopup($('map-survey-panel'));
}
function wifiBandLabel(record) {
  if (record.band) return record.band;
  const mhz = Number(record.frequency_mhz);
  if (mhz >= 2300 && mhz <= 2500) return '2.4 GHz';
  if (mhz >= 4900 && mhz < 5925) return '5 GHz';
  if (mhz >= 5925 && mhz <= 7125) return '6 GHz';
  if (mhz >= 57000 && mhz <= 71000) return '60 GHz';
  return 'Other / unknown';
}
function filteredWifiRecords(scan, band, text) {
  const term = (text || '').toLocaleLowerCase().trim();
  return (scan?.records || []).filter(n => {
    const value = wifiBandLabel(n);
    const bandOK = band === 'all' || (band === 'other' ? !['2.4 GHz','5 GHz','6 GHz'].includes(value) : value === band);
    return bandOK && (!term || `${n.ssid || ''} ${n.bssid || ''}`.toLocaleLowerCase().includes(term));
  }).slice().sort((a,b) => (b.signal_quality_percent ?? -1) - (a.signal_quality_percent ?? -1));
}
function renderWifiScan() {
  const out = $('live-wifi-results');
  if (!out) return;
  const scan = state.wifiScan;
  if (!scan) {
    out.innerHTML = '<div class="empty">No one-shot Wi-Fi survey has been requested. Results are shown only when a real Linux interface responds.</div>';
    return;
  }
  const all = scan.records || [];
  const entries = filteredWifiRecords(scan, $('wifi-results-band').value, $('wifi-results-search').value);
  const bands = ['2.4 GHz','5 GHz','6 GHz'].map(b => `${b}: ${all.filter(x => wifiBandLabel(x) === b).length}`).join(' · ');
  out.innerHTML = `<p class="tiny">${escapeHTML(scan.interface)} · Retrieved ${escapeHTML(stamp(scan.retrieved_at_utc))} · ${all.length} returned, ${entries.length} shown · ${escapeHTML(bands)}. ${escapeHTML(scan.freshness)}. Quality % is NOT RSSI/dBm. AP RATE is advertised, not measured throughput. No AP position inferred.</p>` +
    (entries.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>SSID</th><th>BSSID</th><th>BAND</th><th>FREQ.</th><th>CHANNEL</th><th>QUALITY</th><th>SECURITY</th><th>MODE</th><th>RATE*</th><th>SAVE</th></tr></thead><tbody>${entries.map(n=>`<tr><td data-label="SSID">${escapeHTML(n.ssid)}</td><td data-label="BSSID">${escapeHTML(n.bssid)}</td><td data-label="Band">${escapeHTML(wifiBandLabel(n))}</td><td data-label="Frequency">${format(n.frequency_mhz,' MHz')}</td><td data-label="Channel">${format(n.channel)}</td><td data-label="Quality">${format(n.signal_quality_percent,'%')}</td><td data-label="Security">${escapeHTML(n.security)}</td><td data-label="Mode">${escapeHTML(n.mode || 'Unknown')}</td><td data-label="Advertised rate">${escapeHTML(n.advertised_rate || 'Unknown')}</td><td data-label="Save"><button type="button" class="btn mini outline" data-save-wifi="${escapeHTML(n.bssid)}" ${scan.scan_id ? '' : 'disabled'}>Save</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${all.length ? 'No networks match the filters; change the band or search text.' : 'NetworkManager returned no access points. This does not prove the area has no wireless signals.'}</div>`);
}
for (const id of ['wifi-results-band','wifi-results-search']) $(id).addEventListener(id.endsWith('band') ? 'change' : 'input', renderWifiScan);

// Historical charts use exactly the same identity contract as the comparison
// engine; selecting an identifier never silently mixes devices, frequencies or %/dBm.
function historySelection() {
  const engine = window.OpenRFHistoryAnalysis;
  const series = engine?.makeSeries(state.observations, $('history-include-demo').checked)
    .find(item=>item.key === $('signal-select').value);
  return {engine, series, selection:series ? engine.history(series, $('history-window').value) : null};
}
function refreshHistorySeries() {
  const engine = window.OpenRFHistoryAnalysis, select = $('signal-select'), previous = select.value;
  if (!engine) { $('history-summary').textContent = 'Historical analysis module is unavailable.'; return; }
  const list = engine.makeSeries(state.observations, $('history-include-demo').checked);
  select.replaceChildren();
  const empty = document.createElement('option'); empty.value=''; empty.textContent='Select one historical measurement series'; select.append(empty);
  for (const series of list) {
    const option = document.createElement('option'); option.value=series.key;
    option.textContent=`${series.kind} · ${series.identifier} · ${series.metricName} (${series.unit}) · ${series.frequency_mhz ?? '?'} MHz · ${series.source} · ${series.source_device} (${series.rows.length})`;
    select.append(option);
  }
  select.value = list.some(series=>series.key===previous) ? previous : '';
  drawHistory();
}
function drawHistory() {
  const {engine,series,selection} = historySelection();
  const summary = $('history-summary'), chart = $('history-graph'), details = $('history-records');
  $('history-export').disabled = !selection?.rows.length;
  if (!engine || !series || !selection?.stats) {
    summary.textContent='Choose a compatible saved measurement series. DEMO records are excluded by default.';
    chart.innerHTML='<div class="empty">No saved readings selected. A scan does not appear here until you explicitly save its observations.</div>';
    details.replaceChildren();
    return;
  }
  const fmt = val=>Number(val).toFixed(1);
  const result = selection.stats;
  summary.innerHTML=`<div class="history-summary-grid"><div><small>Saved readings in window</small><strong>${result.count}</strong></div><div><small>Median ${escapeHTML(series.unit)}</small><strong>${fmt(result.median)}</strong></div><div><small>Lowest ${escapeHTML(series.unit)}</small><strong>${fmt(result.min)}</strong></div><div><small>Highest ${escapeHTML(series.unit)}</small><strong>${fmt(result.max)}</strong></div></div>
    <p class="small muted">${escapeHTML(series.kind)} · ${escapeHTML(series.identifier)} · ${escapeHTML(series.source)} · ${escapeHTML(series.source_device)}${series.hardware_id?` · Device ID ${escapeHTML(series.hardware_id)}`:''} · ${series.frequency_mhz ?? '?'} MHz · ${escapeHTML(series.metricName)}</p>
    <p class="small muted">${escapeHTML(stamp(result.first))} to ${escapeHTML(stamp(result.last))} · ${selection.skipped} older reading(s) outside window · ${selection.drawn} plotted of ${result.count} (all selected readings included in statistics and CSV)</p>
    <ul class="comparison-cautions">${selection.warnings.map(w=>`<li>${escapeHTML(w)}</li>`).join('')}</ul>`;
  const pts=selection.plot;
  const x0=40,x1=592,y0=14,y1=176;
  const low=result.min,high=result.max;
  const diff=high-low || 1;
  const a=pts[0]._time,b=pts[pts.length-1]._time;
  const coords=pts.map((row,index)=>({x:x0+(b===a?(pts.length===1?0.5:index/(pts.length-1)):(row._time-a)/(b-a))*(x1-x0),
    y:y1-((row._value-low)/diff)*(y1-y0)}));
  const path=coords.map((point,index)=>`${index===0?'M':'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const medianY=(y1-((result.median-low)/diff)*(y1-y0)).toFixed(2);
  const unit=escapeHTML(series.unit);
  chart.innerHTML=`<svg viewBox="0 0 620 216" role="img" aria-label="Historical ${escapeHTML(series.metricName)} timeline, ${result.count} saved readings in ${unit}, oldest to newest">
     <line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" class="gridline"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" class="gridline"/>
     <line x1="${x0}" x2="${x1}" y1="${medianY}" y2="${medianY}" stroke="#c09e5b" stroke-dasharray="5 5" stroke-width="1.2"/>
     <text x="1" y="${y0+4}">${fmt(high)}</text><text x="1" y="${y1+4}">${fmt(low)}</text>
     <path d="${path}" fill="none" stroke="#41d8bd" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
     ${coords.length===1?`<circle cx="${coords[0].x.toFixed(2)}" cy="${coords[0].y.toFixed(2)}" r="4" fill="#81f4dc"/>`:''}
     <text x="${x0}" y="204">Oldest saved</text><text x="${x1-88}" y="204">Newest saved</text></svg>
     <div class="history-chart-legend">Teal: recorded ${unit} · Dotted: median · Time-scaled; equal timestamps may overlap</div>`;
  const recent=selection.rows.slice(-12).reverse();
  details.innerHTML=`<details><summary>Show latest saved readings (${Math.min(selection.rows.length,12)} of ${selection.rows.length})</summary>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Saved time</th><th>Value</th><th>Session</th><th>Timestamp basis</th></tr></thead><tbody>${recent.map(row=>`<tr><td data-label="Saved time">${escapeHTML(stamp(row.observed_at))}</td><td data-label="Value">${fmt(row._value)} ${unit}</td><td data-label="Session">${escapeHTML(row.session_id ?? '—')}</td><td data-label="Time basis">${escapeHTML(row.timestamp_basis || 'Unspecified')}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function exportHistoryCsv() {
  const {engine,series,selection}=historySelection();
  const csv=engine?.historyCsv(series,selection,$('history-export-coordinates').checked);
  if (!csv) return;
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download='openrf-signal-history.csv';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash(`Exported ${selection.rows.length} HISTORICAL readings. ${$('history-export-coordinates').checked?'Coordinates included by choice.':'Precise observer coordinates excluded.'} No upload performed.`);
}


// v0.2.17: comparisons operate on already-saved, historical observations only.
// Group by measurement units + recorded receiver/provenance rather than by name alone.
function renderComparison() {
  const engine = window.OpenRFHistoryAnalysis;
  const selector = $('compare-series');
  if (!engine) { $('comparison-result').textContent = 'Saved comparison engine unavailable. No analysis performed.'; return; }
  const seriesList = engine.makeSeries(state.observations, $('compare-include-demo').checked);
  const previous = selector.value;
  selector.replaceChildren();
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Choose a recorded signal'; selector.append(blank);
  for (const series of seriesList) {
    const option = document.createElement('option'); option.value = series.key;
    option.textContent = `${series.kind} · ${series.identifier} · ${series.metricName} (${series.unit}) · ${series.frequency_mhz ?? '?'} MHz · ${series.source} · ${series.source_device} (${series.rows.length})`;
    selector.append(option);
  }
  selector.value = seriesList.some(series=>series.key === previous) ? previous : '';
  for (const controlId of ['compare-before-session','compare-after-session']) {
    const control = $(controlId), prior = control.value;
    control.replaceChildren();
    const option = document.createElement('option'); option.value = ''; option.textContent = 'Choose an investigation'; control.append(option);
    for (const session of state.sessions) {
      const item = document.createElement('option'); item.value = String(session.id);
      item.textContent = `${session.name} (#${session.id})`;
      control.append(item);
    }
    control.value = state.sessions.some(session=>String(session.id) === prior) ? prior : '';
  }
  renderComparisonResult(seriesList);
}
function renderComparisonResult(seriesList = null) {
  const engine = window.OpenRFHistoryAnalysis;
  const mode = $('compare-mode').value;
  for (const field of document.querySelectorAll('.compare-session-field')) field.hidden = mode !== 'sessions';
  const series = (seriesList || engine?.makeSeries(state.observations, $('compare-include-demo').checked) || [])
    .find(item=>item.key === $('compare-series').value);
  const output = $('comparison-result'), exportButton = $('compare-export');
  if (!engine || !series) {
    exportButton.disabled = true;
    output.textContent = 'Choose a recorded measurement series. DEMO is excluded unless you explicitly enable it.';
    return;
  }
  const result = engine.compare(series, {mode, beforeSession:$('compare-before-session').value, afterSession:$('compare-after-session').value});
  exportButton.disabled = !!result.error;
  if (result.error) {
    output.textContent = result.error;
    return;
  }
  const n = value => Number(value).toFixed(1);
  const phaseLabel = mode === 'sessions' ? 'Baseline session' : 'Earlier saved readings';
  const followLabel = mode === 'sessions' ? 'Follow-up session' : 'Later saved readings';
  const group = (label, stats) => `<div class="comparison-metric"><div class="muted small">${label} · ${stats.count} saved</div><strong>${n(stats.median)} ${escapeHTML(series.unit)}</strong><div class="muted small">Range ${n(stats.min)} to ${n(stats.max)} · ${escapeHTML(stamp(stats.first))} → ${escapeHTML(stamp(stats.last))}</div></div>`;
  output.innerHTML = `<div class="comparison-metric-grid">${group(phaseLabel,result.baseline)}${group(followLabel,result.followup)}</div>
    <p class="comparison-delta"><strong>Median difference: ${result.delta >= 0 ? '+' : ''}${n(result.delta)} ${escapeHTML(series.unit)}</strong> · follow-up minus baseline (descriptive only)</p>
    <p class="small muted">${escapeHTML(series.kind)} · ${escapeHTML(series.identifier)} · ${escapeHTML(series.source)} · ${escapeHTML(series.source_device)}${series.hardware_id ? ` · Hardware ${escapeHTML(series.hardware_id)}` : ''} · ${series.frequency_mhz ?? '?'} MHz</p>
    <ul class="comparison-cautions">${result.warnings.map(warning=>`<li>${escapeHTML(warning)}</li>`).join('')}</ul>`;
}
function exportComparisonCsv() {
  const engine = window.OpenRFHistoryAnalysis;
  const series = engine.makeSeries(state.observations, $('compare-include-demo').checked)
    .find(item=>item.key === $('compare-series').value);
  const comparison = engine.compare(series, {mode:$('compare-mode').value,
    beforeSession:$('compare-before-session').value, afterSession:$('compare-after-session').value});
  if (comparison.error) return;
  const fields = ['phase','id','observed_at','kind','identifier','source','source_device','hardware_id','frequency_mhz','measurement_type','measurement_value','measurement_unit','latitude','longitude','accuracy_m','location_source','session_id','survey_capture_id','timestamp_basis','device_reported_at_utc'];
  const makeRow = (phase, obs) => {
    const record = {...obs, phase, measurement_type:series.metric, measurement_value:obs._value, measurement_unit:series.unit};
    return fields.map(field=>csvCell(record[field])).join(',');
  };
  const csv = '\uFEFF' + fields.join(',') + '\r\n' + [
    ...comparison.before.map(obs=>makeRow('BASELINE', obs)),
    ...comparison.after.map(obs=>makeRow('FOLLOWUP', obs))].join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'openrf-historical-comparison.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash('Exported historical comparison locally. No collection or upload performed.');
}

// MapLibre is preferred, but remote JavaScript or tiles can be blocked by VPNs,
// network rules, or browser extensions. This independent local raster/coordinate
// map needs no external JavaScript library and never requests OSM public tiles.
// A user-provided, licensed MBTiles raster basemap is optional.
function openrfMapStyleUrl() {
  if(state.baseMap==='satellite' || state.baseMap==='topographic')
    return `/api/vector/styles/${state.baseMap}.json`;
  return `/api/vector/styles/${state.style === 'light' ? 'light' : 'dark'}.json${state.mapVectorOffline ? '?offline=1' : ''}`;
}
function updateBaseMapPicker(){
  for(const option of document.querySelectorAll('#map-survey-panel input[name="map-basemap"]'))
    option.checked=option.value===state.baseMap;
  const note=$('map-basemap-note');
  if(note)note.textContent=state.baseMap==='satellite'?
    'USGS aerial imagery · online, U.S. only. Remembered choice reloads USGS tiles next time; viewed map area is shared, not GPS logs.':
    state.baseMap==='topographic'?
    'USGS contours and relief · online, mainly U.S. coverage. Remembered choice reloads USGS tiles next time; offline areas can be saved separately.':
    state.mapVectorOffline?'Default OpenRF · installed regional vector tiles, available offline.':
    'Default OpenRF · worldwide online map, auto-selects installed regional maps when available.';
  updateOfflineAttribution();
}
function selectBaseMap(next){
  if(!['default','satellite','topographic'].includes(next))return;
  rememberBaseMap(next);
  if(next===state.baseMap)return;
  state.baseMap=next;
  state.mapBasemapVisible=false;state.mapSourceWarningShown=false;
  $('map-error').hidden=true;
  updateBaseMapPicker();
  if(state.map){
    state.mapReady=false;
    state.map.setStyle(openrfMapStyleUrl(), {diff:false});
  }else if(state.rasterMap){
    // A failed WebGL context will not be repaired by switching styles.
    // Keep the working, no-WebGL raster renderer and switch its tile source.
    for(const image of state.rasterMap.tileNodes.values())image.remove();
    state.rasterMap.tileNodes.clear();state.rasterMap.failedTiles.clear();
    state.rasterMap.loadedSourceKey=null;
    state.rasterMap.render();
    updateOfflineAttribution();
  }
}
function regionalVectorReady(){
  return state.vectorStatus?.ready===true && state.vectorStatus?.fonts_ready===true;
}
function regionalVectorContains(lon,lat){
  const b=state.vectorStatus?.bounds;
  return regionalVectorReady() && Array.isArray(b) && b.length===4 &&
    [lon,lat,...b].every(Number.isFinite) && lon>=b[0] && lon<=b[2] && lat>=b[1] && lat<=b[3];
}
// Auto uses the full-world online map at the initial US overview, then the
// user's installed regional map when a REAL browser fix is inside coverage.
// A later browser fix outside the region restores worldwide coverage.
function preferLocalVectorsAtBrowserFix(lon,lat){
  if(state.mapVectorPreference!=='auto' || !regionalVectorReady() || state.mapOfflineRecoveryTried)return false;
  const useLocal=regionalVectorContains(lon,lat);
  if(state.mapVectorOffline===useLocal)return false;
  state.mapVectorOffline=useLocal;
  updateOpenRFVectorButtons();
  $('map-vector-status').textContent=useLocal ?
    'AUTO · using installed regional OpenRF vector tiles near your browser location. Outside the area, local roads are not included.' :
    'AUTO · outside local map coverage; using worldwide online OpenRF vectors when internet is available.';
  if(state.map && state.baseMap!=='satellite' && state.baseMap!=='topographic'){
    state.mapReady=false;
    try{state.map.setStyle(openrfMapStyleUrl(), {diff:false});}
    catch(error){
      console.warn('Unable to change vector map source:',error);
      state.mapStartupError=String(error?.message||error).slice(0,180);
      switchToRasterMap(`Vector renderer could not change styles (${state.mapStartupError}).`);
    }
  }
  return true;
}
async function refreshOpenRFVectorMapStatus() {
  try {
    state.vectorStatus=await api('/api/vector/status');
    const s=state.vectorStatus;
    if(s.ready && s.fonts_ready && state.mapVectorPreference==='offline')state.mapVectorOffline=true;
    $('map-vector-status').textContent=s.ready && s.fonts_ready ?
      `REGIONAL VECTOR ${state.mapVectorOffline?'ACTIVE':'READY'} · ${s.tile_count.toLocaleString()} installed tiles · Amador / Calaveras · ${state.mapVectorPreference==='auto'?'Auto-selects after a browser location fix inside coverage.':'Outside the region local roads are not available.'}` :
      `Regional offline vector unavailable: ${s.error || 'Map or glyph resources missing'}. Online OpenRF styles remain selectable.`;
    if (!(s.ready && s.fonts_ready) && state.mapVectorOffline) {
      state.mapVectorOffline=false;
      if(state.map && state.baseMap!=='satellite' && state.baseMap!=='topographic') state.map.setStyle(openrfMapStyleUrl(), {diff:false});
    }
  } catch(err) {$('map-vector-status').textContent=`Map assets status unavailable: ${err.message}`;}
  updateOpenRFVectorButtons();
}
function updateOpenRFVectorButtons(){
  $('map-vector-source').textContent=state.mapVectorOffline ? 'Use online vectors' : 'Use offline regional vectors';
  $('map-style').textContent=state.style==='dark' ? 'OpenRF Light' : 'OpenRF Dark';
  updateBaseMapPicker();
}
function showVectorBasemapNotice(message){
  const box=$('map-error');
  box.classList.add('map-notice');
  box.replaceChildren();
  const heading=document.createElement('strong');
  heading.textContent='Map tiles not visible';
  const detail=document.createElement('p');
  detail.textContent=message;
  box.append(heading,detail);
  box.hidden=false;
}
function visibleVectorBasemapFeatures(){
  if(!state.map || !state.mapReady)return false;
  try{
    if(state.baseMap==='satellite' || state.baseMap==='topographic')
      return state.mapRasterTileSeen===true || state.map.isSourceLoaded('openrf-usgs-basemap')===true;
    const layers=(state.map.getStyle()?.layers||[])
      .filter(layer=>layer.source==='openmaptiles' && layer.type!=='background')
      .map(layer=>layer.id);
    return layers.length>0 && state.map.queryRenderedFeatures(undefined,{layers}).length>0;
  }catch(_){return false;}
}
function frameInstalledRegion(){
  if(!state.map || !regionalVectorReady())return;
  const bounds=state.vectorStatus.bounds;
  const center=state.map.getCenter();
  if(regionalVectorContains(center.lng,center.lat))return;
  const gps=state.browserLocation;
  const target=gps && regionalVectorContains(gps.lon,gps.lat) ? [gps.lon,gps.lat] :
    [(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  state.map.jumpTo({center:target,zoom:8.5});
}
function checkVectorBasemap(attempt,styleUrl){
  if(attempt!==state.mapAttempt || !state.map || state.rasterMap ||
     state.mapBasemapVisible || openrfMapStyleUrl()!==styleUrl)return;
  if(visibleVectorBasemapFeatures()){
    state.mapBasemapVisible=true;
    $('map-error').hidden=true;
    return;
  }
  if(state.baseMap==='satellite' || state.baseMap==='topographic'){
    // isSourceLoaded() is false while *any* raster tile is outstanding, even
    // when the viewport already contains many usable tiles. Only a real
    // relevant tile failure with no successfully loaded raster tile can warn.
    if(state.mapRasterTileFailed && !state.mapRasterTileSeen)
      showVectorBasemapNotice('USGS '+(state.baseMap==='satellite'?'imagery':'topographic')+
        ' tile requests failed and no tiles have finished loading yet. Check connectivity or choose Default; the map will recover if tiles arrive.');
    return;
  }
  // The style.load event is not proof that the actual source tiles loaded.
  // A failed remote source used to leave a silent, featureless background.
  if(!state.mapVectorOffline && tryOfflineVectorRecovery(attempt,true))return;
  showVectorBasemapNotice(state.mapVectorOffline ?
    'The local Amador/Calaveras style opened, but no regional features rendered. Check the local vector tile files; the offline regional map is not a worldwide basemap.' :
    'The vector renderer opened but did not display roads or geographic features. Check the online tile connection, or choose installed regional vectors in Map settings below the map.');
}
function tryOfflineVectorRecovery(attempt,allowLoadedStyle=false){
  if(attempt===state.mapAttempt && state.mapOfflineRecoveryTried && state.mapVectorOffline && !state.mapReady)return true;
  if(attempt!==state.mapAttempt || !state.map || (state.mapReady && !allowLoadedStyle) || state.rasterMap ||
    state.baseMap==='satellite' || state.baseMap==='topographic' ||
    state.mapVectorOffline || state.mapOfflineRecoveryTried || !regionalVectorReady() ||
    state.mapVectorPreference==='online')return false;
  state.mapOfflineRecoveryTried=true;
  state.mapVectorOffline=true;
  state.mapReady=false;
  state.mapBasemapVisible=false;
  state.mapRegionalFramePending=true;
  try{
    state.map.setStyle(openrfMapStyleUrl(), {diff:false});
    updateOpenRFVectorButtons();
    $('map-vector-status').textContent='Online vector style did not start. Trying the installed regional offline vector map.';
    setTimeout(()=>{
      if(attempt===state.mapAttempt && !state.mapReady && !state.rasterMap)
        showVectorBasemapNotice('The installed regional vector style is taking longer than expected to load. Keeping MapLibre available so remaining tiles can finish; check the browser Console for a persistent source error.');
    },12000);
    return true;
  }catch(error){
    console.warn('Regional vector recovery failed:',error);
    state.mapStartupError=String(error?.message||error).slice(0,180);
    return false;
  }
}
function alignMapToolRail() {
  const rail = document.getElementById('map-tool-rail');
  const map = document.getElementById('map');
  const wrap = map?.closest('.map-wrap');
  const recenter = map?.querySelector('.openrf-recenter-button');
  if (!rail || !wrap || !recenter) return;
  const bounds = wrap.getBoundingClientRect();
  const button = recenter.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !button.width || !button.height) return;
  // A short visual break between the native map controls and the four tool
  // workspaces, tuned for the 1280×800 seven-inch field layout.
  const top = Math.round(button.bottom - bounds.top + 12);
  rail.style.top = `${top}px`;
  rail.style.right = `${Math.max(8, Math.round(bounds.right - button.right))}px`;
  // The bottom-right add/layers buttons remain accessible, even on 5-inch
  // landscape displays. Very short screens can scroll just this tool column.
  rail.style.maxHeight = `${Math.max(38, Math.round(bounds.height - top - 57))}px`;
}
function queueMapToolRailAlignment() {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(alignMapToolRail);
}
window.addEventListener('resize', queueMapToolRailAlignment);

// Only features with click actions receive a hand cursor. Restore the native
// pan/grab cursor between features, and never mask destination/area picking.
function installMapFeatureHoverCursors(map){
  const clickable=['camera-catalog-points','survey-series-points','survey-points','survey-sdr-sites','survey-waypoints'];
  const hovered=new Set(),canvas=map.getCanvas();
  const refresh=()=>{
    canvas.style.cursor=hovered.size && !state.navPicking && !state.areaChoosing && !state.navAvoidPicking ? 'pointer' : '';
  };
  for(const layer of clickable){
    map.on('mouseenter',layer,()=>{hovered.add(layer);refresh();});
    map.on('mouseleave',layer,()=>{hovered.delete(layer);refresh();});
  }
  map.on('style.load',()=>{hovered.clear();refresh();});
  canvas.addEventListener('mouseleave',()=>{hovered.clear();refresh();});
  map.__openrfRefreshClickableCursor=refresh;
}
function startMap() {
  if (state.map || state.rasterMap) return;
  state.mapStartupError=null;
  state.mapOfflineRecoveryTried=false;
  state.mapBasemapVisible=false;
  state.mapSourceWarningShown=false;
  state.mapRasterTileSeen=false;
  state.mapRasterTileFailed=false;
  state.mapRegionalFramePending=state.mapVectorOffline && state.mapVectorPreference==='offline';
  if (!window.maplibregl) { const view = state.preferredView; state.preferredView = null; return startRasterMap('MapLibre JavaScript did not load. The installed regional vector map needs MapLibre/WebGL. Using coordinate fallback.', view); }
  const attempt = ++state.mapAttempt;
  try {
    // Keep the overview visible while permission is requested; apply a later GPS fix via flyTo.
    const initial = state.preferredView || {center:[-98.5,39.8], zoom:2};
    state.preferredView = null;
    state.map = new maplibregl.Map({container:'map', style:openrfMapStyleUrl(), center:initial.center, zoom:initial.zoom, attributionControl:false, maplibreLogo:false});
    syncDestinationPickMode();
    state.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    // Separate location control follows zoom/compass in the native MapLibre stack.
    state.map.addControl({
      onAdd() {
        const group = document.createElement('div');
        group.className = 'maplibregl-ctrl maplibregl-ctrl-group openrf-recenter-control';
        group.append(makeMapRecenterButton());
        this._element = group;
        return group;
      },
      onRemove() { this._element?.remove(); this._element = null; }
    }, 'top-right');
    queueMapToolRailAlignment();
    state.map.on('style.load', () => {
      updateOfflineAttribution();
      state.mapReady=true;
      syncWalkingPathOverlay();
      state.mapBasemapVisible=false;
      state.mapSourceWarningShown=false;
      state.mapRasterTileSeen=false;
      state.mapRasterTileFailed=false;
      if(state.mapRegionalFramePending){state.mapRegionalFramePending=false;frameInstalledRegion();}
      installMarkerLayer();
      window.OpenRFCameras?.installVector(state.map);
      if(!state.map.__openrfRefreshClickableCursor)installMapFeatureHoverCursors(state.map);
      updateMap();
      window.OpenRFMeshDashboard?.vector(state.map,true);
      window.OpenRFPublicMesh?.vector(state.map,true);
      updateBrowserLocationMarker();applyPendingLocation();
      renderAreaOverlay();renderNavigationOverlay();applyNavigationFit();
      const url=openrfMapStyleUrl();
      setTimeout(()=>checkVectorBasemap(attempt,url),9000);
    });
    // A raster tile content event is stronger evidence of a working USGS
    // basemap than MapLibre's all-tiles-finished flag, which also counts
    // outstanding/offscreen requests during ordinary pans and zooms.
    state.map.on('sourcedata',event=>{
      if((state.baseMap!=='satellite' && state.baseMap!=='topographic') ||
         event.sourceId!=='openrf-usgs-basemap' ||
         event.sourceDataType!=='content' || !event.coord)return;
      state.mapRasterTileSeen=true;
      state.mapBasemapVisible=true;
      state.mapRasterTileFailed=false;
      state.mapSourceWarningShown=false;
      $('map-error').hidden=true;
    });
    state.map.on('idle',()=>{
      if(!state.mapBasemapVisible && visibleVectorBasemapFeatures()){
        state.mapBasemapVisible=true;
        $('map-error').hidden=true;
      }
    });
    state.map.on('movestart', event => { if (event.originalEvent) state.mapNavigationEpoch++; });
    // Rural Route-style behavior: a deliberate pan suspends camera following
    // without ending position acquisition. The recenter control resumes it.
    state.map.on('dragstart', () => {
      if (state.navFollowId!==null) {
        state.navFollowCameraSuspended=true;
        const info=$('map-follow-camera-note');
        if(info) info.textContent='Map moved manually · tap the crosshair to resume following.';
      }
    });
    state.map.on('move', () => {renderAreaOverlay(); renderNavigationOverlay();});
    state.map.on('moveend', () => window.OpenRFCameras?.onViewportChanged());
    state.map.on('click', (evt) => {
      if (consumeNavigationPick(evt.lngLat.lng, evt.lngLat.lat)) return;
      // Blank-map taps should only pan/inspect. Manual observations are opened
      // by the explicit + button; clickable markers keep their own handlers.
      consumeAreaClick(evt.lngLat.lng, evt.lngLat.lat);
    });
    state.map.on('click', 'survey-series-points', (evt) => {
      if (state.navPicking || state.areaChoosing || !evt.features?.length) return;
      selectMapObservation(Number(evt.features[0].properties.id));
    });
    state.map.on('click', 'survey-points', (evt) => {
      if (state.navPicking || state.areaChoosing || !evt.features?.length) return;
      const p=evt.features[0].properties;
      selectMapObservation(Number(p.id));
    });
    state.map.on('click', 'survey-sdr-sites', evt => {
      if (state.navPicking || state.areaChoosing || !evt.features?.length) return;
      const site=evt.features[0].properties;
      showMapFeaturePopup(new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>RECORDED SDR survey site</strong><br>Browser operator position ±${escapeHTML(site.accuracy_m)} m, not verified antenna or transmitter<br>Capture ${escapeHTML(site.capture_id)} · ${escapeHTML(site.start_mhz)}–${escapeHTML(site.stop_mhz)} MHz · NOT LIVE`),state.map);
    });
    state.map.on('click', 'survey-waypoints', evt => {
      if (state.navPicking || !evt.features?.length) return;
      const w = evt.features[0].properties;
      showMapFeaturePopup(new maplibregl.Popup().setLngLat(evt.lngLat).setHTML(`<strong>Survey waypoint #${escapeHTML(w.id)}</strong><br>Browser-reported observer position, not RF detection<br>${escapeHTML(w.note || '')}`),state.map);
    });
    state.map.on('error', evt => {
      if(!evt.error)return;
      console.warn('MapLibre vector source error:',evt.error);
      // MapLibre may report an individual missing/aborted tile while replacing
      // its online style with regional offline tiles during GPS flyTo. It is
      // NOT a WebGL failure, and must never destroy the whole vector renderer.
      const source=String(evt.sourceId||evt.error?.sourceId||'');
      const msg=String(evt.error?.message||evt.error||'');
      if(state.baseMap==='satellite' || state.baseMap==='topographic'){
        if(source==='openrf-usgs-basemap' || /basemap\.nationalmap\.gov|USGSTopo|USGSImageryOnly/i.test(msg)){
          state.mapRasterTileFailed=true;
          setTimeout(()=>checkVectorBasemap(attempt,openrfMapStyleUrl()),4000);
        }
        return;
      }
      const tileIssue=source==='openmaptiles' ||
        /tiles\.openfreemap\.org|\/api\/vector\/tiles\/|failed to fetch|abort(ed)?/i.test(msg);
      if(!state.mapBasemapVisible && !state.mapSourceWarningShown){
        state.mapSourceWarningShown=true;
        showVectorBasemapNotice((state.baseMap==='satellite' || state.baseMap==='topographic') ?
          'USGS imagery/topographic tile request failed. This optional style is online-only. Select Default in Layers to use OpenRF maps.' : tileIssue ?
          (state.mapVectorOffline ?
            'A regional map tile request did not complete. Keeping the vector map open while the remaining installed tiles load.' :
            'An online map tile request did not complete. Keeping the vector map open; the installed regional map can be tried if needed.') :
          'A vector style resource could not load. Keeping the map open while its other resources finish; check the browser Console if roads remain missing.');
      }
    });
    $('map-mode').textContent = 'Offline / raster';
    setTimeout(() => {
      if (attempt === state.mapAttempt && !state.mapReady && !state.rasterMap && !tryOfflineVectorRecovery(attempt))
        showVectorBasemapNotice(state.mapVectorOffline ?
          'The installed regional vector style is still loading. A missing regional tile must not force a coordinate-grid fallback. Check the browser Console if roads remain absent.' :
          'The online vector style has not finished loading. Check tile connectivity or choose the installed regional vector source in Map settings.');
    }, 12000);
  } catch (error) {
    console.warn('MapLibre startup failed:', error);
    state.mapStartupError=String(error?.message||error).replace(/\s+/g,' ').slice(0,180);
    switchToRasterMap(`Vector renderer could not start (${state.mapStartupError}). This can be caused by browser WebGL/graphics support; the local vector tiles are not raster tiles.`);
  }
}
function locationZoom(accuracyMeters) {
  if (!Number.isFinite(accuracyMeters)) return 12;
  return accuracyMeters <= 1000 ? 15 : accuracyMeters <= 5000 ? 13 : 11;
}
function updateBrowserLocationMarker() {
  if (!state.browserLocation) return;
  if (state.map && window.maplibregl?.Marker) {
    if (!state.geoMarker) {
      const marker = document.createElement('div'); marker.className = 'browser-location-marker';
      marker.setAttribute('role','img');
      state.geoMarker = new maplibregl.Marker({element:marker,anchor:'center'})
        .setLngLat([state.browserLocation.lon,state.browserLocation.lat]).addTo(state.map);
    } else state.geoMarker.setLngLat([state.browserLocation.lon,state.browserLocation.lat]);
    const label=state.browserLocation.source==='gpsd'?'Local gpsd GNSS':'Browser-reported';
    const marker=state.geoMarker.getElement();
    marker.setAttribute('aria-label',`${label} location (not a transmitter)`);
    marker.title=`${label} device location; approximate, not a transmitter or saved survey point`;
  }
  state.rasterMap?.render();
}
function reduceMapMotion() {
  // Respect the operating system's reduced-motion accessibility preference.
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function applyPendingLocation() {
  const pending = state.pendingLocationView;
  if (!pending) return;
  // User gestures after a GPS request take precedence over automatic recentering.
  if (!pending.manual && pending.epoch !== state.mapNavigationEpoch) { state.pendingLocationView = null; return; }
  if (state.map && state.mapReady) {
    if (reduceMapMotion()) state.map.jumpTo({center:pending.center, zoom:pending.zoom});
    else state.map.flyTo({center:pending.center, zoom:pending.zoom,
      duration:2600, essential:false});
    state.pendingLocationView = null;
  } else if (state.rasterMap) {
    state.rasterMap.flyTo({center:pending.center, zoom:pending.zoom});
    state.pendingLocationView = null;
  }
  // When MapLibre has not finished loading, leave the pending fix untouched so
  // style.load can animate it from the overview rather than initializing there.
}

// The crosshair button is a manual convenience, not continuous GPS tracking.
// Reuse a recent browser fix immediately; otherwise ask for a new permissioned fix.
function recenterMapToBrowserLocation() {
  if(state.navFollowId!==null){
    state.navFollowCameraSuspended=false;
    state.navFollowLast=0;
    if(state.navFollowLastPosition){
      // Reapply the latest real reading; never manufacture another fix.
      followPosition(state.navFollowLastPosition);
      return;
    }
  }
  const loc = state.browserLocation;
  const age = loc ? Date.now() - loc.capturedAt : Infinity;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) ||
      !Number.isFinite(age) || age < 0 || age > 60000) {
    locateMap(true);
    return;
  }
  state.mapNavigationEpoch++;
  state.pendingLocationView = {
    center:[loc.lon, loc.lat], zoom:locationZoom(loc.accuracy),
    epoch:state.mapNavigationEpoch, manual:true
  };
  applyPendingLocation();
  const source=loc.source==='gpsd'?'local GNSS':'browser-reported';
  const message=`Recentered to recent ${source} location; may be approximate. No location was saved.`;
  $('map-location-status').textContent = message;
  showMapLocationFeedback(message);
}
function makeMapRecenterButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'openrf-recenter-button';
  button.setAttribute('aria-label','Center map on my browser location');
  button.title = 'Center map on my location (request a fresh fix if needed)';
  // Crosshair location icon instead of another navigation-arrow icon.
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="2"/></svg>';
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    recenterMapToBrowserLocation();
  });
  return button;
}

let mapLocationToastTimer=null;
function showMapLocationFeedback(message,error=false){
  const toast=$('map-location-toast');
  toast.textContent=message;toast.dataset.error=String(error);toast.hidden=false;
  if(mapLocationToastTimer!==null)clearTimeout(mapLocationToastTimer);
  mapLocationToastTimer=setTimeout(()=>{toast.hidden=true;mapLocationToastTimer=null;},10000);
}
function applyMapPosition(pos,origin,manual,epoch){
  const {latitude:lat,longitude:lon,accuracy}=pos.coords;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return false;
  state.browserLocation={lat,lon,accuracy,capturedAt:Date.now(),source:origin,
    source_device:pos.source_device||null};
  globalThis.window?.OpenRFMapElevation?.update(pos);
  preferLocalVectorsAtBrowserFix(lon,lat);
  if (!state.navOriginManual) {
    $('nav-start-lat').value=lat.toFixed(7);
    $('nav-start-lon').value=lon.toFixed(7);
    const description=origin==='gpsd'?'local GNSS':'browser-reported';
    $('nav-origin-status').textContent=`Starting position: ${description} (±${Number.isFinite(accuracy)?Math.round(accuracy):'unknown'} m). Approximate; adjust in Plan a trip if necessary.`;
  }
  updateBrowserLocationMarker();
  if(manual||epoch===state.mapNavigationEpoch){
    state.pendingLocationView={center:[lon,lat],zoom:locationZoom(accuracy),epoch,manual};
    applyPendingLocation();
  }
  const description=origin==='gpsd'?`Local GNSS (${pos.source_device||'gpsd receiver'})`:'Browser location';
  const message=`${description}: ${lat.toFixed(4)}, ${lon.toFixed(4)} (±${Number.isFinite(accuracy)?Math.round(accuracy)+' m':'unknown accuracy'}). Not saved.`;
  $('map-location-status').textContent=message;
  if(manual)showMapLocationFeedback(message);
  return true;
}
// Map recenter is an explicit one-shot action, separate from permissioned
// continuous navigation following. The backend still requires loopback origin
// plus a distinct map-recenter consent header before reading local gpsd.
async function tryMapRecenterGnss(epoch){
  try{
    const response=await fetch('/api/navigation/gnss',{cache:'no-store',headers:{'X-OpenRF-GNSS-Consent':'map-recenter'}});
    if(!response.ok)return {ok:false,message:'Local GNSS access was refused.'};
    const fix=await response.json();
    if(fix.status!=='fix')return {ok:false,message:fix.message||`Local GNSS status: ${fix.status||'unknown'}.`};
    const timestamp=Date.parse(fix.utc_timestamp);
    if(!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>15000||
       !Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||
       !Number.isFinite(fix.accuracy_m)||fix.accuracy_m<0)
      return {ok:false,message:'Local GNSS fix is stale, invalid or has no reported accuracy.'};
    const pos={origin:'gpsd',source_device:fix.source_device,timestamp,coords:{
      latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy_m,
      altitude:fix.altitude_m,altitudeAccuracy:fix.vertical_accuracy_m,
      altitudeReference:fix.altitude_reference}};
    return applyMapPosition(pos,'gpsd',true,epoch)?{ok:true}:{ok:false,message:'Local GNSS returned invalid coordinates.'};
  }catch(_){return {ok:false,message:'Could not query local gpsd. Check the optional GNSS receiver.'};}
}
function locateMap(manual = false) {
  if (!manual && state.autoLocateAttempted) return;
  state.autoLocateAttempted = true;
  const status = $('map-location-status');
  // The Electron shell has no built-in free geolocation provider; unlike a
  // regular browser it can silently fail without an OS permission dialog.
  // Do not auto-request at launch in that shell: wait for a tap on recenter.
  if(!manual&&window.openrfNativeBrowser?.available){
    status.textContent='Electron location is manual. Tap the map crosshair to check the browser or a connected local GNSS receiver.';
    return;
  }
  const epoch = state.mapNavigationEpoch;
  // Electron without a configured browser geolocation provider cannot obtain
  // a location just by granting permission. Avoid a pointless 15-second
  // browser timeout; attempt the operator's local GNSS receiver once instead.
  if(manual&&window.openrfNativeBrowser?.available&&window.openrfNativeBrowser.locationProviderConfigured===false){
    status.textContent='Checking an optional local GNSS receiver for your location…';
    showMapLocationFeedback(status.textContent);
    void tryMapRecenterGnss(epoch).then(result=>{
      if(result.ok)return;
      const message=`No Electron browser location provider is configured. ${result.message} Open OpenRF in Firefox for desktop location, or connect a local gpsd receiver. No position was invented.`;
      status.textContent=message;showMapLocationFeedback(message,true);
    });
    return;
  }
  const fallback=async(detail)=>{
    if(!manual){status.textContent=`Browser location ${detail}; the map remains usable.`;return;}
    showMapLocationFeedback(`Browser location ${detail}. Checking optional local GNSS…`);
    const result=await tryMapRecenterGnss(epoch);
    if(result.ok)return;
    const native=window.openrfNativeBrowser?.available;
    const message=native?
      `Electron browser location ${detail}. ${result.message} WSL may lack a location provider; use OpenRF in Firefox for desktop location or connect a GPS receiver via gpsd.`:
      `Browser location ${detail}. ${result.message} Check location permission or enter coordinates manually.`;
    status.textContent=message;showMapLocationFeedback(message,true);
  };
  if (!navigator.geolocation) {
    void fallback('is unavailable');
    return;
  }
  status.textContent = 'Getting browser location (permission may be requested)…';
  if(manual)showMapLocationFeedback('Requesting your browser location. Nothing is saved.');
  navigator.geolocation.getCurrentPosition(pos => {
    if(!applyMapPosition(pos,'browser',manual,epoch))void fallback('returned invalid coordinates');
  }, err => {
    const detail = err.code === 1 ? 'permission denied' : err.code === 3 ? 'request timed out' : 'position unavailable';
    void fallback(detail);
  }, {timeout:15000, maximumAge:60000, enableHighAccuracy:false});
}
function visibleWaypoints() {
  if (!$('waypoint-show-map').checked) return [];
  const chosen = Number($('waypoint-session').value);
  return chosen ? state.waypoints.filter(p=>p.session_id === chosen) : [];
}
function renderWaypoints() {
  const selector = $('waypoint-session');
  const old = selector.value;
  const available = state.sessions;
  selector.innerHTML = `<option value="">Choose an investigation</option>` + available.map(session =>
    `<option value="${session.id}">${escapeHTML(session.name)} (#${session.id} · ${session.status})</option>`).join('');
  const active = available.find(s=>s.status === 'ACTIVE');
  const fallback = active || available[0];
  selector.value = available.some(s=>String(s.id)===old) ? old : String(fallback?.id || '');
  renderWaypointSelection();
}
function renderWaypointSelection() {
  const selected = Number($('waypoint-session').value);
  const matching = state.waypoints.filter(w=>w.session_id === selected);
  const session = state.sessions.find(s=>s.id===selected);
  $('waypoint-record').disabled = !session || session.status !== 'ACTIVE';
  $('waypoint-export').disabled = !session || matching.length === 0;
  const more = state.waypointsTruncated ? ' Some older waypoints are omitted from this view.' : '';
  $('waypoint-status').textContent = `${matching.length} saved, explicitly requested observer waypoint(s) for this investigation.${more} ${session?.status !== 'ACTIVE' ? 'Only an active investigation accepts new waypoints.' : 'Use Save to request one new browser position.'}`;
  $('waypoint-list').innerHTML = matching.length ? matching.slice(0,30).map(w=>`
    <div class="waypoint-row"><div><strong>${escapeHTML(w.note || 'Survey waypoint')} #${w.id}</strong>
    <p class="small muted">${escapeHTML(stamp(w.recorded_at_utc))} · Browser-reported ±${escapeHTML(Math.round(w.accuracy_m))} m · fix age ${escapeHTML(w.fix_age_seconds.toFixed(1))} s · observer only</p></div>
    <div class="button-line"><button type="button" class="btn mini outline" data-waypoint-view="${w.id}">View</button>
    <button type="button" class="btn mini danger-outline" data-waypoint-delete="${w.id}">Delete</button></div></div>`).join('') : '<div class="empty">No survey waypoints saved for this investigation. Nothing is tracked automatically.</div>';
  updateMap();
}
async function recordWaypoint() {
  const session = state.sessions.find(s=>String(s.id)===$('waypoint-session').value);
  if (!session || session.status !== 'ACTIVE') { $('waypoint-status').textContent='Start an active investigation first.';return; }
  if (!navigator.geolocation) { $('waypoint-status').textContent='Browser geolocation is unavailable.';return; }
  const button = $('waypoint-record');
  button.disabled = true;
  $('waypoint-status').textContent = 'Requesting a fresh browser location; nothing is saved until permission and validation succeed…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    try {
      const age = (Date.now() - pos.timestamp) / 1000;
      if (!Number.isFinite(age) || age < 0 || age > 60) throw Error('Browser fix is stale; request a new location.');
      const {latitude, longitude, accuracy} = pos.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite)) throw Error('Browser did not report valid coordinates and accuracy.');
      const response = await api('/api/survey/waypoints','POST', {
        session_id:session.id, latitude, longitude, accuracy_m:accuracy,
        fix_age_seconds:age, fix_reported_at_utc:new Date(pos.timestamp).toISOString(),
        note:$('waypoint-note').value.trim()
      });
      $('waypoint-note').value='';
      await refresh();
      $('waypoint-status').textContent = `Waypoint #${response.waypoint.id} saved locally for investigation #${session.id}. Browser-reported, not verified GNSS or an RF detection.`;
    } catch(err) { $('waypoint-status').textContent = `Waypoint not saved: ${err.message}`; }
    finally { button.disabled = false; }
  }, err=>{
    $('waypoint-status').textContent = `Waypoint not saved: ${err.code===1?'location permission denied':err.code===3?'location timed out':'browser position unavailable'}.`;
    button.disabled=false;
  }, {enableHighAccuracy:true,maximumAge:0,timeout:15000});
}
function installMarkerLayer() {
  if (!state.map || state.map.getSource('survey-data')) return;
  state.map.addSource('survey-data', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-points',type:'circle',source:'survey-data',paint:{
    'circle-color':['get','marker_color'],
    'circle-radius':8,'circle-stroke-color':['case',['==',['get','selected'],true],'#fff6d6','#09252c'],'circle-stroke-width':['case',['==',['get','selected'],true],4,2],'circle-opacity':0.9
  }});
  // Separate, read-only samples of a strictly matching saved signal.
  // Never connect them with a fake travel path or triangulate an emitter.
  state.map.addSource('survey-series-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-series-points',type:'circle',source:'survey-series-data',paint:{
    'circle-color':['get','sample_color'],'circle-radius':11,
    'circle-stroke-color':'#f4f5e9','circle-stroke-width':3,'circle-opacity':0.96
  }});
  state.map.addSource('survey-sdr-site-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-sdr-sites',type:'circle',source:'survey-sdr-site-data',paint:{
    'circle-color':'#e798ed','circle-radius':8,'circle-stroke-color':'#152535',
    'circle-stroke-width':3,'circle-opacity':0.95
  }});
  state.map.addSource('survey-waypoint-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  state.map.addLayer({id:'survey-waypoints',type:'circle',source:'survey-waypoint-data',paint:{
    'circle-color':'#f6d37a','circle-radius':6,'circle-stroke-color':'#09252c',
    'circle-stroke-width':2,'circle-opacity':0.95
  }});
}
function filteredSdrSites() {
  const selected=$('sdr-sites-session-filter').value;
  return state.sdrSites.filter(site => site.state==='COMPLETE' && site.observer_fix &&
    Number.isFinite(site.observer_fix.latitude) && Number.isFinite(site.observer_fix.longitude) &&
    (!selected || site.session_id===Number(selected)));
}
function visibleSdrSites() {
  return $('sdr-sites-show-map').checked ? filteredSdrSites() : [];
}
function renderSdrSiteMapStatus() {
  const selector=$('sdr-sites-session-filter'), old=selector.value;
  selector.replaceChildren();
  const all=document.createElement('option');all.value='';all.textContent='All saved SDR sweeps';selector.append(all);
  for (const session of state.sessions) {
    const option=document.createElement('option');option.value=String(session.id);
    option.textContent=`${session.name} (#${session.id})`;selector.append(option);
  }
  selector.value=[...selector.options].some(o=>o.value===old)?old:'';
  updateSdrSiteMapCount();
}
function updateSdrSiteMapCount() {
  const count=filteredSdrSites().length;
  $('sdr-sites-map-status').textContent = `${count} recorded, explicitly located SDR sweep(s) for this selection. ` +
    `Pink markers are operator browser positions at sweep start, not verified receiver/antenna or transmitter coordinates. No route or heatmap is inferred.`;
  $('sdr-sites-map-export').disabled = !count;
}
async function refreshSdrSitesOnly() {
  try {
    const response=await api('/api/sdr/survey/sites');
    state.sdrSites=response.sites || [];
    renderSdrSiteMapStatus(); updateMap();
  } catch(err) { $('sdr-sites-map-status').textContent=`Could not load saved SDR sites: ${err.message}`; }
}
function updateMap() {
  if (state.rasterMap) return state.rasterMap.render();
  if (!state.mapReady || !state.map?.getSource('survey-data')) return;
  const observations = mapVisibleObservations();
  const features = observations.map(o => ({type:'Feature',geometry:{type:'Point',coordinates:[o.longitude,o.latitude]},properties:{id:o.id,label:o.label,kind:o.kind,source:o.source,marker_color:markerAppearance(o).color,selected:o.id===state.mapObservationId}}));
  state.map.getSource('survey-data').setData({type:'FeatureCollection',features});
  const siteLayer=state.map.getSource('survey-series-data');
  if(siteLayer){
    const active=activeMapSpatialSurvey();
    siteLayer.setData({type:'FeatureCollection',features:active?active.spatial.samples.map(row=>({
      type:'Feature',geometry:{type:'Point',coordinates:[row.lon,row.lat]},properties:{id:row.id,
        sample_color:surveySampleColor(active.series,row),value:row.value}
    })):[]});
  }
  const sdrSource = state.map.getSource('survey-sdr-site-data');
  if (sdrSource) sdrSource.setData({type:'FeatureCollection',features:visibleSdrSites().map(site=>({
    type:'Feature',geometry:{type:'Point',coordinates:[site.observer_fix.longitude,site.observer_fix.latitude]},
    properties:{capture_id:site.id,accuracy_m:site.observer_fix.accuracy_m,
      start_mhz:site.settings.start_mhz,stop_mhz:site.settings.stop_mhz}
  }))});
  const wp = state.map.getSource('survey-waypoint-data');
  if (wp) wp.setData({type:'FeatureCollection',features:visibleWaypoints().map(w=>({
    type:'Feature',geometry:{type:'Point',coordinates:[w.longitude,w.latitude]},
    properties:{id:w.id,note:w.note,accuracy_m:w.accuracy_m,source:'BROWSER_REPORTED'}
  }))});
  window.OpenRFCameras?.updateVector(state.map);
  window.OpenRFMeshDashboard?.vector(state.map);
  window.OpenRFPublicMesh?.vector(state.map);
}
function switchToRasterMap(reason) {
  closeMapFeatureInfo();
  ++state.mapAttempt;
  // Preserve the current overview so a pending GPS fix animates in fallback too.
  let camera=state.preferredView;
  if(state.map){try{const center=state.map.getCenter();camera={center:[center.lng,center.lat],zoom:state.map.getZoom()};}catch(_){/* Partially initialized renderer has no camera. */}}
  if (state.geoMarker) { try {state.geoMarker.remove();} catch(_) {} state.geoMarker = null; }
  if (state.map) { try { state.map.remove(); } catch(_) { /* partially initialized */ } }
  state.map = null;
  state.mapReady = false;
  startRasterMap(reason, camera);
}
function worldPixel(lon, lat, zoom) {
  const size = 256 * (2 ** zoom);
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(safeLat * Math.PI / 180);
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}
function pixelWorld(x, y, zoom) {
  const size = 256 * (2 ** zoom);
  const lon = ((((x / size) * 360) % 360) + 360) % 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size)));
  return [lon, lat];
}
// Raster-only fallback supports local MBTiles without a network request and
// the same *user-selected* USGS sources already offered by the vector viewer.
// No online tiles are requested if the operator selected Default/Offline.
function rasterTileSource(baseMap, offlineMap, zoom){
  if(baseMap==='satellite'||baseMap==='topographic'){
    const service=baseMap==='satellite'?'USGSImageryOnly':'USGSTopo';
    const tileZoom=Math.min(zoom,baseMap==='satellite'?18:16);
    return {key:baseMap,kind:'usgs',tileZoom,url:(x,y)=>
      `https://basemap.nationalmap.gov/arcgis/rest/services/${service}/MapServer/tile/${tileZoom}/${y}/${x}`};
  }
  if(offlineMap&&zoom>=offlineMap.minzoom&&zoom-Math.min(zoom,offlineMap.maxzoom)<=4){
    const tileZoom=Math.min(zoom,offlineMap.maxzoom);
    return {key:`local-${offlineMap.id}`,kind:'offline',tileZoom,url:(x,y)=>
      `/api/maps/${encodeURIComponent(offlineMap.id)}/tiles/${tileZoom}/${x}/${y}.png`};
  }
  return null;
}
// Horizontal wrap is real: near a world edge, the same URL may need two
// independent <img> elements at different viewport positions. Distinguish
// the *unwrapped* world column in the DOM key, but use wrapped x in the URL.
function rasterVisibleTiles(center,zoom,width,height,source){
  if(!source||width<=0||height<=0)return [];
  const centerPx=worldPixel(center[0],center[1],zoom);
  const factor=2**(zoom-source.tileZoom),tileSize=256*factor;
  const left=centerPx[0]-width/2,top=centerPx[1]-height/2;
  const count=2**source.tileZoom,output=[];
  const firstX=Math.floor(left/tileSize),lastX=Math.floor((left+width)/tileSize);
  const firstY=Math.max(0,Math.floor(top/tileSize));
  const lastY=Math.min(count-1,Math.floor((top+height)/tileSize));
  for(let ty=firstY;ty<=lastY;ty++)for(let tx=firstX;tx<=lastX;tx++){
    const wrapped=((tx%count)+count)%count;
    output.push({key:`${source.key}/${source.tileZoom}/${tx}/${ty}`,url:source.url(wrapped,ty),
      size:tileSize,left:tx*tileSize-left,top:ty*tileSize-top});
  }
  return output;
}
// Web Mercator wraps east/west, never north/south. At zoom 2 the map is just
// 1024px tall, so clamp the camera to avoid dragging empty space over a pole.
function clampRasterCenter(center,zoom,viewportHeight){
  const maxY=256*2**zoom;
  const margin=Math.min(maxY/2,viewportHeight/2);
  const point=worldPixel(center[0],center[1],zoom);
  return pixelWorld(point[0],Math.max(margin,Math.min(maxY-margin,point[1])),zoom);
}
function startRasterMap(reason, view = null) {
  if (state.rasterMap) return;
  updateBaseMapPicker();
  $('map-error').hidden = true;
  const root = $('map');
  root.classList.add('raster-mode');
  root.classList.toggle('raster-dark', state.style === 'dark');
  const surface = document.createElement('div'); surface.className = 'raster-surface';
  const tiles = document.createElement('div'); tiles.className = 'raster-tiles';
  const pins = document.createElement('div'); pins.className = 'raster-pins';
  const notice = document.createElement('div'); notice.className = 'raster-notice';
  const noticeMessage=document.createElement('div');
  const choices=document.createElement('div');choices.className='raster-source-choices';
  const sourceButtons=[['default','Offline/grid'],['topographic','Topo · online'],['satellite','Satellite · online']].map(([source,label])=>{
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.title='Select this map. Press again to retry missing tiles.';
    button.addEventListener('click',event=>{
      event.stopPropagation();
      if(source!==state.baseMap){selectBaseMap(source);return;}
      if(!state.rasterMap)return;
      for(const image of state.rasterMap.tileNodes.values())image.remove();
      state.rasterMap.tileNodes.clear();state.rasterMap.failedTiles.clear();
      state.rasterMap.loadedSourceKey=null;
      state.rasterMap.render();
    });
    choices.append(button);return [source,button];
  });
  notice.append(noticeMessage,choices);
  const startupExplanation = /Vector renderer could not start|WebGL/i.test(reason) ?
    'WebGL is unavailable in this window, so local vector maps cannot render.' : reason;
  const fallbackDetail=()=>state.baseMap==='topographic'||state.baseMap==='satellite'?
    `Showing online USGS ${state.baseMap==='topographic'?'topographic map':'imagery'} as ordinary images (no WebGL). Internet is required; visible map tiles are requested from USGS.` :
    state.offlineMap ? `Local raster package: ${state.offlineMap.name}. Tiles outside its coverage remain blank.` :
    regionalVectorReady() ? 'Your installed regional vector tiles need WebGL. Choose an online raster map below, or install a local raster MBTiles pack for offline maps.' :
    'Coordinate grid only. Choose an online raster map below or install a local raster MBTiles pack.';
  const controls = document.createElement('div'); controls.className = 'raster-control';
  const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.title = 'Zoom in';
  const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.title = 'Zoom out';
  const recenter = makeMapRecenterButton();
  recenter.classList.add('raster-recenter');
  controls.append(plus, minus, recenter); surface.append(tiles, pins);
  root.replaceChildren(surface, notice, controls);
  queueMapToolRailAlignment();
  let flightFrame = null;
  const raster = {center:view?.center || [-98.5,39.8], zoom:Math.max(2,Math.min(18,Math.round(view?.zoom || 2))), tileNodes:new Map(), failedTiles:new Set(),loadedSourceKey:null,
    render() {
      root.classList.toggle('raster-dark',state.style==='dark'&&state.baseMap==='default');
      const failures=[...raster.failedTiles.keys()].filter(key=>key.startsWith(`${state.baseMap==='default'?'local-'+state.offlineMap?.id:state.baseMap}/`)).length;
      noticeMessage.textContent=`${startupExplanation} ${fallbackDetail()}${failures?' Some tiles did not load; check network or coverage and tap the selected layer again to retry.':''}`;
      for(const [source,button] of sourceButtons){
        button.classList.toggle('active',source===state.baseMap);
        button.setAttribute('aria-pressed',String(source===state.baseMap));
      }
      const width = root.clientWidth, height = root.clientHeight;
      if (!width || !height) return;
      raster.center=clampRasterCenter(raster.center,raster.zoom,height);
      const center = worldPixel(raster.center[0], raster.center[1], raster.zoom);
      const size = 256 * 2 ** raster.zoom;
      // Default is strictly local. Remote imagery is used only after the
      // operator selected (and remembered) Satellite or Topographic.
      const source = rasterTileSource(state.baseMap,state.offlineMap,raster.zoom);
      notice.hidden=!!source&&raster.loadedSourceKey===source.key;
      const visible = new Set();
      if (source) {
        for (const tile of rasterVisibleTiles(raster.center,raster.zoom,width,height,source)) {
            const key=tile.key;
            if (raster.failedTiles.has(key)) continue;
            visible.add(key);
            let image = raster.tileNodes.get(key);
            if (!image) {
              image = document.createElement('img');
              image.alt = ''; image.setAttribute('aria-hidden', 'true');
              image.loading = 'lazy';
              image.addEventListener('load',()=>{
                if(state.rasterMap===raster&&raster.tileNodes.get(key)===image){
                  raster.loadedSourceKey=source.key;
                  notice.hidden=true;
                }
              });
              image.addEventListener('error', () => {
                raster.failedTiles.add(key); raster.tileNodes.delete(key); image.remove();
                // A failed server/coverage request must never be called a
                // successful online or offline map load.
                if(state.rasterMap===raster)raster.render();
              });
              image.src = tile.url;
              raster.tileNodes.set(key, image); tiles.append(image);
            }
            image.style.width = `${tile.size}px`; image.style.height = `${tile.size}px`;
            image.style.left = `${tile.left}px`; image.style.top = `${tile.top}px`;
        }
      }
      for (const [key,image] of raster.tileNodes) {
        if (!visible.has(key)) { image.remove(); raster.tileNodes.delete(key); }
      }
      const nextPins = document.createDocumentFragment();
      const activeSpatial=activeMapSpatialSurvey();
      const highlightedIds=new Set(activeSpatial?.spatial.samples.map(row=>row.id) || []);
      mapVisibleObservations().forEach(o=>{
        const position = worldPixel(o.longitude, o.latitude, raster.zoom);
        const dx = ((position[0] - center[0] + size * 1.5) % size) - size/2;
        const dy = position[1] - center[1];
        if (Math.abs(dx) > width/2 + 15 || Math.abs(dy) > height/2 + 15) return;
        const pin = document.createElement('button'); pin.type = 'button';
        const inSeries=highlightedIds.has(o.id);
        pin.className = `raster-pin kind-${o.kind.toLowerCase()}${o.source === 'DEMO' ? ' demo' : ''}${o.id===state.mapObservationId ? ' selected' : ''}${inSeries?' survey-sample-highlight':''}`;
        pin.style.backgroundColor = markerAppearance(o).color;
        pin.style.left = `${width/2+dx}px`; pin.style.top = `${height/2+dy}px`;
        pin.title = `${o.label} (${o.kind}, ${o.source}) — observer position`;
        pin.addEventListener('click',e=>{e.stopPropagation(); selectMapObservation(o.id);});
        nextPins.append(pin);
      });
      visibleSdrSites().forEach(site=>{
        const fix=site.observer_fix;
        const position=worldPixel(fix.longitude,fix.latitude,raster.zoom);
        const dx=((position[0]-center[0]+size*1.5)%size)-size/2,dy=position[1]-center[1];
        if(Math.abs(dx)>width/2+15||Math.abs(dy)>height/2+15)return;
        const marker=document.createElement('div');marker.className='raster-sdr-site-pin';
        marker.style.left=`${width/2+dx}px`;marker.style.top=`${height/2+dy}px`;
        marker.title=`Recorded SDR sweep ${site.id}; browser operator position ±${fix.accuracy_m} m, not transmitter`;
        nextPins.append(marker);
      });
      visibleWaypoints().forEach(w=>{
        const position = worldPixel(w.longitude,w.latitude,raster.zoom);
        const dx = ((position[0]-center[0]+size*1.5)%size)-size/2;
        const dy = position[1]-center[1];
        if (Math.abs(dx)>width/2+15 || Math.abs(dy)>height/2+15) return;
        const pin = document.createElement('div'); pin.className='raster-waypoint-pin';
        pin.style.left=`${width/2+dx}px`; pin.style.top=`${height/2+dy}px`;
        pin.title=`Browser-reported survey waypoint #${w.id}; observer position, not RF detection`;
        nextPins.append(pin);
      });
      if (state.browserLocation && !state.navDemoActive) {
        const p = worldPixel(state.browserLocation.lon,state.browserLocation.lat,raster.zoom);
        const dx = ((p[0]-center[0]+size*1.5)%size)-size/2;
        const dy = p[1]-center[1];
        if (Math.abs(dx)<=width/2+15 && Math.abs(dy)<=height/2+15) {
          const marker=document.createElement('div'); marker.className='browser-location-marker raster-location';
          marker.style.left=`${width/2+dx}px`; marker.style.top=`${height/2+dy}px`;
          marker.title=state.browserLocation.source==='gpsd'?
            'Local GNSS location (not a transmitter or survey observation)':
            'Browser-reported location (not a transmitter or survey observation)';
          nextPins.append(marker);
        }
      }
      // Explicit DEMO marker is not a browser GPS dot or recorded observation.
      if(state.navDemoActive&&state.navDemoFix){
        const point=worldPixel(state.navDemoFix.lon,state.navDemoFix.lat,raster.zoom);
        const dx=((point[0]-center[0]+size*1.5)%size)-size/2,dy=point[1]-center[1];
        if(Math.abs(dx)<=width/2+25&&Math.abs(dy)<=height/2+25){
          const pin=document.createElement('div');pin.className='openrf-demo-position raster-demo-position';
          pin.style.left=`${width/2+dx}px`;pin.style.top=`${height/2+dy}px`;
          pin.title='DEMO route simulation — not a GPS fix';pin.textContent='DEMO';nextPins.append(pin);
        }
      }
      window.OpenRFCameras?.renderRaster(nextPins,raster,width,height);
      window.OpenRFMeshDashboard?.raster(nextPins,raster,width,height,worldPixel);
      window.OpenRFPublicMesh?.raster(nextPins,raster,width,height,worldPixel);
      pins.replaceChildren(nextPins);
      renderAreaOverlay();
      renderNavigationOverlay();
    },
    stop() {
      if (flightFrame !== null) cancelAnimationFrame(flightFrame);
      flightFrame = null;
    },
    flyTo({center, zoom}) {
      raster.stop();
      const endZoom = Number.isFinite(zoom) ? Math.max(2,Math.min(18,Math.round(zoom))) : raster.zoom;
      const start = [...raster.center], startZoom = raster.zoom;
      if (reduceMapMotion()) { raster.center = [...center]; raster.zoom = endZoom; raster.render(); return; }
      const startTime = performance.now(), duration = 2600;
      // Choose the shorter longitudinal path across the antimeridian. Fractional
      // raster zoom would produce invalid tile coordinates, so use integer steps.
      const deltaLon = ((center[0] - start[0] + 540) % 360) - 180;
      const tick = now => {
        if (state.rasterMap !== raster) { raster.stop(); return; }
        const t = Math.max(0, Math.min(1, (now - startTime) / duration));
        const ease = t * t * (3 - 2 * t);
        raster.center = [((start[0] + deltaLon * ease + 540) % 360) - 180,
          start[1] + (center[1] - start[1]) * ease];
        raster.zoom = Math.max(2,Math.min(18,Math.round(startZoom + (endZoom - startZoom) * ease)));
        raster.render();
        if (t < 1) flightFrame = requestAnimationFrame(tick);
        else { raster.center = [...center]; raster.zoom = endZoom; raster.render(); flightFrame = null; }
      };
      flightFrame = requestAnimationFrame(tick);
    },
    resize() { raster.render(); }
  };
  state.rasterMap = raster;
  window.OpenRFCameras?.onViewportChanged();
  syncDestinationPickMode();
  updateOfflineAttribution();
  applyPendingLocation();
  $('map-mode').textContent = 'Try online vector';
  plus.addEventListener('click',e=>{e.stopPropagation();raster.stop();state.mapNavigationEpoch++;raster.zoom=Math.min(18,raster.zoom+1);raster.render();});
  minus.addEventListener('click',e=>{e.stopPropagation();raster.stop();state.mapNavigationEpoch++;raster.zoom=Math.max(2,raster.zoom-1);raster.render();});
  if (!root.dataset.rasterBound) {
    root.dataset.rasterBound = 'true';
    let start = null;
    root.addEventListener('pointerdown',e=>{
      if (!state.rasterMap || state.navPicking || e.button !== 0 || e.target.closest('button, a')) return;
      state.rasterMap.stop();
      start = {x:e.clientX,y:e.clientY,center:[...state.rasterMap.center], moved:false};
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove',e=>{
      if (!start || !state.rasterMap) return;
      const dx=e.clientX-start.x, dy=e.clientY-start.y;
      if (Math.abs(dx)+Math.abs(dy)>6) start.moved=true;
      if (start.moved) {
        state.mapNavigationEpoch++;
        const from=worldPixel(start.center[0],start.center[1],state.rasterMap.zoom);
        state.rasterMap.center=pixelWorld(from[0]-dx,from[1]-dy,state.rasterMap.zoom);
        state.rasterMap.render();
      }
    });
    root.addEventListener('pointerup',e=>{
      if (!start || !state.rasterMap) return;
      const previous=start; start=null;
      if (state.navPicking) return;
      if (previous.moved) return;
      const rect=root.getBoundingClientRect();
      const cp=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
      const ll=pixelWorld(cp[0]+e.clientX-rect.left-rect.width/2, cp[1]+e.clientY-rect.top-rect.height/2,state.rasterMap.zoom);
      if (consumeNavigationPick(ll[0], ll[1])) return;
      if (consumeAreaClick(ll[0], ll[1])) return;
      // An ordinary raster-map tap is also intentionally a no-op.
    });
    root.addEventListener('pointercancel',()=>{start=null;});
    root.addEventListener('wheel',e=>{
      if (!state.rasterMap) return;
      e.preventDefault(); state.rasterMap.stop(); state.mapNavigationEpoch++; state.rasterMap.zoom=Math.max(2,Math.min(18,state.rasterMap.zoom+(e.deltaY<0?1:-1)));
      state.rasterMap.render();
    },{passive:false});
  }
  raster.render();
  applyNavigationFit();
}
function zoomToRecord(id) {
  const item = state.observations.find(o=>o.id===id); if (!item || item.latitude === null) return;
  showPage('map', {autoLocate:false}); setTimeout(()=> (state.map || state.rasterMap)?.flyTo({center:[item.longitude,item.latitude],zoom:15}),100);
}

async function runAction(fn, fallback='Could not complete operation') {
  try { await fn(); } catch(err) { flash(err.message || fallback, true); }
}

function updateOfflineAttribution() {
  const local = $('offline-map-attribution');
  const online = $('online-map-credits');
  const external=state.baseMap==='satellite'||state.baseMap==='topographic';
  const offlineActive = !external && (!!state.rasterMap || !!state.mapVectorOffline);
  const text = external ?
      state.baseMap==='satellite' ?
        'USGS Imagery Only: © USGS The National Map · USDA NAIP and other imagery partners. Online U.S. imagery; not an offline package.' :
        'USGS Topographic: © USGS The National Map · 3DEP · OpenStreetMap contributors. Online terrain, contours and relief; not an offline package.' :
    state.mapVectorOffline && !state.rasterMap ?
      'Regional OpenRF vector map: © OpenStreetMap contributors · Geofabrik · OpenMapTiles-style schema. Local Amador / Calaveras coverage only.' : state.offlineMap
    ? `Local package: ${state.offlineMap.name}. ${state.offlineMap.attribution || 'Attribution not specified in package; verify source license.'}`
    : 'Offline coordinate grid: no basemap data.';
  local.hidden = !(offlineActive || external);
  local.textContent = text;
  online.hidden = offlineActive || external;
}
// Offline map files are operator-supplied and live outside the Git repository.
// Selecting one never causes internet downloads or saves a GPS position.
async function refreshOfflineMaps() {
  const response = await api('/api/maps');
  state.offlineMaps = response.maps || [];
  if (state.offlineMap) state.offlineMap = state.offlineMaps.find(m => m.id === state.offlineMap.id) || null;
  const select = $('offline-map-select');
  const currentId = state.offlineMap?.id || '';
  select.replaceChildren(new Option('Coordinate grid · no map package', ''));
  for (const pack of state.offlineMaps) {
    select.add(new Option(`${pack.name} (z${pack.minzoom}–${pack.maxzoom})`, pack.id));
  }
  select.value = currentId;
  updateOfflineAttribution();
  $('offline-map-status').textContent = state.offlineMap
    ? `LOCAL · ${state.offlineMap.name} · ${(state.offlineMap.size_bytes / 1048576).toFixed(1)} MB · no network required`
    : `${state.offlineMaps.length} local raster package(s). Grid and survey pins work offline; online streets need internet.`;
  renderOfflineAreaDetail();
  refreshAreaBuildSources();
  if (state.rasterMap) state.rasterMap.render();
}
$('offline-map-refresh').addEventListener('click', () => runAction(refreshOfflineMaps));
$('offline-map-select').addEventListener('change', event => {
  state.offlineMap = state.offlineMaps.find(m => m.id === event.target.value) || null;
  updateOfflineAttribution();
  $('offline-map-status').textContent = state.offlineMap
    ? `LOCAL · ${state.offlineMap.name} · Offline raster tiles; outside coverage shows coordinate grid.`
    : 'Local coordinate grid selected. No external raster tile requests.';
  renderOfflineAreaDetail();
  if (state.rasterMap) {
    for (const image of state.rasterMap.tileNodes.values()) image.remove();
    state.rasterMap.tileNodes.clear(); state.rasterMap.failedTiles.clear();
    const camera = {center:[...state.rasterMap.center], zoom:state.rasterMap.zoom};
    state.rasterMap.stop();
    state.rasterMap = null;
    $('map').replaceChildren();
    startRasterMap('Offline map selection changed.', camera);
  } else if (state.map) switchToRasterMap('Offline map selected.');
  else startRasterMap('Offline map selected.');
});



// v0.2.11: user-planned bounding boxes. These are geographic selection aids,
// never RF measurement positions, and no external tile API is contacted.
function draftNumbers() {
  const coords = ['west','south','east','north'].map(k => Number($(`area-plan-${k}`).value));
  if (coords.some((v,i) => !$(`area-plan-${['west','south','east','north'][i]}`).value.trim() || !Number.isFinite(v))) return null;
  const [w,s,e,n] = coords;
  if (!(w >= -180 && w < e && e <= 180 && s >= -85.05112878 && s < n && n <= 85.05112878)) return null;
  return coords;
}
function areaFormBounds(bounds) {
  state.areaDraftBounds = bounds;
  ['west','south','east','north'].forEach((key,i) => { $(`area-plan-${key}`).value = bounds[i].toFixed(6); });
  updateAreaEstimate();
  renderAreaOverlay();
}
function updateAreaEstimate() {
  const bounds = draftNumbers();
  state.areaDraftBounds = bounds;
  const lo = Number($('area-plan-minzoom').value), hi = Number($('area-plan-maxzoom').value);
  if (!bounds || !Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 18 || lo > hi) {
    $('area-plan-estimate').textContent = 'Enter valid non-dateline-crossing bounds and zooms (0–18, min ≤ max).';
    renderAreaOverlay(); return;
  }
  let count = 0;
  const [w,s,e,n] = bounds;
  const tileY=(lat,z)=> (1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*(2**z);
  for (let z=lo;z<=hi;z++) {
    const edge=2**z;
    const x0=Math.max(0,Math.min(edge-1,Math.floor((w+180)/360*edge)));
    const x1=Math.max(0,Math.min(edge-1,Math.ceil((e+180)/360*edge-1e-12)-1));
    const y0=Math.max(0,Math.min(edge-1,Math.floor(tileY(n,z))));
    const y1=Math.max(0,Math.min(edge-1,Math.ceil(tileY(s,z)-1e-12)-1));
    count+=(x1-x0+1)*(y1-y0+1);
    if(count>10000) break;
  }
  $('area-plan-estimate').textContent = count > 10000
    ? 'More than 10,000 tile slots. Narrow the bounds or decrease maximum zoom.'
    : `Up to ${count.toLocaleString()} candidate tiles at zoom ${lo}–${hi}. This is NOT a download or a size/coverage guarantee.`;
  renderAreaOverlay();
}
function areaModeStatus(message) {
  $('area-plan-selection-status').textContent = message;
  $('area-plan-cancel').disabled = !state.areaChoosing;
  $('map').classList.toggle('area-selecting', state.areaChoosing);
  renderAreaOverlay();
}
function cancelAreaChoosing() {
  state.areaChoosing = false;
  state.areaFirstCorner = null;
  areaModeStatus('Area selection stopped; coordinate fields remain editable.');
}
function consumeAreaClick(lon, lat) {
  if (!state.areaChoosing) return false;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return true;
  lon=((lon+180)%360+360)%360-180;
  lat=Math.min(85.05112878,Math.max(-85.05112878,lat));
  if (!state.areaFirstCorner) {
    state.areaFirstCorner=[lon,lat];
    areaModeStatus('First corner chosen. Click the opposite corner; pan and zoom if needed.');
    return true;
  }
  const first=state.areaFirstCorner;
  const w=Math.min(first[0],lon), e=Math.max(first[0],lon);
  const s=Math.min(first[1],lat), n=Math.max(first[1],lat);
  state.areaChoosing=false; state.areaFirstCorner=null;
  if (e-w <= 1e-8 || n-s <= 1e-8 || e-w>180) {
    areaModeStatus('Area is too narrow or crosses the dateline. Try a smaller rectangle.');
    return true;
  }
  areaFormBounds([w,s,e,n]);
  areaModeStatus('Two corners selected. Set your zoom range, enter a name, then save the plan.');
  $('map-area-manager').open=true;
  if (typeof openMapToolOverlay === 'function') openMapToolOverlay('offline');
  return true;
}
function areaViewportBounds() {
  if(state.map) {
    const b=state.map.getBounds();
    return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
  }
  if(state.rasterMap) {
    const root=$('map'), m=state.rasterMap, center=worldPixel(m.center[0],m.center[1],m.zoom);
    const west=pixelWorld(center[0]-root.clientWidth/2,center[1],m.zoom)[0];
    const east=pixelWorld(center[0]+root.clientWidth/2,center[1],m.zoom)[0];
    const north=pixelWorld(center[0],center[1]-root.clientHeight/2,m.zoom)[1];
    const south=pixelWorld(center[0],center[1]+root.clientHeight/2,m.zoom)[1];
    return [west,south,east,north];
  }
  return null;
}
function renderAreaOverlay() {
  const root=$('map');
  if (!root || (!state.map && !state.rasterMap)) return;
  let overlay=root.querySelector('.area-draw-overlay');
  if(!overlay) {
    overlay=document.createElement('div'); overlay.className='area-draw-overlay';
    overlay.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden';
    root.append(overlay);
  }
  overlay.replaceChildren();
  function project(lon,lat) {
    if(state.map) return state.map.project([lon,lat]);
    const r=state.rasterMap, center=worldPixel(r.center[0],r.center[1],r.zoom);
    const point=worldPixel(lon,lat,r.zoom), size=256*2**r.zoom;
    const dx=((point[0]-center[0]+size*1.5)%size)-size/2;
    return {x:root.clientWidth/2+dx, y:root.clientHeight/2+point[1]-center[1]};
  }
  if (state.areaDraftBounds) {
    const [w,s,e,n]=state.areaDraftBounds;
    const a=project(w,n),b=project(e,s);
    if ([a.x,a.y,b.x,b.y].every(Number.isFinite)) {
      const rect=document.createElement('div');rect.className='area-preview-outline';
      rect.style.left=`${Math.min(a.x,b.x)}px`;rect.style.top=`${Math.min(a.y,b.y)}px`;
      rect.style.width=`${Math.abs(b.x-a.x)}px`;rect.style.height=`${Math.abs(b.y-a.y)}px`;
      overlay.append(rect);
    }
  }
  if (state.areaFirstCorner) {
    const pt=project(...state.areaFirstCorner), dot=document.createElement('div');
    dot.className='area-preview-corner';dot.style.left=`${pt.x}px`;dot.style.top=`${pt.y}px`;overlay.append(dot);
  }
  if (state.areaChoosing) {
    const note=document.createElement('div');note.className='area-map-instruction';
    note.textContent=state.areaFirstCorner?'AREA SELECTION · Choose opposite corner':'AREA SELECTION · Choose first corner';
    note.style.cssText='position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#07362ff2;color:#d5fff4;border:1px solid #54d1b7;border-radius:6px;padding:7px 10px;font-weight:700;font-size:12px;max-width:65%;text-align:center;';
    overlay.append(note);
  }
}
function focusAreaBounds(bounds) {
  const [w,s,e,n] = bounds;
  state.mapNavigationEpoch++;
  if(state.map && state.mapReady) state.map.fitBounds([[w,s],[e,n]],{padding:50,maxZoom:16,duration:450});
  else {
    if (!state.rasterMap) switchToRasterMap('Viewing saved local area plan.');
    const root=$('map'),width=Math.max(240,root.clientWidth),height=Math.max(200,root.clientHeight);
    let zoom=2;
    for(let z=2;z<=18;z++) {
      const nw=worldPixel(w,n,z),se=worldPixel(e,s,z);
      if(se[0]-nw[0]>width*.78 || se[1]-nw[1]>height*.78) break;
      zoom=z;
    }
    state.rasterMap?.flyTo({center:[(w+e)/2,(s+n)/2],zoom});
  }
}
function refreshAreaBuildSources() {
  const el=$('area-build-source');const current=el.value;
  el.replaceChildren(new Option('Choose an installed source map', ''));
  state.offlineMaps.forEach(m=>el.add(new Option(`${m.name} (${m.id})`,m.id)));
  el.value=state.offlineMaps.some(m=>m.id===current) ? current : '';
}
function renderSavedArea() {
  const p=state.selectedArea;
  $('area-saved-view').disabled=!p;
  $('area-saved-remove').disabled=!p;
  $('area-build').disabled=!p;
  $('area-zip-import').disabled=!p;
  $('area-topo-start').disabled=!p || p.candidate_tiles>96 || p.candidate_tiles<1;
  const tilePlanLink=$('area-saved-tile-plan');
  const exportLink=$('area-saved-export');
  if(p) {
    tilePlanLink.href=`/api/maps/areas/${p.id}.plan.json`;
    tilePlanLink.setAttribute('aria-disabled','false');tilePlanLink.removeAttribute('tabindex');
    exportLink.href=`/api/maps/areas/${p.id}.geojson`;
    exportLink.setAttribute('aria-disabled','false');exportLink.removeAttribute('tabindex');
    $('area-saved-detail').textContent=`${p.name}: ${p.bounds.map(v=>v.toFixed(4)).join(', ')} · zoom ${p.minzoom}–${p.maxzoom} · up to ${p.candidate_tiles.toLocaleString()} tile slots (not guaranteed data).`;
    if(p.candidate_tiles>96)$('area-topo-status').textContent=`This plan has ${p.candidate_tiles.toLocaleString()} tile slots. Create a smaller plan with 96 or fewer to enable the USGS download.`;
  } else {
    tilePlanLink.removeAttribute('href');tilePlanLink.setAttribute('aria-disabled','true');tilePlanLink.tabIndex=-1;
    exportLink.removeAttribute('href');exportLink.setAttribute('aria-disabled','true');exportLink.tabIndex=-1;
    $('area-saved-detail').textContent='No saved plan selected; existing map packages are unaffected.';
  }
}
async function refreshAreaPlans(selectId=null) {
  const response=await api('/api/maps/areas');
  state.areaPlans=response.areas || [];
  const choose=selectId || state.selectedArea?.id || '';
  const el=$('area-saved-select');el.replaceChildren(new Option('Select a saved area', ''));
  state.areaPlans.forEach(a=>el.add(new Option(`${a.name} (z${a.minzoom}–${a.maxzoom})`,a.id)));
  state.selectedArea=state.areaPlans.find(a=>a.id===choose)||null;
  el.value=state.selectedArea?.id||'';
  renderSavedArea();
}
// USGS topography: downloads occur ONLY when the operator confirms a saved
// area and starts this background job; no prefetch on location/map movement.
let topoPollTimer=null;
async function pollTopoDownload(){
  const response=await api('/api/maps/topographic/status');
  const job=response.download||{state:'idle'};
  const busy=job.state==='running';
  $('area-topo-cancel').disabled=!busy;
  $('area-topo-start').disabled=busy||!state.selectedArea||state.selectedArea.candidate_tiles>96;
  if(busy){
    $('area-topo-status').textContent=`Downloading ${job.map_id}.mbtiles from USGS: ${job.downloaded}/${job.candidate_tiles} tiles saved, ${job.missing} missing. You may leave this panel open.`;
    if(!topoPollTimer)topoPollTimer=setInterval(()=>pollTopoDownload().catch(err=>{
      $('area-topo-status').textContent=`Waiting for download status: ${err.message}`;
    }),1300);
    return;
  }
  if(topoPollTimer){clearInterval(topoPollTimer);topoPollTimer=null;}
  if(job.state==='complete'){
    const result=job.result;
    $('area-topo-status').textContent=`Offline USGS topo ready: ${result.tiles_downloaded}/${result.candidate_tiles} tiles, ${result.tiles_missing} missing. Select the local package for offline raster viewing; tiles show contours, not numeric heights.`;
    if(state.offlineMaps.every(pack=>pack.id!==result.map.id)){
      await refreshOfflineMaps();
      $('offline-map-select').value=result.map.id;
      $('offline-map-select').dispatchEvent(new Event('change'));
    }
  }else if(job.state==='failed'||job.state==='cancelled'){
    $('area-topo-status').textContent=`${job.state==='failed'?'Topographic download failed':'Download cancelled'}: ${job.error||'No offline package installed'}`;
  }
}
$('area-topo-start').addEventListener('click',()=>runAction(async()=>{
  const p=state.selectedArea,mapId=$('area-topo-name').value.trim();
  if(!p||p.candidate_tiles>96)throw Error('Select a saved area with no more than 96 tiles.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(mapId)||mapId.endsWith('.'))throw Error('Choose a new safe local topo filename.');
  if(!$('area-topo-confirm').checked)throw Error('Check the box to explicitly approve the USGS network download.');
  if(!confirm(`Download up to ${p.candidate_tiles} USGS topographic tiles for ${p.name}? USGS receives requested map tile coordinates. Package stays on your device.`))return;
  await api('/api/maps/topographic/start','POST',{area_id:p.id,map_id:mapId,confirm_network:true});
  $('area-topo-start').disabled=true;
  $('area-topo-status').textContent='Starting bounded USGS topographic download…';
  await pollTopoDownload();
}));
$('area-topo-cancel').addEventListener('click',()=>runAction(async()=>{
  await api('/api/maps/topographic/cancel','POST',{});
  $('area-topo-status').textContent='Cancelling download after the current tile; no incomplete package will be published.';
}));
pollTopoDownload().catch(()=>{});
// Import local numeric terrain explicitly. These .hgt files are never sent to
// a remote provider; only the loopback OpenRF server receives the file.
async function refreshTerrainTiles(){
  const response=await api('/api/terrain/tiles');
  const tiles=Array.isArray(response.tiles)?response.tiles:[];
  const select=$('area-hgt-installed'),previous=select.value;
  select.replaceChildren(new Option('Select an installed terrain tile',''));
  for(const tile of tiles)
    select.add(new Option(`${tile.name} · ${tile.resolution_arcseconds} arc-second · ${tile.source}`,tile.name));
  select.value=tiles.some(tile=>tile.name===previous)?previous:'';
  $('area-hgt-remove').disabled=!select.value;
  $('area-hgt-status').textContent=tiles.length?
    `${tiles.length} locally installed HGT tile(s). Terrain height data is operator supplied and unverified.`:
    'No local HGT terrain tiles installed. Saved USGS profiles can still be used offline.';
}
$('area-hgt-refresh').addEventListener('click',()=>runAction(refreshTerrainTiles));
$('area-hgt-installed').addEventListener('change',()=>{
  $('area-hgt-remove').disabled=!$('area-hgt-installed').value;
});
$('area-hgt-import').addEventListener('click',()=>runAction(async()=>{
  const file=$('area-hgt-file').files?.[0],source=$('area-hgt-source').value.trim();
  if(!file)throw Error('Choose an uncompressed .hgt terrain file first.');
  if(!/^[NS]\d{2}[EW]\d{3}\.hgt$/i.test(file.name))throw Error('File must be named like N38W121.hgt.');
  if(![1201*1201*2,3601*3601*2].includes(file.size))throw Error('HGT must contain exactly 1201×1201 or 3601×3601 16-bit heights.');
  if(source.length<3||source.length>120)throw Error('Enter the terrain dataset source (3–120 characters).');
  if(!confirm(`Import ${file.name} (${(file.size/1048576).toFixed(1)} MiB) into OpenRF's local private terrain directory? Verify the dataset license and provenance first. No external upload.`))return;
  const button=$('area-hgt-import');button.disabled=true;
  $('area-hgt-status').textContent=`Importing ${file.name} locally…`;
  try{
    const response=await fetch('/api/terrain/import',{method:'POST',headers:{
      'Content-Type':'application/octet-stream','X-OpenRF-Terrain-Name':file.name,
      'X-OpenRF-Terrain-Source':encodeURIComponent(source)},body:file});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||`HGT import failed (${response.status})`);
    await refreshTerrainTiles();
    $('area-hgt-installed').value=result.tile.name;
    $('area-hgt-remove').disabled=false;
    $('area-hgt-status').textContent=`Imported ${result.tile.name} (${result.tile.resolution_arcseconds} arc-second HGT). New routes inside this tile can show offline terrain profiles. Source not independently verified.`;
    $('area-hgt-file').value='';
  }finally{button.disabled=false;}
}));
$('area-hgt-remove').addEventListener('click',()=>runAction(async()=>{
  const name=$('area-hgt-installed').value;
  if(!name)throw Error('Select an installed terrain tile first.');
  if(!confirm(`Permanently remove local HGT terrain tile ${name}? Previously saved USGS profiles and map image tiles remain.`))return;
  await api(`/api/terrain/tiles/${encodeURIComponent(name)}`,'DELETE');
  await refreshTerrainTiles();
}));
refreshTerrainTiles().catch(err=>{$('area-hgt-status').textContent=`Terrain inventory unavailable: ${err.message}`;});
$('area-plan-choose').addEventListener('click',()=>{
  if (!state.map && !state.rasterMap) startMap();
  if (state.navPicking) {state.navPicking=false;syncDestinationPickMode();}
  state.areaChoosing=true;state.areaFirstCorner=null;
  areaModeStatus('Click two opposite corners on the map. Map clicks will NOT create observations until selection ends.');
  // The overlay must close so both map corners can be tapped unobstructed.
  if (activeMapTool) closeMapToolOverlay();
});
$('area-plan-cancel').addEventListener('click',cancelAreaChoosing);
$('area-plan-viewport').addEventListener('click',()=>{
  try {
    cancelAreaChoosing();
    const bounds=areaViewportBounds();
    if (!bounds || bounds.some(v=>!Number.isFinite(v))) throw Error('Map has not loaded yet.');
    const [w,s,e,n]=bounds;
    if (!(w>=-180 && w<e && e<=180 && s>=-85.05112878 && s<n && n<=85.05112878)) throw Error('Viewport crosses the dateline or map limits. Zoom in and try again.');
    areaFormBounds(bounds);areaModeStatus('Used visible map extent; choose zooms and a name to save.');
  } catch(err) {flash(err.message,true);}
});
for(const k of ['west','south','east','north','minzoom','maxzoom']) $('area-plan-'+k).addEventListener('input',updateAreaEstimate);
$('area-plan-save').addEventListener('click',()=>runAction(async()=>{
  const bounds=draftNumbers();if (!bounds) throw Error('Enter valid west/south/east/north bounds first.');
  const name=$('area-plan-name').value.trim();
  const minzoom=Number($('area-plan-minzoom').value),maxzoom=Number($('area-plan-maxzoom').value);
  const response=await api('/api/maps/areas','POST',{name,bounds,minzoom,maxzoom});
  await refreshAreaPlans(response.area.id);
  $('area-plan-selection-status').textContent=`Saved ${response.area.name} locally. No tiles downloaded.`;
  flash('Saved geographic map plan locally; no map download or RF observation was made.');
}));
$('area-saved-select').addEventListener('change',event=>{
  state.selectedArea=state.areaPlans.find(a=>a.id===event.target.value)||null;
  if(state.selectedArea) {
    const p=state.selectedArea;areaFormBounds(p.bounds);
    $('area-plan-minzoom').value=p.minzoom;$('area-plan-maxzoom').value=p.maxzoom;$('area-plan-name').value=p.name;
    updateAreaEstimate();
    $('area-build-name').value=p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||`region-${p.id}`;
    $('area-zip-map-id').value=($('area-build-name').value+'-tiles').slice(0,100);
  }
  renderSavedArea();
});
$('area-saved-view').addEventListener('click',()=>{
  if(state.selectedArea) {areaFormBounds(state.selectedArea.bounds);focusAreaBounds(state.selectedArea.bounds);}
});
$('area-saved-remove').addEventListener('click',()=>runAction(async()=>{
  const p=state.selectedArea;
  if(!p||!confirm(`Delete the saved area plan "${p.name}"? Installed maps and saved observations will not be deleted.`))return;
  await api(`/api/maps/areas/${p.id}`,'DELETE');
  state.selectedArea=null;await refreshAreaPlans();
  $('area-build-status').textContent='Saved area plan deleted. Map packages were not changed.';
}));
$('area-build').addEventListener('click',()=>runAction(async()=>{
  const plan=state.selectedArea,source=$('area-build-source').value,dest=$('area-build-name').value.trim();
  if(!plan) throw Error('Select a saved area.');
  if(!source) throw Error('Choose a locally installed raster source map.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(dest)||dest.endsWith('.')) throw Error('Use a safe new package filename without .mbtiles.');
  if(!$('area-license-confirm').checked) throw Error('You must confirm that the source license permits local derivatives.');
  if(!confirm(`Create ${dest}.mbtiles from local source ${source} for ${plan.name}? Only existing local tiles are copied. This will not contact a public map service.`))return;
  const button=$('area-build');button.disabled=true;
  $('area-build-status').textContent='Creating bounded local MBTiles subset; leave OpenRF open. No network downloads.';
  try {
    const result=await api(`/api/maps/areas/${plan.id}/build`,'POST',{
      source_map_id:source,output_map_id:dest,rights_confirmed:true
    });
    await refreshOfflineMaps();
    $('offline-map-select').value=result.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('area-build-status').textContent=`Created ${dest}.mbtiles locally: ${result.tiles_copied} existing tile(s), ${(result.map.size_bytes/1048576).toFixed(1)} MiB. Missing source tiles remain missing. Source and observations preserved.`;
    flash(`Offline subset ${dest}.mbtiles created with ${result.tiles_copied} local tiles.`);
  } catch(err) { $('area-build-status').textContent=`Local subset failed: ${err.message}. No source map modified.`;throw err; }
  finally{ button.disabled=!state.selectedArea; }
}));
// Licensed local ZIP → MBTiles conversion. Browser-selected file only, and the
// request goes to OpenRF on loopback. A plan JSON contains no tile source URL.
$('area-zip-import').addEventListener('click',()=>runAction(async()=>{
  const plan=state.selectedArea;
  const file=$('area-zip-file').files?.[0];
  const mapId=$('area-zip-map-id').value.trim();
  const source=$('area-zip-source').value.trim();
  const credit=$('area-zip-attribution').value.trim();
  const scheme=$('area-zip-scheme').value;
  if(!plan) throw Error('Select a saved map area first.');
  if(!file || !file.name.toLowerCase().endsWith('.zip')) throw Error('Select a raster tile ZIP from your computer.');
  if(file.size < 100 || file.size > 512*1024*1024) throw Error('ZIP must be between 100 bytes and 512 MiB.');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(mapId)||mapId.endsWith('.')) throw Error('Choose a safe output name without .mbtiles.');
  if(!source || !credit) throw Error('Provide the original tile source and its required attribution.');
  if(!$('area-zip-rights').checked) throw Error('Confirm the provider explicitly allows offline map package creation.');
  if(!confirm(`Create ${mapId}.mbtiles locally from ${file.name} for area ${plan.name}? No tile servers will be contacted.`))return;
  const button=$('area-zip-import');button.disabled=true;
  $('area-zip-status').textContent='Reading the local ZIP, validating tiles and building a private raster MBTiles package. Keep this tab open.';
  try {
    const response=await fetch(`/api/maps/areas/${plan.id}/import-xyz`,{
      method:'POST',headers:{'Content-Type':'application/zip','X-OpenRF-Map-Id':mapId,
        'X-OpenRF-Source-Name':encodeURIComponent(source),
        'X-OpenRF-Attribution':encodeURIComponent(credit),
        'X-OpenRF-Tile-Scheme':scheme,'X-OpenRF-Rights-Confirmed':'true'},body:file
    });
    const data=await response.json();
    if(!response.ok) throw Error(data.error||`ZIP import failed (HTTP ${response.status})`);
    await refreshOfflineMaps();
    $('offline-map-select').value=data.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('area-zip-status').textContent=`Installed ${data.map.id}.mbtiles with ${data.tiles_imported.toLocaleString()} local tile(s). ${data.tiles_ignored.toLocaleString()} tiles outside the plan were skipped. Actual coverage may be incomplete. Source ZIP and observations preserved.`;
    flash(`Imported licensed raster ZIP to ${data.map.id}.mbtiles. Verify map attribution and actual coverage.`);
  } catch(error) {
    $('area-zip-status').textContent=`Import failed: ${error.message}. Original ZIP and saved observations remain untouched.`;
    throw error;
  } finally { button.disabled=!state.selectedArea; }
}));

window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.areaChoosing)cancelAreaChoosing();});

function renderOfflineAreaDetail() {
  const pack = state.offlineMap;
  const detail = $('offline-map-detail');
  $('offline-map-zoom').disabled = !pack?.bounds;
  $('offline-map-remove').disabled = !pack;
  if (!pack) {
    detail.textContent = 'No area selected. Import a licensed raster MBTiles package, or choose a map from Offline basemap. Observations remain saved even when a basemap is removed.';
    return;
  }
  const bounds = pack.bounds;
  const coverage = bounds
    ? `Coverage: west ${bounds[0].toFixed(4)}°, south ${bounds[1].toFixed(4)}°, east ${bounds[2].toFixed(4)}°, north ${bounds[3].toFixed(4)}° (declared package bounds; actual tile coverage may vary).`
    : 'Coverage: not declared in this package. Area zoom is unavailable.';
  detail.textContent = `${pack.name} · ${pack.id}.mbtiles\n${coverage}\nZoom: ${pack.minzoom}–${pack.maxzoom}; image: ${pack.format.toUpperCase()}; size: ${(pack.size_bytes/1048576).toFixed(1)} MiB.\nAttribution: ${pack.attribution || 'Not supplied — check the map data license.'}`;
}

function zoomToOfflineArea(pack) {
  if (!pack?.bounds) return;
  const [west, south, east, north] = pack.bounds;
  const center = [(west+east)/2, (south+north)/2];
  const root = $('map');
  const width = Math.max(240, root.clientWidth || 400), height = Math.max(200, root.clientHeight || 300);
  let zoom = 2;
  for (let z = 2; z <= 18; z++) {
    const tl = worldPixel(west, north, z), br = worldPixel(east, south, z);
    if (br[0]-tl[0] > width*0.8 || br[1]-tl[1] > height*0.8) break;
    zoom = z;
  }
  zoom = Math.max(2, Math.min(18, Math.max(pack.minzoom, zoom)));
  state.mapNavigationEpoch++;
  if (!state.rasterMap) switchToRasterMap('Viewing selected local map coverage.');
  state.rasterMap?.flyTo({center, zoom});
  $('offline-map-operation').textContent = `Centered on ${pack.name}; bounds are declared by the package, not independently verified.`;
}

$('offline-map-zoom').addEventListener('click', () => zoomToOfflineArea(state.offlineMap));
$('offline-map-remove').addEventListener('click', () => runAction(async () => {
  const pack = state.offlineMap;
  if (!pack || !confirm(`Remove the local map file ${pack.id}.mbtiles? Survey observations and investigations will be preserved.`)) return;
  const button = $('offline-map-remove'); button.disabled = true;
  try {
    await api(`/api/maps/${encodeURIComponent(pack.id)}`, 'DELETE');
    state.offlineMap = null;
    await refreshOfflineMaps();
    if (state.rasterMap) {
      for (const image of state.rasterMap.tileNodes.values()) image.remove();
      state.rasterMap.tileNodes.clear(); state.rasterMap.failedTiles.clear();
      state.rasterMap.render();
    }
    $('offline-map-operation').textContent = 'Map file removed. Survey records and investigations were not modified.';
  } finally { renderOfflineAreaDetail(); }
}));

$('offline-map-import').addEventListener('click', () => runAction(async () => {
  const file = $('offline-map-file').files?.[0];
  if (!file) throw Error('Choose a local .mbtiles file first.');
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\.mbtiles$/i.exec(file.name);
  if (!match || match[1].endsWith('.')) throw Error('Rename the file with ASCII letters, digits, dashes, dots or underscores, ending in .mbtiles.');
  if (file.size < 100 || file.size > 1073741824) throw Error('File must be between 100 bytes and 1 GiB.');
  const button = $('offline-map-import'); button.disabled = true;
  $('offline-map-operation').textContent = `Importing ${file.name} (${(file.size/1048576).toFixed(1)} MiB). Keep this page open; no public tile service is contacted.`;
  try {
    const response = await fetch('/api/maps/import', {
      method: 'POST', headers: {'Content-Type':'application/octet-stream', 'X-OpenRF-Map-Id':match[1]}, body: file
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || `Import failed (${response.status})`);
    await refreshOfflineMaps();
    $('offline-map-select').value = result.map.id;
    $('offline-map-select').dispatchEvent(new Event('change'));
    $('offline-map-file').value = '';
    $('offline-map-operation').textContent = `Imported ${result.map.name} (${(result.map.size_bytes/1048576).toFixed(1)} MiB) into private local storage.`;
  } catch (err) {
    $('offline-map-operation').textContent = `Import failed: ${err.message}. The previous maps were preserved.`;
    throw err;
  } finally { button.disabled = false; }
}));

// Keep the top-right map tools below the overlaid search controls.
function updateNavOverlayLayout(){
  const el=document.querySelector('.map-destination-panel'), map=$('map');
  if(!el||!map)return;
  const bottom=el.offsetTop+el.offsetHeight+8;
  map.parentElement.style.setProperty('--openrf-nav-overlay-bottom',`${Math.round(bottom)}px`);
  if(state.navRouteChoices)requestAnimationFrame(positionRouteChoicePanel);
}
const mapNavPanel=document.querySelector('.map-destination-panel');
if(typeof ResizeObserver!=='undefined') new ResizeObserver(updateNavOverlayLayout).observe(mapNavPanel);
window.addEventListener('resize',updateNavOverlayLayout);
updateNavOverlayLayout();
// Local saved destinations, optional address lookup, Valhalla road plans, and opt-in browser follow. No police alerts.
const navGeometry = window.OpenRFNavigation;
function navigationInputPoint(prefix) {
  if (!navGeometry) throw Error('Navigation geometry module unavailable. Refresh OpenRF.');
  return navGeometry.point($(`${prefix}-lat`).value, $(`${prefix}-lon`).value);
}
const navAddressCache=new Map();
function setNavigationStatus(message) { $('nav-status').textContent=message; }
function setMapDestinationStatus(message, kind = '') {
  const el=$('map-destination-status');
  el.hidden=false;el.textContent=message;
  const pickedStatus = $('map-picked-status');
  if (!($('map-picked-action').hidden)) {pickedStatus.textContent=message;pickedStatus.classList.toggle('map-route-error',kind==='error');}
  updateNavOverlayLayout();
  el.classList.toggle('map-route-error',kind==='error');
  el.classList.toggle('map-route-success',kind==='success');
}
let addressProviderInfo = null;
async function refreshAddressProviderStatus() {
  const result=await api('/api/navigation/geocoding/status');
  addressProviderInfo=result;
  // User-requested default: online address suggestions enabled on this device.
  // Only text the user types is sent; no browser GPS. Turning it off remains available.
  // The user can set a persisted off preference to keep fully local searching.
  let stored=null;
  try {stored=window.localStorage?.getItem('openrf-address-online')??null;} catch (_) { /* private browsing may block storage */ }
  $('map-online-address').checked=stored === null ? true : stored === 'on';
  const label=result.local_photon ? 'Local Photon' :
    (result.maptiler_configured ? 'MapTiler configured' : 'Public Photon (best effort)');
  $('map-provider-summary').textContent=`· ${label}`;
  $('map-provider-status').textContent=result.local_photon ?
    'Local Photon is configured. Address queries stay on this device.' :
    result.maptiler_configured ?
      `MapTiler key stored in ${result.credential_source==='environment'?'the server environment':'private Ubuntu configuration'}. Enable online search above to send typed addresses. The key is never shown here.` :
      'No MapTiler key saved. Public Photon is available as a best-effort option, but may be unreachable or rate-limited. Save a MapTiler key for dedicated autocomplete.';
  return result;
}
refreshAddressProviderStatus().catch(err=>{$('map-provider-status').textContent=`Could not read provider settings: ${err.message}`;});
$('map-save-provider').addEventListener('click',async()=>{
  const key=$('map-maptiler-key').value.trim();
  if(!key){$('map-provider-status').textContent='Enter a MapTiler API key first (or choose Remove saved key).';return;}
  const button=$('map-save-provider');button.disabled=true;
  try{
    await api('/api/navigation/geocoding/config','POST',{maptiler_key:key});
    $('map-maptiler-key').value='';
    await refreshAddressProviderStatus();
    $('map-provider-status').textContent+=' Key saved locally. Type a destination to search.';
    if($('map-online-address').checked) $('map-destination-query').dispatchEvent(new Event('input'));
  }catch(err){$('map-provider-status').textContent=`Could not save key: ${err.message}`;}
  finally{button.disabled=false;}
});
$('map-remove-provider').addEventListener('click',async()=>{
  const button=$('map-remove-provider');button.disabled=true;
  try{
    await api('/api/navigation/geocoding/config','POST',{maptiler_key:''});
    $('map-maptiler-key').value='';
    await refreshAddressProviderStatus();
    if(addressProviderInfo?.credential_source==='environment')
      $('map-provider-status').textContent='A MapTiler key is still set through OPENRF_MAPTILER_KEY in Ubuntu; remove that environment variable to disable it.';
  }catch(err){$('map-provider-status').textContent=err.message;}
  finally{button.disabled=false;}
});
$('map-test-provider').addEventListener('click',async()=>{
  if(!$('map-online-address').checked && !addressProviderInfo?.local_photon){
    $('map-provider-status').textContent='Enable Online U.S. address search above to test an external provider.';return;
  }
  const button=$('map-test-provider');button.disabled=true;
  $('map-provider-status').textContent='Testing a sample U.S. place name (not your current address or GPS)…';
  try{
    const results=await api(addressLookupUrl('Pioneer, California'));
    $('map-provider-status').textContent=results.results?.length ?
      `${results.provider} responded with ${results.results.length} U.S. suggestion(s). Try typing a destination.` :
      `${results.provider} responded, but found no U.S. suggestions for the test query.`;
  }catch(err){$('map-provider-status').textContent=`Search test failed: ${err.message}`;}
  finally{button.disabled=false;}
});
function addressLookupUrl(q, final = false, autocomplete = false) {
  // Public Photon is contacted only after an explicit unchecked-by-default opt-in.
  const online=$('map-online-address').checked ? '&online=1' : '';
  return `/api/navigation/geocode?q=${encodeURIComponent(q)}${online}${final ? '&mode=final' : (autocomplete ? '&mode=auto' : '')}`;
}
// Local saved places and typed coordinates are resolved without network access.
// Text address suggestions query only configured local Photon or an EXPLICIT opt-in
// MapTiler provider; never send browser location automatically to the geocoder.
function findLocalDestination(query, destinations) {
  const value=String(query||'').trim();
  if (!value) throw Error('Enter a saved destination name or latitude, longitude.');
  const pair=value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if (pair) return {name:value,coordinates:navGeometry.point(pair[1],pair[2])};
  const exact=destinations.find(d=>d.name.trim().toLowerCase()===value.toLowerCase());
  const matching=exact ? [exact] : destinations.filter(d=>d.name.trim().toLowerCase().startsWith(value.toLowerCase()));
  if (matching.length===1) {
    const d=matching[0];
    return {name:d.name,coordinates:navGeometry.point(d.latitude,d.longitude)};
  }
  if (matching.length>1) throw Error('Several saved destinations match. Select a full name from the suggestions.');
  throw Error('This is an address, not a saved place or coordinates. Configure address search or choose a map point.');
}
function navigationTypedCoordinates(value) {
  // Numeric latitude/longitude from a map pick is a local coordinate pair,
  // not a street address to be sent to the address autocomplete service.
  const match=String(value||'').trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if(!match)return null;
  try{return navGeometry.point(match[1],match[2]);}catch(_error){return null;}
}
function locationForQuickPreview() {
  const pos=state.browserLocation;
  if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon) &&
      Date.now()-pos.capturedAt<=60000 && Date.now()-pos.capturedAt>=-5000 &&
      Number.isFinite(pos.accuracy) && pos.accuracy>=0) return [pos.lon,pos.lat];
  throw Error('No recent browser position. Allow location access or choose From → Change in Where to? to set a starting point.');
}
async function resolveTypedPlace(query) {
  const value=String(query||'').trim();
  const chosen=state.navSelectedAddress;
  if (chosen && chosen.name===value) return chosen;
  if (navAddressCache.has(value)) return navAddressCache.get(value);
  try { return findLocalDestination(value,state.navDestinations); }
  catch (error) {
    if (!/This is an address/.test(error.message)) throw error;
    const reply=await api(addressLookupUrl(value, true));
    if (!reply.results?.length) throw Error('No U.S. address matches. Try house number, street, city and state; or choose a map point.');
    // Never use a guessed first result. Offer choices and require an explicit selection.
    if ($('map-destination-query').value.trim()===value) {
      state.navSearchCredit=reply.attribution||reply.provider||'';
      showMapAddressMatches((reply.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude],source:d.source,accuracy_note:d.accuracy_note}))); 
    } else {
      for (const input of document.querySelectorAll('#nav-start-query,#map-origin-query,#nav-dest-query,.nav-stop-query')) {
        // The quick origin editor is the visible place to choose an address
        // when both origin inputs contain the same mirrored draft.
        if(input.id==='nav-start-query'&&!$('map-origin-editor').hidden)continue;
        if (input.value.trim()===value) input.dispatchEvent(new Event('input'));
      }
    }
    throw Error('Select the matching address from the suggestions, then press Get directions again. Census address pins may be approximate.');
  }
}
// A route sheet is generated entirely in the browser from a real local Valhalla
// response. No travel positions are saved, and export happens only on click.
const routeGuide=window.OpenRFRouteGuidance;
const cameraApproach=window.OpenRFCameraAlerts||null;
const CAMERA_ALERT_PREF_KEY='openrf-camera-approach-v1';
const cameraAlertCard=document.createElement('section');
cameraAlertCard.id='map-camera-alert';cameraAlertCard.className='map-camera-alert';cameraAlertCard.hidden=true;
const cameraAlertTitle=document.createElement('strong');
const cameraAlertDetail=document.createElement('small');
cameraAlertCard.append(cameraAlertTitle,cameraAlertDetail);
$('map-follow-hud').querySelector('.map-follow-top').insertAdjacentElement('afterend',cameraAlertCard);
const cameraAlertCoverage=document.createElement('small');
cameraAlertCoverage.id='map-camera-alert-coverage';cameraAlertCoverage.className='map-camera-alert-coverage';
$('map-follow-hud').querySelector('.map-follow-extras').insertAdjacentElement('afterend',cameraAlertCoverage);
function hideCameraApproachAlert(){cameraAlertCard.hidden=true;state.navCameraAlertLastQualifiedAt=0;}
function syncCameraApproachSettings(){
  if(!cameraApproach)return;
  const p=state.navCameraAlertPrefs;
  $('camera-alert-enable').checked=p.enabled;
  $('camera-alert-voice').checked=p.voice;
  $('camera-alert-distance').value=String(p.miles);
  for(const input of document.querySelectorAll('[data-camera-alert-type]'))input.checked=p.types[input.dataset.cameraAlertType];
  $('camera-alert-settings-summary').textContent=p.enabled?`On · ${p.miles} mi${p.voice?' · voice':''}`:'Off';
  cameraAlertCoverage.textContent=!p.enabled?'Camera approach alerts off in settings.':
    state.navCameraAlertCatalog?.ready ?
      `${state.navCameraAlertCatalog.sites.length} mapped reports near selected route${state.navCameraAlertCatalog.incomplete?' · coverage incomplete':''}; not live detections.`:
      'Camera approach alerts use selected route reports. Catalog coverage may be incomplete.';
  if(p.voice && !navigationVoiceAvailable())cameraAlertCoverage.textContent+=' Spoken alerts are not supported by this browser.';
  if(!p.enabled)hideCameraApproachAlert();
}
function persistCameraApproachSettings(){
  const current={enabled:$('camera-alert-enable').checked,voice:$('camera-alert-voice').checked,
    miles:Number($('camera-alert-distance').value),types:{}};
  for(const input of document.querySelectorAll('[data-camera-alert-type]'))current.types[input.dataset.cameraAlertType]=input.checked;
  state.navCameraAlertPrefs=cameraApproach.preferences(current);
  try{window.localStorage?.setItem(CAMERA_ALERT_PREF_KEY,JSON.stringify(state.navCameraAlertPrefs));}
  catch(_error){/* Private browser storage unavailable; session choice remains active. */}
  syncCameraApproachSettings();
}
if(cameraApproach){
  let saved=null;
  try{saved=JSON.parse(window.localStorage?.getItem(CAMERA_ALERT_PREF_KEY)||'null');}
  catch(_error){/* Malformed or disabled browser storage uses safe defaults. */}
  state.navCameraAlertPrefs=cameraApproach.preferences(saved);
  syncCameraApproachSettings();
  for(const el of [$('camera-alert-enable'),$('camera-alert-voice'),$('camera-alert-distance'),
    ...document.querySelectorAll('[data-camera-alert-type]')])el.addEventListener('change',persistCameraApproachSettings);
}else{
  $('camera-alert-settings-summary').textContent='Unavailable · missing module';
  cameraAlertCoverage.textContent='Camera approach module unavailable. Refresh OpenRF.';
}
function updateCameraApproachCandidates(){
  state.navCameraAlertCatalog=cameraApproach?.candidates(state.navPreview,state.navCameraReport,routeGuide)||null;
  state.navCameraAlertSeen.clear();state.navCameraAlertVoiceSeen.clear();state.navCameraAlertLastVoice=0;
  state.navCameraAlertLastQualifiedAt=0;
  hideCameraApproachAlert();
  if(cameraApproach)syncCameraApproachSettings();
}
function cameraApproachSpeak(text){
  if(!state.navCameraAlertPrefs?.voice||state.navDemoActive||state.navFollowId===null||!navigationVoiceAvailable())return false;
  try{
    navigationSilence();
    const phrase=new window.SpeechSynthesisUtterance(text.slice(0,250));
    phrase.lang='en-US';phrase.rate=0.95;phrase.volume=1;
    window.speechSynthesis.speak(phrase);
    state.navCameraAlertLastVoice=Date.now();
    return true;
  }catch(_error){return false;}
}
function updateCameraApproachAlert(route,progress,fix,turn){
  if(!cameraApproach || state.navDemoActive || state.navFollowId===null){hideCameraApproachAlert();return;}
  let view=null;
  try{view=routeGuide.routeVisualHeading(route,fix.longitude,fix.latitude,progress.along_m);}
  catch(_error){hideCameraApproachAlert();return;}
  const difference=view&&fix.heading!==null ? Math.abs((fix.heading-view.heading+540)%360-180):180;
  const found=cameraApproach.approach(state.navCameraAlertCatalog,state.navCameraAlertPrefs,{
    along_m:progress.along_m,accuracy_m:fix.accuracy,age_ms:fix.ageMs,offroute:progress.offroute,
    moving:fix.heading!==null,headingAligned:difference<=75
  },state.navCameraAlertSeen);
  if(!found){hideCameraApproachAlert();return;}
  const site=found.site,distance=cameraApproach.distanceLabel(found.distance_m);
  cameraAlertTitle.textContent=`Mapped ${cameraApproach.typeLabel(site.type)} report · ${distance} ahead`;
  cameraAlertDetail.textContent=`${site.state==='VERIFIED'?'Document-backed':'Reported'} location near planned road · ${site.source||'source unspecified'}. ${site.direction_assessment==='orientation_match'?'Stored lens heading suggests an approaching road.':site.direction_assessment==='not_direction_matched'?'Stored lens heading does not match the modeled approach; this does not rule out coverage.':'Camera direction is unknown or insufficient to assess.'} Operation and lane coverage unverified.`;
  cameraAlertCard.hidden=false;
  state.navCameraAlertLastQualifiedAt=Date.now();
  if(found.newAlert)state.navCameraAlertSeen.add(site.key);
  // Voice is an additional explicit opt-in. Turns win: no camera speech near
  // a maneuver, during a voice prompt, or repeatedly for a camera cluster.
  const now=Date.now();
  if(state.navCameraAlertPrefs.voice && !state.navCameraAlertVoiceSeen.has(site.key) &&
     (!turn||turn.distance_m>150) &&
     now-state.navVoiceLastTurnAt>8000 &&
     (!state.navCameraAlertLastVoice || now-state.navCameraAlertLastVoice>15000)){
    if(cameraApproachSpeak(`Mapped ${cameraApproach.typeLabel(site.type)} reported ahead in ${distance}. Camera operation and direction are not confirmed.`))
      state.navCameraAlertVoiceSeen.add(site.key);
  }
}
// The summary wraps at small widths. Pin the export actions to its measured
// height rather than a fixed number that can overlap two-line summaries.
function updateDirectionsStickyOffset(){
  const pane=$('map-directions-review'), summary=$('map-directions-summary'), actions=$('map-directions-actions');
  if(!pane || !summary || !actions)return;
  const height=summary.getBoundingClientRect().height;
  if(height>0)pane.style.setProperty('--openrf-directions-summary-height',`${Math.ceil(height)}px`);
  pane.style.setProperty('--openrf-directions-actions-height',`${Math.ceil(actions.getBoundingClientRect().height)}px`);
}
// Missing optional layout nodes must not stop the entire map app at startup.
// In v0.2.133 the actions wrapper was missing its ID; observe(null) threw,
// preventing showPage('map') and the map initializer from ever running.
if(typeof ResizeObserver!=='undefined'){
  const directionsResizeObserver=new ResizeObserver(updateDirectionsStickyOffset);
  for(const id of ['map-directions-summary','map-directions-actions']){
    const node=$(id);
    if(node)directionsResizeObserver.observe(node);
  }
}
window.addEventListener('resize',updateDirectionsStickyOffset);
const tripMapController=window.OpenRFTripMaps?.init({
  getRoute:()=>state.navPreview,
  sample:(coordinates,count)=>window.OpenRFRouteElevation?.sample(coordinates,count),
  api,
  refreshMaps:refreshOfflineMaps,
});
$('map-trip-offline').addEventListener('toggle',()=>{
  if($('map-trip-offline').open)tripMapController?.poll();
});
function renderDirectionsReview(route) {
  const pane=$('map-directions-review');
  if(typeof tripMapController!=='undefined')tripMapController?.routeChanged();
  if(route?.type!=='ROAD_ROUTE'){pane.hidden=true;pane.open=false;$('map-walking-follow-actions').hidden=true;return;}
  $('map-route-elevation-chart').hidden=true;
  $('map-route-elevation-chart').replaceChildren();
  $('map-elevation-status').textContent='No profile loaded for this route. View saved data offline or opt in to online preparation.';
  $('map-route-coverage-results').replaceChildren();
  $('map-route-coverage-status').textContent='Not checked for this route.';
  const walking=route.travel_mode==='pedestrian' || route.is_driving_route!==true;
  const turns=routeGuide.routeSteps(route);
  pane.hidden=false;pane.open=true;
  $('map-directions-summary').textContent=`${walking?'Walking directions':'Directions'} · ${route.distance_miles} mi · ${Math.round(route.duration_seconds/60)} min · ${turns.length} turns`;
  $('map-directions-actions').hidden=walking;
  $('map-directions-start').parentElement.hidden=walking;
  $('map-directions-start').hidden=walking;
  $('map-directions-start').disabled=walking || $('map-begin-guidance').disabled;
  $('map-walking-follow-actions').hidden=!walking;
  $('map-directions-walk-start').disabled=!walking||route.travel_mode!=='pedestrian'||route.is_driving_route!==false||state.navFollowId!==null;
  $('map-directions-intro').textContent=walking ?
    'Walking plan from local Valhalla. Trail access, sidewalk continuity, closures and surface conditions are unverified. Start walking navigation only when you are ready to share a fresh location; follow posted signs.' :
    'Tap a turn to avoid its mapped road point for this trip or future trips. Recalculate afterward. Signs and legal access rules take priority; no live traffic feed.';
  $('map-directions-note').textContent=walking ?
    'Walking follow shows your reported position and approximate progress, with no automatic rerouting or GPS history. The planned path is not a verified safe or public trail.' :
    'Saved HTML works offline after downloading. JSON includes precise route coordinates; keep it private.';
  updateDirectionsStickyOffset();
  const list=$('map-directions-list');list.replaceChildren();
  for(const t of turns){
    const li=document.createElement('li');li.className='route-step-item';
    const title=document.createElement('strong');title.textContent=t.instruction;
    const distance=document.createElement('small');distance.textContent=`${t.length_miles.toFixed(2)} mi`;
    li.append(title,distance);
    const anchor=routeGuide.turnAvoidPoint(route,t);
    const isArrival=/\b(arrive|destination|you have arrived)\b/i.test(t.instruction);
    if(!walking && anchor && !isArrival){
      const toggle=document.createElement('button');toggle.type='button';toggle.className='route-step-avoid-toggle';
      toggle.textContent='Avoid this road';toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-label',`Avoid road near: ${t.instruction}`);
      const actions=document.createElement('div');actions.className='route-step-avoid-actions';actions.hidden=true;
      const warning=document.createElement('small');warning.textContent='Excludes a point on this road, not the entire named street. Verify the map and signs.';
      const status=document.createElement('small');status.className='route-step-avoid-status';status.setAttribute('role','status');
      for(const [scope,label] of [['trip','This trip'],['saved','Save for future trips']]){
        const button=document.createElement('button');button.type='button';button.className='btn outline mini';button.textContent=label;
        button.addEventListener('click',()=>{
          const result=addTurnRoadAvoidance(t.instruction,anchor,scope);
          status.textContent=result;
          if(result.startsWith('Added')){
            actions.querySelectorAll('button').forEach(b=>b.disabled=true);
            const recalc=document.createElement('button');recalc.type='button';recalc.className='btn primary mini';
            recalc.textContent='Recalculate directions';
            recalc.addEventListener('click',()=>runAction(async()=>{
              if(state.navFollowId!==null)throw Error('Stop navigation safely before recalculating.');
              const current=state.navPreview;
              if(!current?.is_driving_route || !Array.isArray(current.origin) || !Array.isArray(current.destination))
                throw Error('This road route no longer exists. Choose a destination and Get directions again.');
              const updated=await planRoadRoute([current.origin,...(current.stops||[]),current.destination],{preserveCurrentOnFailure:true});
              setMapDestinationStatus(updated.text,updated.road?'success':'error');
            }));
            actions.insertBefore(recalc,warning);
          }
        });actions.append(button);
      }
      actions.append(warning,status);
      toggle.addEventListener('click',()=>{actions.hidden=!actions.hidden;toggle.setAttribute('aria-expanded',String(!actions.hidden));});
      li.append(toggle,actions);
    }
    list.append(li);
  }
}
async function loadRouteTerrainProfile(allowOnline){
  const current=state.navPreview;
  if(current?.type!=='ROAD_ROUTE')throw Error('Plan a driving or walking route first.');
  const elevation=window.OpenRFRouteElevation;
  const points=elevation?.sample(current.coordinates,13);
  if(!points)throw Error('This route has no usable line geometry for a terrain profile.');
  if(allowOnline && !confirm('Send 13 sampled locations along this planned route to USGS 3DEP for terrain elevations? This uses internet; the result is cached privately for offline reuse.'))return;
  const status=$('map-elevation-status'),chart=$('map-route-elevation-chart');
  $('map-elevation-cached').disabled=true;$('map-elevation-prepare').disabled=true;
  status.textContent=allowOnline?'Checking offline terrain first, then USGS if required…':'Checking saved or imported terrain profiles locally…';
  try{
    const response=await api('/api/navigation/elevation-profile','POST',{points,allow_online:allowOnline});
    if(current!==state.navPreview)return;
    const profile=response.profile;
    if(profile.status==='not_prepared'){
      chart.hidden=true;
      status.textContent='No saved or imported terrain heights cover this route. Import a matching HGT tile, or choose Prepare online if you wish.';
      return;
    }
    const range=elevation.draw(chart,profile,Number(current.distance_miles));
    chart.hidden=!range;
    const sourceLabel=profile.status==='cached'?'Saved offline USGS profile':profile.status==='local_terrain'?'Imported offline HGT profile (unverified source)':'USGS profile prepared and saved';
    status.textContent=range?`${sourceLabel} · ${range.minFeet.toLocaleString()}–${range.maxFeet.toLocaleString()} ft terrain elevation · ${profile.available_points}/${profile.sample_points} samples${profile.partial?' (incomplete coverage)':''}. Modeled terrain, not GPS altitude, verified trail clearance or a surveyed safety grade.`:'Too few usable terrain heights to draw a profile.';
  }catch(err){
    if(current===state.navPreview)status.textContent=`Terrain profile unavailable: ${err.message}. This does not affect route directions.`;
  }finally{
    $('map-elevation-cached').disabled=false;$('map-elevation-prepare').disabled=false;
  }
}
$('map-elevation-cached').addEventListener('click',()=>loadRouteTerrainProfile(false));
$('map-elevation-prepare').addEventListener('click',()=>loadRouteTerrainProfile(true));
async function checkOfflineRouteTiles(){
  const current=state.navPreview;
  const points=current?.type==='ROAD_ROUTE'&&window.OpenRFRouteElevation?.sample(current.coordinates,13);
  const status=$('map-route-coverage-status');
  const results=$('map-route-coverage-results');
  if(!points){status.textContent='Plan a local driving or walking route before checking coverage.';return;}
  const button=$('map-route-coverage-check');button.disabled=true;
  results.replaceChildren();
  status.textContent='Checking installed offline vector and raster tiles for 13 route samples…';
  const row=(label,detail)=>{
    const line=document.createElement('div'),heading=document.createElement('strong'),value=document.createElement('span');
    heading.textContent=label;value.textContent=detail;line.append(heading,value);results.append(line);
  };
  try{
    const response=await api('/api/navigation/route-coverage','POST',{points});
    if(current!==state.navPreview)return;
    if(response.kind!=='OFFLINE_ROUTE_TILE_SAMPLES'||response.read_only!==true||
       response.external_requests!==false||response.gps_fix_checked!==false||response.sample_count!==13)
      throw Error('Unexpected route coverage response');
    const v=response.vector_basemap;
    row('Installed vector basemap',v.ready?`${v.sampled_tiles_present}/13 tile samples at zoom ${v.zoom_tested}`:'Not ready (regional tiles or fonts missing)');
    if(!response.raster_basemaps.length)row('Installed raster basemaps','No offline raster packages');
    else for(const map of response.raster_basemaps)
      row(map.name,`${map.sampled_tiles_present}/13 tile samples at zoom ${map.zoom_tested}`);
    row('Local road router',response.routing_service_reachable?'Responding (graph coverage not proven)':'Not responding');
    status.textContent=response.some_basemap_has_all_sampled_tiles?
      'One offline basemap contains all 13 sampled tiles. Gaps between samples, road graph, GPS and conditions are NOT verified.':
      'No single installed offline basemap contains all 13 sampled tiles. Prepare more map coverage before relying on this route offline.';
  }catch(error){
    if(current===state.navPreview){results.replaceChildren();status.textContent=`Offline tile check unavailable: ${error.message}. No network request or navigation was started.`;}
  }finally{button.disabled=false;}
}
$('map-route-coverage-check').addEventListener('click',checkOfflineRouteTiles);
$('map-directions-start').addEventListener('click',startSelectedRouteNavigation);
function routeLabels(){return {origin:state.navOriginManual?$('nav-start-query').value.trim()||'Chosen start':'Browser-reported starting location',destination:$('map-destination-query').value.trim()||$('nav-dest-name').value.trim()||'Selected map point'};}
function saveRouteSheet(filename,mime,body){
  const blob=new Blob([body],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function currentRoadPlan(){
  const route=state.navPreview;
  if(route?.type!=='ROAD_ROUTE'||!route.is_driving_route)throw Error('Get verified road directions before printing or exporting.');
  return route;
}
$('map-save-directions-html').addEventListener('click',()=>runAction(async()=>{
  saveRouteSheet('OpenRF-driving-directions.html','text/html;charset=utf-8',routeGuide.sheet(currentRoadPlan(),routeLabels()));
  setMapDestinationStatus('Printable HTML directions saved locally. This file can be opened without internet.','success');
}));
$('map-save-directions-json').addEventListener('click',()=>runAction(async()=>{
  const route=currentRoadPlan();
  if(!confirm('Export full route geometry and coordinates as JSON? The file remains on your device but could reveal precise locations if shared.'))return;
  saveRouteSheet('OpenRF-driving-route.json','application/json',JSON.stringify({format:'openrf-route-plan',version:1,saved_at_utc:new Date().toISOString(),labels:routeLabels(),route},null,2));
  setMapDestinationStatus('Full road-plan JSON saved locally. Handle location coordinates privately.','success');
}));
$('map-print-directions').addEventListener('click',()=>runAction(async()=>{
  const view=window.open('','_blank');
  if(!view)throw Error('Firefox blocked the print tab. Allow popups for 127.0.0.1 or use Save HTML.');
  view.document.open();view.document.write(routeGuide.sheet(currentRoadPlan(),routeLabels()));view.document.close();
  view.focus();view.print();
}));

// v0.2.61: Optional route settings. Only explicit road points are used as
// Valhalla exclusions. Browser-local saved exclusions never enter the repo.
const ROUTE_AVOID_KEY='openrf.route-avoids.v1';
function safeRouteAvoidEntry(e){
  return e && typeof e.label==='string' && e.label.trim().length>0 && e.label.length<=100 &&
    Number.isFinite(e.latitude) && Number.isFinite(e.longitude) &&
    Math.abs(e.latitude)<=90 && Math.abs(e.longitude)<=180 ?
    {label:e.label.trim(),latitude:e.latitude,longitude:e.longitude}:null;
}
try{
  const stored=JSON.parse(window.localStorage?.getItem(ROUTE_AVOID_KEY)||'[]');
  if(Array.isArray(stored))state.navAvoidSaved=stored.slice(0,8).map(safeRouteAvoidEntry).filter(Boolean);
}catch(_err){state.navAvoidSaved=[];}
function routeAvoidEntries(){return [...state.navAvoidSaved,...state.navAvoidSession].slice(0,8);}
function routeRequestOptions(){
  return {avoid_highways:$('route-avoid-highways').checked,avoid_tolls:$('route-avoid-tolls').checked,
    exclude_locations:routeAvoidEntries().map(e=>({latitude:e.latitude,longitude:e.longitude}))};
}
function saveRouteAvoidSaved(){
  try{window.localStorage?.setItem(ROUTE_AVOID_KEY,JSON.stringify(state.navAvoidSaved));return true;}
  catch(_err){return false;}
}
function addTurnRoadAvoidance(instruction,anchor,scope){
  if(state.navFollowId!==null)return 'Stop navigation safely before changing this route.';
  const label=String(instruction||'').slice(0,100).trim();
  const entry=safeRouteAvoidEntry({label,latitude:anchor?.latitude,longitude:anchor?.longitude});
  if(!entry)return 'This turn does not have a usable mapped road point.';
  if(routeAvoidEntries().some(e=>Math.abs(e.latitude-entry.latitude)<0.00002 && Math.abs(e.longitude-entry.longitude)<0.00002))
    return 'That road point is already excluded. Review the saved list in Route preferences.';
  if(routeAvoidEntries().length>=8)return 'Eight avoidance points reached. Remove an existing point in Route preferences.';
  if(scope==='saved'){
    state.navAvoidSaved.push(entry);
    if(!saveRouteAvoidSaved()){
      state.navAvoidSaved.pop();return 'Browser storage unavailable; use This trip instead.';
    }
  }else state.navAvoidSession.push(entry);
  renderRoadAvoidList();onRoutePreferencesChanged();
  return `Added for ${scope==='saved'?'future trips in this browser':'this trip'}. Get directions again to apply the exclusion; current route unchanged.`;
}
function renderRoadAvoidList(){
  const box=$('route-road-list');box.replaceChildren();
  const all=[...state.navAvoidSaved.map((e,i)=>({...e,scope:'saved',index:i})),...state.navAvoidSession.map((e,i)=>({...e,scope:'trip',index:i}))];
  $('route-road-count').textContent=all.length?`${all.length} excluded point${all.length===1?'':'s'}`:'No exclusions';
  if(!all.length){const note=document.createElement('small');note.textContent='No excluded road points.';box.append(note);return;}
  for(const e of all){
    const row=document.createElement('div');row.className='route-road-item';
    const label=document.createElement('span');label.textContent=`${e.label} · ${e.scope==='saved'?'Saved':'This trip'}`;
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
    remove.setAttribute('aria-label',`Remove ${e.label}`);
    remove.addEventListener('click',()=>{
      (e.scope==='saved'?state.navAvoidSaved:state.navAvoidSession).splice(e.index,1);
      if(e.scope==='saved')saveRouteAvoidSaved();renderRoadAvoidList();onRoutePreferencesChanged();
    });
    row.append(label,remove);box.append(row);
  }
}
function onRoutePreferencesChanged(){
  state.navRoadPrefsDirty=true;
  invalidateCameraComparison();
  $('map-compare-camera-routes').disabled=true;
  $('route-road-status').textContent='Preferences changed. Get directions again to apply them; an active route will not switch silently.';
}
for(const name of ['route-avoid-highways','route-avoid-tolls'])$(name).addEventListener('change',()=>{syncRouteCameraPrefs();onRoutePreferencesChanged();});
$('route-road-find').addEventListener('click',()=>{
  const query=$('route-avoid-road-name').value.trim().toLowerCase(),select=$('route-road-matches');
  select.replaceChildren();select.hidden=true;state.navAvoidAnchor=null;
  if(query.length<2){$('route-road-status').textContent='Enter at least two letters from a road name.';return;}
  const route=state.navPreview;
  if(!route?.is_driving_route){$('route-road-status').textContent='First plan a road route, or select a road spot on the map.';return;}
  const matches=(route.maneuvers||[]).filter(turn=>turn.instruction?.toLowerCase().includes(query) &&
    Number.isInteger(turn.shape_index) && route.coordinates?.[turn.shape_index]).slice(0,15);
  if(!matches.length){$('route-road-status').textContent='No named turn matches this route. Pick the specific segment on the map instead.';return;}
  for(const [index,turn] of matches.entries()){
    const opt=document.createElement('option');opt.value=String(index);opt.textContent=turn.instruction.slice(0,130);select.append(opt);
  }
  select.hidden=false;
  const apply=()=>{const turn=matches[Number(select.value)];const point=route.coordinates[turn.shape_index];state.navAvoidAnchor={latitude:point[1],longitude:point[0]};
    $('route-road-status').textContent='Matched a point near a named maneuver, not an entire street. Verify the location; Add avoidance, then recalculate.';};
  select.onchange=apply;apply();
});
$('route-road-pick').addEventListener('click',()=>{
  // Map tap modes are exclusive. Choosing an avoidance point cannot leave
  // the destination-pick handler armed over the same map.
  if (state.navPicking) {
    state.navPicking=false;
    syncDestinationPickMode();
    renderNavigationOverlay();
  }
  state.navAvoidPicking=true;
  $('map-navigation-options').open=false;
  setMapSearchCollapsed(true);
  $('route-road-status').textContent='Tap the specific road or gate location on the map (one point).';
});
$('route-road-add').addEventListener('click',()=>{
  const label=$('route-avoid-road-name').value.trim();const anchor=state.navAvoidAnchor;
  if(!label || !anchor){$('route-road-status').textContent='Enter a road label and match a planned turn or pick its exact map location.';return;}
  if(routeAvoidEntries().length>=8){$('route-road-status').textContent='Eight avoidance points reached. Remove a point before adding another.';return;}
  const entry=safeRouteAvoidEntry({...anchor,label});if(!entry){$('route-road-status').textContent='Invalid name or mapped location.';return;}
  const scope=$('route-road-scope').value;
  if(scope==='saved'){
    state.navAvoidSaved.push(entry);
    if(!saveRouteAvoidSaved()){$('route-road-status').textContent='Browser storage unavailable; this saved exclusion cannot be persisted. Use trip only.';state.navAvoidSaved.pop();return;}
  }else state.navAvoidSession.push(entry);
  state.navAvoidAnchor=null;$('route-road-matches').hidden=true;$('route-avoid-road-name').value='';
  renderRoadAvoidList();onRoutePreferencesChanged();
});
function consumeRoadAvoidPick(lon,lat){
  if(!state.navAvoidPicking)return false;
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return false;
  state.navAvoidPicking=false;state.navAvoidAnchor={latitude:lat,longitude:lon};
  $('map-navigation-options').open=true;
  $('route-road-status').textContent=`Road spot selected: ${lat.toFixed(5)}, ${lon.toFixed(5)}. Label it, choose trip or saved, then Add avoidance.`;
  return true;
}
$('map').addEventListener('click',event=>{
  if(!state.navAvoidPicking || event.target.closest?.('button,a,.map-destination-panel,.map-tool-overlay,.map-tool-rail,.map-navigation-settings,.map-follow-hud,.maplibregl-ctrl,.raster-control,.map-route-choices'))return;
  const root=$('map'),rect=root.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(x<0||y<0||x>rect.width||y>rect.height)return;
  let lon,lat;
  if(state.map && state.mapReady){const p=state.map.unproject([x,y]);lon=p.lng;lat=p.lat;}
  else if(state.rasterMap){const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
    [lon,lat]=pixelWorld(center[0]+x-rect.width/2,center[1]+y-rect.height/2,state.rasterMap.zoom);}
  if(consumeRoadAvoidPick(lon,lat)){event.preventDefault();event.stopImmediatePropagation();}
},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape' && state.navAvoidPicking)state.navAvoidPicking=false;});
renderRoadAvoidList();
// Keep the old route option section in the DOM for integrations, but mount it
// within the existing navigation settings popup rather than over the map.
// Frequent avoidance choices form one continuous list: roads and all three camera types.
const cameraSwitches=$('map-camera-route-panel').querySelector('.camera-route-types');
$('route-avoid-settings').insertBefore(cameraSwitches,$('route-avoid-settings').querySelector('p.small.muted'));
$('route-avoid-settings').insertBefore($('route-camera-priority-control'),$('route-avoid-settings').querySelector('p.small.muted'));
// Keep report/compare controls available below the ordinary avoidance switches.
$('route-avoid-settings').insertBefore($('map-camera-route-panel'),$('route-road-control'));

function cameraReportSummary(report){
  if(!report)return 'No camera catalog report available for this road route.';
  const counts=(report.sites||[]).reduce((by,site)=>(by[site.type]=(by[site.type]||0)+1,by),{});
  const breakdown=Object.entries(counts).map(([kind,n])=>`${kind.replace('_',' ')}: ${n}`).join(' · ');
  const assessed=Number.isFinite(report.nearby_count);
  const locationDetail=assessed?` · ${report.not_direction_matched_count||0} bearing estimates not matched, ${report.unknown_direction_count||0} unknown directions (all retained in the count)`:'';
  return `${report.count} nearby mapped camera report(s)${locationDetail}${breakdown?' · '+breakdown:''}${report.incomplete?' · PARTIAL DATA':''}. A camera can observe other lanes or directions; the viewing-angle estimate never removes a nearby report.`;
}
function updateCameraRoutePreferenceDisplay(){
  const chosen=selectedRouteCameraTypes();
  const enabled=$('map-camera-route-enable').checked && chosen.length>0;
  const label=enabled?chosen.map(x=>({ALPR:'ALPR',RED_LIGHT:'red-light',SPEED:'speed'}[x])).join(' / ')+
    ($('route-camera-priority').value==='maximum'?' · Maximum':''):'Off';
  $('map-search-camera-choice').textContent=label;
  $('map-follow-camera-options').textContent=`Route prefs · ${enabled?chosen.length+' cameras'+($('route-camera-priority').value==='maximum'?' · max':''):'standard'}`;
  // This explicit opt-in governs only future off-route requests; it does not
  // silently replace the currently chosen Valhalla road route.
  state.navCameraAvoidTypes=enabled?[...chosen]:null;
  return enabled;
}
const selectedRouteCameraTypes=()=>[...document.querySelectorAll('[data-route-camera-type]:checked')].map(x=>x.dataset.routeCameraType);
const ROUTE_PREFS_KEY='openrf.route-prefs.v1';
try{
  const saved=JSON.parse(window.localStorage?.getItem(ROUTE_PREFS_KEY)||'{}');
  if(saved && typeof saved==='object'){
    $('route-avoid-highways').checked=saved.highways===true;
    $('route-avoid-tolls').checked=saved.tolls===true;
    const types=Array.isArray(saved.cameras)?saved.cameras.filter(x=>['ALPR','RED_LIGHT','SPEED'].includes(x)):[];
    for(const box of document.querySelectorAll('[data-route-camera-type]'))box.checked=types.includes(box.dataset.routeCameraType);
    $('route-camera-priority').value=saved.priority==='maximum'?'maximum':'balanced';
  }
}catch(_err){/* Local preferences are optional. */}
function syncRouteCameraPrefs(){
  $('map-camera-route-enable').checked=selectedRouteCameraTypes().length>0;
  try{window.localStorage?.setItem(ROUTE_PREFS_KEY,JSON.stringify({highways:$('route-avoid-highways').checked,
    tolls:$('route-avoid-tolls').checked,cameras:selectedRouteCameraTypes(),priority:$('route-camera-priority').value}));}catch(_err){}
}
syncRouteCameraPrefs();

function cameraPanelVisibility(open){
  const panel=$('map-camera-route-panel');panel.hidden=false;
  state.navCameraPanelOpen=Boolean(open);
  $('map-camera-route-chip').setAttribute('aria-expanded',String(Boolean(open)));
  $('map-navigation-options').open=Boolean(open);
  if(open){
    // Route preferences are an overlay. Keep a currently open Where to? form
    // and its unfinished start/destination entries intact underneath it.
    if(typeof activeMapTool!=='undefined' && activeMapTool)closeMapToolOverlay();
    $('map-picked-action').hidden=true;
  }
}
function openCameraRouteOptions(){cameraPanelVisibility(!$('map-navigation-options').open);}
for(const id of ['map-search-camera-options','map-picked-camera-options','map-follow-camera-options','map-camera-route-chip'])
  $(id).addEventListener('click',openCameraRouteOptions);
$('map-camera-route-close').addEventListener('click',()=>cameraPanelVisibility(false));
window.addEventListener('keydown',event=>{
  if(event.key==='Escape' && state.navCameraPanelOpen){event.preventDefault();cameraPanelVisibility(false);}
});
function showRouteCameras(report){
  state.navCameraReport=report;
  if(typeof updateCameraApproachCandidates==='function')updateCameraApproachCandidates();
  const road=state.navPreview?.is_driving_route;
  const chip=$('map-camera-route-chip');chip.hidden=true;
  $('map-route-camera-summary').textContent=road?cameraReportSummary(report):'Choose camera types, then Get directions to compare local road routes.';
  if(report)$('map-directions-summary').textContent+=` · ${report.count} nearby camera report(s)`;
  chip.textContent=road?`Camera routes · ${report?.count??'—'} nearby reports`:'Camera route options';
  $('map-camera-comparison-status').textContent=road?
    'The normal route is selected. Select categories and Compare routes; no alternative is guaranteed.':
    'Choose camera types and enable consideration, then Get directions. No camera-free route is guaranteed.';
  $('map-use-camera-alternate').hidden=true;
  $('map-compare-camera-routes').disabled=!road;
  state.navCameraComparison=null;state.navRouteChoices=null;
  $('map-route-choices').hidden=true;
  updateCameraRoutePreferenceDisplay();
}

// Keep route choices below the *rendered* Directions summary, which may wrap
// onto multiple lines at 800x480 or in a narrow browser window.
function positionRouteChoicePanel(){
  const panel=$('map-route-choices'), directions=$('map-directions-review');
  if(panel.hidden || state.navPicking || directions.hidden || directions.open || !mapSearchForm.hidden)return;
  const container=panel.offsetParent;
  if(!container)return;
  const heading=directions.getBoundingClientRect(), area=container.getBoundingClientRect();
  if(!heading.height)return;
  const top=Math.ceil(heading.bottom-area.top+12);
  panel.style.top=`${top}px`;
  // Let both route cards and their tradeoffs expand toward the map credits,
  // rather than scrolling a two-choice list inside a short 260px box. Keep
  // 46px clear at the bottom for the data/attribution info icon and controls.
  const visibleBottom=Math.min(area.bottom,window.innerHeight);
  panel.style.maxHeight=`${Math.max(120,Math.min(400,Math.floor(visibleBottom-(area.top+top)-46)))}px`;
}
function sameRoadCoordinates(first,second){
  // Defensive guard for previously cached or older API responses. The Python
  // router comparison performs the fuller distance-sampled near-duplicate
  // check; this cheap client guard rejects literally overlapping paths.
  const a=first?.coordinates,b=second?.coordinates;
  if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||a.length!==b.length)return false;
  return a.every((point,i)=>Array.isArray(point)&&Array.isArray(b[i])&&
    Math.abs(Number(point[0])-Number(b[i][0]))<0.00005&&
    Math.abs(Number(point[1])-Number(b[i][1]))<0.00005);
}
function routeChoiceDifferenceSummary(response){
  const main=response.standard,other=response.alternative;
  const miles=Number(other.distance_miles)-Number(main.distance_miles);
  const minutes=Math.round((Number(other.duration_seconds)-Number(main.duration_seconds))/60);
  const distanceText=!Number.isFinite(miles)?'distance difference unknown':
    Math.abs(miles)<0.05?'same distance':`${Math.abs(miles).toFixed(1)} mi ${miles>0?'longer':'shorter'}`;
  const timeText=!Number.isFinite(minutes)?'time difference unknown':
    minutes===0?'same estimated time':`${Math.abs(minutes)} min ${minutes>0?'slower':'faster'}`;
  const mainReports=Number(response.standard_cameras?.count),otherReports=Number(response.alternative_cameras?.count);
  const validReports=response.standard_cameras&&response.alternative_cameras&&
    Number.isFinite(mainReports)&&Number.isFinite(otherReports);
  const delta=otherReports-mainReports;
  const reportsText=!validReports?'camera comparison unavailable':
    delta===0?'same number of nearby camera reports':
      `${Math.abs(delta)} ${delta>0?'more':'fewer'} nearby camera report${Math.abs(delta)===1?'':'s'}`;
  const away=Number(response.alternative_cameras?.not_direction_matched_count)||0;
  const unknown=Number(response.alternative_cameras?.unknown_direction_count)||0;
  const extra=away?`${away} lens bearing estimate${away===1?'':'s'} not matched (still counted)`:
    unknown?`${unknown} camera direction${unknown===1?'':'s'} unknown`:'';
  const incomplete=response.standard_cameras?.incomplete||response.alternative_cameras?.incomplete;
  return [distanceText,timeText,reportsText,extra].filter(Boolean).join(' · ')+(incomplete?' · partial camera data':'');
}
function routeChoiceCameraCount(report){
  if(!report)return '? camera reports';
  const count=Number(report.count);
  return `${count} nearby camera report${count===1?'':'s'}`;
}
function renderRouteChoices(){
  const response=state.navRouteChoices, panel=$('map-route-choices');
  // When there is only one drivable route, it is already selected; no choice
  // card should interrupt the full turn-by-turn directions.
  const ready=Boolean(response?.standard?.is_driving_route && response?.alternative?.is_driving_route &&
    !sameRoadCoordinates(response.standard,response.alternative));
  panel.hidden=!ready || state.navPicking || state.navChoicePanelClosed || state.navFollowId!==null || !mapSearchForm.hidden || $('map-navigation-options').open || $('map-directions-review').open;
  const startButton=$('route-choice-start');
  startButton.disabled=!ready || state.navPreview?.type!=='ROAD_ROUTE' || state.navPreview?.is_driving_route!==true || $('map-begin-guidance').disabled;
  startButton.setAttribute('aria-label',`Start navigation on selected ${state.navChoiceSelection==='alternate'?'alternate':'main'} route`);
  if(!ready){$('route-choice-alternate').hidden=true;return;}
  for(const [key,id,detailsId,route,report] of [
    ['standard','route-choice-standard','route-choice-standard-details',response.standard,response.standard_cameras],
    ['alternate','route-choice-alternate','route-choice-alternate-details',response.alternative,response.alternative_cameras]]){
    const button=$(id);button.hidden=!route;
    button.setAttribute('aria-pressed',String(state.navChoiceSelection===key));
    // Structured spans preserve separate title, route details and the
    // at-a-glance comparison on a narrow 5-inch landscape touch display.
    if(!route)continue;
    $(detailsId).textContent=`${route.distance_miles} mi · ~${Math.round(route.duration_seconds/60)} min · ${routeChoiceCameraCount(report)}`;
  }
  $('route-choice-difference').textContent=routeChoiceDifferenceSummary(response);
  $('route-choice-status').textContent=ready ?
    (response.mode==='maximum'&&response.preferred==='alternate'?'Maximum avoidance recommends the alternate with fewer nearby reports. Review the extra distance and time, then tap to select. ':'Tap to choose. ')+
    `${state.navChoiceSelection==='alternate'?'Alternate':'Main'} route selected. Teal is selected; dashed amber marks the other road. Mapped camera coverage is incomplete.` :
    (response.detail || 'Only the main route is available with current preferences and road data.');
  positionRouteChoicePanel();
}
function chooseRouteChoice(key){
  const response=state.navRouteChoices,chosen=key==='alternate'?response?.alternative:response?.standard;
  if(!chosen?.is_driving_route)return;
  if(key==='alternate'&&sameRoadCoordinates(response.standard,response.alternative))return;
  if(state.navFollowId!==null){$('route-choice-status').textContent='Stop safely before switching active road routes.';return;}
  if(state.navChoiceSelection===key)return;
  const remembered=response;
  const report=key==='alternate'?remembered.alternative_cameras:remembered.standard_cameras;
  setNavigationRoutePreview(chosen,report);
  state.navRouteChoices=remembered;state.navCameraComparison=remembered;
  state.navChoiceSelection=key;state.navChoicePanelClosed=false;
  $('map-directions-review').open=false; // Comparison chooser remains visible after selecting an alternate.
  renderRouteChoices();renderNavigationOverlay();
  setMapDestinationStatus(`${key==='alternate'?'Alternate':'Main'} road route selected. Start navigation when ready. Camera and road access information may be incomplete.`);
}
$('route-choice-standard').addEventListener('click',()=>chooseRouteChoice('standard'));
$('route-choice-alternate').addEventListener('click',()=>chooseRouteChoice('alternate'));
function startSelectedRouteNavigation(){
  // The selected comparison route is installed as navPreview by
  // chooseRouteChoice(). Reuse the existing opt-in GPS-follow safety gate.
  if(state.navFollowId!==null)return;
  if(state.navPreview?.type!=='ROAD_ROUTE' || state.navPreview?.is_driving_route!==true || $('map-begin-guidance').disabled){
    $('route-choice-status').textContent='A valid Valhalla road route is required. Get directions again before starting.';
    return;
  }
  $('map-begin-guidance').click();
}
$('route-choice-start').addEventListener('click',startSelectedRouteNavigation);
function discardChosenRoute(){
  // X means discard the entire current trip, not merely hide the route cards.
  // Invalidate in-flight comparisons/routes and clear every temporary pin,
  // direction, route line and editable trip point. Saved destinations and
  // browser-local avoidance preferences are deliberately untouched.
  resetRouteForNewDestination();
  state.navPickedPoint=null;
  state.navPickedOrigin=null;
  state.navSelectedAddress=null;
  state.navOriginManual=false;
  state.navSearchToken++;
  state.navPicking=false;state.navPickKind='destination';
  for(const id of ['map-destination-query','nav-dest-query','nav-dest-name','nav-dest-lat','nav-dest-lon',
    'map-origin-query','nav-start-query','nav-start-lat','nav-start-lon'])$(id).value='';
  hideMapAddressMatches();
  syncMapOriginSummary();syncDestinationPickMode();syncMapPickedAction();
  $('map-destination-status').hidden=true;
  $('map-router-result').textContent='';
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  setNavigationStatus('Route cleared. Choose a new destination to get directions.');
  renderNavigationOverlay();
  setMapSearchCollapsed(false);
}
$('route-choice-close').addEventListener('click',discardChosenRoute);
$('route-choice-settings').addEventListener('click',()=>cameraPanelVisibility(true));
$('map-navigation-options').addEventListener('toggle',()=>{if(state.navRouteChoices)renderRouteChoices();});
$('map-directions-review').addEventListener('toggle',()=>{if(state.navRouteChoices)renderRouteChoices();});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(positionRouteChoicePanel).observe($('map-directions-review'));
window.addEventListener('resize',positionRouteChoicePanel);
$('navigation-preview-overlay').addEventListener('click',event=>{
  const hit=event.target.closest?.('path.route-hit');
  if(hit){event.preventDefault();event.stopPropagation();chooseRouteChoice(hit.dataset.choice);}
});

function showCameraComparison(response){
  if(response.alternative && sameRoadCoordinates(response.standard,response.alternative)){
    response={...response,alternative:null,alternative_cameras:null,
      detail:'Valhalla returned the same road geometry for both choices. Only the main route is available.'};
  }
  const status=$('map-camera-comparison-status');
  if(!response.alternative){
    status.textContent=response.detail||'No alternative was found; the normal road route remains selected.';
    state.navRouteChoices=response;state.navChoiceSelection='standard';state.navChoicePanelClosed=false;renderRouteChoices();return;
  }
  const a=response.alternative,b=response.standard;
  const delta=(a.distance_miles-b.distance_miles).toFixed(1);
  const minuteDiff=Math.round((a.duration_seconds-b.duration_seconds)/60);
  status.textContent=`Normal: ${routeChoiceCameraCount(response.standard_cameras)}, ${b.distance_miles} mi. Alternative: ${routeChoiceCameraCount(response.alternative_cameras)}, ${a.distance_miles} mi (${Number(delta)>=0?'+':''}${delta} mi), ${minuteDiff>=0?'+':''}${minuteDiff} min. ${response.detail}`;
  state.navCameraComparison=response;
  state.navRouteChoices=response;state.navChoiceSelection='standard';state.navChoicePanelClosed=false;
  $('map-directions-review').open=false; // Two genuine choices need the chooser, not an expanded single-route sheet.
  renderRouteChoices();renderNavigationOverlay();
  const better=response.alternative_cameras?.incomplete!==true && response.alternative_cameras?.count < response.standard_cameras?.count;
  $('map-use-camera-alternate').hidden=!better;
  if(!better)status.textContent+=' This alternative does not reduce the current potential-encounter estimate; it remains an optional road choice, not a safer route.';
}
async function compareVisibleCameraRoutes(initial,types){
  if(!initial?.is_driving_route) return;
  if(state.navRoadPrefsDirty){$('map-camera-comparison-status').textContent='Get directions again to apply changed road preferences before comparing.';return;}
  const button=$('map-compare-camera-routes');const status=$('map-camera-comparison-status');
  if(!types.length){status.textContent='Select at least one camera category.';return;}
  const points=[initial.origin,...(initial.stops||[]),initial.destination].map(p=>({latitude:p[1],longitude:p[0]}));
  const token=++state.navCameraRouteEpoch;
  button.disabled=true;status.textContent=$('route-camera-priority').value==='maximum'?
    'Maximum camera avoidance: evaluating up to four local Valhalla exclusion routes. This may take longer…':
    'Comparing local road routes with the saved camera catalog…';
  $('map-use-camera-alternate').hidden=true;state.navCameraComparison=null;
  try{
    const response=await api('/api/navigation/camera-comparison','POST',{locations:points,types,options:routeRequestOptions(),mode:$('route-camera-priority').value});
    if(token!==state.navCameraRouteEpoch || state.navPreview!==initial || selectedRouteCameraTypes().join(',')!==types.join(','))return;
    showCameraComparison(response);
  }catch(error){if(token===state.navCameraRouteEpoch && state.navPreview===initial){
    status.textContent=`Comparison unavailable: ${error.message}. Normal route unchanged.`;
    state.navRouteChoices={standard:initial,standard_cameras:state.navCameraReport,detail:status.textContent};
    state.navChoiceSelection='standard';state.navChoicePanelClosed=false;renderRouteChoices();
  }}
  finally{if(token===state.navCameraRouteEpoch)button.disabled=false;}
}
$('map-compare-camera-routes').addEventListener('click',()=>compareVisibleCameraRoutes(state.navPreview,selectedRouteCameraTypes()));
function invalidateCameraComparison(){
  state.navCameraRouteEpoch++;state.navCameraComparison=null;state.navRouteChoices=null;$('map-route-choices').hidden=true;renderNavigationOverlay();
  $('map-use-camera-alternate').hidden=true;
  $('map-camera-comparison-status').textContent='Preferences updated. Choose Compare routes, or Get directions for a new route. Current route unchanged.';
  updateCameraRoutePreferenceDisplay();
}
for(const box of document.querySelectorAll('[data-route-camera-type]'))box.addEventListener('change',()=>{syncRouteCameraPrefs();onRoutePreferencesChanged();});
$('route-camera-priority').addEventListener('change',()=>{syncRouteCameraPrefs();onRoutePreferencesChanged();});
$('map-camera-route-enable').addEventListener('change',invalidateCameraComparison);
$('map-use-camera-alternate').addEventListener('click',()=>chooseRouteChoice('alternate'));

function setNavigationRoutePreview(result,cameraReport=null) {
  stopNavigationFollow();
  state.navCameraRouteEpoch++;
  $('map-begin-guidance').disabled=!(result?.type==='ROAD_ROUTE' && result.is_driving_route===true);
  syncMapPickedAction();
  state.navPreview=result;
  renderDirectionsReview(result);
  showRouteCameras(cameraReport);
  syncMapPickedAction(); // Destination popup must not obscure route options after Get directions.
  state.navFitPending=true;
  applyNavigationFit();
  setTimeout(applyNavigationFit,120);
  renderNavigationOverlay();
}
async function planRoadRoute(points,{preserveCurrentOnFailure=false,travelMode='auto'}={}) {
  const destinationEpoch=state.navDestinationEpoch||0;
  setMapDestinationStatus(travelMode==='pedestrian'?'Requesting local walking-path route…':'Getting directions from local Valhalla…');
  try {
    const data=await api('/api/navigation/route','POST',{
      locations:points.map(p=>({latitude:p[1],longitude:p[0]})),
      options:travelMode==='pedestrian'?{travel_mode:'pedestrian'}:routeRequestOptions()});
    if(destinationEpoch !== (state.navDestinationEpoch||0))
      return {road:null,cancelled:true,text:'An earlier route request was discarded after the destination changed.'};
    const road=data.route;
    if (!road || road.type!=='ROAD_ROUTE' || (travelMode==='auto' && road.is_driving_route!==true) ||
        (travelMode==='pedestrian' && road.travel_mode!=='pedestrian')) throw Error('No matching local route returned.');
    if(preserveCurrentOnFailure && !routeGuide.hasCompleteDirections(road)) throw Error('Valhalla did not return a complete destination/turn list for this road exclusion. The original route was preserved.');
    setNavigationRoutePreview(road,data.camera_report);
    state.navRoadPrefsDirty=false;
    $('map-compare-camera-routes').disabled=travelMode==='pedestrian';
    // One explicit opt-in enables automatic comparison after Get directions.
    // The normal route remains selected until the user chooses the alternative.
    if(travelMode==='auto' && updateCameraRoutePreferenceDisplay()){
      cameraPanelVisibility(false);
      compareVisibleCameraRoutes(road,selectedRouteCameraTypes());
    } else {
      cameraPanelVisibility(false);
    }
    const steps=(road.maneuvers||[]).slice(0,80);
    $('nav-directions').innerHTML=steps.length ? '<h4>Planned turns · no active guidance</h4><ol>'+
      steps.map(step=>`<li>${escapeHTML(step.instruction)} <small>(${Number(step.length_miles||0).toFixed(2)} mi)</small></li>`).join('')+'</ol>' : '';
    const minutes=Math.round(road.duration_seconds/60);
    return {road, text:travelMode==='pedestrian'?
      `Walking plan · ${road.distance_miles} mi · ~${minutes} min. Local Valhalla path data only; trail access/conditions are NOT verified. Tap Start walking navigation to follow fresh GPS positions when ready.`:
      `Road plan · ${road.distance_miles} mi · ~${minutes} min (no traffic). Camera routes and Directions are on the map; start GPS follow when ready.`};
  } catch (err) {
    if(destinationEpoch !== (state.navDestinationEpoch||0))
      return {road:null,cancelled:true,text:'An earlier route request was discarded after the destination changed.'};
    if(preserveCurrentOnFailure && state.navPreview?.is_driving_route){
      return {road:null,preserved:true,text:`Road avoidance could not produce complete new directions: ${err.message}. Your original road route and all its steps are unchanged. Remove this exclusion in Route preferences or try another road.`};
    }
    const first=points[0], last=points[points.length-1];
    $('nav-directions').replaceChildren();
    const direct=navGeometry.preview(first,last);
    if(direct.distance_km>150){
      // A national road route cannot be inferred from the small installed
      // Northern California Valhalla graph. Show an error, never an interstate
      // line that a driver could mistake for a suggested route.
      stopNavigationFollow();
      state.navPreview=null;if(typeof renderDirectionsReview==='function')renderDirectionsReview(null);state.navFitPending=false;
      $('map-begin-guidance').disabled=true;
      renderNavigationOverlay();
      return {road:null,text:travelMode==='pedestrian'?
        `No walking route for this destination: ${err.message} The installed local Valhalla graph may not contain these paths. No walking route was drawn.`:
        `No drivable road route for this destination: ${err.message} The installed local road graph may cover only Northern California. Add regional/nationwide Valhalla data before routing across the U.S.; no route was drawn.`};
    }
    // Short-distance geographic reference only, never driveable guidance.
    direct.coordinates=points;
    direct.stops=points.slice(1,-1);
    setNavigationRoutePreview(direct);
    return {road:null,text:travelMode==='pedestrian'?
      `Walking routing unavailable: ${err.message} Direct-line reference only — not a walkable path. Do not follow this line.`:
      `Road routing unavailable: ${err.message} Direct-line reference only — do not drive along this line.`};
  }
}
// Explicit return-to-start planning from a saved, historical browser track.
// This asks Valhalla for a NEW route; it does not infer traversability from
// the breadcrumb line or silently start GPS follow/recording.
if(typeof window!=='undefined')window.OpenRFPlanReturnToStart=async function(startCoordinates,travelMode){
  const mode=travelMode==='auto'?'auto':travelMode==='pedestrian'?'pedestrian':null;
  if(!mode || !Array.isArray(startCoordinates) || startCoordinates.length!==2 ||
    !Number.isFinite(startCoordinates[0]) || !Number.isFinite(startCoordinates[1]) ||
    Math.abs(startCoordinates[0])>180 || Math.abs(startCoordinates[1])>90)
    throw Error('Invalid recorded start or travel mode');
  if(!navigator.geolocation?.getCurrentPosition)
    throw Error('A fresh browser GPS fix is required; it is unavailable on this device');
  const epoch=state.navDestinationEpoch||0;
  const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,
    {enableHighAccuracy:true,maximumAge:0,timeout:16000}));
  const {latitude,longitude,accuracy}=pos.coords||{};
  const age=(Date.now()-pos.timestamp)/1000;
  if(![latitude,longitude,accuracy,age].every(Number.isFinite) || Math.abs(latitude)>90 ||
    Math.abs(longitude)>180 || accuracy<0 || accuracy>100 || age< -5 || age>15)
    throw Error('A fresh, sufficiently accurate GPS fix (within 15s and ±100m) is needed to route to start');
  if(epoch!==(state.navDestinationEpoch||0))throw Error('Destination changed while getting your current GPS fix; please retry');
  setMapTravelMode(mode);
  const result=await planRoadRoute([[longitude,latitude],startCoordinates],{travelMode:mode});
  if(result.cancelled)throw Error('Destination changed during routing; please retry');
  if(!result.road)throw Error(`${result.text} No navigable return route was found.`);
  closeMapToolOverlay();
  const message=`NEW ${mode==='auto'?'driving':'walking'} route to your recorded start. It may differ from your recorded track. ${mode==='auto'?'Tap Start navigation':'Tap Start walking navigation'} to follow actual GPS when ready; check current access and conditions.`;
  setMapDestinationStatus(message);
  return message;
};
async function freshNavigationOrigin() {
  if (state.navOriginManual){
    const typed=$('nav-start-query').value.trim();
    return typed ? (await resolveTypedPlace(typed)).coordinates : navigationInputPoint('nav-start');
  }
  try { return locationForQuickPreview(); }
  catch (error) {
    if (!navigator.geolocation) throw error;
  }
  setMapDestinationStatus('Getting a fresh browser position for the starting point…');
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,
    {enableHighAccuracy:true,maximumAge:0,timeout:15000})).catch(err=>{
      throw Error(`Could not get starting location (${err.code===1?'permission denied':err.code===3?'timed out':'position unavailable'}). Choose From → Change in Where to? to set a starting point.`);
    });
  const {latitude,longitude,accuracy}=position.coords||{};
  const age=(Date.now()-position.timestamp)/1000;
  if (!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||
      !Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5||age>60) {
    throw Error('New browser position was invalid or stale. Choose From → Change in Where to? to set a starting point.');
  }
  state.browserLocation={lat:latitude,lon:longitude,accuracy,capturedAt:Date.now()};
  globalThis.window?.OpenRFMapElevation?.update(position);
  updateBrowserLocationMarker();
  return [longitude,latitude];
}
async function quickDestinationPreview(query,travelMode='auto') {
  const destinationEpoch=state.navDestinationEpoch||0;
  const chosen=await resolveTypedPlace(query);
  if(destinationEpoch !== (state.navDestinationEpoch||0)) return {cancelled:true};
  const origin=await freshNavigationOrigin();
  if(destinationEpoch !== (state.navDestinationEpoch||0)) return {cancelled:true};
  // Get directions commits a replacement only after we have a real resolved
  // point and usable origin. Opening or editing search cannot erase a route.
  if(state.navPreview || state.navRouteChoices || state.navCameraComparison)
    resetRouteForNewDestination();
  const routeEpoch=state.navDestinationEpoch||0;
  $('nav-dest-name').value=chosen.name;
  $('nav-dest-query').value=chosen.name;
  $('nav-dest-lat').value=chosen.coordinates[1];
  $('nav-dest-lon').value=chosen.coordinates[0];
  const planned=await planRoadRoute([origin,chosen.coordinates],{travelMode});
  if(planned.cancelled || routeEpoch !== (state.navDestinationEpoch||0)) return {cancelled:true};
  state.navPickedPoint=chosen.coordinates.slice(); // Also draggable for resolved street addresses and completed road routes.
  syncMapPickedAction();
  renderNavigationOverlay();
  setMapDestinationStatus(`${chosen.name} · ${planned.text}`, planned.road ? 'success' : 'error');
  $('nav-preview-summary').textContent=planned.text;
  if(planned.road) {
    setNavigationStatus(planned.text);
    // A complete Valhalla route replaces the destination-editing surface.
    // Keep search open on errors so the user can fix the destination.
    setMapSearchCollapsed(true);
  }
  return planned;
}
// Address autocomplete never uses the public Nominatim service.
// Clicking a result stores its exact coordinates; typing anything new invalidates it.
function hideMapAddressMatches() {
  const box=$('map-address-options');
  box.hidden=true;box.replaceChildren();
  $('map-destination-query').setAttribute('aria-expanded','false');
  $('map-destination-query').removeAttribute('aria-activedescendant');
}
function showMapAddressMatches(matches) {
  const box=$('map-address-options');
  box.replaceChildren();
  const seen=new Set();
  for(const match of matches) {
    if(box.querySelectorAll('.address-option').length>=8) break;
    if(!match || !match.name || (!match.streetCompletion && !Array.isArray(match.coordinates))) continue;
    const key=`${match.name.toLowerCase()}|${match.streetCompletion || match.coordinates.join(',')}`;
    if(seen.has(key)) continue;
    seen.add(key);
    const button=document.createElement('button');button.type='button';
    button.className='address-option';button.setAttribute('role','option');
    button.id=`map-address-option-${box.querySelectorAll('.address-option').length}`;
    button.setAttribute('aria-selected','false');
    button.textContent=match.name;
    button.addEventListener('click',()=>{
      // A suggestion represents a specific pinned location. Never silently
      // route to the first fuzzy candidate.
      state.navSearchToken++;
      if(navAddressTimer) clearTimeout(navAddressTimer);
      if(state.navPreview || state.navRouteChoices || state.navPickedPoint || state.navCameraComparison)
        resetRouteForNewDestination();
      state.navPickedPoint=null;
      syncMapPickedAction();
      renderNavigationOverlay();
      if (match.streetCompletion) {
        // A local street-name hint is NOT a geocoded street address. Only
        // populate the text, never bind a navigation coordinate to it.
        state.navSelectedAddress=null;
        $('map-destination-query').value=match.streetCompletion+', ';
        hideMapAddressMatches();
        $('map-destination-query').focus();
        setMapDestinationStatus('Regional street name completed from offline map data. The house number is NOT verified. Finish city and state, then select a real address match before routing.');
        return;
      }
      state.navSelectedAddress=match;
      navAddressCache.set(match.name,match);
      $('map-destination-query').value=match.name;
      hideMapAddressMatches();
      setMapDestinationStatus(match.source==='us-census-opt-in' ?
        'Approximate Census address-range location selected. Check the map pin and press Get directions.' :
        'Destination selected. Press Get directions to calculate a road route.');
    });
    box.append(button);
  }
  if(box.querySelector('.address-option') && state.navSearchCredit){
    const credit=document.createElement('div');
    credit.className='address-attribution';
    credit.textContent=`Search source: ${state.navSearchCredit}`;
    box.append(credit);
  }
  box.hidden=!box.querySelector('.address-option');
  $('map-destination-query').setAttribute('aria-expanded',String(!box.hidden));
}
function navigationSuggestionDelay(provider, query) {
  // Public Photon is best effort and rate-limited. Dedicated/local providers
  // can respond more quickly. Census only matches complete U.S. addresses.
  if(provider?.local_photon || provider?.maptiler_configured) return 450;
  return /^\d{1,8}[A-Za-z]?\s+[^,]+,\s*[^,]+,\s*[A-Za-z]{2}/.test(query) ? 850 : 1450;
}
function navigationLookupIsComplete(query) {
  // Do not trigger Census for a house number or partial city. This is only a
  // client-side hint; the backend validates again before contacting Census.
  const parts=query.split(',').map(x=>x.trim());
  return parts.length>=3 && /^\d{1,8}[A-Za-z]?\s+\S+/.test(parts[0]) &&
    parts[1].length>=2 && /^[A-Za-z]{2}(?:\s+\d{0,5})?$/.test(parts[2]);
}
let navAddressTimer=null;
$('map-destination-query').addEventListener('input',()=>{
  // Typing is only a draft; keep the old route until the user actually picks
  // a new destination or commits a fresh route request.
  state.navSelectedAddress=null;
  state.navSearchCredit='';state.navStreetMatches=[];
  const q=$('map-destination-query').value.trim(), token=++state.navSearchToken;
  hideMapAddressMatches();
  if(navAddressTimer) clearTimeout(navAddressTimer);
  if(navigationTypedCoordinates(q)) {
    setMapDestinationStatus('Coordinates ready. Press Get directions to route locally; no address lookup is needed.');
    return;
  }
  if(q.length<3) return;
  // Saved destinations are available immediately, even offline or when
  // an external geocoder is broken. Address lookup itself is debounced.
  const local=state.navDestinations.filter(d=>d.name.toLowerCase().includes(q.toLowerCase())).slice(0,5)
    .map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
  if(local.length) showMapAddressMatches(local);
  // Network-free street-name hints come from the actual bundled regional
  // OSM vector tiles. They help finish typing but NEVER provide an address
  // point or validate a house number.
  if (/^\d{3,8}[A-Za-z]?\s+[A-Za-z]{2,}/.test(q) && !q.includes(',')) {
    setTimeout(async()=>{
      try {
        const reply=await api(`/api/vector/streets?q=${encodeURIComponent(q)}`);
        if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
        const names=(reply.results||[]).map(r=>({name:r.label,streetCompletion:r.completion,source:'local-street-name-only'}));
        if(names.length){
          state.navStreetMatches=names;
          showMapAddressMatches([...local,...names]);
          setMapDestinationStatus('Local street-name suggestions available. House numbers are not verified; finish city/state to locate the actual address.');
        }
      } catch(e) { /* Optional local index must never block remote geocoding. */ }
    },240);
  }
  const consent=$('map-online-address').checked;
  const localPhoton=addressProviderInfo?.local_photon;
  if(!consent && !localPhoton) return;
  // Without a dedicated typeahead provider, don't hammer public Photon with
  // unfinished house-number strings. Census can match only after city/state.
  if(!localPhoton && !addressProviderInfo?.maptiler_configured && /^\d{1,8}[A-Za-z]?\s/.test(q) &&
     !navigationLookupIsComplete(q)) {
    if(!local.length && !state.navStreetMatches?.length) setMapDestinationStatus('Finish the street, city and state (for example: 25005 State Hwy 88, Pioneer, CA) for an automatic Census match. Earlier suggestions need MapTiler or local Photon.');
    return;
  }
  if(!local.length && navigationLookupIsComplete(q) && !addressProviderInfo?.maptiler_configured && !localPhoton) {
    setMapDestinationStatus('Checking the completed U.S. street address automatically (Census address-range lookup)…');
  }
  navAddressTimer=setTimeout(async()=>{
    try {
      // mode=auto permits an explicitly consented Census match for complete
      // addresses BEFORE Start navigation. It never submits partial text to Census.
      const reply=await api(addressLookupUrl(q,false,true));
      if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
      state.navSearchCredit=reply.attribution||reply.provider||'';
      const remote=(reply.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude],source:d.source,accuracy_note:d.accuracy_note}));
      showMapAddressMatches([...local,...(state.navStreetMatches||[]),...remote]);
      if(remote.length) {
        setMapDestinationStatus(`${remote.length} U.S. suggestion(s). Select the correct address, then Start navigation.`);
      } else if(!local.length && navigationLookupIsComplete(q)) {
        setMapDestinationStatus('No address match yet. Check house number, street, city and state, or choose a map point.');
      }
    } catch(error) {
      if(token!==state.navSearchToken || $('map-destination-query').value.trim()!==q) return;
      if(local.length) return;
      const completed=navigationLookupIsComplete(q);
      setMapDestinationStatus(completed ?
        `Automatic address lookup is unavailable: ${error.message} Try Start navigation for a final Census lookup, or choose a point on the map.` :
        `${error.message} You can still choose a point on the map, use a saved destination, or switch to local Photon.`, 'error');
    }
  }, navigationSuggestionDelay(addressProviderInfo,q));
});
$('map-destination-query').addEventListener('keydown',event=>{
  const box=$('map-address-options');
  if(box.hidden) return;
  const buttons=[...box.querySelectorAll('.address-option')];
  if(!buttons.length) return;
  let index=buttons.findIndex(b=>b.getAttribute('aria-selected')==='true');
  if(event.key==='ArrowDown' || event.key==='ArrowUp') {
    event.preventDefault();
    index=event.key==='ArrowDown' ? (index+1)%buttons.length : (index<=0 ? buttons.length-1 : index-1);
    buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));
    $('map-destination-query').setAttribute('aria-activedescendant',buttons[index].id);
    buttons[index].scrollIntoView?.({block:'nearest'});
  } else if(event.key==='Enter') {
    event.preventDefault();
    buttons[index>=0?index:0].click();
  } else if(event.key==='Escape') {
    event.preventDefault(); hideMapAddressMatches();
  }
});
$('map-destination-query').addEventListener('blur',()=>setTimeout(hideMapAddressMatches,175));
$('map-destination-query').addEventListener('focus',()=>{
  const q=$('map-destination-query').value.trim();
  // A synthetic input event on focus previously cleared the existing route
  // and sent map-picked coordinates to MapTiler, producing HTTP 400.
  if(q.length>=3 && !state.navPreview && !state.navSelectedAddress && !navigationTypedCoordinates(q))
    $('map-destination-query').dispatchEvent(new Event('input'));
});
$('map-online-address').addEventListener('change',()=>{
  // Explicit preference persists locally on this browser; no external request is made until typing.
  try {window.localStorage?.setItem('openrf-address-online',$('map-online-address').checked?'on':'off');} catch (_) { /* private mode may disallow storage */ }
  state.navSearchToken++;
  if(navAddressTimer) clearTimeout(navAddressTimer);
  hideMapAddressMatches();
  const enabled=$('map-online-address').checked;
  const named=addressProviderInfo?.maptiler_configured ? 'MapTiler' : 'the public Photon demo';
  setMapDestinationStatus(enabled ?
    `Online U.S. search enabled using ${named}. Address text leaves this device; GPS isn't sent. Select a suggestion before starting.` :
    'Online address lookup off. Saved places, coordinates, and choosing a map point still work.');
  if ($('map-destination-query').value.trim().length>=3) $('map-destination-query').dispatchEvent(new Event('input'));
});


// Place all three lower-right sheets in the same free map rectangle: beneath
// the top Where to? / hamburger row, left of the right-hand map controls,
// above the bottom gear/plus/layers buttons. Keep scrolling inside each sheet.
function alignBottomMapPopup(popup){
  const map=$('page-map').querySelector('.map-wrap');
  const rect=map.getBoundingClientRect();
  const width=Math.min(360,Math.max(180,rect.width-78),Math.max(180,window.innerWidth-16));
  const left=Math.max(8,Math.min(Math.round(rect.right-56-width),Math.round(window.innerWidth-width-8)));
  const top=Math.max(8,Math.min(Math.round(rect.top+60),Math.round(window.innerHeight-155)));
  const bottom=Math.min(window.innerHeight-8,Math.round(rect.bottom-52));
  const height=Math.max(100,Math.round(bottom-top));
  popup.style.setProperty('--openrf-map-popup-left',`${left}px`);
  popup.style.setProperty('--openrf-map-popup-top',`${top}px`);
  popup.style.setProperty('--openrf-map-popup-width',`${width}px`);
  popup.style.setProperty('--openrf-map-popup-height',`${height}px`);
}
// The gear's trigger stays fixed in the bottom-right row; only its sheet moves.
function alignMapSettingsPopup(){
  const details=$('map-navigation-options');
  if(!details.open)return;
  const popup=details.querySelector('.map-settings-popup');
  alignBottomMapPopup(popup);
}
$('map-navigation-options').addEventListener('toggle',()=>{
  if($('map-navigation-options').open){
    setMapSurveyOpen(false);
    if(activeMapTool)closeMapToolOverlay();
  }
  alignMapSettingsPopup();
});
function realignBottomMapPopups(){
  alignMapSettingsPopup();
  if(!$('map-survey-panel').hidden)alignBottomMapPopup($('map-survey-panel'));
  if($('observation-dialog').open && $('observation-dialog').classList.contains('map-observation-popup'))
    alignBottomMapPopup($('observation-dialog'));
}
window.addEventListener('resize',realignBottomMapPopups);
window.addEventListener('scroll',realignBottomMapPopups,true);
$('map-settings-close').addEventListener('click',()=>{
  $('map-navigation-options').open=false;
  $('map-navigation-options').querySelector('summary').focus();
});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape' && $('map-navigation-options').open){
    $('map-navigation-options').open=false;
    $('map-navigation-options').querySelector('summary').focus();
  }
});

// Reuse the same opt-in address provider for trip start, stops, and destination.
function wireTripAddressField(input) {
  const parent=input.parentElement;
  parent.classList.add('nav-address-host');
  const options=document.createElement('div');
  options.className='address-suggestions nav-trip-suggestions';
  options.id=`${input.id}-options`;
  options.hidden=true;options.setAttribute('role','listbox');
  parent.append(options);
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls',options.id);
  input.setAttribute('aria-expanded','false');
  const isOriginField=input.id==='nav-start-query'||input.id==='map-origin-query';
  let timer=null, requestIndex=0;
  input.addEventListener('input',()=>{
    const text=input.value.trim(), id=++requestIndex;
    if(isOriginField){
      const other=$(input.id==='nav-start-query'?'map-origin-query':'nav-start-query');
      if(other.value!==input.value)other.value=input.value;
      state.navOriginManual=Boolean(text);
      state.navPickedOrigin=null;
      if(state.navPreview || state.navRouteChoices || state.navCameraComparison)resetRouteForNewDestination();
      $('nav-origin-status').textContent=text ?
        'Custom starting address entered. Choose a suggestion or use coordinates; Get directions will resolve this place.' :
        'Starting point reset to your browser location (when available).';
      syncMapOriginSummary();
      renderNavigationOverlay();
    }
    options.hidden=true; options.replaceChildren();input.setAttribute('aria-expanded','false');
    if(timer) clearTimeout(timer);
    if(text.length<3) return;
    timer=setTimeout(async()=>{
      const local=state.navDestinations.filter(d=>d.name.toLowerCase().includes(text.toLowerCase())).slice(0,5)
        .map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
      let fromGeocoder=[];
      if($('map-online-address').checked || addressProviderInfo?.local_photon) {
        try {
          const response=await api(addressLookupUrl(text,false,true));
          fromGeocoder=(response.results||[]).map(d=>({name:d.name,coordinates:[d.longitude,d.latitude]}));
        } catch(error) {
          if(id===requestIndex && !local.length) setNavigationStatus(error.message);
        }
      }
      if(id!==requestIndex) return;
      for(const match of [...local,...fromGeocoder].slice(0,7)) {
        const btn=document.createElement('button');
        btn.type='button';btn.className='address-option';btn.setAttribute('role','option');
        btn.textContent=match.name;
        btn.addEventListener('click',()=>{
          input.value=match.name;
          navAddressCache.set(match.name,match);
          options.hidden=true;options.replaceChildren();input.setAttribute('aria-expanded','false');
          if(isOriginField){
            const other=$(input.id==='nav-start-query'?'map-origin-query':'nav-start-query');
            other.value=match.name;
            state.navOriginManual=true;
            state.navPickedOrigin=null;
            syncMapOriginSummary();
          }
        });
        options.append(btn);
      }
      options.hidden=!options.children.length;
      input.setAttribute('aria-expanded',String(!options.hidden));
    },navigationSuggestionDelay(addressProviderInfo,text));
  });
  input.addEventListener('blur',()=>setTimeout(()=>{options.hidden=true;input.setAttribute('aria-expanded','false');},180));
}
for(const id of ['nav-start-query','nav-dest-query','map-origin-query']) wireTripAddressField($(id));
syncMapOriginSummary();

// v0.2.30: explicit one-tap map destination selection. Normal map panning
// resumes after one accepted tap; MapLibre and raster fallback share the same
// screen-to-coordinate conversion, independent of the browser GPS marker.
function syncDestinationPickMode() {
  const originPicking=state.navPicking && state.navPickKind==='origin';
  $('map').classList.toggle('destination-picking', state.navPicking);
  $('map').parentElement.classList.toggle('destination-pick-active', state.navPicking);
  state.map?.__openrfRefreshClickableCursor?.();
  for (const id of ['nav-pick-map','map-pick-destination']) {
    $(id).setAttribute('aria-pressed', String(state.navPicking && !originPicking));
  }
  $('nav-pick-start-map').setAttribute('aria-pressed',String(originPicking));
  $('map-origin-pick').setAttribute('aria-pressed',String(originPicking));
  const map=state.map;
  if (state.navPicking && map?.dragPan) {
    // Re-entry must always disable pan, even if a stale prior pick saved
    // restoration state for the same MapLibre instance.
    if (state.navPickPanRestore?.map !== map)
      state.navPickPanRestore={map, pan:!!map.dragPan.isEnabled()};
    map.dragPan.disable();
  } else if (!state.navPicking && state.navPickPanRestore) {
    const restore=state.navPickPanRestore;
    state.navPickPanRestore=null;
    if (restore.map===map && restore.pan) map.dragPan.enable();
  }
}
function destinationPickIgnoresTarget(target) {
  // Exclude interactive controls, but accept MapLibre's canvas, GPS marker,
  // and SVG route overlays. Both pointerup and click use this exact filter.
  return Boolean(target.closest?.('button,a,input,select,textarea,summary,.map-destination-panel,.map-picked-action,.map-camera-route-review,.camera-route-review,.map-route-choices,.map-tool-overlay,.map-tool-rail,.map-navigation-settings,.map-follow-hud,.maplibregl-ctrl,.raster-control,.map-credits,.map-error,.raster-notice'));
}
function handleDestinationMapClick(event) {
  if (!state.navPicking || (event.button !== undefined && event.button !== 0)) return;
  if (destinationPickIgnoresTarget(event.target)) return;
  const root=$('map'), rect=root.getBoundingClientRect();
  const x=event.clientX-rect.left, y=event.clientY-rect.top;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>rect.width || y>rect.height) return;
  let lon, lat;
  if (state.map && state.mapReady) {
    const pos=state.map.unproject([x,y]);lon=pos.lng;lat=pos.lat;
  } else if (state.rasterMap) {
    const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
    [lon,lat]=pixelWorld(center[0]+x-rect.width/2,center[1]+y-rect.height/2,state.rasterMap.zoom);
  } else return;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90) return;
  // Capture even taps on the blue GPS dot or survey pins: they must never
  // substitute the observer position or trigger a popup / observation here.
  event.preventDefault();event.stopImmediatePropagation();
  consumeNavigationPick(lon,lat);
}
// Pointerup capture handles third and later destinations even if a map
// engine or overlay consumes the eventual synthetic click. A click fallback
// remains for keyboard or browsers without PointerEvent support. Ignore
// drags to avoid placing a point while someone is moving the map.
const destinationMapSurface=$('map').parentElement;
destinationMapSurface.addEventListener('pointerdown',event=>{
  if (!state.navPicking || event.isPrimary===false || (event.button!==undefined && event.button!==0) || destinationPickIgnoresTarget(event.target)){
    state.navPickPointerStart=null;return;
  }
  state.navPickPointerStart={id:event.pointerId,x:event.clientX,y:event.clientY};
},true);
destinationMapSurface.addEventListener('pointercancel',()=>{state.navPickPointerStart=null;},true);
destinationMapSurface.addEventListener('pointerup',event=>{
  if (!state.navPicking || event.isPrimary===false || destinationPickIgnoresTarget(event.target))return;
  const start=state.navPickPointerStart;state.navPickPointerStart=null;
  if (!start || start.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>9){
    // A release after dragging sometimes synthesizes a click. Do not treat
    // that click as a tap-to-select destination.
    state.navPickSwallowClickUntil=Date.now()+600;
    return;
  }
  const wasPicking=state.navPicking;
  handleDestinationMapClick(event);
  if(wasPicking && !state.navPicking){
    // The click event following this pointerup must not open a map
    // observation or trigger a route hit after a destination was placed.
    state.navPickSwallowClickUntil=Date.now()+600;
  }
},true);
destinationMapSurface.addEventListener('click',event=>{
  if(state.navPickSwallowClickUntil>Date.now() && !destinationPickIgnoresTarget(event.target)){
    state.navPickSwallowClickUntil=0;event.preventDefault();event.stopImmediatePropagation();return;
  }
  handleDestinationMapClick(event);
},true);
window.addEventListener('keydown',event=>{
  if (event.key==='Escape' && state.navPicking) {
    const wasOrigin=state.navPickKind==='origin';
    const reopenQuick=wasOrigin&&state.navOriginPickReturnToSearch;
    event.preventDefault();state.navPicking=false;state.navPickKind='destination';syncDestinationPickMode();
    state.navOriginPickReturnToSearch=false;
    renderNavigationOverlay();setMapDestinationStatus(wasOrigin?'Starting-point selection cancelled.':'Map destination selection cancelled.');
    if(reopenQuick){setMapSearchCollapsed(false);setMapOriginEditor(true,true);syncMapPickedAction();}
  }
});

function consumeNavigationPick(lon,lat) {
  if (!state.navPicking) return false;
  state.navPickPointerStart=null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90) return false;
  const pickingOrigin=state.navPickKind==='origin';
  if(state.navRouteChoices || state.navPreview || state.navCameraComparison) resetRouteForNewDestination();
  state.navPicking = false;
  state.navPickKind='destination';
  if(pickingOrigin){
    // The start is the operator-selected point, not the blue browser GPS dot.
    // Preserve any already selected destination while invalidating old routes.
    state.navOriginManual=true;
    state.navPickedOrigin=[lon,lat];
    $('nav-start-lat').value=lat.toFixed(7);
    $('nav-start-lon').value=lon.toFixed(7);
    $('nav-start-query').value=`${lat.toFixed(7)}, ${lon.toFixed(7)}`;
    $('nav-origin-status').textContent=`Map-selected starting point: ${lat.toFixed(5)}, ${lon.toFixed(5)}. Use fresh browser location to restore the default.`;
    if(typeof syncMapOriginSummary==='function')syncMapOriginSummary();
    syncDestinationPickMode();
    if(typeof syncMapPickedAction==='function')syncMapPickedAction();
    setMapDestinationStatus('Starting point selected on the map. Choose a destination, then Get directions.');
    setNavigationStatus('Starting point changed. A new road route requires local Valhalla; no location was saved.');
    renderNavigationOverlay();
    if(state.navOriginPickReturnToSearch){
      state.navOriginPickReturnToSearch=false;
      setMapSearchCollapsed(false);
      setMapOriginEditor(false);
      syncMapPickedAction();
    }
    return true;
  }
  state.navPickedPoint = [lon,lat];
  syncDestinationPickMode();
  $('nav-dest-lat').value = lat.toFixed(7);
  $('nav-dest-lon').value = lon.toFixed(7);
  $('map-destination-query').value = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
  $('nav-dest-query').value=$('map-destination-query').value;
  state.navSelectedAddress=null;
  if (typeof syncMapPickedAction === 'function') syncMapPickedAction();
  setMapDestinationStatus('Destination placed. Drag the red pin to fine-tune, then choose Get directions.');
  setNavigationStatus('Map selection filled destination coordinates. Get directions requests local Valhalla road routing when available.');
  renderNavigationOverlay();
  return true;
}
// Tap once to drop a destination, then drag its pin to fine-tune without
// entering selection mode or disabling ordinary map panning. Drag changes a
// destination only: no observation, waypoint, or GPS trail is recorded.
function destinationWorldPoint(clientX,clientY) {
  const rect=$('map').getBoundingClientRect();
  const x=clientX-rect.left,y=clientY-rect.top;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>rect.width || y>rect.height) return null;
  if (state.map && state.mapReady) {
    const lnglat=state.map.unproject([x,y]);return [lnglat.lng,lnglat.lat];
  }
  if (state.rasterMap) {
    const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
    return pixelWorld(center[0]+x-rect.width/2,center[1]+y-rect.height/2,state.rasterMap.zoom);
  }
  return null;
}
function updateDraggedDestination(clientX,clientY){
  const point=destinationWorldPoint(clientX,clientY);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0])>180 || Math.abs(point[1])>90) return false;
  if(!state.navPinDragging || state.navPreview || state.navRouteChoices)
    resetRouteForNewDestination();
  state.navPickedPoint=point;
  state.navSelectedAddress=null;
  $('map-destination-query').value=`${point[1].toFixed(7)}, ${point[0].toFixed(7)}`;
  $('nav-dest-query').value=$('map-destination-query').value;
  $('nav-dest-lat').value=point[1].toFixed(7);
  $('nav-dest-lon').value=point[0].toFixed(7);
  hideMapAddressMatches();
  if (typeof syncMapPickedAction === 'function') syncMapPickedAction();
  renderNavigationOverlay();
  return true;
}
const destinationDragOverlay=$('navigation-preview-overlay');
destinationDragOverlay.addEventListener('pointerdown',event=>{
  if (!state.navPickedPoint || !event.target.closest?.('.nav-draggable-pin')) return;
  if(event.pointerType==='mouse' && event.button!==0) return;
  event.preventDefault();event.stopPropagation();
  state.navPinDragging=true;
  destinationDragOverlay.setPointerCapture?.(event.pointerId);
});
destinationDragOverlay.addEventListener('pointermove',event=>{
  if (!state.navPinDragging) return;
  event.preventDefault();event.stopPropagation();
  updateDraggedDestination(event.clientX,event.clientY);
});
function finishDestinationDrag(event){
  if (!state.navPinDragging) return;
  event.preventDefault();event.stopPropagation();state.navPinDragging=false;
  state.navPinJustDraggedAt=Date.now();
  if(destinationDragOverlay.hasPointerCapture?.(event.pointerId)) destinationDragOverlay.releasePointerCapture(event.pointerId);
  setMapDestinationStatus('Destination pin adjusted. Press Get directions to recalculate the road route.');
}
destinationDragOverlay.addEventListener('pointerup',finishDestinationDrag);
destinationDragOverlay.addEventListener('pointercancel',finishDestinationDrag);
destinationDragOverlay.addEventListener('click',event=>{
  if(event.target.closest?.('.nav-draggable-pin')){event.stopPropagation();event.preventDefault();}
});
$('map').addEventListener('click',event=>{
  if(Date.now()-state.navPinJustDraggedAt<450){event.preventDefault();event.stopImmediatePropagation();}
},true);
// SVG is generated from calculated numbers only; no user text or HTML is inserted.
function destinationPinSVG(x,y){
  return `<g class="nav-draggable-pin" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" aria-label="Drag destination pin to adjust location">`+
    `<circle r="25" fill="#ef4444" opacity=".15"/>`+
    `<circle r="10" fill="#ee454b" stroke="#fff" stroke-width="3"/>`+
    `<circle r="28" fill="transparent" class="nav-drag-target"/>`+
    `</g>`;
}
function originPinSVG(x,y){
  return `<g class="nav-origin-pin" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" pointer-events="none" aria-label="Custom starting point">`+
    `<circle r="21" fill="#34c9b1" opacity=".15"/>`+
    `<circle r="9" fill="#34c9b1" stroke="#ffffff" stroke-width="2.5"/>`+
    `<circle r="3" fill="#093038"/></g>`;
}
function renderNavigationOverlay() {
  const overlay = $('navigation-preview-overlay');
  const label = $('navigation-preview-label');
  if (state.navPicking && !state.navPreview) {
    overlay.replaceChildren();
    label.textContent=state.navPickKind==='origin'?'TAP MAP TO CHOOSE STARTING POINT':'TAP MAP TO CHOOSE DESTINATION'; label.hidden=false;
    return;
  }
  const preview = state.navPreview;
  const picked = state.navPickedPoint;
  const pickedOrigin=state.navPickedOrigin;
  if ((!preview && !picked && !pickedOrigin) || (!state.mapReady && !state.rasterMap)) {
    overlay.replaceChildren(); label.hidden=true; return;
  }
  const map=$('map'), width=map.clientWidth, height=map.clientHeight;
  if (!width || !height) return;
  function project(coords) {
    if (state.map && state.mapReady) {
      const pt=state.map.project(coords);
      return [pt.x,pt.y];
    }
    if (state.rasterMap) {
      const center=worldPixel(state.rasterMap.center[0],state.rasterMap.center[1],state.rasterMap.zoom);
      const p=worldPixel(coords[0],coords[1],state.rasterMap.zoom);
      const size=256*(2**state.rasterMap.zoom);
      const dx=((p[0]-center[0]+size*1.5)%size)-size/2;
      return [width/2+dx, height/2+p[1]-center[1]];
    }
    return [NaN,NaN];
  }
  const points=preview ? (preview.type==='ROAD_ROUTE' && Array.isArray(preview.coordinates) ? preview.coordinates :
    (preview.coordinates || [preview.origin,...(preview.stops||[]),preview.destination])) : [picked||pickedOrigin];
  const projected=points.map(project);
  if(!projected.length || projected.some(pair=>pair.some(n=>!Number.isFinite(n)))) {overlay.replaceChildren();return;}
  overlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
  if (!preview) {
    const [x,y]=projected[0];
    // The teal starting marker is informational (not draggable). Keep the
    // original red draggable destination pin and ordinary map gestures.
    const originXY=pickedOrigin?project(pickedOrigin):null;
    const startMarkup=originXY&&originXY.every(Number.isFinite)?originPinSVG(...originXY):'';
    overlay.innerHTML=startMarkup+(picked?destinationPinSVG(x,y):'');
    label.textContent=state.navPicking ?
      (state.navPickKind==='origin'?'TAP MAP TO REPLACE STARTING POINT':'TAP MAP TO REPLACE DESTINATION') :
      (picked?'DESTINATION PLACED · DRAG RED PIN TO ADJUST':'STARTING POINT PLACED · CHOOSE A DESTINATION');
    label.hidden=false;return;
  }
  const path=projected.map((xy,i)=>`${i?'L':'M'} ${xy[0].toFixed(2)} ${xy[1].toFixed(2)}`).join(' ');
  let alternateSvg='';
  const choices=state.navRouteChoices;
  if(choices?.alternative?.coordinates && !state.navChoicePanelClosed && state.navFollowId===null){
    const otherKey=state.navChoiceSelection==='standard'?'alternate':'standard';
    const other=choices[otherKey];
    const different=other?.coordinates && !sameRoadCoordinates(other,preview);
    if(different){
      const pts=other.coordinates.map(project);
      if(pts.every(pair=>pair.every(Number.isFinite))){
        const d=pts.map((xy,i)=>`${i?'L':'M'} ${xy[0].toFixed(2)} ${xy[1].toFixed(2)}`).join(' ');
        alternateSvg=`<path class="alternate-route" d="${d}"/><path class="route-hit" data-choice="${otherKey}" d="${d}"/>`;
      }
    }
  }
  const last=projected[projected.length-1], first=projected[0];
  const road=preview.type==='ROAD_ROUTE' && preview.is_driving_route===true;
  const walking=preview.type==='ROAD_ROUTE' && preview.travel_mode==='pedestrian';
  overlay.innerHTML=alternateSvg+`<path class="${road?'road-route':walking?'walking-route':'direct-route'}" d="${path}" />`+
    `<circle cx="${first[0].toFixed(2)}" cy="${first[1].toFixed(2)}" r="6" fill="#44dec4"/>`+
    destinationPinSVG(last[0],last[1]);
  label.textContent=state.navPicking?(state.navPickKind==='origin'?'TAP MAP TO REPLACE STARTING POINT':'TAP MAP TO REPLACE DESTINATION'):
    (road?'VALHALLA ROAD DIRECTIONS · START GPS FOLLOW WHEN READY':walking?'VALHALLA WALKING PLAN · TRAILS UNVERIFIED':'DIRECT LINE · NOT A ROAD ROUTE');
  label.hidden=false;
}
async function refreshNavigationDestinations() {
  const reply=await api('/api/navigation/destinations');
  state.navDestinations=reply.destinations||[];
  $('map-destination-suggestions').replaceChildren(...state.navDestinations.map(d=>{
    const option=document.createElement('option');option.value=d.name;return option;
  }));
  const dest=$('nav-destination-list');
  dest.innerHTML=state.navDestinations.length ? state.navDestinations.map(d=>
    `<div class="nav-destination-entry"><strong>${escapeHTML(d.name)}</strong>`+
    `<p>${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)} · LOCAL destination, not an observation</p>`+
    `<div class="nav-button-row"><button type="button" class="btn mini outline" data-nav-use="${d.id}">Use</button>`+
    `<button type="button" class="btn mini danger-outline" data-nav-delete="${d.id}">Remove</button></div></div>`
  ).join('') : '<div class="empty">No destinations saved. Enter a location to save it locally.</div>';
}
function applyNavigationFit() {
  if (!state.navFitPending || !state.navPreview) return;
  const result=state.navPreview;
  const pts=result.coordinates || [result.origin,...(result.stops||[]),result.destination];
  const selected=pts.length > 3 ? pts.filter((_,i)=>i%Math.max(1,Math.ceil(pts.length/150))===0).concat([pts[pts.length-1]]) : pts;
  if (state.map && state.mapReady) {
    state.navFitPending=false;
    const bounds=new maplibregl.LngLatBounds(selected[0],selected[0]);
    selected.forEach(p=>bounds.extend(p));
    state.map.fitBounds(bounds,{padding:{top:Math.min(230,$('map').clientHeight*.37),bottom:40,left:35,right:45},maxZoom:13,duration:950});
  } else if (state.rasterMap) {
    state.navFitPending=false;
    const xs=selected.map(p=>p[0]),ys=selected.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs), south=Math.min(...ys),north=Math.max(...ys);
    const extent=Math.max(right-left,north-south,0.01);
    const zoom=Math.max(2,Math.min(12,Math.floor(Math.log2(180/(extent*1.8)))));
    state.rasterMap.flyTo({center:[(left+right)/2,(north+south)/2],zoom});
  }
  renderNavigationOverlay();
}
async function resolveTripField(text, fallbackPrefix) {
  const value=String(text||'').trim();
  if(value) return (await resolveTypedPlace(value)).coordinates;
  return navigationInputPoint(fallbackPrefix);
}
async function previewNavigation(travelMode='auto') {
  const originText=$('nav-start-query').value.trim();
  const origin=originText ? (await resolveTripField(originText,'nav-start')) :
    (state.navOriginManual && $('nav-start-lat').value && $('nav-start-lon').value ? navigationInputPoint('nav-start') : locationForQuickPreview());
  const stops=[];
  for(const field of document.querySelectorAll('.nav-stop-query')) {
    if (!field.value.trim()) throw Error('Enter a place for every added stop, or remove the unused row.');
    stops.push((await resolveTypedPlace(field.value)).coordinates);
  }
  const destination=await resolveTripField($('nav-dest-query').value,'nav-dest');
  const planned=await planRoadRoute([origin,...stops,destination],{travelMode});
  if(planned.cancelled)return;
  $('nav-preview-summary').textContent=planned.text;
  setNavigationStatus(planned.text);
  if (planned.road) setMapSearchCollapsed(true);
  showPage('map',{autoLocate:false});
  if (activeMapTool) closeMapToolOverlay();
  setTimeout(applyNavigationFit,120);
}
$('nav-check-local-router').addEventListener('click',async ()=>{
  const out=$('nav-router-status');out.textContent='Checking local Valhalla…';
  try { const reply=await api('/api/navigation/routing/status');out.textContent=reply.detail; }
  catch(error){out.textContent=`Routing status unavailable: ${error.message}`;}
});
$('map-router-check').addEventListener('click',async()=>{
  const button=$('map-router-check'),output=$('map-router-result');
  button.disabled=true;output.textContent='Checking local Valhalla at 127.0.0.1…';
  try{
    const reply=await api('/api/navigation/routing/status');
    output.textContent=reply.reachable ?
      'Local Valhalla is responding. A route still needs matching road coverage.' :
      `${reply.detail} If you already set up the Docker container, start Docker Desktop and in Ubuntu run: docker start openrf-valhalla. Then check again.`;
  }catch(error){output.textContent=`Could not check local Valhalla: ${error.message}`;}
  finally{button.disabled=false;}
});
$('nav-preview-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {await previewNavigation('auto');} catch(err){setNavigationStatus(err.message);}
});
$('nav-preview-walking').addEventListener('click',async()=>{
  const button=$('nav-preview-walking');button.disabled=true;
  try {await previewNavigation('pedestrian');}
  catch(error){setNavigationStatus(`Walking plan unavailable: ${error.message}`);}
  finally{button.disabled=false;}
});
$('nav-add-stop').addEventListener('click',()=>{
  const parent=$('nav-stops');
  if(parent.children.length>=10){setNavigationStatus('Maximum of ten intermediate stops.');return;}
  const row=document.createElement('div');row.className='nav-stop-row';
  const input=document.createElement('input');input.className='field nav-stop-query';input.type='text';
  input.placeholder=`Stop ${parent.children.length+1} street address, place, or coordinates`;
  input.maxLength=140;input.setAttribute('aria-label',`Stop ${parent.children.length+1}`);
  const remove=document.createElement('button');remove.type='button';remove.className='btn outline mini';
  remove.textContent='Remove';remove.addEventListener('click',()=>row.remove());
  row.append(input,remove);parent.append(row);wireTripAddressField(input);input.focus();
});
$('nav-use-location').addEventListener('click',()=>{
  const button=$('nav-use-location'),status=$('nav-origin-status');
  if(!navigator.geolocation){status.textContent='Browser geolocation unavailable. Enter coordinates manually.';return;}
  button.disabled=true;status.textContent='Requesting a fresh position. Nothing is saved or tracked.';
  navigator.geolocation.getCurrentPosition(pos=>{
    button.disabled=false;
    const {latitude,longitude,accuracy}=pos.coords||{};
    const age=(Date.now()-pos.timestamp)/1000;
    if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||
       !Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5||age>60){
       status.textContent='The location fix was invalid or stale. No coordinates changed.';return;
    }
    state.navOriginManual=false;
    state.navPickedOrigin=null;
    $('nav-start-query').value='';
    $('map-origin-query').value='';
    state.browserLocation={lat:latitude,lon:longitude,accuracy,capturedAt:Date.now()};
    globalThis.window?.OpenRFMapElevation?.update(pos);
    updateBrowserLocationMarker();
    $('nav-start-lat').value=latitude.toFixed(7);$('nav-start-lon').value=longitude.toFixed(7);
    if(state.navPreview || state.navRouteChoices)resetRouteForNewDestination();
    renderNavigationOverlay();
    syncMapOriginSummary();
    status.textContent=`Browser-reported starting point (±${Math.round(accuracy)} m; ${Math.round(Math.max(0,age))} s old). Desktop/VPN location may be approximate.`;
  },err=>{
    button.disabled=false;
    status.textContent=`Position unavailable (${err.code===1?'permission denied':err.code===3?'timed out':'no fix'}). Enter coordinates manually.`;
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
});
function beginDestinationMapPick() {
  // A new destination always takes priority over a still-open route choice
  // sheet. No manual X/close action is required before the map will accept
  // another pick. Handle this even on repeated/idempotent invocations.
  $('map-route-choices').hidden=true;
  // Arming a map pick is not committing a new destination. Leave the old
  // directions and route in place until consumeNavigationPick accepts a tap.
  state.navSearchToken++;
  if(navAddressTimer)clearTimeout(navAddressTimer);
  hideMapAddressMatches();
  // Idempotent: reopening this workflow (or tapping the action twice) must
  // never silently cancel map picking. Escape remains the explicit cancel.
  if(state.navPicking && state.navPickKind!=='origin'){
    syncDestinationPickMode();
    setMapDestinationStatus('Tap a point on the map to choose a destination. Press Escape to cancel.');
    return;
  }
  state.navPickPointerStart=null;
  state.navPickSwallowClickUntil=0;
  if (state.areaChoosing) cancelAreaChoosing();
  // A previously started 'pick a road to avoid' action must never consume
  // the tap intended for the new destination (it registered first on #map).
  state.navAvoidPicking=false;
  // Trip-only avoidances and the previous route remain until an actual pick.
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  if($('map-camera-route-chip'))$('map-camera-route-chip').hidden=true;
  state.navPickKind='destination';
  state.navOriginPickReturnToSearch=false;
  state.navPicking=true;
  showPage('map',{autoLocate:false});
  if (typeof setMapSearchCollapsed === 'function') setMapSearchCollapsed(true);
  if (typeof activeMapTool !== 'undefined' && activeMapTool) closeMapToolOverlay();
  syncDestinationPickMode();
  if (typeof syncMapPickedAction === 'function') syncMapPickedAction();
  renderNavigationOverlay();
  setMapDestinationStatus('Tap the map once to place a red destination pin, then Get directions. Ordinary map panning returns afterward; no observation is saved.');
}
$('nav-pick-map').addEventListener('click',beginDestinationMapPick);
$('map-pick-destination').addEventListener('click',beginDestinationMapPick);
function beginOriginMapPick({returnToSearch=false}={}){
  // Origin and destination tap modes share the same one-tap coordinate
  // conversion, drag rejection and pan restoration, but not the same field.
  if(state.navPicking && state.navPickKind==='origin'){
    syncDestinationPickMode();
    setMapDestinationStatus('Tap the map to choose a starting point. Press Escape to cancel.');
    return;
  }
  state.navPickPointerStart=null;
  state.navPickSwallowClickUntil=0;
  if(state.areaChoosing)cancelAreaChoosing();
  state.navAvoidPicking=false;
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  state.navPickKind='origin';
  state.navOriginPickReturnToSearch=returnToSearch;
  state.navPicking=true;
  showPage('map',{autoLocate:false});
  setMapSearchCollapsed(true);
  if(activeMapTool)closeMapToolOverlay();
  syncDestinationPickMode();
  if(typeof syncMapPickedAction==='function')syncMapPickedAction();
  renderNavigationOverlay();
  setMapDestinationStatus('Tap the map once to choose your starting point (teal marker). This will not change the destination or save a GPS position.');
}
$('nav-pick-start-map').addEventListener('click',beginOriginMapPick);
$('map-origin-pick').addEventListener('click',()=>beginOriginMapPick({returnToSearch:true}));
$('nav-clear-preview').addEventListener('click',()=>{
  resetRouteForNewDestination();
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  if($('map-camera-route-chip'))$('map-camera-route-chip').hidden=true;
  state.navPicking=false;state.navPickKind='destination';state.navPickedPoint=null;
  syncDestinationPickMode();syncMapPickedAction();
  $('nav-preview-summary').textContent='';
  $('nav-directions').replaceChildren();
  setNavigationStatus('Preview cleared; saved destinations are unchanged.');
  renderNavigationOverlay();
});
$('nav-save-destination').addEventListener('click',()=>runAction(async()=>{
  const coords=navigationInputPoint('nav-dest');
  const name=$('nav-dest-name').value.trim();
  if(!name) throw Error('Enter a destination name before saving.');
  await api('/api/navigation/destinations','POST',{name,latitude:coords[1],longitude:coords[0]});
  await refreshNavigationDestinations();
  setNavigationStatus('Destination saved locally. No route or GPS history recorded.');
}));
$('nav-destination-list').addEventListener('click',event=>{
  const use=event.target.closest('[data-nav-use]');
  const remove=event.target.closest('[data-nav-delete]');
  if(use){
    const d=state.navDestinations.find(x=>x.id===Number(use.dataset.navUse));
    if(d){state.navSelectedAddress=null;$('map-destination-query').value=d.name;$('nav-dest-name').value=d.name;$('nav-dest-lat').value=d.latitude;$('nav-dest-lon').value=d.longitude;$('nav-dest-query').value=d.name;
      setNavigationStatus('Saved destination loaded. Enter your starting position and preview it on the map.');}
  }
  if(remove && confirm('Delete this saved navigation destination from your private OpenRF database?'))runAction(async()=>{
    await api(`/api/navigation/destinations/${remove.dataset.navDelete}`,'DELETE');
    await refreshNavigationDestinations();setNavigationStatus('Saved destination removed.');
  });
});
// v0.2.60: optional spoken maneuver cues and map-derived lane hints. Browser
// speech synthesis is never used until the operator opts in during live GPS
// navigation. No external TTS API, position logging, or simulated live speech.
function navigationVoiceAvailable(){
  return typeof window.speechSynthesis?.speak==='function' && typeof window.SpeechSynthesisUtterance==='function';
}
function navigationSilence(){
  try{window.speechSynthesis?.cancel?.();}catch(_err){}
}
function navigationSpeak(text){
  if(!state.navVoiceEnabled || state.navDemoActive || state.navFollowId===null || !navigationVoiceAvailable())return false;
  if(typeof text!=='string' || !text.trim())return false;
  try{
    navigationSilence();
    const phrase=new window.SpeechSynthesisUtterance(text.slice(0,300));
    phrase.lang='en-US';phrase.rate=0.95;phrase.volume=1;
    phrase.onerror=()=>{$('map-voice-status').textContent='Speech playback failed; use the on-screen directions.';};
    window.speechSynthesis.speak(phrase);
    state.navVoiceLastTurnAt=Date.now();
    return true;
  }catch(_err){
    $('map-voice-status').textContent='Speech playback unavailable; use on-screen directions.';
    return false;
  }
}
function resetNavigationVoice(){
  state.navVoiceEnabled=false;state.navVoiceMemory=null;state.navVoiceFailed=false;
  navigationSilence();
  $('map-voice-toggle').textContent='Voice off';$('map-voice-toggle').setAttribute('aria-pressed','false');
  $('map-voice-status').textContent='Tap Voice to enable spoken turns';
}
$('map-voice-toggle').addEventListener('click',()=>{
  if(state.navDemoActive){$('map-voice-status').textContent='No spoken turns during DEMO playback.';return;}
  if(state.navFollowId===null){$('map-voice-status').textContent='Start real GPS navigation before enabling voice.';return;}
  if(!navigationVoiceAvailable()){
    $('map-voice-status').textContent='Browser/OS speech synthesis unavailable. On-screen directions still work.';return;
  }
  state.navVoiceEnabled=!state.navVoiceEnabled;
  state.navVoiceMemory=null;
  $('map-voice-toggle').textContent=state.navVoiceEnabled?'Voice on':'Voice off';
  $('map-voice-toggle').setAttribute('aria-pressed',String(state.navVoiceEnabled));
  $('map-voice-status').textContent=state.navVoiceEnabled?'Speaking only on fresh, accurate moving GPS fixes.':'Voice muted.';
  if(state.navVoiceEnabled)navigationSpeak('Voice guidance enabled.');
  else navigationSilence();
});
function renderNavigationLanes(turn,eligible){
  const panel=$('map-lane-guidance'),bar=$('map-lane-arrows');
  const lanes=eligible && turn?.distance_m<=750?routeGuide.laneGuidance(turn):[];
  panel.hidden=lanes.length===0;
  if(!lanes.length){bar.replaceChildren();return;}
  bar.replaceChildren();
  for(const lane of lanes){
    const chip=document.createElement('span');chip.className='lane-chip'+(lane.active?' active':lane.valid?' valid':'');
    chip.textContent=lane.arrows;
    chip.title=lane.active?'Valhalla suggested lane':lane.valid?'Valhalla valid lane':'Direction reported; route suitability unknown';
    bar.appendChild(chip);
  }
}
// v0.2.32: opt-in GPS follow view. A route plan is mandatory; this does not
// guarantee live traffic, lane availability, or reliable GPS turn timing.
// Watch positions are held only in memory and never uploaded/saved by OpenRF.
function refreshNavigationTrackRecorder(){
  const panel=$('map-nav-record-panel');
  if(!panel)return;
  const active=state.navFollowId!==null && (state.navFollowMode==='auto'||state.navFollowMode==='pedestrian');
  panel.hidden=!active;
  if(!active)return;
  const api=window.OpenRFBreadcrumbs;
  const track=api?.snapshot?.()||{recording:false,busy:false,mode:null};
  if(!track.recording)state.navTrackLinked=false;
  const mode=state.navFollowMode;
  const start=$('map-nav-record-start'),stop=$('map-nav-record-stop'),info=$('map-nav-record-status');
  start.textContent=mode==='auto'?'Record this drive':'Record this walk';
  start.hidden=Boolean(track.recording);
  start.disabled=track.busy || !api || Boolean(track.recording);
  stop.hidden=!track.recording || !state.navTrackLinked;
  stop.disabled=track.busy;
  info.textContent=track.recording ?
    (state.navTrackLinked ? `${mode==='auto'?'Driving':'Walking'} track recording on this device. Keep tab visible; Stop & save when finished.` :
      'Separate GPS-tools recording is active. Stop it from GPS tools; navigating does not own that track.') :
    (/(?:Recording not started|Browser geolocation is unavailable|Choose Walking|Enter a track name)/.test(track.message||'') ?
      track.message : 'Optional private GPS history. Navigation alone never saves your movement. Tap Record to begin only with your permission.');
}
window.addEventListener('openrf:breadcrumbs-state',refreshNavigationTrackRecorder);
$('map-nav-record-start')?.addEventListener('click',async()=>{
  const mode=state.navFollowMode,epoch=state.navFollowEpoch;
  if(state.navFollowId===null || !['auto','pedestrian'].includes(mode))return;
  if(!window.OpenRFBreadcrumbs?.start)return;
  if(!confirm('Start privately recording your precise browser GPS locations? Tracks stay on this device, stop when the tab is hidden, and may reveal your movements if exported.'))return;
  const guard=()=>state.navFollowEpoch===epoch && state.navFollowId!==null && state.navFollowMode===mode;
  await window.OpenRFBreadcrumbs.start(mode,guard);
  if(guard() && window.OpenRFBreadcrumbs.snapshot().recording)state.navTrackLinked=true;
  if(typeof refreshNavigationTrackRecorder==='function')refreshNavigationTrackRecorder();
});
$('map-nav-record-stop')?.addEventListener('click',async()=>{
  if(!state.navTrackLinked)return;
  await window.OpenRFBreadcrumbs?.stop?.();
  state.navTrackLinked=false;
  if(typeof refreshNavigationTrackRecorder==='function')refreshNavigationTrackRecorder();
});
function stopNavigationFollow(){
  const finishingActiveTrip=state.navFollowId!==null;
  if(typeof window!=='undefined' && window.OpenRFBreadcrumbs?.snapshot?.().following)
    window.OpenRFBreadcrumbs.stopFollow('Reverse-track GPS follow stopped.');
  if(state.navTrackLinked){
    state.navTrackLinked=false;
    void window.OpenRFBreadcrumbs?.stop?.();
  }
  resetNavigationVoice();renderNavigationLanes(null,false);
  state.navCameraAlertSeen?.clear?.();state.navCameraAlertVoiceSeen?.clear?.();state.navCameraAlertLastVoice=0;
  state.navCameraAlertLastQualifiedAt=0;
  if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
  // Stop every DEMO playback interval and remove its synthetic map marker.
  if(state.navDemoTimer!==null)clearInterval(state.navDemoTimer);
  state.navDemoTimer=null;state.navDemoActive=false;state.navDemoPaused=false;
  state.navDemoProgress=0;state.navDemoLastTime=0;state.navDemoFix=null;
  if(state.navDemoMarker?.remove)state.navDemoMarker.remove();
  state.navDemoMarker=null;state.navDemoMarkerMap=null;
  $('page-map').classList.remove('navigation-demo');
  const geoElement=state.geoMarker?.getElement?.();if(geoElement)geoElement.hidden=false;
  const demoPanel=$('map-demo-panel');if(demoPanel)demoPanel.open=false;
  const demoInfo=$('map-demo-status');if(demoInfo)demoInfo.textContent='DEMO inactive. Play simulates the Valhalla route; no GPS or recordings.';
  $('map-demo-play').hidden=false;$('map-demo-pause').hidden=true;$('map-demo-pause').textContent='Pause';$('map-demo-end').hidden=true;
  if(state.navFollowId!==null && state.navFollowId>=0 && navigator.geolocation?.clearWatch)
    navigator.geolocation.clearWatch(state.navFollowId);
  state.navGnssEpoch=(state.navGnssEpoch||0)+1;
  if(state.navGnssTimer!==null)clearInterval(state.navGnssTimer);
  state.navGnssTimer=null;state.navGnssBusy=false;state.navGnssLast=0;
  state.navFollowEpoch++;state.navRerouteBusy=false;state.navOffrouteCount=0;state.navOffrouteSince=0;
  if(finishingActiveTrip && state.navAvoidSession?.length){state.navAvoidSession=[];renderRoadAvoidList();}
  state.navFollowId=null;state.navFollowMode=null;state.navFollowPriorFix=null;state.navFollowHeading=null;state.navFollowCameraSuspended=false;state.navFollowLastPosition=null;
  state.navFollowStartedAt=0;state.navFollowLastValidAt=0;state.navFollowSignalState='waiting';
  navSignalIndicator.textContent='GPS: waiting';navSignalIndicator.dataset.gps='waiting';
  if(typeof cameraPanelVisibility==='function')cameraPanelVisibility(false);
  $('page-map').classList.remove('navigation-driving','navigation-walking');
  if(state.navRouteChoices && !state.navChoicePanelClosed)renderRouteChoices();
  $('map-follow-hud').hidden=true;
  if(typeof refreshNavigationTrackRecorder==='function')refreshNavigationTrackRecorder();
  $('map-follow-hud').classList.remove('navigation-guiding');
  const walkingReplan=$('map-walking-replan');
  if(walkingReplan){walkingReplan.hidden=true;walkingReplan.disabled=false;}
  if(state.navPreview?.travel_mode==='pedestrian')renderDirectionsReview(state.navPreview);
  if(state.map && state.mapReady) state.map.easeTo({pitch:0,bearing:0,duration:300});
}
function navigationNearestShape(coords,lon,lat){
  // Retained for older callers; road-follow now projects onto line segments.
  const route=state.navPreview;
  if(route?.type==='ROAD_ROUTE' && route.coordinates===coords){
    const match=routeGuide.locate(route,lon,lat,state.navFollowProgress||0);
    return {index:match.index,offset_m:match.offset_m};
  }
  return {index:0,offset_m:Infinity};
}
function setNavigationSignalState(kind,accuracy=null,recovered=false){
  state.navFollowSignalState=kind;
  const chip=$('map-follow-signal');
  if(!chip)return;
  chip.dataset.gps=kind;
  if(kind==='precise')chip.textContent=`GPS: ${recovered?'recovered · ':''}accurate ±${Math.round(accuracy)} m`;
  else if(kind==='approximate')chip.textContent=`GPS: ${recovered?'recovered · ':''}approximate ±${Math.round(accuracy)} m`;
  else if(kind==='lost')chip.textContent='GPS: signal lost · guidance paused';
  else if(kind==='demo')chip.textContent='DEMO · not live GPS';
  else if(kind==='unavailable')chip.textContent='GPS: fix unavailable';
  else chip.textContent='GPS: waiting for first fix';
}
function enforceNavigationSignalFreshness(now=Date.now()){
  if(state.navFollowId===null || state.navDemoActive)return;
  if(OpenRFNavigationHealth.status(state.navFollowStartedAt,state.navFollowLastValidAt,now)!=='lost' ||
     state.navFollowSignalState==='lost')return;
  setNavigationSignalState('lost');
  state.navFollowPriorFix=null;state.navOffrouteCount=0;state.navOffrouteSince=0;
  if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
  $('map-follow-hud').classList.remove('navigation-guiding');
  $('map-follow-instruction').textContent='GPS signal lost · live guidance paused';
  $('map-follow-distance').textContent='Planned directions remain available below';
  $('map-follow-quality').textContent=state.navFollowMode==='pedestrian'?
    'No fresh GPS fix for 15 seconds. Walking progress paused; this is still only a planned path. Check browser location permission or a local GNSS receiver. No position history saved.':
    'No new valid GPS fix for 15 seconds. Check browser location permission or the local GNSS receiver. Do not rely on live turn timing until a fresh fix returns. No position history saved.';
  $('map-follow-planned').hidden=false;
  if($('map-walking-replan'))$('map-walking-replan').hidden=true;
  $('map-follow-camera-note').textContent='Camera position is frozen until a new GPS fix is received.';
  renderNavigationLanes(null,false);navigationSilence();
}
async function tryNavigationReroute(route,lat,lon){
  if(state.navRerouteBusy || state.navFollowId===null || state.navDemoActive)return;
  // Do not silently skip a requested intermediate stop.
  if(route.stops?.length){
    $('map-follow-quality').textContent='Off route with planned intermediate stops. Automatic recalculation is disabled to avoid skipping stops. Stop safely and replan.';
    return;
  }
  const epoch=state.navFollowEpoch;
  state.navRerouteBusy=true;
  state.navRerouteLast=Date.now();
  $('map-follow-instruction').textContent='Recalculating from the latest accurate moving position…';
  try{
    const locations=[{latitude:lat,longitude:lon},
      {latitude:route.destination[1],longitude:route.destination[0]}];
    const choices=state.navCameraAvoidTypes;
    const answer=choices?.length ?
      await api('/api/navigation/camera-comparison','POST',{locations,types:choices,options:routeRequestOptions()}) :
      await api('/api/navigation/route','POST',{locations,options:routeRequestOptions()});
    if(epoch!==state.navFollowEpoch || state.navFollowId===null || state.navDemoActive || state.navPreview!==route)return;
    const selected=choices?.length ?
      (answer.alternative && answer.alternative_cameras?.count < answer.standard_cameras?.count ? answer.alternative : answer.standard) : answer.route;
    const report=choices?.length ?
      (selected===answer.alternative ? answer.alternative_cameras : answer.standard_cameras) : answer.camera_report;
    if(!selected?.is_driving_route)throw Error('No drivable recalculated route returned.');
    state.navPreview=selected;state.navFollowProgress=0;state.navVoiceMemory=null;
    renderNavigationLanes(null,false);
    if(state.navVoiceEnabled)navigationSpeak('Route recalculated.');
    state.navOffrouteCount=0;state.navOffrouteSince=0;
    renderDirectionsReview(selected);showRouteCameras(report);
    const steps=routeGuide.routeSteps(selected);
    $('map-follow-turn-list').innerHTML=steps.map(t=>`<li>${escapeHTML(t.instruction)}<small>${t.length_miles.toFixed(2)} mi</small></li>`).join('');
    renderNavigationOverlay();
    $('map-follow-instruction').textContent=choices?.length ? (selected===answer.alternative?'Camera-aware route recalculated':'Route recalculated · camera preference not available') : 'Route recalculated · continue following road signs';
    $('map-follow-quality').textContent=`Local Valhalla recalculated from the last accurate GPS fix; no GPS trail was saved. ${choices?.length?'Selected camera categories were compared again; the result may still pass cameras. ':''}Road and camera data may be incomplete.`;
  }catch(error){
    if(epoch===state.navFollowEpoch && state.navPreview===route){
      $('map-follow-instruction').textContent='Off route · recalculation unavailable';
      $('map-follow-quality').textContent=`${error.message}. Safely stop and request directions again if needed; existing route preserved.`;
    }
  }finally{if(epoch===state.navFollowEpoch)state.navRerouteBusy=false;}
}
// Walking follow is deliberately simpler than driving navigation: the camera
// tracks only a real permissioned fix, north-up. No simulated position, road
// lane, camera alert, voice cue, or automatic route recalculation.
function followWalkingPosition(pos){
  if(state.navFollowId===null||state.navFollowMode!=='pedestrian')return;
  const route=state.navPreview;
  if(route?.type!=='ROAD_ROUTE'||route.travel_mode!=='pedestrian'||route.is_driving_route!==false){
    stopNavigationFollow();return;
  }
  if(pos.origin!=='gpsd'&&state.navGnssLast&&Date.now()-state.navGnssLast<5000)return;
  const {latitude:lat,longitude:lon,accuracy}=pos.coords||{};
  const age=Date.now()-pos.timestamp;
  const message=$('map-follow-instruction'),distanceLabel=$('map-follow-distance');
  const detail=$('map-follow-quality'),planned=$('map-follow-planned');
  const replan=$('map-walking-replan');
  if(replan)replan.hidden=true;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
     !Number.isFinite(accuracy)||accuracy<0||accuracy>10000||
     !Number.isFinite(age)||age< -5000||age>15000){
    message.textContent='Walking GPS fix invalid or stale · progress paused';
    distanceLabel.textContent='Waiting for a fresh position; planned turns remain below';
    detail.textContent='Position or reported accuracy is invalid/too old. No turn progress will be inferred. No history saved.';
    planned.hidden=false;$('map-follow-hud').classList.remove('navigation-guiding');
    setNavigationSignalState('unavailable');return;
  }
  const sourceName=pos.origin==='gpsd'?'Local gpsd GNSS':'Browser location';
  const recovered=state.navFollowSignalState==='lost';
  state.navFollowLastValidAt=Math.max(state.navFollowLastValidAt||0,pos.timestamp);
  setNavigationSignalState(accuracy<=35?'precise':'approximate',accuracy,recovered);
  state.navFollowLastPosition=pos;
  state.browserLocation={lat,lon,accuracy,capturedAt:Date.now(),source:pos.origin==='gpsd'?'gpsd':'browser',source_device:pos.source_device||null};
  globalThis.window?.OpenRFMapElevation?.update(pos);
  updateBrowserLocationMarker();
  const precise=accuracy<=35;
  const cameraNote=$('map-follow-camera-note');
  cameraNote.textContent=state.navFollowCameraSuspended?
    'Map moved manually · tap crosshair to resume following your GPS position.':
    'Map: north-up · centered on the reported position, not an estimated trail location.';
  if(!precise){
    message.textContent='Walking GPS accuracy too low for turn progress';
    distanceLabel.textContent=`Reported accuracy ±${Math.round(accuracy)} m · follow paused`;
    detail.textContent=`${sourceName} ±${Math.round(accuracy)} m, ${Math.round(Math.max(0,age)/1000)} s old. Need ±35 m or better to estimate walking turns. No history saved.`;
    planned.hidden=false;$('map-follow-hud').classList.remove('navigation-guiding');
  }else{
    try{
      const progress=routeGuide.walkingGuidance(route,lon,lat,accuracy,state.navFollowProgress||0);
      if(progress.offroute){
        message.textContent='Away from planned walking path · check your surroundings';
        distanceLabel.textContent=`About ${Math.round(progress.offset_m)} m from mapped path · no automatic rerouting`;
        detail.textContent=`${sourceName} ±${Math.round(accuracy)} m · position differs from the Valhalla walking line. Posted access restrictions take priority. No progress advanced or GPS history saved. ${route.stops?.length?'Replanning is unavailable with intermediate stops; stop and review your full trip.':'Use Replan walk only if you explicitly want a new local path.'}`;
        planned.hidden=false;$('map-follow-hud').classList.remove('navigation-guiding');
        // Replanning is explicitly tapped, from an accurate live fix only;
        // never silently discard requested intermediate walking stops.
        if(replan)replan.hidden=Boolean(route.stops?.length);
      }else{
        state.navFollowProgress=Math.max(state.navFollowProgress||0,progress.along_m);
        planned.hidden=true;$('map-follow-hud').classList.add('navigation-guiding');
        const destinationDistance=routeGuide.distance([lon,lat],route.destination);
        const nearDestination=progress.remaining_m<=30 && destinationDistance<=Math.max(25,accuracy*2);
        message.textContent=nearDestination?'Near planned destination · verify actual access':progress.instruction;
        distanceLabel.textContent=nearDestination?'Confirm destination and stop navigation when ready':
          `${routeGuide.distanceText(progress.remaining_m)} remaining`+
          (progress.next_distance_m!==null&&progress.next_distance_m>25?` · next step in ${routeGuide.distanceText(progress.next_distance_m)}`:'');
        detail.textContent=`${sourceName} ±${Math.round(accuracy)} m · ${Math.round(progress.offset_m)} m from mapped walking line · no automatic rerouting, live trail condition or stored travel history. Check signs and access.`;
      }
    }catch(error){
      message.textContent='Walking route progress unavailable';
      distanceLabel.textContent='Planned turns remain below';
      detail.textContent=`${error.message} No route position inferred.`;
      planned.hidden=false;$('map-follow-hud').classList.remove('navigation-guiding');
    }
  }
  // A weak fix should not pull the map away from a detailed planned route.
  if(accuracy>100||state.navFollowCameraSuspended||Date.now()-state.navFollowLast<=700)return;
  state.navFollowLast=Date.now();
  if(state.map&&state.mapReady){
    state.map.easeTo({center:[lon,lat],zoom:precise?15.5:14,pitch:0,bearing:0,duration:600});
  }else if(state.rasterMap){
    state.rasterMap.stop();state.rasterMap.center=[lon,lat];state.rasterMap.zoom=precise?15:14;state.rasterMap.render();
  }
}
// Manual recovery is never triggered by a GPS callback. Preserve the original
// route and follow session unless an explicit tap returns a complete local
// pedestrian route from the last fresh, accurate, off-path position.
async function replanWalkingFromFix(){
  const button=$('map-walking-replan'),route=state.navPreview,pos=state.navFollowLastPosition;
  if(button.disabled || state.navFollowId===null || state.navFollowMode!=='pedestrian' ||
     route?.type!=='ROAD_ROUTE' || route.travel_mode!=='pedestrian' || route.is_driving_route!==false ||
     route.stops?.length)return;
  const {latitude:lat,longitude:lon,accuracy}=pos?.coords||{};
  const age=Date.now()-pos?.timestamp;
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||
     !Number.isFinite(accuracy)||accuracy<0||accuracy>35||!Number.isFinite(age)||age< -5000||age>15000){
    button.hidden=true;
    $('map-follow-quality').textContent='Manual walking replan requires a fresh GPS fix at ±35 m or better. No request sent.';
    return;
  }
  let offPath=false;
  try{offPath=routeGuide.walkingGuidance(route,lon,lat,accuracy,state.navFollowProgress||0).offroute;}
  catch(_error){ /* A malformed planned line is not eligible for recovery. */ }
  if(!offPath){button.hidden=true;return;}
  const destination=route.destination;
  if(!Array.isArray(destination)||destination.length!==2||
     !destination.every(Number.isFinite)){button.hidden=true;return;}
  const epoch=state.navFollowEpoch;
  button.disabled=true;
  $('map-follow-instruction').textContent='Requesting a new local walking path from this GPS position…';
  try{
    const response=await api('/api/navigation/route','POST',{
      locations:[{latitude:lat,longitude:lon},{latitude:destination[1],longitude:destination[0]}],
      options:{travel_mode:'pedestrian'}});
    // A Stop, a new destination or another session supersedes this response.
    if(epoch!==state.navFollowEpoch || state.navFollowMode!=='pedestrian' || state.navPreview!==route)return;
    const next=response?.route;
    if(next?.type!=='ROAD_ROUTE'||next.travel_mode!=='pedestrian'||next.is_driving_route!==false||
       !routeGuide.hasCompleteDirections(next)||!Array.isArray(next.destination)||
       next.destination.length!==2||!next.destination.every(Number.isFinite)||
       routeGuide.distance(next.destination,destination)>150)
      throw Error('No complete walking route to the same destination was returned');
    const steps=routeGuide.routeSteps(next); // Validate all mapped segments before replacing.
    // This intentionally stops the GPS watch before showing the replacement;
    // the operator reviews the new path and taps Start again when ready.
    setNavigationRoutePreview(next);
    $('map-compare-camera-routes').disabled=true;
    $('nav-directions').innerHTML='<h4>New planned walking turns · GPS paused</h4><ol>'+
      steps.map(t=>`<li>${escapeHTML(t.instruction)} <small>(${t.length_miles.toFixed(2)} mi)</small></li>`).join('')+'</ol>';
    setMapDestinationStatus('New local walking route from your last accurate GPS position. Review the path and tap Start walking navigation to follow it. Trail access is unverified.','success');
  }catch(error){
    if(epoch===state.navFollowEpoch&&state.navPreview===route&&state.navFollowMode==='pedestrian'){
      $('map-follow-instruction').textContent='New walking path unavailable · original route preserved';
      $('map-follow-distance').textContent='You can keep the original plan or stop and change destination';
      $('map-follow-quality').textContent=`Local pedestrian replan failed: ${error.message}. No new path was assumed and GPS follow was not restarted.`;
    }
  }finally{button.disabled=false;}
}
function followPosition(pos){
  if(state.navFollowId===null || state.navDemoActive)return;
  if(state.navFollowMode==='pedestrian'){followWalkingPosition(pos);return;}
  const route=state.navPreview;
  if(route?.type!=='ROAD_ROUTE'||!route.is_driving_route){stopNavigationFollow();return;}
  // During a fresh gpsd fix, do not overwrite the GNSS camera with a coarser
  // browser-network fix. Fall back automatically if local GNSS stops reporting.
  if(pos.origin!=='gpsd' && state.navGnssLast && Date.now()-state.navGnssLast<5000)return;
  const {latitude:lat,longitude:lon,accuracy,heading,speed}=pos.coords||{};
  const sourceName=pos.origin==='gpsd'?'Local gpsd GNSS':'Browser location';
  const age=Date.now()-pos.timestamp;
  const message=$('map-follow-instruction'),detail=$('map-follow-quality');
  const cameraNote=$('map-follow-camera-note');
  const distanceLabel=$('map-follow-distance');
  const planned=$('map-follow-planned');
  const listed=routeGuide.routeSteps(route);
  const first=listed[0];
  if(planned){
    planned.textContent='Planned route · next steps are listed below (not live turn timing).';
    planned.hidden=false;
  }
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
     !Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(age)||age< -5000||age>15000){
    if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
    message.textContent='No recent valid browser location or GNSS fix. Live guidance paused.';
    distanceLabel.textContent='';
    detail.textContent=`Reported accuracy: ${Number.isFinite(accuracy)?'±'+Math.round(accuracy)+' m':'unavailable'} · Fix age: ${Number.isFinite(age)?Math.round(age/1000)+' s':'unknown'}. Check location source and device permissions. No data saved.`;
    $('map-follow-hud').classList.remove('navigation-guiding');
    if(state.navFollowSignalState!=='lost')setNavigationSignalState('unavailable');
    renderNavigationLanes(null,false);navigationSilence();
    return;
  }
  const recovered=state.navFollowSignalState==='lost';
  state.navFollowLastValidAt=Math.max(state.navFollowLastValidAt||0,pos.timestamp);
  setNavigationSignalState(accuracy<=75?'precise':'approximate',accuracy,recovered);
  state.navFollowLastPosition=pos; // In-memory only; discarded on Stop.
  state.browserLocation={lat,lon,accuracy,capturedAt:Date.now(),source:pos.origin==='gpsd'?'gpsd':'browser',source_device:pos.source_device||null};
  globalThis.window?.OpenRFMapElevation?.update(pos);
  updateBrowserLocationMarker();
  const precise=accuracy<=75,usableMap=accuracy<=1000;
  const moving=Number.isFinite(speed)&&speed>1.4;
  let movingHeading=Number.isFinite(heading)&&heading>=0&&heading<360&&moving?heading:null;
  // If heading is missing, infer only from meaningful movement between TWO
  // fresh, accurate fixes. Never infer heading from an approximate desktop dot.
  const prev=state.navFollowPriorFix;
  if(movingHeading===null && precise && prev && prev.accuracy<=75 && prev.source===pos.origin){
    const elapsed=(pos.timestamp-prev.timestamp)/1000;
    const traveled=routeGuide.distance([prev.lon,prev.lat],[lon,lat]);
    if(elapsed>0.6 && elapsed<=20 && traveled>Math.max(20,accuracy+prev.accuracy) && traveled/elapsed>=1.4 && traveled/elapsed<65){
      movingHeading=routeGuide.bearing([prev.lon,prev.lat],[lon,lat]);
    }
  }
  state.navFollowPriorFix={lat,lon,accuracy,timestamp:pos.timestamp,source:pos.origin};
  const activeBearing=movingHeading!==null?movingHeading:0;
  let offRoute=false;
  if(!precise){
    if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
    renderNavigationLanes(null,false);navigationSilence();
    message.textContent=first?`Planned: ${first.instruction}`:'Planned driving route ready';
    distanceLabel.textContent=`Approximate location ±${Math.round(accuracy)} m · LIVE turn timing paused`;
    detail.textContent=`${sourceName} reported ±${Math.round(accuracy)} m, ${Math.round(Math.max(0,age)/1000)} s old. This is not a verified road position or driving heading. The camera may align to the PLANNED road, but that does not indicate where the vehicle is pointing. Live turn timing stays disabled. No history saved.`;
  }else{
    const progress=routeGuide.guidance(route,lon,lat,accuracy,state.navFollowProgress||0);
    offRoute=progress.offroute;
    if(offRoute){
      if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
      message.textContent='Location off planned road · checking reliable GPS fixes';
      distanceLabel.textContent='Turn timing paused during route assessment';
      const reliable=accuracy<=40 && movingHeading!==null && progress.offset_m>Math.max(100,accuracy*3);
      const decision=routeGuide.rerouteDecision(
        {count:state.navOffrouteCount,since:state.navOffrouteSince,lastAttempt:state.navRerouteLast},
        {timeMs:Date.now(),accuracy_m:accuracy,offset_m:progress.offset_m,moving:movingHeading!==null});
      state.navOffrouteCount=decision.count;state.navOffrouteSince=decision.since;
      if(decision.trigger && !state.navRerouteBusy)tryNavigationReroute(route,lat,lon);
      renderNavigationLanes(null,false);navigationSilence();
      detail.textContent=`${sourceName} ±${Math.round(accuracy)} m · ${Math.round(progress.offset_m)} m from planned road. ${state.navRerouteBusy?'Recalculating locally…':reliable?'Reroute after repeated moving fixes; 45 s retry interval.':'Awaiting reliable movement and accuracy before rerouting.'} No GPS history saved.`;
    }else{
      state.navOffrouteCount=0;state.navOffrouteSince=0;
      state.navFollowProgress=progress.along_m;
      if(planned)planned.hidden=true;
      const turn=progress.next;
      message.textContent=turn?turn.instruction:'Continue to your destination.';
      distanceLabel.textContent=turn?`In ${routeGuide.distanceText(turn.distance_m)} · ${routeGuide.distanceText(progress.remaining_m)} remaining`:`${routeGuide.distanceText(progress.remaining_m)} remaining`;
      const speechReady=accuracy<=40 && movingHeading!==null && !state.navRerouteBusy;
      renderNavigationLanes(turn,accuracy<=75);
      if(speechReady && state.navVoiceEnabled){
        const cue=routeGuide.voiceCue(state.navVoiceMemory,turn);
        if(cue.text && navigationSpeak(cue.text))state.navVoiceMemory=cue.memory;
      }
      if(typeof updateCameraApproachAlert==='function')updateCameraApproachAlert(route,progress,{latitude:lat,longitude:lon,accuracy,
        ageMs:age,heading:movingHeading},turn);
      const minutes=Number.isFinite(route.duration_seconds)&&progress.total_m>0 ?
        Math.max(0,Math.ceil(route.duration_seconds*(progress.remaining_m/progress.total_m)/60)):null;
      detail.textContent=`${sourceName} ±${Math.round(accuracy)} m · ${movingHeading===null?'Moving heading unavailable: north-up map':'Moving heading available: forward-facing map'} · Route offset ${Math.round(progress.offset_m)} m · ${minutes===null?'ETA unavailable':`~${minutes} min remaining, no live traffic`} · No GPS history saved.`;
      if(progress.remaining_m<55 && routeGuide.distance([lon,lat],route.destination)<Math.max(35,accuracy*2)){
        message.textContent='Destination reached · Stop navigation when safe';
        renderNavigationLanes(null,false);
        if(speechReady && state.navVoiceEnabled && !state.navVoiceArrived){
          if(navigationSpeak('You are near your destination. Check signs and the correct entrance.'))state.navVoiceArrived=true;
        }
        distanceLabel.textContent='Near planned destination · confirm actual entrance and signs';
      }
    }
  }
  $('map-follow-hud').classList.toggle('navigation-guiding',precise&&!offRoute);
  // Camera presentation is distinct from turn certainty. Even a stationary
  // desktop with an approximate location can have a route-oriented, tilted
  // camera; the rotation comes from VALHALLA geometry, not measured heading.
  // Never promote that rotation to a live driver bearing or 'turn now'.
  let bearing=0,zoom=accuracy<=200?13.5:12,pitch=0,camMode='north';
  const reliableMotion=precise&&!offRoute&&movingHeading!==null;
  if(reliableMotion){
    bearing=activeBearing;zoom=16.5;pitch=48;camMode='moving';
  }else if(usableMap && accuracy<=300){
    const view=routeGuide.routeVisualHeading(route,lon,lat,state.navFollowProgress||0);
    if(view && view.offset_m <= Math.max(300,3*accuracy)){
      bearing=view.heading;zoom=accuracy<=75?16:15.25;pitch=42;camMode='route';
    }
  }
  if(cameraNote){
    cameraNote.textContent=state.navFollowCameraSuspended?'Map moved manually · tap the crosshair to resume following.':
      camMode==='moving'?'Camera: measured moving heading · GPS follow.':
      camMode==='route'?'Camera: aligned to the planned road, NOT your actual driving heading.':
      usableMap?'Camera: north-up follow; route direction uncertain.':'Camera: too imprecise to follow safely.';
  }
  if(!usableMap || state.navFollowCameraSuspended)return;
  if(Date.now()-state.navFollowLast>700){
    state.navFollowLast=Date.now();
    if(state.map&&state.mapReady){
      state.map.easeTo({center:[lon,lat],zoom,pitch,bearing,
        offset:[0,pitch?Math.min(125,$('map').clientHeight*.24):0],duration:650});
    }else if(state.rasterMap){
      // Raster mode cannot pitch or rotate. Center on the real fix only.
      state.rasterMap.stop();state.rasterMap.center=[lon,lat];state.rasterMap.zoom=Math.min(16,Math.floor(zoom));state.rasterMap.render();
    }
  }
}
// A loopback-only, read-only gpsd request. No polling except during an active
// user-started navigation session; server never stores or logs position fields.
async function pollLocalNavigationGnss(){
  // A stopped/frozen browser geolocation watch does not invoke followPosition.
  // Expire old approach banners even if no further GPS callback arrives.
  if(state.navCameraAlertLastQualifiedAt && Date.now()-state.navCameraAlertLastQualifiedAt>7000){
    if(typeof hideCameraApproachAlert==='function')hideCameraApproachAlert();
  }
  enforceNavigationSignalFreshness();
  if(state.navFollowId===null || state.navGnssBusy)return;
  state.navGnssBusy=true;
  const epoch=state.navGnssEpoch;
  try{
    const response=await fetch('/api/navigation/gnss',{cache:'no-store',headers:{'X-OpenRF-GNSS-Consent':'navigation-follow'}});
    if(!response.ok)return;
    const fix=await response.json();
    if(state.navFollowId===null || epoch!==state.navGnssEpoch)return;
    const status=$('map-follow-source');
    if(status){
      status.textContent=fix.status==='fix' ? `Local GNSS: ${fix.source_device||'gpsd receiver'} · UTC fix ±${Math.round(fix.accuracy_m)} m, age ${fix.fix_age_s} s` :
        `Local GNSS: ${fix.status||'unavailable'} · browser fallback. ${fix.message||''}`;
    }
    if(fix.status!=='fix')return;
    if(!Number.isFinite(fix.latitude)||!Number.isFinite(fix.longitude)||!Number.isFinite(fix.accuracy_m)||fix.accuracy_m<0)return;
    const timestamp=Date.parse(fix.utc_timestamp);
    if(!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>15000)return;
    state.navGnssLast=Date.now();
    followPosition({origin:'gpsd',source_device:fix.source_device,timestamp,coords:{
      latitude:fix.latitude,longitude:fix.longitude,accuracy:fix.accuracy_m,
      heading:fix.heading_degrees,speed:fix.speed_mps,
      altitude:fix.altitude_m,altitudeAccuracy:fix.vertical_accuracy_m,
      altitudeReference:fix.altitude_reference}});
  }catch(_err){ /* local gpsd unavailable: browser geolocation remains the fallback */ }
  finally{state.navGnssBusy=false;}
}
function startWalkingNavigation(){
  const route=state.navPreview;
  // An OSM-mapped dotted line or a direct-line fallback is never eligible.
  if(route?.type!=='ROAD_ROUTE'||route.travel_mode!=='pedestrian'||route.is_driving_route!==false||
     !Array.isArray(route.coordinates)||route.coordinates.length<2){
    setMapDestinationStatus('Get an actual local Valhalla walking route before starting GPS follow. A direct line is not a walkable path.','error');return;
  }
  if(state.navFollowId!==null)return;
  stopNavigationFollow();
  state.navFollowMode='pedestrian';
  state.navFollowProgress=0;state.navFollowLast=0;state.navFollowPriorFix=null;
  state.navFollowStartedAt=Date.now();state.navFollowLastValidAt=0;
  state.navFollowCameraSuspended=false;state.navFollowLastPosition=null;
  setNavigationSignalState('waiting');
  cameraPanelVisibility(false);renderNavigationLanes(null,false);hideCameraApproachAlert();
  $('page-map').classList.add('navigation-walking');
  $('map-follow-hud').hidden=false;
  $('map-follow-hud').classList.remove('navigation-guiding');
  if($('map-walking-replan'))$('map-walking-replan').hidden=true;
  $('map-follow-instruction').textContent='Waiting for live walking GPS…';
  $('map-follow-distance').textContent='Planned turns are available below; no actual position received yet';
  $('map-follow-quality').textContent='Walking follow uses only your permissioned GPS fix. Accuracy of ±35 m or better is required to advance turns. No automatic rerouting, voice, sensor recording or GPS history.';
  $('map-follow-planned').textContent='Planned walking path only · check public access, terrain and closures. Live progress waits for accurate GPS.';
  $('map-follow-planned').hidden=false;
  $('map-follow-camera-note').textContent='Map remains where you placed it until a real GPS fix arrives.';
  $('map-follow-source').textContent='Position source: browser; optional local gpsd checked only during this walking session.';
  $('map-follow-turn-list').innerHTML=routeGuide.routeSteps(route).map(t=>`<li>${escapeHTML(t.instruction)}<small>${t.length_miles.toFixed(2)} mi</small></li>`).join('');
  $('map-follow-turns').open=false;
  // Shared in-memory GPS lifecycle and loopback gpsd polling, no server writes.
  state.navFollowId=-1;state.navGnssLast=0;
  if(typeof refreshNavigationTrackRecorder==='function')refreshNavigationTrackRecorder();
  const epoch=state.navFollowEpoch;
  state.navGnssTimer=setInterval(pollLocalNavigationGnss,2500);
  pollLocalNavigationGnss();
  if(!navigator.geolocation?.watchPosition){
    $('map-follow-quality').textContent='Browser geolocation is unavailable. Checking optional local gpsd only while this walking session remains active. No history saved.';
    return;
  }
  try{
    const watchId=navigator.geolocation.watchPosition(pos=>{
      if(epoch===state.navFollowEpoch&&state.navFollowMode==='pedestrian')followPosition(pos);
    },error=>{
      if(epoch!==state.navFollowEpoch||state.navFollowMode!=='pedestrian')return;
      if(state.navGnssLast&&Date.now()-state.navGnssLast<5000)return;
      setNavigationSignalState('unavailable');
      if($('map-walking-replan'))$('map-walking-replan').hidden=true;
      $('map-follow-instruction').textContent=`Walking GPS unavailable (${error.code===1?'permission denied':error.code===3?'timed out':'no position'}).`;
      $('map-follow-distance').textContent='Follow paused · planned turns remain below';
      $('map-follow-quality').textContent='Enable browser location or connect supported local gpsd hardware, then use Stop and start again. No history saved.';
    },{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    if(epoch===state.navFollowEpoch)state.navFollowId=watchId;
    else navigator.geolocation.clearWatch?.(watchId);
  }catch(error){
    stopNavigationFollow();setMapDestinationStatus(`Walking GPS follow could not start: ${error.message}`,'error');
  }
}
$('map-begin-guidance').addEventListener('click',()=>{
  if(state.navPreview?.type!=='ROAD_ROUTE'||!state.navPreview.is_driving_route){
    setMapDestinationStatus('Get a confirmed Valhalla road route first; direct lines cannot start GPS follow.','error');return;
  }
  stopNavigationFollow();
  state.navFollowMode='auto';
  state.navFollowLast=0;state.navFollowProgress=0;state.navFollowPriorFix=null;state.navRerouteLast=0;
  state.navFollowStartedAt=Date.now();state.navFollowLastValidAt=0;
  setNavigationSignalState('waiting');
  state.navVoiceArrived=false;renderNavigationLanes(null,false);
  state.navFollowCameraSuspended=false;state.navFollowLastPosition=null;
  cameraPanelVisibility(false);
  $('page-map').classList.add('navigation-driving');
  // Enter a route-perspective preview immediately, even before the first fix.
  // This is the PLANNED route's start, not a fabricated GPS reading. The first
  // actual browser/gpsd reading then places the camera at the reported position.
  const routeCoords=state.navPreview.coordinates;
  if(state.map && state.mapReady && routeCoords?.length>=2){
    const initialHeading=routeGuide.routeVisualHeading(state.navPreview,routeCoords[0][0],routeCoords[0][1],0);
    state.map.easeTo({center:routeCoords[0],zoom:15.25,pitch:42,bearing:initialHeading?.heading||0,
      offset:[0,Math.min(125,$('map').clientHeight*.24)],duration:500});
  }else if(state.rasterMap && routeCoords?.length){
    state.rasterMap.stop();state.rasterMap.center=routeCoords[0];state.rasterMap.zoom=15;state.rasterMap.render();
  }
  const plannedTurns=routeGuide.routeSteps(state.navPreview);
  $('map-follow-turn-list').innerHTML=plannedTurns.map(t=>`<li>${escapeHTML(t.instruction)}<small>${t.length_miles.toFixed(2)} mi</small></li>`).join('');
  $('map-follow-turns').open=false;
  $('map-follow-source').textContent='Position source: browser; checking optional local gpsd only during this navigation session.';
  $('map-follow-hud').hidden=false;
  $('map-follow-instruction').textContent='Planned-route perspective · requesting GPS…';
  $('map-follow-camera-note').textContent='Camera is aligned with the START of the planned route, not a live vehicle fix.';
  $('map-follow-distance').textContent='Planned turns are available below while a fresh fix is requested';
  $('map-follow-quality').textContent='Firefox permission alone does not guarantee precise GNSS. Reported accuracy will appear here; approximate fixes can center the map but never advance turns. Nothing saved.';
  // Some browsers may invoke a mocked callback synchronously; set a sentinel
  // before the actual watch ID is assigned.
  state.navFollowId=-1;
  if(typeof refreshNavigationTrackRecorder==='function')refreshNavigationTrackRecorder();
  state.navGnssLast=0;
  // Poll only after the user explicitly starts navigation. gpsd is optional.
  state.navGnssTimer=setInterval(pollLocalNavigationGnss,2500);
  pollLocalNavigationGnss();
  if(!navigator.geolocation?.watchPosition){
    $('map-follow-quality').textContent='Browser GPS unavailable. Looking for an optional local gpsd receiver; planned turns remain available. No data saved.';
    return;
  }
  try{ state.navFollowId=navigator.geolocation.watchPosition(followPosition,err=>{
    if(state.navGnssLast && Date.now()-state.navGnssLast<5000)return;
    navigationSilence();renderNavigationLanes(null,false);
    $('map-follow-instruction').textContent=`Browser position unavailable (${err.code===1?'permission denied':err.code===3?'timed out':'position unavailable'}). Planned turns remain available.`;
    $('map-follow-quality').textContent=`${err.message||'No position returned.'} Permission is separate from accuracy; check Firefox location access or a local gpsd receiver. No travel history saved.`;
  },{enableHighAccuracy:true,maximumAge:0,timeout:12000}); }
  catch(err){stopNavigationFollow();setMapDestinationStatus(`GPS follow could not start: ${err.message}`,'error');}
});
$('map-stop-guidance').addEventListener('click',()=>{
  const walking=state.navFollowMode==='pedestrian';
  stopNavigationFollow();
  setMapDestinationStatus(walking?'Walking GPS follow stopped. Planned walking route remains available.':'GPS follow stopped. Road plan remains available.');
});
$('map-directions-walk-start').addEventListener('click',startWalkingNavigation);
$('map-walking-replan').addEventListener('click',replanWalkingFromFix);
// v0.2.37: Explicit, in-memory-only DEMO travel along the already confirmed
// local Valhalla route. This is not real GPS, live navigation or an observation.
function renderDemoRouteMarker(frame){
  if(state.map && state.mapReady && window.maplibregl?.Marker){
    if(state.navDemoMarker && state.navDemoMarkerMap!==state.map){
      state.navDemoMarker.remove();state.navDemoMarker=null;
    }
    if(!state.navDemoMarker){
      const node=document.createElement('div');
      node.className='openrf-demo-position';node.textContent='DEMO';
      node.title='DEMO route vehicle — simulated coordinates, not actual GPS';
      state.navDemoMarker=new maplibregl.Marker({element:node,anchor:'center'}).setLngLat([frame.lon,frame.lat]).addTo(state.map);
      state.navDemoMarkerMap=state.map;
    }else state.navDemoMarker.setLngLat([frame.lon,frame.lat]);
  }else if(state.rasterMap)state.rasterMap.render();
}
function showDemoRouteFrame(frame){
  state.navDemoFix=frame;
  const distance=$('map-follow-distance'),message=$('map-follow-instruction');
  // A DEMO itinerary may advance independently of any actual browser GPS fix.
  message.textContent=frame.arrived?'DEMO · Destination reached':
    `DEMO · ${frame.next?.instruction||'Continue along the planned route'}`;
  distance.textContent=frame.arrived?'Simulated trip complete':
    `SIMULATED · ${frame.next?'Next step in '+routeGuide.distanceText(frame.next.distance_m)+' · ':''}${routeGuide.distanceText(frame.remaining_m)} remaining`;
  $('map-follow-camera-note').textContent='DEMO camera: planned route direction only · NOT your real position or heading.';
  $('map-follow-planned').hidden=true;
  $('map-follow-source').textContent='DEMO / HISTORICAL TEST ONLY · No live GPS, radio observations, or tracking history.';
  $('map-follow-quality').textContent='Simulated movement sampled from saved Valhalla route geometry. Not a receiver fix. No GPS collected, uploaded, or saved. Never use simulation for driving.';
  $('map-demo-status').textContent=frame.arrived?'DEMO complete. Replay or Stop DEMO.':
    `${state.navDemoPaused?'Paused':'Playing'} · ${routeGuide.distanceText(frame.along_m)} of ${routeGuide.distanceText(frame.total_m)} · ${$('map-demo-speed').value}× simulated time`;
  renderDemoRouteMarker(frame);
  if(state.navFollowCameraSuspended)return;
  const now=Date.now();
  if(now-state.navFollowLast<260)return;
  state.navFollowLast=now;
  if(state.map&&state.mapReady){
    state.map.easeTo({center:[frame.lon,frame.lat],zoom:16.8,pitch:55,bearing:frame.heading,
      offset:[0,Math.min(145,$('map').clientHeight*.29)],duration:310});
  }else if(state.rasterMap){state.rasterMap.stop();state.rasterMap.center=[frame.lon,frame.lat];state.rasterMap.zoom=16;state.rasterMap.render();}
}
function advanceNavigationDemo(now){
  if(!state.navDemoActive || !state.navPreview?.is_driving_route)return;
  const clock=Number.isFinite(now)?now:performance.now();
  const elapsed=state.navDemoPaused?0:Math.max(0,Math.min(2,(clock-state.navDemoLastTime)/1000));
  state.navDemoLastTime=clock;
  if(!state.navDemoPaused){
    const multiplier=Math.max(1,Math.min(20,Number($('map-demo-speed').value)||5));
    // 35 simulated driving mph, optionally accelerated for desktop review.
    state.navDemoProgress+=elapsed*35*0.44704*multiplier;
  }
  const frame=routeGuide.sampleRoute(state.navPreview,state.navDemoProgress);
  showDemoRouteFrame(frame);
  if(frame.arrived){
    state.navDemoPaused=true;
    $('map-demo-pause').textContent='Replay';
    $('map-demo-status').textContent='DEMO complete · Replay or Stop DEMO.';
    if(state.navDemoTimer!==null)clearInterval(state.navDemoTimer);
    state.navDemoTimer=null;
  }
}
function playNavigationDemo(){
  if(!state.navPreview?.is_driving_route || state.navFollowId===null){
    setMapDestinationStatus('Get a real Valhalla road plan and Start navigation before testing DEMO.','error');return;
  }
  if(state.navDemoActive){
    if(state.navDemoPaused && routeGuide.sampleRoute(state.navPreview,state.navDemoProgress).arrived)state.navDemoProgress=0;
    state.navDemoPaused=false;state.navDemoLastTime=performance.now();
    $('map-demo-pause').textContent='Pause';advanceNavigationDemo(state.navDemoLastTime);
    if(state.navDemoTimer===null)state.navDemoTimer=setInterval(()=>advanceNavigationDemo(performance.now()),300);
    return;
  }
  // DEMO explicitly replaces real GPS acquisition: no simultaneous watch/polls.
  if(state.navFollowId>=0 && navigator.geolocation?.clearWatch)navigator.geolocation.clearWatch(state.navFollowId);
  state.navGnssEpoch++;
  if(state.navGnssTimer!==null)clearInterval(state.navGnssTimer);
  state.navGnssTimer=null;state.navGnssBusy=false;state.navGnssLast=0;
  resetNavigationVoice();renderNavigationLanes(null,false);
  state.navFollowId=-2;state.navDemoActive=true;state.navDemoPaused=false;
  setNavigationSignalState('demo');
  state.navDemoProgress=0;state.navDemoLastTime=performance.now();state.navFollowLast=0;
  state.navFollowCameraSuspended=false;
  $('page-map').classList.add('navigation-demo');
  const geoElement=state.geoMarker?.getElement?.();if(geoElement)geoElement.hidden=true;
  $('map-demo-play').hidden=true;$('map-demo-pause').hidden=false;$('map-demo-end').hidden=false;
  $('map-demo-pause').textContent='Pause';
  advanceNavigationDemo(state.navDemoLastTime);
  if(!state.navDemoPaused)state.navDemoTimer=setInterval(()=>advanceNavigationDemo(performance.now()),300);
}
$('map-demo-play').addEventListener('click',playNavigationDemo);
$('map-demo-pause').addEventListener('click',()=>{
  if(!state.navDemoActive)return;
  if(state.navDemoPaused){playNavigationDemo();return;}
  state.navDemoPaused=true;state.navDemoLastTime=performance.now();
  $('map-demo-pause').textContent='Resume';
  $('map-demo-status').textContent='DEMO paused · Resume or End DEMO.';
});
$('map-demo-end').addEventListener('click',()=>{
  if(!state.navDemoActive)return;
  stopNavigationFollow();
  setMapDestinationStatus('DEMO ended. The real road plan is still available; no GPS history was saved.');
});


// When leaving the map, do not silently continue collecting browser positions.
$('map-destination-form').addEventListener('submit',async event=>{
  event.preventDefault();
  setMapDestinationStatus('Resolving destination…');
  const button=$('map-start-navigation');button.disabled=true;
  try {await quickDestinationPreview($('map-destination-query').value,state.navTravelMode);} catch(err){setMapDestinationStatus(err.message,'error');}
  finally {button.disabled=false;}
  syncMapPickedAction();
});
for(const id of ['nav-start-lat','nav-start-lon']) {
  $(id).addEventListener('input',()=>{state.navOriginManual=true;
    state.navPickedOrigin=null;
    $('nav-start-query').value='';
    $('map-origin-query').value='';
    syncMapOriginSummary();
    if(state.navPreview || state.navRouteChoices)resetRouteForNewDestination();
    renderNavigationOverlay();
    $('nav-origin-status').textContent='Custom starting point selected. Use fresh browser location to reset it.';});
}
function setMessagesSubpagesOpen(open) {
  $('messages-nav-subpages').hidden = !open;
  $('messages-nav-toggle').setAttribute('aria-expanded', String(open));
}
$('messages-nav-toggle').addEventListener('click', () => {
  setMessagesSubpagesOpen($('messages-nav-subpages').hidden);
});
$('mesh-header-button').addEventListener('click',()=>{
  closeMapFeatureInfo();
  const menu=$('header-messages-choices');
  menu.hidden=!menu.hidden;
  $('mesh-header-button').setAttribute('aria-expanded',String(!menu.hidden));
  if(!menu.hidden)menu.querySelector('button')?.focus();
});
document.addEventListener('click',event=>{
  if(!event.target.closest('#header-messages-menu'))closeHeaderMessageMenu();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('header-messages-choices').hidden){
    event.preventDefault();closeHeaderMessageMenu(true);
  }
});
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.jump)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('map-add-observation').addEventListener('click',()=>openObservation());
document.addEventListener('click',event=>{
  if(event.target.closest?.('#header-wifi-button,#field-clock-button,#map-style,#map-vector-source'))closeMapFeatureInfo();
},true);
document.addEventListener('change',event=>{
  if(event.target.closest?.('#map-survey-panel input'))closeMapFeatureInfo();
},true);
document.addEventListener('openrf:sdr-sites-changed', refreshSdrSitesOnly);
$('sdr-sites-show-map').addEventListener('change',updateMap);
$('sdr-sites-session-filter').addEventListener('change',()=>{updateSdrSiteMapCount();updateMap();});
$('sdr-sites-map-export').addEventListener('click',()=>{
  if (!filteredSdrSites().length || !confirm('Export precise browser operator coordinates for completed SDR sweeps? Sharing this GeoJSON may disclose your field survey positions.')) return;
  const sessionId=$('sdr-sites-session-filter').value;
  const a=document.createElement('a');a.href='/api/sdr/survey/sites.geojson'+(sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '');
  a.download='openrf-sdr-observer-sites.geojson';document.body.append(a);a.click();a.remove();
});
$('waypoint-session').addEventListener('change', renderWaypointSelection);
$('waypoint-show-map').addEventListener('change', updateMap);
$('waypoint-record').addEventListener('click', recordWaypoint);
$('waypoint-export').addEventListener('click',()=>{
  const sessionId = Number($('waypoint-session').value);
  if (!sessionId || !confirm('Export precise browser-reported location coordinates for this investigation as GeoJSON? The download stays local but sharing the file could reveal survey locations.')) return;
  const link = document.createElement('a');
  link.href = `/api/survey/waypoints.geojson?session_id=${sessionId}`;
  link.download = `openrf-survey-waypoints-${sessionId}.geojson`;
  document.body.append(link); link.click(); link.remove();
});
$('waypoint-list').addEventListener('click',e=>{
  const view=e.target.closest('[data-waypoint-view]');
  const del=e.target.closest('[data-waypoint-delete]');
  if(view) {
    const w=state.waypoints.find(row=>row.id===Number(view.dataset.waypointView));
    if(w) (state.map || state.rasterMap)?.flyTo({center:[w.longitude,w.latitude],zoom:14});
  }
  if(del && confirm('Permanently delete this local survey waypoint?')) runAction(async()=>{
    await api(`/api/survey/waypoints/${Number(del.dataset.waypointDelete)}`,'DELETE');
    await refresh(); flash('Survey waypoint deleted. No observations or capture data were changed.');
  });
});
$('add-discovery').addEventListener('click',()=>openObservation());
$('new-session').addEventListener('click',()=>{
  if(activeFieldSurvey()) return flash('Stop the active investigation before starting another.',true);
  $('session-dialog').showModal();
});
$('field-open-receiver').addEventListener('click',()=>{
  const current=activeFieldSurvey();if(!current)return;
  const page=FIELD_RECEIVERS[current.receiver_plan]?.page || 'hardware';
  showPage(page);
  if(page==='scanner' && current.receiver_plan==='BLE_BLUEZ') $('scan-ble-once').focus();
  else if(page==='scanner') $('scan-wifi-once').focus();
  else if(page==='hardware') $('refresh-hardware').focus();
});
$('field-open-map').addEventListener('click',()=>showPage('map'));
$('field-add-observation').addEventListener('click',()=>{$('observation-dialog').showModal();});
$('field-edit-plan').addEventListener('click',()=>{
  const active=activeFieldSurvey();if(!active)return;
  const form=$('field-plan-form');
  for(const key of ['receiver_plan','site_label','objective','field_notes']) form.elements[key].value=active[key] || (key==='receiver_plan'?'UNASSIGNED':'');
  $('field-plan-dialog').showModal();
});
$('field-plan-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{
    const active=activeFieldSurvey();if(!active)throw Error('This survey is no longer active. Refresh before editing.');
    const data=Object.fromEntries(new FormData(e.target).entries());
    await api(`/api/sessions/${active.id}/plan`,'POST',data);
    $('field-plan-dialog').close();flash('Survey plan updated. Previously saved evidence was not changed.');await refresh();
  });
});
$('show-demo-map').addEventListener('change',e => {state.showDemo = e.target.checked;$('show-demo-map-sheet').checked=e.target.checked;updateMap();renderMapSurveyPanel();});
for(const option of document.querySelectorAll('#map-survey-panel input[name="map-basemap"]')){
  option.addEventListener('change',()=>{if(option.checked)selectBaseMap(option.value);});
}
$('map-style').addEventListener('click',()=>{
  state.baseMap='default';
  rememberBaseMap('default');
  state.style = state.style==='dark'?'light':'dark';
  updateBaseMapPicker();
  if (state.map) {state.mapReady=false;state.map.setStyle(openrfMapStyleUrl(), {diff:false});}
  if (state.rasterMap) {
    for(const image of state.rasterMap.tileNodes.values())image.remove();
    state.rasterMap.tileNodes.clear();state.rasterMap.failedTiles.clear();
    state.rasterMap.render();
  }
  $('map-style').textContent=state.style==='dark'?'OpenRF Light':'OpenRF Dark';
});
$('map-vector-source').addEventListener('click',()=>{
  if (!state.mapVectorOffline && !(state.vectorStatus?.ready && state.vectorStatus?.fonts_ready)) {
    $('map-vector-status').textContent='Offline vector tiles are unavailable; verify local map installation first.';
    return;
  }
  state.mapVectorOffline=!state.mapVectorOffline;
  state.baseMap='default';
  rememberBaseMap('default');
  state.mapRegionalFramePending=state.mapVectorOffline;
  state.mapVectorPreference=state.mapVectorOffline?'offline':'online';
  rememberVectorPreference(state.mapVectorPreference);
  state.mapOfflineRecoveryTried=false;
  updateOpenRFVectorButtons();updateOfflineAttribution();
  if (state.map) {
    state.mapReady=false;
    state.map.setStyle(openrfMapStyleUrl(), {diff:false});
  } else if (state.rasterMap) {
    state.preferredView={center:[...state.rasterMap.center],zoom:state.rasterMap.zoom};
    state.rasterMap.stop();state.rasterMap=null;
    $('map').replaceChildren();$('map').classList.remove('raster-mode','raster-dark');startMap();
  }
  $('map-vector-status').textContent=state.mapVectorOffline ?
    'Local regional vector source selected. Tile requests stay within OpenRF. Outside Amador/Calaveras, blank coverage is expected.' :
    'Online OpenRF vector source selected. Map tiles and font requests may use OpenFreeMap.';
});
$('map-geolocate').addEventListener('click',()=>locateMap(true));
$('map-geolocate-sheet').addEventListener('click',()=>locateMap(true));
$('map-style-sheet').addEventListener('click',()=>$('map-style').click());
$('map-mode-sheet').addEventListener('click',()=>$('map-mode').click());
$('show-demo-map-sheet').addEventListener('change',e=>{ $('show-demo-map').checked=e.target.checked;$('show-demo-map').dispatchEvent(new Event('change')); });
$('map-mode').addEventListener('click',()=>{
  if (!state.rasterMap) {state.baseMap='default';rememberBaseMap('default');updateBaseMapPicker();switchToRasterMap('Offline raster/coordinate mode selected.');return;}
  state.preferredView={center:[...state.rasterMap.center],zoom:state.rasterMap.zoom};
  state.rasterMap.stop();
  state.rasterMap=null;
  $('map').replaceChildren(); $('map').classList.remove('raster-mode','raster-dark');
  startMap();
});
async function scanWifiOnce() {
  const buttons = [$('scan-wifi-once'), $('map-scan-wifi')];
  buttons.forEach(button => {button.disabled=true; button.dataset.oldText=button.textContent; button.textContent='Scanning…';});
  $('map-survey-status').textContent = 'Requesting Linux Wi-Fi scan…';
  // Capture the observer position at scan request time only; a later browser
  // location may be elsewhere and must not be attached retroactively.
  const atRequest = state.browserLocation;
  const ageAtRequest = atRequest ? (Date.now() - atRequest.capturedAt) / 1000 : Infinity;
  const atScanPosition = atRequest && ageAtRequest >= 0 && ageAtRequest <= 60 ?
    {latitude:atRequest.lat, longitude:atRequest.lon, accuracy_m:atRequest.accuracy,
     fix_age_seconds:Math.round(ageAtRequest * 10) / 10} : null;
  try {
    state.wifiScan = await api('/api/wifi/scan', 'POST', {});
    state.wifiScan.observerAtRequest = atScanPosition;
    renderWifiScan(); renderMapSurveyPanel(); updateCaptureButtons();
    $('map-survey-status').textContent = `${state.wifiScan.records.length} access point(s) returned. Results may be cached; no source coordinates, RSSI dBm, or automatic map pins.`;
    flash(`Received ${state.wifiScan.records.length} Linux Wi-Fi entries. Freshness unverified; nothing stored or mapped.`);
  } catch (error) {
    $('map-survey-status').textContent = `Scan unavailable: ${error.message}`;
    flash(error.message, true);
  } finally {
    buttons.forEach(button => {button.disabled=false; button.textContent=button.dataset.oldText;});
  }
}
async function saveWifiReading(bssid, button) {
  const scan = state.wifiScan;
  if (!scan?.scan_id || !scan.records?.some(n => n.bssid === bssid)) return flash('No verified local scan receipt to save.', true);
  let survey_location = null;
  const loc = state.browserLocation;
  if (loc && Date.now() - loc.capturedAt < 5 * 60 * 1000 && confirm('Attach your browser-reported survey location to this observation? It is NOT the access point location. Click Cancel to save without coordinates.')) {
    survey_location = {latitude:loc.lat, longitude:loc.lon, accuracy_m:loc.accuracy};
  }
  button.disabled = true;
  try {
    const active = state.sessions.find(x => x.status === 'ACTIVE');
    const saved = await api('/api/sensors/networkmanager-wifi/save', 'POST', {scan_id:scan.scan_id, bssid, survey_location, session_id:active?.id || null});
    flash(`Saved verified Linux Wi-Fi retrieval: ${saved.label} (signal quality is not RSSI).`);
    await refresh();
  } catch (error) { flash(error.message, true); }
  finally { button.disabled = false; }
}
$('map-ble-readings').addEventListener('click',e=>{
  const button=e.target.closest('[data-save-ble]');
  if(button)saveBleReading(button.dataset.saveBle,button);
});
for (const id of ['map-wifi-readings', 'live-wifi-results']) {
  $(id).addEventListener('click', e => {
    const button = e.target.closest('[data-save-wifi]');
    if (button) saveWifiReading(button.dataset.saveWifi, button);
  });
}


function updateCaptureButtons() {
  for (const id of ['map-save-scan', 'scanner-save-scan']) $(id).disabled = !state.wifiScan?.scan_id;
}
function surveyLocationForCapture(attach) {
  if (!attach) return null;
  const position = state.wifiScan?.observerAtRequest;
  if (!position) throw Error('No recent browser location existed when this scan was requested. Use My location and run a NEW Wi-Fi scan, or save without coordinates.');
  return position;
}
async function saveScanSnapshot() {
  const scan = state.wifiScan;
  if (!scan?.scan_id) return flash('Run a new Linux Wi-Fi scan before saving a snapshot.', true);
  const attach = $('map-capture-location').checked;
  return runAction(async () => {
    const survey_location = surveyLocationForCapture(attach);
    if (!confirm(`Save this real NetworkManager retrieval (${scan.records.length} returned access point(s))?${attach ? ' Browser-reported survey location will be attached, not an access-point location.' : ' No coordinates will be stored.'}`)) return;
    const active = state.sessions.find(x => x.status === 'ACTIVE');
    const data = await api('/api/sensors/networkmanager-wifi/save-scan', 'POST', {
      scan_id: scan.scan_id, session_id: active?.id || null, survey_location,
    });
    // A receipt can be captured only once. Leave the observed values visible but disable saves.
    scan.scan_id = null;
    renderWifiScan(); renderMapSurveyPanel(); updateCaptureButtons();
    flash(`Saved snapshot #${data.id}: ${data.saved_count} Wi-Fi result(s) · ${data.location_source === 'BROWSER_REPORTED' ? 'browser survey position' : 'no position'} · cached results possible.`);
    await refresh();
  });
}
for (const checkbox of ['map-capture-location', 'scanner-capture-location']) {
  $(checkbox).addEventListener('change', event => {
    $('map-capture-location').checked = event.target.checked;
    $('scanner-capture-location').checked = event.target.checked;
  });
}
$('map-save-scan').addEventListener('click', saveScanSnapshot);
$('scanner-save-scan').addEventListener('click', saveScanSnapshot);

function renderBleScan() {
  const out = $('live-ble-results');
  const scan = state.bleScan;
  if (!scan) return;
  const rows = scan.records || [];
  out.innerHTML = `<p class="muted tiny">${escapeHTML(scan.controller)} · Retrieved ${escapeHTML(stamp(scan.retrieved_at_utc))} · ${rows.length} LE device(s). ${escapeHTML(scan.freshness)}. Signal RSSI when supplied by BlueZ is not distance. Device addresses may rotate.</p>` +
    (rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>DEVICE</th><th>ADDRESS*</th><th>RSSI</th><th>SAVE</th></tr></thead><tbody>${rows.map(row=>`<tr><td data-label="Device">${escapeHTML(row.name || '(unnamed)')}</td><td data-label="Address">${escapeHTML(row.address)}</td><td data-label="RSSI">${escapeHTML(format(row.rssi_dbm,' dBm'))}</td><td data-label="Save"><button type="button" class="btn mini outline" data-save-ble="${escapeHTML(row.address)}" ${scan.scan_id ? '' : 'disabled'}>Save</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">BlueZ returned no LE device events during this request. This does not establish that no devices are nearby.</div>');
}
async function scanBleOnce() {
  const btn = $('scan-ble-once'); btn.disabled = true; btn.textContent = 'Scanning LE…';
  $('ble-scan-status').textContent = 'Running a short Linux BlueZ LE-only scan; no results saved automatically…';
  const atRequest = state.browserLocation;
  const age = atRequest ? (Date.now() - atRequest.capturedAt) / 1000 : Infinity;
  const position = atRequest && age >= 0 && age <= 60 ?
    {latitude:atRequest.lat, longitude:atRequest.lon, accuracy_m:atRequest.accuracy, fix_age_seconds:Math.round(age*10)/10} : null;
  try {
    state.bleScan = await api('/api/ble/scan', 'POST', {});
    state.bleScan.observerAtRequest = position;
    $('ble-scan-status').textContent = `${state.bleScan.records.length} LE device event(s) from BlueZ. Retrieval time is not exact advertisement time; nothing saved or mapped.`;
    renderBleScan(); renderMapSurveyPanel();
  } catch(error) {
    state.bleScan = null;
    $('ble-scan-status').textContent = `BLE unavailable: ${error.message}`;
    $('live-ble-results').innerHTML = '<div class="empty">No confirmed LE scan results. Check Bluetooth readiness in Hardware; WSL may lack a Linux-visible controller.</div>';
    flash(error.message, true); renderMapSurveyPanel();
  } finally {btn.disabled = false;btn.textContent = 'Scan nearby LE devices once';}
}
async function saveBleReading(address, button) {
  const scan = state.bleScan;
  if (!scan?.scan_id || !scan.records.some(row=>row.address===address)) return flash('No verified BLE scan receipt to save.',true);
  const attach = scan.observerAtRequest && confirm('Attach browser-reported observer position from the BLE scan time? This is NOT the BLE transmitter location. Cancel saves without a location.');
  button.disabled = true;
  try {
    const active = state.sessions.find(row=>row.status==='ACTIVE');
    const saved = await api('/api/sensors/linux-ble/save','POST',{
      scan_id:scan.scan_id,address,session_id:active?.id||null,
      survey_location: attach ? scan.observerAtRequest : null,
    });
    flash(`Saved real BlueZ LE retrieval: ${saved.label}. The identifier may rotate; RSSI is not distance.`);
    await refresh();
  } catch(error){ flash(error.message,true); button.disabled=false; }
}
$('scan-ble-once').addEventListener('click', scanBleOnce);
$('live-ble-results').addEventListener('click',e=>{
  const button=e.target.closest('[data-save-ble]');
  if(button) saveBleReading(button.dataset.saveBle,button);
});
$('scan-wifi-once').addEventListener('click', scanWifiOnce);
$('map-scan-wifi').addEventListener('click', scanWifiOnce);
$('map-scan-ble').addEventListener('click', scanBleOnce);
$('map-survey-toggle').addEventListener('click', () => { if (activeMapTool) closeMapToolOverlay(); setMapSurveyOpen($('map-survey-panel').hidden); });
$('map-survey-close').addEventListener('click', () => setMapSurveyOpen(false));
for(const id of ['map-metric-mode','map-survey-age']) $(id).addEventListener('change',()=>{
  state.mapObservationId=null;
  updateMap();renderMapSurveyPanel();
});
$('map-wireless-recent').addEventListener('click',event=>{
  const button=event.target.closest('[data-map-inspect]');
  if(button)selectMapObservation(Number(button.dataset.mapInspect));
});
$('map-observation-detail').addEventListener('click',event=>{
  if(event.target.closest('#map-detail-close')) {state.mapObservationId=null;renderMapObservationDetail();updateMap();return;}
  const zoom=event.target.closest('[data-map-detail-zoom]');
  if(zoom){
    const item=state.observations.find(o=>String(o.id)===zoom.dataset.mapDetailZoom);
    if(item&&state.map)state.map.flyTo({center:[item.longitude,item.latitude],zoom:15});
    else if(item&&state.rasterMap)state.rasterMap.flyTo({center:[item.longitude,item.latitude],zoom:15});
  }
  const view=event.target.closest('[data-map-series]');
  if(view){
    state.mapSurveySeriesKey=view.dataset.mapSeries;
    renderMapSpatialSurvey();updateMap();
    $('map-series-detail').scrollIntoView?.({block:'nearest'});
  }
  const history=event.target.closest('[data-map-history]');
  if(history){
    showPage('scanner');
    $('signal-select').value=history.dataset.mapHistory;
    drawHistory();
    $('signal-select').scrollIntoView?.({block:'start'});
  }
});
$('map-series-detail').addEventListener('click',event=>{
  if(event.target.closest('[data-map-series-clear]')){
    state.mapSurveySeriesKey=null;renderMapSpatialSurvey();updateMap();return;
  }
  const active=activeMapSpatialSurvey();if(!active)return;
  if(event.target.closest('[data-map-series-fit]')){
    const samples=active.spatial.samples;
    if(state.map && samples.length){
      const lats=samples.map(p=>p.lat),lons=samples.map(p=>p.lon);
      state.map.fitBounds([[Math.min(...lons)-.002,Math.min(...lats)-.002],[Math.max(...lons)+.002,Math.max(...lats)+.002]],
        {padding:{top:Math.min(200,Math.floor($('map').clientHeight*.35)),bottom:45,left:35,right:40},maxZoom:16,duration:500});
    }else if(state.rasterMap && samples.length){
      const lats=samples.map(p=>p.lat),lons=samples.map(p=>p.lon);
      state.rasterMap.flyTo({center:[(Math.min(...lons)+Math.max(...lons))/2,(Math.min(...lats)+Math.max(...lats))/2],zoom:13});
    }
  }
  if(event.target.closest('[data-map-series-export]')){
    if(!confirm('Export the precise saved OBSERVER coordinates for this signal? This local CSV can reveal private survey locations. It does not identify the transmitter.'))return;
    const result=window.OpenRFHistoryAnalysis.history(active.series,'all');
    const csv=window.OpenRFHistoryAnalysis.historyCsv(active.series,result,true);
    if(!csv)return;
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='openrf-observer-signal-survey.csv';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    flash(`Exported ${active.spatial.total} saved HISTORICAL signal measurements with observer coordinates. No upload.`);
  }
});
document.querySelectorAll('[data-map-kind]').forEach(input => input.addEventListener('change', () => {
  if (input.checked) state.mapKinds.add(input.dataset.mapKind);
  else state.mapKinds.delete(input.dataset.mapKind);
  saveMapLayerVisibility();
  updateMap(); renderMapSurveyPanel();
}));
$('usb-sensor-probe').addEventListener('click',()=>runAction(()=>runSerialSensor(false)));
$('usb-sensor-capture').addEventListener('click',()=>runAction(()=>runSerialSensor(true)));
$('hardware-readiness-export').addEventListener('click', downloadHardwareReadiness);
$('refresh-hardware').addEventListener('click',()=>runAction(async()=>{
  const [hardware, registry, diagnostics, readiness, hardwareManager] = await Promise.all([
    api('/api/hardware'), api('/api/sensors'), api('/api/sensors/diagnostics'), api('/api/hardware/readiness'), api('/api/hardware/manager')
  ]);
  state.hardware = hardware; state.sensors = registry.sensors;
  state.serialTransport = registry.serial_transport; state.diagnostics = diagnostics;
  state.readiness = readiness; state.hardwareManager = hardwareManager;
  renderHardware(); renderHardwareManager(); renderSensorRegistry(); renderSerialPorts(); renderHardwareReadiness();
  flash('Read-only Linux hardware inventory and diagnostics refreshed. No RF scan started.');
}));
$('discovery-search').addEventListener('input',renderDiscoveries);
for (const id of ['discovery-kind','discovery-source','discovery-session','discovery-age','discovery-sort','discovery-mapped','show-demo-list']) {
  $(id).addEventListener('change',renderDiscoveries);
}
$('discovery-reset').addEventListener('click',resetDiscoveryFilters);
$('discovery-export').addEventListener('click',downloadShownDiscoveries);
$('signal-select').addEventListener('change',drawHistory);
$('history-window').addEventListener('change',drawHistory);
$('history-include-demo').addEventListener('change',refreshHistorySeries);
$('history-export').addEventListener('click',exportHistoryCsv);
$('compare-series').addEventListener('change',()=>renderComparisonResult());
$('compare-mode').addEventListener('change',()=>renderComparisonResult());
$('compare-before-session').addEventListener('change',()=>renderComparisonResult());
$('compare-after-session').addEventListener('change',()=>renderComparisonResult());
$('compare-include-demo').addEventListener('change',renderComparison);
$('compare-export').addEventListener('click',exportComparisonCsv);
$('discoveries-list').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete]'); const zoom=e.target.closest('[data-zoom]');
  if(zoom) zoomToRecord(Number(zoom.dataset.zoom));
  if(del && confirm('Permanently delete this local observation?')) runAction(async()=>{await api(`/api/observations/${del.dataset.delete}`,'DELETE');flash('Record deleted.');await refresh();});
});
$('session-report-select').addEventListener('change', updateSessionReportSelector);
$('session-report-preview').addEventListener('click', () => openSessionReport('html'));
$('session-report-html').addEventListener('click', () => openSessionReport('html', true));
$('session-report-json').addEventListener('click', () => openSessionReport('json', true));
$('session-list').addEventListener('click',e=>{
  const stop=e.target.closest('[data-stop]'); const view=e.target.closest('[data-session-filter]');
  const report=e.target.closest('[data-session-report]');
  if(report) { $('session-report-select').value = report.dataset.sessionReport; updateSessionReportSelector(); $('session-report-select').focus(); }
  if(stop) runAction(async()=>{await api(`/api/sessions/${stop.dataset.stop}/stop`,'POST',{});flash('Session stopped.');await refresh();});
  if(view) {const selected = String(view.dataset.sessionFilter);resetDiscoveryFilters();$('discovery-session').value=selected; $('discovery-refine').open=true;renderDiscoveries();showPage('discoveries');flash(`Showing saved observations from investigation #${selected}. Choose Clear filters to return to all records.`);}
});
$('observation-use-location').addEventListener('click', useLocationForObservation);
$('observation-dialog').addEventListener('close', () => {
  ++observationLocationRequestId;
  observationLocationFix = null;
  $('observation-use-location').disabled = false;
});
for (const name of ['latitude','longitude']) {
  $('observation-form').elements[name].addEventListener('input', observationCoordinateEdited);
}
$('observation-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{
    const values=Object.fromEntries(new FormData(e.target).entries());
    if (values.location_source === 'BROWSER_REPORTED') {
      const age = observationLocationFix ? (Date.now()-observationLocationFix.reportedAt)/1000 : Infinity;
      if (!Number.isFinite(age) || age < -5 || age > 60) {
        throw Error('Browser location is now over 60 seconds old. Press Use my location again before saving, or enter the coordinates manually.');
      }
      values.fix_age_seconds = Math.max(0,age).toFixed(1);
    }
    const active=state.sessions.find(s=>s.status==='ACTIVE');
    if(active) values.session_id=active.id;
    await api('/api/observations','POST',values);
    $('observation-dialog').close();flash('Manual observation stored locally. Coordinates, if provided, are survey positions.');await refresh();
  });
});
$('session-form').addEventListener('submit',e=>{
  e.preventDefault();runAction(async()=>{
    const values=Object.fromEntries(new FormData(e.target).entries());
    await api('/api/sessions','POST',values);
    $('session-dialog').close();e.target.reset();
    flash('Field survey started. Planned receiver selected; no hardware was activated or location recorded.');await refresh();
  });
});
$('load-demo').addEventListener('click',()=>runAction(async()=>{
  const answer=await api('/api/demo/load','POST',{});
  flash(answer.created?`Created ${answer.created} clearly labeled synthetic test records.`:'Demo records were already loaded.');await refresh();
}));
$('clear-demo').addEventListener('click',()=>runAction(async()=>{const out=await api('/api/demo/clear','POST',{});flash(`Removed ${out.removed} synthetic record(s).`);await refresh();}));

// Check the bundled local vector archive before the first map is constructed.
// An unresponsive assets endpoint must not prevent the whole UI from opening.
async function openInitialPage(){
  await Promise.race([refreshOpenRFVectorMapStatus(),new Promise(resolve=>setTimeout(resolve,1800))]);
  showPage(rememberedPage());
}
// Refresh restores this tab; a new launch or navigation starts on Overview. Vector source
// preference is separate and persists across tabs without storing coordinates.
openInitialPage().catch(error=>{console.warn('Vector readiness preflight:',error);showPage(rememberedPage());});
refresh().catch(e=>flash(`OpenRF data refresh failed: ${e.message}. The server may still be running.`,true));
refreshOfflineMaps().catch(e=>{ $('offline-map-status').textContent = `Unable to list local maps: ${e.message}`; });
refreshAreaPlans().catch(e=>{ $('area-saved-detail').textContent = `Saved area plans unavailable: ${e.message}`; });
refreshNavigationDestinations().catch(e=>{ $('nav-destination-list').textContent=`Local destinations unavailable: ${e.message}`; });

if(typeof window!=='undefined' && window.OpenRFMeshDashboard) window.OpenRFMeshDashboard.redraw=()=>{if(state.rasterMap)state.rasterMap.render();else if(state.mapReady)window.OpenRFMeshDashboard.vector(state.map);};

if(typeof window!=='undefined' && window.OpenRFPublicMesh) window.OpenRFPublicMesh.redraw=()=>{if(state.rasterMap)state.rasterMap.render();else if(state.mapReady)window.OpenRFPublicMesh.vector(state.map,true);};
