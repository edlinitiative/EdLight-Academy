import { COMPETITION_PLACE_MAX_AGE_MS, restoreCompetitionTarget, savedCompetitionTarget } from '../../navigation/competitionContinuity';
const savedAt = Date.now();
it('retains invitation intent through anonymous authentication but isolates signed-in accounts', () => {
  const target = savedCompetitionTarget({ name:'CompetitionWorkspace', params:{kind:'invite',id:'invite1',token:'never-persist'} });
  expect(target).toEqual({screen:'CompetitionWorkspace',params:{kind:'invite',id:'invite1'}});
  expect(restoreCompetitionTarget({uid:null,target,savedAt}, 'a')).toEqual(target);
  expect(restoreCompetitionTarget({uid:'a',target,savedAt}, 'b')).toBeNull();
  expect(restoreCompetitionTarget({uid:'a',target,savedAt}, 'a')).toEqual(target);
});
it('never restores arbitrary screens or persists private PINs', () => {
  expect(restoreCompetitionTarget({uid:null,target:{screen:'Admin',params:{}}}, null)).toBeNull();
  expect(savedCompetitionTarget({name:'Tournois',params:{pin:'123456',tournamentId:'event1'}})).toEqual({screen:'Tournois',params:{tournamentId:'event1'}});
});
it('forgets a competition place once it is stale or was saved without a time', () => {
  const target = savedCompetitionTarget({ name:'Tournois', params:{} });
  const now = Date.now();
  expect(restoreCompetitionTarget({uid:'a',target,savedAt:now-60_000}, 'a', now)).toEqual(target);
  expect(restoreCompetitionTarget({uid:'a',target,savedAt:now-COMPETITION_PLACE_MAX_AGE_MS-1}, 'a', now)).toBeNull();
  expect(restoreCompetitionTarget({uid:'a',target}, 'a', now)).toBeNull();
});
