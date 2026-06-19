// 600 -- History module. Reverse-chronological list of sits.
// Tap a row to edit (duration / style / note / ratings) or delete it.

window.HistoryModule = (function () {
  let unsub = null;

  function render() {
    const root = document.createElement('div');
    root.className = 'view';

    const placeholder = document.createElement('div');
    placeholder.className = 'card';
    placeholder.innerHTML = '<p class="muted">Loading...</p>';
    root.appendChild(placeholder);

    if (unsub) { unsub(); unsub = null; }
    if (window.api.subscribeSessions) {
      unsub = window.api.subscribeSessions(({ sessions }) => {
        root.replaceChildren(...buildContent(sessions));
      });
    } else {
      window.api.getSessions().then(({ sessions }) => {
        root.replaceChildren(...buildContent(sessions));
      }).catch(e => {
        root.replaceChildren(errCard(e.message));
      });
    }

    return root;
  }

  function refresh() {
    const view = document.getElementById('view');
    if (view) view.replaceChildren(render());
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
    row.appendChild(buildSummary(s, row));
    return row;
  }

  function buildSummary(s, row) {
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'history-summary';
    summary.setAttribute('aria-label', `Edit sit on ${formatDate(s.date)}`);

    const variantLabel = (window.VARIANTS.find(v => v.key === s.variant) || {}).label || (s.variant || '--');
    const ratings = [];
    if (s.rating_calm)  ratings.push(`calm ${s.rating_calm}`);
    if (s.rating_focus) ratings.push(`focus ${s.rating_focus}`);

    summary.innerHTML = `
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
    summary.addEventListener('click', () => {
      row.replaceChildren(buildEditor(s, row));
    });
    return summary;
  }

  function buildEditor(s, row) {
    const ed = document.createElement('div');
    ed.className = 'history-editor';

    const variantOptions = ['<option value="">--</option>']
      .concat(window.VARIANTS.map(v =>
        `<option value="${v.key}"${v.key === s.variant ? ' selected' : ''}>${v.label}</option>`))
      .join('');
    const ratingOptions = (sel) => ['<option value="">--</option>']
      .concat([1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === sel ? ' selected' : ''}>${n}</option>`))
      .join('');

    ed.innerHTML = `
      <div class="ed-grid">
        <label>Date<input type="date" class="ed-date" value="${s.date}"></label>
        <label>Minutes<input type="number" class="ed-dur" min="1" max="600" value="${s.duration_min}"></label>
        <label>Style<select class="ed-variant">${variantOptions}</select></label>
        <label>Calm<select class="ed-calm">${ratingOptions(s.rating_calm)}</select></label>
        <label>Focus<select class="ed-focus">${ratingOptions(s.rating_focus)}</select></label>
      </div>
      <label class="ed-note-wrap">Note<input type="text" class="ed-note" maxlength="280" value="${escapeAttr(s.note || '')}"></label>
      <div class="ed-actions">
        <button type="button" class="ghost ed-cancel">Cancel</button>
        <button type="button" class="danger-text ed-delete">Delete</button>
        <button type="button" class="secondary ed-save">Save</button>
      </div>
    `;

    ed.querySelector('.ed-cancel').addEventListener('click', () => {
      row.replaceChildren(buildSummary(s, row));
    });

    ed.querySelector('.ed-delete').addEventListener('click', async () => {
      if (!confirm('Delete this sit?')) return;
      try {
        await window.api.deleteSession(s.id);
        if (window.showToast) window.showToast('Sit deleted');
        refresh();
      } catch (e) {
        alert('Delete failed: ' + e.message);
      }
    });

    ed.querySelector('.ed-save').addEventListener('click', async () => {
      const patch = {
        date: ed.querySelector('.ed-date').value || s.date,
        duration_min: Math.max(1, parseInt(ed.querySelector('.ed-dur').value, 10) || s.duration_min),
        variant: ed.querySelector('.ed-variant').value || null,
        note: ed.querySelector('.ed-note').value,
        rating_calm: parseInt(ed.querySelector('.ed-calm').value, 10) || null,
        rating_focus: parseInt(ed.querySelector('.ed-focus').value, 10) || null,
      };
      try {
        await window.api.patchSession(s.id, patch);
        if (window.showToast) window.showToast('Sit updated');
        refresh();
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
    });

    return ed;
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
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function errCard(msg) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<p style="color:var(--danger);">Error: ${msg}</p>`;
    return c;
  }

  return { render, reset: () => { if (unsub) { unsub(); unsub = null; } } };
})();
