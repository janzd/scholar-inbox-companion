// Intentionally synchronous and loaded before styles/body: a saved override
// must take effect before the popup's first paint, without an async storage read.
(() => {
  const key = "appearance";
  const valid = value => ["light", "dark", "system"].includes(value) ? value : "system";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try { preference = valid(localStorage.getItem(key)); } catch { /* Use system if storage is unavailable. */ }

  function apply() {
    document.documentElement.dataset.theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.appearance = preference;
    const control = document.getElementById("theme");
    control?.querySelectorAll('input[name="theme"]').forEach(input => { input.checked = input.value === preference; });
  }
  apply();
  system.addEventListener("change", apply);
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) {
      preference = valid(event.newValue);
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.getElementById("theme")?.addEventListener("change", event => {
      preference = valid(event.target.value);
      apply();
      const feedback = document.getElementById("theme-feedback");
      try {
        localStorage.setItem(key, preference);
        if (feedback) feedback.hidden = true;
      } catch {
        if (feedback) {
          feedback.textContent = "Theme changed for this popup, but the preference could not be saved.";
          feedback.hidden = false;
        }
      }
    });
  }, {once: true});
})();
