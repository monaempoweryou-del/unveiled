/* ============================================================
   UNVEILED · Animated Sphere engine (LS-SPHERE) — ONE shared component.
   Mounts into every <div class="unv-sphere"></div>: builds the orbit
   (ring + upright website screens + stardust) and drives a slow,
   continuous horizontal turn + breathing. GPU-accelerated, no jitter.
   Pair with /sphere.css. Identical sphere everywhere it is used.
   ============================================================ */
(function () {
  function init() {
    var BASE = 'https://unveiled.pro/';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TILES = [1,2,3,4,5,6].map(function (n) { return BASE + 'orbit-screen-' + n + '.png'; });
    var TAU = Math.PI * 2;
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var SPHERE_Z = 5;

    var RING_BACK  = '<svg class="ss-ring ss-ring-back" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="49" ry="18"/></svg>';
    var RING_FRONT = '<svg class="ss-ring ss-ring-front" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M1.5,50 A48.5,18 0 0 0 98.5,50"/></svg>';

    // Build inner markup for each placeholder.
    document.querySelectorAll('.unv-sphere').forEach(function (host) {
      if (host.querySelector('.sphere-sys')) return; // already mounted
      var alt = host.getAttribute('data-alt') || 'UNVEILED';
      host.innerHTML =
        '<div class="sphere-sys">' +
          '<div class="ss-glow"></div>' +
          '<div class="ss-orbit"></div>' +
          '<div class="ss-core"><div class="ss-core-f">' +
            '<img class="ss-core-i" src="' + BASE + 'sphere-core.png" alt="' + alt + '" />' +
          '</div><div class="ss-sheen"></div></div>' +
        '</div>';
    });

    var systems = [];
    document.querySelectorAll('.sphere-sys').forEach(function (sys) {
      var orbit = sys.querySelector('.ss-orbit');
      if (!orbit || orbit.getAttribute('data-built')) return;
      orbit.setAttribute('data-built', '1');
      orbit.innerHTML = '';
      orbit.insertAdjacentHTML('beforeend', RING_BACK);
      var els = [];
      for (var i = 0; i < 6; i++) {
        var im = document.createElement('img');
        im.className = 'orbit-screen'; im.src = TILES[i]; im.alt = '';
        orbit.appendChild(im);
        els.push({ el: im, phase: i / 6, spd: 1.0, rx: rnd(0.97, 1.03), ry: rnd(0.96, 1.04), wob: 0.006, wf: rnd(0.35, 0.6), size: 1.0 });
      }
      for (var j = 0; j < 4; j++) {
        var im2 = document.createElement('img');
        im2.className = 'orbit-screen mini'; im2.src = TILES[(j * 2) % 6]; im2.alt = '';
        orbit.appendChild(im2);
        els.push({ el: im2, phase: (j / 4) + 0.11, spd: 1.26, rx: rnd(0.82, 0.95), ry: rnd(1.0, 1.12), wob: 0.012, wf: rnd(0.5, 0.85), size: 1.0 });
      }
      for (var k = 0; k < 12; k++) {
        var d = document.createElement('span');
        d.className = 'orbit-dot';
        orbit.appendChild(d);
        els.push({ el: d, phase: Math.random(), spd: rnd(1.4, 1.75), rx: rnd(0.78, 1.12), ry: rnd(0.85, 1.18), wob: rnd(0.02, 0.04), wf: rnd(0.6, 1.3), size: rnd(0.5, 1.1), dot: true });
      }
      orbit.insertAdjacentHTML('beforeend', RING_FRONT);
      systems.push({ sys: sys, els: els, core: sys.querySelector('.ss-core-i') });
    });
    if (!systems.length) return;

    var start = performance.now();
    function frame(now) {
      var t = (now - start) / 1000;
      for (var s = 0; s < systems.length; s++) {
        var sysObj = systems[s], sys = sysObj.sys, els = sysObj.els, core = sysObj.core;
        var w = sys.clientWidth, h = sys.clientHeight;
        if (!w) continue;
        if (core) {
          var sa = reduce ? 0 : -(12 * Math.sin(t * 0.10) + 6 * Math.sin(t * 0.063 + 1.2));
          core.style.transform = 'rotateY(' + sa.toFixed(2) + 'deg)';
        }
        var A = w * 0.50, B = h * 0.18;
        for (var e = 0; e < els.length; e++) {
          var o = els[e];
          var ang = (reduce ? 0.7 : t * 0.20 * o.spd) + o.phase * TAU;
          var wob = o.wob * Math.sin(t * o.wf + o.phase * TAU) * h;
          var x = A * o.rx * Math.cos(ang);
          var y = B * o.ry * Math.sin(ang) + wob;
          var front = (Math.sin(ang) + 1) / 2;
          var sc = o.size * (0.72 + 0.28 * front);
          var op = (o.dot ? 0.3 : 0.42) + 0.55 * front;
          var el = o.el;
          el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
          el.style.opacity = op.toFixed(2);
          el.style.zIndex = front > 0.5 ? String(SPHERE_Z + 1 + Math.round(front * 6)) : String(1 + Math.round(front * 6));
        }
      }
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
