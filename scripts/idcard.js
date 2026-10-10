import { CANVAS_SIZE, drawIdCard, prepareIdCard, saveIdCard } from './idcard-draw.js?v=20261005-21';

const V = '20261005-21';
const STORAGE_KEY = 'bandori-idcard-v1';
const PIC_KEY = 'bandori-idcard-pic-v1';

const $ = (selector) => document.querySelector(selector);
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const [bands, songs, characters] = await Promise.all([
  fetch(`./data/bands.json?v=${V}`).then((r) => r.json()),
  fetch(`./data/songs.json?v=${V}`).then((r) => r.json()),
  fetch(`./data/characters.json?v=${V}`).then((r) => r.json()),
]);
const bandById = Object.fromEntries(bands.map((b) => [b.id, b]));
const songById = Object.fromEntries(songs.map((s) => [s.id, s]));
const charById = Object.fromEntries(characters.map((c) => [c.id, c]));
const mainBands = bands.filter((b) => b.id !== 'other');
const songCount = songs.reduce((acc, s) => ((acc[s.band] = (acc[s.band] || 0) + 1), acc), {});

const STEPS = [
  { id: 'name', label: 'Name', title: 'Your name', hint: 'This is the name printed on your card.' },
  { id: 'main', label: 'My main', title: 'My favorite character (my main)', hint: 'Open a band, then tap your favorite character. You can add your own picture of them for the card.' },
  { id: 'band', label: 'My band', title: 'My favorite band', hint: 'Tap the band you like the most.' },
  { id: 'song', label: 'My song', title: 'My favorite song', hint: 'Open a band folder, then tap your favorite song.' },
  { id: 'games', label: 'Games I play', title: 'Games I play', hint: 'Tap the servers you play on. Pick Japan, Global, or both for each game.' },
];
const GAMES = [
  { id: 'gbp', name: 'BanG Dream! Girls Band Party!', short: 'Girls Band Party!' },
  { id: 'notes', name: 'BanG Dream! Our Notes', short: 'Our Notes' },
];
const SERVERS = [
  { id: 'jp', label: 'Japan' },
  { id: 'gl', label: 'Global' },
];

// ---------- state ----------
const emptyGames = () => Object.fromEntries(GAMES.map((g) => [g.id, Object.fromEntries(SERVERS.map((s) => [s.id, false]))]));
const state = {
  step: 'name', name: '', main: null, band: null, song: null, games: emptyGames(), picture: null,
  charBand: null, charQuery: '', songBand: null, songQuery: '',
};

function normalizeGames(raw) {
  const games = emptyGames();
  for (const g of GAMES) for (const s of SERVERS) games[g.id][s.id] = Boolean(raw?.[g.id]?.[s.id]);
  return games;
}
function parseGames(text) {
  const games = emptyGames();
  for (const part of (text || '').split(',')) {
    const [id, servers = ''] = part.split(':');
    if (!games[id]) continue;
    // a raw "+" in a link arrives as a space, so accept either one
    for (const s of servers.split(/[+ ]/)) if (s in games[id]) games[id][s] = true;
  }
  return games;
}
const gamesParam = () => GAMES
  .map((g) => [g.id, SERVERS.filter((s) => state.games[g.id][s.id]).map((s) => s.id)])
  .filter(([, list]) => list.length)
  .map(([id, list]) => `${id}:${list.join('+')}`)
  .join(',');

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { saved = {}; }
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromLink = ['n', 'c', 'b', 's', 'g'].some((k) => hash.has(k));
  const src = fromLink
    ? { name: hash.get('n') || '', main: hash.get('c'), band: hash.get('b'), song: hash.get('s'), games: parseGames(hash.get('g')) }
    : saved;
  state.name = typeof src.name === 'string' ? src.name.slice(0, 24) : '';
  state.main = charById[src.main] ? src.main : null;
  state.band = mainBands.some((b) => b.id === src.band) ? src.band : null;
  state.song = songById[src.song] ? src.song : null;
  state.games = normalizeGames(src.games);
  if (!fromLink && STEPS.some((s) => s.id === saved.step)) state.step = saved.step;
  try { state.picture = localStorage.getItem(PIC_KEY) || null; } catch { state.picture = null; }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: state.name, main: state.main, band: state.band, song: state.song, games: state.games, step: state.step }));
  } catch { /* storage unavailable */ }
}
function persistPicture() {
  try {
    if (state.picture) localStorage.setItem(PIC_KEY, state.picture);
    else localStorage.removeItem(PIC_KEY);
  } catch { /* too big or storage unavailable: the picture then lasts until the page is closed */ }
}

