import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function ChildCard({ child, onPress, selected }) {
  const initials = (child.first_name?.[0] || '') + (child.last_name?.[0] || '');

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.selected]}
      onPress={() => onPress?.(child)}
    >
      <View style={[styles.avatar, selected && styles.avatarSelected]}>
        <Text style={[styles.initials, selected && styles.initialsSelected]}>{initials.toUpperCase()}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>{child.first_name} {child.last_name}</Text>
      <Text style={styles.classroom} numberOfLines={1}>{child.classroom || ''}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 120,
    borderWidth: 2,
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  avatarSelected: { backgroundColor: colors.primary },
  initials: { fontSize: 18, fontWeight: '700', color: colors.primary },
  initialsSelected: { color: '#FFF' },
  name: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },
  classroom: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
});
