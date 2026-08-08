(() => {
  'use strict';

  const SESSION_KEY = 'edc-acquisition-v1';
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
        captured_at: new Date().toISOString()
      };
    } catch {
      return null;
    }
  };

  const readStored = () => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
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
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(attribution));
    } catch {
      // Attribution is best-effort and must never block navigation.
    }
  };

  const attribution = explicitAttribution() || readStored() || referrerAttribution();
  if (attribution && !readStored()) store(attribution);
  if (explicitAttribution()) store(attribution);

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
})();