// ---------- helpers ----------
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
const initial = (name) => {
  const parts = name.split(/\s+/);
  return [...(parts.length > 1 ? parts[parts.length - 1] : parts[0])][0].toUpperCase();
};
function bandIcon(band) {
  if (band.icon) {
    const img = document.createElement('img');
    img.className = 'ico';
    img.src = encodePath(band.icon);
    img.alt = '';
    return img;
  }
  const mono = document.createElement('span');
  mono.className = 'mono';
  mono.textContent = band.mono;
  return mono;
}
function dot(band) {
  const d = document.createElement('span');
  d.className = 'dot';
  d.style.setProperty('--c', band.color);
  return d;
}
const gameSummary = () => GAMES
  .map((g) => [g, SERVERS.filter((s) => state.games[g.id][s.id]).map((s) => s.label)])
  .filter(([, list]) => list.length)
  .map(([g, list]) => `${g.short} (${list.join(', ')})`);

// ---------- what each section currently holds ----------
function summary(id) {
  if (id === 'name') return state.name.trim() || null;
  if (id === 'main') return state.main ? charById[state.main].name : null;
  if (id === 'band') return state.band ? bandById[state.band].name : null;
  if (id === 'song') return state.song ? songById[state.song].title : null;
  const list = gameSummary();
  return list.length ? list.join(' · ') : null;
}
const doneCount = () => STEPS.filter((s) => summary(s.id)).length;

// ---------- the card ----------
function cardData() {
  const ch = charById[state.main];
  const band = bandById[state.band];
  const song = songById[state.song];
  const mainBand = ch ? bandById[ch.band] : null;
  return {
    name: state.name.trim(),
    mainName: ch ? ch.name : '',
    mainBand: mainBand ? mainBand.name : '',
    band: band ? { name: band.name, color: band.color } : null,
    song: song ? { title: song.title, bandName: bandById[song.band].name, color: bandById[song.band].color } : null,
    games: GAMES.map((g) => ({ short: g.short, servers: SERVERS.filter((s) => state.games[g.id][s.id]).map((s) => s.label) })).filter((g) => g.servers.length),
    accent: (band || mainBand)?.color || '#ff3377',
    pictureUrl: state.picture,
    logoUrl: band?.logo ? encodePath(band.logo) : null,
    coverUrl: song ? encodePath(song.file) : null,
  };
}

let previewToken = 0;
async function refreshPreview() {
  const token = ++previewToken;
  const data = cardData();
  const pics = await prepareIdCard(data);
  if (token !== previewToken) return; // a newer change is already on its way
  const canvas = $('#idc-canvas');
  canvas.width = CANVAS_SIZE.width;
  canvas.height = CANVAS_SIZE.height;
  drawIdCard(canvas.getContext('2d'), data, pics);
}

