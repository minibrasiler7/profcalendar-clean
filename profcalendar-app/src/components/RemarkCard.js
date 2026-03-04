import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function RemarkCard({ remark, onMarkRead }) {
  return (
    <TouchableOpacity
      style={[styles.card, !remark.is_read && styles.unread]}
      onPress={() => !remark.is_read && onMarkRead?.(remark.id)}
    >
      <View style={styles.header}>
        {!remark.is_read && <View style={styles.dot} />}
        <Text style={styles.date}>{remark.date} · P{remark.period}</Text>
        {remark.student_name && (
          <Text style={styles.student}>{remark.student_name}</Text>
        )}
      </View>
      <Text style={styles.content}>{remark.content}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 6,
  },
  date: { fontSize: 12, color: colors.textSecondary },
  student: { fontSize: 12, color: colors.primary, fontWeight: '600', marginLeft: 8 },
  content: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
