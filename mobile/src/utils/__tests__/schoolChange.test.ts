import { schoolChangePlan } from '../schoolChange';

describe('schoolChangePlan', () => {
  it('does nothing for the same school, whatever the spelling', () => {
    expect(schoolChangePlan({ from: 'Collège Dominique Savio', to: 'college dominique savio', arena: null, isCreole: false }))
      .toEqual({ kind: 'noop' });
    expect(schoolChangePlan({ from: 'A', to: '  ', arena: null, isCreole: false })).toEqual({ kind: 'noop' });
  });

  it('saves a first choice without asking', () => {
    expect(schoolChangePlan({ from: null, to: 'B', arena: null, isCreole: false })).toEqual({ kind: 'save' });
  });

  it('says the week’s points move to the new school', () => {
    const plan = schoolChangePlan({ from: 'A', to: 'B', arena: null, isCreole: false });
    expect(plan.kind).toBe('confirm');
    if (plan.kind !== 'confirm') return;
    expect(plan.title).toBe('Changer d’école ?');
    expect(plan.message).toBe('Tes points de cette semaine passent avec toi à B.');
  });

  it('while sign-up is open: the registration stays, re-register in the Arène', () => {
    const plan = schoolChangePlan({ from: 'A', to: 'B', arena: { state: 'doors', title: 'Arène d’octobre' }, isCreole: false });
    if (plan.kind !== 'confirm') throw new Error('expected confirm');
    expect(plan.message).toContain('Ton inscription au championnat « Arène d’octobre » ne change pas');
    expect(plan.message).toContain('refais ton inscription dans l’Arène');
  });

  it('once live: the championship stays with the registered school', () => {
    const plan = schoolChangePlan({ from: 'A', to: 'B', arena: { state: 'live', title: 'Arène' }, isCreole: false });
    if (plan.kind !== 'confirm') throw new Error('expected confirm');
    expect(plan.message).toContain('reste joué pour l’école de ton inscription');
    expect(plan.message).not.toContain('refais');
  });

  it('asks even for a first school when an Arène registration exists', () => {
    const plan = schoolChangePlan({ from: null, to: 'B', arena: { state: 'registration', title: '' }, isCreole: true });
    if (plan.kind !== 'confirm') throw new Error('expected confirm');
    expect(plan.title).toBe('Chanje lekòl ?');
    expect(plan.confirm).toBe('Chanje');
    expect(plan.message).not.toContain('Pwen ou');
    expect(plan.message).toContain('Enskripsyon ou nan chanpyona');
  });
});
