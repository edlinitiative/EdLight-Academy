# Économie — consolidated YouTube video IDs (for website wiring)

Single source of truth for embedding the migrated HD Economics videos on academy.edlight.org.
Watch URL = `https://www.youtube.com/watch?v=<ID>` · Embed = `https://www.youtube.com/embed/<ID>`.
The site stores this in the Firestore `videos` collection's `video_url` field (any of watch / youtu.be / embed forms work — see `src/components/YouTubePlayer.tsx` `getYouTubeVideoId`).

Status (2026-07-06): NS1/NS3/NS4 IDs recorded below. **NS2 IDs are NOT recorded anywhere and must be harvested from the Economie-NS2 playlist** (see gap note at bottom).

## NS1 — Économie (18 videos) · playlist `PLD8IqnfQOT4UxfSqYrYjVK6ROjRi5_S61`
| # | Title | Video ID |
|---|---|---|
| 1 | Notion de Demande | BAHyx_5dqyI |
| 2 | Notion d'Offre | s8V74XR5BcY |
| 3 | Notion de Budget | HNOuKpOp1AE |
| 4 | Notion d'Équilibre | 9288p-uq3bQ |
| 5 | Notion de Biens | nSjSOnL-BGA |
| 6 | Notion de Besoins | lg7iHRvNBvM |
| 7 | Notion d'Élasticité | Ru6mK7Bwf7o |
| 8 | Chômage | oO9lz70LmMg |
| 9 | Intérêt Simple | 2GFAwLHfCU4 |
| 10 | Intérêt Simple : Exercices 1 | YhvDoP6lXv4 |
| 11 | Intérêt Simple : Exercices 2 | Uclw0D-6QlQ |
| 12 | Fondements de l'Économie | XQdsqomjkOc |
| 13 | Investissement | InrXiIA0-qU |
| 14 | Formes d'Investissement | 1KzRkUq-Dl4 |
| 15 | Indicateurs Macroéconomiques | 5j7CHytEjg8 |
| 16 | Économie Internationale | 8u9FMK8e7kg |
| 17 | Actes Économiques | sX7zA3nKt6o |
| 18 | Avantage Absolu | 2QFZutgiakE |

## NS2 — Économie (42 videos) · playlist `PLD8IqnfQOT4UVXSUpenv3v6Z-4s9_JUdP`
⚠️ **IDs MISSING** — never recorded during the NS2 migration. Titles/doc-order are in `ns2-metadata.md`. To fill: open the Economie-NS2 playlist (all 42 are the only videos left in it after cleanup) and extract `a#video-title` hrefs via JS, matching titles to the ns2-metadata doc order. Needs a healthy browser.

## NS3 — Économie (23 videos) · playlist `PLD8IqnfQOT4WG0b_P7a-A_GDYnSMslg7G`
| # | Title | Video ID |
|---|---|---|
| 1 | Notion de Base en Math | U8Ndprsy8gU |
| 2 | Inéquation | 9D-G9Lp1nDk |
| 3 | Fonction Polynomiale | Qidzeo_KusQ |
| 4 | Représentation Graphique d'une Pente | Mh4Q7nft8RU |
| 5 | Représentation Graphique de Polynôme du Second Degré | re3ePbmEbZ4 |
| 6 | Système d'Équations | jAWajjcOjVY |
| 7 | Fonction de la Demande | 2YO8TklPcQk |
| 8 | Déplacement de la Courbe de Demande | AqIcMfBkjzA |
| 9 | Courbe de la Demande Agrégée | c_NLf-ghwpk |
| 10 | Déplacement de la Demande Agrégée | jQPKaAG-CGg |
| 11 | Demande Agrégée des Acteurs Économiques | 3LrgjDcjMr4 |
| 12 | Offre Agrégée | 7CoBZ5MFN6E |
| 13 | Déplacement de l'Offre Agrégée | gEc5tfmnYas |
| 14 | Courbe de Laffer | NSqABCxs7l8 |
| 15 | Utilité Totale et Marginale | kIj3dkw4T7g |
| 16 | Fonction d'Utilité | MdB4DBpKCMM |
| 17 | Maximisation de la Fonction d'Utilité | tRzQ0h--Hds |
| 18 | Maximisation d'Utilité | p426PKT0qUQ |
| 19 | Notion de Projet | Fg-9zDyfJRQ |
| 20 | La Planification | _hGewmaRrhA |
| 21 | Taux Marginal de Substitution | t6xDuk6G05k |
| 22 | Élasticité | fQjfPyOYK48 |
| 23 | Profit | -doTXLOHpBY |

## NS4 — Économie (18 videos) · playlist `PLD8IqnfQOT4XXXX3W1rVo2BcEiSrNb1Wm`
| # | Title | Video ID |
|---|---|---|
| 1 | Le Mercantilisme | pS4tQwm7jmg |
| 2 | Le Mercantilisme (Partie 2) | 7ntWvvypBZE |
| 3 | Mercantilisme Français | Gp6dMriKzs4 |
| 4 | Mercantilisme Anglais | wF1--v1lrYQ |
| 5 | Mercantilisme Espagnol | y9JCJ6QhtrQ |
| 6 | Produit Intérieur Brut (PIB) | bh8l5kXnXkU |
| 7 | PIB (Exercices) | id9_D_f-kqI |
| 8 | Les Nouvelles Économies Classiques | DgQLO2je2nA |
| 9 | Théorie Quantitative de la Monnaie | _IIg22sux_k |
| 10 | Marxisme et Caractéristiques | JnTwk41ofPM |
| 11 | Le Monétarisme | X0qdKiI6Hks |
| 12 | Théorie Classique | 8x1KhTPWffk |
| 13 | Théorie Keynésienne | lEpkylojNHw |
| 14 | Théories Traditionnelles | Q31u4-HyoYc |
| 15 | Structure de Marché | MSZEx0CDO7E |
| 16 | Marché de Concurrence Pure et Parfaite | u0H-mexyiA0 |
| 17 | Cartel et Trust | yrPGANAryy4 |
| 18 | Croissance Économique | F1El_wruS0c |

## Wiring notes / open questions (from exploring the site code)
- **Runtime source = Firestore** (`courses`, `videos` collections), NOT the repo CSVs. Repo CSV edits don't take effect until synced. Write path: `src/pages/Admin.tsx` "Vidéos" tab → edit `video_url` → Save (calls `updateVideo` → `setDoc(doc(db,'videos',id),…,{merge:true})` in `src/services/firebase.ts:235`).
- **Only `ECON-NSI` (NS1) exists** as a course/subject, with **11 lesson slots** in `public/data/edlight_videos.csv` — but NS1 has **18** videos. NS2/NS3/NS4 have **no** course or video docs → must be created (units/lessons via `createCourse`/`updateCourse` region ~`firebase.ts:272`).
- **Title mapping is non-trivial**: Firestore lesson docs use Haitian-Creole titles (e.g. "Bezwen ak resous ra"); these IDs are French. `inventory.md` warns the curriculum moved topics between levels vs the old playlists — map by TOPIC, not position.
- Open decisions before wiring: (a) how to structure NS1's 18 videos into the 11 existing slots (add lessons?); (b) create NS2–NS4 course structures — how many units, Creole vs French lesson titles; (c) harvest the 42 NS2 IDs.
