// Draws the ranking board onto a canvas and downloads it as a PNG.
// Canvas is 1080x1350 (4:5), the largest portrait size Facebook shows uncropped in the feed.
const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 36;
const GAP = 14;
const HEADER = 122;
const FOOTER = 40;
const BOTTOM = 18;
const FONT = '"Space Grotesk", "Noto Sans JP", system-ui, sans-serif';

// Same pyramid as the page. `base` is the relative size; the rows are scaled together to fill
// the canvas height, so rank 1 stays the biggest and ranks 7-10 are as large as the space allows.
const ROWS = [
  { ranks: [0], base: 360, title: 30, sub: 17, badge: 30 },
  { ranks: [1, 2], base: 280, title: 22, sub: 14, badge: 24 },
  { ranks: [3, 4, 5], base: 240, title: 18, sub: 12, badge: 20 },
  { ranks: [6, 7, 8, 9], base: 216, title: 16, sub: 12, badge: 19 },
];
const RANK_COLORS = ['#f5b400', '#aab4cc', '#e0925a', '#33aaff', '#33aaff', '#33aaff', '#a9a3e8', '#a9a3e8', '#a9a3e8', '#a9a3e8'];
const INK = '#2a2347';
const MUTED = '#7a7298';
// BanG Dream! band colors for the top stripe
const STRIPE = ['#ff3377', '#e23344', '#ffcc11', '#33ddaa', '#22cccc', '#33aaff', '#3344aa'];

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A cover image failed to load.'));
    image.src = src;
  });
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

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

// Wraps text to at most two lines.
function wrapTwoLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !lines[lines.length - 1]) lines[lines.length - 1] = test;
    else if (lines.length < 2) lines.push(word);
    else lines[1] = `${lines[1]} ${word}`;
  }
  return lines.map((line, i) => (i === lines.length - 1 ? fitText(ctx, line, maxWidth) : line)).slice(0, 2);
}

// Sizes the rows so they fill the canvas height (and never exceed the canvas width).
function layoutRows() {
  const available = HEIGHT - HEADER - FOOTER - BOTTOM - GAP * (ROWS.length - 1);
  const scale = available / ROWS.reduce((sum, row) => sum + row.base, 0);
  return ROWS.map((row) => {
    const maxByWidth = Math.floor((WIDTH - PAD * 2 - GAP * (row.ranks.length - 1)) / row.ranks.length);
    return { ...row, size: Math.min(Math.floor(row.base * scale), maxByWidth) };
  });
}

function drawCover(ctx, { song, image, band, index, x, y, row }) {
  const { size } = row;
  const color = RANK_COLORS[index];
  const radius = Math.round(size * 0.055);

  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  if (song && image) {
    const side = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, x, y, size, size);
  } else {
    ctx.fillStyle = '#ffe3ee';
    ctx.fillRect(x, y, size, size);
  }

  if (song) {
    // title + band sit on a dark fade at the bottom of the cover, so no extra caption rows are needed
    const textX = x + Math.max(10, size * 0.045);
    const textW = size - (textX - x) * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${row.title}px ${FONT}`;
    const lines = wrapTwoLines(ctx, song.title, textW);
    const lineH = Math.round(row.title * 1.18);
    const bandH = Math.round(row.sub * 1.5);
    const overlayH = lines.length * lineH + bandH + Math.round(size * 0.1);
    const fade = ctx.createLinearGradient(0, y + size - overlayH - 18, 0, y + size);
    fade.addColorStop(0, 'rgba(20, 14, 40, 0)');
    fade.addColorStop(0.45, 'rgba(20, 14, 40, 0.72)');
    fade.addColorStop(1, 'rgba(20, 14, 40, 0.9)');
    ctx.fillStyle = fade;
    ctx.fillRect(x, y + size - overlayH - 18, size, overlayH + 18);

    const bottom = y + size - Math.max(9, size * 0.04);
    ctx.fillStyle = '#ffffffd9';
    ctx.font = `500 ${row.sub}px ${FONT}`;
    ctx.fillStyle = band.color;
    ctx.beginPath();
    ctx.arc(textX + 4, bottom - row.sub * 0.36, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.fillText(fitText(ctx, band.name, textW - 14), textX + 14, bottom);

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${row.title}px ${FONT}`;
    const titleBottom = bottom - bandH + Math.round(row.sub * 0.35);
    lines.forEach((line, i) => ctx.fillText(line, textX, titleBottom - (lines.length - 1 - i) * lineH));
  }
  ctx.restore();

  // rank-colored frame
  ctx.lineWidth = index === 0 ? 6 : 3;
  ctx.strokeStyle = song ? color : '#e8bfd2';
  if (!song) ctx.setLineDash([10, 8]);
  roundRect(ctx, x, y, size, size, radius);
  ctx.stroke();
  ctx.setLineDash([]);

  // rank badge
  const r = row.badge;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 10 + r, y + 10 + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), x + 10 + r, y + 12 + r);
  ctx.textBaseline = 'alphabetic';
}

export async function savePoster({ ranks, bandById, nickname }) {
  if (document.fonts?.load) {
    await Promise.allSettled([document.fonts.load(`700 24px ${FONT}`), document.fonts.load(`500 16px ${FONT}`)]);
  }
  const images = await Promise.all(ranks.map((song) => (song ? loadImage(encodePath(song.file)) : null)));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#fff0f6');
  bg.addColorStop(1, '#fff8fb');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glowL = ctx.createRadialGradient(0, 0, 0, 0, 0, 640);
  glowL.addColorStop(0, 'rgba(255, 51, 119, 0.16)');
  glowL.addColorStop(1, 'rgba(255, 51, 119, 0)');
  ctx.fillStyle = glowL;
  ctx.fillRect(0, 0, WIDTH, 640);
  const glowR = ctx.createRadialGradient(WIDTH, 0, 0, WIDTH, 0, 640);
  glowR.addColorStop(0, 'rgba(51, 170, 255, 0.18)');
  glowR.addColorStop(1, 'rgba(51, 170, 255, 0)');
  ctx.fillStyle = glowR;
  ctx.fillRect(0, 0, WIDTH, 640);
  STRIPE.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect((WIDTH / STRIPE.length) * i, 0, WIDTH / STRIPE.length + 1, 10);
  });

  // header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ff3377';
  ctx.font = `700 17px ${FONT}`;
  ctx.fillText('BANG DREAM! ORIGINAL SONGS', WIDTH / 2, 46);
  ctx.fillStyle = INK;
  ctx.font = `700 50px ${FONT}`;
  const owner = nickname ? `${nickname}'s` : 'My';
  ctx.fillText(fitText(ctx, `${owner} Song Top 10`, WIDTH - PAD * 2), WIDTH / 2, 96);

  // rows
  let y = HEADER;
  for (const row of layoutRows()) {
    const count = row.ranks.length;
    let x = (WIDTH - (count * row.size + (count - 1) * GAP)) / 2;
    for (const index of row.ranks) {
      const song = ranks[index];
      drawCover(ctx, { song, image: images[index], band: song ? bandById[song.band] : null, index, x, y, row });
      x += row.size + GAP;
    }
    y += row.size + GAP;
  }

  // footer
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `500 14px ${FONT}`;
  ctx.fillText('Unofficial fan project. BanG Dream! © Bushiroad / BanG Dream! Project.', WIDTH / 2, HEIGHT - 20);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export is not available in this browser, or the page was opened as a local file. Try the hosted page.');
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'my-song-top-10.png' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
