/**
 * shared/haitiCommunes — the commune vocabulary, where SERVER code can read it.
 * ───────────────────────────────────────────────────────────────────────────
 * Haiti's 10 départements plus Diaspora, and their 140 communes, spelled
 * exactly as `src/data/haitiGeo.ts` spells them.
 *
 * WHY THIS IS A SECOND COPY, which is normally the wrong answer.
 *
 * `src/data/haitiGeo.ts` is the list students pick their ville from, and it is
 * the spelling everything joins on: a school in "Port-au-Prince" and a player
 * in "Port au Prince" are two places on a map, so the vocabulary has to be one
 * vocabulary. The obvious move is therefore to import it here — and it does not
 * compile. `haitiGeo.ts` is untyped (its three helpers take implicit-`any`
 * parameters, legal under the root tsconfig's `strict: false`), and `api/`
 * compiles under `strict: true`; any api file that imports it fails the api
 * typecheck with three TS7006 errors inside a file api/ does not own.
 *
 * The alternative to a copy was letting the server accept whatever commune
 * string it was handed. That is worse: a free-typed commune on a school is a
 * pin the broadcast map cannot place, discovered on the night. The vocabulary
 * has to be enforceable server-side.
 *
 * So the copy is deliberate, and it is GUARDED: `src/utils/__tests__/
 * haitiCommunes.test.ts` asserts this list is identical to HAITI_DEPARTMENTS,
 * department for department and commune for commune. Drift fails the suite
 * rather than silently producing a commune the server rejects. If you add a
 * commune to `haitiGeo.ts`, add it here — the test will tell you so.
 */

export interface HaitiDepartment {
  department: string;
  communes: readonly string[];
}

/** Mirror of HAITI_DEPARTMENTS in src/data/haitiGeo.ts. Keep them identical. */
export const HAITI_COMMUNES: readonly HaitiDepartment[] = [
  {
    department: 'Artibonite',
    communes: [
      'Gonaïves',
      'Anse-Rouge',
      'Desdunes',
      'Dessalines',
      'Ennery',
      'Grande-Saline',
      'Gros-Morne',
      "L'Estère",
      'La Chapelle',
      'Marmelade',
      "Petite-Rivière-de-l'Artibonite",
      'Saint-Marc',
      "Saint-Michel-de-l'Attalaye",
      'Terre-Neuve',
      'Verrettes',
    ],
  },
  {
    department: 'Centre',
    communes: [
      'Hinche',
      'Belladère',
      'Boucan-Carré',
      'Cerca-Carvajal',
      'Cerca-la-Source',
      'Lascahobas',
      'Maïssade',
      'Mirebalais',
      "Saut-d'Eau",
      'Savanette',
      'Thomassique',
      'Thomonde',
    ],
  },
  {
    department: "Grand'Anse",
    communes: [
      'Jérémie',
      'Abricots',
      "Anse-d'Hainault",
      'Beaumont',
      'Bonbon',
      'Chambellan',
      'Corail',
      'Dame-Marie',
      'Les Irois',
      'Moron',
      'Pestel',
      'Roseaux',
    ],
  },
  {
    department: 'Nippes',
    communes: [
      'Miragoâne',
      'Anse-à-Veau',
      'Arnaud',
      'Baradères',
      'Fonds-des-Nègres',
      'Grand-Boucan',
      "L'Asile",
      'Paillant',
      'Petit-Trou-de-Nippes',
      'Petite-Rivière-de-Nippes',
      'Plaisance-du-Sud',
    ],
  },
  {
    department: 'Nord',
    communes: [
      'Cap-Haïtien',
      'Acul-du-Nord',
      'Bahon',
      'Bas-Limbé',
      'Borgne',
      'Dondon',
      'Grande-Rivière-du-Nord',
      'La Victoire',
      'Limbé',
      'Limonade',
      'Milot',
      'Pignon',
      'Pilate',
      'Plaine-du-Nord',
      'Plaisance',
      'Port-Margot',
      'Quartier-Morin',
      'Ranquitte',
      'Saint-Raphaël',
    ],
  },
  {
    department: 'Nord-Est',
    communes: [
      'Fort-Liberté',
      'Capotille',
      'Caracol',
      'Carice',
      'Ferrier',
      'Mombin-Crochu',
      'Mont-Organisé',
      'Ouanaminthe',
      'Perches',
      'Sainte-Suzanne',
      'Terrier-Rouge',
      'Trou-du-Nord',
      'Vallières',
    ],
  },
  {
    department: 'Nord-Ouest',
    communes: [
      'Port-de-Paix',
      'Anse-à-Foleur',
      'Baie-de-Henne',
      'Bassin-Bleu',
      'Bombardopolis',
      'Chansolme',
      'Jean-Rabel',
      'La Tortue',
      'Môle-Saint-Nicolas',
      'Saint-Louis-du-Nord',
    ],
  },
  {
    department: 'Ouest',
    communes: [
      'Port-au-Prince',
      'Anse-à-Galets',
      'Arcahaie',
      'Cabaret',
      'Carrefour',
      'Cité Soleil',
      'Cornillon',
      'Croix-des-Bouquets',
      'Delmas',
      'Fonds-Verrettes',
      'Ganthier',
      'Grand-Goâve',
      'Gressier',
      'Kenscoff',
      'Léogâne',
      'Pétion-Ville',
      'Petit-Goâve',
      'Pointe-à-Raquette',
      'Tabarre',
      'Thomazeau',
    ],
  },
  {
    department: 'Sud',
    communes: [
      'Les Cayes',
      'Aquin',
      'Arniquet',
      'Camp-Perrin',
      'Cavaillon',
      'Chantal',
      'Chardonnières',
      'Côteaux',
      'Île-à-Vache',
      'Les Anglais',
      'Maniche',
      'Port-à-Piment',
      'Port-Salut',
      'Roche-à-Bateau',
      'Saint-Jean-du-Sud',
      'Saint-Louis-du-Sud',
      'Tiburon',
      'Torbeck',
    ],
  },
  {
    department: 'Sud-Est',
    communes: [
      'Jacmel',
      'Anse-à-Pitres',
      'Bainet',
      'Belle-Anse',
      'Cayes-Jacmel',
      'Côtes-de-Fer',
      'Grand-Gosier',
      'La Vallée-de-Jacmel',
      'Marigot',
      'Thiotte',
    ],
  },
  { department: 'Diaspora / Étranger', communes: [] },];

/**
 * Accent-, case- and punctuation-insensitive key — the SAME fold as `cityKey`
 * in haitiGeo.ts, so "Port au Prince", "PORT-AU-PRINCE" and "Pòtoprens" as
 * typed by a student before the picker existed all resolve to one commune.
 */
export function communeKey(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a possibly free-typed place name to its canonical commune, or null.
 *
 * Null is a real answer and the caller must keep it as one. Returning a
 * best-guess commune for an unrecognised string is how a map acquires a pin
 * nobody put there.
 */
export function findCommune(value: string | null | undefined): { department: string; commune: string } | null {
  const key = communeKey(value);
  if (!key) return null;
  for (const d of HAITI_COMMUNES) {
    for (const commune of d.communes) {
      if (communeKey(commune) === key) return { department: d.department, commune };
    }
  }
  return null;
}

/** Resolve a possibly free-typed département name to its canonical spelling, or null. */
export function findDepartment(value: string | null | undefined): string | null {
  const key = communeKey(value);
  if (!key) return null;
  for (const d of HAITI_COMMUNES) {
    if (communeKey(d.department) === key) return d.department;
  }
  return null;
}
