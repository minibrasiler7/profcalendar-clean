/**
 * ProfCalendar — Tutoriel animé (moteur)
 *
 * Principe : plutôt qu'une visite guidée qui surligne la vraie page (et
 * dépend donc des données de l'enseignant), on lui montre un ÉCRAN QUI
 * S'ANIME TOUT SEUL : une fausse fenêtre de l'application, avec des données
 * fictives, dans laquelle un curseur clique, tape et fait apparaître les
 * choses. Peu de texte : une courte légende par geste.
 *
 * Ce fichier = le moteur (menu des chapitres, lecteur, curseur, primitives
 * d'animation). Les scènes et les chapitres sont dans pc-tutorial-chapters.js
 * et s'enregistrent dans window.pcTutorialChapters.
 *
 * Point d'entrée : window.pcTutorial.open()  — window.pcTutorial.play(i)
 */
(function () {
    'use strict';

    const W = 1100, H = 660;             // taille de conception de l'écran
    const ABORT = { pt: 'abort' };       // jeté dans une animation interrompue
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const LS_KEY = 'pc_tuto_done';

    const CURSOR = '<svg viewBox="0 0 26 30" xmlns="http://www.w3.org/2000/svg">'
        + '<path d="M2 2 L2 23 L8 17.5 L12 27 L16 25.2 L12.2 16.5 L20 16.5 Z" fill="#fff" stroke="#111827" stroke-width="1.7" stroke-linejoin="round"/></svg>';

    function loadDone() {
        try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveDone(d) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) {}
    }
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    class Tutorial {
        constructor() {
            this.root = null;
            this.token = 0;          // change à chaque arrêt : périme les animations en cours
            this.paused = false;
            this.current = -1;
            this.scale = 1;
            this.speed = 1;          // > 1 : accélère toutes les attentes (tests)
            this.done = loadDone();
            this.seenSent = false;
            this._onResize = () => this.fit();
            this._onKey = (e) => {
                if (!this.root || !this.root.classList.contains('open')) return;
                if (e.key === 'Escape') this.close();
            };
        }

        get chapters() { return window.pcTutorialChapters || []; }

        // Chapitre qui correspond à la page courante (clé request.endpoint
        // posée sur <main data-help-page>), pour le bouton « ? ».
        chapterForPage() {
            const page = ((document.querySelector('main') || {}).dataset || {}).helpPage || '';
            const map = [
                ['planning.calendar_view', 'planning'], ['planning.lesson_view', 'lesson'],
                ['planning.manage_classes', 'classes'], ['file_manager.', 'files'],
                ['sanctions.', 'sanctions'], ['planning.decoupage', 'decoupage'],
                ['exercises.', 'exercise'], ['settings.class_codes', 'accounts'],
                ['student_auth.', 'accounts'], ['parent_auth.', 'accounts']
            ];
            const hit = map.find(([prefix]) => page === prefix || page.startsWith(prefix));
            return hit ? hit[1] : null;
        }

        // ------------------------------------------------------------ DOM
        mount() {
            if (this.root) return;
            const root = document.createElement('div');
            root.className = 'pt-root';
            root.innerHTML = '<div class="pt-backdrop"></div><div class="pt-dialog"></div>';
            document.body.appendChild(root);
            this.root = root;
            this.dialog = root.querySelector('.pt-dialog');
            root.querySelector('.pt-backdrop').addEventListener('click', () => this.close());
            document.addEventListener('keydown', this._onKey);
        }

        open(opts) {
            this.mount();
            this.stop();
            this.suggested = (opts && opts.fromPage) ? this.chapterForPage() : null;
            this.renderMenu();
            this.root.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        close() {
            if (!this.root) return;
            this.stop();
            this.root.classList.remove('open');
            document.body.style.overflow = '';
            window.removeEventListener('resize', this._onResize);
            this.markSeen();
        }

        // Le serveur ne retient qu'une chose : le tutoriel a été proposé.
        // Sans cet appel, la fenêtre se rouvrirait à chaque visite du tableau
        // de bord (data-first-visit reste posé).
        markSeen() {
            if (this.seenSent || document.body.dataset.firstVisit !== 'true') return;
            this.seenSent = true;
            document.body.dataset.firstVisit = 'false';
            try {
                fetch('/api/help/tour-completed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
                }).catch(() => {});
            } catch (e) {}
        }

        // ------------------------------------------------------------ MENU
        renderMenu() {
            const chapters = this.chapters;
            const doneCount = chapters.filter(c => this.done[c.id]).length;
            this.dialog.innerHTML = `
                <div class="pt-menu" role="dialog" aria-label="Tutoriel">
                    <div class="pt-menu-head">
                        <div>
                            <h2>Bienvenue sur ProfCalendar</h2>
                            <p>Choisis un tutoriel : l'écran te montre comment faire, tout seul.</p>
                        </div>
                        <button type="button" class="pt-menu-close" title="Fermer" aria-label="Fermer">&times;</button>
                    </div>
                    <div class="pt-menu-grid">
                        ${chapters.map((c, i) => `
                            <button type="button" class="pt-chap ${c.reco ? 'reco' : ''} ${c.id === this.suggested ? 'suggested' : ''}" data-i="${i}">
                                <span class="pt-chap-ico" style="background:${c.color}"><i class="fas ${c.icon}"></i></span>
                                <span class="pt-chap-num">${i + 1}</span>
                                <span style="min-width:0;">
                                    <h3>${esc(c.title)}</h3>
                                    <p>${esc(c.desc)}</p>
                                    <span class="pt-chap-meta">
                                        ${c.reco ? '<span class="pt-badge reco">Recommandé</span>' : ''}
                                        ${c.id === this.suggested ? '<span class="pt-badge page"><i class="fas fa-location-arrow"></i> Cette page</span>' : ''}
                                        ${this.done[c.id] ? '<span class="pt-badge done"><i class="fas fa-check"></i> Vu</span>' : ''}
                                        <span><i class="far fa-clock"></i> ≈ ${c.seconds} s</span>
                                    </span>
                                </span>
                            </button>`).join('')}
                    </div>
                    <div class="pt-menu-foot">
                        <small>${doneCount}/${chapters.length} chapitres vus · tu retrouves ce menu dans ton profil, « Revoir le tutoriel ».</small>
                        <div style="display:flex;gap:8px;">
                            <button type="button" class="pt-btn" data-act="later">Plus tard</button>
                            <button type="button" class="pt-btn primary" data-act="start"><i class="fas fa-play"></i> Commencer</button>
                        </div>
                    </div>
                </div>`;
            this.dialog.querySelector('.pt-menu-close').onclick = () => this.close();
            this.dialog.querySelector('[data-act="later"]').onclick = () => this.close();
            this.dialog.querySelector('[data-act="start"]').onclick = () => {
                const si = this.chapters.findIndex(c => c.id === this.suggested);
                this.play(si >= 0 ? si : this.firstUnseen());
            };
            this.dialog.querySelectorAll('.pt-chap').forEach(b => {
                b.onclick = () => this.play(parseInt(b.dataset.i, 10));
            });
        }

        firstUnseen() {
            const i = this.chapters.findIndex(c => !this.done[c.id]);
            return i < 0 ? 0 : i;
        }

        // ------------------------------------------------------------ LECTEUR
        renderPlayer(i) {
            const c = this.chapters[i];
            this.dialog.innerHTML = `
                <div class="pt-player">
                    <div class="pt-topbar">
                        <div class="pt-title"><span class="n">${i + 1}/${this.chapters.length}</span> <span class="t">${esc(c.title)}</span></div>
                        <div class="pt-actions">
                            <button type="button" class="pt-ib" data-act="pause" title="Pause"><i class="fas fa-pause"></i></button>
                            <button type="button" class="pt-ib" data-act="replay" title="Rejouer ce chapitre"><i class="fas fa-redo"></i></button>
                            <button type="button" class="pt-ib" data-act="next" title="Chapitre suivant"><i class="fas fa-forward"></i></button>
                            <button type="button" class="pt-ib" data-act="menu" title="Tous les chapitres"><i class="fas fa-th-large"></i></button>
                            <button type="button" class="pt-ib" data-act="close" title="Fermer"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                    <div class="pt-frame">
                        <div class="pt-screen">
                            <div class="pt-stage"></div>
                            <div class="pt-cursor">${CURSOR}</div>
                        </div>
                    </div>
                    <div class="pt-progress"><div></div></div>
                    <div class="pt-caption"></div>
                </div>`;
            this.frame = this.dialog.querySelector('.pt-frame');
            this.screen = this.dialog.querySelector('.pt-screen');
            this.stage = this.dialog.querySelector('.pt-stage');
            this.cursor = this.dialog.querySelector('.pt-cursor');
            this.captionEl = this.dialog.querySelector('.pt-caption');
            this.progressEl = this.dialog.querySelector('.pt-progress > div');
            const q = sel => this.dialog.querySelector(sel);
            q('[data-act="pause"]').onclick = (e) => this.togglePause(e.currentTarget);
            q('[data-act="replay"]').onclick = () => this.play(i);
            q('[data-act="next"]').onclick = () => this.play((i + 1) % this.chapters.length);
            q('[data-act="menu"]').onclick = () => { this.stop(); this.renderMenu(); };
            q('[data-act="close"]').onclick = () => this.close();
            window.addEventListener('resize', this._onResize);
            this.fit();
        }

        // L'écran est dessiné à 1100×660 puis mis à l'échelle pour tenir dans
        // la fenêtre : les scènes n'ont jamais à se soucier de la taille réelle.
        fit() {
            if (!this.frame || !this.screen) return;
            const pad = 32;
            const availW = Math.max(320, window.innerWidth - pad);
            const chrome = 48 + 16 + 56 + 40;   // barre du haut, progression, légende, marges
            const availH = Math.max(240, window.innerHeight - pad - chrome);
            const s = Math.min(availW / W, availH / H, 1.1);
            this.scale = s;
            this.frame.style.width = (W * s) + 'px';
            this.frame.style.height = (H * s) + 'px';
            this.screen.style.transform = 'scale(' + s + ')';
        }

        togglePause(btn) {
            this.paused = !this.paused;
            btn.innerHTML = this.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            btn.title = this.paused ? 'Reprendre' : 'Pause';
        }

        stop() {
            this.token++;
            this.paused = false;
        }

        async play(i) {
            const chapter = this.chapters[i];
            if (!chapter) return;
            this.stop();
            const token = this.token;
            this.current = i;
            this.renderPlayer(i);
            this.stepIndex = 0;
            this.stepTotal = chapter.steps || 10;
            const k = this.kit(token);
            try {
                await k.wait(400);
                await chapter.run(k);
                if (token !== this.token) return;
                this.done[chapter.id] = true;
                saveDone(this.done);
                this.markSeen();
                this.showEnd(i);
            } catch (e) {
                if (e !== ABORT) {
                    console.error('[pc-tutorial] chapitre « ' + chapter.title + ' » :', e);
                    if (token === this.token) this.showEnd(i, true);
                }
            }
        }

        showEnd(i, failed) {
            const last = i >= this.chapters.length - 1;
            const end = document.createElement('div');
            end.className = 'pt-end';
            end.innerHTML = `
                <div class="pt-end-card">
                    <div class="ok"><i class="fas ${failed ? 'fa-exclamation' : 'fa-check'}"></i></div>
                    <h3>${failed ? 'Oups, ce chapitre s\'est interrompu' : 'Chapitre terminé'}</h3>
                    <p>${last ? 'Tu as fait le tour. Bon enseignement !' : 'On continue ?'}</p>
                    <div class="row">
                        <button type="button" class="pt-btn" data-act="replay"><i class="fas fa-redo"></i> Rejouer</button>
                        <button type="button" class="pt-btn" data-act="menu"><i class="fas fa-th-large"></i> Menu</button>
                        ${last ? '' : '<button type="button" class="pt-btn primary" data-act="next">Chapitre suivant <i class="fas fa-arrow-right"></i></button>'}
                    </div>
                </div>`;
            end.querySelector('[data-act="replay"]').onclick = () => this.play(i);
            end.querySelector('[data-act="menu"]').onclick = () => { this.stop(); this.renderMenu(); };
            const n = end.querySelector('[data-act="next"]');
            if (n) n.onclick = () => this.play(i + 1);
            this.screen.appendChild(end);
            this.progressEl.style.width = '100%';
        }

        // ------------------------------------------------------------ PRIMITIVES
        // Tout ce dont un chapitre a besoin, lié à un jeton : dès que
        // l'utilisateur ferme, change de chapitre ou rejoue, le jeton change
        // et la prochaine attente jette ABORT — l'ancien chapitre s'éteint
        // sans laisser de minuteurs derrière lui.
        kit(token) {
            const self = this;
            const check = () => { if (token !== self.token) throw ABORT; };

            const resolve = (t) => {
                if (!t) return null;
                if (typeof t === 'string') {
                    const el = self.stage.querySelector(t);
                    if (!el) console.warn('[pc-tutorial] cible introuvable :', t);
                    return el;
                }
                return t;
            };

            // Coordonnées de conception (1100×660) du centre d'un élément.
            const centerOf = (el, dx, dy) => {
                const r = el.getBoundingClientRect();
                const s = self.screen.getBoundingClientRect();
                return {
                    x: (r.left - s.left + r.width / 2) / self.scale + (dx || 0),
                    y: (r.top - s.top + r.height / 2) / self.scale + (dy || 0)
                };
            };

            const k = {
                ABORT,
                check,
                $: resolve,
                $$: (sel) => Array.from(self.stage.querySelectorAll(sel)),

                async wait(ms) {
                    let left = ms / (self.speed || 1);
                    while (left > 0) {
                        check();
                        if (self.paused) { await sleep(100); continue; }
                        const d = Math.min(50, left);
                        await sleep(d);
                        left -= d;
                    }
                    check();
                },

                // Nouvelle « page » de la fausse application.
                async scene(html) {
                    check();
                    self.stage.classList.add('fade');
                    await k.wait(230);
                    self.stage.innerHTML = html;
                    self.stage.classList.remove('fade');
                    await k.wait(380);
                },

                // Une courte légende = une étape de la barre de progression.
                async cap(text) {
                    check();
                    self.captionEl.classList.add('fade');
                    await k.wait(180);
                    self.captionEl.textContent = text;
                    self.captionEl.classList.remove('fade');
                    self.stepIndex++;
                    const p = Math.min(96, Math.round(self.stepIndex / self.stepTotal * 100));
                    self.progressEl.style.width = p + '%';
                    await k.wait(650);
                },

                // Déplacement vers un point (coordonnées de conception), pour
                // suivre un tracé qui n'est pas un élément.
                async moveXY(x, y, ms) {
                    check();
                    self.cursor.style.left = (x - 3) + 'px';
                    self.cursor.style.top = (y - 3) + 'px';
                    await k.wait(ms || 600);
                },

                async moveTo(target, opts) {
                    const o = opts || {};
                    const el = resolve(target);
                    if (!el) return null;
                    const c = centerOf(el, o.dx, o.dy);
                    self.cursor.style.left = (c.x - 3) + 'px';
                    self.cursor.style.top = (c.y - 3) + 'px';
                    await k.wait(o.ms || 640);
                    return el;
                },

                // Déplace le curseur, « appuie », puis applique la mutation.
                async click(target, fn, opts) {
                    const o = opts || {};
                    const el = await k.moveTo(target, o);
                    if (!el) return null;
                    self.cursor.classList.add('pressed');
                    const c = centerOf(el, o.dx, o.dy);
                    const rip = document.createElement('div');
                    rip.className = 'pt-ripple';
                    rip.style.left = c.x + 'px';
                    rip.style.top = c.y + 'px';
                    self.screen.appendChild(rip);
                    setTimeout(() => rip.remove(), 600);
                    await k.wait(130);
                    self.cursor.classList.remove('pressed');
                    if (fn) fn(el);
                    await k.wait(o.after == null ? 480 : o.after);
                    return el;
                },

                // Frappe caractère par caractère. Option checkbox : un « - » en
                // début de ligne devient « [ ] », comme dans la vraie application.
                async type(target, text, opts) {
                    const o = opts || {};
                    const el = await k.moveTo(target, { ms: 500 });
                    if (!el) return;
                    el.classList.add('pt-focus');
                    const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
                    let cur = o.append ? (isInput ? el.value : el.textContent) : '';
                    const per = o.ms || Math.max(18, Math.min(45, 2200 / Math.max(1, text.length)));
                    for (const ch of text) {
                        cur += ch;
                        if (o.checkbox) cur = cur.replace(/(^|\n)([ \t]*)- $/, '$1$2[ ] ');
                        if (isInput) el.value = cur; else el.textContent = cur;
                        await k.wait(ch === '\n' ? per * 6 : per);
                    }
                    el.classList.remove('pt-focus');
                    await k.wait(o.after == null ? 350 : o.after);
                },

                // Met un élément en évidence quelques instants.
                async spot(target, ms) {
                    const el = resolve(target);
                    if (!el) return;
                    el.classList.add('pt-spot');
                    setTimeout(() => el.classList.remove('pt-spot'), 2400);
                    await k.wait(ms == null ? 900 : ms);
                },

                // Glisser-déposer : fantôme de l'élément qui suit le curseur.
                async drag(from, to, label, fn) {
                    const a = await k.moveTo(from);
                    const b = resolve(to);
                    if (!a || !b) return;
                    self.cursor.classList.add('pressed');
                    const ca = centerOf(a), cb = centerOf(b);
                    const ghost = document.createElement('div');
                    ghost.className = 'pt-drag-ghost';
                    ghost.innerHTML = label;
                    ghost.style.left = (ca.x + 10) + 'px';
                    ghost.style.top = (ca.y + 10) + 'px';
                    self.screen.appendChild(ghost);
                    await k.wait(200);
                    self.cursor.style.left = (cb.x - 3) + 'px';
                    self.cursor.style.top = (cb.y - 3) + 'px';
                    ghost.style.left = (cb.x + 10) + 'px';
                    ghost.style.top = (cb.y + 10) + 'px';
                    await k.wait(700);
                    b.classList.add('over');
                    await k.wait(350);
                    self.cursor.classList.remove('pressed');
                    ghost.remove();
                    b.classList.remove('over');
                    if (fn) fn(b);
                    await k.wait(500);
                },

                toast(text) {
                    const t = document.createElement('div');
                    t.className = 'pt-toast';
                    t.innerHTML = '<i class="fas fa-check-circle"></i> ' + esc(text);
                    self.stage.appendChild(t);
                    setTimeout(() => t.remove(), 2300);
                },

                // Modale à l'intérieur de la fausse application.
                modal(html, opts) {
                    const o = opts || {};
                    const mb = document.createElement('div');
                    mb.className = 'pt-mb';
                    mb.innerHTML = '<div class="pt-modal ' + (o.wide ? 'wide' : '') + '">' + html + '</div>';
                    self.stage.appendChild(mb);
                    return mb.firstElementChild;
                },
                closeModal() {
                    const mb = self.stage.querySelector('.pt-mb');
                    if (mb) mb.remove();
                },

                // Injection HTML prête à l'emploi.
                html(target, html) { const el = resolve(target); if (el) el.innerHTML = html; },
                add(target, html, first) {
                    const el = resolve(target);
                    if (!el) return null;
                    el.insertAdjacentHTML(first ? 'afterbegin' : 'beforeend', html);
                    const n = first ? el.firstElementChild : el.lastElementChild;
                    if (n) n.classList.add('pt-appear');
                    return n;
                },
                show(target) { const el = resolve(target); if (el) el.style.display = ''; },
                hide(target) { const el = resolve(target); if (el) el.style.display = 'none'; },
                esc
            };
            return k;
        }
    }

    const tuto = new Tutorial();
    window.pcTutorial = {
        open: (opts) => tuto.open(opts),
        play: (i) => { tuto.mount(); tuto.root.classList.add('open'); document.body.style.overflow = 'hidden'; return tuto.play(i); },
        close: () => tuto.close(),
        set speed(v) { tuto.speed = v; },
        get done() { return tuto.done; }
    };

    // Ouverture automatique : premier passage sur le tableau de bord, ou
    // « Revoir le tutoriel » (?replay_tour=1) depuis le menu utilisateur.
    document.addEventListener('DOMContentLoaded', () => {
        const page = (document.querySelector('main') || {}).dataset || {};
        const onDashboard = page.helpPage === 'planning.dashboard';
        const url = new URL(window.location.href);
        const replay = url.searchParams.get('replay_tour') === '1';
        if (replay) {
            url.searchParams.delete('replay_tour');
            try { history.replaceState(null, '', url.pathname + (url.search || '')); } catch (e) {}
        }
        if (replay || (onDashboard && document.body.dataset.firstVisit === 'true')) {
            setTimeout(() => tuto.open(), 700);
        }
    });
})();
