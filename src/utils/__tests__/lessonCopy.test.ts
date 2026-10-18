import fs from 'fs';
import path from 'path';
import { isGeneratedDescription, authoredDescription } from '../lessonCopy';
import { isWeakStill } from '../lessonFrames';

test('generated lesson sentences are detected, FR and HT', () => {
  expect(isGeneratedDescription('Leçon « Exercices significatifs » du cours de Chimie NS1 — chapitre Grandeurs et mesures.')).toBe(true);
  expect(isGeneratedDescription('Lecon "Masse et poids" du cours de Chimie NS I - chapitre 1')).toBe(true);
  expect(isGeneratedDescription('Leson « Mas ak pwa » nan kou Chimi NS1 — chapit Grandè ak mezi.')).toBe(true);
});

test('generated course templates are detected', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/catalog.json'), 'utf8'));
  const byId = Object.fromEntries(catalog.courses.map((c: any) => [c.id, c.description]));
  for (const id of ['chem-ns1', 'math-ns1', 'math-ns4', 'econ-ns1', 'econ-ns4']) {
    expect(isGeneratedDescription(byId[id])).toBe(true);
  }
  expect(isGeneratedDescription('Kou Chimi Nouvo Segondè 1 (NS1), EdLight anseye an videyo.')).toBe(true);
});

test('authored copy passes through', () => {
  const authored = [
    'Approfondir vos compétences en chimie avec les liaisons, les réactions et la pratique de la chimie des solutions.',
    'Dans cette leçon, on calcule la masse volumique à partir de mesures réelles.',
    'Leçon courte sur les cours du marché.',
  ];
  for (const s of authored) {
    expect(isGeneratedDescription(s)).toBe(false);
    expect(authoredDescription(`  ${s} `)).toBe(s);
  }
  expect(isGeneratedDescription('')).toBe(false);
  expect(isGeneratedDescription(null)).toBe(false);
  expect(authoredDescription('')).toBeNull();
  expect(authoredDescription('Cours d\'Économie NS2 (Nouveau Secondaire 2) — EdLight.')).toBeNull();
});

test('isWeakStill recognises curated weak frames by URL only', () => {
  expect(isWeakStill('https://i.ytimg.com/vi/FNrikFcFAMg/sd2.jpg')).toBe(true);
  expect(isWeakStill('https://i.ytimg.com/vi/6oKYUnJMdOw/sd3.jpg')).toBe(false);
  expect(isWeakStill('/assets/chemistry-thumb.jpg')).toBe(false);
  expect(isWeakStill(null)).toBe(false);
});
