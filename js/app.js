/* ============================================================
   ProstarM — Site Survey (Anweta Venture Aadhaar centres)
   Single-file field application. No network dependency.
   ============================================================ */

const CONFIG = {
  brand: 'ProstarM',
  client: 'Anweta Venture',
  draftKey: 'prostarm_survey_draft_v1',
  sessionKey: 'prostarm_session_v1',
  seqKey: 'prostarm_survey_seq_v1',
  langKey: 'prostarm_lang_v1',
  storeKey: 'prostarm_surveys_v1',

  /* ---------------------------------------------------------------
     Power Automate / SharePoint
     Paste the HTTP POST URL of the "When an HTTP request is received"
     trigger here. Leave it empty to keep everything on the device.
     text/plain keeps the request "simple" so the browser does not send
     a CORS preflight, which the Power Automate request trigger does
     not answer. The flow parses the body with json(triggerBody()).
     --------------------------------------------------------------- */
  flowUrl: (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.flowUrl) || '',
  flowContentType: (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.flowContentType) || 'text/plain;charset=UTF-8',
  flowTimeoutMs: 45000,
  photoMaxPx: 1400,
  photoQuality: 0.72,
  gpsRequired: true,
  requiredPhotos: { sitecondition: 1, safety: 1, wire: 1 },
  // Power input is recorded only for this site condition.
  powerCondition: 'Interior Ready with Electrical Work'
};

const PHOTO_SECTIONS = [
  ['sitecondition','Site condition'],
  ['safety','Space and safety check for lithium battery'],
  ['wire','Wire and MCCB found at site']
];

const STEPS = [
  { id:'site',   label:'Site'        },
  { id:'safety', label:'Safety'      },
  { id:'power',  label:'Power'       },
  { id:'wire',   label:'Wire & MCCB' },
  { id:'load',   label:'Load'        },
  { id:'review', label:'Review'      }
];

const MANDATORY = {
  site:   ['site','siteCondition','photo:sitecondition','gps'],
  safety: ['branchFloor','liftAvailable','stairAvailable','stairFeasible','craneUnloading','craneLoading',
           'ventilation','acAvailable','waterLeakage','fireExtinguisher','photo:safety'],
  power:  ['voltR','voltY','voltB','earthAvailable'],
  wire:   ['inCableAvail','outCableAvail','earthCableAvail','inMccbAvail','outMccbAvail','photo:wire'],
  load:   ['loadRows'],
  review: []
};

const RADIO_GROUPS = ['siteCondition','branchFloor','liftAvailable','stairAvailable','stairFeasible',
  'craneUnloading','craneLoading','ventilation','acAvailable','waterLeakage','fireExtinguisher',
  'earthAvailable','inCableAvail','outCableAvail','earthCableAvail','inMccbAvail','outMccbAvail',
  'inMccbType','outMccbType'];

const NOT_COMPLETED = 'Electrical Work Not Completed';

const LABELS = {
  site:'Site', siteCondition:'Site condition', gps:'GPS location', surveyDate:'Survey date',
  loadRows:'Load details', branchFloor:'Branch floor', liftAvailable:'Lift availability',
  stairAvailable:'Staircase availability', stairFeasible:'Staircase feasibility',
  craneUnloading:'Crane for unloading', craneLoading:'Crane for loading at centre',
  ventilation:'Ventilation', acAvailable:'AC availability', waterLeakage:'Water leakage',
  fireExtinguisher:'Fire extinguisher', voltR:'R phase voltage', voltY:'Y phase voltage',
  voltB:'B phase voltage', earthAvailable:'Earthing availability',
  inCableAvail:'Input cable availability', outCableAvail:'Output cable availability',
  earthCableAvail:'Earthing cable availability', inMccbAvail:'Input MCCB availability',
  outMccbAvail:'Output MCCB availability',
  'photo:sitecondition':'Site condition photograph', 'photo:safety':'Space & safety photograph',
  'photo:wire':'Wire & MCCB photograph'
};

const SECTION_TITLE = { site:'Site information', safety:'Space & safety', power:'Power input',
  wire:'Wire & MCCB', load:'Load calculation', review:'Review' };

/* ---- Helpers ---- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v == null ? '' : v)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const pad = (n, w) => String(n).padStart(w, '0');
const inr = n => (n || 0).toLocaleString('en-IN');
const todayISO = () => { const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1,2) + '-' + pad(d.getDate(),2); };
const fmtDate = iso => { if (!iso) return '—'; const p = String(iso).split('-');
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : iso; };
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

/* ---- Language ---- */
let LANG = 'en';
function t(s) {
  if (LANG === 'en' || s == null) return s;
  const dict = (typeof I18N !== 'undefined' && I18N[LANG]) || {};
  return Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s;
}

function setLang(lang, quiet) {
  LANG = (lang === 'hi') ? 'hi' : 'en';
  try { localStorage.setItem(CONFIG.langKey, LANG); } catch (e) {}
  document.documentElement.lang = LANG;
  applyLang();
  if (!quiet) refresh();
}

function applyLang() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  $$('.langtoggle button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  $('#btnShowPass').textContent = t($('#loginPass').type === 'password' ? 'Show' : 'Hide');
  buildPhotoBlocks(false);
  PHOTO_SECTIONS.forEach(([k]) => renderPhotos(k));
  buildStateFilter();
  buildStepper();
  buildLoadTable();      // the phone layout puts its labels in data attributes
  if (appView === 'mine') renderMine();
  paintScope();
  paintGps();
  if ($('#reportBody').innerHTML.trim()) buildReport(reportData);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- State ---- */
const LOAD_ITEMS = LOAD_MASTER.filter(r => r.type === 'item');

function blankLoadRows() {
  return LOAD_MASTER.map((r, i) => r.type === 'group'
    ? { i, type:'group', item:r.item }
    : { i, type:'item', item:r.item, count:'', watts:String(r.watts),
        upsCount:'', critical:r.critical || '', remarks:r.remarks || '' });
}

const state = {
  draftId: null, surveyId: '', submitted: false, submittedAt: null, startedAt: null,
  step: 'site', user: null, site: null, gps: null,
  loadNA: false,
  loadRows: blankLoadRows(),
  fields: {},
  photos: { sitecondition:[], safety:[], wire:[] }
};

/* ============================================================
   1. Capacity matching against the Line Diagram master
   ============================================================ */
function parseCapacity(text) {
  if (!text) return null;
  const s = String(text);
  const kva = s.match(/(\d+(?:\.\d+)?)\s*k\s*v\s*a/i);
  if (!kva) return null;
  let minutes = null;
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const mn = s.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min)\b/i);
  if (hr) minutes = parseFloat(hr[1]) * 60;
  else if (mn) minutes = parseFloat(mn[1]);
  return { kva: parseFloat(kva[1]), minutes };
}

function findRecommendation(capacityText) {
  const want = parseCapacity(capacityText);
  if (!want) return null;
  return LINE_DIAGRAM_MASTER.find(r => {
    const have = parseCapacity(r.requirement);
    return have && have.kva === want.kva && have.minutes === want.minutes;
  }) || null;
}
const isRange = v => /[\/\-–]/.test(String(v || '').trim()) || /or/i.test(String(v || ''));

/* ============================================================
   2. Photographs
   ============================================================ */
let photoTarget = null;

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const max = CONFIG.photoMaxPx;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const k = Math.min(max/w, max/h); w = Math.round(w*k); h = Math.round(h*k); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', CONFIG.photoQuality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addPhotos(key, files) {
  if (!files || !files.length) return;
  let added = 0;
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    try {
      state.photos[key].push({
        id: 'P' + Date.now() + Math.random().toString(36).slice(2,6),
        dataUrl: await compressImage(f),
        ts: new Date().toISOString(),
        caption: ''
      });
      added++;
    } catch (e) {}
  }
  if (added) { renderPhotos(key); refresh(); toast(added + ' ' + t(added > 1 ? 'photographs' : 'photograph')); }
  else toast(t('No image files were added.'));
}

function buildPhotoBlocks(wire) {
  $$('.photos').forEach(box => {
    const key = box.dataset.photo, label = box.dataset.label;
    const min = CONFIG.requiredPhotos[key] || 0;
    box.innerHTML =
      '<div class="ptop"><b>' + esc(t(label)) + (min ? ' <span class="req"></span>' : '') + '</b>' +
      '<span class="count" id="cnt-' + key + '">0 photographs</span></div>' +
      '<div class="pbtns">' +
        '<button type="button" class="pbtn" data-cam="' + key + '">' + esc(t('Take photograph')) + '</button>' +
        '<button type="button" class="pbtn alt" data-up="' + key + '">' + esc(t('Upload photograph')) + '</button>' +
      '</div>' +
      (min ? '<div class="err" id="err-photo-' + key + '">' + esc(t('At least 1 photograph required in this section.')) + '</div>' : '') +
      '<div class="thumbs" id="th-' + key + '"></div>';
  });

  if (wire === false) return;
  document.addEventListener('click', e => {
    const cam = e.target.closest('[data-cam]'), up = e.target.closest('[data-up]');
    if (cam) { photoTarget = cam.dataset.cam; $('#fileCam').click(); }
    if (up)  { photoTarget = up.dataset.up;  $('#filePick').click(); }
    const del = e.target.closest('.del');
    if (del) {
      state.photos[del.dataset.key] = state.photos[del.dataset.key].filter(p => p.id !== del.dataset.id);
      renderPhotos(del.dataset.key); refresh(); toast(t('Photograph deleted.'));
    }
  });

  ['#filePick','#fileCam'].forEach(sel => {
    $(sel).addEventListener('change', async ev => {
      if (photoTarget) await addPhotos(photoTarget, ev.target.files);
      ev.target.value = '';
    });
  });
}

function renderPhotos(key) {
  const list = state.photos[key] || [];
  const cnt = $('#cnt-' + key);
  if (cnt) cnt.textContent = list.length + ' ' + t(list.length === 1 ? 'photograph' : 'photographs');
  const wrap = $('#th-' + key);
  if (!wrap) return;
  wrap.innerHTML = list.map(p =>
    '<figure class="thumb">' +
      '<img src="' + p.dataUrl + '" alt="">' +
      '<button type="button" class="del" data-key="' + key + '" data-id="' + p.id + '" aria-label="Delete photograph">✕</button>' +
      '<div class="meta">' + esc(new Date(p.ts).toLocaleString()) + '</div>' +
      '<input type="text" placeholder="' + esc(t('Caption')) + '" value="' + esc(p.caption) + '" data-cap="' + p.id + '" data-capkey="' + key + '">' +
    '</figure>').join('');
  $$('[data-cap]', wrap).forEach(inp => {
    inp.addEventListener('input', () => {
      const ph = state.photos[inp.dataset.capkey].find(x => x.id === inp.dataset.cap);
      if (ph) { ph.caption = inp.value; queueSave(); }
    });
  });
}
const totalPhotos = () => Object.values(state.photos).reduce((a, l) => a + l.length, 0);

/* ============================================================
   3. Site selection
   ============================================================ */
let siteScope = 'branch';   // 'branch' = sites in the signed-in user's branch, 'all' = every site

const userBranch = () => (state.user && state.user.branch) ? state.user.branch : '';
const branchSites = () => {
  const b = userBranch();
  return b ? SITE_MASTER.filter(s => s.branch === b) : [];
};

let stateFilterValue = '';

function buildStateFilter() {
  const sel = $('#stateFilter');
  if (!sel) return;
  const states = [];
  SITE_MASTER.forEach(s => { if (s.state && states.indexOf(s.state) === -1) states.push(s.state); });
  states.sort();
  sel.innerHTML = '<option value="">' + esc(t('All states')) + ' (' + SITE_MASTER.length + ')</option>' +
    states.map(st => '<option value="' + esc(st) + '">' + esc(st) + ' (' +
      SITE_MASTER.filter(x => x.state === st).length + ')</option>').join('');
  sel.value = stateFilterValue;
}

