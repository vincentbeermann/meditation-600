// 600 -- Dashboard module.
//
// The emotional core of the app:
//   - a big SVG progress ring showing total hours against the 600 goal
//   - weekly streak + last-7-days stat
//   - milestone chips (10h, 50h, 100h, 300h, 600h)
//   - variant breakdown
//   - 90-day calendar heatmap
//   - export/import/wipe

window.DashboardModule = (function () {
  function render() {
    const root = document.createElement('div');
    root.className = 'view';

    const placeholder = document.createElement('div');
    placeholder.className = 'card';
    placeholder.innerHTML = '<p class="muted">Loading...</p>';
    root.appendChild(placeholder);

    window.api.getStats().then(stats => {
      root.replaceChildren(...buildContent(stats));
    }).catch(e => {
      root.replaceChildren(errCard(e.message));
    });

    return root;
  }

  function buildContent(stats) {
    const out = [];

    // ----- Progress ring -----
    const ringCard = document.createElement('div');
    ringCard.className = 'card ring-card';
    ringCard.appendChild(buildRing(stats));
    const caption = document.createElement('div');
    caption.className = 'ring-caption';
    if (stats.totalHours === 0) {
      caption.textContent = 'Begin. The path is 600 hours.';
    } else if (stats.totalHours < stats.goalHours) {
      caption.textContent = `${formatHours(stats.remainingHours)} remain.`;
    } else {
      caption.textContent = 'The path is complete. Keep walking.';
    }
    ringCard.appendChild(caption);

    // Milestones
    const milestones = document.createElement('div');
    milestones.className = 'milestones';
    for (const m of stats.milestones) {
      const chip = document.createElement('div');
      chip.className = 'milestone' + (m.reached ? ' reached' : '');
      chip.textContent = m.label;
      milestones.appendChild(chip);
    }
    ringCard.appendChild(milestones);
    out.push(ringCard);

    // ----- Stats summary -----
    const summary = document.createElement('div');
    summary.className = 'card';
    summary.innerHTML = `
      <div class="dash-stats">
        <div>
          <div class="dash-stat">${stats.streak}</div>
          <div class="dash-label">Week streak</div>
        </div>
        <div>
          <div class="dash-stat">${stats.totalCount}</div>
          <div class="dash-label">Sits total</div>
        </div>
        <div>
          <div class="dash-stat">${stats.last7Days}</div>
          <div class="dash-label">Last 7 days</div>
        </div>
      </div>
    `;
    out.push(summary);

    // ----- 90-day heatmap -----
    if (stats.totalCount > 0) {
      const cal = document.createElement('div');
      cal.className = 'card';
      cal.innerHTML = '<h3>Last 90 days</h3>';
      cal.appendChild(buildCalendar(stats.days));
      out.push(cal);
    }

    // ----- Variant breakdown -----
    const variantKeys = Object.keys(stats.variants);
    if (variantKeys.length > 0) {
      const variantCard = document.createElement('div');
      variantCard.className = 'card';
      variantCard.innerHTML = '<h3>By style</h3>';
      const inner = document.createElement('div');
      inner.className = 'variant-breakdown';

      const maxMinutes = Math.max(...Object.values(stats.variants).map(v => v.minutes));
      const catalog = window.VARIANTS;
      // Preserve catalog order
      for (const v of catalog) {
        const data = stats.variants[v.key];
        if (!data) continue;
        const row = document.createElement('div');
        row.className = 'variant-row';
        const pct = Math.max(2, Math.round((data.minutes / maxMinutes) * 100));
        row.innerHTML = `
          <div class="label">${v.label}</div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%;"></div></div>
          <div class="num">${formatHours(data.minutes / 60)}</div>
        `;
        inner.appendChild(row);
      }
      variantCard.appendChild(inner);
      out.push(variantCard);
    }

    // ----- Data management -----
    out.push(buildDataCard());

    return out;
  }

  function buildRing(stats) {
    const wrap = document.createElement('div');
    wrap.className = 'ring-wrap';

    const size = 240;
    const r = 110;
    const cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.max(0, Math.min(1, stats.progress)));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
    track.setAttribute('class', 'ring-track');
    svg.appendChild(track);

    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fill.setAttribute('cx', cx); fill.setAttribute('cy', cy); fill.setAttribute('r', r);
    fill.setAttribute('class', 'ring-fill');
    fill.setAttribute('stroke-dasharray', circumference);
    fill.setAttribute('stroke-dashoffset', offset);
    svg.appendChild(fill);

    wrap.appendChild(svg);

    const center = document.createElement('div');
    center.className = 'ring-center';
    const hoursInt = Math.floor(stats.totalHours);
    const hoursDec = Math.floor((stats.totalHours - hoursInt) * 10);
    center.innerHTML = `
      <div class="ring-hours">${hoursInt}<span style="font-size:28px;color:var(--text-dim);">.${hoursDec}</span></div>
      <div class="ring-goal">of ${stats.goalHours} hours</div>
    `;
    wrap.appendChild(center);
    return wrap;
  }

  function buildCalendar(days) {
    const cal = document.createElement('div');
    cal.className = 'cal-grid';

    const weeks = [];
    let week = [];
    days.forEach((d, i) => {
      const date = new Date(d.date);
      const weekday = (date.getDay() + 6) % 7; // 0 = Mon
      if (i === 0 && weekday !== 0) {
        for (let j = 0; j < weekday; j++) week.push(null);
      }
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    });
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    for (const w of weeks) {
      const col = document.createElement('div');
      col.className = 'cal-col';
      for (const day of w) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (!day) {
          cell.classList.add('empty');
        } else if (day.minutes === 0) {
          cell.title = day.date;
        } else {
          const level = minutesToLevel(day.minutes);
          cell.classList.add(`l${level}`);
          cell.title = `${day.date}: ${day.minutes} min`;
        }
        col.appendChild(cell);
      }
      cal.appendChild(col);
    }
    return cal;
  }

  function minutesToLevel(m) {
    if (m <= 0)  return 0;
    if (m < 15)  return 1;
    if (m < 30)  return 2;
    if (m < 60)  return 3;
    return 4;
  }

  function formatHours(h) {
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 10) return `${h.toFixed(1)} h`;
    return `${Math.round(h)} h`;
  }

  function buildDataCard() {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>Data</h3>
      <p class="muted" style="font-size:13px;">Everything lives on this device. Export occasionally.</p>
      <div class="data-actions">
        <button id="export-data" class="secondary">Export</button>
        <button id="import-data" class="secondary">Import</button>
        <button id="wipe-data" class="ghost">Wipe</button>
      </div>
      <input type="file" id="import-file" accept="application/json" style="display:none;">
    `;

    card.querySelector('#export-data').addEventListener('click', async () => {
      const data = await window.api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `600-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window.showToast(`${data.sessions.length} sits exported`);
    });

    const fileInput = card.querySelector('#import-file');
    card.querySelector('#import-data').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const mode = confirm(
          'Import mode:\n\n' +
          'OK = Merge (add new, keep existing)\n' +
          'Cancel = Replace (wipe and replace)'
        ) ? 'merge' : 'replace';
        const result = await window.api.importAll(data, mode);
        window.showToast(`Import: +${result.added}, ${result.skipped} skipped`);
        document.getElementById('view').replaceChildren(render());
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
      fileInput.value = '';
    });

    card.querySelector('#wipe-data').addEventListener('click', async () => {
      if (!confirm('Delete all sits? This cannot be undone.')) return;
      if (!confirm('Really? Last warning.')) return;
      await window.api.wipeAll();
      window.showToast('All sits deleted');
      document.getElementById('view').replaceChildren(render());
    });

    return card;
  }

  function errCard(msg) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<p style="color:var(--danger);">Error: ${msg}</p>`;
    return c;
  }

  return { render, reset: () => {} };
})();
