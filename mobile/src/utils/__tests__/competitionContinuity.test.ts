import { restoreCompetitionTarget, savedCompetitionTarget } from '../../navigation/competitionContinuity';
it('retains invitation intent through anonymous authentication but isolates signed-in accounts', () => {
  const target = savedCompetitionTarget({ name:'CompetitionWorkspace', params:{kind:'invite',id:'invite1',token:'never-persist'} });
  expect(target).toEqual({screen:'CompetitionWorkspace',params:{kind:'invite',id:'invite1'}});
  expect(restoreCompetitionTarget({uid:null,target}, 'a')).toEqual(target);
  expect(restoreCompetitionTarget({uid:'a',target}, 'b')).toBeNull();
  expect(restoreCompetitionTarget({uid:'a',target}, 'a')).toEqual(target);
});
it('never restores arbitrary screens or persists private PINs', () => {
  expect(restoreCompetitionTarget({uid:null,target:{screen:'Admin',params:{}}}, null)).toBeNull();
  expect(savedCompetitionTarget({name:'Tournois',params:{pin:'123456',tournamentId:'event1'}})).toEqual({screen:'Tournois',params:{tournamentId:'event1'}});
});
