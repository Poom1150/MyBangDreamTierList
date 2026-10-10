// Draws the fan ID card on a canvas. The same drawing code makes the live preview and the saved PNG.
const W = 1280;
const H = 836;
const CARD = { x: 40, y: 40, w: 1200, h: 756, r: 36 };
const FONT = '"Space Grotesk", "Noto Sans JP", system-ui, sans-serif';
const INK = '#2a2347';
const MUTED = '#7a7298';
const PINK = '#ff3377';
const STRIPE = ['#ff3377', '#e23344', '#ffcc11', '#33ddaa', '#22cccc', '#33aaff', '#3344aa'];
// the site's star, tilted to the left (viewBox 0 0 32 32)
const STAR = '13.37,3.64 19.00,10.78 27.82,8.61 22.77,16.17 27.56,23.89 18.81,21.43 12.94,28.36 12.59,19.28 4.18,15.84 12.70,12.70'
  .split(' ').map((p) => p.split(',').map(Number));

export const CANVAS_SIZE = { width: W, height: H };

// ---------- helpers ----------
const images = new Map();
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!images.has(src)) {
    images.set(src, new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    }));
  }
  return images.get(src);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + amount)))));
  return `rgb(${r},${g},${b})`;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

// Picks the biggest font size (down to `min`) at which the text fits on one line.
function fitFont(ctx, text, maxWidth, size, min, weight = 700) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

// Wraps on spaces (or per character when there are none, e.g. Japanese) into at most `maxLines` lines.
function wrap(ctx, text, maxWidth, maxLines) {
  const tokens = /\s/.test(text) ? text.split(/\s+/) : [...text];
  const joiner = /\s/.test(text) ? ' ' : '';
  const lines = [''];
  for (const token of tokens) {
    const test = lines[lines.length - 1] ? lines[lines.length - 1] + joiner + token : token;
    if (ctx.measureText(test).width <= maxWidth || !lines[lines.length - 1]) lines[lines.length - 1] = test;
    else if (lines.length < maxLines) lines.push(token);
    else { lines[lines.length - 1] = test; break; }
  }
  return lines.map((line, i) => (i === lines.length - 1 ? ellipsize(ctx, line, maxWidth) : line));
}

function label(ctx, text, x, y) {
  ctx.font = `700 17px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const spaced = text.toUpperCase().split('').join(' ');
  ctx.fillText(spaced, x, y);
}

function placeholder(ctx, text, x, y, size = 30) {
  ctx.font = `500 ${size}px ${FONT}`;
  ctx.fillStyle = '#c3aab9';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

// ---------- the original star mascot (shown until you add your own picture) ----------
function drawMascot(ctx, cx, bottom, size, accent) {
  const k = size / 24;
  const cy = bottom - size * 0.55;
  const pts = STAR.map(([x, y]) => [cx + (x - 16) * k, cy + (y - 16.2) * k]);
  ctx.save();
  ctx.fillStyle = 'rgba(42, 35, 71, 0.12)';
  ctx.beginPath();
  ctx.ellipse(cx, bottom + 2, size * 0.34, size * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.1;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = size * 0.03;
  ctx.strokeStyle = accent;
  ctx.stroke();
  // face
  const fx = cx - size * 0.02;
  const fy = cy + size * 0.03;
  ctx.fillStyle = INK;
  for (const dx of [-0.13, 0.13]) {
    ctx.beginPath();
    ctx.ellipse(fx + dx * size, fy - size * 0.02, size * 0.032, size * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (const dx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.ellipse(fx + dx * size, fy + size * 0.07, size * 0.045, size * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.018;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(fx, fy + size * 0.045, size * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// ---------- the card ----------
function drawBackdrop(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fff0f6');
  bg.addColorStop(1, '#fff8fb');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const l = ctx.createRadialGradient(0, 0, 0, 0, 0, 620);
  l.addColorStop(0, 'rgba(255, 51, 119, 0.16)');
  l.addColorStop(1, 'rgba(255, 51, 119, 0)');
  ctx.fillStyle = l;
  ctx.fillRect(0, 0, W, 620);
  const r = ctx.createRadialGradient(W, 0, 0, W, 0, 620);
  r.addColorStop(0, 'rgba(51, 170, 255, 0.18)');
  r.addColorStop(1, 'rgba(51, 170, 255, 0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, 620);
}

function drawGames(ctx, games, x, y, maxW, accent) {
  if (!games.length) { placeholder(ctx, 'Pick your games', x, y + 32, 26); return; }
  let px = x;
  let py = y;
  const h = 46;
  for (const game of games) {
    ctx.font = `700 21px ${FONT}`;
    const nameW = ctx.measureText(game.short).width;
    ctx.font = `700 15px ${FONT}`;
    const chips = game.servers.map((s) => ({ s, w: ctx.measureText(s).width + 20 }));
    const pillW = 18 + nameW + 12 + chips.reduce((sum, c) => sum + c.w + 6, 0) + 8;
    if (px > x && px + pillW > x + maxW) { px = x; py += h + 8; }
    ctx.fillStyle = rgba(accent, 0.12);
    roundRect(ctx, px, py, pillW, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `700 21px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.short, px + 18, py + h / 2 + 1);
    let cx = px + 18 + nameW + 12;
    for (const chip of chips) {
      ctx.fillStyle = accent;
      roundRect(ctx, cx, py + 8, chip.w, h - 16, (h - 16) / 2);
      ctx.fill();
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = luminance(accent) > 0.62 ? INK : '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(chip.s, cx + chip.w / 2, py + h / 2 + 1);
      cx += chip.w + 6;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    px += pillW + 10;
  }
}

