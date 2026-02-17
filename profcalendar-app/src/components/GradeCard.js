import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

function gradeColor(points) {
  if (points >= 5.5) return colors.grade.excellent;
  if (points >= 4.5) return colors.grade.good;
  if (points >= 4) return colors.grade.average;
  return colors.grade.poor;
}

export default function GradeCard({ grade }) {
  const color = gradeColor(grade.points);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{grade.title}</Text>
          <Text style={styles.meta}>{grade.subject || ''} · {grade.date}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
          <Text style={[styles.note, { color }]}>{grade.points}</Text>
        </View>
      </View>
      <View style={styles.typeRow}>
        <View style={[styles.typeBadge, { backgroundColor: grade.type === 'significatif' ? colors.primary + '20' : colors.warning + '20' }]}>
          <Text style={[styles.typeText, { color: grade.type === 'significatif' ? colors.primary : colors.warning }]}>
            {grade.type === 'significatif' ? 'Significatif' : 'TA'}
          </Text>
        </View>
      </View>
    </View>
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
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, marginRight: 12 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  note: { fontSize: 16, fontWeight: '800' },
  typeRow: { marginTop: 6 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typeText: { fontSize: 11, fontWeight: '600' },
});
