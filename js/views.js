/* Screens: pins, pin journal, film tools, meat tools, community, data/backup. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
const fmtDT = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const fmtD = s => { if (!s) return ''; const d = new Date(s.length === 10 ? s + 'T12:00' : s); return isNaN(d) ? s : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); };
const debounce = (fn, ms = 500) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const V = $('#view') || document.getElementById('view');
function render(html) { document.getElementById('view').innerHTML = html; window.scrollTo(0, 0); }
async function resizeImage(file, max = 1600) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.82));
}
const photoURLs = new Map();
async function photoURL(id) { if (photoURLs.has(id)) return photoURLs.get(id); const p = await DB.getPhoto(id); if (!p) return ''; const u = URL.createObjectURL(p.blob); photoURLs.set(id, u); return u; }

/* ================= PINS ================= */
const Views = {};
Views.pins = async () => {
  const pins = (await DB.all('pin')).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const tracks = await DB.all('track');
  render(`<div class="spread"><h1>Pin journals</h1><button class="primary" id="imp">⇪ Import onX</button></div>
  <input id="q" placeholder="Search pins, notes, sightings…">
  ${!pins.length && !tracks.length ? `<div class="card hl"><h3>Start with your onX pins</h3><p>Export your waypoints and tracks from onX as a <b>GPX</b> or <b>KML</b> file, then tap <b>Import onX</b>. Every pin gets its own journal page. Re-import any time: pins are matched by name + location so your notes stay put. See <a href="#/data">Backup &amp; help</a> for how to export.</p></div>` : ''}
  <div class="card"><h3>Pins (${pins.length})</h3><ul class="list" id="pl">${pins.map(p => `<li data-s="${esc((p.name + ' ' + p.notes + ' ' + (p.sightings || []).map(s => s.species + ' ' + s.note).join(' ')).toLowerCase())}"><a class="item" href="#/pin/${p.id}"><span class="dot" style="background:${p.source === 'onx' ? 'var(--brand)' : p.source === 'water' ? 'var(--water)' : 'var(--ok)'}"></span><span class="grow"><div class="t">${esc(p.name)}</div><div class="mute small">${fmtD(p.date || p.time)} · ${(p.sightings || []).length} sightings · ${(p.photoIds || []).length} photos${p.notes ? ' · notes' : ''}</div></span><span class="badge">${p.source === 'onx' ? 'onX' : p.source === 'water' ? 'water' : 'mine'}</span></a></li>`).join('') || '<li class="mute">No pins yet.</li>'}</ul></div>
  <div class="card"><h3>Tracks (${tracks.length})</h3><ul class="list">${tracks.map(t => `<li><a class="item" href="#/track/${t.id}"><span class="dot" style="background:#ffd400"></span><span class="grow"><div class="t">${esc(t.name)}</div><div class="mute small">${fmtD(t.start)} · ${Geo.fmtMi(t.distM)} · +${Geo.fmtFt(t.gainM)} · ${t.points.length} pts</div></span></a></li>`).join('') || '<li class="mute">No tracks yet.</li>'}</ul></div>`);
  $('#imp').onclick = () => $('#gpxInput').click();
  $('#q').oninput = e => { const q = e.target.value.toLowerCase(); $$('#pl li[data-s]').forEach(li => li.hidden = q && !li.dataset.s.includes(q)); };
};

Views.track = async id => {
  const t = await DB.get(id); if (!t) return render('<p>Track not found.</p>');
  const dur = t.start && t.end ? (new Date(t.end) - new Date(t.start)) / 3.6e6 : null;
  const eles = t.points.map(p => p[2]).filter(e => e != null);
  render(`<a href="#/pins">← Pins</a><h1>${esc(t.name)}</h1>
  <div class="card"><table><tr><td>Date</td><td>${fmtDT(t.start)}</td></tr><tr><td>Distance</td><td>${Geo.fmtMi(t.distM)}</td></tr><tr><td>Climb</td><td>+${Geo.fmtFt(t.gainM)}</td></tr>${eles.length ? `<tr><td>Elevation</td><td>${Geo.fmtFt(Math.min(...eles))} – ${Geo.fmtFt(Math.max(...eles))}</td></tr>` : ''}${dur ? `<tr><td>Time</td><td>${dur.toFixed(1)} h</td></tr>` : ''}<tr><td>Points</td><td>${t.points.length}</td></tr></table>
  <div class="row" style="margin-top:10px"><button id="onmap" class="primary">Show on map</button></div></div>
  <div class="card"><label>Track notes</label><textarea id="tn" placeholder="Trail conditions, where you glassed from, what you'd do differently…">${esc(t.notes || '')}</textarea></div>
  <button class="danger sm" id="del">Delete track</button>`);
  $('#tn').oninput = debounce(async e => { t.notes = e.target.value; await DB.put(t); toast('Saved'); });
  $('#onmap').onclick = () => { location.hash = '#/map'; setTimeout(() => { const b = new maplibregl.LngLatBounds(); t.points.forEach(q => b.extend([q[1], q[0]])); MapView.map.fitBounds(b, { padding: 50, duration: 0 }); }, 200); };
  $('#del').onclick = async () => { if (confirm('Delete this track? (Pins are kept.)')) { await DB.del(id); MapView.refreshData(); location.hash = '#/pins'; } };
};

const SPECIES = ['Elk – bull', 'Elk – cow', 'Elk – calf', 'Mule deer – buck', 'Mule deer – doe', 'Whitetail – buck', 'Whitetail – doe', 'Pronghorn', 'Bear', 'Mountain lion', 'Moose', 'Turkey', 'Sign: rubs', 'Sign: wallow', 'Sign: tracks/scat', 'Other'];
const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail' };
const compass = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

