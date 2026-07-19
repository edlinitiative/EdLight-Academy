import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Target, ChevronRight } from 'lucide-react-native';
import { useReadiness } from '../hooks/useReadiness';
import { getSubjectColor, SUBJECT_COLORS } from '../utils/shared';
import useStore from '../contexts/store';
import { LoadingState } from './StateViews';

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(pct: number): string {
  if (pct < 40) return '#ef4444';
  if (pct < 60) return '#f97316';
  if (pct < 75) return '#eab308';
  if (pct < 90) return '#22c55e';
  return '#10b981';
}

function scoreLabel(pct: number, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  if (pct < 40) return t('À travailler', 'Pou travay');
  if (pct < 60) return t('En progrès', 'N ap pwogrese');
  if (pct < 75) return t('Bien', 'Byen');
  if (pct < 90) return t('Très bien', 'Trè byen');
  return t('Excellent !', 'Ekselan !');
}

function subjectColor(name: string): string {
  const key = String(name || '').toUpperCase();
  return key in SUBJECT_COLORS ? getSubjectColor(key) : '#64748b';
}

export default function ReadinessCard() {
  const { overall, subjects, focus, hasData, isLoading } = useReadiness() as any;
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  if (isLoading) {
    return (
      <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', padding: 16, shadowColor: '#1B6FE0', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
        <LoadingState message="" />
      </View>
    );
  }

  const pct = Math.round(overall ?? 0);
  // No exam attempts yet → neutral ring with "—" (PWA behaviour), not a red 0%.
  const stroke = hasData ? scoreColor(pct) : '#e5e7eb';
  const dashArray = hasData ? (pct / 100) * CIRCUMFERENCE : 0;

  // Top subjects by coefficient weight, descending
  const topSubjects = (subjects || []).slice(0, 5);

  // Weakest subject for focus
  const focusSubject = focus?.subject ?? (topSubjects.length ? topSubjects[topSubjects.length - 1]?.subject : null);
  const focusColor = focusSubject ? subjectColor(focusSubject) : '#1B6FE0';

  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', padding: 16, shadowColor: '#1B6FE0', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Target color="#1B6FE0" size={18} />
        <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 16 }}>{t('Score de préparation', 'Nòt preparasyon')}</Text>
      </View>

      <View className="flex-row items-center gap-5">
        {/* Donut ring */}
        <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={104} height={104} style={{ position: 'absolute' }}>
            {/* Track */}
            <Circle
              cx={52} cy={52} r={RADIUS}
              fill="none"
              stroke="#f0f0f0"
              strokeWidth={14}
            />
            {/* Progress arc — omitted entirely with no data (a rounded cap at
                0% would still paint a stray dot on the track) */}
            {hasData && (
              <Circle
                cx={52} cy={52} r={RADIUS}
                fill="none"
                stroke={stroke}
                strokeWidth={14}
                strokeDasharray={`${dashArray} ${CIRCUMFERENCE}`}
                strokeLinecap="round"
                rotation={-90}
                origin="52, 52"
              />
            )}
          </Svg>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: hasData ? '#111827' : '#94a3b8' }}>
              {hasData ? `${pct}%` : '—'}
            </Text>
            {hasData && (
              <Text style={{ fontSize: 9, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {scoreLabel(pct, isCreole)}
              </Text>
            )}
          </View>
        </View>

        {/* Subject bars */}
        <View className="flex-1 gap-2">
          {topSubjects.length === 0 ? (
            <Text className="text-xs text-gray-400 italic">
              {t('Passe des examens pour voir tes scores', 'Fè egzamen pou wè nòt ou yo')}
            </Text>
          ) : (
            topSubjects.map((s: any) => {
              const sPct = Math.round(s.pct ?? 0);
              const color = subjectColor(s.subject);
              const label = String(s.subject || '').slice(0, 12);
              return (
                <View key={s.subject}>
                  <View className="flex-row items-center justify-between mb-0.5">
                    <Text className="text-xs text-gray-600" numberOfLines={1}>{label}</Text>
                    <Text className="text-xs font-semibold" style={{ color }}>{sPct}%</Text>
                  </View>
                  <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <View
                      className="h-1.5 rounded-full"
                      style={{ backgroundColor: color, width: `${sPct}%` }}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Focus recommendation */}
      {focusSubject && (
        <TouchableOpacity
          className="mt-3 flex-row items-center justify-between rounded-xl px-3 py-2.5"
          style={{ backgroundColor: focusColor + '15' }}
          activeOpacity={0.8}
        >
          <View>
            <Text className="text-xs font-semibold" style={{ color: focusColor }}>
              {t('Focus recommandé', 'Konsantrasyon rekòmande')}
            </Text>
            <Text className="text-sm font-bold text-gray-800 mt-0.5" numberOfLines={1}>
              {focusSubject}
            </Text>
          </View>
          <ChevronRight color={focusColor} size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}
