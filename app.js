/*!
 * IR & Neuro Cath Lab Inventory Count — web app
 * © 2026 Shadi Al Rawashdeh (shadirawa@gmail.com). All rights reserved.
 * Unauthorized copying, distribution or modification is prohibited.
 * Device data © 2026 shadirawa-ship-it (CC BY-NC-ND 4.0). Educational reference only; not for clinical decision-making.
 */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const COND = ['OK','Damaged packaging','Seal broken','Expired','Recalled','Wrong location'];
const COPY = '© 2026 Shadi Al Rawashdeh (shadirawa@gmail.com). All rights reserved.';
let REG = null, DEV = null, profile = null, state = null, view = 'count';
const F = {q:'', loc:'', sec:'', cat:'', stat:''};
const D = {q:'', cat:'', mfr:'', page:0};

/* ---------- storage: IndexedDB, one record per user profile ---------- */
let dbp;
function db() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('ir-count-app', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('profiles', {keyPath: 'id'}); r.result.createObjectStore('state'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); t.onerror = () => rej(t.error); });
}
const listProfiles = () => tx('profiles', 'readonly', s => s.getAll());
const putProfile = p => tx('profiles', 'readwrite', s => s.put(p));
const getState = id => tx('state', 'readonly', s => s.get(id));
const putState = (id, st) => tx('state', 'readwrite', s => s.put(st, id));
async function delProfile(id) { await tx('profiles', 'readwrite', s => s.delete(id)); await tx('state', 'readwrite', s => s.delete(id)); }
const blankState = () => ({counts: {}, nor: [], meta: {date: '', type: 'Full', lead: '', team: '', sup: ''}});
let saveT; function save() { clearTimeout(saveT); saveT = setTimeout(() => putState(profile.id, state).catch(() => toast('Could not save (storage blocked?)')), 250); }
async function hash(pin, salt) {
  if (!crypto.subtle) return pin;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------- calculations (same rules as the Excel count sheet) ---------- */
const num = v => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
function calc(l) {
  const c = state.counts[l.id] || {};
  const min = num(c.min) ?? l.min ?? 0, max = num(c.max) ?? l.max ?? 0;
  const N = num(c.pc), L = num(c.sys);
  const r = {min, max, N, L, variance: null, status: 'NOT COUNTED', recount: '', post: '', days: null, flag: '', order: null};
  if (N !== null && L !== null) { r.variance = N - L; r.recount = Math.abs(N - L) >= Math.max(2, .2 * L) ? 'YES' : ''; }
  r.status = N === null ? 'NOT COUNTED' : L === null ? 'NO SYSTEM QTY' : N === L ? 'MATCH' : N > L ? 'OVER' : 'SHORT';
  if (N !== null) r.post = N === 0 ? 'OUT OF STOCK' : N <= min ? 'REORDER' : N <= min * 1.5 ? 'LOW' : 'ADEQUATE';
  const e = c.exp || c.regExp;
  if (e) { r.days = Math.floor((new Date(e + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
    r.flag = r.days < 0 ? 'EXPIRED' : r.days <= 90 ? 'CRITICAL <90d' : r.days <= 180 ? 'WARNING <180d' : 'OK'; }
  if (N !== null) r.order = N <= min ? max - N : 0;
  return r;
}
const cls = s => String(s).replace(/[^A-Za-z]/g, '').replace(/^NOTCOUNTED$/, '');
const tag = s => s ? `<span class="tag ${cls(s)}">${esc(s)}</span>` : '';
function stats(lines) {
  const s = {lines: lines.length, counted: 0, match: 0, short: 0, over: 0, nosys: 0, recount: 0, net: 0, out: 0, reorder: 0, low: 0, expired: 0, crit: 0, outRe: 0, order: 0};
  for (const l of lines) { const r = calc(l); if (r.N === null) continue; s.counted++;
    if (r.status === 'MATCH') s.match++; else if (r.status === 'SHORT') s.short++; else if (r.status === 'OVER') s.over++; else s.nosys++;
    if (r.recount) s.recount++; s.net += r.variance || 0;
    if (r.post === 'OUT OF STOCK') s.out++; if (r.post === 'REORDER') s.reorder++; if (r.post === 'LOW') s.low++;
    if (r.flag === 'EXPIRED' && r.N > 0) s.expired++; if (r.flag === 'CRITICAL <90d' && r.N > 0) s.crit++;
    s.order += r.order || 0; }
  s.outRe = s.out + s.reorder; return s;
}

/* ---------- boot ---------- */
async function boot() {
  REG = await (await fetch('data/register.json')).json();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const net = () => { const n = $('#netState'); n.textContent = navigator.onLine ? 'online' : 'offline'; n.classList.toggle('off', !navigator.onLine); };
  addEventListener('online', net); addEventListener('offline', net); net();
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.view); };
  $('#userBtn').onclick = userMenu;
  const ps = await listProfiles(), last = localStorage.getItem('ir.profile');
  const p = ps.find(x => x.id === last);
  if (p && (!p.pin || sessionStorage.getItem('ir.unlocked.' + p.id))) await openProfile(p); else picker(ps);
}
function picker(ps) {
  $('#topbar').hidden = true;
  $('#app').innerHTML = `<div class="welcome"><h1>IR &amp; Neuro Cath Lab Count</h1>
  <p class="note">Each user has a private profile stored only in this browser (works offline). Nothing is sent to any server.</p>
  ${ps.length ? '<h3>Choose your profile</h3><div class="plist">' + ps.map(p => `<div class="prow"><b>${esc(p.name)}${p.pin ? ' 🔒' : ''}</b><button class="btn primary" data-open="${p.id}">Open</button></div>`).join('') + '</div><hr>' : ''}
  <h3>${ps.length ? 'Create a new profile' : 'Create your profile'}</h3>
  <label>Your name</label><input id="pn" placeholder="e.g. Shadi">
  <label>Optional PIN / password (local lock only)</label><input id="pp" type="password" placeholder="leave empty for no lock">
  <button class="btn primary" id="pc">Create profile</button>
  <p class="note">Tip: use Backup in the user menu to move your profile to another device.</p></div>`;
  $('#app').onclick = async e => {
    const o = e.target.closest('[data-open]');
    if (o) { const p = ps.find(x => x.id === o.dataset.open);
      if (p.pin) { const v = prompt('Enter PIN / password for ' + p.name); if (v === null || await hash(v, p.salt) !== p.pin) return toast('Wrong PIN'); sessionStorage.setItem('ir.unlocked.' + p.id, 1); }
      openProfile(p); }
    if (e.target.id === 'pc') { const name = $('#pn').value.trim(); if (!name) return toast('Enter a name');
      const salt = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), pin = $('#pp').value;
      const p = {id: 'u' + Date.now().toString(36), name, created: new Date().toISOString(), salt, pin: pin ? await hash(pin, salt) : ''};
      await putProfile(p); await putState(p.id, blankState()); sessionStorage.setItem('ir.unlocked.' + p.id, 1); openProfile(p); }
  };
}
async function openProfile(p) {
  profile = p; state = Object.assign(blankState(), await getState(p.id) || {}); localStorage.setItem('ir.profile', p.id);
  $('#app').onclick = null; $('#topbar').hidden = false; $('#userBtn').textContent = '👤 ' + p.name; go('count');
}
function go(v) {
  view = v; $('#app').onclick = $('#app').onchange = null; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  ({count: viewCount, dash: viewDash, nor: viewNor, dev: viewDev, help: viewHelp})[v](); scrollTo(0, 0);
}

/* ---------- Count Sheet ---------- */
function filtered() {
  const q = F.q.toLowerCase();
  return REG.lines.filter(l => (!F.loc || l.loc === F.loc) && (!F.sec || l.sec === F.sec) && (!F.cat || l.cat === F.cat) &&
    (!q || (l.name + ' ' + l.bc + ' ' + l.nup + ' ' + l.id).toLowerCase().includes(q)) &&
    (!F.stat || (F.stat === 'RECOUNT' ? calc(l).recount === 'YES' : F.stat === 'TODO' ? calc(l).N === null : calc(l).status === F.stat)));
}
const opts = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
function viewCount() {
  const locs = [...new Set(REG.lines.map(l => l.loc))], cats = [...new Set(REG.lines.map(l => l.cat))].sort();
  $('#app').innerHTML = `<div class="cards" id="cards"></div>
  <div class="toolbar nopr"><input class="grow" id="q" placeholder="Search product, barcode, NUPCO code, line #" value="${esc(F.q)}">
   <select id="floc">${opts(locs, F.loc, 'All locations')}</select><select id="fsec">${opts(['IR', 'NEURO'], F.sec, 'IR + Neuro')}</select>
   <select id="fcat">${opts(cats, F.cat, 'All categories')}</select>
   <select id="fstat">${[['', 'All lines'], ['TODO', 'Not counted'], ['MATCH', 'Match'], ['SHORT', 'Short'], ['OVER', 'Over'], ['NO SYSTEM QTY', 'No system qty'], ['RECOUNT', 'Recount needed']].map(([v, t]) => `<option value="${v}"${F.stat === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
   <button class="btn" onclick="print()">Print</button></div>
  <div class="tw"><table><thead><tr><th>Line</th><th>Location</th><th class="hide-m">Sec</th><th class="hide-m">Category</th><th>Product</th><th class="num hide-m">Min</th><th class="num hide-m">Max</th><th class="num">System qty</th><th class="num">Physical count</th><th>Count status</th><th>Recount</th><th class="hide-m">Stock</th><th class="hide-m">Expiry</th><th class="num hide-m">Order</th><th class="nopr"></th></tr></thead><tbody id="tb"></tbody></table></div>
  <p class="note" id="cnt"></p>`;
  const rerender = () => { F.q = $('#q').value; F.loc = $('#floc').value; F.sec = $('#fsec').value; F.cat = $('#fcat').value; F.stat = $('#fstat').value; fillRows(); };
  ['q', 'floc', 'fsec', 'fcat', 'fstat'].forEach(i => $('#' + i).addEventListener(i === 'q' ? 'input' : 'change', rerender));
  $('#tb').addEventListener('change', e => { const t = e.target, tr = t.closest('tr'); if (!t.dataset.f) return;
    setField(tr.dataset.id, t.dataset.f, t.value); updateRow(tr); cards(); });
  $('#tb').addEventListener('click', e => { const b = e.target.closest('[data-det]'); if (b) details(b.dataset.det); });
  fillRows(); cards();
}
function setField(id, f, v) { const c = state.counts[id] || (state.counts[id] = {}); if (v === '') delete c[f]; else c[f] = v; if (!Object.keys(c).length) delete state.counts[id]; save(); }
function rowHTML(l) {
  const c = state.counts[l.id] || {}, r = calc(l);
  return `<tr data-id="${l.id}" class="${r.recount ? 'rc' : ''}"><td class="mono">${l.id}</td><td>${esc(l.loc)}</td><td class="hide-m">${l.sec}</td><td class="hide-m">${esc(l.cat)}</td>
  <td><b>${esc(l.name)}</b><br><span class="mono">${esc(l.bc)} · ${esc(l.uom)}</span></td><td class="num hide-m">${r.min}</td><td class="num hide-m">${r.max}</td>
  <td class="num"><input class="n" type="number" min="0" inputmode="numeric" data-f="sys" value="${c.sys ?? ''}"></td>
  <td class="num"><input class="n" type="number" min="0" inputmode="numeric" data-f="pc" value="${c.pc ?? ''}"></td>
  <td data-c="st"></td><td data-c="rc"></td><td class="hide-m" data-c="post"></td><td class="hide-m" data-c="fl"></td><td class="num hide-m" data-c="or"></td>
  <td class="nopr"><button class="btn" data-det="${l.id}">Details</button></td></tr>`;
}
function updateRow(tr) {
  const l = REG.lines.find(x => x.id === tr.dataset.id), r = calc(l), g = k => tr.querySelector(`[data-c=${k}]`);
  g('st').innerHTML = tag(r.status); g('rc').innerHTML = tag(r.recount); g('post').innerHTML = tag(r.post);
  g('fl').innerHTML = tag(r.flag === 'OK' ? '' : r.flag); g('or').textContent = r.order || ''; tr.classList.toggle('rc', !!r.recount);
}
function fillRows() {
  const ls = filtered(), tb = $('#tb'); tb.innerHTML = ls.map(rowHTML).join(''); tb.querySelectorAll('tr').forEach(updateRow);
  $('#cnt').textContent = `${ls.length} of ${REG.lines.length} lines shown. Yellow cells are for you to fill in; everything else calculates automatically.`;
}
function cards() {
  const s = stats(REG.lines), el = $('#cards'); if (!el) return; const pct = Math.round(100 * s.counted / s.lines);
  el.innerHTML = `<div class="card"><small>Counted</small><b>${s.counted} / ${s.lines}</b><div class="bar"><i style="width:${pct}%"></i></div></div>
  <div class="card"><small>Match</small><b>${s.match}</b></div><div class="card"><small>Short / Over</small><b>${s.short} / ${s.over}</b></div>
  <div class="card"><small>Recounts flagged</small><b>${s.recount}</b></div><div class="card"><small>Out / Reorder</small><b>${s.outRe}</b></div>`;
}
function details(id) {
  const l = REG.lines.find(x => x.id === id), c = state.counts[id] || {}, r = calc(l);
  const fld = (k, lab, type = 'text', extra = '') => `<div><label>${lab}</label><input data-f="${k}" type="${type}" value="${esc(c[k] ?? '')}" ${extra}></div>`;
  const d = $('#dlg'); d.innerHTML = `<div class="dh">${esc(l.id)} · ${esc(l.name)}</div><div class="db"><p class="note">${esc(l.loc)} · ${l.sec} · ${esc(l.cat)} · NUPCO ${esc(l.nup)} · ${esc(l.uom)}</p><div class="grid2">
  ${fld('sys', 'System qty', 'number', 'min=0')}${fld('pc', 'Physical count (0 = empty bin)', 'number', 'min=0')}
  ${fld('lot', 'Lot / batch # (oldest box)')}${fld('exp', 'Earliest expiry found', 'date')}
  ${fld('qexp', 'Qty expiring ≤ 90 days', 'number', 'min=0')}<div><label>Condition</label><select data-f="cond"><option value=""></option>${COND.map(x => `<option${c.cond === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
  ${fld('by', 'Counted by (initials)')}${fld('ver', 'Verified by (initials)')}
  ${fld('min', 'Min par (override, suggested ' + (l.min ?? '') + ')', 'number', 'min=0')}${fld('max', 'Max par (override, suggested ' + (l.max ?? '') + ')', 'number', 'min=0')}
  ${fld('regExp', 'Register expiry', 'date')}<div class="full"><label>Remarks (e.g. real location)</label><input data-f="rem" value="${esc(c.rem ?? '')}"></div></div>
  <div class="calc" id="calc"></div></div><div class="df"><button class="btn primary" id="cl">Done</button></div>`;
  const paint = () => { const r = calc(l); $('#calc').innerHTML = `<span>Variance: <b>${r.variance ?? '—'}</b></span><span>${tag(r.status)}</span><span>Recount: ${tag(r.recount) || 'no'}</span><span>Stock: ${tag(r.post) || '—'}</span><span>Expiry: ${tag(r.flag) || '—'}${r.days !== null ? ' (' + r.days + ' d)' : ''}</span><span>Suggested order: <b>${r.order ?? '—'}</b></span>`; };
  d.oninput = e => { if (e.target.dataset.f) { setField(id, e.target.dataset.f, e.target.value); paint(); } };
  d.onchange = d.oninput; paint(); d.showModal();
  $('#cl').onclick = () => { d.close(); const tr = $(`#tb tr[data-id="${id}"]`); if (tr) { const c2 = state.counts[id] || {};
    tr.querySelector('[data-f=sys]').value = c2.sys ?? ''; tr.querySelector('[data-f=pc]').value = c2.pc ?? ''; updateRow(tr); } cards(); };
}

/* ---------- Dashboard ---------- */
function viewDash() {
  const m = state.meta, s = stats(REG.lines), pct = s.lines ? s.counted / s.lines : 0;
  const mf = (k, lab, type = 'text') => `<div><label>${lab}</label><input data-m="${k}" type="${type}" value="${esc(m[k] ?? '')}"></div>`;
  const group = key => { const g = {}; REG.lines.forEach(l => (g[l[key]] = g[l[key]] || []).push(l)); return Object.keys(g).sort().map(k => [k, stats(g[k])]); };
  const trs = (rows, cat) => rows.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="num">${x.lines}</td><td class="num">${x.counted}</td><td class="num">${x.lines ? Math.round(100 * x.counted / x.lines) : 0}%</td><td class="num">${x.match}</td><td class="num">${x.short}</td><td class="num">${x.over}</td><td class="num">${cat ? x.net : x.recount}</td><td class="num">${x.outRe}</td>${cat ? `<td class="num">${x.order}</td>` : ''}</tr>`).join('');
  const kf = [['Total lines to count', s.lines], ['Lines counted', s.counted], ['% complete', Math.round(pct * 100) + '%'], ['Match', s.match], ['Short', s.short], ['Over', s.over], ['Counted, no system qty', s.nosys], ['Recounts flagged', s.recount], ['Net unit variance', s.net],
    ['Count accuracy', (s.match + s.short + s.over) ? Math.round(1000 * s.match / (s.match + s.short + s.over)) / 10 + '%' : '0%'], ['Out of stock after count', s.out], ['Reorder after count', s.reorder], ['Low after count', s.low], ['Expired stock found', s.expired], ['Expiring < 90 days', s.crit], ['Items not on register logged', state.nor.length]];
  $('#app').innerHTML = `<h2>Physical count — progress &amp; variance</h2>
  <div class="meta">${mf('date', 'Count date', 'date')}<div><label>Count type</label><select data-m="type">${['Full', 'Cycle', 'Spot'].map(x => `<option${m.type === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>${mf('lead', 'Count lead')}${mf('team', 'Team members')}${mf('sup', 'Supervisor sign-off')}</div>
  <div class="cards">${kf.map(([a, b]) => `<div class="card"><small>${a}</small><b>${b}</b></div>`).join('')}</div>
  <h3>Progress by storage location</h3><div class="tw"><table><thead><tr><th>Location</th><th class="num">Lines</th><th class="num">Counted</th><th class="num">% done</th><th class="num">Match</th><th class="num">Short</th><th class="num">Over</th><th class="num">Recount</th><th class="num">Out/Reorder</th></tr></thead><tbody>${trs(group('loc'), false)}</tbody></table></div>
  <h3>Variance by category</h3><div class="tw"><table><thead><tr><th>Category</th><th class="num">Lines</th><th class="num">Counted</th><th class="num">% done</th><th class="num">Match</th><th class="num">Short</th><th class="num">Over</th><th class="num">Net var.</th><th class="num">Out/Reorder</th><th class="num">Sugg. order</th></tr></thead><tbody>${trs(group('cat'), true)}</tbody></table></div>`;
  $('#app').onchange = e => { const k = e.target.dataset.m; if (k) { state.meta[k] = e.target.value; save(); } };
}

/* ---------- Items not on register ---------- */
function viewNor() {
  const cols = [['date', 'Date', 'date'], ['loc', 'Location', 'text', 'locs'], ['sec', 'Section', 'sec'], ['cat', 'Category', 'text', 'cats'], ['bc', 'Barcode', 'text'], ['name', 'Product name (as on label)', 'text'], ['mfr', 'Manufacturer', 'text'], ['qty', 'Qty', 'number'], ['lot', 'Lot / batch', 'text'], ['exp', 'Expiry', 'date'], ['cond', 'Condition', 'cond'], ['by', 'Found by', 'text'], ['act', 'Action taken', 'text']];
  const cell = (c, v) => c[2] === 'sec' ? `<select data-f="${c[0]}"><option></option><option${v === 'IR' ? ' selected' : ''}>IR</option><option${v === 'NEURO' ? ' selected' : ''}>NEURO</option></select>`
    : c[2] === 'cond' ? `<select data-f="${c[0]}"><option></option>${COND.map(x => `<option${v === x ? ' selected' : ''}>${x}</option>`).join('')}</select>`
    : `<input data-f="${c[0]}" type="${c[2]}" value="${esc(v ?? '')}" ${c[3] ? 'list="dl-' + c[3] + '"' : ''}>`;
  $('#app').innerHTML = `<h2>Items found on shelf but not on the count sheet</h2><div class="toolbar nopr"><button class="btn primary" id="add">+ Add item</button><span class="note">Logged items are added to the register after the count.</span></div>
  <datalist id="dl-locs">${REG.locations.map(x => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="dl-cats">${REG.categories.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <div class="tw"><table><thead><tr><th>#</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${state.nor.map((r, i) => `<tr data-i="${i}"><td>${i + 1}</td>${cols.map(c => `<td>${cell(c, r[c[0]])}</td>`).join('')}<td><button class="btn danger" data-del="${i}">Delete</button></td></tr>`).join('') || '<tr><td colspan="15" class="note">No items logged yet.</td></tr>'}</tbody></table></div>`;
  $('#add').onclick = () => { state.nor.push({date: new Date().toISOString().slice(0, 10)}); save(); viewNor(); };
  $('#app').onchange = e => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.f) { state.nor[tr.dataset.i][e.target.dataset.f] = e.target.value; save(); } };
  $('#app').onclick = e => { const b = e.target.closest('[data-del]'); if (b && confirm('Delete this row?')) { state.nor.splice(+b.dataset.del, 1); save(); viewNor(); } };
}

/* ---------- Device catalog ---------- */
async function viewDev() {
  $('#app').innerHTML = '<p class="note">Loading device catalog…</p>';
  if (!DEV) DEV = await (await fetch('data/devices.json')).json();
  const cats = [...new Set(DEV.rows.map(r => r[0]))].sort(), mfrs = [...new Set(DEV.rows.map(r => r[2]))].sort();
  $('#app').innerHTML = `<h2>Device catalog <span class="note">(${DEV.rows.length.toLocaleString()} devices · reference only, not for clinical decision-making)</span></h2>
  <div class="toolbar nopr"><input class="grow" id="dq" placeholder="Search name, manufacturer, notes" value="${esc(D.q)}"><select id="dc">${opts(cats, D.cat, 'All categories')}</select><select id="dm">${opts(mfrs, D.mfr, 'All manufacturers')}</select><button class="btn" id="dx">Export filtered (Excel)</button></div>
  <div id="dres"></div>`;
  const run = () => { D.q = $('#dq').value; D.cat = $('#dc').value; D.mfr = $('#dm').value; D.page = 0; paintDev(); };
  $('#dq').oninput = run; $('#dc').onchange = run; $('#dm').onchange = run; $('#dx').onclick = () => {
    const rows = devFiltered(), ws = XLSX.utils.aoa_to_sheet([['Category', 'Device', 'Manufacturer', 'OD (in)', 'ID (in)', 'OD (Fr)', 'ID (Fr)', 'Working length (cm)', 'Total length (cm)', 'DMSO', 'Vessel (mm)', 'Microcatheter ID (in)', 'Notes', 'Source URL'], ...rows.map(r => r.map((v, i) => i === 9 ? (v === true ? 'Yes' : v === false ? 'No' : '') : v ?? ''))]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Device Catalog'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[COPY]]), 'Copyright'); XLSX.writeFile(wb, 'device-catalog.xlsx'); };
  paintDev();
}
function devFiltered() { const q = D.q.toLowerCase(); return DEV.rows.filter(r => (!D.cat || r[0] === D.cat) && (!D.mfr || r[2] === D.mfr) && (!q || (r[1] + ' ' + r[2] + ' ' + (r[12] || '')).toLowerCase().includes(q))); }
function paintDev() {
  const rows = devFiltered(), PS = 100, pages = Math.max(1, Math.ceil(rows.length / PS)); D.page = Math.min(D.page, pages - 1);
  const f = v => v ?? '';
  $('#dres').innerHTML = `<div class="tw"><table><thead><tr><th>Category</th><th>Device</th><th>Manufacturer</th><th class="num">OD in</th><th class="num">ID in</th><th class="num">OD Fr</th><th class="num">ID Fr</th><th class="num">Work cm</th><th class="num">Total cm</th><th>DMSO</th><th>Vessel mm</th><th>Notes</th></tr></thead><tbody>
  ${rows.slice(D.page * PS, D.page * PS + PS).map(r => `<tr><td>${esc(r[0])}</td><td><b>${esc(r[1])}</b></td><td>${esc(r[2])}</td><td class="num">${f(r[3])}</td><td class="num">${f(r[4])}</td><td class="num">${f(r[5])}</td><td class="num">${f(r[6])}</td><td class="num">${f(r[7])}</td><td class="num">${f(r[8])}</td><td>${r[9] === true ? 'Yes' : r[9] === false ? 'No' : ''}</td><td>${esc(f(r[10]))}</td><td class="notes">${esc((r[12] || '').slice(0, 160))}${(r[12] || '').length > 160 ? '…' : ''}</td></tr>`).join('')}</tbody></table></div>
  <div class="pager nopr"><button class="btn" id="pp"${D.page ? '' : ' disabled'}>‹ Prev</button><span>Page ${D.page + 1} / ${pages} · ${rows.length.toLocaleString()} devices</span><button class="btn" id="pn"${D.page < pages - 1 ? '' : ' disabled'}>Next ›</button></div>`;
  $('#pp').onclick = () => { D.page--; paintDev(); scrollTo(0, 0); }; $('#pn').onclick = () => { D.page++; paintDev(); scrollTo(0, 0); };
}

/* ---------- How to ---------- */
function viewHelp() {
  $('#app').innerHTML = `<div class="card help"><h2>How to count</h2><ol>
  <li><b>Open on a tablet or print.</b> Use the filters to pick one storage location at a time (walk order: location → category → product). Print gives one list per filter.</li>
  <li><b>Count what is physically there.</b> Enter total units in <i>Physical count</i>. Enter 0 for an empty bin; blank means not counted yet.</li>
  <li><b>Record lot and expiry.</b> Tap <i>Details</i>: lot of the oldest box, earliest expiry found, quantity expiring within 90 days. If you find expired stock set Condition = Expired and move it to quarantine.</li>
  <li><b>Initial every line.</b> Counted by = your initials; Verified by = a second person for any line that shows Recount YES.</li>
  <li><b>Recount rule.</b> Recount turns red when the count differs from system qty by ≥ 2 units or ≥ 20 %.</li>
  <li><b>Unassigned lines</b> are register items not yet mapped to a bin. Write the real location in Remarks when you find it.</li></ol>
  <h2>Offline &amp; your data</h2><ul><li>After the first visit the app works with no internet and can be installed from your browser menu (“Install app” / “Add to Home screen”).</li>
  <li>Your counts are stored only in this browser under your profile. Clearing site data deletes them, so use <b>Backup</b> (user menu) regularly.</li>
  <li>Use <b>Export Excel</b> to get the count sheet, dashboard and not-on-register log as a workbook.</li></ul>
  <p class="note">${COPY} Educational reference; not for clinical decision-making.</p></div>`;
}

/* ---------- user menu: switch, backup, export ---------- */
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
function exportXlsx() {
  const head = ['Line #', 'Location', 'Section', 'Category', 'Barcode', 'NUPCO code', 'Product', 'Pack/UOM', 'Min par', 'Max par', 'System qty', 'Register expiry', 'Physical count', 'Lot/batch', 'Earliest expiry found', 'Qty expiring ≤90d', 'Condition', 'Counted by', 'Verified by', 'Remarks', 'Variance', 'Count status', 'Recount?', 'Post-count stock status', 'Days to expiry', 'Expiry flag', 'Suggested order'];
  const rows = REG.lines.map(l => { const c = state.counts[l.id] || {}, r = calc(l);
    return [l.id, l.loc, l.sec, l.cat, l.bc, l.nup, l.name, l.uom, r.min, r.max, c.sys ?? '', c.regExp ?? '', c.pc ?? '', c.lot ?? '', c.exp ?? '', c.qexp ?? '', c.cond ?? '', c.by ?? '', c.ver ?? '', c.rem ?? '', r.variance ?? '', r.status, r.recount, r.post, r.days ?? '', r.flag, r.order ?? '']; });
  const wb = XLSX.utils.book_new(), s = stats(REG.lines), m = state.meta;
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]); ws['!cols'] = head.map((h, i) => ({wch: i === 6 ? 44 : 14 })); ws['!autofilter'] = {ref: `A1:AA${rows.length + 1}`}; ws['!freeze'] = {xSplit: 0, ySplit: 1};
  XLSX.utils.book_append_sheet(wb, ws, 'Count Sheet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Count date', m.date], ['Count type', m.type], ['Count lead', m.lead], ['Team', m.team], ['Supervisor', m.sup], [], ['Total lines', s.lines], ['Counted', s.counted], ['Match', s.match], ['Short', s.short], ['Over', s.over], ['No system qty', s.nosys], ['Recounts flagged', s.recount], ['Net variance', s.net], ['Out of stock', s.out], ['Reorder', s.reorder], ['Low', s.low], ['Expired found', s.expired], ['Expiring <90d', s.crit]]), 'Dashboard');
  const nh = ['Date', 'Location', 'Section', 'Category', 'Barcode', 'Product', 'Manufacturer', 'Qty', 'Lot', 'Expiry', 'Condition', 'Found by', 'Action']; const nk = ['date', 'loc', 'sec', 'cat', 'bc', 'name', 'mfr', 'qty', 'lot', 'exp', 'cond', 'by', 'act'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([nh, ...state.nor.map(r => nk.map(k => r[k] ?? ''))]), 'Items Not On Register');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[COPY], ['Counted by profile: ' + profile.name]]), 'Copyright');
  XLSX.writeFile(wb, `IR_CathLab_Count_${profile.name.replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
async function userMenu() {
  const d = $('#dlg'); d.innerHTML = `<div class="dh">👤 ${esc(profile.name)}</div><div class="db"><div class="plist">
  <button class="btn primary" id="x1">Export Excel (count sheet + dashboard)</button>
  <button class="btn" id="x2">Backup profile (.json)</button>
  <button class="btn" id="x3">Restore from backup…</button><input type="file" id="x3f" accept=".json" hidden>
  <button class="btn" id="x4">Switch / create profile</button>
  <button class="btn danger" id="x5">Clear all counts in this profile</button>
  <button class="btn danger" id="x6">Delete this profile</button></div><p class="note">${COPY}</p></div><div class="df"><button class="btn" id="x0">Close</button></div>`;
  d.showModal(); d.oninput = d.onchange = null;
  $('#x0').onclick = () => d.close(); $('#x1').onclick = () => { exportXlsx(); d.close(); };
  $('#x2').onclick = () => { download(`ir-count-backup-${profile.name.replace(/\W+/g, '_')}.json`, new Blob([JSON.stringify({app: 'ir-count', version: 1, name: profile.name, state, copyright: COPY})], {type: 'application/json'})); d.close(); };
  $('#x3').onclick = () => $('#x3f').click();
  $('#x3f').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (j.app !== 'ir-count') throw 0;
    if (!confirm('Replace all data in profile "' + profile.name + '" with this backup?')) return; state = Object.assign(blankState(), j.state); await putState(profile.id, state); d.close(); go(view); toast('Backup restored'); } catch (_) { toast('Not a valid backup file'); } };
  $('#x4').onclick = async () => { d.close(); picker(await listProfiles()); };
  $('#x5').onclick = () => { if (confirm('Clear ALL counts, details and the not-on-register log for this profile?')) { state = blankState(); save(); d.close(); go(view); } };
  $('#x6').onclick = async () => { if (confirm('Permanently delete profile "' + profile.name + '" and all its data? Make a backup first.')) { await delProfile(profile.id); localStorage.removeItem('ir.profile'); d.close(); picker(await listProfiles()); } };
}
boot().catch(err => { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px;color:#b91c1c">Could not start: ' + esc(err.message) + '. Serve the folder over http(s) (e.g. GitHub Pages) instead of opening the file directly.</p>'); });
