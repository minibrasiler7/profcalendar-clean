/**
 * Télémétrie client → serveur (Render logs).
 *
 * Pourquoi : le lecteur PDF iPad (WKWebView) freeze occasionnellement et
 * jusqu'ici l'utilisateur doit force-quit l'app sans qu'aucune info ne
 * remonte dans les logs Render — soit parce que les pages sont cachées,
 * soit parce que le freeze gèle le main thread avant tout `fetch()`.
 *
 * Ce script capture trois signaux et les envoie à `/api/diagnostic/client-log` :
 *
 *   1. window.onerror              — erreurs JS synchrones
 *   2. unhandledrejection          — promesses rejetées non catchées
 *   3. PerformanceObserver longtask — tâches main-thread > 5 s
 *                                     (= freeze imminent, juste avant que
 *                                     le WebView ne devienne irrémédiable)
 *
 * Limites volontaires :
 *   - Pas de dépendance, pas d'auth.
 *   - On dédupe sur 5 s pour éviter d'inonder Render si une erreur boucle.
 *   - On utilise navigator.sendBeacon en priorité (survit à un unload)
 *     avec un fallback fetch keepalive.
 *   - Le main thread peut très bien être complètement bloqué (ex: boucle
 *     infinie synchrone) auquel cas RIEN ne sera envoyé — pour ça, on
 *     compte sur la détection longtask qui s'exécute AVANT que ça parte
 *     en vrille (la plupart des freezes commencent par un long task).
 */
(function () {
    'use strict';

    if (window.__clientTelemetryInstalled) return;
    window.__clientTelemetryInstalled = true;

    var ENDPOINT = '/api/diagnostic/client-log';
    var LONGTASK_THRESHOLD_MS = 5000;    // déclenche un report au-delà
    var DEDUP_WINDOW_MS = 5000;          // ignore les events identiques dans cette fenêtre

    var lastSent = Object.create(null);  // signature → timestamp

    function sigOf(payload) {
        return (payload.type || '') + '|' + (payload.message || '').slice(0, 120) +
               '|' + (payload.source || '') + '|' + (payload.lineno || 0);
    }

    function postLog(payload) {
        try {
            payload.url = location.href;
            payload.userAgent = navigator.userAgent;

            var sig = sigOf(payload);
            var now = Date.now();
            if (lastSent[sig] && (now - lastSent[sig]) < DEDUP_WINDOW_MS) {
                return;
            }
            lastSent[sig] = now;

            var body = JSON.stringify(payload);

            // sendBeacon survit à un unload (force-quit iOS partiel par ex).
            if (navigator.sendBeacon) {
                var blob = new Blob([body], { type: 'application/json' });
                if (navigator.sendBeacon(ENDPOINT, blob)) return;
            }
            // Fallback fetch keepalive
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                keepalive: true,
                credentials: 'same-origin',
            }).catch(function () { /* best-effort */ });
        } catch (e) {
            // ne jamais throw depuis le reporter — sinon on déclenche
            // window.onerror et on récursive.
        }
    }

    // ─── 1. erreurs JS synchrones ───────────────────────────────────────
    window.addEventListener('error', function (ev) {
        // ev.error peut être null pour des ressources (img.onerror) — on
        // ne s'intéresse qu'aux erreurs scriptées avec une stack.
        var err = ev.error;
        var stack = (err && err.stack) ? String(err.stack) : '';
        postLog({
            type: 'error',
            message: ev.message || (err && err.message) || '(no message)',
            source: ev.filename || '',
            lineno: ev.lineno || 0,
            colno: ev.colno || 0,
            stack: stack,
        });
    });

    // ─── 2. promesses rejetées non catchées ─────────────────────────────
    window.addEventListener('unhandledrejection', function (ev) {
        var reason = ev.reason;
        var message = '';
        var stack = '';
        if (reason instanceof Error) {
            message = reason.message;
            stack = reason.stack || '';
        } else {
            try { message = JSON.stringify(reason); } catch (_) { message = String(reason); }
        }
        postLog({
            type: 'unhandledrejection',
            message: message || '(no message)',
            stack: stack,
        });
    });

    // ─── 3. long tasks (= freeze imminent) ──────────────────────────────
    // L'API longtask existe dans WKWebView iOS 14+. Si pas dispo on saute
    // sans bruit.
    try {
        if (typeof PerformanceObserver === 'function') {
            var obs = new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) {
                    if (entry.duration && entry.duration >= LONGTASK_THRESHOLD_MS) {
                        postLog({
                            type: 'longtask',
                            message: 'Main thread bloqué ' + Math.round(entry.duration) + ' ms',
                            duration: Math.round(entry.duration),
                            context: {
                                entryName: entry.name || '',
                                startTime: Math.round(entry.startTime || 0),
                            },
                        });
                    }
                });
            });
            obs.observe({ entryTypes: ['longtask'] });
        }
    } catch (_) {
        // Pas de longtask API sur cette plateforme — tant pis.
    }

    // ─── 4. ping de visibilité (utile pour détecter "session a redémarré
    //       après force-quit" : on log le nouveau pageshow avec persisted=false)
    window.addEventListener('pageshow', function (ev) {
        if (!ev.persisted) {
            // Fresh load — on n'envoie rien par défaut, juste un marqueur
            // dispo si on veut activer plus tard. Pour l'instant on log
            // uniquement les loads sur la page lecteur (lesson) en mode iOS.
            try {
                var isLesson = /\/planning\/lesson/i.test(location.pathname);
                var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isLesson && isIOS) {
                    postLog({
                        type: 'info',
                        message: 'Lesson page loaded (iOS WebView)',
                        context: {
                            viewport: window.innerWidth + 'x' + window.innerHeight,
                            visibility: document.visibilityState,
                        },
                    });
                }
            } catch (_) { /* noop */ }
        }
    });

    // Helper exposé pour qu'on puisse poster des marqueurs manuellement
    // depuis clean-pdf-viewer.js si on veut tracer un endroit précis.
    window.reportClientEvent = function (type, message, context) {
        postLog({
            type: String(type || 'info').slice(0, 30),
            message: String(message || ''),
            context: context || null,
        });
    };
})();
