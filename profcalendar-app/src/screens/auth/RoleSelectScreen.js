import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../theme/colors';

export default function RoleSelectScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Ionicons name="calendar" size={48} color="#FFF" />
        </View>
        <Text style={styles.appName}>ProfCalendar</Text>
        <Text style={styles.subtitle}>Choisissez votre profil</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('StudentLogin')}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="school" size={36} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>Élève</Text>
          <Text style={styles.cardDesc}>Accédez à vos notes, fichiers et remarques</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ParentLogin')}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.secondary + '20' }]}>
            <Ionicons name="people" size={36} color={colors.secondary} />
          </View>
          <Text style={styles.cardTitle}>Parent</Text>
          <Text style={styles.cardDesc}>Suivez la scolarité de vos enfants</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  appName: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
  cards: { paddingHorizontal: 24, gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  cardDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
});