// ---------- right panel: the five sections ----------
function renderSteps() {
  const list = $('#idc-steps');
  list.replaceChildren();
  STEPS.forEach((step, i) => {
    const text = summary(step.id);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `idc-step${state.step === step.id ? ' active' : ''}${text ? ' done' : ''}`;
    button.dataset.step = step.id;
    button.setAttribute('aria-current', state.step === step.id ? 'step' : 'false');
    button.innerHTML = '<span class="num"></span><span class="txt"><span class="lbl"></span><span class="val"></span></span><span class="chk" aria-hidden="true">✓</span>';
    button.querySelector('.num').textContent = i + 1;
    button.querySelector('.lbl').textContent = step.label;
    const val = button.querySelector('.val');
    val.textContent = text || 'Not filled yet';
    if (!text) val.classList.add('none');
    item.append(button);
    list.append(item);
  });
  $('#idc-count').textContent = `${doneCount()} / ${STEPS.length}`;
  $('#btn-save').disabled = doneCount() === 0;
}
$('#idc-steps').addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (button) showStep(button.dataset.step, true);
});

// ---------- left panel: step 2, characters ----------
function renderChars() {
  const q = state.charQuery.trim().toLowerCase();
  const folderView = state.charBand === null && !q;
  $('#char-folders').hidden = !folderView;
  $('#char-grid').hidden = folderView;
  $('#char-crumb').hidden = folderView;
  const picked = charById[state.main];

  if (folderView) {
    $('#char-count').textContent = `${characters.length} characters in ${mainBands.length} bands`;
    $('#char-empty').hidden = true;
    const fragment = document.createDocumentFragment();
    const entries = [...mainBands.map((b) => ({ id: b.id, band: b, list: characters.filter((c) => c.band === b.id) })), {
      id: 'all', band: { id: 'all', name: 'All characters', color: '#2a2347', icon: '', mono: '★' }, list: characters,
    }];
    for (const { id, band, list } of entries) {
      if (!list.length) continue;
      const folder = document.createElement('button');
      folder.type = 'button';
      folder.className = 'folder';
      folder.dataset.band = id;
      folder.style.setProperty('--c', band.color);
      const pickedHere = picked && (id === 'all' || picked.band === id);
      folder.setAttribute('aria-label', `${band.name}, ${list.length} characters${pickedHere ? ', your main is here' : ''}`);
      const stack = document.createElement('span');
      stack.className = 'folder-stack mono';
      list.slice(0, 3).forEach((c) => {
        const m = document.createElement('span');
        m.textContent = initial(c.name);
        stack.append(m);
      });
      const head = document.createElement('span');
      head.className = 'folder-head';
      if (id === 'all') {
        const star = document.createElement('span');
        star.className = 'mono';
        star.textContent = '★';
        head.append(star);
      } else head.append(bandIcon(band));
      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = band.name;
      head.append(name);
      const meta = document.createElement('span');
      meta.className = 'folder-meta';
      meta.textContent = `${list.length} characters`;
      if (pickedHere) {
        const badge = document.createElement('b');
        badge.textContent = '✓ picked';
        meta.append(badge);
      }
      folder.append(stack, head, meta);
      fragment.append(folder);
    }
    $('#char-folders').replaceChildren(fragment);
    return;
  }

  const list = characters.filter((c) => (state.charBand === null || state.charBand === 'all' || c.band === state.charBand)
    && (!q || `${c.name} ${bandById[c.band].name}`.toLowerCase().includes(q)));
  let heading = 'Search results';
  if (state.charBand && state.charBand !== 'all') heading = bandById[state.charBand].name;
  else if (state.charBand === 'all' && !q) heading = 'All characters';
  $('#char-crumb-name').textContent = heading;
  $('#char-crumb').style.setProperty('--c', state.charBand && state.charBand !== 'all' ? bandById[state.charBand].color : 'var(--pink)');
  $('#char-count').textContent = `${list.length} characters`;
  $('#char-empty').hidden = list.length !== 0;
  const fragment = document.createDocumentFragment();
  for (const c of list) {
    const band = bandById[c.band];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `char-card${state.main === c.id ? ' chosen' : ''}`;
    card.dataset.id = c.id;
    card.style.setProperty('--c', band.color);
    card.setAttribute('aria-pressed', String(state.main === c.id));
    card.innerHTML = '<span class="avatar"></span><span class="nm"></span><span class="bd"></span><span class="tick" aria-hidden="true">✓</span>';
    card.querySelector('.avatar').textContent = initial(c.name);
    card.querySelector('.nm').textContent = c.name;
    card.querySelector('.bd').append(dot(band), band.name);
    fragment.append(card);
  }
  $('#char-grid').replaceChildren(fragment);
}
$('#char-folders').addEventListener('click', (event) => {
  const folder = event.target.closest('.folder');
  if (!folder) return;
  state.charBand = folder.dataset.band;
  renderChars();
});
$('#char-back').addEventListener('click', () => {
  state.charBand = null;
  state.charQuery = '';
  $('#char-search').value = '';
  renderChars();
});
$('#char-search').addEventListener('input', (event) => { state.charQuery = event.target.value; renderChars(); });
$('#char-grid').addEventListener('click', (event) => {
  const card = event.target.closest('.char-card');
  if (!card) return;
  state.main = state.main === card.dataset.id ? null : card.dataset.id;
  commit();
});

