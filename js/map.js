/* Mapping: MapLibre GL with switchable 2D/3D, topo, satellite, lidar hillshade, slope,
   public/private land, NHD water and DEM "potential water". All sources are free, no API key. */
const MapView = (() => {
  const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services/';
  const EPQS = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image&renderingRule=';
  const rf = n => encodeURIComponent(JSON.stringify({ rasterFunction: n }));
  const BLM = 'https://gis.blm.gov/arcgis/rest/services/lands/';
  const NHD = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/';
  const BASES = {
    usgstopo: { name: 'Topo – USGS', tiles: [USGS + 'USGSTopo/MapServer/tile/{z}/{y}/{x}'], max: 16, attr: 'USGS The National Map' },
    otm: { name: 'Topo – OpenTopoMap', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], max: 17, attr: '© OpenStreetMap contributors, SRTM | style © OpenTopoMap (CC-BY-SA)' },
    usgsimg: { name: 'Satellite – USGS imagery', tiles: [USGS + 'USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'], max: 16, attr: 'USGS The National Map: orthoimagery' },
    esri: { name: 'Satellite – Esri World Imagery', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19, attr: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    hybrid: { name: 'Hybrid – USGS imagery + topo', tiles: [USGS + 'USGSImageryTopo/MapServer/tile/{z}/{y}/{x}'], max: 16, attr: 'USGS The National Map' },
    lidar: { name: 'Lidar hillshade – USGS 3DEP', tiles: [EPQS + rf('Hillshade Multidirectional')], max: 17, attr: 'USGS 3DEP elevation (lidar where available; coverage varies)', note: '3DEP lidar-derived hillshade where lidar exists; elsewhere 10–30 m elevation. Coverage varies.' },
    slope: { name: 'Slope – USGS 3DEP', tiles: [EPQS + rf('Slope Map')], max: 17, attr: 'USGS 3DEP elevation' },
    osm: { name: 'Roads – OpenStreetMap', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, attr: '© OpenStreetMap contributors' }
  };
  const SMA_COLORS = [['BLM', '#FEE67A'], ['USFS', '#CCEBC5'], ['NPS', '#CAB2D6'], ['FWS', '#7FCCA7'], ['State', '#B3E3EE'], ['BIA / Tribal', '#FDB46C'], ['DOD', '#FBB4CE'], ['USBR', '#FFFFB3'], ['Local / Other', '#C9C9C9'], ['Private', '#D63C3C']];
  const AGENCY = { BLM: 'Bureau of Land Management', USFS: 'US Forest Service', NPS: 'National Park Service', FWS: 'US Fish & Wildlife Service', USFW: 'US Fish & Wildlife Service', BOR: 'Bureau of Reclamation', USBR: 'Bureau of Reclamation', BIA: 'Bureau of Indian Affairs (tribal land)', DOD: 'Department of Defense', ST: 'State land (state trust / wildlife area etc.)', STATE: 'State land', LG: 'Local government', LOC: 'Local government', PVT: 'Private or unknown ownership', UND: 'Undetermined', OTHFE: 'Other federal' };
  const PAD_ACCESS = { OA: 'Open access', RA: 'Restricted access', XA: 'Closed', UK: 'Unknown access' };

  let map, markers = new Map(), state = { base: 'usgstopo', is3d: false, overlays: { public: false, private: false, water: false, pwater: false, shade: false } };
  let pwScan = null;
  // Potential-water overlay served as raster tiles cut from the last scan (image sources lose alpha on some GPUs).
  maplibregl.addProtocol('pwater', async (params) => {
    const m = params.url.match(/pwater:\/\/(\d+)\/(\d+)\/(\d+)/); const z = +m[1], x = +m[2], y = +m[3];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    if (pwScan) { const k = 2 ** (pwScan.z - z), sx = x * 256 * k - pwScan.x0 * 256, sy = y * 256 * k - pwScan.y0 * 256; const g = c.getContext('2d'); g.imageSmoothingEnabled = k < 1 ? false : true; g.drawImage(pwScan.canvas, sx, sy, 256 * k, 256 * k, 0, 0, 256, 256); }
    const b = await new Promise(r => c.toBlob(r, 'image/png')); return { data: await b.arrayBuffer() };
  });
  let hot = [], nhdCache = new Map(), nhdData = { flow: [], body: [], pt: [] }, centerMode = false;

  // Private land: BLM SMA cached tiles WITH private/unknown (white) -> recolour white pixels red, everything else transparent.
  maplibregl.addProtocol('pvt', async (params) => {
    const r = await fetch(params.url.replace('pvt://', 'https://'));
    if (!r.ok) { // BLM returns 404 where it has no tile: hand back a blank tile
      const e = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(1, 1) : Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
      const b = e.convertToBlob ? await e.convertToBlob({ type: 'image/png' }) : await new Promise(res => e.toBlob(res, 'image/png'));
      return { data: await b.arrayBuffer() };
    }
    const bmp = await createImageBitmap(await r.blob());
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const white = d[i] > 243 && d[i + 1] > 243 && d[i + 2] > 243;
      if (white) { d[i] = 214; d[i + 1] = 60; d[i + 2] = 60; d[i + 3] = 120; } else d[i + 3] = 0;
    }
    g.putImageData(im, 0, 0);
    const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(res => c.toBlob(res, 'image/png'));
    return { data: await blob.arrayBuffer() };
  });

  function style() {
    const sources = {}, layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#20261c' } }];
    for (const [k, b] of Object.entries(BASES)) {
      sources['b_' + k] = { type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: b.max, attribution: b.attr };
      layers.push({ id: 'b_' + k, type: 'raster', source: 'b_' + k, layout: { visibility: k === state.base ? 'visible' : 'none' } });
    }
    sources.dem = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium', attribution: 'Terrain: Mapzen/AWS Terrain Tiles (USGS 3DEP, SRTM)' };
    sources.demshade = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' };
    layers.push({ id: 'shade', type: 'hillshade', source: 'demshade', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1a1a1a' } });
    sources.pub = { type: 'raster', tiles: [BLM + 'BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 14, attribution: 'Land: BLM Surface Management Agency' };
    layers.push({ id: 'pub', type: 'raster', source: 'pub', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.5 } });
    sources.pvt = { type: 'raster', tiles: ['pvt://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 14 };
    layers.push({ id: 'pvt', type: 'raster', source: 'pvt', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } });
    sources.nhdr = { type: 'raster', tiles: [NHD + 'export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:4,6,10,12&f=image'], tileSize: 256, attribution: 'Water: USGS NHD' };
    layers.push({ id: 'nhdr', type: 'raster', source: 'nhdr', maxzoom: 13, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } });
    const empty = { type: 'FeatureCollection', features: [] };
    sources.nhdflow = { type: 'geojson', data: empty }; sources.nhdbody = { type: 'geojson', data: empty }; sources.nhdpt = { type: 'geojson', data: empty };
    layers.push({ id: 'nhd-body', type: 'fill', source: 'nhdbody', minzoom: 12.5, layout: { visibility: 'none' }, paint: { 'fill-color': '#3fa9f5', 'fill-opacity': 0.55, 'fill-outline-color': '#0b5fa5' } });
    layers.push({ id: 'nhd-perennial', type: 'line', source: 'nhdflow', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'perennial'], layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': '#1e88ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 4.5] } });
    layers.push({ id: 'nhd-intermittent', type: 'line', source: 'nhdflow', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'intermittent'], layout: { visibility: 'none' }, paint: { 'line-color': '#4fc3ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 17, 3.2], 'line-dasharray': [3, 2] } });
    layers.push({ id: 'nhd-ephemeral', type: 'line', source: 'nhdflow', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'ephemeral'], layout: { visibility: 'none' }, paint: { 'line-color': '#9fdcff', 'line-width': 1.2, 'line-dasharray': [1, 2.5], 'line-opacity': 0.9 } });
    layers.push({ id: 'nhd-other', type: 'line', source: 'nhdflow', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'other'], layout: { visibility: 'none' }, paint: { 'line-color': '#2a7fd0', 'line-width': 1.5 } });
    layers.push({ id: 'nhd-pt', type: 'circle', source: 'nhdpt', minzoom: 11, layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': '#00e0ff', 'circle-stroke-color': '#00334d', 'circle-stroke-width': 2 } });
    sources.tracks = { type: 'geojson', data: empty };
    layers.push({ id: 'trk-case', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.55 } });
    layers.push({ id: 'trk', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['coalesce', ['get', 'color'], '#ffd400'], 'line-width': 3.5 } });
    return { version: 8, sources, layers };
  }

  async function init() {
    if (map) return;
    const saved = await DB.setting('map');
    if (saved) Object.assign(state, saved, { overlays: Object.assign(state.overlays, saved.overlays || {}) });
    state.overlays.pwater = false;
    map = new maplibregl.Map({ container: 'map', style: style(), center: saved?.center || [-106.5, 39.0], zoom: saved?.zoom ?? 6.3, maxPitch: 80, attributionControl: { compact: true }, hash: false });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
    map.on('load', () => { applyState(); refreshData(); });
    map.on('moveend', () => { saveState(); if (map.terrain && map._elevationFreeze) { map._elevationFreeze = false; map.triggerRepaint(); } /* MapLibre 4: an interrupted ease can leave terrain elevation frozen (camera ends up inside the hills) */ if (state.overlays.water) loadNHD(); updateWaterBtn(); });
    map.on('click', onClick);
    map.on('idle', () => { if (map.terrain && map._elevationFreeze && !map.isMoving()) { map._elevationFreeze = false; map.triggerRepaint(); } });
    map.on('error', e => console.warn('map', e.error && e.error.message));
    document.getElementById('btnLayers').onclick = toggleLayerPanel;
    document.getElementById('btn3d').onclick = () => { state.is3d = !state.is3d; apply3d(true); saveState(); };
    document.getElementById('btnLocate').onclick = locate;
    document.getElementById('btnImport').onclick = () => document.getElementById('gpxInput').click();
    document.getElementById('btnDropPin').onclick = dropCenter;
    document.getElementById('btnWaterScan').onclick = scanWater;
  }
  function saveState() { if (!map) return; const c = map.getCenter(); DB.setting('map', { base: state.base, is3d: state.is3d, overlays: state.overlays, center: [c.lng, c.lat], zoom: map.getZoom() }); }
  function applyState() {
    for (const k of Object.keys(BASES)) map.setLayoutProperty('b_' + k, 'visibility', k === state.base ? 'visible' : 'none');
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('pub', state.overlays.public); vis('pvt', state.overlays.private); vis('shade', state.overlays.shade);
    ['nhdr', 'nhd-body', 'nhd-perennial', 'nhd-intermittent', 'nhd-ephemeral', 'nhd-other', 'nhd-pt'].forEach(id => vis(id, state.overlays.water));
    if (map.getLayer('pw')) vis('pw', state.overlays.pwater);
    hot.forEach(m => m.getElement().style.display = state.overlays.pwater ? '' : 'none');
    apply3d(false); updateWaterBtn();
    if (state.overlays.water) loadNHD();
  }
  function apply3d(animate) {
    const b = document.getElementById('btn3d');
    b.textContent = state.is3d ? '2D' : '3D'; b.classList.toggle('on', state.is3d);
    if (state.is3d) {
      if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.4 });
      // re-centre once elevation tiles are in so the camera sits above the terrain, not inside it
      const go = () => map.easeTo({ center: map.getCenter(), pitch: animate ? 62 : map.getPitch(), bearing: animate ? (map.getBearing() || -20) : map.getBearing(), duration: animate ? 900 : 0 });
      if (map.isSourceLoaded('dem')) go(); else map.once('idle', go);
    }
    else { map.setTerrain(null); if (animate) map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); }
  }
  function updateWaterBtn() { const b = document.getElementById('btnWaterScan'); if (b && map) b.hidden = !(state.overlays.water && map.getZoom() >= 12); }
  function status(msg, ms) { const s = document.getElementById('mapstatus'); s.textContent = msg || ''; s.classList.toggle('show', !!msg); if (ms) setTimeout(() => s.classList.remove('show'), ms); }

  function toggleLayerPanel() {
    const p = document.getElementById('layerPanel');
    if (!p.hidden) { p.hidden = true; return; }
    const o = state.overlays;
    p.innerHTML = `<div class="spread"><h2>Map layers</h2><button class="sm" id="lpClose">Done</button></div>
      <h3>View</h3><div class="segs"><button data-v="2d" class="${!state.is3d ? 'on' : ''}">2D</button><button data-v="3d" class="${state.is3d ? 'on' : ''}">3D terrain (tilt &amp; rotate)</button></div>
      <p class="mute small">3D: two-finger drag up/down to tilt, twist to rotate, or use the compass buttons.</p>
      <h3>Base map</h3>${Object.entries(BASES).map(([k, b]) => `<label class="opt"><input type="radio" name="base" value="${k}" ${k === state.base ? 'checked' : ''}><span class="grow">${b.name}${b.note ? `<br><span class="mute small">${b.note}</span>` : ''}</span></label>`).join('')}
      <h3>Overlays</h3>
      <label class="opt"><input type="checkbox" data-o="public" ${o.public ? 'checked' : ''}><span class="grow">Public land by agency<br><span class="mute small">BLM Surface Management Agency. Tap the map to see who manages it.</span></span></label>
      <div class="legend">${SMA_COLORS.slice(0, -1).map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>
      <label class="opt"><input type="checkbox" data-o="private" ${o.private ? 'checked' : ''}><span class="grow">Private / unknown ownership<br><span class="mute small">Land no agency manages (red). No owner names or parcel lines – not available free.</span></span></label>
      <label class="opt"><input type="checkbox" data-o="water" ${o.water ? 'checked' : ''}><span class="grow">Water (USGS NHD)<br><span class="mute small">Zoom in past ~13 for streams by type, springs, ponds and tanks. Tap one to pin it.</span></span></label>
      <div class="legend"><span><i style="background:#1e88ff"></i>Perennial</span><span><i style="background:repeating-linear-gradient(90deg,#4fc3ff 0 6px,transparent 6px 9px)"></i>Intermittent</span><span><i style="background:repeating-linear-gradient(90deg,#9fdcff 0 2px,transparent 2px 6px)"></i>Ephemeral</span><span><i style="background:#00e0ff;border-radius:50%"></i>Spring/seep</span><span><i style="background:#3fa9f5"></i>Pond/lake/tank</span></div>
      <label class="opt"><input type="checkbox" data-o="pwater" ${o.pwater ? 'checked' : ''}><span class="grow">Potential water (from terrain)<br><span class="mute small">Run “Scan for potential water” with Water on. Potential water – verify in the field.</span></span></label>
      <label class="opt"><input type="checkbox" data-o="shade" ${o.shade ? 'checked' : ''}><span class="grow">Terrain shading (any base map)</span></label>
      <div class="note red small">Land boundaries are approximate and can be out of date. They are not legal surveys. Check with official sources (BLM, USFS, CPW, WGFD, county assessor) and have permission before crossing or hunting private land. Corner crossing rules vary by state.</div>
      <p class="mute small">Sources: USGS The National Map (topo, imagery, 3DEP elevation, NHD), Esri World Imagery, OpenTopoMap, OpenStreetMap, AWS Terrain Tiles, BLM SMA, USGS PAD-US. Map tiles you view are cached for offline use.</p>`;
    p.hidden = false;
    p.querySelector('#lpClose').onclick = () => p.hidden = true;
    p.querySelectorAll('.segs button').forEach(b => b.onclick = () => { state.is3d = b.dataset.v === '3d'; apply3d(true); saveState(); p.querySelectorAll('.segs button').forEach(x => x.classList.toggle('on', x === b)); });
    p.querySelectorAll('input[name=base]').forEach(r => r.onchange = () => { state.base = r.value; applyState(); saveState(); });
    p.querySelectorAll('input[data-o]').forEach(c => c.onchange = () => { state.overlays[c.dataset.o] = c.checked; applyState(); saveState(); });
  }

  /* ---------- pins & tracks ---------- */
  async function refreshData(fitIds) {
    if (!map || !map.isStyleLoaded()) { map && map.once('load', () => refreshData(fitIds)); return; }
    const pins = await DB.all('pin'), tracks = await DB.all('track');
    for (const [id, m] of markers) if (!pins.find(p => p.id === id)) { m.remove(); markers.delete(id); }
    for (const p of pins) {
      let m = markers.get(p.id);
      if (!m) {
        const el = document.createElement('div'); el.className = 'pinmk ' + (p.source === 'onx' ? '' : p.source === 'water' ? 'water' : 'manual');
        el.title = p.name;
        m = new maplibregl.Marker({ element: el, anchor: 'bottom-left', offset: [-2, 0] }).setLngLat([p.lon, p.lat]).addTo(map);
        el.addEventListener('click', ev => { ev.stopPropagation(); pinPopup(p.id); });
        markers.set(p.id, m);
      } else m.setLngLat([p.lon, p.lat]);
    }
    map.getSource('tracks').setData({ type: 'FeatureCollection', features: tracks.map(t => ({ type: 'Feature', properties: { id: t.id, name: t.name, color: t.color }, geometry: { type: 'LineString', coordinates: t.points.map(q => [q[1], q[0]]) } })) });
    if (fitIds && fitIds.length) fitTo(pins.filter(p => fitIds.includes(p.id)), tracks.filter(t => fitIds.includes(t.id)));
  }
  function fitTo(pins, tracks) {
    const b = new maplibregl.LngLatBounds();
    pins.forEach(p => b.extend([p.lon, p.lat])); tracks.forEach(t => t.points.forEach(q => b.extend([q[1], q[0]])));
    if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
  }
  async function pinPopup(id) {
    const p = await DB.get(id); if (!p) return;
    new maplibregl.Popup({ offset: 18 }).setLngLat([p.lon, p.lat]).setHTML(`<b>${esc(p.name)}</b><br><span class="mute">${p.date || ''} ${p.source === 'onx' ? '· onX' : ''}</span><br>${p.notes ? esc(p.notes.slice(0, 90)) + '…<br>' : ''}<a href="#/pin/${p.id}">Open journal →</a>`).addTo(map);
  }
  function show(focus) {
    document.getElementById('mapview').hidden = false;
    init().then(() => { setTimeout(() => { map.resize(); if (focus) map.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 14) }); }, 30); refreshData(); });
  }
  function hide() { document.getElementById('mapview').hidden = true; document.getElementById('layerPanel').hidden = true; }

  function locate() {
    if (!navigator.geolocation) return toast('No GPS on this device');
    status('Finding you…');
    navigator.geolocation.getCurrentPosition(pos => {
      status('', 0);
      const ll = [pos.coords.longitude, pos.coords.latitude];
      if (!window._me) { const el = document.createElement('div'); el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#2f8cff;border:3px solid #fff;box-shadow:0 0 0 6px #2f8cff44'; window._me = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map); }
      else window._me.setLngLat(ll);
      map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 14) });
    }, e => { status(''); toast('Location unavailable: ' + e.message); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  async function dropCenter() {
    const ch = document.getElementById('crosshair'), btn = document.getElementById('btnDropPin');
    if (!centerMode) { centerMode = true; ch.hidden = false; btn.textContent = '✓ Drop pin here'; btn.classList.add('accent'); return; }
    centerMode = false; ch.hidden = true; btn.textContent = '⚑ Pin at center'; btn.classList.remove('accent');
    const c = map.getCenter(); await addPin({ lat: c.lat, lon: c.lng, name: 'New pin', source: 'manual' });
  }
  async function addPin({ lat, lon, name, source, desc = '' }) {
    const now = new Date();
    const p = { id: DB.uid('pin_'), type: 'pin', source, name, lat, lon, ele: null, time: now.toISOString(), desc, sym: '', date: now.toISOString().slice(0, 10), notes: desc, weather: {}, sightings: [], photoIds: [] };
    await DB.put(p); await refreshData(); toast('Pin added'); location.hash = '#/pin/' + p.id; return p;
  }

  /* ---------- tap: water feature + land manager ---------- */
  async function onClick(e) {
    const pad = 10, bb = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
    const wl = ['nhd-pt', 'nhd-perennial', 'nhd-intermittent', 'nhd-ephemeral', 'nhd-other', 'nhd-body'].filter(l => map.getLayer(l));
    const wf = state.overlays.water ? map.queryRenderedFeatures(bb, { layers: wl }) : [];
    const landOn = state.overlays.public || state.overlays.private;
    if (!wf.length && !landOn) return;
    const { lng, lat } = e.lngLat;
    let html = '';
    let pinName = 'Pin', pinDesc = '';
    if (wf.length) {
      const f = wf[0].properties;
      const label = f.label || 'Water feature';
      pinName = f.name ? `${f.name} (${label})` : label; pinDesc = `Water: ${label}${f.name ? ' – ' + f.name : ''} (USGS NHD). Verify in the field.`;
      html += `<b style="color:#7fd3ff">💧 ${esc(f.name || label)}</b><br><span class="mute">${esc(label)} · USGS NHD</span><br>`;
    }
    const pop = new maplibregl.Popup({ offset: 6 }).setLngLat(e.lngLat).setHTML(html + (landOn ? '<span class="mute">Checking land manager…</span>' : '') + addBtn()).addTo(map);
    const wire = () => { const b = pop.getElement() && pop.getElement().querySelector('.addpin'); if (b) b.onclick = () => { pop.remove(); addPin({ lat, lon: lng, name: pinName, source: wf.length ? 'water' : 'manual', desc: pinDesc }); }; };
    wire();
    if (landOn) {
      const land = await landAt(lat, lng);
      html += land;
      if (!wf.length) { pinName = 'Pin'; }
      if (pop.isOpen()) { pop.setHTML(html + addBtn()); wire(); }
    }
  }
  const addBtn = () => `<div style="margin-top:8px"><button class="sm primary addpin">⚑ Add pin to journal</button></div>`;
  async function landAt(lat, lon) {
    const q = `geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`;
    const to = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
    const [sma, pad] = await Promise.allSettled([
      to(fetch(BLM + 'BLM_Natl_SMA_LimitedScale/MapServer/1/query?outFields=ADMIN_AGENCY_CODE,ADMIN_DEPT_CODE,ADMIN_UNIT_NAME,ADMIN_UNIT_TYPE&' + q).then(r => r.json()), 9000),
      to(fetch('https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0/query?outFields=Unit_Nm,Mang_Name,Mang_Type,Pub_Access&' + q).then(r => r.json()), 9000)]);
    let out = '';
    if (sma.status === 'fulfilled' && sma.value.features && sma.value.features.length) {
      const a = sma.value.features[0].attributes, code = a.ADMIN_AGENCY_CODE || a.ADMIN_DEPT_CODE;
      const pvt = code === 'PVT';
      out += `<div style="margin-top:6px"><b style="color:${pvt ? '#ff8a7a' : '#ffd77a'}">${pvt ? '🚫' : '🏞'} ${esc(AGENCY[code] || code)}</b>${a.ADMIN_UNIT_NAME ? '<br>' + esc(a.ADMIN_UNIT_NAME) : ''}<br><span class="mute small">BLM Surface Management Agency</span></div>`;
    } else if (navigator.onLine === false) out += `<div class="mute">Offline – land manager lookup needs signal.</div>`;
    else out += `<div class="mute">No BLM SMA record here (or lookup failed).</div>`;
    if (pad.status === 'fulfilled' && pad.value.features && pad.value.features.length) {
      const seen = new Set();
      out += pad.value.features.map(f => f.attributes).filter(a => a.Unit_Nm && !seen.has(a.Unit_Nm) && seen.add(a.Unit_Nm)).slice(0, 3)
        .map(a => `<div class="small">• ${esc(a.Unit_Nm)} <span class="mute">(${esc(a.Mang_Name || '')}${a.Pub_Access ? ', ' + (PAD_ACCESS[a.Pub_Access] || a.Pub_Access) : ''})</span></div>`).join('') + `<span class="mute small">USGS PAD-US</span>`;
    }
    return out + `<div class="mute small" style="margin-top:4px">Approximate. Confirm with BLM / CPW / WGFD before crossing.</div>`;
  }

  /* ---------- NHD known water (vector, cached per 0.1° cell) ---------- */
  const flowKind = fc => { fc = +fc; if (fc === 46006) return 'perennial'; if (fc === 46003) return 'intermittent'; if (fc === 46007) return 'ephemeral'; return 'other'; };
  const FLOW_LABEL = { perennial: 'Perennial stream', intermittent: 'Intermittent stream', ephemeral: 'Ephemeral drainage', other: 'Flowline / canal / connector' };
  const BODY_LABEL = { 390: 'Lake / pond', 436: 'Reservoir / stock tank', 466: 'Swamp / marsh', 361: 'Playa', 378: 'Ice mass', 493: 'Estuary' };
  const PT_LABEL = { 458: 'Spring / seep', 487: 'Waterfall', 441: 'Rapids', 369: 'Gaging station', 367: 'Gate', 485: 'Water intake/outflow', 489: 'Well' };
  const fetchT = (u, ms = 25000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(u, { signal: c.signal }).finally(() => clearTimeout(t)); };
  async function loadNHD() {
    if (!map || map.getZoom() < 12.5) return;
    const b = map.getBounds(), S = 0.1, cells = [];
    for (let x = Math.floor(b.getWest() / S); x <= Math.floor(b.getEast() / S); x++)
      for (let y = Math.floor(b.getSouth() / S); y <= Math.floor(b.getNorth() / S); y++) cells.push([x, y]);
    const todo = cells.filter(c => !nhdCache.has(c.join(','))).slice(0, 12);
    if (!todo.length) return;
    status('Loading USGS water data…');
    await Promise.all(todo.map(async ([x, y]) => {
      const key = x + ',' + y; nhdCache.set(key, 'loading');
      const env = `${(x * S).toFixed(1)},${(y * S).toFixed(1)},${((x + 1) * S).toFixed(1)},${((y + 1) * S).toFixed(1)}`;
      const q = l => fetchT(`${NHD}${l}/query?geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&geometryPrecision=5&f=geojson`).then(r => r.json()).then(j => j.features || []).catch(() => null);
      const [fl, bd, pt] = await Promise.all([q(6), q(12), q(0)]);
      if (fl === null && bd === null) { nhdCache.delete(key); return; }
      (fl || []).forEach(f => { const k = flowKind(f.properties.fcode ?? f.properties.FCODE); f.properties = { kind: k, label: FLOW_LABEL[k], name: f.properties.gnis_name || f.properties.GNIS_NAME || '' }; nhdData.flow.push(f); });
      (bd || []).forEach(f => { const p = f.properties, ft = +(p.FTYPE ?? p.ftype); f.properties = { label: BODY_LABEL[ft] || 'Waterbody', name: p.GNIS_NAME || p.gnis_name || '' }; nhdData.body.push(f); });
      (pt || []).forEach(f => { const p = f.properties, ft = +(p.FTYPE ?? p.ftype); f.properties = { label: PT_LABEL[ft] || 'Water point', name: p.GNIS_NAME || p.gnis_name || '', ftype: ft }; nhdData.pt.push(f); });
      nhdCache.set(key, 'ok');
    }));
    map.getSource('nhdflow').setData({ type: 'FeatureCollection', features: nhdData.flow });
    map.getSource('nhdbody').setData({ type: 'FeatureCollection', features: nhdData.body });
    map.getSource('nhdpt').setData({ type: 'FeatureCollection', features: nhdData.pt });
    status(`Water: ${nhdData.flow.length} stream segments, ${nhdData.pt.length} springs/points, ${nhdData.body.length} ponds/lakes loaded`, 3500);
  }

  /* ---------- potential water from DEM (client-side terrain analysis in a Web Worker) ---------- */
  const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
  const lat2y = (lat, z) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
  const x2lon = (x, z) => x / 2 ** z * 360 - 180;
  const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;
  async function scanWater() {
    const btn = document.getElementById('btnWaterScan'); btn.disabled = true;
    try {
      await loadNHD();
      const b = map.getBounds(); let z = 14, x0, x1, y0, y1;
      for (; z >= 11; z--) { x0 = Math.floor(lon2x(b.getWest(), z)); x1 = Math.floor(lon2x(b.getEast(), z)); y0 = Math.floor(lat2y(b.getNorth(), z)); y1 = Math.floor(lat2y(b.getSouth(), z)); if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 16) break; }
      const nx = x1 - x0 + 1, ny = y1 - y0 + 1, W = nx * 256, H = ny * 256;
      status(`Scanning terrain (${nx * ny} elevation tiles, z${z})…`);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
      await Promise.all([...Array(nx * ny)].map(async (_, i) => {
        const tx = x0 + (i % nx), ty = y0 + Math.floor(i / nx);
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`);
        const bmp = await createImageBitmap(await r.blob()); g.drawImage(bmp, (tx - x0) * 256, (ty - y0) * 256);
      }));
      const px = g.getImageData(0, 0, W, H).data, elev = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) elev[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
      const midLat = y2lat(y0 + ny / 2, z), cell = 156543.034 * Math.cos(midLat * Math.PI / 180) / 2 ** z;
      const toPix = (lon, lat) => [(lon2x(lon, z) - x0) * 256, (lat2y(lat, z) - y0) * 256];
      const lines = nhdData.flow.filter(f => f.properties.kind !== 'perennial' && f.geometry).flatMap(f => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).map(cs => ({ kind: f.properties.kind, pts: cs.map(c => toPix(c[0], c[1])) })));
      const per = nhdData.flow.filter(f => f.properties.kind === 'perennial' && f.geometry).flatMap(f => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates).map(cs => ({ kind: 'perennial', pts: cs.map(c => toPix(c[0], c[1])) })));
      const springs = nhdData.pt.filter(f => f.properties.ftype === 458).map(f => toPix(f.geometry.coordinates[0], f.geometry.coordinates[1]));
      const res = await new Promise((resolve, reject) => {
        const w = new Worker('js/water-worker.js');
        w.onmessage = ev => { resolve(ev.data); w.terminate(); }; w.onerror = er => { reject(er); w.terminate(); };
        w.postMessage({ W, H, cell, elev, lines: lines.concat(per), springs }, [elev.buffer]);
      });
      const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
      oc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(res.rgba), W, H), 0, 0);
      pwScan = { canvas: oc, z, x0, y0, W, H, v: (pwScan ? pwScan.v : 0) + 1 };
      const url = `pwater://{z}/{x}/{y}?v=${pwScan.v}`;
      if (map.getSource('pw')) map.getSource('pw').setTiles([url]);
      else { map.addSource('pw', { type: 'raster', tiles: [url], tileSize: 256, minzoom: 10, maxzoom: 18 }); map.addLayer({ id: 'pw', type: 'raster', source: 'pw', paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, 'trk-case'); }
      hot.forEach(m => m.remove()); hot = [];
      for (const h of res.hotspots) {
        const lon = x2lon(x0 + h.x / 256, z), lat = y2lat(y0 + h.y / 256, z);
        const el = document.createElement('div'); el.className = 'hotmk'; el.title = 'Potential water';
        const why = [h.spring ? 'near a mapped spring' : '', h.nearNHD ? `on a mapped ${h.nearNHD} drainage` : '', h.sink ? 'closed low spot (may hold rain/snowmelt)' : '', h.flat ? 'flat in a drainage bottom' : '', `~${Math.round(h.areaAc)} acres drain here`].filter(Boolean);
        const m = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          const pop = new maplibregl.Popup({ offset: 10 }).setLngLat([lon, lat]).setHTML(`<b style="color:#7fe3ff">💧 Potential water – verify in the field</b><br>${why.map(esc).join('<br>')}<br><span class="mute small">Score ${h.score.toFixed(1)} · from terrain model, not a known source</span>${addBtn()}`).addTo(map);
          pop.getElement().querySelector('.addpin').onclick = () => { pop.remove(); addPin({ lat, lon, name: 'Potential water', source: 'water', desc: 'Potential water (terrain model) – verify in the field. ' + why.join('; ') + '.' }); };
        });
        hot.push(m);
      }
      state.overlays.pwater = true; applyState();
      status(`Potential water: ${res.hotspots.length} spots flagged. Verify in the field.`, 6000);
    } catch (err) { console.error(err); status(''); toast('Scan failed – needs signal for elevation data'); }
    btn.disabled = false;
  }

  return { show, hide, refreshData, init, addPin, get map() { return map; }, BASES, fitAll: async () => { await init(); refreshData(); } };
})();
