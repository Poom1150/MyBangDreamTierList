import { savePoster, savePosterBands } from './poster.js?v=20261005-20';

const SLOTS = 10;
const STORAGE_KEY = 'song-top10-v1';

// Rows of the pyramid: how many ranks each row holds (first place is biggest).
const ROWS = [1, 2, 3, 4];

const $ = (selector) => document.querySelector(selector);
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const [bands, songs] = await Promise.all([
  fetch('./data/bands.json?v=20261005-20').then((r) => r.json()),
  fetch('./data/songs.json?v=20261005-20').then((r) => r.json()),
]);
const bandById = Object.fromEntries(bands.map((b) => [b.id, b]));
const songById = Object.fromEntries(songs.map((s) => [s.id, s]));
const bandCount = songs.reduce((acc, s) => ((acc[s.band] = (acc[s.band] || 0) + 1), acc), {});
// Bands that can have a "best song": every band except the catch-all Other & Collaborations folder.
const mainBands = bands.filter((b) => b.id !== 'other' && bandCount[b.id]);

// ---------- state ----------
const state = { mode: 'top10', ranks: Array(SLOTS).fill(null), bandPicks: {}, nickname: '', selected: null, band: null, query: '' };

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { saved = {}; }
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromLink = hash.get('r');
  const ids = fromLink ? fromLink.split(',') : saved.ranks || [];
  state.ranks = Array.from({ length: SLOTS }, (_, i) => (songById[ids[i]] ? ids[i] : null));

  // best-song-per-band picks: "bandId:songId,bandId:songId" in a share link, or an object when saved
  const linked = hash.get('b');
  const rawPicks = linked
    ? Object.fromEntries(linked.split(',').map((pair) => pair.split(':')))
    : saved.bandPicks || {};
  state.bandPicks = Object.fromEntries(mainBands.map((b) => [b.id, songById[rawPicks[b.id]]?.band === b.id ? rawPicks[b.id] : null]));

  state.nickname = hash.get('n') ?? saved.nickname ?? '';
  if (hash.get('m') === 'band' || (!fromLink && !hash.get('m') && saved.mode === 'band')) state.mode = 'band';
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ranks: state.ranks, bandPicks: state.bandPicks, nickname: state.nickname, mode: state.mode }));
  } catch { /* storage unavailable */ }
}

// ---------- helpers ----------
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const rankOf = (id) => state.ranks.indexOf(id);
const bandFilled = () => mainBands.filter((b) => state.bandPicks[b.id]).length;
const filled = () => (state.mode === 'band' ? bandFilled() : state.ranks.filter(Boolean).length);
const isChosen = (songId) => (state.mode === 'band'
  ? state.bandPicks[songById[songId].band] === songId
  : rankOf(songId) !== -1);

