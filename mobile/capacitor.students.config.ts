import { CapacitorConfig } from '@capacitor/cli';

// Config dédiée à l'app Élèves (URL dédiée)
const config: CapacitorConfig = {
  appId: 'ch.teacherplanner.students',
  appName: 'ProfCalendar Élèves',
  webDir: 'web-dist',
  bundledWebRuntime: false,
  server: {
    url: process.env.MOBILE_WEB_URL || 'https://profcalendar-clean-dev.onrender.com/student/login',
    cleartext: false
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
