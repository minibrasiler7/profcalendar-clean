import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/student/DashboardScreen';
import GradesScreen from '../screens/student/GradesScreen';
import FilesScreen from '../screens/student/FilesScreen';
import TeachersScreen from '../screens/student/TeachersScreen';
import MissionsScreen from '../screens/student/MissionsScreen';
import ExerciseSolveScreen from '../screens/student/ExerciseSolveScreen';
import RPGDashboardScreen from '../screens/student/RPGDashboardScreen';
import CombatScreen from '../screens/student/CombatScreen';
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

function RPGStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="RPGProfile"
        component={RPGDashboardScreen}
        options={{
          title: 'Profil RPG',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="Combat"
        component={CombatScreen}
        options={{
          title: 'Combat',
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </Stack.Navigator>
  );
}

export default function StudentNavigator() {
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
            Notes: 'school',
            Fichiers: 'document-text',
            Missions: 'game-controller',
            RPG: 'trophy',
            Profs: 'people',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Notes" component={GradesScreen} />
      <Tab.Screen name="Fichiers" component={FilesScreen} />
      <Tab.Screen
        name="Missions"
        component={MissionsStackNavigator}
        options={{ title: 'Missions' }}
      />
      <Tab.Screen name="RPG" component={RPGStackNavigator} options={{ title: 'RPG' }} />
      <Tab.Screen name="Profs" component={TeachersScreen} options={{ title: 'Enseignants' }} />
    </Tab.Navigator>
  );
}
