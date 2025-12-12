/**
 * Système de gestion des mémos de classe et remarques élèves - Version 2.0
 * Workflow avec boutons et formulaires déroulants
 */

class LessonMemosManager {
    constructor() {
        this.memosListContainer = null;
        this.selectedStudents = []; // Pour la sélection multiple d'élèves
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.memosListContainer = document.getElementById('memosListContainer');

        // Setup autocomplete pour les remarques
        const remarkInput = document.getElementById('remarkStudentInput');
        if (remarkInput) {
            remarkInput.addEventListener('input', (e) => this.handleRemarkStudentInput(e));
            remarkInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                }
            });
        }

        // Charger les mémos/remarques existants
        this.loadExistingMemosAndRemarks();
    }

    handleRemarkStudentInput(e) {
        const value = e.target.value.trim();

        if (value.length < 2) {
            this.hideStudentAutocomplete();
            return;
        }

        // Filtrer les élèves
        const search = value.toLowerCase();
        const filteredStudents = lessonStudents.filter(student => {
            const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
            // Ne pas afficher les élèves déjà sélectionnés
            const alreadySelected = this.selectedStudents.some(s => s.id === student.id);
            return !alreadySelected && fullName.includes(search);
        });

        if (filteredStudents.length === 0) {
            this.hideStudentAutocomplete();
            return;
        }

        this.showStudentAutocomplete(filteredStudents);
    }

    showStudentAutocomplete(students) {
        const autocompleteDiv = document.getElementById('remarkStudentAutocomplete');

        let html = '';
        students.forEach(student => {
            const initials = student.first_name[0] + (student.last_name ? student.last_name[0] : '');
            html += `
                <div class="memo-autocomplete-item" data-student-id="${student.id}">
                    <div class="memo-autocomplete-student">
                        <div class="memo-autocomplete-avatar">${initials}</div>
                        <div class="memo-autocomplete-name">${student.first_name} ${student.last_name}</div>
                    </div>
                </div>
            `;
        });

        autocompleteDiv.innerHTML = html;
        autocompleteDiv.style.display = 'block';

        // Ajouter les événements de clic
        autocompleteDiv.querySelectorAll('.memo-autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const studentId = parseInt(item.dataset.studentId);
                const student = lessonStudents.find(s => s.id === studentId);
                if (student) {
                    this.addSelectedStudent(student);
                }
            });
        });
    }

    hideStudentAutocomplete() {
        const autocompleteDiv = document.getElementById('remarkStudentAutocomplete');
        if (autocompleteDiv) {
            autocompleteDiv.style.display = 'none';
        }
    }

    addSelectedStudent(student) {
        // Ajouter à la liste
        this.selectedStudents.push(student);

        // Vider le champ de recherche
        const remarkInput = document.getElementById('remarkStudentInput');
        remarkInput.value = '';

        // Cacher l'autocomplete
        this.hideStudentAutocomplete();

        // Afficher la liste des élèves sélectionnés
        this.updateSelectedStudentsList();
    }

    updateSelectedStudentsList() {
        const selectedStudentsDiv = document.getElementById('selectedStudentsDiv');
        const selectedStudentsList = document.getElementById('selectedStudentsList');

        if (this.selectedStudents.length === 0) {
            selectedStudentsDiv.style.display = 'none';
            return;
        }

        selectedStudentsDiv.style.display = 'block';

        let html = '<div class="selected-students-tags">';
        this.selectedStudents.forEach(student => {
            html += `
                <span class="student-tag">
                    ${student.first_name} ${student.last_name}
                    <button type="button" class="remove-student" onclick="lessonMemosManager.removeSelectedStudent(${student.id})" title="Retirer">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `;
        });
        html += '</div>';

        selectedStudentsList.innerHTML = html;
    }

    removeSelectedStudent(studentId) {
        this.selectedStudents = this.selectedStudents.filter(s => s.id !== studentId);
        this.updateSelectedStudentsList();
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

    async submitMemo() {
        const dateType = document.getElementById('memoDateType').value;
        const content = document.getElementById('memoContent').value.trim();

        if (!dateType) {
            alert('Veuillez choisir une date de rappel');
            return;
        }

        if (!content) {
            alert('Veuillez entrer le contenu du mémo');
            return;
        }

        let targetDate = null;

        if (dateType === 'custom') {
            targetDate = document.getElementById('memoCustomDate').value;
            if (!targetDate) {
                alert('Veuillez sélectionner une date');
                return;
            }
        }

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
                cancelMemoCreation(); // Appel de la fonction globale
                this.loadExistingMemosAndRemarks();
                // Pas de notification - ajout silencieux
            } else {
                alert(data.error || 'Erreur lors de la création du mémo');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
    }

    async submitRemark() {
        const content = document.getElementById('remarkContent').value.trim();

        if (this.selectedStudents.length === 0) {
            alert('Veuillez sélectionner au moins un élève');
            return;
        }

        if (!content) {
            alert('Veuillez entrer le contenu de la remarque');
            return;
        }

        try {
            // Créer une remarque pour chaque élève sélectionné
            for (const student of this.selectedStudents) {
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
                if (!data.success) {
                    alert(`Erreur pour ${student.first_name} ${student.last_name}: ${data.error}`);
                    return;
                }
            }

            cancelRemarkCreation(); // Appel de la fonction globale
            this.loadExistingMemosAndRemarks();
            // Pas de notification - ajout silencieux
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la communication avec le serveur');
        }
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
                // Pas de notification
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
                // Pas de notification
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
                // Pas de notification
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
                // Pas de notification
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
        if (typeof showSuccess === 'function' && type === 'success') {
            showSuccess(message);
        } else {
            alert(message);
        }
    }
}

