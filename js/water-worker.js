/* Potential-water terrain model. Input: elevation grid (m). Steps:
   1) 3x3 smooth  2) priority-flood depression fill  3) D8 flow direction + flow accumulation
   4) topographic position (valley bottom = lower than surroundings)  5) score, boosted near NHD intermittent/ephemeral lines & springs
   Output: RGBA overlay + top hotspots. This is a heuristic, not a water finder. */
self.onmessage = e => {
  const { W, H, cell, lines, springs } = e.data; const N = W * H;
  let z = new Float32Array(e.data.elev);
  // 1) smooth
  const s = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let t = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) { t += z[yy * W + xx]; c++; } }
    s[y * W + x] = t / c;
  }
  z = s;
  // 2) priority flood (binary heap)
  const fill = new Float32Array(z), done = new Uint8Array(N);
  const heap = new Int32Array(N + 8), hv = new Float32Array(N + 8); let hn = 0;
  const push = (i, v) => { let k = hn++; heap[k] = i; hv[k] = v; while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= hv[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hv[p], hv[k]] = [hv[k], hv[p]]; k = p; } };
  const pop = () => { const i = heap[0]; hn--; heap[0] = heap[hn]; hv[0] = hv[hn]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && hv[l] < hv[m]) m = l; if (r < hn && hv[r] < hv[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hv[m], hv[k]] = [hv[k], hv[m]]; k = m; } return i; };
  for (let x = 0; x < W; x++) { push(x, z[x]); push((H - 1) * W + x, z[(H - 1) * W + x]); done[x] = done[(H - 1) * W + x] = 1; }
  for (let y = 1; y < H - 1; y++) { push(y * W, z[y * W]); push(y * W + W - 1, z[y * W + W - 1]); done[y * W] = done[y * W + W - 1] = 1; }
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1], DD = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];
  while (hn) {
    const i = pop(), x = i % W, y = (i / W) | 0;
    for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (done[j]) continue; done[j] = 1; fill[j] = Math.max(z[j], fill[i] + 1e-3); push(j, fill[j]); }
  }
  // 3) D8 + accumulation (process high to low)
  const dir = new Int8Array(N).fill(-1), slope = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let best = 0, bk = -1;
    for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const g = (fill[i] - fill[yy * W + xx]) / (DD[k] * cell); if (g > best) { best = g; bk = k; } }
    dir[i] = bk;
    // slope from original surface (percent)
    const zx = (z[y * W + Math.min(W - 1, x + 1)] - z[y * W + Math.max(0, x - 1)]) / (2 * cell), zy = (z[Math.min(H - 1, y + 1) * W + x] - z[Math.max(0, y - 1) * W + x]) / (2 * cell);
    slope[i] = Math.hypot(zx, zy) * 100;
  }
  const order = new Uint32Array(N); for (let i = 0; i < N; i++) order[i] = i;
  order.sort((a, b) => fill[b] - fill[a]);
  const acc = new Float32Array(N).fill(1);
  for (let n = 0; n < N; n++) { const i = order[n], k = dir[i]; if (k < 0) continue; const j = i + DY[k] * W + DX[k]; acc[j] += acc[i]; }
  // 4) TPI with box radius ~75 m (summed-area table)
  const r = Math.max(3, Math.round(75 / cell)), sat = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += z[y * W + x]; sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row; } }
  const tpi = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    const sum = sat[y1 * (W + 1) + x1] - sat[y0 * (W + 1) + x1] - sat[y1 * (W + 1) + x0] + sat[y0 * (W + 1) + x0];
    tpi[y * W + x] = z[y * W + x] - sum / ((x1 - x0) * (y1 - y0));
  }
  // 5) NHD proximity rasters
  const near = new Uint8Array(N); // 1 ephemeral, 2 intermittent, 3 perennial
  const rank = { ephemeral: 1, other: 1, intermittent: 2, perennial: 3 };
  const rad = Math.max(2, Math.round(30 / cell));
  const stamp = (cx, cy, v, rr) => { for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const xx = Math.round(cx) + dx, yy = Math.round(cy) + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > rr * rr) continue; const j = yy * W + xx; if (near[j] < v) near[j] = v; } };
  for (const l of lines) { const v = rank[l.kind] || 1; for (let k = 1; k < l.pts.length; k++) { const [ax, ay] = l.pts[k - 1], [bx, by] = l.pts[k]; const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay))); for (let t = 0; t <= steps; t++) stamp(ax + (bx - ax) * t / steps, ay + (by - ay) * t / steps, v, rad); } }
  const springNear = new Uint8Array(N), srad = Math.max(3, Math.round(120 / cell));
  for (const [sx, sy] of springs) for (let dy = -srad; dy <= srad; dy++) for (let dx = -srad; dx <= srad; dx++) { const xx = Math.round(sx) + dx, yy = Math.round(sy) + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx * dx + dy * dy <= srad * srad) springNear[yy * W + xx] = 1; }
  // score
  const cellA = cell * cell, minA = 15000; // m² contributing area to count as a drainage (~3.7 ac)
  const score = new Float32Array(N), rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const A = acc[i] * cellA, sink = fill[i] - z[i];
    let sc = 0;
    if (A >= minA) sc += Math.log10(A / minA + 1) * 1.6;           // drainage strength
    if (tpi[i] < 0) sc *= 1 + Math.min(1.5, -tpi[i] / 4); else sc *= 0.5; // valley bottom
    if (sink > 0.4) sc += Math.min(2, sink) * 1.2;                  // closed low spot
    if (sc > 0 && slope[i] < 12) sc *= 1.3;                          // flatter = water can pool
    if (sc > 0 && near[i]) sc *= near[i] === 3 ? 1.2 : near[i] === 2 ? 1.6 : 1.35;
    if (sc > 0 && springNear[i]) sc *= 1.8;
    score[i] = sc;
    if (sc > 1.2) { const a = Math.min(230, 70 + sc * 45); rgba[i * 4] = 20; rgba[i * 4 + 1] = 200 + Math.min(55, sc * 10); rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = a; }
  }
  // hotspots: non-max suppression, prefer intermittent/ephemeral & springs (perennial water is already known)
  const cand = [];
  for (let i = 0; i < N; i++) {
    if (score[i] < 2.2 || near[i] === 3) continue;
    const x = i % W, y = (i / W) | 0; if (x < 4 || y < 4 || x > W - 5 || y > H - 5) continue;
    cand.push(i);
  }
  cand.sort((a, b) => score[b] - score[a]);
  const hotspots = [], sep = Math.round(250 / cell);
  for (const i of cand) {
    const x = i % W, y = (i / W) | 0;
    if (hotspots.some(h => Math.abs(h.x - x) < sep && Math.abs(h.y - y) < sep)) continue;
    const sink = fill[i] - z[i];
    hotspots.push({ x: x + 0.5, y: y + 0.5, score: score[i], areaAc: acc[i] * cellA / 4046.86, nearNHD: near[i] === 2 ? 'intermittent' : near[i] === 1 ? 'ephemeral' : '', spring: !!springNear[i], sink: sink > 0.4, flat: slope[i] < 12 });
    if (hotspots.length >= 25) break;
  }
  self.postMessage({ rgba: rgba.buffer, hotspots }, [rgba.buffer]);
};
