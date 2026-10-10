// Draws the fan ID card on a canvas. The same drawing code makes the live preview and the saved PNG.
// The card is drawn on a 1200 x 756 grid (BASE) and shrunk to SCALE; the character picture is NOT shrunk
// (it keeps the size it had on the bigger card), so it fills more of the smaller card.
const BASE = { w: 1200, h: 756 };
const SCALE = 0.745; // the 755 x 505 card scaled up to a picture 1000 px wide (same proportions)
const MARGIN = 53;
const INFO_X = 548; // where the information section starts, in card units (the picture column ends at 500)
const CARD = { x: MARGIN, y: MARGIN, w: Math.round(BASE.w * SCALE), h: Math.round(BASE.h * SCALE), r: 41 };
const W = CARD.w + MARGIN * 2;
const H = CARD.h + MARGIN * 2;
const FONT = '"Space Grotesk", "Noto Sans JP", system-ui, sans-serif';
const INK = '#2a2347';
const MUTED = '#7a7298';
const PINK = '#ff3377';
const STRIPE = ['#ff3377', '#e23344', '#ffcc11', '#33ddaa', '#22cccc', '#33aaff', '#3344aa'];
// the site's star, tilted to the left (viewBox 0 0 32 32)
const STAR = '13.37,3.64 19.00,10.78 27.82,8.61 22.77,16.17 27.56,23.89 18.81,21.43 12.94,28.36 12.59,19.28 4.18,15.84 12.70,12.70'
  .split(' ').map((p) => p.split(',').map(Number));

export const CANVAS_SIZE = { width: W, height: H };
export const CARD_BOX = CARD;
export const PICTURE_COLUMN = Math.round(500 * SCALE); // width of the picture column; anything outside it is cropped

// An uploaded picture starts whole, centred in the picture column and standing on the card's bottom edge.
// A fit is { s: scale, cx, cy }: the picture's scale and the position of its centre, in card pixels.
export const pictureBaseScale = (img) => Math.min((PICTURE_COLUMN - 30) / img.width, (CARD.h - 106) / img.height);
export function defaultPictureFit(img) {
  const s = pictureBaseScale(img);
  return { s, cx: PICTURE_COLUMN / 2, cy: CARD.h - 20 - (img.height * s) / 2 };
}

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

// ---------- the empty picture area (shown until you upload your own picture) ----------
function drawPicturePlaceholder(ctx, x, y, w, h, color) {
  const bx = x + 26;
  const by = y + 150;
  const bw = w - 52;
  const bh = h - 150 - 70;
  ctx.save();
  ctx.fillStyle = rgba(color, 0.08);
  roundRect(ctx, bx, by, bw, bh, 26);
  ctx.fill();
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(color, 0.55);
  ctx.stroke();
  ctx.setLineDash([]);
  const cx = bx + bw / 2;
  const cy = by + bh / 2 - 22;
  ctx.fillStyle = rgba(color, 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy);
  ctx.lineTo(cx + 16, cy);
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx, cy + 16);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText('Add your picture', cx, cy + 82);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText('Tap Upload picture above', cx, cy + 108);
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

