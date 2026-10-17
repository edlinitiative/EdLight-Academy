/**
 * The Arène's trust and connection kit (roadmap #20): what the connection is
 * doing, what happened to an answer, the rules, and how to report a problem.
 * Presentation only — every state is derived from signals the client already
 * has; nothing here scores, decides or writes.
 */
export { default as ConnectionPill } from './ConnectionPill';
export { default as AnswerReceipt } from './AnswerReceipt';
export { default as RulesButton, RulesSheet } from './RulesSheet';
export { default as ReportProblem, reportMailto, type ReportContext } from './ReportProblem';
export { default as ResultStatus } from './ResultStatus';
export { useDuelSubmission, DuelSubmitStatus, DuelTrustNote, DuelMintReceipt, expiryLine, type DuelAcceptResult } from './DuelTrust';
export { useOnline, useOnReconnect } from './useOnline';
export * from './trustState';
export { ARENA_RULES, DUEL_RULES, SUPPORT_EMAIL } from './rulesFacts';
