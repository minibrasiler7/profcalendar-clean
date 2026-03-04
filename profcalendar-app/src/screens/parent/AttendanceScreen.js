import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import ChildCard from '../../components/ChildCard';
import colors from '../../theme/colors';

export default function AttendanceScreen() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChildren = async () => {
    try {
      const res = await api.get('/parent/dashboard');
      const kids = res.data.children || [];
      setChildren(kids);
      if (kids.length > 0 && !selectedChild) {
        setSelectedChild(kids[0]);
        fetchAttendance(kids[0].id);
      }
    } catch (err) {
      console.log('Children error:', err);
    }
  };

  const fetchAttendance = async (studentId) => {
    try {
      const res = await api.get(`/parent/children/${studentId}/attendance`);
      setAttendance(res.data.attendance_data || []);
    } catch (err) {
      console.log('Attendance error:', err);
    }
  };

  useFocusEffect(useCallback(() => { fetchChildren(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChildren();
    if (selectedChild) await fetchAttendance(selectedChild.id);
    setRefreshing(false);
  };

  const selectChild = (child) => {
    setSelectedChild(child);
    fetchAttendance(child.id);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={styles.pageTitle}>Absences & Retards</Text>

      {/* Sélecteur d'enfant */}
      {children.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childrenRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {children.map((c) => (
            <ChildCard key={c.id} child={c} selected={selectedChild?.id === c.id} onPress={selectChild} />
          ))}
        </ScrollView>
      )}

      {/* Données */}
      {attendance.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle" size={48} color={colors.secondary} />
          <Text style={styles.emptyText}>Aucune absence ou retard</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {attendance.map((day, i) => (
            <View key={i} style={styles.dayCard}>
              <Text style={styles.dayDate}>{day.date}</Text>
              {day.periods.map((p, j) => (
                <View key={j} style={styles.periodRow}>
                  <View style={[styles.statusDot, { backgroundColor: p.status === 'absent' ? colors.absent : colors.late }]} />
                  <Text style={styles.periodText}>
                    P{p.period} — {p.status === 'absent' ? 'Absent' : `Retard${p.late_minutes ? ` (${p.late_minutes} min)` : ''}`}
                  </Text>
                  {p.subject ? <Text style={styles.periodSubject}>{p.subject}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, padding: 20, paddingBottom: 12 },
  childrenRow: { marginBottom: 16 },
  emptyBox: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 12 },
  list: { paddingHorizontal: 16 },
  dayCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  dayDate: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  periodText: { fontSize: 14, color: colors.text, flex: 1 },
  periodSubject: { fontSize: 12, color: colors.textSecondary },
});
