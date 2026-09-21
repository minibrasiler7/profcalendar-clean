/**
 * ProfCalendar — Tutoriel animé : scènes et chapitres.
 *
 * Chaque chapitre est une fonction `run(k)` qui enchaîne des gestes sur une
 * fausse application (données fictives : Mme Favre, classe 9VG2…). `k` est
 * la boîte à outils du moteur (pc-tutorial.js) : k.scene, k.cap, k.click,
 * k.type, k.drag, k.modal… Toute attente passe par k.wait, ce qui permet
 * d'interrompre proprement un chapitre.
 *
 * Règle d'écriture : une légende courte par geste, et le geste se voit.
 */
(function () {
    'use strict';

    // ------------------------------------------------------------ données
    const C1 = { name: '9VG2', subj: 'Mathématiques', color: '#4F46E5', bg: '#EEF2FF' };
    const C2 = { name: '10VP1', subj: 'Sciences', color: '#10B981', bg: '#ECFDF5' };
    const C3 = { name: '11VG3', subj: 'Mathématiques', color: '#F59E0B', bg: '#FFFBEB' };
    const STUDENTS = ['Léa Martin', 'Noah Bernard', 'Emma Rochat', 'Louis Favre', 'Chloé Dubois', 'Nathan Girard'];
    const ini = n => n.split(' ').map(p => p[0]).join('');

    // ------------------------------------------------------------ briques
    function nav(active) {
        const a = k => (k === active ? 'active' : '');
        return `<div class="pt-nav">
            <span class="brand"><i class="fas fa-calendar-check"></i> ProfCalendar</span>
            <a class="${a('dash')}"><i class="fas fa-home"></i> Tableau de bord</a>
            <a class="${a('lesson')}"><i class="fas fa-graduation-cap"></i> Cours</a>
            <a class="${a('classes')}"><i class="fas fa-users"></i> Gestion de classe</a>
            <a class="${a('cal')}"><i class="fas fa-calendar"></i> Calendrier</a>
            <span class="user"><i class="fas fa-user-circle"></i> Mme Favre <span class="pro">PRO</span> <i class="fas fa-chevron-down" style="font-size:10px"></i></span>
        </div>`;
    }

    function slot(c, title, meta) {
        return `<div class="pt-slot" style="background:${c.bg};border-left-color:${c.color}">
            <div class="cls" style="color:${c.color}">${c.name} · ${c.subj === 'Mathématiques' ? 'Maths' : c.subj}</div>
            ${title ? `<div class="ttl">${title}</div>` : ''}
            ${meta ? `<div class="meta">${meta}</div>` : ''}
        </div>`;
    }

    function calendarScene() {
        const days = [['Lundi', '21/09'], ['Mardi', '22/09'], ['Mercredi', '23/09'], ['Jeudi', '24/09'], ['Vendredi', '25/09']];
        const periods = [['P1', '08:00', '08:45'], ['P2', '08:50', '09:35'], ['P3', '09:50', '10:35'], ['P4', '10:40', '11:25'], ['P5', '11:30', '12:15']];
        const grid = {
            '0_2': slot(C1), '0_4': slot(C2), '1_1': slot(C1), '1_3': slot(C3), '2_2': slot(C2),
            '3_1': slot(C1, 'Nombres relatifs', '<span><i class="far fa-check-square"></i> 2</span><span><i class="fas fa-paperclip"></i> 1</span>'),
            '3_4': slot(C3), '4_3': slot(C2)
        };
        let rows = '';
        periods.forEach((p, pi) => {
            rows += `<tr><td class="time">${p[0]}<small>${p[1]}<br>${p[2]}</small></td>`;
            days.forEach((d, di) => {
                const key = di + '_' + (pi + 1);
                rows += `<td id="c-${di}-${pi + 1}">${grid[key] || ''}</td>`;
            });
            rows += '</tr>';
        });
        return nav('cal') + `<div class="pt-page">
            <div class="pt-week-h">
                <div class="t"><i class="fas fa-calendar" style="color:#4F46E5;margin-right:6px"></i> Semaine du 21 au 25 septembre</div>
                <div class="nav"><span class="pt-b sm"><i class="fas fa-chevron-left"></i></span><span class="pt-b sm">Aujourd'hui</span><span class="pt-b sm"><i class="fas fa-chevron-right"></i></span></div>
            </div>
            <table class="pt-cal">
                <thead><tr><th style="width:62px">Heure</th>${days.map((d, i) => `<th class="${i === 0 ? 'today' : ''}">${d[0]}<div class="d">${d[1]}</div></th>`).join('')}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    function planningModalHtml() {
        return `
        <div class="pt-modal-h">
            <div><div class="k"><i class="fas fa-calendar-day"></i> Planification</div><h3>Planifier le cours — Lundi 21, P2</h3></div>
            <div style="display:flex;gap:8px;align-items:center">
                <span class="pt-b icon" id="m-files" title="Fichiers de la classe"><i class="fas fa-folder-open"></i></span>
                <span class="x"><i class="fas fa-times"></i></span>
            </div>
        </div>
        <div class="pt-split" id="m-split" style="grid-template-columns:1fr">
            <div class="pt-modal-b">
                <div class="pt-fg">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="color:#6366F1;font-weight:700;font-size:12.5px"><i class="fas fa-paperclip"></i> Fichiers joints (<span id="m-att-n">0</span>)</span>
                        <span class="pt-b warn sm" id="m-eph"><i class="fas fa-hourglass-half"></i> Fichier éphémère</span>
                    </div>
                    <div id="m-att-list"></div>
                </div>
                <div class="pt-fg"><label class="pt-label">Classe</label><div class="pt-select">${C1.name} - ${C1.subj}</div></div>
                <div class="pt-fg"><label class="pt-label">Titre du cours</label><input class="pt-input" id="m-title" placeholder="Ex : Introduction aux fractions"></div>
                <div class="pt-fg" style="margin-bottom:4px"><label class="pt-label">Description</label>
                    <div class="pt-textarea" id="m-desc" data-ph="Détails du cours, exercices prévus..."></div>
                    <div class="pt-hint"><i class="far fa-lightbulb"></i> Astuce : commencez une ligne par « - » pour créer une case à cocher.</div>
                </div>
            </div>
            <div class="pt-files-pane" id="m-pane" style="display:none">
                <h4><i class="fas fa-folder-open" style="color:#4F46E5"></i> Fichiers de ${C1.name}</h4>
                <div class="pt-folder-lbl"><i class="fas fa-folder"></i> Chap. 2 · Nombres relatifs</div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> Théorie.pdf <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-folder-lbl"><i class="fas fa-folder-open"></i> Chap. 3 · Fractions</div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> Fractions – théorie.pdf <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-file-row" id="m-f-ex"><i class="fas fa-file-pdf t"></i> Fractions – exercices.pdf <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> Fractions – corrigé.pdf <i class="fas fa-plus-circle plus"></i></div>
            </div>
        </div>
        <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="m-save"><i class="fas fa-save"></i> Enregistrer</span></div>`;
    }

    const attachedRow = (name, eph) => `<div class="pt-file-row" style="margin-bottom:4px">
        <i class="fas ${eph ? 'fa-hourglass-half' : 'fa-file-pdf'} t" style="color:${eph ? '#F59E0B' : '#DC2626'}"></i> ${name}
        ${eph ? '<span class="pt-chip" style="background:#FEF3C7;color:#92400E">éphémère</span>' : ''}
        <i class="fas fa-times" style="margin-left:auto;color:#9CA3AF"></i></div>`;

    const checkLine = (t, done) => `<div class="pt-check ${done ? 'done' : ''}"><span class="box">${done ? '<i class="fas fa-check"></i>' : ''}</span><span>${t}</span></div>`;

    function attendanceList(opts) {
        const o = opts || {};
        return `<div class="pt-stats"><div class="pt-stat g"><b id="st-p">6</b>Présents</div><div class="pt-stat r"><b id="st-a">0</b>Absents</div><div class="pt-stat o"><b id="st-l">0</b>Retards</div></div>
            <div id="at-list">${STUDENTS.map((n, i) => `<div class="pt-att present" id="at-${i}">
                <span class="pt-avatar">${ini(n)}</span><span class="n">${n}</span>
                <span class="min" id="min-${i}"></span><span class="ib" id="clk-${i}"><i class="fas fa-clock"></i></span>
                <span class="ib" id="rm-${i}" title="Remarque"><i class="fas fa-comment-medical"></i></span>
            </div>`).join('')}</div>`;
    }

    function lessonScene(opts) {
        const o = opts || {};
        const planning = o.planning !== false;
        const tabs = `<div class="pt-tabs" style="margin-bottom:10px">
            <span class="pt-tab active" id="tr-pres"><i class="fas fa-user-check"></i> Présences</span>
            <span class="pt-tab" id="tr-coches"><i class="fas fa-exclamation-triangle"></i> Coches</span>
            <span class="pt-tab" id="tr-seating"><i class="fas fa-th"></i> Plan de classe</span>
            <span class="pt-tab" id="tr-annual"><i class="fas fa-calendar-alt"></i> Vue annuelle</span>
        </div>`;
        const planView = planning ? `<h3 style="margin:0 0 8px;font-size:15px" id="l-title">Fractions – exercices</h3>
            <div id="l-checks">${checkLine('Corriger la série 3')}${checkLine('Fractions équivalentes : exemples')}${checkLine('Devoirs : p. 42 n° 1 à 5')}</div>
            <div style="margin-top:14px;padding-top:12px;border-top:1.5px solid #E5E7EB">
                <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-file-alt" style="color:#10B981"></i> Ressources du cours</div>
                <div id="l-plan-res">
                    <div class="pt-res"><i class="fas fa-hourglass-half t" style="color:#F59E0B"></i><div>correction-serie-3.pdf<div class="sub" style="color:#B45309">Éphémère — supprimé le lendemain du cours</div></div></div>
                    <div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Fractions – exercices.pdf<div class="sub">PDF</div></div></div>
                    ${o.exercise ? `<div class="pt-res" id="r-ex"><i class="fas fa-gamepad t" style="color:#667eea"></i><div>Fractions – QCM<div class="sub"><span class="pt-chip" style="background:#F0FDF4;color:#10B981">Non publié</span></div></div><span class="pt-b success sm" id="r-launch" style="margin-left:auto"><i class="fas fa-rocket"></i> Lancer</span></div>` : ''}
                </div>
            </div>` : '<div class="pt-empty">Aucune planification pour ce cours</div>';
        const res = o.resources || `
            <div id="l-pinned" style="margin-bottom:10px">
                <div style="font-size:11.5px;font-weight:700;color:#EF4444;margin-bottom:6px"><i class="fas fa-thumbtack"></i> Ressources épinglées</div>
                <div id="l-pinned-list"><div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Aide-mémoire fractions.pdf</div><i class="fas fa-thumbtack pin on"></i></div></div>
            </div>
            <div class="pt-folder-lbl"><i class="fas fa-folder-open"></i> Chap. 3 · Fractions</div>
            <div id="l-tree">
                <div class="pt-res" id="r-1"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Fractions – théorie.pdf</div><i class="fas fa-thumbtack pin"></i></div>
                <div class="pt-res" id="r-2"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Fractions – exercices.pdf</div><i class="fas fa-thumbtack pin" id="pin-2"></i></div>
                <div class="pt-res" id="r-3"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Fractions – corrigé.pdf</div><i class="fas fa-thumbtack pin"></i></div>
            </div>`;
        return nav('lesson') + `<div class="pt-page">
            <div class="pt-lesson-head" id="l-head">
                <div><div class="pt-h1" style="margin:0"><i class="fas fa-graduation-cap"></i> ${o.current ? 'Cours en cours' : 'Prochain cours'}</div>
                <div class="who"><b>${C1.name} · ${C1.subj}</b> — Lundi 21 septembre · P2 · 08:50 – 09:35</div></div>
                <div style="display:flex;gap:10px;align-items:center"><div class="pt-clock">${o.current ? '09:02' : '08:12'}</div></div>
            </div>
            <div class="pt-lesson" style="height:calc(100% - 58px)">
                <div class="pt-card" id="l-plan">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <div class="pt-sec-title" style="margin:0"><i class="fas fa-clipboard-list"></i> Planification du cours</div>
                        <span class="pt-b sm" id="l-edit"><i class="fas fa-edit"></i> Modifier</span>
                    </div>
                    <div id="l-plan-body">${planView}</div>
                </div>
                <div class="pt-card" id="l-track">
                    <div class="pt-sec-title"><i class="fas fa-user-check"></i> Suivi des élèves</div>
                    ${tabs}
                    <div id="l-track-body">${attendanceList()}</div>
                </div>
                <div class="pt-card" id="l-res">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <div class="pt-sec-title" style="margin:0"><i class="fas fa-folder-open"></i> Ressources</div>
                        <div style="display:flex;gap:4px"><span class="pt-b sm"><i class="fas fa-file-medical"></i> Feuilles blanches</span><span class="pt-b sm"><i class="fas fa-plus"></i> Fichier</span></div>
                    </div>
                    <div id="l-res-body">${res}</div>
                </div>
            </div>
        </div>`;
    }

    function cochesBody(cols, withAlert) {
        return `<div class="pt-count-h"><span>Élève</span>${cols.map(c => `<span style="text-align:center">${c}</span>`).join('')}</div>
            ${STUDENTS.slice(0, 5).map((n, i) => `<div class="pt-count"><span>${n}</span>
                ${cols.map((c, j) => `<span class="c"><span class="pm" id="co-${i}-${j}-m">−</span><span class="v" id="co-${i}-${j}">0</span><span class="pm" id="co-${i}-${j}-p">+</span></span>`).join('')}
            </div>`).join('')}
            <div id="co-alert"></div>`;
    }

    function desksBody() {
        const names = ['Léa', 'Noah', 'Emma', 'Louis', 'Chloé', 'Nathan', '', ''];
        return `<div class="pt-desks">${names.map((n, i) => `<div class="pt-desk" id="d-${i}">${n || '<span style="color:#D1D5DB">—</span>'}</div>`).join('')}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:8px"><span class="pt-b sm">Annuler les avertissements</span></div>`;
    }

    function classesScene(tab, opts) {
        const o = opts || {};
        const t = (id, ico, label) => `<span class="pt-tab ${tab === id ? 'active' : ''}" id="ct-${id}"><i class="fas ${ico}"></i> ${label}</span>`;
        return nav('classes') + `<div class="pt-page">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="pt-h1" style="margin:0"><i class="fas fa-users"></i> Gestion de classe</div>
                <div class="pt-select" style="width:240px"><span class="pt-chip" style="background:${C1.bg};color:${C1.color};margin-right:6px">${C1.name}</span> ${C1.subj} <i class="fas fa-chevron-down" style="float:right;color:#9CA3AF"></i></div>
            </div>
            <div class="pt-tabs">
                ${t('students', 'fa-user-graduate', 'Élèves')}${t('report', 'fa-file-alt', 'Rapport élève')}${t('grades', 'fa-clipboard-check', 'Notes')}${t('files', 'fa-folder-open', 'Fichiers')}
                ${t('coches', 'fa-exclamation-triangle', 'Coches')}${t('absences', 'fa-calendar-check', 'Absences')}${t('seating', 'fa-th', 'Plan de classe')}${t('groups', 'fa-users', 'Groupes')}
                ${t('accomm', 'fa-universal-access', 'Aménagements')}${t('announce', 'fa-bullhorn', 'Annonces')}
            </div>
            <div class="pt-card" id="cl-body" style="height:calc(100% - 96px);overflow:hidden">${o.body || studentsBody(o.students)}</div>
        </div>`;
    }

    function studentRow(n, i) {
        return `<tr id="cl-r-${i}"><td><span class="pt-avatar">${ini(n)}</span></td><td><b>${n.split(' ')[0]}</b></td><td>${n.split(' ')[1]}</td><td style="color:#9CA3AF">—</td>
            <td style="text-align:right;color:#9CA3AF"><i class="fas fa-edit"></i> &nbsp; <i class="fas fa-trash"></i></td></tr>`;
    }

    function studentsBody(list) {
        const rows = (list || []).map(studentRow).join('');
        return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="pt-sec-title" style="margin:0"><i class="fas fa-user-graduate"></i> Liste des élèves</div>
                <div style="display:flex;gap:6px">
                    <span class="pt-b" id="cl-code-e"><i class="fas fa-key"></i> Code élèves</span>
                    <span class="pt-b" id="cl-code-p"><i class="fas fa-users"></i> Code parents</span>
                    <span class="pt-b" id="cl-import"><i class="fas fa-file-import"></i> Importer (CSV/Excel)</span>
                    <span class="pt-b primary" id="cl-add"><i class="fas fa-plus"></i> Ajouter un élève</span>
                </div>
            </div>
            <div id="cl-form" style="display:none;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;padding:12px;margin-bottom:10px">
                <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:8px;align-items:end">
                    <div><label class="pt-label">Prénom *</label><input class="pt-input" id="cl-fn"></div>
                    <div><label class="pt-label">Nom</label><input class="pt-input" id="cl-ln"></div>
                    <div><label class="pt-label">Email de l'élève (facultatif)</label><input class="pt-input" placeholder="prenom.nom@ecole.ch"></div>
                    <span class="pt-b primary" id="cl-save"><i class="fas fa-save"></i> Enregistrer</span>
                </div>
            </div>
            <div id="cl-paste" style="display:none;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;padding:12px;margin-bottom:10px">
                <div class="pt-label">Colle ta liste depuis Excel ou Numbers (Prénom, Nom)</div>
                <div class="pt-textarea" id="cl-paste-t" style="min-height:64px" data-ph="Léa	Martin…"></div>
                <div style="display:flex;justify-content:flex-end;margin-top:8px"><span class="pt-b primary" id="cl-import-go"><i class="fas fa-file-import"></i> Importer</span></div>
            </div>
            <table class="pt-table"><thead><tr><th style="width:40px"></th><th>Prénom</th><th>Nom</th><th>Compte élève</th><th></th></tr></thead>
            <tbody id="cl-rows">${rows}</tbody></table>
            <div class="pt-empty" id="cl-empty" ${rows ? 'style="display:none"' : ''}>Aucun élève pour le moment</div>`;
    }

    function gradesBody(withEval) {
        const names = STUDENTS.slice(0, 4);
        const notes = ['5.5', '4', '5', '4.5'];
        return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="pt-sec-title" style="margin:0"><i class="fas fa-clipboard-check"></i> Notes — ${C1.subj}</div>
                <span class="pt-b primary" id="gr-new"><i class="fas fa-plus"></i> Nouvelle évaluation</span>
            </div>
            <table class="pt-table"><thead><tr><th>Élève</th>${withEval ? '<th>Test – Fractions <small style="font-weight:400">/6</small></th>' : ''}<th>Moyenne</th></tr></thead>
            <tbody>${names.map((n, i) => `<tr><td>${n}</td>${withEval ? `<td><b>${notes[i]}</b></td>` : ''}<td>${withEval ? '<b>' + notes[i] + '</b>' : '<span style="color:#9CA3AF">—</span>'}</td></tr>`).join('')}</tbody></table>
            ${withEval ? '' : '<div class="pt-empty">Aucune évaluation pour le moment</div>'}`;
    }

    function filesScene() {
        return nav('dash') + `<div class="pt-page">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div class="pt-h1" style="margin:0"><i class="fas fa-folder-open"></i> Gestionnaire de fichiers</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-folder-plus"></i> Nouveau dossier</span><span class="pt-b success" id="fm-add"><i class="fas fa-file-upload"></i> Ajouter des fichiers</span><span class="pt-b" style="background:#0EA5E9;border-color:#0EA5E9;color:#fff" id="fm-import"><i class="fas fa-folder-open"></i> Importer un dossier</span></div>
            </div>
            <div class="pt-store" id="fm-store"><div class="bar"><div></div></div><span><b>1,2 Go</b> / 50 Go utilisés (2,4 %)</span></div>
            <div class="pt-fm">
                <div class="pt-card" id="fm-explorer">
                    <div class="pt-drop" id="fm-drop"><i class="fas fa-cloud-upload-alt"></i>Glissez vos fichiers ou dossiers ici</div>
                    <div class="pt-tree" id="fm-tree">
                        <div class="f d"><i class="fas fa-folder-open"></i> Mathématiques</div>
                        <div class="f d" style="padding-left:24px"><i class="fas fa-folder"></i> Chap. 1 · Nombres naturels <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">4 fichiers</span></div>
                        <div class="f d" style="padding-left:24px"><i class="fas fa-folder"></i> Chap. 2 · Nombres relatifs <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">3 fichiers</span></div>
                        <div class="f d"><i class="fas fa-folder"></i> Sciences <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">12 fichiers</span></div>
                    </div>
                </div>
                <div class="pt-card">
                    <div class="pt-sec-title"><i class="fas fa-chalkboard"></i> Mes classes</div>
                    <div class="pt-cls-card" id="fm-c1"><span class="dot" style="background:${C1.color}"></span> ${C1.name} · Maths <span class="cnt" id="fm-c1-n">7 fichiers</span></div>
                    <div class="pt-cls-card" id="fm-c2"><span class="dot" style="background:${C2.color}"></span> ${C2.name} · Sciences <span class="cnt">12 fichiers</span></div>
                    <div class="pt-cls-card" id="fm-c3"><span class="dot" style="background:${C3.color}"></span> ${C3.name} · Maths <span class="cnt">5 fichiers</span></div>
                    <div class="pt-hint" style="margin-top:10px"><i class="fas fa-hand-pointer"></i> Glisse un fichier ou un dossier sur une classe pour l'y copier.</div>
                </div>
            </div>
        </div>`;
    }

    function pdfScene() {
        const tool = (id, ico, title, on) => `<span class="pt-tool ${on ? 'on' : ''}" id="t-${id}" title="${title}"><i class="fas ${ico}"></i></span>`;
        const lines = '<div class="l m"></div><div class="l"></div><div class="l s"></div><div style="height:14px"></div><div class="l"></div><div class="l m"></div><div class="l s"></div><div style="height:14px"></div><div class="l m"></div><div class="l"></div><div class="l s"></div>';
        return `<div class="pt-pdf">
            <div class="pt-pdf-tb">
                ${tool('pen', 'fa-pen', 'Stylo', true)}${tool('hl', 'fa-highlighter', 'Surligneur')}${tool('eraser', 'fa-eraser', 'Gomme')}<span class="sep"></span>
                ${tool('ruler', 'fa-ruler', 'Règle')}${tool('compass', 'fa-drafting-compass', 'Compas')}${tool('angle', 'fa-angle-right', 'Angle')}${tool('arc', 'fa-circle-notch', 'Arc')}<span class="sep"></span>
                ${tool('arrow', 'fa-long-arrow-alt-right', 'Flèche')}${tool('rect', 'fa-vector-square', 'Rectangle')}${tool('disk', 'fa-circle', 'Disque')}${tool('grid', 'fa-th', 'Grille')}${tool('square', 'fa-square-root-alt', 'Équerre')}${tool('text', 'fa-font', 'Texte')}${tool('hider', 'fa-eye-slash', 'Masquer du texte')}<span class="sep"></span>
                ${tool('track', 'fa-users', 'Suivi des élèves')}<span class="sep"></span>
                <span class="pt-color on" id="c-black" style="background:#000"></span><span class="pt-color" id="c-red" style="background:#EF4444"></span><span class="pt-color" style="background:#22C55E"></span><span class="pt-color" style="background:#3B82F6"></span><span class="sep"></span>
                <span style="margin-left:auto"></span>
                ${tool('undo', 'fa-undo', 'Annuler')}${tool('redo', 'fa-redo', 'Rétablir')}${tool('clear', 'fa-trash', 'Effacer la page')}<span class="sep"></span>${tool('dl', 'fa-download', 'Télécharger / Envoyer')}${tool('close', 'fa-times', 'Fermer')}
            </div>
            <div class="pt-pdf-body">
                <div class="pt-thumbs"><div class="pt-thumb on"><i></i><i></i><i></i><i style="width:60%"></i></div><div class="pt-thumb"><i></i><i style="width:70%"></i><i></i></div><div class="pt-thumb"><i></i><i></i><i style="width:50%"></i></div></div>
                <div class="pt-pagewrap"><div class="pt-pdfpage" id="pdf-page">
                    <h4>Chapitre 3 — Les fractions</h4>${lines}
                    <div id="pdf-extra"></div>
                    <svg class="ink" id="ink" viewBox="0 0 560 560"></svg>
                </div></div>
            </div>
        </div>`;
    }

    function phoneScene(inner) {
        return `<div class="pt-page" style="top:0;background:linear-gradient(135deg,#EEF2FF,#F3F4F6);display:flex;align-items:center;justify-content:center">${inner}</div>`;
    }

    // ------------------------------------------------------------ chapitre 1
    async function chapPlanning(k) {
        await k.scene(calendarScene());
        await k.cap('Ton horaire est déjà dans le calendrier. Clique sur une période.');
        await k.click('#c-0-2', () => k.modal(planningModalHtml()));

        await k.cap('Un document juste pour aujourd\'hui ? Ajoute un fichier éphémère.');
        await k.click('#m-eph', () => {
            k.add('#m-att-list', attachedRow('correction-serie-3.pdf', true));
            k.html('#m-att-n', '1');
        });
        await k.cap('Il est supprimé tout seul le lendemain du cours.');
        await k.spot('#m-att-list');

        await k.cap('Donne un titre au cours.');
        await k.type('#m-title', 'Fractions – exercices');

        await k.cap('Une ligne qui commence par « - » devient une tâche à cocher.');
        await k.type('#m-desc', '- Corriger la série 3\n- Fractions équivalentes : exemples\n- Devoirs : p. 42 n° 1 à 5', { checkbox: true });

        await k.cap('Les documents de la classe sont à côté : pratique pour voir où tu t\'es arrêté.');
        await k.click('#m-files', () => {
            k.$('#m-split').style.gridTemplateColumns = '1fr 300px';
            k.show('#m-pane');
        });
        await k.click('#m-f-ex .plus', () => {
            k.add('#m-att-list', attachedRow('Fractions – exercices.pdf', false));
            k.html('#m-att-n', '2');
        });

        await k.cap('Enregistre : la période est planifiée.');
        await k.click('#m-save', () => {
            k.closeModal();
            k.html('#c-0-2', slot(C1, 'Fractions – exercices', '<span><i class="far fa-check-square"></i> 3</span><span><i class="fas fa-paperclip"></i> 2</span>'));
            k.toast('Planification enregistrée');
        });
        await k.spot('#c-0-2');
        await k.wait(600);

        await k.scene(lessonScene());
        await k.cap('La page Cours affiche le cours en train d\'être donné… ou le prochain.');
        await k.spot('#l-head');
        await k.cap('Tes tâches et tes fichiers sont là. Coche au fur et à mesure.');
        await k.click('#l-checks .pt-check', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; });

        await k.cap('Tu peux aussi planifier directement depuis cette page.');
        await k.click('#l-edit', () => {
            k.html('#l-plan-body', `<input class="pt-input" value="Fractions – exercices" style="margin-bottom:8px">
                <div class="pt-textarea" id="l-desc" style="min-height:110px">[x] Corriger la série 3\n[ ] Fractions équivalentes : exemples\n[ ] Devoirs : p. 42 n° 1 à 5</div>
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px"><span class="pt-b sm">Annuler</span><span class="pt-b primary sm" id="l-save"><i class="fas fa-save"></i> Enregistrer</span></div>`);
        });
        await k.type('#l-desc', '\n- Rappel : test vendredi', { checkbox: true, append: true });
        await k.click('#l-save', () => {
            k.html('#l-plan-body', `<h3 style="margin:0 0 8px;font-size:15px">Fractions – exercices</h3>
                <div>${checkLine('Corriger la série 3', true)}${checkLine('Fractions équivalentes : exemples')}${checkLine('Devoirs : p. 42 n° 1 à 5')}${checkLine('Rappel : test vendredi')}</div>`);
            k.toast('Planification enregistrée');
        });
        await k.wait(900);
    }

    // ------------------------------------------------------------ chapitre 2
    async function chapClasses(k) {
        await k.scene(classesScene('students'));
        await k.cap('Ajoute tes élèves un par un…');
        await k.click('#cl-add', () => k.show('#cl-form'));
        await k.type('#cl-fn', 'Léa');
        await k.type('#cl-ln', 'Martin');
        await k.click('#cl-save', () => {
            k.hide('#cl-form'); k.hide('#cl-empty');
            k.add('#cl-rows', studentRow('Léa Martin', 0));
            k.toast('Élève ajouté');
        });

        await k.cap('…ou colle ta liste entière depuis Excel.');
        await k.click('#cl-import', () => k.show('#cl-paste'));
        await k.type('#cl-paste-t', 'Noah\tBernard\nEmma\tRochat\nLouis\tFavre', { ms: 22 });
        await k.click('#cl-import-go', () => {
            k.hide('#cl-paste');
            ['Noah Bernard', 'Emma Rochat', 'Louis Favre'].forEach((n, i) => k.add('#cl-rows', studentRow(n, i + 1)));
            k.toast('3 élèves importés');
        });
        await k.wait(500);

        await k.cap('Onglet Notes : crée une évaluation.');
        await k.click('#ct-grades', (el) => { k.$$('.pt-tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); k.html('#cl-body', gradesBody(false)); });
        await k.click('#gr-new', () => k.modal(`
            <div class="pt-modal-h"><h3><i class="fas fa-clipboard-check" style="color:#4F46E5"></i> Nouvelle évaluation</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" id="gr-body">
                <div class="pt-fg"><label class="pt-label">Titre *</label><input class="pt-input" id="gr-t"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                    <div class="pt-fg"><label class="pt-label">Date</label><div class="pt-select">25.09.2026</div></div>
                    <div class="pt-fg"><label class="pt-label">Note max.</label><div class="pt-select">6</div></div>
                    <div class="pt-fg"><label class="pt-label">Type</label><div class="pt-select">Test significatif</div></div>
                </div>
            </div>
            <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="gr-next">Suivant : saisir les notes <i class="fas fa-arrow-right"></i></span></div>`));
        await k.type('#gr-t', 'Test – Fractions');
        await k.cap('Puis saisis les notes, élève par élève.');
        await k.click('#gr-next', () => {
            k.html('#gr-body', `<div class="pt-label" style="margin-bottom:8px">Test – Fractions · note sur 6</div>` +
                STUDENTS.slice(0, 4).map((n, i) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span class="pt-avatar">${ini(n)}</span><span style="flex:1;font-size:13px">${n}</span><input class="pt-input" id="gr-n-${i}" style="width:70px;text-align:center"></div>`).join(''));
            k.html('#gr-next', '<i class="fas fa-check"></i> Créer l\'évaluation');
        });
        for (let i = 0; i < 4; i++) await k.type('#gr-n-' + i, ['5.5', '4', '5', '4.5'][i], { after: 120 });
        await k.click('#gr-next', () => { k.closeModal(); k.html('#cl-body', gradesBody(true)); k.toast('Évaluation créée'); });
        await k.cap('La moyenne se calcule toute seule.');
        await k.wait(700);

        const go = async (id, html) => k.click(id, (el) => { k.$$('.pt-tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); k.html('#cl-body', html); });
        await k.cap('Absences : l\'historique de chaque élève, retards compris.');
        await go('#ct-absences', `<div class="pt-sec-title"><i class="fas fa-calendar-check"></i> Absences et retards</div>
            <table class="pt-table"><thead><tr><th>Élève</th><th>Date</th><th>Période</th><th>Type</th><th>Justifiée</th></tr></thead><tbody>
            <tr><td>Léa Martin</td><td>18.09</td><td>P2</td><td><span class="pt-chip" style="background:#FEF2F2;color:#991B1B">Absence</span></td><td><i class="fas fa-check" style="color:#10B981"></i> par les parents</td></tr>
            <tr><td>Noah Bernard</td><td>15.09</td><td>P1</td><td><span class="pt-chip" style="background:#FFFBEB;color:#92400E">Retard 5 min</span></td><td>—</td></tr>
            </tbody></table>`);
        await k.cap('Plan de classe : place tes élèves sur les tables.');
        await go('#ct-seating', `<div class="pt-sec-title"><i class="fas fa-th"></i> Plan de classe</div>${desksBody()}`);
        await k.cap('Groupes, aménagements, annonces : chaque onglet a son rôle.');
        await go('#ct-groups', `<div class="pt-sec-title"><i class="fas fa-users"></i> Groupes</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="pt-thr"><b>Groupe A</b><div class="pt-hint">Léa, Noah, Emma</div></div><div class="pt-thr"><b>Groupe B</b><div class="pt-hint">Louis, Chloé, Nathan</div></div></div>`);
        await go('#ct-accomm', `<div class="pt-sec-title"><i class="fas fa-universal-access"></i> Aménagements</div>
            <div class="pt-res"><i class="fas fa-universal-access t" style="color:#10B981"></i><div>Noah Bernard<div class="sub">Temps supplémentaire · 1/3 temps aux tests</div></div></div>`);
        await k.cap('Rapport élève : tout sur un élève, sur une seule page.');
        await go('#ct-report', `<div class="pt-sec-title"><i class="fas fa-file-alt"></i> Rapport — Léa Martin</div>
            <div class="pt-stats"><div class="pt-stat g"><b>5.5</b>Moyenne</div><div class="pt-stat r"><b>1</b>Absence</div><div class="pt-stat o"><b>2</b>Coches</div><div class="pt-stat" style="background:#EEF2FF"><b>1</b>Remarque</div></div>
            <div class="pt-res"><i class="fas fa-comment-dots t" style="color:#4F46E5"></i><div>« Excellent travail en groupe »<div class="sub">Remarque du 14.09</div></div></div>
            <div style="display:flex;justify-content:flex-end;margin-top:10px"><span class="pt-b sm"><i class="fas fa-file-pdf"></i> Exporter en PDF</span></div>`);
        await k.wait(900);
    }

    // ------------------------------------------------------------ chapitre 3
    async function chapLesson(k) {
        await k.scene(lessonScene({ current: true }));
        await k.cap('Présences : un clic sur un nom, l\'élève est absent.');
        await k.click('#at-0 .n', () => { k.$('#at-0').className = 'pt-att absent'; k.html('#st-p', '5'); k.html('#st-a', '1'); });

        await k.cap('Retard : les minutes, puis l\'horloge.');
        await k.type('#min-1', '5', { after: 150 });
        await k.click('#clk-1', () => { k.$('#at-1').className = 'pt-att late'; k.html('#st-p', '4'); k.html('#st-l', '1'); });

        const tab = async (id, html) => k.click(id, (el) => { k.$$('#l-track .pt-tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); k.html('#l-track-body', html); });
        await k.cap('Coches : oublis, bavardages… tu choisis quoi compter.');
        await tab('#tr-coches', cochesBody(['Oubli', 'Bavardage']));
        await k.click('#co-2-0-p', () => k.html('#co-2-0', '1'), { after: 250 });
        await k.click('#co-2-0-p', () => k.html('#co-2-0', '2'));

        await k.cap('Plan de classe : un clic sur une table = un avertissement.');
        await tab('#tr-seating', desksBody());
        await k.click('#d-3', (el) => el.classList.add('w1'), { after: 350 });
        await k.click('#d-3', (el) => { el.classList.remove('w1'); el.classList.add('w2'); });

        await k.cap('Une remarque sur un élève, en un clic.');
        await tab('#tr-pres', attendanceList());
        await k.click('#rm-2', () => k.add('#l-track-body', `<div class="pt-qr" id="qr"><div class="h"><i class="fas fa-comment-dots"></i> Remarque — Emma Rochat</div>
            <div class="pt-textarea" id="qr-t" style="min-height:44px" data-ph="Ta remarque…"></div>
            <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px"><span class="pt-b sm">Annuler</span><span class="pt-b primary sm" id="qr-save">Enregistrer</span></div></div>`, true));
        await k.type('#qr-t', 'Excellent travail en groupe');
        await k.click('#qr-save', () => { k.$('#qr').remove(); k.toast('Remarque enregistrée'); });

        await k.cap('Les ressources épinglées restent toujours en haut.');
        await k.spot('#l-pinned');
        await k.click('#pin-2', () => {
            k.$('#r-2').remove();
            k.add('#l-pinned-list', `<div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>Fractions – exercices.pdf</div><i class="fas fa-thumbtack pin on"></i></div>`);
        });

        await k.cap('Un clic sur un PDF : il s\'ouvre dans le lecteur.');
        await k.click('#r-1', () => {});
        await k.scene(pdfScene());
        await k.wait(900);
        await k.cap('Le lecteur a son propre chapitre, le n° 5.');
        await k.wait(900);
    }

    // ------------------------------------------------------------ chapitre 4
    async function chapFiles(k) {
        await k.scene(filesScene());
        await k.cap('Le compte Premium t\'offre 50 Go pour tes documents.');
        await k.spot('#fm-store');
        await k.cap('Au centre : tes documents, conservés d\'une année à l\'autre.');
        await k.spot('#fm-explorer');
        await k.cap('Importe un dossier entier depuis ton ordinateur.');
        await k.click('#fm-import', () => {
            k.add('#fm-tree', `<div class="f d sel" id="fm-f3" style="padding-left:24px"><i class="fas fa-folder-open"></i> Chap. 3 · Fractions <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">3 fichiers</span></div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> Fractions – théorie.pdf</div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> Fractions – exercices.pdf</div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> Fractions – corrigé.pdf</div>`);
            // le dossier Sciences reste en bas
            const sci = k.$$('#fm-tree .f.d').find(e => e.textContent.includes('Sciences'));
            if (sci) k.$('#fm-tree').appendChild(sci);
            k.toast('3 fichiers importés');
        });
        await k.wait(400);
        await k.cap('Glisse-le sur une classe : elle reçoit sa copie.');
        await k.drag('#fm-f3', '#fm-c1', '<i class="fas fa-folder" style="color:#F59E0B"></i> Chap. 3 · Fractions', () => {
            k.html('#fm-c1-n', '<b style="color:#10B981">+3</b> · 10 fichiers');
            k.toast('Dossier copié dans 9VG2');
        });
        await k.wait(500);

        await k.scene(classesScene('files', { body: `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div class="pt-sec-title" style="margin:0"><i class="fas fa-folder-open"></i> Fichiers de ${C1.name} · ${C1.subj}</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-folder-plus"></i> Nouveau dossier</span><span class="pt-b success" id="cf-up"><i class="fas fa-upload"></i> Uploader</span></div></div>
            <div class="pt-grid-files" id="cf-grid">
                <div class="pt-tile folder"><i class="fas fa-folder"></i>Chap. 1 · Nombres naturels<div class="pt-hint">4 fichiers</div></div>
                <div class="pt-tile folder"><i class="fas fa-folder"></i>Chap. 2 · Nombres relatifs<div class="pt-hint">3 fichiers</div></div>
                <div class="pt-tile folder pt-appear"><i class="fas fa-folder"></i>Chap. 3 · Fractions<div class="pt-hint">3 fichiers</div></div>
            </div>` }));
        await k.cap('Depuis Gestion de classe aussi : onglet Fichiers, bouton Uploader.');
        await k.click('#cf-up', () => k.add('#cf-grid', '<div class="pt-tile pdf"><i class="fas fa-file-pdf"></i>Fiche-révision.pdf<div class="pt-hint">240 Ko</div></div>'));
        await k.wait(500);

        await k.scene(lessonScene());
        await k.cap('Et tout se retrouve sur la page Cours, prêt à ouvrir.');
        await k.spot('#l-res');
        await k.wait(700);
    }

    // ------------------------------------------------------------ chapitre 5
    async function chapPdf(k) {
        const svgNS = 'http://www.w3.org/2000/svg';
        // Trace un chemin en l'animant, curseur au bout du trait.
        async function ink(d, color, width, from, to) {
            const p = document.createElementNS(svgNS, 'path');
            p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color);
            p.setAttribute('stroke-width', width); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
            k.$('#ink').appendChild(p);
            const len = p.getTotalLength();
            p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.style.transition = 'stroke-dashoffset .9s linear';
            const page = k.$('#pdf-page').getBoundingClientRect();
            const scr = k.$('#pdf-page').closest('.pt-screen').getBoundingClientRect();
            const sc = scr.width / 1100;
            const ox = (page.left - scr.left) / sc, oy = (page.top - scr.top) / sc;
            await k.moveXY(ox + from[0], oy + from[1], 450);
            requestAnimationFrame(() => { p.style.strokeDashoffset = 0; });
            await k.moveXY(ox + to[0], oy + to[1], 900);
            await k.wait(250);
            return p;
        }
        const on = async (id) => k.click(id, (el) => { k.$$('.pt-tool').forEach(t => { if (!['t-undo', 't-redo', 't-clear', 't-dl', 't-close', 't-track'].includes(t.id)) t.classList.remove('on'); }); el.classList.add('on'); }, { after: 200 });

        await k.scene(pdfScene());
        await k.cap('Le stylo : annote directement sur la page.');
        await on('#t-pen');
        await k.click('#c-red', (el) => { k.$('#c-black').classList.remove('on'); el.classList.add('on'); }, { after: 150 });
        await ink('M 70 140 C 110 100, 150 180, 200 130 S 280 110, 330 150', '#EF4444', 3, [70, 140], [330, 150]);
        await ink('M 400 128 l 18 20 l 34 -42', '#EF4444', 3.5, [400, 128], [452, 106]);

        await k.cap('Le surligneur.');
        await on('#t-hl');
        await k.click('#pdf-page', () => k.add('#pdf-extra', '<div class="hl" style="top:224px;width:0;transition:width .8s"></div>'), { after: 60 });
        requestAnimationFrame(() => { const h = k.$('#pdf-extra .hl'); if (h) h.style.width = '340px'; });
        await k.wait(1000);

        await k.cap('Règle, compas, équerre : des tracés précis, aimantés.');
        await on('#t-ruler');
        k.add('#pdf-extra', '<div class="pt-ruler" style="top:330px;left:70px"></div>');
        await k.wait(500);
        await ink('M 90 328 L 430 328', '#111827', 2.5, [90, 328], [430, 328]);
        k.$('#pdf-extra .pt-ruler').remove();

        await k.cap('Masque une réponse, révèle-la plus tard.');
        await on('#t-hider');
        await k.click('#pdf-page', () => k.add('#pdf-extra', '<div class="mask" style="left:40px;top:410px;width:260px;height:16px"></div>'), { dy: 60 });

        await k.cap('Annuler, rétablir, effacer : rien n\'est définitif.');
        await k.click('#t-undo', () => { const m = k.$('#pdf-extra .mask'); if (m) m.remove(); });

        await k.cap('Le suivi des élèves, sans quitter le document.');
        await k.click('#t-track', (el) => {
            el.classList.add('on');
            k.add('#pdf-page', `<div class="pt-track" id="trk"><h5><i class="fas fa-users" style="color:#4F46E5"></i> ${C1.name} — Oubli · Bavardage</h5>
                ${STUDENTS.slice(0, 4).map((n, i) => `<div class="pt-count" style="grid-template-columns:1fr 70px"><span>${n}</span><span class="c"><span class="pm">−</span><span class="v" id="tk-${i}">0</span><span class="pm" id="tk-${i}-p">+</span></span></div>`).join('')}
            </div>`);
        });
        await k.click('#tk-1-p', () => k.html('#tk-1', '1'));

        await k.cap('Télécharge le PDF avec tes annotations et tes pages ajoutées.');
        await k.click('#t-dl', () => {
            const t = k.$('#trk'); if (t) t.remove();
            k.add('.pt-pdf', `<div class="pt-dl-menu"><div class="on"><i class="fas fa-file-download"></i> Télécharger le PDF annoté</div><div><i class="fas fa-paper-plane"></i> Envoyer à toute la classe</div><div><i class="fas fa-user-slash"></i> Envoyer aux absents</div><div><i class="fas fa-user-check"></i> Choisir les élèves</div></div>`);
        });
        await k.moveTo('.pt-dl-menu .on');
        await k.wait(800);
    }

    // ------------------------------------------------------------ chapitre 6
    function sanctionsIndex(withCard) {
        return nav('dash') + `<div class="pt-page">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div class="pt-h1" style="margin:0"><i class="fas fa-exclamation-triangle"></i> Gestion des sanctions</div>
                <span class="pt-b primary" id="sa-new"><i class="fas fa-plus"></i> Nouveau modèle</span>
            </div>
            <div class="pt-card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <div class="pt-sec-title" style="margin:0"><i class="fas fa-list"></i> Modèles de sanctions</div>
                    <span class="pt-b" id="sa-import" style="opacity:.45"><i class="fas fa-file-import"></i> Importer vers les classes</span>
                </div>
                <div id="sa-list">${withCard ? `<div class="pt-thr pt-appear" style="display:flex;align-items:center;gap:12px">
                    <span class="box pt-check" id="sa-chk" style="padding:0"><span class="box"></span></span>
                    <div style="flex:1"><b>Oubli de matériel</b><div class="pt-hint">Seuil 1 : après <b>3</b> coches → Copier p. 17–18 de l'aide-mémoire</div></div>
                    <span style="color:#9CA3AF"><i class="fas fa-edit"></i> &nbsp; <i class="fas fa-trash"></i></span></div>` : '<div class="pt-empty">Aucun modèle de sanction</div>'}</div>
            </div>
        </div>`;
    }

    async function chapSanctions(k) {
        await k.scene(sanctionsIndex(false));
        await k.cap('Crée un modèle : un type de problème et ses seuils.');
        await k.click('#sa-new', () => {});
        await k.scene(nav('dash') + `<div class="pt-page">
            <div class="pt-h1"><i class="fas fa-plus-circle"></i> Créer un modèle de sanction</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-info-circle"></i> Informations générales</div>
                    <div class="pt-fg"><label class="pt-label">Nom du type de problème *</label><input class="pt-input" id="sa-name" placeholder="ex : Oubli, Comportement, Pas d'agenda…"></div>
                    <div class="pt-fg"><label class="pt-label">Description (optionnel)</label><div class="pt-textarea" style="min-height:60px" data-ph="Description détaillée…"></div></div>
                </div>
                <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-layer-group"></i> Seuils et sanctions</div>
                    <div class="pt-thr"><div class="row"><b>Seuil 1</b></div>
                        <div class="row">Déclencher après <input class="pt-input num" id="sa-thr"> coches</div>
                        <div class="row"><input class="pt-input" id="sa-s1" placeholder="ex : Copier pages 17-18 de l'aide-mémoire"><input class="pt-input num" placeholder="Jours" style="width:60px"></div>
                    </div>
                    <span class="pt-b sm"><i class="fas fa-plus"></i> Ajouter un seuil</span>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><span class="pt-b">Annuler</span><span class="pt-b primary" id="sa-save"><i class="fas fa-save"></i> Enregistrer</span></div>
        </div>`);
        await k.type('#sa-name', 'Oubli de matériel');
        await k.cap('Après combien de coches ? Et quelle sanction ?');
        await k.type('#sa-thr', '3', { after: 150 });
        await k.type('#sa-s1', 'Copier p. 17–18 de l\'aide-mémoire');
        await k.click('#sa-save', () => k.toast('Modèle enregistré'));
        await k.scene(sanctionsIndex(true));

        await k.cap('Importe-le dans les classes de ton choix.');
        await k.click('#sa-chk', (el) => { el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.classList.add('done'); k.$('#sa-import').style.opacity = '1'; });
        await k.click('#sa-import', () => k.modal(`<div class="pt-modal-h"><h3>Importer vers les classes</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-label" style="margin-bottom:8px">Sélectionne les classes :</div>
                ${[C1, C2, C3].map((c, i) => `<div class="pt-check" id="sa-c${i + 1}"><span class="box"></span><span><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}</span></div>`).join('')}
            </div><div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="sa-go"><i class="fas fa-file-import"></i> Importer</span></div>`));
        await k.click('#sa-c1', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.querySelector('span:last-child').style.textDecoration = 'none'; });
        await k.click('#sa-go', () => { k.closeModal(); k.toast('Modèle importé dans 9VG2'); });
        await k.wait(500);

        await k.scene(lessonScene({ current: true }));
        await k.cap('En cours : une colonne par type de coche.');
        await k.click('#tr-coches', (el) => { k.$$('#l-track .pt-tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); k.html('#l-track-body', cochesBody(['Oubli de matériel'])); });
        for (let n = 1; n <= 3; n++) {
            await k.click('#co-0-0-p', () => {
                k.html('#co-0-0', String(n));
                if (n === 3) k.html('#co-alert', '<div class="pt-alert pt-appear"><i class="fas fa-bell"></i> Seuil atteint pour Léa Martin : <b>Copier p. 17–18 de l\'aide-mémoire</b></div>');
            }, { after: 260 });
        }
        await k.cap('Au seuil, la sanction s\'affiche toute seule.');
        await k.spot('#co-alert');

        await k.scene(classesScene('coches', { body: `<div class="pt-sec-title"><i class="fas fa-exclamation-triangle"></i> Coches — ${C1.name}</div>
            <table class="pt-table"><thead><tr><th>Élève</th><th>Oubli de matériel</th><th>Sanctions en cours</th></tr></thead><tbody>
            <tr><td>Léa Martin</td><td><b>3</b></td><td><span class="pt-chip" style="background:#FEF2F2;color:#991B1B">Copier p. 17–18 · à rendre le 28.09</span></td></tr>
            <tr><td>Noah Bernard</td><td>1</td><td>—</td></tr><tr><td>Emma Rochat</td><td>0</td><td>—</td></tr><tr><td>Louis Favre</td><td>2</td><td>—</td></tr>
            </tbody></table>` }));
        await k.cap('Et le récapitulatif par élève dans Gestion de classe.');
        await k.spot('#cl-body');
        await k.wait(700);
    }

    // ------------------------------------------------------------ chapitre 7
    function decoupageScene(detail) {
        return nav('dash') + `<div class="pt-page">
            <div class="pt-h1"><i class="fas fa-layer-group"></i> Découpage de l'année</div>
            <div style="display:grid;grid-template-columns:300px 1fr;gap:14px;height:calc(100% - 44px)">
                <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-folder-open"></i> Mes découpages</div>
                    <div id="dc-list">${detail ? `<div class="pt-theme" style="border-color:#4F46E5;background:#EEF2FF"><span class="sw" style="background:#4F46E5"></span><b>Maths 9e</b><span class="w">Mathématiques</span></div>` : ''}</div>
                    <span class="pt-b primary" id="dc-new" style="width:100%;justify-content:center;margin-top:8px"><i class="fas fa-plus"></i> Nouveau découpage</span>
                </div>
                <div class="pt-card" id="dc-detail">${detail ? `
                    <div style="display:flex;justify-content:space-between;align-items:center"><div class="pt-sec-title" style="margin:0"><i class="fas fa-edit"></i> Maths 9e · Mathématiques</div><span class="pt-b sm" id="dc-assign"><i class="fas fa-link"></i> Assigner à une classe</span></div>
                    <div class="pt-hint" style="margin:8px 0 12px"><i class="fas fa-chart-bar"></i> Prévisualisation</div>
                    <div class="pt-seg" id="dc-seg"><div style="flex:1;background:#E5E7EB;color:#9CA3AF">38 semaines libres</div></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="pt-sec-title" style="margin:0"><i class="fas fa-layer-group"></i> Thèmes</div><span class="pt-b sm" id="dc-addt"><i class="fas fa-plus"></i> Ajouter</span></div>
                    <div id="dc-themes"><div class="pt-empty" id="dc-empty">Aucun thème. Clique sur « Ajouter » pour créer un thème.</div></div>` : '<div class="pt-empty">Sélectionne ou crée un découpage</div>'}</div>
            </div>
        </div>`;
    }

    async function chapDecoupage(k) {
        await k.scene(decoupageScene(false));
        await k.cap('Découpe ton année en thèmes : tu sauras toujours où tu en es.');
        await k.click('#dc-new', () => k.modal(`<div class="pt-modal-h"><h3>Nouveau découpage</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-fg"><label class="pt-label">Nom du découpage</label><input class="pt-input" id="dc-name" placeholder="Ex : Découpage Maths 2026"></div>
            <div class="pt-fg"><label class="pt-label">Discipline</label><input class="pt-input" id="dc-sub" placeholder="Ex : Mathématiques"></div>
            <div class="pt-fg"><label class="pt-label">Mode</label><div style="display:flex;gap:8px"><div class="pt-select" style="border-color:#C7D2FE;background:#EEF2FF"><b>Par thèmes</b><div class="pt-hint">Des thèmes de N semaines</div></div><div class="pt-select"><b>Par semaines</b><div class="pt-hint">Semaine par semaine</div></div></div></div></div>
            <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="dc-create"><i class="fas fa-check"></i> Créer</span></div>`));
        await k.type('#dc-name', 'Maths 9e');
        await k.type('#dc-sub', 'Mathématiques');
        await k.click('#dc-create', () => k.closeModal());
        await k.scene(decoupageScene(true));

        const segs = [];
        const renderSeg = () => {
            const used = segs.reduce((a, s) => a + s.w, 0);
            k.html('#dc-seg', segs.map(s => `<div style="flex:${s.w};background:${s.c}">${s.n} · ${s.w} sem.</div>`).join('') + `<div style="flex:${38 - used};background:#E5E7EB;color:#9CA3AF">${38 - used} sem. libres</div>`);
        };
        const addTheme = async (name, weeks, color, capText) => {
            if (capText) await k.cap(capText);
            await k.click('#dc-addt', () => k.modal(`<div class="pt-modal-h"><h3>Ajouter un thème</h3><span class="x"><i class="fas fa-times"></i></span></div>
                <div class="pt-modal-b"><div class="pt-fg"><label class="pt-label">Nom du thème</label><input class="pt-input" id="dc-tn" placeholder="Ex : Les fractions"></div>
                <div class="pt-fg"><label class="pt-label">Durée (en semaines)</label><input class="pt-input" id="dc-tw" style="width:90px"></div></div>
                <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="dc-tok"><i class="fas fa-plus"></i> Ajouter</span></div>`));
            await k.type('#dc-tn', name);
            await k.type('#dc-tw', String(weeks), { after: 120 });
            await k.click('#dc-tok', () => {
                k.closeModal();
                const e = k.$$('#dc-empty')[0]; if (e) e.remove();
                k.add('#dc-themes', `<div class="pt-theme"><span class="sw" style="background:${color}"></span>${name}<span class="w">${weeks} semaines</span></div>`);
                segs.push({ n: name, w: weeks, c: color }); renderSeg();
            });
        };
        await addTheme('Les fractions', 4, '#4F46E5', 'Ajoute un thème et sa durée en semaines.');
        await addTheme('Géométrie plane', 3, '#10B981');
        await addTheme('Calcul littéral', 5, '#F59E0B');
        await k.cap('La barre montre l\'année qui se remplit.');
        await k.spot('#dc-seg');

        await k.cap('Puis assigne le découpage à une classe.');
        await k.click('#dc-assign', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-link" style="color:#4F46E5"></i> Assigner « Maths 9e » à une classe</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b">${[C1, C3, C2].map((c, i) => `<div class="pt-res"><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}<span class="pt-b primary sm" id="dc-a${i}" style="margin-left:auto">Assigner</span></div>`).join('')}</div>
            <div class="pt-modal-f"><span class="pt-b primary" id="dc-done">Terminé</span></div>`));
        await k.click('#dc-a0', (el) => { el.className = 'pt-b success sm'; el.innerHTML = '<i class="fas fa-check"></i> Assigné'; el.style.marginLeft = 'auto'; });
        await k.click('#dc-done', () => { k.closeModal(); k.toast('Découpage assigné à 9VG2'); });
        await k.wait(400);

        // Vue annuelle
        const weeks = []; let n = 34;
        const themeOf = w => (w >= 35 && w <= 38) ? ['Fractions', '#4F46E5'] : (w >= 39 && w <= 41) ? ['Géométrie', '#10B981'] : (w >= 43 && w <= 47) ? ['Calcul litt.', '#F59E0B'] : null;
        for (let i = 0; i < 22; i++) { const w = n + i; weeks.push({ w, hol: w === 42 || w === 52 || w === 53, t: themeOf(w) }); }
        await k.scene(nav('cal') + `<div class="pt-page">
            <div class="pt-week-h"><div class="t"><i class="fas fa-calendar-alt" style="color:#4F46E5;margin-right:6px"></i> Vue annuelle — ${C1.name} · ${C1.subj}</div><span class="pt-b sm"><i class="fas fa-calendar-week"></i> Vue hebdo</span></div>
            <div class="pt-card"><div class="pt-annual" id="an-grid">${weeks.map(x => `<div class="pt-wk ${x.hol ? 'hol' : ''}">S${x.w}${x.hol ? '<div style="font-size:8px;color:#9CA3AF">vacances</div>' : ''}${x.t ? `<div class="rib" style="background:${x.t[1]}22;color:${x.t[1]};border-bottom:2px solid ${x.t[1]}">${x.t[0]}</div>` : ''}</div>`).join('')}</div>
            <div class="pt-hint" style="margin-top:10px"><i class="fas fa-info-circle"></i> Survole un bandeau pour voir les objectifs du thème.</div></div>
        </div>`);
        await k.cap('Les thèmes apparaissent sur la vue annuelle, semaine par semaine.');
        await k.spot('#an-grid');
        await k.wait(900);
    }

    // ------------------------------------------------------------ chapitre 8
    async function chapAccounts(k) {
        await k.scene(classesScene('students', { students: STUDENTS.slice(0, 4) }));
        await k.cap('Génère un code pour tes élèves.');
        await k.click('#cl-code-e', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-key" style="color:#4F46E5"></i> Code élèves — ${C1.name}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" style="text-align:center"><div class="pt-hint">Communique ce code à tes élèves :</div><div class="pt-code">X6VRK6</div>
            <div class="pt-hint">Avec ce code, chaque élève crée son compte et rejoint la classe.</div></div>
            <div class="pt-modal-f"><span class="pt-b"><i class="fas fa-copy"></i> Copier</span><span class="pt-b primary">Fermer</span></div>`));
        await k.spot('.pt-code');

        await k.scene(phoneScene(`<div class="pt-phone"><h4>Créer mon compte</h4><div class="sub">Espace élève · ProfCalendar</div>
            <div class="pt-fg"><label class="pt-label">Code d'accès</label><input class="pt-input" id="st-code" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.1em"></div>
            <div class="pt-fg"><label class="pt-label">Email</label><input class="pt-input" id="st-mail" placeholder="prenom.nom@exemple.ch"></div>
            <div class="pt-fg"><label class="pt-label">Mot de passe</label><input class="pt-input" id="st-pw" type="password"></div>
            <span class="pt-b primary" id="st-go" style="width:100%;justify-content:center"><i class="fas fa-user-plus"></i> Créer mon compte</span>
            <div id="st-ok"></div></div>`));
        await k.cap('L\'élève crée son compte avec ce code.');
        await k.type('#st-code', 'X6VRK6');
        await k.type('#st-mail', 'lea.martin@exemple.ch');
        await k.type('#st-pw', '••••••••', { ms: 60 });
        await k.click('#st-go', () => k.html('#st-ok', '<div class="pt-ok pt-appear" style="margin-top:12px"><i class="fas fa-check-circle"></i> Compte lié à 9VG2 · Léa Martin</div>'));
        await k.wait(500);

        await k.scene(classesScene('students', { students: STUDENTS.slice(0, 4) }));
        await k.cap('Même principe pour les parents : un code par classe.');
        await k.click('#cl-code-p', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-users" style="color:#4F46E5"></i> Code parents — ${C1.name}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" style="text-align:center"><div class="pt-hint">Donne ce code aux parents, avec ton nom d'utilisateur :</div><div class="pt-code">P4K2ZQ</div>
            <div class="pt-hint">Nom d'utilisateur : <b>mme.favre</b></div></div>
            <div class="pt-modal-f"><span class="pt-b"><i class="fas fa-copy"></i> Copier</span><span class="pt-b primary">Fermer</span></div>`));
        await k.spot('.pt-code');

        await k.scene(phoneScene(`<div class="pt-phone"><h4>Liaison avec l'enseignant</h4><div class="sub">Espace parents · ProfCalendar</div>
            <div class="pt-fg"><label class="pt-label">Nom d'utilisateur de l'enseignant</label><input class="pt-input" id="pa-name"></div>
            <div class="pt-fg"><label class="pt-label">Code de classe</label><input class="pt-input" id="pa-code" style="text-transform:uppercase;letter-spacing:.1em"></div>
            <div class="pt-fg"><label class="pt-label">Mon enfant</label><div class="pt-select">Léa Martin</div></div>
            <span class="pt-b primary" id="pa-go" style="width:100%;justify-content:center"><i class="fas fa-link"></i> Valider la liaison</span>
            <div id="pa-ok"></div></div>`));
        await k.cap('Le parent saisit ton nom et le code : le lien est fait.');
        await k.type('#pa-name', 'mme.favre');
        await k.type('#pa-code', 'P4K2ZQ');
        await k.click('#pa-go', () => k.html('#pa-ok', '<div class="pt-ok pt-appear" style="margin-top:12px"><i class="fas fa-check-circle"></i> Léa Martin est liée à votre compte</div>'));
        await k.wait(500);

        await k.scene(phoneScene(`<div style="display:flex;gap:26px">
            <div class="pt-phone" style="width:300px;margin:0"><h4>Espace élève</h4><div class="sub">Léa Martin · 9VG2</div>
                <div class="pt-res"><i class="fas fa-gamepad t" style="color:#667eea"></i><div>Exercices interactifs<div class="sub">1 nouvelle mission</div></div></div>
                <div class="pt-res"><i class="fas fa-book t" style="color:#F59E0B"></i><div>Devoirs<div class="sub">p. 42 n° 1 à 5 · pour vendredi</div></div></div>
                <div class="pt-res"><i class="fas fa-folder-open t" style="color:#4F46E5"></i><div>Fichiers partagés<div class="sub">Aide-mémoire fractions.pdf</div></div></div>
                <div class="pt-res"><i class="fas fa-chart-line t" style="color:#10B981"></i><div>Mes notes<div class="sub">Test – Fractions : 5.5</div></div></div></div>
            <div class="pt-phone" style="width:300px;margin:0"><h4>Espace parents</h4><div class="sub">Léa Martin · 9VG2</div>
                <div class="pt-res"><i class="fas fa-calendar-check t" style="color:#EF4444"></i><div>Absences<div class="sub">18.09 · P2 — <b style="color:#4F46E5">justifier</b></div></div></div>
                <div class="pt-res"><i class="fas fa-chart-line t" style="color:#10B981"></i><div>Notes<div class="sub">Moyenne : 5.5</div></div></div>
                <div class="pt-res"><i class="fas fa-bullhorn t" style="color:#F59E0B"></i><div>Annonces<div class="sub">Sortie du 3 octobre</div></div></div></div>
        </div>`));
        await k.cap('Élèves : exercices, devoirs, fichiers. Parents : absences, notes, annonces.');
        await k.wait(1400);
    }

    // ------------------------------------------------------------ chapitre 9
    async function chapExercise(k) {
        await k.scene(nav('dash') + `<div class="pt-page">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div class="pt-h1" style="margin:0"><i class="fas fa-puzzle-piece"></i> Gestionnaire d'exercices</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-folder-plus"></i> Nouveau dossier</span><span class="pt-b primary" id="ex-new"><i class="fas fa-plus"></i> Nouvel exercice</span></div>
            </div>
            <div class="pt-card"><div class="pt-grid-files">
                <div class="pt-tile folder"><i class="fas fa-folder"></i>Nombres relatifs<div class="pt-hint">2 exercices</div></div>
                <div class="pt-tile" style="border-left:3px solid #667eea"><i class="fas fa-gamepad" style="color:#667eea"></i>Relatifs – addition<div class="pt-hint">120 XP · 6 questions</div></div>
            </div></div>
        </div>`);
        await k.cap('Crée un exercice interactif.');
        await k.click('#ex-new', () => {});
        await k.scene(nav('dash') + `<div class="pt-page">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div class="pt-h1" style="margin:0"><i class="fas fa-flask"></i> L'Atelier d'exercices</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-file"></i> Brouillon</span><span class="pt-b primary"><i class="fas fa-save"></i> Sauvegarder</span><span class="pt-b success" id="ex-pub"><i class="fas fa-paper-plane"></i> Publier</span></div>
            </div>
            <div style="display:grid;grid-template-columns:300px 1fr;gap:14px;height:calc(100% - 50px)">
                <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-cog"></i> Paramètres</div>
                    <div class="pt-fg"><label class="pt-label">Titre *</label><input class="pt-input" id="ex-title"></div>
                    <div class="pt-fg"><label class="pt-label">Matière</label><div class="pt-select">Mathématiques</div></div>
                    <div class="pt-fg"><label class="pt-label">Gamification</label><div class="pt-hint">XP par bonne réponse · combo · badge à 80 %</div></div>
                </div>
                <div class="pt-card"><div class="pt-sec-title" style="color:#10B981"><i class="fas fa-puzzle-piece" style="color:#10B981"></i> Construction de l'exercice</div>
                    <div class="pt-toolbox">
                        <span class="pt-b" id="ex-qcm"><i class="fas fa-list-check"></i> QCM</span><span class="pt-b"><i class="fas fa-pen"></i> Réponse courte</span><span class="pt-b"><i class="fas fa-paragraph"></i> Texte à trous</span>
                        <span class="pt-b"><i class="fas fa-sort"></i> Classement</span><span class="pt-b"><i class="fas fa-arrows-alt-h"></i> Associations</span><span class="pt-b"><i class="fas fa-image"></i> Image interactive</span><span class="pt-b"><i class="fas fa-chart-line"></i> Graphique</span>
                    </div>
                    <div id="ex-blocks"><div class="pt-empty" id="ex-empty">Ajoute un premier bloc avec les boutons ci-dessus</div></div>
                </div>
            </div>
        </div>`);
        await k.type('#ex-title', 'Fractions – QCM');
        await k.cap('Ajoute un bloc : QCM, réponse courte, texte à trous…');
        await k.click('#ex-qcm', () => {
            k.$('#ex-empty').remove();
            k.add('#ex-blocks', `<div class="pt-block"><span class="bt">QCM</span><span style="float:right;color:#9CA3AF;font-size:11px"><i class="far fa-clock"></i> 30 s · <b>20 XP</b></span>
                <div class="pt-fg"><input class="pt-input" id="ex-q" placeholder="Question…"></div>
                ${[0, 1, 2].map(i => `<div class="pt-opt"><span class="rb" id="ex-r${i}"></span><input class="pt-input" id="ex-o${i}" placeholder="Option ${i + 1}"></div>`).join('')}
                <span class="pt-b sm"><i class="fas fa-plus"></i> Option</span></div>`);
        });
        await k.type('#ex-q', 'Quelle fraction est égale à 1/2 ?');
        await k.type('#ex-o0', '2/4', { after: 120 });
        await k.type('#ex-o1', '3/5', { after: 120 });
        await k.type('#ex-o2', '1/3', { after: 120 });
        await k.cap('Coche la bonne réponse.');
        await k.click('#ex-r0', (el) => el.classList.add('on'));

        await k.cap('Publie-le dans une classe.');
        await k.click('#ex-pub', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-paper-plane" style="color:#10B981"></i> Publier l'exercice</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-hint" style="margin-bottom:8px">Sélectionne les classes :</div>
            ${[C1, C3, C2].map((c, i) => `<div class="pt-check" id="ex-c${i}"><span class="box"></span><span><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}</span></div>`).join('')}</div>
            <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b success" id="ex-go"><i class="fas fa-paper-plane"></i> Publier</span></div>`));
        await k.click('#ex-c0', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.querySelector('span:last-child').style.textDecoration = 'none'; });
        await k.click('#ex-go', () => { k.closeModal(); k.toast('Exercice publié dans 9VG2'); });
        await k.wait(500);

        await k.scene(lessonScene({ current: true, exercise: true }));
        await k.cap('Sur la page Cours, lance-le en direct.');
        await k.click('#r-launch', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-rocket" style="color:#667eea"></i> Lancer l'exercice</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-select" style="border-color:#4F46E5;background:#EEF2FF;margin-bottom:8px"><b>📖 Mode classique</b><div class="pt-hint">Chaque élève avance à son rythme, tu suis la progression en direct.</div></div>
            <div class="pt-select"><b>⚔️ Mode combat</b><div class="pt-hint">La classe affronte un monstre : chaque bonne réponse attaque.</div></div></div>
            <div class="pt-modal-f"><span class="pt-b">Annuler</span><span class="pt-b primary" id="ex-start"><i class="fas fa-play"></i> Lancer la mission</span></div>`));
        await k.click('#ex-start', () => {
            k.closeModal();
            k.html('#r-ex .sub', '<span class="pt-chip" style="background:#EEF2FF;color:#4F46E5">📖 Classique · en cours</span>');
            k.$('#r-launch').remove();
            k.add('#l-plan-body', `<div style="margin-top:12px;padding-top:12px;border-top:1.5px solid #E5E7EB" id="ex-live">
                <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-satellite-dish" style="color:#10B981"></i> Suivi en direct — Fractions – QCM</div>
                ${STUDENTS.slice(0, 4).map((n, i) => `<div class="pt-live"><span class="pt-avatar">${ini(n)}</span><span style="width:96px">${n.split(' ')[0]}</span><div class="bar"><div id="lv-${i}"></div></div><b id="lvx-${i}" style="width:44px;text-align:right;color:#10B981">0 XP</b></div>`).join('')}
            </div>`);
        });
        await k.cap('Tu suis la progression de chaque élève en temps réel.');
        const prog = [[100, '60 XP'], [66, '40 XP'], [33, '20 XP'], [100, '40 XP']];
        for (let round = 1; round <= 3; round++) {
            prog.forEach((p, i) => { k.$('#lv-' + i).style.width = Math.min(p[0], round * 34) + '%'; });
            await k.wait(900);
        }
        prog.forEach((p, i) => { k.html('#lvx-' + i, p[1]); });
        await k.wait(900);
    }

    // ------------------------------------------------------------ registre
    window.pcTutorialChapters = [
        { id: 'planning', title: 'Ma première planification', desc: 'Calendrier, fichier éphémère, tâches à cocher, page Cours.', icon: 'fa-calendar-plus', color: '#4F46E5', seconds: 35, reco: true, steps: 12, run: chapPlanning },
        { id: 'classes', title: 'Gérer ma classe', desc: 'Élèves, notes, absences, plan de classe, rapport élève.', icon: 'fa-users', color: '#10B981', seconds: 40, steps: 10, run: chapClasses },
        { id: 'lesson', title: 'La page Cours', desc: 'Présences, coches, plan de classe, remarques, fichiers épinglés.', icon: 'fa-graduation-cap', color: '#F59E0B', seconds: 30, steps: 9, run: chapLesson },
        { id: 'files', title: 'Le gestionnaire de fichiers', desc: 'Tes documents, d\'une année à l\'autre, à copier dans tes classes.', icon: 'fa-folder-open', color: '#0EA5E9', seconds: 20, steps: 6, run: chapFiles },
        { id: 'pdf', title: 'Le lecteur PDF', desc: 'Stylo, surligneur, règle, masque, suivi des élèves, export annoté.', icon: 'fa-file-pdf', color: '#DC2626', seconds: 30, steps: 8, run: chapPdf },
        { id: 'sanctions', title: 'Les coches et sanctions', desc: 'Un modèle, des seuils, et la sanction qui s\'affiche en cours.', icon: 'fa-exclamation-triangle', color: '#EA580C', seconds: 30, steps: 6, run: chapSanctions },
        { id: 'decoupage', title: 'Le découpage de l\'année', desc: 'Des thèmes, une durée, une classe : la vue annuelle se remplit.', icon: 'fa-layer-group', color: '#7C3AED', seconds: 35, steps: 6, run: chapDecoupage },
        { id: 'accounts', title: 'Comptes élèves et parents', desc: 'Un code par classe pour lier les élèves et leurs parents.', icon: 'fa-user-friends', color: '#0D9488', seconds: 25, steps: 6, run: chapAccounts },
        { id: 'exercise', title: 'Un exercice interactif', desc: 'Créer un QCM, le publier, le lancer en direct en classe.', icon: 'fa-gamepad', color: '#667eea', seconds: 30, steps: 7, run: chapExercise }
    ];
})();
