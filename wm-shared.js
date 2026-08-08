/**
 * Shared helpers for both dashboard pages.
 * Load with <script src="wm-shared.js" defer></script> before your page script.
 */

const WM = (() => {
  const escapeHtml = value =>
    String(value == null ? '' : value).replace(
      /[&<>'"]/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])
    );

  /**
   * Stale-while-revalidate GET.
   *
   * Behaviour:
   *  1. If a non-stale cached copy exists → call onData(data, true) immediately
   *     and SKIP the network fetch entirely (fast path).
   *  2. If no cache or cache is stale → fetch, call onData(data, false), then
   *     persist to localStorage.
   *
   * This avoids the old "call onData twice every visit" pattern which
   * caused the UI to render, then re-render moments later even when the
   * data hadn't changed.
   *
   * @param {string}   url        - Endpoint URL
   * @param {string}   cacheKey   - localStorage key
   * @param {Function} onData     - callback(data, fromCache)
   * @param {object}   [opts]
   * @param {number}   [opts.maxAgeMs=300000] - max cache age before forced refetch
   */
  async function fetchWithCache(url, cacheKey, onData, { maxAgeMs = 5 * 60 * 1000 } = {}) {
    // ── Fast path: serve from cache without touching the network ──────────────
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { savedAt, data } = JSON.parse(raw);
        if (Date.now() - savedAt < maxAgeMs) {
          onData(data, true);
          return { data, servedFromCache: true };
        }
      }
    } catch (_) { /* corrupt entry — fall through to network */ }

    // ── Network fetch ─────────────────────────────────────────────────────────
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.error) throw new Error(data.error);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) { /* storage full / private-mode — non-fatal */ }

    onData(data, false);
    return { data, servedFromCache: false };
  }

  return { escapeHtml, fetchWithCache };
})();
