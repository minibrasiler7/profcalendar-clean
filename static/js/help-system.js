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
// GUIDE DU TABLEAU DE BORD (vue d'ensemble des pages)
// ============================================================
// Sert à remplir le panneau d'aide quand on clique le bouton ? sur le
// tableau de bord. Chaque entrée décrit une page principale, avec un
// bouton « Voir le tutoriel » qui amène l'utilisateur sur la page et
// déclenche automatiquement le tutoriel pas-à-pas associé.
const DASHBOARD_GUIDE = [
    {
        key: 'planning.lesson_view',
        url: '/planning/lesson',
        icon: 'fa-rocket',
        color: '#4F46E5',
        title: 'Prochain cours',
        // Le bouton change de libellé (« Cours en cours ») quand vous êtes
        // dans le créneau d'une leçon en cours.
        body: `
            <p>Cette carte vous emmène vers votre prochaine leçon planifiée. Quand l'heure
            d'un cours commence, le bouton se transforme en <strong>« Cours en cours »</strong>.</p>
            <p>Sur la page de la leçon vous pouvez :</p>
            <ul>
                <li>ouvrir et <strong>annoter les fichiers</strong> du cours (PDF, images…)</li>
                <li>consulter la liste des élèves <strong>présents, absents ou en retard</strong></li>
                <li>ajouter des <strong>coches/sanctions</strong> aux élèves (à condition d'avoir d'abord créé un modèle dans <em>Gestion des sanctions</em>)</li>
                <li>afficher le <strong>plan de classe</strong> de la salle</li>
                <li><strong>publier un exercice interactif</strong> à la classe en un clic</li>
            </ul>
        `
    },
    {
        key: 'planning.calendar_view',
        url: '/planning/calendar',
        icon: 'fa-calendar-alt',
        color: '#06B6D4',
        title: 'Voir le calendrier',
        body: `
            <p>Le calendrier est l'outil principal pour <strong>planifier vos cours</strong>
            sur l'année. Vous voyez en un coup d'œil l'horaire hebdomadaire et la vue
            annuelle par classe.</p>
            <p>Pour chaque période vous pouvez écrire un titre, une description, et
            associer un groupe d'élèves. Le panneau latéral montre les
            <strong>fichiers de la classe</strong> pour vous permettre de préparer la
            leçon en parallèle.</p>
        `
    },
    {
        key: 'schedule.weekly_schedule',
        url: '/schedule/weekly',
        icon: 'fa-clock',
        color: '#F59E0B',
        title: 'Modifier l\'horaire',
        body: `
            <p>Modifiez votre horaire-type quand votre emploi du temps change. Vous
            pouvez :</p>
            <ul>
                <li>ajouter ou retirer des <strong>périodes</strong> à n'importe quel jour de la semaine</li>
                <li>assigner une <strong>classe</strong> (ou un groupe mixte) à chaque créneau</li>
                <li>marquer des périodes comme <strong>fusionnées</strong> (ex : double leçon de 90 min)</li>
            </ul>
            <p>Les changements se propagent automatiquement dans le calendrier.</p>
        `
    },
    {
        key: 'file_manager.index',
        url: '/file_manager/',
        icon: 'fa-folder-open',
        color: '#10B981',
        title: 'Gestionnaire de fichiers',
        body: `
            <p>Importez vos fichiers personnels (PDF, images, documents) depuis votre
            ordinateur, organisez-les en dossiers colorés, puis copiez-les vers les
            classes qui en ont besoin.</p>
            <p><strong>Quota de stockage :</strong> 1 Go avec le plan Gratuit, 3 Go
            avec le Premium annuel. Vous voyez votre consommation en haut de la page.</p>
        `
    },
    {
        key: 'exercises.index',
        url: '/exercises/',
        icon: 'fa-flask',
        color: '#A855F7',
        title: 'Exercices interactifs',
        body: `
            <p>Créez des exercices à résoudre en ligne par vos élèves : <strong>QCM,
            réponses courtes, textes à trous, classements, associations, images
            interactives, graphiques</strong>… Quand l'élève atteint le seuil de
            réussite, il <strong>débloque un badge unique</strong> attaché à
            l'exercice.</p>
            <p><em>Pré-requis :</em> les élèves doivent avoir un compte. Pour ça :
            renseignez leur email dans <em>Gérer les classes</em> et donnez-leur le
            <strong>code élèves</strong> (onglet « Codes élèves » de la même page).</p>
        `
    },
    {
        key: 'sanctions.index',
        url: '/sanctions/',
        icon: 'fa-exclamation-triangle',
        color: '#EF4444',
        title: 'Gestion des sanctions',
        body: `
            <p>Créez des <strong>modèles de sanctions</strong> (« Oubli de matériel »,
            « Bavardage »…) avec leur seuil d'alerte. Quand un élève atteint le seuil,
            le système peut générer <strong>automatiquement</strong> une remise et la
            programmer dans votre agenda.</p>
            <p>Une fois les modèles créés, vous incrémentez/décrémentez les coches
            depuis <em>Prochain cours</em> ou <em>Gérer les classes</em>.</p>
        `
    },
    {
        key: 'attendance.index',
        url: '/attendance/',
        icon: 'fa-user-check',
        color: '#8B5CF6',
        title: 'Suivi des absences',
        body: `
            <p>Vue centralisée des absences et retards de tous vos élèves, avec les
            <strong>justifications validées par les parents</strong>.</p>
            <p><em>Pour que les parents puissent justifier en ligne :</em></p>
            <ol>
                <li>renseignez leur email dans la fiche de l'élève (<em>Gérer les classes</em>)</li>
                <li>donnez-leur le <strong>code parents</strong> (onglet « Codes parents » de la même page)</li>
                <li>ils créent leur compte avec ce code et accèdent à l'espace parents</li>
            </ol>
        `
    },
    {
        key: 'settings.index',
        url: '/settings/',
        icon: 'fa-cog',
        color: '#6B7280',
        title: 'Paramètres',
        body: `
            <p>Configurez les <strong>paramètres généraux</strong> de votre compte :</p>
            <ul>
                <li>dates de <strong>début et fin d'année scolaire</strong></li>
                <li>périodes de <strong>vacances</strong></li>
                <li>horaires-types (heures de cours)</li>
                <li>liste de vos <strong>classes</strong></li>
                <li>préférences d'affichage et notifications</li>
            </ul>
        `
    },
    {
        key: 'planning.manage_classes',
        url: '/planning/manage-classes',
        icon: 'fa-users',
        color: '#0EA5E9',
        title: 'Gérer les classes',
        body: `
            <p>Centre de pilotage de chaque classe. Pour chaque élève vous gérez :</p>
            <ul>
                <li><strong>Fiche élève :</strong> nom, prénom, email élève + emails parents</li>
                <li><strong>Notes</strong> et évaluations (calcul automatique des moyennes)</li>
                <li><strong>Fichiers</strong> spécifiques à la classe</li>
                <li><strong>Coches</strong> de comportement (créez d'abord les modèles dans <em>Gestion des sanctions</em>)</li>
                <li><strong>Absences</strong> et historique de présence</li>
                <li><strong>Plan de classe</strong> visualisé dans <em>Prochain cours</em></li>
                <li><strong>Groupes</strong> si la classe est divisée selon les périodes</li>
                <li><strong>Aménagements</strong> des élèves à besoins particuliers</li>
            </ul>
        `
    },
    {
        key: 'setup.manage_classrooms',
        url: '/setup/classrooms?from_dashboard=1',
        icon: 'fa-chalkboard-teacher',
        color: '#14B8A6',
        title: 'Configuration des classes',
        body: `
            <p>Créez ou supprimez vos classes. Pour chaque classe vous indiquez aussi
            si vous en êtes <strong>maître de classe</strong>. C'est nécessaire si vous
            voulez collaborer avec d'autres enseignants (chaque maître de classe gère
            la fiche officielle de l'élève, les autres collaborateurs ne voient que
            leur discipline).</p>
        `
    },
    {
        key: 'collaboration.index',
        url: '/collaboration/',
        icon: 'fa-handshake',
        color: '#F472B6',
        title: 'Collaboration',
        body: `
            <p>Cette page centralise tous les <strong>codes d'accès</strong> :</p>
            <ul>
                <li><strong>Codes élèves</strong> et <strong>codes parents</strong> par classe : vos élèves
                et parents s'inscrivent avec ces codes pour accéder à leurs notes,
                remarques, fichiers et exercices interactifs.</li>
                <li><strong>Code enseignant :</strong> permet à un autre enseignant de collaborer
                avec une de vos classes (vous devez en être le maître). Il pourra alors
                voir les notes et remarques de cette classe dans sa propre discipline.</li>
            </ul>
        `
    },
    {
        key: 'planning.decoupage',
        url: '/planning/decoupage',
        icon: 'fa-cut',
        color: '#EAB308',
        title: 'Création de découpage',
        body: `
            <p>Le découpage est le <strong>fil rouge pédagogique</strong> d'une
            discipline. Vous écrivez la séquence des thèmes/chapitres prévus sur
            l'année, puis vous l'assignez à une ou plusieurs classes.</p>
            <p>Bénéfice : dans la <strong>vue annuelle du calendrier</strong>, vous
            voyez immédiatement si vous êtes en avance ou en retard sur votre
            planification annuelle.</p>
        `
    },
    {
        key: 'year_end.step1',
        url: '/year-end/',
        icon: 'fa-graduation-cap',
        color: '#DC2626',
        title: 'Nouvelle année',
        body: `
            <p>Assistant de fin d'année qui vous guide pour <strong>recommencer une
            année scolaire propre</strong> :</p>
            <ol>
                <li>archive les données des classes terminées</li>
                <li>permet d'exporter les notes/présences en PDF avant nettoyage</li>
                <li>réinitialise le calendrier et la liste des classes</li>
                <li>vous redéfinissez les paramètres pour la rentrée</li>
            </ol>
            <p>Lancez-le typiquement en juin/juillet, après avoir clos les notes.</p>
        `
    },
];

