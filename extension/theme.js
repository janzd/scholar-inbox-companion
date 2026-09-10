// Intentionally synchronous and loaded before styles/body: a saved override
// must take effect before the popup's first paint, without an async storage read.
(() => {
  const key = "appearance";
  const valid = value => ["light", "dark", "system"].includes(value) ? value : "system";
  const paletteKey = "palette";
  const validPalette = value => ["blue", "scholar"].includes(value) ? value : "blue";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  let palette = "blue";
  try { preference = valid(localStorage.getItem(key)); } catch { /* Use system if storage is unavailable. */ }
  try { palette = validPalette(localStorage.getItem(paletteKey)); } catch { /* Preserve the original Blue palette. */ }

  function apply() {
    document.documentElement.dataset.theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.appearance = preference;
    document.documentElement.dataset.palette = palette;
    const control = document.getElementById("theme");
    control?.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === preference; });
    document.getElementById("palette")?.querySelectorAll('input[name="palette"]').forEach(input => { input.checked = input.value === palette; });
  }
  apply();
  system.addEventListener("change", apply);
  window.addEventListener("storage", event => {
    if (![key, paletteKey, null].includes(event.key)) return;
    if (event.key === key || event.key === null) preference = valid(event.newValue);
    if (event.key === paletteKey || event.key === null) palette = validPalette(event.newValue);
    apply();
  });
  function save(storageKey, value) {
    apply();
    const feedback = document.getElementById("theme-feedback");
    try {
      localStorage.setItem(storageKey, value);
      if (feedback) {
        feedback.textContent = "Saved.";
        feedback.hidden = feedback.dataset?.confirm !== "true";
      }
    } catch {
      if (feedback) {
        feedback.textContent = "Appearance changed for this page, but the preference could not be saved.";
        feedback.hidden = false;
      }
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme")?.addEventListener("change", event => {
      preference = valid(event.target.value);
      save(key, preference);
    });
    document.getElementById("palette")?.addEventListener("change", event => {
      palette = validPalette(event.target.value);
      save(paletteKey, palette);
    });
  }, {once: true});
})();