/**
 * data: { name, mainName, mainBand, band: {name, color}, song: {title, bandName, color}, games: [{short, servers[]}], accent }
 * pics: { picture, logo, cover }  (already-loaded images or null)
 */
export function drawIdCard(ctx, data, pics) {
  const { x: cx0, y: cy0, w, h } = CARD;
  const accent = data.accent || PINK;
  drawBackdrop(ctx);

  // soft shadow under the card
  ctx.save();
  ctx.shadowColor = 'rgba(42, 35, 71, 0.22)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx0, cy0, w, h, CARD.r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, cx0, cy0, w, h, CARD.r);
  ctx.clip();

  // card body
  ctx.fillStyle = rgba(accent, 0.05);
  ctx.fillRect(cx0, cy0, w, h);

  // header band
  const header = ctx.createLinearGradient(cx0, 0, cx0 + w, 0);
  header.addColorStop(0, accent);
  header.addColorStop(1, shade(accent, -0.22));
  ctx.fillStyle = header;
  ctx.fillRect(cx0, cy0, w, 116);
  STRIPE.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(cx0 + (w / STRIPE.length) * i, cy0 + 116, w / STRIPE.length + 1, 8);
  });
  const onAccent = luminance(accent) > 0.62 ? INK : '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = onAccent;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('BANG DREAM! FAN ID CARD', cx0 + 500, cy0 + 72);
  ctx.font = `500 17px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText('UNOFFICIAL · MADE BY A FAN', cx0 + 502, cy0 + 98);
  ctx.globalAlpha = 1;
  // small star emblem on the right of the header
  ctx.save();
  ctx.translate(cx0 + w - 96, cy0 + 20);
  ctx.scale(2.6, 2.6);
  ctx.beginPath();
  STAR.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = onAccent;
  ctx.strokeStyle = onAccent;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // footer strip with a decorative bar pattern
  ctx.fillStyle = rgba(accent, 0.1);
  ctx.fillRect(cx0, cy0 + h - 54, w, 54);
  let seed = hash(`${data.name || ''}|${data.mainName || ''}|${data.song?.title || ''}`);
  ctx.fillStyle = INK;
  let bx = cx0 + 500;
  for (let i = 0; i < 46; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const bw = 2 + (seed >> 16) % 5;
    ctx.fillRect(bx, cy0 + h - 40, bw, 26);
    bx += bw + 3;
  }
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('FAN ID · NOT A REAL ID', cx0 + w - 40, cy0 + h - 22);
  ctx.textAlign = 'left';

  // soft shape behind the picture (not a frame)
  ctx.fillStyle = rgba(accent, 0.17);
  ctx.beginPath();
  ctx.arc(cx0 + 250, cy0 + 480, 235, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(accent, 0.1);
  ctx.beginPath();
  ctx.arc(cx0 + 250, cy0 + 480, 292, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- fields (right side) ----
  const fx = cx0 + 500;
  const fw = w - 500 - 48;

  label(ctx, 'Name', fx, cy0 + 176);
  if (data.name) {
    const size = fitFont(ctx, data.name, fw, 70, 34);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(ellipsize(ctx, data.name, fw), fx, cy0 + 176 + 12 + size * 0.9);
  } else {
    placeholder(ctx, 'Your name', fx, cy0 + 238, 52);
  }
  ctx.fillStyle = accent;
  roundRect(ctx, fx, cy0 + 262, 120, 6, 3);
  ctx.fill();

  const colW = (fw - 30) / 2;
  label(ctx, 'My main', fx, cy0 + 312);
  if (data.mainName) {
    const size = fitFont(ctx, data.mainName, colW, 32, 20);
    ctx.fillStyle = INK;
    ctx.fillText(ellipsize(ctx, data.mainName, colW), fx, cy0 + 312 + 14 + size * 0.95);
    if (data.mainBand) {
      ctx.font = `500 19px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(ellipsize(ctx, data.mainBand, colW), fx, cy0 + 392);
    }
  } else placeholder(ctx, 'Pick a character', fx, cy0 + 352, 26);

  const bx2 = fx + colW + 30;
  label(ctx, 'My band', bx2, cy0 + 312);
  if (data.band) {
    if (pics.logo) {
      const s = Math.min(colW / pics.logo.width, 76 / pics.logo.height);
      ctx.drawImage(pics.logo, bx2, cy0 + 326, pics.logo.width * s, pics.logo.height * s);
    } else {
      const size = fitFont(ctx, data.band.name, colW, 32, 20);
      ctx.fillStyle = data.band.color;
      ctx.fillText(ellipsize(ctx, data.band.name, colW), bx2, cy0 + 312 + 14 + size * 0.95);
    }
  } else placeholder(ctx, 'Pick a band', bx2, cy0 + 352, 26);

  label(ctx, 'My song', fx, cy0 + 432);
  const coverSize = 104;
  if (data.song) {
    ctx.save();
    roundRect(ctx, fx, cy0 + 446, coverSize, coverSize, 16);
    ctx.clip();
    if (pics.cover) {
      const side = Math.min(pics.cover.width, pics.cover.height);
      ctx.drawImage(pics.cover, (pics.cover.width - side) / 2, (pics.cover.height - side) / 2, side, side, fx, cy0 + 446, coverSize, coverSize);
    } else {
      ctx.fillStyle = rgba(accent, 0.2);
      ctx.fillRect(fx, cy0 + 446, coverSize, coverSize);
    }
    ctx.restore();
    ctx.strokeStyle = data.song.color || accent;
    ctx.lineWidth = 3;
    roundRect(ctx, fx, cy0 + 446, coverSize, coverSize, 16);
    ctx.stroke();
    const tx = fx + coverSize + 20;
    const tw = fw - coverSize - 20;
    ctx.font = `700 31px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    const lines = wrap(ctx, data.song.title, tw, 2);
    lines.forEach((line, i) => ctx.fillText(line, tx, cy0 + 488 + i * 36));
    ctx.font = `500 19px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(ellipsize(ctx, data.song.bandName, tw), tx, cy0 + 488 + lines.length * 36 + 2);
  } else {
    ctx.strokeStyle = '#e8bfd2';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    roundRect(ctx, fx, cy0 + 446, coverSize, coverSize, 16);
    ctx.stroke();
    ctx.setLineDash([]);
    placeholder(ctx, 'Pick a song', fx + coverSize + 20, cy0 + 508, 26);
  }

  label(ctx, 'Games I play', fx, cy0 + 594);
  drawGames(ctx, data.games, fx, cy0 + 608, fw, accent);

  // ---- picture: sits on top of everything on the left, with no frame ----
  const boxW = 440;
  const boxH = 650;
  const baseX = cx0 + 250;
  const baseY = cy0 + h - 20;
  ctx.save();
  roundRect(ctx, cx0, cy0, w, h, CARD.r);
  ctx.clip();
  if (pics.picture) {
    const s = Math.min(boxW / pics.picture.width, boxH / pics.picture.height);
    const pw = pics.picture.width * s;
    const ph = pics.picture.height * s;
    ctx.drawImage(pics.picture, baseX - pw / 2, baseY - ph, pw, ph);
  } else {
    drawMascot(ctx, baseX, baseY, 380, accent);
  }
  ctx.restore();
}

