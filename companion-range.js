/* Device-only viewing range and fresh, consented paired-position filtering. */
(function () {
  var km = 20,
    mapKm = 1,
    mine = null,
    peer = null,
    options = [1, 20, 50, 100, 250];
  function fresh(p) {
    return (
      p &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Number.isFinite(p.at) &&
      Date.now() - p.at < 90000
    );
  }
  window.CompRange = {
    km: function () {
      return km;
    },
    mapKm: function () {
      return mapKm;
    },
    spots: function (a, b) {
      mine = a;
      peer = b;
    },
    accept: function () {
      if (!fresh(mine) || !fresh(peer)) return true;
      var r = Math.PI / 180,
        s =
          Math.sin(((peer.lat - mine.lat) * r) / 2) ** 2 +
          Math.cos(mine.lat * r) *
            Math.cos(peer.lat * r) *
            Math.sin(((peer.lon - mine.lon) * r) / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s))) <= km;
    },
  };
  window.addEventListener("DOMContentLoaded", function () {
    var strip = document.createElement("div");
    strip.className = "comp-range-strip";
    strip.innerHTML =
      '<button type="button" id="range" aria-label="Map view 1 kilometer" title="Map view; communications remain at least 20 km"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12 19 5"/></svg><span>VIEW</span><output id="range-value">1 <small>km</small></output></button><button type="button" id="map-toggle" aria-label="Open map">MAP</button><span id="range-fix">PAIRED · DISTANCE UNKNOWN</span>';
    var ui = document.getElementById("ui");
    ui.insertBefore(strip, ui.children[1]);
    document.getElementById("range").onclick = function () {
      mapKm = options[(options.indexOf(mapKm) + 1) % options.length];
      document.getElementById("range-value").innerHTML = mapKm + " <small>km</small>";
      this.setAttribute("aria-label", "Map view " + mapKm + " kilometers");
      window.dispatchEvent(new Event("comp-range-change"));
    };
    document.getElementById("map-toggle").onclick = function () {
      var open = document.body.classList.toggle("comp-map-open");
      this.textContent = open ? "TALK" : "MAP";
      this.setAttribute("aria-label", open ? "Return to conversation" : "Open map");
      window.dispatchEvent(new Event("resize"));
    };
    setInterval(function () {
      document.getElementById("range-fix").textContent =
        fresh(mine) && fresh(peer)
          ? window.CompRange.accept()
            ? "PAIRED · IN RANGE"
            : "PAIRED · OUT OF RANGE"
          : "PAIRED · DISTANCE UNKNOWN";
    }, 2000);
  });
})();
