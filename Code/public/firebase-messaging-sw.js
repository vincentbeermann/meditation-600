/* Firebase Cloud Messaging — dedicated background service worker.
 *
 * Registered automatically by getToken() at scope
 * /firebase-cloud-messaging-push-scope, so it lives ALONGSIDE the app-shell
 * sw.js without conflicting. Handles push while the PWA is closed/backgrounded.
 *
 * Config is inlined (public values) because this SW context has no `window`,
 * so it cannot reuse firebase-config.js. Only the production project is used —
 * there is no push on localhost.
 */
importScripts('vendor/firebase-app-compat.js');
importScripts('vendor/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA_RURseZtZ2PQZgTYInFEW5PN0wP60F-Q',
  authDomain: 'meditation-600-vb.firebaseapp.com',
  projectId: 'meditation-600-vb',
  storageBucket: 'meditation-600-vb.firebasestorage.app',
  messagingSenderId: '216788799147',
  appId: '1:216788799147:web:b5099a63a76dd2a061f1ee',
});

const messaging = firebase.messaging();

// Data-only messages are rendered here; notification-type payloads are shown
// automatically by FCM. We send data messages from the cron so we control the
// look across platforms.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || payload.notification || {};
  const title = d.title || '600';
  const options = {
    body: d.body || 'Time to sit.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || '600-reminder',
    data: { url: d.url || '/#timer' },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