// Draws one box per game you play, with its servers and the player IDs inside. Returns the y of the bottom.
function drawGames(ctx, games, x, y, maxW, accent, noGames = false) {
  if (!games.length && noGames) {
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText("I don't play any games", x, y + 32);
    return y + 40;
  }
  if (!games.length) { placeholder(ctx, 'Pick your games', x, y + 30, 26); return y + 40; }
  const gap = 14;
  const boxW = Math.min((maxW - gap) / 2, 330);
  let bottom = y;
  games.forEach((game, i) => {
    const bx = x + i * (boxW + gap);
    // Japan + Global is shown as one "Both" chip
    const servers = game.servers.includes('Japan') && game.servers.includes('Global') ? ['Both'] : game.servers;
    const ids = game.ids || [];
    const boxH = 14 + 28 + 36 + (ids.length ? 8 + ids.length * 28 : 0) + 8;
    ctx.fillStyle = rgba(accent, 0.1);
    roundRect(ctx, bx, y, boxW, boxH, 18);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 21px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(ellipsize(ctx, game.short, boxW - 36), bx + 18, y + 14 + 22);
    // server chips
    ctx.font = `700 14px ${FONT}`;
    let cx = bx + 18;
    for (const name of servers) {
      const cw = ctx.measureText(name).width + 20;
      ctx.fillStyle = accent;
      roundRect(ctx, cx, y + 14 + 34, cw, 24, 12);
      ctx.fill();
      ctx.fillStyle = luminance(accent) > 0.62 ? INK : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, cx + cw / 2, y + 14 + 34 + 13);
      cx += cw + 6;
    }
    // the IDs, one line per server
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ids.forEach((entry, row) => {
      const ey = y + 14 + 34 + 24 + 8 + row * 28 + 20;
      ctx.font = `500 13px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(entry.server.toUpperCase(), bx + 18, ey);
      const labelW = ctx.measureText(entry.server.toUpperCase()).width + 12;
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(ellipsize(ctx, entry.value, boxW - 36 - labelW), bx + 18 + labelW, ey);
    });
    bottom = Math.max(bottom, y + boxH);
  });
  return bottom;
}

/**
 * data: { name, mainName, mainBand, band: {name, color}, song: {title, bandName, color}, games: [{short, servers[]}], ids: [{label, value}], accent }
 * pics: { picture, logo, cover }  (already-loaded images or null)
 */
export function drawIdCard(ctx, data, pics) {
  const { x: cx0, y: cy0 } = CARD;
  const { w, h } = BASE; // the grid the card parts are laid out on (they are drawn scaled down)
  const accent = data.accent || PINK;
  drawBackdrop(ctx);

  // soft shadow under the card
  ctx.save();
  ctx.shadowColor = 'rgba(42, 35, 71, 0.22)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx0, cy0, CARD.w, CARD.h, CARD.r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx0, cy0);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-cx0, -cy0);
  ctx.save();
  roundRect(ctx, cx0, cy0, w, h, CARD.r / SCALE);
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
  // title: two big, tight lines; "UNOFFICIAL" sits small beside the first line
  const titleMax = w - 96 - INFO_X - 14;
  ctx.letterSpacing = '-1.5px';
  const titleSize = Math.min(fitFont(ctx, 'BanG Dream!', titleMax, 50, 30), fitFont(ctx, 'FanClub ID Card', titleMax, 50, 30));
  ctx.font = `700 ${titleSize}px ${FONT}`;
  ctx.fillText('BanG Dream!', cx0 + INFO_X, cy0 + 52);
  const firstW = ctx.measureText('BanG Dream!').width;
  ctx.fillText('FanClub ID Card', cx0 + INFO_X, cy0 + 100);
  ctx.letterSpacing = '4px';
  ctx.font = `700 15px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText('UNOFFICIAL', cx0 + INFO_X + firstW + 22, cy0 + 50);
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';
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

  // footer strip
  ctx.fillStyle = rgba(accent, 0.1);
  ctx.fillRect(cx0, cy0 + h - 44, w, 44);
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('FAN ID · NOT A REAL ID', cx0 + w - 40, cy0 + h - 17);
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
  const fx = cx0 + INFO_X;
  const fw = w - INFO_X - 48;

  label(ctx, 'Name', fx, cy0 + 168);
  if (data.name) {
    const size = fitFont(ctx, data.name, fw, 64, 32);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.fillText(ellipsize(ctx, data.name, fw), fx, cy0 + 168 + 10 + size * 0.9);
  } else {
    placeholder(ctx, 'Your name', fx, cy0 + 224, 48);
  }
  ctx.fillStyle = accent;
  roundRect(ctx, fx, cy0 + 250, 120, 6, 3);
  ctx.fill();

  const colW = (fw - 30) / 2;
  label(ctx, 'My main', fx, cy0 + 284);
  if (data.mainName) {
    const size = fitFont(ctx, data.mainName, colW, 30, 20);
    ctx.fillStyle = INK;
    ctx.fillText(ellipsize(ctx, data.mainName, colW), fx, cy0 + 284 + 12 + size * 0.95);
    if (data.mainBand) {
      ctx.font = `500 18px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(ellipsize(ctx, data.mainBand, colW), fx, cy0 + 353);
    }
  } else placeholder(ctx, 'Pick a character', fx, cy0 + 322, 24);

  const bx2 = fx + colW + 30;
  label(ctx, 'My band', bx2, cy0 + 284);
  if (data.band) {
    if (pics.logo) {
      const s = Math.min(colW / pics.logo.width, 64 / pics.logo.height);
      ctx.drawImage(pics.logo, bx2, cy0 + 296, pics.logo.width * s, pics.logo.height * s);
    } else {
      const size = fitFont(ctx, data.band.name, colW, 30, 20);
      ctx.fillStyle = data.band.color;
      ctx.fillText(ellipsize(ctx, data.band.name, colW), bx2, cy0 + 284 + 12 + size * 0.95);
    }
  } else placeholder(ctx, 'Pick a band', bx2, cy0 + 322, 24);

  label(ctx, 'My song', fx, cy0 + 378);
  const coverSize = 92;
  const coverY = cy0 + 390;
  if (data.song) {
    ctx.save();
    roundRect(ctx, fx, coverY, coverSize, coverSize, 14);
    ctx.clip();
    if (pics.cover) {
      const side = Math.min(pics.cover.width, pics.cover.height);
      ctx.drawImage(pics.cover, (pics.cover.width - side) / 2, (pics.cover.height - side) / 2, side, side, fx, coverY, coverSize, coverSize);
    } else {
      ctx.fillStyle = rgba(accent, 0.2);
      ctx.fillRect(fx, coverY, coverSize, coverSize);
    }
    ctx.restore();
    ctx.strokeStyle = data.song.color || accent;
    ctx.lineWidth = 3;
    roundRect(ctx, fx, coverY, coverSize, coverSize, 14);
    ctx.stroke();
    const tx = fx + coverSize + 20;
    const tw = fw - coverSize - 20;
    ctx.font = `700 29px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    const lines = wrap(ctx, data.song.title, tw, 2);
    lines.forEach((line, i) => ctx.fillText(line, tx, cy0 + 424 + i * 33));
    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(ellipsize(ctx, data.song.bandName, tw), tx, cy0 + 424 + lines.length * 33 + 2);
  } else {
    ctx.strokeStyle = '#e8bfd2';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    roundRect(ctx, fx, coverY, coverSize, coverSize, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    placeholder(ctx, 'Pick a song', fx + coverSize + 20, cy0 + 446, 24);
  }

  label(ctx, 'Games I play', fx, cy0 + 506);
  drawGames(ctx, data.games, fx, cy0 + 518, fw, accent, data.noGames);
  ctx.restore(); // end of the scaled-down card parts

  // ---- picture: sits on top of everything on the left, with no frame ----
  const baseX = cx0 + PICTURE_COLUMN / 2;
  const baseY = cy0 + CARD.h - 20;
  ctx.save();
  roundRect(ctx, cx0, cy0, CARD.w, CARD.h, CARD.r);
  ctx.clip();
  if (pics.picture && data.pictureIsUpload) {
    // your own picture, placed by the "Adjust picture" tool (cropped to the picture column, resized, moved)
    const fit = data.pictureFit || defaultPictureFit(pics.picture);
    const pw = pics.picture.width * fit.s;
    const ph = pics.picture.height * fit.s;
    ctx.beginPath();
    ctx.rect(cx0, cy0, PICTURE_COLUMN, CARD.h);
    ctx.clip();
    ctx.drawImage(pics.picture, cx0 + fit.cx - pw / 2, cy0 + fit.cy - ph / 2, pw, ph);
  } else {
    drawPicturePlaceholder(ctx, cx0, cy0, PICTURE_COLUMN, CARD.h, accent);
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
