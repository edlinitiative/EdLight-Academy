/**
 * Shared pieces of the Tournois pages: language, the server clock, the lazy
 * ticker, the room header, the podium, the boards and the bracket.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Share2 } from '../../components/icons';
import useStore from '../../contexts/store';
import { formatPin } from '../../../shared/tournois/config';
import type { RowMove } from '../../../shared/competition/presentation';
import { identityText } from '../../../shared/competition/deletedAccount';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import { useReducedMotion } from '../../arena-art/motion/tokens';
import { useFlipList } from '../../arena-art/motion/useFlipList';
import { useBoardMoves } from '../../arena-art/motion/useBoardMoves';
import '../../arena-art/motion/competition.css';
import type { Match } from '../../../shared/tournois/bracket';
import {
  shareUrl,
  tick,
  type StandingRow,
  type TeamRow,
  type Tournament,
} from '../../services/tournoisService';

export function useLang() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return { isCreole, t };
}

/** A public name in one language (deleted accounts carry a bilingual sentinel). */
function useShownName() {
  const { isCreole } = useLang();
  return (name: string) => identityText(name, isCreole ? 1 : 0);
}

/**
 * `now` on the SERVER's clock, re-rendering every `everyMs`. The offset is
 * learned from tick responses, so a phone whose clock is two minutes off still
 * shows the room's real countdown.
 */
export function useServerNow(offsetMs: number, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), everyMs);
    setNow(Date.now() + offsetMs);
    return () => window.clearInterval(id);
  }, [offsetMs, everyMs]);
  return now;
}

/**
 * Keep a tournament on time from the page: tick once on open when a deadline
 * has already passed, then again whenever the next deadline arrives. A small
 * random jitter spreads a full classroom's ticks — only the first does work,
 * the rest find nothing to do.
 */
