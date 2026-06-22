/* ============================================================
   Launchpad — App logic
   Responsibilities: theme, data load + tile render, live search,
   keyboard shortcuts. No dependencies, no build step.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Theme ---------- */
  var THEME_KEY = "launchpad-theme";
  var root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
    } else {
      var prefersDark = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  }

  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  /* ---------- Helpers ---------- */
  // First grapheme-safe character, uppercased.
  function initialOf(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  // Deterministic fallback color from the rotating palette (1..6).
  function fallbackVar(index) {
    return "var(--ph-" + ((index % 6) + 1) + ")";
  }

  /* ---------- Render ---------- */
  var EAGER_COUNT = 6; // first row(s) load eagerly, rest lazy

  function buildTile(project, index) {
    var tile = document.createElement("div");
    tile.className = "tile";
    tile.setAttribute("data-name", (project.name || "").toLowerCase());

    var links = Array.isArray(project.links) ? project.links : [];
    var primary = links[0];

    // --- Media: links to the primary URL when one exists ---
    var media;
    if (primary) {
      media = document.createElement("a");
      media.href = primary.url;
      media.target = "_blank";
      media.rel = "noopener noreferrer";
      media.setAttribute("aria-label", project.name);
    } else {
      media = document.createElement("div");
    }
    media.className = "tile__media";

    var hasImage = project.image && project.image.length > 0;
    if (hasImage) {
      var img = document.createElement("img");
      img.className = "tile__img";
      img.alt = "";
      img.loading = index < EAGER_COUNT ? "eager" : "lazy";
      img.decoding = "async";
      img.src = project.image;
      // On load failure, swap in the letter fallback.
      img.addEventListener("error", function () {
        media.style.background = fallbackVar(index);
        if (img.parentNode) img.parentNode.removeChild(img);
        media.appendChild(makeFallback(project.name));
      });
      media.appendChild(img);
    } else {
      media.style.background = fallbackVar(index);
      media.appendChild(makeFallback(project.name));
    }

    var name = document.createElement("div");
    name.className = "tile__name";
    name.textContent = project.name;
    name.title = project.name;

    tile.appendChild(media);
    tile.appendChild(name);

    // --- Visible link row (one chip per destination) ---
    if (links.length) {
      var row = document.createElement("div");
      row.className = "tile__links";
      links.forEach(function (l) {
        var link = document.createElement("a");
        link.className = "tile__link";
        link.href = l.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        var label = document.createElement("span");
        label.className = "tile__link-label";
        label.textContent = l.label || "Open";
        link.appendChild(label);

        var arrow = document.createElement("span");
        arrow.className = "tile__link-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2197"; // ↗
        link.appendChild(arrow);

        row.appendChild(link);
      });
      tile.appendChild(row);
    }

    return tile;
  }

  function makeFallback(name) {
    var f = document.createElement("div");
    f.className = "tile__fallback";
    f.textContent = initialOf(name);
    return f;
  }

  /* ---------- Search ---------- */
  function initSearch(tiles, emptyEl, searchWrap, input, clearBtn) {
    function run(query) {
      var q = query.trim().toLowerCase();
      var visible = 0;
      for (var i = 0; i < tiles.length; i++) {
        var match = q === "" || tiles[i].getAttribute("data-name").indexOf(q) !== -1;
        tiles[i].hidden = !match;
        if (match) visible++;
      }
      emptyEl.classList.toggle("is-visible", visible === 0);
      searchWrap.classList.toggle("has-value", q !== "");
    }

    input.addEventListener("input", function () { run(input.value); });

    clearBtn.addEventListener("click", function () {
      input.value = "";
      run("");
      input.focus();
    });

    return { run: run };
  }

  /* ---------- Keyboard shortcuts ---------- */
  function initShortcuts(input, grid, search) {
    document.addEventListener("keydown", function (e) {
      var typingTarget = e.target === input;

      // "/" focuses search (when not already typing in a field)
      if (e.key === "/" && !typingTarget &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }

      // Escape clears search and returns focus to the first visible tile
      if (e.key === "Escape") {
        if (input.value !== "" || typingTarget) {
          input.value = "";
          search.run("");
          var first = grid.querySelector(".tile:not([hidden]) a");
          if (first) first.focus();
        }
      }
    });
  }

  /* ---------- Boot ---------- */
  function start(projects) {
    var grid = document.getElementById("grid");
    var emptyEl = document.getElementById("empty");
    var searchWrap = document.getElementById("search");
    var input = document.getElementById("search-input");
    var clearBtn = document.getElementById("search-clear");

    var frag = document.createDocumentFragment();
    var tiles = [];
    projects.forEach(function (p, i) {
      var t = buildTile(p, i);
      tiles.push(t);
      frag.appendChild(t);
    });
    grid.appendChild(frag);

    var search = initSearch(tiles, emptyEl, searchWrap, input, clearBtn);
    initShortcuts(input, grid, search);
  }

  function loadData() {
    // Primary path: fetch the JSON data source.
    fetch("data/projects.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(start)
      .catch(function (err) {
        // Fallback for file:// opens where fetch is blocked: use
        // window.LAUNCHPAD_PROJECTS if a data/projects.js shim is present.
        if (Array.isArray(window.LAUNCHPAD_PROJECTS)) {
          start(window.LAUNCHPAD_PROJECTS);
        } else {
          console.error("Launchpad: could not load project data.", err);
          var emptyEl = document.getElementById("empty");
          if (emptyEl) {
            emptyEl.textContent =
              "Could not load projects. Serve this folder over http (e.g. `npx serve`).";
            emptyEl.classList.add("is-visible");
          }
        }
      });
  }

  /* ---------- Wire up ---------- */
  initTheme();
  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    if (toggle) toggle.addEventListener("click", toggleTheme);
    loadData();
  });
})();
