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

  function planDoc() {
    var uid = window.fb && window.fb.uid;
    if (!uid) throw new Error('not authenticated');
    return window.fb.db.collection('users').doc(uid).collection('meta').doc('plan');
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
      var sv = sessions[i];
      var v = sv.variant || 'silent';
      if (!variants[v]) variants[v] = { minutes: 0, count: 0, _calmSum: 0, _calmN: 0, _focusSum: 0, _focusN: 0 };
      variants[v].minutes += sv.duration_min || 0;
      variants[v].count += 1;
      if (sv.rating_calm) { variants[v]._calmSum += sv.rating_calm; variants[v]._calmN += 1; }
      if (sv.rating_focus) { variants[v]._focusSum += sv.rating_focus; variants[v]._focusN += 1; }
    }
    // Average calm/focus per style (null when never rated).
    Object.keys(variants).forEach(function (k) {
      var d = variants[k];
      d.avgCalm = d._calmN ? d._calmSum / d._calmN : null;
      d.avgFocus = d._focusN ? d._focusSum / d._focusN : null;
    });

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

    // Sessions in the current ISO week (for the weekly-goal progress).
    var currentWeekKey = isoWeekKey(todayISO());
    var weekCount = sessions.filter(function (s) { return isoWeekKey(s.date) === currentWeekKey; }).length;

    // Overall calm/focus (reflection insight). null until rated often enough.
    var calmVals = sessions.map(function (s) { return s.rating_calm; }).filter(function (v) { return v; });
    var focusVals = sessions.map(function (s) { return s.rating_focus; }).filter(function (v) { return v; });
    var avgCalm = calmVals.length ? calmVals.reduce(function (a, b) { return a + b; }, 0) / calmVals.length : null;
    var avgFocus = focusVals.length ? focusVals.reduce(function (a, b) { return a + b; }, 0) / focusVals.length : null;
    var ratedCount = calmVals.length;

    // Longest run of consecutive active weeks ever (insight, not a trophy).
    var longestStreak = 0;
    var sortedDates = sessions.map(function (s) { return s.date; }).filter(Boolean).sort();
    if (sortedDates.length) {
      var run = 0;
      var walk = new Date(sortedDates[0]);
      while (walk <= today) {
        if (weekSet.has(isoWeekKey(walk.toISOString().slice(0, 10)))) {
          run++; if (run > longestStreak) longestStreak = run;
        } else { run = 0; }
        walk.setDate(walk.getDate() + 7);
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

    // Weekly minutes for the last 12 ISO weeks (oldest → newest).
    var weekMin = {};
    for (var wi = 0; wi < sessions.length; wi++) {
      var wk0 = isoWeekKey(sessions[wi].date);
      weekMin[wk0] = (weekMin[wk0] || 0) + (sessions[wi].duration_min || 0);
    }
    var weekly = [];
    for (var w = 11; w >= 0; w--) {
      var dW = new Date(today);
      dW.setDate(dW.getDate() - w * 7);
      var key = isoWeekKey(dW.toISOString().slice(0, 10));
      weekly.push({ week: key, minutes: weekMin[key] || 0 });
    }

    // Pace + projection to the 600 h goal.
    var dates = sessions.map(function (s) { return s.date; }).filter(Boolean).sort();
    var firstDate = dates.length ? dates[0] : null;
    var weeksSinceFirst = firstDate
      ? Math.max(1, Math.ceil((today - new Date(firstDate)) / (7 * 86400000)))
      : 1;
    var weeksConsidered = Math.min(12, weeksSinceFirst);
    var recentMin = weekly.reduce(function (a, x) { return a + x.minutes; }, 0);
    var paceHoursPerWeek = (recentMin / 60) / weeksConsidered;
    var eta = null;
    if (paceHoursPerWeek > 0.01 && remainingHours > 0) {
      var weeksToGoal = remainingHours / paceHoursPerWeek;
      eta = {
        weeks: weeksToGoal,
        years: weeksToGoal / 52,
        date: new Date(today.getTime() + weeksToGoal * 7 * 86400000).toISOString().slice(0, 10),
      };
    }

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
      weekly: weekly,
      weekCount: weekCount,
      longestStreak: longestStreak,
      avgCalm: avgCalm,
      avgFocus: avgFocus,
      ratedCount: ratedCount,
      paceHoursPerWeek: paceHoursPerWeek,
      eta: eta,
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
      var allowed = ['date', 'duration_min', 'variant', 'intention', 'note', 'rating_calm', 'rating_focus'];
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

    // Live subscriptions (Firestore onSnapshot) — return an unsubscribe fn.
    subscribeStats(cb) {
      try {
        return sessionsCol().onSnapshot(function (snap) {
          var sessions = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
          cb(computeStats(sessions));
        }, function (e) { console.warn('subscribeStats failed:', e); });
      } catch (e) { return function () {}; }
    },

    subscribeSessions(cb) {
      try {
        return sessionsCol().onSnapshot(function (snap) {
          var sessions = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
          sessions.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
          cb({ sessions: sessions });
        }, function (e) { console.warn('subscribeSessions failed:', e); });
      } catch (e) { return function () {}; }
    },

    // ---- Weekly plan (coach) -------------------------------------------------
    // One doc per user at users/{uid}/meta/plan. Shape:
    //   { weekStart:'YYYY-MM-DD', target:Int, items:[{id,day(0=Mon..6),time:'HH:MM',
    //     duration:Int}], updatedAt:ISO }
    async getPlan() {
      try { var d = await planDoc().get(); return d.exists ? d.data() : null; }
      catch (e) { return null; }
    },

    async setPlan(plan) {
      await planDoc().set(plan, { merge: false });
      return plan;
    },

    subscribePlan(cb) {
      try {
        return planDoc().onSnapshot(function (d) { cb(d.exists ? d.data() : null); },
          function (e) { console.warn('subscribePlan failed:', e); });
      } catch (e) { return function () {}; }
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

  // Weekly-planner config (coach). One session type for meditation.
  window.PLAN_CONFIG = {
    calName: '600 Meditation',
    prodId: '-//600//Coach//DE',
    defaultTime: '07:00',
    types: [{ key: 'meditation', label: 'Meditation', emoji: '🧘', duration: 20 }],
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
