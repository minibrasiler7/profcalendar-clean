import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/parent/DashboardScreen';
import AttendanceScreen from '../screens/parent/AttendanceScreen';
import GradesScreen from '../screens/parent/GradesScreen';
import SanctionsScreen from '../screens/parent/SanctionsScreen';
import MoreScreen from '../screens/parent/MoreScreen';
import TeachersScreen from '../screens/parent/TeachersScreen';
import RemarksScreen from '../screens/parent/RemarksScreen';
import JustifyAbsenceScreen from '../screens/parent/JustifyAbsenceScreen';
import AddChildScreen from '../screens/parent/AddChildScreen';
import colors from '../theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#FFF',
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: 'Plus' }} />
      <Stack.Screen name="Teachers" component={TeachersScreen} options={{ title: 'Enseignants' }} />
      <Stack.Screen name="Remarks" component={RemarksScreen} options={{ title: 'Remarques' }} />
      <Stack.Screen name="JustifyAbsence" component={JustifyAbsenceScreen} options={{ title: 'Justifier absence' }} />
      <Stack.Screen name="AddChild" component={AddChildScreen} options={{ title: 'Ajouter un enfant' }} />
    </Stack.Navigator>
  );
}

export default function ParentNavigator() {
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
            Accueil: 'home',
            Notes: 'school',
            Absences: 'calendar',
            Coches: 'warning',
            Plus: 'ellipsis-horizontal',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Accueil" component={DashboardScreen} />
      <Tab.Screen name="Notes" component={GradesScreen} />
      <Tab.Screen name="Absences" component={AttendanceScreen} />
      <Tab.Screen name="Coches" component={SanctionsScreen} />
      <Tab.Screen name="Plus" component={MoreStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
