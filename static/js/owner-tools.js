/* Outils personnels du calendrier (comptes de utils/owner_features.py) :
   - panneau « Thème et exercices » dans la fenêtre de planification ;
   - « Cours non donné : décaler » (un cours, ou toute une journée) ;
   - fiche d'objectifs en PDF, jointe au cours.
   Le fichier n'est chargé que pour ces comptes ; les routes /perso répondent 404 aux autres. */
(function () {
    'use strict';

    var modal = document.getElementById('planningModal');
    var panel = document.getElementById('otThemePanel');
    var shiftBtn = document.getElementById('otShiftBtn');
    var dialog = document.getElementById('otShiftDialog');
    if (!modal || !panel) return;

    var state = { data: null, selected: new Set(), token: 0 };

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function classroomId() {
        var select = document.getElementById('modalClassroom');
        var match = ((select && select.value) || '').match(/^classroom_(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
    }
    function slot() {
        var ctx = window.currentPlanningContext;
        if (ctx && ctx.date) return { date: ctx.date, period: parseInt(ctx.periodNumber, 10) };
        // Fenêtre ouverte par la cellule elle-même (sans contexte de période).
        try {
            /* global currentPlanningCell */
            if (typeof currentPlanningCell !== 'undefined' && currentPlanningCell && currentPlanningCell.dataset.date) {
                return { date: currentPlanningCell.dataset.date, period: parseInt(currentPlanningCell.dataset.period, 10) };
            }
        } catch (e) { /* variable absente : pas de créneau connu */ }
        return null;
    }
    function shortDate(iso) {
        var d = new Date(iso + 'T12:00:00');
        return ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][d.getDay()] + ' ' +
            String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
    }
    function post(url, body) {
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body || {}) })
            .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); });
    }

    // ------------------------------------------------------------ panneau thème et exercices

    function load(themeId) {
        var cid = classroomId(), s = slot();
        if (shiftBtn) shiftBtn.hidden = true;
        if (!cid || !s || window.planningType === 'tache') { panel.hidden = true; state.data = null; return; }
        var token = ++state.token;
        var query = new URLSearchParams({ date: s.date, period: s.period });
        if (themeId) query.set('theme_id', themeId);
        fetch('/perso/api/class/' + cid + '/themes?' + query.toString(), { headers: { 'Accept': 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (token !== state.token) return;          // une autre fenêtre a été ouverte entre-temps
                if (!data || !data.success) { panel.hidden = true; return; }
                if (shiftBtn) shiftBtn.hidden = !data.slot_planned;
                state.data = data;
                state.selected.clear();
                render();
            })
            .catch(function () { panel.hidden = true; });
    }

    var STATUS_TEXT = { todo: 'Pas encore donné', scheduled: 'Prévu', given: 'Donné, à corriger', planned: 'Correction prévue', done: 'Corrigé' };

    function chipTitle(e) {
        var parts = [STATUS_TEXT[e.status] || ''];
        if (e.given_on) parts.push('donné le ' + shortDate(e.given_on));
        if (e.corrected_on) parts.push('corrigé le ' + shortDate(e.corrected_on));
        if (e.planned_on && e.status !== 'done') parts.push('correction prévue le ' + shortDate(e.planned_on));
        if (e.scheduled_on && e.status === 'scheduled') parts.push('prévu le ' + shortDate(e.scheduled_on));
        if (e.manual) parts.push('marqué à la main');
        return parts.filter(Boolean).join(' · ');
    }

    function chip(e, label) {
        return '<button type="button" class="ot-chip ' + esc(e.status) + (state.selected.has(e.code) ? ' sel' : '') +
            '" data-code="' + esc(e.code) + '" title="' + esc(chipTitle(e)) + '" aria-pressed="' + (state.selected.has(e.code) ? 'true' : 'false') + '">' +
            esc(label || e.code) + '</button>';
    }

    function render() {
        var d = state.data;
        panel.hidden = false;
        if (!d.themes.length || !d.selected) {
            panel.innerHTML = '<div class="ot-head"><h4><i class="fas fa-layer-group"></i> Thème et exercices</h4>' +
                '<a href="/perso/themes">Gérer mes thèmes</a></div>' +
                '<div class="ot-empty">Aucun thème pour ' + esc(d.classroom.subject || 'cette matière') +
                '. Ajoutez-en un depuis « Gérer mes thèmes » pour suivre ses notions et ses exercices ici.</div>';
            return;
        }
        var sel = d.selected, c = sel.counts;
        var byCode = {};
        sel.exercises.forEach(function (e) { byCode[e.code] = e; });
        var used = new Set();

        var html = '<div class="ot-head"><h4><i class="fas fa-layer-group"></i> Thème et exercices</h4>' +
            '<select id="otThemeSelect" aria-label="Thème">' + d.themes.map(function (t) {
                return '<option value="' + t.id + '"' + (t.id === sel.theme.id ? ' selected' : '') + '>' + esc(t.label) + '</option>';
            }).join('') + '</select>' +
            '<label class="ot-check" title="Thème proposé d\'office pour cette classe quand le cours n\'a pas de titre">' +
            '<input type="checkbox" id="otCurrent"' + (sel.is_current ? ' checked' : '') + '> en cours</label>' +
            '<a href="/perso/themes">Gérer</a></div>';

        html += '<div class="ot-summary"><span><strong>' + c.done + '</strong> / ' + c.total + ' corrigés</span>' +
            '<span><strong>' + c.given + '</strong> à corriger</span>' +
            (c.planned ? '<span><strong>' + c.planned + '</strong> correction prévue</span>' : '') +
            '<span><strong>' + c.notions_seen + '</strong> / ' + c.notions_total + ' notions vues</span>' +
            '<span class="ot-legend"><span><i class="ot-dot"></i>à donner</span><span><i class="ot-dot given"></i>à corriger</span>' +
            '<span><i class="ot-dot planned"></i>correction prévue</span><span><i class="ot-dot done"></i>corrigé</span></span></div>';

        html += '<div class="ot-body">';
        sel.notions.forEach(function (n) {
            var chips = n.codes.map(function (code, i) {
                used.add(code);
                return byCode[code] ? chip(byCode[code], n.exercises[i]) : '';
            }).join('');
            var when = n.status === 'seen' ? (n.seen_on ? 'vue le ' + shortDate(n.seen_on) : 'vue')
                : n.status === 'planned' ? 'prévue le ' + shortDate(n.planned_on) : '';
            html += '<div class="ot-notion"><input type="checkbox" data-notion="' + n.n + '"' + (n.status === 'seen' ? ' checked' : '') +
                ' aria-label="Notion ' + n.n + ' vue en classe" title="Notion vue en classe">' +
                '<div class="ot-notion-title" data-add-notion="' + n.n + '" title="Cliquer pour l\'ajouter à la description du cours">' +
                '<b>' + n.n + '.</b> ' + esc(n.title) + (when ? ' <small>· ' + esc(when) + '</small>' : '') + '</div>' +
                (chips ? '<div class="ot-chips">' + chips + '</div>' : '') + '</div>';
        });
        var rest = sel.exercises.filter(function (e) { return !used.has(e.code); });
        if (rest.length) {
            html += '<div class="ot-notion"><span></span><div class="ot-notion-title" style="cursor:default"><b>Autres exercices</b></div>' +
                '<div class="ot-chips">' + rest.map(function (e) { return chip(e); }).join('') + '</div></div>';
        }
        html += '</div>';

        html += '<div class="ot-actions">' +
            '<span class="ot-label" id="otSelCount">Aucun exercice sélectionné</span>' +
            '<button type="button" class="ot-btn" data-pick="given">À corriger (' + c.given + ')</button>' +
            '<button type="button" class="ot-btn" data-pick="next">5 suivants</button>' +
            '<button type="button" class="ot-btn" data-pick="none">Aucun</button>' +
            '<span class="ot-sep"></span>' +
            '<span class="ot-label">Ajouter au cours :</span>' +
            '<button type="button" class="ot-btn primary" data-insert="work" disabled>À faire en classe</button>' +
            '<button type="button" class="ot-btn primary" data-insert="correction" disabled>Correction</button>' +
            '<button type="button" class="ot-btn" data-insert="homework" disabled>Devoir</button>' +
            '<span class="ot-label" style="margin-left:.5rem">Marquer :</span>' +
            '<button type="button" class="ot-btn good" data-mark="done" disabled><i class="fas fa-check"></i> corrigé</button>' +
            '<button type="button" class="ot-btn" data-mark="todo" disabled>pas corrigé</button>' +
            '<span class="ot-sep"></span>' +
            '<span class="ot-label">Fiche d\'objectifs :</span>' +
            '<button type="button" class="ot-btn" id="otPdfBtn"><i class="fas fa-file-pdf"></i> Créer et joindre au cours</button>' +
            '<label class="ot-check"><input type="checkbox" id="otPdfUpcoming"> avec les notions à venir</label>' +
            '<label class="ot-check"><input type="checkbox" id="otPdfExercises" checked> avec les exercices</label>' +
            '</div>' +
            '<div class="ot-note" id="otNote">La fiche reprend les notions cochées « vues ». Le suivi se lit dans vos planifications : « Correction : NO107 » vaut corrigé une fois le cours passé.</div>';
        panel.innerHTML = html;
        syncSelection();
    }

    function syncSelection() {
        var n = state.selected.size;
        var label = panel.querySelector('#otSelCount');
        if (label) label.textContent = n ? n + (n > 1 ? ' exercices sélectionnés' : ' exercice sélectionné') : 'Aucun exercice sélectionné';
        panel.querySelectorAll('[data-insert], [data-mark]').forEach(function (b) { b.disabled = !n; });
        panel.querySelectorAll('.ot-chip').forEach(function (b) {
            var on = state.selected.has(b.dataset.code);
            b.classList.toggle('sel', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function note(text) {
        var el = panel.querySelector('#otNote');
        if (el) el.textContent = text;
    }

    function selectedInOrder() {
        return state.data.selected.exercises.filter(function (e) { return state.selected.has(e.code); })
            .map(function (e) { return e.code; });
    }

    function appendLine(text, mergePrefix) {
        var area = document.getElementById('modalDescription');
        if (!area) return;
        var value = area.value.replace(/\s+$/, '');
        var lines = value ? value.split('\n') : [];
        // Deux notions ajoutées de suite tiennent sur la même ligne « Théorie : … ; … ».
        if (mergePrefix && lines.length && lines[lines.length - 1].indexOf(mergePrefix) === 0) {
            lines[lines.length - 1] += ' ; ' + text.slice(mergePrefix.length);
        } else {
            lines.push(text);
        }
        area.value = lines.join('\n');
        area.dispatchEvent(new Event('input', { bubbles: true }));
        area.scrollTop = area.scrollHeight;
        fillTitle();
    }

    function fillTitle() {
        var input = document.getElementById('modalPlanningTitle');
        var theme = state.data && state.data.selected && state.data.selected.theme;
        if (!input || input.value.trim() || !theme) return;
        var title = theme.title ? theme.title.charAt(0).toLowerCase() + theme.title.slice(1) : '';
        input.value = (theme.code + ' ' + title).trim();
    }

    function saveMarks(body) {
        var d = state.data;
        return post('/perso/api/class/' + d.classroom.id + '/theme/' + d.selected.theme.id + '/marks', body).then(function (data) {
            if (data && data.success) {
                var keep = new Set(state.selected);
                state.data = data;
                state.selected = keep;
                render();
            }
            return data;
        });
    }

    function seenNotions() {
        return state.data.selected.notions.filter(function (n) { return n.status === 'seen'; }).map(function (n) { return n.n; });
    }

    function createSheet(button) {
        var d = state.data, s = slot();
        if (!d || !s) return;
        var seen = seenNotions();
        var upcoming = panel.querySelector('#otPdfUpcoming').checked
            ? d.selected.notions.filter(function (n) { return n.status !== 'seen'; }).map(function (n) { return n.n; }) : [];
        if (!seen.length && !upcoming.length) { note('Cochez d\'abord les notions vues en classe : la fiche est faite avec elles.'); return; }
        button.disabled = true;
        post('/perso/api/objectifs/attach', {
            date: s.date, period: s.period, classroom_id: d.classroom.id, theme_id: d.selected.theme.id,
            notions: seen, upcoming: upcoming, exercises: panel.querySelector('#otPdfExercises').checked ? '1' : '0'
        }).then(function (res) {
            button.disabled = false;
            if (!res || !res.success) { note((res && res.error) || 'La fiche n\'a pas pu être créée.'); return; }
            note('Fiche jointe au cours : « ' + res.name + ' ». Elle s\'ouvre à droite ; le bouton d\'impression est dans sa barre d\'outils.');
            window.currentSlotPlanningId = res.planning_id;
            // Rafraîchir la liste « Fichiers joints » de la fenêtre.
            fetch('/planning/api/slot/' + s.date + '/' + s.period + '?classroom_id=' + d.classroom.id)
                .then(function (r) { return r.json(); })
                .then(function (slotData) {
                    if (slotData && slotData.success && typeof window.renderAttachedResources === 'function') {
                        window.renderAttachedResources(slotData.slot.resources || []);
                    }
                }).catch(function () {});
            if (typeof window.openPdfInViewer === 'function') {
                window.openPdfInViewer('eph' + res.ephemeral_id, res.name, res.url);
            } else {
                window.open(res.url, '_blank');
            }
        }).catch(function () { button.disabled = false; note('La fiche n\'a pas pu être créée.'); });
    }

    panel.addEventListener('click', function (event) {
        var d = state.data;
        if (!d || !d.selected) return;
        var target = event.target.closest('button, [data-add-notion]');
        if (!target || !panel.contains(target)) return;

        if (target.classList.contains('ot-chip')) {
            var code = target.dataset.code;
            if (state.selected.has(code)) state.selected.delete(code); else state.selected.add(code);
            syncSelection();
        } else if (target.dataset.pick) {
            state.selected.clear();
            var list = d.selected.exercises;
            if (target.dataset.pick === 'given') {
                list.filter(function (e) { return e.status === 'given'; }).forEach(function (e) { state.selected.add(e.code); });
            } else if (target.dataset.pick === 'next') {
                list.filter(function (e) { return e.status === 'todo'; }).slice(0, 5).forEach(function (e) { state.selected.add(e.code); });
            }
            syncSelection();
        } else if (target.dataset.insert) {
            var codes = selectedInOrder().join(', ');
            var prefix = { work: '[ ] Temps pour avancer dans les exercices : ', correction: '[ ] Correction : ', homework: '[ ] Donner le devoir : ' }[target.dataset.insert];
            appendLine(prefix + codes);
            state.selected.clear();
            syncSelection();
            note('Ajouté à la description. Enregistrez le cours : le suivi se mettra à jour.');
        } else if (target.dataset.mark) {
            var marks = {};
            state.selected.forEach(function (code) { marks[code] = target.dataset.mark; });
            state.selected.clear();
            saveMarks({ exercises: marks });
        } else if (target.dataset.addNotion) {
            var notion = d.selected.notions.find(function (n) { return String(n.n) === target.dataset.addNotion; });
            if (notion) {
                var title = notion.title ? notion.title.charAt(0).toLowerCase() + notion.title.slice(1) : '';
                appendLine('[ ] Théorie : notion ' + notion.n + ' : ' + title, '[ ] Théorie : ');
                note('Notion ' + notion.n + ' ajoutée à la description.');
            }
        } else if (target.id === 'otPdfBtn') {
            createSheet(target);
        }
    });

    panel.addEventListener('change', function (event) {
        var target = event.target;
        if (target.id === 'otThemeSelect') {
            load(parseInt(target.value, 10));
        } else if (target.id === 'otCurrent') {
            saveMarks({ current: target.checked });
        } else if (target.dataset && target.dataset.notion) {
            var marks = {};
            marks[target.dataset.notion] = target.checked ? 'seen' : 'unseen';
            saveMarks({ notions: marks });
        }
    });

    // La fenêtre s'ouvre (classe .show) : charger le panneau ; elle se ferme : le vider.
    var wasOpen = false;
    new MutationObserver(function () {
        var open = modal.classList.contains('show');
        if (open && !wasOpen) { panel.hidden = true; state.data = null; setTimeout(function () { load(); }, 250); }
        if (!open && wasOpen) { state.token++; panel.hidden = true; if (shiftBtn) shiftBtn.hidden = true; }
        wasOpen = open;
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    var classSelect = document.getElementById('modalClassroom');
    if (classSelect) classSelect.addEventListener('change', function () { if (modal.classList.contains('show')) load(); });

    // ------------------------------------------------------------ décalage

    var shift = { origins: [], wholeDay: false, mode: 'auto', signature: null, lessons: null };

    function openDialog(title, intro) {
        dialog.hidden = false;
        dialog.querySelector('h3').textContent = title;
        dialog.querySelector('header p').textContent = intro;
        dialog.querySelector('.ot-dialog-main').innerHTML = '<p class="ot-empty">Calcul en cours…</p>';
        dialog.querySelector('#otShiftConfirm').disabled = true;
    }
    function closeDialog() { dialog.hidden = true; }

    function renderPlan(plan) {
        var main = dialog.querySelector('.ot-dialog-main');
        var html = '';
        if (shift.lessons) {
            html += '<div class="ot-lessons">' + shift.lessons.map(function (l) {
                var on = shift.origins.some(function (o) { return o.period === l.period; });
                return '<label><input type="checkbox" data-lesson="' + l.period + '"' + (on ? ' checked' : '') + '> ' +
                    '<span><b>P' + l.period + '</b> · ' + esc(l.classroom) + (l.title ? ' — ' + esc(l.title) : '') + '</span></label>';
            }).join('') + '</div>';
        } else {
            html += '<div class="ot-modes">' +
                '<label><input type="radio" name="otMode" value="auto"' + (shift.mode === 'auto' ? ' checked' : '') + '> Selon la matière</label>' +
                '<label><input type="radio" name="otMode" value="next"' + (shift.mode === 'next' ? ' checked' : '') + '> Prochain cours de la classe</label>' +
                '<label><input type="radio" name="otMode" value="week"' + (shift.mode === 'week' ? ' checked' : '') + '> Même créneau, semaine suivante</label></div>';
        }
        if (!plan) { main.innerHTML = html; return; }
        if (!plan.moves.length) {
            main.innerHTML = html + '<p class="ot-empty">Rien à décaler : aucun cours planifié sur ' + (shift.lessons ? 'cette journée' : 'ce créneau') + '.</p>';
            return;
        }
        var groups = {};
        plan.moves.forEach(function (m) { (groups[m.classroom] = groups[m.classroom] || []).push(m); });
        Object.keys(groups).forEach(function (name) {
            var moves = groups[name];
            var last = moves[moves.length - 1];
            var how = moves[0].mode === 'week' ? 'même créneau, une semaine plus tard' : 'au cours suivant de la classe';
            html += '<div class="ot-group"><h5>' + esc(name) + ' <small>· ' + moves.length + (moves.length > 1 ? ' cours décalés' : ' cours décalé') + ', ' + how + '</small></h5><ul class="ot-moves">';
            var shown = moves.length > 7 ? moves.slice(0, 5) : moves;
            shown.forEach(function (m) {
                html += '<li><span>' + shortDate(m.from.date) + ' P' + m.from.period + '</span><span>→</span><span>' +
                    shortDate(m.to.date) + ' P' + m.to.period + '</span><span class="t">' + esc(m.title || 'Sans titre') + '</span></li>';
            });
            if (shown.length < moves.length) {
                html += '<li class="more">… et ' + (moves.length - shown.length) + ' autres, jusqu\'au ' + shortDate(last.to.date) + ' P' + last.to.period + '</li>';
            }
            html += '</ul></div>';
        });
        if (plan.merged.length) {
            html += '<div class="ot-warn">Il n\'y a plus de créneau libre avant la fin de l\'année : le contenu du dernier cours (' +
                plan.merged.map(function (m) { return esc(m.title || 'sans titre'); }).join(', ') +
                ') est ajouté à la suite du cours qui prend sa place. Rien n\'est perdu.</div>';
        }
        main.innerHTML = html;
    }

    function preview() {
        var confirm = dialog.querySelector('#otShiftConfirm');
        confirm.disabled = true;
        shift.signature = null;
        if (!shift.origins.length) { renderPlan({ moves: [], merged: [] }); return; }
        post('/perso/api/shift/preview', { origins: shift.origins, mode: shift.mode, whole_day: shift.wholeDay }).then(function (data) {
            if (!data.success) {
                renderPlan(null);
                dialog.querySelector('.ot-dialog-main').insertAdjacentHTML('beforeend', '<div class="ot-error">' + esc(data.error || 'Décalage impossible.') + '</div>');
                return;
            }
            shift.signature = data.signature;
            renderPlan(data.plan);
            var n = data.plan.moves.length;
            confirm.textContent = n ? 'Décaler ' + n + (n > 1 ? ' cours' : ' cours') : 'Décaler';
            confirm.disabled = !n;
        });
    }

    if (dialog) {
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog || event.target.closest('[data-close]')) closeDialog();
        });
        dialog.addEventListener('change', function (event) {
            if (event.target.name === 'otMode') { shift.mode = event.target.value; preview(); }
            if (event.target.dataset.lesson) {
                var date = shift.origins.length ? shift.origins[0].date : shift.date;
                shift.origins = Array.prototype.map.call(dialog.querySelectorAll('[data-lesson]:checked'), function (box) {
                    return { date: date, period: parseInt(box.dataset.lesson, 10) };
                });
                preview();
            }
        });
        dialog.querySelector('#otShiftConfirm').addEventListener('click', function () {
            var button = this;
            if (!shift.signature) return;
            button.disabled = true;
            post('/perso/api/shift/apply', { origins: shift.origins, mode: shift.mode, whole_day: shift.wholeDay, signature: shift.signature }).then(function (data) {
                if (data.success) { window.location.reload(); return; }
                dialog.querySelector('.ot-dialog-main').insertAdjacentHTML('beforeend', '<div class="ot-error">' + esc(data.error || 'Décalage impossible.') + '</div>');
                if (data._status === 409) preview();
            });
        });
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !dialog.hidden) closeDialog(); });
    }

    if (shiftBtn && dialog) {
        shiftBtn.addEventListener('click', function () {
            var s = slot();
            if (!s) return;
            shift = { origins: [s], wholeDay: false, mode: 'auto', signature: null, lessons: null, date: s.date };
            openDialog('Cours non donné : décaler', 'Le contenu prévu le ' + shortDate(s.date) + ' en P' + s.period + ' glisse sur le cours suivant, et les suivants avec lui.');
            preview();
        });
    }

    // Un bouton par jour, dans l'en-tête de la semaine.
    if (dialog) {
        document.querySelectorAll('.schedule-table th.day-header[data-date]').forEach(function (th) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'ot-day-btn';
            button.title = 'Journée non donnée : décaler tous les cours de ce jour';
            button.innerHTML = '<i class="fas fa-forward"></i> Décaler';
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                var date = th.dataset.date;
                openDialog('Journée non donnée : décaler', 'Cochez les cours du ' + shortDate(date) + ' qui n\'ont pas eu lieu. Leur contenu glisse sur les cours suivants ; rien n\'est replacé ce jour-là.');
                fetch('/perso/api/day/' + date, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
                    var lessons = (data && data.lessons) || [];
                    shift = { origins: lessons.map(function (l) { return { date: date, period: l.period }; }), wholeDay: true, mode: 'auto', signature: null, lessons: lessons, date: date };
                    preview();
                });
            });
            th.appendChild(button);
        });
    }
})();
