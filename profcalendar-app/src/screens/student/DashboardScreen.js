import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import GradeCard from '../../components/GradeCard';
import RemarkCard from '../../components/RemarkCard';
import colors from '../../theme/colors';

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/student/dashboard');
      setData(res.data);
    } catch (err) {
      console.log('Dashboard error:', err.response?.data);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const markRead = async (id) => {
    try {
      await api.post(`/student/remarks/${id}/read`);
      fetchData();
    } catch (e) {}
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      {/* En-tête */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <View>
          <Text style={styles.greeting}>Bonjour, {user?.first_name} !</Text>
          <Text style={styles.classroom}>{data?.student?.classroom || ''}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Stats rapides */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="school" size={24} color={colors.primary} />
          <Text style={styles.statNumber}>{data?.recent_grades?.length || 0}</Text>
          <Text style={styles.statLabel}>Notes récentes</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="document-text" size={24} color={colors.secondary} />
          <Text style={styles.statNumber}>{data?.recent_files?.length || 0}</Text>
          <Text style={styles.statLabel}>Fichiers</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="chatbubble" size={24} color={colors.warning} />
          <Text style={styles.statNumber}>{data?.unread_remarks_count || 0}</Text>
          <Text style={styles.statLabel}>Non lues</Text>
        </View>
      </View>

      {/* Notes récentes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes récentes</Text>
        {data?.recent_grades?.length > 0 ? (
          data.recent_grades.slice(0, 5).map((g) => (
            <GradeCard key={g.id} grade={g} />
          ))
        ) : (
          <Text style={styles.empty}>Aucune note pour le moment</Text>
        )}
      </View>

      {/* Remarques */}
      {data?.remarks?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remarques</Text>
          {data.remarks.slice(0, 5).map((r) => (
            <RemarkCard key={r.id} remark={r} onMarkRead={markRead} />
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 8,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.text },
  classroom: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statNumber: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 10 },
  empty: { fontSize: 14, color: colors.textLight, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
});
