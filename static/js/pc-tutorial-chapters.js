/**
 * ProfCalendar — Tutoriel animé : scènes et chapitres.
 *
 * Chaque chapitre est une fonction `run(k)` qui enchaîne des gestes sur une
 * fausse application (données fictives : Mme Favre, classe 9VG2…). `k` est
 * la boîte à outils du moteur (pc-tutorial.js) : k.scene, k.cap, k.click,
 * k.type, k.drag, k.modal… Toute attente passe par k.wait, ce qui permet
 * d'interrompre proprement un chapitre.
 *
 * Règle d'écriture : à chaque étape, la souris S'ARRÊTE sur l'élément
 * concerné et une bulle explique en une phrase (k.cap(texte, cible)) ; le
 * geste vient ensuite. Les scènes reprennent la mise en page des vraies
 * pages (en-têtes, colonnes, boutons, couleurs) pour que l'enseignant
 * retrouve ce qu'il vient de voir.
 *
 * Traductions : tout texte affiché passe par pcT(texte FR) (base.html),
 * avec une chaîne littérale simple et des jetons {n} pour les valeurs.
 */
// Repli si base.html n'a pas défini pcT (le texte français reste affiché).
if (typeof window.pcT !== 'function') { window.pcT = function (s, v) { return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return (k in v) ? String(v[k]) : m; }) : s; }; }
(function () {
    'use strict';

    // ------------------------------------------------------------ données
    const C1 = { name: '9VG2', subj: pcT('Mathématiques'), short: pcT('Maths'), color: '#6366F1', bg: '#EEF2FF' };
    const C2 = { name: '10VP1', subj: pcT('Sciences'), color: '#10B981', bg: '#ECFDF5' };
    const C3 = { name: '11VG3', subj: pcT('Mathématiques'), short: pcT('Maths'), color: '#F59E0B', bg: '#FFFBEB' };
    const STUDENTS = ['Léa Martin', 'Noah Bernard', 'Emma Rochat', 'Louis Favre', 'Chloé Dubois', 'Nathan Girard'];
    const ini = n => n.split(' ').map(p => p[0]).join('');

    // Contenus fictifs repris d'une scène à l'autre (même texte partout).
    const LESSON = pcT('Fractions – exercices');
    const QCM_TITLE = pcT('Fractions – QCM');
    const TEST = pcT('Test – Fractions');
    const FORGOT = pcT('Oubli de matériel');
    const SANCTION = pcT("Copier p. 17–18 de l'aide-mémoire");
    const DECOUP = pcT('Maths 9e');
    const TASKS = [pcT('Corriger la série 3'), pcT('Fractions équivalentes : exemples'), pcT('Devoirs : p. 42 n° 1 à 5')];
    const REMINDER = pcT('Rappel : test vendredi');
    const REMARK = pcT('Excellent travail en groupe');
    const F_THEORY = pcT('Fractions – théorie.pdf');
    const F_EXO = pcT('Fractions – exercices.pdf');
    const F_KEY = pcT('Fractions – corrigé.pdf');
    const F_CORR = pcT('correction-serie-3.pdf');
    const F_MEMO = pcT('Aide-mémoire fractions.pdf');
    const CH1 = pcT('Chap. {n}', { n: 1 }) + ' · ' + pcT('Nombres naturels');
    const CH2 = pcT('Chap. {n}', { n: 2 }) + ' · ' + pcT('Nombres relatifs');
    const CH3 = pcT('Chap. {n}', { n: 3 }) + ' · ' + pcT('Fractions');
    const wk = n => pcT('S{n}', { n: n });                 // numéro de semaine
    const nFiles = n => pcT('{n} fichiers', { n: n });
    const clsMeta = (f, s) => pcT('{f} fichiers · {s} élève(s)', { f: f, s: s });

    // ------------------------------------------------------------ briques
    function nav(active) {
        const a = k => (k === active ? 'active' : '');
        return `<div class="pt-nav">
            <span class="brand"><i class="fas fa-calendar-check"></i> ProfCalendar</span>
            <a class="${a('dash')}"><i class="fas fa-home"></i> ${pcT('Tableau de bord')}</a>
            <a class="${a('lesson')}"><i class="fas fa-graduation-cap"></i> ${pcT('Prochain cours')}</a>
            <a class="${a('classes')}"><i class="fas fa-users"></i> ${pcT('Gestion de classe')}</a>
            <a class="${a('cal')}"><i class="fas fa-calendar"></i> ${pcT('Calendrier')}</a>
            <span class="user"><i class="fas fa-user-circle"></i> ${pcT('Mme Favre')} <span class="pro">PRO</span> <i class="fas fa-chevron-down" style="font-size:10px"></i></span>
        </div>
        <div class="pt-trial"><i class="fas fa-crown" style="color:#F59E0B"></i> ${pcT('Abonnement <b>Premium</b> actif · toutes les fonctionnalités sont débloquées.')}</div>`;
    }
    const page = (inner, style) => `<div class="pt-page with-trial" ${style ? 'style="' + style + '"' : ''}>${inner}</div>`;

    function cblock(c, title, meta) {
        return `<div class="pt-cblock" style="background:${c.color}"><b>${c.name}</b>${c.short || c.subj}${title ? `<div class="t">${title}</div>` : ''}${meta ? `<div class="m">${meta}</div>` : ''}</div>`;
    }

    function calendarScene() {
        const days = [[pcT('Lundi'), '21/09'], [pcT('Mardi'), '22/09'], [pcT('Mercredi'), '23/09'], [pcT('Jeudi'), '24/09'], [pcT('Vendredi'), '25/09']];
        const periods = [['P1', '08:00', '08:45'], ['P2', '08:50', '09:35'], ['P3', '09:50', '10:35'], ['P4', '10:40', '11:25'], ['P5', '11:30', '12:15']];
        const grid = {
            '0_2': cblock(C1), '0_4': cblock(C2), '1_1': cblock(C1), '1_3': cblock(C3), '2_2': cblock(C2),
            '3_1': cblock(C1, pcT('Nombres relatifs'), '<i class="far fa-check-square"></i> 2 · <i class="fas fa-paperclip"></i> 1'),
            '3_4': cblock(C3), '4_3': cblock(C2)
        };
        let rows = '';
        periods.forEach((p, pi) => {
            rows += `<tr><td class="time">${p[0]}<small>${p[1]}<br>${p[2]}</small></td>`;
            days.forEach((d, di) => {
                rows += `<td id="c-${di}-${pi + 1}" class="${di === 0 ? 'today' : ''}">${grid[di + '_' + (pi + 1)] || ''}</td>`;
            });
            rows += '</tr>';
        });
        const weeks = [[38, '21/09'], [39, '28/09'], [40, '05/10'], [41, '12/10'], [42, '19/10'], [43, '26/10'], [44, '02/11'], [45, '09/11']]
            .map(w => wk(w[0]) + '<br>' + w[1]);
        return nav('cal') + page(`
            <div class="pt-cal-title">
                <span class="arr"><i class="fas fa-chevron-left"></i></span>
                <h2>${pcT('Semaine du lundi 21 septembre 2026 au 25 septembre 2026')} <span class="wk">${wk(38)} ▾</span></h2>
                <span class="arr"><i class="fas fa-chevron-right"></i></span>
                <span class="pt-b purple sm"><i class="fas fa-calendar-day"></i> ${pcT("Aujourd'hui")}</span>
                <span class="pt-b sm"><i class="fas fa-expand"></i> ${pcT('Vue étendue')}</span>
            </div>
            <div class="pt-cal2">
                <div class="pt-card" id="cal-week">
                    <div class="pt-sec-title"><i class="fas fa-calendar-week"></i> ${pcT('Vue hebdomadaire')}</div>
                    <table class="pt-sched">
                        <thead><tr><th style="width:56px">${pcT('Heure')}</th>${days.map((d, i) => `<th class="${i === 0 ? 'today' : ''}">${d[0]}<div class="d">${d[1]}</div></th>`).join('')}</tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="pt-card">
                    <div class="pt-sec-title"><i class="fas fa-calendar-alt"></i> ${pcT('Vue annuelle')}</div>
                    <div class="pt-annual-mini">
                        <div class="hd"><div style="border:none"></div>${[C1, C2, C3].map(c => `<div style="border-color:${c.color}">${c.name}<small>${c.subj}</small></div>`).join('')}</div>
                        ${weeks.map((w, i) => `<div class="row"><div class="w">${w}</div><div class="c ${i === 0 ? 'f' : ''}"></div><div class="c ${i === 0 ? 'f' : ''}"></div><div class="c ${i === 0 ? 'f' : ''}"></div></div>`).join('')}
                    </div>
                </div>
            </div>`);
    }

    function planningModalHtml() {
        return `
        <div class="pt-modal-h grad">
            <div><div class="k"><i class="fas fa-calendar-day"></i> ${pcT('Planification')}</div><h3>${pcT('Période 2 – lundi 21 septembre 2026')}</h3></div>
            <div style="display:flex;gap:8px;align-items:center">
                <span class="pt-b icon" id="m-files" title="${pcT('Afficher les fichiers de la classe')}"><i class="fas fa-folder-open"></i></span>
                <span class="x"><i class="fas fa-times"></i></span>
            </div>
        </div>
        <div class="pt-split" id="m-split" style="grid-template-columns:1fr">
            <div class="pt-modal-b">
                <div class="pt-mrow" style="color:#D97706"><span><i class="fas fa-file"></i> ${pcT('Feuilles blanches')} (0)</span><span class="pt-b purple sm"><i class="fas fa-plus"></i> ${pcT('Nouvelle')}</span></div>
                <div class="pt-mrow" style="color:#6366F1"><span><i class="fas fa-paperclip"></i> ${pcT('Fichiers joints')} (<span id="m-att-n">0</span>)</span><span class="pt-b warn sm" id="m-eph"><i class="fas fa-hourglass-half"></i> ${pcT('Fichier éphémère')}</span></div>
                <div id="m-att-list" style="margin-bottom:6px"></div>
                <div class="pt-toggle"><span class="on"><i class="fas fa-book-open"></i> ${pcT('Cours')}</span><span><i class="far fa-calendar-check"></i> ${pcT('Tâche perso')}</span></div>
                <div class="pt-fg"><label class="pt-label">${pcT('Classe')}</label><div class="pt-select">${C1.name} - ${C1.subj} <i class="fas fa-chevron-down" style="float:right;color:#9CA3AF"></i></div></div>
                <div class="pt-fg"><label class="pt-label">${pcT('Titre du cours')}</label><input class="pt-input" id="m-title" placeholder="${pcT('Ex: Introduction aux fractions')}"></div>
                <div class="pt-fg" style="margin-bottom:4px"><label class="pt-label">${pcT('Description')}</label>
                    <div class="pt-textarea" id="m-desc" data-ph="${pcT('Détails du cours, exercices prévus...')}"></div>
                    <div class="pt-hint"><i class="far fa-lightbulb"></i> ${pcT('Astuce : commencez une ligne par « - [ ] » pour créer une case à cocher.')}</div>
                </div>
            </div>
            <div class="pt-files-pane" id="m-pane" style="display:none">
                <h4><i class="fas fa-folder-open" style="color:#4F46E5"></i> ${pcT('Fichiers de {name}', { name: C1.name })}</h4>
                <div class="pt-folder-lbl"><i class="fas fa-folder"></i> ${CH2}</div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> ${pcT('Théorie.pdf')} <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-folder-lbl"><i class="fas fa-folder-open"></i> ${CH3}</div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> ${F_THEORY} <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-file-row" id="m-f-ex"><i class="fas fa-file-pdf t"></i> ${F_EXO} <i class="fas fa-plus-circle plus"></i></div>
                <div class="pt-file-row"><i class="fas fa-file-pdf t"></i> ${F_KEY} <i class="fas fa-plus-circle plus"></i></div>
            </div>
        </div>
        <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="m-save"><i class="fas fa-save"></i> ${pcT('Enregistrer')}</span></div>`;
    }

    const attachedRow = (name, eph) => `<div class="pt-file-row" style="margin-bottom:4px">
        <i class="fas ${eph ? 'fa-hourglass-half' : 'fa-file-pdf'} t" style="color:${eph ? '#F59E0B' : '#DC2626'}"></i> ${name}
        ${eph ? '<span class="pt-chip" style="background:#FEF3C7;color:#92400E">' + pcT('éphémère') + '</span>' : ''}
        <i class="fas fa-times" style="margin-left:auto;color:#9CA3AF"></i></div>`;

    const checkLine = (t, done) => `<div class="pt-check ${done ? 'done' : ''}"><span class="box">${done ? '<i class="fas fa-check"></i>' : ''}</span><span>${t}</span></div>`;

    function attendanceList() {
        return `<div class="pt-stats"><div class="pt-stat g"><b id="st-p">6</b>${pcT('Présents')}</div><div class="pt-stat r"><b id="st-a">0</b>${pcT('Absents')}</div><div class="pt-stat o"><b id="st-l">0</b>${pcT('Retards')}</div></div>
            <div class="pt-group"><b><i class="fas fa-users" style="color:#4F46E5"></i> ${pcT('Classe entière')}</b>${pcT('{n} élève(s) dans la classe', { n: 6 })}</div>
            <div id="at-list">${STUDENTS.map((n, i) => `<div class="pt-att present" id="at-${i}">
                <span class="pt-avatar">${ini(n)}</span><span class="n">${n}</span>
                <span class="min" id="min-${i}"></span><span class="ib" id="clk-${i}"><i class="fas fa-clock"></i></span>
                <span class="ib" id="rm-${i}" title="${pcT('Remarque')}"><i class="fas fa-comment-medical"></i></span>
            </div>`).join('')}</div>`;
    }

    function lessonScene(opts) {
        const o = opts || {};
        const planning = o.planning !== false;
        const tabs = `<div class="pt-tabs" style="margin-bottom:10px">
            <span class="pt-tab active" id="tr-pres"><i class="fas fa-user-check"></i> ${pcT('Présences')}</span>
            <span class="pt-tab" id="tr-coches"><i class="fas fa-exclamation-triangle"></i> ${pcT('Coches')} (2)</span>
            <span class="pt-tab" id="tr-seating"><i class="fas fa-th"></i> ${pcT('Plan de classe')}</span>
            <span class="pt-tab" id="tr-annual"><i class="fas fa-calendar-alt"></i> ${pcT('Vue annuelle')}</span>
        </div>`;
        const planView = planning ? `<h3 style="margin:0 0 8px;font-size:15px" id="l-title">${LESSON}</h3>
            <div id="l-checks">${checkLine(TASKS[0])}${checkLine(TASKS[1])}${checkLine(TASKS[2])}</div>
            <div style="margin-top:14px;padding-top:12px;border-top:1.5px solid #E5E7EB">
                <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-file-alt" style="color:#10B981"></i> ${pcT('Ressources du cours')}</div>
                <div id="l-plan-res">
                    <div class="pt-res"><i class="fas fa-hourglass-half t" style="color:#F59E0B"></i><div>${F_CORR}<div class="sub" style="color:#B45309">${pcT('Éphémère — supprimé le lendemain du cours')}</div></div></div>
                    <div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_EXO}<div class="sub">${pcT('PDF/Document')}</div></div></div>
                    ${o.exercise ? `<div class="pt-res" id="r-ex"><i class="fas fa-gamepad t" style="color:#667eea"></i><div>${QCM_TITLE}<div class="sub"><span class="pt-chip" style="background:#F0FDF4;color:#10B981">${pcT('Non publié')}</span></div></div><span class="pt-b success sm" id="r-launch" style="margin-left:auto"><i class="fas fa-rocket"></i> ${pcT('Lancer')}</span></div>` : ''}
                </div>
            </div>` : '<div class="pt-empty">' + pcT('Aucune planification pour ce cours') + '</div>';
        const res = o.resources || `
            <div id="l-pinned" style="margin-bottom:10px">
                <div style="font-size:11.5px;font-weight:700;color:#EF4444;margin-bottom:6px"><i class="fas fa-thumbtack"></i> ${pcT('Ressources épinglées')}</div>
                <div id="l-pinned-list"><div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_MEMO}</div><i class="fas fa-thumbtack pin on"></i></div></div>
            </div>
            <div class="pt-folder-lbl"><i class="fas fa-home" style="color:#6B7280"></i> ${pcT('Racine')} <span style="color:#9CA3AF">/</span> <i class="fas fa-folder-open"></i> ${CH3}</div>
            <div id="l-tree">
                <div class="pt-res" id="r-1"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_THEORY}</div><i class="fas fa-thumbtack pin"></i></div>
                <div class="pt-res" id="r-2"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_EXO}</div><i class="fas fa-thumbtack pin" id="pin-2"></i></div>
                <div class="pt-res" id="r-3"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_KEY}</div><i class="fas fa-thumbtack pin"></i></div>
            </div>`;
        return nav('lesson') + page(`
            <div class="pt-lhead" id="l-head">
                <div>
                    <span class="pt-lbadge"><i class="fas fa-clock"></i> ${o.current ? pcT('Cours en cours') : pcT('Prochain cours')}</span><h1>${C1.name} - ${C1.subj}</h1>
                    <div class="meta"><span><i class="fas fa-calendar"></i> ${pcT('Lundi 21 septembre 2026')}</span><span><i class="fas fa-clock"></i> ${pcT('Période 2 (08:50 - 09:35)')}</span></div>
                </div>
                <div style="display:flex;gap:14px;align-items:center">
                    <div class="pt-layout-ctl">${pcT('Disposition :')} <span class="i on"><i class="fas fa-columns"></i></span><span class="i"><i class="fas fa-list-alt"></i></span><span class="i"><i class="fas fa-folder-open"></i></span><span class="i"><i class="fas fa-user-check"></i></span><span class="i"><i class="fas fa-bars"></i></span></div>
                    <div class="pt-clockbox"><b>${o.current ? '09:02:14' : '08:12:40'}</b><small>${pcT('Heure actuelle')}</small></div>
                </div>
            </div>
            <div class="pt-lesson" style="height:calc(100% - 92px)">
                <div class="pt-card" id="l-plan">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <div class="pt-sec-title" style="margin:0"><i class="fas fa-clipboard-list"></i> ${pcT('Planification du cours')}</div>
                        <span class="pt-b sm" id="l-edit"><i class="fas fa-edit"></i> ${pcT('Modifier')}</span>
                    </div>
                    <div class="pt-devoirs"><span><i class="fas fa-book" style="color:#4F46E5"></i> ${pcT('Devoirs de la classe')}</span><span class="pt-b purple sm"><i class="fas fa-plus"></i> ${pcT('Créer un devoir')}</span><span class="pt-b warn sm"><i class="fas fa-hourglass-half"></i> ${pcT('Fichier éphémère')}</span></div>
                    <div id="l-plan-body">${planView}</div>
                </div>
                <div class="pt-card" id="l-track">
                    <div class="pt-sec-title"><i class="fas fa-user-check"></i> ${pcT('Suivi des élèves')}</div>
                    ${tabs}
                    <div id="l-track-body">${attendanceList()}</div>
                </div>
                <div class="pt-card" id="l-res">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <div class="pt-sec-title" style="margin:0"><i class="fas fa-folder-open"></i> ${pcT('Ressources du cours')}</div>
                        <div style="display:flex;gap:4px"><span class="pt-b sm"><i class="fas fa-file-medical"></i> ${pcT('Feuilles blanches')}</span><span class="pt-b success sm"><i class="fas fa-plus"></i> ${pcT('Fichier')}</span></div>
                    </div>
                    <div id="l-res-body">${res}</div>
                </div>
            </div>`);
    }

    function cochesBody(cols) {
        return `<div class="pt-count-h"><span>${pcT('Élève')}</span>${cols.map(c => `<span style="text-align:center">${c}</span>`).join('')}</div>
            ${STUDENTS.slice(0, 5).map((n, i) => `<div class="pt-count"><span>${n}</span>
                ${cols.map((c, j) => `<span class="c"><span class="pm" id="co-${i}-${j}-m">−</span><span class="v" id="co-${i}-${j}">0</span><span class="pm" id="co-${i}-${j}-p">+</span></span>`).join('')}
            </div>`).join('')}
            <div id="co-alert"></div>`;
    }

    function desksBody() {
        const names = ['Léa', 'Noah', 'Emma', 'Louis', 'Chloé', 'Nathan', '', ''];
        return `<div class="pt-desks">${names.map((n, i) => `<div class="pt-desk" id="d-${i}">${n || '<span style="color:#D1D5DB">—</span>'}</div>`).join('')}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:8px"><span class="pt-b sm">${pcT('Annuler les avertissements')}</span></div>`;
    }

    function classesScene(tab, opts) {
        const o = opts || {};
        const t = (id, ico, label) => `<span class="pt-tab ${tab === id ? 'active' : ''}" id="ct-${id}" style="padding:7px 8px;font-size:11.5px"><i class="fas ${ico}"></i> ${label}</span>`;
        return nav('classes') + page(`
            <div class="pt-hcard" style="margin-bottom:10px">
                <div class="pt-h1"><i class="fas fa-users"></i> ${pcT('Gestion des classes')}</div>
                <div style="display:flex;align-items:center;gap:8px;font-size:12px"><span>${pcT('Classe')}</span><div class="pt-select" style="width:250px">🏫 ${C1.name} (${C1.subj}) <i class="fas fa-chevron-down" style="float:right;color:#9CA3AF"></i></div></div>
            </div>
            <div class="pt-tabs" style="background:#fff;border-radius:8px;padding:0 8px;margin-bottom:10px">
                ${t('students', 'fa-user-graduate', pcT('Élèves'))}${t('report', 'fa-file-alt', pcT('Rapport élève'))}${t('grades', 'fa-clipboard-check', pcT('Notes'))}${t('files', 'fa-folder-open', pcT('Fichiers'))}
                ${t('coches', 'fa-exclamation-triangle', pcT('Coches'))}${t('absences', 'fa-calendar-check', pcT('Absences'))}${t('seating', 'fa-th', pcT('Plan de classe'))}${t('groups', 'fa-users', pcT('Groupes'))}
                ${t('accomm', 'fa-universal-access', pcT('Aménagements'))}${t('announce', 'fa-bullhorn', pcT('Annonces'))}
            </div>
            <div class="pt-card" id="cl-body" style="height:calc(100% - 118px);overflow:hidden">${o.body || studentsBody(o.students)}</div>`);
    }

    function studentCard(n, i) {
        return `<div class="pt-stu" id="cl-r-${i}"><span class="pt-avatar">${ini(n)}</span><div><b>${n}</b><small>${pcT('Pas encore de compte élève')}</small></div><span class="ic"><i class="fas fa-edit"></i><i class="fas fa-trash"></i></span></div>`;
    }

    function studentsBody(list) {
        const cards = (list || []).map(studentCard).join('');
        return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="pt-sec-title" style="margin:0"><i class="fas fa-user-graduate"></i> ${pcT('Liste des élèves')}</div>
                <div style="display:flex;gap:6px">
                    <span class="pt-b purple sm" id="cl-code-e"><i class="fas fa-key"></i> ${pcT('Code élèves')}</span>
                    <span class="pt-b purple sm" id="cl-code-p"><i class="fas fa-users"></i> ${pcT('Code parents')}</span>
                    <span class="pt-b purple sm" id="cl-import"><i class="fas fa-file-import"></i> ${pcT('Importer (CSV/Excel)')}</span>
                    <span class="pt-b primary sm" id="cl-add"><i class="fas fa-plus"></i> ${pcT('Ajouter un élève')}</span>
                </div>
            </div>
            <div id="cl-form" style="display:none;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;padding:12px;margin-bottom:10px">
                <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:8px;align-items:end">
                    <div><label class="pt-label">${pcT('Prénom')} *</label><input class="pt-input" id="cl-fn"></div>
                    <div><label class="pt-label">${pcT('Nom')}</label><input class="pt-input" id="cl-ln"></div>
                    <div><label class="pt-label">${pcT("Email de l'élève (facultatif)")}</label><input class="pt-input" placeholder="prenom.nom@ecole.ch"></div>
                    <span class="pt-b primary" id="cl-save"><i class="fas fa-save"></i> ${pcT('Enregistrer')}</span>
                </div>
            </div>
            <div id="cl-paste" style="display:none;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:9px;padding:12px;margin-bottom:10px">
                <div class="pt-label"><i class="fas fa-file-import"></i> ${pcT('Importer des élèves — collez directement depuis Excel/Numbers (ou choisissez un fichier CSV)')}</div>
                <div class="pt-textarea" id="cl-paste-t" style="min-height:64px" data-ph="${pcT('Prénom')}\t${pcT('Nom')}…"></div>
                <div style="display:flex;justify-content:flex-end;margin-top:8px"><span class="pt-b primary" id="cl-import-go"><i class="fas fa-file-import"></i> ${pcT('Importer')}</span></div>
            </div>
            <div class="pt-stu-grid" id="cl-rows">${cards}</div>
            <div class="pt-empty" id="cl-empty" ${cards ? 'style="display:none"' : ''}>${pcT('Aucun élève pour le moment')}</div>`;
    }

    function gradesBody(withEval) {
        const names = STUDENTS.slice(0, 4);
        const notes = ['5.5', '4', '5', '4.5'];
        return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="pt-sec-title" style="margin:0"><i class="fas fa-clipboard-check"></i> ${pcT('Gestion des notes')}</div>
                <div style="display:flex;gap:6px"><span class="pt-b purple sm"><i class="fas fa-file-pdf"></i> ${pcT('Export PDF')}</span><span class="pt-b purple sm"><i class="fas fa-file-csv"></i> ${pcT('Export CSV')}</span></div>
            </div>
            <div class="pt-bigstats"><div class="pt-bigstat"><b>4</b>${pcT('Élèves')}</div><div class="pt-bigstat"><b>${withEval ? 1 : 0}</b>${pcT('Évaluations')}</div><div class="pt-bigstat"><b>${withEval ? '4.8' : '–'}</b>${pcT('Moyenne classe')}</div></div>
            <div class="pt-subj"><span><i class="fas fa-book"></i> ${C1.subj}</span><span class="pt-b primary sm" id="gr-new"><i class="fas fa-plus"></i> ${pcT('Nouvelle évaluation')}</span></div>
            ${withEval ? `<table class="pt-table"><thead><tr><th>${pcT('Élève')}</th><th>${TEST} <small style="font-weight:400">/6</small></th><th>${pcT('Moyenne')}</th></tr></thead>
            <tbody>${names.map((n, i) => `<tr><td>${n}</td><td><b>${notes[i]}</b></td><td><b>${notes[i]}</b></td></tr>`).join('')}</tbody></table>`
            : '<div class="pt-empty">' + pcT('Aucune évaluation pour le moment') + '</div>'}`;
    }

    function filesScene() {
        return nav('dash') + page(`
            <div class="pt-hcard" style="flex-wrap:wrap">
                <div class="pt-h1"><i class="fas fa-folder-open"></i> ${pcT('Gestionnaire de fichiers')}</div>
                <div style="display:flex;gap:8px"><span class="pt-b purple"><i class="fas fa-folder-plus"></i> ${pcT('Nouveau dossier')}</span><span class="pt-b success" id="fm-add"><i class="fas fa-upload"></i> ${pcT('Uploader fichiers')}</span><span class="pt-b dark" id="fm-import"><i class="fas fa-folder-open"></i> ${pcT('Uploader dossier')}</span><span class="pt-b danger-o"><i class="fas fa-trash"></i> ${pcT('Supprimer')}</span></div>
                <div class="pt-store" id="fm-store" style="flex-basis:100%;margin:6px 0 0;justify-content:flex-end"><div class="bar" style="max-width:220px"><div></div></div><span>${pcT('<b>{used}</b> / {total} utilisés ({pct})', { used: '1.2 GB', total: '50 GB', pct: '2.4 %' })}</span></div>
            </div>
            <div class="pt-fm" style="grid-template-columns:1fr 1fr;height:calc(100% - 120px)">
                <div class="pt-card" id="fm-explorer">
                    <div class="pt-drop" id="fm-drop"><i class="fas fa-cloud-upload-alt"></i>${pcT('Glissez vos fichiers ou dossiers ici')}</div>
                    <div class="pt-tree" id="fm-tree">
                        <div class="f d"><i class="fas fa-folder-open"></i> ${pcT('Mathématiques')}</div>
                        <div class="f d" style="padding-left:24px"><i class="fas fa-folder"></i> ${CH1} <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">${nFiles(4)}</span></div>
                        <div class="f d" style="padding-left:24px"><i class="fas fa-folder"></i> ${CH2} <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">${nFiles(3)}</span></div>
                        <div class="f d" id="fm-sci"><i class="fas fa-folder"></i> ${pcT('Sciences')} <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">${nFiles(12)}</span></div>
                    </div>
                </div>
                <div class="pt-card">
                    <div class="pt-classes-hdr"><i class="fas fa-chalkboard"></i> ${pcT('Mes classes')}</div>
                    <div class="pt-cls-row" id="fm-c1"><b>${C1.name}</b><span class="s">${C1.subj}</span><br><small id="fm-c1-n">${clsMeta(7, 6)}</small></div>
                    <div class="pt-cls-row" id="fm-c2"><b>${C2.name}</b><span class="s">${C2.subj}</span><br><small>${clsMeta(12, 18)}</small></div>
                    <div class="pt-cls-row" id="fm-c3"><b>${C3.name}</b><span class="s">${C3.subj}</span><br><small>${clsMeta(5, 20)}</small></div>
                    <div class="pt-hint"><i class="fas fa-hand-pointer"></i> ${pcT("Glissez un fichier ou un dossier sur une classe pour l'y copier.")}</div>
                </div>
            </div>`);
    }

    function pdfScene() {
        const tool = (id, ico, title, on) => `<span class="pt-tool ${on ? 'on' : ''}" id="t-${id}" title="${title}"><i class="fas ${ico}"></i></span>`;
        const lines = '<div class="l m"></div><div class="l"></div><div class="l s"></div><div style="height:14px"></div><div class="l"></div><div class="l m"></div><div class="l s"></div><div style="height:14px"></div><div class="l m"></div><div class="l"></div><div class="l s"></div>';
        const addPage = `<div style="text-align:center;font-size:9px;color:#6B7280;margin:-4px 0 8px"><i class="fas fa-plus"></i> ${pcT('Ajouter')}</div>`;
        return `<div class="pt-pdf">
            <div class="pt-pdf-tb">
                ${tool('pen', 'fa-pen', pcT('Stylo'), true)}${tool('hl', 'fa-highlighter', pcT('Surligneur'))}${tool('eraser', 'fa-eraser', pcT('Gomme'))}<span class="sep"></span>
                ${tool('ruler', 'fa-ruler', pcT('Règle'))}${tool('compass', 'fa-drafting-compass', pcT('Compas'))}${tool('angle', 'fa-angle-right', pcT('Angle'))}${tool('arc', 'fa-circle-notch', pcT('Arc'))}<span class="sep"></span>
                ${tool('arrow', 'fa-long-arrow-alt-right', pcT('Flèche'))}${tool('rect', 'fa-vector-square', pcT('Rectangle'))}${tool('disk', 'fa-circle', pcT('Disque'))}${tool('grid', 'fa-th', pcT('Grille'))}${tool('square', 'fa-square-root-alt', pcT('Équerre'))}${tool('text', 'fa-font', pcT('Texte'))}${tool('hider', 'fa-eye-slash', pcT('Masquer du texte'))}<span class="sep"></span>
                ${tool('rotate', 'fa-sync-alt', pcT('Tourner'))}${tool('print', 'fa-print', pcT('Imprimer'))}${tool('track', 'fa-users', pcT('Suivi des élèves'))}<span class="sep"></span>
                <span class="pt-color on" id="c-black" style="background:#000"></span><span class="pt-color" id="c-red" style="background:#EF4444"></span><span class="pt-color" style="background:#22C55E"></span><span class="pt-color" style="background:#3B82F6"></span><span class="sep"></span>
                <span style="margin-left:auto"></span>
                ${tool('undo', 'fa-undo', pcT('Annuler'))}${tool('redo', 'fa-redo', pcT('Rétablir'))}${tool('clear', 'fa-trash', pcT('Effacer la page'))}<span class="sep"></span>${tool('dl', 'fa-download', pcT('Télécharger / Envoyer'))}${tool('close', 'fa-times', pcT('Fermer'))}
            </div>
            <div class="pt-pdf-body">
                <div class="pt-thumbs"><div class="pt-thumb on"><i></i><i></i><i></i><i style="width:60%"></i></div>${addPage}<div class="pt-thumb"><i></i><i style="width:70%"></i><i></i></div>${addPage}<div class="pt-thumb"><i></i><i></i><i style="width:50%"></i></div></div>
                <div class="pt-pagewrap"><div class="pt-pdfpage" id="pdf-page">
                    <h4>${pcT('Chapitre 3 — Les fractions')}</h4>${lines}
                    <div id="pdf-extra"></div>
                    <svg class="ink" id="ink" viewBox="0 0 560 560"></svg>
                </div></div>
            </div>
        </div>`;
    }

    function phoneScene(inner) {
        return `<div class="pt-page" style="top:0;background:linear-gradient(135deg,#EEF2FF,#F3F4F6);display:flex;align-items:center;justify-content:center">${inner}</div>`;
    }

    // Active un onglet (Gestion de classe ou Suivi des élèves) et remplace le corps.
    const switchTab = (k, scope, id, bodySel, html) => k.click(id, (el) => {
        k.$$(scope + ' .pt-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        k.html(bodySel, html);
    });

    // ------------------------------------------------------------ chapitre 1
    async function chapPlanning(k) {
        await k.scene(calendarScene());
        await k.cap(pcT('Voici votre calendrier : votre horaire y est déjà. Chaque case est une période de cours.'), '#cal-week');
        await k.cap(pcT('Pour planifier un cours, cliquez sur sa période.'), '#c-0-2');
        await k.click('#c-0-2', () => k.modal(planningModalHtml()));

        await k.cap(pcT("Un document juste pour aujourd'hui ? Ajoutez un fichier éphémère."), '#m-eph');
        await k.click('#m-eph', () => {
            k.add('#m-att-list', attachedRow(F_CORR, true));
            k.html('#m-att-n', '1');
        });
        await k.cap(pcT('Il est supprimé tout seul le lendemain du cours : rien à ranger.'), '#m-att-list');

        await k.cap(pcT('Donnez un titre au cours.'), '#m-title');
        await k.type('#m-title', LESSON);

        await k.cap(pcT('Dans la description, une ligne qui commence par « - » devient une tâche à cocher.'), '#m-desc');
        await k.type('#m-desc', TASKS.map(t => '- ' + t).join('\n'), { checkbox: true });

        await k.cap(pcT('Ce bouton ouvre les documents de la classe : pratique pour voir où vous vous êtes arrêté.'), '#m-files');
        await k.click('#m-files', () => {
            k.$('#m-split').style.gridTemplateColumns = '1fr 300px';
            k.show('#m-pane');
        });
        await k.cap(pcT('Un clic sur le + et le document est joint au cours.'), '#m-f-ex .plus');
        await k.click('#m-f-ex .plus', () => {
            k.add('#m-att-list', attachedRow(F_EXO, false));
            k.html('#m-att-n', '2');
        });

        await k.cap(pcT('Enregistrez.'), '#m-save');
        await k.click('#m-save', () => {
            k.closeModal();
            k.html('#c-0-2', cblock(C1, LESSON, '<i class="far fa-check-square"></i> 3 · <i class="fas fa-paperclip"></i> 2'));
            k.toast(pcT('Planification enregistrée'));
        });
        await k.cap(pcT('La période affiche maintenant le titre, les tâches et les fichiers.'), '#c-0-2');

        await k.scene(lessonScene());
        await k.cap(pcT("La page « Prochain cours » affiche le cours en train d'être donné… ou le prochain."), '#l-head');
        await k.cap(pcT('Votre planification est là. Cochez les tâches au fur et à mesure.'), '#l-checks .pt-check');
        await k.click('#l-checks .pt-check', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; });

        await k.cap(pcT('Vous pouvez aussi planifier directement depuis cette page.'), '#l-edit');
        await k.click('#l-edit', () => {
            k.html('#l-plan-body', `<input class="pt-input" value="${LESSON}" style="margin-bottom:8px">
                <div class="pt-textarea" id="l-desc" style="min-height:110px">[x] ${TASKS[0]}\n[ ] ${TASKS[1]}\n[ ] ${TASKS[2]}</div>
                <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px"><span class="pt-b sm">${pcT('Annuler')}</span><span class="pt-b primary sm" id="l-save"><i class="fas fa-save"></i> ${pcT('Enregistrer')}</span></div>`);
        });
        await k.type('#l-desc', '\n- ' + REMINDER, { checkbox: true, append: true });
        await k.click('#l-save', () => {
            k.html('#l-plan-body', `<h3 style="margin:0 0 8px;font-size:15px">${LESSON}</h3>
                <div>${checkLine(TASKS[0], true)}${checkLine(TASKS[1])}${checkLine(TASKS[2])}${checkLine(REMINDER)}</div>`);
            k.toast(pcT('Planification enregistrée'));
        });
        await k.cap(pcT("C'est tout : votre premier cours est planifié."), '#l-plan');
    }

    // ------------------------------------------------------------ chapitre 2
    async function chapClasses(k) {
        await k.scene(classesScene('students'));
        await k.cap(pcT('Gestion de classe : choisissez la classe ici, puis un onglet.'), '.pt-hcard .pt-select');
        await k.cap(pcT('Commencez par ajouter vos élèves, un par un…'), '#cl-add');
        await k.click('#cl-add', () => k.show('#cl-form'));
        await k.type('#cl-fn', 'Léa');
        await k.type('#cl-ln', 'Martin');
        await k.click('#cl-save', () => {
            k.hide('#cl-form'); k.hide('#cl-empty');
            k.add('#cl-rows', studentCard('Léa Martin', 0));
            k.toast(pcT('Élève ajouté'));
        });

        await k.cap(pcT('…ou collez votre liste entière depuis Excel.'), '#cl-import');
        await k.click('#cl-import', () => k.show('#cl-paste'));
        await k.type('#cl-paste-t', 'Noah\tBernard\nEmma\tRochat\nLouis\tFavre', { ms: 30 });
        await k.click('#cl-import-go', () => {
            k.hide('#cl-paste');
            ['Noah Bernard', 'Emma Rochat', 'Louis Favre'].forEach((n, i) => k.add('#cl-rows', studentCard(n, i + 1)));
            k.toast(pcT('{n} élèves importés', { n: 3 }));
        });
        await k.cap(pcT('Chaque élève a sa carte. Le crayon modifie, la corbeille supprime.'), '#cl-r-1');

        await k.cap(pcT('Onglet Notes : créez une évaluation.'), '#ct-grades');
        await switchTab(k, '.pt-tabs', '#ct-grades', '#cl-body', gradesBody(false));
        await k.click('#gr-new', () => k.modal(`
            <div class="pt-modal-h"><h3><i class="fas fa-clipboard-check" style="color:#4F46E5"></i> ${pcT('Nouvelle évaluation')}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" id="gr-body">
                <div class="pt-fg"><label class="pt-label">${pcT('Titre')} *</label><input class="pt-input" id="gr-t"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                    <div class="pt-fg"><label class="pt-label">${pcT('Date')}</label><div class="pt-select">25.09.2026</div></div>
                    <div class="pt-fg"><label class="pt-label">${pcT('Note max.')}</label><div class="pt-select">6</div></div>
                    <div class="pt-fg"><label class="pt-label">${pcT('Type')}</label><div class="pt-select">${pcT('Test significatif')}</div></div>
                </div>
            </div>
            <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="gr-next">${pcT('Suivant : saisir les notes')} <i class="fas fa-arrow-right"></i></span></div>`));
        await k.type('#gr-t', TEST);
        await k.cap(pcT('Puis saisissez les notes, élève par élève.'), '#gr-next');
        await k.click('#gr-next', () => {
            k.html('#gr-body', `<div class="pt-label" style="margin-bottom:8px">${pcT('{title} · note sur {max}', { title: TEST, max: 6 })}</div>` +
                STUDENTS.slice(0, 4).map((n, i) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span class="pt-avatar">${ini(n)}</span><span style="flex:1;font-size:13px">${n}</span><input class="pt-input" id="gr-n-${i}" style="width:70px;text-align:center"></div>`).join(''));
            k.html('#gr-next', '<i class="fas fa-check"></i> ' + pcT("Créer l'évaluation"));
        });
        for (let i = 0; i < 4; i++) await k.type('#gr-n-' + i, ['5.5', '4', '5', '4.5'][i], { after: 200 });
        await k.click('#gr-next', () => { k.closeModal(); k.html('#cl-body', gradesBody(true)); k.toast(pcT('Évaluation créée')); });
        await k.cap(pcT('La moyenne se calcule toute seule.'), '.pt-bigstat:last-child');

        await k.cap(pcT("Absences : l'historique de chaque élève, retards compris."), '#ct-absences');
        await switchTab(k, '.pt-tabs', '#ct-absences', '#cl-body', `<div class="pt-sec-title"><i class="fas fa-calendar-check"></i> ${pcT('Absences et retards')}</div>
            <table class="pt-table"><thead><tr><th>${pcT('Élève')}</th><th>${pcT('Date')}</th><th>${pcT('Période')}</th><th>${pcT('Type')}</th><th>${pcT('Justifiée')}</th></tr></thead><tbody>
            <tr><td>Léa Martin</td><td>18.09</td><td>P2</td><td><span class="pt-chip" style="background:#FEF2F2;color:#991B1B">${pcT('Absence')}</span></td><td><i class="fas fa-check" style="color:#10B981"></i> ${pcT('par les parents')}</td></tr>
            <tr><td>Noah Bernard</td><td>15.09</td><td>P1</td><td><span class="pt-chip" style="background:#FFFBEB;color:#92400E">${pcT('Retard {n} min', { n: 5 })}</span></td><td>—</td></tr>
            </tbody></table>`);
        await k.cap(pcT('Plan de classe : placez vos élèves sur les tables.'), '#ct-seating');
        await switchTab(k, '.pt-tabs', '#ct-seating', '#cl-body', `<div class="pt-sec-title"><i class="fas fa-th"></i> ${pcT('Plan de classe')}</div>${desksBody()}`);
        await k.cap(pcT('Groupes, aménagements, annonces : chaque onglet a son rôle.'), '#ct-groups');
        await switchTab(k, '.pt-tabs', '#ct-groups', '#cl-body', `<div class="pt-sec-title"><i class="fas fa-users"></i> ${pcT('Groupes')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="pt-thr"><b>${pcT('Groupe {x}', { x: 'A' })}</b><div class="pt-hint">Léa, Noah, Emma</div></div><div class="pt-thr"><b>${pcT('Groupe {x}', { x: 'B' })}</b><div class="pt-hint">Louis, Chloé, Nathan</div></div></div>`);
        await switchTab(k, '.pt-tabs', '#ct-accomm', '#cl-body', `<div class="pt-sec-title"><i class="fas fa-universal-access"></i> ${pcT('Aménagements')}</div>
            <div class="pt-res"><i class="fas fa-universal-access t" style="color:#10B981"></i><div>Noah Bernard<div class="sub">${pcT('Temps supplémentaire · 1/3 temps aux tests')}</div></div></div>`);
        await k.cap(pcT('Rapport élève : tout sur un élève, sur une seule page.'), '#ct-report');
        await switchTab(k, '.pt-tabs', '#ct-report', '#cl-body', `<div class="pt-sec-title"><i class="fas fa-file-alt"></i> ${pcT('Rapport — {name}', { name: 'Léa Martin' })}</div>
            <div class="pt-stats"><div class="pt-stat g"><b>5.5</b>${pcT('Moyenne')}</div><div class="pt-stat r"><b>1</b>${pcT('Absence')}</div><div class="pt-stat o"><b>2</b>${pcT('Coches')}</div><div class="pt-stat" style="background:#EEF2FF"><b>1</b>${pcT('Remarque')}</div></div>
            <div class="pt-res"><i class="fas fa-comment-dots t" style="color:#4F46E5"></i><div>« ${REMARK} »<div class="sub">${pcT('Remarque du {d}', { d: '14.09' })}</div></div></div>
            <div style="display:flex;justify-content:flex-end;margin-top:10px"><span class="pt-b sm"><i class="fas fa-file-pdf"></i> ${pcT('Exporter en PDF')}</span></div>`);
        await k.cap(pcT('Exportable en PDF, par exemple pour un entretien avec les parents.'), '#cl-body .pt-b');
    }

    // ------------------------------------------------------------ chapitre 3
    async function chapLesson(k) {
        await k.scene(lessonScene({ current: true }));
        await k.cap(pcT('Pendant le cours, tout se passe ici : présences, coches, plan de classe.'), '#l-track');
        await k.cap(pcT("Présences : un clic sur un nom, l'élève est absent."), '#at-0 .n');
        await k.click('#at-0 .n', () => { k.$('#at-0').className = 'pt-att absent'; k.html('#st-p', '5'); k.html('#st-a', '1'); });

        await k.cap(pcT("Retard : tapez les minutes, puis cliquez sur l'horloge."), '#min-1');
        await k.type('#min-1', '5', { after: 200 });
        await k.click('#clk-1', () => { k.$('#at-1').className = 'pt-att late'; k.html('#st-p', '4'); k.html('#st-l', '1'); });

        await k.cap(pcT('Coches : oublis, bavardages… vous choisissez quoi compter.'), '#tr-coches');
        await switchTab(k, '#l-track', '#tr-coches', '#l-track-body', cochesBody([pcT('Oubli'), pcT('Bavardage')]));
        await k.click('#co-2-0-p', () => k.html('#co-2-0', '1'), { after: 400 });
        await k.click('#co-2-0-p', () => k.html('#co-2-0', '2'));

        await k.cap(pcT('Plan de classe : un clic sur une table = un avertissement.'), '#tr-seating');
        await switchTab(k, '#l-track', '#tr-seating', '#l-track-body', desksBody());
        await k.click('#d-3', (el) => el.classList.add('w1'), { after: 500 });
        await k.click('#d-3', (el) => { el.classList.remove('w1'); el.classList.add('w2'); });

        await switchTab(k, '#l-track', '#tr-pres', '#l-track-body', attendanceList());
        await k.cap(pcT('Une remarque sur un élève ? Cette icône, à côté de son nom.'), '#rm-2');
        await k.click('#rm-2', () => k.add('#l-track-body', `<div class="pt-qr" id="qr"><div class="h"><i class="fas fa-comment-dots"></i> ${pcT('Remarque — {name}', { name: 'Emma Rochat' })}</div>
            <div class="pt-textarea" id="qr-t" style="min-height:44px" data-ph="${pcT('Votre remarque…')}"></div>
            <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px"><span class="pt-b sm">${pcT('Annuler')}</span><span class="pt-b primary sm" id="qr-save">${pcT('Enregistrer')}</span></div></div>`, true));
        await k.type('#qr-t', REMARK);
        await k.click('#qr-save', () => { k.$('#qr').remove(); k.toast(pcT('Remarque enregistrée')); });

        await k.cap(pcT('À droite, les fichiers de la classe. Les épinglés restent toujours en haut.'), '#l-pinned');
        await k.cap(pcT('La punaise épingle un fichier.'), '#pin-2');
        await k.click('#pin-2', () => {
            k.$('#r-2').remove();
            k.add('#l-pinned-list', `<div class="pt-res"><i class="fas fa-file-pdf t" style="color:#DC2626"></i><div>${F_EXO}</div><i class="fas fa-thumbtack pin on"></i></div>`);
        });

        await k.cap(pcT("Un clic sur un PDF : il s'ouvre dans le lecteur."), '#r-1');
        await k.click('#r-1', () => {});
        await k.scene(pdfScene());
        await k.cap(pcT('Le lecteur a son propre chapitre, le n° 5.'), '#pdf-page');
    }

    // ------------------------------------------------------------ chapitre 4
    async function chapFiles(k) {
        await k.scene(filesScene());
        await k.cap(pcT('Le gestionnaire de fichiers. Le compte Premium vous offre 50 Go.'), '#fm-store');
        await k.cap(pcT("À gauche : vos documents, conservés d'une année à l'autre."), '#fm-tree');
        await k.cap(pcT('Importez un dossier entier depuis votre ordinateur.'), '#fm-import');
        await k.click('#fm-import', () => {
            k.add('#fm-tree', `<div class="f d sel" id="fm-f3" style="padding-left:24px"><i class="fas fa-folder-open"></i> ${CH3} <span style="margin-left:auto;color:#9CA3AF;font-weight:400;font-size:11px">${nFiles(3)}</span></div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> ${F_THEORY}</div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> ${F_EXO}</div>
                <div class="f file pt-appear" style="padding-left:46px"><i class="fas fa-file-pdf"></i> ${F_KEY}</div>`);
            const sci = k.$('#fm-sci');
            if (sci) k.$('#fm-tree').appendChild(sci);
            k.toast(pcT('{n} fichiers importés', { n: 3 }));
        });
        await k.cap(pcT('À droite, vos classes. Glissez le dossier sur une classe : elle reçoit sa copie.'), '#fm-f3');
        await k.drag('#fm-f3', '#fm-c1', '<i class="fas fa-folder" style="color:#F59E0B"></i> ' + CH3, () => {
            k.html('#fm-c1-n', '<b style="color:#10B981">+3</b> · ' + clsMeta(10, 6));
            k.toast(pcT('Dossier copié dans {name}', { name: C1.name }));
        });
        await k.cap(pcT('La classe a maintenant ses propres fichiers, indépendants des vôtres.'), '#fm-c1');

        await k.scene(classesScene('files', { body: `<div class="pt-sec-title"><i class="fas fa-folder-open"></i> ${pcT('Fichiers par discipline')}</div>
            <div class="pt-subj"><span><i class="fas fa-book"></i> ${C1.subj}</span><span style="display:flex;gap:6px"><span class="pt-b purple sm"><i class="fas fa-folder-plus"></i> ${pcT('Nouveau dossier')}</span><span class="pt-b success sm" id="cf-up"><i class="fas fa-upload"></i> ${pcT('Fichiers')}</span><span class="pt-b sm"><i class="fas fa-folder"></i> ${pcT('Dossier')}</span></span></div>
            <div class="pt-grid-files" id="cf-grid">
                <div class="pt-tile folder"><i class="fas fa-folder"></i>${CH1}<div class="pt-hint">${nFiles(4)}</div></div>
                <div class="pt-tile folder"><i class="fas fa-folder"></i>${CH2}<div class="pt-hint">${nFiles(3)}</div></div>
                <div class="pt-tile folder pt-appear"><i class="fas fa-folder"></i>${CH3}<div class="pt-hint">${nFiles(3)}</div></div>
            </div>` }));
        await k.cap(pcT('Vous pouvez aussi ajouter des fichiers depuis Gestion de classe, onglet Fichiers.'), '#cf-up');
        await k.click('#cf-up', () => k.add('#cf-grid', '<div class="pt-tile pdf"><i class="fas fa-file-pdf"></i>' + pcT('Fiche-révision.pdf') + '<div class="pt-hint">' + pcT('{n} Ko', { n: 240 }) + '</div></div>'));

        await k.scene(lessonScene());
        await k.cap(pcT('Et tout se retrouve sur la page du cours, prêt à ouvrir.'), '#l-res');
    }

    // ------------------------------------------------------------ chapitre 5
    async function chapPdf(k) {
        const svgNS = 'http://www.w3.org/2000/svg';
        async function ink(d, color, width, from, to) {
            const p = document.createElementNS(svgNS, 'path');
            p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color);
            p.setAttribute('stroke-width', width); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
            k.$('#ink').appendChild(p);
            const len = p.getTotalLength();
            p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.style.transition = 'stroke-dashoffset 1.2s linear';
            const pg = k.$('#pdf-page').getBoundingClientRect();
            const scr = k.$('#pdf-page').closest('.pt-screen').getBoundingClientRect();
            const sc = scr.width / 1100;
            const ox = (pg.left - scr.left) / sc, oy = (pg.top - scr.top) / sc;
            await k.moveXY(ox + from[0], oy + from[1], 600);
            requestAnimationFrame(() => { p.style.strokeDashoffset = 0; });
            await k.moveXY(ox + to[0], oy + to[1], 1200);
            await k.wait(400);
            return p;
        }
        const on = async (id) => k.click(id, (el) => { k.$$('.pt-tool').forEach(t => { if (!['t-undo', 't-redo', 't-clear', 't-dl', 't-close', 't-track', 't-rotate', 't-print'].includes(t.id)) t.classList.remove('on'); }); el.classList.add('on'); }, { after: 300 });

        await k.scene(pdfScene());
        await k.cap(pcT('Le lecteur PDF. Tous les outils sont dans cette barre.'), '#t-pen');
        await k.cap(pcT('Le stylo : annotez directement sur la page.'), '#t-pen');
        await on('#t-pen');
        await k.cap(pcT('Choisissez une couleur.'), '#c-red');
        await k.click('#c-red', (el) => { k.$('#c-black').classList.remove('on'); el.classList.add('on'); }, { after: 200 });
        await ink('M 70 140 C 110 100, 150 180, 200 130 S 280 110, 330 150', '#EF4444', 3, [70, 140], [330, 150]);
        await ink('M 400 128 l 18 20 l 34 -42', '#EF4444', 3.5, [400, 128], [452, 106]);

        await k.cap(pcT('Le surligneur.'), '#t-hl');
        await on('#t-hl');
        await k.click('#pdf-page', () => k.add('#pdf-extra', '<div class="hl" style="top:224px;width:0;transition:width 1s"></div>'), { after: 60 });
        requestAnimationFrame(() => { const h = k.$('#pdf-extra .hl'); if (h) h.style.width = '340px'; });
        await k.wait(1300);

        await k.cap(pcT("Règle, compas, équerre : des tracés précis, aimantés à l'outil."), '#t-ruler');
        await on('#t-ruler');
        k.add('#pdf-extra', '<div class="pt-ruler" style="top:330px;left:70px"></div>');
        await k.wait(700);
        await ink('M 90 328 L 430 328', '#111827', 2.5, [90, 328], [430, 328]);
        k.$('#pdf-extra .pt-ruler').remove();

        await k.cap(pcT('Masquez une réponse, révélez-la plus tard en classe.'), '#t-hider');
        await on('#t-hider');
        await k.click('#pdf-page', () => k.add('#pdf-extra', '<div class="mask" style="left:40px;top:410px;width:260px;height:16px"></div>'), { dy: 60 });

        await k.cap(pcT("Annuler, rétablir, effacer : rien n'est définitif."), '#t-undo');
        await k.click('#t-undo', () => { const m = k.$('#pdf-extra .mask'); if (m) m.remove(); });

        await k.cap(pcT('Le suivi des élèves, sans quitter le document.'), '#t-track');
        await k.click('#t-track', (el) => {
            el.classList.add('on');
            k.add('#pdf-page', `<div class="pt-track" id="trk"><h5><i class="fas fa-users" style="color:#4F46E5"></i> ${C1.name} — ${pcT('Oubli')} · ${pcT('Bavardage')}</h5>
                ${STUDENTS.slice(0, 4).map((n, i) => `<div class="pt-count" style="grid-template-columns:1fr 70px"><span>${n}</span><span class="c"><span class="pm">−</span><span class="v" id="tk-${i}">0</span><span class="pm" id="tk-${i}-p">+</span></span></div>`).join('')}
            </div>`);
        });
        await k.click('#tk-1-p', () => k.html('#tk-1', '1'));

        await k.cap(pcT('Téléchargez le PDF avec vos annotations et vos pages ajoutées.'), '#t-dl');
        await k.click('#t-dl', () => {
            const t = k.$('#trk'); if (t) t.remove();
            k.add('.pt-pdf', `<div class="pt-dl-menu"><div class="on"><i class="fas fa-file-download"></i> ${pcT('Télécharger le PDF annoté')}</div><div><i class="fas fa-paper-plane"></i> ${pcT('Envoyer à toute la classe')}</div><div><i class="fas fa-user-slash"></i> ${pcT('Envoyer aux absents')}</div><div><i class="fas fa-user-check"></i> ${pcT('Choisir les élèves')}</div></div>`);
        });
        await k.cap(pcT('Ou envoyez-le directement aux élèves, même seulement aux absents.'), '.pt-dl-menu .on');
    }

    // ------------------------------------------------------------ chapitre 6
    function sanctionsIndex(withCard) {
        return nav('dash') + page(`
            <div class="pt-hcard">
                <div><div class="pt-h1"><i class="fas fa-exclamation-triangle" style="color:#DC2626"></i> ${pcT('Gestion des sanctions')}</div><div class="sub">${pcT('Créez et gérez vos modèles de sanctions pour automatiser la gestion disciplinaire.')}</div></div>
                <span class="pt-b primary" id="sa-new"><i class="fas fa-plus"></i> ${pcT('Nouveau modèle')}</span>
            </div>
            <div class="pt-bigstats"><div class="pt-bigstat"><b>${withCard ? 1 : 0}</b>${pcT('Modèles créés')}</div><div class="pt-bigstat"><b>${withCard ? 1 : 0}</b>${pcT('Modèles actifs')}</div><div class="pt-bigstat"><b>0</b>${pcT('Imports en classes')}</div></div>
            <div class="pt-card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <div class="pt-sec-title" style="margin:0"><i class="fas fa-list"></i> ${pcT('Modèles de sanctions')}</div>
                    <span class="pt-b" id="sa-import" style="opacity:.45"><i class="fas fa-file-import"></i> ${pcT('Importer vers les classes')}</span>
                </div>
                <div id="sa-list">${withCard ? `<div class="pt-thr pt-appear" style="display:flex;align-items:center;gap:12px">
                    <span class="pt-check" id="sa-chk" style="padding:0"><span class="box"></span></span>
                    <div style="flex:1"><b>${FORGOT}</b><div class="pt-hint">${pcT('Seuil {n} : après <b>{c}</b> coches → {s}', { n: 1, c: 3, s: SANCTION })}</div></div>
                    <span style="color:#9CA3AF"><i class="fas fa-edit"></i> &nbsp; <i class="fas fa-trash"></i></span></div>` : '<div class="pt-empty">' + pcT('Aucun modèle de sanction') + '</div>'}</div>
            </div>`);
    }

    async function chapSanctions(k) {
        await k.scene(sanctionsIndex(false));
        await k.cap(pcT('Un modèle de sanction : un type de problème, des seuils, et ce qui se passe au seuil.'), '#sa-new');
        await k.click('#sa-new', () => {});
        await k.scene(nav('dash') + page(`
            <div class="pt-hcard"><div><div class="pt-h1"><i class="fas fa-plus-circle"></i> ${pcT('Créer un modèle de sanction')}</div><div class="sub">${pcT('Définissez un type de problème avec ses seuils et sanctions automatiques.')}</div></div></div>
            <div class="pt-card" style="margin-bottom:12px"><div class="pt-sec-title"><i class="fas fa-info-circle"></i> ${pcT('Informations générales')}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div class="pt-fg" style="margin:0"><label class="pt-label">${pcT('Nom du type de problème')} *</label><input class="pt-input" id="sa-name" placeholder="${pcT("ex: Oubli, Comportement, Pas d'agenda...")}"></div>
                    <div class="pt-fg" style="margin:0"><label class="pt-label">${pcT('Description (optionnel)')}</label><input class="pt-input" placeholder="${pcT('Description détaillée du type de problème...')}"></div>
                </div>
            </div>
            <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-layer-group"></i> ${pcT('Seuils et sanctions')}</div>
                <div class="pt-thr"><div class="row"><b>${pcT('Seuil {n}', { n: 1 })}</b></div>
                    <div class="row">${pcT('Déclencher après {input} coches', { input: '<input class="pt-input num" id="sa-thr" placeholder="3">' })}</div>
                    <div class="row"><span style="font-weight:600">${pcT('Options de sanctions :')}</span></div>
                    <div class="row"><input class="pt-input" id="sa-s1" placeholder="${pcT("ex: Copier pages 17-18 de l'aide-mémoire")}"><input class="pt-input num" placeholder="${pcT('Jours')}" style="width:60px"></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center"><span class="pt-b sm"><i class="fas fa-plus"></i> ${pcT('Ajouter un seuil')}</span><span style="display:flex;gap:8px"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="sa-save"><i class="fas fa-save"></i> ${pcT('Enregistrer')}</span></span></div>
            </div>`));
        await k.cap(pcT('Donnez un nom au type de problème.'), '#sa-name');
        await k.type('#sa-name', FORGOT);
        await k.cap(pcT('Après combien de coches ?'), '#sa-thr');
        await k.type('#sa-thr', '3', { after: 200 });
        await k.cap(pcT('Et quelle sanction, avec un délai en jours si vous voulez.'), '#sa-s1');
        await k.type('#sa-s1', SANCTION);
        await k.click('#sa-save', () => k.toast(pcT('Modèle enregistré')));
        await k.scene(sanctionsIndex(true));

        await k.cap(pcT('Cochez le modèle, puis importez-le dans les classes de votre choix.'), '#sa-chk');
        await k.click('#sa-chk', (el) => { el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.classList.add('done'); k.$('#sa-import').style.opacity = '1'; });
        await k.click('#sa-import', () => k.modal(`<div class="pt-modal-h"><h3>${pcT('Importer vers les classes')}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-label" style="margin-bottom:8px">${pcT('Sélectionnez les classes :')}</div>
                ${[C1, C2, C3].map((c, i) => `<div class="pt-check" id="sa-c${i + 1}"><span class="box"></span><span><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}</span></div>`).join('')}
            </div><div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="sa-go"><i class="fas fa-file-import"></i> ${pcT('Importer')}</span></div>`));
        await k.click('#sa-c1', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.querySelector('span:last-child').style.textDecoration = 'none'; });
        await k.click('#sa-go', () => { k.closeModal(); k.toast(pcT('Modèle importé dans {name}', { name: C1.name })); });

        await k.scene(lessonScene({ current: true }));
        await k.cap(pcT('En cours, onglet Coches : une colonne par type de problème.'), '#tr-coches');
        await switchTab(k, '#l-track', '#tr-coches', '#l-track-body', cochesBody([FORGOT]));
        await k.cap(pcT('Un + par oubli…'), '#co-0-0-p');
        for (let n = 1; n <= 3; n++) {
            await k.click('#co-0-0-p', () => {
                k.html('#co-0-0', String(n));
                if (n === 3) k.html('#co-alert', '<div class="pt-alert pt-appear"><i class="fas fa-bell"></i> ' + pcT('Seuil atteint pour {name} :', { name: 'Léa Martin' }) + ' <b>' + SANCTION + '</b></div>');
            }, { after: 450 });
        }
        await k.cap(pcT("…et au troisième, la sanction s'affiche toute seule."), '#co-alert');

        await k.scene(classesScene('coches', { body: `<div class="pt-sec-title"><i class="fas fa-exclamation-triangle"></i> ${pcT('Coches')} — ${C1.name}</div>
            <table class="pt-table"><thead><tr><th>${pcT('Élève')}</th><th>${FORGOT}</th><th>${pcT('Sanctions en cours')}</th></tr></thead><tbody>
            <tr><td>Léa Martin</td><td><b>3</b></td><td><span class="pt-chip" style="background:#FEF2F2;color:#991B1B">${pcT('Copier p. 17–18 · à rendre le {d}', { d: '28.09' })}</span></td></tr>
            <tr><td>Noah Bernard</td><td>1</td><td>—</td></tr><tr><td>Emma Rochat</td><td>0</td><td>—</td></tr><tr><td>Louis Favre</td><td>2</td><td>—</td></tr>
            </tbody></table>` }));
        await k.cap(pcT('Le récapitulatif par élève est dans Gestion de classe, onglet Coches.'), '#cl-body');
    }

    // ------------------------------------------------------------ chapitre 7
    function decoupageScene(detail) {
        return nav('dash') + page(`
            <div class="pt-hcard" style="margin-bottom:12px"><div class="pt-h1"><i class="fas fa-cut"></i> ${pcT('Création de découpage annuel')}</div><span class="pt-b sm"><i class="fas fa-arrow-left"></i> ${pcT('Retour au tableau de bord')}</span></div>
            <div style="display:grid;grid-template-columns:300px 1fr;gap:14px;height:calc(100% - 66px)">
                <div class="pt-card"><div class="pt-sec-title"><i class="fas fa-folder-open"></i> ${pcT('Mes découpages')}</div>
                    <div id="dc-list">${detail ? `<div class="pt-theme" style="border-color:#4F46E5;background:#EEF2FF"><span class="sw" style="background:#4F46E5"></span><b>${DECOUP}</b><span class="w">${pcT('Mathématiques')}</span></div>` : ''}</div>
                    <div class="pt-dashed" id="dc-new"><i class="fas fa-plus-circle"></i>${pcT('Nouveau découpage')}</div>
                </div>
                <div class="pt-card" id="dc-detail">${detail ? `
                    <div style="display:flex;justify-content:space-between;align-items:center"><div class="pt-sec-title" style="margin:0"><i class="fas fa-edit"></i> ${DECOUP} · ${pcT('Mathématiques')}</div><span class="pt-b sm" id="dc-assign"><i class="fas fa-link"></i> ${pcT('Assigner à une classe')}</span></div>
                    <div class="pt-hint" style="margin:8px 0 12px"><i class="fas fa-chart-bar"></i> ${pcT('Prévisualisation')}</div>
                    <div class="pt-seg" id="dc-seg"><div style="flex:1;background:#E5E7EB;color:#9CA3AF">${pcT('{n} semaines libres', { n: 38 })}</div></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="pt-sec-title" style="margin:0"><i class="fas fa-layer-group"></i> ${pcT('Thèmes')}</div><span class="pt-b primary sm" id="dc-addt"><i class="fas fa-plus"></i> ${pcT('Ajouter')}</span></div>
                    <div id="dc-themes"><div class="pt-empty" id="dc-empty">${pcT('Aucun thème. Cliquez sur « Ajouter » pour créer un thème.')}</div></div>` : '<div class="pt-empty">' + pcT('Sélectionnez ou créez un découpage') + '</div>'}</div>
            </div>`);
    }

    async function chapDecoupage(k) {
        await k.scene(decoupageScene(false));
        await k.cap(pcT('Le découpage : votre année découpée en thèmes, pour savoir toujours où vous en êtes.'), '#dc-new');
        await k.click('#dc-new', () => k.modal(`<div class="pt-modal-h"><h3>${pcT('Nouveau découpage')}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-fg"><label class="pt-label">${pcT('Nom du découpage')}</label><input class="pt-input" id="dc-name" placeholder="${pcT('Ex: Découpage Maths 2026')}"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Discipline')}</label><input class="pt-input" id="dc-sub" placeholder="${pcT('Ex: Mathématiques')}"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Mode de découpage')}</label><div style="display:flex;gap:8px"><div class="pt-select" style="border-color:#C7D2FE;background:#EEF2FF"><b>${pcT('Par thèmes')}</b><div class="pt-hint">${pcT('Des thèmes de N semaines')}</div></div><div class="pt-select"><b>${pcT('Par semaines')}</b><div class="pt-hint">${pcT('Semaine par semaine')}</div></div></div></div></div>
            <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="dc-create"><i class="fas fa-check"></i> ${pcT('Créer')}</span></div>`));
        await k.type('#dc-name', DECOUP);
        await k.type('#dc-sub', pcT('Mathématiques'));
        await k.click('#dc-create', () => k.closeModal());
        await k.scene(decoupageScene(true));

        const segs = [];
        const renderSeg = () => {
            const used = segs.reduce((a, s) => a + s.w, 0);
            k.html('#dc-seg', segs.map(s => `<div style="flex:${s.w};background:${s.c}">${s.n} · ${pcT('{n} sem.', { n: s.w })}</div>`).join('') + `<div style="flex:${38 - used};background:#E5E7EB;color:#9CA3AF">${pcT('{n} sem. libres', { n: 38 - used })}</div>`);
        };
        const addTheme = async (name, weeks, color, capText) => {
            if (capText) await k.cap(capText, '#dc-addt');
            await k.click('#dc-addt', () => k.modal(`<div class="pt-modal-h"><h3>${pcT('Ajouter un thème')}</h3><span class="x"><i class="fas fa-times"></i></span></div>
                <div class="pt-modal-b"><div class="pt-fg"><label class="pt-label">${pcT('Nom du thème')}</label><input class="pt-input" id="dc-tn" placeholder="${pcT('Ex: Les fractions')}"></div>
                <div class="pt-fg"><label class="pt-label">${pcT('Durée (en semaines)')}</label><input class="pt-input" id="dc-tw" style="width:90px"></div></div>
                <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="dc-tok"><i class="fas fa-plus"></i> ${pcT('Ajouter')}</span></div>`));
            await k.type('#dc-tn', name);
            await k.type('#dc-tw', String(weeks), { after: 200 });
            await k.click('#dc-tok', () => {
                k.closeModal();
                const e = k.$$('#dc-empty')[0]; if (e) e.remove();
                k.add('#dc-themes', `<div class="pt-theme"><span class="sw" style="background:${color}"></span>${name}<span class="w">${pcT('{n} semaines', { n: weeks })}</span></div>`);
                segs.push({ n: name, w: weeks, c: color }); renderSeg();
            });
        };
        await addTheme(pcT('Les fractions'), 4, '#4F46E5', pcT('Ajoutez un thème et sa durée en semaines.'));
        await addTheme(pcT('Géométrie plane'), 3, '#10B981');
        await addTheme(pcT('Calcul littéral'), 5, '#F59E0B');
        await k.cap(pcT("La barre montre l'année qui se remplit."), '#dc-seg');

        await k.cap(pcT('Puis assignez le découpage à une classe.'), '#dc-assign');
        await k.click('#dc-assign', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-link" style="color:#4F46E5"></i> ${pcT('Assigner « {name} » à une classe', { name: DECOUP })}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b">${[C1, C3, C2].map((c, i) => `<div class="pt-res"><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}<span class="pt-b primary sm" id="dc-a${i}" style="margin-left:auto">${pcT('Assigner')}</span></div>`).join('')}</div>
            <div class="pt-modal-f"><span class="pt-b primary" id="dc-done">${pcT('Terminé')}</span></div>`));
        await k.click('#dc-a0', (el) => { el.className = 'pt-b success sm'; el.innerHTML = '<i class="fas fa-check"></i> ' + pcT('Assigné'); el.style.marginLeft = 'auto'; });
        await k.click('#dc-done', () => { k.closeModal(); k.toast(pcT('Découpage assigné à {name}', { name: C1.name })); });

        const weeks = []; const n0 = 34;
        const T_FRAC = pcT('Fractions'), T_GEO = pcT('Géométrie'), T_CALC = pcT('Calcul litt.');
        const themeOf = w => (w >= 35 && w <= 38) ? [T_FRAC, '#4F46E5'] : (w >= 39 && w <= 41) ? [T_GEO, '#10B981'] : (w >= 43 && w <= 47) ? [T_CALC, '#F59E0B'] : null;
        for (let i = 0; i < 22; i++) { const w = n0 + i; weeks.push({ w, hol: w === 42 || w === 52 || w === 53, t: themeOf(w) }); }
        await k.scene(nav('cal') + page(`
            <div class="pt-cal-title"><span class="arr"><i class="fas fa-chevron-left"></i></span><h2>${pcT('Vue annuelle')} — ${C1.name} · ${C1.subj}</h2><span class="arr"><i class="fas fa-chevron-right"></i></span><span class="pt-b sm"><i class="fas fa-calendar-week"></i> ${pcT('Vue hebdo')}</span></div>
            <div class="pt-card"><div class="pt-annual" id="an-grid">${weeks.map(x => `<div class="pt-wk ${x.hol ? 'hol' : ''}">${wk(x.w)}${x.hol ? '<div style="font-size:8px;color:#9CA3AF">' + pcT('vacances') + '</div>' : ''}${x.t ? `<div class="rib" style="background:${x.t[1]}22;color:${x.t[1]};border-bottom:2px solid ${x.t[1]}">${x.t[0]}</div>` : ''}</div>`).join('')}</div>
            <div class="pt-hint" style="margin-top:10px"><i class="fas fa-info-circle"></i> ${pcT('Survolez un bandeau pour voir les objectifs du thème.')}</div></div>`));
        await k.cap(pcT('Les thèmes apparaissent sur la vue annuelle, semaine par semaine.'), '#an-grid');
    }

    // ------------------------------------------------------------ chapitre 8
    async function chapAccounts(k) {
        await k.scene(classesScene('students', { students: STUDENTS.slice(0, 4) }));
        await k.cap(pcT('Pour que vos élèves aient un compte, générez un code de classe.'), '#cl-code-e');
        await k.click('#cl-code-e', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-key" style="color:#4F46E5"></i> ${pcT('Code élèves')} — ${C1.name}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" style="text-align:center"><div class="pt-hint">${pcT('Communiquez ce code à vos élèves :')}</div><div class="pt-code">X6VRK6</div>
            <div class="pt-hint">${pcT('Avec ce code, chaque élève crée son compte et rejoint la classe.')}</div></div>
            <div class="pt-modal-f"><span class="pt-b"><i class="fas fa-copy"></i> ${pcT('Copier')}</span><span class="pt-b primary">${pcT('Fermer')}</span></div>`));
        await k.cap(pcT('Un seul code pour toute la classe.'), '.pt-code');

        await k.scene(phoneScene(`<div class="pt-phone"><h4>${pcT('Créer mon compte')}</h4><div class="sub">${pcT('Espace élève')} · ProfCalendar</div>
            <div class="pt-fg"><label class="pt-label">${pcT("Code d'accès")}</label><input class="pt-input" id="st-code" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.1em"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Email')}</label><input class="pt-input" id="st-mail" placeholder="prenom.nom@exemple.ch"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Mot de passe')}</label><input class="pt-input" id="st-pw" type="password"></div>
            <span class="pt-b primary" id="st-go" style="width:100%;justify-content:center"><i class="fas fa-user-plus"></i> ${pcT('Créer mon compte')}</span>
            <div id="st-ok"></div></div>`));
        await k.cap(pcT("Sur son téléphone, l'élève crée son compte avec ce code."), '#st-code');
        await k.type('#st-code', 'X6VRK6');
        await k.type('#st-mail', 'lea.martin@exemple.ch');
        await k.type('#st-pw', '••••••••', { ms: 70 });
        await k.click('#st-go', () => k.html('#st-ok', '<div class="pt-ok pt-appear" style="margin-top:12px"><i class="fas fa-check-circle"></i> ' + pcT('Compte lié à {cls} · {name}', { cls: C1.name, name: 'Léa Martin' }) + '</div>'));
        await k.cap(pcT('Le compte est lié à votre classe.'), '#st-ok');

        await k.scene(classesScene('students', { students: STUDENTS.slice(0, 4) }));
        await k.cap(pcT('Même principe pour les parents : un code par classe.'), '#cl-code-p');
        await k.click('#cl-code-p', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-users" style="color:#4F46E5"></i> ${pcT('Code parents')} — ${C1.name}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b" style="text-align:center"><div class="pt-hint">${pcT("Donnez ce code aux parents, avec votre nom d'utilisateur :")}</div><div class="pt-code">P4K2ZQ</div>
            <div class="pt-hint">${pcT("Nom d'utilisateur :")} <b>mme.favre</b></div></div>
            <div class="pt-modal-f"><span class="pt-b"><i class="fas fa-copy"></i> ${pcT('Copier')}</span><span class="pt-b primary">${pcT('Fermer')}</span></div>`));
        await k.cap(pcT("Les parents auront besoin du code et de votre nom d'utilisateur."), '.pt-code');

        await k.scene(phoneScene(`<div class="pt-phone"><h4>${pcT("Liaison avec l'enseignant")}</h4><div class="sub">${pcT('Espace parents')} · ProfCalendar</div>
            <div class="pt-fg"><label class="pt-label">${pcT("Nom d'utilisateur de l'enseignant")}</label><input class="pt-input" id="pa-name"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Code de classe')}</label><input class="pt-input" id="pa-code" style="text-transform:uppercase;letter-spacing:.1em"></div>
            <div class="pt-fg"><label class="pt-label">${pcT('Mon enfant')}</label><div class="pt-select">Léa Martin</div></div>
            <span class="pt-b primary" id="pa-go" style="width:100%;justify-content:center"><i class="fas fa-link"></i> ${pcT('Valider la liaison')}</span>
            <div id="pa-ok"></div></div>`));
        await k.cap(pcT('Le parent saisit votre nom et le code : le lien est fait.'), '#pa-name');
        await k.type('#pa-name', 'mme.favre');
        await k.type('#pa-code', 'P4K2ZQ');
        await k.click('#pa-go', () => k.html('#pa-ok', '<div class="pt-ok pt-appear" style="margin-top:12px"><i class="fas fa-check-circle"></i> ' + pcT('{name} est liée à votre compte', { name: 'Léa Martin' }) + '</div>'));

        await k.scene(phoneScene(`<div style="display:flex;gap:26px">
            <div class="pt-phone" style="width:300px;margin:0" id="ph-st"><h4>${pcT('Espace élève')}</h4><div class="sub">Léa Martin · 9VG2</div>
                <div class="pt-res"><i class="fas fa-gamepad t" style="color:#667eea"></i><div>${pcT('Exercices interactifs')}<div class="sub">${pcT('1 nouvelle mission')}</div></div></div>
                <div class="pt-res"><i class="fas fa-book t" style="color:#F59E0B"></i><div>${pcT('Devoirs')}<div class="sub">${pcT('p. 42 n° 1 à 5 · pour vendredi')}</div></div></div>
                <div class="pt-res"><i class="fas fa-folder-open t" style="color:#4F46E5"></i><div>${pcT('Fichiers partagés')}<div class="sub">${F_MEMO}</div></div></div>
                <div class="pt-res"><i class="fas fa-chart-line t" style="color:#10B981"></i><div>${pcT('Mes notes')}<div class="sub">${pcT('{title} : {grade}', { title: TEST, grade: '5.5' })}</div></div></div></div>
            <div class="pt-phone" style="width:300px;margin:0" id="ph-pa"><h4>${pcT('Espace parents')}</h4><div class="sub">Léa Martin · 9VG2</div>
                <div class="pt-res"><i class="fas fa-calendar-check t" style="color:#EF4444"></i><div>${pcT('Absences')}<div class="sub">18.09 · P2 — <b style="color:#4F46E5">${pcT('justifier')}</b></div></div></div>
                <div class="pt-res"><i class="fas fa-chart-line t" style="color:#10B981"></i><div>${pcT('Notes')}<div class="sub">${pcT('Moyenne : {n}', { n: '5.5' })}</div></div></div>
                <div class="pt-res"><i class="fas fa-bullhorn t" style="color:#F59E0B"></i><div>${pcT('Annonces')}<div class="sub">${pcT('Sortie du 3 octobre')}</div></div></div></div>
        </div>`));
        await k.cap(pcT("L'élève voit ses exercices, ses devoirs, les fichiers partagés et ses notes."), '#ph-st');
        await k.cap(pcT('Les parents : absences à justifier, notes et annonces.'), '#ph-pa');
    }

    // ------------------------------------------------------------ chapitre 9
    async function chapExercise(k) {
        await k.scene(nav('dash') + page(`
            <div class="pt-hcard">
                <div class="pt-h1"><i class="fas fa-puzzle-piece"></i> ${pcT("Gestionnaire d'Exercices")}</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-folder-plus"></i> ${pcT('Nouveau dossier')}</span><span class="pt-b primary" id="ex-new"><i class="fas fa-plus"></i> ${pcT('Nouvel exercice')}</span></div>
            </div>
            <div class="pt-card"><div class="pt-grid-files">
                <div class="pt-tile folder"><i class="fas fa-folder"></i>${pcT('Nombres relatifs')}<div class="pt-hint">${pcT('{n} exercices', { n: 2 })}</div></div>
                <div class="pt-tile" style="border-left:3px solid #667eea"><i class="fas fa-gamepad" style="color:#667eea"></i>${pcT('Relatifs – addition')}<div class="pt-hint">${pcT('{xp} XP · {n} questions', { xp: 120, n: 6 })}</div></div>
            </div></div>`));
        await k.cap(pcT('Les exercices interactifs : vos élèves y répondent sur leur téléphone ou tablette.'), '#ex-new');
        await k.click('#ex-new', () => {});
        await k.scene(nav('dash') + page(`
            <div class="pt-hcard">
                <div class="pt-h1"><i class="fas fa-flask"></i> ${pcT("L'Atelier d'Exercices")}</div>
                <div style="display:flex;gap:6px"><span class="pt-b"><i class="fas fa-arrow-left"></i> ${pcT('Retour')}</span><span class="pt-b"><i class="fas fa-file"></i> ${pcT('Brouillon')}</span><span class="pt-b primary"><i class="fas fa-save"></i> ${pcT('Sauvegarder')}</span><span class="pt-b success" id="ex-pub"><i class="fas fa-paper-plane"></i> ${pcT('Publier')}</span></div>
            </div>
            <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;height:calc(100% - 78px)">
                <div class="pt-panel"><div class="pt-panel-h purple"><i class="fas fa-cog"></i> ${pcT('Paramètres')}</div><div class="pt-panel-b">
                    <div class="pt-fg"><label class="pt-label">${pcT('Titre')} *</label><input class="pt-input" id="ex-title" placeholder="${pcT("Titre de l'exercice")}"></div>
                    <div class="pt-fg"><label class="pt-label">${pcT('Description')}</label><input class="pt-input" placeholder="${pcT('Description...')}"></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="pt-fg"><label class="pt-label">${pcT('Matière')}</label><div class="pt-select">${pcT('Maths')}</div></div><div class="pt-fg"><label class="pt-label">${pcT('Niveau')}</label><div class="pt-select">${pcT('9e')}</div></div></div>
                    <div class="pt-hint"><i class="far fa-square"></i> ${pcT("Tolérer les fautes d'orthographe")}</div>
                </div></div>
                <div class="pt-panel"><div class="pt-panel-h green"><i class="fas fa-puzzle-piece"></i> ${pcT("Construction de l'exercice")}</div><div class="pt-panel-b">
                    <div class="pt-tools">
                        <div class="pt-tool-tile" id="ex-qcm"><i class="fas fa-list-check"></i>${pcT('QCM')}</div><div class="pt-tool-tile"><i class="fas fa-pen"></i>${pcT('Réponse courte')}</div><div class="pt-tool-tile"><i class="fas fa-paragraph"></i>${pcT('Texte à trous')}</div>
                        <div class="pt-tool-tile"><i class="fas fa-sort"></i>${pcT('Classement')}</div><div class="pt-tool-tile"><i class="fas fa-arrows-alt-h"></i>${pcT('Associations')}</div><div class="pt-tool-tile"><i class="fas fa-image"></i>${pcT('Image interactive')}</div>
                    </div>
                    <div id="ex-blocks"><div class="pt-empty" id="ex-empty"><i class="fas fa-puzzle-piece" style="font-size:26px;color:#D1D5DB;display:block;margin-bottom:6px"></i>${pcT('Ajoutez un premier bloc avec les boutons ci-dessus')}</div></div>
                </div></div>
            </div>`));
        await k.cap(pcT("Donnez un titre à l'exercice."), '#ex-title');
        await k.type('#ex-title', QCM_TITLE);
        await k.cap(pcT('Ajoutez un bloc : QCM, réponse courte, texte à trous, classement…'), '#ex-qcm');
        await k.click('#ex-qcm', () => {
            k.$('#ex-empty').remove();
            k.add('#ex-blocks', `<div class="pt-block"><span class="bt">${pcT('QCM')}</span><span style="float:right;color:#9CA3AF;font-size:11px"><i class="far fa-clock"></i> 30 s · <b>20 XP</b></span>
                <div class="pt-fg"><input class="pt-input" id="ex-q" placeholder="${pcT('Question…')}"></div>
                ${[0, 1, 2].map(i => `<div class="pt-opt"><span class="rb" id="ex-r${i}"></span><input class="pt-input" id="ex-o${i}" placeholder="${pcT('Option {n}', { n: i + 1 })}"></div>`).join('')}
                <span class="pt-b sm"><i class="fas fa-plus"></i> ${pcT('Option')}</span></div>`);
        });
        await k.type('#ex-q', pcT('Quelle fraction est égale à 1/2 ?'));
        await k.type('#ex-o0', '2/4', { after: 200 });
        await k.type('#ex-o1', '3/5', { after: 200 });
        await k.type('#ex-o2', '1/3', { after: 200 });
        await k.cap(pcT('Cochez la bonne réponse.'), '#ex-r0');
        await k.click('#ex-r0', (el) => el.classList.add('on'));

        await k.cap(pcT('Publiez-le dans une classe.'), '#ex-pub');
        await k.click('#ex-pub', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-paper-plane" style="color:#10B981"></i> ${pcT("Publier l'exercice")}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-hint" style="margin-bottom:8px">${pcT('Sélectionnez les classes pour lesquelles publier cet exercice :')}</div>
            ${[C1, C3, C2].map((c, i) => `<div class="pt-check" id="ex-c${i}"><span class="box"></span><span><span class="pt-chip" style="background:${c.bg};color:${c.color}">${c.name}</span> ${c.subj}</span></div>`).join('')}</div>
            <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b success" id="ex-go"><i class="fas fa-paper-plane"></i> ${pcT('Publier')}</span></div>`));
        await k.click('#ex-c0', (el) => { el.classList.add('done'); el.querySelector('.box').innerHTML = '<i class="fas fa-check"></i>'; el.querySelector('span:last-child').style.textDecoration = 'none'; });
        await k.click('#ex-go', () => { k.closeModal(); k.toast(pcT('Exercice publié dans {name}', { name: C1.name })); });

        await k.scene(lessonScene({ current: true, exercise: true }));
        await k.cap(pcT("Sur la page du cours, l'exercice est dans les ressources. Lancez-le en direct."), '#r-launch');
        await k.click('#r-launch', () => k.modal(`<div class="pt-modal-h"><h3><i class="fas fa-rocket" style="color:#667eea"></i> ${pcT("Lancer l'exercice")}</h3><span class="x"><i class="fas fa-times"></i></span></div>
            <div class="pt-modal-b"><div class="pt-select" style="border-color:#4F46E5;background:#EEF2FF;margin-bottom:8px"><b>📖 ${pcT('Mode classique')}</b><div class="pt-hint">${pcT('Chaque élève avance à son rythme, vous suivez la progression en direct.')}</div></div></div>
            <div class="pt-modal-f"><span class="pt-b">${pcT('Annuler')}</span><span class="pt-b primary" id="ex-start"><i class="fas fa-play"></i> ${pcT('Lancer la mission')}</span></div>`));
        await k.click('#ex-start', () => {
            k.closeModal();
            k.html('#r-ex .sub', '<span class="pt-chip" style="background:#EEF2FF;color:#4F46E5">📖 ' + pcT('Classique · en cours') + '</span>');
            k.$('#r-launch').remove();
            k.add('#l-plan-body', `<div style="margin-top:12px;padding-top:12px;border-top:1.5px solid #E5E7EB" id="ex-live">
                <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-satellite-dish" style="color:#10B981"></i> ${pcT('Suivi en direct')} — ${QCM_TITLE}</div>
                ${STUDENTS.slice(0, 4).map((n, i) => `<div class="pt-live"><span class="pt-avatar">${ini(n)}</span><span style="width:96px">${n.split(' ')[0]}</span><div class="bar"><div id="lv-${i}"></div></div><b id="lvx-${i}" style="width:44px;text-align:right;color:#10B981">0 XP</b></div>`).join('')}
            </div>`);
        });
        await k.cap(pcT('Vous suivez la progression de chaque élève en temps réel.'), '#ex-live');
        const prog = [[100, '60 XP'], [66, '40 XP'], [33, '20 XP'], [100, '40 XP']];
        for (let round = 1; round <= 3; round++) {
            prog.forEach((p, i) => { k.$('#lv-' + i).style.width = Math.min(p[0], round * 34) + '%'; });
            await k.wait(1100);
        }
        prog.forEach((p, i) => { k.html('#lvx-' + i, p[1]); });
        await k.wait(1200);
    }

    // ------------------------------------------------------------ registre
    window.pcTutorialChapters = [
        { id: 'planning', title: pcT('Ma première planification'), desc: pcT('Calendrier, fichier éphémère, tâches à cocher, page du cours.'), icon: 'fa-calendar-plus', color: '#4F46E5', seconds: 105, reco: true, steps: 15, run: chapPlanning },
        { id: 'classes', title: pcT('Gérer ma classe'), desc: pcT('Élèves, notes, absences, plan de classe, rapport élève.'), icon: 'fa-users', color: '#10B981', seconds: 100, steps: 12, run: chapClasses },
        { id: 'lesson', title: pcT('La page du cours'), desc: pcT('Présences, coches, plan de classe, remarques, fichiers épinglés.'), icon: 'fa-graduation-cap', color: '#F59E0B', seconds: 80, steps: 11, run: chapLesson },
        { id: 'files', title: pcT('Le gestionnaire de fichiers'), desc: pcT("Vos documents, d'une année à l'autre, à copier dans vos classes."), icon: 'fa-folder-open', color: '#0EA5E9', seconds: 50, steps: 7, run: chapFiles },
        { id: 'pdf', title: pcT('Le lecteur PDF'), desc: pcT('Stylo, surligneur, règle, masque, suivi des élèves, export annoté.'), icon: 'fa-file-pdf', color: '#DC2626', seconds: 70, steps: 10, run: chapPdf },
        { id: 'sanctions', title: pcT('Les coches et sanctions'), desc: pcT("Un modèle, des seuils, et la sanction qui s'affiche en cours."), icon: 'fa-exclamation-triangle', color: '#EA580C', seconds: 75, steps: 9, run: chapSanctions },
        { id: 'decoupage', title: pcT("Le découpage de l'année"), desc: pcT('Des thèmes, une durée, une classe : la vue annuelle se remplit.'), icon: 'fa-layer-group', color: '#7C3AED', seconds: 70, steps: 6, run: chapDecoupage },
        { id: 'accounts', title: pcT('Comptes élèves et parents'), desc: pcT('Un code par classe pour lier les élèves et leurs parents.'), icon: 'fa-user-friends', color: '#0D9488', seconds: 70, steps: 9, run: chapAccounts },
        { id: 'exercise', title: pcT('Un exercice interactif'), desc: pcT('Créer un QCM, le publier, le lancer en direct en classe.'), icon: 'fa-gamepad', color: '#667eea', seconds: 70, steps: 8, run: chapExercise }
    ];
    // Les chapitres de l'espace élèves et parents n'apparaissent que si le
    // module est activé dans Paramètres (window.PC_STUDENTS_SPACE, base.html).
    if (!window.PC_STUDENTS_SPACE) {
        window.pcTutorialChapters = window.pcTutorialChapters.filter(c => c.id !== 'accounts' && c.id !== 'exercise');
    }
    // Exercices interactifs masqués partout (window.PC_EXERCISES).
    if (!window.PC_EXERCISES) {
        window.pcTutorialChapters = window.pcTutorialChapters.filter(c => c.id !== 'exercise');
    }
})();
