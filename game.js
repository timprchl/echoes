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
    introHint: c => `Hold to play the first voice (−${fmt(c)})`,
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
    compass: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
    placeOk: 'Place: right area',
    placeOff: (dir, km) => `Place: about ${fmt(km)} km off – head ${dir}`,
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
      miss: 'A miss. The arrow on the globe shows which way to look – earlier or later is in the red circle.',
      next: 'Stuck? Another voice brings you closer to the moment – but costs points.',
      ok: 'Got it',
    },
    play: 'Listen',
    score: 'points',
    nameOpen: 'Name the event',
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
  function bearing([lon1, lat1], [lon2, lat2]) {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
      Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // --- Globus ---
  const W = 500, BASE = 230;
  const svg = d3.select('#globe');
  const projection = d3.geoOrthographic().translate([W / 2, W / 2]).scale(BASE).clipAngle(90).rotate([-10, -30]);
  const path = d3.geoPath(projection);
  const gSphere = svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere');
  const gGrat = svg.append('path').datum(d3.geoGraticule10()).attr('class', 'grat');
  const gLand = svg.append('g');
  const gArcs = svg.append('g');
  const gHint = svg.append('g').attr('class', 'miss-hint');
  const gMarks = svg.append('g');
  svg.append('defs').html('<marker id="arrowHead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"></path></marker>');
  let countries = [];

  const center = () => { const r = projection.rotate(); return [-r[0], -r[1]]; };
  const visible = c => d3.geoDistance(c, center()) < Math.PI / 2 - 0.02;

  function drawGlobe() {
    gSphere.attr('d', path);
    gGrat.attr('d', path);
    gLand.selectAll('path').data(countries).join('path').attr('class', 'land').attr('d', path);

    const target = [day.lon, day.lat];
    const arcs = state.done ? state.guesses.filter(g => !g.hit).map(g => ({
      type: 'LineString', coordinates: [[g.lon, g.lat], target],
    })) : [];
    gArcs.selectAll('path').data(arcs).join('path').attr('class', 'arc').attr('d', path);

    // nach einem Fehlversuch: Pfeil vom letzten Tipp in die richtige Richtung (ein Stück weit, nicht bis zum Ziel)
    const last = state.guesses[state.guesses.length - 1];
    const hint = !state.done && last && !last.hit && last.km > HIT_KM ? (() => {
      const from = [last.lon, last.lat];
      const to = d3.geoInterpolate(from, target)(Math.min(0.45, 2600 / last.km));
      return { line: { type: 'LineString', coordinates: [from, to] }, to, km: last.km };
    })() : null;
    gHint.selectAll('path').data(hint ? [hint] : []).join('path')
      .attr('class', 'hint-arrow').attr('marker-end', 'url(#arrowHead)').attr('d', h => path(h.line));
    gHint.selectAll('text').data(hint && visible(hint.to) ? [hint] : []).join('text')
      .attr('class', 'hint-label').attr('transform', h => `translate(${projection(h.to)})`).attr('dy', -10)
      .text(h => `${fmt(h.km)} km`);

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

  let moved = 0;
  svg.call(d3.drag()
    .container(function () { return this; })
    .on('start', () => { moved = 0; })
    .on('drag', e => {
      moved += Math.abs(e.dx) + Math.abs(e.dy);
      const k = 75 / projection.scale();
      const [l, p] = projection.rotate();
      projection.rotate([l + e.dx * k, Math.max(-80, Math.min(80, p - e.dy * k))]);
      drawGlobe();
    })
    .on('end', e => {
      if (moved > 4 || state.done) return;
      const c = projection.invert([e.x, e.y]);
      if (c && visible(c)) { pin = c; haptic(8); drawGlobe(); renderControls(); }
    }));

  function zoom(f) {
    projection.scale(Math.max(BASE, Math.min(BASE * 8, projection.scale() * f)));
    drawGlobe();
  }
  svg.node().addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
  $('#zoomIn').onclick = () => zoom(1.4);
  $('#zoomOut').onclick = () => zoom(1 / 1.4);

  function flyTo([lon, lat], scale = BASE * 1.6) {
    const from = projection.rotate();
    const to = [-lon, -lat];
    // kürzester Weg in Längenrichtung
    while (to[0] - from[0] > 180) to[0] -= 360;
    while (from[0] - to[0] > 180) to[0] += 360;
    const ri = d3.interpolate(from, to);
    const si = d3.interpolate(projection.scale(), scale);
    return d3.transition().duration(1200).tween('fly', () => tt => {
      projection.rotate(ri(tt)).scale(si(tt));
      drawGlobe();
    }).end().catch(() => {});
  }

  d3.json('vendor/countries-110m.json').then(world => {
    countries = topojson.feature(world, world.objects.countries).features;
    drawGlobe();
  });

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
    // vor der ersten Stimme liegt alles außer der Mitte unscharf im Hintergrund
    document.body.classList.toggle('veiled', !state.done && state.heard === 0);

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
        <p class="stage-hint">${t().introHint(VOICE_COST[0])}</p>
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
      box.className = 'name-it';
      box.innerHTML = `<button class="ni-toggle" id="niToggle"><span class="ni-pen">✎</span>${t().nameOpen}<span class="ni-bonus">+${fmt(nameBonus())}</span></button>`;
      $('#niToggle').onclick = () => { nameOpen = true; renderNameIt(); $('#niInput').focus(); };
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
      flyTo([g.lon, g.lat], projection.scale()); // Pfeil zum Ziel ins Bild drehen
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
    const guess = $('#guessBtn');
    guess.hidden = state.done;
    $('#timeline').hidden = state.done;
    guess.disabled = step < 3;
    guess.textContent = step === 1 ? t().stepPin : step === 2 ? t().stepYear
      : isFinal() ? t().finalGuess : t().guess(attempts + 1);
    $('.globe-lens').classList.toggle('active', !state.done && step === 1);
    $('#timeline').classList.toggle('active', !state.done && step === 2);
    // die Kosten stehen an den Kreisen; nur die Regel des finalen Tipps braucht eine Zeile
    $('#playHint').textContent = !state.done && isFinal() ? t().finalCost : '';
    $('#playHint').hidden = !$('#playHint').textContent;
    coach();
  }

  // Hinweis nach einem Fehlversuch: Richtung + Entfernung, früher/später
  const compass = deg => t().compass[Math.round(deg / 45) % 8];
  const placeTxt = g => g.km <= HIT_KM ? t().placeOk : t().placeOff(compass(g.dir), g.km);
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
        ? `<span class="slot-info">${g.km <= HIT_KM ? '◎' : `<b style="transform:rotate(${g.dir}deg)">↑</b>`} ${fmt(g.km)} km<br>${g.year} · ${Math.abs(g.dy) <= HIT_YEARS ? '✓' : g.dy < 0 ? 'later' : 'earlier'}</span>`
        : '';
      const title = g && !g.hit && !g.final ? ` title="${placeTxt(g)}. ${yearTxt(g)}."` : '';
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
    document.body.classList.remove('veiled'); // Hintergrund wird langsam scharf
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
