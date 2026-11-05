/**
 * ProfCalendar — Système d'aide intégré
 * Tour guidé + Tooltips contextuels + Panneau d'aide flottant
 */
// Traductions : pcT(texte FR) est défini dans base.html ; repli si absent.
if (typeof window.pcT !== 'function') { window.pcT = function (s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return (k in v) ? String(v[k]) : m; }) : s; }; }

// ============================================================
// CONTENU D'AIDE CONTEXTUEL PAR PAGE
// ============================================================
const HELP_CONTENT = {
    // =============================================
    // TABLEAU DE BORD
    // =============================================
    'planning.dashboard': {
        title: pcT('Tableau de bord'),
        sections: [
            { title: pcT('Navigation'), items: [
                { icon: 'fa-home', color: '#4F46E5', title: pcT('Actions rapides'), desc: pcT('Les cartes colorées vous donnent un accès direct à toutes les fonctionnalités.'), steps: [pcT('Cliquez sur une carte pour ouvrir la fonctionnalité correspondante'), pcT('Les cartes avec un cadenas nécessitent un abonnement Premium'), pcT("La carte « Prochain cours » affiche votre prochaine leçon avec l'heure")] },
                { icon: 'fa-sticky-note', color: '#F59E0B', title: pcT('Mémos / Pense-bêtes'), desc: pcT('Créez des rappels liés à vos classes pour ne rien oublier.'), steps: [pcT('Cliquez « Nouveau mémo » en haut de la section'), pcT('Choisissez la classe concernée'), pcT('Sélectionnez le type : « Prochaine leçon », « Date précise » ou « Sans date »'), pcT('Rédigez votre mémo et cliquez « Enregistrer »'), pcT('Cochez un mémo pour le marquer comme terminé')] },
                { icon: 'fa-handshake', color: '#06B6D4', title: pcT('Invitations de collaboration'), desc: pcT("Gérez les demandes de partage de classe avec d'autres enseignants."), steps: [pcT('Les invitations apparaissent automatiquement ici'), pcT('Cliquez « Accepter » pour partager votre classe avec le collègue'), pcT('Cliquez « Refuser » et ajoutez un message explicatif si nécessaire')] },
            ]},
        ]
    },

    // =============================================
    // VUE LECON
    // =============================================
    'planning.lesson_view': {
        title: pcT('Vue leçon'),
        sections: [
            { title: pcT('Présences & suivi'), items: [
                { icon: 'fa-user-check', color: '#10B981', title: pcT('Marquer les présences'), desc: pcT('Gérez les présences, absences et retards de vos élèves.'), steps: [pcT("Cliquez sur le nom d'un élève vert pour le passer en absent (rouge)"), pcT('Recliquez pour le remettre présent'), pcT("Pour un retard : entrez d'abord les minutes dans le champ « min »"), pcT('Puis cliquez sur le bouton horloge à droite du champ'), pcT('Les compteurs Présents/Absents/Retards se mettent à jour en temps réel')] },
                { icon: 'fa-exclamation-triangle', color: '#F59E0B', title: pcT('Coches / Sanctions'), desc: pcT('Comptez les oublis de matériel, bavardages ou autres comportements.'), steps: [pcT("Cliquez sur l'onglet « Coches » à côté de « Présences »"), pcT('Utilisez les boutons + et - pour chaque élève/sanction'), pcT("Le compteur s'incrémente/décrémente immédiatement"), pcT("Les seuils d'alerte se déclenchent automatiquement si configurés")] },
                { icon: 'fa-th', color: '#8B5CF6', title: pcT('Plan de classe'), desc: pcT('Visualisez la disposition des tables et gérez les avertissements.'), steps: [pcT("Cliquez sur l'onglet « Plan de classe »"), pcT('Le plan montre les tables avec les noms des élèves'), pcT('Cliquez sur une table pour ajouter un avertissement visuel'), pcT('Les couleurs changent : jaune (1er avertissement) → rouge → noir'), pcT('Cliquez « Annuler » pour réinitialiser tous les avertissements')] },
            ]},
            { title: pcT('Planification & ressources'), items: [
                { icon: 'fa-edit', color: '#4F46E5', title: pcT('Planification du cours'), desc: pcT('Rédigez vos objectifs, tâches et checklist pour la leçon.'), steps: [pcT('Cliquez le bouton « Modifier » à côté de « Planification du cours »'), pcT('Rédigez vos objectifs et le déroulement du cours'), pcT('Ajoutez des éléments de checklist avec les cases à cocher'), pcT('Cliquez « Enregistrer » pour sauvegarder')] },
                { icon: 'fa-file-alt', color: '#06B6D4', title: pcT('Ajouter des ressources'), desc: pcT('Liez des fichiers ou exercices à votre leçon.'), steps: [pcT('Cliquez le bouton vert « Ajout de fichiers »'), pcT("Onglet « Fichiers de classe » : parcourez l'arborescence de vos fichiers"), pcT("Cliquez le bouton + vert à côté d'un fichier pour l'ajouter"), pcT('Onglet « Exercices interactifs » : ajoutez un exercice à lancer'), pcT('Les ressources ajoutées apparaissent dans la section du bas')] },
                { icon: 'fa-thumbtack', color: '#EF4444', title: pcT('Épingler une ressource'), desc: pcT('Gardez vos fichiers importants en haut de la liste.'), steps: [pcT("Dans la liste des ressources, cliquez l'icône épingle"), pcT('Le fichier remonte en haut de la liste'), pcT('Recliquez pour désépingler')] },
                { icon: 'fa-pencil-alt', color: '#10B981', title: pcT('Annotations PDF'), desc: pcT('Annotez vos PDF directement dans la leçon.'), steps: [pcT('Cliquez sur un fichier PDF dans les ressources'), pcT("Le PDF s'ouvre dans le visualiseur intégré"), pcT('Sur iPad : utilisez votre stylet Apple Pencil directement'), pcT('Sur ordinateur : utilisez les outils de dessin (stylo, surligneur, texte)'), pcT('Les annotations sont sauvegardées automatiquement')] },
            ]},
            { title: pcT('Exercices & suivi'), items: [
                { icon: 'fa-rocket', color: '#F59E0B', title: pcT('Lancer un exercice'), desc: pcT('Publiez un exercice en mode classique ou combat pour vos élèves.'), steps: [pcT("Ajoutez d'abord un exercice via « Ajout de fichiers » > onglet Exercices"), pcT("Cliquez le bouton « Lancer » sur l'exercice ajouté"), pcT('Choisissez le mode : « Classique » (à leur rythme) ou « Combat » (gamifié)'), pcT('Cliquez « Publier et lancer »'), pcT("Le suivi en direct s'affiche avec la progression de chaque élève")] },
                { icon: 'fa-columns', color: '#8B5CF6', title: pcT('Disposition de la page'), desc: pcT("Changez l'agencement de la page selon vos besoins."), steps: [pcT('En haut à droite, cliquez les icônes de disposition'), pcT('Mode grille : 3 colonnes équilibrées'), pcT('Mode planification : planification en grand à gauche'), pcT('Mode ressources : fichiers en grand à droite'), pcT('Mode présences : suivi des élèves en grand')] },
            ]},
        ]
    },

    // =============================================
    // GESTION DE CLASSE
    // =============================================
    'planning.manage_classes': {
        title: pcT('Gestion de classe'),
        sections: [
            { title: pcT('Élèves'), items: [
                { icon: 'fa-user-plus', color: '#10B981', title: pcT('Ajouter un élève'), desc: pcT('Inscrivez manuellement un élève dans votre classe.'), steps: [pcT('Cliquez « + Ajouter un élève »'), pcT('Remplissez le prénom (obligatoire) et le nom de famille'), pcT("Optionnel : ajoutez l'email de l'élève pour qu'il crée un compte"), pcT('Optionnel : ajoutez les emails des parents (mère et/ou père)'), pcT('Cliquez « Enregistrer »')] },
                { icon: 'fa-key', color: '#F59E0B', title: pcT("Codes d'accès élèves & parents"), desc: pcT('Générez des codes pour que les élèves et les parents créent leur compte.'), steps: [pcT('Cliquez le bouton violet « Code élèves » en haut'), pcT("Un code unique s'affiche (ex : X6VRK6)"), pcT('Communiquez ce code à vos élèves'), pcT("Ils l'utilisent sur la page d'inscription élève pour rejoindre la classe"), pcT('Le bouton « Code parents » fonctionne de la même manière pour les parents')] },
                { icon: 'fa-edit', color: '#4F46E5', title: pcT('Modifier / supprimer un élève'), desc: pcT('Éditez les informations ou retirez un élève.'), steps: [pcT("Cliquez l'icône crayon à côté du nom de l'élève pour le modifier"), pcT("Cliquez l'icône poubelle pour le supprimer (confirmation demandée)"), pcT('Attention : la suppression efface aussi ses notes et présences')] },
            ]},
            { title: pcT('Notes & évaluations'), items: [
                { icon: 'fa-chart-bar', color: '#06B6D4', title: pcT('Créer une évaluation'), desc: pcT('Ajoutez un test, devoir ou examen pour saisir les notes.'), steps: [pcT("Cliquez l'onglet « Notes »"), pcT('Cliquez « + Nouvelle évaluation » à côté du nom de la matière'), pcT('Remplissez : titre, date, note maximale, note minimale'), pcT("Choisissez le type : « Test significatif » (compte seul) ou « TA » (groupé avec d'autres)"), pcT('Cliquez « Suivant : Saisir les notes »'), pcT('Entrez la note de chaque élève (laissez vide si absent)'), pcT("Cliquez « Créer l'évaluation »")] },
                { icon: 'fa-calculator', color: '#10B981', title: pcT('Consulter les moyennes'), desc: pcT('Visualisez les notes et moyennes de vos élèves.'), steps: [pcT("L'onglet Notes affiche le tableau avec une colonne par évaluation"), pcT('La colonne « Moyenne » calcule automatiquement la moyenne de chaque élève'), pcT('Les notes sont cliquables pour les modifier'), pcT("Les statistiques en haut montrent : nombre d'élèves, évaluations, moyenne de classe")] },
            ]},
            { title: pcT('Fichiers de classe'), items: [
                { icon: 'fa-folder-plus', color: '#8B5CF6', title: pcT('Gérer les fichiers de classe'), desc: pcT('Organisez les documents partagés avec la classe.'), steps: [pcT("Cliquez l'onglet « Fichiers »"), pcT('Cliquez « Nouveau dossier » pour créer une arborescence'), pcT('Cliquez « Uploader » pour ajouter des fichiers'), pcT("Utilisez le fil d'Ariane en haut pour naviguer"), pcT('Cliquez un fichier pour le télécharger ou le prévisualiser')] },
            ]},
            { title: pcT('Absences & comportement'), items: [
                { icon: 'fa-clipboard-check', color: '#EF4444', title: pcT('Suivi des absences'), desc: pcT("Consultez l'historique des absences et retards par élève."), steps: [pcT("Cliquez l'onglet « Absences »"), pcT('Choisissez le sous-onglet : Absences totales, Retards ou Justifiées'), pcT('Le tableau liste chaque absence avec la date et la période'), pcT('Les parents peuvent justifier les absences depuis leur espace')] },
                { icon: 'fa-exclamation-circle', color: '#F59E0B', title: pcT('Configurer les coches/sanctions'), desc: pcT("Définissez les types de sanctions et les seuils d'alerte."), steps: [pcT("Cliquez l'onglet « Coches »"), pcT('Basculez entre le mode « Manuel » et « Automatique »'), pcT('En mode manuel : utilisez les boutons + et - par élève'), pcT("En mode automatique : les coches s'incrémentent selon les règles définies"), pcT('Cliquez « Réinitialiser » pour remettre tous les compteurs à zéro')] },
            ]},
            { title: pcT('Plan de classe & groupes'), items: [
                { icon: 'fa-th-large', color: '#4F46E5', title: pcT('Plan de classe'), desc: pcT('Créez la disposition des tables dans votre salle.'), steps: [pcT("Cliquez l'onglet « Plan de classe »"), pcT('Utilisez les outils : « Table simple », « Table double », « Bureau prof »'), pcT('Glissez les tables pour les positionner'), pcT('Glissez les élèves sur les tables pour les placer'), pcT('Cliquez « Sauvegarder » quand le plan est prêt'), pcT('Cliquez « Imprimer » pour obtenir une version papier')] },
                { icon: 'fa-users-cog', color: '#06B6D4', title: pcT("Groupes d'élèves"), desc: pcT('Créez des sous-groupes pour le travail en équipe.'), steps: [pcT("Cliquez l'onglet « Groupes »"), pcT('Cliquez « Créer un groupe »'), pcT('Donnez un nom au groupe'), pcT('Sélectionnez les élèves à inclure'), pcT('Cliquez « Enregistrer »'), pcT('Les groupes sont utilisables dans le plan de classe et les exercices')] },
                { icon: 'fa-universal-access', color: '#10B981', title: pcT('Aménagements'), desc: pcT('Définissez les aménagements pour les élèves à besoins particuliers.'), steps: [pcT("Cliquez l'onglet « Aménagements »"), pcT('Cliquez « Ajouter un aménagement »'), pcT("Sélectionnez l'élève concerné"), pcT('Choisissez le type et ajoutez les détails'), pcT("L'aménagement s'affiche avec une icône à côté du nom de l'élève")] },
            ]},
        ]
    },

    // =============================================
    // CALENDRIER
    // =============================================
    'planning.calendar_view': {
        title: pcT('Calendrier'),
        sections: [
            { title: pcT('Vue hebdomadaire'), items: [
                { icon: 'fa-chevron-left', color: '#4F46E5', title: pcT('Naviguer entre les semaines'), desc: pcT('Parcourez votre emploi du temps semaine par semaine.'), steps: [pcT('Cliquez la flèche ‹ pour la semaine précédente'), pcT('Cliquez la flèche › pour la semaine suivante'), pcT("Cliquez « Aujourd'hui » pour revenir à la semaine courante"), pcT('Le titre affiche la période (ex : « Semaine du 14 au 18 avril 2026 »)')] },
                { icon: 'fa-plus-circle', color: '#10B981', title: pcT('Créer une planification'), desc: pcT('Ajoutez une leçon ou un contenu à une période.'), steps: [pcT('Cliquez sur une case de la grille hebdomadaire'), pcT("Si la case est vide : un formulaire de création s'ouvre"), pcT('Remplissez le titre du cours et la description'), pcT('Cliquez « Enregistrer » pour créer la planification'), pcT("Si la case a déjà une leçon : le détail s'affiche avec les options modifier/supprimer")] },
                { icon: 'fa-expand', color: '#06B6D4', title: pcT('Vue étendue'), desc: pcT('Affichez plus de détails sur chaque période.'), steps: [pcT('Cliquez le bouton « Vue étendue » en haut à droite'), pcT("La grille s'élargit pour montrer les titres des planifications"), pcT('Recliquez pour revenir à la vue compacte')] },
            ]},
            { title: pcT('Vue annuelle'), items: [
                { icon: 'fa-calendar-alt', color: '#8B5CF6', title: pcT('Calendrier annuel'), desc: pcT("Visualisez toute votre année scolaire en un coup d'œil."), steps: [pcT('La vue annuelle est dans la colonne de droite'), pcT('Chaque case représente une semaine'), pcT('Les cases colorées indiquent des cours planifiés'), pcT('Cliquez sur une semaine pour naviguer vers cette semaine'), pcT('Les semaines de vacances sont grisées')] },
                { icon: 'fa-file-alt', color: '#10B981', title: pcT('Feuilles blanches'), desc: pcT('Créez des documents vierges rattachés à une date.'), steps: [pcT('Cliquez « Feuilles blanches » dans le panneau ressources'), pcT('Cliquez « Créer une nouvelle feuille »'), pcT("La feuille s'ouvre dans un éditeur"), pcT('Elle est automatiquement liée à la date et à la période courantes')] },
            ]},
        ]
    },

    // =============================================
    // EDITEUR D'EXERCICES
    // =============================================
    'exercises.create_exercise': {
        title: pcT("Éditeur d'exercices"),
        sections: [
            { title: pcT("Paramètres de l'exercice"), items: [
                { icon: 'fa-cog', color: '#4F46E5', title: pcT('Configuration de base'), desc: pcT('Définissez le titre, la description et les paramètres.'), steps: [pcT("Remplissez le titre de l'exercice (obligatoire)"), pcT('Ajoutez une description (optionnel)'), pcT('Sélectionnez la matière et le niveau'), pcT("Cochez « Tolérer les fautes d'orthographe » si vous le souhaitez"), pcT('Les XP totaux se calculent automatiquement selon les blocs ajoutés')] },
                { icon: 'fa-gamepad', color: '#F59E0B', title: pcT('Gamification (XP & badges)'), desc: pcT('Configurez les récompenses pour motiver les élèves.'), steps: [pcT('Dans la section « Gamification » à gauche'), pcT("Définissez le seuil de bonus or (pourcentage de réussite pour gagner de l'or)"), pcT('Définissez le seuil de badge (pourcentage pour obtenir un badge)'), pcT('Les élèves gagnent des XP pour chaque bonne réponse'), pcT('Le système de combo multiplie les XP pour les bonnes réponses consécutives')] },
            ]},
            { title: pcT('Types de blocs'), items: [
                { icon: 'fa-list-ol', color: '#4F46E5', title: pcT('QCM (Choix multiples)'), desc: pcT('Questions avec options à cocher.'), steps: [pcT('Cliquez le bouton « QCM » dans la zone de construction'), pcT('Entrez la question dans le champ texte'), pcT('Ajoutez des options de réponse'), pcT('Cochez le bouton radio de la bonne réponse'), pcT('Pour plusieurs bonnes réponses : activez « Plusieurs bonnes réponses »'), pcT('Ajoutez un feedback optionnel pour chaque option'), pcT('Réglez le timer (secondes) et les XP')] },
                { icon: 'fa-pencil-alt', color: '#10B981', title: pcT('Réponse courte'), desc: pcT("L'élève tape sa réponse en texte libre."), steps: [pcT('Cliquez le bouton « Réponse courte »'), pcT('Entrez la question'), pcT('Entrez la réponse attendue dans le champ dédié'), pcT('Si « Tolérer les fautes » est activé, les réponses proches seront acceptées'), pcT('Vous pouvez ajouter une image à la question')] },
                { icon: 'fa-text-width', color: '#06B6D4', title: pcT('Texte à trous'), desc: pcT("L'élève complète un texte avec des mots manquants."), steps: [pcT('Cliquez le bouton « Texte à trous »'), pcT('Rédigez le texte en utilisant [mot] pour créer un trou'), pcT('Exemple : « La capitale de la France est [Paris] »'), pcT("Chaque [mot] devient un champ à compléter pour l'élève"), pcT('Ajoutez des synonymes acceptés si nécessaire')] },
                { icon: 'fa-sort', color: '#8B5CF6', title: pcT('Classement / Tri'), desc: pcT("L'élève réordonne des éléments dans le bon ordre."), steps: [pcT('Cliquez le bouton « Classement »'), pcT('Ajoutez les éléments à trier'), pcT("Définissez l'ordre correct"), pcT("L'élève pourra les réorganiser par glisser-déposer")] },
                { icon: 'fa-arrows-alt-h', color: '#EF4444', title: pcT('Correspondances / Associations'), desc: pcT("L'élève relie des paires d'éléments."), steps: [pcT('Cliquez le bouton « Associations »'), pcT('Ajoutez les paires à relier (colonne gauche et droite)'), pcT("L'élève tracera des lignes entre les éléments correspondants")] },
                { icon: 'fa-image', color: '#F59E0B', title: pcT('Image interactive'), desc: pcT("L'élève clique sur des zones d'une image."), steps: [pcT('Cliquez le bouton « Image interactive »'), pcT('Uploadez une image de base'), pcT('Définissez les zones cliquables et les réponses attendues'), pcT("L'élève devra cliquer au bon endroit sur l'image")] },
            ]},
            { title: pcT('Outils de dessin'), items: [
                { icon: 'fa-paint-brush', color: '#8B5CF6', title: pcT('Fenêtre de dessin'), desc: pcT('Dessinez des schémas, graphiques ou illustrations.'), steps: [pcT("Cliquez l'icône dessin dans un bloc de question"), pcT("Une zone de dessin s'ouvre avec la barre d'outils"), pcT('Outils disponibles : stylo, surligneur, gomme, règle, compas, rapporteur, arc'), pcT('Outils de forme : flèche, rectangle, cercle, texte'), pcT("Choisissez la couleur (7 options) et l'épaisseur (5 tailles)"), pcT('Utilisez les boutons annuler/rétablir si besoin'), pcT('Cliquez « Enregistrer » pour valider le dessin')] },
            ]},
            { title: pcT('Sauvegarder & publier'), items: [
                { icon: 'fa-save', color: '#10B981', title: pcT('Sauvegarder et publier'), desc: pcT('Enregistrez votre exercice et rendez-le disponible aux élèves.'), steps: [pcT('Cliquez « Brouillon » pour sauvegarder sans publier'), pcT('Cliquez « Sauvegarder » pour enregistrer les modifications'), pcT('Pour publier : retournez à la liste des exercices'), pcT("Cliquez l'icône avion (publier) à côté de l'exercice"), pcT('Sélectionnez la classe cible'), pcT('Choisissez le mode : Classique ou Combat'), pcT('Cliquez « Publier et lancer »')] },
            ]},
        ]
    },
    'exercises.edit_exercise': null,

    // =============================================
    // GESTIONNAIRE DE FICHIERS
    // =============================================
    'file_manager.index': {
        title: pcT('Gestionnaire de fichiers'),
        sections: [
            { title: pcT('Gérer vos fichiers'), items: [
                { icon: 'fa-upload', color: '#4F46E5', title: pcT('Uploader des fichiers'), desc: pcT('Ajoutez des documents, images ou PDF à votre espace.'), steps: [pcT('Cliquez le bouton vert « Uploader fichiers » en haut'), pcT('Sélectionnez un ou plusieurs fichiers sur votre ordinateur'), pcT('Ou glissez-déposez des fichiers directement dans la page'), pcT("La barre de progression montre l'avancement"), pcT('Pour uploader un dossier entier : cliquez « Uploader dossier »')] },
                { icon: 'fa-folder-plus', color: '#10B981', title: pcT('Créer et organiser des dossiers'), desc: pcT('Structurez vos fichiers par thème, chapitre ou classe.'), steps: [pcT('Cliquez « Nouveau dossier » en haut'), pcT('Entrez le nom du dossier'), pcT('Choisissez une couleur parmi les 8 proposées (optionnel)'), pcT('Cliquez « Créer »'), pcT('Cliquez sur un dossier pour y entrer'), pcT("Le fil d'Ariane en haut montre votre emplacement")] },
                { icon: 'fa-edit', color: '#F59E0B', title: pcT('Renommer et supprimer'), desc: pcT('Modifiez le nom ou supprimez des fichiers/dossiers.'), steps: [pcT("Survolez un fichier ou dossier pour voir les icônes d'action"), pcT("Cliquez l'icône crayon pour renommer"), pcT('Pour supprimer : cliquez le bouton rouge « Supprimer » en haut'), pcT('Cochez les éléments à supprimer'), pcT('Cliquez « Supprimer les X élément(s) »'), pcT('Cliquez « Annuler » pour quitter le mode suppression')] },
            ]},
            { title: pcT('Fichiers de classe'), items: [
                { icon: 'fa-copy', color: '#06B6D4', title: pcT('Copier vers une classe'), desc: pcT("Rendez un fichier disponible dans les ressources d'une classe."), steps: [pcT('Dans la colonne de droite « Mes classes », cliquez sur une classe'), pcT("L'arborescence des fichiers de cette classe s'affiche"), pcT('Depuis votre gestionnaire (à gauche), les fichiers peuvent être copiés vers la classe')] },
                { icon: 'fa-share-alt', color: '#8B5CF6', title: pcT('Partager avec les élèves'), desc: pcT('Envoyez un fichier directement aux élèves.'), steps: [pcT("Le fichier doit d'abord être dans les fichiers de classe"), pcT('Depuis la page de la leçon ou la gestion de classe'), pcT('Les élèves le verront dans leur espace « Fichiers »')] },
            ]},
        ]
    },

    // =============================================
    // HORAIRE TYPE
    // =============================================
    'schedule.weekly_schedule': {
        title: pcT('Horaire type'),
        sections: [
            { title: pcT('Configurer votre horaire'), items: [
                { icon: 'fa-mouse-pointer', color: '#4F46E5', title: pcT('Assigner une classe à une période'), desc: pcT('Remplissez votre grille horaire avec vos classes.'), steps: [pcT('Cliquez sur une case vide de la grille'), pcT('Une fenêtre apparaît avec vos classes'), pcT('Sélectionnez la classe à assigner à cette période'), pcT('La case se remplit avec le nom et la couleur de la classe'), pcT('Répétez pour chaque période de la semaine')] },
                { icon: 'fa-eraser', color: '#EF4444', title: pcT('Retirer ou modifier une période'), desc: pcT('Libérez une case ou changez la classe assignée.'), steps: [pcT('Cliquez sur une case déjà remplie'), pcT('Sélectionnez « Retirer la classe » pour vider la case'), pcT('Ou sélectionnez une autre classe pour la remplacer')] },
                { icon: 'fa-check', color: '#10B981', title: pcT("Valider l'horaire"), desc: pcT('Finalisez votre emploi du temps pour accéder au calendrier.'), steps: [pcT('Vérifiez que toutes vos périodes sont correctement remplies'), pcT("Cliquez le bouton « Valider l'horaire » en bas de page"), pcT('Votre calendrier de planification sera généré automatiquement'), pcT("Vous pourrez modifier l'horaire plus tard depuis le tableau de bord")] },
            ]},
        ]
    },

    // =============================================
    // ABONNEMENT
    // =============================================
    'subscription.pricing': {
        title: pcT('Abonnement'),
        sections: [
            { title: pcT('Formules et paiement'), items: [
                { icon: 'fa-crown', color: '#F59E0B', title: pcT('Abonnement'), desc: pcT('Un seul abonnement, toutes les fonctionnalités.'), steps: [pcT('CHF 4.90/mois ou CHF 39.90/an (économisez {pct})', { pct: '32%' }), pcT('Inclut : planification, gestion de classe, notes, présences, sanctions, fichiers'), pcT("Cliquez « S'abonner » puis complétez le paiement via Stripe"), pcT('Sans engagement : vous pouvez annuler à tout moment'), pcT('Les comptes créés avant octobre 2026 ont un accès à vie')] },
                { icon: 'fa-ticket-alt', color: '#8B5CF6', title: pcT('Code promo / Voucher'), desc: pcT('Activez un accès avec un code.'), steps: [pcT('Si vous avez reçu un code promo, rendez-vous sur cette page'), pcT('Entrez le code dans le champ prévu'), pcT('Cliquez « Appliquer »'), pcT("L'accès sera activé immédiatement")] },
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
// Corps HTML : paragraphes et listes de textes traduits (pcT).
const _hsP = t => '<p>' + t + '</p>';
const _hsList = (tag, items) => '<' + tag + '>' + items.map(t => '<li>' + t + '</li>').join('') + '</' + tag + '>';
const DASHBOARD_GUIDE = [
    {
        key: 'planning.lesson_view',
        url: '/planning/lesson',
        icon: 'fa-rocket',
        color: '#4F46E5',
        title: pcT('Prochain cours'),
        // Le bouton change de libellé (« Cours en cours ») quand vous êtes
        // dans le créneau d'une leçon en cours.
        body: _hsP(pcT("Cette carte vous emmène vers votre prochaine leçon planifiée. Quand l'heure d'un cours commence, le bouton se transforme en <strong>« Cours en cours »</strong>."))
            + _hsP(pcT('Sur la page de la leçon vous pouvez :'))
            + _hsList('ul', [
                pcT('ouvrir et <strong>annoter les fichiers</strong> du cours (PDF, images…)'),
                pcT('consulter la liste des élèves <strong>présents, absents ou en retard</strong>'),
                pcT("ajouter des <strong>coches/sanctions</strong> aux élèves (à condition d'avoir d'abord créé un modèle dans <em>Gestion des sanctions</em>)"),
                pcT('afficher le <strong>plan de classe</strong> de la salle'),
                pcT('<strong>publier un exercice interactif</strong> à la classe en un clic')
            ])
    },
    {
        key: 'planning.calendar_view',
        url: '/planning/calendar',
        icon: 'fa-calendar-alt',
        color: '#06B6D4',
        title: pcT('Voir le calendrier'),
        body: _hsP(pcT("Le calendrier est l'outil principal pour <strong>planifier vos cours</strong> sur l'année. Vous voyez en un coup d'œil l'horaire hebdomadaire et la vue annuelle par classe."))
            + _hsP(pcT("Pour chaque période vous pouvez écrire un titre, une description, et associer un groupe d'élèves. Le panneau latéral montre les <strong>fichiers de la classe</strong> pour vous permettre de préparer la leçon en parallèle."))
    },
    {
        key: 'schedule.weekly_schedule',
        url: '/schedule/weekly',
        icon: 'fa-clock',
        color: '#F59E0B',
        title: pcT("Modifier l'horaire"),
        body: _hsP(pcT('Modifiez votre horaire-type quand votre emploi du temps change. Vous pouvez :'))
            + _hsList('ul', [
                pcT("ajouter ou retirer des <strong>périodes</strong> à n'importe quel jour de la semaine"),
                pcT('assigner une <strong>classe</strong> (ou un groupe mixte) à chaque créneau'),
                pcT('marquer des périodes comme <strong>fusionnées</strong> (ex : double leçon de 90 min)')
            ])
            + _hsP(pcT('Les changements se propagent automatiquement dans le calendrier.'))
    },
    {
        key: 'file_manager.index',
        url: '/file_manager/',
        icon: 'fa-folder-open',
        color: '#10B981',
        title: pcT('Gestionnaire de fichiers'),
        body: _hsP(pcT('Importez vos fichiers personnels (PDF, images, documents) depuis votre ordinateur, organisez-les en dossiers colorés, puis copiez-les vers les classes qui en ont besoin.'))
            + _hsP(pcT('<strong>Quota de stockage :</strong> 50 Go. Vous voyez votre consommation en haut de la page.'))
    },
    {
        key: 'exercises.index',
        url: '/exercises/',
        icon: 'fa-flask',
        color: '#A855F7',
        title: pcT('Exercices interactifs'),
        body: _hsP(pcT("Créez des exercices à résoudre en ligne par vos élèves : <strong>QCM, réponses courtes, textes à trous, classements, associations, images interactives, graphiques</strong>… Quand l'élève atteint le seuil de réussite, il <strong>débloque un badge unique</strong> attaché à l'exercice."))
            + _hsP(pcT('<em>Pré-requis :</em> les élèves doivent avoir un compte. Pour ça : renseignez leur email dans <em>Gérer les classes</em> et donnez-leur le <strong>code élèves</strong> (onglet « Codes élèves » de la même page).'))
    },
    {
        key: 'sanctions.index',
        url: '/sanctions/',
        icon: 'fa-exclamation-triangle',
        color: '#EF4444',
        title: pcT('Gestion des sanctions'),
        body: _hsP(pcT("Créez des <strong>modèles de sanctions</strong> (« Oubli de matériel », « Bavardage »…) avec leur seuil d'alerte. Quand un élève atteint le seuil, le système peut générer <strong>automatiquement</strong> une remise et la programmer dans votre agenda."))
            + _hsP(pcT('Une fois les modèles créés, vous incrémentez/décrémentez les coches depuis <em>Prochain cours</em> ou <em>Gérer les classes</em>.'))
    },
    {
        key: 'attendance.index',
        url: '/attendance/',
        icon: 'fa-user-check',
        color: '#8B5CF6',
        title: pcT('Suivi des absences'),
        body: _hsP(pcT('Vue centralisée des absences et retards de tous vos élèves, avec les <strong>justifications validées par les parents</strong>.'))
            + _hsP(pcT('<em>Pour que les parents puissent justifier en ligne :</em>'))
            + _hsList('ol', [
                pcT("renseignez leur email dans la fiche de l'élève (<em>Gérer les classes</em>)"),
                pcT('donnez-leur le <strong>code parents</strong> (onglet « Codes parents » de la même page)'),
                pcT("ils créent leur compte avec ce code et accèdent à l'espace parents")
            ])
    },
    {
        key: 'settings.index',
        url: '/settings/',
        icon: 'fa-cog',
        color: '#6B7280',
        title: pcT('Paramètres'),
        body: _hsP(pcT('Configurez les <strong>paramètres généraux</strong> de votre compte :'))
            + _hsList('ul', [
                pcT("dates de <strong>début et fin d'année scolaire</strong>"),
                pcT('périodes de <strong>vacances</strong>'),
                pcT('horaires-types (heures de cours)'),
                pcT('liste de vos <strong>classes</strong>'),
                pcT("préférences d'affichage et notifications")
            ])
    },
    {
        key: 'planning.manage_classes',
        url: '/planning/manage-classes',
        icon: 'fa-users',
        color: '#0EA5E9',
        title: pcT('Gérer les classes'),
        body: _hsP(pcT('Centre de pilotage de chaque classe. Pour chaque élève vous gérez :'))
            + _hsList('ul', [
                pcT('<strong>Fiche élève :</strong> nom, prénom, email élève + emails parents'),
                pcT('<strong>Notes</strong> et évaluations (calcul automatique des moyennes)'),
                pcT('<strong>Fichiers</strong> spécifiques à la classe'),
                pcT("<strong>Coches</strong> de comportement (créez d'abord les modèles dans <em>Gestion des sanctions</em>)"),
                pcT('<strong>Absences</strong> et historique de présence'),
                pcT('<strong>Plan de classe</strong> visualisé dans <em>Prochain cours</em>'),
                pcT('<strong>Groupes</strong> si la classe est divisée selon les périodes'),
                pcT('<strong>Aménagements</strong> des élèves à besoins particuliers')
            ])
    },
    {
        key: 'setup.manage_classrooms',
        url: '/setup/classrooms?from_dashboard=1',
        icon: 'fa-chalkboard-teacher',
        color: '#14B8A6',
        title: pcT('Configuration des classes'),
        body: _hsP(pcT("Créez ou supprimez vos classes. Pour chaque classe vous indiquez aussi si vous en êtes <strong>maître de classe</strong>. C'est nécessaire si vous voulez collaborer avec d'autres enseignants (chaque maître de classe gère la fiche officielle de l'élève, les autres collaborateurs ne voient que leur discipline)."))
    },
    {
        key: 'collaboration.index',
        url: '/collaboration/',
        icon: 'fa-handshake',
        color: '#F472B6',
        title: pcT('Collaboration'),
        body: _hsP(pcT("Cette page centralise tous les <strong>codes d'accès</strong> :"))
            + _hsList('ul', [
                pcT("<strong>Codes élèves</strong> et <strong>codes parents</strong> par classe : vos élèves et parents s'inscrivent avec ces codes pour accéder à leurs notes, remarques, fichiers et exercices interactifs."),
                pcT('<strong>Code enseignant :</strong> permet à un autre enseignant de collaborer avec une de vos classes (vous devez en être le maître). Il pourra alors voir les notes et remarques de cette classe dans sa propre discipline.')
            ])
    },
    {
        key: 'planning.decoupage',
        url: '/planning/decoupage',
        icon: 'fa-cut',
        color: '#EAB308',
        title: pcT('Création de découpage'),
        body: _hsP(pcT("Le découpage est le <strong>fil rouge pédagogique</strong> d'une discipline. Vous écrivez la séquence des thèmes/chapitres prévus sur l'année, puis vous l'assignez à une ou plusieurs classes."))
            + _hsP(pcT('Bénéfice : dans la <strong>vue annuelle du calendrier</strong>, vous voyez immédiatement si vous êtes en avance ou en retard sur votre planification annuelle.'))
    },
    {
        key: 'year_end.step1',
        url: '/year-end/',
        icon: 'fa-graduation-cap',
        color: '#DC2626',
        title: pcT('Nouvelle année'),
        body: _hsP(pcT("Assistant de fin d'année qui vous guide pour <strong>recommencer une année scolaire propre</strong> :"))
            + _hsList('ol', [
                pcT('archive les données des classes terminées'),
                pcT("permet d'exporter les notes/présences en PDF avant nettoyage"),
                pcT('réinitialise le calendrier et la liste des classes'),
                pcT('vous redéfinissez les paramètres pour la rentrée')
            ])
            + _hsP(pcT('Lancez-le typiquement en juin/juillet, après avoir clos les notes.'))
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
        title: pcT('Tutoriel : Prochain cours'),
        steps: [
            {
                target: 'main, .lesson-container, body',
                title: pcT('Bienvenue dans la vue Leçon'),
                text: pcT("Cette page est votre tableau de bord pendant un cours. Elle regroupe la planification, les ressources, les présences et le plan de classe. La disposition s'adapte selon ce que vous voulez mettre en avant.")
            },
            {
                target: '.attendance-section, [data-section="attendance"], .presences-panel, main',
                fallback: 'main',
                title: pcT('Marquer les présences en un clic'),
                text: pcT("Cliquez sur le nom d'un élève pour basculer présent/absent (vert/rouge). Pour un retard : tapez les minutes dans le petit champ « min » puis cliquez l'icône horloge à droite. Les compteurs en haut se mettent à jour en temps réel.")
            },
            {
                target: '.tab-coches, [data-tab="coches"], button[onclick*="coches"], main',
                fallback: 'main',
                title: pcT('Onglet Coches'),
                text: pcT("Si vous avez créé des modèles dans Gestion des sanctions, ils apparaissent ici sous forme de boutons + et −. Un clic incrémente la coche d'un élève. Quand le seuil que vous avez défini est atteint, l'élève est automatiquement signalé.")
            },
            {
                target: '.tab-seating, [data-tab="seating"], button[onclick*="seating"], main',
                fallback: 'main',
                title: pcT('Plan de classe'),
                text: pcT("Si vous avez créé un plan de classe dans Gérer les classes, il s'affiche ici. Vous pouvez cliquer sur une table pour ajouter un avertissement visuel à l'élève (jaune → rouge → noir).")
            },
            {
                target: '.add-resource-btn, [data-action="add-files"], button[class*="resource"], main',
                fallback: 'main',
                title: pcT('Ajouter des fichiers / exercices'),
                text: pcT('Le bouton vert « Ajout de fichiers » ouvre un sélecteur. Onglet « Fichiers de classe » : ajoutez un PDF déjà copié vers la classe. Onglet « Exercices interactifs » : ajoutez un exercice à lancer pendant la leçon.')
            },
            {
                target: '.launch-exercise-btn, [data-action="launch-exercise"], main',
                fallback: 'main',
                title: pcT('Publier un exercice à la classe'),
                text: pcT("Une fois un exercice ajouté, le bouton « Lancer » publie l'exercice : les élèves le voient apparaître immédiatement dans leur application/espace « Missions ». Choisissez « Classique » (à leur rythme) ou « Combat » (mode gamifié).")
            },
            {
                target: '.pdf-viewer-trigger, .resource-item, main',
                fallback: 'main',
                title: pcT('Annoter un PDF'),
                text: pcT("Cliquez un fichier PDF dans la liste de ressources : il s'ouvre dans le visualiseur. Sur iPad vous annotez avec l'Apple Pencil ; sur ordi avec les outils stylo/surligneur. Tout est sauvegardé en continu.")
            }
        ]
    },

    'planning.calendar_view': {
        title: pcT('Tutoriel : Calendrier'),
        steps: [
            {
                target: '.calendar-nav, main',
                fallback: 'main',
                title: pcT('Vue hebdomadaire'),
                text: pcT("Vous êtes sur la grille de la semaine. Les flèches ‹ et › naviguent de semaine en semaine sans recharger la page. « Aujourd'hui » revient à la semaine courante.")
            },
            {
                target: '.schedule-cell, td.schedule-cell, main',
                fallback: 'main',
                title: pcT('Cliquer sur une période pour planifier'),
                text: pcT("Chaque case de la grille = une période de cours. Cliquez dessus pour ouvrir le modal de planification : choisissez la classe, écrivez un titre, une description, optionnellement un groupe d'élèves."),
                demo: {
                    type: 'form',
                    label: pcT('Exemple de saisie'),
                    fields: [
                        { label: pcT('Classe'), value: '11VG2' },
                        { label: pcT('Titre'), value: pcT("Système d'équations") },
                        { label: pcT('Description'), value: pcT('Exercices p. 42') }
                    ]
                }
            },
            {
                target: '.schedule-cell.planned, .class-block.planned, main',
                fallback: 'main',
                title: pcT('Modifier ou effacer une planification'),
                text: pcT("Sur une période déjà planifiée (couleur pleine), cliquez à nouveau pour ouvrir le modal de modification. Le bouton rouge « Effacer » retire la planification (la cellule revient à l'horaire-type, ou se vide).")
            },
            {
                target: '.annual-view, [class*="annual"], main',
                fallback: 'main',
                title: pcT('Vue annuelle par classe'),
                text: pcT("À droite, la vue annuelle montre l'année entière en mini-vignettes. Si vous avez créé un découpage pédagogique, vous voyez en couleur où vous en êtes par rapport à votre planification annuelle.")
            },
            {
                target: '.file-panel, .resources-panel, main',
                fallback: 'main',
                title: pcT('Panneau ressources'),
                text: pcT('Quand vous sélectionnez une période, les fichiers de la classe associée apparaissent dans le panneau latéral. Pratique pour préparer la leçon sans changer de page.')
            }
        ]
    },

    'schedule.weekly_schedule': {
        title: pcT("Tutoriel : Modifier l'horaire"),
        steps: [
            {
                target: '.schedule-grid, table, main',
                fallback: 'main',
                title: pcT('Votre horaire-type'),
                text: pcT('Cette grille représente une semaine « modèle » : ce qui se répète chaque semaine. C\'est elle qui peuple le calendrier annuel automatiquement, en tenant compte des vacances et jours fériés.')
            },
            {
                target: 'td, .empty-cell, main',
                fallback: 'main',
                title: pcT('Assigner une classe à un créneau'),
                text: pcT('Cliquez sur une case vide. Une popup vous propose la liste de vos classes : sélectionnez celle qui occupe ce créneau. La case se colore avec la couleur de la classe.')
            },
            {
                target: 'td.filled, .filled-cell, main',
                fallback: 'main',
                title: pcT('Modifier ou retirer'),
                text: pcT('Cliquez sur une case déjà remplie pour la changer. Vous pouvez assigner une autre classe ou choisir « Retirer la classe » pour vider la case.')
            },
            {
                target: '.merge-btn, [data-action="merge"], main',
                fallback: 'main',
                title: pcT('Périodes fusionnées'),
                text: pcT('Si vous avez un cours de 90 min sur deux périodes consécutives, fusionnez-les : sélectionnez la première, puis activez « Fusionner avec la suivante ». Dans le calendrier la cellule sera doublée en hauteur.')
            },
            {
                target: '.validate-btn, [data-action="validate"], button[class*="valid"], main',
                fallback: 'main',
                title: pcT('Valider'),
                text: pcT("Quand toutes vos périodes sont remplies, cliquez « Valider l'horaire » en bas pour générer/régénérer le calendrier. Vos planifications déjà saisies sont préservées.")
            }
        ]
    },

    'file_manager.index': {
        title: pcT('Tutoriel : Gestionnaire de fichiers'),
        steps: [
            {
                target: '.upload-btn, button[class*="upload"], main',
                fallback: 'main',
                title: pcT('Uploader vos fichiers'),
                text: pcT('Le bouton vert « Uploader » importe des PDF, images ou documents depuis votre ordinateur. Vous pouvez aussi simplement glisser-déposer les fichiers dans la page.')
            },
            {
                target: '.new-folder-btn, button[class*="folder"], main',
                fallback: 'main',
                title: pcT('Créer des dossiers colorés'),
                text: pcT('Organisez vos fichiers en dossiers. Choisissez une couleur parmi les 8 proposées pour repérer rapidement vos thèmes. Les dossiers peuvent contenir des sous-dossiers (arborescence).'),
                demo: {
                    type: 'form',
                    label: pcT('Exemple de dossier'),
                    fields: [
                        { label: pcT('Nom du dossier'), value: pcT('Maths 11VG') },
                        { label: pcT('Couleur'), value: '🟢 ' + pcT('Vert') }
                    ]
                }
            },
            {
                target: '.classes-section, [data-panel="classes"], main',
                fallback: 'main',
                title: pcT('Copier vers une classe'),
                text: pcT('À droite, vos classes. Glissez un fichier ou un dossier de votre gestionnaire vers une classe : une copie est créée dans les fichiers partagés de cette classe. Les élèves la voient depuis leur espace.'),
                demo: {
                    type: 'drag',
                    label: pcT('Glisser-déposer'),
                    source: pcT('Mes fichiers'),
                    target: pcT('Classe {name}', { name: '11VG' }),
                    fileLabel: '📄 ' + pcT('Cours.pdf')
                }
            },
            {
                target: '.delete-btn, button[class*="delete"], main',
                fallback: 'main',
                title: pcT('Supprimer plusieurs éléments'),
                text: pcT('Pour supprimer, cliquez le bouton rouge « Supprimer » en haut. Cochez les fichiers/dossiers à retirer puis validez. « Annuler » quitte le mode sans rien supprimer.')
            },
            {
                target: '.storage-info, [class*="storage"], main',
                fallback: 'main',
                title: pcT('Quota de stockage'),
                text: pcT('Tout en haut, vous voyez votre consommation sur les 50 Go disponibles. Les fichiers copiés dans les classes comptent dans le quota.')
            }
        ]
    },

    'exercises.index': {
        title: pcT('Tutoriel : Exercices interactifs'),
        steps: [
            {
                target: '.create-exercise-btn, a[href*="create"], main',
                fallback: 'main',
                title: pcT('Créer un nouvel exercice'),
                text: pcT("Cliquez « + Nouvel exercice » pour ouvrir l'éditeur. Vous donnez un titre, choisissez la matière et le niveau, puis vous ajoutez des blocs.")
            },
            {
                target: 'main',
                title: pcT('Les types de blocs disponibles'),
                text: pcT('QCM, Réponse courte, Texte à trous, Classement/Tri, Associations, Image interactive, Graphique. Chaque bloc a son timer, son nombre de points et un éventuel feedback automatique.')
            },
            {
                target: 'main',
                title: pcT('Badge unique par exercice'),
                text: pcT("À la sauvegarde, ProfCalendar génère automatiquement un badge 5×5 aléatoire pour cet exercice. L'élève le débloque en couleur s'il atteint le seuil que vous avez défini, et le voit grisé sinon.")
            },
            {
                target: 'main',
                title: pcT('Publier à une classe'),
                text: pcT("Deux options : (1) depuis cette liste, l'icône avion ; (2) depuis la vue Leçon, ajoutez l'exercice aux ressources puis cliquez « Lancer ». Les élèves le voient instantanément dans leur écran « Missions ».")
            },
            {
                target: 'main',
                title: pcT('QR Code de publication rapide'),
                text: pcT("Dans l'éditeur d'un exercice, vous trouvez un QR Code. Scannez-le avec un autre appareil connecté à votre compte (par ex. une tablette pendant un cours) : l'exercice est publié à la classe que vous êtes en train d'enseigner.")
            },
            {
                target: 'main',
                title: pcT('Pré-requis côté élèves'),
                text: pcT("Pour que les élèves voient les exercices, ils doivent avoir un compte. Renseignez leur email dans <em>Gérer les classes</em>, donnez-leur le code élèves, et ils s'inscrivent depuis l'espace élève.")
            }
        ]
    },

    'sanctions.index': {
        title: pcT('Tutoriel : Gestion des sanctions'),
        steps: [
            {
                target: '.add-sanction-btn, button[class*="sanction"], a[href*="create"], main',
                fallback: 'main',
                title: pcT('Créer un modèle de sanction'),
                text: pcT('Cliquez « + Nouveau modèle ». Vous définissez un nom (« Oubli matériel »), une icône, le type (cumul ou retrait) et un seuil (ex : 3 coches = remise programmée).'),
                demo: {
                    type: 'form',
                    label: pcT('Exemple'),
                    fields: [
                        { label: pcT('Nom du modèle'), value: pcT('Oubli matériel') },
                        { label: pcT('Icône'), value: '📚' },
                        { label: pcT('Seuil'), value: pcT('{n} coches', { n: 3 }) }
                    ]
                }
            },
            {
                target: 'main',
                title: pcT('Importer dans une classe'),
                text: pcT("Une fois le modèle créé, importez-le dans les classes voulues. Le compteur démarre à 0 pour chaque élève et s'incrémente à chaque coche que vous donnez.")
            },
            {
                target: 'main',
                title: pcT('Donner une coche pendant un cours'),
                text: pcT("Allez dans <em>Prochain cours</em> ou <em>Gérer les classes</em>, onglet « Coches ». Les modèles importés sont là avec un + et un − par élève. Un clic et c'est noté.")
            },
            {
                target: 'main',
                title: pcT('Programmation automatique'),
                text: pcT('Quand un élève atteint le seuil, ProfCalendar peut programmer automatiquement la remise dans votre agenda à la date que vous précisez. Vous gardez la trace dans le rapport élève.')
            }
        ]
    },

    'attendance.index': {
        title: pcT('Tutoriel : Suivi des absences'),
        steps: [
            {
                target: 'main',
                title: pcT('Vue centralisée'),
                text: pcT('Cette page agrège les absences et retards de tous vos élèves, toutes classes confondues. Filtrez par classe, par élève ou par date depuis la barre du haut.')
            },
            {
                target: 'main',
                title: pcT('Justifications des parents'),
                text: pcT("Quand un parent justifie une absence depuis son espace, le motif apparaît automatiquement ici. Vous voyez d'un coup d'œil ce qui est justifié et ce qui ne l'est pas.")
            },
            {
                target: 'main',
                title: pcT("Comment activer l'accès parents"),
                text: pcT("1) Dans <em>Gérer les classes</em>, ajoutez l'email des parents dans la fiche de l'élève. 2) Toujours dans Gérer les classes, copiez le « code parents ». 3) Donnez-le aux parents : ils s'inscrivent depuis l'espace parents avec ce code.")
            },
            {
                target: 'main',
                title: pcT('Statistiques'),
                text: pcT("Les graphiques en bas montrent l'évolution des absences au fil de l'année. Pratique pour repérer les périodes problématiques ou pour un entretien parents.")
            }
        ]
    },

    'settings.index': {
        title: pcT('Tutoriel : Paramètres'),
        steps: [
            {
                target: 'main',
                title: pcT('Centre de configuration'),
                text: pcT("Tout ce qui est commun à votre compte se règle ici : année scolaire, vacances, horaires, classes, préférences d'affichage et notifications.")
            },
            {
                target: 'main',
                title: pcT('Année scolaire'),
                text: pcT("Définissez les dates de début et fin d'année. Le calendrier ne génèrera pas de planifications avant ou après ces dates. À ajuster en début d'année.")
            },
            {
                target: 'main',
                title: pcT('Vacances et jours fériés'),
                text: pcT('Ajoutez vos périodes de vacances (Toussaint, Noël, etc.). Les jours fériés cantonaux sont déjà pré-remplis. Les périodes en vacances sont grisées dans le calendrier.')
            },
            {
                target: 'main',
                title: pcT('Horaires des périodes'),
                text: pcT('Précisez à quelle heure commence et finit chaque période de la journée. Ces horaires sont utilisés pour détecter quand un cours est « en cours » (bouton Prochain cours).')
            },
            {
                target: 'main',
                title: pcT('Classes'),
                text: pcT("Vue de toutes vos classes avec leur couleur. Pour ajouter ou supprimer une classe, c'est dans <em>Configuration des classes</em> (depuis le tableau de bord).")
            }
        ]
    },

    'planning.manage_classes': {
        title: pcT('Tutoriel : Gérer les classes'),
        steps: [
            {
                activateTab: 'students',
                target: 'button.tab-button[onclick*="students"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Élèves : ajouter votre liste'),
                text: pcT("Cliquez « + Ajouter un élève ». Renseignez prénom, nom, email élève (essentiel pour qu'il puisse créer son compte) et email des parents. Ces emails servent ensuite aux liaisons élève/parent quand ils utilisent les codes d'accès."),
                demo: {
                    type: 'form',
                    label: pcT('Exemple'),
                    fields: [
                        { label: pcT('Prénom'), value: 'Alice' },
                        { label: pcT('Nom'), value: 'Dupont' },
                        { label: pcT('Email élève'), value: 'alice@ecole.ch' },
                        { label: pcT('Email parent'), value: 'parent@famille.ch' }
                    ]
                }
            },
            {
                activateTab: 'students',
                target: 'button[onclick="generateClassCode()"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Code élèves'),
                text: pcT("Génère un code unique à donner à vos élèves. Ils s'inscrivent depuis l'espace élève avec ce code et leur email pré-renseigné. <strong>L'email doit être saisi dans la fiche AVANT de transmettre le code.</strong>")
            },
            {
                activateTab: 'students',
                target: 'button[onclick="showParentCode()"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Code parents'),
                text: pcT("Même principe pour les parents. Ils créent un compte avec le code et l'email de famille saisi dans la fiche. Ils peuvent ensuite consulter notes et absences, et justifier des absences.")
            },
            {
                activateTab: 'grades',
                target: 'button.tab-button[onclick*="grades"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Notes'),
                text: pcT('Créez des évaluations (« + Nouvelle évaluation »), choisissez le type (test significatif, TA), saisissez les notes. Les moyennes se calculent automatiquement et sont visibles côté élève/parent.')
            },
            {
                activateTab: 'files',
                target: 'button.tab-button[onclick*="files"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Fichiers'),
                text: pcT('Les fichiers déposés ici sont spécifiques à cette classe. Vous pouvez aussi y glisser-déposer une copie depuis le Gestionnaire de fichiers principal.')
            },
            {
                activateTab: 'sanctions',
                target: 'button.tab-button[onclick*="sanctions"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Coches'),
                text: pcT('Si vous avez créé des modèles dans <em>Gestion des sanctions</em>, importez-les ici. Les compteurs sont disponibles à la fois ici et depuis <em>Prochain cours</em>.')
            },
            {
                activateTab: 'attendance',
                target: 'button.tab-button[onclick*="attendance"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Absences'),
                text: pcT('Historique complet par élève. Les justifications postées par les parents apparaissent automatiquement.')
            },
            {
                activateTab: 'seating',
                target: 'button.tab-button[onclick*="seating"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Plan de classe'),
                text: pcT('Outil de disposition des tables. Glissez des tables (simple, double, bureau prof), placez les élèves dessus, sauvegardez. Le plan apparaît ensuite dans <em>Prochain cours</em>.')
            },
            {
                activateTab: 'groups',
                target: 'button.tab-button[onclick*="groups"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Groupes'),
                text: pcT('Si la classe est divisée selon les périodes (ex : groupes A et B en sciences), créez les groupes ici. Vous pourrez ensuite associer un groupe à une période dans le calendrier.')
            },
            {
                activateTab: 'accommodations',
                target: 'button.tab-button[onclick*="accommodations"], main',
                fallback: 'main',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Aménagements'),
                text: pcT("Notez les aménagements pour les élèves à besoins particuliers (DYS, suivis spécifiques…). Ils sont signalés par une icône à côté du nom partout dans l'application.")
            }
        ]
    },

    'setup.manage_classrooms': {
        title: pcT('Tutoriel : Configuration des classes'),
        steps: [
            {
                target: 'main',
                title: pcT('Liste de vos classes'),
                text: pcT('Toutes vos classes sont listées ici. Pour chacune : nom, matière, couleur, et le statut « Maître de classe » qui est important pour la collaboration.')
            },
            {
                target: '.add-classroom-btn, button[class*="add"], main',
                fallback: 'main',
                title: pcT('Ajouter une classe'),
                text: pcT('Cliquez « + Nouvelle classe ». Choisissez un nom court (ex: « 11VG2 »), la matière, et une couleur de fond pour la repérer dans le calendrier.'),
                demo: {
                    type: 'form',
                    label: pcT('Exemple'),
                    fields: [
                        { label: pcT('Nom de la classe'), value: '11VG2' },
                        { label: pcT('Matière'), value: pcT('Mathématiques') },
                        { label: pcT('Couleur'), value: '🟦 ' + pcT('Bleu') }
                    ]
                }
            },
            {
                target: 'main',
                title: pcT('Maître de classe'),
                text: pcT("Cochez « Je suis maître de classe » si vous l'êtes. Cela vous permet de partager la classe avec d'autres enseignants (Allemand, Sciences…) tout en gardant la fiche élève officielle.")
            },
            {
                target: 'main',
                title: pcT('Supprimer'),
                text: pcT("Le bouton corbeille supprime la classe et tout ce qui y est rattaché (élèves, notes, plannings). Confirmation demandée. À utiliser surtout en fin d'année — préférez l'assistant <em>Nouvelle année</em> qui archive d'abord.")
            }
        ]
    },

    'collaboration.index': {
        title: pcT('Tutoriel : Collaboration'),
        steps: [
            {
                target: 'main',
                title: pcT("Codes d'accès centralisés"),
                text: pcT('Cette page rassemble tous les codes que vous distribuez. Vous voyez par classe les codes élèves, parents, et le code enseignant.')
            },
            {
                target: '.student-code-card, [class*="student"], main',
                fallback: 'main',
                title: pcT('Codes élèves'),
                text: pcT('Pour chaque classe, le code que vos élèves utilisent pour rejoindre leur compte. Il leur permet de voir leurs notes, leurs missions (exercices interactifs) et les fichiers que vous partagez avec la classe.')
            },
            {
                target: '.parent-code-card, [class*="parent"], main',
                fallback: 'main',
                title: pcT('Codes parents'),
                text: pcT("Code à donner aux parents pour qu'ils créent leur compte. Ils accèdent aux notes, à l'historique d'absences, et peuvent justifier les absences en ligne.")
            },
            {
                target: '.teacher-code-card, [class*="teacher"], main',
                fallback: 'main',
                title: pcT('Code enseignant (collaboration)'),
                text: pcT('Si vous êtes maître de classe, vous générez ici un code que vous donnez à un autre enseignant. Avec ce code, il rejoint votre classe pour SA discipline. Il voit toutes les notes/remarques mais reste cantonné à sa matière.')
            }
        ]
    },

    'planning.decoupage': {
        title: pcT('Tutoriel : Création de découpage'),
        steps: [
            {
                target: 'main',
                title: pcT('À quoi sert un découpage ?'),
                text: pcT("Un découpage = un plan de l'année dans une discipline. Vous décrivez les thèmes prévus dans l'ordre, avec une durée estimée. C'est votre fil rouge pédagogique.")
            },
            {
                target: '.create-decoupage-btn, button[class*="add"], main',
                fallback: 'main',
                title: pcT('Créer un nouveau découpage'),
                text: pcT("Cliquez « + Nouveau découpage ». Donnez-lui un nom (« Maths 11VG »), choisissez la matière, et ajoutez les thèmes/chapitres dans l'ordre prévu."),
                demo: {
                    type: 'form',
                    label: pcT('Exemple'),
                    fields: [
                        { label: pcT('Nom du découpage'), value: pcT('Maths 11VG') },
                        { label: pcT('Thème {n}', { n: 1 }), value: pcT('Nombres rationnels') },
                        { label: pcT('Thème {n}', { n: 2 }), value: pcT('Équations') },
                        { label: pcT('Thème {n}', { n: 3 }), value: pcT('Géométrie') }
                    ]
                }
            },
            {
                target: 'main',
                title: pcT('Durée estimée par thème'),
                text: pcT('Pour chaque thème, indiquez le nombre de périodes prévues. ProfCalendar calcule automatiquement à quelle date vous devriez aborder chaque thème.')
            },
            {
                target: 'main',
                title: pcT('Assigner à une classe'),
                text: pcT('Une fois le découpage créé, assignez-le à une ou plusieurs classes. Vous pouvez avoir un découpage différent par niveau (11VG, 11VP…) en gardant la même matière.')
            },
            {
                target: 'main',
                title: pcT('Suivi dans le calendrier'),
                text: pcT('Dans la vue annuelle du calendrier, le thème courant est mis en couleur. Si vous prenez du retard, vous le voyez immédiatement et pouvez réajuster votre planification.')
            }
        ]
    },

    'year_end.step1': {
        title: pcT("Tutoriel : Fin d'année / Nouvelle année"),
        steps: [
            {
                target: 'main',
                title: pcT("Assistant de fin d'année"),
                text: pcT('Cet assistant en plusieurs étapes vous guide pour passer proprement à la rentrée suivante : archives, exports, nettoyage, reconfiguration.')
            },
            {
                target: 'main',
                title: pcT('Étape 1 — Archiver les classes'),
                text: pcT('Cochez les classes que vous voulez archiver (= conserver pour consultation mais retirer du calendrier actif). Toutes leurs données (notes, absences, plannings) restent accessibles en lecture.')
            },
            {
                target: 'main',
                title: pcT('Étape 2 — Exporter en PDF'),
                text: pcT("Avant le nettoyage, vous pouvez exporter par classe ou tout d'un coup : moyennes, présences, sanctions… Idéal pour conserver une copie papier ou la partager avec votre direction.")
            },
            {
                target: 'main',
                title: pcT('Étape 3 — Reconfigurer'),
                text: pcT("Mettez à jour les dates de la nouvelle année scolaire et les vacances. Recréez vos nouvelles classes et leur horaire-type. ProfCalendar repart sur une base propre tout en gardant l'historique.")
            },
            {
                target: 'main',
                title: pcT('Quand lancer ?'),
                text: pcT("Typiquement en juin/juillet, après avoir clos les évaluations et imprimé les bulletins. Vous pouvez préparer la rentrée à l'avance même pendant l'été.")
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
                title: pcT('Bienvenue sur ProfCalendar !'),
                text: pcT('Ce tour vous guide à travers les fonctions principales : prochain cours, calendrier, gestion de classe, gestionnaire de fichiers, sanctions et exercices interactifs. Vous pouvez le quitter à tout moment et le reprendre plus tard via le menu utilisateur.')
            },
            {
                target: '.nav-link[href*="lesson"]',
                title: pcT('Prochain cours'),
                text: pcT("Ce lien affiche votre prochaine leçon programmée avec votre classe. Quand l'heure du cours commence, le bouton change automatiquement pour indiquer que le cours est en cours. Depuis cette page vous pouvez voir les élèves de la classe, la planification du cours et les fichiers qui lui sont liés.")
            },
            {
                target: '.nav-link[href*="calendar"]',
                title: pcT('Calendrier'),
                text: pcT("Le calendrier vous permet de parcourir toutes les semaines de l'année scolaire avec tous vos horaires. Cliquez sur une période vide pour planifier un prochain cours en quelques secondes.")
            },
            {
                target: '.nav-link[href*="manage-classes"]',
                title: pcT('Gestion de classe'),
                text: pcT('La Gestion de classe regroupe toutes les informations sur vos classes et vos élèves : inscriptions, notes, absences, plan de classe, groupes. Cliquez maintenant sur ce lien pour continuer le tour.'),
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
                title: pcT('Onglet Élèves'),
                text: pcT("La première chose à faire est d'ajouter des élèves à votre classe depuis cet onglet. Cliquez sur « + Ajouter un élève » et renseignez prénom, nom, et les emails (élève + parents). Ces emails sont indispensables pour que l'élève et ses parents puissent plus tard lier leur compte à votre classe."),
                demo: {
                    type: 'form',
                    label: pcT('Exemple de saisie'),
                    fields: [
                        { label: pcT('Prénom'), value: 'Alice' },
                        { label: pcT('Nom'), value: 'Dupont' },
                        { label: pcT('Email élève'), value: 'alice@ecole.ch' },
                        { label: pcT('Email parent'), value: 'parent@famille.ch' }
                    ]
                }
            },
            {
                activateTab: 'students',
                target: 'button[onclick="generateClassCode()"]',
                popoverPosition: 'bottom-left',
                title: pcT('Code élèves'),
                text: pcT("Le bouton « Code élèves » génère un code unique à communiquer à vos élèves. Ils s'inscrivent via la page Espace élève et rejoignent votre classe avec ce code. Ils auront alors accès à leurs missions, leurs notes et les fichiers partagés. IMPORTANT : ajoutez d'abord l'email de l'élève dans sa fiche avant de lui transmettre le code, sinon le lien ne peut pas se faire.")
            },
            {
                activateTab: 'students',
                target: 'button[onclick="showParentCode()"]',
                popoverPosition: 'bottom-left',
                title: pcT('Code parents'),
                text: pcT("Le bouton « Code parents » fonctionne sur le même principe pour les parents. Ils consultent les notes, absences et peuvent justifier les absences de leur enfant. Même règle : renseignez d'abord l'email des parents dans la fiche de l'élève avant de leur donner le code.")
            },
            {
                activateTab: 'student-report',
                target: 'button.tab-button[onclick*="showTab(\'student-report\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Rapport élève'),
                text: pcT('Consultez un rapport détaillé par élève : notes, absences, sanctions et progression. Pratique pour préparer un entretien avec les parents ou un bilan de fin de semestre.')
            },
            {
                activateTab: 'grades',
                target: 'button.tab-button[onclick*="showTab(\'grades\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Notes'),
                text: pcT('Créez des évaluations (tests, TA, examens) et saisissez les notes. Les moyennes se calculent automatiquement et sont visibles par les parents et les élèves côté leur espace.')
            },
            {
                activateTab: 'files',
                target: 'button.tab-button[onclick*="showTab(\'files\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Fichiers'),
                text: pcT('Les fichiers déposés ici sont spécifiques à cette classe. Vous pouvez aussi y glisser une copie depuis votre Gestionnaire de fichiers principal (on verra ça juste après).')
            },
            {
                activateTab: 'sanctions',
                target: 'button.tab-button[onclick*="showTab(\'sanctions\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Coches'),
                text: pcT('Les coches comptabilisent les oublis de matériel, bavardages ou autres comportements. Vous configurez les types dans « Gestion des sanctions » (on y passe dans quelques étapes) et les incrémentez ici ou depuis la vue leçon.')
            },
            {
                activateTab: 'attendance',
                target: 'button.tab-button[onclick*="showTab(\'attendance\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Absences'),
                text: pcT("Consultez l'historique des absences, retards et justifications par élève. Les parents peuvent justifier les absences depuis leur espace, ce qui apparaît automatiquement ici.")
            },
            {
                activateTab: 'seating',
                target: 'button.tab-button[onclick*="showTab(\'seating\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Plan de classe'),
                text: pcT('Disposez virtuellement les tables de votre salle et placez vos élèves dessus. Vous pouvez aussi imprimer le plan pour en avoir une version papier.')
            },
            {
                activateTab: 'groups',
                target: 'button.tab-button[onclick*="showTab(\'groups\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Groupes'),
                text: pcT("Créez des sous-groupes d'élèves pour le travail en équipe. Ces groupes sont utilisables dans le plan de classe et pour distribuer différents exercices.")
            },
            {
                activateTab: 'accommodations',
                target: 'button.tab-button[onclick*="showTab(\'accommodations\')"]',
                popoverPosition: 'bottom-left',
                title: pcT('Onglet Aménagements'),
                text: pcT("Notez les aménagements spécifiques pour les élèves à besoins particuliers. Ils sont ensuite visibles à côté du nom de l'élève partout dans l'application.")
            },
            {
                activateTab: 'students',
                target: '.nav-link[href$="/planning"]',
                popoverPosition: 'bottom-left',
                title: pcT('Retour au tableau de bord'),
                text: pcT('Parfait ! Vous avez fait le tour des onglets de cette page. Cliquez maintenant sur « Tableau de bord » dans la barre de navigation en haut pour passer à la fonction suivante : le gestionnaire de fichiers.'),
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
                title: pcT('Gestionnaire de fichiers'),
                text: pcT('Cliquez maintenant sur « Gestionnaire de fichiers » pour découvrir comment organiser vos documents.'),
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
                title: pcT('Uploader des fichiers'),
                text: pcT('Le bouton « Uploader » ajoute des fichiers (PDF, images, documents) à votre espace. Vous pouvez aussi glisser-déposer des fichiers directement dans la page. Vous disposez de 50 Go de stockage.')
            },
            {
                target: '.new-folder-btn, [data-action="new-folder"], button[class*="folder" i]',
                fallback: 'main',
                title: pcT('Créer des dossiers'),
                text: pcT("Organisez vos fichiers par thème, chapitre ou classe avec des dossiers colorés. Cliquez sur un dossier pour y entrer, et utilisez le fil d'Ariane en haut pour naviguer.")
            },
            {
                target: '.class-files-panel, .sidebar-classes, [data-panel="classes"]',
                fallback: 'main',
                title: pcT('Copier vers une classe (drag & drop)'),
                text: pcT('Dans la colonne de droite, vous voyez vos classes. Glissez-déposez un fichier de votre gestionnaire vers une classe pour en créer une copie dans les fichiers partagés avec cette classe. Les élèves y auront ainsi accès depuis leur espace.'),
                demo: {
                    type: 'drag',
                    label: pcT('Animation'),
                    source: pcT('Mes fichiers'),
                    target: pcT('Classe {name}', { name: '9VG' }),
                    fileLabel: '📄 ' + pcT('Cours.pdf')
                }
            },
            {
                target: '.delete-btn, [data-action="delete"], button[class*="delete" i]',
                fallback: 'main',
                title: pcT('Supprimer des fichiers'),
                text: pcT('Pour supprimer, cliquez sur le bouton « Supprimer » rouge en haut, cochez les fichiers/dossiers à retirer, puis validez. Vous pouvez aussi cliquer « Annuler » pour quitter le mode suppression sans rien supprimer.')
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: pcT('Retour au tableau de bord'),
                text: pcT('Retournons au tableau de bord pour voir la Gestion des sanctions. Cliquez sur « Tableau de bord » dans la barre de navigation.'),
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
                title: pcT('Gestion des sanctions'),
                text: pcT('Cliquez maintenant sur « Gestion des sanctions » pour apprendre à configurer les coches de comportement.'),
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
                title: pcT('Créer un modèle de sanction'),
                text: pcT("Cliquez sur « + Nouveau modèle » pour créer un type de sanction (ex: « Oubli de matériel », « Bavardage »). Vous définissez un nom, une icône et un seuil d'alerte (à partir de combien de coches l'élève est signalé)."),
                demo: {
                    type: 'form',
                    label: pcT('Exemple de saisie'),
                    fields: [
                        { label: pcT('Nom du modèle'), value: pcT('Oubli matériel') },
                        { label: pcT('Icône'), value: '📚' },
                        { label: pcT('Seuil'), value: pcT('{n} coches', { n: 3 }) }
                    ]
                }
            },
            {
                target: 'main',
                title: pcT('Où utiliser les coches ?'),
                text: pcT("Les coches que vous définissez ici apparaissent automatiquement sur la page de votre leçon (Prochain cours) dans l'onglet « Coches ». Vous pouvez les incrémenter en un clic pendant votre cours, et elles sont aussi visibles dans la Gestion de classe.")
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: pcT('Retour au tableau de bord'),
                text: pcT('Direction la dernière fonction : les exercices interactifs. Cliquez sur « Tableau de bord » dans la barre de navigation.'),
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
                title: pcT('Exercices interactifs'),
                text: pcT('Cliquez sur « Exercices interactifs » pour découvrir comment créer et publier des exercices auprès de vos élèves.'),
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
                title: pcT('Créer un nouvel exercice'),
                text: pcT("Cliquez sur « + Nouvel exercice » pour ouvrir l'éditeur. Vous donnez un titre à l'exercice, puis vous ajoutez des blocs de différents types.")
            },
            {
                target: 'main',
                title: pcT("Les types d'exercices disponibles"),
                text: pcT("Dans l'éditeur vous pouvez ajouter : QCM (choix multiples), Réponse courte (texte libre), Texte à trous, Classement/Tri, Correspondances (relier des paires) et Image interactive (zones cliquables). Chaque bloc a ses propres paramètres : question, réponses attendues, timer, nombre de points.")
            },
            {
                target: 'main',
                title: pcT("Envoyer l'exercice aux élèves"),
                text: pcT("Deux options pour publier un exercice : (1) depuis la liste des exercices, cliquez sur l'icône avion à côté de l'exercice et choisissez la classe cible ; (2) depuis la vue d'une leçon, ajoutez l'exercice dans les ressources puis cliquez « Lancer ». Les élèves le verront immédiatement dans leur espace « Missions » et pourront y répondre.")
            },
            {
                target: 'main',
                title: pcT('Côté élève'),
                text: pcT("L'élève se connecte avec son compte (créé grâce au code élève), va dans l'onglet « Missions » et voit tous les exercices publiés. Il répond, reçoit un retour immédiat sur ses réponses et vous pouvez consulter ses résultats dans les statistiques de l'exercice.")
            },
            {
                target: '.nav-link[href$="/planning"]',
                title: pcT('Fin du tour !'),
                text: pcT('Vous avez fait le tour des fonctions principales de ProfCalendar. Cliquez sur « Tableau de bord » dans la barre de navigation pour terminer. Vous pouvez relancer ce tour à tout moment depuis le menu utilisateur en haut à droite > « Revoir le tutoriel ».'),
                waitForClick: true,
                clickSelector: '.nav-link[href$="/planning"]'
            }
        ]
    }
];

