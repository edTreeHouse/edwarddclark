(() => {
  'use strict';

  const ACQUISITION_KEY = 'edc-acquisition-v1';
  const TELEMETRY_SESSION_KEY = 'edc-site-session-v1';
  const TELEMETRY_STARTED_KEY = 'edc-site-session-started-v1';
  const TELEMETRY_CONFIG_URL = '/telemetry-config.json';
  const CSI_HOSTS = new Set(['collectivestateinference.org', 'www.collectivestateinference.org']);
  const EDC_HOSTS = new Set(['edwarddclark.com', 'www.edwarddclark.com']);
  const MAX_VALUE_LENGTH = 160;

  const clean = value => String(value || '')
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, MAX_VALUE_LENGTH);

  const normalizedSource = host => {
    const value = String(host || '').toLowerCase();
    if (!value) return '';
    if (value.includes('linkedin.com')) return 'linkedin';
    if (value.includes('scholar.google')) return 'google_scholar';
    if (value.includes('google.')) return 'google';
    if (value.includes('bing.com')) return 'bing';
    if (value.includes('github.com')) return 'github';
    if (value.includes('chatgpt.com')) return 'chatgpt';
    if (value.includes('perplexity.ai')) return 'perplexity';
    return value.replace(/^www\./, '');
  };

  const explicitAttribution = () => {
    const params = new URLSearchParams(window.location.search);
    const source = clean(params.get('utm_source'));
    if (!source) return null;
    return {
      source,
      medium: clean(params.get('utm_medium')) || 'referral',
      campaign: clean(params.get('utm_campaign')) || 'unspecified',
      content: clean(params.get('utm_content')),
      via: clean(params.get('via')),
      captured_at: new Date().toISOString()
    };
  };

  const referrerAttribution = () => {
    if (!document.referrer) return null;
    try {
      const referrer = new URL(document.referrer);
      if (EDC_HOSTS.has(referrer.hostname)) return null;
      const source = normalizedSource(referrer.hostname);
      if (!source) return null;
      return {
        source,
        medium: 'referral',
        campaign: 'organic_referral',
        content: '',
        via: '',
        captured_at: new Date().toISOString()
      };
    } catch {
      return null;
    }
  };

  const readStored = () => {
    try {
      const raw = sessionStorage.getItem(ACQUISITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && clean(parsed.source) ? parsed : null;
    } catch {
      return null;
    }
  };

  const store = attribution => {
    if (!attribution) return;
    try {
      sessionStorage.setItem(ACQUISITION_KEY, JSON.stringify(attribution));
    } catch {
      // Attribution is best-effort and must never block navigation.
    }
  };

  const explicit = explicitAttribution();
  const attribution = explicit || readStored() || referrerAttribution();
  if (attribution && !readStored()) store(attribution);
  if (explicit) store(attribution);

  document.querySelectorAll('a[href]').forEach(link => {
    try {
      const destination = new URL(link.href, window.location.href);
      if (!CSI_HOSTS.has(destination.hostname)) return;

      destination.searchParams.set('via', 'edwarddclark.com');
      if (attribution?.source) destination.searchParams.set('utm_source', clean(attribution.source));
      if (attribution?.medium) destination.searchParams.set('utm_medium', clean(attribution.medium));
      if (attribution?.campaign) destination.searchParams.set('utm_campaign', clean(attribution.campaign));
      if (attribution?.content) destination.searchParams.set('utm_content', clean(attribution.content));

      link.href = destination.toString();
    } catch {
      // Leave malformed or non-http links unchanged.
    }
  });

  const privacyPreferenceEnabled = () => (
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1'
  );

  const randomId = () => (
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`
  );

  const sessionId = () => {
    try {
      let value = sessionStorage.getItem(TELEMETRY_SESSION_KEY);
      if (!value) {
        value = randomId();
        sessionStorage.setItem(TELEMETRY_SESSION_KEY, value);
      }
      return value;
    } catch {
      return randomId();
    }
  };

  const sessionStarted = () => {
    try {
      let value = Number(sessionStorage.getItem(TELEMETRY_STARTED_KEY));
      if (!Number.isFinite(value) || value <= 0) {
        value = Date.now();
        sessionStorage.setItem(TELEMETRY_STARTED_KEY, String(value));
      }
      return value;
    } catch {
      return Date.now();
    }
  };

  const sanitizedUrl = value => {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return `${url.origin}${url.pathname}`.slice(0, 1000);
    } catch {
      return '';
    }
  };

  const telemetryPayload = (eventType, destinationUrl = '') => ({
    event_type: eventType,
    session_id: sessionId(),
    page_url: `${window.location.origin}${window.location.pathname}`,
    page_title: document.title,
    referrer: sanitizedUrl(document.referrer),
    acquisition_source: clean(attribution?.source),
    acquisition_medium: clean(attribution?.medium),
    acquisition_campaign: clean(attribution?.campaign),
    acquisition_content: clean(attribution?.content),
    acquisition_via: clean(attribution?.via),
    destination_url: sanitizedUrl(destinationUrl),
    timestamp: new Date().toISOString(),
    session_elapsed_seconds: Math.max(0, Math.round((Date.now() - sessionStarted()) / 1000)),
    language: navigator.language || '',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  });

  const sendTelemetry = async (endpoint, eventType, destinationUrl = '') => {
    try {
      await fetch(`${endpoint.replace(/\/+$/, '')}/event`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(telemetryPayload(eventType, destinationUrl))
      });
    } catch {
      // Telemetry is intentionally non-blocking.
    }
  };

  const initializeProfessionalCredentials = () => {
    if (window.location.pathname !== '/current-work/' && window.location.pathname !== '/current-work/index.html') return;
    const architectureTitle = document.getElementById('architecture-title');
    const sectionCopy = architectureTitle?.closest('.section-copy');
    const workStreams = sectionCopy?.querySelector('.work-streams');
    if (!sectionCopy || !workStreams || sectionCopy.querySelector('.credential-block')) return;

    const credentials = [
      {
        image: '/assets/aws-certified-solutions-architect-associate.webp',
        alt: 'AWS Certified Solutions Architect Associate badge',
        name: 'AWS Certified Solutions Architect – Associate'
      },
      {
        image: '/assets/microsoft-certified-azure-solutions-architect-expert.webp',
        alt: 'Microsoft Certified Azure Solutions Architect Expert badge',
        name: 'Microsoft Certified: Azure Solutions Architect Expert'
      },
      {
        image: '/assets/aws-certified-machine-learning-engineer-associate.webp',
        alt: 'AWS Certified Machine Learning Engineer Associate badge',
        name: 'AWS Certified Machine Learning Engineer – Associate'
      }
    ];

    const block = document.createElement('div');
    block.className = 'credential-block';
    block.setAttribute('aria-labelledby', 'credentials-title');
    block.innerHTML = `
      <p class="work-label">Selected professional credentials</p>
      <h3 id="credentials-title" class="credential-title">Cloud and machine learning certifications supporting current practice</h3>
      <div class="credential-grid">
        ${credentials.map(credential => `
          <article class="credential-item">
            <img src="${credential.image}" alt="${credential.alt}">
            <p>${credential.name}</p>
          </article>
        `).join('')}
      </div>
      <p class="credential-verification"><a href="https://www.credly.com/users/ed-clark.d141b096" target="_blank" rel="noopener">View all verified credentials on Credly <span aria-hidden="true">↗</span></a></p>
    `;
    workStreams.insertAdjacentElement('afterend', block);

    const style = document.createElement('style');
    style.textContent = `
      .credential-block { margin-top: 2rem; padding-top: 1.75rem; border-top: 1px solid var(--line); }
      .credential-title { margin: 0; max-width: 44rem; font-size: clamp(1.25rem, 2vw, 1.55rem); line-height: 1.25; }
      .credential-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 1.4rem; }
      .credential-item { display: grid; grid-template-rows: 9rem auto; place-items: center; gap: 0.85rem; min-height: 13.5rem; padding: 1.15rem; border: 1px solid var(--line); border-radius: 1rem; background: rgba(255,255,255,0.018); text-align: center; }
      .credential-item img { display: block; width: auto; max-width: 8.5rem; height: 8.5rem; object-fit: contain; }
      .credential-item p { margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.4; }
      .credential-verification { margin: 1rem 0 0; }
      .credential-verification a { color: var(--accent); font-size: 0.9rem; font-weight: 700; text-decoration: none; }
      .credential-verification a:hover, .credential-verification a:focus-visible { text-decoration: underline; text-underline-offset: 0.2em; }
      @media (max-width: 52rem) { .credential-grid { grid-template-columns: 1fr; } .credential-item { grid-template-rows: 7.5rem auto; min-height: auto; } .credential-item img { max-width: 7rem; height: 7rem; } }
    `;
    document.head.appendChild(style);
  };

  const initializeTelemetry = async () => {
    if (!EDC_HOSTS.has(window.location.hostname)) return;
    if (navigator.webdriver || privacyPreferenceEnabled()) return;

    try {
      const response = await fetch(TELEMETRY_CONFIG_URL, {cache: 'no-store', credentials: 'same-origin'});
      if (!response.ok) return;
      const config = await response.json();
      const endpoint = String(config.endpoint || '').trim();
      if (config.enabled !== true || !endpoint.startsWith('https://')) return;

      sessionStarted();
      window.setTimeout(() => sendTelemetry(endpoint, 'page_view'), 1000);
      window.addEventListener('pagehide', () => sendTelemetry(endpoint, 'session_update'), {once: true});

      document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link) return;
        try {
          const destination = new URL(link.href, window.location.href);
          if (!['http:', 'https:'].includes(destination.protocol)) return;
          if (EDC_HOSTS.has(destination.hostname)) return;
          sendTelemetry(endpoint, 'outbound_click', `${destination.origin}${destination.pathname}`);
        } catch {
          // Ignore malformed links.
        }
      }, {capture: true});
    } catch {
      // Missing configuration never affects the public site.
    }
  };

  initializeProfessionalCredentials();
  initializeTelemetry();
})();
