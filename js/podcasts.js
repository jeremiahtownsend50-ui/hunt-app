/* Podcasts: curated starter library (each show verified on Apple Podcasts directory, Nov 2026),
   latest episodes via the Apple iTunes Lookup API (CORS-enabled, no key), custom shows by RSS / Apple link,
   favorites, and attach an episode or note to a hunt or pin. */
const PODCASTS = [
  { id: 1012713381, name: 'Hunt Talk Radio', host: 'Randy Newberg', feed: 'https://feeds.megaphone.fm/hunttalkradio', tags: ['DIY public land', 'elk', 'mule deer', 'draws', 'conservation'], why: 'The DIY public-land hunter’s show. Strategy for draws and points, hunting public ground, and the policy that affects access.' },
  { id: 1402903701, name: 'Elk Talk', host: 'Randy Newberg & Corey Jacobsen (Elk101)', feed: 'https://feeds.megaphone.fm/elktalk', tags: ['elk', 'tactics', 'calling', 'DIY public land'], why: 'Pure elk: calling, setups, reading bulls and season-by-season tactics from two of the best public-land elk hunters.' },
  { id: 1020880772, name: 'The Hunt Backcountry Podcast', host: 'Exo Mtn Gear', feed: 'https://feed.podbean.com/huntbackcountry/feed.xml', tags: ['backcountry', 'gear', 'elk', 'mule deer', 'meat care'], why: 'Backpack hunting from the Exo Mtn Gear crew: gear systems, pack-outs, fitness and long backcountry hunts.' },
  { id: 1615426118, name: 'Big Hunt Guys', host: 'GOHUNT', feed: 'https://api.riverside.com/hosting/UYavs82h.rss', tags: ['draws', 'applications', 'scouting', 'mapping', 'elk', 'mule deer'], why: 'GOHUNT’s show: application strategy, draw odds, unit research and western big-game planning.' },
  { id: 1473746379, name: 'Rokcast', host: 'Rokslide', feed: 'https://www.rokslide.com/feed/podcast/', tags: ['backcountry', 'gear', 'rifles', 'elk', 'mule deer'], why: 'Straight-talk backcountry hunting and gear testing from the Rokslide forum crew – rifles, optics, packs.' },
  { id: 1315352438, name: 'ElkShape', host: 'Dan Staton', feed: 'https://feeds.megaphone.fm/WPCM8873430144', tags: ['elk', 'fitness', 'tactics', 'DIY public land'], why: 'Elk hunting plus the training to do it: fitness, mindset and DIY elk strategy.' },
  { id: 1612529390, name: 'Live Wild with Remi Warren', host: 'Remi Warren', feed: 'https://feeds.megaphone.fm/livewild', tags: ['tactics', 'elk', 'mule deer', 'scouting'], why: 'Tactics-heavy episodes from a western guide and TV host: glassing, stalking, wind and reading terrain.' },
  { id: 1148709228, name: 'Eastmans’ Elevated', host: 'Eastmans’ (Brian Barney)', feed: 'https://feeds.soundcloud.com/users/soundcloud:users:250497998/sounds.rss', tags: ['mule deer', 'elk', 'draws', 'gear'], why: 'Long-running western hunting show with strong mule deer and draw content.' },
  { id: 1203067497, name: 'The Grind Podcast', host: 'Muley Freak', feed: 'https://feeds.blubrry.com/feeds/muleyfreakpodcast.xml', tags: ['mule deer', 'scouting', 'self-filming'], why: 'Mule deer obsessives: scouting big bucks, glassing and filming hunts. (New episodes are less frequent.)' },
  { id: 960902903, name: 'The MeatEater Podcast', host: 'Steven Rinella / MeatEater', feed: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/63aba8bc-2dc8-4f89-807a-ae280065a7cd/3892b9a1-a960-4f9e-bee7-ae280065a7db/podcast.rss', tags: ['meat care', 'conservation', 'elk', 'stories'], why: 'Hunting, wild food and conservation. Good for meat care, wild-game cooking and big-picture public-land issues.' },
  { id: 852332047, name: 'Wired To Hunt', host: 'Mark Kenyon / MeatEater', feed: 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/fc712b63-a21e-49e9-a45b-ae280065a8f9/117dc6ca-56a3-4b9e-932e-ae280065a907/podcast.rss', tags: ['whitetail', 'scouting', 'mapping', 'tactics'], why: 'The deep-dive whitetail show – useful for your Oklahoma whitetail hunts: scouting, mapping and stand strategy.' },
  { id: 981781015, name: 'The Rich Outdoors', host: 'Cody Rich', feed: 'https://www.therichoutdoors.net/?feed=podcast', tags: ['backcountry', 'mule deer', 'elk', 'gear'], why: 'Interviews with western hunters on backcountry mule deer, elk and gear.' },
  { id: 1446754787, name: 'The Western Rookie', host: 'Sportsmen’s Empire', feed: 'https://feeds.simplecast.com/A5xmzheX', tags: ['beginner', 'DIY public land', 'draws', 'elk', 'mule deer'], why: 'Learning to hunt the West from scratch: great for newer hunters and planning a first DIY trip.' }
];
const SWSF_FEATURED = { channel: 'https://www.youtube.com/@staywildstayfreeoutdoors', videos: [{ title: 'Mid-season recap 2026 (Short)', url: 'https://youtube.com/shorts/BZObou3Giak' }, { title: 'Bow practice video', url: 'https://youtu.be/UMxzw-FDoP0' }] };
const appleURL = id => `https://podcasts.apple.com/us/podcast/id${id}`;

async function lookupEpisodes(id, n = 8) {
  const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=podcastEpisode&limit=${n}`);
  const j = await r.json();
  const show = j.results.find(x => x.wrapperType === 'track' || x.kind === 'podcast') || {};
  const eps = j.results.filter(x => x.wrapperType === 'podcastEpisode').map(e => ({ title: e.trackName, date: e.releaseDate, audio: e.episodeUrl, page: e.trackViewUrl, mins: e.trackTimeMillis ? Math.round(e.trackTimeMillis / 6e4) : null, desc: (e.description || '').slice(0, 220) }));
  return { show, eps };
}
async function rssEpisodes(url, n = 8) {
  const r = await fetch(url); const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const title = (doc.querySelector('channel > title') || {}).textContent || url;
  const eps = [...doc.querySelectorAll('item')].slice(0, n).map(it => ({ title: (it.querySelector('title') || {}).textContent, date: (it.querySelector('pubDate') || {}).textContent, audio: (it.querySelector('enclosure') || { getAttribute: () => '' }).getAttribute('url'), page: (it.querySelector('link') || {}).textContent, desc: ((it.querySelector('description') || {}).textContent || '').replace(/<[^>]+>/g, '').slice(0, 220) }));
  return { title, eps };
}

Views.pods = async (sub = 'library', params = {}) => {
  const custom = await DB.all('podshow'), favs = (await DB.all('podfav')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const feat = Object.assign({}, SWSF_FEATURED, (await DB.setting('featured')) || {});
  const tags = [...new Set(PODCASTS.flatMap(p => p.tags))];
  const tag = params.tag || '';
  const shows = PODCASTS.filter(p => !tag || p.tags.includes(tag));
  const tabs = `<div class="segs" style="margin-bottom:8px">${[['library', 'Library'], ['favs', `Favorites (${favs.length})`], ['add', 'Add show']].map(([k, n]) => `<button class="${sub === k ? 'on' : ''}" onclick="location.hash='#/pods/${k}'">${n}</button>`).join('')}</div>`;
  const featured = `<div class="card hl"><div class="hero"><img src="design/icons/icon-192.png" alt="" style="width:56px;height:56px"><div><div class="mute small">FEATURED</div><h2 style="margin:0">Stay Wild Stay Free Outdoors</h2><div class="small">Full DIY hunts on YouTube</div></div></div>
    <ul class="list">${feat.videos.map(v => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">▶ ${esc(v.title)}</a></li>`).join('')}</ul>
    <a class="btn primary" style="width:100%" href="${esc(feat.channel)}" target="_blank" rel="noopener">Open the YouTube channel</a></div>`;
  if (sub === 'favs') {
    render(`<h1>Podcasts</h1>${tabs}<div class="card"><ul class="list">${favs.map(f => `<li class="ep"><div class="spread"><b>${esc(f.title)}</b><button class="star on" data-unfav="${f.id}">★</button></div><div class="mute small">${esc(f.show)} · ${fmtD(f.date)}</div>${f.audio ? `<audio controls preload="none" src="${esc(f.audio)}"></audio>` : ''}<div class="row" style="margin-top:4px">${f.page ? `<a class="btn sm" href="${esc(f.page)}" target="_blank" rel="noopener">Open</a>` : ''}<button class="sm" data-att="${f.id}">Attach to hunt/pin</button></div></li>`).join('') || '<li class="mute">Tap ☆ on any episode to save it here.</li>'}</ul></div>`);
    $$('[data-unfav]').forEach(b => b.onclick = async () => { await DB.del(b.dataset.unfav); Views.pods('favs'); });
    $$('[data-att]').forEach(b => b.onclick = () => { const f = favs.find(x => x.id === b.dataset.att); attachDialog({ title: `${f.show}: ${f.title}`, url: f.page || f.audio }); });
    return;
  }
  if (sub === 'add') {
    render(`<h1>Podcasts</h1>${tabs}<div class="card"><h2>Add your own show</h2><label>RSS feed URL or Apple Podcasts link</label><input id="pu" placeholder="https://…/feed.xml or https://podcasts.apple.com/…/id123…"><label>Name (optional)</label><input id="pn"><label>Why it helps / your note</label><input id="pw"><button class="primary" id="padd" style="width:100%;margin-top:10px">+ Add show</button><p class="mute small">Apple Podcasts links load the latest episodes. Many RSS feeds block in-browser reading (CORS); those are saved as a link you can open.</p></div>
    <div class="card"><h2>Your shows (${custom.length})</h2><ul class="list">${custom.map(c => `<li class="spread"><a href="#/pods/show?custom=${c.id}">${esc(c.name)}</a><button class="sm" data-rm="${c.id}">✕</button></li>`).join('') || '<li class="mute">None yet.</li>'}</ul></div>
    <div class="card"><h2>Feature your channel</h2><label>Channel URL</label><input id="fc" value="${esc(feat.channel)}"><label>Featured videos (one per line: Title | URL)</label><textarea id="fv">${esc(feat.videos.map(v => v.title + ' | ' + v.url).join('\n'))}</textarea><button id="fsave" style="width:100%;margin-top:8px">Save featured</button></div>`);
    $('#padd').onclick = async () => {
      const u = $('#pu').value.trim(); if (!/^https?:\/\//.test(u)) return toast('Paste a full https:// link');
      const m = u.match(/id(\d{6,})/); const item = { id: DB.uid('pod_'), type: 'podshow', url: u, appleId: m ? +m[1] : null, name: $('#pn').value.trim(), why: $('#pw').value.trim() };
      try { if (item.appleId) { const { show } = await lookupEpisodes(item.appleId, 1); item.name = item.name || show.collectionName; item.feed = show.feedUrl; item.host = show.artistName; } else { const r = await rssEpisodes(u, 1); item.name = item.name || r.title.trim(); item.feed = u; item.cors = true; } } catch (e) { item.name = item.name || u; item.linkOnly = true; }
      await DB.put(item); toast('Show added'); location.hash = '#/pods/show?custom=' + item.id;
    };
    $$('[data-rm]').forEach(b => b.onclick = async () => { await DB.del(b.dataset.rm); Views.pods('add'); });
    $('#fsave').onclick = async () => { const videos = $('#fv').value.split('\n').map(l => l.split('|').map(s => s.trim())).filter(a => a[1]).map(([title, url]) => ({ title, url })); await DB.setting('featured', { channel: $('#fc').value.trim() || SWSF_FEATURED.channel, videos }); toast('Saved'); };
    return;
  }
  if (sub === 'show') return showPage(params, favs);
  render(`<h1>Podcasts</h1>${tabs}${featured}
  <div class="chips"><button class="chip ${!tag ? 'on' : ''}" onclick="location.hash='#/pods/library'">All</button>${tags.map(t => `<button class="chip ${t === tag ? 'on' : ''}" onclick="location.hash='#/pods/library?tag=${encodeURIComponent(t)}'">${esc(t)}</button>`).join('')}</div>
  ${shows.map(p => `<div class="card"><div class="spread"><h3 style="margin:0">${esc(p.name)}</h3><a class="btn sm" href="#/pods/show?id=${p.id}">Episodes</a></div><div class="mute small">${esc(p.host)}</div><p class="small">${esc(p.why)}</p><div>${p.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div><div class="small" style="margin-top:6px"><a href="${appleURL(p.id)}" target="_blank" rel="noopener">Apple Podcasts</a> · <a href="${esc(p.feed)}" target="_blank" rel="noopener">RSS</a></div></div>`).join('')}
  ${custom.length ? `<h2>Your shows</h2>${custom.map(c => `<div class="card"><div class="spread"><h3 style="margin:0">${esc(c.name)}</h3><a class="btn sm" href="#/pods/show?custom=${c.id}">Open</a></div>${c.why ? `<p class="small">${esc(c.why)}</p>` : ''}</div>`).join('')}` : ''}
  <p class="mute small">Show list checked against the Apple Podcasts directory. No hunting podcast focused only on self-filming was found to verify; Muley Freak and the Hunt Backcountry crew cover filming often.</p>`);
};
async function showPage(params, favs) {
  let name, host, why, links = '', load;
  if (params.id) { const p = PODCASTS.find(x => x.id == params.id); name = p.name; host = p.host; why = p.why; links = `<a href="${appleURL(p.id)}" target="_blank" rel="noopener">Apple Podcasts</a> · <a href="${esc(p.feed)}" target="_blank" rel="noopener">RSS</a>`; load = () => lookupEpisodes(p.id).then(r => r.eps); }
  else { const c = await DB.get(params.custom); name = c.name; host = c.host || ''; why = c.why || ''; links = `<a href="${esc(c.url)}" target="_blank" rel="noopener">Open show link</a>`; load = () => c.appleId ? lookupEpisodes(c.appleId).then(r => r.eps) : rssEpisodes(c.feed || c.url).then(r => r.eps); }
  render(`<a href="#/pods/library">← Podcasts</a><h1>${esc(name)}</h1><div class="mute">${esc(host)}</div><p class="small">${esc(why)}</p><p class="small">${links}</p>
  <div class="row"><button class="sm" id="anote">📝 Attach a note about this show to a hunt/pin</button></div><div class="card" id="eps"><p class="mute">Loading latest episodes…</p></div>`);
  $('#anote').onclick = () => attachDialog({ title: name, url: '', kind: 'note' });
  try {
    const eps = await load(); const favIds = new Set(favs.map(f => f.id));
    $('#eps').innerHTML = `<h2>Latest episodes</h2>` + eps.map((e, i) => { const fid = 'fav_' + btoa(unescape(encodeURIComponent(e.audio || e.title))).replace(/[^a-z0-9]/gi, '').slice(-40); return `<div class="ep"><div class="spread"><b>${esc(e.title)}</b><button class="star ${favIds.has(fid) ? 'on' : ''}" data-fav="${i}" data-fid="${fid}">${favIds.has(fid) ? '★' : '☆'}</button></div><div class="mute small">${fmtD(e.date)}${e.mins ? ' · ' + e.mins + ' min' : ''}</div><div class="small">${esc(e.desc)}</div>${e.audio ? `<audio controls preload="none" src="${esc(e.audio)}"></audio>` : ''}<div class="row" style="margin-top:4px">${e.page ? `<a class="btn sm" href="${esc(e.page)}" target="_blank" rel="noopener">Open</a>` : ''}<button class="sm" data-att="${i}">Attach to hunt/pin</button></div></div>`; }).join('');
    $$('[data-fav]').forEach(b => b.onclick = async () => { const e = eps[+b.dataset.fav], fid = b.dataset.fid; if (b.classList.contains('on')) { await DB.del(fid); b.classList.remove('on'); b.textContent = '☆'; } else { await DB.put({ id: fid, type: 'podfav', show: name, title: e.title, date: e.date, audio: e.audio, page: e.page }); b.classList.add('on'); b.textContent = '★'; toast('Saved to favorites'); } });
    $$('[data-att]').forEach(b => b.onclick = () => { const e = eps[+b.dataset.att]; attachDialog({ title: `${name}: ${e.title}`, url: e.page || e.audio }); });
  } catch (e) { $('#eps').innerHTML = `<p class="mute">Couldn’t load episodes here (offline, or the feed blocks in-app reading). Use the links above.</p>`; }
}
async function attachDialog({ title, url, kind = 'episode' }) {
  const [hunts, pins] = await Promise.all([DB.all('hunt'), DB.all('pin')]);
  const d = document.createElement('dialog'); d.className = 'card'; d.style.cssText = 'max-width:92vw;width:420px;color:var(--ink)';
  d.innerHTML = `<h3>Attach to a hunt or pin</h3><p class="small">${esc(title)}</p><select id="at_t"><optgroup label="Hunts">${hunts.map(h => `<option value="hunt:${h.id}">${esc(h.name)}</option>`).join('')}</optgroup><optgroup label="Pins">${pins.map(p => `<option value="pin:${p.id}">${esc(p.name)}</option>`).join('')}</optgroup></select><label>Note</label><textarea id="at_n" placeholder="Why it matters for this hunt…"></textarea><div class="row" style="margin-top:8px"><button id="at_c">Cancel</button><button class="primary" id="at_s">Attach</button></div>`;
  document.body.appendChild(d); d.showModal();
  d.querySelector('#at_c').onclick = () => d.remove();
  d.querySelector('#at_s').onclick = async () => { const v = d.querySelector('#at_t').value; if (!v) return toast('Create a hunt or pin first'); const [tt, tid] = v.split(':'); await DB.put({ id: DB.uid('att_'), type: 'attach', targetType: tt, targetId: tid, kind, title, url, note: d.querySelector('#at_n').value.trim() }); d.remove(); toast('Attached'); };
}
