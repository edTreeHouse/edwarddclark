(() => {
  'use strict';

  const config = window.EDC_OBSERVATORY_CONFIG || {};
  const auth = document.getElementById('auth');
  const dashboard = document.getElementById('dashboard');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const signIn = document.getElementById('sign-in');
  const signOut = document.getElementById('sign-out');
  const refresh = document.getElementById('refresh');

  const tokenKey = 'edc_observatory_access_token';
  const verifierKey = 'edc_observatory_pkce_verifier';
  const stateKey = 'edc_observatory_oauth_state';

  const showError = message => {
    error.textContent = message;
    error.hidden = false;
    loading.hidden = true;
  };

  const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const randomValue = (length = 48) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  };

  const login = async () => {
    const verifier = randomValue(64);
    const state = randomValue(32);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = base64url(digest);
    sessionStorage.setItem(verifierKey, verifier);
    sessionStorage.setItem(stateKey, state);
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: 'openid email',
      redirect_uri: config.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    });
    window.location.assign(`${config.cognitoDomain}/oauth2/authorize?${params}`);
  };

  const exchangeCode = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem(stateKey);
    const verifier = sessionStorage.getItem(verifierKey);
    if (!returnedState || returnedState !== expectedState || !verifier) {
      throw new Error('The authentication response could not be verified.');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier
    });
    const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
      method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body
    });
    if (!response.ok) throw new Error('Authentication could not be completed.');
    const tokens = await response.json();
    sessionStorage.setItem(tokenKey, tokens.access_token);
    sessionStorage.removeItem(verifierKey);
    sessionStorage.removeItem(stateKey);
    history.replaceState({}, document.title, window.location.pathname);
  };

  const logoutUrl = () => {
    const params = new URLSearchParams({client_id: config.clientId, logout_uri: config.logoutUri});
    return `${config.cognitoDomain}/logout?${params}`;
  };

  const api = async () => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token) throw new Error('SIGN_IN_REQUIRED');
    const response = await fetch(`${config.apiBaseUrl}/overview`, {
      headers: {authorization: `Bearer ${token}`},
      cache: 'no-store'
    });
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem(tokenKey);
      throw new Error('SIGN_IN_REQUIRED');
    }
    if (!response.ok) throw new Error(`Observatory API returned ${response.status}.`);
    return response.json();
  };

  const set = (id, value) => { document.getElementById(id).textContent = value; };
  const duration = seconds => {
    const s = Number(seconds || 0);
    if (s < 60) return `${Math.round(s)}s`;
    const minutes = Math.floor(s / 60);
    const remainder = Math.round(s % 60);
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  };

  const renderRanked = (containerId, items) => {
    const container = document.getElementById(containerId);
    container.replaceChildren();
    const values = items || [];
    const max = Math.max(1, ...values.map(item => Number(item.count || 0)));
    if (!values.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'No retained session evidence yet.';
      container.appendChild(p);
      return;
    }
    values.forEach(item => {
      const row = document.createElement('div');
      row.className = 'rank-row';
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = item.name;
      const track = document.createElement('span');
      track.className = 'rank-track';
      const fill = document.createElement('span');
      fill.className = 'rank-fill';
      fill.style.width = `${Math.max(3, (item.count / max) * 100)}%`;
      track.appendChild(fill);
      const count = document.createElement('strong');
      count.className = 'rank-count';
      count.textContent = item.count;
      row.append(name, track, count);
      container.appendChild(row);
    });
  };

  const renderList = (id, items) => {
    const list = document.getElementById(id);
    list.replaceChildren();
    (items || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.name} — ${item.count}`;
      list.appendChild(li);
    });
    if (!list.children.length) {
      const li = document.createElement('li');
      li.textContent = 'No retained evidence yet.';
      list.appendChild(li);
    }
  };

  const renderTrend = items => {
    const container = document.getElementById('trend');
    container.replaceChildren();
    const values = (items || []).slice(-14);
    const max = Math.max(1, ...values.map(item => Number(item.sessions || 0)));
    values.forEach(item => {
      const col = document.createElement('div');
      col.className = 'trend-col';
      const value = document.createElement('span');
      value.className = 'trend-value';
      value.textContent = item.sessions;
      const bar = document.createElement('div');
      bar.className = 'trend-bar';
      bar.style.height = `${Math.max(item.sessions ? 5 : 1, (item.sessions / max) * 82)}%`;
      const label = document.createElement('span');
      label.className = 'trend-label';
      const date = new Date(`${item.date}T00:00:00Z`);
      label.textContent = date.toLocaleDateString(undefined, {month: 'numeric', day: 'numeric', timeZone: 'UTC'});
      col.title = `${item.date}: ${item.sessions} session${item.sessions === 1 ? '' : 's'}`;
      col.append(value, bar, label);
      container.appendChild(col);
    });
  };

  const render = payload => {
    const today = payload.today || {};
    const seven = payload.last_7_days || {};
    const thirty = payload.last_30_days || {};
    const ops = payload.operations || {};
    const freshness = payload.freshness || {};

    set('generated-at', `Calculated ${new Date(payload.generated_at).toLocaleString()} · 30-day retention`);
    set('sessions-today', today.sessions ?? 0);
    set('pages-today', `${today.page_views ?? 0} page views`);
    set('sessions-7', seven.sessions ?? 0);
    set('avg-pages-7', `${seven.average_pages_per_session ?? 0} pages / session`);
    set('sessions-30', thirty.sessions ?? 0);
    set('duration-30', `${duration(thirty.median_session_seconds)} median duration`);
    set('csi-7', seven.csi_crossover_sessions ?? 0);
    set('csi-rate-7', `${Math.round((seven.csi_crossover_rate || 0) * 100)}% of sessions`);
    set('average-pages', thirty.average_pages_per_session ?? 0);
    set('median-duration', duration(thirty.median_session_seconds));
    set('csi-30', thirty.csi_crossover_sessions ?? 0);

    renderRanked('sources', seven.top_sources);
    renderList('top-pages', seven.top_pages);
    renderList('entry-pages', seven.top_entry_pages);
    renderTrend(thirty.daily_sessions);

    if (ops.available) {
      set('cf-requests', Number(ops.requests || 0).toLocaleString());
      set('cf-4xx', `${Number(ops.error_rate_4xx || 0).toFixed(2)}%`);
      set('cf-5xx', `${Number(ops.error_rate_5xx || 0).toFixed(2)}%`);
      const pill = document.getElementById('health-pill');
      pill.textContent = ops.healthy ? 'Delivery healthy' : 'Delivery needs review';
      pill.classList.toggle('good', Boolean(ops.healthy));
    } else {
      set('cf-requests', 'Unavailable');
      set('cf-4xx', 'Unavailable');
      set('cf-5xx', 'Unavailable');
      document.getElementById('health-pill').textContent = 'Operational metrics unavailable';
    }

    const mins = freshness.minutes_since_latest_event;
    set('freshness', mins == null ? 'No telemetry yet' : mins < 1 ? 'Less than 1m ago' : `${mins}m ago`);
  };

  const load = async () => {
    loading.hidden = false;
    error.hidden = true;
    try {
      const payload = await api();
      render(payload);
      auth.hidden = true;
      dashboard.hidden = false;
      signOut.hidden = false;
      refresh.hidden = false;
      loading.hidden = true;
    } catch (err) {
      loading.hidden = true;
      if (err.message === 'SIGN_IN_REQUIRED') {
        auth.hidden = false;
        dashboard.hidden = true;
        signOut.hidden = true;
        refresh.hidden = true;
        return;
      }
      showError(err.message || 'The Observatory could not be loaded.');
    }
  };

  signIn.addEventListener('click', () => login().catch(err => showError(err.message)));
  signOut.addEventListener('click', () => {
    sessionStorage.removeItem(tokenKey);
    window.location.assign(logoutUrl());
  });
  refresh.addEventListener('click', load);

  (async () => {
    if (!config.apiBaseUrl || !config.cognitoDomain || !config.clientId) {
      showError('The Observatory runtime configuration is unavailable.');
      return;
    }
    try {
      await exchangeCode();
      await load();
    } catch (err) {
      showError(err.message || 'The Observatory could not be initialized.');
    }
  })();
})();
