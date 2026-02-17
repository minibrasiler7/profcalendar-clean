import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RoleSelectScreen from '../screens/auth/RoleSelectScreen';
import StudentLoginScreen from '../screens/auth/StudentLoginScreen';
import StudentRegisterScreen from '../screens/auth/StudentRegisterScreen';
import ParentLoginScreen from '../screens/auth/ParentLoginScreen';
import ParentRegisterScreen from '../screens/auth/ParentRegisterScreen';
import VerifyEmailScreen from '../screens/auth/VerifyEmailScreen';
import LinkChildScreen from '../screens/auth/LinkChildScreen';
import colors from '../theme/colors';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="RoleSelect"
        component={RoleSelectScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentLogin"
        component={StudentLoginScreen}
        options={{ title: 'Connexion Élève' }}
      />
      <Stack.Screen
        name="StudentRegister"
        component={StudentRegisterScreen}
        options={{ title: 'Inscription Élève' }}
      />
      <Stack.Screen
        name="ParentLogin"
        component={ParentLoginScreen}
        options={{ title: 'Connexion Parent' }}
      />
      <Stack.Screen
        name="ParentRegister"
        component={ParentRegisterScreen}
        options={{ title: 'Inscription Parent' }}
      />
      <Stack.Screen
        name="VerifyEmail"
        component={VerifyEmailScreen}
        options={{ title: 'Vérification Email' }}
      />
      <Stack.Screen
        name="LinkChild"
        component={LinkChildScreen}
        options={{ title: 'Lier un enfant' }}
      />
    </Stack.Navigator>
  );
}