// picture upload (stays on this device)
function renderPictureNote() {
  const has = Boolean(state.picture);
  const ch = charById[state.main];
  $('#pic-note').textContent = has
    ? 'Your picture is on the card. It stays on this device and is never uploaded.'
    : `Shows a star mascot until you add your own picture${ch ? ` of ${ch.name}` : ' of your main'}. A PNG with a transparent background looks best, with no frame.`;
  $('#pic-remove').hidden = !has;
}
async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / bitmap.height, 700 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/webp', 0.92); // browsers without WebP encoding fall back to PNG
}
$('#pic-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  try {
    state.picture = await downscale(file);
    persistPicture();
    commit();
    toast('Picture added to your card.');
  } catch {
    toast('Could not read that picture.');
  }
});
$('#pic-remove').addEventListener('click', () => {
  state.picture = null;
  persistPicture();
  commit();
});

// ---------- left panel: step 3, band ----------
function renderBandPick() {
  const fragment = document.createDocumentFragment();
  for (const band of mainBands) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `band-card${state.band === band.id ? ' chosen' : ''}`;
    button.dataset.band = band.id;
    button.style.setProperty('--c', band.color);
    button.setAttribute('aria-pressed', String(state.band === band.id));
    if (band.logo) {
      const img = document.createElement('img');
      img.src = encodePath(band.logo);
      img.alt = '';
      button.append(img);
    }
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = band.name;
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.textContent = '✓';
    button.append(nm, tick);
    fragment.append(button);
  }
  $('#band-pick').replaceChildren(fragment);
}
$('#band-pick').addEventListener('click', (event) => {
  const button = event.target.closest('.band-card');
  if (!button) return;
  state.band = state.band === button.dataset.band ? null : button.dataset.band;
  commit();
});

