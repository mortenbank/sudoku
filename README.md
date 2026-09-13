# Sudoku Spil

Klassisk Sudoku-PWA af [Morten Bank](https://sudoku-bank-net.netlify.app/). Dansk som primært sprog (`lang=da`).

Brættet, timer, fejl, noter, hjælp, lokale hints, valgfri Gemini-træner, fælles high scores, PWA og DA/EN/DE er bevaret.

Diskret versionsnummer vises nederst til højre (`v1.1.4`). Bump **begge** `package.json` `"version"` og `js/version.js` (`VERSION`) — `npm test` tjekker at de matcher.

## Sværhedsgrad = teknik, ikke færre tal

Sværhedsgraden er **ikke** “skjul flere felter”.

Et puslespil med 22 givne kan stadig være Let, hvis det kun kræver Naked/Hidden Single. Et puslespil med 30 givne kan være Svær, hvis det kræver XY-Wing. Generatoren **vælger og forkaster** ud fra den sværeste menneskelige teknik, der skal til for at løse brættet. Antal ledtråde er kun et blødt søge-gulv under gravning — aldrig et acceptkriterium.

1. Udfyld et gyldigt komplet bræt.
2. Fjern felter, så længe løsningen forbliver **unik**.
3. Bedøm med en menneskelig solver (nemmeste teknik først; den sværeste, der faktisk blev brugt, er karakteren).
4. Er karakteren for hård: læg enkelte givne tilbage, indtil teknik-banen rammer målet.
5. Er karakteren for let: kassér brættet og **generér et nyt**, indtil banen matcher (tidsbudget + loading-UI).

### Teknik-stige (lav → høj)

Solveren genstarter fra toppen efter hvert fremskridt, så karakteren er den sværeste uundgåelige teknik.

| Trin | Teknik | Bane | Niveau |
| ---- | ------ | ---- | ------ |
| 1 | Naked Single | singles | Begynder / Let |
| 2 | Hidden Single | singles | Begynder / Let |
| 3 | Naked Pair | pairs | Medium |
| 4 | Hidden Pair | pairs | Medium |
| 5 | Pointing (Locked Candidates) | pairs | Medium |
| 6 | Claiming (Locked Candidates) | pairs | Medium |
| 7 | Naked / Hidden Triple | intermediate | Svær |
| 8 | Naked / Hidden Quad | intermediate | Svær |
| 9 | XY-Wing, XYZ-Wing | intermediate | Svær |
| 10 | Unique Rectangle | intermediate | Svær |
| 11 | X-Wing | advanced | Ekspert |
| 12 | Swordfish (simple fish) | advanced | Ekspert |
| 13 | Unik, men uden for listen | advanced | Ekspert |

**Begynder** og **Let** er samme teknik-bane (kun singles). Begynder graver mindre aggressivt, så der typisk er flere givne — det er den eneste bløde forskel, og den ændrer ikke karakteren.

UI’en viser den krævede teknik under brættet (`Kræver: XY-Wing`), så niveauet ikke forveksles med “færre tal”.

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

Testene kræver unik løsning og at hvert niveau rammer sin teknik-bane (ikke et clue-tal). Svær/Ekspert skal være hårdere end Let/Medium.

## Deploy dette GitHub-repo til Netlify

Repoet er et statisk site (ingen frontend-build). High scores gemmes via **Netlify Functions + Netlify Blobs**.

### Fælles high scores (Functions + Blobs)

Ved sejr spørger overlayet om 2–3 initialer (A–Z / ÆØÅ / ÄÖÜ). Scoren sendes til `POST /api/highscores` (`netlify/functions/highscores.js`). Listen hentes med `GET /api/highscores?difficulty=…`.

Sidste godkendte initialer huskes kun lokalt i `localStorage` (`sudokuInitials`) og udfyldes automatisk ved næste sejr, så man ikke skal taste dem igen. Listen selv er stadig den fælles server-board.

- **Blobs:** site-scopet store `sudoku-highscores` (stærk consistency). Ét JSON-objekt pr. sværhedsgrad (`beginner` / `easy` / `medium` / `hard` / `expert`) med top 10.
- **Score (lavere er bedre):** straffe lægges **straks på uret**. Fejl **+5 min (300 s)**, håndsat note **+1 s**, dobbelttryk/højreklik-udfyldning **+10 s pr. felt** (ikke 1× antal tal), hint **+60 s**. Hjælp-kontakten får uret til at løbe dobbelt så hurtigt (allerede i timer-intervallet). Ved submit sendes *rå* spilletid (`uret − straffe`), så serveren stadig beregner `tid + fejl×300 + noter + hints×60` uden at tælle dobbelt. `noteCount` er akkumulerede note-strafsekunder. Sletning refunderes ikke. Manglende `noteCount`/`hintCount` på ældre poster tæller som 0 — eksisterende Blobs-rækker og store-navnet `sudoku-highscores` røres ikke.
- **Ingen hemmeligheder:** offentlig læsning. Skriv valideres på serveren (difficulty-enum, initialer, tid 1–12 t, fejl 0–500, noteCount 0–5000, hintCount 0–200). `finalScore` og stjerner beregnes server-side — klienten stoles ikke på.
- **Offline:** hvis API’et fejler, gemmes scoren stadig lokalt (`sudokuHighScores_${difficulty}`) og overlayet viser lokale tider med en tydelig besked. Spillet går ikke i stykker.
- Blobs kræver ingen provisioning eller betalt database — det følger med Netlify-sitet.

Lokal `npm start` (python-server) har ingen functions; high scores falder da tilbage til localStorage. Brug `netlify dev` for at afprøve den delte liste.

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
js/version.js       # VERSION (hold i trit med package.json)
js/highscore-rules.js
js/highscores-api.js
js/sudoku.js        # unikhed + udfyldning
js/techniques.js    # menneskelig solver / karakter
js/generator.js     # grav + bedøm + regenerér til teknik-bane
js/game.js          # bræt, timer, noter, hints, scores
netlify/functions/highscores.js   # GET/POST /api/highscores → Blobs
manifest.json + service-worker.js
```
