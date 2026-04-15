// 600 -- Local storage layer. Client-only PWA, persists to localStorage
// under STORAGE_KEY. Derived from side-sport-webapp/Code/public/storage.js,
// session shape adapted for meditation tracking.
//
// Session shape:
//   {
//     id:          string (uuid)
//     date:        'YYYY-MM-DD'
//     duration_min: number  (integer minutes, rounded)
//     variant:     'breathing'|'body-scan'|'open-awareness'|'loving-kindness'|'mantra'|'silent'|null
//     intention:   string (optional, set before the session)
//     note:        string (optional, set after the session)
//     rating_calm: 1..5 or null
//     rating_focus: 1..5 or null
//   }

(function () {
  const STORAGE_KEY = 'meditation-600-v1';
  const GOAL_HOURS = 600;

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { sessions: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.sessions)) return { sessions: [] };
      return parsed;
    } catch (e) {
      console.warn('storage load failed, starting empty:', e);
      return { sessions: [] };
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ISO week key for streak calculation (same pattern as sport-webapp).
  function isoWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  function computeStats(sessions) {
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_min || 0), 0);
    const totalHours = totalMinutes / 60;
    const goalHours = GOAL_HOURS;
    const remainingHours = Math.max(0, goalHours - totalHours);
    const progress = Math.min(1, totalHours / goalHours);

    // Per-variant breakdown (minutes + count)
    const variants = {};
    for (const s of sessions) {
      const v = s.variant || 'silent';
      if (!variants[v]) variants[v] = { minutes: 0, count: 0 };
      variants[v].minutes += s.duration_min || 0;
      variants[v].count += 1;
    }

    // 90-day map for heatmap
    const today = new Date(todayISO());
    const dayMap = {};
    for (const s of sessions) {
      if (!dayMap[s.date]) dayMap[s.date] = 0;
      dayMap[s.date] += s.duration_min || 0;
    }
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, minutes: dayMap[iso] || 0 });
    }

    // Streak (ISO weeks with at least one session)
    const weekSet = new Set(sessions.map(s => isoWeekKey(s.date)));
    let streak = 0;
    let cursor = new Date(today);
    while (true) {
      if (weekSet.has(isoWeekKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 7);
      } else {
        break;
      }
    }

    // Last 7 days: count of days with any session, total minutes
    const last7 = days.slice(-7);
    const last7Days = last7.filter(d => d.minutes > 0).length;
    const last7Minutes = last7.reduce((sum, d) => sum + d.minutes, 0);

    // Milestones reached
    const milestones = [
      { hours: 10,  label: '10h',  reached: totalHours >= 10  },
      { hours: 50,  label: '50h',  reached: totalHours >= 50  },
      { hours: 100, label: '100h', reached: totalHours >= 100 },
      { hours: 300, label: '300h', reached: totalHours >= 300 },
      { hours: 600, label: '600h', reached: totalHours >= 600 },
    ];

    return {
      totalCount: sessions.length,
      totalMinutes,
      totalHours,
      goalHours,
      remainingHours,
      progress,
      variants,
      days,
      streak,
      last7Days,
      last7Minutes,
      milestones,
    };
  }

  // Public API -- same general shape as the sport-webapp one
  window.api = {
    GOAL_HOURS,

    async getSessions() {
      const data = load();
      const sorted = [...data.sessions].sort((a, b) =>
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      );
      return { sessions: sorted };
    },

    async getSession(id) {
      const data = load();
      return data.sessions.find(s => s.id === id) || null;
    },

    async createSession(input) {
      const data = load();
      const session = {
        id: uuid(),
        date: input.date || todayISO(),
        duration_min: input.duration_min ?? 0,
        variant: input.variant ?? null,
        intention: input.intention ?? '',
        note: input.note ?? '',
        rating_calm: input.rating_calm ?? null,
        rating_focus: input.rating_focus ?? null,
      };
      data.sessions.push(session);
      save(data);
      return session;
    },

    async patchSession(id, patch) {
      const data = load();
      const idx = data.sessions.findIndex(s => s.id === id);
      if (idx === -1) throw new Error(`session ${id} not found`);
      const allowed = ['duration_min', 'variant', 'intention', 'note', 'rating_calm', 'rating_focus'];
      for (const key of allowed) {
        if (key in patch) data.sessions[idx][key] = patch[key];
      }
      save(data);
      return data.sessions[idx];
    },

    async deleteSession(id) {
      const data = load();
      const before = data.sessions.length;
      data.sessions = data.sessions.filter(s => s.id !== id);
      if (data.sessions.length === before) throw new Error(`session ${id} not found`);
      save(data);
    },

    async getStats() {
      const { sessions } = load();
      return computeStats(sessions);
    },

    async exportAll() {
      return load();
    },

    async importAll(data, mode = 'merge') {
      if (!data || !Array.isArray(data.sessions)) {
        throw new Error('invalid data: expected { sessions: [...] }');
      }
      if (mode === 'replace') {
        save({ sessions: data.sessions });
        return { added: data.sessions.length, skipped: 0, total: data.sessions.length };
      }
      const current = load();
      const existingIds = new Set(current.sessions.map(s => s.id));
      let added = 0;
      let skipped = 0;
      for (const s of data.sessions) {
        if (existingIds.has(s.id)) {
          skipped++;
        } else {
          current.sessions.push(s);
          added++;
        }
      }
      save(current);
      return { added, skipped, total: current.sessions.length };
    },

    async wipeAll() {
      save({ sessions: [] });
    },
  };

  // Variant catalog, exposed for modules
  window.VARIANTS = [
    { key: 'breathing',      label: 'Breathing',      description: 'Attention on breath.' },
    { key: 'body-scan',      label: 'Body Scan',      description: 'Systematic body attention.' },
    { key: 'open-awareness', label: 'Open Awareness', description: 'Choiceless noting.' },
    { key: 'loving-kindness',label: 'Loving-Kindness', description: 'Metta phrases.' },
    { key: 'mantra',         label: 'Mantra',         description: 'Repeating phrase or sound.' },
    { key: 'silent',         label: 'Silent',         description: 'No anchor, just sitting.' },
  ];
})();
