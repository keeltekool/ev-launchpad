/* Launchpad — Monitor */
(function () {
  "use strict";

  var THEME_KEY = "launchpad-theme";
  var root = document.documentElement;

  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    var ms = Date.now() - new Date(iso).getTime();
    var m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function buildSparkline(dailyCounts) {
    if (!dailyCounts || !dailyCounts.length) return null;
    var max = Math.max.apply(null, dailyCounts);
    if (max === 0) max = 1;
    var wrap = document.createElement("div");
    wrap.className = "sparkline";
    dailyCounts.forEach(function (val) {
      var bar = document.createElement("div");
      bar.className = "sparkline__bar";
      bar.style.height = Math.max(2, (val / max) * 100) + "%";
      bar.title = val + " requests";
      wrap.appendChild(bar);
    });
    return wrap;
  }

  function buildCard(p) {
    var tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("data-name", p.name.toLowerCase());

    // Status panel — activity-first
    var panel = document.createElement("div");
    panel.className = "tile__media health-panel health-panel--" + p.status;

    if (p.status === "dormant") {
      panel.innerHTML =
        '<div class="health-panel__count">—</div>' +
        '<div class="health-panel__label">No activity yet</div>';
    } else if (p.status === "green") {
      panel.innerHTML =
        '<div class="health-panel__count">' + (p.requests7d || 0).toLocaleString() + '</div>' +
        '<div class="health-panel__label">Requests this week</div>';
    } else if (p.status === "unknown") {
      panel.innerHTML =
        '<div class="health-panel__count">?</div>' +
        '<div class="health-panel__label">' + (p.error || "Unable to fetch") + '</div>';
    } else {
      // yellow or red — show error count prominently
      panel.innerHTML =
        '<div class="health-panel__count">' + p.unresolvedCount + '</div>' +
        '<div class="health-panel__label">Unresolved error' + (p.unresolvedCount !== 1 ? "s" : "") + '</div>';
    }

    tile.appendChild(panel);

    // Name
    var name = document.createElement("div");
    name.className = "tile__name";
    name.textContent = p.name;
    name.title = p.name;
    tile.appendChild(name);

    // Metrics
    var metrics = document.createElement("div");
    metrics.className = "tile__metrics";

    var rows = [
      { label: "Requests (7d)", value: p.requests7d != null ? p.requests7d.toLocaleString() : "—" },
      { label: "Today", value: p.requestsToday != null ? p.requestsToday.toLocaleString() : "—" },
      { label: "Errors", value: p.unresolvedCount != null ? p.unresolvedCount : "—", warn: p.unresolvedCount > 0 },
      { label: "Last error", value: timeAgo(p.lastSeen) }
    ];

    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "metric-row";
      row.innerHTML =
        '<span class="metric-label">' + r.label + '</span>' +
        '<span class="metric-value' + (r.warn ? " metric-value--warn" : "") + '">' + r.value + '</span>';
      metrics.appendChild(row);
    });

    tile.appendChild(metrics);

    // Sparkline
    var sparkline = buildSparkline(p.dailyCounts);
    if (sparkline) {
      var sparkWrap = document.createElement("div");
      sparkWrap.className = "tile__sparkline-wrap";
      sparkWrap.innerHTML = '<div class="sparkline-label">7-day requests</div>';
      sparkWrap.appendChild(sparkline);
      tile.appendChild(sparkWrap);
    }

    // Links
    var row = document.createElement("div");
    row.className = "tile__links";
    [
      { label: "Sentry", url: "https://bits-and-pixels-ou.sentry.io/projects/" + p.slug + "/" },
      { label: "App", url: p.appUrl }
    ].forEach(function (l) {
      var a = document.createElement("a");
      a.className = "tile__link";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.innerHTML =
        '<span class="tile__link-label">' + l.label + '</span>' +
        '<span class="tile__link-arrow" aria-hidden="true">↗</span>';
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

    statusLine.textContent = "Updated " + timeAgo(data.updatedAt) + " · Cached 5 min";
    statusLine.classList.add("is-visible");
  }

  function loadHealth() {
    var grid = document.getElementById("grid");
    var loading = document.getElementById("loading");
    loading.textContent = "Loading health data…";
    loading.classList.add("is-visible");
    grid.innerHTML = "";

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

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", toggleTheme);
    var refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", loadHealth);
    loadHealth();
    // Auto-refresh every 5 min
    setInterval(loadHealth, 5 * 60 * 1000);
  });
})();
