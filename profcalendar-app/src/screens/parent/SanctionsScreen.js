import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import ChildCard from '../../components/ChildCard';
import colors from '../../theme/colors';

export default function SanctionsScreen() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [sanctionsData, setSanctionsData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChildren = async () => {
    try {
      const res = await api.get('/parent/dashboard');
      const kids = res.data.children || [];
      setChildren(kids);
      if (kids.length > 0 && !selectedChild) {
        setSelectedChild(kids[0]);
        fetchSanctions(kids[0].id);
      }
    } catch (err) {}
  };

  const fetchSanctions = async (studentId) => {
    try {
      const res = await api.get(`/parent/children/${studentId}/sanctions`);
      setSanctionsData(res.data);
    } catch (err) {
      console.log('Sanctions error:', err);
    }
  };

  useFocusEffect(useCallback(() => { fetchChildren(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChildren();
    if (selectedChild) await fetchSanctions(selectedChild.id);
    setRefreshing(false);
  };

  const selectChild = (child) => {
    setSelectedChild(child);
    fetchSanctions(child.id);
  };

  const subjects = sanctionsData?.sanctions_by_subject
    ? Object.values(sanctionsData.sanctions_by_subject)
    : [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.warning]} />}
    >
      <Text style={styles.pageTitle}>Coches</Text>

      {children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childrenRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {children.map((c) => (
            <ChildCard key={c.id} child={c} selected={selectedChild?.id === c.id} onPress={selectChild} />
          ))}
        </ScrollView>
      )}

      {/* Total */}
      {sanctionsData && (
        <View style={[styles.totalCard, sanctionsData.total_checks > 0 ? styles.totalWarning : styles.totalOk]}>
          <Ionicons
            name={sanctionsData.total_checks > 0 ? 'warning' : 'checkmark-circle'}
            size={28}
            color={sanctionsData.total_checks > 0 ? colors.warning : colors.secondary}
          />
          <Text style={styles.totalText}>
            {sanctionsData.total_checks > 0
              ? `${sanctionsData.total_checks} coche${sanctionsData.total_checks > 1 ? 's' : ''} au total`
              : 'Aucune coche'}
          </Text>
        </View>
      )}

      {/* Par discipline */}
      {subjects.map((subj) => (
        <View key={subj.subject_name} style={styles.subjectCard}>
          <View style={styles.subjectHeader}>
            <Text style={styles.subjectName}>{subj.subject_name}</Text>
            <Text style={[styles.subjectTotal, subj.total_checks > 0 && { color: colors.warning }]}>
              {subj.total_checks}
            </Text>
          </View>
          {subj.templates?.map((t, i) => (
            <View key={i} style={styles.templateRow}>
              <Text style={styles.templateName}>{t.template_name}</Text>
              <View style={styles.checksRow}>
                {Array.from({ length: Math.min(t.check_count, 10) }).map((_, j) => (
                  <Ionicons key={j} name="checkmark" size={16} color={colors.warning} />
                ))}
                {t.check_count > 10 && <Text style={styles.moreChecks}>+{t.check_count - 10}</Text>}
                {t.check_count === 0 && <Text style={styles.noChecks}>—</Text>}
              </View>
            </View>
          ))}
        </View>
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, padding: 20, paddingBottom: 12 },
  childrenRow: { marginBottom: 16 },
  totalCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
    borderRadius: 14, padding: 16, marginBottom: 16, gap: 12,
  },
  totalWarning: { backgroundColor: colors.warning + '15' },
  totalOk: { backgroundColor: colors.secondary + '15' },
  totalText: { fontSize: 16, fontWeight: '700', color: colors.text },
  subjectCard: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  subjectHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  subjectName: { fontSize: 15, fontWeight: '700', color: colors.text },
  subjectTotal: { fontSize: 18, fontWeight: '800', color: colors.textLight },
  templateRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  templateName: { fontSize: 13, color: colors.text, flex: 1 },
  checksRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreChecks: { fontSize: 12, color: colors.warning, fontWeight: '700', marginLeft: 4 },
  noChecks: { fontSize: 14, color: colors.textLight },
});
