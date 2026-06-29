/* ============================================================
   Launchpad — Monitor logic
   Fetches /api/health, renders health cards with real metrics.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Theme ---------- */
  var THEME_KEY = "launchpad-theme";
  var root = document.documentElement;

  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  /* ---------- Helpers ---------- */
  function timeAgo(iso) {
    if (!iso) return "—";
    var ms = Date.now() - new Date(iso).getTime();
    var m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    return d + "d ago";
  }

  /* ---------- Sparkline (7-day bar chart) ---------- */
  function buildSparkline(dailyCounts) {
    if (!dailyCounts || !dailyCounts.length) return null;
    var max = Math.max.apply(null, dailyCounts);
    if (max === 0) max = 1;

    var wrap = document.createElement("div");
    wrap.className = "sparkline";

    dailyCounts.forEach(function (val) {
      var bar = document.createElement("div");
      bar.className = "sparkline__bar";
      var pct = Math.max(2, (val / max) * 100);
      bar.style.height = pct + "%";
      bar.title = val + " events";
      wrap.appendChild(bar);
    });

    return wrap;
  }

  /* ---------- Render ---------- */
  function buildCard(p) {
    var tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("data-name", p.name.toLowerCase());

    // Status panel
    var panel = document.createElement("div");
    panel.className = "tile__media health-panel health-panel--" + p.status;

    if (p.status === "dormant") {
      // SDK installed but never sent data
      var dormantIcon = document.createElement("div");
      dormantIcon.className = "health-panel__count";
      dormantIcon.textContent = "—";
      panel.appendChild(dormantIcon);
      var dormantLabel = document.createElement("div");
      dormantLabel.className = "health-panel__label";
      dormantLabel.textContent = "SDK inactive";
      panel.appendChild(dormantLabel);
    } else if (p.status === "green") {
      var check = document.createElement("div");
      check.className = "health-panel__count";
      check.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"' +
        ' stroke-linecap="round" stroke-linejoin="round" width="44" height="44">' +
        '<polyline points="20 6 9 17 4 12"></polyline></svg>';
      panel.appendChild(check);
      var okLabel = document.createElement("div");
      okLabel.className = "health-panel__label";
      okLabel.textContent = "Healthy";
      panel.appendChild(okLabel);
    } else if (p.status === "unknown") {
      var qm = document.createElement("div");
      qm.className = "health-panel__count";
      qm.textContent = "?";
      panel.appendChild(qm);
      var errLabel = document.createElement("div");
      errLabel.className = "health-panel__label";
      errLabel.textContent = p.error || "Unable to fetch";
      panel.appendChild(errLabel);
    } else {
      var num = document.createElement("div");
      num.className = "health-panel__count";
      num.textContent = p.unresolvedCount;
      panel.appendChild(num);
      var errLabel2 = document.createElement("div");
      errLabel2.className = "health-panel__label";
      errLabel2.textContent = "unresolved error" + (p.unresolvedCount !== 1 ? "s" : "");
      panel.appendChild(errLabel2);
    }

    tile.appendChild(panel);

    // Name
    var name = document.createElement("div");
    name.className = "tile__name";
    name.textContent = p.name;
    name.title = p.name;
    tile.appendChild(name);

    // Metrics block
    var metrics = document.createElement("div");
    metrics.className = "tile__metrics";

    // Row: Events today / 7d total
    var evRow = document.createElement("div");
    evRow.className = "metric-row";
    if (p.totalEvents7d != null) {
      evRow.innerHTML =
        '<span class="metric-label">Events (7d)</span>' +
        '<span class="metric-value">' + p.totalEvents7d.toLocaleString() + '</span>';
    } else {
      evRow.innerHTML =
        '<span class="metric-label">Events</span>' +
        '<span class="metric-value">—</span>';
    }
    metrics.appendChild(evRow);

    // Row: Events today
    var todayRow = document.createElement("div");
    todayRow.className = "metric-row";
    todayRow.innerHTML =
      '<span class="metric-label">Today</span>' +
      '<span class="metric-value">' + (p.eventsToday != null ? p.eventsToday.toLocaleString() : "—") + '</span>';
    metrics.appendChild(todayRow);

    // Row: Unresolved errors
    var errRow = document.createElement("div");
    errRow.className = "metric-row";
    errRow.innerHTML =
      '<span class="metric-label">Unresolved</span>' +
      '<span class="metric-value ' + (p.unresolvedCount > 0 ? "metric-value--warn" : "") + '">' +
      (p.unresolvedCount != null ? p.unresolvedCount : "—") + '</span>';
    metrics.appendChild(errRow);

    // Row: Last error
    var lastRow = document.createElement("div");
    lastRow.className = "metric-row";
    lastRow.innerHTML =
      '<span class="metric-label">Last error</span>' +
      '<span class="metric-value">' + timeAgo(p.lastSeen) + '</span>';
    metrics.appendChild(lastRow);

    tile.appendChild(metrics);

    // Sparkline (7-day event chart)
    var sparkline = buildSparkline(p.dailyCounts);
    if (sparkline) {
      var sparkWrap = document.createElement("div");
      sparkWrap.className = "tile__sparkline-wrap";
      var sparkLabel = document.createElement("div");
      sparkLabel.className = "sparkline-label";
      sparkLabel.textContent = "7-day activity";
      sparkWrap.appendChild(sparkLabel);
      sparkWrap.appendChild(sparkline);
      tile.appendChild(sparkWrap);
    }

    // Link chips
    var row = document.createElement("div");
    row.className = "tile__links";

    var sentryUrl = "https://bits-and-pixels-ou.sentry.io/projects/" + p.slug + "/";
    [{ label: "Sentry", url: sentryUrl }, { label: "App", url: p.appUrl }].forEach(function (l) {
      var a = document.createElement("a");
      a.className = "tile__link";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      var span = document.createElement("span");
      span.className = "tile__link-label";
      span.textContent = l.label;
      a.appendChild(span);

      var arrow = document.createElement("span");
      arrow.className = "tile__link-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      a.appendChild(arrow);

      row.appendChild(a);
    });

    tile.appendChild(row);
    return tile;
  }

  function render(data) {
    var grid = document.getElementById("grid");
    var loading = document.getElementById("loading");
    var statusLine = document.getElementById("status-line");

    loading.classList.remove("is-visible");

    var frag = document.createDocumentFragment();
    data.projects.forEach(function (p) { frag.appendChild(buildCard(p)); });
    grid.appendChild(frag);

    statusLine.textContent = "Updated " + timeAgo(data.updatedAt) + " · Data cached 5 min";
    statusLine.classList.add("is-visible");
  }

  /* ---------- Fetch ---------- */
  function loadHealth() {
    var grid = document.getElementById("grid");
    var loading = document.getElementById("loading");
    loading.textContent = "Loading health data…";
    loading.classList.add("is-visible");
    grid.innerHTML = "";

    // ponytail: cache-bust query param so Vercel edge cache doesn't serve stale data
    fetch("/api/health?_t=" + Date.now(), { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (err) {
        console.error("Monitor: failed to load health data.", err);
        loading.textContent = "Failed to load health data. " + err.message;
      });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", toggleTheme);

    var refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", loadHealth);

    loadHealth();
  });
})();
