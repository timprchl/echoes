(() => {
  const { store, fmt, YEAR_MIN, YEAR_MAX, yearOff } = Echoes;
  const {
    START_POINTS, VOICE_COST, MISS_COST, TRIES, YEAR_COST, KM_COST, HIT_YEARS, HIT_KM, NAME_BONUS,
  } = Echoes.RULES;

  const STR = {
    day: n => `No. ${String(n).padStart(3, '0')} · Today’s event`,
    voiceTag: 'Voice',
    nextCaption: 'Hold to hear the next voice',
    firstCaption: 'Play the first voice',
    introEyebrow: n => `${n} voices`,
    introLine: 'Five people lived through it. Who speaks first?',
    introHint: 'Hold to play the first voice',
    solved: 'The answer',
    allHeard: 'All voices heard',
    // der Tipp-Knopf führt Schritt für Schritt: Pin → Jahr → abgeben
    stepPin: '① Tap the globe to set your pin',
    stepYear: '② Now pick the year',
    guess: n => `Lock in guess ${n} of ${TRIES + 1}`,
    finalGuess: 'Lock in your final guess',
    finalCost: 'Final guess: −150 per year and −100 per 500 km off',
    yearUnset: 'Year?',
    hit: 'Hit', final: 'Final',
    placeOk: 'Place: right area',
    placeOff: ([a, b]) => `Place: ${fmt(a)}–${fmt(b)} km off – somewhere in the red band, in the white quarter`,
    near: 'close',
    yearOk: 'Year: right',
    yearLater: 'Year: later',
    yearEarlier: 'Year: earlier',
    streak: n => `${n}-day streak`,
    nextIn: tm => `Next event in ${tm}`,
    // Hinweise beim ersten Spielen, direkt am jeweiligen Element
    coach: {
      globe: 'Where did this happen? Tap the globe to set your pin. Drag to spin it.',
      year: 'Now the year: slide by decade, then fine-tune with ‹ ›.',
      lock: 'Hold to lock in. You get two tries, then a final guess.',
      miss: 'A miss. The place lies somewhere in the red band around your pin – in the white quarter. The dark stretch on the year bar shows which years are still possible.',
      next: 'Stuck? Another voice brings you closer to the moment – but costs points.',
      ok: 'Got it',
    },
    play: 'Listen',
    score: 'points',
    nameOpen: 'Name the event',
    nameLater: 'Maybe next guess',
    namePlace: 'What happened?',
    nameHint: 'One try · no penalty if wrong',
    nameOk: b => `Spot on · +${fmt(b)}`,
    nameNo: 'Not quite – no bonus this time',
    resultNamed: b => `You named the event: +${fmt(b)} bonus.`,
    share: 'Copy result', copied: 'Copied!', everyone: 'What everyone guessed',
    resultHit: (v, g) => `Recognised with ${v} ${v === 1 ? 'voice' : 'voices'} on guess ${g}.`,
    resultFinal: (dy, km, p) => `Final guess: ${fmt(dy)} ${dy === 1 ? 'year' : 'years'} and ${fmt(km)} km off (−${fmt(p)}).`,
    notes: 'Tap 1–5 to read what each voice was hinting at.',
    proto: 'Prototype – pick a day:', reset: 'Reset day',
  };

  const t = () => STR;
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = s => document.querySelector(s);

  const { no: dayNo, day, key: KEY } = Echoes.currentDay();
  if (!day || (!Echoes.DEV && day.status !== 'approved' && day.status !== 'live')) {
    document.querySelector('.stage').innerHTML = '<p class="not-ready">Today’s event is still being prepared. Come back soon.</p>';
    document.querySelector('.ai-note').hidden = true;
    return;
  }

  const TEST = Echoes.TEST; // Probespiel: nichts speichern, nichts melden, kein Feedback
  let state = (!TEST && store.get(KEY)) || { heard: 0, guesses: [], done: false };
  let pin = null;
  let year = null; // erst gesetzt, wenn der Spieler das Jahr wählt
  const save = () => { if (!TEST) store.set(KEY, state); };

  // --- Geometrie ---
  const R = 6371;
  const rad = d => d * Math.PI / 180;
  function distanceKm([lon1, lat1], [lon2, lat2]) {
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  // Punkt in gegebener Richtung (Grad, 0 = Norden) und Entfernung (Grad Bogen) vom Startpunkt
  function destination([lon, lat], b, d) {
    const p1 = rad(lat), l1 = rad(lon), br = rad(b), dr = rad(d);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(br));
    const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
    return [l2 * 180 / Math.PI, p2 * 180 / Math.PI];
  }
  function bearing([lon1, lat1], [lon2, lat2]) {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
      Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  // Entfernungs-Band nach einem Fehlversuch: etwa halb so breit wie die Entfernung (mind. 500 km),
  // das Ziel liegt aber nicht in der Mitte, sondern an einer zufälligen – pro Tag und Versuch festen – Stelle
  function band(g, i) {
    let h = 2166136261;
    for (const c of `${day.id}|${i}|${g.lon.toFixed(2)}|${g.lat.toFixed(2)}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const f = .15 + .7 * ((h >>> 0) / 4294967296);
    const w = Math.max(500, g.km * .5);
    const step = w >= 1000 ? 100 : 50;
    return [Math.max(0, Math.floor((g.km - f * w) / step) * step), Math.ceil((g.km + (1 - f) * w) / step) * step];
  }

  // --- Globus ---
  const W = 500, BASE = 230;
  const svg = d3.select('#globe');
  const projection = d3.geoOrthographic().translate([W / 2, W / 2]).scale(BASE).clipAngle(90).rotate([-10, -30]).precision(.7); // etwas gröber nachrechnen – spart Zeit pro Bild, sieht gleich aus
  const path = d3.geoPath(projection);
  const gSphere = svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere');
  const gGrat = svg.append('path').datum(d3.geoGraticule10()).attr('class', 'grat');
  const gLand = svg.append('g');
  const gArcs = svg.append('g');
  const gHint = svg.append('g').attr('class', 'miss-hint');
  const gMarks = svg.append('g');
  let countries = [];

  // Satellitenbilder der Erde per WebGL unter dem SVG – gleiche Projektion, Grenzen, Pins & Co. bleiben im SVG.
  // Zwei Ebenen: Nacht (NASA Black Marble) beim Start, Tag (NASA Blue Marble) sobald man hineinzoomt.
  // Je Ebene ein Grundbild in vendor/ und schärfere Kacheln aus tiles/<name>/ (nur die sichtbaren, bis ≈ 230 px/Grad).
  // Ohne WebGL oder solange die Bilder laden, bleibt der helle Globus.
  const lens = document.querySelector('.globe-lens');
  let lensPx = 0;
  const lensSize = () => lensPx || (lensPx = Math.round(lens.clientWidth * Math.min(2, devicePixelRatio || 1)));
  addEventListener('resize', () => { lensPx = 0; });
  function earthLayer(name, gain, onReady) {
    const canvas = document.createElement('canvas');
    canvas.className = `earth ${name}`;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
    if (!gl) return { draw() {}, load() {}, ready: false };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;
      varying vec2 uv; uniform sampler2D tex; uniform vec2 rot; uniform float scale; uniform float px; uniform float gain;
      uniform vec4 box; // Bildausschnitt: Westrand, Nordrand, Breite, Höhe (Bogenmaß)
      const float PI = 3.14159265;
      void main() {
        // Pixel → Projektionskoordinaten (SVG-viewBox 20…480, Mitte 250, y nach unten)
        vec2 s = vec2(20. + uv.x * 460., 20. + (1. - uv.y) * 460.);
        float X = (s.x - 250.) / scale, Y = (250. - s.y) / scale;
        float r2 = X * X + Y * Y;
        if (r2 > 1.) { gl_FragColor = vec4(0.); return; }
        float Z = sqrt(1. - r2);
        // Umkehrung von d3.geoOrthographic().rotate([λ, φ])
        float lon = atan(X, Z * cos(rot.y) + Y * sin(rot.y)) - rot.x;
        float lat = asin(clamp(Y * cos(rot.y) - Z * sin(rot.y), -1., 1.));
        lon = mod(lon + PI, 2. * PI) - PI;
        vec2 t = vec2((lon - box.x) / box.z, (box.y - lat) / box.w);
        if (t.x < 0. || t.x > 1. || t.y < 0. || t.y > 1.) discard;
        vec3 c = texture2D(tex, t).rgb * gain;
        // Atmosphäre: zum Rand hin bläulicher Schimmer
        float rim = pow(1. - Z, 2.5);
        c = mix(c, vec3(.36, .55, 1.), rim * .55);
        float edge = 1. - smoothstep(1. - px * 1.5, 1., sqrt(r2));
        gl_FragColor = vec4(c * edge, edge);
      }`));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { draw() {}, load() {}, ready: false };
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(prog, n);
    const D = Math.PI / 180;
    const texture = img => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };

    let base = null;
    const layer = { draw, load, ready: false };
    function load() {
      const img = new Image();
      img.onload = () => {
        base = texture(img);
        lens.prepend(canvas);
        layer.ready = true;
        onReady();
      };
      img.src = `vendor/${name}-earth.jpg`;
    }

    // --- Detail-Kacheln ---
    let index = null;
    fetch(`tiles/${name}/index.json`).then(r => r.ok ? r.json() : null).then(j => { index = j; draw(); }).catch(() => {});
    const cache = new Map(); // "n/x_y" → { tex, used }
    const loading = new Set();
    const queue = [];
    let clock = 0;
    const has = (lv, x, y) => lv.have[y * lv.w + x] === '1';
    function request(key) {
      if (cache.has(key) || loading.has(key) || queue.includes(key)) return;
      queue.push(key);
      pump();
    }
    function pump() {
      while (loading.size < 6 && queue.length) {
        const key = queue.shift();
        loading.add(key);
        const im = new Image();
        im.onload = () => { cache.set(key, { tex: texture(im), used: clock }); loading.delete(key); schedule(); pump(); };
        im.onerror = () => { loading.delete(key); pump(); };
        im.src = `tiles/${name}/${key}.jpg`;
      }
    }
    function evict() {
      if (cache.size <= 160) return;
      [...cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, cache.size - 160)
        .forEach(([key, t]) => { gl.deleteTexture(t.tex); cache.delete(key); });
    }
    // sichtbare Kacheln einer Stufe: Bildschirm in einem Raster abtasten, pro Kachel den Bildschirm-Ausschnitt merken
    function visibleTiles(lv, size) {
      const tiles = new Map();
      const N = 14, step = 460 / N;
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const sx = 20 + i * step, sy = 20 + j * step;
          const c = projection.invert([sx, sy]);
          if (!c || !visible(c)) continue;
          const x = Math.min(lv.w - 1, Math.floor((c[0] + 180) / lv.deg));
          const y = Math.min(lv.h - 1, Math.floor((90 - c[1]) / lv.deg));
          if (!has(lv, x, y)) continue;
          const key = `${lv.n}/${x}_${y}`;
          const b = tiles.get(key) || { x, y, x0: sx, x1: sx, y0: sy, y1: sy, d: Infinity };
          b.x0 = Math.min(b.x0, sx); b.x1 = Math.max(b.x1, sx); b.y0 = Math.min(b.y0, sy); b.y1 = Math.max(b.y1, sy);
          b.d = Math.min(b.d, Math.hypot(sx - 250, sy - 250));
          tiles.set(key, b);
        }
      }
      // Ausschnitt um einen Rasterschritt vergrößern und in Canvas-Pixel umrechnen
      const k = size / 460;
      tiles.forEach(b => {
        b.sx = Math.max(0, Math.floor((b.x0 - step - 20) * k));
        b.sy = Math.max(0, Math.floor((480 - b.y1 - step) * k));
        b.sw = Math.min(size, Math.ceil((b.x1 + step - 20) * k)) - b.sx;
        b.sh = Math.min(size, Math.ceil((480 - b.y0 + step) * k)) - b.sy;
      });
      return tiles;
    }

    let size = 0;
    function draw() {
      if (!base) return;
      size = lensSize(); // gemerkt statt jedes Mal gemessen – das Messen erzwingt sonst ein Layout pro Bild
      if (canvas.width !== size) { canvas.width = canvas.height = size; gl.viewport(0, 0, size, size); }
      const [l, p] = projection.rotate();
      gl.uniform2f(u('rot'), l * D, p * D);
      gl.uniform1f(u('scale'), projection.scale());
      gl.uniform1f(u('px'), 460 / size / projection.scale());
      gl.uniform1f(u('gain'), gain);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, base);
      gl.uniform4f(u('box'), -Math.PI, Math.PI / 2, 2 * Math.PI, Math.PI);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!index) return;
      // benötigte Schärfe: Bildschirm-Pixel pro Grad in der Globusmitte
      const need = projection.scale() * D * size / 460;
      const levels = index.levels.filter(lv => index.tile / lv.deg / 2 < need); // nur Stufen, die schärfer sind als das Bild davor
      if (!levels.length) return;
      const top = levels.find(lv => index.tile / lv.deg >= need * .8) || levels[levels.length - 1];
      clock++;
      gl.enable(gl.SCISSOR_TEST);
      for (const lv of levels) {
        if (lv.n > top.n) break;
        if (lv.n < top.n - 1) continue; // gröbere Stufen liegt das Grundbild ohnehin darunter
        const tiles = visibleTiles(lv, size);
        if (lv === top) [...tiles.entries()].sort((a, b) => a[1].d - b[1].d).forEach(([key]) => request(key));
        tiles.forEach((b, key) => {
          const t = cache.get(key);
          if (!t || b.sw <= 0 || b.sh <= 0) return;
          t.used = clock;
          gl.scissor(b.sx, b.sy, b.sw, b.sh);
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          gl.uniform4f(u('box'), (b.x * lv.deg - 180) * D, (90 - b.y * lv.deg) * D, lv.deg * D, lv.deg * D);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });
      }
      // nicht mehr gebrauchte Ladewünsche verwerfen (z. B. nach dem Wegdrehen)
      queue.splice(0, queue.length, ...queue.filter(key => key.startsWith(`${top.n}/`)));
      evict();
    }
    let pending = false;
    const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); } };
    addEventListener('resize', schedule);
    return layer;
  }
  // Nacht beim Start; Tag lädt im Hintergrund nach und übernimmt, sobald hineingezoomt wird
  const ZOOMED = 1.05;
  const nightEarth = earthLayer('night', 1.35, () => { drawGlobe(); requestAnimationFrame(() => lens.classList.add('night')); dayEarth.load(); });
  const dayEarth = earthLayer('day', 1.3, () => drawGlobe()); // Blue Marble ist recht dunkel – etwas aufhellen
  let mode = null, switchedAt = 0;
  function drawEarth() {
    const want = dayEarth.ready && projection.scale() > BASE * ZOOMED ? 'day' : 'night';
    if (want !== mode) {
      mode = want;
      switchedAt = performance.now();
      lens.classList.toggle('day', mode === 'day');
      if (mode === 'day') lens.classList.add('night'); // Satelliten-Darstellung an, auch falls die Nacht-Ebene noch nicht so weit ist
      setTimeout(drawGlobe, 750); // nach der Überblendung die ausgeblendete Ebene nicht mehr zeichnen
    }
    // beim Wechsel kurz beide zeichnen (Überblendung per CSS), sonst nur die sichtbare Ebene
    const fading = performance.now() - switchedAt < 700;
    if (mode === 'night' || fading) nightEarth.draw();
    if (mode === 'day' || fading) dayEarth.draw();
  }

  const center = () => { const r = projection.rotate(); return [-r[0], -r[1]]; };
  const visible = c => d3.geoDistance(c, center()) < Math.PI / 2 - 0.02;

  // höchstens ein Bild pro Bildschirm-Frame, egal wie viele Maus- oder Touch-Ereignisse kommen
  let framePending = false;
  function drawGlobe() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => { framePending = false; renderGlobe(); });
  }
  function renderGlobe() {
    drawEarth();
    gSphere.attr('d', path);
    gGrat.attr('d', path);
    gLand.selectAll('path').data(borders()).join('path').attr('class', 'land').attr('d', path);

    const target = [day.lon, day.lat];
    const arcs = state.done ? state.guesses.filter(g => !g.hit).map(g => ({
      type: 'LineString', coordinates: [[g.lon, g.lat], target],
    })) : [];
    gArcs.selectAll('path').data(arcs).join('path').attr('class', 'arc').attr('d', path);

    // nach einem Fehlversuch: Zielfernrohr um den letzten Tipp – der Ort liegt irgendwo im roten Band, im weiß gefärbten Viertel
    const last = state.guesses[state.guesses.length - 1];
    const hint = !state.done && last && !last.hit && last.km > HIT_KM ? (() => {
      const [inKm, outKm] = band(last, state.guesses.length - 1);
      const toDeg = km => km / R * 180 / Math.PI;
      const dIn = toDeg(inKm), deg = toDeg(outKm);
      const circle = d => d3.geoCircle().center([last.lon, last.lat]).radius(d).precision(1)();
      const ring = circle(deg);
      // Band als Ring: außen der große Kreis, innen der kleine als Loch
      const bandShape = { type: 'Polygon', coordinates: [ring.coordinates[0], circle(dIn).coordinates[0].slice().reverse()] };
      // Beschriftung oben auf dem Kreis (über den Pol hinaus: am südlichsten Punkt)
      const label = last.lat + deg <= 90 ? [last.lon, last.lat + deg] : [last.lon, last.lat - deg];
      // Fadenkreuz nach Norden ausgerichtet; das Viertel des Bands in Richtung des Ziels wird weiß
      const at = (b, d) => destination([last.lon, last.lat], b, d);
      const q = Math.floor(last.dir / 90) % 4;
      const arc = d => d3.range(q * 90, q * 90 + 90.1, 3).map(b => at(b, d));
      const quarter = { type: 'Polygon', coordinates: [[...arc(deg), ...arc(dIn).reverse(), at(q * 90, deg)]] };
      const line = (...c) => ({ type: 'LineString', coordinates: c });
      const cross = [0, 90, 180, 270].map(b => line(at(b, deg * .12), at(b, deg * .5), at(b, deg * 1.08)));
      const ticks = d3.range(0, 360, 15).map(b => line(at(b, deg * (b % 45 ? .96 : .92)), at(b, deg)));
      const rings = { type: 'MultiPolygon', coordinates: [ring.coordinates, circle(dIn).coordinates] };
      return { ring, label, text: `${fmt(inKm)}–${fmt(outKm)} km`, parts: [
        { cls: 'scope-fill', d: ring }, { cls: 'scope-band', d: bandShape }, { cls: 'scope-quarter', d: quarter },
        { cls: 'scope-cross', d: { type: 'MultiLineString', coordinates: cross.map(l => l.coordinates) } },
        { cls: 'scope-ticks', d: { type: 'MultiLineString', coordinates: ticks.map(l => l.coordinates) } },
        { cls: 'scope-ring', d: rings }] };
    })() : null;
    gHint.selectAll('path').data(hint ? hint.parts : []).join('path')
      .attr('class', p => p.cls).attr('d', p => path(p.d));
    gHint.selectAll('text').data(hint && visible(hint.label) ? [hint] : []).join('text')
      .attr('class', 'hint-label').attr('transform', h => `translate(${projection(h.label)})`).attr('dy', -8)
      .text(h => h.text);

    const marks = state.guesses.map((g, i) => ({ c: [g.lon, g.lat], cls: 'marker-guess' + (g.hit ? ' hit' : ''), label: i + 1 }));
    if (pin && !state.done) marks.push({ c: pin, cls: 'marker-pin', label: '' });
    if (state.done) marks.push({ c: target, cls: 'marker-answer', label: '★' });

    gMarks.selectAll('g').data(marks.filter(m => visible(m.c))).join(enter => {
      const g = enter.append('g');
      g.append('circle').attr('r', 9);
      g.append('text').attr('class', 'marker-label');
      return g;
    })
      .attr('transform', m => `translate(${projection(m.c)})`)
      .call(g => g.select('circle').attr('class', m => m.cls))
      .call(g => g.select('text').text(m => m.label));
  }

  // Drehen: der Globus folgt dem Finger und dreht nach dem Loslassen mit Schwung kurz weiter
  let moved = 0, vel = [0, 0], lastMove = 0, spin = null;
  const turn = (dx, dy) => {
    const k = 75 / projection.scale();
    const [l, p] = projection.rotate();
    projection.rotate([l + dx * k, Math.max(-80, Math.min(80, p - dy * k))]);
  };
  const stopSpin = () => { if (spin) cancelAnimationFrame(spin); spin = null; };
  svg.call(d3.drag()
    .container(function () { return this; })
    .on('start', () => { moved = 0; vel = [0, 0]; stopSpin(); stopZoom(); })
    .on('drag', e => {
      moved += Math.abs(e.dx) + Math.abs(e.dy);
      const now = performance.now(), dt = Math.max(8, now - lastMove);
      lastMove = now;
      vel = [vel[0] * .4 + e.dx / dt * .6, vel[1] * .4 + e.dy / dt * .6]; // geglättet, in Einheiten pro ms
      turn(e.dx, e.dy);
      drawGlobe();
    })
    .on('end', e => {
      if (moved > 4) {
        // Schwung: nur wenn der Finger zuletzt noch in Bewegung war
        if (performance.now() - lastMove > 80 || Math.hypot(...vel) < .05) return;
        let t = performance.now();
        const step = now => {
          const dt = now - t; t = now;
          vel = vel.map(v => v * Math.pow(.94, dt / 16.7));
          if (Math.hypot(...vel) < .01) { spin = null; return; }
          turn(vel[0] * dt, vel[1] * dt);
          renderGlobe();
          spin = requestAnimationFrame(step);
        };
        spin = requestAnimationFrame(step);
        return;
      }
      if (state.done) return;
      const c = projection.invert([e.x, e.y]);
      if (c && visible(c)) { pin = c; haptic(8); drawGlobe(); renderControls(); }
    }));

  // Zoomen gleitet zum Ziel, statt zu springen (Knöpfe, Mausrad, Trackpad)
  const MIN_SCALE = BASE, MAX_SCALE = BASE * 40; // bis 40× – darunter scharf dank Detail-Kacheln
  let zoomGoal = null, zoomAnim = null;
  const stopZoom = () => { if (zoomAnim) cancelAnimationFrame(zoomAnim); zoomAnim = null; zoomGoal = null; };
  function zoom(f) {
    zoomGoal = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (zoomGoal ?? projection.scale()) * f));
    if (zoomAnim) return;
    let t = performance.now();
    const step = now => {
      const dt = now - t; t = now;
      const cur = projection.scale();
      // pro Frame ein gutes Stück näher (logarithmisch, damit 1× → 40× genauso weich ist wie 1× → 2×)
      const k = 1 - Math.pow(.6, dt / 16.7); // ≈ 0,15 s bis zum Ziel
      const next = Math.exp(Math.log(cur) + (Math.log(zoomGoal) - Math.log(cur)) * k);
      if (Math.abs(next / zoomGoal - 1) < .002) { projection.scale(zoomGoal); renderGlobe(); zoomAnim = null; zoomGoal = null; return; }
      projection.scale(next);
      renderGlobe();
      zoomAnim = requestAnimationFrame(step);
    };
    zoomAnim = requestAnimationFrame(step);
  }
  svg.node().addEventListener('wheel', e => {
    e.preventDefault();
    // Trackpad liefert viele kleine Schritte, das Mausrad wenige große – beides proportional umsetzen
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoom(Math.exp(-Math.max(-120, Math.min(120, dy)) * .006));
  }, { passive: false });
  $('#zoomIn').onclick = () => zoom(2.2);
  $('#zoomOut').onclick = () => zoom(1 / 2.2);

  function flyTo([lon, lat], scale = BASE * 1.6) {
    const from = projection.rotate();
    const to = [-lon, -lat];
    // kürzester Weg in Längenrichtung
    while (to[0] - from[0] > 180) to[0] -= 360;
    while (from[0] - to[0] > 180) to[0] += 360;
    const ri = d3.interpolate(from, to);
    const si = d3.interpolate(projection.scale(), scale);
    stopSpin(); stopZoom();
    return d3.transition().duration(1200).tween('fly', () => tt => {
      projection.rotate(ri(tt)).scale(si(tt));
      renderGlobe();
    }).end().catch(() => {});
  }

  // Ländergrenzen in jeder Zoomstufe: grob (1:110 Mio.) für den Überblick, feiner beim Hineinzoomen –
  // 1:50 Mio. ab 2,5×, 1:10 Mio. ab 10× (dann nur die Länder in der Nähe, damit das Drehen flüssig bleibt)
  const fine = { '50m': null, '10m': null };
  const loadingBorders = new Set();
  function loadBorders(res) {
    if (fine[res] || loadingBorders.has(res)) return;
    loadingBorders.add(res);
    d3.json(`vendor/countries-${res}.json`).then(world => {
      fine[res] = topojson.feature(world, world.objects.countries).features.map(f => ({ f, b: d3.geoBounds(f) }));
      drawGlobe();
    }).catch(() => loadingBorders.delete(res));
  }
  function borders() {
    const z = projection.scale() / BASE;
    if (z >= 2.5) loadBorders('50m');
    if (z >= 6) loadBorders('10m');
    const set = z >= 10 && fine['10m'] ? fine['10m'] : z >= 2.5 && fine['50m'] ? fine['50m'] : null;
    if (!set) return countries;
    // grob vorsortieren: nur Länder, deren Rechteck in der Nähe der Bildmitte liegt
    const [cl, cp] = center();
    const r = Math.min(90, Math.asin(Math.min(1, 330 / projection.scale())) * 180 / Math.PI + 2);
    const near = ({ b: [[w, s], [e, n]] }) => {
      if (cp - r > n || cp + r < s) return false;
      if (w > e || Math.abs(cp) + r > 80) return true; // über die Datumsgrenze oder nahe am Pol: nicht ausschließen
      const dl = Math.min(Math.abs(((cl - w + 540) % 360) - 180), Math.abs(((cl - e + 540) % 360) - 180));
      return (cl >= w && cl <= e) || dl <= r / Math.max(.2, Math.cos(cp * Math.PI / 180));
    };
    return set.filter(near).map(x => x.f);
  }
  d3.json('vendor/countries-110m.json').then(world => {
    countries = topojson.feature(world, world.objects.countries).features;
    drawGlobe();
  });
  nightEarth.load();

  // --- Jahr ---
  const yearInput = $('#yearInput'), yearRange = $('#yearRange');
  function setYear(y) {
    year = y == null ? null : Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.round(y) || 1950));
    yearInput.value = year ?? '';
    yearInput.placeholder = t().yearUnset;
    yearRange.value = year == null ? 1910 : Math.min(2020, Math.round(year / 10) * 10);
    $('#timeline').classList.toggle('unset', year == null);
    renderControls();
  }
  $('#ticks').innerHTML = [1700, 1750, 1800, 1850, 1900, 1950, 2000].map(y =>
    `<span style="left:${(y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100}%">${y}</span>`).join('');
  // der Regler rastet auf Jahrzehnten ein (mit kleinem Tick), ‹ › stellen das Jahr genau
  yearRange.oninput = () => { setYear(+yearRange.value); haptic(5); };
  yearInput.onchange = () => setYear(yearInput.value === '' ? null : +yearInput.value);
  document.querySelectorAll('.nudge').forEach(b => { b.onclick = () => { setYear((year ?? 1950) + +b.dataset.step); haptic(5); }; });

  // --- Stimmen ---
  // Echte Aufnahmen aus audio/ (erzeugt von tools/make_voices.py);
  // fehlt eine, spricht der Browser als Platzhalter.
  // Übersicht der Aufnahmen frisch laden (ändert sich, sobald neue erzeugt werden)
  // dazu die Lautstärke-Werte: angeglichene Aufnahmen liegen als .m4a neben der .mp3
  for (const file of ['index.js', 'levels.js']) {
    const tag = document.createElement('script');
    tag.src = `audio/${file}?t=${Date.now()}`;
    document.head.append(tag);
  }
  // eine Aufnahme gilt nur, wenn sie zum aktuellen Text gehört
  const recorded = i => window.ECHOES_AUDIO?.[day.id]?.[i + 1] === Echoes.textHash(day.voices[i].text);
  let speakingIdx = -1;
  let player = null;
  const spoken = new Set(); // Stimmen, die schon einmal komplett gesprochen wurden
  let litP = 0;             // wie weit die laufende Stimme ist (0–1, gewichtet nach Wörtern)

  // Text läuft mit: jedes Wort bekommt einen Anteil nach Länge, Satzzeichen zählen als Pause
  const words = text => text.split(' ');
  function wordStarts(text) {
    let total = 0;
    const starts = words(text).map(w => {
      const at = total;
      total += w.length + 1 + (/[,;:–—]$/.test(w) ? 4 : 0) + (/[.!?…][”’"]?$/.test(w) ? 8 : 0);
      return at;
    });
    return starts.map(x => x / total);
  }
  function quoteHtml(i, lit) {
    const ws = words(day.voices[i].text);
    return ws.map((w, k) => `<span class="w${lit ? ' said' : ''}">${k ? '' : '“'}${esc(w)}${k < ws.length - 1 ? '' : '”'}</span>`).join(' ');
  }
  function paintWords(i, p) {
    const q = document.querySelector(`#voice .big-quote[data-i="${i}"]`);
    if (!q) return;
    const starts = wordStarts(day.voices[i].text);
    q.querySelectorAll('.w').forEach((el, k) => el.classList.toggle('said', starts[k] < p));
  }
  // läuft, solange die Stimme spricht; getP liefert den Fortschritt
  function follow(i, getP) {
    const tick = () => {
      if (speakingIdx !== i) return;
      litP = Math.max(litP, Math.min(1, getP()));
      paintWords(i, litP);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function stopSpeaking() {
    if (player) { player.pause(); player = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speakingIdx = -1;
  }
  function speak(i) {
    const wasPlaying = speakingIdx === i;
    stopSpeaking();
    if (wasPlaying) { renderVoices(); return; }
    const done = ok => () => {
      if (speakingIdx !== i) return;
      speakingIdx = -1;
      if (ok) spoken.add(i);
      renderVoices();
      if (ok && i === state.heard - 1 && !state.done) attention();
    };
    const v = day.voices[i];
    let getP;
    if (recorded(i)) {
      const ext = window.ECHOES_LEVELS?.[day.id]?.[i + 1] ? 'm4a' : 'mp3'; // angeglichen, falls vorhanden
      const a = player = new Audio(`audio/${day.id}/${i + 1}.${ext}?v=${window.ECHOES_AUDIO_VERSION || 0}`);
      a.onended = done(true);
      a.onerror = done(false);
      a.play().catch(done(false));
      // kurze Stille am Anfang und Ende der Aufnahme abziehen
      getP = () => a.duration ? (a.currentTime - 0.2) / Math.max(0.5, a.duration - 0.5) : 0;
    } else if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(v.text);
      u.lang = 'en-GB';
      u.pitch = v.pitch ?? 1;
      u.rate = v.rate ?? 1;
      u.onend = done(true);
      u.onerror = done(false);
      // Wortgrenzen vom Browser, sonst Schätzung über die Zeit (~14 Zeichen pro Sekunde)
      const starts = wordStarts(v.text);
      const charStarts = [];
      words(v.text).reduce((at, w) => { charStarts.push(at); return at + w.length + 1; }, 0);
      let boundary = -1;
      u.onboundary = e => { boundary = e.charIndex; };
      const t0 = performance.now();
      getP = () => {
        if (boundary >= 0) {
          const k = charStarts.findLastIndex(c => c <= boundary);
          return (starts[k] ?? 0) + 0.001;
        }
        return (performance.now() - t0) / 1000 / (v.text.length / (14 * u.rate));
      };
      speechSynthesis.speak(u);
    } else return;
    speakingIdx = i;
    litP = 0;
    renderVoices();
    follow(i, getP);
  }

  // Was in der Mitte steht: null = aktuelle Stimme bzw. Auflösung, sonst eine frühere Stimme
  let viewing = null;
  let lastHeard = state.heard; // nur neu aufgedeckte Stimmen animieren
  function renderVoices() {
    const n = day.voices.length;
    const fresh = state.heard > lastHeard;
    lastHeard = state.heard;
    const shown = state.done ? n : state.heard;
    const idx = viewing ?? (state.done ? -1 : state.heard - 1);
    // vor der ersten Stimme ist nur die Mitte zu sehen; der Rest fliegt beim Start herein
    document.body.classList.toggle('veiled', !state.done && state.heard === 0 && !document.body.classList.contains('arriving'));

    if (idx >= 0) {
      const v = day.voices[idx];
      $('#voice').innerHTML = `<div class="voice-stage${fresh && viewing === null ? ' fresh' : ''}">
        <div class="who-line"><span>${t().voiceTag} ${String(idx + 1).padStart(2, '0')}</span><span class="sep"></span><span>${esc(v.who)}</span></div>
        <blockquote class="big-quote follow" data-i="${idx}">${quoteHtml(idx, state.done || idx < state.heard - 1 || spoken.has(idx))}</blockquote>
        <button class="play-btn${speakingIdx === idx ? ' speaking' : ''}" data-i="${idx}"><span class="ic">${speakingIdx === idx ? '■' : '▶'}</span>${t().play}</button>
        ${state.done ? `<p class="note">${esc(v.note)}</p>` : ''}
      </div>`;
    } else if (state.done) {
      $('#voice').innerHTML = resultHtml();
      const sb = $('#statsBtn');
      if (sb) sb.onclick = () => EchoesStats.open({ day, dayNo, state, countries });
      if ($('#shareBtn')) $('#shareBtn').onclick = async () => {
        try { await navigator.clipboard.writeText(shareText()); } catch { prompt('', shareText()); }
        $('#shareBtn').textContent = t().copied;
        $('#shareBtn').classList.add('held');
        haptic([30, 50, 30]);
      };
    } else {
      $('#voice').innerHTML = `<div class="voice-stage">
        <div class="who-line">${t().introEyebrow(n)}</div>
        <p class="big-quote muted">${t().introLine}</p>
        <div class="first-wrap">
          <svg class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"></circle></svg>
          <button class="pill first-play" id="firstPlay" aria-label="${t().firstCaption}">▶</button>
        </div>
        <p class="stage-hint">${t().introHint}</p>
      </div>`;
      holdable($('#firstPlay'), 1500, playFirst, $('.first-wrap'));
    }

    // Leiste zum Zurückblättern zu früheren Stimmen (und zur Auflösung)
    const dots = day.voices.map((_, i) =>
      `<button class="pg${i === idx ? ' active' : ''}" data-i="${i}"${i >= shown ? ' disabled' : ''}>${i + 1}</button>`);
    if (state.done) dots.push(`<button class="pg${idx < 0 ? ' active' : ''}" data-i="-1">★</button>`);
    $('#pager').innerHTML = shown ? dots.join('') : '';
    document.querySelectorAll('.pg').forEach(b => {
      b.onclick = () => { const i = +b.dataset.i; viewing = i < 0 ? null : i; renderVoices(); };
    });
    document.querySelectorAll('.play-btn').forEach(b => { b.onclick = () => speak(+b.dataset.i); });
    if (speakingIdx === idx) paintWords(idx, litP); // beim Neuzeichnen den Stand behalten
  }

  // nach einer Stimme: Tipp-Knopf und „nächste Stimme“ leuchten kurz auf – jetzt entscheiden
  function attention() {
    ['#guessBtn', '#nextBtn'].forEach(sel => {
      const box = $(sel).parentNode;
      if ($(sel).disabled && sel === '#nextBtn') return;
      box.classList.remove('attn');
      void box.offsetWidth;
      box.classList.add('attn');
      setTimeout(() => box.classList.remove('attn'), 2600);
    });
    if (!pin) {
      const lens = $('.globe-lens');
      lens.classList.remove('attn'); void lens.offsetWidth; lens.classList.add('attn');
      setTimeout(() => lens.classList.remove('attn'), 2600);
    }
  }

  // --- Raten & Punkte ---
  const sum = a => a.reduce((s, x) => s + x, 0);
  const isFinal = () => state.guesses.length >= TRIES;
  // aktueller Punktestand: Start − Stimmen − Fehlversuche − Abzug beim finalen Tipp
  const score = () => Math.max(0, START_POINTS
    - sum(VOICE_COST.slice(0, state.heard))
    - MISS_COST * state.guesses.filter(g => !g.hit && !g.final).length
    - sum(state.guesses.map(g => g.penalty || 0))) + (state.named?.ok ? state.named.bonus : 0);

  // --- Bonus: das Ereignis benennen (ein Versuch, früher = mehr Punkte) ---
  const norm = x => ` ${x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  function lev(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return d[b.length];
  }
  // richtig, wenn eine erlaubte Antwort im Text vorkommt; bei langen Einzelwörtern sind Tippfehler ok
  function isRightName(text) {
    const input = norm(text);
    const words = input.trim().split(' ');
    return (day.answers || []).some(ans => {
      const a = norm(ans);
      if (input.includes(a)) return true;
      const w = a.trim();
      return !w.includes(' ') && w.length >= 5 && words.some(x => lev(x, w) <= (w.length >= 8 ? 2 : 1));
    });
  }
  const nameBonus = () => NAME_BONUS[Math.max(0, state.heard - 1)];
  let nameOpen = false;
  let remindLater = -1; // „Maybe next guess“: bis zum nächsten Tipp nicht mehr nachfragen
  function renderNameIt() {
    const box = $('#nameIt');
    box.hidden = !state.named && (state.done || state.heard === 0);
    if (box.hidden) return;
    if (state.named) {
      const { ok, text, bonus } = state.named;
      box.className = `name-it answered ${ok ? 'ok' : 'no'}`;
      box.innerHTML = `<span class="ni-mark">${ok ? '✓' : '✕'}</span>
        <span class="ni-text">“${esc(text)}”<small>${ok ? t().nameOk(bonus) : t().nameNo}</small></span>`;
      return;
    }
    if (!nameOpen) {
      // Erinnerung: Pin und Jahr stehen, gleich wird getippt – letzte Gelegenheit für den vollen Bonus
      const remind = !!pin && year != null && remindLater !== state.guesses.length;
      if (remind === box.classList.contains('remind') && $('#niToggle')) {
        $('#niToggle .ni-bonus').textContent = `+${fmt(nameBonus())}`;
        return;
      }
      // vor dem Tippen hebt sich das Feld dreidimensional aus dem Bildschirm; „Maybe next guess“ legt es zurück
      box.className = `name-it${remind ? ' remind' : ''}`;
      box.innerHTML = `<button class="ni-toggle" id="niToggle"><span class="ni-pen">✎</span>${t().nameOpen}<span class="ni-bonus">+${fmt(nameBonus())}</span></button>`
        + (remind ? `<button class="ni-later" id="niLater">${t().nameLater}</button>` : '');
      $('#niToggle').onclick = () => { nameOpen = true; renderNameIt(); $('#niInput').focus(); };
      if (remind) $('#niLater').onclick = () => { remindLater = state.guesses.length; renderNameIt(); };
      return;
    }
    if ($('#niInput')) { box.querySelector('.ni-hint b').textContent = `+${fmt(nameBonus())}`; return; } // Eingabe behalten
    box.className = 'name-it open';
    box.innerHTML = `<form class="ni-form" id="niForm" autocomplete="off">
        <input id="niInput" maxlength="60" placeholder="${t().namePlace}" aria-label="${t().nameOpen}">
        <button class="ni-go" aria-label="Submit">→</button>
      </form>
      <div class="ni-hint">${t().nameHint} · <b>+${fmt(nameBonus())}</b></div>`;
    $('#niInput').onkeydown = e => { if (e.key === 'Escape') { nameOpen = false; renderNameIt(); } };
    $('#niForm').onsubmit = e => {
      e.preventDefault();
      const text = $('#niInput').value.trim();
      if (!text) return;
      const ok = isRightName(text);
      state.named = { text, ok, bonus: ok ? nameBonus() : 0, heard: state.heard };
      if (state.done) state.score = score();
      save();
      if (ok) { floatCost(-state.named.bonus); haptic([40, 60, 80]); } else haptic(30);
      renderNameIt();
      renderControls();
      $('#nameIt').classList.add('fresh');
    };
  }

  function submit() {
    if (!pin || year == null || state.done) return;
    const target = [day.lon, day.lat];
    const km = distanceKm(pin, target);
    const dy = yearOff(day, year); // 0 innerhalb der Spanne, sonst Abstand zum nächsten Ende
    const g = {
      lon: pin[0], lat: pin[1], year, dy, heard: state.heard,
      km: Math.round(km), dir: Math.round(bearing(pin, target)),
    };
    if (isFinal()) {
      g.final = true;
      g.penalty = Math.round((YEAR_COST * Math.abs(dy) + KM_COST * km) / 10) * 10;
    } else {
      g.hit = Math.abs(dy) <= HIT_YEARS && km <= HIT_KM;
    }
    state.guesses.push(g);
    freshTry = state.guesses.length - 1;
    pin = null;
    if (g.hit || g.final) { state.done = true; viewing = null; }
    if (state.done) { state.score = score(); state.endedAt = Date.now(); if (!TEST) Echoes.markPlayed(dayNo); } // für Startseite, Serie, Statistik
    if (state.done && !TEST) EchoesStats.report({ day, dayNo, state, countries }); // anonym für „What everyone guessed“
    save();
    if (state.done) {
      stopSpeaking();
      // vor der Auflösung kurz nach Feedback fragen (einmal pro Tag), dann erst die Lösung zeigen
      if (!state.feedbackAsked && !TEST) {
        state.feedbackAsked = true;
        save();
        EchoesStats.askFeedback({ day, dayNo }).then(reveal);
      } else reveal();
    } else {
      renderAll();
      // Umkreis ganz ins Bild holen: Radius auf dem Bildschirm ≈ scale · sin(Winkel)
      const deg = Math.min(89, g.km / R * 180 / Math.PI);
      flyTo([g.lon, g.lat], Math.max(BASE, Math.min(projection.scale(), 190 / Math.sin(deg * Math.PI / 180))));
    }
  }

  // Auflösung: Ergebnis gestaffelt einblenden, Globus fliegt zur Lösung
  function reveal() {
    const target = [day.lon, day.lat];
    revealing = true;
    renderAll();
    revealing = false;
    flyTo(target).then(() => { echoAt(target); haptic([30, 60, 30, 60, 90]); });
    countUp();
  }

  // Auflösung: Punkte zählen von 10.000 auf das Ergebnis herunter, danach erst der Titel (per CSS-Verzögerung)
  let revealing = false;
  function countUp() {
    const el = $('.result-score .num');
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = score(), from = START_POINTS, t0 = performance.now() + 400, dur = 1300;
    const step = now => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(from);
    requestAnimationFrame(step);
  }

  // Punktestand zählt sichtbar herunter statt zu springen
  let shownScore = null;
  function countScore(to) {
    const el = $('#score');
    const from = shownScore ?? to;
    shownScore = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 700;
    const step = now => {
      if (shownScore !== to) return;
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // „−750“ steigt vom Punktestand auf und verblasst
  function floatCost(c) {
    const f = document.createElement('span');
    f.className = `float-cost${c < 0 ? ' gain' : ''}`;
    f.textContent = c < 0 ? `+${fmt(-c)}` : `−${fmt(c)}`;
    $('.score-line').append(f);
    setTimeout(() => f.remove(), 1200);
  }
  // Echo-Ringe auf dem Globus, dort wo der Tipp liegt
  const gFx = svg.append('g').attr('class', 'fx');
  function echoAt(c) {
    if (!visible(c)) return;
    const [x, y] = projection(c);
    for (let i = 0; i < 3; i++) {
      gFx.append('circle').attr('class', 'echo').attr('cx', x).attr('cy', y).attr('r', 6)
        .transition().delay(i * 180).duration(1100).ease(d3.easeCubicOut)
        .attr('r', 70).style('opacity', 0).remove();
    }
  }

  function renderControls() {
    const attempts = state.guesses.length;
    const n = day.voices.length;
    countScore(score());

    const next = $('#nextBtn');
    $('#nextWrap').hidden = state.done || state.heard === 0; // die erste Stimme startet in der Mitte
    next.disabled = state.heard >= n;
    next.textContent = next.disabled ? '—' : `−${fmt(VOICE_COST[state.heard])}`;
    $('#nextCaption').textContent = next.disabled ? t().allHeard : t().nextCaption;

    // Tipp-Knopf als Abfolge: erst Pin, dann Jahr, dann abgeben
    const step = !pin ? 1 : year == null ? 2 : 3;
    renderNameIt(); // vor dem Tippen den Namens-Bonus hervorheben
    const guess = $('#guessBtn');
    guess.hidden = state.done;
    $('#timeline').hidden = state.done;
    guess.disabled = step < 3;
    guess.textContent = step === 1 ? t().stepPin : step === 2 ? t().stepYear
      : isFinal() ? t().finalGuess : t().guess(attempts + 1);
    $('.globe-lens').classList.toggle('active', !state.done && step === 1);
    $('#timeline').classList.toggle('active', !state.done && step === 2);
    renderYearWindow();
    // die Kosten stehen an den Kreisen; nur die Regel des finalen Tipps braucht eine Zeile
    $('#playHint').textContent = !state.done && isFinal() ? t().finalCost : '';
    $('#playHint').hidden = !$('#playHint').textContent;
    coach();
  }

  // nach Fehlversuchen: welche Jahre noch als richtig zählen können (früher/später engt von beiden Seiten ein)
  function yearWindow() {
    let lo = YEAR_MIN, hi = YEAR_MAX;
    for (const g of state.guesses) {
      if (g.hit || g.final) continue;
      if (Math.abs(g.dy) <= HIT_YEARS) { lo = Math.max(lo, g.year - HIT_YEARS); hi = Math.min(hi, g.year + HIT_YEARS); }
      else if (g.dy < 0) lo = Math.max(lo, g.year + 1); // später: alles bis einschließlich dieses Jahres fällt weg
      else hi = Math.min(hi, g.year - 1);
    }
    return lo === YEAR_MIN && hi === YEAR_MAX ? null : [lo, hi];
  }
  function renderYearWindow() {
    const w = state.done ? null : yearWindow(), el = $('#yearWindow');
    el.hidden = !w;
    if (!w) return;
    // gleiche Skala wie der Regler (1700–2020), damit der Daumen über dem Abschnitt liegt
    const lo = +yearRange.min, hi = +yearRange.max, f = y => Math.max(0, Math.min(1, (y - lo) / (hi - lo)));
    el.style.setProperty('--a', f(w[0] - .5));
    el.style.setProperty('--b', f(w[1] + .5));
    el.title = w[0] === w[1] ? `${w[0]}` : `${w[0]}–${w[1]}`;
    // Pfeile an den Enden, die ein Tipp festgelegt hat: zeigen vom Tipp aus in Richtung der Lösung
    el.classList.toggle('from-lo', w[0] > YEAR_MIN);
    el.classList.toggle('from-hi', w[1] < YEAR_MAX);
  }

  // Hinweis nach einem Fehlversuch: Richtung + Entfernung, früher/später
  const placeTxt = (g, i) => g.km <= HIT_KM ? t().placeOk : t().placeOff(band(g, i));
  const yearTxt = g => Math.abs(g.dy) <= HIT_YEARS ? t().yearOk : g.dy < 0 ? t().yearLater : t().yearEarlier;

  let freshTry = -1; // gerade abgegebener Versuch (für die Animation)
  // drei Versuche als Kreise: ○ ○ ★
  function renderTries() {
    const slots = [];
    for (let i = 0; i <= TRIES; i++) {
      const g = state.guesses[i];
      const final = i === TRIES;
      let cls = 'slot', main = final ? '★' : String(i + 1), sub = final ? t().final : `−${fmt(MISS_COST)}`;
      if (g?.hit) { cls += ' hit'; main = '✓'; sub = t().hit; }
      else if (g?.final) { cls += ' used-final'; sub = `−${fmt(g.penalty)}`; }
      else if (g) { cls += ' miss'; main = '✕'; }
      else if (!state.done && i === state.guesses.length) cls += ' current';
      else if (state.done) cls += ' unused';
      if (i === freshTry) cls += ' fresh';
      const info = g && !g.hit && !g.final
        ? `<span class="slot-info">${g.km <= HIT_KM ? '◎ ' + t().near : band(g, i).map(fmt).join('–') + ' km'}</span>`
        : '';
      const title = g && !g.hit && !g.final ? ` title="${placeTxt(g, i)}. ${yearTxt(g)}."` : '';
      slots.push(`<div class="${cls}"${title}><span class="slot-main">${main}</span><span class="slot-sub">${sub}</span>${info}</div>`);
    }
    $('#tries').innerHTML = slots.join('');
    freshTry = -1;
  }

  function shareText() {
    const voices = day.voices.map((_, i) => i < state.heard ? '🔊' : '▫️').join('');
    const tries = state.guesses.map(g => g.final ? '🎯' : g.hit ? '✅' : '❌').join('') + (state.named?.ok ? ' ✍️' : '');
    return `Echoes #${dayNo} · ${fmt(score())}/10.000\n${voices}\n${tries}`;
  }

  function resultHtml() {
    const last = state.guesses[state.guesses.length - 1];
    const streak = Echoes.streak(dayNo);
    // --d: wann das Element bei der Auflösung erscheint (nur direkt nach dem letzten Tipp)
    const d = s => revealing ? ` style="--d:${s}s"` : '';
    return `<div class="voice-stage result${revealing ? ' staged' : ' fresh'}">
      <div class="who-line"${d(0)}>${t().solved}</div>
      <h2${d(2)}>${esc(day.title)}</h2>
      <p class="when"${d(2.2)}>${esc(day.date)} · ${esc(day.place)}</p>
      <div class="result-score"${d(0.2)}><span class="num">${fmt(score())}</span> <small>${t().score}</small></div>
      <p${d(1.5)}>${last.final ? t().resultFinal(Math.abs(last.dy), last.km, last.penalty)
        : t().resultHit(last.heard, state.guesses.length)}</p>
      ${state.named?.ok ? `<p class="named"${d(1.7)}>${t().resultNamed(state.named.bonus)}</p>` : ''}
      <p class="summary"${d(2.6)}>${esc(day.summary)}</p>
      <p class="when"${d(2.9)}>${t().notes}</p>
      <div class="result-actions"${d(3)}>
        ${TEST ? '<button class="pill" id="againBtn">Play again</button>' : `<button class="pill" id="shareBtn">${t().share}</button>`}
        ${EchoesStats.available() && !TEST ? `<button class="pill ghost" id="statsBtn">${t().everyone}</button>` : ''}
      </div>
      <p class="come-back"${d(3.2)}>${streak > 1 ? `<b>${t().streak(streak)}</b> · ` : ''}<span id="nextIn">${t().nextIn(Echoes.untilMidnight())}</span></p>
    </div>`;
  }

  setInterval(() => { const el = $('#nextIn'); if (el) el.textContent = t().nextIn(Echoes.untilMidnight()); }, 1000);

  function renderStatic() {
    $('#dayLabel').textContent = t().day(dayNo);
    $('#scoreLabel').textContent = t().score;
    $('#protoLabel').textContent = t().proto;
    $('#dayLinks').innerHTML = Echoes.dayLinks('play.html');
    $('#resetBtn').textContent = t().reset;
  }

  function renderAll() {
    renderStatic();
    renderVoices();
    renderControls();
    renderTries();
    renderNameIt();
    drawGlobe();
  }

  function nextVoice() {
    if (state.heard >= day.voices.length || state.done) return;
    state.heard++;
    if (state.heard === 1) state.startedAt = Date.now(); // für die Spieldauer in der Statistik
    viewing = null;
    save();
    renderVoices();
    renderControls();
    renderNameIt(); // Bonus sinkt mit jeder Stimme
    setTimeout(coach, 900);
    // echte Aufnahmen starten sofort, die Browser-Stimme nur auf Knopfdruck
    if (recorded(state.heard - 1)) speak(state.heard - 1);
  }
  // nächste Stimme: Ring läuft um den Knopf, Kosten fliegen vom Punktestand weg
  holdable($('#nextBtn'), 1000, () => {
    if (state.heard >= day.voices.length || state.done) return;
    floatCost(VOICE_COST[state.heard]);
    nextVoice();
  }, $('#nextBtn').parentNode);

  // Haptik: Android über navigator.vibrate, iPhone (iOS 18+) über einen versteckten Switch,
  // dessen Umschalten das Telefon kurz „klicken“ lässt
  let iosSwitch = null;
  function haptic(pattern) {
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    if (!iosSwitch) {
      iosSwitch = document.createElement('label');
      iosSwitch.className = 'haptic';
      iosSwitch.innerHTML = '<input type="checkbox" switch>';
      document.body.append(iosSwitch);
    }
    const ticks = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    for (let i = 0; i < ticks; i++) setTimeout(() => iosSwitch.click(), i * 90);
  }

  // Gedrückt halten statt klicken: bei Aktionen, die Punkte kosten.
  // `box` bekommt .holding (Fortschritt läuft, Dauer in --hold) und danach kurz .held.
  function holdable(btn, ms, onDone, box = btn) {
    let timer = null;
    box.style.setProperty('--hold', `${ms}ms`);
    const start = e => {
      if (timer || btn.disabled || btn.classList.contains('go')) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'pointerdown' && e.button > 0) return;
      e.preventDefault();
      box.classList.remove('held');
      box.classList.add('holding');
      haptic(12);
      timer = setTimeout(() => {
        timer = null;
        box.classList.remove('holding');
        void box.offsetWidth; // Animation neu starten
        box.classList.add('held');
        setTimeout(() => box.classList.remove('held'), 700);
        haptic([40, 60, 80]);
        onDone();
      }, ms);
    };
    const stop = e => {
      if (!timer) return;
      if (e.type === 'keyup' && e.key !== 'Enter' && e.key !== ' ') return;
      clearTimeout(timer); timer = null;
      box.classList.remove('holding'); // Fortschritt läuft zurück
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('keydown', start);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => e.preventDefault());
  }

  // Hinweise beim ersten Spielen: immer nur einer, direkt am Element; verschwindet, sobald man es tut
  const COACH = [
    { id: 'globe', el: '.globe-lens', side: 'right', when: () => state.heard >= 1 && !pin && !state.guesses.length },
    { id: 'year', el: '#timeline', side: 'right', when: () => !!pin && year == null },
    { id: 'lock', el: '#guessBtn', side: 'right', when: () => !!pin && year != null && !state.guesses.length },
    { id: 'miss', el: '#tries', side: 'right', when: () => state.guesses.length > 0 && !pin },
    { id: 'next', el: '#nextBtn', when: () => state.guesses.length > 0 && state.heard < day.voices.length && !!pin },
  ];
  const coachSeen = new Set(store.get('echoes.coach') || []);
  let coachNow = null;
  function coach() {
    const tip = state.done ? null : COACH.find(c => !coachSeen.has(c.id) && c.when());
    if (coachNow && coachNow !== tip) {
      // der vorige Hinweis hat sich erledigt
      coachSeen.add(coachNow.id);
      store.set('echoes.coach', [...coachSeen]);
      $('.coach')?.remove();
      coachNow = null;
    }
    if (!tip || tip === coachNow || document.body.classList.contains('veiled')) return;
    coachNow = tip;
    const el = document.createElement('div');
    el.className = 'coach';
    el.innerHTML = `<p>${t().coach[tip.id]}</p><button class="textbtn">${t().coach.ok}</button>`;
    el.querySelector('button').onclick = () => {
      coachSeen.add(tip.id);
      store.set('echoes.coach', [...coachSeen]);
      el.remove();
      coachNow = null;
      coach();
    };
    document.body.append(el);
    placeCoach();
  }
  function placeCoach() {
    const el = $('.coach');
    if (!el || !coachNow) return;
    const r = $(coachNow.el).getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    // links im Spielbereich: neben das Element, damit nichts verdeckt wird
    const right = coachNow.side === 'right' && r.right + w + 24 < innerWidth;
    el.classList.toggle('right', right);
    if (right) {
      el.classList.remove('above');
      el.style.left = `${r.right + 16 + scrollX}px`;
      el.style.top = `${r.top + Math.min(r.height / 2, 120) - 24 + scrollY}px`;
      return;
    }
    const below = r.bottom + h + 16 < innerHeight;
    el.classList.toggle('above', !below);
    el.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + scrollX}px`;
    el.style.top = `${(below ? r.bottom + 12 : r.top - h - 12) + scrollY}px`;
    el.style.setProperty('--ax', `${r.left + r.width / 2 - parseFloat(el.style.left) + scrollX}px`);
  }
  addEventListener('resize', placeCoach);

  // erste Stimme: Knopf federt, Schallwellen laufen nach außen („Echo“), dann erscheint die Stimme
  function playFirst() {
    const btn = $('#firstPlay');
    if (btn.classList.contains('go')) return;
    // bleibt nach dem Halten sichtbar gefüllt, bis der Ring ausblendet
    btn.parentNode.classList.add('done');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { nextVoice(); return; }
    btn.classList.add('go');
    const wrap = btn.parentNode;
    for (let i = 0; i < 4; i++) {
      const ring = document.createElement('span');
      ring.className = 'echo-ring';
      ring.style.animationDelay = `${i * 260}ms`;
      wrap.append(ring);
    }
    $('.voice-stage').classList.add('leaving');
    // Spielfeld fliegt von unten herein, kurz nachdem die Stimme startet
    setTimeout(() => {
      document.body.classList.add('arriving');
      document.body.classList.remove('veiled');
      setTimeout(() => document.body.classList.remove('arriving'), 1900);
    }, 500);
    setTimeout(nextVoice, 1400);
  }
  // Tipp abgeben: Ring um den Knopf, danach Echo-Ringe am Pin auf dem Globus
  holdable($('#guessBtn'), 1000, () => {
    if (pin) echoAt(pin);
    submit();
  }, $('#guessBtn').parentNode);
  $('#helpBtn').onclick = () => Echoes.showGuide();
  $('#resetBtn').onclick = () => { store.del(KEY); location.reload(); };
  if (TEST) {
    document.body.classList.add('test-play');
    const tag = document.createElement('div');
    tag.className = 'test-tag';
    tag.innerHTML = 'Test play · not saved, not counted · <button class="link">restart</button>';
    tag.querySelector('button').onclick = () => location.reload();
    document.body.append(tag);
    document.addEventListener('click', e => { if (e.target.closest('#againBtn')) location.reload(); });
  }

  renderAll();
  setYear(null);
  // Übergänge erst nach dem ersten Zeichnen, damit beim Laden nichts verschwimmt
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
  if (state.done) flyTo([day.lon, day.lat]);
})();
