import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AlertCircle, Inbox } from 'lucide-react-native';
import LoadingSpinner from './ui/LoadingSpinner';

export function LoadingState({ message = 'Chargement…' }: { message?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16">
      <LoadingSpinner color="#0857A6" />
      <Text className="text-gray-500 text-base">{message}</Text>
    </View>
  );
}

export function ErrorState({ message = 'Une erreur est survenue.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16 px-6">
      <AlertCircle color="#dc2626" size={40} />
      <Text className="text-gray-700 text-base text-center">{message}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} className="mt-2 px-5 py-2.5 bg-primary-600 rounded-xl">
          <Text className="text-white font-semibold">Réessayer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EmptyState({ message = 'Rien ici pour l\'instant.', icon }: { message?: string; icon?: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 py-16 px-6">
      {icon ?? <Inbox color="#9ca3af" size={40} />}
      <Text className="text-gray-500 text-base text-center">{message}</Text>
    </View>
  );
}
