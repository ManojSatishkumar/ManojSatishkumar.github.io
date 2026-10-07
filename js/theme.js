// Loaded synchronously in <head> on every page that shows the top bar, so a
// saved or OS-preferred dark theme is applied before first paint and never
// flashes light. Dark styles live in /css/dark-mode.css and each page's own
// html[data-theme="dark"] rules.
(function () {
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function readStoredTheme() {
    try {
      var stored = localStorage.getItem("theme");
      return stored === "dark" || stored === "light" ? stored : null;
    } catch (e) {
      return null;
    }
  }

  // Matches --dm-bg in /css/dark-mode.css
  var DARK_THEME_COLOR = "#0b1120";

  // An installed PWA's title bar (and mobile browser toolbars) take their
  // color from this tag and repaint live when it changes; the manifest's
  // theme_color is only the fallback when the tag is absent.
  function syncThemeColorMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    if (!meta.hasAttribute("data-light-color")) {
      meta.setAttribute(
        "data-light-color",
        meta.getAttribute("content") || "#ffffff",
      );
    }
    meta.setAttribute(
      "content",
      theme === "dark" ? DARK_THEME_COLOR : meta.getAttribute("data-light-color"),
    );
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    syncThemeColorMeta(theme);
    window.syncThemeToggles();
  }

  // The nav bar is injected after load, so it calls this once it lands
  window.syncThemeToggles = function () {
    var isDark = root.getAttribute("data-theme") === "dark";
    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(isDark));
    });
  };

  window.toggleTheme = function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    applyTheme(next);
  };

  applyTheme(readStoredTheme() || (media.matches ? "dark" : "light"));

  // Follow the OS setting live until the visitor picks a theme themselves
  if (media.addEventListener) {
    media.addEventListener("change", function (e) {
      if (!readStoredTheme()) applyTheme(e.matches ? "dark" : "light");
    });
  }

  // Keeps other open tabs in step when the toggle is used in one of them
  window.addEventListener("storage", function (e) {
    if (e.key !== "theme") return;
    applyTheme(readStoredTheme() || (media.matches ? "dark" : "light"));
  });
})();
