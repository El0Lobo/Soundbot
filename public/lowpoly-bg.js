// lowpoly-bg.js
window.runLowpoly = function() {
  if (window.__lowpolyStarted) return;
  window.__lowpolyStarted = true;

  let canvasEl = null;

  const cfg = {
    triangleSize:      120,
    redBandWidth:      0.8,
    redBandSlant:      0.7,
    redBandWiggle:     60,
    jitterStrength:    0.4,
    breathingSpeed:    0.001,
    breathingStrength: 12,
    shadingIntensity:  0.6,
    bgColor:           '#062f3f',
    middleColor:       [120, 0, 0],
    sideColor:         [60, 60, 60]
  };

  const SCRIPTS = [
    'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.6.0/p5.min.js',
    'https://unpkg.com/delaunator@5.0.0/delaunator.min.js'
  ];
  let loadedCount = 0;

  function onLibLoaded(){
    if (++loadedCount === SCRIPTS.length) boot();
  }

  SCRIPTS.forEach(src => {
    if (src.includes('p5') && window.p5) return onLibLoaded();
    if (src.includes('delaunator') && window.Delaunator) return onLibLoaded();
    const s = document.createElement('script');
    s.src = src;
    s.onload = onLibLoaded;
    document.head.appendChild(s);
  });

  if (window.p5 && window.Delaunator) boot();

  function boot(){
    const sketch = p => {
      let pts = [], tris = [];

      p.setup = () => {
        const canvas = p.createCanvas(window.innerWidth, window.innerHeight)
          .style('position','fixed')
          .style('top','0').style('left','0');
        canvas.addClass('lowpoly-bg');
        canvas.parent(document.body);
        canvasEl = canvas.elt;
        p.noStroke();
        rebuild();
      };

      p.windowResized = () => {
        p.resizeCanvas(window.innerWidth, window.innerHeight);
        rebuild();
      };

      p.draw = () => {
        if (canvasEl && canvasEl.parentNode !== document.body) {
          document.body.prepend(canvasEl);
        }
        p.background(cfg.bgColor);
        const t = p.millis() * cfg.breathingSpeed;

        const mPts = pts.map(pt => ({
          x: pt.x + (p.noise(pt.seed, t * 0.2) - 0.5) * cfg.breathingStrength * 2,
          y: pt.y + (p.noise(pt.seed + 1e3, t * 0.2) - 0.5) * cfg.breathingStrength * 2
        }));

        p.strokeWeight(0.02);
        p.drawingContext.shadowBlur = 0;

        tris.forEach(([i1, i2, i3, col]) => {
          const strokeCol = p.color(
            p.red(col) * 0.8,
            p.green(col) * 0.8,
            p.blue(col) * 0.8
          );
          p.stroke(strokeCol);

          p.fill(col);
          const a = mPts[i1], b = mPts[i2], c = mPts[i3];
          p.triangle(a.x, a.y, b.x, b.y, c.x, c.y);
        });
      };

      function rebuild(){
        pts.length = tris.length = 0;
        const w = p.width, h = p.height;
        const cols = Math.ceil(w / cfg.triangleSize) + 4;
        const rows = Math.ceil(h / cfg.triangleSize) + 4;
        const jit  = cfg.triangleSize * cfg.jitterStrength;

        for (let y = -2; y <= rows; y++) {
          for (let x = -2; x <= cols; x++) {
            const py = y * cfg.triangleSize * 0.9 + p.random(-jit, jit);
            const curve = p.sin(py * 0.002) * 0.4 + p.cos(py * 0.001) * 0.6;
            const skew  = (py - h / 2) * cfg.redBandSlant * curve;
            const px = x * cfg.triangleSize + skew + p.random(-jit, jit);
            pts.push({ x: px, y: py, seed: p.random(1e5) });
          }
        }

        const del = Delaunator.from(pts.map(pt => [pt.x, pt.y]));
        for (let i = 0; i < del.triangles.length; i += 3) {
          tris.push([
            del.triangles[i],
            del.triangles[i + 1],
            del.triangles[i + 2],
            faceColor(
              pts[del.triangles[i]],
              pts[del.triangles[i + 1]],
              pts[del.triangles[i + 2]],
              w, h, p
            )
          ]);
        }
      }

      function faceColor(p1, p2, p3, w, h, p){
        const cx = (p1.x + p2.x + p3.x) / 3;
        const cy = (p1.y + p2.y + p3.y) / 3;

        const curve = p.sin(cy * 0.002) * 0.4 + p.cos(cy * 0.001) * 0.6;
        const skew  = (cy - h / 2) * cfg.redBandSlant * curve;
        const center = w / 2 + skew;
        const half = cfg.redBandWidth * w / 2;
        const inMid = cx > center - half - cfg.redBandWiggle && cx < center + half + cfg.redBandWiggle;

        let nx = -(p2.y - p3.y), ny = (p2.x - p3.x),
            mag = Math.hypot(nx, ny);
        nx /= mag; ny /= mag;
        const dot = nx * 0.5 + ny * -1.0;
        const orient = p.map(dot, -1, 1, -25, 25) * cfg.shadingIntensity;

        const fN = p.noise(cx * 0.03, cy * 0.03),
              cN = p.noise(cx * 0.007, cy * 0.007),
              noiseSh = p.map((fN + cN) / 2, 0, 1, -25, 25) * cfg.shadingIntensity;
        let B = p.constrain(orient + noiseSh, -70, 0);

        const seed = (p1.seed + p2.seed + p3.seed) / 3;
        B += (p.noise(seed * 200) - 0.5) * 60;
        B = p.constrain(B, -70, 0);

        const base = inMid ? cfg.middleColor : cfg.sideColor;
        return p.color(
          p.constrain(base[0] + B, 0, 255),
          p.constrain(base[1] + B, 0, 255),
          p.constrain(base[2] + B, 0, 255)
        );
      }
    };

    new window.p5(sketch);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.runLowpoly, { once: true });
} else {
  window.runLowpoly();
}