// ============================================================
// TUTORIELS PAS-À-PAS PAR PAGE (lancement standalone)
// ============================================================
// Chaque tutoriel s'exécute sur une seule page (pas de chaînage entre
// pages, contrairement à TOUR_SEQUENCE qui sert au tour multi-pages
// du premier login). Déclenché depuis le panneau d'aide du Dashboard
// via le bouton « Voir le tutoriel ».
const PAGE_TUTORIALS = {
    'planning.lesson_view': {
        title: 'Tutoriel : Prochain cours',
        steps: [
            {
                target: 'main, .lesson-container, body',
                title: 'Bienvenue dans la vue Leçon',
                text: `Cette page est votre tableau de bord pendant un cours. Elle regroupe la planification, les ressources, les présences et le plan de classe. La disposition s'adapte selon ce que vous voulez mettre en avant.`
            },
            {
                target: '.attendance-section, [data-section="attendance"], .presences-panel, main',
                fallback: 'main',
                title: 'Marquer les présences en un clic',
                text: `Cliquez sur le nom d'un élève pour basculer présent/absent (vert/rouge). Pour un retard : tapez les minutes dans le petit champ « min » puis cliquez l'icône horloge à droite. Les compteurs en haut se mettent à jour en temps réel.`
            },
            {
                target: '.tab-coches, [data-tab="coches"], button[onclick*="coches"], main',
                fallback: 'main',
                title: 'Onglet Coches',
                text: `Si vous avez créé des modèles dans Gestion des sanctions, ils apparaissent ici sous forme de boutons + et −. Un clic incrémente la coche d'un élève. Quand le seuil que vous avez défini est atteint, l'élève est automatiquement signalé.`
            },
            {
                target: '.tab-seating, [data-tab="seating"], button[onclick*="seating"], main',
                fallback: 'main',
                title: 'Plan de classe',
                text: `Si vous avez créé un plan de classe dans Gérer les classes, il s'affiche ici. Vous pouvez cliquer sur une table pour ajouter un avertissement visuel à l'élève (jaune → rouge → noir).`
            },
            {
                target: '.add-resource-btn, [data-action="add-files"], button[class*="resource"], main',
                fallback: 'main',
                title: 'Ajouter des fichiers / exercices',
                text: `Le bouton vert « Ajout de fichiers » ouvre un sélecteur. Onglet « Fichiers de classe » : ajoutez un PDF déjà copié vers la classe. Onglet « Exercices interactifs » : ajoutez un exercice à lancer pendant la leçon.`
            },
            {
                target: '.launch-exercise-btn, [data-action="launch-exercise"], main',
                fallback: 'main',
                title: 'Publier un exercice à la classe',
                text: `Une fois un exercice ajouté, le bouton « Lancer » publie l'exercice : les élèves le voient apparaître immédiatement dans leur application/espace « Missions ». Choisissez « Classique » (à leur rythme) ou « Combat » (mode gamifié).`
            },
            {
                target: '.pdf-viewer-trigger, .resource-item, main',
                fallback: 'main',
                title: 'Annoter un PDF',
                text: `Cliquez un fichier PDF dans la liste de ressources : il s'ouvre dans le visualiseur. Sur iPad vous annotez avec l'Apple Pencil ; sur ordi avec les outils stylo/surligneur. Tout est sauvegardé en continu.`
            }
        ]
    },

    'planning.calendar_view': {
        title: 'Tutoriel : Calendrier',
        steps: [
            {
                target: '.calendar-nav, main',
                fallback: 'main',
                title: 'Vue hebdomadaire',
                text: `Vous êtes sur la grille de la semaine. Les flèches ‹ et › naviguent de semaine en semaine sans recharger la page. « Aujourd'hui » revient à la semaine courante.`
            },
            {
                target: '.schedule-cell, td.schedule-cell, main',
                fallback: 'main',
                title: 'Cliquer sur une période pour planifier',
                text: `Chaque case de la grille = une période de cours. Cliquez dessus pour ouvrir le modal de planification : choisissez la classe, écrivez un titre, une description, optionnellement un groupe d'élèves.`,
                demo: {
                    type: 'form',
                    label: 'Exemple de saisie',
                    fields: [
                        { label: 'Classe', value: '11VG2' },
                        { label: 'Titre', value: 'Système d\'équations' },
                        { label: 'Description', value: 'Exercices p. 42' }
                    ]
                }
            },
            {
                target: '.schedule-cell.planned, .class-block.planned, main',
                fallback: 'main',
                title: 'Modifier ou effacer une planification',
                text: `Sur une période déjà planifiée (couleur pleine), cliquez à nouveau pour ouvrir le modal de modification. Le bouton rouge « Effacer » retire la planification (le cellule revient à l'horaire-type, ou se vide).`
            },
            {
                target: '.annual-view, [class*="annual"], main',
                fallback: 'main',
                title: 'Vue annuelle par classe',
                text: `À droite, la vue annuelle montre l'année entière en mini-vignettes. Si vous avez créé un découpage pédagogique, vous voyez en couleur où vous en êtes par rapport à votre planification annuelle.`
            },
            {
                target: '.file-panel, .resources-panel, main',
                fallback: 'main',
                title: 'Panneau ressources',
                text: `Quand vous sélectionnez une période, les fichiers de la classe associée apparaissent dans le panneau latéral. Pratique pour préparer la leçon sans changer de page.`
            }
        ]
    },

    'schedule.weekly_schedule': {
        title: 'Tutoriel : Modifier l\'horaire',
        steps: [
            {
                target: '.schedule-grid, table, main',
                fallback: 'main',
                title: 'Votre horaire-type',
                text: `Cette grille représente une semaine "modèle" : ce qui se répète chaque semaine. C'est elle qui peuple le calendrier annuel automatiquement, en tenant compte des vacances et jours fériés.`
            },
            {
                target: 'td, .empty-cell, main',
                fallback: 'main',
                title: 'Assigner une classe à un créneau',
                text: `Cliquez sur une case vide. Une popup vous propose la liste de vos classes : sélectionnez celle qui occupe ce créneau. La case se colore avec la couleur de la classe.`
            },
            {
                target: 'td.filled, .filled-cell, main',
                fallback: 'main',
                title: 'Modifier ou retirer',
                text: `Cliquez sur une case déjà remplie pour la changer. Vous pouvez assigner une autre classe ou choisir « Retirer la classe » pour vider la case.`
            },
            {
                target: '.merge-btn, [data-action="merge"], main',
                fallback: 'main',
                title: 'Périodes fusionnées',
                text: `Si vous avez un cours de 90 min sur deux périodes consécutives, fusionnez-les : sélectionnez la première, puis activez « Fusionner avec la suivante ». Dans le calendrier la cellule sera doublée en hauteur.`
            },
            {
                target: '.validate-btn, [data-action="validate"], button[class*="valid"], main',
                fallback: 'main',
                title: 'Valider',
                text: `Quand toutes vos périodes sont remplies, cliquez « Valider l'horaire » en bas pour générer/régénérer le calendrier. Vos planifications déjà saisies sont préservées.`
            }
        ]
    },

    'file_manager.index': {
        title: 'Tutoriel : Gestionnaire de fichiers',
        steps: [
            {
                target: '.upload-btn, button[class*="upload"], main',
                fallback: 'main',
                title: 'Uploader vos fichiers',
                text: `Le bouton vert « Uploader » importe des PDF, images ou documents depuis votre ordinateur. Vous pouvez aussi simplement glisser-déposer les fichiers dans la page.`
            },
            {
                target: '.new-folder-btn, button[class*="folder"], main',
                fallback: 'main',
                title: 'Créer des dossiers colorés',
                text: `Organisez vos fichiers en dossiers. Choisissez une couleur parmi les 8 proposées pour repérer rapidement vos thèmes. Les dossiers peuvent contenir des sous-dossiers (arborescence).`,
                demo: {
                    type: 'form',
                    label: 'Exemple de dossier',
                    fields: [
                        { label: 'Nom', value: 'Maths 11VG' },
                        { label: 'Couleur', value: '🟢 Vert' }
                    ]
                }
            },
            {
                target: '.classes-section, [data-panel="classes"], main',
                fallback: 'main',
                title: 'Copier vers une classe',
                text: `À droite, vos classes. Glissez un fichier ou un dossier de votre gestionnaire vers une classe : une copie est créée dans les fichiers partagés de cette classe. Les élèves la voient depuis leur espace.`,
                demo: {
                    type: 'drag',
                    label: 'Glisser-déposer',
                    source: 'Mes fichiers',
                    target: 'Classe 11VG',
                    fileLabel: '📄 Cours.pdf'
                }
            },
            {
                target: '.delete-btn, button[class*="delete"], main',
                fallback: 'main',
                title: 'Supprimer plusieurs éléments',
                text: `Pour supprimer, cliquez le bouton rouge « Supprimer » en haut. Cochez les fichiers/dossiers à retirer puis validez. « Annuler » quitte le mode sans rien supprimer.`
            },
            {
                target: '.storage-info, [class*="storage"], main',
                fallback: 'main',
                title: 'Quota de stockage',
                text: `Tout en haut, vous voyez votre consommation. 1 Go avec le plan Gratuit ; 3 Go avec le Premium annuel. Les fichiers copiés dans les classes comptent dans le quota.`
            }
        ]
    },

    'exercises.index': {
        title: 'Tutoriel : Exercices interactifs',
        steps: [
            {
                target: '.create-exercise-btn, a[href*="create"], main',
                fallback: 'main',
                title: 'Créer un nouvel exercice',
                text: `Cliquez « + Nouvel exercice » pour ouvrir l'éditeur. Vous donnez un titre, choisissez la matière et le niveau, puis vous ajoutez des blocs.`
            },
            {
                target: 'main',
                title: 'Les types de blocs disponibles',
                text: `QCM, Réponse courte, Texte à trous, Classement/Tri, Associations, Image interactive, Graphique. Chaque bloc a son timer, son nombre de points et un éventuel feedback automatique.`
            },
            {
                target: 'main',
                title: 'Badge unique par exercice',
                text: `À la sauvegarde, ProfCalendar génère automatiquement un badge 5×5 aléatoire pour cet exercice. L'élève le débloque en couleur s'il atteint le seuil que vous avez défini, et le voit grisé sinon.`
            },
            {
                target: 'main',
                title: 'Publier à une classe',
                text: `Deux options : (1) depuis cette liste, l'icône avion ; (2) depuis la vue Leçon, ajoutez l'exercice aux ressources puis cliquez « Lancer ». Les élèves le voient instantanément dans leur écran « Missions ».`
            },
            {
                target: 'main',
                title: 'QR Code de publication rapide',
                text: `Dans l'éditeur d'un exercice, vous trouvez un QR Code. Scannez-le avec un autre appareil connecté à votre compte (par ex. une tablette pendant un cours) : l'exercice est publié à la classe que vous êtes en train d'enseigner.`
            },
            {
                target: 'main',
                title: 'Pré-requis côté élèves',
                text: `Pour que les élèves voient les exercices, ils doivent avoir un compte. Renseignez leur email dans <em>Gérer les classes</em>, donnez-leur le code élèves, et ils s'inscrivent depuis l'espace élève.`
            }
        ]
    },

    'sanctions.index': {
        title: 'Tutoriel : Gestion des sanctions',
        steps: [
            {
                target: '.add-sanction-btn, button[class*="sanction"], a[href*="create"], main',
                fallback: 'main',
                title: 'Créer un modèle de sanction',
                text: `Cliquez « + Nouveau modèle ». Vous définissez un nom (« Oubli matériel »), une icône, le type (cumul ou retrait) et un seuil (ex : 3 coches = remise programmée).`,
                demo: {
                    type: 'form',
                    label: 'Exemple',
                    fields: [
                        { label: 'Nom', value: 'Oubli matériel' },
                        { label: 'Icône', value: '📚' },
                        { label: 'Seuil', value: '3 coches' }
                    ]
                }
            },
            {
                target: 'main',
                title: 'Importer dans une classe',
                text: `Une fois le modèle créé, importez-le dans les classes voulues. Le compteur démarre à 0 pour chaque élève et s'incrémente à chaque coche que vous donnez.`
            },
            {
                target: 'main',
                title: 'Donner une coche pendant un cours',
                text: `Allez dans <em>Prochain cours</em> ou <em>Gérer les classes</em>, onglet « Coches ». Les modèles importés sont là avec un + et un − par élève. Un clic et c'est noté.`
            },
            {
                target: 'main',
                title: 'Programmation automatique',
                text: `Quand un élève atteint le seuil, ProfCalendar peut programmer automatiquement la remise dans votre agenda à la date que vous précisez. Vous gardez la trace dans le rapport élève.`
            }
        ]
    },

    'attendance.index': {
        title: 'Tutoriel : Suivi des absences',
        steps: [
            {
                target: 'main',
                title: 'Vue centralisée',
                text: `Cette page agrège les absences et retards de tous vos élèves, toutes classes confondues. Filtrez par classe, par élève ou par date depuis la barre du haut.`
            },
            {
                target: 'main',
                title: 'Justifications des parents',
                text: `Quand un parent justifie une absence depuis son espace, le motif apparaît automatiquement ici. Vous voyez d'un coup d'œil ce qui est justifié et ce qui ne l'est pas.`
            },
            {
                target: 'main',
                title: 'Comment activer l\'accès parents',
                text: `1) Dans <em>Gérer les classes</em>, ajoutez l'email des parents dans la fiche de l'élève. 2) Toujours dans Gérer les classes, copiez le « code parents ». 3) Donnez-le aux parents : ils s'inscrivent depuis l'espace parents avec ce code.`
            },
            {
                target: 'main',
                title: 'Statistiques',
                text: `Les graphiques en bas montrent l'évolution des absences au fil de l'année. Pratique pour repérer les périodes problématiques ou pour un entretien parents.`
            }
        ]
    },

    'settings.index': {
        title: 'Tutoriel : Paramètres',
        steps: [
            {
                target: 'main',
                title: 'Centre de configuration',
                text: `Tout ce qui est commun à votre compte se règle ici : année scolaire, vacances, horaires, classes, préférences d'affichage et notifications.`
            },
            {
                target: 'main',
                title: 'Année scolaire',
                text: `Définissez les dates de début et fin d'année. Le calendrier ne génèrera pas de planifications avant ou après ces dates. À ajuster en début d'année.`
            },
            {
                target: 'main',
                title: 'Vacances et jours fériés',
                text: `Ajoutez vos périodes de vacances (Toussaint, Noël, etc.). Les jours fériés cantonaux sont déjà pré-remplis. Les périodes en vacances sont grisées dans le calendrier.`
            },
            {
                target: 'main',
                title: 'Horaires des périodes',
                text: `Précisez à quelle heure commence et finit chaque période de la journée. Ces horaires sont utilisés pour détecter quand un cours est « en cours » (bouton Prochain cours).`
            },
            {
                target: 'main',
                title: 'Classes',
                text: `Vue de toutes vos classes avec leur couleur. Pour ajouter ou supprimer une classe, c'est dans <em>Configuration des classes</em> (depuis le tableau de bord).`
            }
        ]
    },

    'planning.manage_classes': {
        title: 'Tutoriel : Gérer les classes',
        steps: [
            {
                activateTab: 'students',
                target: 'button.tab-button[onclick*="students"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Élèves : ajouter votre liste',
                text: `Cliquez « + Ajouter un élève ». Renseignez prénom, nom, email élève (essentiel pour qu'il puisse créer son compte) et email des parents. Ces emails servent ensuite aux liaisons élève/parent quand ils utilisent les codes d'accès.`,
                demo: {
                    type: 'form',
                    label: 'Exemple',
                    fields: [
                        { label: 'Prénom', value: 'Alice' },
                        { label: 'Nom', value: 'Dupont' },
                        { label: 'Email élève', value: 'alice@ecole.ch' },
                        { label: 'Email parent', value: 'parent@famille.ch' }
                    ]
                }
            },
            {
                activateTab: 'students',
                target: 'button[onclick="generateClassCode()"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Code élèves',
                text: `Génère un code unique à donner à vos élèves. Ils s'inscrivent depuis l'espace élève avec ce code et leur email pré-renseigné. <strong>L'email doit être saisi dans la fiche AVANT de transmettre le code.</strong>`
            },
            {
                activateTab: 'students',
                target: 'button[onclick="showParentCode()"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Code parents',
                text: `Même principe pour les parents. Ils créent un compte avec le code et l'email de famille saisi dans la fiche. Ils peuvent ensuite consulter notes et absences, et justifier des absences.`
            },
            {
                activateTab: 'grades',
                target: 'button.tab-button[onclick*="grades"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Notes',
                text: `Créez des évaluations (« + Nouvelle évaluation »), choisissez le type (test significatif, TA), saisissez les notes. Les moyennes se calculent automatiquement et sont visibles côté élève/parent.`
            },
            {
                activateTab: 'files',
                target: 'button.tab-button[onclick*="files"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Fichiers',
                text: `Les fichiers déposés ici sont spécifiques à cette classe. Vous pouvez aussi y glisser-déposer une copie depuis le Gestionnaire de fichiers principal.`
            },
            {
                activateTab: 'sanctions',
                target: 'button.tab-button[onclick*="sanctions"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Coches',
                text: `Si vous avez créé des modèles dans <em>Gestion des sanctions</em>, importez-les ici. Les compteurs sont disponibles à la fois ici et depuis <em>Prochain cours</em>.`
            },
            {
                activateTab: 'attendance',
                target: 'button.tab-button[onclick*="attendance"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Absences',
                text: `Historique complet par élève. Les justifications postées par les parents apparaissent automatiquement.`
            },
            {
                activateTab: 'seating',
                target: 'button.tab-button[onclick*="seating"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Plan de classe',
                text: `Outil de disposition des tables. Glissez des tables (simple, double, bureau prof), placez les élèves dessus, sauvegardez. Le plan apparaît ensuite dans <em>Prochain cours</em>.`
            },
            {
                activateTab: 'groups',
                target: 'button.tab-button[onclick*="groups"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Groupes',
                text: `Si la classe est divisée selon les périodes (ex : groupes A et B en sciences), créez les groupes ici. Vous pourrez ensuite associer un groupe à une période dans le calendrier.`
            },
            {
                activateTab: 'accommodations',
                target: 'button.tab-button[onclick*="accommodations"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: 'Onglet Aménagements',
                text: `Notez les aménagements pour les élèves à besoins particuliers (DYS, suivis spécifiques…). Ils sont signalés par une icône à côté du nom partout dans l'application.`
            }
        ]
    },

    'setup.manage_classrooms': {
        title: 'Tutoriel : Configuration des classes',
        steps: [
            {
                target: 'main',
                title: 'Liste de vos classes',
                text: `Toutes vos classes sont listées ici. Pour chacune : nom, matière, couleur, et le statut « Maître de classe » qui est important pour la collaboration.`
            },
            {
                target: '.add-classroom-btn, button[class*="add"], main',
                fallback: 'main',
                title: 'Ajouter une classe',
                text: `Cliquez « + Nouvelle classe ». Choisissez un nom court (ex: « 11VG2 »), la matière, et une couleur de fond pour la repérer dans le calendrier.`,
                demo: {
                    type: 'form',
                    label: 'Exemple',
                    fields: [
                        { label: 'Nom', value: '11VG2' },
                        { label: 'Matière', value: 'Mathématiques' },
                        { label: 'Couleur', value: '🟦 Bleu' }
                    ]
                }
            },
            {
                target: 'main',
                title: 'Maître de classe',
                text: `Cochez « Je suis maître de classe » si vous l'êtes. Cela vous permet de partager la classe avec d'autres enseignants (Allemand, Sciences…) tout en gardant la fiche élève officielle.`
            },
            {
                target: 'main',
                title: 'Supprimer',
                text: `Le bouton corbeille supprime la classe et tout ce qui y est rattaché (élèves, notes, plannings). Confirmation demandée. À utiliser surtout en fin d'année — préférez l'assistant <em>Nouvelle année</em> qui archive d'abord.`
            }
        ]
    },

    'collaboration.index': {
        title: 'Tutoriel : Collaboration',
        steps: [
            {
                target: 'main',
                title: 'Codes d\'accès centralisés',
                text: `Cette page rassemble tous les codes que vous distribuez. Vous voyez par classe les codes élèves, parents, et le code enseignant.`
            },
            {
                target: '.student-code-card, [class*="student"], main',
                fallback: 'main',
                title: 'Codes élèves',
                text: `Pour chaque classe, le code que vos élèves utilisent pour rejoindre leur compte. Il leur permet de voir leurs notes, leurs missions (exercices interactifs) et les fichiers que vous partagez avec la classe.`
            },
            {
                target: '.parent-code-card, [class*="parent"], main',
                fallback: 'main',
                title: 'Codes parents',
                text: `Code à donner aux parents pour qu'ils créent leur compte. Ils accèdent aux notes, à l'historique d'absences, et peuvent justifier les absences en ligne.`
            },
            {
                target: '.teacher-code-card, [class*="teacher"], main',
                fallback: 'main',
                title: 'Code enseignant (collaboration)',
                text: `Si vous êtes maître de classe, vous générez ici un code que vous donnez à un autre enseignant. Avec ce code, il rejoint votre classe pour SA discipline. Il voit toutes les notes/remarques mais reste cantonné à sa matière.`
            }
        ]
    },

    'planning.decoupage': {
        title: 'Tutoriel : Création de découpage',
        steps: [
            {
                target: 'main',
                title: 'À quoi sert un découpage ?',
                text: `Un découpage = un plan de l'année dans une discipline. Vous décrivez les thèmes prévus dans l'ordre, avec une durée estimée. C'est votre fil rouge pédagogique.`
            },
            {
                target: '.create-decoupage-btn, button[class*="add"], main',
                fallback: 'main',
                title: 'Créer un nouveau découpage',
                text: `Cliquez « + Nouveau découpage ». Donnez-lui un nom (« Maths 11VG »), choisissez la matière, et ajoutez les thèmes/chapitres dans l'ordre prévu.`,
                demo: {
                    type: 'form',
                    label: 'Exemple',
                    fields: [
                        { label: 'Nom', value: 'Maths 11VG' },
                        { label: 'Thème 1', value: 'Nombres rationnels' },
                        { label: 'Thème 2', value: 'Équations' },
                        { label: 'Thème 3', value: 'Géométrie' }
                    ]
                }
            },
            {
                target: 'main',
                title: 'Durée estimée par thème',
                text: `Pour chaque thème, indiquez le nombre de périodes prévues. ProfCalendar calcule automatiquement à quelle date vous devriez aborder chaque thème.`
            },
            {
                target: 'main',
                title: 'Assigner à une classe',
                text: `Une fois le découpage créé, assignez-le à une ou plusieurs classes. Vous pouvez avoir un découpage différent par niveau (11VG, 11VP…) en gardant la même matière.`
            },
            {
                target: 'main',
                title: 'Suivi dans le calendrier',
                text: `Dans la vue annuelle du calendrier, le thème courant est mis en couleur. Si vous prenez du retard, vous le voyez immédiatement et pouvez réajuster votre planification.`
            }
        ]
    },

    'year_end.step1': {
        title: 'Tutoriel : Fin d\'année / Nouvelle année',
        steps: [
            {
                target: 'main',
                title: 'Assistant de fin d\'année',
                text: `Cet assistant en plusieurs étapes vous guide pour passer proprement à la rentrée suivante : archives, exports, nettoyage, reconfiguration.`
            },
            {
                target: 'main',
                title: 'Étape 1 — Archiver les classes',
                text: `Cochez les classes que vous voulez archiver (= conserver pour consultation mais retirer du calendrier actif). Toutes leurs données (notes, absences, plannings) restent accessibles en lecture.`
            },
            {
                target: 'main',
                title: 'Étape 2 — Exporter en PDF',
                text: `Avant le nettoyage, vous pouvez exporter par classe ou tout d'un coup : moyennes, présences, sanctions… Idéal pour conserver une copie papier ou la partager avec votre direction.`
            },
            {
                target: 'main',
                title: 'Étape 3 — Reconfigurer',
                text: `Mettez à jour les dates de la nouvelle année scolaire et les vacances. Recréez vos nouvelles classes et leur horaire-type. ProfCalendar repart sur une base propre tout en gardant l'historique.`
            },
            {
                target: 'main',
                title: 'Quand lancer ?',
                text: `Typiquement en juin/juillet, après avoir clos les évaluations et imprimé les bulletins. Vous pouvez préparer la rentrée à l'avance même pendant l'été.`
            }
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
                activateTab: 'students',
                target: 'button.tab-button[onclick*="showTab(\'students\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Élèves',
                text: 'La première chose à faire est d\'ajouter des élèves à votre classe depuis cet onglet. Cliquez sur « + Ajouter un élève » et renseignez prénom, nom, et les emails (élève + parents). Ces emails sont indispensables pour que l\'élève et ses parents puissent plus tard lier leur compte à votre classe.',
                demo: {
                    type: 'form',
                    label: 'Exemple de saisie',
                    fields: [
                        { label: 'Prénom', value: 'Alice' },
                        { label: 'Nom', value: 'Dupont' },
                        { label: 'Email élève', value: 'alice@ecole.ch' },
                        { label: 'Email parent', value: 'parent@famille.ch' }
                    ]
                }
            },
            {
                activateTab: 'students',
                target: 'button[onclick="generateClassCode()"]',
                popoverPosition: 'bottom-left',
                title: 'Code élèves',
                text: 'Le bouton « Code élèves » génère un code unique à communiquer à vos élèves. Ils s\'inscrivent via la page Espace élève et rejoignent votre classe avec ce code. Ils auront alors accès à leurs missions, leurs notes et les fichiers partagés. IMPORTANT : ajoutez d\'abord l\'email de l\'élève dans sa fiche avant de lui transmettre le code, sinon le lien ne peut pas se faire.'
            },
            {
                activateTab: 'students',
                target: 'button[onclick="showParentCode()"]',
                popoverPosition: 'bottom-left',
                title: 'Code parents',
                text: 'Le bouton « Code parents » fonctionne sur le même principe pour les parents. Ils consultent les notes, absences et peuvent justifier les absences de leur enfant. Même règle : renseignez d\'abord l\'email des parents dans la fiche de l\'élève avant de leur donner le code.'
            },
            {
                activateTab: 'student-report',
                target: 'button.tab-button[onclick*="showTab(\'student-report\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Rapport élève',
                text: 'Consultez un rapport détaillé par élève : notes, absences, sanctions et progression. Pratique pour préparer un entretien avec les parents ou un bilan de fin de semestre.'
            },
            {
                activateTab: 'grades',
                target: 'button.tab-button[onclick*="showTab(\'grades\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Notes',
                text: 'Créez des évaluations (tests, TA, examens) et saisissez les notes. Les moyennes se calculent automatiquement et sont visibles par les parents et les élèves côté leur espace.'
            },
            {
                activateTab: 'files',
                target: 'button.tab-button[onclick*="showTab(\'files\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Fichiers',
                text: 'Les fichiers déposés ici sont spécifiques à cette classe. Vous pouvez aussi y glisser une copie depuis votre Gestionnaire de fichiers principal (on verra ça juste après).'
            },
            {
                activateTab: 'sanctions',
                target: 'button.tab-button[onclick*="showTab(\'sanctions\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Coches',
                text: 'Les coches comptabilisent les oublis de matériel, bavardages ou autres comportements. Vous configurez les types dans « Gestion des sanctions » (on y passe dans quelques étapes) et les incrémentez ici ou depuis la vue leçon.'
            },
            {
                activateTab: 'attendance',
                target: 'button.tab-button[onclick*="showTab(\'attendance\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Absences',
                text: 'Consultez l\'historique des absences, retards et justifications par élève. Les parents peuvent justifier les absences depuis leur espace, ce qui apparaît automatiquement ici.'
            },
            {
                activateTab: 'seating',
                target: 'button.tab-button[onclick*="showTab(\'seating\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Plan de classe',
                text: 'Disposez virtuellement les tables de votre salle et placez vos élèves dessus. Vous pouvez aussi imprimer le plan pour en avoir une version papier.'
            },
            {
                activateTab: 'groups',
                target: 'button.tab-button[onclick*="showTab(\'groups\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Groupes',
                text: 'Créez des sous-groupes d\'élèves pour le travail en équipe. Ces groupes sont utilisables dans le plan de classe et pour distribuer différents exercices.'
            },
            {
                activateTab: 'accommodations',
                target: 'button.tab-button[onclick*="showTab(\'accommodations\')"]',
                popoverPosition: 'bottom-left',
                title: 'Onglet Aménagements',
                text: 'Notez les aménagements spécifiques pour les élèves à besoins particuliers. Ils sont ensuite visibles à côté du nom de l\'élève partout dans l\'application.'
            },
            {
                activateTab: 'students',
                target: '.nav-link[href$="/planning"]',
                popoverPosition: 'bottom-left',
                title: 'Retour au tableau de bord',
                text: 'Parfait ! Vous avez fait le tour des onglets de cette page. Cliquez maintenant sur « Tableau de bord » dans la barre de navigation en haut pour passer à la fonction suivante : le gestionnaire de fichiers.',
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
                text: 'Dans la colonne de droite, vous voyez vos classes. Glissez-déposez un fichier de votre gestionnaire vers une classe pour en créer une copie dans les fichiers partagés avec cette classe. Les élèves y auront ainsi accès depuis leur espace.',
                demo: {
                    type: 'drag',
                    label: 'Animation',
                    source: 'Mes fichiers',
                    target: 'Classe 9VG',
                    fileLabel: '📄 Cours.pdf'
                }
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
                text: 'Cliquez sur « + Nouveau modèle » pour créer un type de sanction (ex: « Oubli de matériel », « Bavardage »). Vous définissez un nom, une icône et un seuil d\'alerte (à partir de combien de coches l\'élève est signalé).',
                demo: {
                    type: 'form',
                    label: 'Exemple de saisie',
                    fields: [
                        { label: 'Nom', value: 'Oubli matériel' },
                        { label: 'Icône', value: '📚' },
                        { label: 'Seuil', value: '3 coches' }
                    ]
                }
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

        // Tutoriel autonome demandé depuis le panneau d'aide du Dashboard :
        // si l'utilisateur a cliqué « Voir le tutoriel » sur une carte
        // d'une autre page, on a posé un flag avant la navigation. À
        // l'arrivée on déclenche le tutoriel correspondant.
        setTimeout(() => this.checkPendingTutorial(), 600);
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

        // Cas spécial : sur le Dashboard, on affiche le guide d'ensemble
        // qui liste toutes les pages avec un bouton « Voir le tutoriel ».
        if (page === 'planning.dashboard') {
            this.loadDashboardGuide();
            return;
        }

        // Pour les autres pages : aide contextuelle + bouton vers le tutoriel.
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

        const tutorialBtn = PAGE_TUTORIALS[page] ? `
            <div class="help-tutorial-launcher">
                <p class="help-tutorial-launcher-text">Envie d'un tour guidé pas à pas de cette page ?</p>
                <button class="help-tutorial-launcher-btn" onclick="window._helpSystem.runStandaloneTutorial('${page}')">
                    <i class="fas fa-play-circle"></i> Lancer le tutoriel
                </button>
            </div>
        ` : '';

        this.panelBody.innerHTML = tutorialBtn + content.sections.map(section => `
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

    // ============================================================
    // GUIDE DU TABLEAU DE BORD : liste des pages + bouton tutoriel
    // ============================================================
    loadDashboardGuide() {
        if (!this.panelBody) return;
        const intro = `
            <div class="help-dashboard-intro">
                <p>ProfCalendar est organisé en plusieurs pages, chacune dédiée à une
                fonction. Cliquez sur une carte ci-dessous pour découvrir ce que fait
                la page, ou lancez directement son <strong>tutoriel pas à pas</strong>.</p>
            </div>
        `;
        const cards = DASHBOARD_GUIDE.map((entry, idx) => `
            <div class="help-dashboard-card" data-key="${entry.key}">
                <div class="help-dashboard-card-header" onclick="window._helpSystem.toggleDashboardCard(this)">
                    <div class="help-dashboard-card-icon" style="background: ${entry.color};">
                        <i class="fas ${entry.icon}"></i>
                    </div>
                    <div class="help-dashboard-card-title">${entry.title}</div>
                    <i class="fas fa-chevron-down help-dashboard-card-chevron"></i>
                </div>
                <div class="help-dashboard-card-body">
                    <div class="help-dashboard-card-content">${entry.body}</div>
                    ${PAGE_TUTORIALS[entry.key] ? `
                        <button class="help-dashboard-card-btn"
                                onclick="window._helpSystem.triggerTutorial('${entry.key}', '${entry.url}')">
                            <i class="fas fa-play-circle"></i> Voir le tutoriel
                        </button>
                    ` : `
                        <a href="${entry.url}" class="help-dashboard-card-btn help-dashboard-card-btn-secondary">
                            <i class="fas fa-arrow-right"></i> Aller à la page
                        </a>
                    `}
                </div>
            </div>
        `).join('');

        this.panelBody.innerHTML = intro + `<div class="help-dashboard-cards">${cards}</div>`;
    }

    toggleDashboardCard(headerEl) {
        const card = headerEl.closest('.help-dashboard-card');
        if (!card) return;
        // Refermer les autres cartes pour garder le panneau lisible.
        card.parentElement?.querySelectorAll('.help-dashboard-card.open').forEach(c => {
            if (c !== card) c.classList.remove('open');
        });
        card.classList.toggle('open');
    }

    // ============================================================
    // TUTORIEL AUTONOME (déclenché depuis le panneau Dashboard)
    // ============================================================
    triggerTutorial(pageKey, url) {
        // On pose un flag dans localStorage pour qu'à l'arrivée sur la
        // page, init() lance automatiquement le tutoriel pas-à-pas.
        try {
            localStorage.setItem('pc_pending_tutorial', JSON.stringify({
                pageKey: pageKey,
                ts: Date.now()
            }));
        } catch (e) {}
        window.location.href = url;
    }

    checkPendingTutorial() {
        let pending = null;
        try {
            const raw = localStorage.getItem('pc_pending_tutorial');
            if (raw) pending = JSON.parse(raw);
        } catch (e) { return; }
        if (!pending) return;
        // Anti-fuite : on n'attend pas plus de 30 s entre le clic et l'arrivée.
        if (Date.now() - (pending.ts || 0) > 30000) {
            try { localStorage.removeItem('pc_pending_tutorial'); } catch (e) {}
            return;
        }
        const currentPage = this.currentPageKey();
        if (pending.pageKey !== currentPage) return;
        // Tout va bien : on supprime le flag et on lance le tutoriel.
        try { localStorage.removeItem('pc_pending_tutorial'); } catch (e) {}
        this.runStandaloneTutorial(pending.pageKey);
    }

    runStandaloneTutorial(pageKey) {
        const tutorial = PAGE_TUTORIALS[pageKey];
        if (!tutorial || !tutorial.steps?.length) return;
        // Si un tour multi-pages est en cours, on l'interrompt poliment.
        if (this.tourActive) this.endTour();
        // On ferme le panneau d'aide si ouvert (sinon il masque la cible).
        this.closePanel();

        this._standaloneActive = true;
        this._standaloneSteps = tutorial.steps;
        this._standaloneTitle = tutorial.title || 'Tutoriel';
        this._standaloneIdx = 0;
        this._standalonePage = pageKey;
        this.tourActive = true;
        // Petit délai pour laisser le panneau se fermer
        setTimeout(() => this.showStandaloneStep(), 350);
    }

    showStandaloneStep() {
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-backdrop-tour, .tour-click-catcher, .tour-pointer').forEach(el => el.remove());
        if (this._demoTimer) { clearTimeout(this._demoTimer); this._demoTimer = null; }

        if (!this._standaloneActive) return;
        const steps = this._standaloneSteps || [];
        const idx = this._standaloneIdx || 0;

        if (idx >= steps.length) {
            this.endStandaloneTutorial(true);
            return;
        }

        const step = steps[idx];

        if (step.activateTab && typeof window.showTab === 'function') {
            try { window.showTab(step.activateTab); } catch (e) {}
        }

        let target = document.querySelector(step.target);
        if (!target && step.fallback) target = document.querySelector(step.fallback);
        if (!target) {
            // Cible introuvable : on saute l'étape.
            this._standaloneIdx = idx + 1;
            this.showStandaloneStep();
            return;
        }

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

        const totalSteps = steps.length;
        const popover = document.createElement('div');
        popover.className = 'tour-popover';
        const isLast = (idx === totalSteps - 1);
        const prevBtn = idx > 0
            ? `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.prevStandaloneStep()">← Précédent</button>`
            : `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endStandaloneTutorial(false)">Quitter</button>`;
        const nextBtn = `<button class="tour-btn tour-btn-next" onclick="window._helpSystem.nextStandaloneStep()">
            ${isLast ? 'Terminer' : 'Suivant →'}
        </button>`;

        const demoHtml = step.demo ? this.renderDemo(step.demo) : '';
        popover.innerHTML = `
            <div class="tour-popover-header">
                <span class="tour-popover-step">${this._standaloneTitle} · ${idx + 1}/${totalSteps}</span>
                <h3>${step.title}</h3>
            </div>
            <div class="tour-popover-body">
                ${step.text}
                ${demoHtml}
            </div>
            <div class="tour-popover-footer">
                <div class="tour-dots">
                    ${steps.map((_, i) => `<div class="tour-dot ${i === idx ? 'active' : ''}"></div>`).join('')}
                </div>
                <div class="tour-buttons">${prevBtn}${nextBtn}</div>
            </div>
        `;

        if (step.popoverPosition === 'bottom-left') {
            popover.style.bottom = '20px';
            popover.style.left = '20px';
            popover.style.top = 'auto';
        } else if (step.popoverPosition === 'bottom-right') {
            popover.style.bottom = '20px';
            popover.style.right = '20px';
            popover.style.top = 'auto';
            popover.style.left = 'auto';
        } else {
            const popoverHeight = 280;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow > popoverHeight + 20) {
                popover.style.top = (rect.bottom + pad + 15) + 'px';
            } else {
                popover.style.top = Math.max(10, rect.top - popoverHeight - 15) + 'px';
            }
            popover.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 400)) + 'px';
        }

        document.body.appendChild(popover);
        this.addTourPointer(rect, popover);

        if (step.demo) {
            this.animateDemo(popover.querySelector('.tour-demo'), step.demo);
        }
    }

    nextStandaloneStep() {
        this._standaloneIdx = (this._standaloneIdx || 0) + 1;
        this.showStandaloneStep();
    }

    prevStandaloneStep() {
        this._standaloneIdx = Math.max(0, (this._standaloneIdx || 0) - 1);
        this.showStandaloneStep();
    }

    endStandaloneTutorial(completed) {
        this._standaloneActive = false;
        this._standaloneSteps = null;
        this._standaloneIdx = 0;
        this.tourActive = false;
        if (this._demoTimer) { clearTimeout(this._demoTimer); this._demoTimer = null; }
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-backdrop-tour, .tour-click-catcher, .tour-pointer').forEach(el => el.remove());

        if (completed) {
            const card = document.createElement('div');
            card.className = 'tour-welcome';
            card.innerHTML = `
                <div class="tour-backdrop visible"></div>
                <div class="tour-welcome-card">
                    <div class="tour-welcome-icon">✅</div>
                    <h2>Tutoriel terminé !</h2>
                    <p>Vous pouvez relancer ce tutoriel à tout moment depuis le panneau d'aide
                    de cette page (bouton bleu en bas à droite) ou depuis l'aide du tableau de bord.</p>
                    <div class="tour-welcome-buttons">
                        <button class="tour-welcome-start" onclick="this.closest('.tour-welcome').remove()">
                            <i class="fas fa-check"></i> Fermer
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(card);
        }
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
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-backdrop-tour, .tour-click-catcher, .tour-pointer').forEach(el => el.remove());
        if (this._demoTimer) { clearTimeout(this._demoTimer); this._demoTimer = null; }

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

        // Activer l'onglet demandé par l'étape (ex: showTab('students')) pour
        // que le contenu associé devienne visible avant de calculer les
        // positions du spotlight.
        if (step.activateTab && typeof window.showTab === 'function') {
            try { window.showTab(step.activateTab); } catch (e) {}
        }

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

        const demoHtml = step.demo ? this.renderDemo(step.demo) : '';
        popover.innerHTML = `
            <div class="tour-popover-header">
                <span class="tour-popover-step">${block.page.replace(/[._]/g, ' ')} · ${stepIdx + 1}/${totalSteps}</span>
                <h3>${step.title}</h3>
            </div>
            <div class="tour-popover-body">
                ${step.text}
                ${demoHtml}
            </div>
            <div class="tour-popover-footer">
                <div class="tour-dots">
                    ${block.steps.map((_, i) => `<div class="tour-dot ${i === stepIdx ? 'active' : ''}"></div>`).join('')}
                </div>
                <div class="tour-buttons">${nextBtnLabel}</div>
            </div>
        `;

        // Positionnement : soit fixé (ex: 'bottom-left' pour ne pas masquer
        // les onglets), soit auto (sous la cible si possible, sinon au-dessus).
        if (step.popoverPosition === 'bottom-left') {
            popover.style.bottom = '20px';
            popover.style.left = '20px';
            popover.style.top = 'auto';
        } else if (step.popoverPosition === 'bottom-right') {
            popover.style.bottom = '20px';
            popover.style.right = '20px';
            popover.style.top = 'auto';
            popover.style.left = 'auto';
        } else {
            const popoverHeight = 280;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow > popoverHeight + 20) {
                popover.style.top = (rect.bottom + pad + 15) + 'px';
            } else {
                popover.style.top = Math.max(10, rect.top - popoverHeight - 15) + 'px';
            }
            popover.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 400)) + 'px';
        }

        document.body.appendChild(popover);

        // Flèche animée entre le popover et la cible
        this.addTourPointer(rect, popover);

        // Démarrer l'animation de la démo (si présente)
        if (step.demo) {
            this.animateDemo(popover.querySelector('.tour-demo'), step.demo);
        }

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

    // === ANIMATIONS DÉMO ===
    renderDemo(demo) {
        if (demo.type === 'form') {
            const fields = demo.fields.map((f, i) => `
                <div class="tour-demo-field" data-field-idx="${i}">
                    <span class="tour-demo-field-label">${f.label}</span>
                    <span class="tour-demo-field-value" data-target="${f.value.replace(/"/g, '&quot;')}"></span>
                </div>
            `).join('');
            return `
                <div class="tour-demo">
                    <div class="tour-demo-label">${demo.label || 'Démo'}</div>
                    <div class="tour-demo-form">${fields}</div>
                </div>
            `;
        }
        if (demo.type === 'drag') {
            return `
                <div class="tour-demo">
                    <div class="tour-demo-label">${demo.label || 'Animation'}</div>
                    <div class="tour-demo-drag">
                        <div class="tour-demo-panel">
                            <div class="tour-demo-panel-title">${demo.source}</div>
                            <i class="fas fa-folder-open" style="color:#6B7280;"></i>
                        </div>
                        <div class="tour-demo-arrow-trail"></div>
                        <div class="tour-demo-file">${demo.fileLabel}</div>
                        <div class="tour-demo-panel">
                            <div class="tour-demo-panel-title">${demo.target}</div>
                            <i class="fas fa-users" style="color:#4F46E5;"></i>
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }

    animateDemo(container, demo) {
        if (!container) return;
        if (demo.type !== 'form') return; // drag est full-CSS, rien à faire

        // Stopper toute animation précédente
        if (this._demoTimer) clearTimeout(this._demoTimer);

        const fields = container.querySelectorAll('.tour-demo-field');
        let fieldIdx = 0;
        let charIdx = 0;

        const loop = () => {
            if (!document.body.contains(container)) return; // popover fermé

            if (fieldIdx >= fields.length) {
                // Fin : pause puis clear et recommencer
                this._demoTimer = setTimeout(() => {
                    fields.forEach(f => {
                        f.classList.remove('typed');
                        const v = f.querySelector('.tour-demo-field-value');
                        if (v) v.textContent = '';
                    });
                    fieldIdx = 0;
                    charIdx = 0;
                    this._demoTimer = setTimeout(loop, 500);
                }, 1800);
                return;
            }

            const field = fields[fieldIdx];
            const valueEl = field.querySelector('.tour-demo-field-value');
            const target = valueEl.dataset.target || '';

            if (charIdx <= target.length) {
                valueEl.textContent = target.slice(0, charIdx);
                charIdx++;
                this._demoTimer = setTimeout(loop, 55 + Math.random() * 40);
            } else {
                field.classList.add('typed');
                fieldIdx++;
                charIdx = 0;
                this._demoTimer = setTimeout(loop, 400);
            }
        };
        loop();
    }

    addTourPointer(targetRect, popover) {
        // Choisir la direction la plus naturelle pour la flèche
        const popRect = popover.getBoundingClientRect();
        const pointer = document.createElement('div');
        pointer.className = 'tour-pointer';

        // Si le popover est sous la cible, flèche vers le haut
        if (popRect.top > targetRect.bottom) {
            pointer.innerHTML = '<i class="fas fa-arrow-up"></i>';
            pointer.style.top = (targetRect.bottom + 10) + 'px';
            pointer.style.left = (targetRect.left + targetRect.width / 2 - 15) + 'px';
        }
        // Si le popover est au-dessus de la cible, flèche vers le bas
        else if (popRect.bottom < targetRect.top) {
            pointer.innerHTML = '<i class="fas fa-arrow-down"></i>';
            pointer.style.top = (targetRect.top - 40) + 'px';
            pointer.style.left = (targetRect.left + targetRect.width / 2 - 15) + 'px';
        }
        // Sinon, flèche horizontale depuis le popover vers la cible
        else {
            const popoverOnRight = popRect.left > targetRect.right;
            pointer.classList.add('from-right');
            pointer.innerHTML = popoverOnRight
                ? '<i class="fas fa-arrow-left"></i>'
                : '<i class="fas fa-arrow-right"></i>';
            pointer.style.top = (targetRect.top + targetRect.height / 2 - 15) + 'px';
            pointer.style.left = popoverOnRight
                ? (targetRect.right + 10) + 'px'
                : (targetRect.left - 40) + 'px';
        }
        document.body.appendChild(pointer);
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
        if (this._demoTimer) { clearTimeout(this._demoTimer); this._demoTimer = null; }
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-welcome, .tour-backdrop-tour, .tour-click-catcher, .tour-pointer').forEach(el => el.remove());

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
