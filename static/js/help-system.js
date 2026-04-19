/**
 * ProfCalendar — Système d'aide intégré
 * Tour guidé + Tooltips contextuels + Panneau d'aide flottant
 */

// ============================================================
// CONTENU D'AIDE CONTEXTUEL PAR PAGE
// ============================================================
const HELP_CONTENT = {
    // =============================================
    // TABLEAU DE BORD
    // =============================================
    'planning.dashboard': {
        title: 'Tableau de bord',
        sections: [
            { title: 'Navigation', items: [
                { icon: 'fa-home', color: '#4F46E5', title: 'Actions rapides', desc: 'Les cartes colorees vous donnent un acces direct a toutes les fonctions.', steps: ['Cliquez sur une carte pour ouvrir la fonctionnalite correspondante', 'Les cartes avec un cadenas necessitent un abonnement Premium', 'La carte "Prochain cours" affiche votre prochaine lecon avec l\'heure'] },
                { icon: 'fa-sticky-note', color: '#F59E0B', title: 'Memos / Pense-betes', desc: 'Creez des rappels lies a vos classes pour ne rien oublier.', steps: ['Cliquez "Nouveau memo" en haut de la section', 'Choisissez la classe concernee', 'Selectionnez le type : "Prochaine lecon", "Date precise" ou "Sans date"', 'Redigez votre memo et cliquez "Enregistrer"', 'Cochez un memo pour le marquer comme termine'] },
                { icon: 'fa-handshake', color: '#06B6D4', title: 'Invitations de collaboration', desc: 'Gerez les demandes de partage de classe avec d\'autres enseignants.', steps: ['Les invitations apparaissent automatiquement ici', 'Cliquez "Accepter" pour partager votre classe avec le collegue', 'Cliquez "Refuser" et ajoutez un message explicatif si necessaire'] },
            ]},
        ]
    },

    // =============================================
    // VUE LECON
    // =============================================
    'planning.lesson_view': {
        title: 'Vue lecon',
        sections: [
            { title: 'Presences & suivi', items: [
                { icon: 'fa-user-check', color: '#10B981', title: 'Marquer les presences', desc: 'Gerez les presences, absences et retards de vos eleves.', steps: ['Cliquez sur le nom d\'un eleve vert pour le passer en absent (rouge)', 'Recliquez pour le remettre present', 'Pour un retard : entrez d\'abord les minutes dans le champ "min"', 'Puis cliquez sur le bouton horloge a droite du champ', 'Les compteurs Presents/Absents/Retards se mettent a jour en temps reel'] },
                { icon: 'fa-exclamation-triangle', color: '#F59E0B', title: 'Coches / Sanctions', desc: 'Comptez les oublis de materiel, bavardages ou autres comportements.', steps: ['Cliquez sur l\'onglet "Coches" a cote de "Presences"', 'Utilisez les boutons + et - pour chaque eleve/sanction', 'Le compteur s\'incremente/decremente immediatement', 'Les seuils d\'alerte se declenchent automatiquement si configures'] },
                { icon: 'fa-th', color: '#8B5CF6', title: 'Plan de classe', desc: 'Visualisez la disposition des tables et gerez les avertissements.', steps: ['Cliquez sur l\'onglet "Plan de classe"', 'Le plan montre les tables avec les noms des eleves', 'Cliquez sur une table pour ajouter un avertissement visuel', 'Les couleurs changent : jaune (1er avertissement) → rouge → noir', 'Cliquez "Annuler" pour reinitialiser tous les avertissements'] },
            ]},
            { title: 'Planification & ressources', items: [
                { icon: 'fa-edit', color: '#4F46E5', title: 'Planification du cours', desc: 'Redigez vos objectifs, taches et checklist pour la lecon.', steps: ['Cliquez le bouton "Modifier" a cote de "Planification du cours"', 'Redigez vos objectifs et le deroulement du cours', 'Ajoutez des elements de checklist avec les cases a cocher', 'Cliquez "Enregistrer" pour sauvegarder'] },
                { icon: 'fa-file-alt', color: '#06B6D4', title: 'Ajouter des ressources', desc: 'Liez des fichiers ou exercices a votre lecon.', steps: ['Cliquez le bouton vert "Ajout de fichiers"', 'Onglet "Fichiers de classe" : parcourez l\'arborescence de vos fichiers', 'Cliquez le bouton + vert a cote d\'un fichier pour l\'ajouter', 'Onglet "Exercices interactifs" : ajoutez un exercice a lancer', 'Les ressources ajoutees apparaissent dans la section du bas'] },
                { icon: 'fa-thumbtack', color: '#EF4444', title: 'Epingler une ressource', desc: 'Gardez vos fichiers importants en haut de la liste.', steps: ['Dans la liste des ressources, cliquez l\'icone epingle', 'Le fichier remonte en haut de la liste', 'Recliquez pour desepingler'] },
                { icon: 'fa-pencil-alt', color: '#10B981', title: 'Annotations PDF', desc: 'Annotez vos PDF directement dans la lecon.', steps: ['Cliquez sur un fichier PDF dans les ressources', 'Le PDF s\'ouvre dans le visualiseur integre', 'Sur iPad : utilisez votre stylet Apple Pencil directement', 'Sur ordinateur : utilisez les outils de dessin (stylo, surligneur, texte)', 'Les annotations sont sauvegardees automatiquement'] },
            ]},
            { title: 'Exercices & suivi', items: [
                { icon: 'fa-rocket', color: '#F59E0B', title: 'Lancer un exercice', desc: 'Publiez un exercice en mode classique ou combat pour vos eleves.', steps: ['Ajoutez d\'abord un exercice via "Ajout de fichiers" > onglet Exercices', 'Cliquez le bouton "Lancer" sur l\'exercice ajoute', 'Choisissez le mode : "Classique" (a leur rythme) ou "Combat" (gamifie)', 'Cliquez "Publier et lancer"', 'Le suivi en direct s\'affiche avec la progression de chaque eleve'] },
                { icon: 'fa-columns', color: '#8B5CF6', title: 'Disposition de la page', desc: 'Changez l\'agencement de la page selon vos besoins.', steps: ['En haut a droite, cliquez les icones de disposition', 'Mode grille : 3 colonnes equilibrees', 'Mode planification : planification en grand a gauche', 'Mode ressources : fichiers en grand a droite', 'Mode presences : suivi des eleves en grand'] },
            ]},
        ]
    },

    // =============================================
    // GESTION DE CLASSE
    // =============================================
    'planning.manage_classes': {
        title: 'Gestion de classe',
        sections: [
            { title: 'Eleves', items: [
                { icon: 'fa-user-plus', color: '#10B981', title: 'Ajouter un eleve', desc: 'Inscrivez manuellement un eleve dans votre classe.', steps: ['Cliquez "+ Ajouter un eleve"', 'Remplissez le prenom (obligatoire) et le nom de famille', 'Optionnel : ajoutez l\'email de l\'eleve pour qu\'il cree un compte', 'Optionnel : ajoutez les emails des parents (mere et/ou pere)', 'Cliquez "Enregistrer"'] },
                { icon: 'fa-key', color: '#F59E0B', title: 'Codes d\'acces eleves & parents', desc: 'Generez des codes pour que eleves et parents creent leur compte.', steps: ['Cliquez le bouton violet "Code eleves" en haut', 'Un code unique s\'affiche (ex: X6VRK6)', 'Communiquez ce code a vos eleves', 'Ils l\'utilisent sur la page d\'inscription eleve pour rejoindre la classe', 'Le bouton "Code parents" fonctionne de la meme maniere pour les parents'] },
                { icon: 'fa-edit', color: '#4F46E5', title: 'Modifier / supprimer un eleve', desc: 'Editez les informations ou retirez un eleve.', steps: ['Cliquez l\'icone crayon a cote du nom de l\'eleve pour modifier', 'Cliquez l\'icone poubelle pour supprimer (confirmation demandee)', 'Attention : la suppression supprime aussi ses notes et presences'] },
            ]},
            { title: 'Notes & evaluations', items: [
                { icon: 'fa-chart-bar', color: '#06B6D4', title: 'Creer une evaluation', desc: 'Ajoutez un test, devoir ou examen pour saisir les notes.', steps: ['Cliquez l\'onglet "Notes"', 'Cliquez "+ Nouvelle evaluation" a cote du nom de la matiere', 'Remplissez : titre, date, note maximale, note minimale', 'Choisissez le type : "Test significatif" (compte seul) ou "TA" (groupe avec d\'autres)', 'Cliquez "Suivant : Saisir les notes"', 'Entrez la note de chaque eleve (laissez vide si absent)', 'Cliquez "Creer l\'evaluation"'] },
                { icon: 'fa-calculator', color: '#10B981', title: 'Consulter les moyennes', desc: 'Visualisez les notes et moyennes de vos eleves.', steps: ['L\'onglet Notes affiche le tableau avec une colonne par evaluation', 'La colonne "Moyenne" calcule automatiquement la moyenne de chaque eleve', 'Les notes sont cliquables pour les modifier', 'Les statistiques en haut montrent : nombre d\'eleves, evaluations, moyenne classe'] },
            ]},
            { title: 'Fichiers de classe', items: [
                { icon: 'fa-folder-plus', color: '#8B5CF6', title: 'Gerer les fichiers de classe', desc: 'Organisez les documents partages avec la classe.', steps: ['Cliquez l\'onglet "Fichiers"', 'Cliquez "Nouveau dossier" pour creer une arborescence', 'Cliquez "Uploader" pour ajouter des fichiers', 'Utilisez le fil d\'Ariane en haut pour naviguer', 'Cliquez un fichier pour le telecharger ou le previsualiser'] },
            ]},
            { title: 'Absences & comportement', items: [
                { icon: 'fa-clipboard-check', color: '#EF4444', title: 'Suivi des absences', desc: 'Consultez l\'historique des absences et retards par eleve.', steps: ['Cliquez l\'onglet "Absences"', 'Choisissez le sous-onglet : Absences totales, Retards, ou Justifiees', 'Le tableau liste chaque absence avec la date et la periode', 'Les parents peuvent justifier les absences depuis leur espace'] },
                { icon: 'fa-exclamation-circle', color: '#F59E0B', title: 'Configurer les coches/sanctions', desc: 'Definissez les types de sanctions et les seuils d\'alerte.', steps: ['Cliquez l\'onglet "Coches"', 'Basculez entre mode "Manuel" et "Automatique"', 'En mode manuel : utilisez les boutons + et - par eleve', 'En mode auto : les coches s\'incrementent selon les regles definies', 'Cliquez "Reinitialiser" pour remettre tous les compteurs a zero'] },
            ]},
            { title: 'Plan de classe & groupes', items: [
                { icon: 'fa-th-large', color: '#4F46E5', title: 'Plan de classe', desc: 'Creez la disposition des tables dans votre salle.', steps: ['Cliquez l\'onglet "Plan de classe"', 'Utilisez les outils : "Table simple", "Table double", "Bureau prof"', 'Glissez les tables pour les positionner', 'Glissez les eleves sur les tables pour les placer', 'Cliquez "Sauvegarder" quand le plan est pret', 'Cliquez "Imprimer" pour obtenir une version papier'] },
                { icon: 'fa-users-cog', color: '#06B6D4', title: 'Groupes d\'eleves', desc: 'Creez des sous-groupes pour le travail en equipe.', steps: ['Cliquez l\'onglet "Groupes"', 'Cliquez "Creer un groupe"', 'Donnez un nom au groupe', 'Selectionnez les eleves a inclure', 'Cliquez "Enregistrer"', 'Les groupes sont utilisables dans le plan de classe et les exercices'] },
                { icon: 'fa-universal-access', color: '#10B981', title: 'Amenagements', desc: 'Definissez les amenagements pour les eleves a besoins particuliers.', steps: ['Cliquez l\'onglet "Amenagements"', 'Cliquez "Ajouter un amenagement"', 'Selectionnez l\'eleve concerne', 'Choisissez le type et ajoutez les details', 'L\'amenagement s\'affiche avec une icone a cote du nom de l\'eleve'] },
            ]},
        ]
    },

    // =============================================
    // CALENDRIER
    // =============================================
    'planning.calendar_view': {
        title: 'Calendrier',
        sections: [
            { title: 'Vue hebdomadaire', items: [
                { icon: 'fa-chevron-left', color: '#4F46E5', title: 'Naviguer entre les semaines', desc: 'Parcourez votre emploi du temps semaine par semaine.', steps: ['Cliquez la fleche < pour la semaine precedente', 'Cliquez la fleche > pour la semaine suivante', 'Cliquez "Aujourd\'hui" pour revenir a la semaine courante', 'Le titre affiche la periode (ex: "Semaine du 14 au 18 avril 2026")'] },
                { icon: 'fa-plus-circle', color: '#10B981', title: 'Creer une planification', desc: 'Ajoutez une lecon ou un contenu a une periode.', steps: ['Cliquez sur une case de la grille hebdomadaire', 'Si la case est vide : un formulaire de creation s\'ouvre', 'Remplissez le titre du cours et la description', 'Cliquez "Enregistrer" pour creer la planification', 'Si la case a deja une lecon : le detail s\'affiche avec options modifier/supprimer'] },
                { icon: 'fa-expand', color: '#06B6D4', title: 'Vue etendue', desc: 'Affichez plus de details sur chaque periode.', steps: ['Cliquez le bouton "Vue etendue" en haut a droite', 'La grille s\'elargit pour montrer les titres des planifications', 'Recliquez pour revenir a la vue compacte'] },
            ]},
            { title: 'Vue annuelle', items: [
                { icon: 'fa-calendar-alt', color: '#8B5CF6', title: 'Calendrier annuel', desc: 'Visualisez toute votre annee scolaire en un coup d\'oeil.', steps: ['La vue annuelle est dans la colonne droite', 'Chaque case represente une semaine', 'Les cases colorees indiquent des cours planifies', 'Cliquez sur une semaine pour naviguer vers cette semaine', 'Les semaines de vacances sont grisees'] },
                { icon: 'fa-file-alt', color: '#10B981', title: 'Feuilles blanches', desc: 'Creez des documents vierges rattaches a une date.', steps: ['Cliquez "Feuilles blanches" dans le panneau ressources', 'Cliquez "Creer une nouvelle feuille"', 'La feuille s\'ouvre dans un editeur', 'Elle est automatiquement liee a la date et periode courantes'] },
            ]},
        ]
    },

    // =============================================
    // EDITEUR D'EXERCICES
    // =============================================
    'exercises.create_exercise': {
        title: 'Editeur d\'exercices',
        sections: [
            { title: 'Parametres de l\'exercice', items: [
                { icon: 'fa-cog', color: '#4F46E5', title: 'Configuration de base', desc: 'Definissez le titre, la description et les parametres.', steps: ['Remplissez le titre de l\'exercice (obligatoire)', 'Ajoutez une description (optionnel)', 'Selectionnez la matiere et le niveau', 'Cochez "Tolerer les fautes d\'orthographe" si vous le souhaitez', 'Les XP totaux se calculent automatiquement selon les blocs ajoutes'] },
                { icon: 'fa-gamepad', color: '#F59E0B', title: 'Gamification (XP & badges)', desc: 'Configurez les recompenses pour motiver les eleves.', steps: ['Dans la section "Gamification" a gauche', 'Definissez le seuil de bonus or (% de reussite pour gagner de l\'or)', 'Definissez le seuil de badge (% pour obtenir un badge)', 'Les eleves gagnent des XP pour chaque bonne reponse', 'Le systeme de combo multiplie les XP pour les bonnes reponses consecutives'] },
            ]},
            { title: 'Types de blocs', items: [
                { icon: 'fa-list-ol', color: '#4F46E5', title: 'QCM (Choix multiples)', desc: 'Questions avec options a cocher.', steps: ['Cliquez le bouton "QCM" dans la zone de construction', 'Entrez la question dans le champ texte', 'Ajoutez des options de reponse', 'Cochez le radio-bouton de la bonne reponse', 'Pour plusieurs bonnes reponses : activez "Plusieurs bonnes reponses"', 'Ajoutez un feedback optionnel pour chaque option', 'Reglez le timer (secondes) et les XP'] },
                { icon: 'fa-pencil-alt', color: '#10B981', title: 'Reponse courte', desc: 'L\'eleve tape sa reponse en texte libre.', steps: ['Cliquez le bouton "Reponse courte"', 'Entrez la question', 'Entrez la reponse attendue dans le champ dedie', 'Si "Tolerer les fautes" est active, les reponses proches seront acceptees', 'Vous pouvez ajouter une image a la question'] },
                { icon: 'fa-text-width', color: '#06B6D4', title: 'Texte a trous', desc: 'L\'eleve complete un texte avec des mots manquants.', steps: ['Cliquez le bouton "Texte a trous"', 'Redigez le texte en utilisant [mot] pour creer un trou', 'Exemple : "La capitale de la France est [Paris]"', 'Chaque [mot] devient un champ a completer pour l\'eleve', 'Ajoutez des synonymes acceptes si necessaire'] },
                { icon: 'fa-sort', color: '#8B5CF6', title: 'Classement / Tri', desc: 'L\'eleve reordonne des elements dans le bon ordre.', steps: ['Cliquez le bouton "Classement"', 'Ajoutez les elements a trier', 'Definissez l\'ordre correct', 'L\'eleve pourra les reorganiser par glisser-deposer'] },
                { icon: 'fa-arrows-alt-h', color: '#EF4444', title: 'Correspondances / Associations', desc: 'L\'eleve relie des paires d\'elements.', steps: ['Cliquez le bouton "Associations"', 'Ajoutez les paires a relier (colonne gauche et droite)', 'L\'eleve tracera des lignes entre les elements correspondants'] },
                { icon: 'fa-image', color: '#F59E0B', title: 'Image interactive', desc: 'L\'eleve clique sur des zones d\'une image.', steps: ['Cliquez le bouton "Image interactive"', 'Uploadez une image de base', 'Definissez les zones cliquables et les reponses attendues', 'L\'eleve devra cliquer au bon endroit sur l\'image'] },
            ]},
            { title: 'Outils de dessin', items: [
                { icon: 'fa-paint-brush', color: '#8B5CF6', title: 'Modal de dessin', desc: 'Dessinez des schemas, graphiques ou illustrations.', steps: ['Cliquez l\'icone dessin dans un bloc de question', 'Une zone de dessin s\'ouvre avec la barre d\'outils', 'Outils disponibles : stylo, surligneur, gomme, regle, compas, rapporteur, arc', 'Outils de forme : fleche, rectangle, cercle, texte', 'Choisissez la couleur (7 options) et l\'epaisseur (5 tailles)', 'Utilisez les boutons annuler/retablir si besoin', 'Cliquez "Enregistrer" pour valider le dessin'] },
            ]},
            { title: 'Sauvegarder & publier', items: [
                { icon: 'fa-save', color: '#10B981', title: 'Sauvegarder et publier', desc: 'Enregistrez votre exercice et rendez-le disponible aux eleves.', steps: ['Cliquez "Brouillon" pour sauvegarder sans publier', 'Cliquez "Sauvegarder" pour enregistrer les modifications', 'Pour publier : retournez a la liste des exercices', 'Cliquez l\'icone avion (publier) a cote de l\'exercice', 'Selectionnez la classe cible', 'Choisissez le mode : Classique ou Combat', 'Cliquez "Publier et lancer"'] },
            ]},
        ]
    },
    'exercises.edit_exercise': null,

    // =============================================
    // GESTIONNAIRE DE FICHIERS
    // =============================================
    'file_manager.index': {
        title: 'Gestionnaire de fichiers',
        sections: [
            { title: 'Gerer vos fichiers', items: [
                { icon: 'fa-upload', color: '#4F46E5', title: 'Uploader des fichiers', desc: 'Ajoutez des documents, images ou PDF a votre espace.', steps: ['Cliquez le bouton vert "Uploader fichiers" en haut', 'Selectionnez un ou plusieurs fichiers sur votre ordinateur', 'Ou glissez-deposez des fichiers directement dans la page', 'La barre de progression montre l\'avancement', 'Pour uploader un dossier entier : cliquez "Uploader dossier"'] },
                { icon: 'fa-folder-plus', color: '#10B981', title: 'Creer et organiser des dossiers', desc: 'Structurez vos fichiers par theme, chapitre ou classe.', steps: ['Cliquez "Nouveau dossier" en haut', 'Entrez le nom du dossier', 'Choisissez une couleur parmi les 8 proposees (optionnel)', 'Cliquez "Creer"', 'Cliquez sur un dossier pour y entrer', 'Le fil d\'Ariane en haut montre votre emplacement'] },
                { icon: 'fa-edit', color: '#F59E0B', title: 'Renommer et supprimer', desc: 'Modifiez le nom ou supprimez des fichiers/dossiers.', steps: ['Survolez un fichier ou dossier pour voir les icones d\'action', 'Cliquez l\'icone crayon pour renommer', 'Pour supprimer : cliquez le bouton rouge "Supprimer" en haut', 'Cochez les elements a supprimer', 'Cliquez "Supprimer les X element(s)"', 'Cliquez "Annuler" pour quitter le mode suppression'] },
            ]},
            { title: 'Fichiers de classe', items: [
                { icon: 'fa-copy', color: '#06B6D4', title: 'Copier vers une classe', desc: 'Rendez un fichier disponible dans les ressources d\'une classe.', steps: ['Dans la colonne droite "Mes classes", cliquez sur une classe', 'L\'arborescence des fichiers de cette classe s\'affiche', 'Depuis votre gestionnaire (gauche), les fichiers peuvent etre copies vers la classe'] },
                { icon: 'fa-share-alt', color: '#8B5CF6', title: 'Partager avec les eleves', desc: 'Envoyez un fichier directement aux eleves.', steps: ['Le fichier doit d\'abord etre dans les fichiers de classe', 'Depuis la page de la lecon ou la gestion de classe', 'Les eleves le verront dans leur espace "Fichiers"'] },
            ]},
        ]
    },

    // =============================================
    // HORAIRE TYPE
    // =============================================
    'schedule.weekly_schedule': {
        title: 'Horaire type',
        sections: [
            { title: 'Configurer votre horaire', items: [
                { icon: 'fa-mouse-pointer', color: '#4F46E5', title: 'Assigner une classe a une periode', desc: 'Remplissez votre grille horaire avec vos classes.', steps: ['Cliquez sur une case vide de la grille', 'Un popup apparait avec vos classes', 'Selectionnez la classe a assigner a cette periode', 'La case se remplit avec le nom et la couleur de la classe', 'Repetez pour chaque periode de la semaine'] },
                { icon: 'fa-eraser', color: '#EF4444', title: 'Retirer ou modifier une periode', desc: 'Liberez une case ou changez la classe assignee.', steps: ['Cliquez sur une case deja remplie', 'Selectionnez "Retirer la classe" pour vider la case', 'Ou selectionnez une autre classe pour la remplacer'] },
                { icon: 'fa-check', color: '#10B981', title: 'Valider l\'horaire', desc: 'Finalisez votre emploi du temps pour acceder au calendrier.', steps: ['Verifiez que toutes vos periodes sont correctement remplies', 'Cliquez le bouton "Valider l\'horaire" en bas de page', 'Votre calendrier de planification sera genere automatiquement', 'Vous pourrez modifier l\'horaire plus tard depuis le tableau de bord'] },
            ]},
        ]
    },

    // =============================================
    // ABONNEMENT
    // =============================================
    'subscription.pricing': {
        title: 'Abonnement',
        sections: [
            { title: 'Plans et paiement', items: [
                { icon: 'fa-gift', color: '#10B981', title: 'Plan Gratuit', desc: 'Fonctions de base sans frais.', steps: ['Le plan gratuit inclut : tableau de bord, planification, calendrier', 'Les fonctions avec un cadenas necessitent le Premium', 'Vous pouvez utiliser ProfCalendar gratuitement sans limite de temps'] },
                { icon: 'fa-crown', color: '#F59E0B', title: 'Plan Premium', desc: 'Debloquez toutes les fonctionnalites.', steps: ['CHF 4.90/mois ou CHF 39.90/an (economisez 32%)', 'Inclut : gestion de classe, notes, presences, sanctions', 'Inclut aussi : exercices interactifs, collaboration, fichiers', 'Cliquez "Choisir" puis completez le paiement via Stripe', 'Vous pouvez annuler a tout moment'] },
                { icon: 'fa-ticket-alt', color: '#8B5CF6', title: 'Code promo / Voucher', desc: 'Activez un acces Premium gratuit avec un code.', steps: ['Si vous avez recu un code promo, rendez-vous sur cette page', 'Entrez le code dans le champ prevu', 'Cliquez "Appliquer"', 'L\'acces Premium sera active immediatement'] },
            ]},
        ]
    }
};

