// 600 — Storage layer, Firestore-backed with offline cache via the Firebase
// SDK. Exposes the SAME window.api shape the modules already use, so no module
// code changes. Sessions live at: users/{uid}/sessions/{sessionId}.
//
// Session shape:
//   { id, date, duration_min, variant, intention, note, rating_calm, rating_focus }
//
// Migration: the previous build persisted to localStorage under
// 'meditation-600-v1'. On first sign-in we copy any such sessions into
// Firestore once (idempotent, guarded by a flag).

(function () {
  var LEGACY_KEY = 'meditation-600-v1';
  var MIGRATED_FLAG = 'meditation-600-migrated-to-firestore';
  var GOAL_HOURS = 600;

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---- Firestore helpers --------------------------------------------------

  function sessionsCol() {
    var uid = window.fb && window.fb.uid;
    if (!uid) throw new Error('not authenticated');
    return window.fb.db.collection('users').doc(uid).collection('sessions');
  }

  async function loadSessions() {
    var snap = await sessionsCol().get();
    return snap.docs.map(function (d) {
      var data = d.data();
      data.id = d.id;
      return data;
    });
  }

  // ---- Stats (unchanged logic, now over Firestore-loaded sessions) --------

  function isoWeekKey(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
  }

  function computeStats(sessions) {
    var totalMinutes = sessions.reduce(function (sum, s) { return sum + (s.duration_min || 0); }, 0);
    var totalHours = totalMinutes / 60;
    var goalHours = GOAL_HOURS;
    var remainingHours = Math.max(0, goalHours - totalHours);
    var progress = Math.min(1, totalHours / goalHours);

    var variants = {};
    for (var i = 0; i < sessions.length; i++) {
      var v = sessions[i].variant || 'silent';
      if (!variants[v]) variants[v] = { minutes: 0, count: 0 };
      variants[v].minutes += sessions[i].duration_min || 0;
      variants[v].count += 1;
    }

    var today = new Date(todayISO());
    var dayMap = {};
    for (var j = 0; j < sessions.length; j++) {
      var s = sessions[j];
      if (!dayMap[s.date]) dayMap[s.date] = 0;
      dayMap[s.date] += s.duration_min || 0;
    }
    var days = [];
    for (var k = 89; k >= 0; k--) {
      var d = new Date(today);
      d.setDate(d.getDate() - k);
      var iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, minutes: dayMap[iso] || 0 });
    }

    var weekSet = new Set(sessions.map(function (s) { return isoWeekKey(s.date); }));
    var streak = 0;
    var cursor = new Date(today);
    while (true) {
      if (weekSet.has(isoWeekKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 7);
      } else {
        break;
      }
    }

    var last7 = days.slice(-7);
    var last7Days = last7.filter(function (d) { return d.minutes > 0; }).length;
    var last7Minutes = last7.reduce(function (sum, d) { return sum + d.minutes; }, 0);

    var milestones = [
      { hours: 10,  label: '10h',  reached: totalHours >= 10  },
      { hours: 50,  label: '50h',  reached: totalHours >= 50  },
      { hours: 100, label: '100h', reached: totalHours >= 100 },
      { hours: 300, label: '300h', reached: totalHours >= 300 },
      { hours: 600, label: '600h', reached: totalHours >= 600 },
    ];

    return {
      totalCount: sessions.length,
      totalMinutes: totalMinutes,
      totalHours: totalHours,
      goalHours: goalHours,
      remainingHours: remainingHours,
      progress: progress,
      variants: variants,
      days: days,
      streak: streak,
      last7Days: last7Days,
      last7Minutes: last7Minutes,
      milestones: milestones,
    };
  }

  // ---- Public API — same shape as before ----------------------------------

  window.api = {
    GOAL_HOURS: GOAL_HOURS,

    async getSessions() {
      var sessions = await loadSessions();
      sessions.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      return { sessions: sessions };
    },

    async getSession(id) {
      var doc = await sessionsCol().doc(id).get();
      if (!doc.exists) return null;
      var data = doc.data();
      data.id = doc.id;
      return data;
    },

    async createSession(input) {
      var session = {
        date: input.date || todayISO(),
        duration_min: input.duration_min != null ? input.duration_min : 0,
        variant: input.variant != null ? input.variant : null,
        intention: input.intention != null ? input.intention : '',
        note: input.note != null ? input.note : '',
        rating_calm: input.rating_calm != null ? input.rating_calm : null,
        rating_focus: input.rating_focus != null ? input.rating_focus : null,
      };
      var id = uuid();
      await sessionsCol().doc(id).set(session);
      session.id = id;
      return session;
    },

    async patchSession(id, patch) {
      var ref = sessionsCol().doc(id);
      var allowed = ['duration_min', 'variant', 'intention', 'note', 'rating_calm', 'rating_focus'];
      var update = {};
      for (var i = 0; i < allowed.length; i++) {
        var key = allowed[i];
        if (key in patch) update[key] = patch[key];
      }
      await ref.set(update, { merge: true });
      var doc = await ref.get();
      if (!doc.exists) throw new Error('session ' + id + ' not found');
      var data = doc.data();
      data.id = doc.id;
      return data;
    },

    async deleteSession(id) {
      await sessionsCol().doc(id).delete();
    },

    async getStats() {
      var sessions = await loadSessions();
      return computeStats(sessions);
    },

    async exportAll() {
      var sessions = await loadSessions();
      return { sessions: sessions };
    },

    async importAll(data, mode) {
      mode = mode || 'merge';
      if (!data || !Array.isArray(data.sessions)) {
        throw new Error('invalid data: expected { sessions: [...] }');
      }
      var col = sessionsCol();

      if (mode === 'replace') {
        await this.wipeAll();
      }

      var existingIds = new Set();
      if (mode !== 'replace') {
        var snap = await col.get();
        snap.docs.forEach(function (d) { existingIds.add(d.id); });
      }

      var added = 0;
      var skipped = 0;
      var batch = window.fb.db.batch();
      var ops = 0;

      for (var i = 0; i < data.sessions.length; i++) {
        var s = Object.assign({}, data.sessions[i]);
        var id = s.id || uuid();
        delete s.id;
        if (mode !== 'replace' && existingIds.has(id)) { skipped++; continue; }
        batch.set(col.doc(id), s);
        added++;
        ops++;
        if (ops >= 400) { await batch.commit(); batch = window.fb.db.batch(); ops = 0; }
      }
      if (ops > 0) await batch.commit();

      return { added: added, skipped: skipped, total: added + skipped };
    },

    async wipeAll() {
      var col = sessionsCol();
      var snap = await col.get();
      var batch = window.fb.db.batch();
      var ops = 0;
      for (var i = 0; i < snap.docs.length; i++) {
        batch.delete(snap.docs[i].ref);
        ops++;
        if (ops >= 400) { await batch.commit(); batch = window.fb.db.batch(); ops = 0; }
      }
      if (ops > 0) await batch.commit();
    },

    // One-time migration from the old localStorage build. Idempotent.
    async _migrateFromLocalStorage() {
      try {
        if (localStorage.getItem(MIGRATED_FLAG)) return;
        var raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) { localStorage.setItem(MIGRATED_FLAG, '1'); return; }
        var parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
          localStorage.setItem(MIGRATED_FLAG, '1');
          return;
        }
        var res = await this.importAll({ sessions: parsed.sessions }, 'merge');
        localStorage.setItem(MIGRATED_FLAG, '1');
        console.info('[migration] imported', res.added, 'session(s) from localStorage');
        if (window.showToast && res.added > 0) {
          window.showToast(res.added + ' Sitzungen aus lokalem Speicher übernommen');
        }
      } catch (e) {
        console.warn('localStorage migration error:', e);
      }
    },
  };

  // Variant catalog, exposed for modules (unchanged).
  window.VARIANTS = [
    { key: 'breathing',       label: 'Breathing',       description: 'Attention on breath.' },
    { key: 'body-scan',       label: 'Body Scan',       description: 'Systematic body attention.' },
    { key: 'open-awareness',  label: 'Open Awareness',  description: 'Choiceless noting.' },
    { key: 'loving-kindness', label: 'Loving-Kindness', description: 'Metta phrases.' },
    { key: 'mantra',          label: 'Mantra',          description: 'Repeating phrase or sound.' },
    { key: 'silent',          label: 'Silent',          description: 'No anchor, just sitting.' },
  ];
})();