function scopedSites() {
  let pool = (siteScope === 'branch' && branchSites().length) ? branchSites() : SITE_MASTER;
  if (stateFilterValue) pool = pool.filter(s => s.state === stateFilterValue);
  return pool;
}

function paintScope() {
  const n = branchSites().length, b = userBranch();
  const btnBranch = $('#siteScope [data-scope="branch"]');
  const btnAll = $('#siteScope [data-scope="all"]');
  if (!btnBranch) return;
  // With no branch sites there is nothing to scope to, so hide the control entirely.
  $('#siteScope').style.display = n ? 'flex' : 'none';
  if (!n) siteScope = 'all';
  btnBranch.textContent = (b || t('My branch')) + ' (' + n + ')';
  btnAll.textContent = t('All sites') + ' (' + SITE_MASTER.length + ')';
  btnBranch.setAttribute('aria-pressed', String(siteScope === 'branch'));
  btnAll.setAttribute('aria-pressed', String(siteScope !== 'branch'));
}

function buildSiteSearch() {
  const input = $('#siteSearch'), box = $('#siteResults');
  const close = () => { box.classList.remove('show'); input.setAttribute('aria-expanded','false'); };

  const matches = (pool, term) => pool.filter(s =>
    s.siteCode.toLowerCase().includes(term) || s.siteName.toLowerCase().includes(term) ||
    s.district.toLowerCase().includes(term) || s.state.toLowerCase().includes(term) ||
    s.branch.toLowerCase().includes(term) || s.zone.toLowerCase().includes(term));

  const rowHtml = s => '<button type="button" data-code="' + esc(s.siteCode) + '">' +
    '<span class="rc">' + esc(s.siteCode) + ' · ' + esc(s.siteName) + '</span>' +
    '<span class="rm">' + esc(s.district) + ', ' + esc(s.state) + ' · ' + esc(s.branch) +
    ' · ' + esc(s.upsCapacity) + '</span></button>';

  function render(q) {
    const term = q.trim().toLowerCase();
    const pool = scopedSites();
    let hits = !term ? pool.slice(0, 25) : matches(pool, term).slice(0, 60);
    let note = '';

    // An engineer sometimes surveys outside their own branch, so a branch-scoped
    // search that finds nothing falls back to the full list rather than dead-ending.
    if (term && !hits.length && pool.length !== SITE_MASTER.length) {
      const wider = matches(SITE_MASTER, term).slice(0, 60);
      if (wider.length) {
        hits = wider;
        note = '<div class="empty">' + esc(t('Not in') + ' ' + (stateFilterValue || userBranch()) + ' — ' +
               t('showing matches from all sites.')) + '</div>';
      }
    }

    box.innerHTML = hits.length
      ? note + hits.map(rowHtml).join('')
      : '<div class="empty">' + esc(t('No site matches that search. Check the code, name, district, state or branch.')) + '</div>';
    box.classList.add('show');
    input.setAttribute('aria-expanded','true');
  }
  window.renderSiteResults = render;

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('click', () => render(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-code]');
    if (b) { selectSite(b.dataset.code); close(); }
  });
  $('#stateFilter').addEventListener('change', e => {
    stateFilterValue = e.target.value;
    render(input.value);
    input.focus();
  });
  $('#siteScope').addEventListener('click', e => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    siteScope = b.dataset.scope;
    paintScope();
    render(input.value);
    input.focus();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap') && !e.target.closest('#siteScope')) close();
  });
}

function selectSite(code) {
  const s = SITE_MASTER.find(x => x.siteCode === code);
  if (!s) return;
  state.site = s;
  if (!state.startedAt) state.startedAt = new Date().toISOString();
  $('#siteSearch').value = s.siteCode + ' · ' + s.siteName;
  paintSite();
  refresh();
}

function paintSite() {
  const s = state.site;
  $('#siteBlock').style.display = s ? 'block' : 'none';
  if (!s) return;
  $('#hSiteCode').textContent = s.siteCode;
  $('#hSiteName').textContent = s.siteName;
  $('#hUpsCap').textContent   = s.upsCapacity;
  $('#mAddress').textContent  = s.address || '—';
  $('#mDistrict').textContent = s.district || '—';
  $('#mState').textContent    = s.state || '—';
  $('#mBranch').textContent   = (s.branch || '—') + (s.zone ? ' · ' + s.zone : '');
  $('#mContact').textContent  = s.contactDetails || '—';
  $('#mRO').textContent       = s.regionalOffice || '—';
  $('#tileCap').textContent   = s.upsCapacity;
}

/* ============================================================
   4. Load calculation
   ============================================================ */
function buildLoadTable() {
  $('#loadBody').innerHTML = state.loadRows.map(r => {
    if (r.type === 'group')
      return '<tr class="grp"><td colspan="8">' + esc(r.item) + '</td></tr>';
    const crit = r.critical === 'Yes'
      ? '<span class="chip y">Critical</span>' : '<span class="chip n">Non-critical</span>';
    return '<tr data-row="' + r.i + '">' +
      '<td data-eq="1" data-l="' + esc(t('Equipment')) + '">' + esc(r.item) + (r.critical === 'Yes' ? ' <span class="chip y chip-inline">Critical</span>' : '') + '</td>' +
      '<td data-l="' + esc(t('Count')) + '"><input type="number" inputmode="numeric" min="0" step="1" data-load="count" data-i="' + r.i + '"></td>' +
      '<td data-l="' + esc(t('Watts')) + '"><input type="number" inputmode="decimal" min="0" step="any" data-load="watts" data-i="' + r.i + '"></td>' +
      '<td data-l="' + esc(t('Count on UPS')) + '"><input type="number" inputmode="numeric" min="0" step="1" data-load="upsCount" data-i="' + r.i + '"></td>' +
      '<td class="calc" data-l="' + esc(t('Load (W)')) + '" data-out="total-' + r.i + '">0</td>' +
      '<td class="calc" data-l="' + esc(t('Load on UPS (W)')) + '" data-out="ups-' + r.i + '">0</td>' +
      '<td data-hide="1">' + crit + '</td>' +
      '<td data-l="' + esc(t('Remarks')) + '">' + esc(r.remarks || '—') + '</td>' +
    '</tr>';
  }).join('');

  $$('[data-load]').forEach(inp => {
    const row = state.loadRows.find(r => r.i === +inp.dataset.i);
    inp.value = row ? (row[inp.dataset.load] || '') : '';
    inp.addEventListener('input', () => {
      const r = state.loadRows.find(x => x.i === +inp.dataset.i);
      if (r) { r[inp.dataset.load] = inp.value; calcLoad(); refresh(); }
    });
  });
  calcLoad();
}

function loadErrors() {
  if (state.loadNA) return [];
  const errs = [];
  state.loadRows.forEach(r => {
    if (r.type !== 'item') return;
    const c = num(r.count), w = num(r.watts), u = num(r.upsCount);
    if (c !== null && c < 0) errs.push({ i:r.i, f:'count' });
    if (w !== null && w < 0) errs.push({ i:r.i, f:'watts' });
    if (u !== null && u < 0) errs.push({ i:r.i, f:'upsCount' });
    if (u !== null && u > 0 && (c === null || u > c)) errs.push({ i:r.i, f:'upsCount' });
  });
  return errs;
}

function calcLoad() {
  let sumW = 0, sumUps = 0, sumCrit = 0;
  state.loadRows.forEach(r => {
    if (r.type !== 'item') return;
    const c = num(r.count) || 0, w = num(r.watts) || 0, u = num(r.upsCount) || 0;
    const t = c * w, tu = u * w;
    sumW += t; sumUps += tu;
    if (r.critical === 'Yes') sumCrit += tu;
    const a = $('[data-out="total-' + r.i + '"]'), b = $('[data-out="ups-' + r.i + '"]');
    if (a) a.textContent = inr(t);
    if (b) b.textContent = inr(tu);
  });
  $('#sumLoadW').textContent  = inr(sumW);
  $('#sumUpsW').textContent   = inr(sumUps);
  $('#sumLoadKW').textContent = (sumW/1000).toFixed(3);
  $('#sumUpsKW').textContent  = (sumUps/1000).toFixed(3);
  $('#tileLoad').textContent  = inr(sumW) + ' W · ' + (sumW/1000).toFixed(3) + ' kW';
  $('#tileUps').textContent   = inr(sumUps) + ' W · ' + (sumUps/1000).toFixed(3) + ' kW';
  $('#tileCrit').textContent  = inr(sumCrit) + ' W · ' + (sumCrit/1000).toFixed(3) + ' kW';

  $$('[data-load]').forEach(el => el.classList.remove('invalid'));
  const errs = loadErrors();
  errs.forEach(e => {
    const el = $('[data-load="' + e.f + '"][data-i="' + e.i + '"]');
    if (el) el.classList.add('invalid');
  });
  $('#err-load').classList.toggle('show', errs.length > 0);
  return { sumW, sumUps, sumCrit, errs };
}

const loadRowsFilled = () =>
  state.loadRows.filter(r => r.type === 'item' && (num(r.count) || 0) > 0 && (num(r.watts) || 0) > 0).length;

function applyLoadNA() {
  const na = state.loadNA;
  $('#loadNotAvailable').checked = na;
  $('#loadWrap').style.display = na ? 'none' : '';
  $('#loadNAnote').style.display = na ? 'block' : 'none';
}

/* ============================================================
   5. Field plumbing
   ============================================================ */
function fieldValue(id) {
  if (RADIO_GROUPS.includes(id)) {
    const el = document.querySelector('input[name="' + id + '"]:checked');
    return el ? el.value : '';
  }
  if (id === 'site') return state.site ? state.site.siteCode : '';
  if (id === 'gps')  return state.gps ? 'captured' : '';
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function bindFields() {
  $$('[data-save]').forEach(el => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.fields[el.id] = el.value; refresh();
    });
  });
  RADIO_GROUPS.forEach(g => {
    $$('input[name="' + g + '"]').forEach(r => {
      r.addEventListener('change', () => { state.fields[g] = r.value; applyConditionals(); refresh(); });
    });
  });
  on('#loadNotAvailable', 'change', () => {
    state.loadNA = $('#loadNotAvailable').checked;
    applyLoadNA(); calcLoad(); refresh();
  });
}

const powerApplies = () => fieldValue('siteCondition') === CONFIG.powerCondition;

function applyConditionals() {
  const other = fieldValue('branchFloor') === 'Other';
  $('#branchFloorOtherWrap').style.display = other ? 'block' : 'none';
  if (!other) { $('#branchFloorOther').value = ''; state.fields.branchFloorOther = ''; }

  const lift = fieldValue('liftAvailable') === 'Yes';
  $('#liftDoorWrap').style.display = lift ? 'block' : 'none';
  if (!lift) ['liftDoorH','liftDoorW'].forEach(id => { $('#'+id).value = ''; state.fields[id] = ''; });

  const ev = $('#earthVoltage');
  if (fieldValue('earthAvailable') === 'No') {
    ev.value = ''; state.fields.earthVoltage = '';
    ev.disabled = true; ev.placeholder = 'Not applicable';
    $('#earthNote').style.display = 'block';
  } else {
    ev.disabled = false; ev.placeholder = '';
    $('#earthNote').style.display = 'none';
  }

  const cond = fieldValue('siteCondition');
  const note = $('#powerNote');
  if (!cond) { note.style.display = 'none'; }
  else {
    note.style.display = 'block';
    note.textContent = powerApplies()
      ? 'Power input readings are required for this site condition.'
      : 'Power input is not recorded for this site condition, so that step is skipped.';
  }
  if (!powerApplies() && state.step === 'power') gotoStep('site');
}

