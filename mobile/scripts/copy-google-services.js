/**
 * Copie google-services.json vers android/app/ en fonction du profil (parents | students).
 * Usage :
 *   node scripts/copy-google-services.js parents
 *   node scripts/copy-google-services.js students
 */
const fs = require('fs');
const path = require('path');

const variant = (process.argv[2] || 'parents').toLowerCase();
const projectRoot = path.join(__dirname, '..');
const androidAppDir = path.join(projectRoot, 'android', 'app');
const dest = path.join(androidAppDir, 'google-services.json');

const candidateDirs =
  variant === 'students'
    ? [
        path.join(projectRoot, 'firebase', 'students'),
        path.join(projectRoot, 'firebase', 'eleves'), // ASCII fallback
        path.join(projectRoot, 'firebase', 'élèves') // accent fallback
      ]
    : [path.join(projectRoot, 'firebase', 'parents')];

const source = candidateDirs
  .map((dir) => path.join(dir, 'google-services.json'))
  .find((p) => fs.existsSync(p));

if (!source) {
  console.error(`[copy-google-services] Fichier introuvable pour '${variant}'. Cherché dans :`);
  candidateDirs.forEach((d) => console.error(` - ${d}`));
  process.exit(1);
}

if (!fs.existsSync(androidAppDir)) {
  console.error(`[copy-google-services] Dossier ${androidAppDir} manquant. Lancez d'abord 'npx cap add android'.`);
  process.exit(1);
}

fs.copyFileSync(source, dest);
console.log(`[copy-google-services] Copié ${source} -> ${dest}`);
