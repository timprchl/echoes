// Freiwilliges Konto: Anmeldung per E-Mail-Code, Spielstände auf allen Geräten, Serie, Archiv.
// Ohne Anmeldung bleibt alles wie bisher im Browser. Server: stats-server (/api/auth/*, /api/me, /api/progress …).
// Gespeichert im Browser: echoes.session = { token, email }.
window.EchoesAccount = (() => {
  const { store, STATS_URL } = Echoes;
  const API = STATS_URL; // lokal leer (dann keine Konten), außer mit ?stats=local
  // Schalter: Konten erst zeigen, wenn Server, Datenbank und Mailversand live sind (lokal mit ?stats=local immer)
  const LIVE = true;
  const session = () => store.get('echoes.session');
  const signedIn = () => !!session()?.token;
  const available = () => !!API && (LIVE || Echoes.DEV);

  async function call(path, body) {
    const s = session();
    const r = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(s?.token ? { 'X-Echoes-Session': s.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && s) { store.del('echoes.session'); paintButton(); }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  }

  // --- Abgleich: Server-Stände ins Gerät, fertige Gerät-Stände auf den Server ---
  const KEY_RE = /^echoes\.v2\.(\d+)\.([a-z0-9-]+)$/;
  let me = null;
  async function sync() {
    if (!available() || !signedIn()) return;
    try { me = await call('/api/me'); } catch { return; }
    const played = new Set(store.get('echoes.played') || []);
    const onServer = new Map(me.progress.map(p => [p.day_no, p]));
    for (const p of me.progress) {
      const key = `echoes.v2.${p.day_no}.${p.day_id}`;
      const local = store.get(key);
      if (!local || (!local.done && p.done)) store.set(key, p.state);
      if (p.done && !p.archive) played.add(p.day_no);
    }
    store.set('echoes.played', [...played].sort((a, b) => a - b).slice(-400));
    // was nur auf diesem Gerät liegt (z. B. vor der ersten Anmeldung gespielt), hochladen
    const uploads = [];
    for (let i = 0; i < localStorage.length; i++) {
      const m = KEY_RE.exec(localStorage.key(i) || '');
      if (!m) continue;
      const state = store.get(m[0]);
      const remote = onServer.get(+m[1]);
      if (state?.done && !remote?.done) uploads.push({ dayNo: +m[1], dayId: m[2], state, archive: !!state.archive });
    }
    await Promise.all(uploads.map(u => call('/api/progress', u).catch(() => {})));
    document.dispatchEvent(new CustomEvent('echoes:synced'));
    paintButton();
  }

  // Spielstand eines Tages speichern (game.js ruft das nach jedem Speichern auf; gebündelt)
  let pendingSave = null, timer = null;
  function saveDay(dayNo, dayId, state) {
    if (!available() || !signedIn() || !dayNo) return;
    pendingSave = { dayNo, dayId, state, archive: !!state.archive };
    clearTimeout(timer);
    timer = setTimeout(() => { const p = pendingSave; pendingSave = null; call('/api/progress', p).catch(() => {}); }, state.done ? 0 : 1500);
  }

  // --- Fenster: anmelden (E-Mail → Code) oder Konto verwalten ---
  let dlg = null, step = 'email', email = '', news = false, error = '', busy = false, devCode = '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const s = session();
    if (s?.token) {
      dlg.innerHTML = `
        <button class="acct-x" data-act="close" aria-label="Close">×</button>
        <h2>Your account</h2>
        <p class="acct-sub">Signed in as <b>${esc(s.email)}</b></p>
        <p class="acct-perks">Your streak and results are saved on every device – including the days you replay in the archive.</p>
        <a class="pill" href="archive.html">Open the archive</a>
        <label class="acct-check"><input type="checkbox" id="acctNews"${me?.news ? ' checked' : ''}> Send me occasional news about Echoes</label>
        <div class="acct-foot">
          <button class="textbtn" data-act="logout">Sign out</button>
          <button class="textbtn danger" data-act="delete">Delete account</button>
        </div>
        ${error ? `<p class="acct-err">${esc(error)}</p>` : ''}`;
      dlg.querySelector('#acctNews').onchange = async e => {
        try { await call('/api/news', { news: e.target.checked }); if (me) me.news = e.target.checked; } catch (err) { error = err.message; render(); }
      };
    } else if (step === 'email') {
      dlg.innerHTML = `
        <button class="acct-x" data-act="close" aria-label="Close">×</button>
        <h2>Keep your streak</h2>
        <p class="acct-perks">Sign in with your e-mail – free and optional. Your streak and results are saved on every device, including your archive replays.</p>
        <form data-act="send">
          <input type="email" id="acctEmail" placeholder="you@example.com" autocomplete="email" required value="${esc(email)}">
          <label class="acct-check"><input type="checkbox" id="acctNewsIn"${news ? ' checked' : ''}> Send me occasional news about Echoes (optional)</label>
          ${error ? `<p class="acct-err">${esc(error)}</p>` : ''}
          <button class="pill"${busy ? ' disabled' : ''}>${busy ? 'Sending …' : 'Send me a code'}</button>
        </form>
        <p class="acct-small">We only use your address to sign you in${news ? ' and for the news you asked for' : ''}. <a href="privacy.html">Privacy</a></p>`;
      setTimeout(() => dlg.querySelector('#acctEmail')?.focus(), 30);
    } else {
      dlg.innerHTML = `
        <button class="acct-x" data-act="close" aria-label="Close">×</button>
        <h2>Check your inbox</h2>
        <p class="acct-perks">We sent a 6-digit code to <b>${esc(email)}</b>. It is valid for 10 minutes.</p>
        <form data-act="verify">
          <input id="acctCode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" value="${esc(devCode)}">
          ${error ? `<p class="acct-err">${esc(error)}</p>` : ''}
          <button class="pill"${busy ? ' disabled' : ''}>${busy ? 'Checking …' : 'Sign in'}</button>
        </form>
        <p class="acct-small"><button class="textbtn" data-act="back">Use another address</button> · <button class="textbtn" data-act="resend">Send a new code</button></p>`;
      setTimeout(() => dlg.querySelector('#acctCode')?.focus(), 30);
    }
    dlg.querySelectorAll('[data-act]').forEach(el => {
      const act = el.dataset.act;
      if (el.tagName === 'FORM') el.onsubmit = e => { e.preventDefault(); act === 'send' ? send() : verify(); };
      else el.onclick = () => ({ close: () => dlg.close(), back: () => { step = 'email'; error = ''; render(); }, resend: send, logout, delete: remove }[act]());
    });
  }
  async function send() {
    const input = dlg.querySelector('#acctEmail');
    if (input) { email = input.value.trim(); news = dlg.querySelector('#acctNewsIn').checked; }
    busy = true; error = ''; render();
    try {
      const r = await call('/api/auth/start', { email, news });
      devCode = r.devCode || ''; // nur lokal beim Testen
      step = 'code';
    } catch (e) { error = e.message; }
    busy = false; render();
  }
  async function verify() {
    const code = dlg.querySelector('#acctCode').value;
    busy = true; error = ''; render();
    try {
      const r = await call('/api/auth/verify', { email, code });
      store.set('echoes.session', { token: r.token, email: r.email });
      step = 'email'; devCode = '';
      await sync();
    } catch (e) { error = e.message; }
    busy = false; render();
  }
  async function logout() {
    try { await call('/api/logout', {}); } catch {}
    store.del('echoes.session'); me = null; error = '';
    paintButton(); render();
  }
  async function remove() {
    if (!confirm('Delete your account and all saved results on the server? Your streak stays on this device only.')) return;
    try {
      await call('/api/account/delete', {});
      store.del('echoes.session'); me = null; error = '';
      paintButton(); render();
    } catch (e) { error = e.message; render(); }
  }
  function open() {
    if (!available()) return;
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'acct';
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // Klick neben das Fenster
      document.body.append(dlg);
    }
    error = '';
    render();
    dlg.showModal();
  }

  // Knopf oben neben dem „?“
  const ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.8 19.5c1.3-3.3 4-5 7.2-5s5.9 1.7 7.2 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function paintButton() {
    const b = document.querySelector('.acct-btn');
    if (!b) return;
    b.classList.toggle('on', signedIn());
    b.title = signedIn() ? `Signed in as ${session().email}` : 'Sign in to keep your streak';
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!available()) return;
    const help = document.querySelector('#helpBtn');
    if (help) {
      const b = document.createElement('button');
      b.className = 'circle acct-btn';
      b.setAttribute('aria-label', 'Account');
      b.innerHTML = ICON;
      b.onclick = open;
      help.before(b);
      paintButton();
    }
    sync();
  });

  return { available, signedIn, open, sync, saveDay, email: () => session()?.email || '' };
})();
