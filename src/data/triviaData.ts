/**
 * Comprehensive trivia data for EdLight Academy.
 * Covers ALL ~196 sovereign nations — capitals, currencies, and flags.
 * Questions are generated dynamically from the raw country data,
 * so distractors are always real capitals / currencies / country names.
 */

export const TRIVIA_CATEGORIES = [
  {
    id: 'capitals',
    name: 'Capitales',
    nameHt: 'Kapital yo',
    icon: '🏛️',
    color: '#0A66C2',
    description: 'Toutes les capitales du monde, 196 pays',
    descriptionHt: 'Tout kapital nan mond lan, 196 peyi',
  },
  {
    id: 'currencies',
    name: 'Monnaies',
    nameHt: 'Lajan',
    icon: '💰',
    color: '#16a34a',
    description: 'Toutes les monnaies du monde, 196 pays',
    descriptionHt: 'Tout lajan nan mond lan, 196 peyi',
  },
  {
    id: 'flags',
    name: 'Drapeaux',
    nameHt: 'Drapo yo',
    icon: '🏳️',
    color: '#dc2626',
    description: 'Tous les drapeaux du monde, 196 pays',
    descriptionHt: 'Tout drapo nan mond lan, 196 peyi',
  },
];

/* ─── Raw country data ──────────────────────────────────────────────────────
 * Fields:
 *   name  – French display name
 *   ht    – Haitian Creole name (falls back to French when identical)
 *   prep  – French preposition + country for question template
 *   cap   – Capital city
 *   cur   – Currency name (French)
 *   flag  – Emoji flag
 * ────────────────────────────────────────────────────────────────────────── */