export function useLazyTicker(tid: string | undefined, deadlines: Array<number | null | undefined>, onClock: (offset: number) => void) {
  const key = deadlines.map((d) => d || 0).join(',');
  const onClockRef = useRef(onClock);
  onClockRef.current = onClock;
  useEffect(() => {
    if (!tid) return undefined;
    let cancelled = false;
    const run = async () => {
      const t0 = Date.now();
      const serverNow = await tick(tid);
      if (!cancelled && serverNow) onClockRef.current(serverNow - Math.round((t0 + Date.now()) / 2));
    };
    const upcoming = deadlines.filter((d): d is number => typeof d === 'number' && d > 0);
    const next = upcoming.length ? Math.min(...upcoming) : null;
    const timers: number[] = [];
    if (next == null) {
      run();
    } else {
      const wait = next - Date.now();
      if (wait <= 0) run();
      else if (wait < 2 ** 31 - 1) timers.push(window.setTimeout(run, wait + 150 + Math.random() * 600));
    }
    // Safety net while the page is open: the cron covers the minute, this covers the tab.
    timers.push(window.setInterval(run, 45_000));
    return () => {
      cancelled = true;
      timers.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, key]);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d} j ${pad(h)} h`;
  if (h > 0) return `${h} h ${pad(m)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export function formatWhen(ms: number, isCreole: boolean): string {
  return new Date(ms).toLocaleString(isCreole ? 'fr-HT' : 'fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

export function initials(name: string): string {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

// ── Share ──────────────────────────────────────────────────────────────────

export function CopyButton({ text, label, done, ghost }: { text: string; label: string; done: string; ghost?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard refused (http, old browser) — the text is on screen anyway */
    }
  };
  return (
    <button type="button" className={`tn-btn-glass${ghost ? ' tn-btn-glass--ghost' : ''}`} onClick={copy} aria-live="polite">
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copied ? done : label}
    </button>
  );
}

export function InviteButton({ t: tour, label }: { t: Tournament; label: string }) {
  const { t } = useLang();
  const url = shareUrl(tour);
  const share = async () => {
    // One sentence (the link travels as `url`), no em-dash.
    const text = t(
      `Rejoins mon tournoi « ${tour.title} » avec le PIN ${formatPin(tour.pin)}`,
      `Vin jwe nan tounwa mwen "${tour.title}" ak PIN ${formatPin(tour.pin)}`,
    );
    if (navigator.share) {
      try { await navigator.share({ title: tour.title, text, url }); return; } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch { /* ignore */ }
  };
  return (
    <button type="button" className="tn-btn-glass tn-btn-glass--ghost" onClick={share}>
      <Share2 size={16} aria-hidden="true" /> {label}
    </button>
  );
}

// ── Boards ─────────────────────────────────────────────────────────────────

export function Podium({ rows }: { rows: StandingRow[] }) {
  const { t } = useLang();
  const shown = useShownName();
  const top = [rows[1], rows[0], rows[2]];
  if (!rows.length) return null;
  // Steps rise third → second → first (competition.css .mo-podium); static
  // under reduced motion. Place numbers stay in the text for screen readers.
  return (
    <div className="tn-podium mo-podium" role="list" aria-label={t('Podium', 'Podyòm')}>
      {top.map((r, i) => {
        const place = i === 1 ? 1 : i === 0 ? 2 : 3;
        return (
          <div key={place} role="listitem" className={`tn-podium__step tn-podium__step--${place}`}>
            {r ? (
              <>
                <span className="tn-avatar" aria-hidden="true">{initials(shown(r.displayName))}</span>
                <span className="tn-podium__name">{shown(r.displayName)}</span>
                {r.school ? (
                  <span className="tn-podium__school">
                    <SchoolCrest name={r.school} size={18} /> {r.school}
                  </span>
                ) : null}
                <span className="tn-podium__pts">{nf(r.points)} pts</span>
              </>
            ) : <span className="tn-podium__name">—</span>}
            <div className="tn-podium__block"><span className="sr-only">{t('Place', 'Plas')} </span>{place}</div>
          </div>
        );
      })}
    </div>
  );
}

/** "▲ 2" after a reorder — text, not colour alone, and spoken in words. */
export function MoveBadge({ move }: { move: RowMove | undefined }) {
  const { t } = useLang();
  if (!move || move.delta === 0) return null;
  const up = move.delta > 0;
  const n = Math.abs(move.delta);
  return (
    <span className={`tn-move mo-delta ${up ? 'is-up' : 'is-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'} {n}</span>
      <span className="sr-only">
        {up ? t(`gagne ${n} place${n > 1 ? 's' : ''}`, `monte ${n} plas`) : t(`perd ${n} place${n > 1 ? 's' : ''}`, `desann ${n} plas`)}
      </span>
    </span>
  );
}

export function Board({ rows, me, limit = 20, revealDelay = 0 }: { rows: StandingRow[]; me?: string | null; limit?: number; revealDelay?: number }) {
  const { t } = useLang();
  const name = useShownName();
  const reduced = useReducedMotion();
  const shown = rows.slice(0, limit);
  const keys = shown.map((r) => r.uid);
  const moves = useBoardMoves(keys);
  const flip = useFlipList(keys, { reduced, delay: revealDelay });
  if (!rows.length) return <p className="tn-muted">{t('Pas encore de points.', 'Poko gen pwen.')}</p>;
  const mine = me ? rows.find((r) => r.uid === me) : null;
  return (
    <>
      <ol className="tn-board">
        {shown.map((r) => (
          <li key={r.uid} ref={flip(r.uid)} className={r.uid === me ? 'is-me' : ''}>
            <span className="tn-board__rank">{r.rank}</span>
            <span className="tn-board__name">
              {name(r.displayName)}
              {(r.school || r.grade) && (
                <small>
                  {r.school ? <SchoolCrest name={r.school} size={14} /> : null}
                  {[r.school, r.grade].filter(Boolean).join(' · ')}
                </small>
              )}
            </span>
            <span className="tn-board__pts">
              <MoveBadge move={moves[r.uid]} />
              {nf(r.points)}
            </span>
          </li>
        ))}
      </ol>
      {mine && !shown.includes(mine) && (
        <ol className="tn-board" start={mine.rank}>
          <li className="is-me">
            <span className="tn-board__rank">{mine.rank}</span>
            <span className="tn-board__name">{name(mine.displayName)}</span>
            <span className="tn-board__pts">{nf(mine.points)}</span>
          </li>
        </ol>
      )}
    </>
  );
}

/** School vs school / class vs class: the best-N team scores as bars. */
export function SquadBars({ teams, teamSize, schools = false, revealDelay = 0 }: { teams: TeamRow[]; teamSize: number; schools?: boolean; revealDelay?: number }) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const max = useMemo(() => Math.max(1, ...teams.map((x) => x.score)), [teams]);
  const shown = teams.slice(0, 8);
  const keys = shown.map((x) => x.key);
  const moves = useBoardMoves(keys);
  const flip = useFlipList(keys, { reduced, delay: revealDelay });
  if (!teams.length) return <p className="tn-muted">{t('Les équipes apparaissent avec les premiers points.', 'Ekip yo parèt ak premye pwen yo.')}</p>;
  return (
    <div className="tn-squads">
      <ol className="tn-squads__list">
        {shown.map((team) => (
          <li key={team.key} ref={flip(team.key)} className="tn-squad">
            <span className="tn-squad__name">
              {schools ? <SchoolCrest name={team.label} size={20} /> : null}
              <span className="tn-squad__label">
                {team.rank > 0 ? `${team.rank}. ` : ''}{team.label}
                {!team.qualified && <span className="tn-muted"> · {t(`${team.counted}/${teamSize} joueurs`, `${team.counted}/${teamSize} jwè`)}</span>}
              </span>
            </span>
            <span className="tn-squad__score"><MoveBadge move={moves[team.key]} />{nf(team.score)}</span>
            <span className="tn-squad__bar" aria-hidden="true"><span style={{ width: `${(team.score / max) * 100}%` }} /></span>
          </li>
        ))}
      </ol>
      <p className="tn-muted">
        {t(`Chaque équipe compte ses ${teamSize} meilleurs joueurs.`, `Chak ekip konte ${teamSize} pi bon jwè li yo.`)}
      </p>
    </div>
  );
}

export function MeStrip({ rows, me }: { rows: StandingRow[]; me: string | null | undefined }) {
  const { t } = useLang();
  const mine = me ? rows.find((r) => r.uid === me) : null;
  if (!mine) return null;
  return (
    <div className="tn-me" role="status">
      <span>{t('Votre position', 'Pozisyon ou')} · {nf(mine.points)} pts</span>
      <strong>#{mine.rank}<small className="tn-muted" style={{ color: 'rgba(255,255,255,.7)' }}> / {rows.length}</small></strong>
    </div>
  );
}

// ── Bracket ────────────────────────────────────────────────────────────────

export function BracketView({ matches, rounds, me }: { matches: Match[]; rounds: number; me?: string | null }) {
  const { t } = useLang();
  if (!matches.length) {
    return <p className="tn-muted">{t('Le tableau est tiré au début du tournoi.', 'Tablo a ap tire lè tounwa a kòmanse.')}</p>;
  }
  const byRound = Array.from({ length: Math.max(rounds, 1) }, (_, r) => matches.filter((m) => m.round === r));
  const name = (r: number) => {
    const left = rounds - r;
    if (left === 1) return t('Finale', 'Final');
    if (left === 2) return t('Demi-finales', 'Demi-final');
    if (left === 3) return t('Quarts', 'Ka final');
    return t(`Tour ${r + 1}`, `Tou ${r + 1}`);
  };
  return (
    <div className="tn-bracket" role="list" aria-label={t('Tableau', 'Tablo')}>
      {byRound.map((ms, r) => (
        <div key={r} className="tn-bracket__round" role="listitem">
          <h3>{name(r)}</h3>
          {ms.length ? ms.map((m) => (
            <div key={m.id} className="tn-match">
              {[m.a, m.b].map((side, i) => {
                const score = i === 0 ? m.scoreA : m.scoreB;
                const win = side && m.winnerUid === side.uid && m.status !== 'pending';
                return (
                  <div key={i} className={`tn-match__side${win ? ' is-win' : ''}${side && side.uid === me ? ' is-me' : ''}`}>
                    <span>{side ? side.displayName : <em>{m.status === 'bye' ? t('exempt', 'egzante') : '—'}</em>}</span>
                    <span>{m.status === 'bye' ? '' : score != null ? nf(score) : ''}</span>
                  </div>
                );
              })}
            </div>
          )) : <div className="tn-match"><div className="tn-match__side"><em>{t('à venir', 'pou vini')}</em></div></div>}
        </div>
      ))}
    </div>
  );
}
