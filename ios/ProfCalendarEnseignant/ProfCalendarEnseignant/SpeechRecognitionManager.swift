//
//  SpeechRecognitionManager.swift
//  ProfCalendarEnseignant
//
//  Pont JavaScript ↔ Swift pour la DICTÉE VOCALE native (SFSpeechRecognizer).
//  L'API Web Speech (webkitSpeechRecognition) est présente en WKWebView mais NON
//  fonctionnelle : .start() échoue aussitôt. On offre donc une reconnaissance
//  vocale NATIVE. Le web pilote la dictée via :
//     window.webkit.messageHandlers.speech.postMessage({action: "start"|"stop", lang: "fr-FR"})
//  et reçoit les événements via :
//     window.nativeSpeech._emit("start"|"result"|"end"|"error", payload)
//  où payload de "result" = { text: String, isFinal: Bool }.
//

import Foundation
import Speech
import AVFoundation
import WebKit

final class SpeechRecognitionManager: NSObject, WKScriptMessageHandler {

    /// Référence (faible) à la WebView pour renvoyer les résultats au web.
    /// Posée par WebViewController après la création de la WebView.
    weak var webView: WKWebView?

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var isRunning = false

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "start":
            let lang = (body["lang"] as? String) ?? "fr-FR"
            DispatchQueue.main.async { [weak self] in self?.start(lang: lang) }
        case "stop":
            DispatchQueue.main.async { [weak self] in self?.stop() }
        default:
            break
        }
    }

    // MARK: - Émission d'événements vers le web

    private func emit(_ type: String, _ payload: [String: Any] = [:]) {
        var json = "{}"
        if !payload.isEmpty,
           let data = try? JSONSerialization.data(withJSONObject: payload),
           let s = String(data: data, encoding: .utf8) {
            json = s
        }
        let js = "window.nativeSpeech && window.nativeSpeech._emit && window.nativeSpeech._emit('\(type)', \(json));"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - Démarrage + permissions

    private func start(lang: String) {
        if isRunning { stop() }

        // 1) Autorisation reconnaissance vocale.
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard let self = self else { return }
            guard status == .authorized else {
                self.emit("error", ["message": "speech-not-authorized"])
                return
            }
            // 2) Autorisation micro, puis lancement.
            self.requestMic { granted in
                guard granted else {
                    self.emit("error", ["message": "mic-not-authorized"])
                    return
                }
                DispatchQueue.main.async { [weak self] in self?.run(lang: lang) }
            }
        }
    }

    private func requestMic(_ completion: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: completion)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(completion)
        }
    }

    // MARK: - Reconnaissance (thread principal)

    private func run(lang: String) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) ?? SFSpeechRecognizer(),
              recognizer.isAvailable else {
            emit("error", ["message": "recognizer-unavailable"])
            return
        }
        self.recognizer = recognizer

        // Session audio en mode enregistrement AVANT de toucher l'inputNode
        // (sinon le format d'entrée peut être invalide).
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            emit("error", ["message": "audio-session-failed"])
            return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        self.request = req

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            emit("error", ["message": "audio-engine-failed"])
            teardownAudio()
            return
        }

        isRunning = true
        emit("start")

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.emit("result", [
                    "text": result.bestTranscription.formattedString,
                    "isFinal": result.isFinal
                ])
                if result.isFinal { self.stop() }
                return
            }
            if error != nil, self.isRunning {
                self.stop()
            }
        }
    }

    // MARK: - Arrêt (toujours ramené sur le thread principal)

    private func stop() {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in self?.stop() }
            return
        }
        teardownAudio()
        task?.cancel()
        task = nil
        request = nil
        recognizer = nil
        if isRunning {
            isRunning = false
            emit("end")
        }
    }

    private func teardownAudio() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
