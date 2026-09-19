/* Vinnytsia after 6.
   All copy lives in data.json; this file only decides how it is arranged.
   Text is written with textContent throughout, never innerHTML. */

(function () {
  "use strict";

  var WORK_DAYS = { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 };
  var TIGHT_WINDOW = 20; // minutes after the earliest arrival that still counts as a rush

  var D = null;          // the parsed data file
  var UI = null;         // shorthand for D.ui.labels
  var byId = {};         // venue id -> venue
  var eventById = {};
  var selectedDay = null;
  var map = null;
  var markers = {};      // venue id -> Leaflet marker

  // ---------- small helpers ----------

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgGlyph(symbolId, className) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (className) s.setAttribute("class", className);
    s.setAttribute("viewBox", "0 0 32 32");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    var u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    u.setAttribute("href", "#" + symbolId);
    s.appendChild(u);
    return s;
  }

  function defRow(dl, term, value) {
    var row = document.createElement("div");
    row.appendChild(el("dt", null, term));
    row.appendChild(el("dd", null, value));
    dl.appendChild(row);
    return row;
  }

  function minutes(hhmm) {
    if (!hhmm) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function category(id) {
    for (var i = 0; i < D.categories.length; i++) {
      if (D.categories[i].id === id) return D.categories[i];
    }
    return null;
  }

  function district(id) {
    for (var i = 0; i < D.districts.length; i++) {
      if (D.districts[i].id === id) return D.districts[i];
    }
    return null;
  }

  function priceTier(id) {
    for (var i = 0; i < D.priceTiers.length; i++) {
      if (D.priceTiers[i].id === id) return D.priceTiers[i];
    }
    return null;
  }

  var GLYPHS = {
    art: "g-frame", bar: "g-glass", coffee: "g-cup",
    view: "g-view", workshop: "g-workshop", social: "g-social"
  };

  // ---------- opening hours ----------

  function hoursText(venue, dayKey) {
    if (!venue.hours) return UI.hoursUnknown;
    var spans = venue.hours[dayKey];
    if (!spans || !spans.length) return UI.closedToday;
    return spans.map(function (s) {
      if (s.open && s.close) return s.open + "–" + s.close;
      if (s.close) return "→ " + s.close;      // closing time known, opening not
      if (s.open) return s.open + " →";
      return UI.hoursUnknown;
    }).join(", ");
  }

  function isOpenOn(venue, dayKey) {
    if (!venue.hours) return null;                   // unknown, not the same as closed
    var spans = venue.hours[dayKey];
    return !!(spans && spans.length);
  }

  // ---------- reachability from work ----------

  // Weekday events that start before she could physically arrive are marked, rather
  // than quietly listed. Arrival times come from meta.commute in the data file.
  function reachability(ev, dayKey) {
    if (!WORK_DAYS[dayKey] || !ev.time) return null;
    var districtId = "centre";
    if (ev.venueIds.length && byId[ev.venueIds[0]]) districtId = byId[ev.venueIds[0]].district;
    var arrive = minutes(districtId === "west"
      ? D.meta.commute.westArrival
      : D.meta.commute.centreArrival);
    var start = minutes(ev.time);
    if (start == null || arrive == null) return null;
    if (start < arrive) return "early";
    if (start < arrive + TIGHT_WINDOW) return "tight";
    return null;
  }

  function overBudget(ev) {
    return typeof ev.priceFrom === "number" && ev.priceFrom > D.meta.budgetUah;
  }

  // ---------- masthead, notes, footer ----------

  function renderStatics() {
    document.title = D.meta.title;
    document.getElementById("masthead-kicker").textContent = D.meta.subtitle;
    document.getElementById("masthead-title").textContent = D.meta.title;
    document.getElementById("masthead-intro").textContent = D.meta.intro;

    document.getElementById("notes-h").textContent = D.ui.sections.notes;
    document.getElementById("week-h").textContent = D.ui.sections.week;
    document.getElementById("map-h").textContent = D.ui.sections.map;
    document.getElementById("dir-h").textContent = D.ui.sections.directory;
    document.getElementById("map-hint").textContent = UI.mapHint;
    document.getElementById("filter-cat-legend").textContent = UI.filterCategory;
    document.getElementById("filter-dist-legend").textContent = UI.filterDistrict;
    document.getElementById("clear-filters").textContent = UI.clearFilters;
    document.getElementById("venue-empty").textContent = UI.noResults;
    document.getElementById("unmapped-h").textContent = UI.unmappedHeading;
    document.getElementById("footer-data-note").textContent = D.meta.dataNote;
    document.getElementById("footer-heritage-note").textContent = D.meta.heritageDaysNote;

    var list = document.getElementById("notes-list");
    D.practicalNotes.forEach(function (n) {
      var li = el("li", "note");
      li.appendChild(el("h3", "note__h", n.title));
      li.appendChild(el("p", "note__b", n.body));
      list.appendChild(li);
    });

    var unmapped = document.getElementById("unmapped-list");
    D.venues.filter(function (v) { return v.needsVerification; }).forEach(function (v) {
      var reason = v.addressUk ? UI.unmappedNoNumber : UI.unmappedNoAddress;
      unmapped.appendChild(el("li", null, v.name + " — " + reason));
    });
  }

  // ---------- day switcher ----------

  function renderDays() {
    var tabs = document.getElementById("day-tabs");
    var panels = document.getElementById("day-panels");

    D.days.forEach(function (day) {
      var excluded = day.status === "excluded";
      var b = el("button", "day");
      b.type = "button";
      b.id = "tab-" + day.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "panel-" + day.id);
      b.dataset.day = day.id;
      b.appendChild(el("span", "day__label", day.label));
      b.appendChild(el("span", "day__date", excluded ? day.excludedLabel : day.dateLabel));

      if (excluded) {
        b.setAttribute("aria-disabled", "true");
        b.setAttribute("aria-selected", "false");
        b.tabIndex = -1;
        b.setAttribute("aria-label", day.label + " " + day.dateLabel + ", " + day.excludedLabel);
      } else {
        b.setAttribute("aria-selected", "false");
        b.tabIndex = -1;
        b.addEventListener("click", function () { selectDay(day.id, true); });
      }
      tabs.appendChild(b);

      var panel = el("div", "daypanel");
      panel.id = "panel-" + day.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "tab-" + day.id);
      panel.tabIndex = 0;
      panel.hidden = true;
      if (!excluded) renderDayPanel(panel, day);
      panels.appendChild(panel);
    });

    tabs.addEventListener("keydown", onTabKeys);
  }

  function selectableDays() {
    return D.days.filter(function (d) { return d.status !== "excluded"; });
  }

  function onTabKeys(e) {
    var keys = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    var days = selectableDays();
    var idx = days.findIndex(function (d) { return d.id === selectedDay; });
    var next;
    if (e.key === "Home") next = days[0];
    else if (e.key === "End") next = days[days.length - 1];
    else next = days[(idx + keys[e.key] + days.length) % days.length];
    selectDay(next.id, true);
    document.getElementById("tab-" + next.id).focus();
  }

  function selectDay(id, pushHash) {
    selectedDay = id;
    D.days.forEach(function (day) {
      var tab = document.getElementById("tab-" + day.id);
      var panel = document.getElementById("panel-" + day.id);
      var on = day.id === id && day.status !== "excluded";
      if (day.status !== "excluded") {
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
      }
      panel.hidden = !on;
    });
    if (pushHash && window.history.replaceState) {
      window.history.replaceState(null, "", "#day-" + id);
    }
    highlightDay(id);
    renderVenues(); // hours column follows the selected day
  }

  // ---------- one day ----------

  function renderDayPanel(panel, day) {
    if (day.note) panel.appendChild(el("p", "daynote", day.note));

    var plans = el("div", "plans");
    day.plans.forEach(function (plan) {
      plans.appendChild(renderPlan(plan, day));
    });
    panel.appendChild(plans);

    var dayEvents = D.events.filter(function (ev) { return ev.date === day.date; });
    if (dayEvents.length) {
      var wrap = el("section", "events");
      wrap.appendChild(el("h3", "events__h", UI.eventsToday));
      dayEvents.forEach(function (ev) { wrap.appendChild(renderEvent(ev, day)); });
      panel.appendChild(wrap);
    }
  }

  function renderPlan(plan, day) {
    var card = el("article", "plan" + (plan.kind === "b" ? " plan--b" : ""));
    card.appendChild(el("p", "plan__tag", plan.kind === "b" ? UI.planB : UI.mainPlan));
    card.appendChild(el("h3", "plan__title", plan.title));
    if (plan.mode === "either") card.appendChild(el("p", "band__hint", UI.either));

    plan.steps.forEach(function (step, i) {
      if (i > 0) {
        var join = el("div", "step__join");
        var arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        arrow.setAttribute("viewBox", "0 0 40 28");
        arrow.setAttribute("aria-hidden", "true");
        arrow.setAttribute("focusable", "false");
        var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#g-arrow");
        arrow.appendChild(use);
        join.appendChild(arrow);
        join.appendChild(el("span", null, plan.mode === "either" ? UI.orJoin : UI.then));
        card.appendChild(join);
      }
      card.appendChild(renderStep(step, day));
    });

    return card;
  }

  function renderStep(step, day) {
    var wrap = el("div", "step");
    var venues = step.venueIds.map(function (id) { return byId[id]; }).filter(Boolean);
    var ev = step.eventId ? eventById[step.eventId] : null;

    var head = el("div", "step__head");
    var title = venues.length
      ? venues.map(function (v) { return v.name; }).join(" + ")
      : (ev ? ev.title : "");
    head.appendChild(el("span", "step__name", title));
    if (step.time) head.appendChild(el("span", "step__time", step.time));
    wrap.appendChild(head);

    if (venues.length === 1 && venues[0].description) {
      wrap.appendChild(el("p", "step__kind", venues[0].description));
    }
    wrap.appendChild(el("p", "step__what", step.what));

    var dl = el("dl", "step__meta");
    if (step.timeNote) defRow(dl, UI.hoursLabel, step.timeNote);

    venues.forEach(function (v) {
      if (v.addressUk) {
        var row = defRow(dl, UI.showDriver, v.addressUk);
        row.lastChild.className = "addr";
        row.lastChild.lang = "uk";
      } else {
        defRow(dl, UI.showDriver, UI.notOnMap);
      }
    });
    if (!venues.length && ev && ev.locationText) defRow(dl, UI.showDriver, ev.locationText);

    defRow(dl, "Cost", step.cost);
    wrap.appendChild(dl);

    if (ev) {
      var tags = el("div", "venue__tags");
      if (overBudget(ev)) tags.appendChild(el("span", "tag tag--money", UI.overBudget));
      var r = reachability(ev, day.id);
      if (r === "early") tags.appendChild(el("span", "tag tag--warn", UI.tooEarly));
      if (r === "tight") tags.appendChild(el("span", "tag tag--warn", UI.tight));
      if (ev.needsVerification) tags.appendChild(el("span", "tag tag--flag", UI.notOnMap));
      if (tags.childNodes.length) wrap.appendChild(tags);
    }

    return wrap;
  }

  function renderEvent(ev, day) {
    var row = el("div", "event");
    var top = el("div", "event__top");
    if (ev.time) {
      top.appendChild(el("span", "event__time", ev.time + (ev.endTime ? "–" + ev.endTime : "")));
    }
    top.appendChild(el("span", "event__title", ev.title));

    if (ev.priceText) {
      var cls = ev.priceFrom === 0 ? "tag tag--free" : (overBudget(ev) ? "tag tag--money" : "tag");
      top.appendChild(el("span", cls, ev.priceFrom === 0 ? UI.free : ev.priceText));
    }
    var r = reachability(ev, day.id);
    if (r === "early") top.appendChild(el("span", "tag tag--warn", UI.tooEarly));
    if (r === "tight") top.appendChild(el("span", "tag tag--warn", UI.tight));
    row.appendChild(top);

    var where = ev.venueIds.map(function (id) { return byId[id] ? byId[id].name : null; })
      .filter(Boolean).join(" + ") || ev.locationText;
    if (where) row.appendChild(el("p", "event__where", where));
    if (ev.note) row.appendChild(el("p", "event__note", ev.note));
    return row;
  }

  // ---------- map ----------

  function pinSvg(colour) {
    // Hand-cut pin: the outline is intentionally not symmetrical.
    return '<svg class="pin" width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">' +
      '<path d="M15 38.5C13.4 31 2.6 26.2 2.9 15.4 3.1 7.4 8.6 2 15.2 2c6.7 0 12 5.6 11.9 13.5C27 26 16.8 30.6 15 38.5z" ' +
      'fill="' + colour + '" stroke="#17140f" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<circle cx="15.1" cy="14.6" r="4.3" fill="#faf4e9" stroke="#17140f" stroke-width="2.2"/>' +
      "</svg>";
  }

  function renderMap() {
    var mapped = D.venues.filter(function (v) { return v.coords; });
    if (!mapped.length || typeof L === "undefined") return;

    // The view has to be set before any marker is added: until the map is loaded
    // Leaflet has not built the icon elements, so getElement() returns nothing and
    // the aria-labels below would be skipped without a word.
    var bounds = L.latLngBounds(mapped.map(function (v) { return v.coords; })).pad(0.06);
    map = L.map("map", { scrollWheelZoom: false, tap: true }).fitBounds(bounds);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapped.forEach(function (v) {
      var cat = category(v.category);
      var icon = L.divIcon({
        className: "pin-wrap",
        html: pinSvg(cat ? cat.color : "#17140f"),
        iconSize: [30, 40],
        iconAnchor: [15, 38],
        popupAnchor: [0, -34]
      });
      var m = L.marker(v.coords, { icon: icon, title: v.name, riseOnHover: true, keyboard: true })
        .addTo(map)
        .bindPopup(function () { return popupFor(v); });
      var node = m.getElement();
      if (node) {
        node.setAttribute("aria-label", v.name + (v.addressUk ? ", " + v.addressUk : ""));
        node.setAttribute("role", "button");
      }
      markers[v.id] = m;
    });

    renderLegend();
  }

  function popupFor(v) {
    var box = el("div", "pop");
    box.appendChild(el("strong", "pop__name", v.name));
    if (v.nameUk) {
      var uk = el("span", "pop__uk", v.nameUk);
      uk.lang = "uk";
      box.appendChild(uk);
    }
    if (v.addressUk) {
      var a = el("span", "pop__addr", v.addressUk);
      a.lang = "uk";
      box.appendChild(a);
    }
    box.appendChild(el("span", "pop__hours", hoursText(v, selectedDay || "mon")));

    var link = el("a", "pop__link", UI.openInMaps);
    link.href = "geo:" + v.coords[0] + "," + v.coords[1] +
      "?q=" + v.coords[0] + "," + v.coords[1] + "(" + encodeURIComponent(v.name) + ")";
    link.rel = "noopener";
    box.appendChild(link);
    return box;
  }

  function renderLegend() {
    var wrap = document.getElementById("map-legend");
    wrap.appendChild(el("span", "legend__label", UI.mapLegend));
    D.categories.forEach(function (c) {
      var item = el("span", "legend__item");
      var dot = el("span", "legend__dot");
      dot.style.background = c.color;
      item.appendChild(dot);
      item.appendChild(el("span", null, c.label));
      wrap.appendChild(item);
    });
  }

  // Venues tied to a given day: everything the plans point at, plus that day's events.
  function venuesForDay(dayId) {
    var day = D.days.filter(function (d) { return d.id === dayId; })[0];
    var ids = {};
    if (!day) return ids;
    day.plans.forEach(function (p) {
      p.steps.forEach(function (s) {
        s.venueIds.forEach(function (id) { ids[id] = true; });
      });
    });
    D.events.forEach(function (ev) {
      if (ev.date === day.date) ev.venueIds.forEach(function (id) { ids[id] = true; });
    });
    return ids;
  }

  function highlightDay(dayId) {
    if (!map) return;
    var ids = venuesForDay(dayId);
    var any = Object.keys(ids).length > 0;
    var focus = [];

    Object.keys(markers).forEach(function (vid) {
      var node = markers[vid].getElement();
      if (!node) return;
      var pin = node.querySelector(".pin");
      if (!pin) return;
      var on = !any || ids[vid];
      pin.classList.toggle("pin--dim", !on);
      if (any && ids[vid]) focus.push(markers[vid].getLatLng());
    });

    if (focus.length) {
      // maxZoom is deliberately low: zooming tight onto one pin would hide the
      // dimmed pins around it, which is the whole point of the day highlight.
      map.flyToBounds(L.latLngBounds(focus).pad(focus.length === 1 ? 1.4 : 0.35), {
        duration: 0.6,
        maxZoom: 14
      });
    }
  }

  // ---------- filters and directory ----------

  function renderFilters() {
    var cats = document.getElementById("filter-categories");
    D.categories.forEach(function (c) {
      cats.appendChild(chip("cat", c.id, c.label, c.color, GLYPHS[c.id]));
    });
    var dists = document.getElementById("filter-districts");
    D.districts.forEach(function (d) {
      dists.appendChild(chip("dist", d.id, d.label, null, null));
    });

    document.getElementById("filters").addEventListener("change", renderVenues);
    document.getElementById("clear-filters").addEventListener("click", function () {
      var boxes = document.querySelectorAll("#filters input[type=checkbox]");
      Array.prototype.forEach.call(boxes, function (b) { b.checked = false; });
      renderVenues();
    });
  }

  function chip(group, value, label, colour, glyph) {
    var wrap = el("label", "chip");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.name = group;
    input.value = value;
    var face = el("span", "chip__face");
    if (colour) {
      var sw = el("span", "chip__swatch");
      sw.style.background = colour;
      face.appendChild(sw);
    }
    if (glyph) face.appendChild(svgGlyph(glyph, "chip__glyph"));
    face.appendChild(el("span", null, label));
    wrap.appendChild(input);
    wrap.appendChild(face);
    return wrap;
  }

  function checkedValues(group) {
    var out = {};
    var boxes = document.querySelectorAll("#filters input[name=" + group + "]:checked");
    Array.prototype.forEach.call(boxes, function (b) { out[b.value] = true; });
    return out;
  }

  function renderVenues() {
    var list = document.getElementById("venue-list");
    var empty = document.getElementById("venue-empty");
    list.textContent = "";

    var cats = checkedValues("cat");
    var dists = checkedValues("dist");
    var anyCat = Object.keys(cats).length > 0;
    var anyDist = Object.keys(dists).length > 0;

    var shown = D.venues.filter(function (v) {
      var catOk = !anyCat || cats[v.category] || v.tags.some(function (t) { return cats[t]; });
      var distOk = !anyDist || dists[v.district];
      return catOk && distOk;
    });

    shown.forEach(function (v) { list.appendChild(renderVenue(v)); });
    empty.hidden = shown.length > 0;
    document.getElementById("result-count").textContent = shown.length + " " + UI.resultCount;
  }

  function renderVenue(v) {
    var cat = category(v.category);
    var card = el("article", "venue");
    if (cat) card.style.borderTopColor = cat.color;

    var head = el("div", "venue__head");
    var glyph = svgGlyph(GLYPHS[v.category], "venue__glyph");
    if (cat) glyph.style.color = cat.color;
    head.appendChild(glyph);

    var h = el("h3", "venue__name", v.name);
    if (v.nameUk) {
      var uk = el("span", "venue__uk", v.nameUk);
      uk.lang = "uk";
      h.appendChild(uk);
    }
    head.appendChild(h);
    card.appendChild(head);

    card.appendChild(el("p", "venue__desc", v.description));
    card.appendChild(el("p", "venue__why", v.why));

    var dl = el("dl", "venue__meta");
    if (v.addressUk) {
      var row = defRow(dl, UI.showDriver, v.addressUk);
      row.lastChild.className = "addr";
      row.lastChild.lang = "uk";
    }
    var dist = district(v.district);
    if (dist) defRow(dl, UI.districtLabel, dist.label);
    var tier = priceTier(v.priceTier);
    if (tier) defRow(dl, UI.priceLabel, tier.label);
    if (v.entry) defRow(dl, UI.entryLabel, v.entry);
    if (v.accessNote) defRow(dl, UI.accessLabel, v.accessNote);
    card.appendChild(dl);

    card.appendChild(renderHours(v));
    if (v.hoursNote) card.appendChild(el("p", "event__note", v.hoursNote));

    var tags = el("div", "venue__tags");
    if (cat) tags.appendChild(el("span", "tag", cat.label));
    v.tags.forEach(function (t) {
      var c = category(t);
      if (c) tags.appendChild(el("span", "tag", c.label));
    });
    if (!v.coords) tags.appendChild(el("span", "tag tag--flag", UI.notOnMap));
    card.appendChild(tags);

    return card;
  }

  function renderHours(v) {
    var dl = el("dl", "hours");
    D.days.forEach(function (day) {
      var row = defRow(dl, day.label, hoursText(v, day.id));
      if (day.id === selectedDay) row.className = "is-today";
      if (isOpenOn(v, day.id) === false) row.className += " is-shut";
    });
    return dl;
  }

  // ---------- boot ----------

  function initialDay() {
    var m = /^#day-([a-z]+)$/.exec(window.location.hash);
    var days = selectableDays();
    if (m) {
      var hit = days.filter(function (d) { return d.id === m[1]; })[0];
      if (hit) return hit.id;
    }
    // If the site is opened during the week it covers, start on the real day.
    var today = new Date();
    var iso = today.getFullYear() + "-" +
      String(today.getMonth() + 1).padStart(2, "0") + "-" +
      String(today.getDate()).padStart(2, "0");
    var match = days.filter(function (d) { return d.date === iso; })[0];
    return match ? match.id : days[0].id;
  }

  fetch("data.json")
    .then(function (r) {
      if (!r.ok) throw new Error("data.json " + r.status);
      return r.json();
    })
    .then(function (data) {
      D = data;
      UI = D.ui.labels;
      D.venues.forEach(function (v) { byId[v.id] = v; });
      D.events.forEach(function (e) { eventById[e.id] = e; });

      renderStatics();
      renderDays();
      renderFilters();
      renderMap();
      selectDay(initialDay(), false);
    })
    .catch(function (err) {
      var box = el("p", "empty", "The data file could not be loaded. Serve this folder over http rather than opening the file directly.");
      document.querySelector(".sheet").prepend(box);
      if (window.console) console.error(err);
    });
})();