// ---------- left panel: step 4, song ----------
function renderSongs() {
  const q = state.songQuery.trim().toLowerCase();
  const folderView = state.songBand === null && !q;
  $('#song-folders').hidden = !folderView;
  $('#song-grid').hidden = folderView;
  $('#song-crumb').hidden = folderView;
  const picked = songById[state.song];

  if (folderView) {
    $('#song-count').textContent = `${songs.length} songs`;
    $('#song-empty').hidden = true;
    const fragment = document.createDocumentFragment();
    const entries = [...bands.filter((b) => songCount[b.id]).map((b) => ({ id: b.id, band: b })), {
      id: 'all', band: { id: 'all', name: 'All songs', color: '#2a2347', icon: '', mono: '★' },
    }];
    for (const { id, band } of entries) {
      const list = id === 'all' ? songs : songs.filter((s) => s.band === id);
      const folder = document.createElement('button');
      folder.type = 'button';
      folder.className = 'folder';
      folder.dataset.band = id;
      folder.style.setProperty('--c', band.color);
      const pickedHere = picked && (id === 'all' || picked.band === id);
      folder.setAttribute('aria-label', `${band.name}, ${list.length} songs${pickedHere ? ', your song is here' : ''}`);
      const stack = document.createElement('span');
      stack.className = 'folder-stack';
      const previews = (id === 'all' ? songs.filter((s, i) => i % Math.ceil(songs.length / 3) === 0) : list.filter((s) => !s.variant)).slice(0, 3);
      for (const song of previews) {
        const img = document.createElement('img');
        img.src = encodePath(song.file);
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        stack.append(img);
      }
      const head = document.createElement('span');
      head.className = 'folder-head';
      if (id === 'all') {
        const star = document.createElement('span');
        star.className = 'mono';
        star.textContent = '★';
        head.append(star);
      } else head.append(bandIcon(band));
      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = band.name;
      head.append(name);
      const meta = document.createElement('span');
      meta.className = 'folder-meta';
      meta.textContent = `${list.length} songs`;
      if (pickedHere) {
        const badge = document.createElement('b');
        badge.textContent = '✓ picked';
        meta.append(badge);
      }
      folder.append(stack, head, meta);
      fragment.append(folder);
    }
    $('#song-folders').replaceChildren(fragment);
    return;
  }

  const list = songs.filter((s) => (state.songBand === null || state.songBand === 'all' || s.band === state.songBand)
    && (!q || `${s.title} ${s.jp} ${bandById[s.band].name}`.toLowerCase().includes(q)));
  let heading = 'Search results';
  if (state.songBand && state.songBand !== 'all') heading = bandById[state.songBand].name;
  else if (state.songBand === 'all' && !q) heading = 'All songs';
  $('#song-crumb-name').textContent = heading;
  $('#song-crumb').style.setProperty('--c', state.songBand && state.songBand !== 'all' ? bandById[state.songBand].color : 'var(--pink)');
  $('#song-count').textContent = `${list.length} songs`;
  $('#song-empty').hidden = list.length !== 0;
  const fragment = document.createDocumentFragment();
  for (const song of list) {
    const band = bandById[song.band];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card${state.song === song.id ? ' chosen' : ''}`;
    card.dataset.id = song.id;
    card.style.setProperty('--c', band.color);
    card.setAttribute('aria-pressed', String(state.song === song.id));
    const img = document.createElement('img');
    img.src = encodePath(song.file);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = song.title;
    const bandLine = document.createElement('div');
    bandLine.className = 'b';
    bandLine.append(dot(band), band.name);
    const pick = document.createElement('span');
    pick.className = 'pick';
    pick.textContent = state.song === song.id ? '✓' : '';
    card.append(img, title, bandLine, pick);
    fragment.append(card);
  }
  $('#song-grid').replaceChildren(fragment);
}
$('#song-folders').addEventListener('click', (event) => {
  const folder = event.target.closest('.folder');
  if (!folder) return;
  state.songBand = folder.dataset.band;
  renderSongs();
});
$('#song-back').addEventListener('click', () => {
  state.songBand = null;
  state.songQuery = '';
  $('#song-search').value = '';
  renderSongs();
});
$('#song-search').addEventListener('input', (event) => { state.songQuery = event.target.value; renderSongs(); });
$('#song-grid').addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  state.song = state.song === card.dataset.id ? null : card.dataset.id;
  commit();
});

// ---------- left panel: step 5, games ----------
function renderGames() {
  const fragment = document.createDocumentFragment();
  for (const game of GAMES) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const title = document.createElement('h3');
    title.textContent = game.name;
    const note = document.createElement('p');
    note.textContent = 'Which server do you play on?';
    const row = document.createElement('div');
    row.className = 'srv-row';
    for (const server of SERVERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'srv';
      button.dataset.game = game.id;
      button.dataset.server = server.id;
      button.textContent = server.label;
      button.setAttribute('aria-pressed', String(state.games[game.id][server.id]));
      row.append(button);
    }
    card.append(title, note, row);
    fragment.append(card);
  }
  $('#game-list').replaceChildren(fragment);
}
$('#game-list').addEventListener('click', (event) => {
  const button = event.target.closest('.srv');
  if (!button) return;
  const { game, server } = button.dataset;
  state.games[game][server] = !state.games[game][server];
  commit();
});

// ---------- name ----------
$('#idc-name').addEventListener('input', (event) => {
  state.name = event.target.value;
  $('#idc-name-count').textContent = `${state.name.length} / 24`;
  persist();
  renderSteps();
  refreshPreview();
});

// ---------- steps ----------
function renderCurrent() {
  if (state.step === 'main') { renderChars(); renderPictureNote(); }
  else if (state.step === 'band') renderBandPick();
  else if (state.step === 'song') renderSongs();
  else if (state.step === 'games') renderGames();
}
function showStep(id, scroll = false) {
  state.step = id;
  const index = STEPS.findIndex((s) => s.id === id);
  STEPS.forEach((s) => { $(`#step-${s.id}`).hidden = s.id !== id; });
  $('#step-title').firstChild.textContent = `${STEPS[index].title} `;
  $('#step-count').textContent = `Step ${index + 1} of ${STEPS.length}`;
  $('#step-hint').textContent = STEPS[index].hint;
  $('#btn-prev').disabled = index === 0;
  $('#btn-next').disabled = index === STEPS.length - 1;
  persist();
  renderCurrent();
  renderSteps();
  if (scroll) $('#step-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#btn-prev').addEventListener('click', () => showStep(STEPS[Math.max(0, STEPS.findIndex((s) => s.id === state.step) - 1)].id, true));
$('#btn-next').addEventListener('click', () => showStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex((s) => s.id === state.step) + 1)].id, true));