/* ============================================================
   6. Recommendation + comparison
   ============================================================ */
const kv = (k, v) => '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';

function renderReco() {
  const box = $('#recoBox');
  if (!state.site) {
    box.innerHTML = '<div class="reco none"><header>' + esc(t('No site selected')) + '</header>' +
      '<div class="body" style="padding:13px">' + esc(t('Select a site in step 1 to load the engineering recommendation.')) + '</div></div>';
    return null;
  }
  const rec = findRecommendation(state.site.upsCapacity);
  if (!rec) {
    box.innerHTML = '<div class="reco none"><header>' + esc(t('Manual engineering review required')) + '</header>' +
      '<div class="body" style="padding:13px">The Line Diagram master has no row for <b>' + esc(state.site.upsCapacity) +
      '</b>. No wire or MCCB recommendation has been generated for this site.</div>' +
      '<footer>' + esc(t('Recommendation source: Line Diagram Master')) + '</footer></div>';
    return null;
  }
  box.innerHTML =
    '<div class="reco"><header>' + esc(t('Recommendation')) + ' — ' + esc(rec.requirement) + '</header><div class="body">' +
      kv(t('Input wire'), rec.inputWire + ' Sq mm') +
      kv(t('Input MCB/MCCB'), rec.inputMccb + ' A') +
      kv(t('Output wire'), rec.outputWire + ' Sq mm') +
      kv(t('Output MCB/MCCB'), rec.outputMccb + ' A') +
      kv(t('Earthing wire'), rec.earthingWire + ' Sq mm') +
    '</div><footer>' + esc(t('Recommendation source: Line Diagram Master · matched on UPS capacity')) + ' ' +
      esc(state.site.upsCapacity) + '</footer></div>';
  return rec;
}

function compareRows() {
  const rec = state.site ? findRecommendation(state.site.upsCapacity) : null;
  const spec = [
    { label:'Input cable',    avail:'inCableAvail',    actual:'inCableSize',    rec:'inputWire',    unit:'Sq mm' },
    { label:'Input MCCB',     avail:'inMccbAvail',     actual:'inMccbRating',   rec:'inputMccb',    unit:'A' },
    { label:'Output cable',   avail:'outCableAvail',   actual:'outCableSize',   rec:'outputWire',   unit:'Sq mm' },
    { label:'Output MCCB',    avail:'outMccbAvail',    actual:'outMccbRating',  rec:'outputMccb',   unit:'A' },
    { label:'Earthing cable', avail:'earthCableAvail', actual:'earthCableSize', rec:'earthingWire', unit:'Sq mm' }
  ];

  return spec.map(s => {
    const avail = fieldValue(s.avail);
    const actualRaw = fieldValue(s.actual);
    let actualTxt;
    if (avail === NOT_COMPLETED) actualTxt = 'Electrical work not completed';
    else if (avail === 'No') actualTxt = 'Not available at site';
    else actualTxt = actualRaw ? actualRaw + ' ' + s.unit : 'Not recorded';

    const recRaw = rec ? rec[s.rec] : '';
    const recTxt = rec ? recRaw + ' ' + s.unit : 'Manual engineering review required';

    let status, cls;
    if (avail === NOT_COMPLETED)     { status = 'Electrical work not completed'; cls = 'warn'; }
    else if (!rec)                   { status = 'Manual engineering review required'; cls = 'warn'; }
    else if (isRange(recRaw))        { status = 'Manual engineering review required'; cls = 'warn'; }
    else if (avail === 'No')         { status = 'Not available'; cls = 'bad'; }
    else if (!actualRaw)             { status = 'Not recorded'; cls = 'na'; }
    else {
      const a = num(actualRaw), r = num(recRaw);
      if (a === null || r === null)  { status = 'Manual engineering review required'; cls = 'warn'; }
      else if (a === r)              { status = '✓ OK'; cls = 'ok'; }
      else if (a < r)                { status = '⚠ Undersized'; cls = 'bad'; }
      else                           { status = 'Above recommendation'; cls = 'warn'; }
    }
    return { label:s.label, actual:actualTxt, recommended:recTxt, status, cls };
  });
}

function renderCompare() {
  $('#cmpBody').innerHTML = compareRows().map(r =>
    '<tr><td>' + esc(t(r.label)) + '</td>' +
    '<td class="num" data-l="' + esc(t('Actual at site')) + '">' + esc(t(r.actual)) + '</td>' +
    '<td class="num" data-l="' + esc(t('Recommended')) + '">' + esc(t(r.recommended)) + '</td>' +
    '<td data-l="' + esc(t('Status')) + '"><span class="tag ' + r.cls + '">' + esc(t(r.status)) + '</span></td></tr>').join('');
}

/* ============================================================
   7. Site issues
   ============================================================ */
function buildIssues() {
  const out = [], f = id => fieldValue(id);
  if (f('waterLeakage') === 'Yes')          out.push('Water leakage observed at UPS room');
  if (f('fireExtinguisher') === 'No')       out.push('Fire extinguisher not available at UPS room');
  if (f('ventilation') === 'Poor')          out.push('Poor ventilation at UPS room');
  if (f('acAvailable') === 'Not Available') out.push('AC not available at UPS room');
  if (f('craneUnloading') === 'Yes')        out.push('Crane required for UPS unloading');
  if (f('craneLoading') === 'Yes')          out.push('Crane required for UPS loading at the centre');
  if (f('liftAvailable') === 'No' && f('stairFeasible') === 'No')
    out.push('No lift, and staircase not feasible to carry the UPS into the UPS room');
  if (powerApplies() && f('earthAvailable') === 'No') out.push('Earthing not available');

  [['inCableAvail','Input cable'], ['outCableAvail','Output cable'], ['earthCableAvail','Earthing cable'],
   ['inMccbAvail','Input MCCB'], ['outMccbAvail','Output MCCB']].forEach(([k, label]) => {
    if (f(k) === 'No') out.push(label + ' — not available');
    if (f(k) === NOT_COMPLETED) out.push(label + ' — electrical work not completed');
  });

  compareRows().forEach(r => {
    if (r.status === '⚠ Undersized')
      out.push(r.label + ' — undersized against the Line Diagram recommendation');
    if (r.status === 'Manual engineering review required')
      out.push(r.label + ' — manual engineering review required');
  });
  if (state.loadNA) out.push('Load calculation details not available at the centre');
  return out;
}

function renderIssues() {
  const list = buildIssues(), ul = $('#issueList');
  ul.classList.toggle('clear', list.length === 0);
  ul.innerHTML = list.length
    ? list.map(x => '<li><b>⚠</b><span>' + esc(t(x)) + '</span></li>').join('')
    : '<li><b>✓</b><span>' + esc(t('No issues raised from the answers recorded so far.')) + '</span></li>';
}

/* ============================================================
   8. Steps, completion and validation
   ============================================================ */
const stepVisible = id => id === 'power' ? powerApplies() : true;
const visibleSteps = () => STEPS.filter(s => stepVisible(s.id));

function itemDone(key) {
  if (key === 'loadRows') return state.loadNA || (loadRowsFilled() > 0 && loadErrors().length === 0);
  if (key.indexOf('photo:') === 0) {
    const k = key.slice(6);
    return state.photos[k].length >= (CONFIG.requiredPhotos[k] || 0);
  }
  return !!fieldValue(key);
}

function sectionStatus(stepId) {
  if (stepId === 'review') {
    const done = visibleSteps().filter(s => s.id !== 'review')
      .every(s => sectionStatus(s.id).state === 'done');
    return { state: done ? 'done' : 'todo', done: done ? 1 : 0, total: 1, missing: [] };
  }
  const keys = MANDATORY[stepId] || [];
  const missing = keys.filter(k => !itemDone(k));
  const done = keys.length - missing.length;
  let st = 'todo';
  if (keys.length && !missing.length) st = 'done';
  else if (done > 0) st = 'warn';
  return { state: st, done, total: keys.length, missing };
}

function completionPct() {
  let done = 0, total = 0;
  visibleSteps().forEach(s => {
    if (s.id === 'review') return;
    const r = sectionStatus(s.id);
    done += r.done; total += r.total;
  });
  return total ? Math.round(done / total * 100) : 0;
}

function renderTracker() {
  const marks = { done:['✓','done'], warn:['⚠','warn'], todo:['○','todo'] };
  $('#tracker').innerHTML = visibleSteps().map(s => {
    const r = sectionStatus(s.id), m = marks[r.state];
    const miss = r.missing.map(k => t(LABELS[k] || k)).join(', ');
    return '<li><span class="mark ' + m[1] + '">' + m[0] + '</span>' +
      '<span>' + esc(t(SECTION_TITLE[s.id])) + '</span>' +
      '<span class="miss">' + esc(r.state === 'done' ? t('Complete') : (miss || t('Not started'))) + '</span></li>';
  }).join('');
  const pct = completionPct();
  $('#pctBig').textContent = pct + '%';
  $('#hdrProgress').style.width = pct + '%';
}

function renderPhotoSummary() {
  const el = $('#photoSummary');
  if (!el) return;
  el.innerHTML = PHOTO_SECTIONS.map(([k, label]) => {
    const n = state.photos[k].length, min = CONFIG.requiredPhotos[k] || 0;
    const ok = n >= min;
    return '<li><span class="mark ' + (ok ? 'done' : 'warn') + '">' + (ok ? '✓' : '⚠') + '</span>' +
      '<span>' + esc(t(label)) + '</span>' +
      '<span class="miss">' + n + (min ? ' / ' + min : '') + '</span></li>';
  }).join('');
}

function validateSection(stepId, showErrors, doScroll) {
  if (doScroll === undefined) doScroll = true;
  if (!stepVisible(stepId)) return true;
  const keys = MANDATORY[stepId] || [];
  let firstBad = null, ok = true;

  keys.forEach(k => {
    const good = itemDone(k);
    if (!good) ok = false;
    if (!showErrors) return;

    if (k === 'loadRows') {
      const bad = !good;
      $('#err-load').classList.toggle('show', bad && !state.loadNA);
      if (bad && !firstBad) firstBad = $('#sec-load .card');
      return;
    }
    if (k.indexOf('photo:') === 0) {
      const box = $('#err-photo-' + k.slice(6));
      if (!box) return;
      box.classList.toggle('show', !good);
      if (!good && !firstBad) firstBad = box.closest('.photos');
      return;
    }
    const errEl = $('#err-' + k);
    if (errEl) errEl.classList.toggle('show', !good);
    const input = document.getElementById(k);
    if (input && input.tagName === 'INPUT') input.classList.toggle('invalid', !good);
    if (!good && !firstBad) firstBad = errEl ? (errEl.closest('.f') || errEl.closest('.card')) : input;
  });

  if (stepId === 'load' && loadErrors().length) ok = false;

  if (showErrors && doScroll && firstBad) {
    firstBad.scrollIntoView({ behavior:'smooth', block:'center' });
    const focusable = firstBad.querySelector('input:not([type=hidden]),select,textarea');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll:true }), 320);
  }
  return ok;
}

function allValid(showErrors) {
  const bad = visibleSteps().find(s => !validateSection(s.id, false));
  if (bad && showErrors) { gotoStep(bad.id); validateSection(bad.id, true); }
  return !bad;
}

/* ============================================================
   9. Navigation
   ============================================================ */
function buildStepper() {
  const vis = visibleSteps();
  $('#stepper').innerHTML = vis.map((s, i) =>
    '<button type="button" class="step" data-goto="' + s.id + '">' +
    '<span class="n">' + (i+1) + '</span>' + esc(t(s.label)) + '</button>').join('');
}

