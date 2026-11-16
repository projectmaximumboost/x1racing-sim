/* ---------- canvas textures ---------- */
function tex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}
const COL = { L: '#d81f26', R: '#0fa958', G: '#111' };
/* US flag, flag code proportions (hoist 1 : fly 1.9, union 7/13 x .76, 50 stars). vertical=true draws it hung vertically:
   stripes run up and down and the union sits at the top left as you look at it. */
function usFlag(W, vertical) {
  const H = Math.round(W * 1.9),
    c = document.createElement('canvas');
  c.width = vertical ? W : H;
  c.height = vertical ? H : W;
  const g = c.getContext('2d');
  const R = '#b22234',
    B = '#3c3b6e',
    Wt = '#ffffff',
    st = W / 13;
  g.fillStyle = Wt;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = R;
  for (let i = 0; i < 13; i += 2) vertical ? g.fillRect(i * st, 0, st + 0.5, H) : g.fillRect(0, i * st, H, st + 0.5);
  const uA = 7 * st,
    uB = 0.76 * W;
  g.fillStyle = B;
  vertical ? g.fillRect(0, 0, uA, uB) : g.fillRect(0, 0, uB, uA);
  const star = (x, y, r) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5,
        rr = k % 2 ? r * 0.382 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = Wt;
  for (let r = 1; r <= 9; r++)
    for (let m = 1; m <= 11; m++) {
      if ((r + m) % 2) continue;
      const a = 0.054 * r * W,
        b = 0.063 * m * W;
      vertical ? star(a, b, 0.0308 * W) : star(b, a, 0.0308 * W);
    }
  return c;
}
const FLAG_V = usFlag(220, true);
const X1LOGO = 'data:image/png;base64,@@X1FLAG@@'; // X1 Racing mark and wordmark, orange on transparent
function spireTex(kind, label) {
  return tex(1536, 1024, (g, w, h) => {
    const hy = (ft) => h - (ft / 200) * h,
      col = COL[kind];
    g.fillStyle = '#f4f2ee';
    g.fillRect(0, 0, w, h);
    if (kind === 'G') {
      /* start/finish spires: an even checkerboard from base to tip. 24 columns that stay whole all the way up, and each row
       as tall as the checks are wide at that height, so every check is square on the real spire (they shrink with the
       taper instead of the old rows changing count and going ragged). An X1 orange ring at the foot. */
      const cols = 24;
      let ft = 0,
        r = 0;
      while (ft < 200) {
        const cw = (2 * Math.PI * spireR(ft * 0.3048)) / cols / 0.3048,
          hft = Math.max(0.6, cw),
          y0 = hy(Math.min(200, ft + hft)),
          y1 = hy(ft);
        for (let i = 0; i < cols; i++) {
          g.fillStyle = (i + r) % 2 ? '#f4f2ee' : '#111215';
          g.fillRect((i * w) / cols, y0, w / cols + 1, y1 - y0 + 1);
        }
        ft += hft;
        r++;
      }
      g.fillStyle = '#e8690f';
      g.fillRect(0, hy(1.6), w, hy(0) - hy(1.6));
    } else {
      g.fillStyle = col;
      g.fillRect(0, hy(100), w, hy(50) - hy(100));
      g.fillRect(0, hy(200), w, hy(150) - hy(200));
      // tier 1: white with turn number and direction chevrons round the circumference
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) {
        const x = ((i + 0.5) * w) / 4;
        g.fillStyle = col;
        g.font = '800 118px "Barlow Condensed",Arial';
        g.fillText(label, x, hy(32));
        g.save();
        g.translate(x, hy(75));
        g.fillStyle = '#fff';
        const dir = kind === 'L' ? -1 : 1;
        for (let k = -1; k <= 1; k++) {
          g.save();
          g.translate(k * 74, 0);
          g.scale(dir, 1);
          g.beginPath();
          g.moveTo(-34, -46);
          g.lineTo(20, 0);
          g.lineTo(-34, 46);
          g.lineTo(-58, 46);
          g.lineTo(-4, 0);
          g.lineTo(-58, -46);
          g.closePath();
          g.fill();
          g.restore();
        }
        g.restore();
      }
      // tier 1: a US flag hung vertically between each pair of numbers, kept a true rectangle as the spire tapers
      const fl = 34 * 0.3048,
        fw = fl / 1.9,
        ft0 = 10,
        ft1 = ft0 + 34;
      for (let i = 0; i < 4; i++) {
        const x = (i * w) / 4;
        for (let y = Math.floor(hy(ft1)); y < Math.ceil(hy(ft0)); y++) {
          const ft = ((h - y - 0.5) / h) * 200,
            pw = (fw * w) / (2 * Math.PI * spireR(ft * 0.3048)),
            sy = ((ft1 - ft) / 34) * FLAG_V.height;
          for (const wrap of [0, w])
            g.drawImage(
              FLAG_V,
              0,
              Math.max(0, Math.min(FLAG_V.height - 1, sy)),
              FLAG_V.width,
              1,
              x + wrap - pw / 2,
              y,
              pw,
              1.2,
            );
        }
      }
    }
    for (const ft of [50, 100, 150]) {
      g.fillStyle = 'rgba(0,0,0,.38)';
      g.fillRect(0, hy(ft) - 3, w, 6);
    }
    g.fillStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 24; i++) g.fillRect((i * w) / 24, 0, 2, h);
  });
}
const bargeTex = tex(1024, 96, (g, w, h) => {
  g.fillStyle = '#1b222a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8690f';
  g.fillRect(0, 0, w, 9);
  g.fillStyle = '#f4f1ec';
  g.font = 'italic 700 62px "Barlow Condensed",Arial';
  g.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) g.fillText('X1 RACING', 30 + i * 340, 56);
});