// ---------- bigger preview ----------
const zoom = $('#idc-zoom');
function openZoom() {
  $('#idc-zoom-img').src = $('#idc-canvas').toDataURL('image/png');
  zoom.showModal();
}
$('#idc-canvas').addEventListener('click', openZoom);
$('#idc-canvas').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openZoom(); }
});
$('#idc-zoom-close').addEventListener('click', () => zoom.close());
zoom.addEventListener('click', (event) => { if (event.target === zoom) zoom.close(); });

// ---------- toolbar ----------
$('#btn-save').addEventListener('click', async () => {
  const button = $('#btn-save');
  button.disabled = true;
  try {
    await saveIdCard(cardData());
  } catch (error) {
    toast(error.message || 'Could not save the image.');
  } finally {
    button.disabled = doneCount() === 0;
  }
});
$('#btn-share').addEventListener('click', async () => {
  if (!doneCount()) { toast('Fill in at least one section first.'); return; }
  const params = new URLSearchParams();
  if (state.name.trim()) params.set('n', state.name.trim());
  if (state.main) params.set('c', state.main);
  if (state.band) params.set('b', state.band);
  if (state.song) params.set('s', state.song);
  if (gamesParam()) params.set('g', gamesParam());
  const link = `${location.origin}${location.pathname}#${params}`;
  try { await navigator.clipboard.writeText(link); toast('Share link copied.'); }
  catch { window.prompt('Copy this link:', link); }
});
$('#btn-clear').addEventListener('click', () => {
  if (!doneCount() && !state.picture) return;
  if (!window.confirm('Clear everything on your ID card?')) return;
  Object.assign(state, { name: '', main: null, band: null, song: null, games: emptyGames(), picture: null, charBand: null, charQuery: '', songBand: null, songQuery: '' });
  $('#idc-name').value = '';
  $('#idc-name-count').textContent = '0 / 24';
  $('#char-search').value = '';
  $('#song-search').value = '';
  persistPicture();
  commit();
});

function commit() {
  persist();
  renderSteps();
  renderCurrent();
  refreshPreview();
}

load();
$('#idc-name').value = state.name;
$('#idc-name-count').textContent = `${state.name.length} / 24`;
showStep(state.step);
refreshPreview();
