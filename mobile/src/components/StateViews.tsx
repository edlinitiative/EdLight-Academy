import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AlertCircle, Inbox } from 'lucide-react-native';
import useStore from '../contexts/store';
import LoadingSpinner from './ui/LoadingSpinner';

export function LoadingState({ message }: { message?: string }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16">
      <LoadingSpinner color="#0857A6" />
      <Text className="text-gray-500 text-base">{message ?? t('Chargement…', 'Ap chaje…')}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16 px-6">
      <AlertCircle color="#dc2626" size={40} />
      <Text className="text-gray-700 text-base text-center">{message ?? t('Une erreur est survenue.', 'Gen yon erè ki rive.')}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} className="mt-2 px-5 py-2.5 bg-primary-600 rounded-xl">
          <Text className="text-white font-semibold">{t('Réessayer', 'Eseye ankò')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EmptyState({ message, icon }: { message?: string; icon?: React.ReactNode }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-3 py-16 px-6">
      {icon ?? <Inbox color="#9ca3af" size={40} />}
      <Text className="text-gray-500 text-base text-center">{message ?? t('Rien ici pour l\'instant.', 'Pa gen anyen la pou kounye a.')}</Text>
    </View>
  );
}
