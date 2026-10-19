/**
 * What a competition record shows after its person deleted their account.
 *
 * Kept records (locked rosters, results, audit, standings) are pseudonymized:
 * names become DELETED_ACCOUNT_NAME and uids become a `deleted_<16 hex>`
 * tombstone (see api/_lib/competitionAccountDeletion.ts). The stored name
 * follows the existing stored "FR / HT" convention (e.g. "Suivi / Swivi"), so
 * any screen that prints it raw is still bilingual; renderers that split by
 * language use identityText().
 */
export const DELETED_ACCOUNT_NAME = 'Compte supprimé / Kont efase';
export const DELETED_ACCOUNT_COPY: [string, string] = [
  'Compte supprimé',
  'Kont efase',
];
const TOMBSTONE = /^deleted_[0-9a-f]{16}$/;

export function isDeletedAccount(value: unknown): boolean {
  return (
    value === DELETED_ACCOUNT_NAME ||
    (typeof value === 'string' && TOMBSTONE.test(value))
  );
}

/** A public name or uid for display: the deleted-account copy in the requested language (0 = fr, 1 = ht). */
export function identityText(value: unknown, lang: 0 | 1): string {
  return isDeletedAccount(value)
    ? DELETED_ACCOUNT_COPY[lang]
    : String(value ?? '');
}
