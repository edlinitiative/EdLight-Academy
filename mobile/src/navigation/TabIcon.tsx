/**
 * TabIcon — real SF Symbols on iOS, Lucide everywhere else.
 * ---------------------------------------------------------------------------
 * The reference bar (Ted's Ledger app) is a stock SwiftUI `TabView` with
 * `.tint(Ink.brass)` and nothing else: verified there is ZERO tab-bar
 * customisation in that codebase. So every glyph in it is a *filled* SF Symbol
 * drawn by the system.
 *
 * Lucide is a monoline set — outlines, not solids. Thickening the stroke gets
 * closer but an outline next to a solid still reads as a different family, which
 * is most of what "not identical" meant. `expo-symbols` renders the actual SF
 * Symbol on iOS 15+, so on iOS these are now literally the same glyphs Ledger
 * draws, in the same `.fill` weight.
 *
 * Android has no SF Symbols, so it keeps the Lucide equivalents.
 */
import React from 'react';
import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  LayoutDashboard, BookOpen, ClipboardList, ListChecks, Gamepad2, User,
} from 'lucide-react-native';

export type TabIconName = 'dashboard' | 'courses' | 'exams' | 'quiz' | 'games' | 'profile';

/**
 * Filled SF Symbols, chosen to sit in the same visual family as Ledger's set
 * (calendar.badge.clock / dumbbell.fill / books.vertical.fill /
 * square.and.pencil / cup.and.saucer.fill) — solid, high-weight glyphs.
 */
const SF: Record<TabIconName, SymbolViewProps['name']> = {
  dashboard: 'square.grid.2x2.fill',
  courses: 'books.vertical.fill',
  exams: 'list.bullet.clipboard.fill',
  quiz: 'checklist',
  games: 'gamecontroller.fill',
  profile: 'person.fill',
};

const LUCIDE: Record<TabIconName, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  exams: ClipboardList,
  quiz: ListChecks,
  games: Gamepad2,
  profile: User,
};

export default function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: TabIconName;
  color: string;
  size: number;
  focused: boolean;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={SF[name]}
        size={size}
        tintColor={color}
        // `monochrome` keeps the symbol a single tinted colour, which is how the
        // reference renders under `.tint()`. Weight lifts slightly when active,
        // mirroring the system bar's selected emphasis.
        type="monochrome"
        weight={focused ? 'semibold' : 'regular'}
        // If a symbol is missing on an older iOS, fall back rather than render
        // an empty box.
        fallback={renderLucide(name, color, size, focused)}
      />
    );
  }
  return renderLucide(name, color, size, focused);
}

function renderLucide(name: TabIconName, color: string, size: number, focused: boolean) {
  const Icon = LUCIDE[name];
  return <Icon color={color} size={size} strokeWidth={focused ? 2.4 : 2} />;
}
