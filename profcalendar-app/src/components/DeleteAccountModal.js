import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import colors from '../theme/colors';

/**
 * Modal de suppression de compte (exigence App Store 5.1.1).
 * Utilisé par les écrans élève (Dashboard) et parent (More).
 * Demande le mot de passe en confirmation. En cas de succès, `deleteAccount`
 * déconnecte l'utilisateur → l'app revient automatiquement à l'écran de connexion.
 */
export default function DeleteAccountModal({ visible, onClose }) {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!password) {
      setError('Veuillez saisir votre mot de passe.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await deleteAccount(password);
      // Succès : deleteAccount() déconnecte → bascule vers l'écran de connexion.
    } catch (e) {
      const msg = e?.response?.data?.error || 'Erreur lors de la suppression. Réessayez.';
      setError(msg);
      setLoading(false);
    }
  };

  const close = () => {
    if (loading) return;
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning" size={28} color={colors.error} />
          </View>
          <Text style={styles.title}>Supprimer mon compte</Text>
          <Text style={styles.message}>
            Cette action est définitive. Vous ne pourrez plus vous connecter avec ce
            compte. Saisissez votre mot de passe pour confirmer.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textLight}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            editable={!loading}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, styles.btnDanger]}
            onPress={handleDelete}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnDangerText}>Supprimer définitivement</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btn} onPress={close} disabled={loading}>
            <Text style={styles.btnCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: 18, padding: 24, alignItems: 'center',
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.error + '15',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  message: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: 16,
  },
  input: {
    width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, marginBottom: 8,
  },
  error: { color: colors.error, fontSize: 13, marginBottom: 8, alignSelf: 'flex-start' },
  btn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnDanger: { backgroundColor: colors.error },
  btnDangerText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
