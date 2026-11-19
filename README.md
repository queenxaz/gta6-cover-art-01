[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/queenxaz/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/queenxaz/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

# Sunset Cover Studio

A web app that turns your photo and a caption into GTA-style cover art — the multi-panel poster look, bold lettering, a Vice sunset or neon colour grade — exported as a PNG to share. It runs offline in a desktop browser from its own static files; photos never leave your machine.

Built for the [make.fun "Make GTA 6 Cover Art" bounty](https://make.fun/bounty/gta6-cover-art-01).

## How it works

1. **Photos** — upload up to three of your own photos (or try the built-in sample scenes), one per panel. Click a panel to select it, drag the photo to reposition it, or fine-tune zoom and pan with the sliders.
2. **Layout** — Poster (hero + two panels), Triptych (three tall panels), Duo, or Solo.
3. **Colour grade** — Vice Sunset, Neon Nights, Palm Noir, or Clean.
4. **Lettering** — edit the title, subtitle and corner tag; pick a lettering style and title position.
5. **Export** — one click writes a PNG in 1080×1080, 1080×1350 or 1920×1080.

## Try it

```sh
node serve.ts
# open http://localhost:8080
```

Everything under `app/` is plain static files — no build step, no network request. The display font is Anton, shipped under the SIL Open Font License (`app/fonts/OFL.txt`). All artwork in the app is original; it uses no Rockstar Games logo, artwork, or font.

## Entry

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library.
