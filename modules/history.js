// 600 -- History module. Reverse-chronological list of sits.

window.HistoryModule = (function () {
  function render() {
    const root = document.createElement('div');
    root.className = 'view';

    const placeholder = document.createElement('div');
    placeholder.className = 'card';
    placeholder.innerHTML = '<p class="muted">Loading...</p>';
    root.appendChild(placeholder);

    window.api.getSessions().then(({ sessions }) => {
      root.replaceChildren(...buildContent(sessions));
    }).catch(e => {
      root.replaceChildren(errCard(e.message));
    });

    return root;
  }

  function buildContent(sessions) {
    const out = [];

    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.innerHTML = `
        <p class="serif" style="font-size:22px;color:var(--text-dim);text-align:center;margin:18px 0;">No sits yet.</p>
        <p class="muted" style="text-align:center;font-size:13px;">Tap Sit to begin.</p>
      `;
      out.push(empty);
      return out;
    }

    const list = document.createElement('div');
    list.className = 'card';
    const inner = document.createElement('div');
    for (const s of sessions) {
      inner.appendChild(buildRow(s));
    }
    list.appendChild(inner);
    out.push(list);

    return out;
  }

  function buildRow(s) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const variantLabel = (window.VARIANTS.find(v => v.key === s.variant) || {}).label || (s.variant || '--');
    const ratings = [];
    if (s.rating_calm)  ratings.push(`calm ${s.rating_calm}`);
    if (s.rating_focus) ratings.push(`focus ${s.rating_focus}`);

    row.innerHTML = `
      <div class="history-row-head">
        <span class="date">${formatDate(s.date)}</span>
        <span class="duration">${s.duration_min} min</span>
      </div>
      <div class="meta">
        <span>${variantLabel}</span>
        ${ratings.length ? `<span>· ${ratings.join(' · ')}</span>` : ''}
      </div>
      ${s.intention ? `<div class="note">"${escapeHtml(s.intention)}"</div>` : ''}
      ${s.note      ? `<div class="note">${escapeHtml(s.note)}</div>`          : ''}
    `;
    return row;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t = new Date(iso); t.setHours(0, 0, 0, 0);
    const diff = Math.round((today - t) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff < 7) return `${diff} days ago`;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function errCard(msg) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<p style="color:var(--danger);">Error: ${msg}</p>`;
    return c;
  }

  return { render, reset: () => {} };
})();