// ============================================================
// TOUR GUIDÉ MULTI-PAGES
// ============================================================
// Chaque section correspond à une page du site. Le tour passe d'une
// page à l'autre en utilisant `waitForClick: true` : l'étape attend
// que l'utilisateur clique sur l'élément surligné, puis la suite du
// tour reprend automatiquement sur la page d'arrivée grâce au state
// persisté en localStorage.
const TOUR_SEQUENCE = [
    {
        page: 'planning.dashboard',
        steps: [
            {
                target: '.nav-brand',
                title: 'Bienvenue sur ProfCalendar !',
                text: 'Ce tour vous guide à travers les fonctions principales : prochain cours, calendrier, gestion de classe, gestionnaire de fichiers, sanctions et exercices interactifs. Vous pouvez le quitter à tout moment et le reprendre plus tard via le menu utilisateur.'
            },
            {
                target: '.nav-link[href*="lesson"]',
                title: 'Prochain cours',
                text: 'Ce lien affiche votre prochaine leçon programmée avec votre classe. Quand l\'heure du cours commence, le bouton change automatiquement pour indiquer que le cours est en cours. Depuis cette page vous pouvez voir les élèves de la classe, la planification du cours et les fichiers qui lui sont liés.'
            },
            {
                target: '.nav-link[href*="calendar"]',
                title: 'Calendrier',
                text: 'Le calendrier vous permet de parcourir toutes les semaines de l\'année scolaire avec tous vos horaires. Cliquez sur une période vide pour planifier un prochain cours en quelques secondes.'
            },
            {
                target: '.nav-link[href*="manage-classes"]',
                title: 'Gestion de classe',
                text: 'La Gestion de classe regroupe toutes les informations sur vos classes et vos élèves : inscriptions, notes, absences, plan de classe, groupes. Cliquez maintenant sur ce lien pour continuer le tour.',
                waitForClick: true
            }
        ]
    },
    {
        page: 'planning.manage_classes',
        steps: [
            {
                target: '.tabs-nav, .nav-tabs, .classroom-tabs',
                fallback: 'main',
                title: 'Les onglets de la classe',
                text: 'Cette page est organisée en onglets (Élèves, Notes, Fichiers, Absences, Coches, Plan de classe, Groupes, Aménagements). Nous allons les parcourir un par un.'
            },
            {
                target: '[data-tab="students"], a[href*="#students"], .tab-students',
                fallback: '.add-student-btn, button.add-student, [data-action="add-student"]',
                title: 'Onglet Élèves — ajouter des élèves',
                text: 'La première chose à faire est d\'ajouter des élèves à votre classe. Cliquez sur « + Ajouter un élève » et renseignez prénom, nom, ainsi que l\'email de l\'élève et de ses parents. Ces emails sont indispensables pour que les élèves et les parents puissent lier leur compte à votre classe.'
            },
            {
                target: '.btn-student-code, [data-action="student-code"], button[title*="élèves" i]',
                fallback: 'main',
                title: 'Code élève',
                text: 'Le code élève permet à vos élèves de créer leur compte et de se connecter à votre classe. Ils verront leurs exercices à faire, leurs notes, leurs absences et les fichiers partagés. IMPORTANT : ajoutez d\'abord l\'email de l\'élève dans sa fiche avant de lui communiquer le code, sinon il ne pourra pas lier son compte.'
            },
            {
                target: '.btn-parent-code, [data-action="parent-code"], button[title*="parents" i]',
                fallback: 'main',
                title: 'Code parent',
                text: 'Le code parent permet aux parents de créer leur compte pour suivre leur enfant. Ils pourront consulter les notes, les absences et justifier les absences manquantes. Même règle que pour l\'élève : ajoutez l\'email des parents dans la fiche de l\'élève avant de leur envoyer le code.'
            },
            {
                target: '[data-tab="grades"], a[href*="#grades"], .tab-grades',
                fallback: 'main',
                title: 'Onglet Notes',
                text: 'Créez des évaluations (tests, devoirs, examens) et saisissez les notes des élèves. Les moyennes se calculent automatiquement et sont visibles par les parents et les élèves.'
            },
            {
                target: '[data-tab="files"], a[href*="#files"], .tab-files',
                fallback: 'main',
                title: 'Onglet Fichiers',
                text: 'Les fichiers déposés dans cet onglet sont spécifiques à la classe. Vous pouvez les partager ensuite avec les élèves pour qu\'ils y accèdent depuis leur espace.'
            },
            {
                target: '[data-tab="absences"], a[href*="#absences"], .tab-absences',
                fallback: 'main',
                title: 'Onglet Absences',
                text: 'Consultez l\'historique complet des absences et retards de chaque élève, avec les justifications envoyées par les parents.'
            },
            {
                target: '[data-tab="coches"], [data-tab="sanctions"], a[href*="#coches"], .tab-coches',
                fallback: 'main',
                title: 'Onglet Coches',
                text: 'Les coches comptabilisent les oublis de matériel, bavardages ou autres comportements. Vous les configurez dans « Gestion des sanctions » (nous y passerons dans quelques étapes) et les incrémentez ici ou depuis la vue leçon.'
            },
            {
                target: '[data-tab="class-plan"], [data-tab="plan"], a[href*="#plan"], .tab-plan',
                fallback: 'main',
                title: 'Onglet Plan de classe',
                text: 'Disposez virtuellement les tables de votre salle et placez vos élèves dessus. Vous pouvez aussi imprimer le plan pour avoir une vue papier.'
            },
            {
                target: '[data-tab="groups"], a[href*="#groups"], .tab-groups',
                fallback: 'main',
                title: 'Onglet Groupes',
                text: 'Créez des sous-groupes d\'élèves pour le travail en équipe. Ces groupes sont utilisables dans le plan de classe et pour distribuer différents exercices.'
            },
            {
                target: '[data-tab="accommodations"], a[href*="#accommodations"], .tab-accommodations',
                fallback: 'main',
                title: 'Onglet Aménagements',
                text: 'Notez les aménagements spécifiques pour les élèves à besoins particuliers. Ils sont ensuite visibles à côté du nom de l\'élève partout dans l\'application.'
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: 'Retour au tableau de bord',
                text: 'Parfait ! Revenons maintenant au tableau de bord pour continuer avec le gestionnaire de fichiers. Cliquez sur « Tableau de bord » dans la barre de navigation.',
                waitForClick: true,
                clickSelector: '.nav-link[href$="/planning"]'
            }
        ]
    },
    {
        page: 'planning.dashboard',
        requireFlag: 'tour_after_classes',
        steps: [
            {
                target: 'a[href*="file_manager"], a[href*="file-manager"], .action-button[href*="file"]',
                fallback: '.action-button',
                title: 'Gestionnaire de fichiers',
                text: 'Cliquez maintenant sur « Gestionnaire de fichiers » pour découvrir comment organiser vos documents.',
                waitForClick: true
            }
        ]
    },
    {
        page: 'file_manager.index',
        steps: [
            {
                target: '.upload-btn, [data-action="upload"], button[class*="upload" i]',
                fallback: 'main',
                title: 'Uploader des fichiers',
                text: 'Le bouton « Uploader » ajoute des fichiers (PDF, images, documents) à votre espace. Vous pouvez aussi glisser-déposer des fichiers directement dans la page. Selon votre plan, vous disposez de 1 Go (Gratuit) à 3 Go (Premium annuel) de stockage.'
            },
            {
                target: '.new-folder-btn, [data-action="new-folder"], button[class*="folder" i]',
                fallback: 'main',
                title: 'Créer des dossiers',
                text: 'Organisez vos fichiers par thème, chapitre ou classe avec des dossiers colorés. Cliquez sur un dossier pour y entrer, et utilisez le fil d\'Ariane en haut pour naviguer.'
            },
            {
                target: '.class-files-panel, .sidebar-classes, [data-panel="classes"]',
                fallback: 'main',
                title: 'Copier vers une classe (drag & drop)',
                text: 'Dans la colonne de droite, vous voyez vos classes. Glissez-déposez un fichier de votre gestionnaire vers une classe pour en créer une copie dans les fichiers partagés avec cette classe. Les élèves y auront ainsi accès depuis leur espace.'
            },
            {
                target: '.delete-btn, [data-action="delete"], button[class*="delete" i]',
                fallback: 'main',
                title: 'Supprimer des fichiers',
                text: 'Pour supprimer, cliquez sur le bouton « Supprimer » rouge en haut, cochez les fichiers/dossiers à retirer, puis validez. Vous pouvez aussi cliquer « Annuler » pour quitter le mode suppression sans rien supprimer.'
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: 'Retour au tableau de bord',
                text: 'Retournons au tableau de bord pour voir la Gestion des sanctions. Cliquez sur « Tableau de bord » dans la barre de navigation.',
                waitForClick: true,
                clickSelector: '.nav-link[href$="/planning"]'
            }
        ]
    },
    {
        page: 'planning.dashboard',
        requireFlag: 'tour_after_files',
        steps: [
            {
                target: 'a[href*="sanctions"], .action-button[href*="sanctions"]',
                fallback: '.action-button',
                title: 'Gestion des sanctions',
                text: 'Cliquez maintenant sur « Gestion des sanctions » pour apprendre à configurer les coches de comportement.',
                waitForClick: true
            }
        ]
    },
    {
        page: 'sanctions.index',
        steps: [
            {
                target: '.add-sanction-btn, [data-action="add-sanction"], button[class*="sanction" i]',
                fallback: 'main',
                title: 'Créer un modèle de sanction',
                text: 'Cliquez sur « + Nouveau modèle » pour créer un type de sanction (ex: « Oubli de matériel », « Bavardage »). Vous définissez un nom, une icône et un seuil d\'alerte (à partir de combien de coches l\'élève est signalé).'
            },
            {
                target: 'main',
                title: 'Où utiliser les coches ?',
                text: 'Les coches que vous définissez ici apparaissent automatiquement sur la page de votre leçon (Prochain cours) dans l\'onglet « Coches ». Vous pouvez les incrémenter en un clic pendant votre cours, et elles sont aussi visibles dans la Gestion de classe.'
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: 'Retour au tableau de bord',
                text: 'Direction la dernière fonction : les exercices interactifs. Cliquez sur « Tableau de bord » dans la barre de navigation.',
                waitForClick: true,
                clickSelector: '.nav-link[href$="/planning"]'
            }
        ]
    },
    {
        page: 'planning.dashboard',
        requireFlag: 'tour_after_sanctions',
        steps: [
            {
                target: 'a[href*="exercises"], .action-button[href*="exercise"]',
                fallback: '.action-button',
                title: 'Exercices interactifs',
                text: 'Cliquez sur « Exercices interactifs » pour découvrir comment créer et publier des exercices auprès de vos élèves.',
                waitForClick: true
            }
        ]
    },
    {
        page: 'exercises.index',
        steps: [
            {
                target: '.create-exercise-btn, [data-action="create-exercise"], a[href*="create"]',
                fallback: 'main',
                title: 'Créer un nouvel exercice',
                text: 'Cliquez sur « + Nouvel exercice » pour ouvrir l\'éditeur. Vous donnez un titre à l\'exercice, puis vous ajoutez des blocs de différents types.'
            },
            {
                target: 'main',
                title: 'Les types d\'exercices disponibles',
                text: 'Dans l\'éditeur vous pouvez ajouter : QCM (choix multiples), Réponse courte (texte libre), Texte à trous, Classement/Tri, Correspondances (relier des paires) et Image interactive (zones cliquables). Chaque bloc a ses propres paramètres : question, réponses attendues, timer, nombre de points.'
            },
            {
                target: 'main',
                title: 'Envoyer l\'exercice aux élèves',
                text: 'Deux options pour publier un exercice : (1) depuis la liste des exercices, cliquez sur l\'icône avion à côté de l\'exercice et choisissez la classe cible ; (2) depuis la vue d\'une leçon, ajoutez l\'exercice dans les ressources puis cliquez « Lancer ». Les élèves le verront immédiatement dans leur espace « Missions » et pourront y répondre.'
            },
            {
                target: 'main',
                title: 'Côté élève',
                text: 'L\'élève se connecte avec son compte (créé grâce au code élève), va dans l\'onglet « Missions » et voit tous les exercices publiés. Il répond, reçoit un retour immédiat sur ses réponses et vous pouvez consulter ses résultats dans les statistiques de l\'exercice.'
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: 'Fin du tour !',
                text: 'Vous avez fait le tour des fonctions principales de ProfCalendar. Cliquez sur « Tableau de bord » dans la barre de navigation pour terminer. Vous pouvez relancer ce tour à tout moment depuis le menu utilisateur en haut à droite > « Revoir le tutoriel ».',
                waitForClick: true,
                clickSelector: '.nav-link[href$="/planning"]'
            }
        ]
    }
];

