/* Router + import wiring + offline service worker. */
(function () {
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'map';
    const [path, qs] = h.split('?'); const parts = path.split('/');
    return { parts, params: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  async function route() {
    const { parts, params } = parseHash(); const top = parts[0];
    const tab = { pin: 'pins', track: 'pins', hunt: 'film' }[top] || top;
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    if (top === 'map') { document.getElementById('view').innerHTML = ''; MapView.show(); return; }
    MapView.hide();
    try {
      switch (top) {
        case 'pins': return await Views.pins();
        case 'pin': return await Views.pin(parts[1]);
        case 'track': return await Views.track(parts[1]);
        case 'film': return await Views.film(parts[1] || 'hunts', params);
        case 'hunt': return await Views.hunt(parts[1]);
        case 'meat': return await Views.meat(parts[1] || 'timer');
        case 'pods': return await Views.pods(parts[1] || 'library', params);
        case 'score': return await Views.score(parts[1], { ...params, sub: parts[2] });
        case 'draws': return await Views.draws(parts[1] || 'deadlines', params);
        case 'community': return Views.community();
        case 'data': return await Views.data();
        default: location.hash = '#/map';
      }
    } catch (e) { console.error(e); document.getElementById('view').innerHTML = `<div class="note red">Something went wrong: ${esc(e.message)}</div>`; }
  }
  window.addEventListener('hashchange', route);

  document.getElementById('gpxInput').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const parsed = Parser.parse(await f.text(), f.name);
      if (!parsed.waypoints.length && !parsed.tracks.length) return toast('No pins or tracks found in that file');
      const r = await Parser.merge(parsed);
      const msg = `${parsed.format}: ${r.newPins} new pin${r.newPins === 1 ? '' : 's'}, ${r.matchedPins} matched (notes kept)${r.renamed ? `, ${r.renamed} renamed` : ''} · ${r.newTracks} new track${r.newTracks === 1 ? '' : 's'}, ${r.matchedTracks} updated`;
      toast(msg, 5000);
      await DB.put({ id: DB.uid('imp_'), type: 'importlog', file: f.name, at: Date.now(), ...r, pinIds: undefined, trackIds: undefined });
      location.hash = '#/map';
      setTimeout(async () => { await MapView.init(); MapView.refreshData([...r.pinIds, ...r.trackIds]); }, 150);
    } catch (err) { toast(err.message, 5000); }
  });
  document.getElementById('backupInput').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const replace = confirm('Replace everything on this phone with the backup?\n\nOK = replace all · Cancel = merge (keeps newer edits)');
      const r = await Backup.importAll(json, replace ? 'replace' : 'merge');
      toast(`Backup restored: ${r.added} added, ${r.updated} updated, ${r.photos} photos`, 5000);
      MapView.refreshData(); route();
    } catch (err) { toast('Import failed: ' + err.message, 5000); }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  route();
  setTimeout(() => Draws.checkReminders(), 1500);
})();
