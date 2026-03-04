import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../api/client';
import RemarkCard from '../../components/RemarkCard';
import colors from '../../theme/colors';

export default function RemarksScreen() {
  const [remarks, setRemarks] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRemarks = async () => {
    try {
      const res = await api.get('/parent/remarks');
      setRemarks(res.data.remarks || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.log('Remarks error:', err);
    }
  };

  useFocusEffect(useCallback(() => { fetchRemarks(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRemarks();
    setRefreshing(false);
  };

  const markRead = async (id) => {
    try {
      await api.post(`/parent/remarks/${id}/read`);
      fetchRemarks();
    } catch (e) {}
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.info]} />}
    >
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</Text>
        </View>
      )}

      <View style={styles.list}>
        {remarks.length === 0 ? (
          <Text style={styles.empty}>Aucune remarque</Text>
        ) : (
          remarks.map((r) => (
            <RemarkCard key={r.id} remark={r} onMarkRead={markRead} />
          ))
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  badge: {
    backgroundColor: colors.info + '15', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 12,
  },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.info },
  list: {},
  empty: { fontSize: 14, color: colors.textLight, textAlign: 'center', padding: 40 },
});
