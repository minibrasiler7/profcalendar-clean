import React, { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import api from '../api/client';
import { registerPushToken } from '../services/push';
import DashboardScreen from '../screens/student/DashboardScreen';
import DevoirsScreen from '../screens/student/DevoirsScreen';
import GradesScreen from '../screens/student/GradesScreen';
import FilesScreen from '../screens/student/FilesScreen';
import TeachersScreen from '../screens/student/TeachersScreen';
import MissionsScreen from '../screens/student/MissionsScreen';
import ExerciseSolveScreen from '../screens/student/ExerciseSolveScreen';
import colors from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MissionsStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MissionsList"
        component={MissionsScreen}
        options={{
          title: 'Missions',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="ExerciseSolve"
        component={ExerciseSolveScreen}
        options={{
          title: 'Résoudre',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </Stack.Navigator>
  );
}

export default function StudentNavigator() {
  // Pastille « devoirs à rendre » sur l'onglet Devoirs : devoirs de type
  // « à rendre » non rendus et pas encore échus. Rafraîchie au montage, au
  // retour au premier plan et à la réception d'une notification push.
  const [devoirsBadge, setDevoirsBadge] = useState(0);

  const refreshDevoirsBadge = useCallback(async () => {
    try {
      const res = await api.get('/student/devoirs');
      const today = new Date().toISOString().slice(0, 10);
      const count = (res.data.devoirs || []).filter(
        (d) => d.type === 'submission' && !d.submitted && d.due_date && d.due_date >= today
      ).length;
      setDevoirsBadge(count);
    } catch (e) {
      // silencieux : la pastille n'est pas critique
    }
  }, []);

  useEffect(() => {
    registerPushToken();
    refreshDevoirsBadge();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDevoirsBadge();
    });
    const notifSub = Notifications.addNotificationReceivedListener(() => refreshDevoirsBadge());
    return () => {
      appStateSub.remove();
      notifSub.remove();
    };
  }, [refreshDevoirsBadge]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { paddingBottom: 4, height: 56 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'home',
            Devoirs: 'book',
            Notes: 'school',
            Fichiers: 'document-text',
            Missions: 'game-controller',
            Profs: 'people',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen
        name="Devoirs"
        component={DevoirsScreen}
        options={{ tabBarBadge: devoirsBadge > 0 ? devoirsBadge : undefined }}
      />
      <Tab.Screen name="Notes" component={GradesScreen} />
      <Tab.Screen name="Fichiers" component={FilesScreen} />
      <Tab.Screen
        name="Missions"
        component={MissionsStackNavigator}
        options={{ title: 'Missions' }}
      />
      <Tab.Screen name="Profs" component={TeachersScreen} options={{ title: 'Enseignants' }} />
    </Tab.Navigator>
  );
}
