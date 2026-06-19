// Weekly planner (coach). A full-screen overlay where you commit to when you'll
// show up this week, then export those slots to your calendar as an .ics file
// (with a 10-minute alarm per event). App-agnostic: reads window.PLAN_CONFIG.
//
// Plan doc (via window.api.getPlan/setPlan): { weekStart, target, items:[
//   { id, day:0(Mon)..6, time:'HH:MM', type:key, duration:Int } ], updatedAt }
window.PlanModule = (function () {
  var DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  var overlay = null;
  var plan = null;

  function cfg() {
    return window.PLAN_CONFIG || {
      calName: 'Coach', prodId: '-//coach//DE', defaultTime: '07:00',
      types: [{ key: 'session', label: 'Einheit', emoji: '📌', duration: 20 }],
    };
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function rid() { return 'p' + Math.random().toString(36).slice(2, 9); }

  function mondayOf(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ---- .ics generation ----------------------------------------------------
  function icsLocal(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function icsStampUTC(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function typeFor(key) {
    var ts = cfg().types;
    for (var i = 0; i < ts.length; i++) if (ts[i].key === key) return ts[i];
    return ts[0];
  }

  function buildICS() {
    var c = cfg();
    var ws = mondayOf(new Date());
    var stamp = icsStampUTC(new Date());
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + c.prodId,
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + c.calName,
    ];
    (plan.items || []).forEach(function (it) {
      var dt = new Date(ws);
      dt.setDate(dt.getDate() + (it.day || 0));
      var hm = String(it.time || c.defaultTime).split(':');
      dt.setHours(parseInt(hm[0], 10) || 7, parseInt(hm[1], 10) || 0, 0, 0);
      var end = new Date(dt.getTime() + (it.duration || 20) * 60000);
      var t = typeFor(it.type);
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + (it.id || rid()) + '-' + icsLocal(dt) + '@coach');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART:' + icsLocal(dt));
      lines.push('DTEND:' + icsLocal(end));
      lines.push('SUMMARY:' + (t.emoji ? t.emoji + ' ' : '') + t.label);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'TRIGGER:-PT10M', 'END:VALARM');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function exportICS() {
    if (!plan.items || !plan.items.length) {
      if (window.showToast) window.showToast('Erst Einheiten hinzufügen');
      return;
    }
    var ics = buildICS();
    var fname = (cfg().calName || 'coach').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-woche.ics';
    var blob = new Blob([ics], { type: 'text/calendar' });

    // iOS / standalone PWA: a blob: URL opens BLANK in a new tab (it's bound to
    // the PWA's context) and the share sheet doesn't offer Calendar. Navigating
    // the current tab to a self-contained base64 data: URL of a text/calendar
    // file makes iOS show the native "Zum Kalender hinzufügen" sheet.
    if (isIOS()) {
      var reader = new FileReader();
      reader.onload = function () { window.location.href = reader.result; };
      reader.readAsDataURL(blob);
      return;
    }
    // Desktop / Android: download the file; opening it adds the events.
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  // ---- UI -----------------------------------------------------------------
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'plan-overlay';
    overlay.innerHTML =
      '<div class="plan-card">' +
        '<header class="plan-head"><h2>Woche planen</h2><button class="plan-close" aria-label="Schließen">✕</button></header>' +
        '<p class="plan-sub">Leg fest, wann du diese Woche dran bist — dann exportierst du es mit Erinnerung in deinen Kalender.</p>' +
        '<div class="plan-target"><span>Wochenziel</span><div class="step"><button class="t-minus" aria-label="weniger">−</button><b class="t-val">4</b><button class="t-plus" aria-label="mehr">+</button><span class="t-unit">Einheiten</span></div></div>' +
        '<div class="plan-items"></div>' +
        '<button class="plan-add secondary">+ Einheit</button>' +
        '<div class="plan-actions"><button class="plan-export">📅 In Kalender</button><button class="plan-save">Speichern</button></div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.plan-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.plan-add').addEventListener('click', function () {
      var c = cfg();
      plan.items.push({ id: rid(), day: defaultNextDay(), time: c.defaultTime, type: c.types[0].key, duration: c.types[0].duration });
      renderItems();
    });
    overlay.querySelector('.t-minus').addEventListener('click', function () { setTarget(plan.target - 1); });
    overlay.querySelector('.t-plus').addEventListener('click', function () { setTarget(plan.target + 1); });
    overlay.querySelector('.plan-export').addEventListener('click', exportICS);
    overlay.querySelector('.plan-save').addEventListener('click', save);
  }

  function defaultNextDay() {
    // Suggest the day after the last planned item, else today's weekday.
    if (plan.items.length) return Math.min(6, plan.items[plan.items.length - 1].day + 1);
    return (new Date().getDay() + 6) % 7;
  }

  function setTarget(v) {
    plan.target = Math.max(1, Math.min(14, v));
    var el = overlay.querySelector('.t-val');
    if (el) el.textContent = plan.target;
  }

  function renderItems() {
    var box = overlay.querySelector('.plan-items');
    box.innerHTML = '';
    var c = cfg();
    if (!plan.items.length) {
      var empty = document.createElement('p');
      empty.className = 'plan-empty';
      empty.textContent = 'Noch keine Einheit geplant. Tippe „+ Einheit".';
      box.appendChild(empty);
      return;
    }
    plan.items.forEach(function (it, idx) {
      var row = document.createElement('div');
      row.className = 'plan-row';
      var dayOpts = DAYS.map(function (d, i) {
        return '<option value="' + i + '"' + (i === it.day ? ' selected' : '') + '>' + d + '</option>';
      }).join('');
      var typeSel = '';
      if (c.types.length > 1) {
        var topts = c.types.map(function (t) {
          return '<option value="' + t.key + '"' + (t.key === it.type ? ' selected' : '') + '>' + (t.emoji || '') + ' ' + t.label + '</option>';
        }).join('');
        typeSel = '<select class="p-type">' + topts + '</select>';
      }
      row.innerHTML =
        '<select class="p-day">' + dayOpts + '</select>' +
        '<input class="p-time" type="time" value="' + (it.time || c.defaultTime) + '">' +
        typeSel +
        '<input class="p-dur" type="number" min="5" max="180" step="5" value="' + (it.duration || 20) + '"><span class="p-min">min</span>' +
        '<button class="p-del" aria-label="entfernen">✕</button>';
      row.querySelector('.p-day').addEventListener('change', function (e) { it.day = parseInt(e.target.value, 10); });
      row.querySelector('.p-time').addEventListener('change', function (e) { it.time = e.target.value || c.defaultTime; });
      row.querySelector('.p-dur').addEventListener('change', function (e) {
        var v = parseInt(e.target.value, 10); it.duration = (isNaN(v) ? 20 : Math.max(5, Math.min(180, v))); e.target.value = it.duration;
      });
      if (c.types.length > 1) row.querySelector('.p-type').addEventListener('change', function (e) { it.type = e.target.value; });
      row.querySelector('.p-del').addEventListener('click', function () { plan.items.splice(idx, 1); renderItems(); });
      box.appendChild(row);
    });
  }

  async function save() {
    plan.weekStart = isoDate(mondayOf(new Date()));
    plan.updatedAt = new Date().toISOString();
    try {
      await window.api.setPlan({
        weekStart: plan.weekStart, target: plan.target,
        items: plan.items, updatedAt: plan.updatedAt,
      });
      if (window.showToast) window.showToast('Wochenplan gespeichert ✓');
      close();
    } catch (e) {
      if (window.showToast) window.showToast('Speichern fehlgeschlagen');
    }
  }

  function close() { if (overlay) overlay.classList.remove('open'); }

  async function open() {
    ensureOverlay();
    var existing = null;
    try { existing = await window.api.getPlan(); } catch (e) {}
    var c = cfg();
    plan = {
      weekStart: isoDate(mondayOf(new Date())),
      target: existing && existing.target ? existing.target : 4,
      // Reuse last plan's slots as a starting point (coach: keep your rhythm).
      items: existing && Array.isArray(existing.items)
        ? existing.items.map(function (x) { return { id: x.id || rid(), day: x.day || 0, time: x.time || c.defaultTime, type: x.type || c.types[0].key, duration: x.duration || c.types[0].duration }; })
        : [],
    };
    setTarget(plan.target);
    renderItems();
    overlay.classList.add('open');
  }

  return { open: open };
})();