function bandMark(band, className = 'dot') {
  if (className === 'dot') {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--c', band.color);
    return dot;
  }
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

// ---------- board ----------
function placeSong(id, index) {
  const old = rankOf(id);
  if (old !== -1) state.ranks[old] = null;
  state.ranks[index] = id;
}
function swap(a, b) {
  [state.ranks[a], state.ranks[b]] = [state.ranks[b], state.ranks[a]];
}
function move(index, delta) {
  const to = index + delta;
  if (to < 0 || to >= SLOTS) return;
  swap(index, to);
  state.selected = to;
}

function renderBoard() {
  const board = $('#board');
  board.replaceChildren();
  let rank = 1;
  ROWS.forEach((count, rowIndex) => {
    const row = document.createElement('div');
    row.className = `row row-${rowIndex + 1}`;
    for (let n = 0; n < count; n++, rank++) row.append(createSlot(rank - 1));
    board.append(row);
  });
  renderList();
  renderTargetNote();
}

function createSlot(index) {
  const id = state.ranks[index];
  const song = id && songById[id];
  const slot = document.createElement('div');
  slot.className = `slot r${index + 1}${song ? ' filled' : ''}${state.selected === index ? ' selected' : ''}`;
  slot.dataset.index = index;
  slot.tabIndex = 0;
  slot.setAttribute('role', 'button');
  slot.setAttribute('aria-label', song ? `Rank ${index + 1}: ${song.title}` : `Rank ${index + 1}, empty. Select to fill.`);

  const cover = document.createElement('div');
  cover.className = 'cover';
  if (song) {
    const img = document.createElement('img');
    img.src = encodePath(song.file);
    img.alt = '';
    img.draggable = false;
    cover.append(img);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = index + 1;
    cover.append(badge);
    slot.draggable = true;
    slot.title = song.title;
  } else {
    const label = document.createElement('div');
    label.className = 'empty-label';
    label.innerHTML = `<b>${index + 1}</b>Pick a song`;
    cover.append(label);
  }
  slot.append(cover);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (song) {
    const band = bandById[song.band];
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = song.title;
    const bandLine = document.createElement('div');
    bandLine.className = 'b';
    bandLine.append(bandMark(band), band.name);
    meta.append(title, bandLine);
  }
  slot.append(meta);
  return slot;
}

function ctrlButton(symbol, label, action, index, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = symbol;
  button.title = label;
  button.setAttribute('aria-label', `${label} (rank ${index + 1})`);
  button.dataset.action = action;
  button.dataset.index = index;
  button.disabled = disabled;
  return button;
}

// Compact numbered list under the board: full titles plus move / remove controls.
function renderList() {
  const list = $('#rank-list');
  list.replaceChildren();
  state.ranks.forEach((id, index) => {
    const song = id && songById[id];
    const item = document.createElement('li');
    if (state.selected === index) item.classList.add('is-selected');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = index + 1;
    const label = document.createElement('span');
    label.className = song ? 'lt' : 'lt none';
    if (song) {
      const pickButton = document.createElement('button');
      pickButton.type = 'button';
      pickButton.dataset.action = 'select';
      pickButton.dataset.index = index;
      pickButton.textContent = song.title;
      pickButton.title = `${song.title} – ${bandById[song.band].name}`;
      label.append(pickButton);
    } else label.textContent = 'Empty';
    const ctl = document.createElement('span');
    ctl.className = 'ctl';
    if (song) {
      ctl.append(
        ctrlButton('↑', 'Move up', 'up', index, index === 0),
        ctrlButton('↓', 'Move down', 'down', index, index === SLOTS - 1),
        ctrlButton('✕', 'Remove', 'remove', index),
      );
    }
    item.append(n, label, ctl);
    list.append(item);
  });
}

function renderTargetNote() {
  const note = $('#target-note');
  const next = state.selected ?? state.ranks.indexOf(null);
  if (state.selected !== null) note.innerHTML = `Your next pick replaces <b>rank ${state.selected + 1}</b>.`;
  else if (next === -1) note.textContent = 'All 10 ranks are filled. Select a rank to replace it.';
  else note.innerHTML = `Your next pick goes to <b>rank ${next + 1}</b>.`;
}

function selectRank(index) {
  state.selected = state.selected === index ? null : index;
  renderBoard();
}

// ---------- panel (switches between the two modes) ----------
function renderPanel() {
  const band = state.mode === 'band';
  document.querySelectorAll('.mode').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  $('#board').hidden = band;
  $('#rank-list').hidden = band;
  $('#band-board').hidden = !band;
  $('#band-list').hidden = !band;
  $('#board-title').textContent = band ? 'Best song per band' : 'My ranking';
  $('#board-count').textContent = band ? `${bandFilled()} / ${mainBands.length}` : `${filled()} / ${SLOTS}`;
  $('#btn-save').disabled = filled() === 0;
  if (band) renderBandPanel();
  else renderBoard();
}

function bandIcon(band, className) {
  if (band.icon) {
    const img = document.createElement('img');
    if (className) img.className = className;
    img.src = encodePath(band.icon);
    img.alt = '';
    return img;
  }
  const mono = document.createElement('b');
  mono.textContent = band.mono;
  return mono;
}

function renderBandPanel() {
  const left = mainBands.length - bandFilled();
  $('#target-note').innerHTML = left === 0
    ? 'Every band has a pick. Tap a band to change its song.'
    : `Pick <b>one song per band</b>. Tap a band, then a song. ${left} to go.`;

  const tiles = document.createDocumentFragment();
  for (const band of mainBands) {
    const song = songById[state.bandPicks[band.id]];
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `band-tile${song ? ' picked' : ''}${state.band === band.id ? ' active' : ''}`;
    tile.dataset.band = band.id;
    tile.style.setProperty('--c', band.color);
    tile.title = song ? `${band.name}: ${song.title}` : `${band.name}: nothing picked yet`;
    tile.setAttribute('aria-label', song ? `${band.name}, picked ${song.title}. Open this band.` : `${band.name}, nothing picked. Open this band.`);
    if (song) {
      const img = document.createElement('img');
      img.className = 'cv';
      img.src = encodePath(song.file);
      img.alt = '';
      tile.append(img);
      const corner = document.createElement('span');
      corner.className = 'corner';
      corner.append(bandIcon(band));
      tile.append(corner);
    } else if (band.icon) {
      tile.append(bandIcon(band, 'empty-ico'));
    } else {
      const mono = document.createElement('span');
      mono.className = 'empty-mono';
      mono.textContent = band.mono;
      tile.append(mono);
    }
    tiles.append(tile);
  }
  $('#band-board').replaceChildren(tiles);

  const list = $('#band-list');
  list.replaceChildren();
  for (const band of mainBands) {
    const song = songById[state.bandPicks[band.id]];
    const item = document.createElement('li');
    item.style.setProperty('--c', band.color);
    if (state.band === band.id) item.classList.add('is-active');
    const ico = document.createElement('span');
    ico.className = 'bico';
    ico.append(bandIcon(band));
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open';
    open.dataset.action = 'open';
    open.dataset.band = band.id;
    open.innerHTML = '<div class="bn"></div><div class="bt"></div>';
    open.querySelector('.bn').textContent = band.name;
    const title = open.querySelector('.bt');
    title.textContent = song ? song.title : 'Not picked yet';
    if (!song) title.classList.add('none');
    const side = document.createElement('span');
    if (song) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'rm';
      remove.dataset.action = 'remove';
      remove.dataset.band = band.id;
      remove.textContent = '\u2715';
      remove.title = 'Remove';
      remove.setAttribute('aria-label', `Remove the pick for ${band.name}`);
      side.append(remove);
    }
    item.append(ico, open, side);
    list.append(item);
  }
}

