import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerCard from '../PlayerCard';
import useStore from '../../../contexts/store';

const base = { uid: 'u1', name: 'Lalin_Fizik', school: 'Collège Canado Haïtien', level: 24, xp: 9210, rank: 3, title: 'Série de 10' };

describe('PlayerCard', () => {
  beforeEach(() => useStore.setState({ language: 'fr' } as never));

  it.each(['sm', 'md', 'lg'] as const)('%s shows pseudo, school, tier and level', (size) => {
    const { container } = render(<PlayerCard {...base} size={size} />);
    expect(screen.getByText('Lalin_Fizik')).toBeTruthy();
    expect(container.textContent).toContain('Collège Canado Haïtien');
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain(`pcard--${size}`);
    expect(card.getAttribute('data-tier')).toBe('diamond');
    expect(card.getAttribute('aria-label')).toContain('Diamant, niveau 24');
    expect(card.getAttribute('aria-label')).toContain('3e cette semaine');
  });

  it('speaks Kreyòl', () => {
    useStore.setState({ language: 'ht' } as never);
    const { container } = render(<PlayerCard {...base} size="lg" />);
    expect(container.textContent).toContain('Dyaman');
    expect(container.textContent).toContain('Nivo 24');
    expect(container.textContent).toContain('semèn sa a');
  });

  it('omits place and title when not real', () => {
    const { container } = render(<PlayerCard uid="u2" name="Ti Chouchou" size="md" />);
    expect(container.textContent).not.toContain('#');
    expect(container.querySelector('.pcard-title')).toBeNull();
    expect(container.querySelector('.pcard-school')).toBeNull();
  });

  it('renders only the public pseudo it is given', () => {
    const { container } = render(<PlayerCard uid="secret-uid-123" name="Nènè" size="lg" />);
    expect(container.textContent).not.toContain('secret-uid-123');
    expect(container.innerHTML).not.toMatch(/@/);
  });
});
