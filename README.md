# Vinnytsia after 6

A one-week evening guide for Vinnytsia, 21 to 27 September 2026. It is built for one
person: she finishes work at 18:00 in Vyshenka, goes out alone, likes exhibitions and
a quiet drink with a view, and has already seen everything a tourist gets shown. So the
list is second-tier and local on purpose, and the whole week is sized to about 300 UAH
an evening.

Friday 25 is deliberately empty. It appears in the week switcher, greyed out.

The site is a static page: `index.html`, `styles.css`, `app.js` and `data.json`, served
straight from the repository root. No framework, no build step, no bundler.

## Running it locally

`fetch()` will not read `data.json` from a `file://` URL, so opening `index.html` by
double-clicking it shows an error message instead of the site. Serve the folder:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works.

## What loads from the network

Only three things, and the site is readable without any of them:

- Leaflet 1.9.4 (CSS and JS) from unpkg, pinned with subresource integrity hashes.
- Kelly Slab and Rubik from Google Fonts. Both carry Cyrillic, which matters because
  every address on the site is in Ukrainian.
- Map tiles from openstreetmap.org.

No analytics, no trackers, no other third-party requests. With no connection the page,
the plans and the directory still render; the map shows an empty grey frame.

## How `data.json` is structured

Everything the page says lives in this file, including the section headings. The top
level has:

| Key | What it holds |
| --- | --- |
| `meta` | Title, intro, the 300 UAH budget, and `commute`, the times used to flag events that start before she could get there |
| `ui` | Section headings and every interface label |
| `practicalNotes` | The two notes in the "Before you go" block |
| `categories` | The six filters, each with the colour used for its map pin |
| `districts` | `west` and `centre` |
| `priceTiers` | `low`, `mid`, `high` |
| `venues` | The directory, 33 entries |
| `events` | The 15 dated events that week |
| `days` | Seven days, each with a main plan and a plan B |

### A venue

```json
{
  "id": "propaganda",
  "name": "PROPAGANDA",
  "nameUk": null,
  "addressUk": "проспект Космонавтів, 15",
  "district": "west",
  "category": "bar",
  "tags": ["social"],
  "hours": {
    "mon": null,
    "tue": [{ "open": "16:00", "close": "22:00" }]
  },
  "hoursStatus": "known",
  "hoursNote": null,
  "priceTier": null,
  "entry": null,
  "description": "One line on what the place is.",
  "why": "One line on why it earned a spot.",
  "accessNote": null,
  "coords": [49.231531, 28.421176],
  "needsVerification": false
}
```

- `name` is Latin script, `nameUk` is the Ukrainian name and is `null` where the source
  gave only a Latin brand. `addressUk` is always Ukrainian: it is what she shows a taxi
  driver, and the page renders it under "Show the driver".
- `hours` has a key for all seven days. `null` means closed. An entry with
  `"open": null` means only the closing time is known, and the page renders it as
  `→ 20:00` rather than inventing an opening time.
- `hoursStatus` is `known`, `partial`, `unverified` or `unpublished`.
- `tags` are extra categories, so a gallery with a café answers both the `art` and the
  `coffee` filter. The pin colour always comes from `category`, never from `tags`.
- `coords` is `[lat, lon]` or `null`. See "Coordinates" below.
- `priceTier` and `entry` stay `null` unless the source actually stated a price. The
  page then shows nothing rather than a guess.

### A day

Each day has `plans`, and each plan has `steps`. A step points at `venueIds` (one, or
two when a single stop covers two addresses) and optionally an `eventId`.
`mode` is `sequence` for "this, then that", or `either` for two alternatives.

The map highlight for a day is computed, not stored: it is every venue named in that
day's plans plus every venue with an event that date.

## Adding a venue

1. Append an object to `venues` with a new `id`, following the shape above. Set
   `"coords": null` and `"needsVerification": true` for now.
2. Geocode it. One request per second with a real User-Agent, as Nominatim's usage
   policy requires:

   ```
   https://nominatim.openstreetmap.org/search?q=<address>, Вінниця, Україна&format=jsonv2&addressdetails=1
   ```

3. Check the response: `address.road` must match the street you asked for and
   `address.house_number` must match the number. A result with no `house_number` is a
   street centroid, not the building, so leave `coords` as `null`.
4. If it resolved, write `[lat, lon]` into `coords` and set `needsVerification` to
   `false`. Anything still unresolved appears in the directory, is kept off the map, and
   is listed in the "Not on the map" block at the bottom of the page.

A venue needs no other wiring. The directory, the filters, the map and the legend all
read from the same array.

## Coordinates

Every coordinate in this file was resolved through Nominatim and checked against the
street and house number, not typed in by hand. Six venues have `coords: null`:

- **Kultura**, **GIGI**, **Gallery XXI**, **RiverSide** — the street resolves, but
  OpenStreetMap has no building at that number. An approximate pin on a map she is
  reading on a street corner is worse than no pin.
- **Vinnytsia Regional Philharmonic**, **Docker Pub** — no address in the source at all.

## Accessibility

The day switcher is a real tablist: arrow keys move between days, Home and End jump to
the ends, and Friday is skipped because it has no plan. Filters are ordinary checkboxes
behind styled labels, so they work with a keyboard and a screen reader without help. Tap
targets are at least 44px. Text colours pass WCAG AA against the paper background; the
ochre is used only as a fill behind near-black text, never as text on paper.

## Licence

MIT, see `LICENSE`. The venue descriptions are written for this guide. Map data is
© OpenStreetMap contributors, ODbL.
