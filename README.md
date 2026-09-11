# Sudoku Spil

Klassisk Sudoku-PWA af [Morten Bank](https://sudoku-bank-net.netlify.app/). Dansk som primært sprog (`lang=da`).

Brættet, timer, fejl, noter, hjælp, lokale hints, valgfri Gemini-træner, high scores, PWA og DA/EN/DE er bevaret.

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
js/generator.js     # grav + bedøm + regenerér til teknik-bane
js/game.js          # bræt, timer, noter, hints, scores
manifest.json + service-worker.js
```