const COUNTRIES = [
  /* ═══ AMERICAS — Caribbean ═══ */
  { name: "Haïti", ht: "Ayiti", prep: "d'Haïti", cap: "Port-au-Prince", cur: "Gourde haïtienne", flag: "🇭🇹" },
  { name: "République dominicaine", ht: "Repiblik Dominikèn", prep: "de la République dominicaine", cap: "Saint-Domingue", cur: "Peso dominicain", flag: "🇩🇴" },
  { name: "Cuba", ht: "Kiba", prep: "de Cuba", cap: "La Havane", cur: "Peso cubain", flag: "🇨🇺" },
  { name: "Jamaïque", ht: "Jamayik", prep: "de la Jamaïque", cap: "Kingston", cur: "Dollar jamaïcain", flag: "🇯🇲" },
  { name: "Trinité-et-Tobago", ht: "Trinidad ak Tobago", prep: "de Trinité-et-Tobago", cap: "Port-d'Espagne", cur: "Dollar de Trinité-et-Tobago", flag: "🇹🇹" },
  { name: "Bahamas", ht: "Bahamas", prep: "des Bahamas", cap: "Nassau", cur: "Dollar bahaméen", flag: "🇧🇸" },
  { name: "Barbade", ht: "Barbad", prep: "de la Barbade", cap: "Bridgetown", cur: "Dollar barbadien", flag: "🇧🇧" },
  { name: "Antigua-et-Barbuda", ht: "Antigua-e-Barbuda", prep: "d'Antigua-et-Barbuda", cap: "Saint John's", cur: "Dollar des Caraïbes orientales", flag: "🇦🇬" },
  { name: "Dominique", ht: "Dominik", prep: "de la Dominique", cap: "Roseau", cur: "Dollar des Caraïbes orientales", flag: "🇩🇲" },
  { name: "Grenade", ht: "Grenad", prep: "de la Grenade", cap: "Saint-Georges", cur: "Dollar des Caraïbes orientales", flag: "🇬🇩" },
  { name: "Saint-Kitts-et-Nevis", ht: "Sen Kits ak Nevis", prep: "de Saint-Kitts-et-Nevis", cap: "Basseterre", cur: "Dollar des Caraïbes orientales", flag: "🇰🇳" },
  { name: "Sainte-Lucie", ht: "Sent Lisi", prep: "de Sainte-Lucie", cap: "Castries", cur: "Dollar des Caraïbes orientales", flag: "🇱🇨" },
  { name: "Saint-Vincent-et-les-Grenadines", ht: "Sen Vensan ak Grenadines", prep: "de Saint-Vincent-et-les-Grenadines", cap: "Kingstown", cur: "Dollar des Caraïbes orientales", flag: "🇻🇨" },

  /* ═══ AMERICAS — Central ═══ */
  { name: "Mexique", ht: "Meksik", prep: "du Mexique", cap: "Mexico", cur: "Peso mexicain", flag: "🇲🇽" },
  { name: "Guatemala", ht: "Gwatemala", prep: "du Guatemala", cap: "Guatemala", cur: "Quetzal", flag: "🇬🇹" },
  { name: "Honduras", ht: "Ondiras", prep: "du Honduras", cap: "Tegucigalpa", cur: "Lempira", flag: "🇭🇳" },
  { name: "El Salvador", ht: "El Salvadò", prep: "du Salvador", cap: "San Salvador", cur: "Dollar américain", flag: "🇸🇻" },
  { name: "Nicaragua", ht: "Nikaragwa", prep: "du Nicaragua", cap: "Managua", cur: "Córdoba", flag: "🇳🇮" },
  { name: "Costa Rica", ht: "Kosta Rika", prep: "du Costa Rica", cap: "San José", cur: "Colón costaricain", flag: "🇨🇷" },
  { name: "Panama", ht: "Panama", prep: "du Panama", cap: "Panama", cur: "Balboa", flag: "🇵🇦" },
  { name: "Belize", ht: "Beliz", prep: "du Belize", cap: "Belmopan", cur: "Dollar bélizien", flag: "🇧🇿" },

  /* ═══ AMERICAS — South ═══ */
  { name: "Brésil", ht: "Brezil", prep: "du Brésil", cap: "Brasília", cur: "Real brésilien", flag: "🇧🇷" },
  { name: "Argentine", ht: "Ajantin", prep: "de l'Argentine", cap: "Buenos Aires", cur: "Peso argentin", flag: "🇦🇷" },
  { name: "Colombie", ht: "Kolonbi", prep: "de la Colombie", cap: "Bogota", cur: "Peso colombien", flag: "🇨🇴" },
  { name: "Venezuela", ht: "Venezyela", prep: "du Venezuela", cap: "Caracas", cur: "Bolívar", flag: "🇻🇪" },
  { name: "Pérou", ht: "Pewou", prep: "du Pérou", cap: "Lima", cur: "Sol péruvien", flag: "🇵🇪" },
  { name: "Chili", ht: "Chili", prep: "du Chili", cap: "Santiago", cur: "Peso chilien", flag: "🇨🇱" },
  { name: "Équateur", ht: "Ekwatè", prep: "de l'Équateur", cap: "Quito", cur: "Dollar américain", flag: "🇪🇨" },
  { name: "Bolivie", ht: "Bolivi", prep: "de la Bolivie", cap: "Sucre", cur: "Boliviano", flag: "🇧🇴" },
  { name: "Paraguay", ht: "Paragwe", prep: "du Paraguay", cap: "Asunción", cur: "Guarani", flag: "🇵🇾" },
  { name: "Uruguay", ht: "Irigwe", prep: "de l'Uruguay", cap: "Montevideo", cur: "Peso uruguayen", flag: "🇺🇾" },
  { name: "Guyana", ht: "Giyana", prep: "du Guyana", cap: "Georgetown", cur: "Dollar guyanien", flag: "🇬🇾" },
  { name: "Suriname", ht: "Siwinam", prep: "du Suriname", cap: "Paramaribo", cur: "Dollar surinamais", flag: "🇸🇷" },

  /* ═══ AMERICAS — North ═══ */
  { name: "États-Unis", ht: "Etazini", prep: "des États-Unis", cap: "Washington D.C.", cur: "Dollar américain", flag: "🇺🇸" },
  { name: "Canada", ht: "Kanada", prep: "du Canada", cap: "Ottawa", cur: "Dollar canadien", flag: "🇨🇦" },

  /* ═══ EUROPE — Western ═══ */
  { name: "France", ht: "Lafrans", prep: "de la France", cap: "Paris", cur: "Euro", flag: "🇫🇷" },
  { name: "Allemagne", ht: "Almay", prep: "de l'Allemagne", cap: "Berlin", cur: "Euro", flag: "🇩🇪" },
  { name: "Royaume-Uni", ht: "Wayòm Ini", prep: "du Royaume-Uni", cap: "Londres", cur: "Livre sterling", flag: "🇬🇧" },
  { name: "Espagne", ht: "Espay", prep: "de l'Espagne", cap: "Madrid", cur: "Euro", flag: "🇪🇸" },
  { name: "Italie", ht: "Itali", prep: "de l'Italie", cap: "Rome", cur: "Euro", flag: "🇮🇹" },
  { name: "Portugal", ht: "Pòtigal", prep: "du Portugal", cap: "Lisbonne", cur: "Euro", flag: "🇵🇹" },
  { name: "Pays-Bas", ht: "Peyi Ba", prep: "des Pays-Bas", cap: "Amsterdam", cur: "Euro", flag: "🇳🇱" },
  { name: "Belgique", ht: "Bèljik", prep: "de la Belgique", cap: "Bruxelles", cur: "Euro", flag: "🇧🇪" },
  { name: "Suisse", ht: "Swis", prep: "de la Suisse", cap: "Berne", cur: "Franc suisse", flag: "🇨🇭" },
  { name: "Autriche", ht: "Otrich", prep: "de l'Autriche", cap: "Vienne", cur: "Euro", flag: "🇦🇹" },
  { name: "Irlande", ht: "Ilann", prep: "de l'Irlande", cap: "Dublin", cur: "Euro", flag: "🇮🇪" },
  { name: "Luxembourg", ht: "Liksanbou", prep: "du Luxembourg", cap: "Luxembourg", cur: "Euro", flag: "🇱🇺" },
  { name: "Monaco", ht: "Monako", prep: "de Monaco", cap: "Monaco", cur: "Euro", flag: "🇲🇨" },
  { name: "Liechtenstein", ht: "Liechtenstein", prep: "du Liechtenstein", cap: "Vaduz", cur: "Franc suisse", flag: "🇱🇮" },
  { name: "Andorre", ht: "Andò", prep: "de l'Andorre", cap: "Andorre-la-Vieille", cur: "Euro", flag: "🇦🇩" },
  { name: "Saint-Marin", ht: "Sen Maren", prep: "de Saint-Marin", cap: "Saint-Marin", cur: "Euro", flag: "🇸🇲" },
  { name: "Vatican", ht: "Vatikan", prep: "du Vatican", cap: "Cité du Vatican", cur: "Euro", flag: "🇻🇦" },

  /* ═══ EUROPE — Northern ═══ */
  { name: "Norvège", ht: "Nòvèj", prep: "de la Norvège", cap: "Oslo", cur: "Couronne norvégienne", flag: "🇳🇴" },
  { name: "Suède", ht: "Swèd", prep: "de la Suède", cap: "Stockholm", cur: "Couronne suédoise", flag: "🇸🇪" },
  { name: "Danemark", ht: "Danmak", prep: "du Danemark", cap: "Copenhague", cur: "Couronne danoise", flag: "🇩🇰" },
  { name: "Finlande", ht: "Fenlann", prep: "de la Finlande", cap: "Helsinki", cur: "Euro", flag: "🇫🇮" },
  { name: "Islande", ht: "Islann", prep: "de l'Islande", cap: "Reykjavik", cur: "Couronne islandaise", flag: "🇮🇸" },

  /* ═══ EUROPE — Eastern ═══ */
  { name: "Russie", ht: "Larisi", prep: "de la Russie", cap: "Moscou", cur: "Rouble russe", flag: "🇷🇺" },
  { name: "Ukraine", ht: "Ikrèn", prep: "de l'Ukraine", cap: "Kiev", cur: "Hryvnia", flag: "🇺🇦" },
  { name: "Pologne", ht: "Polòy", prep: "de la Pologne", cap: "Varsovie", cur: "Zloty", flag: "🇵🇱" },
  { name: "Tchéquie", ht: "Tcheki", prep: "de la Tchéquie", cap: "Prague", cur: "Couronne tchèque", flag: "🇨🇿" },
  { name: "Roumanie", ht: "Woumani", prep: "de la Roumanie", cap: "Bucarest", cur: "Leu roumain", flag: "🇷🇴" },
  { name: "Hongrie", ht: "Ongri", prep: "de la Hongrie", cap: "Budapest", cur: "Forint", flag: "🇭🇺" },
  { name: "Bulgarie", ht: "Bilgari", prep: "de la Bulgarie", cap: "Sofia", cur: "Lev bulgare", flag: "🇧🇬" },
  { name: "Biélorussie", ht: "Byelorisi", prep: "de la Biélorussie", cap: "Minsk", cur: "Rouble biélorusse", flag: "🇧🇾" },
  { name: "Moldavie", ht: "Moldavi", prep: "de la Moldavie", cap: "Chișinău", cur: "Leu moldave", flag: "🇲🇩" },
  { name: "Slovaquie", ht: "Slovaki", prep: "de la Slovaquie", cap: "Bratislava", cur: "Euro", flag: "🇸🇰" },

  /* ═══ EUROPE — Balkans & SE ═══ */
  { name: "Grèce", ht: "Grès", prep: "de la Grèce", cap: "Athènes", cur: "Euro", flag: "🇬🇷" },
  { name: "Turquie", ht: "Tiki", prep: "de la Turquie", cap: "Ankara", cur: "Lire turque", flag: "🇹🇷" },
  { name: "Croatie", ht: "Kroasi", prep: "de la Croatie", cap: "Zagreb", cur: "Euro", flag: "🇭🇷" },
  { name: "Serbie", ht: "Sèbi", prep: "de la Serbie", cap: "Belgrade", cur: "Dinar serbe", flag: "🇷🇸" },
  { name: "Bosnie-Herzégovine", ht: "Bosni-Èzègovin", prep: "de la Bosnie-Herzégovine", cap: "Sarajevo", cur: "Mark convertible", flag: "🇧🇦" },
  { name: "Monténégro", ht: "Montenegro", prep: "du Monténégro", cap: "Podgorica", cur: "Euro", flag: "🇲🇪" },
  { name: "Macédoine du Nord", ht: "Masedwàn di Nò", prep: "de la Macédoine du Nord", cap: "Skopje", cur: "Denar", flag: "🇲🇰" },
  { name: "Albanie", ht: "Albani", prep: "de l'Albanie", cap: "Tirana", cur: "Lek", flag: "🇦🇱" },
  { name: "Kosovo", ht: "Kosovo", prep: "du Kosovo", cap: "Pristina", cur: "Euro", flag: "🇽🇰" },
  { name: "Slovénie", ht: "Sloveni", prep: "de la Slovénie", cap: "Ljubljana", cur: "Euro", flag: "🇸🇮" },
  { name: "Chypre", ht: "Chip", prep: "de Chypre", cap: "Nicosie", cur: "Euro", flag: "🇨🇾" },
  { name: "Malte", ht: "Malt", prep: "de Malte", cap: "La Valette", cur: "Euro", flag: "🇲🇹" },

  /* ═══ EUROPE — Baltic ═══ */
  { name: "Estonie", ht: "Estoni", prep: "de l'Estonie", cap: "Tallinn", cur: "Euro", flag: "🇪🇪" },
  { name: "Lettonie", ht: "Letoni", prep: "de la Lettonie", cap: "Riga", cur: "Euro", flag: "🇱🇻" },
  { name: "Lituanie", ht: "Litwani", prep: "de la Lituanie", cap: "Vilnius", cur: "Euro", flag: "🇱🇹" },

  /* ═══ AFRICA — West ═══ */
  { name: "Sénégal", ht: "Senegal", prep: "du Sénégal", cap: "Dakar", cur: "Franc CFA (BCEAO)", flag: "🇸🇳" },
  { name: "Côte d'Ivoire", ht: "Kot Divwa", prep: "de la Côte d'Ivoire", cap: "Yamoussoukro", cur: "Franc CFA (BCEAO)", flag: "🇨🇮" },
  { name: "Nigéria", ht: "Nijerya", prep: "du Nigéria", cap: "Abuja", cur: "Naira", flag: "🇳🇬" },
  { name: "Ghana", ht: "Gana", prep: "du Ghana", cap: "Accra", cur: "Cedi", flag: "🇬🇭" },
  { name: "Mali", ht: "Mali", prep: "du Mali", cap: "Bamako", cur: "Franc CFA (BCEAO)", flag: "🇲🇱" },
  { name: "Burkina Faso", ht: "Boukinafaso", prep: "du Burkina Faso", cap: "Ouagadougou", cur: "Franc CFA (BCEAO)", flag: "🇧🇫" },
  { name: "Niger", ht: "Nijè", prep: "du Niger", cap: "Niamey", cur: "Franc CFA (BCEAO)", flag: "🇳🇪" },
  { name: "Guinée", ht: "Gine", prep: "de la Guinée", cap: "Conakry", cur: "Franc guinéen", flag: "🇬🇳" },
  { name: "Bénin", ht: "Benen", prep: "du Bénin", cap: "Porto-Novo", cur: "Franc CFA (BCEAO)", flag: "🇧🇯" },
  { name: "Togo", ht: "Togo", prep: "du Togo", cap: "Lomé", cur: "Franc CFA (BCEAO)", flag: "🇹🇬" },
  { name: "Sierra Leone", ht: "Syera Leòn", prep: "de la Sierra Leone", cap: "Freetown", cur: "Leone", flag: "🇸🇱" },
  { name: "Libéria", ht: "Liberya", prep: "du Libéria", cap: "Monrovia", cur: "Dollar libérien", flag: "🇱🇷" },
  { name: "Gambie", ht: "Ganbi", prep: "de la Gambie", cap: "Banjul", cur: "Dalasi", flag: "🇬🇲" },
  { name: "Guinée-Bissau", ht: "Gine-Bisao", prep: "de la Guinée-Bissau", cap: "Bissau", cur: "Franc CFA (BCEAO)", flag: "🇬🇼" },
  { name: "Cap-Vert", ht: "Kap Vè", prep: "du Cap-Vert", cap: "Praia", cur: "Escudo cap-verdien", flag: "🇨🇻" },
  { name: "Mauritanie", ht: "Moritani", prep: "de la Mauritanie", cap: "Nouakchott", cur: "Ouguiya", flag: "🇲🇷" },

  /* ═══ AFRICA — Central ═══ */
  { name: "Cameroun", ht: "Kamewoun", prep: "du Cameroun", cap: "Yaoundé", cur: "Franc CFA (BEAC)", flag: "🇨🇲" },
  { name: "Rép. dém. du Congo", ht: "Repiblik Demokratik Kongo", prep: "de la Rép. dém. du Congo", cap: "Kinshasa", cur: "Franc congolais", flag: "🇨🇩" },
  { name: "République du Congo", ht: "Repiblik Kongo", prep: "de la République du Congo", cap: "Brazzaville", cur: "Franc CFA (BEAC)", flag: "🇨🇬" },
  { name: "Gabon", ht: "Gabon", prep: "du Gabon", cap: "Libreville", cur: "Franc CFA (BEAC)", flag: "🇬🇦" },
  { name: "Guinée équatoriale", ht: "Gine Ekwatoryal", prep: "de la Guinée équatoriale", cap: "Malabo", cur: "Franc CFA (BEAC)", flag: "🇬🇶" },
  { name: "Rép. centrafricaine", ht: "Repiblik Santafrikèn", prep: "de la Rép. centrafricaine", cap: "Bangui", cur: "Franc CFA (BEAC)", flag: "🇨🇫" },
  { name: "Tchad", ht: "Tchad", prep: "du Tchad", cap: "N'Djamena", cur: "Franc CFA (BEAC)", flag: "🇹🇩" },
  { name: "São Tomé-et-Príncipe", ht: "Sao Tome e Prensip", prep: "de São Tomé-et-Príncipe", cap: "São Tomé", cur: "Dobra", flag: "🇸🇹" },

  /* ═══ AFRICA — East ═══ */
  { name: "Éthiopie", ht: "Etyopi", prep: "de l'Éthiopie", cap: "Addis-Abeba", cur: "Birr", flag: "🇪🇹" },
  { name: "Kenya", ht: "Kenya", prep: "du Kenya", cap: "Nairobi", cur: "Shilling kényan", flag: "🇰🇪" },
  { name: "Tanzanie", ht: "Tanzani", prep: "de la Tanzanie", cap: "Dodoma", cur: "Shilling tanzanien", flag: "🇹🇿" },
  { name: "Ouganda", ht: "Ouganda", prep: "de l'Ouganda", cap: "Kampala", cur: "Shilling ougandais", flag: "🇺🇬" },
  { name: "Rwanda", ht: "Rwanda", prep: "du Rwanda", cap: "Kigali", cur: "Franc rwandais", flag: "🇷🇼" },
  { name: "Burundi", ht: "Burundi", prep: "du Burundi", cap: "Gitega", cur: "Franc burundais", flag: "🇧🇮" },
  { name: "Somalie", ht: "Somali", prep: "de la Somalie", cap: "Mogadiscio", cur: "Shilling somalien", flag: "🇸🇴" },
  { name: "Djibouti", ht: "Djibouti", prep: "de Djibouti", cap: "Djibouti", cur: "Franc djiboutien", flag: "🇩🇯" },
  { name: "Érythrée", ht: "Eritre", prep: "de l'Érythrée", cap: "Asmara", cur: "Nakfa", flag: "🇪🇷" },
  { name: "Soudan du Sud", ht: "Soudan di Sid", prep: "du Soudan du Sud", cap: "Djouba", cur: "Livre sud-soudanaise", flag: "🇸🇸" },
  { name: "Soudan", ht: "Soudan", prep: "du Soudan", cap: "Khartoum", cur: "Livre soudanaise", flag: "🇸🇩" },

  /* ═══ AFRICA — Southern ═══ */
  { name: "Afrique du Sud", ht: "Afrik di Sid", prep: "de l'Afrique du Sud", cap: "Pretoria", cur: "Rand", flag: "🇿🇦" },
  { name: "Angola", ht: "Angola", prep: "de l'Angola", cap: "Luanda", cur: "Kwanza", flag: "🇦🇴" },
  { name: "Mozambique", ht: "Mozanbik", prep: "du Mozambique", cap: "Maputo", cur: "Metical", flag: "🇲🇿" },
  { name: "Madagascar", ht: "Madagaska", prep: "de Madagascar", cap: "Antananarivo", cur: "Ariary", flag: "🇲🇬" },
  { name: "Zambie", ht: "Zanbi", prep: "de la Zambie", cap: "Lusaka", cur: "Kwacha zambien", flag: "🇿🇲" },
  { name: "Zimbabwe", ht: "Zimbabwe", prep: "du Zimbabwe", cap: "Harare", cur: "Dollar zimbabwéen", flag: "🇿🇼" },
  { name: "Malawi", ht: "Malawi", prep: "du Malawi", cap: "Lilongwe", cur: "Kwacha malawien", flag: "🇲🇼" },
  { name: "Botswana", ht: "Botswana", prep: "du Botswana", cap: "Gaborone", cur: "Pula", flag: "🇧🇼" },
  { name: "Namibie", ht: "Namibi", prep: "de la Namibie", cap: "Windhoek", cur: "Dollar namibien", flag: "🇳🇦" },
  { name: "Lesotho", ht: "Lezoto", prep: "du Lesotho", cap: "Maseru", cur: "Loti", flag: "🇱🇸" },
  { name: "Eswatini", ht: "Eswatini", prep: "de l'Eswatini", cap: "Mbabane", cur: "Lilangeni", flag: "🇸🇿" },
  { name: "Comores", ht: "Komò", prep: "des Comores", cap: "Moroni", cur: "Franc comorien", flag: "🇰🇲" },
  { name: "Maurice", ht: "Moris", prep: "de Maurice", cap: "Port-Louis", cur: "Roupie mauricienne", flag: "🇲🇺" },
  { name: "Seychelles", ht: "Sechèl", prep: "des Seychelles", cap: "Victoria", cur: "Roupie seychelloise", flag: "🇸🇨" },

  /* ═══ AFRICA — North ═══ */
  { name: "Égypte", ht: "Lejip", prep: "de l'Égypte", cap: "Le Caire", cur: "Livre égyptienne", flag: "🇪🇬" },
  { name: "Maroc", ht: "Mawòk", prep: "du Maroc", cap: "Rabat", cur: "Dirham marocain", flag: "🇲🇦" },
  { name: "Algérie", ht: "Aljeri", prep: "de l'Algérie", cap: "Alger", cur: "Dinar algérien", flag: "🇩🇿" },
  { name: "Tunisie", ht: "Tinizi", prep: "de la Tunisie", cap: "Tunis", cur: "Dinar tunisien", flag: "🇹🇳" },
  { name: "Libye", ht: "Libi", prep: "de la Libye", cap: "Tripoli", cur: "Dinar libyen", flag: "🇱🇾" },

  /* ═══ ASIA — East ═══ */
  { name: "Chine", ht: "Lachin", prep: "de la Chine", cap: "Pékin", cur: "Yuan (Renminbi)", flag: "🇨🇳" },
  { name: "Japon", ht: "Japon", prep: "du Japon", cap: "Tokyo", cur: "Yen", flag: "🇯🇵" },
  { name: "Corée du Sud", ht: "Kore di Sid", prep: "de la Corée du Sud", cap: "Séoul", cur: "Won sud-coréen", flag: "🇰🇷" },
  { name: "Corée du Nord", ht: "Kore di Nò", prep: "de la Corée du Nord", cap: "Pyongyang", cur: "Won nord-coréen", flag: "🇰🇵" },
  { name: "Mongolie", ht: "Mongoli", prep: "de la Mongolie", cap: "Oulan-Bator", cur: "Tugrik", flag: "🇲🇳" },

  /* ═══ ASIA — Southeast ═══ */
  { name: "Indonésie", ht: "Endonezi", prep: "de l'Indonésie", cap: "Jakarta", cur: "Roupie indonésienne", flag: "🇮🇩" },
  { name: "Philippines", ht: "Filipin", prep: "des Philippines", cap: "Manille", cur: "Peso philippin", flag: "🇵🇭" },
  { name: "Viêt Nam", ht: "Vyètnam", prep: "du Viêt Nam", cap: "Hanoï", cur: "Dong", flag: "🇻🇳" },
  { name: "Thaïlande", ht: "Taylann", prep: "de la Thaïlande", cap: "Bangkok", cur: "Baht", flag: "🇹🇭" },
  { name: "Myanmar", ht: "Myanmar", prep: "du Myanmar", cap: "Naypyidaw", cur: "Kyat", flag: "🇲🇲" },
  { name: "Malaisie", ht: "Malezi", prep: "de la Malaisie", cap: "Kuala Lumpur", cur: "Ringgit", flag: "🇲🇾" },
  { name: "Singapour", ht: "Sengapou", prep: "de Singapour", cap: "Singapour", cur: "Dollar de Singapour", flag: "🇸🇬" },
  { name: "Cambodge", ht: "Kanbòdj", prep: "du Cambodge", cap: "Phnom Penh", cur: "Riel", flag: "🇰🇭" },
  { name: "Laos", ht: "Laos", prep: "du Laos", cap: "Vientiane", cur: "Kip", flag: "🇱🇦" },
  { name: "Brunei", ht: "Bruney", prep: "du Brunei", cap: "Bandar Seri Begawan", cur: "Dollar de Brunei", flag: "🇧🇳" },
  { name: "Timor oriental", ht: "Timò Lès", prep: "du Timor oriental", cap: "Dili", cur: "Dollar américain", flag: "🇹🇱" },

  /* ═══ ASIA — South ═══ */
  { name: "Inde", ht: "End", prep: "de l'Inde", cap: "New Delhi", cur: "Roupie indienne", flag: "🇮🇳" },
  { name: "Pakistan", ht: "Pakistan", prep: "du Pakistan", cap: "Islamabad", cur: "Roupie pakistanaise", flag: "🇵🇰" },
  { name: "Bangladesh", ht: "Bangladesh", prep: "du Bangladesh", cap: "Dacca", cur: "Taka", flag: "🇧🇩" },
  { name: "Sri Lanka", ht: "Sri Lanka", prep: "du Sri Lanka", cap: "Sri Jayawardenepura Kotte", cur: "Roupie sri-lankaise", flag: "🇱🇰" },
  { name: "Népal", ht: "Nepal", prep: "du Népal", cap: "Katmandou", cur: "Roupie népalaise", flag: "🇳🇵" },
  { name: "Bhoutan", ht: "Boutan", prep: "du Bhoutan", cap: "Thimphou", cur: "Ngultrum", flag: "🇧🇹" },
  { name: "Maldives", ht: "Maldiv", prep: "des Maldives", cap: "Malé", cur: "Rufiyaa", flag: "🇲🇻" },
  { name: "Afghanistan", ht: "Afganistan", prep: "de l'Afghanistan", cap: "Kaboul", cur: "Afghani", flag: "🇦🇫" },

  /* ═══ ASIA — Central ═══ */
  { name: "Kazakhstan", ht: "Kazakstan", prep: "du Kazakhstan", cap: "Astana", cur: "Tenge", flag: "🇰🇿" },
  { name: "Ouzbékistan", ht: "Ouzbekistan", prep: "de l'Ouzbékistan", cap: "Tachkent", cur: "Sum", flag: "🇺🇿" },
  { name: "Turkménistan", ht: "Tèkmenistan", prep: "du Turkménistan", cap: "Achgabat", cur: "Manat turkmène", flag: "🇹🇲" },
  { name: "Tadjikistan", ht: "Tadjikistan", prep: "du Tadjikistan", cap: "Douchanbé", cur: "Somoni", flag: "🇹🇯" },
  { name: "Kirghizistan", ht: "Kirgizistan", prep: "du Kirghizistan", cap: "Bichkek", cur: "Som kirghize", flag: "🇰🇬" },

  /* ═══ ASIA — West / Middle East ═══ */
  { name: "Arabie saoudite", ht: "Arabi Sayodit", prep: "de l'Arabie saoudite", cap: "Riyad", cur: "Riyal saoudien", flag: "🇸🇦" },
  { name: "Iran", ht: "Iran", prep: "de l'Iran", cap: "Téhéran", cur: "Rial iranien", flag: "🇮🇷" },
  { name: "Irak", ht: "Irak", prep: "de l'Irak", cap: "Bagdad", cur: "Dinar irakien", flag: "🇮🇶" },
  { name: "Israël", ht: "Izrayèl", prep: "d'Israël", cap: "Jérusalem", cur: "Shekel", flag: "🇮🇱" },
  { name: "Émirats arabes unis", ht: "Emira Arab Ini", prep: "des Émirats arabes unis", cap: "Abou Dabi", cur: "Dirham émirati", flag: "🇦🇪" },
  { name: "Jordanie", ht: "Jòdani", prep: "de la Jordanie", cap: "Amman", cur: "Dinar jordanien", flag: "🇯🇴" },
  { name: "Liban", ht: "Liban", prep: "du Liban", cap: "Beyrouth", cur: "Livre libanaise", flag: "🇱🇧" },
  { name: "Syrie", ht: "Siri", prep: "de la Syrie", cap: "Damas", cur: "Livre syrienne", flag: "🇸🇾" },
  { name: "Yémen", ht: "Yemen", prep: "du Yémen", cap: "Sanaa", cur: "Rial yéménite", flag: "🇾🇪" },
  { name: "Oman", ht: "Oman", prep: "d'Oman", cap: "Mascate", cur: "Rial omanais", flag: "🇴🇲" },
  { name: "Qatar", ht: "Kata", prep: "du Qatar", cap: "Doha", cur: "Riyal qatari", flag: "🇶🇦" },
  { name: "Koweït", ht: "Kowet", prep: "du Koweït", cap: "Koweït", cur: "Dinar koweïtien", flag: "🇰🇼" },
  { name: "Bahreïn", ht: "Barayn", prep: "du Bahreïn", cap: "Manama", cur: "Dinar bahreïni", flag: "🇧🇭" },
  { name: "Palestine", ht: "Palestin", prep: "de la Palestine", cap: "Ramallah", cur: "Shekel", flag: "🇵🇸" },

  /* ═══ ASIA — Caucasus ═══ */
  { name: "Géorgie", ht: "Jeoji", prep: "de la Géorgie", cap: "Tbilissi", cur: "Lari", flag: "🇬🇪" },
  { name: "Arménie", ht: "Ameni", prep: "de l'Arménie", cap: "Erevan", cur: "Dram", flag: "🇦🇲" },
  { name: "Azerbaïdjan", ht: "Azèbayidjan", prep: "de l'Azerbaïdjan", cap: "Bakou", cur: "Manat azerbaïdjanais", flag: "🇦🇿" },

  /* ═══ OCEANIA ═══ */
  { name: "Australie", ht: "Ostrali", prep: "de l'Australie", cap: "Canberra", cur: "Dollar australien", flag: "🇦🇺" },
  { name: "Nouvelle-Zélande", ht: "Nouvèl Zelann", prep: "de la Nouvelle-Zélande", cap: "Wellington", cur: "Dollar néo-zélandais", flag: "🇳🇿" },
  { name: "Fidji", ht: "Fidji", prep: "des Fidji", cap: "Suva", cur: "Dollar fidjien", flag: "🇫🇯" },
  { name: "Papouasie-Nouvelle-Guinée", ht: "Papwazi Nouvèl Gine", prep: "de la Papouasie-Nouvelle-Guinée", cap: "Port Moresby", cur: "Kina", flag: "🇵🇬" },
  { name: "Samoa", ht: "Samoa", prep: "du Samoa", cap: "Apia", cur: "Tala", flag: "🇼🇸" },
  { name: "Tonga", ht: "Tonga", prep: "des Tonga", cap: "Nuku'alofa", cur: "Pa'anga", flag: "🇹🇴" },
  { name: "Vanuatu", ht: "Vanwatu", prep: "du Vanuatu", cap: "Port-Vila", cur: "Vatu", flag: "🇻🇺" },
  { name: "Îles Salomon", ht: "Zil Salomon", prep: "des Îles Salomon", cap: "Honiara", cur: "Dollar des Îles Salomon", flag: "🇸🇧" },
  { name: "Kiribati", ht: "Kiribati", prep: "de Kiribati", cap: "Tarawa-Sud", cur: "Dollar australien", flag: "🇰🇮" },
  { name: "Îles Marshall", ht: "Zil Machal", prep: "des Îles Marshall", cap: "Majuro", cur: "Dollar américain", flag: "🇲🇭" },
  { name: "Micronésie", ht: "Mikwonezi", prep: "de la Micronésie", cap: "Palikir", cur: "Dollar américain", flag: "🇫🇲" },
  { name: "Palaos", ht: "Palao", prep: "des Palaos", cap: "Ngerulmud", cur: "Dollar américain", flag: "🇵🇼" },
  { name: "Nauru", ht: "Nauru", prep: "de Nauru", cap: "Yaren", cur: "Dollar australien", flag: "🇳🇷" },
  { name: "Tuvalu", ht: "Tuvalu", prep: "de Tuvalu", cap: "Funafuti", cur: "Dollar australien", flag: "🇹🇻" },
];

