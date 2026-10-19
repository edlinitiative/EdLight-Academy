/**
 * Competition feature switches — the runtime contract shared by the server
 * (api/_lib/platformConfig.ts) and the admin console page that edits them.
 *
 * Source of truth, per flag: the `platformConfig/competition` Firestore doc
 * when it holds a boolean for that flag, otherwise the Vercel env default.
 * Team modes are effective only while creation is effective too.
 */
export const COMPETITION_FLAG_KEYS = [
  'creationEnabled',
  'discoveryEnabled',
  'teamModesEnabled',
] as const;
export type CompetitionFlagKey = (typeof COMPETITION_FLAG_KEYS)[number];

export type CompetitionFlags = Record<CompetitionFlagKey, boolean>;

/** The stored doc. A missing flag means "use the server default". */
export interface CompetitionConfigDoc {
  creationEnabled?: boolean;
  discoveryEnabled?: boolean;
  teamModesEnabled?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export type FlagSource = 'config' | 'env';

export interface CompetitionFlagsState {
  /** What the server enforces right now. */
  effective: CompetitionFlags;
  /** Each flag's own value (stored or default), before the team-modes dependency. */
  own: CompetitionFlags;
  /** Where each flag's own value came from (before the team-modes dependency). */
  source: Record<CompetitionFlagKey, FlagSource>;
  /** The env defaults, so the console can say what "reset" would mean. */
  defaults: CompetitionFlags;
  updatedAt: number | null;
  updatedBy: string | null;
}

/** Env defaults — the exact semantics the env-only switches always had. */
export function envFlagDefaults(
  env: Record<string, string | undefined>,
): CompetitionFlags {
  return {
    // Off unless explicitly 'true'.
    creationEnabled: env.COMPETITION_CREATION_ENABLED === 'true',
    // On unless explicitly 'false'.
    discoveryEnabled: env.COMPETITION_DISCOVERY_ENABLED !== 'false',
    teamModesEnabled: env.COMPETITION_TEAM_MODES_ENABLED === 'true',
  };
}

export function resolveCompetitionFlags(
  stored: CompetitionConfigDoc | null | undefined,
  env: Record<string, string | undefined>,
): CompetitionFlagsState {
  const defaults = envFlagDefaults(env);
  const own = {} as CompetitionFlags;
  const source = {} as Record<CompetitionFlagKey, FlagSource>;
  for (const key of COMPETITION_FLAG_KEYS) {
    const value = stored?.[key];
    if (typeof value === 'boolean') {
      own[key] = value;
      source[key] = 'config';
    } else {
      own[key] = defaults[key];
      source[key] = 'env';
    }
  }
  return {
    effective: {
      ...own,
      // Slice E modes are an extension of creation: never on without it.
      teamModesEnabled: own.creationEnabled && own.teamModesEnabled,
    },
    own,
    source,
    defaults,
    updatedAt: typeof stored?.updatedAt === 'number' ? stored.updatedAt : null,
    updatedBy: typeof stored?.updatedBy === 'string' ? stored.updatedBy : null,
  };
}

export interface CompetitionFlagAudit {
  id: string;
  flag: CompetitionFlagKey;
  /** null = the server default applied before / applies after. */
  from: boolean | null;
  to: boolean | null;
  by: string;
  at: number;
}
