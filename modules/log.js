// 600 -- Log module.
//
// Post-sit log form. Reads window.PENDING_LOG (set by timer.js), lets the
// user pick a variant, write a note, rate calm and focus, then save.
//
// If entered with no PENDING_LOG (e.g. tapped "Log" directly), offers a
// manual-entry form instead.

window.LogModule = (function () {
  let selectedVariant = null;
  let noteText = '';
  let ratingCalm = null;
  let ratingFocus = null;
  let manualMinutes = 20;

  function render() {
    // Reset state on fresh render
    selectedVariant = null;
    noteText = '';
    ratingCalm = null;
    ratingFocus = null;

    const root = document.createElement('div');
    root.className = 'view';

    const pending = window.PENDING_LOG;

    // Header card with duration + intention echo
    const head = document.createElement('div');
    head.className = 'card';
    if (pending) {
      head.innerHTML = `
        <div style="text-align:center;">
          <div class="serif" style="font-size:48px;color:var(--accent);line-height:1;">${pending.duration_min}<span style="font-size:20px;color:var(--text-dim);"> min</span></div>
          ${pending.intention ? `<p class="serif" style="font-style:italic;color:var(--text-dim);margin-top:10px;">"${escapeHtml(pending.intention)}"</p>` : ''}
        </div>
      `;
    } else {
      head.innerHTML = `
        <h3>Manual entry</h3>
        <p class="muted" style="font-size:13px;">No active sit. Log one after the fact.</p>
        <label style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-top:14px;margin-bottom:6px;">Duration (minutes)</label>
        <input type="number" id="manual-minutes" min="1" max="360" step="1" value="${manualMinutes}" />
      `;
      head.querySelector('#manual-minutes').addEventListener('input', e => {
        manualMinutes = parseInt(e.target.value, 10) || 0;
      });
    }
    root.appendChild(head);

    // Variant picker
    const varCard = document.createElement('div');
    varCard.className = 'card';
    varCard.innerHTML = `<h3>Style</h3>`;
    const grid = document.createElement('div');
    grid.className = 'variant-grid';
    window.VARIANTS.forEach(v => {
      const tile = document.createElement('button');
      tile.className = 'variant-tile';
      tile.dataset.variant = v.key;
      tile.innerHTML = `<span class="name">${v.label}</span><span class="desc">${v.description}</span>`;
      tile.addEventListener('click', () => {
        selectedVariant = v.key;
        grid.querySelectorAll('.variant-tile').forEach(t =>
          t.classList.toggle('active', t.dataset.variant === selectedVariant)
        );
      });
      grid.appendChild(tile);
    });
    varCard.appendChild(grid);
    root.appendChild(varCard);

    // Note
    const noteCard = document.createElement('div');
    noteCard.className = 'card';
    noteCard.innerHTML = `
      <h3>Note</h3>
      <textarea id="note-input" placeholder="What came up? Anchors, distractions, texture of the sit."></textarea>
    `;
    noteCard.querySelector('#note-input').addEventListener('input', e => {
      noteText = e.target.value;
    });
    root.appendChild(noteCard);

    // Ratings
    const rateCard = document.createElement('div');
    rateCard.className = 'card';
    rateCard.innerHTML = `<h3>Ratings</h3>`;
    rateCard.appendChild(buildRating('Calm', 'calm'));
    rateCard.appendChild(buildRating('Focus', 'focus'));
    root.appendChild(rateCard);

    // Save button
    const saveCard = document.createElement('div');
    saveCard.className = 'card';
    const btn = document.createElement('button');
    btn.className = 'start-btn';
    btn.textContent = 'Save the sit';
    btn.addEventListener('click', save);
    saveCard.appendChild(btn);
    root.appendChild(saveCard);

    return root;
  }

  function buildRating(label, key) {
    const row = document.createElement('div');
    row.className = 'rating-row';
    row.innerHTML = `<div class="rating-label">${label}</div><div class="rating-dots"></div>`;
    const dots = row.querySelector('.rating-dots');
    for (let i = 1; i <= 5; i++) {
      const d = document.createElement('button');
      d.className = 'rating-dot';
      d.textContent = i;
      d.addEventListener('click', () => {
        if (key === 'calm')  ratingCalm = i;
        if (key === 'focus') ratingFocus = i;
        dots.querySelectorAll('.rating-dot').forEach((el, idx) =>
          el.classList.toggle('selected', idx + 1 === i)
        );
      });
      dots.appendChild(d);
    }
    return row;
  }

  async function save() {
    const pending = window.PENDING_LOG;
    const duration = pending ? pending.duration_min : manualMinutes;
    const intention = pending ? pending.intention : '';

    if (!duration || duration < 1) {
      alert('Duration must be at least 1 minute.');
      return;
    }

    try {
      await window.api.createSession({
        duration_min: duration,
        variant: selectedVariant,
        intention,
        note: noteText,
        rating_calm: ratingCalm,
        rating_focus: ratingFocus,
      });
      window.PENDING_LOG = null;
      window.showToast(`${duration} min saved`);
      setTimeout(() => {
        window.location.hash = '#dashboard';
      }, 400);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reset() {
    // Nothing to clean up; PENDING_LOG is cleared on save.
  }

  return { render, reset };
})();