/* ─── Question generation helpers ───────────────────────────────────────── */

/** Fisher-Yates shuffle (non-mutating). */
function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick `n` unique distractors from `pool`, excluding `correct`. */
function pickDistractors(correct, pool, n = 3) {
  const others = pool.filter((v) => v !== correct);
  return shuffleArr(others).slice(0, n);
}

/** Place correct answer randomly among distractors and return { options, answer }. */
function buildOptions(correct, distractors) {
  const idx = Math.floor(Math.random() * (distractors.length + 1));
  const options = [...distractors];
  options.splice(idx, 0, correct);
  return { options, answer: idx };
}

/* — Generators — */

function buildCapitalQs(data) {
  const allCaps = data.map((c) => c.cap);
  return data.map((c) => {
    const distractors = pickDistractors(c.cap, allCaps);
    const { options, answer } = buildOptions(c.cap, distractors);
    return {
      q: `Quelle est la capitale ${c.prep} ?`,
      qHt: `Ki kapital ${c.ht} ?`,
      options,
      answer,
    };
  });
}

function buildCurrencyQs(data) {
  // Use unique currency names so distractors are always distinct from the correct answer.
  const uniqueCurs = [...new Set(data.map((c) => c.cur))];
  return data.map((c) => {
    const distractors = pickDistractors(c.cur, uniqueCurs);
    const { options, answer } = buildOptions(c.cur, distractors);
    return {
      q: `Quelle est la monnaie ${c.prep} ?`,
      qHt: `Ki lajan ${c.ht} ?`,
      options,
      answer,
    };
  });
}

function buildFlagQs(data) {
  const allNames = data.map((c) => c.name);
  return data
    .filter((c) => c.flag) // keep only entries with a flag emoji
    .map((c) => {
      const distractors = pickDistractors(c.name, allNames);
      const { options, answer } = buildOptions(c.name, distractors);
      return {
        q: `De quel pays est ce drapeau : ${c.flag} ?`,
        qHt: `Ki peyi ki gen drapo sa a : ${c.flag} ?`,
        options,
        answer,
      };
    });
}

/* ─── Exported questions (generated once per page load) ─────────────────── */

export const TRIVIA_QUESTIONS = {
  capitals: buildCapitalQs(COUNTRIES),
  currencies: buildCurrencyQs(COUNTRIES),
  flags: buildFlagQs(COUNTRIES),
};
