// Firebase config. On localhost / 127.0.0.1 we run fully against the local
// emulator suite (no real project, no network). In production the real web
// config (filled in at cutover from the Firebase console) is used.
//
// NOTE: the web "apiKey" is NOT a secret — access is controlled by Firestore
// security rules, not by hiding this value.
(function () {
  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', ''];
  var isLocal = LOCAL_HOSTS.indexOf(location.hostname) !== -1;

  window.USE_EMULATOR = isLocal;

  window.FIREBASE_CONFIG = isLocal
    ? {
        apiKey: 'demo-key',
        authDomain: 'demo-meditation-600.firebaseapp.com',
        projectId: 'demo-meditation-600',
      }
    : {
        apiKey: 'AIzaSyA_RURseZtZ2PQZgTYInFEW5PN0wP60F-Q',
        authDomain: 'meditation-600-vb.firebaseapp.com',
        projectId: 'meditation-600-vb',
        storageBucket: 'meditation-600-vb.firebasestorage.app',
        messagingSenderId: '216788799147',
        appId: '1:216788799147:web:b5099a63a76dd2a061f1ee',
      };

  // Web Push (FCM) public VAPID key — from Firebase console → Cloud Messaging →
  // Web Push certificates. Public by design; not used on localhost.
  window.VAPID_KEY = 'BIK74l5LJXYkiy-POaWaBfH6b6kieVLnAktYOCGQ065NuXBawx6LvnVQ5FQafmnADqM2AsEGnf5QNpYTMMv2DPE';
})();
