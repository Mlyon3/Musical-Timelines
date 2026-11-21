# Musical Flashbacks

Listen to six anonymous excerpts and put them in the order they were composed.

- **Live:** https://musical-flashbacks.netlify.app
- **Orchestral mode:** https://musical-flashbacks.netlify.app/?mode=orchestral

## Project layout

- `site/` — the whole website (static files, no build step)
  - `index.html`, `styles.css`, `app.js` — page and game interface
  - `logic.js` — puzzle rules, scoring, share-link encoding
  - `catalog.js` — Beethoven & Brahms repertoire (Wikimedia Commons recordings)
  - `catalog-orchestral.js` — orchestral works (Apple Music previews)
- `netlify.toml` — tells Netlify to publish the `site/` folder
- `ROADMAP.md` — ideas and plans

## Running locally

```bash
python3 -m http.server 8765 --directory site
```

Then open http://localhost:8765