// ============================================================
// CLASSE PRINCIPALE
// ============================================================
class HelpSystem {
    constructor() {
        this.panelOpen = false;
        this.currentTourStep = -1;
        this.tourActive = false;
        this.activeTip = null;
        this.init();
    }

    init() {
        this.createElements();
        this.bindEvents();
        this.initTooltips();

        // Reprise automatique du tour multi-pages (après un clic qui a
        // déclenché une navigation) ou premier lancement au premier login.
        const tourState = this.loadTourState();
        if (tourState && tourState.active) {
            setTimeout(() => this.resumeTour(), 400);
        } else if (document.body.dataset.firstVisit === 'true') {
            setTimeout(() => this.startTour(), 800);
        }
    }

    // === STATE PERSISTÉ (multi-pages) ===
    loadTourState() {
        try {
            return JSON.parse(localStorage.getItem('pc_tour_state')) || null;
        } catch (e) {
            return null;
        }
    }

    saveTourState(state) {
        if (state) {
            localStorage.setItem('pc_tour_state', JSON.stringify(state));
        } else {
            localStorage.removeItem('pc_tour_state');
        }
    }

    currentPageKey() {
        return document.querySelector('main')?.dataset.helpPage || '';
    }

    findNextSequenceBlock(fromIdx, pageKey) {
        // Cherche le prochain bloc de TOUR_SEQUENCE dont la page correspond
        // à pageKey et dont le flag (si présent) a été posé.
        const flags = (this.loadTourState() || {}).flags || {};
        for (let i = fromIdx; i < TOUR_SEQUENCE.length; i++) {
            const block = TOUR_SEQUENCE[i];
            if (block.page !== pageKey) continue;
            if (block.requireFlag && !flags[block.requireFlag]) continue;
            return i;
        }
        return -1;
    }