// Fonctions globales pour les boutons
function openMemoCreation() {
    // Cacher le formulaire de remarque s'il est ouvert
    document.getElementById('remarkCreationForm').style.display = 'none';

    // Afficher le formulaire de mémo
    document.getElementById('memoCreationForm').style.display = 'block';

    // Reset le formulaire
    document.getElementById('memoDateType').value = '';
    document.getElementById('memoCustomDateDiv').style.display = 'none';
    document.getElementById('memoContentDiv').style.display = 'none';
    document.getElementById('memoContent').value = '';
}

function cancelMemoCreation() {
    document.getElementById('memoCreationForm').style.display = 'none';
    document.getElementById('memoDateType').value = '';
    document.getElementById('memoCustomDateDiv').style.display = 'none';
    document.getElementById('memoContentDiv').style.display = 'none';
    document.getElementById('memoContent').value = '';
}

function handleMemoDateTypeChange() {
    const dateType = document.getElementById('memoDateType').value;
    const customDateDiv = document.getElementById('memoCustomDateDiv');
    const contentDiv = document.getElementById('memoContentDiv');

    if (!dateType) {
        customDateDiv.style.display = 'none';
        contentDiv.style.display = 'none';
        return;
    }

    // Afficher le champ de date personnalisée si nécessaire
    if (dateType === 'custom') {
        customDateDiv.style.display = 'block';
    } else {
        customDateDiv.style.display = 'none';
    }

    // Toujours afficher le champ de contenu une fois qu'un type de date est sélectionné
    contentDiv.style.display = 'block';
}

function submitMemo() {
    lessonMemosManager.submitMemo();
}

function openRemarkCreation() {
    // Cacher le formulaire de mémo s'il est ouvert
    document.getElementById('memoCreationForm').style.display = 'none';

    // Afficher le formulaire de remarque
    document.getElementById('remarkCreationForm').style.display = 'block';

    // Reset le formulaire
    document.getElementById('remarkStudentInput').value = '';
    lessonMemosManager.selectedStudents = [];
    lessonMemosManager.updateSelectedStudentsList();
    document.getElementById('remarkContentDiv').style.display = 'none';
    document.getElementById('remarkContent').value = '';
}

function cancelRemarkCreation() {
    document.getElementById('remarkCreationForm').style.display = 'none';
    document.getElementById('remarkStudentInput').value = '';
    lessonMemosManager.selectedStudents = [];
    lessonMemosManager.updateSelectedStudentsList();
    document.getElementById('remarkContentDiv').style.display = 'none';
    document.getElementById('remarkContent').value = '';
}

function confirmStudentSelection() {
    if (lessonMemosManager.selectedStudents.length === 0) {
        alert('Veuillez sélectionner au moins un élève');
        return;
    }

    // Afficher le champ de contenu
    document.getElementById('remarkContentDiv').style.display = 'block';

    // Focus sur le textarea
    document.getElementById('remarkContent').focus();
}

function submitRemark() {
    lessonMemosManager.submitRemark();
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
