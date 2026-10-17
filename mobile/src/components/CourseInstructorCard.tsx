/**
 * CourseInstructorCard — "Pwofesè ou" on a course screen (mobile mirror of the
 * web's CourseInstructors).
 *
 * Fetches the visible instructor profiles bound to a course (instructors
 * collection, world-readable) and renders a card per teacher; tapping expands
 * the bio inline — no extra screen to navigate, which keeps the course flow
 * intact. Renders nothing while loading or when the course has no real
 * teacher bound (no placeholder person).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { GraduationCap, School, ChevronDown, ChevronUp } from 'lucide-react-native';
import { collection, getDocs, query, where, limit as fbLimit } from 'firebase/firestore';
import { db } from '../services/firebase';
import useStore from '../contexts/store';
import { useTheme, typeScale } from '../theme/theme';
import SectionHeader from './ui/SectionHeader';

interface Instructor {
  id: string;
  name: string;
  photoUrl?: string;
  bio_fr?: string;
  bio_ht?: string;
  school?: string;
  credentials?: string;
  visible?: boolean;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export default function CourseInstructorCard({ courseId }: { courseId: string }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { colors, cardSurface, fonts } = useTheme();

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'instructors'),
          where('courseIds', 'array-contains', courseId),
          fbLimit(4),
        ));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as Instructor))
          .filter((i) => i.visible !== false && i.name);
        if (alive) setInstructors(list);
      } catch {
        /* offline / rules hiccup — the card simply doesn't render */
      }
    })();
    return () => { alive = false; };
  }, [courseId]);

  if (instructors.length === 0) return null;

  return (
    <View>
      <SectionHeader title={instructors.length > 1 ? t('Tes enseignants', 'Pwofesè ou yo') : t('Ton enseignant', 'Pwofesè ou')} />
      <View style={{ gap: 12 }}>
        {instructors.map((i) => {
          const bio = (isCreole ? i.bio_ht : i.bio_fr) || i.bio_fr || '';
          const isOpen = expanded === i.id;
          return (
            <TouchableOpacity
              key={i.id}
              activeOpacity={bio ? 0.75 : 1}
              onPress={() => bio && setExpanded(isOpen ? null : i.id)}
              accessibilityRole={bio ? 'button' : undefined}
              accessibilityState={bio ? { expanded: isOpen } : undefined}
              style={{ ...cardSurface, padding: 16 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {i.photoUrl ? (
                  <Image source={{ uri: i.photoUrl }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceAlt }} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
                    <Text style={{ fontFamily: fonts.heading, color: colors.azureInk, fontSize: 17 }}>{initials(i.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[typeScale.titleSm, { color: colors.ink, fontSize: 17, lineHeight: 22 }]} numberOfLines={1}>{i.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    {i.school ? <School size={14} color={colors.muted} /> : <GraduationCap size={14} color={colors.muted} />}
                    <Text style={[typeScale.micro, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
                      {[i.credentials, i.school].filter(Boolean).join(' · ') || t('Enseignant EdLight', 'Pwofesè EdLight')}
                    </Text>
                  </View>
                </View>
                {bio ? (
                  isOpen
                    ? <ChevronUp size={16} color={colors.faint} />
                    : <ChevronDown size={16} color={colors.faint} />
                ) : null}
              </View>
              {isOpen && bio ? (
                <Text style={[typeScale.body, { color: colors.muted, marginTop: 12 }]}>
                  {bio}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