// ============================================================
// APP iOS : réduire l'aide aux pages accessibles depuis le téléphone
// ============================================================
// L'app iOS ne donne accès qu'aux 7 actions essentielles (cf. dashboard
// simplifié). On retire donc ici toute l'aide liée aux pages NON accessibles
// au téléphone (exercices, fichiers, sanctions, collaboration, découpage,
// fin d'année, tarifs), on réduit l'aide du tableau de bord à « Actions
// rapides » (mémos/invitations retirés de l'app), et on désactive le tour
// guidé multi-pages (il passe par des pages absentes sur téléphone).
// `window.IS_IOS_APP` est défini dans base.html avant le chargement de ce script.
if (window.IS_IOS_APP) {
    const NOT_ON_PHONE = [
        'exercises.create_exercise', 'exercises.edit_exercise', 'exercises.index',
        'file_manager.index', 'sanctions.index', 'collaboration.index',
        'planning.decoupage', 'year_end.step1', 'subscription.pricing',
    ];
    NOT_ON_PHONE.forEach(k => { delete HELP_CONTENT[k]; delete PAGE_TUTORIALS[k]; });

    const dash = HELP_CONTENT['planning.dashboard'];
    if (dash && Array.isArray(dash.sections)) {
        dash.sections.forEach(s => {
            if (Array.isArray(s.items)) {
                s.items = s.items.filter(it => it.icon !== 'fa-sticky-note' && it.icon !== 'fa-handshake');
            }
        });
    }

    // Pas de tour guidé multi-pages dans l'app (élément cible souvent absent).
    TOUR_SEQUENCE.length = 0;
}

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
        } else if (document.body.dataset.firstVisit === 'true'
                   && this.currentPageKey() === 'planning.dashboard'
                   && !window.pcTutorial
                   && !document.getElementById('onboarding-steps')) {
            // (window.pcTutorial : le tutoriel animé prend le relais du tour
            // multi-pages — voir pc-tutorial.js.)
            // Si la checklist d'onboarding « 3 étapes » est présente (compte
            // neuf), c'est la visite guidée d'onboarding du dashboard qui prend
            // le relais — on ne lance pas le tour multi-pages des fonctions.
            // IMPORTANT : on ne déclenche le tour QUE sur le dashboard.
            // Sans ce garde-fou, le tour démarrait dès la page de choix
            // d'abonnement ou le setup initial — ce qui n'a pas de sens
            // (le user n'a pas encore la nav, les classes, etc.).
            // Le flag data-first-visit reste posé tant que /api/help/tour-completed
            // n'a pas été appelé, donc on attend tranquillement que
            // l'utilisateur finisse son inscription et atterrisse sur le
            // dashboard avant de déclencher.
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
            content = { title: pcT('Aide'), sections: [{ title: pcT('Aide générale'), items: [
                { icon: 'fa-question-circle', color: '#4F46E5', title: pcT("Besoin d'aide ?"), desc: pcT("Naviguez vers une page spécifique pour voir l'aide contextuelle."), steps: [] }
            ]}]};
        }

        const tutorialBtn = PAGE_TUTORIALS[page] ? `
            <div class="help-tutorial-launcher">
                <p class="help-tutorial-launcher-text">${pcT("Envie d'un tour guidé pas à pas de cette page ?")}</p>
                <button class="help-tutorial-launcher-btn" onclick="window._helpSystem.runStandaloneTutorial('${page}')">
                    <i class="fas fa-play-circle"></i> ${pcT('Lancer le tutoriel')}
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
                <p>${pcT('ProfCalendar est organisé en plusieurs pages, chacune dédiée à une fonction. Cliquez sur une carte ci-dessous pour découvrir ce que fait la page, ou lancez directement son <strong>tutoriel pas à pas</strong>.')}</p>
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
                            <i class="fas fa-play-circle"></i> ${pcT('Voir le tutoriel')}
                        </button>
                    ` : `
                        <a href="${entry.url}" class="help-dashboard-card-btn help-dashboard-card-btn-secondary">
                            <i class="fas fa-arrow-right"></i> ${pcT('Aller à la page')}
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
        this._standaloneTitle = tutorial.title || pcT('Tutoriel');
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
            ? `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.prevStandaloneStep()">← ${pcT('Précédent')}</button>`
            : `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endStandaloneTutorial(false)">${pcT('Quitter')}</button>`;
        const nextBtn = `<button class="tour-btn tour-btn-next" onclick="window._helpSystem.nextStandaloneStep()">
            ${isLast ? pcT('Terminer') : pcT('Suivant') + ' →'}
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
                    <h2>${pcT('Tutoriel terminé !')}</h2>
                    <p>${pcT("Vous pouvez relancer ce tutoriel à tout moment depuis le panneau d'aide de cette page (bouton bleu en bas à droite) ou depuis l'aide du tableau de bord.")}</p>
                    <div class="tour-welcome-buttons">
                        <button class="tour-welcome-start" onclick="this.closest('.tour-welcome').remove()">
                            <i class="fas fa-check"></i> ${pcT('Fermer')}
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(card);
        }
    }

    // === EVENTS ===
    bindEvents() {
        this.fab?.addEventListener('click', () => {
            // Le bouton « ? » ouvre le tutoriel animé, chapitre de la page en
            // avant. L'ancien panneau d'aide contextuelle (HELP_CONTENT,
            // PAGE_TUTORIALS) est conservé mais n'est plus proposé.
            if (window.pcTutorial) { window.pcTutorial.open({ fromPage: true }); return; }
            this.togglePanel();
        });
        this.overlay.addEventListener('click', () => this.closePanel());
        this.panel?.querySelector('.help-panel-close')?.addEventListener('click', () => this.closePanel());
        this.panel?.querySelector('.help-restart-tour')?.addEventListener('click', () => {
            this.closePanel();
            // Le tutoriel animé remplace le tour multi-pages quand il est chargé.
            if (window.pcTutorial) { setTimeout(() => window.pcTutorial.open(), 200); return; }
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
                <h2>${pcT('Bienvenue sur ProfCalendar !')}</h2>
                <p>${pcT("Découvrons ensemble les fonctions principales. Le tour passe par plusieurs pages du site : laissez-vous guider et cliquez là où il vous l'indique. Vous pouvez quitter à tout moment.")}</p>
                <div class="tour-welcome-buttons">
                    <button class="tour-welcome-skip" onclick="window._helpSystem.endTour(this.closest('.tour-welcome'))">${pcT('Passer')}</button>
                    <button class="tour-welcome-start" onclick="window._helpSystem.beginTourSteps(this.closest('.tour-welcome'))">
                        <i class="fas fa-play"></i> ${pcT('Commencer le tour')}
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
                <h2>${pcT('Tour terminé !')}</h2>
                <p>${pcT('Vous avez fait le tour des fonctions principales de ProfCalendar. Bon enseignement ! Vous pouvez relancer ce tour à tout moment depuis le menu utilisateur en haut à droite > « Revoir le tutoriel ».')}</p>
                <div class="tour-welcome-buttons">
                    <button class="tour-welcome-start" onclick="window._helpSystem.endTour(this.closest('.tour-welcome'))">
                        <i class="fas fa-check"></i> ${pcT('Terminer')}
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
            ? `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endTour()">${pcT('Quitter le tour')}</button>`
            : `<button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endTour()">${pcT('Passer')}</button>
               <button class="tour-btn tour-btn-next" onclick="window._helpSystem.nextTourStep()">
                   ${isLastStepOfBlock ? pcT('Suite') + ' →' : pcT('Suivant') + ' →'}
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
                    <div class="tour-demo-label">${demo.label || pcT('Démo')}</div>
                    <div class="tour-demo-form">${fields}</div>
                </div>
            `;
        }
        if (demo.type === 'drag') {
            return `
                <div class="tour-demo">
                    <div class="tour-demo-label">${demo.label || pcT('Animation')}</div>
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
    // Tutoriel animé : il se joue sur n'importe quelle page, sans rechargement.
    if (window.pcTutorial) { window.pcTutorial.open(); return; }
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
