/**
 * Système de gestion des mémos de classe et remarques élèves
 * Permet de créer des mémos avec % et des remarques avec +
 */

class LessonMemosManager {
    constructor() {
        this.memosInput = null;
        this.autocompleteDiv = null;
        this.memosListContainer = null;
        this.currentMode = null; // 'memo' ou 'remark'
        this.selectedIndex = -1;
        this.filteredStudents = [];
        this.currentMemoData = null; // Pour le mode mémo (choix de date)

        this.init();
    }

    init() {
        // Attendre que le DOM soit prêt
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.memosInput = document.getElementById('memosInput');
        this.autocompleteDiv = document.getElementById('memoAutocomplete');
        this.memosListContainer = document.getElementById('memosListContainer');

        if (!this.memosInput) return;

        // Événements sur le textarea
        this.memosInput.addEventListener('input', (e) => this.handleInput(e));
        this.memosInput.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.memosInput.addEventListener('blur', () => {
            // Petit délai pour permettre les clics sur l'autocomplétion
            setTimeout(() => this.hideAutocomplete(), 200);
        });

        // Charger les mémos/remarques existants
        this.loadExistingMemosAndRemarks();
    }

    handleInput(e) {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;

        // Chercher % ou + avant le curseur
        const textBeforeCursor = value.substring(0, cursorPos);
        const lastPercent = textBeforeCursor.lastIndexOf('%');
        const lastPlus = textBeforeCursor.lastIndexOf('+');

        // Vérifier si on est en mode mémo (%)
        if (lastPercent > lastPlus && lastPercent >= 0) {
            const searchText = textBeforeCursor.substring(lastPercent + 1);
            // Ne pas chercher de texte après %, juste afficher les options de date
            if (!searchText.includes('\n')) {
                this.showMemoOptions(searchText);
                return;
            }
        }

        // Vérifier si on est en mode remarque (+)
        if (lastPlus > lastPercent && lastPlus >= 0) {
            const searchText = textBeforeCursor.substring(lastPlus + 1);
            if (!searchText.includes('\n')) {
                this.showStudentAutocomplete(searchText);
                return;
            }
        }

        this.hideAutocomplete();
    }

    handleKeydown(e) {
        if (!this.autocompleteDiv || this.autocompleteDiv.style.display === 'none') {
            // Enter pour valider le contenu
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.submitCurrentInput();
            }
            return;
        }

