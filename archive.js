// Archiv: alle vergangenen Tage. Nachspielen nur angemeldet (Vorteil des Kontos); zählt nicht zur Serie.
// Titel erscheinen erst, wenn der Tag gespielt ist – sonst wäre es verraten.
(() => {
  const { store, fmt, isoDate, dateOfNo, todayNumber, signedIn } = Echoes;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    const today = todayNumber();
    const past = [];
    for (let no = today - 1; no >= 1; no--) {
      const day = window.ECHOES_DAYS.find(d => d.on === isoDate(dateOfNo(no)) && (d.status === 'live' || d.status === 'approved'));
      if (day) past.push({ no, day, state: store.get(`echoes.v2.${no}.${day.id}`) });
    }
    const can = signedIn() && EchoesAccount.available();
    const playedN = past.filter(p => p.state?.done).length;
    $('#arcSub').innerHTML = can
      ? `${playedN} of ${past.length} played. Replays are saved to your account but don’t count towards your streak.`
      : `Sign in with your e-mail to replay every past day – free and optional. <button class="textbtn" id="arcSignIn">Sign in</button>`;
    $('#arcList').innerHTML = past.map(({ no, day, state }) => {
      const date = dateOfNo(no).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const done = state?.done;
      const right = done ? `<span class="arc-score">${fmt(state.score ?? 0)}</span>` : state?.heard ? '<span class="arc-tag">Continue</span>' : can ? '<span class="arc-tag">Play</span>' : '<span class="arc-lock" aria-label="Locked">🔒</span>';
      const inner = `<span class="arc-no">No. ${String(no).padStart(3, '0')}</span>
        <span class="arc-title">${done ? esc(day.title) : `<span class="arc-hidden">${date}</span>`}</span>${right}`;
      return `<li class="${done ? 'done' : ''}">${can ? `<a href="play.html?day=${no}&archive">${inner}</a>` : `<div>${inner}</div>`}</li>`;
    }).join('') || '<li class="arc-empty">Nothing here yet – come back tomorrow.</li>';
    const b = $('#arcSignIn');
    if (b) b.onclick = () => EchoesAccount.open();
  }
  document.addEventListener('echoes:synced', render);
  document.addEventListener('DOMContentLoaded', () => { $('#helpBtn').onclick = () => Echoes.showGuide(); });
  render();
})();