function gotoStep(id) {
  if (!stepVisible(id)) id = 'site';
  state.step = id;
  $$('.sec').forEach(sec => sec.classList.toggle('active', sec.dataset.sec === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refresh();
}

function moveStep(delta) {
  const vis = visibleSteps();
  const i = vis.findIndex(s => s.id === state.step);
  const next = vis[Math.min(Math.max(0, i + delta), vis.length - 1)];
  if (next) gotoStep(next.id);
}

function paintStepper() {
  const vis = visibleSteps();
  if ($$('.step').length !== vis.length ||
      $$('.step').some((b, i) => b.dataset.goto !== vis[i].id)) buildStepper();

  $$('.step').forEach((b, i) => {
    const r = sectionStatus(vis[i].id);
    b.setAttribute('aria-current', String(vis[i].id === state.step));
    b.classList.toggle('done', r.state === 'done');
    b.classList.toggle('warn', r.state === 'warn');
  });
  const i = vis.findIndex(s => s.id === state.step);
  $('#btnPrev').disabled = i <= 0;
  const last = i === vis.length - 1;
  $('#btnNext').style.display   = last ? 'none' : '';
  $('#btnSubmit').style.display = last ? '' : 'none';
  $('#btnSubmit').disabled = state.submitted;
}

/* ============================================================
   10. Survey ID and drafts
   ============================================================ */
function seqMap() { try { return JSON.parse(localStorage.getItem(CONFIG.seqKey) || '{}'); } catch (e) { return {}; } }

function buildSurveyId(commit) {
  if (!state.site) return '';
  const d = (state.fields.surveyDate || todayISO()).replace(/-/g,'');
  const base = d + '-' + state.site.siteCode;
  const map = seqMap();
  const next = (map[base] || 0) + 1;
  if (commit) { map[base] = next; try { localStorage.setItem(CONFIG.seqKey, JSON.stringify(map)); } catch (e) {} }
  return 'SS-' + d + '-' + state.site.siteCode + '-' + pad(next, 3);
}

function paintHeader() {
  if (!state.submitted) state.surveyId = buildSurveyId(false);
  $('#hdrSurveyId').textContent = state.surveyId || 'Survey ID pending';
  const p = $('#hdrStatus');
  p.textContent = t(state.submitted ? 'Submitted' : 'Draft');
  p.classList.toggle('submitted', state.submitted);
}

function snapshot() {
  return {
    draftId: state.draftId, surveyId: state.surveyId, submitted: state.submitted,
    submittedAt: state.submittedAt, startedAt: state.startedAt,
    step: state.step, savedAt: new Date().toISOString(),
    siteCode: state.site ? state.site.siteCode : null,
    userId: state.user ? state.user.userId : null,
    gps: state.gps, loadNA: state.loadNA, loadRows: state.loadRows,
    fields: state.fields, photos: state.photos
  };
}

let saveTimer, saveEnabled = false;
function queueSave() { if (!saveEnabled) return; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 700); }

function saveDraft(quiet) {
  if (state.submitted) return true;
  saveEnabled = true;
  if (!state.draftId) state.draftId = 'DR-' + Date.now().toString(36).toUpperCase();
  try {
    localStorage.setItem(CONFIG.draftKey, JSON.stringify(snapshot()));
    if (!quiet) toast(t('Draft saved on this device.'));
    return true;
  } catch (e) {
    try {
      const lean = snapshot();
      lean.photos = { sitecondition:[], safety:[], wire:[] };
      lean.photosDropped = true;
      localStorage.setItem(CONFIG.draftKey, JSON.stringify(lean));
      toast(t('Draft saved without photographs — device storage is full.'));
    } catch (e2) { toast(t('Draft could not be saved. Device storage is full.')); }
    return false;
  }
}

function loadDraftObject() {
  try { return JSON.parse(localStorage.getItem(CONFIG.draftKey) || 'null'); } catch (e) { return null; }
}

function applyDraft(d) {
  state.draftId = d.draftId || null;
  state.surveyId = d.surveyId || '';
  state.submitted = !!d.submitted;
  state.submittedAt = d.submittedAt || null;
  state.startedAt = d.startedAt || null;
  state.gps = d.gps || null;
  state.loadNA = !!d.loadNA;
  state.fields = d.fields || {};
  if (Array.isArray(d.loadRows) && d.loadRows.length === LOAD_MASTER.length) state.loadRows = d.loadRows;
  if (d.photos) Object.keys(state.photos).forEach(k => { state.photos[k] = d.photos[k] || []; });
  if (d.siteCode) { const s = SITE_MASTER.find(x => x.siteCode === d.siteCode); if (s) state.site = s; }

  Object.entries(state.fields).forEach(([k, v]) => {
    if (RADIO_GROUPS.includes(k)) {
      const r = document.querySelector('input[name="' + k + '"][value="' + CSS.escape(v) + '"]');
      if (r) r.checked = true;
    } else {
      const el = document.getElementById(k);
      if (el) el.value = v;
    }
  });
  state.loadRows.forEach(r => {
    if (r.type !== 'item') return;
    ['count','watts','upsCount'].forEach(f => {
      const el = $('[data-load="' + f + '"][data-i="' + r.i + '"]');
      if (el) el.value = r[f] || '';
    });
  });
  if (state.site) { $('#siteSearch').value = state.site.siteCode + ' · ' + state.site.siteName; paintSite(); }
  paintGps();
  applyLoadNA();
  applyConditionals();
  calcLoad();
  PHOTO_SECTIONS.forEach(([k]) => renderPhotos(k));
  if (state.submitted) lockSubmitted();
  gotoStep(d.step || 'site');
}

function resetAll() {
  state.draftId = null; state.surveyId = ''; state.submitted = false; state.submittedAt = null;
  state.site = null; state.gps = null; state.fields = {}; state.loadNA = false;
  state.startedAt = new Date().toISOString();
  state.loadRows = blankLoadRows();
  Object.keys(state.photos).forEach(k => state.photos[k] = []);
  $$('input,select,textarea').forEach(el => {
    if (el.type === 'radio' || el.type === 'checkbox') el.checked = false;
    else if (el.type !== 'file') el.value = '';
    el.classList.remove('invalid'); el.disabled = false; el.readOnly = false;
  });
  $$('.err').forEach(e => e.classList.remove('show'));
  // submitting locks the controls; a new survey has to unlock them again
  $$('.pbtn').forEach(b => b.disabled = false);
  ['#btnGps','#btnSubmit','#btnSaveDraft','#btnNext','#btnPrev'].forEach(sel => {
    const el = $(sel); if (el) el.disabled = false;
  });
  $('#loginRemember').checked = true;
  $('#surveyDate').value = todayISO(); state.fields.surveyDate = todayISO();
  stampUser();
  $('#submittedCard').style.display = 'none';
  $('#siteBlock').style.display = 'none';
  buildLoadTable();
  applyLoadNA(); paintGps(); applyConditionals(); calcLoad();
  PHOTO_SECTIONS.forEach(([k]) => renderPhotos(k));
  showView('survey');
  gotoStep('site');
}

/* ============================================================
   11. GPS
   ============================================================ */
function paintGps() {
  const box = $('#gpsBox'), out = $('#gpsOut');
  if (state.gps) {
    box.classList.add('ok');
    out.textContent = state.gps.lat.toFixed(5) + ', ' + state.gps.lng.toFixed(5) +
      (state.gps.accuracy ? ' (±' + Math.round(state.gps.accuracy) + ' m)' : '');
    $('#btnGps').textContent = t('Capture again');
  } else {
    box.classList.remove('ok');
    out.textContent = t('Location not captured.');
    $('#btnGps').textContent = t('Capture location');
  }
}

function captureGps() {
  if (!navigator.geolocation) { $('#gpsOut').textContent = 'This device does not report a location.'; return; }
  $('#btnGps').disabled = true;
  $('#gpsOut').textContent = t('Reading location…');
  navigator.geolocation.getCurrentPosition(
    p => {
      state.gps = { lat:p.coords.latitude, lng:p.coords.longitude,
                    accuracy:p.coords.accuracy, ts:new Date().toISOString() };
      $('#btnGps').disabled = false;
      paintGps(); refresh(); toast(t('Location captured.'));
    },
    () => {
      $('#btnGps').disabled = false;
      $('#gpsOut').textContent = t('Location unavailable. Allow location access, move near a window or step outside, then try again.');
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
  );
}

/* ============================================================
   12. Survey payload and submission
   ============================================================ */
function surveyJSON() {
  const rec = state.site ? findRecommendation(state.site.upsCapacity) : null;
  const { sumW, sumUps, sumCrit } = calcLoad();
  const f = state.fields, u = state.user;
  const dimUnit = k => f[k] || 'Feet';

  return {
    surveyId: state.surveyId,
    surveyDate: f.surveyDate || '',
    startedAt: state.startedAt,
    submittedAt: state.submittedAt,
    engineerName: f.engineerName || '',
    engineerId: f.engineerId || '',
    submittedBy: u ? { userId:u.userId, name:u.name, role:u.role, designation:u.designation,
                       branch:u.branch, zone:u.zone, managerCode:u.managerCode, managerName:u.managerName } : null,
    gps: state.gps,
    site: {
      siteCode: state.site ? state.site.siteCode : '',
      siteName: state.site ? state.site.siteName : '',
      address: state.site ? state.site.address : '',
      district: state.site ? state.site.district : '',
      state: state.site ? state.site.state : '',
      branch: state.site ? state.site.branch : '',
      zone: state.site ? state.site.zone : '',
      contactDetails: state.site ? state.site.contactDetails : '',
      regionalOffice: state.site ? state.site.regionalOffice : '',
      upsCapacity: state.site ? state.site.upsCapacity : '',
      siteCondition: fieldValue('siteCondition')
    },
    loadDetailsAvailable: !state.loadNA,
    loadCalculation: state.loadNA ? [] : state.loadRows.filter(r => r.type === 'item').map(r => ({
      i: r.i, item: r.item, count: num(r.count), watts: num(r.watts),
      countOnUps: num(r.upsCount),
      loadW: (num(r.count) || 0) * (num(r.watts) || 0),
      loadOnUpsW: (num(r.upsCount) || 0) * (num(r.watts) || 0),
      critical: r.critical, remarks: r.remarks
    })),
    loadTotals: state.loadNA ? null : {
      totalLoadW: sumW, totalLoadKW: +(sumW/1000).toFixed(3),
      totalUpsLoadW: sumUps, totalUpsLoadKW: +(sumUps/1000).toFixed(3),
      criticalUpsLoadW: sumCrit, criticalUpsLoadKW: +(sumCrit/1000).toFixed(3)
    },
    spaceSafety: {
      branchFloor: fieldValue('branchFloor'), branchFloorOther: f.branchFloorOther || '',
      mainDoor: { height:f.mainDoorH || '', width:f.mainDoorW || '', unit:dimUnit('mainDoorUnit') },
      upsRoom: { length:f.upsRoomL || '', breadth:f.upsRoomB || '', height:f.upsRoomH || '', unit:dimUnit('upsRoomUnit') },
      upsRoomDoor: { height:f.upsDoorH || '', width:f.upsDoorW || '', unit:dimUnit('upsDoorUnit') },
      liftAvailable: fieldValue('liftAvailable'),
      liftDoor: { height:f.liftDoorH || '', width:f.liftDoorW || '', unit:dimUnit('liftDoorUnit') },
      stairAvailable: fieldValue('stairAvailable'), stairFeasible: fieldValue('stairFeasible'),
      craneForUnloading: fieldValue('craneUnloading'), craneForLoadingAtCentre: fieldValue('craneLoading'),
      ventilation: fieldValue('ventilation'), acAvailability: fieldValue('acAvailable'),
      waterLeakage: fieldValue('waterLeakage'), fireExtinguisher: fieldValue('fireExtinguisher')
    },
    powerInputApplicable: powerApplies(),
    powerInput: powerApplies() ? {
      ebVoltage: { r:f.voltR || '', y:f.voltY || '', b:f.voltB || '' },
      phaseLoadAmp: { phase1:f.load1 || '', phase2:f.load2 || '', phase3:f.load3 || '' },
      earthingAvailable: fieldValue('earthAvailable'),
      earthingVoltage: fieldValue('earthAvailable') === 'No' ? 'Not Applicable' : (f.earthVoltage || '')
    } : null,
    wireMccb: {
      inputCable:   { availability:fieldValue('inCableAvail'),    sizeSqmm:f.inCableSize || '' },
      outputCable:  { availability:fieldValue('outCableAvail'),   sizeSqmm:f.outCableSize || '' },
      earthingCable:{ availability:fieldValue('earthCableAvail'), sizeSqmm:f.earthCableSize || '' },
      inputMccb:    { availability:fieldValue('inMccbAvail'),  ratingAmp:f.inMccbRating || '',  type:fieldValue('inMccbType') },
      outputMccb:   { availability:fieldValue('outMccbAvail'), ratingAmp:f.outMccbRating || '', type:fieldValue('outMccbType') }
    },
    recommendation: rec
      ? { source:'Line Diagram Master', matchedRequirement:rec.requirement, inputWire:rec.inputWire,
          inputMccb:rec.inputMccb, outputWire:rec.outputWire, outputMccb:rec.outputMccb, earthingWire:rec.earthingWire }
      : { source:'Line Diagram Master', matchedRequirement:null, note:'Manual Engineering Review Required' },
    comparison: compareRows(),
    issues: buildIssues(),
    photos: PHOTO_SECTIONS.flatMap(([k, label]) =>
      state.photos[k].map(p => ({ section:k, sectionLabel:label, id:p.id,
                                  timestamp:p.ts, caption:p.caption, dataUrl:p.dataUrl }))),
    remarks: { engineer: state.fields.remarkEngineer || '', customer: state.fields.remarkCustomer || '' },
    completionPct: completionPct()
  };
}

/* Swap the body of this function for a fetch() when the backend is ready. */
const stripPhotos = rec => Object.assign({}, rec, {
  photosDropped: true,
  photos: (rec.photos || []).map(p => ({ section:p.section, sectionLabel:p.sectionLabel,
                                         id:p.id, timestamp:p.timestamp, caption:p.caption }))
});

function tryStore(all) {
  try { localStorage.setItem(CONFIG.storeKey, JSON.stringify(all)); return true; }
  catch (e) { return false; }
}

/* POST one survey to the Power Automate flow. Resolves to the flow's reply. */
async function postToFlow(payload) {
  if (!CONFIG.flowUrl) throw new Error('no flow configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.flowTimeoutMs);
  try {
    const res = await fetch(CONFIG.flowUrl, {
      method: 'POST',
      headers: { 'Content-Type': CONFIG.flowContentType },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('flow returned ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return { ok: true }; }
  } finally { clearTimeout(timer); }
}

/* Save locally first, then try the flow. The survey is never lost to a bad signal. */
async function submitSurveyToServer(payload) {
  const rec = Object.assign({}, payload, {
    syncStatus: CONFIG.flowUrl ? 'pending' : 'local',
    syncError: '', syncedAt: null, sharePointItemId: null
  });

  const all = storedSurveys();
  all.push(rec);
  if (!tryStore(all)) {
    // Device storage is finite. Give up the oldest photographs first so the most
    // recent surveys keep their images, and never lose the survey data itself.
    for (let i = 0; i < all.length - 1 && !tryStore(all); i++) all[i] = stripPhotos(all[i]);
    if (!tryStore(all)) {
      all[all.length - 1] = stripPhotos(all[all.length - 1]);
      tryStore(all);
    }
  }

  if (CONFIG.flowUrl) {
    try {
      const reply = await postToFlow(payload);
      markSynced(payload.surveyId, reply);
      return { ok:true, surveyId:payload.surveyId, synced:true, reply };
    } catch (e) {
      markSyncFailed(payload.surveyId, e.message);
      return { ok:true, surveyId:payload.surveyId, synced:false, queued:true };
    }
  }
  return { ok:true, surveyId:payload.surveyId, storedLocally:true };
}

function updateStored(surveyId, patch) {
  const all = storedSurveys();
  const i = all.findIndex(r => r.surveyId === surveyId);
  if (i === -1) return;
  all[i] = Object.assign({}, all[i], patch);
  tryStore(all);
}
const markSynced = (id, reply) => updateStored(id, {
  syncStatus:'synced', syncedAt:new Date().toISOString(), syncError:'',
  sharePointItemId: (reply && (reply.itemId || reply.ID)) || null
});
const markSyncFailed = (id, msg) => updateStored(id, { syncStatus:'pending', syncError: msg || '' });

const pendingSurveys = () => storedSurveys().filter(r => r.syncStatus === 'pending');

let syncing = false;
async function syncPending(quiet) {
  if (syncing) return;
  if (!CONFIG.flowUrl) { if (!quiet) toast(t('No SharePoint flow is configured on this build.')); return; }
  const queue = pendingSurveys();
  if (!queue.length) { if (!quiet) toast(t('Everything on this device is already sent.')); return; }

  syncing = true;
  const btn = $('#btnSyncNow');
  if (btn) btn.disabled = true;
  let done = 0, failed = 0;
  for (const rec of queue) {
    try { markSynced(rec.surveyId, await postToFlow(rec)); done++; }
    catch (e) { markSyncFailed(rec.surveyId, e.message); failed++; }
  }
  syncing = false;
  if (btn) btn.disabled = false;
  renderMine();
  if (!quiet) toast(done + ' ' + t('sent') + (failed ? ' · ' + failed + ' ' + t('still pending') : ''));
}

const row = (k, v) => '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';

function openConfirm() {
  if (!allValid(true)) { toast(t('Some mandatory entries are still missing.')); return; }
  const { sumW, sumUps } = calcLoad();
  $('#confirmSum').innerHTML =
    row(t('Site'), state.site.siteCode + ' · ' + state.site.siteName) +
    row(t('Engineer'), (state.fields.engineerName || '—') + ' (' + (state.fields.engineerId || '—') + ')') +
    row(t('Survey date'), fmtDate(state.fields.surveyDate)) +
    row(t('UPS capacity'), state.site.upsCapacity) +
    row(t('Total load'), state.loadNA ? t('Details not available') : (sumW/1000).toFixed(3) + ' kW') +
    row(t('Total load on UPS'), state.loadNA ? t('Details not available') : (sumUps/1000).toFixed(3) + ' kW') +
    row(t('Photographs'), String(totalPhotos())) +
    row(t('Completion'), completionPct() + '%');
  $('#confirmModal').classList.add('show');
}

let submitting = false;
async function doSubmit() {
  if (submitting || state.submitted) return;
  submitting = true;
  $('#btnConfirmSubmit').disabled = true;
  try {
    state.surveyId = buildSurveyId(true);
    state.submitted = true;
    state.submittedAt = new Date().toISOString();
    const res = await submitSurveyToServer(surveyJSON());
    try { localStorage.removeItem(CONFIG.draftKey); } catch (e) {}
    $('#confirmModal').classList.remove('show');
    lockSubmitted();
    refresh();
    $('#submittedCard').scrollIntoView({ behavior:'smooth', block:'center' });
    toast(res && res.queued ? t('Survey saved. It will be sent when a connection is available.')
                            : t('Survey submitted.'));
  } catch (e) {
    state.submitted = false;
    toast(t('Submission failed. The draft is still on this device.'));
  } finally {
    submitting = false;
    $('#btnConfirmSubmit').disabled = false;
  }
}

function lockSubmitted() {
  $$('#app input, #app select, #app textarea').forEach(el => { if (el.type !== 'file') el.disabled = true; });
  $$('.pbtn').forEach(b => b.disabled = true);
  $('#btnGps').disabled = true;
  $('#btnSubmit').disabled = true;
  $('#btnSaveDraft').disabled = true;
  $('#submittedCard').style.display = 'block';
  $('#doneSurveyId').textContent = state.surveyId;
}

/* ============================================================
   13. Report
   ============================================================ */
/* Shared report furniture, used by both the survey report and the load report. */
function reportHead(titleKey, d) {
  return '<div class="rhead">' +
      '<img class="rlogo" src="' + LOGO_FULL + '" alt="ProstarM">' +
      '<div class="rtitle"><h1>' + esc(t(titleKey)) + '</h1><p>' +
        esc(CONFIG.client) + ' · ' + esc(t('Aadhaar centre')) + '</p></div>' +
    '</div>';
}
function reportStrips(d) {
  const by = d.submittedBy || {}, v = x => (x === '' || x == null) ? '—' : x;
  const strip = (pairs, cls) => '<div class="strip' + (cls ? ' ' + cls : '') + '">' + pairs.map(p =>
    '<div><span>' + esc(p[0]) + '</span><b>' + esc(p[1]) + '</b></div>').join('') + '</div>';
  return strip([[t('Survey ID'), d.surveyId || t('Not generated')],
                [t('Survey date'), fmtDate(d.surveyDate)],
                [t('Status'), t(d.submittedAt ? 'Submitted' : 'Draft')],
                [t('Completion'), d.completionPct + '%']]) +
         strip([[t('Field engineer'), v(d.engineerName)],
                [t('Employee ID'), v(d.engineerId)],
                [t('Designation'), by.designation || '—'],
                [t('Branch / zone'), (by.branch || '—') + (by.zone ? ' · ' + by.zone : '')]], 'eng');
}
function reportFoot(d) {
  return '<div class="rfoot">' +
      '<span><img src="' + LOGO_ICON + '" alt=""> ' + esc(CONFIG.brand) + ' · ' + esc(CONFIG.client) + '</span>' +
      '<span>' + esc(d.surveyId || '') + ' · ' + esc(new Date().toLocaleString()) + '</span>' +
    '</div>';
}

/* Rows the engineer filled, with their group headers. Driven by the payload so a
   survey saved earlier renders exactly the same as the one in progress. */
function filledLoadRows(d) {
  const byIndex = {};
  (d.loadCalculation || []).forEach(r => {
    if ((r.count || 0) > 0 || (r.countOnUps || 0) > 0) byIndex[r.i] = r;
  });
  const shown = [];
  LOAD_MASTER.forEach((row, idx) => {
    if (row.type === 'group') {
      let has = false;
      for (let j = idx + 1; j < LOAD_MASTER.length && LOAD_MASTER[j].type === 'item'; j++)
        if (byIndex[j]) { has = true; break; }
      if (has) shown.push({ type:'group', item:row.item });
    } else if (byIndex[idx]) shown.push(Object.assign({ type:'item' }, byIndex[idx]));
  });
  return shown;
}

function loadTableHtml(d) {
  if (!d.loadDetailsAvailable)
    return '<div class="notavail">' + esc(t('Load calculation details are not available at this centre.')) + '</div>';

  const shown = filledLoadRows(d);
  const body = shown.map(row => {
    if (row.type === 'group') return '<tr class="grp"><td colspan="6">' + esc(row.item) + '</td></tr>';
    const c = row.count || 0, w = row.watts || 0, u = row.countOnUps || 0;
    return '<tr><td>' + esc(row.item) + '</td><td class="num">' + c + '</td><td class="num">' + w +
      '</td><td class="num">' + u + '</td><td class="num">' + inr(c*w) + '</td><td class="num">' + inr(u*w) + '</td></tr>';
  }).join('') || '<tr><td colspan="6">' + esc(t('No equipment counts were recorded.')) + '</td></tr>';

  const tt = d.loadTotals;
  return '<table><thead><tr><th>' + esc(t('Electrical equipment')) + '</th><th>' + esc(t('Count')) +
    '</th><th>' + esc(t('Watts')) + '</th><th>' + esc(t('On UPS')) + '</th><th>' + esc(t('Load (W)')) +
    '</th><th>' + esc(t('Load on UPS (W)')) + '</th></tr></thead><tbody>' + body +
    '<tr class="tot"><td colspan="4">' + esc(t('Total (W)')) + '</td><td class="num">' + inr(tt.totalLoadW) +
      '</td><td class="num">' + inr(tt.totalUpsLoadW) + '</td></tr>' +
    '<tr class="tot"><td colspan="4">' + esc(t('Total (kW)')) + '</td><td class="num">' + tt.totalLoadKW.toFixed(3) +
      '</td><td class="num">' + tt.totalUpsLoadKW.toFixed(3) + '</td></tr>' +
    '<tr class="tot"><td colspan="4">' + esc(t('Critical load on UPS (kW)')) + '</td><td class="num">—</td><td class="num">' +
      tt.criticalUpsLoadKW.toFixed(3) + '</td></tr></tbody></table>';
}

function loadSkippedNote(d) {
  if (!d.loadDetailsAvailable) return '';
  const items = LOAD_MASTER.filter(x => x.type === 'item').length;
  const shown = filledLoadRows(d).filter(x => x.type === 'item').length;
  const skipped = items - shown;
  return skipped ? '<span class="note">' + skipped + ' ' + esc(t('items with no count omitted')) + '</span>' : '';
}

let reportData = null;

function buildReport(payload) {
  const d = payload || reportData || surveyJSON(), s = d.site;
  const v = x => (x === '' || x == null) ? '—' : x;
  const tv = x => t(v(x));
  const dim = (o, keys) => {
    const vals = keys.map(k => o[k]).filter(x => x !== '' && x != null);
    return vals.length ? vals.join('×') + ' ' + t(o.unit || '') : '—';
  };
  const kvl = (pairs, cls) => '<div class="kvl' + (cls ? ' ' + cls : '') + '">' + pairs.map(p =>
    '<div class="r' + (p[2] ? ' ' + p[2] : '') + '"><span>' + esc(p[0]) + '</span><b>' + esc(p[1]) + '</b></div>').join('') + '</div>';
  const panel = (title, inner) => '<div class="panel"><h4>' + esc(t(title)) + '</h4>' + inner + '</div>';

  const safetyPanel = panel('Space & safety — lithium battery', kvl([
    [t('Branch floor'), tv(d.spaceSafety.branchFloor) + (d.spaceSafety.branchFloorOther ? ' — ' + d.spaceSafety.branchFloorOther : '')],
    [t('Main door H×W'), dim(d.spaceSafety.mainDoor, ['height','width'])],
    [t('UPS room L×B×H'), dim(d.spaceSafety.upsRoom, ['length','breadth','height'])],
    [t('UPS room door H×W'), dim(d.spaceSafety.upsRoomDoor, ['height','width'])],
    [t('Lift available'), tv(d.spaceSafety.liftAvailable)],
    [t('Lift door H×W'), d.spaceSafety.liftAvailable === 'Yes' ? dim(d.spaceSafety.liftDoor, ['height','width']) : t('Not applicable')],
    [t('Staircase available'), tv(d.spaceSafety.stairAvailable)],
    [t('Staircase feasible for UPS'), tv(d.spaceSafety.stairFeasible)],
    [t('Crane — UPS unloading'), tv(d.spaceSafety.craneForUnloading)],
    [t('Crane — loading at centre'), tv(d.spaceSafety.craneForLoadingAtCentre)],
    [t('Ventilation'), tv(d.spaceSafety.ventilation)],
    [t('AC availability'), tv(d.spaceSafety.acAvailability)],
    [t('Water leakage'), tv(d.spaceSafety.waterLeakage)],
    [t('Fire extinguisher'), tv(d.spaceSafety.fireExtinguisher)]
  ]));

  const powerPanel = panel('Power input', d.powerInputApplicable
    ? kvl([[t('EB voltage R'), v(d.powerInput.ebVoltage.r) + ' V'],
           [t('EB voltage Y'), v(d.powerInput.ebVoltage.y) + ' V'],
           [t('EB voltage B'), v(d.powerInput.ebVoltage.b) + ' V'],
           [t('Load 1st phase'), v(d.powerInput.phaseLoadAmp.phase1) + ' A'],
           [t('Load 2nd phase'), v(d.powerInput.phaseLoadAmp.phase2) + ' A'],
           [t('Load 3rd phase'), v(d.powerInput.phaseLoadAmp.phase3) + ' A'],
           [t('Earthing available'), tv(d.powerInput.earthingAvailable)],
           [t('Earthing voltage'), tv(d.powerInput.earthingVoltage)]])
    : '<div class="notavail">' + esc(t('Not recorded — site condition is') + ' "' + t(v(s.siteCondition)) + '".') + '</div>');

  const wirePanel = panel('Wire & MCCB — actual at site', kvl([
    [t('Input cable'), wireLine(d.wireMccb.inputCable, 'Sqmm')],
    [t('Output cable'), wireLine(d.wireMccb.outputCable, 'Sqmm')],
    [t('Earthing cable'), wireLine(d.wireMccb.earthingCable, 'Sqmm')],
    [t('Input MCCB'), mccbLine(d.wireMccb.inputMccb)],
    [t('Output MCCB'), mccbLine(d.wireMccb.outputMccb)]
  ]));

  const r = d.recommendation;
  const recoPanel = panel('Engineering recommendation', r.matchedRequirement
    ? kvl([[t('Matched requirement'), r.matchedRequirement],
           [t('Input wire'), r.inputWire + ' Sqmm'],
           [t('Input MCB/MCCB'), r.inputMccb + ' A'],
           [t('Output wire'), r.outputWire + ' Sqmm'],
           [t('Output MCB/MCCB'), r.outputMccb + ' A'],
           [t('Earthing wire'), r.earthingWire + ' Sqmm'],
           [t('Source'), t('Line Diagram Master')]])
    : '<div class="notavail">' + esc(t('Manual engineering review required — no Line Diagram row matches') +
      ' ' + s.upsCapacity + '.') + '</div>');

  const cmpHtml = d.comparison.map(c =>
    '<tr><td>' + esc(t(c.label)) + '</td><td>' + esc(t(c.actual)) + '</td><td>' + esc(t(c.recommended)) + '</td>' +
    '<td><span class="tag ' + c.cls + '">' + esc(t(c.status)) + '</span></td></tr>').join('');

  const shortLabel = { sitecondition:'Site condition', safety:'Space & safety', wire:'Wire & MCCB' };
  const seen = {};
  const withImages = (d.photos || []).filter(p => p.dataUrl);
  const allPhotos = withImages.map(p => {
    seen[p.section] = (seen[p.section] || 0) + 1;
    return { p, tag: t(shortLabel[p.section] || p.section) + ' ' + seen[p.section] };
  });
  const photoHtml = allPhotos.length
    ? '<h3 class="rsec">' + esc(t('Photographs')) + '<span class="note">' + allPhotos.length + '</span></h3>' +
      '<div class="rphotos">' + allPhotos.map(x =>
        '<figure><img src="' + x.p.dataUrl + '" alt=""><figcaption><b>' + esc(x.tag) + '</b>' +
        (x.p.caption ? ' — ' + esc(x.p.caption) : '') + '<br>' +
        esc(new Date(x.p.timestamp).toLocaleDateString()) + '</figcaption></figure>').join('') + '</div>'
    : ((d.photos || []).length
        ? '<h3 class="rsec">' + esc(t('Photographs')) + '<span class="note">' + d.photos.length + '</span></h3>' +
          '<div class="notavail">' + esc(t('Photographs were not kept on this device for this survey.')) + '</div>'
        : '');

  $('#reportBody').innerHTML =
    reportHead('SITE SURVEY REPORT', d) + reportStrips(d) +

    '<h3 class="rsec">' + esc(t('Site information')) + '</h3>' +
    kvl([[t('Site code'), v(s.siteCode)], [t('Site name'), v(s.siteName)],
         [t('District'), v(s.district)], [t('State'), v(s.state)],
         [t('Site branch / zone'), (s.branch || '—') + (s.zone ? ' · ' + s.zone : '')],
         [t('Regional office'), v(s.regionalOffice)],
         [t('UPS capacity'), v(s.upsCapacity)], [t('Site condition'), tv(s.siteCondition)],
         [t('GPS'), d.gps ? d.gps.lat.toFixed(5) + ', ' + d.gps.lng.toFixed(5) : t('Not captured')],
         [t('Contact'), v(s.contactDetails)],
         [t('Address'), v(s.address), 'wide']], 'kvcols') +

    '<div class="rgrid">' + safetyPanel + powerPanel + wirePanel + recoPanel + '</div>' +

    '<h3 class="rsec">' + esc(t('Actual against recommended')) + '</h3>' +
    '<table><thead><tr><th>' + esc(t('Item')) + '</th><th>' + esc(t('Actual at site')) + '</th><th>' +
      esc(t('Recommended')) + '</th><th>' + esc(t('Status')) + '</th></tr></thead>' +
      '<tbody>' + cmpHtml + '</tbody></table>' +

    '<h3 class="rsec">' + esc(t('Site issues / attention required')) +
      (d.issues.length ? '<span class="note">' + d.issues.length + '</span>' : '') + '</h3>' +
    (d.issues.length ? '<ul class="rissues">' + d.issues.map(i => '<li>' + esc(t(i)) + '</li>').join('') + '</ul>'
                     : '<div class="noissues">' + esc(t('No issues raised from the recorded answers.')) + '</div>') +

    '<div class="rgrid">' +
      panel('Engineer observations / site remarks', '<div class="remark">' + esc(d.remarks.engineer || t('No remarks recorded.')) + '</div>') +
      panel('Customer / site representative remarks', '<div class="remark">' + esc(d.remarks.customer || t('No remarks recorded.')) + '</div>') +
    '</div>' +

    photoHtml +

    '<div class="sign">' +
      '<div>' + esc(v(d.engineerName)) + ' (' + esc(v(d.engineerId)) + ') — ' + esc(t('field engineer, signature and date')) + '</div>' +
      '<div>' + esc(t('Site representative — name, signature and date')) + '</div>' +
    '</div>' + reportFoot(d);

  buildLoadReport(d);
  reportData = d;
}

/* The load calculation lives in its own tab so the survey report stays short. */
function buildLoadReport(d) {
  d = d || reportData || surveyJSON();
  const s = d.site, v = x => (x === '' || x == null) ? '—' : x;
  const kvl = pairs => '<div class="kvl kvcols">' + pairs.map(p =>
    '<div class="r"><span>' + esc(p[0]) + '</span><b>' + esc(p[1]) + '</b></div>').join('') + '</div>';

  $('#reportLoad').innerHTML =
    reportHead('LOAD CALCULATION REPORT', d) + reportStrips(d) +
    '<h3 class="rsec">' + esc(t('Site information')) + '</h3>' +
    kvl([[t('Site code'), v(s.siteCode)], [t('Site name'), v(s.siteName)],
         [t('District'), v(s.district)], [t('State'), v(s.state)],
         [t('Site branch / zone'), (s.branch || '—') + (s.zone ? ' · ' + s.zone : '')],
         [t('UPS capacity'), v(s.upsCapacity)]]) +
    '<h3 class="rsec">' + esc(t('Total load calculation — Aadhaar centre')) + loadSkippedNote(d) + '</h3>' +
    loadTableHtml(d) +
    '<div class="sign">' +
      '<div>' + esc(v(d.engineerName)) + ' (' + esc(v(d.engineerId)) + ') — ' + esc(t('field engineer, signature and date')) + '</div>' +
      '<div>' + esc(t('Site representative — name, signature and date')) + '</div>' +
    '</div>' + reportFoot(d);
}

function wireLine(o, unit) {
  if (o.availability === NOT_COMPLETED) return t('Electrical work not completed');
  if (o.availability === 'No') return t('Not available at site');
  return t(o.availability || 'Not recorded') + ' — ' + (o.sizeSqmm ? o.sizeSqmm + ' ' + unit : t('Not recorded'));
}
function mccbLine(o) {
  if (o.availability === NOT_COMPLETED) return t('Electrical work not completed');
  if (o.availability === 'No') return t('Not available at site');
  return t(o.availability || 'Not recorded') + ' — ' + (o.ratingAmp ? o.ratingAmp + ' A' : t('Not recorded')) +
         ' — ' + (o.type ? t(o.type) : t('Not recorded'));
}

let reportTab = 'survey';
function showReportTab(tab) {
  reportTab = tab;
  $('#reportBody').classList.toggle('hidden', tab !== 'survey');
  $('#reportLoad').classList.toggle('hidden', tab !== 'load');
  $$('#reportTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  window.scrollTo(0, 0);
}

function showReport(payload) {
  reportData = payload || surveyJSON();
  buildReport(reportData);
  showReportTab(reportTab);
  $('#app').style.display = 'none';
  $('#reportView').classList.add('show');
  window.scrollTo(0, 0);
}
function hideReport() {
  $('#reportView').classList.remove('show');
  $('#app').style.display = '';
  reportData = null;
}

/* ============================================================
   14. Data export
   ============================================================ */
function flattenSurvey(d) {
  const g = (o, k) => (o && o[k] != null && o[k] !== '') ? o[k] : '';
  const by = d.submittedBy || {};
  const cmp = {};
  (d.comparison || []).forEach(r => {
    cmp[r.label + ' — actual'] = r.actual;
    cmp[r.label + ' — recommended'] = r.recommended;
    cmp[r.label + ' — status'] = r.status;
  });
  const load = {};
  (d.loadCalculation || []).forEach(r => {
    load[r.item + ' — count'] = r.count == null ? '' : r.count;
    load[r.item + ' — watts'] = r.watts == null ? '' : r.watts;
    load[r.item + ' — on UPS'] = r.countOnUps == null ? '' : r.countOnUps;
    load[r.item + ' — load W'] = r.loadW || '';
  });
  const ss = d.spaceSafety || {}, pi = d.powerInput || {}, wm = d.wireMccb || {}, rc = d.recommendation || {};
  const t = d.loadTotals;
  const dim = (o, ks) => { const x = ks.map(k => g(o,k)).filter(Boolean); return x.length ? x.join(' x ') + ' ' + g(o,'unit') : ''; };

  return Object.assign({
    'Survey ID': d.surveyId, 'Survey date': d.surveyDate,
    'Started at': d.startedAt || '', 'Submitted at': d.submittedAt || '',
    'Engineer name': d.engineerName, 'Engineer code': d.engineerId,
    'Designation': g(by,'designation'), 'Branch': g(by,'branch'), 'Zone': g(by,'zone'),
    'Role': g(by,'role'), 'Manager code': g(by,'managerCode'), 'Manager name': g(by,'managerName'),
    'Site code': d.site.siteCode, 'Site name': d.site.siteName, 'Address': d.site.address,
    'District': d.site.district, 'State': d.site.state,
    'Site branch': d.site.branch || '', 'Site zone': d.site.zone || '',
    'Contact details': d.site.contactDetails,
    'Regional office': d.site.regionalOffice, 'UPS capacity': d.site.upsCapacity,
    'Site condition': d.site.siteCondition,
    'GPS latitude': d.gps ? d.gps.lat : '', 'GPS longitude': d.gps ? d.gps.lng : '',
    'GPS accuracy (m)': d.gps && d.gps.accuracy ? Math.round(d.gps.accuracy) : '',
    'Branch floor': g(ss,'branchFloor') + (ss.branchFloorOther ? ' - ' + ss.branchFloorOther : ''),
    'Main door (H x W)': dim(ss.mainDoor, ['height','width']),
    'UPS room (L x B x H)': dim(ss.upsRoom, ['length','breadth','height']),
    'UPS room door (H x W)': dim(ss.upsRoomDoor, ['height','width']),
    'Lift available': g(ss,'liftAvailable'),
    'Lift door (H x W)': ss.liftAvailable === 'Yes' ? dim(ss.liftDoor, ['height','width']) : 'Not applicable',
    'Staircase available': g(ss,'stairAvailable'),
    'Staircase feasible': g(ss,'stairFeasible'),
    'Crane required for unloading': g(ss,'craneForUnloading'),
    'Crane required for loading at centre': g(ss,'craneForLoadingAtCentre'),
    'Ventilation': g(ss,'ventilation'), 'AC availability': g(ss,'acAvailability'),
    'Water leakage': g(ss,'waterLeakage'), 'Fire extinguisher': g(ss,'fireExtinguisher'),
    'Power input applicable': d.powerInputApplicable ? 'Yes' : 'No',
    'EB voltage R (V)': g(pi.ebVoltage,'r'), 'EB voltage Y (V)': g(pi.ebVoltage,'y'), 'EB voltage B (V)': g(pi.ebVoltage,'b'),
    'Load 1st phase (A)': g(pi.phaseLoadAmp,'phase1'), 'Load 2nd phase (A)': g(pi.phaseLoadAmp,'phase2'),
    'Load 3rd phase (A)': g(pi.phaseLoadAmp,'phase3'),
    'Earthing available': g(pi,'earthingAvailable'), 'Earthing voltage (V)': g(pi,'earthingVoltage'),
    'Input cable available': g(wm.inputCable,'availability'), 'Input cable size (Sqmm)': g(wm.inputCable,'sizeSqmm'),
    'Output cable available': g(wm.outputCable,'availability'), 'Output cable size (Sqmm)': g(wm.outputCable,'sizeSqmm'),
    'Earthing cable available': g(wm.earthingCable,'availability'), 'Earthing cable size (Sqmm)': g(wm.earthingCable,'sizeSqmm'),
    'Input MCCB available': g(wm.inputMccb,'availability'), 'Input MCCB rating (A)': g(wm.inputMccb,'ratingAmp'),
    'Input MCCB type': g(wm.inputMccb,'type'),
    'Output MCCB available': g(wm.outputMccb,'availability'), 'Output MCCB rating (A)': g(wm.outputMccb,'ratingAmp'),
    'Output MCCB type': g(wm.outputMccb,'type'),
    'Recommendation source': g(rc,'source'),
    'Matched requirement': rc.matchedRequirement || 'Manual Engineering Review Required',
    'Recommended input wire': g(rc,'inputWire'), 'Recommended input MCCB': g(rc,'inputMccb'),
    'Recommended output wire': g(rc,'outputWire'), 'Recommended output MCCB': g(rc,'outputMccb'),
    'Recommended earthing wire': g(rc,'earthingWire')
  }, cmp, {
    'Load details available': d.loadDetailsAvailable ? 'Yes' : 'No',
    'Total load (W)': t ? t.totalLoadW : '', 'Total load (kW)': t ? t.totalLoadKW : '',
    'Total load on UPS (W)': t ? t.totalUpsLoadW : '', 'Total load on UPS (kW)': t ? t.totalUpsLoadKW : '',
    'Critical load on UPS (kW)': t ? t.criticalUpsLoadKW : ''
  }, load, {
    'Site issues': (d.issues || []).join(' | '),
    'Issue count': (d.issues || []).length,
    'Photos — site condition': (d.photos || []).filter(p => p.section === 'sitecondition').length,
    'Photos — space & safety': (d.photos || []).filter(p => p.section === 'safety').length,
    'Photos — wire & MCCB': (d.photos || []).filter(p => p.section === 'wire').length,
    'Photo captions': (d.photos || []).filter(p => p.caption).map(p => p.sectionLabel + ': ' + p.caption).join(' | '),
    'Engineer remarks': d.remarks.engineer, 'Customer remarks': d.remarks.customer,
    'Completion %': d.completionPct, 'Status': d.submittedAt ? 'Submitted' : 'Draft'
  });
}

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (cols.indexOf(k) === -1) cols.push(k); }));
  const cell = x => {
    const s = x == null ? '' : String(x);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return '\ufeff' + [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\r\n');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type:(mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportCurrent(kind) {
  const d = reportData || surveyJSON();
  const name = (d.surveyId || 'site-survey') + (kind === 'json' ? '.json' : '.csv');
  if (kind === 'json') download(name, JSON.stringify(d, null, 2), 'application/json');
  else download(name, toCSV([flattenSurvey(d)]), 'text/csv');
  toast('Data exported as ' + name);
}

function storedSurveys() {
  try { return JSON.parse(localStorage.getItem(CONFIG.storeKey) || '[]'); } catch (e) { return []; }
}

function exportAll() {
  const all = storedSurveys();
  if (!all.length) { toast(t('No submitted surveys on this device yet.')); return; }
  download('site-surveys-' + todayISO().replace(/-/g,'') + '.csv', toCSV(all.map(flattenSurvey)), 'text/csv');
  toast(all.length + ' surveys exported.');
}

/* ============================================================
   14b. Saved surveys
   ============================================================ */
let appView = 'survey';

function mySurveys() {
  const all = storedSurveys();
  if (!state.user || state.user.role !== 'engineer') return all.slice().reverse();
  return all.filter(r => r.submittedBy && r.submittedBy.userId === state.user.userId).reverse();
}

function showView(v) {
  appView = v;
  $$('#viewTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('#surveyPanel').style.display = v === 'survey' ? '' : 'none';
  $('#minePanel').style.display   = v === 'mine' ? '' : 'none';
  $('#stepper').style.display     = v === 'survey' ? '' : 'none';
  $('.bottomnav').style.display   = v === 'survey' ? '' : 'none';
  if (v === 'mine') renderMine();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderMine() {
  const list = mySurveys();
  $('#mineCount').textContent = list.length;
  $('#mineBig').textContent = list.length;
  $('#btnMineExportAll').style.display = list.length ? '' : 'none';

  const pending = pendingSurveys().length;
  const btn = $('#btnSyncNow');
  btn.style.display = CONFIG.flowUrl ? '' : 'none';
  btn.textContent = pending ? t('Send') + ' ' + pending + ' ' + t('pending to SharePoint') : t('Everything sent');
  btn.disabled = !pending || syncing;
  $('#syncLine').style.display = CONFIG.flowUrl ? '' : 'none';
  $('#syncLine').textContent = CONFIG.flowUrl
    ? (pending ? t('Surveys send automatically. These are waiting for a connection.')
               : t('All surveys on this device have reached SharePoint.'))
    : '';

  if (!list.length) {
    $('#mineList').innerHTML = '<div class="card"><div class="cbody"><div class="empty-state">' +
      esc(t('No surveys submitted from this device yet.')) + '</div></div></div>';
    return;
  }

  $('#mineList').innerHTML = list.map(r => {
    const s = r.site || {};
    const photos = (r.photos || []).length;
    const issues = (r.issues || []).length;
    const load = r.loadTotals ? r.loadTotals.totalUpsLoadKW.toFixed(3) + ' kW' : t('Details not available');
    const sync = { synced:['ok','Sent to SharePoint'], pending:['warn','Waiting to send'],
                   local:['na','On this device'] }[r.syncStatus || 'local'] || ['na','On this device'];
    return '<div class="srow">' +
      '<div class="top"><div><b>' + esc(s.siteCode || '—') + ' · ' + esc(s.siteName || '') + '</b>' +
        '<span class="sid">' + esc(r.surveyId || '') + '</span></div>' +
        '<span class="when">' + esc(fmtDate(r.surveyDate)) +
          '<br><span class="tag ' + sync[0] + '">' + esc(t(sync[1])) + '</span></span></div>' +
      '<div class="facts">' +
        '<div><span>' + esc(t('UPS capacity')) + '</span><b>' + esc(s.upsCapacity || '—') + '</b></div>' +
        '<div><span>' + esc(t('Total load on UPS')) + '</span><b>' + esc(load) + '</b></div>' +
        '<div><span>' + esc(t('Issues')) + '</span><b>' + issues + '</b></div>' +
        '<div><span>' + esc(t('Photographs')) + '</span><b>' + photos + '</b></div>' +
      '</div>' +
      '<div class="acts">' +
        '<button type="button" class="prim" data-survey="' + esc(r.surveyId) + '" data-act="survey">' +
          esc(t('Site Survey Report')) + '</button>' +
        '<button type="button" data-survey="' + esc(r.surveyId) + '" data-act="load">' +
          esc(t('Load Calculation Report')) + '</button>' +
        '<button type="button" data-survey="' + esc(r.surveyId) + '" data-act="csv">' +
          esc(t('Export CSV')) + '</button>' +
      '</div>' +
      (r.photosDropped ? '<div class="note">' + esc(t('Photographs were not kept on this device for this survey.')) + '</div>' : '') +
      (r.syncError ? '<div class="note">' + esc(r.syncError) + '</div>' : '') +
    '</div>';
  }).join('');
}

/* ============================================================
   15. User login
   ------------------------------------------------------------
   Users come from USER_MASTER (user-master.js). This is a
   device-side check suitable for a field app that runs without a
   server. Move authenticate() to a server call when the backend
   goes live.
   ============================================================ */
function findUser(id) {
  const key = String(id || '').trim().toLowerCase();
  return USER_MASTER.find(u => String(u.userId).trim().toLowerCase() === key) || null;
}

function sessionUser(u) {
  return { userId:u.userId, name:u.name, role:u.role || 'engineer', branch:u.branch || '',
           zone:u.zone || '', designation:u.designation || '',
           managerCode:u.managerCode || '', managerName:u.managerName || '' };
}

function authenticate(id, pwd) {
  const u = findUser(id);
  if (!u) return { ok:false, msg:'No user found with that ID. Check the employee code.' };
  if (u.active === false) return { ok:false, msg:'This user is not active. Contact the regional office.' };
  if (String(u.password) !== String(pwd)) return { ok:false, msg:'Wrong password. Try again.' };
  return { ok:true, user: sessionUser(u) };
}

function saveSession(user, remember) {
  try { localStorage.setItem(CONFIG.sessionKey, JSON.stringify({ user, at:new Date().toISOString(), remember:!!remember })); } catch (e) {}
}
function readSession() { try { return JSON.parse(localStorage.getItem(CONFIG.sessionKey) || 'null'); } catch (e) { return null; } }
function clearSession() { try { localStorage.removeItem(CONFIG.sessionKey); } catch (e) {} }

function showLogin(msg) {
  $('#loginView').classList.add('show');
  $('#app').style.display = 'none';
  $('#reportView').classList.remove('show');
  showLoginMsg(msg || '');
  setTimeout(() => $('#loginUser').focus(), 120);
}
function showLoginMsg(m) {
  const el = $('#loginMsg');
  el.textContent = m; el.classList.toggle('show', !!m);
}

function stampUser() {
  if (!state.user) return;
  const n = $('#engineerName'), i = $('#engineerId');
  n.value = state.user.name;   state.fields.engineerName = state.user.name;
  i.value = state.user.userId; state.fields.engineerId  = state.user.userId;
}

function enterApp(user) {
  state.user = user;
  $('#loginView').classList.remove('show');
  $('#app').style.display = '';
  $('#userChip').textContent = user.name +
    (user.designation ? ' · ' + user.designation : '') + (user.branch ? ' · ' + user.branch : '');
  $('#userChipWrap').style.display = '';
  $('#btnExportAll').style.display = (user.role === 'engineer') ? 'none' : '';
  siteScope = 'branch';
  stateFilterValue = '';
  buildStateFilter();
  paintScope();
  stampUser();
  showView('survey');
  measureBar();
  refresh();
}

function doLogin() {
  const id = $('#loginUser').value, pwd = $('#loginPass').value;
  if (!id.trim()) { showLoginMsg(t('Enter your user ID.')); return; }
  const r = authenticate(id, pwd);
  if (!r.ok) { showLoginMsg(t(r.msg)); return; }
  saveSession(r.user, $('#loginRemember').checked);
  showLoginMsg('');
  $('#loginPass').value = '';
  enterApp(r.user);

  const d = loadDraftObject();
  if (d && d.userId && d.userId !== r.user.userId) {
    try { localStorage.removeItem(CONFIG.draftKey); } catch (e) {}
    saveEnabled = true;
    toast(t('Welcome') + ', ' + r.user.name.split(' ')[0] + '.');
  } else if (!offerDraft()) {
    saveEnabled = true;
    toast(t('Welcome') + ', ' + r.user.name.split(' ')[0] + '.');
  }
}

function doLogout() {
  if (!state.submitted && (state.site || Object.keys(state.fields).length > 2)) saveDraft(true);
  clearSession();
  state.user = null;
  $('#userChipWrap').style.display = 'none';
  showLogin('Signed out. Your draft is saved on this device.');
}

/* ============================================================
   16. Refresh + wiring
   ============================================================ */
function refresh() {
  renderReco();
  renderCompare();
  renderIssues();
  renderTracker();
  renderPhotoSummary();
  paintStepper();
  paintHeader();
  $('#mineCount').textContent = mySurveys().length;
  queueSave();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;  // not on file://
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function applyBranding() {
  $('#hdrLogo').src = LOGO_FULL;
  $('#loginLogo').src = LOGO_FULL;
  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.href = LOGO_ICON;
  document.head.appendChild(icon);
}

function wireButtons() {
  on('#btnPrev','click', () => moveStep(-1));
  on('#btnNext','click', () => { validateSection(state.step, true, false); moveStep(1); });
  on('#btnSaveDraft','click', () => saveDraft(false));
  on('#btnSubmit','click', openConfirm);
  on('#btnCancelSubmit','click', () => $('#confirmModal').classList.remove('show'));
  on('#btnConfirmSubmit','click', doSubmit);
  on('#btnViewReport','click', () => showReport());
  on('#btnBackToSurvey','click', hideReport);
  on('#btnPrint','click', () => window.print());
  $('#reportTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) showReportTab(b.dataset.tab);
  });
  $$('.langtoggle').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (b) setLang(b.dataset.lang);
  }));
  on('#btnPdf','click', () => { toast('Choose "Save as PDF" as the printer destination.'); setTimeout(() => window.print(), 700); });
  on('#btnExportCsv','click', () => exportCurrent('csv'));
  on('#btnExportJson','click', () => exportCurrent('json'));
  on('#btnExportAll','click', exportAll);
  on('#btnExportDone','click', () => exportCurrent('csv'));
  on('#btnGps','click', captureGps);
  ['#btnNewSurvey','#btnNewSurvey2'].forEach(sel =>
    on(sel,'click', () => { hideReport(); resetAll(); refresh(); toast(t('New survey started.')); }));

  $('#stepper').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b) gotoStep(b.dataset.goto);
  });

  on('#btnLogin','click', doLogin);
  on('#btnLogout','click', doLogout);
  on('#loginPass','keydown', e => { if (e.key === 'Enter') doLogin(); });
  on('#loginUser','keydown', e => { if (e.key === 'Enter') $('#loginPass').focus(); });
  on('#btnShowPass','click', () => {
    const p = $('#loginPass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#btnShowPass').textContent = t(show ? 'Hide' : 'Show');
  });

  window.addEventListener('beforeunload', () => { if (!state.submitted) saveDraft(true); });
  window.addEventListener('beforeprint', () => { if (!$('#reportBody').innerHTML.trim()) buildReport(); });
  $('#viewTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) showView(b.dataset.view);
  });
  $('#mineList').addEventListener('click', e => {
    const b = e.target.closest('[data-survey]');
    if (!b) return;
    const rec = storedSurveys().find(x => x.surveyId === b.dataset.survey);
    if (!rec) { toast(t('That survey is no longer on this device.')); return; }
    if (b.dataset.act === 'csv') {
      download((rec.surveyId || 'site-survey') + '.csv', toCSV([flattenSurvey(rec)]), 'text/csv');
      toast(t('Data exported as') + ' ' + rec.surveyId + '.csv');
    } else {
      reportTab = (b.dataset.act === 'load') ? 'load' : 'survey';
      showReport(rec);
    }
  });
  on('#btnMineExportAll','click', exportAll);
  on('#btnSyncNow','click', () => syncPending(false));
  // A phone that regains signal should catch up without being asked.
  window.addEventListener('online', () => syncPending(true));
}

