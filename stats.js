// Ergebnisseite „What everyone guessed“: wann die Spieler es erkannt haben, wo und wann sie getippt haben.
// Die Zahlen aller Spieler kommen vom Statistik-Server (ECHOES_STATS_URL, siehe stats-server/).
// Ohne Server gibt es im Entwicklermodus Beispielzahlen; echte Spieler sehen dann den Knopf nicht.
// report() meldet am Ende einer Runde das eigene, anonyme Ergebnis.
window.EchoesStats = (() => {
  const { fmt, DEV } = Echoes;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const AT_SEA = 'At sea';
  // Land unter einem Punkt; an Küsten ist die grobe Weltkarte ungenau, darum auch knapp daneben suchen (≈ 50–100 km)
  function countryAt(countries, [lon, lat]) {
    const hit = c => countries.find(f => d3.geoContains(f, c))?.properties.name;
    for (const r of [0, 0.5, 1]) {
      for (const [dx, dy] of r ? [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]] : [[0, 0]]) {
        const name = hit([lon + dx, lat + dy]);
        if (name) return name;
      }
    }
    return AT_SEA;
  }

  // Wie die eigene Runde ausging: 'first' | 'second' (Treffer) oder 'final'
  const outcome = state => {
    const hit = state.guesses.findIndex(g => g.hit);
    return hit === 0 ? 'first' : hit === 1 ? 'second' : 'final';
  };

  async function load(day, dayNo, mine) {
    if (window.ECHOES_STATS_URL) {
      try {
        const r = await fetch(`${window.ECHOES_STATS_URL}/api/stats?day=${dayNo}`);
        if (r.ok) return await r.json();
      } catch {}
    }
    return DEV ? demo(day, mine) : null;
  }

  // --- Beispielzahlen (nur Entwicklermodus), pro Tag immer gleich ---
  function rng(seed) {
    let a = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Anteile auf ganze Prozent verteilen, die zusammen 100 ergeben
  function toPercent(weights) {
    const sum = weights.reduce((s, w) => s + w, 0);
    const raw = weights.map(w => w / sum * 100);
    const out = raw.map(Math.floor);
    let left = 100 - out.reduce((s, x) => s + x, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
    return out;
  }
  function demo(day, mine) {
    const r = rng(day.id);
    // wann: Spalten Stimme 1–5, jeweils 1. Tipp / 2. Tipp / final
    const shape = [4, 11, 24, 27, 22].map(w => w * (0.7 + r() * 0.6));
    const cols = toPercent(shape).map((n, v) => {
      const pFirst = 0.5 + r() * 0.15, pFinal = 0.08 + v * 0.07;
      const first = Math.round(n * pFirst), final = Math.round(n * pFinal);
      return { first, second: Math.max(0, n - first - final), final: Math.min(final, n - first) };
    });
    // wo: Länder in der Nähe der Antwort, die Antwort am häufigsten
    const near = mine.countries
      .map(f => ({ name: f.properties.name, d: d3.geoDistance(d3.geoCentroid(f), [day.lon, day.lat]) }))
      .sort((a, b) => a.d - b.d);
    const names = [mine.answerPlace, ...near.map(n => n.name).filter(n => n !== mine.answerPlace)].slice(0, 6);
    let top = 45 + r() * 20;
    const places = names.map((name, i) => {
      const pct = i === 0 ? top : Math.max(2, top * (0.18 + r() * 0.2) / i);
      return { name, pct: Math.round(pct) };
    });
    mine.places.forEach(p => { if (!places.some(x => x.name === p)) places.push({ name: p, pct: 1 + Math.floor(r() * 3) }); });
    // wann (Jahr): Jahrzehnte um die Antwort herum
    const answerDec = Math.floor(day.year / 10) * 10;
    const decades = {};
    for (let d = Echoes.YEAR_MIN; d <= 2020; d += 10) {
      const k = (d - answerDec) / 10;
      decades[d] = Math.exp(-(k * k) / (2 * 1.6 ** 2)) * (0.7 + r() * 0.6) + r() * 0.03;
    }
    const pct = toPercent(Object.values(decades));
    Object.keys(decades).forEach((d, i) => { decades[d] = pct[i]; });
    return { players: 1200 + Math.floor(r() * 4000), demo: true, cols, places, decades };
  }

  // --- Darstellung ---
  const KIND = ['first', 'second', 'final'];
  function dotsHtml(col, you) {
    const dots = [];
    KIND.forEach(k => { for (let i = 0; i < col[k]; i++) dots.push(k); });
    // die eigene Runde als farbiger Punkt in ihrer Gruppe
    if (you) {
      const at = dots.lastIndexOf(you);
      if (at >= 0) dots[at] = 'you'; else dots.push('you');
    }
    return dots.map(k => `<i class="dot ${k}"></i>`).join('');
  }

  function render(el, s, ctx) {
    const { day, dayNo, mine } = ctx;
    const youCol = mine.heard - 1;
    const sumCol = c => c.first + c.second + c.final;
    const decs = Object.entries(s.decades).map(([d, p]) => [+d, p]);
    const maxDec = Math.max(...decs.map(([, p]) => p), 1);
    // alle Jahrzehnte, die das Ereignis berührt, gelten als Antwort
    const isAnswerDec = d => d >= Math.floor(day.year / 10) * 10 && d <= Math.floor((day.yearEnd ?? day.year) / 10) * 10;
    const maxPlace = Math.max(...s.places.map(p => p.pct), 1);
    const places = [...s.places].sort((a, b) => (b.name === mine.answerPlace) - (a.name === mine.answerPlace) || b.pct - a.pct);

    el.innerHTML = `
      <button class="circle stats-close" data-close aria-label="Close">×</button>
      <div class="stats-inner">
        <div class="eyebrow">Echoes #${String(dayNo).padStart(3, '0')} · ${esc(day.title)}</div>
        <h2>What everyone guessed</h2>
        ${s.demo ? '<p class="stats-demo">Sample numbers – real stats appear once the game is online.</p>' : ''}

        <div class="stats-head"><span>When they found it</span><span>Each dot is 1 in 100 players</span></div>
        <div class="dot-chart">
          ${s.cols.map((c, i) => `<button class="dot-col${i === youCol ? ' mine' : ''}" data-col="${i}">
            ${i === youCol ? '<span class="you-tag">You</span>' : ''}
            <span class="dots">${dotsHtml(c, i === youCol ? mine.outcome : null)}</span>
            <span class="col-label">${i + 1}</span>
          </button>`).join('')}
        </div>
        <div class="dot-axis">Voices heard</div>
        <div class="legend">
          <span><i class="dot first"></i>1st guess</span><span><i class="dot second"></i>2nd guess</span>
          <span><i class="dot final"></i>Final guess</span><span><i class="dot you"></i>You</span>
        </div>
        <p class="stats-detail" id="colDetail">Point at or tap a group for its numbers.</p>

        <div class="stats-head"><span>Where they guessed</span><span>Players who tried each</span></div>
        <ul class="place-list">
          ${places.map(p => `<li>
            <span class="place-name">${esc(p.name)}${p.name === mine.answerPlace ? '<em>Answer</em>' : ''}${mine.places.includes(p.name) ? '<em class="you">You</em>' : ''}</span>
            <span class="bar"><i style="width:${p.pct / maxPlace * 100}%"${p.name === mine.answerPlace ? ' class="on"' : ''}></i></span>
            <span class="pct">${p.pct}%</span>
          </li>`).join('')}
        </ul>

        <div class="stats-head"><span>When they guessed</span><span>Share of guesses per decade</span></div>
        <div class="decades">
          ${decs.map(([d, p]) => `<span class="dec${isAnswerDec(d) ? ' answer' : ''}${mine.decades.includes(d) ? ' you' : ''}" title="${d}s · ${p}%">
            <i style="height:${Math.max(2, p / maxDec * 100)}%"></i>
          </span>`).join('')}
        </div>
        <div class="dec-axis">${[1700, 1750, 1800, 1850, 1900, 1950, 2000].map(y => `<span style="left:${(y - Echoes.YEAR_MIN) / (2030 - Echoes.YEAR_MIN) * 100}%">${y}</span>`).join('')}</div>
        <div class="legend"><span><i class="sq answer"></i>${Echoes.yearLabel(day)}</span><span><i class="sq you"></i>Your guesses</span></div>
        ${s.players ? `<p class="stats-foot">${fmt(s.players)} players today</p>` : ''}
      </div>`;

    const detail = el.querySelector('#colDetail');
    el.querySelectorAll('.dot-col').forEach(b => {
      const show = () => {
        const c = s.cols[+b.dataset.col], n = sumCol(c);
        detail.textContent = `${n}% found it after ${+b.dataset.col + 1} ${+b.dataset.col ? 'voices' : 'voice'} – ${c.first}% on the 1st guess, ${c.second}% on the 2nd, ${c.final}% needed the final guess.`;
      };
      b.onpointerenter = show;
      b.onclick = show;
    });
  }

  // ctx: { day, dayNo, state, countries }
  async function open(ctx) {
    const { day, state, countries } = ctx;
    const mine = {
      countries,
      heard: state.heard,
      outcome: outcome(state),
      answerPlace: countryAt(countries, [day.lon, day.lat]),
      places: [...new Set(state.guesses.map(g => countryAt(countries, [g.lon, g.lat])))],
      decades: [...new Set(state.guesses.map(g => Math.floor(g.year / 10) * 10))],
    };
    let el = document.querySelector('.stats');
    if (!el) {
      el = document.createElement('section');
      el.className = 'stats';
      document.body.append(el);
      el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }
    const s = await load(day, ctx.dayNo, mine);
    if (!s) return false;
    render(el, s, { ...ctx, mine });
    el.hidden = false;
    document.body.classList.add('stats-open');
    requestAnimationFrame(() => el.classList.add('in'));
    return true;
  }
  function close() {
    const el = document.querySelector('.stats');
    if (!el || el.hidden) return;
    el.classList.remove('in');
    document.body.classList.remove('stats-open');
    setTimeout(() => { el.hidden = true; }, 300);
  }

  // gibt es Zahlen, die man zeigen kann?
  const available = () => DEV || !!window.ECHOES_STATS_URL;

  // eigenes Ergebnis anonym melden (einmal pro Gerät und Tag; Fehler stören das Spiel nicht)
  function report({ day, dayNo, state, countries }) {
    if (!window.ECHOES_STATS_URL || !state.done) return Promise.resolve();
    const body = {
      dayNo, dayId: day.id, device: Echoes.deviceId(), heard: Math.max(1, state.heard), outcome: outcome(state),
      score: Math.max(0, Math.round(state.score ?? 0)), named: !!state.named?.ok,
      archive: !!Echoes.ARCHIVE, // nachgespielter Tag aus dem Archiv – zählt getrennt von den Tageszahlen
      guesses: state.guesses.map(g => ({
        country: countries.length ? countryAt(countries, [g.lon, g.lat]) : AT_SEA,
        decade: Math.max(Echoes.YEAR_MIN, Math.min(2020, Math.floor(g.year / 10) * 10)),
        km: Math.min(21000, Math.max(0, Math.round(g.km ?? 0))),
        years: Math.min(300, Math.abs(Math.round(g.dy ?? 0))),
      })),
    };
    // Spieldauer von der ersten Stimme bis zum letzten Tipp (nur wenn plausibel)
    const secs = state.startedAt && state.endedAt ? Math.round((state.endedAt - state.startedAt) / 1000) : null;
    if (secs > 0 && secs <= 86400) body.seconds = secs;
    return fetch(`${window.ECHOES_STATS_URL}/api/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {});
  }

  // kurze Frage vor der Auflösung: wie schwer war es, und optional ein Satz. Ergebnis: Promise, das nach
  // „Send“ oder „Skip“ erfüllt wird – erst dann zeigt das Spiel die Lösung.
  function askFeedback({ day, dayNo }) {
    if (!window.ECHOES_STATS_URL) return Promise.resolve();
    return new Promise(done => {
      const dlg = document.createElement('dialog');
      dlg.className = 'fb';
      let choice = null;
      dlg.innerHTML = `
        <div class="eyebrow">Before the answer</div>
        <h2>How was today’s round?</h2>
        <div class="fb-choices">
          <button data-d="easy">Too easy</button><button data-d="right">Just right</button><button data-d="hard">Too hard</button>
        </div>
        <textarea maxlength="500" rows="3" placeholder="Anything else? Ideas, confusing voices, bugs … (optional)"></textarea>
        <p class="fb-note">Anonymous – please don’t write your name or other personal details.</p>
        <div class="fb-actions"><button class="textbtn" data-skip>Skip</button><button class="pill" data-send disabled>Send &amp; show answer</button></div>`;
      document.body.append(dlg);
      const send = dlg.querySelector('[data-send]');
      const ta = dlg.querySelector('textarea');
      const update = () => { send.disabled = !choice && !ta.value.trim(); };
      dlg.querySelectorAll('[data-d]').forEach(b => {
        b.onclick = () => { choice = b.dataset.d; dlg.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b)); update(); };
      });
      ta.oninput = update;
      const finish = () => { dlg.close(); dlg.remove(); done(); };
      dlg.querySelector('[data-skip]').onclick = finish;
      dlg.addEventListener('cancel', e => { e.preventDefault(); finish(); });
      send.onclick = () => {
        fetch(`${window.ECHOES_STATS_URL}/api/feedback`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayNo, dayId: day.id, device: Echoes.deviceId(), difficulty: choice, text: ta.value.trim() }),
        }).catch(() => {});
        finish();
      };
      dlg.showModal();
    });
  }

  return { open, close, available, report, askFeedback };
})();