    // === CREATION DES ELEMENTS HTML ===
    createElements() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'help-overlay';
        document.body.appendChild(this.overlay);

        // Bouton flottant
        this.fab = document.querySelector('.help-fab');

        // Panneau
        this.panel = document.querySelector('.help-panel');
        this.panelBody = this.panel?.querySelector('.help-panel-body');

        // Remplir le contenu contextuel
        this.loadPanelContent();
    }

    loadPanelContent() {
        if (!this.panelBody) return;
        const page = document.querySelector('main')?.dataset.helpPage || '';
        let content = HELP_CONTENT[page];
        if (!content && page) {
            const fallbacks = Object.keys(HELP_CONTENT);
            const prefix = page.split('.')[0];
            const fallback = fallbacks.find(k => k.startsWith(prefix) && HELP_CONTENT[k]);
            if (fallback) content = HELP_CONTENT[fallback];
        }
        if (!content) {
            content = { title: 'Aide', sections: [{ title: 'Aide generale', items: [
                { icon: 'fa-question-circle', color: '#4F46E5', title: 'Besoin d\'aide ?', desc: 'Naviguez vers une page specifique pour voir l\'aide contextuelle.', steps: [] }
            ]}]};
        }
        this.panelBody.innerHTML = content.sections.map(section => `
            <div class="help-section">
                <div class="help-section-title">${section.title}</div>
                ${section.items.map(item => `
                    <div class="help-item" onclick="this.classList.toggle('open')">
                        <div class="help-item-header">
                            <div class="help-item-icon" style="background: ${item.color};">
                                <i class="fas ${item.icon}"></i>
                            </div>
                            <span class="help-item-title">${item.title}</span>
                            <i class="fas fa-chevron-right help-item-chevron"></i>
                        </div>
                        <div class="help-item-body">
                            ${item.desc ? `<div class="help-item-desc">${item.desc}</div>` : ''}
                            ${item.steps && item.steps.length ? `<ol class="help-steps">${item.steps.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    // === EVENTS ===
    bindEvents() {
        this.fab?.addEventListener('click', () => this.togglePanel());
        this.overlay.addEventListener('click', () => this.closePanel());
        this.panel?.querySelector('.help-panel-close')?.addEventListener('click', () => this.closePanel());
        this.panel?.querySelector('.help-restart-tour')?.addEventListener('click', () => {
            this.closePanel();
            setTimeout(() => this.startTour(), 300);
        });
    }

    // === PANNEAU D'AIDE ===
    togglePanel() {
        this.panelOpen ? this.closePanel() : this.openPanel();
    }

    openPanel() {
        this.panel?.classList.add('open');
        this.overlay.classList.add('visible');
        this.fab?.classList.add('active');
        this.panelOpen = true;
    }

    closePanel() {
        this.panel?.classList.remove('open');
        this.overlay.classList.remove('visible');
        this.fab?.classList.remove('active');
        this.panelOpen = false;
    }

    // === TOOLTIPS ===
    initTooltips() {
        document.querySelectorAll('[data-help-tip]').forEach(el => {
            const btn = document.createElement('button');
            btn.className = 'help-tip-trigger';
            btn.textContent = '?';
            btn.setAttribute('type', 'button');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showTip(btn, el.dataset.helpTip);
            });
            el.appendChild(btn);
        });

        document.addEventListener('click', () => this.hideTip());
    }

    showTip(trigger, text) {
        this.hideTip();
        const bubble = document.createElement('div');
        bubble.className = 'help-tip-bubble';
        bubble.textContent = text;
        document.body.appendChild(bubble);

        const rect = trigger.getBoundingClientRect();
        const bRect = bubble.getBoundingClientRect();
        const above = rect.top > bRect.height + 20;

        if (above) {
            bubble.style.top = (rect.top - bRect.height - 10) + 'px';
            bubble.classList.add('pos-top');
        } else {
            bubble.style.top = (rect.bottom + 10) + 'px';
            bubble.classList.add('pos-bottom');
        }
        bubble.style.left = Math.max(10, Math.min(rect.left - bRect.width / 2 + rect.width / 2, window.innerWidth - bRect.width - 10)) + 'px';

        requestAnimationFrame(() => bubble.classList.add('visible'));
        this.activeTip = bubble;
    }

    hideTip() {
        if (this.activeTip) {
            this.activeTip.remove();
            this.activeTip = null;
        }
    }

    // === TOUR GUIDÉ MULTI-PAGES ===
    startTour() {
        // Afficher le modal de bienvenue sur le tableau de bord. Si on
        // n'est pas sur le dashboard, on pose le state et on ne fait rien
        // (le tour se déclenchera quand l'utilisateur y reviendra).
        const welcome = document.createElement('div');
        welcome.className = 'tour-welcome';
        welcome.innerHTML = `
            <div class="tour-backdrop visible"></div>
            <div class="tour-welcome-card">
                <div class="tour-welcome-icon">🎓</div>
                <h2>Bienvenue sur ProfCalendar !</h2>
                <p>Découvrons ensemble les fonctions principales. Le tour passe par plusieurs pages du site : laissez-vous guider et cliquez là où il vous l'indique. Vous pouvez quitter à tout moment.</p>
                <div class="tour-welcome-buttons">
                    <button class="tour-welcome-skip" onclick="window._helpSystem.endTour(this.closest('.tour-welcome'))">Passer</button>
                    <button class="tour-welcome-start" onclick="window._helpSystem.beginTourSteps(this.closest('.tour-welcome'))">
                        <i class="fas fa-play"></i> Commencer le tour
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(welcome);
    }

    beginTourSteps(welcomeEl) {
        welcomeEl?.remove();
        this.tourActive = true;

        // Démarrer depuis le premier bloc correspondant à la page courante
        const pageKey = this.currentPageKey();
        const blockIdx = this.findNextSequenceBlock(0, pageKey);
        if (blockIdx < 0) {
            this.endTour();
            return;
        }
        this.saveTourState({
            active: true,
            blockIdx: blockIdx,
            stepIdx: 0,
            flags: {}
        });
        this.showTourStep();
    }

    resumeTour() {
        const state = this.loadTourState();
        if (!state || !state.active) return;

        // Si on est au-delà du dernier bloc, le tour est terminé : on
        // affiche un message de félicitations puis on clôt.
        if (state.blockIdx >= TOUR_SEQUENCE.length) {
            this.showTourCompleted();
            return;
        }

        const pageKey = this.currentPageKey();
        const block = TOUR_SEQUENCE[state.blockIdx];

        // Si on arrive sur la page du bloc courant, continuer ses étapes.
        if (block && block.page === pageKey) {
            this.tourActive = true;
            this.showTourStep();
            return;
        }

        // Sinon, chercher le prochain bloc qui correspond à cette page (en
        // tenant compte des flags déjà posés) et avancer l'index.
        const nextIdx = this.findNextSequenceBlock(state.blockIdx + 1, pageKey);
        if (nextIdx >= 0) {
            this.tourActive = true;
            this.saveTourState({ ...state, blockIdx: nextIdx, stepIdx: 0 });
            this.showTourStep();
        }
        // Sinon on reste silencieux : l'utilisateur a navigué ailleurs,
        // le tour reprendra quand il reviendra sur une page attendue.
    }

    showTourCompleted() {
        const card = document.createElement('div');
        card.className = 'tour-welcome';
        card.innerHTML = `
            <div class="tour-backdrop visible"></div>
            <div class="tour-welcome-card">
                <div class="tour-welcome-icon">🎉</div>
                <h2>Tour terminé !</h2>
                <p>Vous avez fait le tour des fonctions principales de ProfCalendar. Bon enseignement ! Vous pouvez relancer ce tour à tout moment depuis le menu utilisateur en haut à droite > « Revoir le tutoriel ».</p>
                <div class="tour-welcome-buttons">
                    <button class="tour-welcome-start" onclick="window._helpSystem.endTour(this.closest('.tour-welcome'))">
                        <i class="fas fa-check"></i> Terminer
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(card);
    }

    showTourStep() {
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-backdrop-tour, .tour-click-catcher').forEach(el => el.remove());

        const state = this.loadTourState();
        if (!state || !state.active) return;

        const block = TOUR_SEQUENCE[state.blockIdx];
        if (!block) { this.endTour(); return; }

        const stepIdx = state.stepIdx;
        if (stepIdx >= block.steps.length) {
            this.advanceToNextBlock();
            return;
        }

        const step = block.steps[stepIdx];
        let target = document.querySelector(step.target);
        if (!target && step.fallback) target = document.querySelector(step.fallback);
        if (!target) {
            // Cible introuvable : on saute l'étape pour ne pas bloquer.
            this.saveTourState({ ...state, stepIdx: stepIdx + 1 });
            this.showTourStep();
            return;
        }

        // Scroll doux vers la cible
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}

        const rect = target.getBoundingClientRect();
        const pad = 8;
        const spotlight = document.createElement('div');
        spotlight.className = 'tour-spotlight';
        spotlight.style.top = (rect.top - pad) + 'px';
        spotlight.style.left = (rect.left - pad) + 'px';
        spotlight.style.width = (rect.width + pad * 2) + 'px';
        spotlight.style.height = (rect.height + pad * 2) + 'px';
        document.body.appendChild(spotlight);

        // Popover
        const totalSteps = block.steps.length;
        const popover = document.createElement('div');
        popover.className = 'tour-popover';
        const isLastStepOfBlock = (stepIdx === totalSteps - 1);
        const nextBtnLabel = step.waitForClick
            ? `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endTour()">Quitter le tour</button>`
            : `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endTour()">Passer</button>
               <button class="tour-btn tour-btn-next" onclick="window._helpSystem.nextTourStep()">
                   ${isLastStepOfBlock ? 'Suite →' : 'Suivant →'}
               </button>`;

        popover.innerHTML = `
            <div class="tour-popover-header">
                <span class="tour-popover-step">${block.page.replace(/[._]/g, ' ')} · ${stepIdx + 1}/${totalSteps}</span>
                <h3>${step.title}</h3>
            </div>
            <div class="tour-popover-body">${step.text}</div>
            <div class="tour-popover-footer">
                <div class="tour-dots">
                    ${block.steps.map((_, i) => `<div class="tour-dot ${i === stepIdx ? 'active' : ''}"></div>`).join('')}
                </div>
                <div class="tour-buttons">${nextBtnLabel}</div>
            </div>
        `;

        // Position : sous la cible si possible, sinon au-dessus
        const popoverHeight = 280;
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow > popoverHeight + 20) {
            popover.style.top = (rect.bottom + pad + 15) + 'px';
        } else {
            popover.style.top = Math.max(10, rect.top - popoverHeight - 15) + 'px';
        }
        popover.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 400)) + 'px';

        document.body.appendChild(popover);

        // Si waitForClick : attendre le clic sur la cible (ou sélecteur spécifique)
        if (step.waitForClick) {
            const clickEl = step.clickSelector
                ? document.querySelector(step.clickSelector)
                : target;
            if (clickEl) {
                const onClick = () => {
                    clickEl.removeEventListener('click', onClick, true);
                    // On pose un flag éventuel pour reconnaître où on en est au retour
                    const flagName = block.page === 'planning.manage_classes' ? 'tour_after_classes'
                        : block.page === 'file_manager.index' ? 'tour_after_files'
                        : block.page === 'sanctions.index' ? 'tour_after_sanctions'
                        : block.page === 'exercises.index' ? 'tour_after_exercises'
                        : null;
                    const st = this.loadTourState() || { active: true, blockIdx: state.blockIdx, stepIdx: 0, flags: {} };
                    const flags = { ...(st.flags || {}) };
                    if (flagName) flags[flagName] = true;
                    this.saveTourState({
                        active: true,
                        blockIdx: state.blockIdx + 1,
                        stepIdx: 0,
                        flags
                    });
                    // La page va naviguer automatiquement via le clic natif.
                };
                clickEl.addEventListener('click', onClick, true);
            }
        }
    }

    nextTourStep() {
        const state = this.loadTourState();
        if (!state) return;
        this.saveTourState({ ...state, stepIdx: state.stepIdx + 1 });
        this.showTourStep();
    }

    advanceToNextBlock() {
        const state = this.loadTourState();
        if (!state) return;
        // Avancer à la fin naturelle d'un bloc sans clic (rare) :
        // on cherche le prochain bloc exécutable.
        const pageKey = this.currentPageKey();
        const nextIdx = this.findNextSequenceBlock(state.blockIdx + 1, pageKey);
        if (nextIdx >= 0) {
            this.saveTourState({ ...state, blockIdx: nextIdx, stepIdx: 0 });
            this.showTourStep();
        } else {
            this.endTour();
        }
    }

    endTour(welcomeEl) {
        welcomeEl?.remove();
        this.tourActive = false;
        this.saveTourState(null);
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-welcome, .tour-backdrop-tour, .tour-click-catcher').forEach(el => el.remove());

        // Marquer comme vu côté serveur
        fetch('/api/help/tour-completed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        }).catch(() => {});
    }
}

// === FONCTION GLOBALE : relancer le tutoriel depuis le menu utilisateur ===
window.replayTutorial = function() {
    // Réinitialiser côté serveur, nettoyer le state local, rediriger vers
    // le dashboard (où le tour démarre).
    fetch('/api/help/tour-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    }).catch(() => {}).finally(() => {
        try { localStorage.removeItem('pc_tour_state'); } catch (e) {}
        // Forcer le flag de première visite puis rediriger
        const url = '/planning?replay_tour=1';
        window.location.href = url;
    });
};

// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Uniquement pour les enseignants connectes (pas les eleves/parents/visiteurs)
    if (document.querySelector('.help-fab')) {
        window._helpSystem = new HelpSystem();
    }
});
