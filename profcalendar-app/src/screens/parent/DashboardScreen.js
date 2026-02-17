import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ChildCard from '../../components/ChildCard';
import colors from '../../theme/colors';

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/parent/dashboard');
      setData(res.data);
    } catch (err) {
      console.log('Dashboard error:', err.response?.data);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const children = data?.children || [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.secondary]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour, {user?.first_name || 'Parent'} !</Text>
          <Text style={styles.subtitle}>
            {children.length} enfant{children.length > 1 ? 's' : ''} lié{children.length > 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Enfants */}
      {children.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childrenRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {children.map((child) => (
            <ChildCard key={child.id} child={child} onPress={() => {}} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="person-add" size={40} color={colors.textLight} />
          <Text style={styles.emptyText}>Aucun enfant lié</Text>
          <Text style={styles.emptyHint}>Utilisez le menu "Plus" pour ajouter un enfant</Text>
        </View>
      )}

      {/* Stats rapides */}
      {data?.unread_remarks_count > 0 && (
        <View style={styles.alertCard}>
          <Ionicons name="chatbubble-ellipses" size={24} color={colors.warning} />
          <View style={styles.alertInfo}>
            <Text style={styles.alertTitle}>{data.unread_remarks_count} remarque{data.unread_remarks_count > 1 ? 's' : ''} non lue{data.unread_remarks_count > 1 ? 's' : ''}</Text>
            <Text style={styles.alertHint}>Consultez l'onglet "Plus" pour les voir</Text>
          </View>
        </View>
      )}

      {/* Navigation rapide */}
      <Text style={styles.sectionTitle}>Accès rapide</Text>
      <View style={styles.quickActions}>
        {[
          { icon: 'school', label: 'Notes', tab: 'Notes', color: colors.primary },
          { icon: 'calendar', label: 'Absences', tab: 'Absences', color: colors.error },
          { icon: 'warning', label: 'Coches', tab: 'Coches', color: colors.warning },
          { icon: 'chatbubble', label: 'Remarques', tab: 'Plus', color: colors.info },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.quickAction}
            onPress={() => navigation.navigate(item.tab)}
          >
            <View style={[styles.quickIcon, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon} size={24} color={item.color} />
            </View>
            <Text style={styles.quickLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: { padding: 8 },
  childrenRow: { marginBottom: 16 },
  emptyBox: {
    alignItems: 'center', padding: 32, marginHorizontal: 16,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    marginBottom: 16,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 },
  emptyHint: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.warning + '15', borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginBottom: 16,
  },
  alertInfo: { marginLeft: 12, flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  alertHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: 20, marginBottom: 10 },
  quickActions: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10,
  },
  quickAction: {
    width: '47%', backgroundColor: colors.surface, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  quickIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  quickLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
});
