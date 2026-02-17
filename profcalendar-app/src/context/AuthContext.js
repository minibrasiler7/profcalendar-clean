import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null); // 'student' | 'parent'
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaurer la session au démarrage
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

  const logout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('userType');
    setToken(null);
    setUser(null);
    setUserType(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, userType, token, loading, login, register, verifyEmail, logout }}
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
