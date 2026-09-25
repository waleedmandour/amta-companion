// M0 acceptance test (code-review finding F-1): proves the Tauri IPC
// round-trip end to end by invoking the `ping` command exposed in main.rs.
// Module scripts are deferred, so #ipc-status exists when this executes.
const el = document.getElementById("ipc-status");

if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
  window.__TAURI__.core
    .invoke("ping")
    .then((msg) => {
      el.textContent = "✅ " + msg;
    })
    .catch((err) => {
      el.textContent = "❌ IPC failed: " + err;
    });
} else {
  el.textContent = "❌ IPC bridge unavailable — app.withGlobalTauri missing from tauri.conf.json?";
}