Views.pin = async id => {
  const p = await DB.get(id); if (!p) return render('<p>Pin not found.</p><a href="#/pins">Back</a>');
  p.weather = p.weather || {}; p.sightings = p.sightings || []; p.photoIds = p.photoIds || [];
  const clips = (await DB.all('clip')).filter(c => c.pinId === id);
  const att = (await DB.all('attach')).filter(a => a.targetId === id);
  const w = p.weather;
  render(`<a href="#/pins">← Pins</a>
  <div class="spread"><h1 style="flex:1">${esc(p.name)}</h1><span class="badge ${p.source === 'water' ? 'blue' : ''}">${p.source === 'onx' ? 'onX pin' : p.source === 'water' ? 'water' : 'my pin'}</span></div>
  <div class="card"><label>Name</label><input id="nm" value="${esc(p.name)}">
  <div class="row"><div><label>Date</label><input type="date" id="dt" value="${esc(p.date || (p.time || '').slice(0, 10))}"></div><div style="flex:0 0 auto;padding-top:22px"><button id="onmap" class="sm">◎ Map</button></div></div>
  <p class="mute small">${Geo.fmtLL(p.lat, p.lon)}${p.ele != null ? ' · ' + Geo.fmtFt(p.ele) : ''}${p.time ? ' · onX time ' + fmtDT(p.time) : ''}${p.importCount > 1 ? ` · re-imported ${p.importCount - 1}×, notes kept` : ''}</p>
  ${p.desc && p.source === 'onx' ? `<p class="small"><b>onX notes:</b> ${esc(p.desc)}</p>` : ''}</div>
  <div class="card"><h2>Journal</h2><textarea id="notes" placeholder="What you saw, wind, where they bedded, how to approach next time…">${esc(p.notes || '')}</textarea><p class="mute small">Saves automatically.</p></div>
  <div class="card"><div class="spread"><h2>Weather</h2><button class="sm" id="wx">Fetch for this date</button></div>
  <div class="row"><div><label>Temp °F</label><input id="w_t" inputmode="decimal" value="${esc(w.tempF ?? '')}"></div><div><label>Wind mph</label><input id="w_ws" inputmode="decimal" value="${esc(w.windMph ?? '')}"></div><div><label>Wind from</label><input id="w_wd" value="${esc(w.windDir ?? '')}" placeholder="SW"></div></div>
  <label>Sky / precip</label><input id="w_sky" value="${esc(w.sky ?? '')}" placeholder="Clear, light snow…">
  <label>Moon / notes</label><input id="w_n" value="${esc(w.notes ?? '')}">
  <p class="mute small" id="wxsrc">${w.source ? esc(w.source) : 'Enter by hand, or fetch historical weather from Open-Meteo (needs signal; sends this pin’s location to Open-Meteo).'}</p></div>
  <div class="card"><div class="spread"><h2>Sightings (${p.sightings.length})</h2></div>
  <ul class="list">${p.sightings.map((s, i) => `<li class="spread"><span><b>${esc(s.count || 1)}× ${esc(s.species)}</b> <span class="mute small">${esc(s.time || '')}</span><br><span class="small">${esc(s.note || '')}</span></span><button class="sm" data-dels="${i}">✕</button></li>`).join('') || '<li class="mute">None yet.</li>'}</ul>
  <div class="row"><select id="s_sp">${SPECIES.map(s => `<option>${s}</option>`).join('')}</select><input id="s_n" type="number" min="1" value="1" style="flex:0 0 70px"></div>
  <div class="row" style="margin-top:6px"><input id="s_time" type="time" style="flex:0 0 120px"><input id="s_note" placeholder="Behavior, distance, direction…"></div>
  <button class="primary" id="s_add" style="margin-top:8px;width:100%">+ Add sighting</button></div>
  <div class="card"><h2>Photos (${p.photoIds.length})</h2><div class="photos" id="ph"></div>
  <div class="row" style="margin-top:8px"><label class="btn" style="margin:0">📷 Camera<input type="file" accept="image/*" capture="environment" id="cam" hidden></label><label class="btn" style="margin:0">🖼 Library<input type="file" accept="image/*" multiple id="lib" hidden></label></div>
  <p class="mute small">Photos are resized and stored only on this phone (included in backups).</p></div>
  <div class="card"><div class="spread"><h2>Clip notes here (${clips.length})</h2><a class="btn sm" href="#/film/clips?pin=${p.id}">+ Clip</a></div><ul class="list">${clips.map(c => `<li><b>${esc(c.clipName || 'Clip')}</b> <span class="mute small">${esc(c.camera || '')} ${esc(c.tags || '')}</span><br><span class="small">${esc(c.desc || '')}</span></li>`).join('') || '<li class="mute">No clips tied to this pin.</li>'}</ul></div>
  ${att.length ? `<div class="card"><h2>Attached</h2><ul class="list">${att.map(a => `<li>${a.kind === 'episode' ? '🎧' : '📝'} ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title)}${a.note ? `<br><span class="small">${esc(a.note)}</span>` : ''} <button class="sm" data-dela="${a.id}">✕</button></li>`).join('')}</ul></div>` : ''}
  <div id="scorecards"></div>
  <button class="danger sm" id="del">Delete pin</button>`);
  Score.cards('pin', id);
  const save = async (msg) => { await DB.put(p); if (msg) toast(msg); };
  $('#nm').onchange = e => { p.name = e.target.value.trim() || p.name; p.renamedLocally = true; save('Renamed'); MapView.refreshData(); };
  $('#dt').onchange = e => { p.date = e.target.value; save('Saved'); };
  $('#notes').oninput = debounce(e => { p.notes = e.target.value; save('Saved'); }, 600);
  const wsave = () => { Object.assign(p.weather, { tempF: $('#w_t').value, windMph: $('#w_ws').value, windDir: $('#w_wd').value, sky: $('#w_sky').value, notes: $('#w_n').value }); save('Saved'); };
  ['#w_t', '#w_ws', '#w_wd', '#w_sky', '#w_n'].forEach(s => $(s).onchange = wsave);
  $('#wx').onclick = async () => {
    const d = $('#dt').value || new Date().toISOString().slice(0, 10);
    const ago = (Date.now() - new Date(d + 'T12:00')) / 864e5;
    const base = ago > 80 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    $('#wxsrc').textContent = 'Fetching…';
    try {
      const j = await (await fetch(`${base}?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&start_date=${d}&end_date=${d}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`)).json();
      if (!j.hourly) throw new Error(j.reason || 'no data');
      let hr = 12; if (p.time && (p.time || '').slice(0, 10) === d) hr = new Date(p.time).getHours();
      const h = j.hourly, i = Math.min(h.time.length - 1, hr);
      $('#w_t').value = Math.round(h.temperature_2m[i]); $('#w_ws').value = Math.round(h.wind_speed_10m[i]); $('#w_wd').value = compass(h.wind_direction_10m[i]); $('#w_sky').value = WMO[h.weather_code[i]] || '';
      const lo = Math.round(Math.min(...h.temperature_2m)), hi = Math.round(Math.max(...h.temperature_2m));
      p.weather.source = `Open-Meteo model data for ${d} ${String(i).padStart(2, '0')}:00 local (day ${lo}–${hi}°F). Modelled, not a station reading.`;
      $('#wxsrc').textContent = p.weather.source; wsave();
    } catch (e) { $('#wxsrc').textContent = 'Could not fetch weather (' + e.message + '). Enter it by hand.'; }
  };
  $('#s_add').onclick = () => { p.sightings.push({ species: $('#s_sp').value, count: +$('#s_n').value || 1, time: $('#s_time').value, note: $('#s_note').value.trim(), at: Date.now() }); save('Sighting added').then(() => Views.pin(id)); };
  $$('[data-dels]').forEach(b => b.onclick = () => { p.sightings.splice(+b.dataset.dels, 1); save().then(() => Views.pin(id)); });
  $$('[data-dela]').forEach(b => b.onclick = async () => { await DB.del(b.dataset.dela); Views.pin(id); });
  const addPhotos = async files => { for (const f of files) { const pid = DB.uid('ph_'); await DB.putPhoto(pid, await resizeImage(f)); p.photoIds.push(pid); } await save(files.length + ' photo(s) saved'); Views.pin(id); };
  $('#cam').onchange = e => addPhotos([...e.target.files]); $('#lib').onchange = e => addPhotos([...e.target.files]);
  const ph = $('#ph');
  for (const pid of p.photoIds) { const u = await photoURL(pid); if (!u) continue; const im = document.createElement('img'); im.src = u; im.alt = 'pin photo'; im.onclick = () => { if (confirm('Delete this photo?')) { p.photoIds = p.photoIds.filter(x => x !== pid); DB.delPhoto(pid); save('Photo deleted').then(() => Views.pin(id)); } }; ph.appendChild(im); }
  $('#onmap').onclick = () => { location.hash = '#/map'; setTimeout(() => MapView.map && MapView.map.flyTo({ center: [p.lon, p.lat], zoom: 15 }), 250); };
  $('#del').onclick = async () => { if (confirm('Delete this pin and its journal? This cannot be undone (unless you have a backup).')) { for (const x of p.photoIds) await DB.delPhoto(x); await DB.del(id); MapView.refreshData(); location.hash = '#/pins'; } };
};

