import { savePoster } from './poster.js?v=20261005-3';

const SLOTS = 10;
const STORAGE_KEY = 'song-top10-v1';

// Rows of the pyramid: how many ranks each row holds (first place is biggest).
const ROWS = [1, 2, 3, 4];

const $ = (selector) => document.querySelector(selector);
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const [bands, songs] = await Promise.all([
  fetch('./data/bands.json?v=20261005-3').then((r) => r.json()),
  fetch('./data/songs.json?v=20261005-3').then((r) => r.json()),
]);
const bandById = Object.fromEntries(bands.map((b) => [b.id, b]));
const songById = Object.fromEntries(songs.map((s) => [s.id, s]));
const bandCount = songs.reduce((acc, s) => ((acc[s.band] = (acc[s.band] || 0) + 1), acc), {});

// ---------- state ----------
const state = { ranks: Array(SLOTS).fill(null), nickname: '', selected: null, band: 'all', query: '' };

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { saved = {}; }
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromLink = hash.get('r');
  const ids = fromLink ? fromLink.split(',') : saved.ranks || [];
  state.ranks = Array.from({ length: SLOTS }, (_, i) => (songById[ids[i]] ? ids[i] : null));
  state.nickname = hash.get('n') ?? saved.nickname ?? '';
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ranks: state.ranks, nickname: state.nickname })); } catch { /* storage unavailable */ }
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
const filled = () => state.ranks.filter(Boolean).length;

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
  $('#board-count').textContent = `${filled()} / ${SLOTS}`;
  $('#btn-save').disabled = filled() === 0;
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
function renderChips() {
  const chips = $('#chips');
  chips.replaceChildren();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip';
  all.dataset.band = 'all';
  all.setAttribute('aria-pressed', String(state.band === 'all'));
  all.innerHTML = `All <em>${songs.length}</em>`;
  chips.append(all);
  for (const band of bands) {
    if (!bandCount[band.id]) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.band = band.id;
    chip.style.setProperty('--c', band.color);
    chip.setAttribute('aria-pressed', String(state.band === band.id));
    chip.append(bandMark(band, 'icon'), band.name);
    const count = document.createElement('em');
    count.textContent = bandCount[band.id];
    chip.append(count);
    chips.append(chip);
  }
}

function renderGrid() {
  const query = state.query.toLowerCase();
  const visible = songs.filter((s) => (state.band === 'all' || s.band === state.band)
    && (!query || `${s.title} ${s.jp} ${bandById[s.band].name}`.toLowerCase().includes(query)));
  const grid = $('#grid');
  const fragment = document.createDocumentFragment();
  for (const song of visible) {
    const band = bandById[song.band];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = song.id;
    card.draggable = true;
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
  $('#lib-count').textContent = `${visible.length} songs`;
  $('#empty').hidden = visible.length !== 0;
  updateCards();
}

function updateCards() {
  document.querySelectorAll('.card').forEach((card) => {
    const rank = rankOf(card.dataset.id);
    card.classList.toggle('chosen', rank !== -1);
    card.querySelector('.pick').textContent = rank === -1 ? '' : `#${rank + 1}`;
    const song = songById[card.dataset.id];
    card.setAttribute('aria-pressed', String(rank !== -1));
    card.setAttribute('aria-label', `${song.title}, ${bandById[song.band].name}${rank !== -1 ? `, ranked ${rank + 1}` : ''}`);
  });
}

$('#grid').addEventListener('click', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
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

$('#chips').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  state.band = chip.dataset.band;
  renderChips();
  renderGrid();
});
$('#search').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderGrid(); });
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
  if (!window.confirm('Clear all 10 ranks?')) return;
  state.ranks = Array(SLOTS).fill(null);
  state.selected = null;
  commit();
});
$('#btn-share').addEventListener('click', async () => {
  if (!filled()) { toast('Pick at least one song first.'); return; }
  const params = new URLSearchParams({ r: state.ranks.map((id) => id || '').join(',') });
  if (state.nickname.trim()) params.set('n', state.nickname.trim());
  const link = `${location.origin}${location.pathname}#${params}`;
  try { await navigator.clipboard.writeText(link); toast('Share link copied.'); }
  catch { window.prompt('Copy this link:', link); }
});
$('#btn-save').addEventListener('click', async () => {
  const button = $('#btn-save');
  button.disabled = true;
  try {
    await savePoster({ ranks: state.ranks.map((id) => (id ? songById[id] : null)), bandById, nickname: state.nickname.trim() });
  } catch (error) {
    toast(error.message || 'Could not save the image.');
  } finally {
    button.disabled = filled() === 0;
  }
});

function commit() {
  persist();
  renderBoard();
  updateCards();
}

load();
$('#nickname').value = state.nickname;
renderChips();
renderGrid();
renderBoard();
