/**
 * Shared helpers for both dashboard pages.
 * Load with <script src="wm-shared.js" defer></script> before your page script.
 */

const WM = (() => {
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>'"]/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]
  ));

  /**
   * Stale-while-revalidate GET. Renders instantly from a cached copy (if any
   * and if not stale beyond maxAgeMs), then always fetches fresh data and
   * calls onFresh again once it lands. This is the single biggest perceived-
   * speed win on a slow mobile connection: the user sees numbers immediately
   * instead of staring at the loading overlay every visit.
   */
  async function fetchWithCache(url, cacheKey, onData, { maxAgeMs = 5 * 60 * 1000 } = {}) {
    let servedFromCache = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { savedAt, data } = JSON.parse(raw);
        if (Date.now() - savedAt < maxAgeMs) {
          onData(data, true);
          servedFromCache = true;
        }
      }
    } catch (_) { /* corrupt cache entry — ignore and refetch */ }

    const response = await fetch(url);
    const data = await response.json();
    if (data && data.error) throw new Error(data.error);
    try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) { /* storage full/unavailable — non-fatal */ }
    onData(data, false);
    return { data, servedFromCache };
  }

  /**
   * Rules-based "Smart Insights" — no external AI call, just heuristics over
   * numbers already on screen. Swap-in point for a real LLM summary later:
   * POST the same `rows`/`totals` to your own small server-side proxy that
   * calls the Claude API and returns a sentence or two instead of this list.
   */
  function computeInsights(sections, threshold) {
    const insights = [];

    sections.forEach(({ label, rows, totals }) => {
      if (!rows.length) return;

      // 1. Stalled entities: pending work, zero movement today.
      const stalled = rows.filter(r => r.pendency > 0 && r.completion === 0);
      if (stalled.length) {
        const worst = [...stalled].sort((a, b) => b.pendency - a.pendency)[0];
        insights.push({
          tone: 'warn',
          text: `${escapeHtml(worst.name)} (${label}) has ${worst.pendency} pending and zero completions today` +
                (stalled.length > 1 ? ` — ${stalled.length - 1} other ${label.toLowerCase()}${stalled.length > 2 ? 's are' : ' is'} also stalled.` : '.')
        });
      }

      // 2. Concentration: is pendency piling up in a few places?
      if (totals.pendency > 0 && rows.length > 3) {
        const top3 = [...rows].sort((a, b) => b.pendency - a.pendency).slice(0, 3);
        const top3Share = top3.reduce((sum, r) => sum + r.pendency, 0) / totals.pendency;
        if (top3Share >= 0.4) {
          insights.push({
            tone: 'info',
            text: `${Math.round(top3Share * 100)}% of all pendency sits in just 3 ${label.toLowerCase()}s (${top3.map(r => escapeHtml(r.name)).join(', ')}) — prioritizing these clears the backlog fastest.`
          });
        }
      }

      // 3. Best performer today, for a positive signal alongside the warnings.
      const withRatio = rows.filter(r => r.pendency > 0).map(r => ({ ...r, ratio: r.completion / r.pendency }));
      if (withRatio.length) {
        const best = withRatio.sort((a, b) => b.ratio - a.ratio)[0];
        if (best.ratio > 0) {
          insights.push({
            tone: 'good',
            text: `${escapeHtml(best.name)} (${label}) is clearing the fastest today: ${best.completion} completions against ${best.pendency} pending.`
          });
        }
      }

      // 4. Data quality: how much is unattributable?
      const missing = rows.find(r => r.name === 'FC Name Missing');
      if (missing && totals.pendency > 0 && missing.pendency / totals.pendency > 0.1) {
        insights.push({
          tone: 'warn',
          text: `${Math.round((missing.pendency / totals.pendency) * 100)}% of ${label.toLowerCase()}-level pendency has no Fleet Coach on record — worth checking the source sheet mapping.`
        });
      }
    });

    return insights;
  }

  function renderInsights(containerId, sections, threshold) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const insights = computeInsights(sections, threshold);
    if (!insights.length) { container.innerHTML = ''; return; }

    const toneClass = { warn: 'wm-insight-warn', info: 'wm-insight-info', good: 'wm-insight-good' };
    container.innerHTML = `<div class="wm-insights"><div class="wm-insights-title">Smart Insights</div>` +
      insights.slice(0, 4).map(i => `<div class="wm-insight ${toneClass[i.tone]}">${i.text}</div>`).join('') +
      `</div>`;
  }

  return { escapeHtml, fetchWithCache, computeInsights, renderInsights };
})();