function offerDraft() {
  const d = loadDraftObject();
  if (!d) return false;
  const site = d.siteCode ? (SITE_MASTER.find(x => x.siteCode === d.siteCode) || {}).siteName : null;
  $('#draftInfo').textContent =
    'Draft ' + (d.draftId || '') + ' · ' +
    (d.siteCode ? d.siteCode + (site ? ' · ' + site : '') : 'no site selected') +
    ' · saved ' + (d.savedAt ? new Date(d.savedAt).toLocaleString() : 'earlier') +
    (d.photosDropped ? ' · photographs were not saved (device storage was full)' : '');
  $('#draftModal').classList.add('show');
  $('#btnResume').onclick = () => { $('#draftModal').classList.remove('show'); saveEnabled = true; applyDraft(d); refresh(); toast(t('Draft resumed.')); };
  $('#btnStartNew').onclick = () => { $('#draftModal').classList.remove('show'); saveEnabled = true; try { localStorage.removeItem(CONFIG.draftKey); } catch (e) {} resetAll(); refresh(); };
  $('#btnDeleteDraft').onclick = () => { $('#draftModal').classList.remove('show'); saveEnabled = true; try { localStorage.removeItem(CONFIG.draftKey); } catch (e) {} resetAll(); refresh(); toast(t('Draft deleted.')); };
  return true;
}

