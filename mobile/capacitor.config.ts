import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ch.teacherplanner.parents',
  appName: 'TeacherPlanner Parents',
  webDir: 'web-dist',
  bundledWebRuntime: false,
  // URL de l'app parents (prod/dev) pour charger la webapp existante
  server: {
    url: process.env.MOBILE_WEB_URL || 'https://profcalendar-clean-dev.onrender.com/parent/login',
    cleartext: false
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
