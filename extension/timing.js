// Local diagnostic numbers only: never record titles, URLs, IDs or account data.
let metadataMs;
let recorded = false;
let mode = 'optimized';
export function timingMode(value) { mode = value === 'baseline' ? 'baseline' : 'optimized'; }
export function metadataReady() { metadataMs ??= Math.round(performance.now()); }
export function popupReady({state, source, cacheHit = false}) {
  if (recorded || !globalThis.chrome?.storage?.session) return;
  recorded = true;
  const record = async () => {
    const entry = {at: new Date().toISOString(), version: chrome.runtime.getManifest().version,
      state, mode, source: ['arXiv', 'CVF Open Access', 'OpenReview', 'PDF'].includes(source) ? source : 'Other',
      metadataMs: metadataMs ?? null, usableMs: Math.round(performance.now()), cacheHit};
    try {
      const {popupTimingsV1 = []} = await chrome.storage.session.get('popupTimingsV1');
      await chrome.storage.session.set({popupTimingsV1: [...popupTimingsV1.slice(-19), entry]});
    } catch { /* Diagnostics must never stop the popup. */ }
  };
  // Include rendering in the measurement. The clock starts at document
  // navigation, not the toolbar click before Chrome creates the document.
  requestAnimationFrame(() => requestAnimationFrame(record));
}
