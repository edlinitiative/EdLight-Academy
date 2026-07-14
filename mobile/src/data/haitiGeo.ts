/**
 * Haiti geography — the 10 départements and their communes (villes).
 * Used by the leaderboard profile form so learners pick their ville from a
 * list (consistent spelling → the Ville ranking scope actually groups people)
 * instead of free-typing "Port au Prince" / "Port-au-prince" / "PAP".
 *
 * A learner whose ville is missing can still type it (option "Autre ville…"),
 * and the Diaspora entry covers learners outside Haiti.
 */

export const OTHER_CITY = '__other__';

export const HAITI_DEPARTMENTS = [
  {
    name: 'Artibonite',
    cities: [
      'Gonaïves', 'Anse-Rouge', 'Desdunes', 'Dessalines', 'Ennery', 'Grande-Saline',
      'Gros-Morne', "L'Estère", 'La Chapelle', 'Marmelade', 'Petite-Rivière-de-l\'Artibonite',
      'Saint-Marc', 'Saint-Michel-de-l\'Attalaye', 'Terre-Neuve', 'Verrettes',
    ],
  },
  {
    name: 'Centre',
    cities: [
      'Hinche', 'Belladère', 'Boucan-Carré', 'Cerca-Carvajal', 'Cerca-la-Source',
      'Lascahobas', 'Maïssade', 'Mirebalais', "Saut-d'Eau", 'Savanette',
      'Thomassique', 'Thomonde',
    ],
  },
  {
    name: "Grand'Anse",
    cities: [
      'Jérémie', 'Abricots', "Anse-d'Hainault", 'Beaumont', 'Bonbon', 'Chambellan',
      'Corail', 'Dame-Marie', 'Les Irois', 'Moron', 'Pestel', 'Roseaux',
    ],
  },
  {
    name: 'Nippes',
    cities: [
      'Miragoâne', 'Anse-à-Veau', 'Arnaud', 'Baradères', 'Fonds-des-Nègres',
      'Grand-Boucan', "L'Asile", 'Paillant', 'Petit-Trou-de-Nippes',
      'Petite-Rivière-de-Nippes', 'Plaisance-du-Sud',
    ],
  },
  {
    name: 'Nord',
    cities: [
      'Cap-Haïtien', 'Acul-du-Nord', 'Bahon', 'Bas-Limbé', 'Borgne', 'Dondon',
      'Grande-Rivière-du-Nord', 'La Victoire', 'Limbé', 'Limonade', 'Milot',
      'Pignon', 'Pilate', 'Plaine-du-Nord', 'Plaisance', 'Port-Margot',
      'Quartier-Morin', 'Ranquitte', 'Saint-Raphaël',
    ],
  },
  {
    name: 'Nord-Est',
    cities: [
      'Fort-Liberté', 'Capotille', 'Caracol', 'Carice', 'Ferrier', 'Mombin-Crochu',
      'Mont-Organisé', 'Ouanaminthe', 'Perches', 'Sainte-Suzanne', 'Terrier-Rouge',
      'Trou-du-Nord', 'Vallières',
    ],
  },
  {
    name: 'Nord-Ouest',
    cities: [
      'Port-de-Paix', 'Anse-à-Foleur', 'Baie-de-Henne', 'Bassin-Bleu', 'Bombardopolis',
      'Chansolme', 'Jean-Rabel', 'La Tortue', 'Môle-Saint-Nicolas', 'Saint-Louis-du-Nord',
    ],
  },
  {
    name: 'Ouest',
    cities: [
      'Port-au-Prince', 'Anse-à-Galets', 'Arcahaie', 'Cabaret', 'Carrefour',
      'Cité Soleil', 'Cornillon', 'Croix-des-Bouquets', 'Delmas', 'Fonds-Verrettes',
      'Ganthier', 'Grand-Goâve', 'Gressier', 'Kenscoff', 'Léogâne', 'Pétion-Ville',
      'Petit-Goâve', 'Pointe-à-Raquette', 'Tabarre', 'Thomazeau',
    ],
  },
  {
    name: 'Sud',
    cities: [
      'Les Cayes', 'Aquin', 'Arniquet', 'Camp-Perrin', 'Cavaillon', 'Chantal',
      'Chardonnières', 'Côteaux', 'Île-à-Vache', 'Les Anglais', 'Maniche',
      'Port-à-Piment', 'Port-Salut', 'Roche-à-Bateau', 'Saint-Jean-du-Sud',
      'Saint-Louis-du-Sud', 'Tiburon', 'Torbeck',
    ],
  },
  {
    name: 'Sud-Est',
    cities: [
      'Jacmel', 'Anse-à-Pitres', 'Bainet', 'Belle-Anse', 'Cayes-Jacmel',
      'Côtes-de-Fer', 'Grand-Gosier', 'La Vallée-de-Jacmel', 'Marigot', 'Thiotte',
    ],
  },
  // Learners studying from abroad — no fixed city list, they type their own.
  { name: 'Diaspora / Étranger', cities: [] },
];

/** Cities of one département ([] when unknown / diaspora). */
export function citiesOf(department: string) {
  return HAITI_DEPARTMENTS.find((d) => d.name === department)?.cities || [];
}

// Accent/case/punctuation-insensitive key so legacy free-typed values
// ("Port au Prince", "Petion-Ville") still map onto the canonical spelling.
export function cityKey(s: unknown) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a (possibly free-typed) city to its canonical { department, city },
 * or null when it isn't a known commune.
 */
export function findCity(city: unknown) {
  const key = cityKey(city);
  if (!key) return null;
  for (const d of HAITI_DEPARTMENTS) {
    const hit = d.cities.find((c) => cityKey(c) === key);
    if (hit) return { department: d.name, city: hit };
  }
  return null;
}
