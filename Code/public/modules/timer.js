// 600 -- Timer module.
//
// Two modes:
//   Countdown: rotary dial sets session length (1-120 min), timer counts
//              down to zero, rings a bell at start and end.
//   Open:      no preset, counter runs up until the user taps "End".
//
// Timer uses Date.now() so it is immune to setTimeout drift over long sits.
// On completion, hands off (duration_min, intention) to window.PENDING_LOG
// and navigates to #log.

window.TimerModule = (function () {
  let phase = 'setup';        // 'setup' | 'active' | 'done'
  let mode = 'countdown';     // 'countdown' | 'open'
  let targetMinutes = 20;
  let intention = '';

  let state = null;
  // When running:
  //   { startMs, durationS (0=open), rafId, paused, pauseStartMs, pausedAccumMs,
  //     lastSecond }

  // ------------------- render dispatch -------------------

  function render() {
    const root = document.createElement('div');
    root.className = 'view';
    if (phase === 'setup')  root.appendChild(renderSetup());
    if (phase === 'active') root.appendChild(renderActive());
    if (phase === 'done')   root.appendChild(renderDone());
    return root;
  }

  function rerender() {
    document.getElementById('view').replaceChildren(render());
  }

  // ------------------- setup screen -------------------

  function renderSetup() {
    const wrap = document.createElement('div');
    wrap.className = 'card';

    const setup = document.createElement('div');
    setup.className = 'timer-setup';

    // Mode switch
    const modeSwitch = document.createElement('div');
    modeSwitch.className = 'mode-switch';
    modeSwitch.innerHTML = `
      <button data-mode="countdown" class="${mode === 'countdown' ? 'active' : ''}">Countdown</button>
      <button data-mode="open"      class="${mode === 'open'      ? 'active' : ''}">Open</button>
    `;
    modeSwitch.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        mode = b.dataset.mode;
        rerender();
      });
    });
    setup.appendChild(modeSwitch);

    // Dial (only in countdown mode)
    if (mode === 'countdown') {
      setup.appendChild(buildDial());
    } else {
      const hint = document.createElement('div');
      hint.style.textAlign = 'center';
      hint.style.color = 'var(--text-dim)';
      hint.style.fontSize = '13px';
      hint.style.maxWidth = '280px';
      hint.innerHTML = `
        <p class="serif" style="font-size:24px;color:var(--text);margin:20px 0 10px;">Open sit</p>
        <p>Counter runs up. Tap End when you are done.</p>
      `;
      setup.appendChild(hint);
    }

    // Intention field
    const intWrap = document.createElement('div');
    intWrap.className = 'intention-field';
    intWrap.innerHTML = `
      <label>Intention <span class="dimmer">(optional)</span></label>
      <input type="text" id="intention-input" placeholder="One line for this sit." maxlength="80" />
    `;
    const input = intWrap.querySelector('input');
    input.value = intention;
    input.addEventListener('input', e => { intention = e.target.value; });
    setup.appendChild(intWrap);

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Begin';
    startBtn.addEventListener('click', () => {
      startSit();
    });
    setup.appendChild(startBtn);

    wrap.appendChild(setup);
    return wrap;
  }

  function buildDial() {
    // SVG rotary dial 1-120 min. Drag to set value.
    const wrap = document.createElement('div');
    wrap.className = 'dial-wrap';

    const size = 260;
    const cx = size / 2, cy = size / 2;
    const r = 110;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    // Track (full circle)
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
    track.setAttribute('class', 'dial-track');
    svg.appendChild(track);

    // Tick marks every 15 min
    for (let m = 0; m <= 120; m += 15) {
      const angle = (m / 120) * 2 * Math.PI - Math.PI / 2;
      const r1 = r - 12, r2 = r - 4;
      const x1 = cx + r1 * Math.cos(angle), y1 = cy + r1 * Math.sin(angle);
      const x2 = cx + r2 * Math.cos(angle), y2 = cy + r2 * Math.sin(angle);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class', 'dial-tick');
      svg.appendChild(line);
    }

    // Fill arc
    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.setAttribute('class', 'dial-fill');
    svg.appendChild(fill);

    // Handle
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.setAttribute('r', 14);
    handle.setAttribute('class', 'dial-handle');
    svg.appendChild(handle);

    function update() {
      const frac = targetMinutes / 120;
      const endAngle = frac * 2 * Math.PI - Math.PI / 2;
      // Fill arc from top (-pi/2) to endAngle
      const startAngle = -Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + r * Math.cos(startAngle);
      const y0 = cy + r * Math.sin(startAngle);
      const x1 = cx + r * Math.cos(endAngle);
      const y1 = cy + r * Math.sin(endAngle);
      if (frac <= 0) {
        fill.setAttribute('d', '');
      } else if (frac >= 1) {
        // Draw as two arcs to avoid degenerate full-circle path
        fill.setAttribute('d', `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${x0} ${y0}`);
      } else {
        fill.setAttribute('d', `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`);
      }
      handle.setAttribute('cx', cx + r * Math.cos(endAngle));
      handle.setAttribute('cy', cy + r * Math.sin(endAngle));
      const label = wrap.querySelector('.dial-minutes');
      if (label) label.textContent = String(targetMinutes);
    }

    function pointToMinutes(clientX, clientY) {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * size;
      const py = ((clientY - rect.top) / rect.height) * size;
      const dx = px - cx, dy = py - cy;
      let angle = Math.atan2(dy, dx) + Math.PI / 2; // 0 = top
      if (angle < 0) angle += 2 * Math.PI;
      let frac = angle / (2 * Math.PI);
      let minutes = Math.round(frac * 120);
      if (minutes < 1) minutes = 1;
      if (minutes > 120) minutes = 120;
      return minutes;
    }

    let dragging = false;

    function onDown(e) {
      dragging = true;
      const pt = eventPoint(e);
      targetMinutes = pointToMinutes(pt.x, pt.y);
      update();
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const pt = eventPoint(e);
      targetMinutes = pointToMinutes(pt.x, pt.y);
      update();
      e.preventDefault();
    }
    function onUp() { dragging = false; }

    function eventPoint(e) {
      if (e.touches && e.touches.length) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    svg.addEventListener('mousedown',  onDown);
    svg.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchend',  onUp);

    wrap.appendChild(svg);

    const center = document.createElement('div');
    center.className = 'dial-center';
    center.innerHTML = `
      <div class="dial-minutes">${targetMinutes}</div>
      <div class="dial-min-label">Minutes</div>
    `;
    wrap.appendChild(center);

    update();
    return wrap;
  }

  // ------------------- active screen -------------------

  function startSit() {
    phase = 'active';
    const durationS = mode === 'countdown' ? targetMinutes * 60 : 0;
    state = {
      startMs: Date.now(),
      durationS,
      rafId: null,
      paused: false,
      pauseStartMs: null,
      pausedAccumMs: 0,
      lastSecond: -1,
    };
    beep(528, 250); // start bell
    rerender();
    tickLoop();
  }

  function elapsedS() {
    if (state.paused) {
      return (state.pauseStartMs - state.startMs - state.pausedAccumMs) / 1000;
    }
    return (Date.now() - state.startMs - state.pausedAccumMs) / 1000;
  }

  function renderActive() {
    const wrap = document.createElement('div');
    wrap.className = 'timer-active';
    wrap.appendChild(buildActiveContent());
    return wrap;
  }

  function buildActiveContent() {
    const frag = document.createDocumentFragment();

    // Breath pacer + timer display
    const pacer = document.createElement('div');
    pacer.className = 'timer-pacer';
    // A slow breath-pace circle. Always animated, whatever the variant --
    // it's a subtle anchor, not style-specific.
    pacer.innerHTML = `
      <div class="pacer-circle breathing"></div>
      <div class="timer-display" id="timer-display">--:--</div>
    `;
    frag.appendChild(pacer);

    const caption = document.createElement('div');
    caption.className = 'timer-caption';
    caption.textContent = mode === 'countdown' ? 'Countdown' : 'Open sit';
    frag.appendChild(caption);

    if (intention) {
      const intDisplay = document.createElement('div');
      intDisplay.className = 'intention-display';
      intDisplay.textContent = `"${intention}"`;
      frag.appendChild(intDisplay);
    }

    const controls = document.createElement('div');
    controls.className = 'timer-controls';
    controls.innerHTML = `
      <button class="ghost" id="timer-pause">${state && state.paused ? 'Resume' : 'Pause'}</button>
      <button class="secondary" id="timer-end">End</button>
    `;
    controls.querySelector('#timer-pause').addEventListener('click', pauseToggle);
    controls.querySelector('#timer-end').addEventListener('click', endSit);
    frag.appendChild(controls);

    const outer = document.createElement('div');
    outer.appendChild(frag);
    return outer;
  }

  function updateDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    let shownS;
    if (state.durationS > 0) {
      shownS = Math.max(0, state.durationS - elapsedS());
    } else {
      shownS = elapsedS();
    }
    el.textContent = formatTime(shownS);
  }

  function tickLoop() {
    if (!state || state.paused) return;

    // Check for end of countdown
    if (state.durationS > 0 && elapsedS() >= state.durationS) {
      endSit();
      return;
    }

    // Emit a halftime chime for countdowns >= 5 min
    if (state.durationS >= 300) {
      const half = state.durationS / 2;
      const secNow = Math.floor(elapsedS());
      if (state.lastSecond < half && secNow >= half) {
        beep(396, 120);
      }
      state.lastSecond = secNow;
    }

    updateDisplay();
    state.rafId = requestAnimationFrame(tickLoop);
  }

  function pauseToggle() {
    if (!state) return;
    if (state.paused) {
      state.pausedAccumMs += Date.now() - state.pauseStartMs;
      state.pauseStartMs = null;
      state.paused = false;
      tickLoop();
    } else {
      state.paused = true;
      state.pauseStartMs = Date.now();
      cancelAnimationFrame(state.rafId);
    }
    // rebuild only the controls to flip label
    const view = document.getElementById('view');
    view.replaceChildren(render());
  }

  function endSit() {
    if (!state) return;
    cancelAnimationFrame(state.rafId);
    // closing bell
    beep(528, 350);
    const totalMin = Math.max(1, Math.round(elapsedS() / 60));
    window.PENDING_LOG = {
      duration_min: totalMin,
      intention: intention,
    };
    phase = 'done';
    state = null;
    // Short "Done" splash, then navigate to log
    rerender();
    setTimeout(() => {
      intention = '';
      phase = 'setup';
      window.location.hash = '#log';
    }, 1400);
  }

  function renderDone() {
    const wrap = document.createElement('div');
    wrap.className = 'timer-done card';
    const mins = window.PENDING_LOG ? window.PENDING_LOG.duration_min : 0;
    wrap.innerHTML = `
      <div class="timer-done-duration">${mins}<span style="font-size:32px;color:var(--text-dim);"> min</span></div>
      <p class="muted">Opening the log.</p>
    `;
    return wrap;
  }

  function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${h}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Web Audio bell. Kept inline so the PWA has no audio assets.
  let audioCtx = null;
  function beep(freq = 528, durationMs = 250) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const now = audioCtx.currentTime;
      // Gentle envelope: attack 20ms, decay over durationMs
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.05);
    } catch (e) {
      // AudioContext can be blocked until user interaction; ignored.
    }
  }

  function reset() {
    if (state && state.rafId) cancelAnimationFrame(state.rafId);
    state = null;
    if (phase === 'active') {
      phase = 'setup';
    }
  }

  return { render, reset };
})();
