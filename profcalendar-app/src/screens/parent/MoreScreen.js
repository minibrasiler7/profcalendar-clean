import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import DeleteAccountModal from '../../components/DeleteAccountModal';
import colors from '../../theme/colors';

export default function MoreScreen({ navigation }) {
  const { logout } = useAuth();
  const [showDelete, setShowDelete] = useState(false);

  const items = [
    { icon: 'person-add', label: 'Ajouter un enfant', screen: 'AddChild', color: colors.success || '#22C55E' },
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

      <TouchableOpacity style={styles.deleteRow} onPress={() => setShowDelete(true)}>
        <Ionicons name="trash-outline" size={20} color={colors.error} />
        <Text style={styles.deleteText}>Supprimer mon compte</Text>
      </TouchableOpacity>

      <DeleteAccountModal visible={showDelete} onClose={() => setShowDelete(false)} />
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
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
  },
  deleteText: {
    fontSize: 14, fontWeight: '600', color: colors.error, textDecorationLine: 'underline',
  },
});
