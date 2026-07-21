import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { setOnUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null); // 'student' | 'parent'
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Déconnexion propre quand un appel renvoie 401 (jeton expiré/invalide) :
  // l'intercepteur du client a déjà vidé le stockage, on nettoie l'état de
  // l'UI pour revenir immédiatement à l'écran de connexion (avant, l'app
  // restait « connectée » avec des écrans en échec jusqu'au relancement).
  useEffect(() => {
    setOnUnauthorized(() => {
      setToken(null);
      setUser(null);
      setUserType(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  // Restaurer la session au démarrage — l'utilisateur reste connecté tant
  // qu'il ne s'est pas déconnecté.
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('token');
        const storedUser = await SecureStore.getItemAsync('user');
        const storedType = await SecureStore.getItemAsync('userType');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          setUserType(storedType);

          // Rafraîchissement GLISSANT (non bloquant) : ré-émet un jeton neuf
          // de 365 j à chaque démarrage. Si le jeton est mort (401),
          // l'intercepteur vide le stockage et déconnecte l'UI ; toute autre
          // erreur (hors-ligne, serveur indisponible…) est ignorée pour ne
          // jamais déconnecter un utilisateur hors-ligne.
          api.post('/auth/refresh')
            .then(async (res) => {
              const fresh = res.data && res.data.token;
              if (fresh) {
                await SecureStore.setItemAsync('token', fresh);
                setToken(fresh);
              }
            })
            .catch(() => {});
        }
      } catch (e) {
        console.log('Erreur restauration session:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (type, credentials) => {
    const endpoint = type === 'student'
      ? '/auth/student/login'
      : '/auth/parent/login';

    const res = await api.post(endpoint, credentials);
    const { token: jwt, user: userData } = res.data;

    await SecureStore.setItemAsync('token', jwt);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    await SecureStore.setItemAsync('userType', type);

    setToken(jwt);
    setUser(userData);
    setUserType(type);

    return userData;
  };

  const register = async (type, data) => {
    const endpoint = type === 'student'
      ? '/auth/student/register'
      : '/auth/parent/register';

    const res = await api.post(endpoint, data);
    return res.data;
  };

  const verifyEmail = async (type, data) => {
    const endpoint = type === 'student'
      ? '/auth/student/verify-email'
      : '/auth/parent/verify-email';

    const res = await api.post(endpoint, data);
    const { token: jwt, user: userData } = res.data;

    await SecureStore.setItemAsync('token', jwt);
    await SecureStore.setItemAsync('user', JSON.stringify(userData));
    await SecureStore.setItemAsync('userType', type);

    setToken(jwt);
    setUser(userData);
    setUserType(type);

    return userData;
  };

  const updateUser = async (newUserData) => {
    setUser(newUserData);
    await SecureStore.setItemAsync('user', JSON.stringify(newUserData));
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('userType');
    setToken(null);
    setUser(null);
    setUserType(null);
  };

  // Suppression de compte (exigence App Store 5.1.1).
  // Lève une erreur si le mot de passe est incorrect (gérée par l'appelant) ;
  // en cas de succès, déconnecte et nettoie le stockage local.
  const deleteAccount = async (password) => {
    const endpoint = userType === 'student'
      ? '/auth/student/delete-account'
      : '/auth/parent/delete-account';
    await api.post(endpoint, { password });
    await logout();
  };

  return (
    <AuthContext.Provider
      value={{ user, userType, token, loading, login, register, verifyEmail, updateUser, logout, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