// ---------- loading + export ----------
// Waits for the web fonts, but never longer than 2.5 s: a slow font host must not stall the preview or the save button.
async function loadFonts(data) {
  if (!document.fonts?.load) return;
  const text = `${data.name || ''}${data.mainName || ''}${data.song?.title || ''}`;
  const loading = Promise.allSettled([
    document.fonts.load(`700 30px "Space Grotesk"`),
    document.fonts.load(`500 20px "Space Grotesk"`),
    ...(text ? [document.fonts.load(`700 30px "Noto Sans JP"`, text), document.fonts.load(`500 20px "Noto Sans JP"`, text)] : []),
  ]);
  await Promise.race([loading, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

// Loads the pictures and fonts a card needs. Drawing itself (drawIdCard) is then synchronous.
export async function prepareIdCard(data) {
  const [picture, logo, cover] = await Promise.all([loadImage(data.pictureUrl), loadImage(data.logoUrl), loadImage(data.coverUrl)]);
  await loadFonts(data);
  return { picture, logo, cover };
}

export async function saveIdCard(data) {
  const pics = await prepareIdCard(data);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawIdCard(canvas.getContext('2d'), data, pics);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export is not available in this browser, or the page was opened as a local file. Try the hosted page.');
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'my-bang-dream-id-card.png' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
