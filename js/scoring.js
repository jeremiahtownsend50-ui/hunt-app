/* Antler score sheets: Boone & Crockett measuring system (also used by Pope & Young) for typical / non-typical
   whitetail, Coues', mule deer and American elk, plus a photo-assisted ESTIMATE tool. Each sheet is saved to a hunt. */
const BC_SRC = 'https://www.boone-crockett.org/download-bc-score-charts';
const ANTLER_SP = {
  whitetail: { name: 'Whitetail', g: 7, chart: { typical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/TWT_0.pdf', nontypical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/NTWT_0.pdf' },
    h: ['Smallest place between burr and first point', 'Smallest place between first and second points', 'Smallest place between second and third points', 'Smallest place between third and fourth points'],
    gNote: 'G-1 brow (if present), G-2, G-3, G-4…G-7 if present', min: { typical: [160, 170], nontypical: [185, 195] },
    ref: [['Ear tip-to-tip (alert)', 16, 'B&C field judging: average buck ≈16 in'], ['Ear length (base to tip)', 6, 'B&C: ≈6 in'], ['Center of eye to nose', 8, 'B&C: ≈8 in']], refSrc: 'https://www.boone-crockett.org/field-judging-whitetail-deer' },
  coues: { name: "Coues' whitetail", g: 7, chartOf: 'whitetail', min: { typical: [100, 110], nontypical: [105, 120] },
    ref: [['Ear tip-to-tip (alert) – set your own; Coues are smaller', 13, 'No published average – measure a local deer and edit'], ['Ear length (base to tip)', 5, 'Placeholder – edit']], refSrc: 'https://www.boone-crockett.org/field-judging-whitetail-deer' },
  mule: { name: 'Mule deer', g: 4, chart: { typical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/Typ%20Mule%20Deer.pdf', nontypical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/NT%20Mule%20Deer.pdf' },
    h: ['Smallest place between burr and first point', 'Smallest place between first and second points', 'Smallest place between main beam and third point', 'Smallest place between second and fourth points'],
    gNote: 'G-1 brow (if present), G-2, G-3 (if present), G-4 (if present). Typical pattern is 5 per side incl. beam tip.', min: { typical: [180, 190], nontypical: [215, 230] },
    ref: [['Ear tip-to-tip (alert)', 20, 'B&C field judging: 20–22 in on a mature buck (20 = conservative)'], ['Ear base (white spot) to tip', 8, 'B&C: ≈8 in']], refSrc: 'https://www.boone-crockett.org/field-judging-mule-deer-and-blacktails' },
  elk: { name: 'American elk', g: 7, chart: { typical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/Typ%20Am.%20Elk.pdf', nontypical: 'https://prod10-boone-crockett.s3.amazonaws.com/s3fs-public/2026-01/NT%20Am.%20Elk.pdf' },
    h: ['Smallest place between first and second points', 'Smallest place between second and third points', 'Smallest place between third and fourth points', 'Smallest place between fourth and fifth points'],
    gNote: 'G-1 through G-5, G-6/G-7 if present (beam tip is not a G point)', min: { typical: [360, 375], nontypical: [385, 385] },
    ref: [['Ear tip-to-tip (alert)', 22, 'goHUNT: 21–22 in (RMEF says ≈26) – 22 = conservative'], ['Ear length', 7.5, 'goHUNT: ≈7.5 in'], ['Burr to nose tip', 15, 'goHUNT: 15–16 in on a mature bull']], refSrc: 'https://www.gohunt.com/browse/tips-and-tricks/how-to-score-and-field-judge-elk-part-1' }
};
const sp = k => { const s = ANTLER_SP[k]; return s.chartOf ? { ...ANTLER_SP[s.chartOf], ...s, h: ANTLER_SP[s.chartOf].h, chart: ANTLER_SP[s.chartOf].chart, gNote: ANTLER_SP[s.chartOf].gNote } : s; };
/* inches: "18 3/8", "18-3/8", "18.375", "3/8" */
function parseIn(v) {
  v = String(v ?? '').trim().replace(/["”]|in$/g, '').trim(); if (!v) return null;
  let m = v.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\s*\/\s*(\d+))?$/); if (!m || (!m[1] && !m[2])) return NaN;
  return (+m[1] || 0) + (m[2] ? +m[2] / +m[3] : 0);
}
function fmt8(x) { if (x == null || isNaN(x)) return ''; const e = Math.round(x * 8); const w = Math.floor(e / 8), r = e % 8; return `${w} ${r}/8`; } // eighths without reduction, like the B&C chart
const blankSide = n => ({ F: null, G: Array(n).fill(null), H: [null, null, null, null], ab: [] });
const Score = {
  compute(s) {
    const n = sp(s.species).g, sum = a => a.reduce((t, x) => t + (+x || 0), 0);
    const side = S => (+S.F || 0) + sum(S.G.slice(0, n)) + sum(S.H);
    const R = s.R, L = s.L, longer = Math.max(+R.F || 0, +L.F || 0), D = +s.spread || 0;
    const spreadCredit = Math.min(D, longer);
    const col1 = side(R), col2 = side(L);
    const rows = [['F', R.F, L.F], ...Array.from({ length: n }, (_, i) => ['G-' + (i + 1), R.G[i], L.G[i]]), ...[0, 1, 2, 3].map(i => ['H-' + (i + 1), R.H[i], L.H[i]])];
    const diff = rows.reduce((t, [, r, l]) => t + Math.abs((+r || 0) - (+l || 0)), 0);
    const abR = sum(R.ab), abL = sum(L.ab), E = abR + abL;
    const subtotal = spreadCredit + col1 + col2;
    const typical = subtotal - diff - E;            // typical chart: Column 3 = differences + line E
    const nontypical = subtotal - diff + E;         // non-typical chart: subtract Column 3, then add line E
    return { spreadCredit, spreadCapped: D > longer && longer > 0, col1, col2, subtotal, diff, abR, abL, E, gross: subtotal + E, typical, nontypical, final: s.category === 'nontypical' ? nontypical : typical, rows };
  },
  /* worked example from B&C's online chart (non-typical Coues', trophy #28859): final 196 2/8, gross 210 1/8 */
  selfTest() {
    const s = { species: 'coues', category: 'nontypical', spread: 12.375,
      R: { F: 20.5, G: [6.375, 10.5, 8, 8.875, 0, 0, 0], H: [4.75, 4.375, 4.375, 4.875], ab: [4.375, 1.75, 1.125, 1.375, 6, 2.625] },
      L: { F: 19.375, G: [4.875, 12.375, 11, 9.125, 5.25, 0, 0], H: [4.75, 4.75, 4.75, 5], ab: [1, 2, 1.125, 1.125, 5.375, 5.5, 5.5, 3.125, 1.875] } };
    const c = Score.compute(s); return { col1: c.col1, col2: c.col2, subtotal: c.subtotal, diff: c.diff, E: c.E, final: c.final, gross: c.gross, pass: c.final === 196.25 && c.gross === 210.125 && c.col1 === 72.625 && c.col2 === 81.25 && Math.abs(c.diff - 13.875) < 1e-9 };
  },
  async cards(kind, id) { // list on hunt / pin pages
    const el = document.getElementById('scorecards'); if (!el) return;
    const list = (await DB.all('score')).filter(s => (kind === 'hunt' ? s.huntId : s.pinId) === id);
    el.innerHTML = `<div class="card"><div class="spread"><h2>Score sheets (${list.length})</h2>${kind === 'hunt' ? `<a class="btn sm" href="#/score/new?hunt=${id}">+ Score</a>` : ''}</div><ul class="list">${list.map(s => { const c = Score.compute(s); return `<li><a class="item" href="#/score/${s.id}"><span class="grow"><div class="t">${esc(s.title || sp(s.species).name)}</div><div class="mute small">${sp(s.species).name} · ${s.category} · ${s.method === 'photo' ? 'photo estimate' : 'tape'}</div></span><b>${fmt8(c.final)}</b></a></li>`; }).join('') || '<li class="mute">None yet.</li>'}</ul></div>`;
  }
};

Views.score = async (id, params = {}) => {
  const hunts = (await DB.all('hunt')).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  if (!id) { // list
    const list = (await DB.all('score')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    return render(`<h1>Antler scoring</h1>
    <div class="card hl"><p class="small">Green-score sheets using the <a href="${BC_SRC}" target="_blank" rel="noopener">Boone &amp; Crockett measuring system</a> (Pope &amp; Young uses the same system). Tape scores follow the B&C charts. Photo scores are <b>estimates only</b>. Neither is an official score: only a B&C or P&Y official measurer can give one, after the 60-day drying period.</p>
    <a class="btn primary" href="#/score/new" style="display:block;text-align:center">+ New score sheet</a></div>
    <div class="card"><h2>Saved sheets (${list.length})</h2><ul class="list">${list.map(s => { const c = Score.compute(s), h = hunts.find(x => x.id === s.huntId); return `<li><a class="item" href="#/score/${s.id}"><span class="grow"><div class="t">${esc(s.title || sp(s.species).name)}</div><div class="mute small">${sp(s.species).name} · ${s.category === 'nontypical' ? 'non-typical' : 'typical'} · ${s.method === 'photo' ? '<span class="badge warn">photo estimate</span>' : 'tape'}${h ? ' · ' + esc(h.name) : ''}</div></span><b>${fmt8(c.final)}</b></a></li>`; }).join('') || '<li class="mute">No score sheets yet.</li>'}</ul></div>`);
  }
  if (id === 'new') {
    render(`<a href="#/score">← Scoring</a><h1>New score sheet</h1><div class="card">
    <label>Species</label><select id="ns_sp">${Object.entries(ANTLER_SP).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select>
    <label>Category</label><div class="segs" id="ns_cat"><button class="on" data-c="typical">Typical</button><button data-c="nontypical">Non-typical</button></div>
    <label>Method</label><div class="segs" id="ns_m"><button class="on" data-m="tape">Tape measure</button><button data-m="photo">Photo estimate</button></div>
    <label>Save to hunt</label><select id="ns_h">${hunts.map(h => `<option value="${h.id}" ${params.hunt === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}<option value="__new">+ New hunt…</option></select>
    <input id="ns_hn" placeholder="New hunt name" ${hunts.length ? 'hidden' : ''}>
    <label>Title</label><input id="ns_t" placeholder="e.g. 2026 archery bull">
    <button class="primary" id="ns_go" style="width:100%;margin-top:12px">Start sheet</button></div>`);
    if (!hunts.length) $('#ns_h').value = '__new';
    $('#ns_h').onchange = e => $('#ns_hn').hidden = e.target.value !== '__new';
    for (const g of ['#ns_cat', '#ns_m']) $$(g + ' button').forEach(b => b.onclick = () => { $$(g + ' button').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
    $('#ns_go').onclick = async () => {
      let huntId = $('#ns_h').value, species = $('#ns_sp').value;
      if (huntId === '__new') { const name = $('#ns_hn').value.trim(); if (!name) return toast('Name the hunt'); const h = { id: DB.uid('hunt_'), type: 'hunt', name, species: species === 'elk' ? 'Elk' : species === 'mule' ? 'Mule deer' : 'Whitetail', start: new Date().toISOString().slice(0, 10), notes: '', shots: [] }; await DB.put(h); huntId = h.id; }
      const n = sp(species).g, method = $('#ns_m .on').dataset.m;
      const s = { id: DB.uid('score_'), type: 'score', species, category: $('#ns_cat .on').dataset.c, method, huntId, pinId: '', title: $('#ns_t').value.trim(), date: new Date().toISOString().slice(0, 10), pts: { R: '', L: '' }, tip: null, greatest: null, spread: null, R: blankSide(n), L: blankSide(n), est: {}, notes: '', created: Date.now(), updated: Date.now() };
      await DB.put(s); location.hash = '#/score/' + s.id + (method === 'photo' ? '/photo' : '');
    };
    return;
  }
  const s = await DB.get(id); if (!s) return render('<p>Score sheet not found.</p>');
  if (params.sub === 'photo') return photoTool(s);
  const S = sp(s.species), n = S.g, pins = await DB.all('pin');
  const inp = (path, v, w = 74) => `<input class="sc ${s.est[path] ? 'est' : ''}" data-p="${path}" value="${esc(v == null ? '' : fmt8(v))}" inputmode="decimal" style="width:${w}px" placeholder="0 0/8">`;
  const row = (lbl, key, i) => { const g = (S0) => i == null ? S0[key] : S0[key][i]; const r = g(s.R), l = g(s.L); const pr = i == null ? key : key + '.' + i;
    return `<tr><td>${lbl}</td><td>${inp('R.' + pr, r)}</td><td>${inp('L.' + pr, l)}</td><td class="mute" data-d="${pr}">${fmt8(Math.abs((+r || 0) - (+l || 0)))}</td></tr>`; };
  render(`<a href="#/score">← Scoring</a><div class="spread"><h1 style="flex:1">${esc(s.title || S.name)}</h1>${s.method === 'photo' ? '<span class="badge warn">PHOTO ESTIMATE</span>' : '<span class="badge">tape</span>'}</div>
  <p class="mute small">${S.name} · ${s.category === 'nontypical' ? 'Non-typical' : 'Typical'} · B&C system · <a href="${S.chart[s.category]}" target="_blank" rel="noopener">official chart PDF ↗</a></p>
  ${s.method === 'photo' ? `<div class="note"><b>Estimate, not an official score.</b> Values marked <span class="est-key">orange</span> were measured from a photo; camera angle, lens distortion and beam curve toward the camera usually make them read short. Circumferences from a photo are width × π. <a href="#/score/${s.id}/photo">Open photo tool →</a></div>` : `<div class="row" style="margin-bottom:6px"><a class="btn sm" href="#/score/${s.id}/photo">Fill from a photo (estimate)</a></div>`}
  <div class="card" id="tot"></div>
  <div class="card"><h2>Measurements (inches)</h2><p class="mute small">Type <b>18 3/8</b> or <b>18.375</b>. Measure with a ¼-in flexible steel tape to the nearest ⅛ in.</p>
  <table class="scoresheet small"><tr><th></th><th>Right</th><th>Left</th><th>Diff</th></tr>
  <tr><td>A. Points</td><td><input class="sc" data-p="pts.R" value="${esc(s.pts.R)}" inputmode="numeric" style="width:74px"></td><td><input class="sc" data-p="pts.L" value="${esc(s.pts.L)}" inputmode="numeric" style="width:74px"></td><td></td></tr>
  <tr><td>B. Tip to tip</td><td colspan="3">${inp('tip', s.tip)} <span class="mute">not scored</span></td></tr>
  <tr><td>C. Greatest spread</td><td colspan="3">${inp('greatest', s.greatest)} <span class="mute">not scored</span></td></tr>
  <tr><td>D. Inside spread</td><td colspan="3">${inp('spread', s.spread)} <span class="mute" id="credit"></span></td></tr>
  ${row('F. Main beam', 'F')}
  ${Array.from({ length: n }, (_, i) => row(`G-${i + 1}`, 'G', i)).join('')}
  ${[0, 1, 2, 3].map(i => row(`H-${i + 1}`, 'H', i)).join('')}
  </table><p class="mute small">${esc(S.gNote)}. H: ${S.h.map((t, i) => `H-${i + 1} ${t.toLowerCase()}`).join('; ')}. If the brow is missing, take H-1 and H-2 at the smallest place between burr and G-2 (deer).</p></div>
  <div class="card"><h2>E. Abnormal points</h2><p class="mute small">Points non-typical in location (from a point, or the bottom/sides of the beam) or extra points beyond the normal pattern. ${s.category === 'typical' ? 'Deducted on a typical sheet.' : 'Added on a non-typical sheet.'}</p>
  <div class="row" style="align-items:flex-start;gap:12px">${['R', 'L'].map(k => `<div style="flex:1"><b>${k === 'R' ? 'Right' : 'Left'}</b>${s[k].ab.map((v, i) => `<div class="row">${inp(k + '.ab.' + i, v, 90)}<button class="sm" data-rmab="${k}.${i}">✕</button></div>`).join('')}<button class="sm" data-addab="${k}">+ point</button></div>`).join('')}</div></div>
  <div class="card"><h2>Journal</h2><label>Hunt</label><select id="sh">${hunts.map(h => `<option value="${h.id}" ${s.huntId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
  <label>Pin (optional – kill site)</label><select id="spn"><option value="">—</option>${pins.map(p => `<option value="${p.id}" ${s.pinId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <label>Title</label><input id="stt" value="${esc(s.title)}"><label>Date</label><input type="date" id="sdt" value="${esc(s.date)}"><label>Notes</label><textarea id="snt" placeholder="Who measured, dried or green, remarks…">${esc(s.notes)}</textarea>
  <div class="row" style="margin-top:8px">${s.huntId ? `<a class="btn sm" href="#/hunt/${s.huntId}">Open hunt →</a>` : ''}<button class="sm" id="scsv">Export sheet (.txt)</button><button class="danger sm" id="sdel">Delete</button></div></div>`);
  const save = debounce(async () => { s.updated = Date.now(); await DB.put(s); }, 300);
  function totals() {
    const c = Score.compute(s), m = S.min[s.category], f = c.final;
    $('#credit').textContent = c.spreadCapped ? `credit ${fmt8(c.spreadCredit)} (capped at longer beam)` : s.spread ? `credit ${fmt8(c.spreadCredit)}` : '';
    $$('[data-d]').forEach(td => { const [k, i] = td.dataset.d.split('.'); const g = S0 => i == null ? S0[k] : S0[k][+i]; td.textContent = fmt8(Math.abs((+g(s.R) || 0) - (+g(s.L) || 0))); });
    $('#tot').innerHTML = `<div class="spread"><h2>${s.category === 'nontypical' ? 'Final non-typical' : 'Net typical'}</h2><div style="font-size:30px;font-weight:800;color:var(--brand)">${fmt8(f)}</div></div>
    ${s.method === 'photo' ? '<div class="badge warn" style="display:inline-block;margin-bottom:6px">Estimate from photo, not an official score</div>' : '<div class="mute small" style="margin-bottom:6px">Green score, unofficial</div>'}
    <table class="small"><tr><td>Spread credit</td><td>${fmt8(c.spreadCredit)}</td></tr><tr><td>Column 1 (right)</td><td>${fmt8(c.col1)}</td></tr><tr><td>Column 2 (left)</td><td>${fmt8(c.col2)}</td></tr>
    <tr><td>Subtotal</td><td>${fmt8(c.subtotal)}</td></tr><tr><td>Side-to-side differences</td><td>− ${fmt8(c.diff)}</td></tr>
    <tr><td>E. Abnormal points (R ${fmt8(c.abR)} / L ${fmt8(c.abL)})</td><td>${s.category === 'nontypical' ? '+' : '−'} ${fmt8(c.E)}</td></tr>
    <tr><td><b>Gross score</b> (subtotal + abnormals)</td><td><b>${fmt8(c.gross)}</b></td></tr><tr><td>Net ${s.category === 'nontypical' ? 'typical (for reference)' : 'non-typical (for reference)'}</td><td>${fmt8(s.category === 'nontypical' ? c.typical : c.nontypical)}</td></tr></table>
    <div class="small" style="margin-top:6px">B&C minimums (${s.category === 'nontypical' ? 'non-typical' : 'typical'} ${S.name}): Awards ${m[0]} · All-time ${m[1]} ${f >= m[1] ? '<span class="badge ok">above all-time</span>' : f >= m[0] ? '<span class="badge ok">above awards</span>' : ''} · <a href="https://boone-crockett.org/minimum-entry-scores-north-american-big-game" target="_blank" rel="noopener">source ↗</a></div>`;
  }
  totals();
  const setPath = (p, v) => { const k = p.split('.'); let o = s; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = v; };
  $$('input.sc').forEach(i => i.onchange = () => {
    const p = i.dataset.p;
    if (p.startsWith('pts.')) { setPath(p, i.value.replace(/\D/g, '')); save(); return; }
    const v = parseIn(i.value); if (Number.isNaN(v)) { i.classList.add('bad'); return toast('Use 18 3/8 or 18.375'); }
    i.classList.remove('bad', 'est'); delete s.est[p]; setPath(p, v); i.value = v == null ? '' : fmt8(v); totals(); save();
  });
  $$('[data-addab]').forEach(b => b.onclick = async () => { s[b.dataset.addab].ab.push(null); await DB.put(s); Views.score(id); });
  $$('[data-rmab]').forEach(b => b.onclick = async () => { const [k, i] = b.dataset.rmab.split('.'); s[k].ab.splice(+i, 1); delete s.est[`${k}.ab.${i}`]; await DB.put(s); Views.score(id); });
  $('#sh').onchange = e => { s.huntId = e.target.value; save(); toast('Moved to hunt'); };
  $('#spn').onchange = e => { s.pinId = e.target.value; save(); };
  $('#stt').oninput = e => { s.title = e.target.value; save(); }; $('#sdt').onchange = e => { s.date = e.target.value; save(); }; $('#snt').oninput = e => { s.notes = e.target.value; save(); };
  $('#sdel').onclick = async () => { if (!confirm('Delete this score sheet?')) return; if (s.photo?.id) await DB.delPhoto(s.photo.id); await DB.del(s.id); location.hash = '#/score'; };
  $('#scsv').onclick = () => { const c = Score.compute(s), L = [];
    L.push(`${s.title || S.name} – ${S.name} ${s.category} – ${s.method === 'photo' ? 'PHOTO ESTIMATE (not official)' : 'green score (unofficial)'} – B&C system`, `Date: ${s.date}`, '', 'Measure\tRight\tLeft\tDiff');
    c.rows.forEach(([k, r, l]) => L.push(`${k}\t${fmt8(+r || 0)}\t${fmt8(+l || 0)}\t${fmt8(Math.abs((+r || 0) - (+l || 0)))}`));
    L.push('', `Inside spread ${fmt8(+s.spread || 0)} (credit ${fmt8(c.spreadCredit)})`, `Abnormal R: ${s.R.ab.map(fmt8).join(', ')}`, `Abnormal L: ${s.L.ab.map(fmt8).join(', ')}`, '', `Col1 ${fmt8(c.col1)}  Col2 ${fmt8(c.col2)}  Subtotal ${fmt8(c.subtotal)}  Differences ${fmt8(c.diff)}  E ${fmt8(c.E)}`, `Gross ${fmt8(c.gross)}`, `FINAL ${fmt8(c.final)}`, '', `Chart: ${S.chart[s.category]}`);
    download(`score-${(s.title || S.name).replace(/\W+/g, '-')}.txt`, L.join('\n'), 'text/plain'); };
};

/* ---------- Photo-assisted estimate ---------- */
async function photoTool(s) {
  const S = sp(s.species), n = S.g;
  s.photo = s.photo || { id: null, refPx: null, refIn: S.ref[0][1], refLabel: S.ref[0][0], refPts: null, marks: [] };
  const fields = [['spread', 'D. Inside spread'], ...['R', 'L'].flatMap(k => [[`${k}.F`, `F. Main beam ${k}`], ...Array.from({ length: n }, (_, i) => [`${k}.G.${i}`, `G-${i + 1} ${k}`]), ...[0, 1, 2, 3].map(i => [`${k}.H.${i}`, `H-${i + 1} ${k} (tap both edges)`]), [`${k}.ab.new`, `Abnormal point ${k} (adds one)`]]), ['tip', 'B. Tip to tip'], ['greatest', 'C. Greatest spread']];
  render(`<a href="#/score/${s.id}">← Score sheet</a><h1>Photo estimate</h1>
  <div class="note"><b>Estimate only, not an official score, and not automatic AI scoring.</b> You set a reference length and tap points; the app scales your taps. Use a straight-on photo (head-on for spread, side-on for beams/tines). Anything angled toward the camera reads short.</div>
  <div class="card"><div class="row"><button class="primary" id="ph_load">${s.photo.id ? 'Change photo' : 'Load photo'}</button><input type="file" accept="image/*" id="ph_file" hidden><label class="opt">Zoom <input type="range" id="ph_zoom" min="1" max="4" step="0.25" value="1" style="width:110px"></label></div>
  <div id="ph_wrap" style="overflow:auto;max-height:62vh;margin-top:8px;border:1px solid var(--line);border-radius:8px;touch-action:pan-x pan-y"><canvas id="ph_c" style="display:block"></canvas></div>
  <div class="mute small" id="ph_hint"></div></div>
  <div class="card"><h3>1 · Reference</h3><select id="ph_ref">${S.ref.map((r, i) => `<option value="${i}" ${s.photo.refLabel === r[0] ? 'selected' : ''}>${esc(r[0])} – ${r[1]} in</option>`).join('')}<option value="custom" ${S.ref.every(r => r[0] !== s.photo.refLabel) ? 'selected' : ''}>Custom (tape, gun, known object…)</option></select>
  <div class="row"><label class="opt">Length (in) <input id="ph_refin" inputmode="decimal" style="width:80px" value="${s.photo.refIn}"></label><button id="ph_setref">Tap 2 points</button><span class="small" id="ph_refst">${s.photo.refPx ? '✓ set' : 'not set'}</span></div>
  <div class="mute small" id="ph_refnote">${esc((S.ref.find(r => r[0] === s.photo.refLabel) || [])[2] || '')} · <a href="${S.refSrc}" target="_blank" rel="noopener">source ↗</a>. Real ears vary, so measure your own animal if you can.</div></div>
  <div class="card"><h3>2 · Measure</h3><select id="ph_f">${fields.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
  <div class="row" style="margin-top:6px"><button id="ph_start" class="primary">Start tapping</button><button id="ph_undo">Undo point</button><button id="ph_done">Done → fill sheet</button></div>
  <div class="small" id="ph_live"></div>
  <ul class="list small" id="ph_marks"></ul></div>`);
  const c = $('#ph_c'), g = c.getContext('2d'); let img = null, zoom = 1, mode = null, cur = [];
  const base = () => Math.min(1, ($('#ph_wrap').clientWidth - 2) / (img?.width || 1));
  const len = pts => pts.reduce((t, p, i) => i ? t + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
  const toIn = px => s.photo.refPx ? px / s.photo.refPx * s.photo.refIn : null;
  const isH = f => /\.H\./.test(f);
  function draw() {
    if (!img) { c.width = $('#ph_wrap').clientWidth - 2; c.height = 160; g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#aaa'; g.font = '15px sans-serif'; g.fillText('Load a photo of the rack', 16, 84); return; }
    const k = base() * zoom; c.width = img.width * k; c.height = img.height * k; g.drawImage(img, 0, 0, c.width, c.height);
    const line = (pts, col, label) => { if (!pts?.length) return; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0] * k, p[1] * k) : g.moveTo(p[0] * k, p[1] * k)); g.stroke(); pts.forEach(p => { g.beginPath(); g.arc(p[0] * k, p[1] * k, 5, 0, 7); g.fill(); }); if (label) { const p = pts[pts.length - 1]; g.font = 'bold 14px sans-serif'; g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(label, p[0] * k + 8, p[1] * k - 8); g.fillText(label, p[0] * k + 8, p[1] * k - 8); } };
    line(s.photo.refPts, '#ffd400', 'REF ' + s.photo.refIn + '"');
    s.photo.marks.forEach(m => line(m.pts, '#ff8a3d', m.label + ' ' + fmt8(m.inches)));
    line(cur, '#5cf', mode === 'measure' ? '' : '');
  }
  function listMarks() { $('#ph_marks').innerHTML = s.photo.marks.map((m, i) => `<li class="spread"><span>${esc(m.label)}: <b>${fmt8(m.inches)}</b>${m.h ? ' (width × π)' : ''}</span><button class="sm" data-rmm="${i}">✕</button></li>`).join('') || '<li class="mute">No measurements yet.</li>';
    $$('[data-rmm]').forEach(b => b.onclick = async () => { s.photo.marks.splice(+b.dataset.rmm, 1); await DB.put(s); listMarks(); draw(); }); }
  async function loadImg() { if (!s.photo.id) return draw(); const p = await DB.getPhoto(s.photo.id); if (!p) return draw(); img = await createImageBitmap(p.blob); draw(); }
  const hint = t => $('#ph_hint').textContent = t;
  $('#ph_load').onclick = () => $('#ph_file').click();
  $('#ph_file').onchange = async e => { const f = e.target.files[0]; if (!f) return; const b = await resizeImage(f, 2000); const pid = DB.uid('ph_'); if (s.photo.id) await DB.delPhoto(s.photo.id); await DB.putPhoto(pid, b); s.photo = { ...s.photo, id: pid, refPx: null, refPts: null, marks: [] }; $('#ph_refst').textContent = 'not set'; await DB.put(s); await loadImg(); listMarks(); hint('Now set the reference: tap “Tap 2 points”, then tap each end of the reference.'); };
  $('#ph_zoom').oninput = e => { zoom = +e.target.value; draw(); };
  $('#ph_ref').onchange = e => { const v = e.target.value; if (v !== 'custom') { const r = S.ref[+v]; s.photo.refLabel = r[0]; s.photo.refIn = r[1]; $('#ph_refin').value = r[1]; $('#ph_refnote').textContent = r[2]; } else s.photo.refLabel = 'Custom'; recalc(); };
  $('#ph_refin').onchange = e => { const v = parseIn(e.target.value); if (!v) return toast('Enter the reference length in inches'); s.photo.refIn = v; recalc(); };
  function recalc() { s.photo.marks.forEach(m => m.inches = toIn(len(m.pts)) * (m.h ? Math.PI : 1)); listMarks(); draw(); DB.put(s); }
  $('#ph_setref').onclick = () => { if (!img) return toast('Load a photo first'); mode = 'ref'; cur = []; $('#ph_wrap').scrollIntoView({ block: 'center' }); hint('Tap the two ends of the reference (e.g. ear tip, then other ear tip).'); };
  $('#ph_start').onclick = () => { if (!img) return toast('Load a photo first'); if (!s.photo.refPx) return toast('Set the reference first'); mode = 'measure'; cur = []; $('#ph_wrap').scrollIntoView({ block: 'center' }); hint(isH($('#ph_f').value) ? 'Tap the two edges of the beam at the measuring spot.' : 'Tap the start, then tap along the curve, then the tip. Tap Done when finished.'); };
  $('#ph_undo').onclick = () => { cur.pop(); draw(); live(); };
  function live() { $('#ph_live').textContent = mode === 'measure' && cur.length > 1 ? `≈ ${fmt8(toIn(len(cur)) * (isH($('#ph_f').value) ? Math.PI : 1))} in` : ''; }
  c.addEventListener('click', async e => {
    if (!mode || !img) return; const r = c.getBoundingClientRect(), k = base() * zoom; cur.push([(e.clientX - r.left) / k, (e.clientY - r.top) / k]);
    if (mode === 'ref' && cur.length === 2) { s.photo.refPts = cur; s.photo.refPx = len(cur); mode = null; cur = []; $('#ph_refst').textContent = '✓ set'; recalc(); hint('Reference set. Pick a measurement and tap “Start tapping”.'); return; }
    if (mode === 'measure' && isH($('#ph_f').value) && cur.length === 2) return commit();
    draw(); live();
  });
  async function commit() {
    if (mode !== 'measure' || cur.length < 2) return toast('Tap at least two points');
    let f = $('#ph_f').value, label = $('#ph_f').selectedOptions[0].text.replace(/ \(.*\)$/, ''); const h = isH(f), inches = toIn(len(cur)) * (h ? Math.PI : 1);
    if (f.endsWith('.ab.new')) { const k = f[0]; s[k].ab.push(null); f = `${k}.ab.${s[k].ab.length - 1}`; label = `Abnormal ${k} #${s[k].ab.length}`; }
    const ks = f.split('.'); let o = s; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = Math.round(inches * 8) / 8;
    s.est[f] = true; s.method = 'photo'; s.photo.marks = s.photo.marks.filter(m => m.field !== f); s.photo.marks.push({ field: f, label, pts: cur, inches, h });
    s.updated = Date.now(); await DB.put(s); mode = null; cur = []; listMarks(); draw(); live(); toast(`${label}: ${fmt8(inches)} in → sheet`);
    const sel = $('#ph_f'); if (sel.selectedIndex < sel.options.length - 1 && !f.includes('.ab.')) sel.selectedIndex++;
    hint('Saved to the sheet. Pick the next measurement and tap “Start tapping”.');
  }
  $('#ph_done').onclick = commit;
  listMarks(); await loadImg(); window.addEventListener('resize', draw, { once: true });
}
