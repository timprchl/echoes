(() => {
  const { store, fmt } = Echoes;
  const $ = s => document.querySelector(s);

  const STR = {
    day: n => `No. ${String(n).padStart(3, '0')}`,
    headline: 'Who was there?',
    date: d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    title: 'Five voices.<br>One moment in history.',
    sub: 'Listen to people who were there – and work out when and where it happened. A new event every day.',
    play: '▶  Play today’s event',
    resume: '▶  Continue',
    result: 'See your result',
    guide: 'How it works',
    played: (p, s) => `Played today · ${fmt(p)} points${s > 1 ? ` · ${s}-day streak` : ''}`,
    next: t => `Next event in ${t}`,
    proto: 'Prototype – pick a day:',
  };
  const t = () => STR;

  const { no: dayNo, key } = Echoes.currentDay();
  let state = store.get(key);
  // nach dem Abgleich mit dem Konto: heutiger Stand und Serie können sich geändert haben
  document.addEventListener('echoes:synced', () => { state = store.get(key); render(); });

  function render() {
    $('#dayLabel').textContent = `${t().day(dayNo)} · ${t().date(Echoes.dateOfNo(dayNo))}`;
    $('#headline').textContent = t().headline;
    $('#eyebrow').textContent = t().day(dayNo);
    $('#heroTitle').innerHTML = t().title;
    $('#heroSub').textContent = t().sub;
    $('#guideLink').textContent = t().guide;
    $('#guideBtn').textContent = t().guide;
    $('#archiveLink').hidden = !(Echoes.ARCHIVE_OPEN || window.EchoesAccount?.available());

    const play = $('#playBtn');
    play.href = Echoes.withDay('play.html');
    play.textContent = state?.done ? t().result : state?.heard ? t().resume : t().play;
    $('#played').hidden = !state?.done;
    if (state?.done) $('#played').textContent = t().played(state.score ?? 0, Echoes.streak(dayNo));

    $('#protoLabel').textContent = t().proto;
    $('#dayLinks').innerHTML = Echoes.dayLinks('play.html');
    tick();
  }

  // Countdown bis Mitternacht (dann gibt es ein neues Ereignis)
  const tick = () => { $('#countdown').textContent = t().next(Echoes.untilMidnight()); };
  setInterval(tick, 1000);

  $('#guideBtn').onclick = $('#guideLink').onclick = $('#helpBtn').onclick = () => Echoes.showGuide();

  // Langsam drehender Deko-Globus
  const projection = d3.geoOrthographic().translate([250, 250]).scale(230).clipAngle(90).rotate([-10, -25]);
  const path = d3.geoPath(projection);
  const svg = d3.select('#heroGlobe');
  const sphere = svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere');
  const grat = svg.append('path').datum(d3.geoGraticule10()).attr('class', 'grat');
  const land = svg.append('g');
  let countries = [];
  const draw = () => {
    sphere.attr('d', path);
    grat.attr('d', path);
    land.selectAll('path').data(countries).join('path').attr('class', 'land').attr('d', path);
  };
  d3.json('vendor/countries-110m.json').then(world => {
    countries = topojson.feature(world, world.objects.countries).features;
    draw();
  });
  // Globus lässt sich mit der Maus drehen und hat Schwung; ein Klick stößt ihn leicht an.
  // Ohne Eingriff pendelt er sich wieder auf die langsame Eigendrehung ein.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPIN = still ? 0 : 0.08;   // Grad pro Frame
  let vel = [SPIN, 0];
  let dragging = false, moved = 0, lastT = 0;
  const node = svg.node();
  svg.call(d3.drag()
    .container(function () { return this; })
    .on('start', () => { dragging = true; moved = 0; vel = [0, 0]; node.classList.add('grabbing'); })
    .on('drag', e => {
      moved += Math.abs(e.dx) + Math.abs(e.dy);
      const k = 0.35;
      const [l, p] = projection.rotate();
      projection.rotate([l + e.dx * k, Math.max(-60, Math.min(60, p - e.dy * k))]);
      // Schwung aus der letzten Bewegung
      const now = performance.now(), dt = Math.max(8, now - lastT) / 16.7;
      lastT = now;
      vel = [e.dx * k / dt, -e.dy * k / dt];
      draw();
    })
    .on('end', e => {
      dragging = false;
      node.classList.remove('grabbing');
      if (performance.now() - lastT > 80) vel = [0, 0]; // losgelassen ohne Bewegung
      if (moved < 4) {
        // Klick: leichter Stoß von der Seite, auf die geklickt wurde
        const [cx, cy] = [250, 250];
        vel = [(e.x < cx ? 1 : -1) * 1.8, (e.y < cy ? -1 : 1) * 0.3];
      }
    }));
  d3.timer(() => {
    if (dragging) return;
    const [l, p] = projection.rotate();
    projection.rotate([l + vel[0], Math.max(-60, Math.min(60, p + vel[1]))]);
    // Schwung klingt ab, zurück zur Eigendrehung
    vel = [SPIN + (vel[0] - SPIN) * 0.965, vel[1] * 0.94];
    draw();
  });

  render();
})();
