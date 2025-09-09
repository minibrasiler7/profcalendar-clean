/**
 * Debug Overlay for iPad Testing
 * Affiche les logs directement sur la page pour debug sur iPad
 */

(function() {
    'use strict';

    let debugOverlay = null;
    let debugLog = [];
    let maxLogs = 20;

    // Créer l'overlay de debug
    function createDebugOverlay() {
        if (debugOverlay) return;

        debugOverlay = document.createElement('div');
        debugOverlay.id = 'debug-overlay';
        debugOverlay.innerHTML = `
            <div style="
                position: fixed;
                top: 10px;
                right: 10px;
                width: 300px;
                max-height: 400px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                font-family: monospace;
                font-size: 11px;
                padding: 10px;
                border-radius: 5px;
                z-index: 10000;
                overflow-y: auto;
                border: 1px solid #333;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #333;
                ">
                    <strong>Debug iPad</strong>
                    <button onclick="toggleDebugOverlay()" style="
                        background: #ff4444;
                        color: white;
                        border: none;
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 10px;
                        cursor: pointer;
                    ">×</button>
                </div>
                <div id="debug-content"></div>
            </div>
        `;
        document.body.appendChild(debugOverlay);
    }

    // Fonction de log personnalisée
    function debugLog_custom(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
        
        debugLog.unshift(logEntry);
        if (debugLog.length > maxLogs) {
            debugLog = debugLog.slice(0, maxLogs);
        }
        
        updateDebugDisplay();
        console.log(logEntry); // Log normal aussi
    }

    // Mettre à jour l'affichage
    function updateDebugDisplay() {
        if (!debugOverlay) return;
        
        const content = document.getElementById('debug-content');
        if (content) {
            content.innerHTML = debugLog.map(log => {
                const color = log.includes('ERROR') ? '#ff6666' : 
                             log.includes('WARN') ? '#ffaa66' : 
                             log.includes('SUCCESS') ? '#66ff66' : '#ffffff';
                return `<div style="color: ${color}; margin-bottom: 2px; word-break: break-all;">${log}</div>`;
            }).join('');
        }
    }

    // Toggle visibility
    window.toggleDebugOverlay = function() {
        if (debugOverlay) {
            debugOverlay.style.display = debugOverlay.style.display === 'none' ? 'block' : 'none';
        }
    };

    // Détection des problèmes tactiles
    function detectTouchIssues() {
        debugLog_custom('🚀 Détection tactile initialisée');
        debugLog_custom('📱 isTouchDevice: ' + ('ontouchstart' in window));
        debugLog_custom('📱 maxTouchPoints: ' + navigator.maxTouchPoints);
        debugLog_custom('📱 UserAgent: ' + navigator.userAgent.substring(0, 50));

        // Test des événements tactiles sur les canvas
        document.addEventListener('touchstart', function(e) {
            if (e.target.id && e.target.id.startsWith('annotation-canvas-')) {
                debugLog_custom('👆 TouchStart détecté sur: ' + e.target.id);
                debugLog_custom('👆 Touches: ' + e.touches.length);
                debugLog_custom('👆 Position: ' + Math.round(e.touches[0].clientX) + ',' + Math.round(e.touches[0].clientY));
            }
        }, true);

        document.addEventListener('touchmove', function(e) {
            if (e.target.id && e.target.id.startsWith('annotation-canvas-')) {
                debugLog_custom('✋ TouchMove sur: ' + e.target.id + ' (' + e.touches.length + ' doigts)');
            }
        }, true);

        document.addEventListener('touchend', function(e) {
            if (e.target.dataset && e.target.dataset.lastTarget && e.target.dataset.lastTarget.startsWith('annotation-canvas-')) {
                debugLog_custom('🛑 TouchEnd après: ' + e.target.dataset.lastTarget);
            }
        }, true);

        // Test de scroll à deux doigts
        document.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                debugLog_custom('✌️ Scroll 2 doigts détecté');
            }
        }, true);

        // Test des outils d'annotation
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('btn-annotation-tool')) {
                debugLog_custom('🔧 Outil sélectionné: ' + (e.target.dataset.tool || 'unknown'));
            }
            if (e.target.classList.contains('color-btn')) {
                debugLog_custom('🎨 Couleur sélectionnée: ' + e.target.style.backgroundColor);
            }
        });
    }

    // Tester les fonctions de dessin
    function testDrawingFunctions() {
        setTimeout(() => {
            const canvases = document.querySelectorAll('[id^="annotation-canvas-"]');
            debugLog_custom('🎨 Canvas d\'annotation trouvés: ' + canvases.length);
            
            canvases.forEach((canvas, index) => {
                debugLog_custom(`📋 Canvas ${index + 1}: ${canvas.id}, taille: ${canvas.width}x${canvas.height}`);
                debugLog_custom(`📋 Style: ${canvas.style.touchAction || 'none'}, pointerEvents: ${canvas.style.pointerEvents || 'auto'}`);
            });

            // Test si les événements sont attachés
            const testCanvas = canvases[0];
            if (testCanvas) {
                const listeners = getEventListeners ? getEventListeners(testCanvas) : 'Non disponible';
                debugLog_custom('🎧 Event listeners: ' + (typeof listeners === 'object' ? Object.keys(listeners).join(', ') : listeners));
            }
        }, 2000);
    }

    // Fonction de test manuelle
    window.testTouchDrawing = function() {
        debugLog_custom('🧪 Test de dessin tactile manuel');
        const canvas = document.querySelector('[id^="annotation-canvas-"]');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(50, 50);
            ctx.lineTo(100, 100);
            ctx.stroke();
            debugLog_custom('✅ Ligne de test dessinée sur ' + canvas.id);
        } else {
            debugLog_custom('❌ Aucun canvas trouvé pour le test');
        }
    };

    // Initialisation
    function init() {
        createDebugOverlay();
        debugLog_custom('🚀 Debug overlay initialisé');
        detectTouchIssues();
        testDrawingFunctions();
    }

    // Démarrer au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Démarrer aussi quand le PDF est chargé
    window.addEventListener('pdfLoaded', () => {
        debugLog_custom('📄 PDF chargé, re-test des fonctions');
        testDrawingFunctions();
    });

})();