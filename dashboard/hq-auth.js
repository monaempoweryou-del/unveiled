/* UNVEILED HQ — shared staff auth guard (defense-in-depth for #015).
 *
 * Drop into any internal page that reads Supabase. It does two things:
 *   1) Patches window.fetch so calls to the Supabase REST API carry the signed-in
 *      staff member's JWT (Authorization: Bearer <jwt>) instead of just the anon
 *      key — so RLS sees an authenticated user.
 *   2) Renders a full-screen sign-in overlay until a session exists, so a public
 *      visitor can never see customer PII on the page.
 *
 * The REAL boundary is the database RLS (Backend/secure-leads-pii.sql); this is
 * the client-side layer on top (Integrity Standard, Book 04 §4b: expose + gate).
 *
 * Requires @supabase/supabase-js v2 loaded BEFORE this file.
 */
(function () {
  var URL  = 'https://eosvftmiwndmctrqprtz.supabase.co';
  var ANON = 'sb_publishable_BYxqF1ViwTrfaI4RGhciVw_kgbt-pSA';
  var _sb = null;

  function sb() {
    if (_sb) return _sb;
    if (!window.supabase) return null;
    _sb = window.supabase.createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return _sb;
  }

  // 1) Attach the staff JWT to Supabase REST calls.
  var _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url.indexOf(URL) !== -1 && sb()) {
        init = init || {};
        var headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        var s = await sb().auth.getSession();
        var tok = s && s.data && s.data.session && s.data.session.access_token;
        if (tok) {
          headers.set('Authorization', 'Bearer ' + tok);
          if (!headers.get('apikey')) headers.set('apikey', ANON);
          init.headers = headers;
        }
      }
    } catch (e) { /* fall through with original request */ }
    return _fetch(input, init);
  };

  // 2) Sign-in overlay.
  function overlay() {
    if (document.getElementById('hq-auth-ov')) return;
    var d = document.createElement('div');
    d.id = 'hq-auth-ov';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0B0916;color:#FAF8F5;' +
      'display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';
    d.innerHTML =
      '<div style="max-width:360px;text-align:center;padding:28px;">' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:20px;letter-spacing:.02em;margin-bottom:6px;">UNVEILED — Staff Sign-in</div>' +
      '<div style="color:#9b95ad;font-size:13.5px;margin-bottom:18px;">Internal console. This page shows customer data and is restricted to authenticated staff.</div>' +
      '<input id="hq-auth-email" type="email" placeholder="you@monadigitalmarketing.com" ' +
      'style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #2c2640;background:#171326;color:#fff;font-size:14px;outline:none;margin-bottom:8px;">' +
      '<input id="hq-auth-pass" type="password" placeholder="password" ' +
      'style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #2c2640;background:#171326;color:#fff;font-size:14px;outline:none;margin-bottom:10px;">' +
      '<button id="hq-auth-go" style="width:100%;padding:12px;border:0;border-radius:10px;cursor:pointer;' +
      'background:linear-gradient(135deg,#6C3CE0,#8B5CF6);color:#fff;font-weight:600;font-size:14px;">Sign in</button>' +
      '<div id="hq-auth-msg" style="color:#9b95ad;font-size:12.5px;margin-top:12px;min-height:16px;"></div>' +
      '</div>';
    document.body.appendChild(d);
    document.documentElement.style.overflow = 'hidden';
    document.getElementById('hq-auth-go').onclick = doSignIn;
    document.getElementById('hq-auth-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
  }
  function msg(t) { var m = document.getElementById('hq-auth-msg'); if (m) m.textContent = t; }
  async function doSignIn() {
    var email = (document.getElementById('hq-auth-email') || {}).value;
    var pass = (document.getElementById('hq-auth-pass') || {}).value;
    if (!email || !pass) { msg('Enter your staff email and password.'); return; }
    if (!sb()) { msg('Auth library not loaded.'); return; }
    msg('Signing in…');
    try {
      var r = await sb().auth.signInWithPassword({ email: email.trim(), password: pass });
      if (r.error) { msg('Error: ' + r.error.message); }
      else { msg('Signed in.'); clearOverlay(); location.reload(); }
    } catch (e) { msg('Error: ' + (e.message || e)); }
  }
  function clearOverlay() {
    var d = document.getElementById('hq-auth-ov'); if (d) d.remove();
    document.documentElement.style.overflow = '';
  }

  async function gate() {
    if (!sb()) { overlay(); return; }
    try {
      var s = await sb().auth.getSession();
      if (s && s.data && s.data.session) { clearOverlay(); }
      else { overlay(); }
    } catch (e) { overlay(); }
  }

  window.HQAuth = { gate: gate, client: sb, signOut: function () { if (sb()) sb().auth.signOut().then(function(){location.reload();}); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', gate);
  else gate();
})();
