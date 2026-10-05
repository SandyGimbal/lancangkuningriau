/**
 * ==============================================================================
 * GAS BRIDGE - Menghubungkan halaman statis (Vercel) ke Google Apps Script
 * ==============================================================================
 * File ini meniru API `google.script.run` sehingga kode lama di index.html &
 * admin.html tetap berjalan, tetapi setiap pemanggilan dikirim lewat fetch()
 * ke Web App Apps Script (doPost di Kode.gs) -> data tersimpan di Google Sheets.
 *
 * Jika halaman dibuka langsung dari Apps Script (HtmlService), bridge ini
 * otomatis tidak aktif karena google.script.run asli sudah tersedia.
 */
(function () {
  // ===========================================================================
  // TEMPEL URL WEB APP APPS SCRIPT DI SINI (berakhiran /exec)
  // Contoh: "https://script.google.com/macros/s/AKfycbx..../exec"
  // ===========================================================================
  var API_URL = "";

  var TOKEN_KEY = "admin_api_token";
  var SESSION_KEY = "admin_session_auth";

  // Berjalan di dalam Apps Script -> pakai google.script.run asli
  if (typeof google !== "undefined" && google.script && google.script.run) return;

  if (!API_URL) {
    console.warn("[gas-bridge] API_URL belum diisi. Halaman berjalan dalam mode offline/demo.");
    return;
  }

  function callServer(fnName, args, onSuccess, onFailure) {
    fetch(API_URL, {
      method: "POST",
      // text/plain agar tidak memicu CORS preflight yang tidak didukung Apps Script
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: fnName,
        args: args,
        token: sessionStorage.getItem(TOKEN_KEY) || ""
      }),
      redirect: "follow"
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (res) {
        if (fnName === "loginAdmin" && res && res.success && res.token) {
          sessionStorage.setItem(TOKEN_KEY, res.token);
        }
        if (res && res.authError) {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(SESSION_KEY);
          alert(res.message || "Sesi login berakhir. Silakan login kembali.");
          location.reload();
          return;
        }
        if (onSuccess) onSuccess(res);
      })
      .catch(function (err) {
        console.error("[gas-bridge] " + fnName + " gagal:", err);
        if (onFailure) onFailure(err);
      });
  }

  function makeRunner(onSuccess, onFailure) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === "withSuccessHandler") return function (h) { return makeRunner(h, onFailure); };
        if (prop === "withFailureHandler") return function (h) { return makeRunner(onSuccess, h); };
        if (prop === "withUserObject") return function () { return makeRunner(onSuccess, onFailure); };
        return function () {
          callServer(String(prop), Array.prototype.slice.call(arguments), onSuccess, onFailure);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: makeRunner(null, null) };
  window.GAS_BRIDGE = { url: API_URL, clearToken: function () { sessionStorage.removeItem(TOKEN_KEY); } };
})();
