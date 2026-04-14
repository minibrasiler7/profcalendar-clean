/**
 * ProfCalendar — Système d'aide intégré
 * Tour guidé + Tooltips contextuels + Panneau d'aide flottant
 */

// ============================================================
// CONTENU D'AIDE CONTEXTUEL PAR PAGE
// ============================================================
const HELP_CONTENT = {
    'planning.dashboard': {
        title: 'Tableau de bord',
        sections: [{
            title: 'Pour commencer',
            items: [
                { icon: 'fa-home', color: '#4F46E5', title: 'Actions rapides', text: 'Utilisez les cartes colorees pour acceder rapidement aux fonctions principales : prochain cours, calendrier, exercices, fichiers.' },
                { icon: 'fa-clock', color: '#06B6D4', title: 'Prochain cours', text: 'Cliquez sur "Prochain cours" pour voir votre prochaine leçon avec les presences, ressources et annotations.' },
                { icon: 'fa-calendar', color: '#10B981', title: 'Calendrier', text: 'Le calendrier affiche votre emploi du temps semaine par semaine. Cliquez sur une periode pour creer ou voir une planification.' },
            ]
        }]
    },
    'planning.lesson_view': {
        title: 'Vue leçon',
        sections: [{
            title: 'Gerer votre cours',
            items: [
                { icon: 'fa-user-check', color: '#10B981', title: 'Presences', text: 'Cliquez sur un eleve pour le marquer absent (vert → rouge). Utilisez le bouton horloge pour les retards (entrez d\'abord les minutes).' },
                { icon: 'fa-exclamation-triangle', color: '#F59E0B', title: 'Coches / Sanctions', text: 'L\'onglet "Coches" permet de compter les oublis de materiel ou comportements. Boutons + et - par eleve.' },
                { icon: 'fa-th', color: '#8B5CF6', title: 'Plan de classe', text: 'L\'onglet "Plan de classe" affiche la disposition des tables. Cliquez sur un eleve pour ajouter un avertissement visuel (jaune → rouge → noir).' },
                { icon: 'fa-file-pdf', color: '#EF4444', title: 'Ressources & PDF', text: 'Cliquez "Ajout de fichiers" pour lier des documents de classe a cette leçon. Les PDF s\'ouvrent avec l\'annotateur integre.' },
                { icon: 'fa-pencil-alt', color: '#06B6D4', title: 'Annotations', text: 'Sur iPad avec stylet : annotez directement les PDF. Sur ordinateur : utilisez la souris pour dessiner, surligner et ecrire.' },
            ]
        }]
    },
    'planning.manage_classes': {
        title: 'Gestion de classe',
        sections: [{
            title: 'Gerer vos classes',
            items: [
                { icon: 'fa-users', color: '#4F46E5', title: 'Onglets', text: 'Naviguez entre Eleves, Rapport, Notes, Fichiers, Coches, Absences, Plan de classe, Groupes et Amenagements.' },
                { icon: 'fa-user-plus', color: '#10B981', title: 'Ajouter des eleves', text: 'Cliquez "+ Ajouter un eleve" pour inscrire manuellement. Les eleves peuvent aussi s\'inscrire eux-memes avec le code de classe.' },
                { icon: 'fa-key', color: '#F59E0B', title: 'Codes d\'acces', text: 'Le bouton "Code eleves" genere un code que vos eleves utilisent pour creer leur compte et rejoindre votre classe.' },
                { icon: 'fa-chart-bar', color: '#06B6D4', title: 'Notes', text: 'L\'onglet Notes permet de creer des evaluations, saisir les notes et calculer les moyennes automatiquement.' },
            ]
        }]
    },
    'planning.calendar_view': {
        title: 'Calendrier',
        sections: [{
            title: 'Navigation',
            items: [
                { icon: 'fa-chevron-left', color: '#4F46E5', title: 'Naviguer', text: 'Utilisez les fleches < > pour changer de semaine. Le bouton "Aujourd\'hui" revient a la semaine courante.' },
                { icon: 'fa-plus-circle', color: '#10B981', title: 'Creer une leçon', text: 'Cliquez sur une case vide du calendrier pour creer une nouvelle planification pour cette periode.' },
                { icon: 'fa-expand', color: '#06B6D4', title: 'Vue etendue', text: 'Le bouton "Vue etendue" affiche toutes les periodes avec plus de detail.' },
                { icon: 'fa-calendar-alt', color: '#8B5CF6', title: 'Vue annuelle', text: 'La colonne droite montre la vue annuelle par semaine. Les cases colorees indiquent vos cours planifies.' },
            ]
        }]
    },
    'exercises.create_exercise': {
        title: 'Editeur d\'exercices',
        sections: [{
            title: 'Creer un exercice',
            items: [
                { icon: 'fa-list-ol', color: '#4F46E5', title: 'Types de blocs', text: 'Choisissez parmi : QCM, Reponse courte, Texte a trous, Classement, Associations, Image interactive, Graphique.' },
                { icon: 'fa-check-circle', color: '#10B981', title: 'QCM', text: 'Ajoutez des options et selectionnez la bonne reponse (radio). Activez "Plusieurs bonnes reponses" pour les checkboxes.' },
                { icon: 'fa-gamepad', color: '#F59E0B', title: 'Gamification', text: 'Definissez les seuils de bonus or et badge. Les eleves gagnent des XP et montent de niveau en completant les exercices.' },
                { icon: 'fa-paper-plane', color: '#EF4444', title: 'Publier', text: 'Sauvegardez d\'abord, puis depuis la liste des exercices, cliquez l\'icone avion pour publier vers une classe.' },
            ]
        }]
    },
    'exercises.edit_exercise': null, // Reutilise create_exercise
    'file_manager.index': {
        title: 'Gestionnaire de fichiers',
        sections: [{
            title: 'Gerer vos fichiers',
            items: [
                { icon: 'fa-upload', color: '#4F46E5', title: 'Uploader', text: 'Cliquez "Uploader fichiers" pour ajouter des PDF, images ou documents. Glissez-deposez aussi directement dans la zone.' },
                { icon: 'fa-folder-plus', color: '#10B981', title: 'Dossiers', text: 'Creez des dossiers pour organiser vos fichiers par theme ou chapitre. Vous pouvez changer leur couleur.' },
                { icon: 'fa-copy', color: '#06B6D4', title: 'Copier vers classe', text: 'Les fichiers de la colonne droite "Mes classes" montrent les fichiers disponibles pour vos eleves.' },
                { icon: 'fa-share', color: '#8B5CF6', title: 'Partager', text: 'Partagez un fichier avec vos eleves pour qu\'ils puissent le consulter depuis leur espace.' },
            ]
        }]
    },
    'schedule.weekly_schedule': {
        title: 'Horaire type',
        sections: [{
            title: 'Configurer votre horaire',
            items: [
                { icon: 'fa-mouse-pointer', color: '#4F46E5', title: 'Assigner une classe', text: 'Cliquez sur une case vide de la grille pour y assigner une de vos classes. Selectionnez la classe dans le popup.' },
                { icon: 'fa-eraser', color: '#EF4444', title: 'Retirer une classe', text: 'Cliquez sur une case occupee puis "Retirer la classe" pour liberer cette periode.' },
                { icon: 'fa-check', color: '#10B981', title: 'Valider', text: 'Une fois votre horaire complet, cliquez "Valider l\'horaire" pour acceder a votre calendrier de planification.' },
            ]
        }]
    },
    'subscription.pricing': {
        title: 'Abonnement',
        sections: [{
            title: 'Plans disponibles',
            items: [
                { icon: 'fa-gift', color: '#10B981', title: 'Gratuit', text: 'Le plan gratuit inclut le tableau de bord, la planification de cours et le calendrier scolaire.' },
                { icon: 'fa-crown', color: '#F59E0B', title: 'Premium', text: 'Debloquez la gestion de classe, les notes, le suivi des presences, les exercices, la collaboration et le gestionnaire de fichiers.' },
                { icon: 'fa-ticket-alt', color: '#8B5CF6', title: 'Code promo', text: 'Vous avez un code promo ? Entrez-le dans le champ voucher pour obtenir un acces Premium gratuit.' },
            ]
        }]
    }
};

