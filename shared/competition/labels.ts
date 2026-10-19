/**
 * French / Haitian Kreyòl labels for every competition enum shown on screen.
 *
 * One place, used by the shared workspace builder, the web pages and the Expo
 * screens, so a raw state ("published", "no_contest"…) never reaches a
 * student. Kreyòl terms follow the fixed glossary in src/utils/i18n.ts
 * (anile, fini, an kou, pwen, eseye ankò…).
 */
export type Copy = [string, string];

const UNKNOWN: Copy = ["—", "—"];

/** Label for `value` in `map`; an unexpected value renders as a dash, never raw. */
export function enumLabel(map: Record<string, Copy>, value: unknown): Copy {
  return (typeof value === "string" && map[value]) || UNKNOWN;
}

export const EVENT_STATE: Record<string, Copy> = {
  draft: ["Brouillon", "Bouyon"],
  published: ["Publié", "Pibliye"],
  closed: ["Clôturé", "Fèmen"],
  cancelled: ["Annulé", "Anile"],
};

export const EVENT_AUDIENCE: Record<string, Copy> = {
  public: ["Public", "Piblik"],
  school: ["École approuvée", "Lekòl ki apwouve"],
  private: ["Participants et organisateurs", "Patisipan ak òganizatè"],
};

/** Tournament / event play format (config.format and directory summaries). */
export const PLAY_FORMAT: Record<string, Copy> = {
  live: ["En direct", "An dirèk"],
  window: ["Fenêtre de jeu", "Fenèt jwèt"],
  rounds: ["Manches", "Manch"],
  bracket: ["Élimination directe", "Eliminasyon dirèk"],
};

export const ENTRY_MODE: Record<string, Copy> = {
  individual: ["Individuel", "Endividyèl"],
  named_team: ["Équipes de trois", "Ekip twa moun"],
  school_group: ["Par école", "Pa lekòl"],
  grade_group: ["Par classe", "Pa klas"],
};

export const HOST_KIND: Record<string, Copy> = {
  school: ["Organisateur scolaire approuvé", "Òganizatè lekòl ki apwouve"],
  student: ["Organisé par des élèves", "Se elèv ki òganize l"],
};

export const ENTRY_STATE: Record<string, Copy> = {
  draft: ["Composition en préparation", "Konpozisyon an ap prepare"],
  registered: ["Inscrite", "Enskri"],
  withdrawn: ["Retirée", "Retire"],
};

export const MEMBERSHIP_STATUS: Record<string, Copy> = {
  pending: ["En attente de vérification", "Ap tann verifikasyon"],
  approved: ["Approuvée", "Apwouve"],
  revoked: ["Révoquée", "Revoke"],
};

export const INVITE_STATUS: Record<string, Copy> = {
  pending: ["En attente de réponse", "Ap tann repons"],
  accepted: ["Acceptée", "Aksepte"],
  declined: ["Déclinée", "Refize"],
  revoked: ["Retirée par le capitaine", "Kapitèn nan retire l"],
  expired: ["Expirée", "Ekspire"],
};

export const REPORT_KIND: Record<string, Copy> = {
  team: ["Équipe", "Ekip"],
  event: ["Événement", "Evènman"],
  league: ["Saison", "Sezon"],
};

export const REWARD_STATUS: Record<string, Copy> = {
  eligible: ["Éligible", "Kalifye"],
  fulfillment_pending: ["Remise en attente", "Livrezon ap tann"],
  fulfilled: ["Remis", "Livre"],
  disputed: ["Contesté", "Konteste"],
};

export const DISPUTE_STATE: Record<string, Copy> = {
  open: ["Ouverte", "Louvri"],
  resolved: ["Résolue", "Rezoud"],
};

export const RESULT_STATUS: Record<string, Copy> = {
  pending: ["En attente", "Ap tann"],
  reported: ["Déclaré, à confirmer", "Deklare, pou konfime"],
  disputed: ["Contesté", "Konteste"],
  confirmed: ["Confirmé", "Konfime"],
  no_contest: ["Sans résultat sportif", "San rezilta espòtif"],
};

export const LEAGUE_STATE: Record<string, Copy> = {
  draft: ["En préparation", "Ap prepare"],
  active: ["En cours", "An kou"],
  closed: ["Clôturée", "Fèmen"],
};

export const FIXTURE_STATUS: Record<string, Copy> = {
  scheduled: ["Programmée", "Pwograme"],
  postponed: ["Reportée", "Ranvwaye"],
  disputed: ["Contestée", "Konteste"],
  final: ["Résultat final", "Rezilta final"],
  no_contest: ["Sans résultat", "San rezilta"],
};

export const TOURNAMENT_STATE: Record<string, Copy> = {
  scheduled: ["Programmé", "Pwograme"],
  running: ["En cours", "An kou"],
  finished: ["Terminé", "Fini"],
  cancelled: ["Annulé", "Anile"],
};

/** Every map, for tests that check Kreyòl is never a copy of the French. */
export const ALL_LABEL_MAPS: Record<string, Record<string, Copy>> = {
  EVENT_STATE,
  EVENT_AUDIENCE,
  PLAY_FORMAT,
  ENTRY_MODE,
  HOST_KIND,
  ENTRY_STATE,
  MEMBERSHIP_STATUS,
  INVITE_STATUS,
  REPORT_KIND,
  REWARD_STATUS,
  DISPUTE_STATE,
  RESULT_STATUS,
  LEAGUE_STATE,
  FIXTURE_STATUS,
  TOURNAMENT_STATE,
};

/** Points abbreviation (glossary: common.pointsShort). */
export const POINTS: Copy = ["pts", "pwen"];

const FR_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const HT_MONTHS = [
  "janvye",
  "fevriye",
  "mas",
  "avril",
  "me",
  "jen",
  "jiyè",
  "out",
  "septanm",
  "oktòb",
  "novanm",
  "desanm",
];

/**
 * A date and time in Haiti's time zone, written for each language:
 * "12 octobre 2026 à 14 h 30 (heure d’Haïti)" / "12 oktòb 2026 a 14:30 (lè Ayiti)".
 */
export function haitiDate(ms: number): Copy {
  if (!Number.isFinite(ms)) return UNKNOWN;
  try {
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("fr-FR", {
      timeZone: "America/Port-au-Prince",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms)))
      parts[p.type] = p.value;
    const m = Number(parts.month) - 1;
    if (!(m >= 0 && m < 12)) throw new Error("parts");
    return [
      `${parts.day} ${FR_MONTHS[m]} ${parts.year} à ${parts.hour} h ${parts.minute} (heure d’Haïti)`,
      `${parts.day} ${HT_MONTHS[m]} ${parts.year} a ${parts.hour}:${parts.minute} (lè Ayiti)`,
    ];
  } catch {
    // Engines without time-zone data: device-local time, still labelled per language.
    const d = new Date(ms);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return [
      `${d.getDate()} ${FR_MONTHS[d.getMonth()]} ${d.getFullYear()} à ${hm}`,
      `${d.getDate()} ${HT_MONTHS[d.getMonth()]} ${d.getFullYear()} a ${hm}`,
    ];
  }
}

/** "K7Q2M9XD" → "K7Q2-M9XD" for reading aloud and copying. */
export function formatInviteCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}
