import { isAnswerFilled } from '../answerFilled';

describe('isAnswerFilled', () => {
  it('treats empty shapes as unanswered', () => {
    for (const v of [null, undefined, '', '   ', '|', ' | ', '{"scaffold":["",""]}', '{"steps":[{"math":""}],"finalAnswer":""}', '[]', []]) {
      expect(isAnswerFilled(v)).toBe(false);
    }
  });

  it('treats real answers as answered', () => {
    for (const v of ['A', 'simple|', '|double', '{"scaffold":["","x=2"]}', '{"steps":[],"finalAnswer":"3"}', '[x] est vrai', ['B']]) {
      expect(isAnswerFilled(v)).toBe(true);
    }
  });
});