function measureBar() {
  document.documentElement.style.setProperty('--appbar-h', $('#appbar').offsetHeight + 'px');
}

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  applyBranding();
  let saved = 'en';
  try { saved = localStorage.getItem(CONFIG.langKey) || 'en'; } catch (e) {}
  LANG = (saved === 'hi') ? 'hi' : 'en';
  document.documentElement.lang = LANG;
  $('#surveyDate').value = todayISO();
  state.fields.surveyDate = todayISO();
  state.startedAt = new Date().toISOString();
  buildStepper();
  buildLoadTable();
  buildPhotoBlocks();
  buildSiteSearch();
  bindFields();
  paintScope();
  applyLoadNA();
  applyConditionals();
  paintGps();
  PHOTO_SECTIONS.forEach(([k]) => renderPhotos(k));
  wireButtons();
  applyLang();
  measureBar();
  window.addEventListener('resize', measureBar);
  refresh();

  const sess = readSession();
  const u = sess && sess.user ? findUser(sess.user.userId) : null;
  if (u && u.active !== false) {
    enterApp(sessionUser(u));
    if (!offerDraft()) saveEnabled = true;
    if (CONFIG.flowUrl && navigator.onLine) setTimeout(() => syncPending(true), 1500);
  } else {
    clearSession();
    showLogin('');
  }
});
