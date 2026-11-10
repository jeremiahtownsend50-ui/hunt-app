/* Draws: points tracker, deadlines (sorted, reminders), state guides with fees.
   All state facts live in state_data.json so they can be refreshed without code changes. */
const Draws = (() => {
  let data = null;
  const LOSS_YEARS = { WY: 2, NV: 2, ME: 2, ND: 2, NH: 1, VT: 1, KS: 5, MI: 5 };
  const NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming' };
  const CODE = Object.fromEntries(Object.entries(NAMES).map(([c, n]) => [n.toLowerCase(), c]));
  const pick = (o, ...k) => { for (const x of k) if (o && o[x] != null && o[x] !== '') return o[x]; return null; };
  const isoDate = v => { if (!v) return null; const m = String(v).match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* parse "2027-06-01 (check agency site)", "2027-06 (late June…)", "n/a (no elk season)", "check agency site" */
  function parseDate(v) {
    const t = String(v ?? '').trim(), extra = (t.match(/\((.*)\)/) || [])[1] || (/^\d{4}-\d{2}(-\d{2})?\s+/.test(t) ? '' : '');
    const check = /check agency/i.test(t);
    let m = t.match(/^(\d{4}-\d{2}-\d{2})/); if (m) return { date: m[1], extra, check };
    m = t.match(/^(\d{4})-(\d{2})(?!-)/); if (m) return { date: null, month: `${m[1]}-${m[2]}`, sortKey: `${m[1]}-${m[2]}-28`, extra, check };
    if (/^n\/?a\b/i.test(t)) return { na: true, extra: extra || '', check };
    return { date: null, extra: t && !check ? t : extra, check };
  }
  const STATUS = v => { const t = String(v ?? '').toLowerCase().replace(/_/g, '-'); if (v === true || /confirm/.test(t)) return 'confirmed-2027'; if (/rule/.test(t)) return 'estimated-rule-based'; if (/current|open/.test(t)) return 'current-window'; if (/missing|unknown|not found/.test(t)) return 'missing'; if (/n\/a/.test(t)) return 'n/a'; return t ? 'estimated-from-2026' : 'missing'; };
  const KNOWN = ['confirmed-2027', 'estimated-from-2026', 'estimated-rule-based', 'current-window', 'missing'];
  const TYPE_LABEL = { application: 'Application', point_only: 'Point-only purchase', purchase_deadline_if_drawn: 'Buy license if drawn', results: 'Draw results' };
  const CONFLICT_RE = /(said|says|lists?|listed) \$\d|still lists older|but the [^.]*say|conflict|discrepan|verify with/i;
  const human = k => { const t = String(k).replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const money = v => v == null ? null : typeof v === 'number' ? '$' + (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)) : String(v);
  function feeRows(fees) { // {fee_year, resident:{item:val}, nonresident:{item:val}}  or legacy array
    if (Array.isArray(fees)) return fees;
    const rows = {}; const val = v => (v && typeof v === 'object') ? v : { amount: v };
    for (const side of ['resident', 'nonresident']) for (const [item, v0] of Object.entries((fees || {})[side] || {})) {
      const v = val(v0), r = rows[item] || (rows[item] = { item: /[a-z]_[a-z]/i.test(item) ? human(item) : item, resident: null, nonresident: null, sourceUrl: null, lastVerified: null, notes: [], conflict: false });
      const amt = pick(v, 'amount', 'price', 'value'), note = pick(v, 'notes', 'note');
      r[side] = amt == null ? (note && /not eligible|resident-only|no season/i.test(note) ? 'not eligible' : (v0 && typeof v0 === 'object' && 'amount' in v0 ? '—' : 'check agency site')) : money(amt);
      if (note) { r.notes.push((side === 'resident' ? 'R: ' : 'NR: ') + note); if (CONFLICT_RE.test(note)) r.conflict = true; }
      r.sourceUrl = r.sourceUrl || pick(v, 'source_url', 'sourceUrl', 'source', 'url'); r.lastVerified = r.lastVerified || pick(v, 'last_verified', 'lastVerified', 'verified');
    }
    return Object.values(rows);
  }
  /* Key-rule flags, derived from the record's own text so they refresh with the data. */
  const FLAG_RULES = [
    ['residents', 'Residents only', /(?<!non)residents?[- ]only|only (arkansas |missouri |minnesota |michigan |wisconsin |south dakota |north dakota |nebraska |kansas )?residents|open only to residents/i],
    ['noseason', 'No season', /no (state )?(\w+ )?(open )?season|no open season|doesn.t currently allow/i],
    ['license', 'License required before applying', /licen[cs]e[^.]{0,40}required[^.]{0,20}before|before applying|must (hold|buy|purchase|have) [^.]{0,60}licen[cs]e|licen[cs]e first|required to apply/i],
    ['points', 'Unusual point rule', /cubed|squared|doubled|automatically (get|gain)[^.]{0,40}charged|charged (a )?mandatory|mandatory, nonrefundable|no point[- ]only|points? (are |is )?lost|lose (all |your )?points|miss a year|skip/i],
    ['lifetime', 'Once in a lifetime', /once[- ]in[- ]a[- ]lifetime|once per lifetime|one bull per lifetime|per lifetime/i],
    ['waiting', 'Waiting period', /\d+[- ]year (waiting|wait|ineligib)|waiting period|wait(ing)? \d+ years|ineligible for \d+|can.t (re-?)?apply for \d+ years/i],
    ['nrcap', 'Nonresident cap', /nonresidents?[^.]{0,50}(capped|cap|max|no more than|up to|≤|limited to)[^.]{0,20}\d+ ?%|\d+ ?% [^.]{0,40}nonresident|nonresident cap/i]
  ];
  const AFTER_DRAW = /winners?|if (you're |you are )?drawn|drawn hunters|after drawing|successful applicants/i;
  const SPW = ['elk', 'bear', 'deer', 'moose', 'pronghorn', 'antelope', 'sheep', 'bighorn', 'goat', 'bison', 'turkey', 'exotic', 'javelina', 'oryx', 'ibex', 'caribou', 'muskox'];
  const spIn = t => SPW.filter(w => new RegExp(w, 'i').test(t));
  function sentences(t, re, kind) { // returns [{s, sp}] – sp = species the sentence is about (inherits from the previous sentence in the same paragraph)
    const out = [], seen = new Set();
    for (const para of String(t).split('\n')) { let last = [];
      for (const x0 of para.split(/(?<=[.!?])\s+/)) { const x = x0.trim(), own = spIn(x), sp = own.length ? own : last; if (own.length) last = own;
        if (re.test(x) && !(kind === 'license' && AFTER_DRAW.test(x)) && !seen.has(x)) { seen.add(x); out.push({ s: x, sp }); } } }
    return out.slice(0, 6); }
  function flagsFor(n, raw) {
    const parts = [n.points?.summary, n.residentOnlyNote, n.notes, ...n.guideSteps, ...n.deadlines.map(d => d.notes), ...n.fees.flatMap(f => (f.notes || []).map(x => `${f.item}: ${x}`))].filter(Boolean).join('\n');
    const out = [];
    if (raw?.point_system?.residents_only === true && !FLAG_RULES[0][2].test(parts)) out.push({ kind: 'residents', label: 'Residents only', text: [] });
    for (const [kind, label, re] of FLAG_RULES) { const t = sentences(parts, re, kind); if (t.length) out.push({ kind, label, text: t.map(x => x.s), sp: t.map(x => x.sp) }); }
    const conflicts = [...n.fees.filter(f => f.conflict).map(f => `${f.item}: ${f.notes.join(' ')}`), ...n.deadlines.filter(d => d.conflict).map(d => `${d.title}: ${d.notes}`)];
    if (conflicts.length) out.push({ kind: 'conflict', label: 'Conflicting values', text: conflicts });
    const checks = n.fees.filter(f => [f.resident, f.nonresident].includes('check agency site')).length + n.deadlines.filter(d => d.check || d.status === 'missing').length;
    if (checks) out.push({ kind: 'check', label: `${checks} × check agency site`, text: [] });
    return out;
  }
  /* East record has only a month / no date but the fallback has an exact day for the same state+species+kind: keep the exact day. */
  const spSet = t => new Set(spIn(t).map(w => w === 'antelope' ? 'pronghorn' : w === 'bighorn' ? 'sheep' : w));
  const kindOf = d => /\+ ?(preference|bonus)? ?points?|or (bonus|preference) point|incl\.? (bonus|preference)|& points/i.test(d.title) ? 'both' : /point[- ]only|point purchase|point saver|preference point|bonus point only|point only/i.test(d.title) && !/drawing|draw\b|application|lottery/i.test(d.title.replace(/–.*$/, '')) ? 'point' : 'app';
  const coversPoint = d => /point/i.test(d.title);
  function mergeFallbackDates(n, o) {
    const changed = [];
    for (const d of n.deadlines) {
      if (d.date) continue;
      const ds = spSet(d.species + ' ' + d.title), dk = /point-only/i.test(d.title) ? 'point' : 'app';
      const cand = o.deadlines.filter(f => f.date && f.status !== 'current-window' && [...spSet(f.species + ' ' + f.title)].some(w => ds.has(w)) && (kindOf(f) === dk || kindOf(f) === 'both' || (dk === 'point' && coversPoint(f))) && (!d.month || (f.date2026 || f.date).slice(5, 7) === d.month.slice(5, 7)));
      if (!cand.length) continue;
      const f = cand[0];
      changed.push({ title: d.title, from: d.month || 'no date', to: f.date });
      Object.assign(d, { date: f.date, month: null, sortKey: null, status: 'estimated-from-2026', date2026: f.date2026 || d.date2026, filledFrom: 'fallback',
        notes: [d.notes, `Exact day kept from the built-in list (${f.date2026 ? '2026 deadline ' + f.date2026 : f.status === 'estimated-rule-based' ? 'annual rule' : f.date}); eastern file gives ${d.month ? d.month + ' only' : 'no date'}.`, f.notes ? 'Built-in note: ' + f.notes : ''].filter(Boolean).join(' · ') });
    }
    for (const f of o.deadlines.filter(f => f.status === 'current-window')) { // restore open-now windows the eastern file doesn't carry
      const fs = spSet(f.species + ' ' + f.title);
      const same = n.deadlines.find(d => d.date === f.date && [...spSet(d.species + ' ' + d.title)].some(w => fs.has(w) || !fs.size));
      if (same) { if (same.status !== 'current-window') { changed.push({ title: same.title, from: same.status, to: 'open now (' + f.opens + ' – ' + f.date + ')' }); Object.assign(same, { status: 'current-window', opens: same.opens || f.opens, filledFrom: 'fallback', notes: [same.notes, `Window ${f.opens} – ${f.date} from the built-in list.`].filter(Boolean).join(' · ') }); } continue; }
      n.deadlines.push({ ...f, filledFrom: 'fallback', notes: [f.notes, 'Restored from the built-in list (not in the eastern file).'].filter(Boolean).join(' · ') }); changed.push({ title: f.title, from: 'missing', to: f.date + ' (open now)' });
    }
    n.mergeChanges = changed;
  }
  function norm(s, region) {
    let code = String(pick(s, 'state', 'code') || '').trim(); if (code.length !== 2) code = CODE[code.toLowerCase()] || code; code = code.toUpperCase();
    const ps = pick(s, 'point_system', 'points'), species = pick(s, 'species') || [];
    let points = null;
    if (ps && typeof ps === 'object') {
      const typ = String(pick(ps, 'type') || 'points'), summary = pick(ps, 'summary', 'description', 'notes') || '', tl = (typ + ' ' + summary).toLowerCase();
      points = { type: /^none\b/i.test(typ) && !/;/.test(typ) ? 'none' : typ, summary, calc: pick(ps, 'calc'), lossRule: pick(ps, 'loss_rule', 'lossRule'), sourceUrl: pick(ps, 'source_url', 'sourceUrl') || (s.sources || [])[0] || s.agency_url, species: pick(ps, 'species') || species, lastVerified: pick(ps, 'last_verified', 'lastVerified') || s.last_verified, residentsOnly: ps.residents_only === true,
        calcGuess: /cubed/.test(tl) && !/doubled/.test(tl) ? 'cubed' : /squared/.test(tl) && !/;/.test(typ) ? 'squared' : /^preference$/i.test(typ) ? 'rank' : /^bonus$/i.test(typ) ? 'plus1' : null };
    }
    else if (ps) { const t = String(ps).toLowerCase(); const type = /no (point|pref|bonus)|random|none/.test(t) && !/bonus point|preference point/.test(t.replace(/no (preference|bonus) points?/g, '')) ? 'none' : /squared|bonus/.test(t) ? 'bonus' : /prefer/.test(t) ? 'preference' : /weight|chance/.test(t) ? 'weighted' : 'points';
      points = { type, summary: String(ps), calc: /squared/.test(t) ? 'squared' : /cube/.test(t) ? 'cubed' : type === 'preference' ? 'rank' : type === 'bonus' ? 'plus1' : null, lossRule: null, sourceUrl: (s.sources || [])[0]?.url || (s.sources || [])[0] || s.agency_url, species, lastVerified: s.last_verified }; }
    if (points && !points.species?.length) points.species = species.length ? species : ['All draw species'];
    const all = (s.deadlines || []).map(d => { const st = pick(d, 'status'), pd = parseDate(pick(d, 'date', 'deadline', 'close', 'end', 'closes')), typ = pick(d, 'type'), sp0 = [].concat(pick(d, 'species') || []).join(', ');
      const notes = [pick(d, 'notes', 'note'), pd.extra && !/^check agency site$/i.test(pd.extra) ? pd.extra : ''].filter(Boolean).join(' · ');
      return { title: pick(d, 'title', 'name', 'label', 'hunt') || (typ ? `${sp0} – ${TYPE_LABEL[typ] || human(typ)}` : 'Application deadline'), species: sp0, date: pd.date, month: pd.month || null, sortKey: pd.sortKey || null, na: !!pd.na, check: pd.check, opens: isoDate(pick(d, 'opens', 'open', 'start', 'opens_date')),
        status: pd.na ? 'n/a' : KNOWN.includes(st) ? st : (d.confirmed === true || d.confirmed_2027 === true) ? 'confirmed-2027' : STATUS(st ?? (d.estimated ? 'estimated' : (d.confirmed === false ? 'estimated' : null))),
        date2026: isoDate(pick(d, 'date_2026', 'date2026')), sourceUrl: pick(d, 'source_url', 'sourceUrl', 'source', 'url'), notes, conflict: CONFLICT_RE.test(notes || '') }; });
    all.forEach(d => { if (d.status === 'confirmed-2027' && !d.date && !d.na) d.status = d.month ? 'estimated-from-2026' : 'missing'; });
    const deadlines = all.filter(d => !d.na), notApplicable = all.filter(d => d.na);
    const src = (s.sources || []).map(x => typeof x === 'string' ? { url: x } : { url: pick(x, 'url', 'source_url'), title: pick(x, 'title', 'name') });
    const results = [].concat(s.results_dates || []).map(r => typeof r === 'string' ? r : [pick(r, 'title', 'species', 'label'), pick(r, 'date', 'dates', 'window'), pick(r, 'notes')].filter(Boolean).join(': '));
    const n = { code, name: pick(s, 'state_name', 'name') || NAMES[code] || code, agency: pick(s, 'agency') || '', agencyUrl: pick(s, 'agency_url', 'agencyUrl'), points,
      deadlines, notApplicable, fees: feeRows(s.fees), feeYear: s.fees && !Array.isArray(s.fees) ? s.fees.fee_year || '' : '', residentOnlyNote: pick(s, 'residents_only_notes', 'residentOnlyNote') || '', notes: pick(s, 'notes') || '', guideSteps: [].concat(s.guide_steps || []), resultsDates: results, sources: src, lastVerified: pick(s, 'last_verified'), region };
    n.flags = flagsFor(n, s);
    return n;
  }
  const arr = j => Array.isArray(j) ? j : (j && Array.isArray(j.states) ? j.states : []);
  async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
  async function load() {
    if (data) return data;
    let [west, east, fb] = await Promise.all(['state_data.json', 'state_data_east.json', 'state_data_east_fallback.json'].map(getJSON));
    if (!west && !east) { const c = await DB.setting('stateDataCache2'); if (c) [west, east, fb] = c; }
    else await DB.setting('stateDataCache2', [west, east, fb]);
    if (!west && !east && !fb) throw new Error('State data not available offline yet – open once with signal.');
    const map = new Map(), bad = [];
    const add = (j, region) => arr(j).forEach(s => { try { const n = norm(s, region); if (!NAMES[n.code]) return bad.push(n.code); const o = map.get(n.code); if (o) { // fill gaps from the earlier (fallback) record
      n.replaced = o.region;
      if (n.points && o.points) { n.points.calc ??= o.points.calc; n.points.lossRule ??= o.points.lossRule; } else if (!n.points) n.points = o.points;
      for (const k of ['fees', 'deadlines', 'guideSteps', 'resultsDates', 'sources']) if (!n[k].length && !(k === 'deadlines' && n.notApplicable?.length)) n[k] = o[k];
      for (const k of ['agency', 'agencyUrl', 'residentOnlyNote', 'notes']) if (!n[k]) n[k] = o[k];
      if (o.region === 'east-fallback' && n.region === 'east') mergeFallbackDates(n, o); }
    if (n.points) { n.points.calc ??= n.points.calcGuess || null; if (/;/.test(n.points.type) && !['nd', 'cubed', 'squared'].includes(n.points.calc)) n.points.calc = null; } // mixed systems: no single odds formula
    n.flags = flagsFor(n, s);
    map.set(n.code, n); } catch (e) { bad.push(s && s.state); } });
    add(fb, 'east-fallback'); add(east, 'east'); add(west, 'west'); // later wins: researched east file overrides fallback
    const meta = (west && !Array.isArray(west)) ? west : {};
    data = { dataVersion: meta.dataVersion || 'n/a', disclaimer: meta.disclaimer || 'Dates, point rules and fees change. Estimated dates are NOT official – always confirm on the agency site before applying.',
      notResearched: (meta.not_researched || []).filter(c => !map.has(c)), eastLoaded: !!east, sources: { west: !!west, east: !!east, fallback: !!fb }, bad, states: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    return data;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const daysTo = d => Math.round((new Date(d + 'T12:00') - new Date(today() + 'T12:00')) / 864e5);
  const badge = s => ({ 'confirmed-2027': '<span class="badge ok">Confirmed 2027</span>', 'current-window': '<span class="badge blue">Open now</span>', 'estimated-from-2026': '<span class="badge warn">Estimated (2026 date)</span>', 'estimated-rule-based': '<span class="badge warn">Estimated (annual rule)</span>', missing: '<span class="badge bad">Date not found</span>' }[s] || '');
  const weight = (calc, p, code) => {
    p = +p || 0;
    if (calc === 'squared') return `${p * p + 1} draw chance${p * p + 1 > 1 ? 's' : ''} (points² + 1)`;
    if (calc === 'plus1') return `${p + 1} chance${p ? 's' : ''} (points + 1)`;
    if (calc === 'cubed') return `weight ≈ ${Math.max(1, p ** 3)} (points cubed)`;
    if (calc === 'nd') { const w = p >= 4 ? p ** 3 : p >= 1 ? p * 2 : 0; return `≈ ${w + 1} chances (ND weighting)`; }
    if (calc === 'rank') return p ? `ranked with ${p}-point applicants` : 'random/0-point pool';
    return '';
  };
  const allDeadlines = d => d.states.flatMap(s => s.deadlines.map((x, i) => ({ ...x, state: s.code, stateName: s.name, key: s.code + ':' + i }))).sort((a, b) => (a.date || a.sortKey || '9999').localeCompare(b.date || b.sortKey || '9999'));
  function ics(dl) {
    const d = dl.date.replace(/-/g, ''), uid = dl.key.replace(/\W/g, '') + '@swsf';
    const txt = s => String(s).replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SWSF Hunt//EN', 'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART;VALUE=DATE:' + d, 'SUMMARY:' + txt(`${dl.state} deadline: ${dl.title}`),
      'DESCRIPTION:' + txt(`${dl.species}. ${dl.status.startsWith('estimated') ? 'ESTIMATED date – confirm on agency site. ' : ''}${dl.notes || ''} ${dl.sourceUrl || ''}`),
      'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:Draw deadline in 7 days', 'END:VALARM', 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Draw deadline tomorrow', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  async function checkReminders() { // called on app open
    try {
      const rem = (await DB.setting('drawReminders')) || {}; const keys = Object.keys(rem); if (!keys.length) return;
      const d = await load(); const soon = allDeadlines(d).filter(x => rem[x.key] && x.date && daysTo(x.date) >= 0 && daysTo(x.date) <= 7);
      if (!soon.length) return;
      const msg = soon.map(x => `${x.state} ${x.title}: ${daysTo(x.date) === 0 ? 'TODAY' : daysTo(x.date) + ' days'}`).join(' · ');
      toast('⏰ ' + msg, 8000);
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Draw deadlines coming up', { body: msg, icon: 'design/icons/icon-192.png' });
    } catch { }
  }
  const FLAG_CLS = { residents: 'blue', noseason: 'bad', license: 'warn', points: 'warn', conflict: 'bad', check: 'warn', lifetime: '', waiting: '', nrcap: '' };
  const FLAG_ICON = { residents: '🏠', noseason: '⛔', license: '🪪', points: '★', lifetime: '①', waiting: '⏳', nrcap: '%', conflict: '⚠', check: '?' };
  const forSpecies = (f, species) => { if (!species || !f.sp || !f.sp.length) return true; const want = spIn(species); if (!want.length) return true;
    return f.sp.some(sp => !sp.length || sp.some(w => want.includes(w))); };
  const chips = (s, skip = [], species = '') => (s.flags || []).filter(f => !skip.includes(f.kind) && forSpecies(f, species)).map(f => `<span class="badge ${FLAG_CLS[f.kind]}" title="${esc(f.text.join(' '))}">${FLAG_ICON[f.kind]} ${esc(f.label)}</span>`).join(' ');
  const flagDetail = s => (s.flags || []).length ? `<div class="card"><h3>Key rules &amp; flags</h3><ul class="list small">${s.flags.map(f => `<li style="display:block"><span class="badge ${FLAG_CLS[f.kind]}">${FLAG_ICON[f.kind]} ${esc(f.label)}</span>${f.text.length ? `<ul>${f.text.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul><div class="mute small">Flags are picked out of the agency notes automatically, so read the full guide before applying.</div></div>` : '';
  const dateLabel = x => x.date ? fmtD(x.date) : x.month ? `${MONTHS[+x.month.slice(5) - 1]} ${x.month.slice(0, 4)} (day not posted)` : 'Date not posted';
  return { chips, flagDetail, dateLabel, load, today, daysTo, badge, weight, allDeadlines, ics, checkReminders, LOSS_YEARS };
})();

Views.draws = async (sub = 'deadlines', params = {}) => {
  const d = await Draws.load();
  const tabs = `<div class="segs" style="margin-bottom:8px">${[['deadlines', 'Deadlines'], ['points', 'My points'], ['guide', 'State guides']].map(([k, n]) => `<button class="${sub === k ? 'on' : ''}" onclick="location.hash='#/draws/${k}'">${n}</button>`).join('')}</div>`;
  const pts = await DB.all('points'); const myStates = new Set(pts.filter(p => +p.points > 0 || p.applying).map(p => p.state));
  const disc = `<div class="note">${esc(d.disclaimer)} Data version ${esc(d.dataVersion)}.${d.sources.east ? '' : ' Eastern/Plains states are from the built-in fallback list (state_data_east.json not found).'}</div>`;
  const byCode = Object.fromEntries(d.states.map(s => [s.code, s]));

  if (sub === 'deadlines') {
    const rem = (await DB.setting('drawReminders')) || {};
    const f = params.f || 'upcoming', st = params.st || '';
    let list = Draws.allDeadlines(d);
    if (f === 'upcoming') list = list.filter(x => !x.date || Draws.daysTo(x.date) >= 0);
    if (f === 'mine') list = list.filter(x => myStates.has(x.state) && (!x.date || Draws.daysTo(x.date) >= 0));
    if (st) list = list.filter(x => x.state === st);
    render(`<h1>Draws</h1>${tabs}
    <div class="segs">${[['upcoming', 'Upcoming'], ['mine', 'My states'], ['all', 'All incl. past']].map(([k, n]) => `<button class="${f === k ? 'on' : ''}" onclick="location.hash='#/draws/deadlines?f=${k}'">${n}</button>`).join('')}</div>
    ${f === 'mine' && !myStates.size ? '<div class="note blue">Add points or tick “applying” in <a href="#/draws/points">My points</a> to fill this list.</div>' : ''}
    ${st ? `<div class="note blue">Showing ${esc(byCode[st]?.name || st)} only · <a href="#/draws/deadlines">show all</a></div>` : ''}
    <ul class="list card">${list.map(x => { const n = x.date ? Draws.daysTo(x.date) : null; return `<li style="display:block;padding:10px 0">
      <div class="spread"><b>${Draws.dateLabel(x)} · ${esc(x.state)}</b>${Draws.badge(x.status)}</div>
      <div class="t">${esc(x.title)}</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:3px 0">${x.conflict ? '<span class="badge bad">⚠ Conflicting dates</span>' : ''}${x.check ? '<span class="badge warn">? check agency site</span>' : ''}${Draws.chips(byCode[x.state], ['check', 'conflict'], x.species + ' ' + x.title)}</div><div class="mute small">${esc(x.species)}${x.opens ? ` · opens ${fmtD(x.opens)}` : ''}${n != null ? ` · ${n < 0 ? 'passed' : n === 0 ? 'TODAY' : n + ' days left'}` : ''}${x.date2026 && x.status !== 'confirmed-2027' ? ` · 2026 deadline: ${fmtD(x.date2026)}` : ''}</div>
      ${x.notes ? `<div class="small">${esc(x.notes)}</div>` : ''}
      <div class="row small" style="gap:12px;margin-top:4px">${x.sourceUrl ? `<a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">Agency source ↗</a>` : ''}${byCode[x.state].points ? `<a href="#/draws/points?st=${x.state}">Points →</a>` : ''}<a href="#/draws/guide?st=${x.state}">Guide →</a>
      ${x.date && n >= 0 ? `<label class="check"><input type="checkbox" data-rem="${x.key}" ${rem[x.key] ? 'checked' : ''}> Remind me</label><a href="#" data-ics="${x.key}">＋ Calendar</a>` : ''}</div></li>`; }).join('') || '<li class="mute">Nothing here.</li>'}</ul>
    <div class="mute small">“Remind me” shows an alert when you open the app in the 7 days before. “＋ Calendar” saves an .ics file with alerts 7 days and 1 day out – the most reliable reminder on a phone.</div>${disc}`);
    $$('[data-rem]').forEach(c => c.onchange = async () => { rem[c.dataset.rem] = c.checked; if (!c.checked) delete rem[c.dataset.rem]; await DB.setting('drawReminders', rem); if (c.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); toast(c.checked ? 'Reminder on' : 'Reminder off'); });
    $$('[data-ics]').forEach(a => a.onclick = e => { e.preventDefault(); const x = list.find(y => y.key === a.dataset.ics); download(`${x.state}-deadline-${x.date}.ics`, Draws.ics(x), 'text/calendar'); });
    return;
  }

  if (sub === 'points') {
    const yr = new Date().getFullYear();
    const pointStates = d.states.filter(s => s.points && s.points.type !== 'none');
    const noPts = d.states.filter(s => !s.points || s.points.type === 'none');
    const rec = (st, sp) => pts.find(p => p.state === st && p.species === sp) || { id: 'pts_' + st + '_' + sp.replace(/\W+/g, '_'), type: 'points', state: st, species: sp, points: 0, lastApplied: '', applying: false };
    const total = s => s.points.species.reduce((a, sp) => a + (+rec(s.code, sp).points || 0), 0);
    pointStates.sort((a, b) => (total(b) > 0) - (total(a) > 0) || a.name.localeCompare(b.name));
    render(`<h1>Draws</h1>${tabs}
    <p class="mute small">Every state with a point system is prefilled. Enter your points per species; tick “applying” to add that state’s deadlines to <i>My states</i>.</p>
    ${pointStates.map(s => { const p = s.points, open = params.st === s.code || total(s) > 0; return `<details class="card" ${open ? 'open' : ''} id="st-${s.code}"><summary class="spread"><b>${esc(s.name)}</b><span class="badge">${esc(p.type)}${total(s) ? ' · ' + total(s) + ' pts' : ''}</span></summary>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${Draws.chips(s)}</div><p class="small">${esc(p.summary)}</p>${p.lossRule ? `<div class="note small">${esc(p.lossRule)}</div>` : ''}${s.residentOnlyNote ? `<div class="note blue small">${esc(s.residentOnlyNote)}</div>` : ''}
      <ul class="list">${p.species.map(sp => { const r = rec(s.code, sp), ly = Draws.LOSS_YEARS[s.code], gap = r.lastApplied ? yr - +r.lastApplied : null, risk = ly && gap != null && gap >= ly; return `<li style="display:block">
        <div class="spread"><b>${esc(sp)}</b><span class="mute small">${Draws.weight(p.calc, r.points)}</span></div>
        <div class="row" style="gap:8px;align-items:center"><label class="opt">Points <input type="number" min="0" max="40" inputmode="numeric" style="width:70px" data-k="${s.code}|${esc(sp)}" data-f="points" value="${+r.points || 0}"></label>
        <label class="opt">Last applied <input type="number" min="1990" max="2100" style="width:84px" placeholder="year" data-k="${s.code}|${esc(sp)}" data-f="lastApplied" value="${esc(r.lastApplied)}"></label>
        <label class="check"><input type="checkbox" data-k="${s.code}|${esc(sp)}" data-f="applying" ${r.applying ? 'checked' : ''}> applying</label></div>
        ${risk ? `<div class="note red small">Last applied ${r.lastApplied} – points may already be lost (${ly}-year rule). Check your agency account.</div>` : ly && gap === ly - 1 ? `<div class="note small">Apply or buy a point this year to keep these.</div>` : ''}</li>`; }).join('')}</ul>
      <div class="row small" style="gap:12px"><a href="#/draws/deadlines?st=${s.code}&f=all">Deadlines →</a><a href="#/draws/guide?st=${s.code}">Fees & guide →</a><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">Point rules ↗</a><span class="mute">verified ${esc(p.lastVerified)}</span></div></details>`; }).join('')}
    <div class="card"><h3>No-point states (Deadlines only)</h3><p class="small">${noPts.map(s => `<a href="#/draws/guide?st=${s.code}">${esc(s.name)}</a>`).join(' · ')} – random draws or no current season; see each guide.</p></div>${disc}`);
    if (params.st) setTimeout(() => $('#st-' + params.st)?.scrollIntoView({ block: 'start' }), 50);
    $$('[data-k]').forEach(i => i.onchange = async () => { const [st, sp] = i.dataset.k.split('|'); const r = rec(st, sp); r[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value; r.updated = Date.now(); await DB.put(r); if (!pts.includes(r)) pts.push(r); toast('Saved'); });
    return;
  }

  // guides
  const st = params.st;
  if (!st) return render(`<h1>Draws</h1>${tabs}<p class="mute small">Point rules, fees and deadlines by state, with the official source for every number.</p>
    <ul class="list card">${d.states.map(s => `<li><a class="item" href="#/draws/guide?st=${s.code}"><span class="grow"><div class="t">${esc(s.name)}</div><div class="mute small">${esc(s.agency)} · ${s.points && s.points.type !== 'none' ? esc(s.points.type) : 'no points'}</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${Draws.chips(s)}</div></span><span class="badge">${s.deadlines.length} deadlines</span></a></li>`).join('')}</ul>
    ${d.notResearched.length ? `<div class="card"><h3>Not yet researched</h3><p class="small">${d.notResearched.map(c => esc(c)).join(' · ')}: these states have draws but aren't in the data yet. Check the state agency directly.</p></div>` : ''}${disc}`);
  const s = byCode[st]; if (!s) return render('<p>State not found.</p>');
  render(`<a href="#/draws/guide">← All states</a><h1>${esc(s.name)}</h1>${tabs}
  <div class="card"><div class="mute small"><a href="${esc(s.agencyUrl)}" target="_blank" rel="noopener">${esc(s.agency)} ↗</a></div>${s.notes ? `<p class="small">${esc(s.notes)}</p>` : ''}${s.residentOnlyNote ? `<div class="note blue small">${esc(s.residentOnlyNote)}</div>` : ''}
  </div>${Draws.flagDetail(s)}<div class="card">
  <h3>Point system</h3>${s.points ? `<p class="small">${esc(s.points.summary)}</p><div class="small"><a href="${esc(s.points.sourceUrl)}" target="_blank" rel="noopener">Source ↗</a> · verified ${esc(s.points.lastVerified)} ${s.points.type !== 'none' && s.points.sourceUrl !== undefined ? ` · <a href="#/draws/points?st=${s.code}">My points →</a>` : ''}</div>` : '<p class="small">No preference or bonus points.</p>'}</div>
  ${s.guideSteps.length ? `<div class="card"><h3>How to apply</h3><ol class="small">${s.guideSteps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
  ${s.resultsDates.length ? `<div class="card"><h3>Draw results</h3><ul class="small">${s.resultsDates.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><h3>Fees</h3><div style="overflow-x:auto"><table class="small"><tr><th style="text-align:left">Item</th><th>Resident</th><th>Nonresident</th></tr>
  ${s.fees.map(f => `<tr><td>${esc(f.item)}${f.conflict ? ' <span class="badge bad">⚠ conflict</span>' : ''}${f.notes?.length ? `<div class="small ${f.conflict ? '' : 'mute'}">${esc(f.notes.join(' · '))}</div>` : ''}${f.sourceUrl ? `<div class="mute"><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener">source ↗</a> · verified ${esc(f.lastVerified || s.lastVerified || '')}</div>` : ''}</td><td class="${f.resident === 'check agency site' ? 'warnc' : ''}">${esc(f.resident ?? '—')}</td><td class="${f.nonresident === 'check agency site' ? 'warnc' : ''}">${esc(f.nonresident ?? '—')}</td></tr>`).join('') || '<tr><td colspan="3">check agency site</td></tr>'}</table></div>
  ${s.feeYear ? `<div class="small">Fee year: ${esc(s.feeYear)}</div>` : ''}<div class="mute small">“check agency site” = not verified from an official fee page yet. Fees change every year; some include vendor or habitat fees.</div></div>
  <div class="card"><h3>Deadlines</h3><ul class="list">${Draws.allDeadlines({ states: [s] }).map(x => `<li style="display:block"><div class="spread"><b>${Draws.dateLabel(x)}</b>${Draws.badge(x.status)}</div><div>${esc(x.title)} ${x.conflict ? '<span class="badge bad">⚠ conflicting dates</span>' : ''}${x.check ? ' <span class="badge warn">? check agency site</span>' : ''}</div><div class="mute small">${esc(x.species)}${x.date2026 && x.status !== 'confirmed-2027' ? ' · 2026: ' + fmtD(x.date2026) : ''}</div>${x.notes ? `<div class="small">${esc(x.notes)}</div>` : ''}${x.sourceUrl ? `<a class="small" href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">source ↗</a>` : ''}</li>`).join('') || '<li class="mute">No draw to apply for.</li>'}</ul>${s.notApplicable?.length ? `<h3>Not applicable</h3><ul class="small">${s.notApplicable.map(x => `<li>${esc(x.title)}${x.notes ? ': ' + esc(x.notes) : ''}</li>`).join('')}</ul>` : ''}</div>
  ${s.sources.length ? `<div class="card"><h3>Sources</h3><ul class="small">${s.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || x.url)}</a></li>`).join('')}</ul>${s.lastVerified ? `<div class="mute small">Last verified ${esc(s.lastVerified)}</div>` : ''}</div>` : ''}${disc}`);
};
