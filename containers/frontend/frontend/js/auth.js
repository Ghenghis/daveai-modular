// DaveAI v7 - auth.js //

    function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
    function authHeaders() {
      const t = getToken();
      return t ? { 'Authorization': 'Bearer ' + t } : {};
    }
    function storeToken(token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_TS_KEY, String(Date.now()));
    }
    function clearToken() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TS_KEY);
    }
    function isTokenExpired() {
      const ts = parseInt(localStorage.getItem(TOKEN_TS_KEY) || '0', 10);
      return !ts || (Date.now() - ts) > TOKEN_TTL_MS;
    }

    const ADMIN_EMAIL = 'fnice1971@gmail.com';
    let _authMode = 'signin'; // 'signin' or 'signup'
    function authSubmit() {
      const errEl = document.getElementById('am-err');
      const emailInp = document.getElementById('am-email');
      const passInp = document.getElementById('am-pass');
      const email = (emailInp?.value || '').trim().toLowerCase();
      const pass = passInp?.value || '';
      if (!email || !pass) {
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Please enter email and password'; }
        return;
      }
      // Reset border colors
      if (emailInp) emailInp.style.borderColor = '';
      if (passInp) passInp.style.borderColor = '';
      if (errEl) errEl.style.display = 'none';

      if (_authMode === 'signup') {
        const pass2 = document.getElementById('am-pass2')?.value || '';
        const name = document.getElementById('am-name')?.value || '';
        if (pass !== pass2) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Passwords do not match'; }
          return;
        }
        if (pass.length < 8) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Password must be at least 8 characters'; }
          return;
        }
        // Register
        fetch('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass, display_name: name })
        })
          .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.detail || 'Registration failed'); }))
          .then(d => { storeToken(d.token); _completeSignIn(d); })
          .catch(e => {
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
          });
      } else {
        // Sign in — try new /auth/login first, fallback to /admin/login
        fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass })
        })
          .then(r => {
            if (r.ok) return r.json();
            return r.json().then(d => { throw new Error(d.detail || 'Invalid email or password'); });
          })
          .then(d => { storeToken(d.token); _completeSignIn(d); })
          .catch(e => {
            // Fallback: try legacy /admin/login for backward compat
            if (email === ADMIN_EMAIL) {
              fetch('/api/admin/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pass })
              })
                .then(r => r.ok ? r.json() : r.json().then(d2 => { throw new Error(d2.detail || 'Invalid password'); }))
                .then(d => {
                  storeToken(d.token);
                  _completeSignIn({ email, role: 'admin', display_name: 'DaveAI' });
                })
                .catch(e2 => {
                  if (errEl) { errEl.style.display = 'block'; errEl.textContent = e2.message || e.message; }
                  if (passInp) passInp.style.borderColor = '#f87171';
                });
            } else {
              if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
              if (passInp) passInp.style.borderColor = '#f87171';
            }
          });
      }
    }

    function _completeSignIn(data) {