function openBand(bandId) {
  state.band = bandId;
  state.query = '';
  $('#search').value = '';
  renderLibrary();
  renderPanel();
  $('#lib-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('#band-board').addEventListener('click', (event) => {
  const tile = event.target.closest('.band-tile');
  if (tile) openBand(tile.dataset.band);
});
$('#band-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'open') return openBand(button.dataset.band);
  state.bandPicks[button.dataset.band] = null;
  commit();
});

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  state.band = null;
  state.query = '';
  state.selected = null;
  $('#search').value = '';
  persist();
  renderLibrary();
  renderPanel();
}
document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));

const board = $('#board');
board.addEventListener('click', (event) => {
  const slot = event.target.closest('.slot');
  if (slot) selectRank(Number(slot.dataset.index));
});
$('#rank-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.action;
  if (action === 'select') return selectRank(index);
  if (action === 'remove') {
    state.ranks[index] = null;
    state.selected = null;
  } else move(index, action === 'up' ? -1 : 1);
  commit();
});
board.addEventListener('keydown', (event) => {
  const slot = event.target.closest('.slot');
  if (!slot || event.target !== slot) return;
  const index = Number(slot.dataset.index);
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    state.selected = state.selected === index ? null : index;
    renderBoard();
    $(`.slot[data-index="${index}"]`)?.focus();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    state.ranks[index] = null;
    commit();
  }
});

// drag & drop: slot <-> slot, and library card -> slot
let dragSource = null;
board.addEventListener('dragstart', (event) => {
  const slot = event.target.closest('.slot');
  if (!slot) return;
  dragSource = { type: 'slot', index: Number(slot.dataset.index) };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(dragSource.index));
  slot.classList.add('dragging');
});
board.addEventListener('dragend', () => {
  dragSource = null;
  board.querySelectorAll('.dragging, .drag-over').forEach((el) => el.classList.remove('dragging', 'drag-over'));
});
board.addEventListener('dragover', (event) => {
  const slot = event.target.closest('.slot');
  if (!slot || !dragSource) return;
  event.preventDefault();
  board.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  slot.classList.add('drag-over');
});
board.addEventListener('drop', (event) => {
  const slot = event.target.closest('.slot');
  if (!slot || !dragSource) return;
  event.preventDefault();
  const to = Number(slot.dataset.index);
  if (dragSource.type === 'slot') swap(dragSource.index, to);
  else placeSong(dragSource.id, to);
  state.selected = null;
  dragSource = null;
  commit();
});

// ---------- library ----------
// Library has two views: a grid of band folders, and the songs inside one folder (or search results).
function folderSongs(bandId) {
  return songs.filter((s) => s.band === bandId && !s.variant);
}