        // Navigation dans l'autocomplétion
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.getSelectableItemsCount() - 1);
            this.updateSelectedItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.updateSelectedItem();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.selectCurrentItem();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hideAutocomplete();
        }
    }

    showMemoOptions(searchText) {
        this.currentMode = 'memo';
        this.selectedIndex = 0;

        // Options de date pour le mémo
        const options = [
            { label: 'Cours suivant', value: 'next_lesson' },
            { label: 'Semaine prochaine', value: 'next_week' },
            { label: 'Date personnalisée', value: 'custom' }
        ];

        let html = '<div class="memo-autocomplete-item header">📅 Choisir une date de rappel</div>';
        options.forEach((option, index) => {
            html += `
                <div class="memo-autocomplete-item ${index === 0 ? 'selected' : ''}"
                     data-index="${index}"
                     data-value="${option.value}">
                    ${option.label}
                </div>
            `;
        });

        this.autocompleteDiv.innerHTML = html;
        this.positionAutocomplete();
        this.autocompleteDiv.style.display = 'block';

        // Ajouter les événements de clic
        this.autocompleteDiv.querySelectorAll('.memo-autocomplete-item:not(.header)').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedIndex = parseInt(item.dataset.index);
                this.selectCurrentItem();
            });
        });
    }

    showStudentAutocomplete(searchText) {
        this.currentMode = 'remark';
        this.selectedIndex = 0;

        // Filtrer les élèves
        const search = searchText.toLowerCase().trim();
        this.filteredStudents = lessonStudents.filter(student => {
            const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
            return fullName.includes(search);
        });

        if (this.filteredStudents.length === 0) {
            this.hideAutocomplete();
            return;
        }

        let html = '<div class="memo-autocomplete-item header">👤 Sélectionner un élève</div>';
        this.filteredStudents.forEach((student, index) => {
            const initials = student.first_name[0] + (student.last_name ? student.last_name[0] : '');
            html += `
                <div class="memo-autocomplete-item ${index === 0 ? 'selected' : ''}"
                     data-index="${index}">
                    <div class="memo-autocomplete-student">
                        <div class="memo-autocomplete-avatar">${initials}</div>
                        <div class="memo-autocomplete-name">${student.first_name} ${student.last_name}</div>
                    </div>
                </div>
            `;
        });

        this.autocompleteDiv.innerHTML = html;
        this.positionAutocomplete();
        this.autocompleteDiv.style.display = 'block';

        // Ajouter les événements de clic
        this.autocompleteDiv.querySelectorAll('.memo-autocomplete-item:not(.header)').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedIndex = parseInt(item.dataset.index);
                this.selectCurrentItem();
            });
        });
    }

    getSelectableItemsCount() {
        const items = this.autocompleteDiv.querySelectorAll('.memo-autocomplete-item:not(.header)');
        return items.length;
    }

    updateSelectedItem() {
        const items = this.autocompleteDiv.querySelectorAll('.memo-autocomplete-item:not(.header)');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    async selectCurrentItem() {
        if (this.currentMode === 'memo') {
            const items = this.autocompleteDiv.querySelectorAll('.memo-autocomplete-item:not(.header)');
            if (this.selectedIndex >= 0 && this.selectedIndex < items.length) {
                const selectedItem = items[this.selectedIndex];
                const dateType = selectedItem.dataset.value;
                await this.createMemo(dateType);
            }
        } else if (this.currentMode === 'remark') {
            if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredStudents.length) {
                const student = this.filteredStudents[this.selectedIndex];
                await this.createRemark(student);
            }
        }

        this.hideAutocomplete();
    }

    positionAutocomplete() {
        const rect = this.memosInput.getBoundingClientRect();
        this.autocompleteDiv.style.top = (rect.bottom + window.scrollY) + 'px';
        this.autocompleteDiv.style.left = rect.left + 'px';
    }

    hideAutocomplete() {
        if (this.autocompleteDiv) {
            this.autocompleteDiv.style.display = 'none';
        }
        this.selectedIndex = -1;
    }

    async submitCurrentInput() {
        // Cette fonction est appelée quand on appuie sur Enter sans autocomplétion
        // Pour l'instant on ne fait rien, car on doit passer par l'autocomplétion
    }

    async createMemo(dateType) {
        const value = this.memosInput.value;
        const percentIndex = value.lastIndexOf('%');
        const content = value.substring(percentIndex + 1).trim();

        if (!content) {
            alert('Veuillez entrer le contenu du mémo');
            return;
        }

        // Demander la date selon le type
        let targetDate = null;
        let targetPeriod = null;

        if (dateType === 'custom') {
            const dateStr = prompt('Entrez la date du rappel (YYYY-MM-DD):');
            if (!dateStr) return;
            targetDate = dateStr;
        }
        // Pour next_lesson et next_week, on laisse le backend calculer

        try {
            const response = await fetch('/planning/create_lesson_memo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    classroom_id: classroomId,
                    mixed_group_id: mixedGroupId,
                    source_date: lessonDate,
                    source_period: periodNumber,
                    target_date: targetDate,
                    date_type: dateType,
                    content: content
                })
            });

            const data = await response.json();

            if (data.success) {
                // Vider le champ
                this.memosInput.value = '';
                // Recharger la liste
                this.loadExistingMemosAndRemarks();
                // Afficher une notification
                this.showNotification('Mémo créé avec succès', 'success');
            } else {
                alert(data.error || 'Erreur lors de la création du mémo');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
    }

    async createRemark(student) {
        const value = this.memosInput.value;
        const plusIndex = value.lastIndexOf('+');
        const content = value.substring(plusIndex + 1 + student.first_name.length + student.last_name.length + 1).trim();

        if (!content) {
            alert('Veuillez entrer le contenu de la remarque');
            return;
        }

        try {
            const response = await fetch('/planning/create_student_remark', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    student_id: student.id,
                    source_date: lessonDate,
                    source_period: periodNumber,
                    content: content
                })
            });

            const data = await response.json();

            if (data.success) {
                // Vider le champ
                this.memosInput.value = '';
                // Recharger la liste
                this.loadExistingMemosAndRemarks();
                // Afficher une notification
                this.showNotification(`Remarque ajoutée pour ${student.first_name} ${student.last_name}`, 'success');
            } else {
                alert(data.error || 'Erreur lors de la création de la remarque');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
    }

    async loadExistingMemosAndRemarks() {
        try {
            const response = await fetch(`/planning/get_lesson_memos_remarks?date=${lessonDate}&period=${periodNumber}`);
            const data = await response.json();

            if (data.success) {
                this.displayMemosAndRemarks(data.memos, data.remarks);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des mémos/remarques:', error);
        }
    }

    displayMemosAndRemarks(memos, remarks) {
        if (!this.memosListContainer) return;

        let html = '';

        // Afficher les mémos
        memos.forEach(memo => {
            const dateStr = memo.target_date ? new Date(memo.target_date).toLocaleDateString('fr-FR') : 'Non défini';
            html += `
                <div class="memo-item" data-id="${memo.id}" data-type="memo">
                    <div class="memo-content">
                        <div class="memo-header">
                            <span class="memo-type-badge">MÉMO</span>
                            <span class="memo-date">📅 ${dateStr}</span>
                        </div>
                        <div class="memo-text">${this.escapeHtml(memo.content)}</div>
                    </div>
                    <div class="memo-actions">
                        <button class="memo-action-btn" onclick="lessonMemosManager.editMemo(${memo.id})" title="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="memo-action-btn delete" onclick="lessonMemosManager.deleteMemo(${memo.id})" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        // Afficher les remarques
        remarks.forEach(remark => {
            html += `
                <div class="remark-item" data-id="${remark.id}" data-type="remark">
                    <div class="memo-content">
                        <div class="memo-header">
                            <span class="memo-type-badge">REMARQUE</span>
                            <span class="memo-student-name">${this.escapeHtml(remark.student_name)}</span>
                        </div>
                        <div class="memo-text">${this.escapeHtml(remark.content)}</div>
                    </div>
                    <div class="memo-actions">
                        <button class="memo-action-btn" onclick="lessonMemosManager.editRemark(${remark.id})" title="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="memo-action-btn delete" onclick="lessonMemosManager.deleteRemark(${remark.id})" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        this.memosListContainer.innerHTML = html;
    }

    async editMemo(id) {
        const newContent = prompt('Modifier le mémo:');
        if (!newContent) return;

        try {
            const response = await fetch(`/planning/update_lesson_memo/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: newContent })
            });

            const data = await response.json();
            if (data.success) {
                this.loadExistingMemosAndRemarks();
                this.showNotification('Mémo mis à jour', 'success');
            }
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    async deleteMemo(id) {
        if (!confirm('Supprimer ce mémo ?')) return;

        try {
            const response = await fetch(`/planning/delete_lesson_memo/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                this.loadExistingMemosAndRemarks();
                this.showNotification('Mémo supprimé', 'success');
            }
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    async editRemark(id) {
        const newContent = prompt('Modifier la remarque:');
        if (!newContent) return;

        try {
            const response = await fetch(`/planning/update_student_remark/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: newContent })
            });

            const data = await response.json();
            if (data.success) {
                this.loadExistingMemosAndRemarks();
                this.showNotification('Remarque mise à jour', 'success');
            }
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    async deleteRemark(id) {
        if (!confirm('Supprimer cette remarque ?')) return;

        try {
            const response = await fetch(`/planning/delete_student_remark/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (data.success) {
                this.loadExistingMemosAndRemarks();
                this.showNotification('Remarque supprimée', 'success');
            }
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'success') {
        // Réutiliser le système de notification existant si disponible
        if (typeof showSuccess === 'function' && type === 'success') {
            showSuccess(message);
        } else {
            alert(message);
        }
    }
}

// Créer l'instance globale
let lessonMemosManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        lessonMemosManager = new LessonMemosManager();
    });
} else {
    lessonMemosManager = new LessonMemosManager();
}
