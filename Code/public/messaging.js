// Web Push (FCM) client glue. Exposes window.Reminders:
//   .supported            — boolean
//   .permission()         — 'granted' | 'denied' | 'default' | 'unsupported'
//   .enable()             — request permission, register the FCM token under the
//                           signed-in user, wire foreground messages. Returns a
//                           status object. Must be called from a user gesture.
//
// No push on localhost (there is no FCM emulator), so it degrades to a no-op.
(function () {
  var SUPPORTED = !window.USE_EMULATOR
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && typeof firebase !== 'undefined'
    && firebase.messaging
    && (typeof firebase.messaging.isSupported !== 'function' || firebase.messaging.isSupported());

  var messaging = null;
  function getMessaging() {
    if (!messaging) {
      try { messaging = firebase.messaging(); } catch (e) { messaging = null; }
    }
    return messaging;
  }

  async function storeToken(token) {
    if (!token || !window.fb || !window.fb.uid) return;
    try {
      await window.fb.db
        .collection('users').doc(window.fb.uid)
        .collection('pushTokens').doc(token)
        .set({ token: token, platform: navigator.userAgent, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.warn('[push] could not store token:', e);
    }
  }

  async function enable() {
    if (!SUPPORTED) {
      return { ok: false, reason: 'unsupported' };
    }
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: 'permission', permission: perm };
    }
    var m = getMessaging();
    if (!m) return { ok: false, reason: 'no-messaging' };

    var token;
    try {
      token = await m.getToken({ vapidKey: window.VAPID_KEY });
    } catch (e) {
      console.warn('[push] getToken failed:', e);
      return { ok: false, reason: 'token-error', error: String(e) };
    }
    if (!token) return { ok: false, reason: 'no-token' };

    await storeToken(token);

    // Foreground messages: the SW doesn't fire when the page is focused, so show
    // a lightweight toast instead.
    try {
      m.onMessage(function (payload) {
        var n = (payload && (payload.notification || payload.data)) || {};
        var msg = n.title ? (n.title + (n.body ? ' — ' + n.body : '')) : 'Reminder';
        if (window.showToast) window.showToast(msg);
      });
    } catch (e) { /* ignore */ }

    return { ok: true, token: token };
  }

  window.Reminders = {
    supported: SUPPORTED,
    permission: function () {
      return ('Notification' in window) ? Notification.permission : 'unsupported';
    },
    enable: enable,
  };
})();