function renderFolders() {
  const wrap = $('#folders');
  const fragment = document.createDocumentFragment();
  const bandMode = state.mode === 'band';
  const entries = (bandMode ? mainBands : bands.filter((b) => bandCount[b.id])).map((b) => ({ id: b.id, band: b }));
  if (!bandMode) entries.push({ id: 'all', band: { id: 'all', name: 'All songs', color: '#2a2347', icon: '', mono: 'ALL' } });
  for (const { id, band } of entries) {
    const list = id === 'all' ? songs : songs.filter((s) => s.band === id);
    const ranked = list.filter((s) => isChosen(s.id)).length;
    const folder = document.createElement('button');
    folder.type = 'button';
    folder.className = 'folder';
    folder.dataset.band = id;
    folder.style.setProperty('--c', band.color);
    folder.setAttribute('aria-label', `${band.name} folder, ${list.length} songs${ranked ? (bandMode ? ', best song picked' : `, ${ranked} in your top 10`) : ''}`);

    const stack = document.createElement('span');
    stack.className = 'folder-stack';
    const previews = (id === 'all' ? songs.filter((s, i) => i % Math.ceil(songs.length / 3) === 0) : folderSongs(id)).slice(0, 3);
    previews.forEach((song, i) => {
      const img = document.createElement('img');
      img.src = encodePath(song.file);
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.style.setProperty('--i', i);
      stack.append(img);
    });

    const head = document.createElement('span');
    head.className = 'folder-head';
    head.append(id === 'all' ? Object.assign(document.createElement('span'), { className: 'mono', textContent: '★' }) : bandMark(band, 'icon'));
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = band.name;
    head.append(name);

    const meta = document.createElement('span');
    meta.className = 'folder-meta';
    meta.textContent = `${list.length} songs`;
    if (ranked) {
      const badge = document.createElement('b');
      badge.textContent = bandMode ? '\u2713 picked' : `${ranked} ranked`;
      meta.append(badge);
    }
    folder.append(stack, head, meta);
    fragment.append(folder);
  }
  wrap.replaceChildren(fragment);
}

function visibleSongs() {
  const query = state.query.toLowerCase();
  return songs.filter((s) => (state.band === null || state.band === 'all' || s.band === state.band)
    && (state.mode !== 'band' || s.band !== 'other')
    && (!query || `${s.title} ${s.jp} ${bandById[s.band].name}`.toLowerCase().includes(query)));
}

function renderLibrary() {
  const folderView = state.band === null && !state.query;
  $('#folders').hidden = !folderView;
  $('#grid').hidden = folderView;
  $('#crumb').hidden = folderView;
  if (folderView) {
    renderFolders();
    const folderBands = state.mode === 'band' ? mainBands : bands.filter((b) => bandCount[b.id]);
    const folderSongsTotal = state.mode === 'band' ? songs.filter((s) => s.band !== 'other').length : songs.length;
    $('#lib-count').textContent = `${folderBands.length} bands · ${folderSongsTotal} songs`;
    $('#lib-hint').textContent = state.mode === 'band'
      ? 'Open a band folder, then tap the one song you like most from that band.'
      : 'Open a band folder to see its songs, or search all songs above.';
    $('#empty').hidden = true;
    return;
  }
  const visible = visibleSongs();
  let heading = 'Search results';
  if (state.band && state.band !== 'all') heading = bandById[state.band].name;
  else if (state.band === 'all' && !state.query) heading = 'All songs';
  $('#crumb-name').textContent = state.query && state.band && state.band !== 'all' ? `${heading} › search` : heading;
  const color = state.band && state.band !== 'all' ? bandById[state.band].color : 'var(--pink)';
  $('#crumb').style.setProperty('--c', color);
  $('#lib-count').textContent = `${visible.length} songs`;
  $('#lib-hint').textContent = state.mode === 'band'
    ? "Tap a song to make it this band's best song. Tap another to replace it."
    : 'Tap a song to add it to your ranking.';
  renderGrid(visible);
}

function renderGrid(visible) {
  const grid = $('#grid');
  const fragment = document.createDocumentFragment();
  for (const song of visible) {
    const band = bandById[song.band];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = song.id;
    card.draggable = state.mode === 'top10';
    card.style.setProperty('--c', band.color);
    const img = document.createElement('img');
    img.src = encodePath(song.file);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    const title = document.createElement('div');
    title.className = 't';
    title.textContent = song.title;
    const bandLine = document.createElement('div');
    bandLine.className = 'b';
    bandLine.append(bandMark(band), band.name);
    const pick = document.createElement('span');
    pick.className = 'pick';
    card.append(img, title, bandLine, pick);
    fragment.append(card);
  }
  grid.replaceChildren(fragment);
  $('#empty').hidden = visible.length !== 0;
  updateCards();
}

