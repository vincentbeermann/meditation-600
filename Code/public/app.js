// 600 -- SPA shell.
// Hash-based router. Each module is a separate file registered here.

const view = document.getElementById('view');
const screenTitle = document.getElementById('screen-title');
const tabbar = document.getElementById('tabbar');

const views = {
  dashboard: {
    title: '600',
    render: () => window.DashboardModule.render(),
    onLeave: () => {},
  },
  timer: {
    title: 'Sit',
    render: () => window.TimerModule.render(),
    onLeave: () => window.TimerModule.reset(),
  },
  log: {
    // Reached after a timer run completes. Shows the post-sit log form.
    title: 'Log the sit',
    render: () => window.LogModule.render(),
    onLeave: () => window.LogModule.reset(),
  },
  history: {
    title: 'History',
    render: () => window.HistoryModule.render(),
    onLeave: () => {},
  },
};

const DEFAULT_ROUTE = 'dashboard';
let currentRouteName = null;

function navigate(route) {
  if (!views[route]) route = DEFAULT_ROUTE;

  if (currentRouteName && currentRouteName !== route && views[currentRouteName]?.onLeave) {
    try { views[currentRouteName].onLeave(); } catch (e) { console.warn('onLeave error', e); }
  }

  currentRouteName = route;
  view.replaceChildren(views[route].render());
  screenTitle.textContent = views[route].title;

  tabbar.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  if (window.location.hash !== `#${route}`) {
    history.replaceState(null, '', `#${route}`);
  }
}

function currentRoute() {
  return (window.location.hash || `#${DEFAULT_ROUTE}`).slice(1);
}

window.addEventListener('hashchange', () => {
  if (window.__booted) navigate(currentRoute());
});

// Boot is gated on authentication: firebase-init.js calls window.bootApp()
// once a user is signed in (and after the one-time localStorage migration).
// Until then the login overlay covers the app and nothing is rendered.
window.bootApp = function () {
  window.__booted = true;
  navigate(currentRoute());
  // Keep the push token alive (iOS tokens expire) — silent if not yet permitted.
  if (window.Reminders && window.Reminders.refresh) window.Reminders.refresh();
};

// Lightweight toast for save confirmations
window.showToast = function (msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 1800);
};

// Tiny handoff slot so the timer can hand a completed sit to the log screen.
// Payload shape: { duration_min: number, intention: string }
window.PENDING_LOG = null;
