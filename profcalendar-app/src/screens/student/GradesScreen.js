import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

function gradeColor(points) {
  if (points >= 5.5) return colors.grade.excellent;
  if (points >= 4.5) return colors.grade.good;
  if (points >= 4) return colors.grade.average;
  return colors.grade.poor;
}

export default function GradesScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/grades');
      setData(res.data);
    } catch (err) {
      console.log('Grades error:', err.response?.data);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const subjects = data?.subjects ? Object.values(data.subjects) : [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={[styles.pageTitle, { paddingTop: Math.max(insets.top + 8, 20) }]}>Mes Notes</Text>

      {subjects.length === 0 && (
        <Text style={styles.empty}>Aucune note pour le moment</Text>
      )}

      {subjects.map((subj) => {
        const isExpanded = expandedSubject === subj.subject;
        const avg = subj.averages?.general;
        const avgColor = avg ? gradeColor(avg) : colors.textLight;

        return (
          <View key={subj.subject} style={styles.subjectCard}>
            <TouchableOpacity
              style={styles.subjectHeader}
              onPress={() => setExpandedSubject(isExpanded ? null : subj.subject)}
            >
              <View style={styles.subjectInfo}>
                <Text style={styles.subjectName}>{subj.subject}</Text>
                <Text style={styles.subjectClass}>{subj.classroom_name}</Text>
              </View>
              <View style={styles.avgBox}>
                {avg != null && (
                  <Text style={[styles.avgText, { color: avgColor }]}>{avg}</Text>
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18} color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>

            {/* Sous-moyennes */}
            <View style={styles.avgRow}>
              {subj.averages?.significatif != null && (
                <View style={styles.avgBadge}>
                  <Text style={styles.avgBadgeLabel}>Significatif</Text>
                  <Text style={styles.avgBadgeValue}>{subj.averages.significatif}</Text>
                </View>
              )}
              {subj.averages?.ta != null && (
                <View style={[styles.avgBadge, { backgroundColor: colors.warning + '15' }]}>
                  <Text style={[styles.avgBadgeLabel, { color: colors.warning }]}>TA</Text>
                  <Text style={[styles.avgBadgeValue, { color: colors.warning }]}>{subj.averages.ta}</Text>
                </View>
              )}
            </View>

            {/* Détail des notes */}
            {isExpanded && (
              <View style={styles.gradesList}>
                {subj.grades.map((g, i) => (
                  <View key={i} style={styles.gradeRow}>
                    <View style={styles.gradeInfo}>
                      <Text style={styles.gradeTitle}>{g.title}</Text>
                      <Text style={styles.gradeMeta}>{g.date} · {g.type === 'significatif' ? 'Sig.' : 'TA'}</Text>
                    </View>
                    <Text style={[styles.gradeValue, { color: gradeColor(g.points) }]}>
                      {g.points}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, padding: 20, paddingBottom: 12 },
  empty: { fontSize: 14, color: colors.textLight, textAlign: 'center', padding: 40 },
  subjectCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  subjectHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16,
  },
  subjectInfo: { flex: 1 },
  subjectName: { fontSize: 16, fontWeight: '700', color: colors.text },
  subjectClass: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  avgBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avgText: { fontSize: 20, fontWeight: '800' },
  avgRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  avgBadge: {
    backgroundColor: colors.primary + '15', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  avgBadgeLabel: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  avgBadgeValue: { fontSize: 13, color: colors.primary, fontWeight: '800' },
  gradesList: { borderTopWidth: 1, borderTopColor: colors.border },
  gradeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  gradeInfo: { flex: 1 },
  gradeTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
  gradeMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  gradeValue: { fontSize: 18, fontWeight: '800' },
});
