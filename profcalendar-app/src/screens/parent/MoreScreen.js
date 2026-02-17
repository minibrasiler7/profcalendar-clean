import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import colors from '../../theme/colors';

export default function MoreScreen({ navigation }) {
  const { logout } = useAuth();

  const items = [
    { icon: 'chatbubble-ellipses', label: 'Remarques des enseignants', screen: 'Remarks', color: colors.info },
    { icon: 'people', label: 'Enseignants', screen: 'Teachers', color: colors.primary },
    { icon: 'document-text', label: 'Justifier une absence', screen: 'JustifyAbsence', color: colors.secondary },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.row}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={[styles.iconCircle, { backgroundColor: item.color + '15' }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <Text style={styles.label}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutRow} onPress={logout}>
        <Ionicons name="log-out-outline" size={22} color={colors.error} />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  list: { marginBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.error },
});
