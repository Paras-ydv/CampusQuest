# Favicon options

Open `/favicon-options/preview.html` while the app is running to see each one
at 16, 32 and 64px, and mocked into a light and dark browser tab. The 16px
column is the only one that really decides it.

The active icon is `apps/web/app/icon.svg` — Next serves that automatically, so
switching is a copy:

    cp apps/web/public/favicon-options/2-quest-q.svg apps/web/app/icon.svg

| File | Reads at 16px |
| --- | --- |
| `1-monogram.svg` | Poor — two letters collapse into a smudge |
| `2-quest-q.svg` | Good, though it reads as a magnifying glass |
| `3-offset-square.svg` | Good, but abstract enough to be any brand |
| `4-alignment.svg` | Good, and says what the product does — **current** |
| `5-constellation.svg` | Poor — the connecting lines vanish |
