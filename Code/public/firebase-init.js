// Firebase bootstrap + auth gate.
//
// Responsibilities:
//   - initialise the Firebase app, Auth and Firestore (with offline cache)
//   - wire the local emulator when running on localhost
//   - expose window.fb = { auth, db, uid, signInGoogle, signOut }
//   - show/hide the login overlay based on auth state
//   - run the one-time localStorage -> Firestore migration after first sign-in
//   - call window.bootApp() once a user is signed in (defined in app.js)
//
// Loaded AFTER the vendored SDK and firebase-config.js, BEFORE storage.js.
(function () {
  firebase.initializeApp(window.FIREBASE_CONFIG);

  var auth = firebase.auth();
  var db = firebase.firestore();

  // Emulator wiring MUST happen before Firestore is otherwise "started"
  // (enablePersistence counts as starting it), so connect the emulators first.
  if (window.USE_EMULATOR) {
    auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
    db.useEmulator('127.0.0.1', 8080);
    console.info('[firebase] using local emulator suite');
  }

  // Offline persistence — lets the PWA read/write while offline and sync on
  // reconnect. Must be enabled before any read/write; we only touch data after
  // sign-in, so this is safe here.
  db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
    console.warn('Firestore offline persistence unavailable:', e && e.code);
  });

  var uid = null;

  window.fb = {
    auth: auth,
    db: db,
    get uid() { return uid; },
    signInGoogle: function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      return auth.signInWithPopup(provider).catch(function (e) {
        console.error('sign-in failed', e);
        var msg = (e && e.message) || 'Unknown error';
        if (e && e.code === 'auth/popup-blocked') {
          // fall back to redirect when the popup is blocked (e.g. iOS PWA)
          return auth.signInWithRedirect(provider);
        }
        alert('Login fehlgeschlagen: ' + msg);
      });
    },
    signOut: function () { return auth.signOut(); },
  };

  function setOverlay(showLogin, user) {
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = showLogin ? 'flex' : 'none';
    var who = document.getElementById('auth-who');
    if (who) who.textContent = user ? (user.displayName || user.email || '') : '';
    var signout = document.getElementById('btn-signout');
    if (signout) signout.style.display = user ? '' : 'none';
  }

  var booted = false;

  auth.onAuthStateChanged(function (user) {
    uid = user ? user.uid : null;

    if (!user) {
      setOverlay(true, null);
      return;
    }

    setOverlay(false, user);

    var ready = Promise.resolve();
    // one-time migration of any pre-existing localStorage data
    if (window.api && typeof window.api._migrateFromLocalStorage === 'function') {
      ready = window.api._migrateFromLocalStorage().catch(function (e) {
        console.warn('localStorage migration failed:', e);
      });
    }

    ready.then(function () {
      if (typeof window.bootApp === 'function') window.bootApp();
      booted = true;
    });
  });

  // Wire the overlay buttons once the DOM exists.
  function wireButtons() {
    var login = document.getElementById('btn-login');
    if (login) login.addEventListener('click', function () { window.fb.signInGoogle(); });
    var signout = document.getElementById('btn-signout');
    if (signout) signout.addEventListener('click', function () { window.fb.signOut(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButtons);
  } else {
    wireButtons();
  }
})();
