// Draws the ranking board onto a canvas and downloads it as a PNG.
const WIDTH = 1200;
const PAD = 64;
const FONT = '"Space Grotesk", "Noto Sans JP", system-ui, sans-serif';

// Same pyramid as the page: rank 1 is the biggest.
const ROWS = [
  { ranks: [0], size: 420, title: 34, sub: 20, color: '#f4c95d' },
  { ranks: [1, 2], size: 300, title: 24, sub: 17, color: '#c9d2e8' },
  { ranks: [3, 4, 5], size: 204, title: 18, sub: 15, color: '#8fa3ff' },
  { ranks: [6, 7, 8, 9], size: 150, title: 15, sub: 13, color: '#6c7396' },
];
const COLORS = ['#f4c95d', '#c9d2e8', '#d99a6c'];
const GAP = 28;

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

export async function savePoster({ ranks, bandById, nickname }) {
  if (document.fonts?.load) {
    await Promise.allSettled([document.fonts.load(`700 24px ${FONT}`), document.fonts.load(`500 16px ${FONT}`)]);
  }
  const images = await Promise.all(ranks.map((song) => (song ? loadImage(encodePath(song.file)) : null)));

  const headerH = 190;
  const footerH = 90;
  const captionH = (row) => row.sub + row.title * 2 + 28;
  let height = headerH + footerH;
  for (const row of ROWS) height += row.size + captionH(row) + GAP;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#171929');
  bg.addColorStop(1, '#0e0f1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = ctx.createRadialGradient(WIDTH / 2, 0, 0, WIDTH / 2, 0, 700);
  glow.addColorStop(0, 'rgba(244, 201, 93, 0.22)');
  glow.addColorStop(1, 'rgba(244, 201, 93, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, 700);

  // header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f4c95d';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('BANG DREAM! ORIGINAL SONGS', WIDTH / 2, 70);
  ctx.fillStyle = '#eef0ff';
  ctx.font = `700 60px ${FONT}`;
  const owner = nickname ? `${nickname}'s` : 'My';
  ctx.fillText(fitText(ctx, `${owner} Song Top 10`, WIDTH - PAD * 2), WIDTH / 2, 138);

  // rows
  let y = headerH;
  for (const row of ROWS) {
    const count = row.ranks.length;
    const rowWidth = count * row.size + (count - 1) * GAP;
    let x = (WIDTH - rowWidth) / 2;
    for (const index of row.ranks) {
      const song = ranks[index];
      const color = COLORS[index] || row.color;
      ctx.save();
      roundRect(ctx, x, y, row.size, row.size, 18);
      ctx.clip();
      if (song && images[index]) {
        const img = images[index];
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, row.size, row.size);
      } else {
        ctx.fillStyle = '#1f2236';
        ctx.fillRect(x, y, row.size, row.size);
      }
      ctx.restore();
      ctx.lineWidth = index === 0 ? 6 : 3;
      ctx.strokeStyle = song ? color : '#2c3050';
      if (!song) ctx.setLineDash([10, 8]);
      roundRect(ctx, x, y, row.size, row.size, 18);
      ctx.stroke();
      ctx.setLineDash([]);

      // rank badge
      const badge = index === 0 ? 40 : index < 3 ? 32 : 26;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 14 + badge, y + 14 + badge, badge, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14110a';
      ctx.font = `700 ${Math.round(badge * 1.05)}px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), x + 14 + badge, y + 16 + badge);
      ctx.textBaseline = 'alphabetic';

      if (song) {
        const band = bandById[song.band];
        ctx.fillStyle = '#eef0ff';
        ctx.font = `700 ${row.title}px ${FONT}`;
        const lines = wrapTwoLines(ctx, song.title, row.size + 8);
        lines.forEach((line, i) => ctx.fillText(line, x + row.size / 2, y + row.size + row.title + 8 + i * (row.title + 4)));
        ctx.fillStyle = '#9aa0c0';
        ctx.font = `500 ${row.sub}px ${FONT}`;
        const bandY = y + row.size + row.title + 8 + (lines.length - 1) * (row.title + 4) + row.sub + 8;
        ctx.fillText(fitText(ctx, band.name, row.size + 8), x + row.size / 2, bandY);
      }
      x += row.size + GAP;
    }
    y += row.size + captionH(row) + GAP;
  }

  // footer
  ctx.fillStyle = '#6c7396';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Unofficial fan project. BanG Dream! © Bushiroad / BanG Dream! Project.', WIDTH / 2, height - 36);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Image export is not available in this browser, or the page was opened as a local file. Try the hosted page.');
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'my-song-top-10.png' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
