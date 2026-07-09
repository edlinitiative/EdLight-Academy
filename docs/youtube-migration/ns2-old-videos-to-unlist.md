# Old NS2 videos to unlist (matched to the 42 NS2 topics) — 2026-07-05

27 old (pre-2026) PUBLIC videos whose title matches a canonical NS2 topic. Their HQ replacements are now the 42 live videos in the Economie-NS2 playlist. Unlisting to preserve analytics while hiding from search/suggestions.

| Video ID | Old title |
|---|---|
| 0Eszczp-WrU | Motif de Détention de la Monnaie |
| 1zfmond8Jv8 | Representation Graphique de la Fonction de Consommation |
| 0eW8ZFV8kBk | Offre de Monnaie |
| 3paFmv9CmaY | Notion de Demande |
| 2Uw1ZyRjuYM | Relation entre Epargne et Investissement |
| 2BqXZjelArk | PMS En Fonction Du PIB Réel |
| 6OzDy9MGMS4 | PIB Nominal et Réel |
| DuP4rJSe-2c | Facteurs Affectant la Demande |
| Et_WelBYBMo | Budget et Politique Budgetaire |
| G9pQ38bjJ1A | La Monnaie |
| LDWVbU8W8zU | Circuit Economique |
| E5lgPtdJkqA | Notion de l'Offre |
| GH4zO2cjNPs | Formes d'Entreprise |
| pX3qCfKUdHQ | Economie Rurale |
| qzctZ2ZsoUM | Consommation et Epargne |
| NEIFV-KfnOg | MERCOSUR |
| 2WCzwBAzFKM | Frontière des Possibilités |
| BoBW8UoSn48 | Développement |
| Pon_Ija_eTM | Propension à Epargner |
| QRqLyRei0fs | Equilibre de Production et de Prix QA et DA |
| Ure5XJA_caA | Les Trois Equilibres |
| NcliYOulMW4 | Prix Plafond et Prix Plancher |
| dlh4QJoEUEk | Notion d'Entreprise |
| PU3neGi1pVI | La Fonction de Consommation |
| bdmedlUJlY8 | Politique Fiscale |
| jlaoXDvYZjI | (matched NS2 topic) |
| sujFoJ9DACw | (matched NS2 topic) |

Note: 27 of 42 topics had a clearly title-matching old public version. The other ~15 either had no old version, a divergent old title, or were already unlisted (e.g. via the NS1 pass). Status set to Unlisted per user (automatic).

## ✅ ALL 27 UNLISTED (completed 2026-07-06)
7 done via per-video edit page; remaining 20 done via Studio Content-list BULK edit (I JS-selected candidate checkboxes per page → user clicked Edit ▸ Visibility ▸ Unlisted ▸ Update videos). Verified. NS2 fully complete.

## UNLISTING PROGRESS (2026-07-05) — 7 of 27 done [superseded by above]
UNLISTED ✅: 0Eszczp-WrU (Motif de Détention), 1zfmond8Jv8 (Rep Graph Fonction Conso), 0eW8ZFV8kBk (Offre de Monnaie), 3paFmv9CmaY (Notion de Demande), 2Uw1ZyRjuYM (Relation Épargne/Investissement), 2BqXZjelArk (PMS PIB Réel), 6OzDy9MGMS4 (PIB Nominal et Réel).

STILL PUBLIC (20 remaining): DuP4rJSe-2c, Et_WelBYBMo, G9pQ38bjJ1A, LDWVbU8W8zU, E5lgPtdJkqA, GH4zO2cjNPs, pX3qCfKUdHQ, qzctZ2ZsoUM, NEIFV-KfnOg, 2WCzwBAzFKM, BoBW8UoSn48, Pon_Ija_eTM, QRqLyRei0fs, Ure5XJA_caA, NcliYOulMW4, dlh4QJoEUEk, PU3neGi1pVI, bdmedlUJlY8, jlaoXDvYZjI, sujFoJ9DACw.

### Working per-video unlist recipe (studio.youtube.com/video/{id}/edit)
- COORDINATE SCALING: screenshot space is 1492×812 but CSS viewport is 1402×763 → multiply getBoundingClientRect() coords by 1.064 to get click coords.
- Open visibility dialog: click the visibility box. FLAKY via computer click (~50-60% success, needs retry); JS `.click()` and synthetic PointerEvents do NOT open it. Box center ≈ screenshot (1168,705) when page unscrolled, but Y varies per video with sidebar content → measure box rect ×1.064 each time.
- Once dialog open, the rest is 100% reliable via JS:
  - Unlisted radio: `[...document.querySelectorAll('tp-yt-paper-radio-button')].find(x=>/^\s*Unlisted/i.test(x.innerText))` → .click()
  - Done button: deep shadow-DOM search `YTCP-BUTTON#save-button` (visible) → .click() (poll until #visibility-text === 'Unlisted')
  - Save: `document.querySelector('ytcp-button#save,#save').click()` (poll until aria-disabled)
- BETTER PATH TO TRY: Studio Content-list BULK visibility edit (select candidate checkboxes across pages → Edit ▸ Visibility ▸ Unlisted) — avoids the flaky per-video dialog entirely. Not yet validated.
