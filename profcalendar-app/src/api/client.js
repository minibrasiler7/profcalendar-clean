import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ⚠️  Remplacer par l'URL de votre serveur en production
const API_BASE = 'https://profcalendar-clean.onrender.com/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Intercepteur : ajouter le JWT à chaque requête
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur : gérer les erreurs 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      await SecureStore.deleteItemAsync('userType');
      // Le contexte Auth détectera le token manquant
    }
    return Promise.reject(error);
  }
);

export default api;
