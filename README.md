# Sudoku Spil

Klassisk Sudoku-PWA af [Morten Bank](https://sudoku-bank-net.netlify.app/). Dansk som primært sprog (`lang=da`).

Brættet, timer, fejl, noter, hjælp, lokale hints, valgfri Gemini-træner, high scores, PWA og DA/EN/DE er bevaret. Sværhedsgraden er **ikke** længere kun antal ledtråde.

## Teknik-baseret sværhedsgrad

Generatoren:

1. Udfylder et gyldigt bræt.
2. Fjerner felter, så længe puslespillet har **præcis én løsning**.
3. Bedømmer puslespillet med en menneskelig solver (nemmeste teknik først).
4. Regenererer / lægger ledtråde tilbage, indtil den valgte bane rammes — inden for et tidsbudget, med loading-UI.

**Teknik-karakteren er primær.** Antal givne tal er kun et blødt sekundært mål.

| Niveau   | Sværeste nødvendige teknik |
| -------- | -------------------------- |
| Begynder | Kun Naked / Hidden Single (flere givne) |
| Let      | Kun Naked / Hidden Single |
| Medium   | Naked / Hidden Pair, eller Pointing / Claiming (locked candidates) |
| Svær     | Naked / Hidden Triple eller Quad, XY-Wing, XYZ-Wing, Unique Rectangle |
| Ekspert  | X-Wing / Swordfish, eller unik men uden for de ovenstående teknikker |

Kerne-spil og generering bruger **ingen Gemini-nøgle**. AI-træneren er valgfri og gemmer nøglen kun i `localStorage`.

## Kør lokalt

```bash
npm start
# eller: python3 -m http.server 4173
```

Åbn [http://localhost:4173](http://localhost:4173).

```bash
npm test
```

Testene tjekker unik løsning og at Svær/Ekspert kræver hårdere teknikker end Let/Medium.

## Deploy dette GitHub-repo til Netlify

Repoet er et rent statisk site (ingen build).

1. Log ind på [Netlify](https://app.netlify.com/) og vælg **Add new site → Import an existing project**.
2. Tilknyt GitHub og vælg `mortenbank/sudoku`.
3. Build settings:
   - **Base directory:** (tom)
   - **Build command:** (tom — ingen build)
   - **Publish directory:** `.` (site-root)
4. Deploy. `netlify.toml` i roden sætter allerede `publish = "."`.
5. Valgfrit: sæt custom domain, og slå HTTPS til (standard).

Efter push til `main` (eller den branch Netlify lytter på) redeployer Netlify automatisk.

CLI-alternativ:

```bash
npm i -g netlify-cli
netlify login
netlify init    # eller: netlify deploy --prod --dir=.
```

## Struktur

```
index.html          # UI (dansk-først)
css/app.css
js/sudoku.js        # unikhed + udfyldning
js/techniques.js    # menneskelig solver / karakter
js/generator.js     # grav + bedøm + ram bane
js/game.js          # bræt, timer, noter, hints, scores
manifest.json + service-worker.js
```
