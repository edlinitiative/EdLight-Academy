import React from 'react';
import { render } from '@testing-library/react';
import FigureRenderer from '../FigureRenderer';

/*
 * A real catalog figure (Bac Math 2015). Its sentences never end in "LABEL: [",
 * which made pattern E2's old label group (`X+(?:\s*X+)*`) backtrack
 * exponentially — the tab froze on the exam results page.
 */
const STATS_TABLE =
  "Tableau de données statistiques avec deux lignes. La première ligne est 'Valeur $x_i$' avec les valeurs $20, 19, 18, 17, 16$. La deuxième ligne est 'Effectif $n_i$' avec les effectifs $2, 8, 9, 15, 4$.";

test('a table figure description renders without catastrophic backtracking', () => {
  const t0 = Date.now();
  const { container } = render(<FigureRenderer description={STATS_TABLE} />);
  expect(Date.now() - t0).toBeLessThan(1000);
  expect(container.textContent).toContain('Tableau de données statistiques');
});
