import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function TeachersScreen() {
  const insets = useSafeAreaInsets();
  const [teachers, setTeachers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTeachers = async () => {
    try {
      const res = await api.get('/student/teachers');
      setTeachers(res.data.teachers || []);
    } catch (err) {
      console.log('Teachers error:', err.response?.data);
    }
  };

  useFocusEffect(useCallback(() => { fetchTeachers(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTeachers();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
    >
      <Text style={[styles.pageTitle, { paddingTop: Math.max(insets.top + 8, 20) }]}>Mes Enseignants</Text>

      <View style={styles.list}>
        {teachers.length === 0 ? (
          <Text style={styles.empty}>Aucun enseignant trouvé</Text>
        ) : (
          teachers.map((t, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.initials}>{t.name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.subject}>{t.subject} · {t.role}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(`mailto:${t.email}`)}>
                  <Text style={styles.email}>{t.email}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.mailBtn}
                onPress={() => Linking.openURL(`mailto:${t.email}`)}
              >
                <Ionicons name="mail" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, padding: 20, paddingBottom: 16 },
  list: { paddingHorizontal: 16 },
  empty: { fontSize: 14, color: colors.textLight, textAlign: 'center', padding: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  initials: { fontSize: 18, fontWeight: '700', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  subject: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  email: { fontSize: 12, color: colors.primary, marginTop: 2 },
  mailBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
});
