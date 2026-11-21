# Musical Flashbacks — Roadmap

_Last updated: 21 November 2026_

Live site: https://musical-flashbacks.netlify.app
Orchestral link for friends: https://musical-flashbacks.netlify.app/?mode=orchestral

---

## Where things stand

- **Modes:** Daily (rotates Beethoven / Mixed / Brahms), Practice (Beethoven, Brahms, Mixed), Orchestral (Beethoven & Brahms, Apple Music previews).
- **Audio sources:** Wikimedia Commons open recordings (original 36 works); Apple Music 30-second previews (20 orchestral works). All 20 Apple previews verified available in the Japan store (Nov 2026); playback looks up the player's own country store first, then the US.
- **Sharing:** "Send this set to a friend" (no score, friendly) before reveal; "Share my score" (challenge, with coloured squares) after reveal. The whole set is encoded in the link — no server.
- **Reveal view:** score, rating, timeline by year, "your order vs real order" chart, colour-coded result cards.
- **Saved progress:** per browser only (localStorage).

---

## How to create custom sets — options

| Option | How it works | Best for | Downsides |
|---|---|---|---|
| **Simple list → Claude** | Send a list in any format ("Beethoven – Op. 59 No. 1 – slow movement"). Claude verifies years, writes stories, finds Apple recordings, checks country availability. | Building **modes** (curated libraries) | Claude needed each time |
| **YouTube playlist → Claude** | Same, but you choose by ear on YouTube and send the playlist link. YouTube is only the input; it never plays in the game. | Choosing specific movements by listening | Same, plus matching each video to an Apple recording |
| **Set Builder page** | Private page in the app: search Apple Music, pick six tracks, enter years (optional notes), preview, get a share link. Set lives inside the link — no server/login. | **One-off sets** for friends, instantly | You enter the years yourself; no stories unless you write them |
| **Admin page + saved library** | Builder sets saved to a database, reusable, can feed the Daily rotation. | Long-term running, or other people curating | Needs accounts + database; real build/maintenance effort |

**Key distinction:** *modes* (curated libraries of 15–25 works with verified dates and stories) → "you pick, Claude researches". *Custom sets* ("these six for my friend tonight") → a builder you use yourself.

---

## String quartet mode — possible shapes

- **Beethoven quartets only** — Op. 18 (1800), Razumovsky (1806), late quartets (1825–26). Classic and hardest.
- **Quartets across history** — Haydn, Mozart, Beethoven, Schubert, Dvořák, Shostakovich, maybe Bartók. Easier: 200 years of style change.
- **Beethoven & Brahms chamber** — matches the current game; Brahms wrote only three quartets, so add his string quintets and sextets.

_Decision pending: which shape?_

---

## Timeline

### Now (next session or two)
- [ ] String Quartet mode (from a list / playlist, or Claude proposes one)
- [ ] Store each mode as a plain data file so new modes are quick to add
- [ ] Mode picker that scales beyond a dropdown (cards on the home screen)

### Next (a few weeks)
- [ ] **Set Builder page** — your own custom sets as share links
- [ ] More composer modes via Apple previews: Mozart, Haydn, Schubert, Chopin, Tchaikovsky, Dvořák, Shostakovich
- [ ] Difficulty label for each mode; new modes join the Daily rotation
- [ ] iPad home-screen install (opens full-screen like an app)
- [ ] Link-preview image for sharing in Messages

### Later (1–3 months)
- [ ] Saved library + curator page (sets stored online, reusable)
- [ ] Daily leaderboard among friends (small database — Netlify has one built in)
- [ ] Custom domain (e.g. musicalflashbacks.com)
- [ ] New ways to play: "Era" mode (guess the decade across composers), hint that reveals a composer for a point, timed rounds

### Down the line (presence)
- [ ] Simple landing page; weekly themed set
- [ ] Classroom / music-teacher version
- [ ] Social clips ("guess which came first") — **Apple previews can't be reused in videos**; use open recordings or your own audio
- [ ] If it grows or earns money: review Apple's media terms properly (previews are meant to promote the music; the game credits and links each track). Apple's affiliate programme pays a small commission on click-throughs to Apple Music.

---

## Recommended order
1. **Now:** String Quartet mode from your picks.
2. **Then:** Set Builder page, so sets for friends don't need Claude.
3. **Hold off** on the admin page and database until you're making sets often or want leaderboards.

---

## Project housekeeping
- Site files: `site/` (index.html, styles.css, app.js, logic.js, catalog.js, catalog-orchestral.js); `netlify.toml` at the repo root
- Netlify project: `musical-flashbacks`
- Recommended: put the project in a private GitHub repo and connect it to Netlify, so every change is backed up, can be rolled back, and deploys automatically on push.