function updateCards() {
  document.querySelectorAll('.card').forEach((card) => {
    const song = songById[card.dataset.id];
    const rank = rankOf(card.dataset.id);
    const chosen = isChosen(card.dataset.id);
    card.classList.toggle('chosen', chosen);
    card.querySelector('.pick').textContent = !chosen ? '' : (state.mode === 'band' ? '\u2713' : `#${rank + 1}`);
    card.setAttribute('aria-pressed', String(chosen));
    const status = !chosen ? '' : (state.mode === 'band' ? ', best song of this band' : `, ranked ${rank + 1}`);
    card.setAttribute('aria-label', `${song.title}, ${bandById[song.band].name}${status}`);
  });
}

$('#grid').addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  if (state.mode === 'band') {
    const bandId = songById[id].band;
    state.bandPicks[bandId] = state.bandPicks[bandId] === id ? null : id;
    return commit();
  }
  const current = rankOf(id);
  if (current !== -1) {
    state.ranks[current] = null;
    if (state.selected === current) state.selected = null;
    return commit();
  }
  let target = state.selected;
  if (target === null) target = state.ranks.indexOf(null);
  if (target === -1) { toast('All 10 ranks are taken. Tap a rank to replace it, or remove one first.'); return; }
  placeSong(id, target);
  state.selected = null;
  commit();
});
$('#grid').addEventListener('dragstart', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  dragSource = { type: 'song', id: card.dataset.id };
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData('text/plain', card.dataset.id);
});
$('#grid').addEventListener('dragend', () => { dragSource = null; board.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over')); });

$('#folders').addEventListener('click', (event) => {
  const folder = event.target.closest('.folder');
  if (!folder) return;
  state.band = folder.dataset.band;
  renderLibrary();
  $('#lib-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#btn-back').addEventListener('click', () => {
  state.band = null;
  state.query = '';
  $('#search').value = '';
  renderLibrary();
});
$('#search').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderLibrary(); });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !event.target.matches('input, textarea, select')) {
    event.preventDefault();
    $('#search').focus();
  }
});

// ---------- toolbar ----------
$('#nickname').value = state.nickname;
$('#nickname').addEventListener('input', (event) => { state.nickname = event.target.value; persist(); });

$('#btn-clear').addEventListener('click', () => {
  if (!filled()) return;
  const band = state.mode === 'band';
  if (!window.confirm(band ? 'Clear every band pick?' : 'Clear all 10 ranks?')) return;
  if (band) state.bandPicks = Object.fromEntries(mainBands.map((b) => [b.id, null]));
  else state.ranks = Array(SLOTS).fill(null);
  state.selected = null;
  commit();
});
$('#btn-share').addEventListener('click', async () => {
  if (!filled()) { toast('Pick at least one song first.'); return; }
  const params = new URLSearchParams();
  if (state.mode === 'band') {
    params.set('m', 'band');
    params.set('b', mainBands.filter((b) => state.bandPicks[b.id]).map((b) => `${b.id}:${state.bandPicks[b.id]}`).join(','));
  } else params.set('r', state.ranks.map((id) => id || '').join(','));
  if (state.nickname.trim()) params.set('n', state.nickname.trim());
  const link = `${location.origin}${location.pathname}#${params}`;
  try { await navigator.clipboard.writeText(link); toast('Share link copied.'); }
  catch { window.prompt('Copy this link:', link); }
});
$('#btn-save').addEventListener('click', async () => {
  const button = $('#btn-save');
  button.disabled = true;
  try {
    const nickname = state.nickname.trim();
    if (state.mode === 'band') {
      await savePosterBands({ picks: mainBands.map((band) => ({ band, song: songById[state.bandPicks[band.id]] || null })), nickname });
    } else {
      await savePoster({ ranks: state.ranks.map((id) => (id ? songById[id] : null)), bandById, nickname });
    }
  } catch (error) {
    toast(error.message || 'Could not save the image.');
  } finally {
    button.disabled = filled() === 0;
  }
});

function commit() {
  persist();
  renderPanel();
  updateCards();
  if (!$('#folders').hidden) renderFolders();
}

load();
$('#nickname').value = state.nickname;
renderLibrary();
renderPanel();