/* ================= FILM ================= */
const SHOT_TEMPLATE = ['Trailhead intro / talking head (plan for the day)', 'Gear prep & loading the pack (B-roll)', 'Headlamp hike-in (low light)', 'Sunrise time-lapse from the glassing spot', 'POV through binos / spotting scope (phone-scope)', 'Wide establishing shot of the basin', 'Boots, hands, rangefinder, wind check (B-roll)', 'Map / onX screen recording of the plan', 'Whispered update after spotting animals', 'Stalk – over-the-shoulder & ahead-of-hunter angles', 'Shot setup: range, rest, ethics talk', 'The shot (camera rolling early)', 'Reaction / emotion', 'Recovery & first look', 'Field care / gutless method (tasteful framing)', 'Pack-out POV + struggle shots', 'Campfire or truck wrap-up / lessons learned', 'Outro: subscribe @staywildstayfreeoutdoors'];
Views.film = async (sub = 'hunts', params = {}) => {
  const tabs = `<div class="segs" style="margin-bottom:8px">${[['hunts', 'Hunts & shot lists'], ['gear', 'Batteries & cards'], ['clips', 'Clip notes']].map(([k, n]) => `<button class="${sub === k ? 'on' : ''}" onclick="location.hash='#/film/${k}'">${n}</button>`).join('')}</div>`;
  if (sub === 'gear') return Views.gear(tabs);
  if (sub === 'clips') return Views.clips(tabs, params);
  const hunts = (await DB.all('hunt')).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  render(`<h1>Self-filming</h1>${tabs}
  <div class="card"><h3>New hunt</h3><input id="hn" placeholder="e.g. 2026 CO 3rd rifle elk"><div class="row" style="margin-top:6px"><select id="hs"><option>Elk</option><option>Mule deer</option><option>Whitetail</option><option>Pronghorn</option><option>Bear</option><option>Other</option></select><input id="hst" type="date"></div>
  <label class="opt"><input type="checkbox" id="htpl" checked><span class="grow">Start with the SWSF self-filming shot list</span></label><button class="primary" id="hadd" style="width:100%">+ Create hunt</button></div>
  <ul class="list card">${hunts.map(h => { const d = h.shots.filter(s => s.done).length; return `<li><a class="item" href="#/hunt/${h.id}"><span class="grow"><div class="t">${esc(h.name)}</div><div class="mute small">${esc(h.species)} · ${fmtD(h.start)} · ${d}/${h.shots.length} shots</div></span><span class="badge ${d === h.shots.length && d ? 'ok' : ''}">${h.shots.length ? Math.round(d / h.shots.length * 100) : 0}%</span></a></li>`; }).join('') || '<li class="mute">No hunts yet.</li>'}</ul>`);
  $('#hadd').onclick = async () => { const name = $('#hn').value.trim(); if (!name) return toast('Name the hunt'); const h = { id: DB.uid('hunt_'), type: 'hunt', name, species: $('#hs').value, start: $('#hst').value, notes: '', shots: $('#htpl').checked ? SHOT_TEMPLATE.map(t => ({ id: DB.uid('s'), text: t, done: false })) : [] }; await DB.put(h); location.hash = '#/hunt/' + h.id; };
};
Views.hunt = async id => {
  const h = await DB.get(id); if (!h) return render('Hunt not found');
  const clips = (await DB.all('clip')).filter(c => c.huntId === id), att = (await DB.all('attach')).filter(a => a.targetId === id);
  const d = h.shots.filter(s => s.done).length;
  render(`<a href="#/film/hunts">← Hunts</a><h1>${esc(h.name)}</h1><p class="mute">${esc(h.species)} · ${fmtD(h.start)} · ${d}/${h.shots.length} shots captured</p>
  <div class="card"><h2>Shot list</h2>${h.shots.map((s, i) => `<label class="check ${s.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''}><span style="flex:1">${esc(s.text)}</span><button class="sm" data-del="${i}" aria-label="remove">✕</button></label>`).join('')}
  <div class="row" style="margin-top:8px"><input id="ns" placeholder="Add a shot…"><button id="nsb" class="primary" style="flex:0 0 auto">Add</button></div>
  <div class="row" style="margin-top:8px"><button class="sm" id="reset">Uncheck all</button></div></div>
  <div class="card"><h2>Hunt notes</h2><textarea id="hnotes" placeholder="Story beats, theme of the edit, music ideas…">${esc(h.notes || '')}</textarea></div>
  <div class="card"><div class="spread"><h2>Clips (${clips.length})</h2><a class="btn sm" href="#/film/clips?hunt=${h.id}">+ Clip</a></div><ul class="list">${clips.map(c => `<li><b>${esc(c.clipName)}</b> <span class="mute small">${esc(c.tags || '')}</span><br><span class="small">${esc(c.desc || '')}</span></li>`).join('') || '<li class="mute">None yet.</li>'}</ul></div>
  ${att.length ? `<div class="card"><h2>Attached</h2><ul class="list">${att.map(a => `<li>${a.kind === 'episode' ? '🎧' : '📝'} ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title)}${a.note ? `<br><span class="small">${esc(a.note)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
  <div id="scorecards"></div>
  <button class="danger sm" id="del">Delete hunt</button>`);
  Score.cards('hunt', id);
  const save = () => DB.put(h);
  $$('input[data-i]').forEach(c => c.onchange = () => { h.shots[+c.dataset.i].done = c.checked; save().then(() => Views.hunt(id)); });
  $$('button[data-del]').forEach(b => b.onclick = e => { e.preventDefault(); h.shots.splice(+b.dataset.del, 1); save().then(() => Views.hunt(id)); });
  $('#nsb').onclick = () => { const t = $('#ns').value.trim(); if (t) { h.shots.push({ id: DB.uid('s'), text: t, done: false }); save().then(() => Views.hunt(id)); } };
  $('#reset').onclick = () => { h.shots.forEach(s => s.done = false); save().then(() => Views.hunt(id)); };
  $('#hnotes').oninput = debounce(e => { h.notes = e.target.value; save().then(() => toast('Saved')); });
  $('#del').onclick = async () => { if (confirm('Delete this hunt? Clips stay.')) { await DB.del(id); location.hash = '#/film/hunts'; } };
};
const GEAR_STATES = { battery: ['Charged', 'In use', 'Dead'], card: ['Empty', 'In use', 'Full', 'Offloaded'] };
const GEAR_CLS = { Charged: 'ok', 'In use': 'warn', Dead: 'bad', Empty: 'ok', Full: 'bad', Offloaded: 'blue' };
Views.gear = async tabs => {
  const g = (await DB.all('gear')).sort((a, b) => (a.kind + a.label).localeCompare(b.kind + b.label));
  const cnt = (k, s) => g.filter(x => x.kind === k && x.status === s).length;
  const row = x => `<li><div class="spread"><span><b>${esc(x.label)}</b> <span class="mute small">${esc(x.camera || '')}</span><br><span class="mute small">updated ${fmtDT(x.changed)}</span></span><span class="badge ${GEAR_CLS[x.status]}">${x.status}</span></div>
    <div class="segs" style="margin-top:6px">${GEAR_STATES[x.kind].map(s => `<button data-id="${x.id}" data-s="${s}" class="${x.status === s ? 'on' : ''}">${s}</button>`).join('')}<button data-rm="${x.id}" style="flex:0 0 40px">✕</button></div></li>`;
  render(`<h1>Self-filming</h1>${tabs}
  <div class="card"><div class="row"><div><div class="big" style="color:var(--ok)">${cnt('battery', 'Charged')}</div><div class="mute small">batteries charged</div></div><div><div class="big" style="color:var(--bad)">${cnt('battery', 'Dead')}</div><div class="mute small">need charging</div></div><div><div class="big" style="color:var(--bad)">${cnt('card', 'Full')}</div><div class="mute small">cards to offload</div></div></div>
  <div class="row" style="margin-top:8px"><button class="sm" id="allch">All dead → charged</button><button class="sm" id="alloff">All offloaded → empty</button></div></div>
  <div class="card"><h3>Add battery or card</h3><div class="row"><select id="gk" style="flex:0 0 110px"><option value="battery">Battery</option><option value="card">SD card</option></select><input id="gl" placeholder="Label (e.g. Sony #3, 128GB-A)"></div><input id="gc" placeholder="Camera / device (optional)" style="margin-top:6px"><button class="primary" id="gadd" style="width:100%;margin-top:8px">+ Add</button>
  <p class="mute small">Tip: write the same label on the battery or card with a paint pen.</p></div>
  <div class="card"><h2>Batteries</h2><ul class="list">${g.filter(x => x.kind === 'battery').map(row).join('') || '<li class="mute">None</li>'}</ul></div>
  <div class="card"><h2>SD cards</h2><ul class="list">${g.filter(x => x.kind === 'card').map(row).join('') || '<li class="mute">None</li>'}</ul></div>`);
  $('#gadd').onclick = async () => { const label = $('#gl').value.trim(); if (!label) return toast('Add a label'); const kind = $('#gk').value; await DB.put({ id: DB.uid('gear_'), type: 'gear', kind, label, camera: $('#gc').value.trim(), status: GEAR_STATES[kind][0], changed: Date.now() }); Views.film('gear'); };
  $$('[data-s]').forEach(b => b.onclick = async () => { const x = g.find(i => i.id === b.dataset.id); x.status = b.dataset.s; x.changed = Date.now(); await DB.put(x); Views.film('gear'); });
  $$('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Remove?')) { await DB.del(b.dataset.rm); Views.film('gear'); } });
  $('#allch').onclick = async () => { for (const x of g.filter(x => x.kind === 'battery' && x.status === 'Dead')) { x.status = 'Charged'; x.changed = Date.now(); await DB.put(x); } Views.film('gear'); };
  $('#alloff').onclick = async () => { for (const x of g.filter(x => x.kind === 'card' && x.status === 'Offloaded')) { x.status = 'Empty'; x.changed = Date.now(); await DB.put(x); } Views.film('gear'); };
};
Views.clips = async (tabs, params) => {
  const [clips, pins, hunts, gear] = await Promise.all([DB.all('clip'), DB.all('pin'), DB.all('hunt'), DB.all('gear')]);
  clips.sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  const pn = id => (pins.find(p => p.id === id) || {}).name || '', hn = id => (hunts.find(h => h.id === id) || {}).name || '';
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  render(`<h1>Self-filming</h1>${tabs}
  <div class="card"><h3>New clip note</h3>
  <div class="row"><input id="cn" placeholder="Clip / file name (e.g. C0042)"><input id="cw" type="datetime-local" value="${now}"></div>
  <label>Pin</label><select id="cp"><option value="">— none —</option>${pins.map(p => `<option value="${p.id}" ${params.pin === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <label>Hunt</label><select id="ch"><option value="">— none —</option>${hunts.map(h => `<option value="${h.id}" ${params.hunt === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
  <div class="row"><div><label>Camera</label><input id="cc" placeholder="Sony a6400, phone…"></div><div><label>Card</label><select id="cd"><option value="">—</option>${gear.filter(g => g.kind === 'card').map(g => `<option>${esc(g.label)}</option>`).join('')}</select></div></div>
  <label>Type</label><div class="chips" id="ctags">${['A-roll', 'B-roll', 'Talking head', 'POV', 'Glassing', 'Kill shot', 'Recovery', 'Pack-out', 'Time-lapse', 'Drone-free wide', 'Audio only'].map(t => `<button class="chip" type="button">${t}</button>`).join('')}</div>
  <label>Notes for the edit</label><textarea id="cdesc" placeholder="What happens, good moment at 02:13, wind noise, use for intro…"></textarea>
  <label>Rating</label><div class="segs" id="crate">${[1, 2, 3].map(n => `<button type="button" data-r="${n}" class="${n === 2 ? 'on' : ''}">${'★'.repeat(n)}</button>`).join('')}</div>
  <button class="primary" id="cadd" style="width:100%;margin-top:10px">+ Save clip note</button></div>
  <div class="card"><div class="spread"><h2>Clip log (${clips.length})</h2><button class="sm" id="csv">Export for editing (CSV)</button></div>
  <ul class="list">${clips.map(c => `<li><div class="spread"><b>${esc(c.clipName || 'Clip')}</b><span>${'★'.repeat(c.rating || 0)}</span></div><div class="mute small">${fmtDT(c.when)} · ${esc(c.camera || '')} ${c.card ? '· ' + esc(c.card) : ''}</div><div class="small">${c.pinId ? `⚑ <a href="#/pin/${c.pinId}">${esc(pn(c.pinId))}</a> ` : ''}${c.huntId ? '· ' + esc(hn(c.huntId)) : ''}</div><div class="small">${esc(c.tags || '')}</div><div>${esc(c.desc || '')}</div>
  <label class="opt"><input type="checkbox" data-used="${c.id}" ${c.used ? 'checked' : ''}><span class="grow small">Used in edit</span><button class="sm" data-rm="${c.id}">✕</button></label></li>`).join('') || '<li class="mute">No clips yet.</li>'}</ul></div>`);
  let rate = 2; $$('#crate button').forEach(b => b.onclick = () => { rate = +b.dataset.r; $$('#crate button').forEach(x => x.classList.toggle('on', x === b)); });
  $$('#ctags .chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#cadd').onclick = async () => {
    await DB.put({ id: DB.uid('clip_'), type: 'clip', clipName: $('#cn').value.trim(), when: $('#cw').value, pinId: $('#cp').value, huntId: $('#ch').value, camera: $('#cc').value.trim(), card: $('#cd').value, tags: $$('#ctags .chip.on').map(b => b.textContent).join(', '), desc: $('#cdesc').value.trim(), rating: rate, used: false });
    toast('Clip saved'); Views.film('clips', params);
  };
  $$('[data-used]').forEach(c => c.onchange = async () => { const x = clips.find(i => i.id === c.dataset.used); x.used = c.checked; await DB.put(x); });
  $$('[data-rm]').forEach(b => b.onclick = async e => { e.preventDefault(); if (confirm('Delete clip note?')) { await DB.del(b.dataset.rm); Views.film('clips', params); } });
  $('#csv').onclick = () => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['clip', 'when', 'hunt', 'pin', 'camera', 'card', 'type', 'rating', 'used', 'notes']].concat(clips.map(c => [c.clipName, c.when, hn(c.huntId), pn(c.pinId), c.camera, c.card, c.tags, c.rating, c.used ? 'yes' : '', c.desc]));
    download('swsf-clip-log.csv', rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  };
};

/* ================= MEAT & PACK-OUT ================= */
const CHECKLISTS = {
  'Game bags & kit (pack before you go)': ['Breathable game bags: elk 5–6 (4 quarters + loose meat/backstraps), deer 3–4', 'Spare game bag for heart/liver if keeping', 'Sharp knife + replaceable blades / sharpener', 'Bone saw (if quartering bone-in or taking the skull/antlers where required)', 'Nitrile or long gloves', 'Paracord (30–50 ft) for hanging meat & tying legs', 'Contractor bag or tarp to lay meat on (keep it off the ground and clean)', 'Headlamp + spare batteries', 'Tag, pen/zip ties, and your state’s evidence-of-sex rules', 'Pack frame that can carry meat (meat shelf/load sling)', 'Water + calories for multiple pack trips'],
  'Elk – gutless quartering': ['Tag the animal first (follow your state rules)', 'Photos & filming done; position animal on its side, uphill side up', 'Cut hide down the back from neck to tail; skin the top side down to the belly', 'Remove front quarter: lift leg, cut behind shoulder blade (no joint to cut) – bag it', 'Remove hindquarter: cut around the pelvis, find the ball joint, pop it, cut free – bag it', 'Backstrap: cut along the spine and along the ribs, peel it off – bag it', 'Neck meat & rib meat (trim between ribs) – bag it', 'Tenderloin: cut a small window behind the last rib to reach it without gutting', 'Roll animal, repeat on second side', 'Head/antlers & cape if keeping; leave evidence of sex attached if your state requires it', 'Hang bags in shade with airflow, off the ground; spread them apart to cool', 'Mark the kill site and meat cache as pins in this app'],
  'Mule deer – gutless quartering': ['Tag the animal first (follow your state rules)', 'Photos & filming done', 'Skin the top side from the spine down', 'Front shoulder off (cut behind blade) – bag', 'Hindquarter: pop ball joint, cut free – bag', 'Backstrap and neck/rib meat – bag', 'Tenderloin through window behind last rib', 'Flip and repeat', 'Most deer can come out in 1–2 trips: quarters on the frame, or bone out to save weight', 'Leave evidence of sex attached if required', 'Hang or cool meat in shade with airflow, off the ground']
};
Views.meat = async (sub = 'timer') => {
  const tabs = `<div class="segs" style="margin-bottom:8px">${[['timer', 'Meat-care timer'], ['check', 'Checklists'], ['pack', 'Pack planner']].map(([k, n]) => `<button class="${sub === k ? 'on' : ''}" onclick="location.hash='#/meat/${k}'">${n}</button>`).join('')}</div>`;
  if (sub === 'check') return Views.meatCheck(tabs);
  if (sub === 'pack') return Views.pack(tabs);
  const t = (await DB.setting('meatTimer')) || {};
  render(`<h1>Meat & pack-out</h1>${tabs}
  <div class="card ${t.start ? 'hl' : ''}"><h2>Meat-care timer</h2>
  <div class="row"><div><label>Animal down at</label><input type="datetime-local" id="mt_s" value="${t.start ? new Date(t.start - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''}"></div><div><label>Air temp °F</label><input id="mt_t" inputmode="decimal" value="${esc(t.tempF ?? '')}" placeholder="e.g. 55"></div></div>
  <div class="row" style="margin-top:8px"><button class="primary" id="mt_go">${t.start ? 'Update' : 'Start – animal down now'}</button>${t.start ? '<button id="mt_ice">Meat is on ice / ≤40°F</button><button class="sm" id="mt_clr">Reset</button>' : ''}</div>
  <div id="mt_out" style="margin-top:12px"></div></div>
  <div class="card"><h3>About these numbers</h3><p class="small">The 40°F–140°F “Danger Zone” and the 2-hour / 1-hour (above 90°F) limits come from <a href="https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/danger-zone-40f-140f" target="_blank" rel="noopener">USDA Food Safety and Inspection Service – “Danger Zone” (40°F–140°F)</a>. That guidance is for food out of refrigeration; a big-game carcass holds body heat in thick muscle for hours, so treat these as the most conservative reference, not a promise that meat is safe or spoiled. Cool meat as fast as you can, keep it clean and dry, and when in doubt, throw it out. Check your state wildlife agency’s field-care and wanton-waste rules.</p></div>`);
  const out = $('#mt_out');
  const draw = () => {
    if (!t.start) { out.innerHTML = '<p class="mute">Start the timer when the animal is down. Enter the current air temperature to get guidance.</p>' + guidance(+t.tempF); return; }
    const end = t.iced || Date.now(), mins = (end - t.start) / 6e4, temp = +t.tempF;
    const limit = isFinite(temp) && t.tempF !== '' ? (temp > 90 ? 60 : temp > 40 ? 120 : null) : 120;
    const left = limit != null ? limit - mins : null;
    const cls = t.iced ? 'ok' : left == null ? 'ok' : left < 0 ? 'bad' : left < 30 ? 'warn' : 'ok';
    out.innerHTML = `<div class="spread"><div><div class="mute small">${t.iced ? 'Time until on ice' : 'Elapsed since down'}</div><div class="big timer">${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m</div></div><span class="badge ${cls}">${t.iced ? 'On ice ✓' : left == null ? 'Cold air – keep cooling' : left < 0 ? 'Past USDA reference' : Math.round(left) + ' min to USDA ref.'}</span></div>` + guidance(temp, mins, t.iced);
  };
  draw(); clearInterval(window._mt); window._mt = setInterval(() => { if (location.hash.startsWith('#/meat') && !location.hash.includes('/check') && !location.hash.includes('/pack')) draw(); else clearInterval(window._mt); }, 15000);
  $('#mt_go').onclick = async () => { const v = $('#mt_s').value; t.start = v ? new Date(v).getTime() : Date.now(); t.tempF = $('#mt_t').value; delete t.iced; await DB.setting('meatTimer', t); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); Views.meat('timer'); };
  if ($('#mt_ice')) $('#mt_ice').onclick = async () => { t.iced = Date.now(); await DB.setting('meatTimer', t); Views.meat('timer'); };
  if ($('#mt_clr')) $('#mt_clr').onclick = async () => { await DB.setting('meatTimer', {}); Views.meat('timer'); };
};
function guidance(temp, mins = 0, iced) {
  if (iced) return '<div class="note blue">Meat is cold. Keep it at or below 40°F, dry, and clean until processing. Drain cooler water so meat doesn’t sit in it.</div>';
  if (!isFinite(temp)) return '<div class="note">Enter air temperature for guidance. Until then, assume warm conditions: skin, quarter and bag right away, and get meat cold as soon as possible.</div>';
  let h = '';
  if (temp > 90) h = `<div class="note red"><b>Hot (above 90°F).</b> USDA reference: perishable food shouldn’t sit out more than <b>1 hour</b> at these temps. Get hide off and meat off the bone now, into breathable bags in deep shade, and onto ice or into a cooler immediately. Plan the pack-out before you shoot in heat like this.</div>`;
  else if (temp > 40) h = `<div class="note"><b>Danger-zone air (41–90°F).</b> USDA reference: no more than <b>2 hours</b> out of refrigeration. A carcass won’t cool itself in this air. Skin and quarter quickly, open up thick muscle (or bone out), hang bags in shade with airflow off the ground, and get meat on ice or into a ≤40°F cooler the same day – sooner the warmer it is. Midday warm-ups count.</div>`;
  else h = `<div class="note blue"><b>Cold air (40°F or below).</b> Air helps, but the core of big muscle (elk hindquarters) can stay warm for hours, so still skin, quarter and hang in shade with airflow right away. Keep bags dry and off the ground, protect from sun and afternoon warm-ups, and watch for birds/bears.</div>`;
  const steps = [['Skin & quarter (or bone out)', 60], ['Meat bagged & hanging in shade/airflow', 90], ['Meat on ice / ≤40°F', temp > 90 ? 60 : 120]];
  h += `<ul class="list small">${steps.map(([s, m]) => `<li class="spread"><span>${s}</span><span class="badge ${mins > m ? 'warn' : ''}">target ≤ ${m} min${mins > m ? ' – overdue' : ''}</span></li>`).join('')}</ul><p class="mute small">Targets are conservative app guidance derived from the USDA 2h/1h reference, not legal or medical advice.</p>`;
  return h;
}
Views.meatCheck = async tabs => {
  const st = (await DB.setting('checklists')) || {};
  render(`<h1>Meat & pack-out</h1>${tabs}${Object.entries(CHECKLISTS).map(([name, items]) => { const s = st[name] || []; return `<div class="card"><div class="spread"><h2>${esc(name)}</h2><span class="badge">${s.filter(Boolean).length}/${items.length}</span></div>${items.map((it, i) => `<label class="check ${s[i] ? 'done' : ''}"><input type="checkbox" data-l="${esc(name)}" data-i="${i}" ${s[i] ? 'checked' : ''}><span>${esc(it)}</span></label>`).join('')}<button class="sm" data-reset="${esc(name)}" style="margin-top:8px">Reset</button></div>`; }).join('')}
  <p class="mute small">General field-care steps. Follow your state’s tagging, evidence-of-sex and wanton-waste laws (e.g. CPW in Colorado, WGFD in Wyoming).</p>`);
  $$('input[data-l]').forEach(c => c.onchange = async () => { (st[c.dataset.l] = st[c.dataset.l] || [])[+c.dataset.i] = c.checked; await DB.setting('checklists', st); c.closest('.check').classList.toggle('done', c.checked); });
  $$('[data-reset]').forEach(b => b.onclick = async () => { st[b.dataset.reset] = []; await DB.setting('checklists', st); Views.meat('check'); });
};
const MEAT_EST = { 'Elk – bull': { bone: 300, boned: 225 }, 'Elk – cow': { bone: 240, boned: 175 }, 'Mule deer – buck': { bone: 105, boned: 70 }, 'Mule deer – doe': { bone: 80, boned: 52 }, 'Whitetail': { bone: 75, boned: 50 }, 'Custom': { bone: 0, boned: 0 } };
Views.pack = async tabs => {
  const s = Object.assign({ animal: 'Elk – bull', boned: true, meat: '', head: 30, body: 190, maxPct: 30, base: 12, people: 1, miles: 2 }, (await DB.setting('pack')) || {});
  render(`<h1>Meat & pack-out</h1>${tabs}<div class="card"><h2>Pack-weight planner</h2>
  <label>Animal</label><select id="pa">${Object.keys(MEAT_EST).map(k => `<option ${k === s.animal ? 'selected' : ''}>${k}</option>`).join('')}</select>
  <label class="opt"><input type="checkbox" id="pb" ${s.boned ? 'checked' : ''}><span class="grow">Boned out (lighter) – uncheck for bone-in quarters</span></label>
  <div class="row"><div><label>Meat lb (override)</label><input id="pm" inputmode="decimal" value="${esc(s.meat)}" placeholder="auto"></div><div><label>Head/antlers/cape lb</label><input id="ph" inputmode="decimal" value="${s.head}"></div></div>
  <div class="row"><div><label>Your body weight lb</label><input id="pw" inputmode="decimal" value="${s.body}"></div><div><label>Max load % of body wt</label><input id="pp" inputmode="decimal" value="${s.maxPct}"></div></div>
  <div class="row"><div><label>Pack + gear lb</label><input id="pg" inputmode="decimal" value="${s.base}"></div><div><label>People packing</label><input id="pn" inputmode="numeric" value="${s.people}"></div><div><label>Miles one way</label><input id="pd" inputmode="decimal" value="${s.miles}"></div></div>
  <div id="pout" style="margin-top:12px"></div></div>
  <div class="card small mute">Meat weights are rough averages for a mature animal – weigh your own and adjust. The max-load % is your call: many backpacking guides suggest keeping loads to a fraction of body weight, and heavy loads on steep ground raise injury risk. Splitting into more trips is always safer.</div>`);
  const calc = async () => {
    Object.assign(s, { animal: $('#pa').value, boned: $('#pb').checked, meat: $('#pm').value, head: +$('#ph').value || 0, body: +$('#pw').value || 0, maxPct: +$('#pp').value || 0, base: +$('#pg').value || 0, people: Math.max(1, +$('#pn').value || 1), miles: +$('#pd').value || 0 });
    await DB.setting('pack', s);
    const est = MEAT_EST[s.animal], meat = s.meat !== '' ? +s.meat : (s.boned ? est.boned : est.bone), total = meat + s.head;
    const max = s.body * s.maxPct / 100, cap = Math.max(0, max - s.base);
    const loads = cap > 0 ? Math.ceil(total / (cap * s.people)) : Infinity;
    const perTrip = loads === Infinity ? 0 : total / (loads * s.people);
    out.innerHTML = cap <= 0 ? '<div class="note red">Max load is below your pack weight – raise the % or lighten the pack.</div>' :
      `<div class="row"><div><div class="big">${Math.round(total)} lb</div><div class="mute small">to haul (${Math.round(meat)} meat + ${s.head} head)</div></div><div><div class="big" style="color:var(--brand)">${loads}</div><div class="mute small">trip${loads > 1 ? 's' : ''} each × ${s.people} ${s.people > 1 ? 'people' : 'person'}</div></div></div>
      <p>Each load ≈ <b>${Math.round(perTrip)} lb</b> of meat/head + ${s.base} lb pack = <b>${Math.round(perTrip + s.base)} lb</b> on your back (max ${Math.round(max)}).</p>
      <p class="mute small">${s.miles ? `≈ ${(loads * s.miles * 2 - s.miles).toFixed(1)} miles of walking each (loaded out, empty back in). ` : ''}Bone-in elk quarters often weigh 40–80 lb each – one per trip is a common plan.</p>`;
  };
  const out = $('#pout'); $$('#view input, #view select').forEach(i => i.oninput = i.onchange = calc); calc();
};

/* ================= COMMUNITY + DATA ================= */
Views.community = () => render(`<div class="hero card hl"><img src="design/icons/icon-512.png" alt="SWSF logo"><div><h1>Camp</h1><p>Coming soon.</p></div></div>
  <div class="card"><p>A place for DIY public-land hunters to share honest gear reviews and trip reports, by <b>Stay Wild Stay Free Outdoors</b>.</p><p class="mute">This needs accounts and a server, so it isn’t built yet. Everything else in the app works with no account and keeps your data on your phone.</p>
  <a class="btn primary" href="https://www.youtube.com/@staywildstayfreeoutdoors" target="_blank" rel="noopener">Watch full hunts on YouTube</a></div>`);

Views.data = async () => {
  const items = await DB.all(), cnt = t => items.filter(i => i.type === t).length;
  const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const light = document.documentElement.dataset.theme === 'light';
  render(`<h1>Backup & help</h1>
  <div class="card"><h2>Display</h2><label class="check"><input type="checkbox" id="daylight" ${light ? 'checked' : ''}> Daylight theme (high contrast for bright sun)</label><p class="mute small">Dark is the default and easiest on night vision.</p></div>
  <div class="card"><h2>Your data</h2><p class="small">${cnt('pin')} pins · ${cnt('track')} tracks · ${cnt('hunt')} hunts · ${cnt('clip')} clips · ${cnt('gear')} batteries/cards · ${(await DB.allPhotos()).length} photos${est ? ` · using ${(est.usage / 1048576).toFixed(1)} MB` : ''}</p>
  <p class="small">${persisted ? '✅ Storage is marked persistent.' : '⚠️ The browser may clear site data if the phone runs low on space. Back up often.'}</p>
  <div class="row"><button class="primary" id="exp">⇩ Export backup (JSON)</button><button id="imp">⇧ Import backup</button></div>
  ${!persisted ? '<button class="sm" id="persist" style="margin-top:8px">Ask browser to keep my data</button>' : ''}
  <p class="mute small">Backups contain exact pin locations and photos. Keep them private – don’t post the file.</p></div>
  <div class="card"><h2>Install on your phone</h2><p class="small"><b>iPhone (Safari):</b> Share button → <i>Add to Home Screen</i>. <b>Android (Chrome):</b> ⋮ menu → <i>Install app</i> / <i>Add to Home screen</i>. After the first load the app opens offline. Map tiles you have viewed are cached; open your hunt area on Wi-Fi first (zoom through it) so it’s there with no signal.</p></div>
  <div class="card"><h2>Getting pins out of onX</h2><p class="small">onX has no public API, so pins come in by file. Per onX’s help center (support.onxmaps.com, “How to import and export Markups”):</p>
  <p class="small"><b>onX Hunt phone app (GPX only):</b> My Content → Select → tick the waypoints/tracks → swipe/scroll the bottom buttons → Export → save to Files or share it to this phone. You can also export a single pin from its own options, or a whole folder (folder export is iOS only).</p>
  <p class="small"><b>onX Web Map (GPX or KML):</b> webmap.onxmaps.com → My Content → Select (or Select All) → Export → choose GPX or KML → Save. Tip from onX: export tracks as GPX (KML turns them into lines). Photos and (from the Web Map) notes are not included in onX exports.</p>
  <p class="small">Then tap <b>⇪ onX</b> on the map (or <i>Import onX</i> on Pins) and pick the file.</p>
  <p class="small">Re-importing the same or an updated file won’t duplicate anything: a pin is matched when the name matches within ${Parser.NAME_TOL} m, or when it’s at the same spot (within ${Parser.SAME_SPOT} m) even if you renamed it in onX. Your notes, photos, weather and sightings are never overwritten.</p></div>
  <div class="card"><h2>Map sources</h2><p class="small mute">USGS The National Map (USGS Topo, imagery, 3DEP elevation incl. lidar-derived hillshade, NHD water), Esri World Imagery, OpenTopoMap, OpenStreetMap, AWS Terrain Tiles (3D), BLM Surface Management Agency, USGS PAD-US, Open-Meteo weather. Boundaries are approximate. No owner names or parcel lines.</p></div>
  <div class="card"><h2>Danger zone</h2><button class="danger" id="wipe">Erase all data on this phone</button></div>
  <p class="mute small" style="text-align:center">SWSF Hunt Journal v1 · Stay Wild Stay Free Outdoors</p>`);
  $('#daylight').onchange = e => { const on = e.target.checked; if (on) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme; try { localStorage.setItem('swsf-theme', on ? 'light' : 'dark'); } catch { } DB.setting('theme', on ? 'light' : 'dark'); document.querySelector('meta[name=theme-color]').content = on ? '#F4EEE4' : '#12151A'; MapView.map && MapView.map.resize(); };
  $('#exp').onclick = async () => { const j = await Backup.exportAll(); download(`swsf-hunt-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(j)); toast('Backup downloaded'); };
  $('#imp').onclick = () => $('#backupInput').click();
  if ($('#persist')) $('#persist').onclick = async () => { const ok = await navigator.storage.persist(); toast(ok ? 'Data will be kept' : 'Browser said no – install to home screen and try again'); Views.data(); };
  $('#wipe').onclick = async () => { if (confirm('Erase ALL pins, notes, photos and settings on this phone?') && confirm('Really? Export a backup first if unsure.')) { await DB.clear(); MapView.refreshData(); toast('Erased'); Views.data(); } };
};
