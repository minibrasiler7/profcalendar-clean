import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function MissionsScreen({ navigation }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rpgData, setRpgData] = useState(null);

  const fetchData = async () => {
    try {
      const [missionsRes, rpgRes] = await Promise.all([
        api.get('/student/missions'),
        api.get('/student/rpg/profile'),
      ]);
      setMissions(missionsRes.data.missions || []);
      setRpgData(rpgRes.data);
    } catch (err) {
      console.log('Missions error:', err.response?.data);
    } finally {
      setLoading(false);
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

  const goToRPGDashboard = () => {
    navigation.getParent().navigate('RPG');
  };

  const handleMissionPress = (mission) => {
    navigation.navigate('ExerciseSolve', { missionId: mission.id });
  };

  const renderMissionItem = ({ item }) => {
    const statusColor = item.status === 'completed' ? colors.success : colors.warning;
    const statusLabel = item.status === 'completed' ? 'Complété' : 'À faire';

    return (
      <TouchableOpacity
        style={styles.missionCard}
        onPress={() => handleMissionPress(item)}
        disabled={item.status === 'completed'}
      >
        <View style={styles.missionHeader}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionTitle}>{item.exercise_title}</Text>
            <Text style={styles.missionSubject}>{item.subject}</Text>
          </View>
          <View style={styles.missionRight}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.missionFooter}>
          <View style={styles.xpBadge}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.xpText}>+{item.xp_reward} XP</Text>
          </View>
          {item.status !== 'completed' && (
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !rpgData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* RPG Mini Bar */}
      {rpgData && (
        <View style={styles.rpgBar}>
          <View style={styles.rpgInfo}>
            <Text style={styles.rpgLevel}>Niveau {rpgData.level}</Text>
            <View style={styles.xpBarContainer}>
              <View
                style={[
                  styles.xpBarFill,
                  { width: `${(rpgData.current_xp / rpgData.next_level_xp) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.xpBarLabel}>
              {rpgData.current_xp} / {rpgData.next_level_xp} XP
            </Text>
          </View>
          <TouchableOpacity style={styles.rpgButton} onPress={goToRPGDashboard}>
            <Ionicons name="trophy" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={missions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMissionItem}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune mission pour le moment</Text>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  rpgBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rpgInfo: { flex: 1 },
  rpgLevel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
  xpBarContainer: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  xpBarFill: { height: '100%', backgroundColor: colors.warning },
  xpBarLabel: { fontSize: 11, color: colors.textSecondary },
  rpgButton: { padding: 8, marginLeft: 12 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20 },
  missionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  missionInfo: { flex: 1 },
  missionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  missionSubject: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  missionRight: { marginLeft: 12 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  missionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  xpText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  empty: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 40,
    fontStyle: 'italic',
  },
});
