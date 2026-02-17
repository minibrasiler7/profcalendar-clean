import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/student/DashboardScreen';
import GradesScreen from '../screens/student/GradesScreen';
import FilesScreen from '../screens/student/FilesScreen';
import TeachersScreen from '../screens/student/TeachersScreen';
import colors from '../theme/colors';

const Tab = createBottomTabNavigator();

export default function StudentNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { paddingBottom: 4, height: 56 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'home',
            Notes: 'school',
            Fichiers: 'document-text',
            Profs: 'people',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Notes" component={GradesScreen} />
      <Tab.Screen name="Fichiers" component={FilesScreen} />
      <Tab.Screen name="Profs" component={TeachersScreen} options={{ title: 'Enseignants' }} />
    </Tab.Navigator>
  );
}
