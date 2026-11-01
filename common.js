// Gemeinsame Bausteine für Startseite und Spiel: Regeln, Tag, Sprache, Speicher, Guide.
window.Echoes = (() => {
  const START = new Date(2026, 10, 1); // Tag 1 = 1. November 2026

  // Entwicklermodus: lokal oder mit ?dev. Nur dann gibt es Tagwahl (?day=N) und „Reset day“;
  // echte Spieler bekommen immer den heutigen Tag und landen nach dem Spielen beim Ergebnis.
  const params = new URLSearchParams(location.search);
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || params.has('dev');

  // Punkte: alle starten mit 10.000. Jede gehörte Stimme und jeder Fehlversuch kostet.
  const RULES = {
    START_POINTS: 10000,
    VOICE_COST: [500, 750, 1000, 1000, 1000],
    MISS_COST: 750,     // pro Fehlversuch bei Tipp 1–2
    TRIES: 2,           // Tipps mit Treffer-Prüfung; danach kommt der finale Tipp
    YEAR_COST: 150,     // finaler Tipp: pro Jahr daneben …
    KM_COST: 100 / 500, // … und pro km daneben (100 Punkte je 500 km)
    HIT_YEARS: 1,       // Treffer: Jahr ±1 …
    HIT_KM: 600,        // … und höchstens so weit entfernt
    NAME_BONUS: [1500, 1200, 900, 600, 300], // Event richtig benannt, je nach gehörten Stimmen (ein Versuch)
  };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const fmt = n => Math.round(n).toLocaleString('en-GB');

  // Tag bestimmen (Wechsel um lokale Mitternacht, ?day=N zum Testen)
  function todayNumber() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - START) / 864e5)) + 1;
  }
  function currentDay() {
    const days = window.ECHOES_DAYS;
    const param = DEV ? parseInt(params.get('day'), 10) : NaN;
    const no = param > 0 ? param : todayNumber();
    const day = days[(no - 1) % days.length];
    return { no, day, key: `echoes.v2.${no}.${day.id}` };
  }
  // ?day=N an Links weiterreichen, damit der Prototyp-Tag erhalten bleibt
  const withDay = href => {
    const d = DEV && params.get('day');
    return d ? `${href}?day=${d}` : href;
  };

  // Serie: an wie vielen Tagen in Folge (bis heute) gespielt wurde – nur auf diesem Gerät
  const playedDays = () => new Set(store.get('echoes.played') || []);
  function markPlayed(no) {
    const days = playedDays();
    days.add(no);
    store.set('echoes.played', [...days].sort((a, b) => a - b).slice(-400));
  }
  function streak(no) {
    const days = playedDays();
    let n = 0;
    for (let d = days.has(no) ? no : no - 1; days.has(d); d--) n++;
    return n;
  }
  // Zeit bis zum nächsten Ereignis (lokale Mitternacht) als hh:mm:ss
  function untilMidnight() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const sec = Math.max(0, Math.floor((midnight - now) / 1000));
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  }

  // Fingerabdruck eines Stimmtextes – gleiche Rechnung wie text_hash() in tools/make_voices.py.
  // Eine Aufnahme gilt nur, solange sie zum aktuellen Text passt.
  function textHash(text) {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h.toString(16).padStart(8, '0');
  }

  // Prototyp: Links zu allen vorhandenen Tagen
  const dayLinks = page => window.ECHOES_DAYS
    .map((_, i) => `<a href="${page}?day=${i + 1}">${i + 1}</a>`).join(' · ');

  // --- Guide: kurze Schritt-für-Schritt-Erklärung ---
  const GUIDE = {
    back: 'Back', next: 'Next', done: 'Let’s go', skip: 'Skip',
    steps: [
      {
        title: 'One moment. Five voices.',
        text: 'Every day, one event from world history – the same for everyone. Five people tell you how they lived through it. No names until the very end.',
        art: `<div class="g-quote">“For weeks people have been taking to the streets, more every Monday …”</div><div class="g-who">Voice 01 — Pensioner</div>`,
      },
      {
        title: 'Every voice gets closer.',
        text: 'The first voice is far away and vague, the fifth is right there. Every voice costs points – you start with 10,000.',
        art: `<div class="g-costs"><span>−500</span><span>−750</span><span>−1,000</span><span>−1,000</span><span>−1,000</span></div>
          <div class="g-meter"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div><div class="g-who">Distance to the event</div>`,
      },
      {
        title: 'When and where?',
        text: 'Tap the globe to place your guess and set the year on the timeline. Drag to spin the globe.',
        art: `<div class="g-globe"><span class="g-pin"></span></div><div class="g-year">1989</div><div class="g-line"><i></i></div>`,
      },
      {
        title: 'Two guesses, then the final.',
        text: 'Get it right (±1 year, within 600 km) and you win the round. A miss costs 750. The third guess is final: −150 per year and −100 per 500 km off. Know what it is? Name the event for a bonus – the earlier, the bigger.',
        art: `<div class="g-tries"><span class="miss">1<small>−750</small></span><span class="miss">2<small>−750</small></span><span class="final">★<small>Final</small></span></div>`,
      },
      {
        title: 'Reveal, learn, share.',
        text: 'At the end you find out what happened and what each voice was hinting at. Copy your result into the group chat.',
        art: `<div class="g-share">Echoes #002 · 8,000/10,000<br>🔊🔊▫️▫️▫️<br>❌✅</div>`,
        ai: '<strong>Note:</strong> All characters are fictional. Their words and voices are AI-generated and based on real eyewitness accounts. None of them are real people.',
      },
    ],
  };

  let guideEl = null;
  function showGuide() {
    store.set('echoes.introSeen', true);
    if (!guideEl) {
      guideEl = document.createElement('dialog');
      guideEl.className = 'guide';
      document.body.append(guideEl);
    }
    let step = 0;
    const render = () => {
      const g = GUIDE;
      const s = g.steps[step];
      const last = step === g.steps.length - 1;
      guideEl.innerHTML = `
        <button class="guide-skip" data-act="close">${last ? '' : g.skip}</button>
        <div class="guide-art">${s.art}</div>
        <div class="guide-count">${String(step + 1).padStart(2, '0')} / ${String(g.steps.length).padStart(2, '0')}</div>
        <h2>${s.title}</h2>
        <p>${s.text}</p>
        ${s.ai ? `<p class="ai">${s.ai}</p>` : ''}
        <div class="guide-nav">
          <button class="textbtn" data-act="back"${step ? '' : ' hidden'}>${g.back}</button>
          <div class="guide-dots">${g.steps.map((_, i) => `<i${i === step ? ' class="on"' : ''}></i>`).join('')}</div>
          <button class="pill" data-act="${last ? 'close' : 'next'}">${last ? g.done : g.next}</button>
        </div>`;
      guideEl.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = () => {
          if (b.dataset.act === 'next') step++;
          else if (b.dataset.act === 'back') step--;
          else { guideEl.close(); return; }
          render();
        };
      });
    };
    render();
    guideEl.showModal();
  }

  // Prototyp-Leiste unten nur im Entwicklermodus
  document.addEventListener('DOMContentLoaded', () => {
    const foot = document.querySelector('.foot');
    if (foot) foot.hidden = !DEV;
  });

  return { DEV, START, RULES, store, fmt, currentDay, withDay, dayLinks, showGuide, markPlayed, streak, untilMidnight, textHash };
})();
