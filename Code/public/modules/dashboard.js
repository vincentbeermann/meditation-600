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
  let unsub = null;

  function render() {
    const root = document.createElement('div');
    root.className = 'view';

    const placeholder = document.createElement('div');
    placeholder.className = 'card';
    placeholder.innerHTML = '<p class="muted">Loading...</p>';
    root.appendChild(placeholder);

    if (unsub) { unsub(); unsub = null; }
    if (window.api.subscribeStats) {
      // Live: re-render whenever Firestore data changes (any device).
      unsub = window.api.subscribeStats(stats => {
        checkMilestones(stats);
        root.replaceChildren(...buildContent(stats));
      });
    } else {
      window.api.getStats().then(stats => {
        checkMilestones(stats);
        root.replaceChildren(...buildContent(stats));
      }).catch(e => {
        root.replaceChildren(errCard(e.message));
      });
    }

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

    out.push(buildHeroCard());

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

    // ----- Trend + goal projection -----
    if (stats.totalCount > 0) {
      out.push(buildTrendCard(stats));
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
        const stat = [];
        if (data.avgCalm != null)  stat.push(`calm ${data.avgCalm.toFixed(1)}`);
        if (data.avgFocus != null) stat.push(`focus ${data.avgFocus.toFixed(1)}`);
        const statLine = stat.length ? `<span class="vstat">${stat.join(' · ')}</span>` : '';
        row.innerHTML = `
          <div class="label">${v.label}${statLine}</div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%;"></div></div>
          <div class="num">${formatHours(data.minutes / 60)}</div>
        `;
        inner.appendChild(row);
      }
      variantCard.appendChild(inner);
      out.push(variantCard);
    }

    // ----- Reminders (push) -----
    var comp = buildCompetenceCard(stats);
    if (comp) out.push(comp);

    out.push(buildPlanCard(stats));

    out.push(buildRemindersCard());

    // ----- Settings -----
    out.push(buildSettingsCard());

    // ----- Data management -----
    out.push(buildDataCard());

    return out;
  }

  // Celebrate crossing a milestone exactly once. On a fresh device, seed the
  // set with already-reached milestones so we don't celebrate retroactively.
  function checkMilestones(stats) {
    try {
      const key = '600-celebrated';
      const raw = localStorage.getItem(key);
      const reached = stats.milestones.filter(m => m.reached).map(m => m.hours);
      if (raw === null) {
        localStorage.setItem(key, JSON.stringify(reached));
        return;
      }
      const done = new Set(JSON.parse(raw));
      let fresh = null;
      for (const m of stats.milestones) {
        if (m.reached && !done.has(m.hours)) { done.add(m.hours); fresh = m; }
      }
      if (fresh) {
        localStorage.setItem(key, JSON.stringify([...done]));
        if (window.showToast) window.showToast('🎉 ' + fresh.label + ' erreicht!');
      }
    } catch (e) {}
  }

  function buildTrendCard(stats) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3>Verlauf & Ziel</h3>';

    const proj = document.createElement('p');
    proj.className = 'muted';
    proj.style.fontSize = '13px';
    if (stats.eta) {
      const pace = stats.paceHoursPerWeek;
      const paceStr = pace >= 1 ? pace.toFixed(1) + ' h' : Math.round(pace * 60) + ' min';
      let etaStr;
      if (stats.eta.years >= 1.2) {
        etaStr = '~' + stats.eta.years.toFixed(1) + ' Jahre';
      } else {
        etaStr = '~' + new Date(stats.eta.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      }
      proj.innerHTML = `Tempo: <strong style="color:var(--text);">${paceStr}/Woche</strong> · 600 h erreicht <strong style="color:var(--text);">${etaStr}</strong>`;
    } else {
      proj.textContent = 'Sitz ein paar Wochen, dann zeige ich dir die Hochrechnung aufs Ziel.';
    }
    card.appendChild(proj);

    const max = Math.max(1, ...stats.weekly.map(w => w.minutes));
    const chart = document.createElement('div');
    chart.className = 'weekly-chart';
    stats.weekly.forEach(w => {
      const col = document.createElement('div');
      col.className = 'weekly-col';
      const h = Math.round((w.minutes / max) * 100);
      col.innerHTML = `<div class="weekly-bar" style="height:${w.minutes > 0 ? Math.max(4, h) : 0}%;" title="${w.minutes} min"></div>`;
      chart.appendChild(col);
    });
    card.appendChild(chart);

    const cap = document.createElement('p');
    cap.className = 'muted';
    cap.style.cssText = 'font-size:11px;text-align:center;margin-top:6px;';
    cap.textContent = 'Minuten/Woche · letzte 12 Wochen';
    card.appendChild(cap);

    return card;
  }

  function buildRemindersCard() {
    const card = document.createElement('div');
    card.className = 'card';
    const R = window.Reminders;
    const supported = R && R.supported;
    const perm = R ? R.permission() : 'unsupported';

    let statusLine;
    if (!supported) {
      statusLine = perm === 'unsupported'
        ? 'Not available in this browser.'
        : 'Not available here (works on the deployed app, not local dev).';
    } else if (perm === 'granted') {
      statusLine = 'Reminders are on. ✓';
    } else if (perm === 'denied') {
      statusLine = 'Blocked in browser settings. Allow notifications to enable.';
    } else {
      statusLine = 'Get a gentle daily nudge to sit.';
    }

    card.innerHTML = `
      <h3>Reminders</h3>
      <p class="muted" style="font-size:13px;">${statusLine}</p>
      <div class="data-actions">
        <button id="enable-reminders" class="secondary"${(!supported || perm === 'granted' || perm === 'denied') ? ' disabled' : ''}>Enable reminders</button>
      </div>
    `;

    const btn = card.querySelector('#enable-reminders');
    if (btn && supported && perm !== 'denied') {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Enabling…';
        const res = await window.Reminders.enable();
        if (res && res.ok) {
          if (window.showToast) window.showToast('Reminders enabled');
        } else if (res && res.reason === 'permission') {
          if (window.showToast) window.showToast('Permission ' + res.permission);
        } else {
          if (window.showToast) window.showToast('Could not enable reminders');
        }
        // re-render the dashboard to reflect new state
        if (window.bootApp) window.bootApp();
      });
    }
    return card;
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

  // Lower the activation energy: one tap to start, plus a "tiny version" for
  // low-energy days (behavioral activation — a 2-min sit beats skipping).
  function buildHeroCard() {
    var card = document.createElement('div');
    card.className = 'card hero-card';
    var btn = document.createElement('button');
    btn.className = 'hero-btn';
    btn.textContent = 'Jetzt sitzen';
    btn.addEventListener('click', function () { location.hash = '#timer'; });
    card.appendChild(btn);
    var mini = document.createElement('button');
    mini.className = 'hero-mini';
    mini.textContent = 'nur 2 Minuten';
    mini.addEventListener('click', function () {
      if (window.TimerModule && window.TimerModule.preset) window.TimerModule.preset(2);
      location.hash = '#timer';
    });
    card.appendChild(mini);
    return card;
  }

  // Competence + reflection feedback (SDT competence need). Robust comparisons
  // only — stays silent when there isn't enough data to say something true.
  function buildCompetenceCard(stats) {
    if (!stats || !stats.weekly || stats.weekly.length < 2) return null;
    var weekly = stats.weekly;
    var cur = weekly[weekly.length - 1].minutes;
    var prior = weekly.slice(0, -1).map(function (w) { return w.minutes; }).filter(function (m) { return m > 0; });
    var lines = [];
    if (prior.length >= 2) {
      var avg = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
      var maxMin = Math.max.apply(null, weekly.map(function (w) { return w.minutes; }));
      if (cur > 0 && cur === maxMin) {
        lines.push('Diese Woche ' + cur + ' min — deine stärkste Woche bisher. 💪');
      } else if (avg > 0 && cur >= avg) {
        var pct = Math.round((cur - avg) / avg * 100);
        lines.push('Diese Woche ' + cur + ' min — ' + pct + '% über deinem Schnitt.');
      }
      // Below average: stay silent — no discouraging comparison (mid-week it's unfair).
    }
    if (stats.ratedCount >= 4 && stats.avgCalm != null) {
      lines.push('Ruhe Ø ' + stats.avgCalm.toFixed(1) + ' · Fokus Ø ' + stats.avgFocus.toFixed(1) + ' (' + stats.ratedCount + ' bewertet)');
    }
    if (!lines.length) return null;
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3>Diese Woche</h3>';
    lines.forEach(function (t) {
      var p = document.createElement('p');
      p.className = 'comp-line';
      p.textContent = t;
      card.appendChild(p);
    });
    return card;
  }

  function buildPlanCard(stats) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3>Wochenplan</h3><p class="plan-line muted">Lädt…</p>';
    var btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Woche planen';
    btn.addEventListener('click', function () { if (window.PlanModule) window.PlanModule.open(); });
    card.appendChild(btn);
    if (window.api.getPlan) {
      window.api.getPlan().then(function (p) {
        var line = card.querySelector('.plan-line');
        if (!line) return;
        var done = stats ? (stats.weekCount || 0) : 0;
        if (p && Array.isArray(p.items) && p.items.length) {
          var target = p.target || p.items.length;
          line.classList.remove('muted');
          line.textContent = 'Diese Woche ' + done + ' / ' + target;
          var bar = document.createElement('div');
          bar.className = 'plan-progress';
          var fill = document.createElement('div');
          fill.className = 'plan-progress-fill';
          fill.style.width = (target ? Math.min(100, Math.round(done / target * 100)) : 0) + '%';
          bar.appendChild(fill);
          card.insertBefore(bar, btn);
          if (stats && stats.longestStreak) {
            var ins = document.createElement('p');
            ins.className = 'plan-insight muted';
            ins.textContent = 'Serie: ' + (stats.streak || 0) + ' Wo · längste: ' + stats.longestStreak + ' Wo';
            card.insertBefore(ins, btn);
          }
        } else {
          line.textContent = 'Noch kein Plan — leg deine Woche in 30 Sekunden fest.';
          btn.textContent = 'Woche planen →';
        }
      }).catch(function () {});
    }
    return card;
  }

  function buildToggle(label, key, def) {
    const row = document.createElement('label');
    row.className = 'settings-row';
    const on = window.Settings ? window.Settings.get(key, def) : def;
    row.innerHTML = `<span>${label}</span><input type="checkbox" ${on ? 'checked' : ''}>`;
    row.querySelector('input').addEventListener('change', e => {
      if (window.Settings) window.Settings.set(key, e.target.checked);
    });
    return row;
  }

  function buildSettingsCard() {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3>Einstellungen</h3>';
    card.appendChild(buildToggle('Glocken', 'sound', true));
    card.appendChild(buildToggle('Vibration', 'vibrate', true));
    return card;
  }

  function buildDataCard() {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>Data</h3>
      <p class="muted" style="font-size:13px;">Synced to your account across devices. Export anytime for a backup.</p>
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

  return { render, reset: () => { if (unsub) { unsub(); unsub = null; } } };
})();
