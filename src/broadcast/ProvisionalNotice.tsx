import React from 'react';
import { isProvisional, provisionalDetail, provisionalTitle, type Translate } from './finaleLogic';
import './scenes/finale.css';

/**
 * "Results are provisional until we verify them", on the screen that announces
 * the winners.
 *
 * This is one component rather than three copies because it is the one sentence
 * in the broadcast that cannot be allowed to differ between two scenes. Section
 * M's whole integrity position rests on it: prizes are NOT paid when sequences
 * 17 and 18 play, verification happens afterwards, and removing somebody from
 * the podium later is the published rule working exactly as announced — but
 * only if the announcement said so, in front of the same audience, at the same
 * volume. An asterisk added the following week is a reversal, and no amount of
 * being right about the cheating wins that argument in public.
 *
 * So it renders inside the champion frame, at support size, above the fold of
 * anything a phone camera can crop — because these frames are designed to be
 * screenshotted and reposted, and the screenshot has to carry the caveat too.
 *
 * It disappears only at `final`, which is the state the tournament reaches
 * after the integrity review and the one that releases prize money. The same
 * field draws the same line on the player's own result screen
 * (`mobile/src/screens/arena/ArenaResultScreen.tsx`) and the wording is lifted
 * from it verbatim: a student reading "provisoire" on their phone while the
 * stream calls it confirmed is the exact contradiction this rule exists to
 * prevent.
 */
export interface ProvisionalNoticeProps {
  /** `data.tournament?.state`. Anything other than `final` is provisional. */
  state: string | null | undefined;
  t: Translate;
  style?: React.CSSProperties;
}

export default function ProvisionalNotice({ state, t, style }: ProvisionalNoticeProps) {
  if (!isProvisional(state)) return null;
  return (
    <div className="finale-provisional" style={style}>
      <div className="finale-provisional__title">{provisionalTitle(t)}</div>
      <div className="finale-provisional__detail">{provisionalDetail(t)}</div>
    </div>
  );
}
