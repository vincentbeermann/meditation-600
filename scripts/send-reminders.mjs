// Daily meditation reminder sender — runs in GitHub Actions on a cron.
//
// Reads every user's push tokens + their session history from Firestore,
// crafts a data-aware nudge (skips anyone who already sat today), and sends it
// via FCM Web Push. Stale tokens are pruned automatically.
//
// Auth: a Firebase service-account JSON is provided via the FCM_SERVICE_ACCOUNT
// env var (a GitHub Actions secret). Never commit the key.

import admin from 'firebase-admin';

const APP_URL = 'https://meditation-600-vb.web.app';
const ICON = APP_URL + '/icon-192.png';
const GOAL_HOURS = 600;

function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function summarize(sessions) {
  const today = todayISO();
  const totalMin = sessions.reduce((s, x) => s + (x.duration_min || 0), 0);
  const totalHours = totalMin / 60;
  const satToday = sessions.some((s) => s.date === today);
  const dates = sessions.map((s) => s.date).filter(Boolean).sort();
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  let daysSince = null;
  if (lastDate) {
    daysSince = Math.round((new Date(today) - new Date(lastDate)) / 86400000);
  }
  // week streak (consecutive ISO weeks with >=1 sit, counting back from now)
  const weeks = new Set(sessions.map((s) => isoWeekKey(s.date)));
  let streak = 0;
  const cur = new Date(today);
  while (weeks.has(isoWeekKey(todayISO(cur)))) {
    streak++;
    cur.setDate(cur.getDate() - 7);
  }
  return { totalHours, satToday, daysSince, streak, count: sessions.length };
}

// Returns { title, body } or null to skip this user for this slot.
function craftMessage(stats, slot) {
  if (stats.satToday) return null; // already practiced today — don't nag

  const remaining = Math.max(0, Math.ceil(GOAL_HOURS - stats.totalHours));

  if (slot === 'morning') {
    if (stats.count === 0) {
      return { title: '🧘 Guten Morgen', body: 'Beginne deine Reise — die erste Sitzung wartet.' };
    }
    if (stats.daysSince != null && stats.daysSince >= 3) {
      return { title: '🧘 Guten Morgen', body: `${stats.daysSince} Tage Pause — heute wieder kurz sitzen?` };
    }
    return { title: '🧘 Guten Morgen', body: `Eine ruhige Sitzung? Noch ${remaining} h bis 600.` };
  }

  // evening
  if (stats.streak > 0) {
    return { title: '🌙 Bevor der Tag endet', body: `Heute noch nicht gesessen — ${stats.streak}-Wochen-Streak halten?` };
  }
  return { title: '🌙 Bevor der Tag endet', body: 'Kurz innehalten vor dem Schlaf?' };
}

async function main() {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT env var is missing');
  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const messaging = admin.messaging();

  // Slot from the run time: morning if UTC hour < 12, else evening.
  const slot = new Date().getUTCHours() < 12 ? 'morning' : 'evening';
  console.log(`[reminders] slot=${slot} utc=${new Date().toISOString()}`);

  // All push tokens across all users (collection-group query).
  const tokenSnap = await db.collectionGroup('pushTokens').get();
  const byUser = new Map();
  tokenSnap.forEach((doc) => {
    const uid = doc.ref.parent.parent.id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(doc.ref);
  });
  console.log(`[reminders] users with tokens: ${byUser.size}`);

  let sent = 0, skipped = 0, pruned = 0;

  for (const [uid, tokenRefs] of byUser) {
    const sessSnap = await db.collection('users').doc(uid).collection('sessions').get();
    const sessions = sessSnap.docs.map((d) => d.data());
    const stats = summarize(sessions);
    const msg = craftMessage(stats, slot);
    if (!msg) { skipped++; continue; }

    for (const ref of tokenRefs) {
      const token = ref.id;
      try {
        // Data-only: the service worker's onBackgroundMessage renders exactly
        // one notification. A `notification` block would make FCM auto-display
        // it AND fire onBackgroundMessage → two notifications for one reminder.
        await messaging.send({
          token,
          data: {
            title: msg.title,
            body: msg.body,
            tag: '600-reminder',
            url: `${APP_URL}/#timer`,
          },
        });
        sent++;
      } catch (e) {
        const code = e && e.errorInfo && e.errorInfo.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
          await ref.delete().catch(() => {});
          pruned++;
        } else {
          console.warn(`[reminders] send failed for ${uid}:`, code || e.message);
        }
      }
    }
  }

  console.log(`[reminders] done. sent=${sent} skipped=${skipped} prunedTokens=${pruned}`);
}

main().catch((e) => {
  console.error('[reminders] fatal:', e);
  process.exit(1);
});
