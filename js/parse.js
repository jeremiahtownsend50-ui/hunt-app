/* GPX / KML parsing (onX exports) and re-import matching. */
const Geo = {
  dist(a, b) { // metres, haversine
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  normName: s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim(),
  trackStats(pts) {
    let d = 0, gain = 0;
    for (let i = 1; i < pts.length; i++) {
      d += Geo.dist({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
      const de = (pts[i][2] ?? 0) - (pts[i - 1][2] ?? 0); if (de > 0) gain += de;
    }
    return { distM: d, gainM: gain };
  },
  fmtMi: m => (m / 1609.344).toFixed(2) + ' mi',
  fmtFt: m => Math.round(m * 3.28084).toLocaleString() + ' ft',
  fmtLL: (lat, lon) => lat.toFixed(5) + ', ' + lon.toFixed(5)
};

const Parser = {
  txt(el, tag) { const n = el.getElementsByTagName(tag)[0]; return n ? n.textContent.trim() : ''; },
  parse(text, filename = '') {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read that file (not valid GPX/KML XML).');
    const root = doc.documentElement.nodeName.toLowerCase();
    if (root.endsWith('gpx')) return this.gpx(doc, filename);
    if (root.endsWith('kml')) return this.kml(doc, filename);
    throw new Error('Unsupported file. Export a GPX or KML from onX.');
  },
  gpx(doc, filename) {
    const creator = doc.documentElement.getAttribute('creator') || '';
    const wpts = [...doc.getElementsByTagName('wpt')].map(w => ({
      name: this.txt(w, 'name') || 'Unnamed pin',
      lat: +w.getAttribute('lat'), lon: +w.getAttribute('lon'),
      ele: this.txt(w, 'ele') ? +this.txt(w, 'ele') : null,
      time: this.txt(w, 'time') || null,
      desc: this.txt(w, 'desc') || this.txt(w, 'cmt') || '',
      sym: this.txt(w, 'sym') || this.txt(w, 'type') || ''
    })).filter(p => isFinite(p.lat) && isFinite(p.lon));
    const tracks = [];
    for (const t of doc.getElementsByTagName('trk')) {
      const pts = [];
      for (const p of t.getElementsByTagName('trkpt')) {
        const lat = +p.getAttribute('lat'), lon = +p.getAttribute('lon');
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const e = this.txt(p, 'ele'), tm = this.txt(p, 'time');
        pts.push([lat, lon, e ? +e : null, tm || null]);
      }
      if (pts.length > 1) tracks.push({ name: (this.txt(t, 'name') || 'Track').trim(), points: pts });
    }
    for (const r of doc.getElementsByTagName('rte')) {
      const pts = [...r.getElementsByTagName('rtept')].map(p => [+p.getAttribute('lat'), +p.getAttribute('lon'), null, null]);
      if (pts.length > 1) tracks.push({ name: (this.txt(r, 'name') || 'Route').trim(), points: pts });
    }
    return { format: 'GPX', creator, filename, waypoints: wpts, tracks };
  },
  kml(doc, filename) {
    const wpts = [], tracks = [];
    const coordsOf = s => s.trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]));
    for (const pm of doc.getElementsByTagName('Placemark')) {
      const name = (this.txt(pm, 'name') || '').trim();
      const desc = this.txt(pm, 'description');
      const when = this.txt(pm, 'when') || this.txt(pm, 'begin') || null;
      const pt = pm.getElementsByTagName('Point')[0];
      if (pt) {
        const c = coordsOf(this.txt(pt, 'coordinates'))[0];
        if (c) wpts.push({ name: name || 'Unnamed pin', lat: c[1], lon: c[0], ele: c[2] ?? null, time: when, desc: desc.replace(/<[^>]+>/g, ' ').trim(), sym: '' });
      }
      for (const ls of pm.getElementsByTagName('LineString')) {
        const pts = coordsOf(this.txt(ls, 'coordinates')).map(c => [c[1], c[0], c[2] ?? null, null]);
        if (pts.length > 1) tracks.push({ name: name || 'Track', points: pts });
      }
      const gx = pm.getElementsByTagNameNS('*', 'Track');
      for (const g of gx) {
        const whens = [...g.getElementsByTagName('when')].map(w => w.textContent.trim());
        const cs = [...g.getElementsByTagNameNS('*', 'coord')].map(c => c.textContent.trim().split(/\s+/).map(Number));
        const pts = cs.map((c, i) => [c[1], c[0], c[2] ?? null, whens[i] || null]);
        if (pts.length > 1) tracks.push({ name: name || 'Track', points: pts });
      }
    }
    return { format: 'KML', creator: 'KML', filename, waypoints: wpts, tracks };
  },

  /* Merge parsed file into the journal without losing notes or creating duplicates.
     Pin match rule: same name (case/space-insensitive) within NAME_TOL metres,
     or (renamed in onX) any name within SAME_SPOT metres. */
  NAME_TOL: 30, SAME_SPOT: 3,
  async merge(parsed) {
    const pins = await DB.all('pin'), tracks = await DB.all('track');
    const res = { newPins: 0, matchedPins: 0, renamed: 0, newTracks: 0, matchedTracks: 0, pinIds: [], trackIds: [] };
    const claimed = new Set();
    for (const w of parsed.waypoints) {
      let best = null, bestD = Infinity;
      for (const p of pins) {
        if (claimed.has(p.id)) continue;
        const d = Geo.dist(p, w);
        const sameName = Geo.normName(p.importName || p.name) === Geo.normName(w.name);
        if ((sameName && d <= this.NAME_TOL) || d <= this.SAME_SPOT) { if (d < bestD) { best = p; bestD = d; } }
      }
      if (best) {
        claimed.add(best.id);
        if (Geo.normName(best.importName || best.name) !== Geo.normName(w.name)) res.renamed++;
        // update only the onX-owned fields; journal fields (notes, photos, weather, sightings...) untouched
        Object.assign(best, { importName: w.name, lat: w.lat, lon: w.lon, ele: w.ele, time: w.time || best.time, desc: w.desc || best.desc, sym: w.sym || best.sym, lastImport: Date.now(), importCount: (best.importCount || 1) + 1 });
        if (!best.renamedLocally) best.name = w.name;
        await DB.put(best); res.matchedPins++; res.pinIds.push(best.id);
      } else {
        const p = { id: DB.uid('pin_'), type: 'pin', source: 'onx', name: w.name, importName: w.name, lat: w.lat, lon: w.lon, ele: w.ele, time: w.time, desc: w.desc, sym: w.sym,
          date: (w.time || '').slice(0, 10), notes: '', weather: {}, sightings: [], photoIds: [], importCount: 1, lastImport: Date.now(), file: parsed.filename };
        await DB.put(p); pins.push(p); claimed.add(p.id); res.newPins++; res.pinIds.push(p.id);
      }
    }
    for (const t of parsed.tracks) {
      const start = t.points[0], st = Geo.trackStats(t.points);
      const m = tracks.find(x => Geo.normName(x.name) === Geo.normName(t.name) &&
        ((x.start && start[3] && x.start === start[3]) || (Geo.dist({ lat: x.points[0][0], lon: x.points[0][1] }, { lat: start[0], lon: start[1] }) < 10 && Math.abs(x.points.length - t.points.length) < 3)));
      if (m) { Object.assign(m, { points: t.points, ...st, end: t.points.at(-1)[3] }); await DB.put(m); res.matchedTracks++; res.trackIds.push(m.id); }
      else {
        const n = { id: DB.uid('trk_'), type: 'track', name: t.name, points: t.points, start: start[3], end: t.points.at(-1)[3], ...st, notes: '', file: parsed.filename };
        await DB.put(n); tracks.push(n); res.newTracks++; res.trackIds.push(n.id);
      }
    }
    return res;
  }
};