// ============================================================
// ÉTAPES DU TOUR GUIDÉ
// ============================================================
const TOUR_STEPS = [
    {
        target: '.nav-brand',
        title: 'Bienvenue sur ProfCalendar !',
        text: 'Votre plateforme de gestion scolaire tout-en-un. Ce rapide tour vous montre les fonctions essentielles.',
        position: 'bottom'
    },
    {
        target: '.nav-link[href*="planning/lesson"], .nav-link[href*="lesson"]',
        title: 'Prochain cours',
        text: 'Accedez a votre prochaine leçon en un clic. Gerez les presences, les sanctions et ouvrez vos ressources PDF directement.',
        position: 'bottom'
    },
    {
        target: '.nav-link[href*="manage-classes"]',
        title: 'Gestion de classe',
        text: 'Gerez vos eleves, saisissez les notes, suivez les absences et organisez les groupes. C\'est le coeur de ProfCalendar.',
        position: 'bottom'
    },
    {
        target: '.nav-link[href*="calendar"]',
        title: 'Calendrier',
        text: 'Votre emploi du temps semaine par semaine. Cliquez sur une periode pour creer une planification de cours.',
        position: 'bottom'
    },
    {
        target: '.user-dropdown',
        title: 'Parametres & Aide',
        text: 'Accedez a vos parametres, votre abonnement et la deconnexion. Le bouton ? en bas a droite ouvre l\'aide a tout moment.',
        position: 'bottom-left'
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
        if (document.body.dataset.firstVisit === 'true') {
            setTimeout(() => this.startTour(), 800);
        }
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
            // Essayer avec le fallback (ex: exercises.edit_exercise → exercises.create_exercise)
            const fallbacks = Object.keys(HELP_CONTENT);
            const prefix = page.split('.')[0];
            const fallback = fallbacks.find(k => k.startsWith(prefix) && HELP_CONTENT[k]);
            if (fallback) content = HELP_CONTENT[fallback];
        }
        if (!content) {
            content = { title: 'Aide', sections: [{ title: 'Aide generale', items: [
                { icon: 'fa-question-circle', color: '#4F46E5', title: 'Besoin d\'aide ?', text: 'Naviguez vers une page specifique pour voir l\'aide contextuelle correspondante.' }
            ]}]};
        }
        this.panelBody.innerHTML = content.sections.map(section => `
            <div class="help-section">
                <div class="help-section-title">${section.title}</div>
                ${section.items.map(item => `
                    <div class="help-item">
                        <div class="help-item-icon" style="background: ${item.color};">
                            <i class="fas ${item.icon}"></i>
                        </div>
                        <div class="help-item-content">
                            <h4>${item.title}</h4>
                            <p>${item.text}</p>
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

    // === TOUR GUIDÉ ===
    startTour() {
        // Afficher le modal de bienvenue
        const welcome = document.createElement('div');
        welcome.className = 'tour-welcome';
        welcome.innerHTML = `
            <div class="tour-backdrop visible"></div>
            <div class="tour-welcome-card">
                <div class="tour-welcome-icon">🎓</div>
                <h2>Bienvenue sur ProfCalendar !</h2>
                <p>Decouvrons ensemble les fonctions principales en quelques etapes. Ce tour ne prend que 30 secondes.</p>
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
        this.currentTourStep = 0;
        this.showTourStep();
    }

    showTourStep() {
        // Nettoyer les elements precedents
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-backdrop-tour').forEach(el => el.remove());

        if (this.currentTourStep >= TOUR_STEPS.length) {
            this.endTour();
            return;
        }

        const step = TOUR_STEPS[this.currentTourStep];
        const target = document.querySelector(step.target);

        if (!target) {
            this.currentTourStep++;
            this.showTourStep();
            return;
        }

        // Spotlight
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
        const popover = document.createElement('div');
        popover.className = 'tour-popover';
        popover.innerHTML = `
            <div class="tour-popover-header">
                <span class="tour-popover-step">Etape ${this.currentTourStep + 1}/${TOUR_STEPS.length}</span>
                <h3>${step.title}</h3>
            </div>
            <div class="tour-popover-body">${step.text}</div>
            <div class="tour-popover-footer">
                <div class="tour-dots">
                    ${TOUR_STEPS.map((_, i) => `<div class="tour-dot ${i === this.currentTourStep ? 'active' : ''}"></div>`).join('')}
                </div>
                <div class="tour-buttons">
                    <button class="tour-btn tour-btn-skip" onclick="window._helpSystem.endTour()">Passer</button>
                    <button class="tour-btn tour-btn-next" onclick="window._helpSystem.nextTourStep()">
                        ${this.currentTourStep === TOUR_STEPS.length - 1 ? 'Terminer ✓' : 'Suivant →'}
                    </button>
                </div>
            </div>
        `;

        // Positionner le popover sous le spotlight
        popover.style.top = (rect.bottom + pad + 15) + 'px';
        popover.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 400)) + 'px';

        document.body.appendChild(popover);
    }

    nextTourStep() {
        this.currentTourStep++;
        this.showTourStep();
    }

    endTour(welcomeEl) {
        welcomeEl?.remove();
        this.tourActive = false;
        this.currentTourStep = -1;
        document.querySelectorAll('.tour-spotlight, .tour-popover, .tour-welcome, .tour-backdrop-tour').forEach(el => el.remove());

        // Marquer comme vu cote serveur
        fetch('/api/help/tour-completed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        }).catch(() => {});
    }
}

// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Uniquement pour les enseignants connectes (pas les eleves/parents/visiteurs)
    if (document.querySelector('.help-fab')) {
        window._helpSystem = new HelpSystem();
    }
});
