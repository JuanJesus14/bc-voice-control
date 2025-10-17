// ConversationalVoice.js
// Control de voz conversacional con compatibilidad iOS mejorada

var recognition = null;
var synthesis = window.speechSynthesis;
var isListening = false;
var isSpeaking = false;
var currentLanguage = 'es-ES';
var recognitionAvailable = false;
var currentTranscript = '';
var silenceTimer = null;
var SILENCE_DELAY = 2000;
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
var userInteractionReceived = false;

// Inicialización
function InitializeControl() {
    try {
        // Detectar soporte
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            var errorMsg = isIOS 
                ? 'Reconocimiento de voz no soportado en este dispositivo iOS. Usa Safari actualizado.'
                : 'Speech recognition not supported. Use Chrome, Edge or Safari.';
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', [errorMsg]);
            recognitionAvailable = false;
            CreateUIWithError(errorMsg);
            return;
        }
        
        // Verificar HTTPS en iOS
        var isLocalhost = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname.endsWith('.local');
        
        var isBCOnline = window.location.hostname.includes('businesscentral.dynamics.com') ||
                        window.location.hostname.includes('bc.dynamics.com');
        
        // Debug: Mostrar info de la URL actual
        console.log('Protocol:', window.location.protocol);
        console.log('Hostname:', window.location.hostname);
        console.log('Is BC Online:', isBCOnline);
        console.log('Is iOS:', isIOS);
        
        if (isIOS && window.location.protocol !== 'https:' && !isLocalhost && !isBCOnline) {
            var httpsError = '⚠️ iOS requiere HTTPS para usar el micrófono.\n\n' +
                           'URL actual: ' + window.location.protocol + '//' + window.location.hostname;
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', [httpsError]);
            CreateUIWithError(httpsError);
            return;
        }
        
        // Si es BC Online, debe estar en HTTPS (verificación adicional)
        if (isBCOnline && window.location.protocol !== 'https:') {
            console.warn('BC Online sin HTTPS detectado - esto no debería ocurrir');
        }
        
        recognitionAvailable = true;
        recognition = new SpeechRecognition();
        
        // Configuración adaptada para iOS
        recognition.continuous = !isIOS; // iOS funciona mejor con continuous=false
        recognition.interimResults = true;
        recognition.maxAlternatives = isIOS ? 1 : 5; // iOS no soporta múltiples alternativas bien
        recognition.lang = currentLanguage;
        
        SetupRecognitionHandlers();
        CreateUI();
        
        // iOS requiere solicitar permisos explícitamente
        if (isIOS) {
            RequestMicrophonePermission();
        }
        
    } catch (e) {
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', 
            ['Initialization error: ' + e.message]);
        CreateUIWithError('Error: ' + e.message);
    }
}

// Solicitar permisos en iOS
function RequestMicrophonePermission() {
    // En iOS, necesitamos que el usuario interactúe primero
    var container = document.getElementById('controlAddIn');
    if (!container) return;
    
    var permissionBtn = document.createElement('button');
    permissionBtn.className = 'permission-button';
    permissionBtn.innerHTML = '🎤 Activar Micrófono (Toca aquí)';
    permissionBtn.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 15px 30px;
        background: #007AFF;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,122,255,0.3);
        z-index: 10000;
        cursor: pointer;
        max-width: 90%;
        text-align: center;
    `;
    
    permissionBtn.onclick = function() {
        userInteractionReceived = true;
        permissionBtn.remove();
        
        // Mostrar estado
        UpdateUI('ready');
        
        // Intentar iniciar reconocimiento para solicitar permisos
        setTimeout(function() {
            try {
                recognition.start();
                setTimeout(function() {
                    recognition.stop();
                    UpdateUI('ready');
                    
                    // Confirmar que permisos fueron otorgados
                    var successMsg = document.createElement('div');
                    successMsg.style.cssText = `
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        padding: 10px 20px;
                        background: #34C759;
                        color: white;
                        border-radius: 8px;
                        z-index: 10000;
                    `;
                    successMsg.textContent = '✓ Micrófono activado';
                    container.appendChild(successMsg);
                    
                    setTimeout(function() {
                        successMsg.remove();
                    }, 2000);
                    
                }, 100);
            } catch (e) {
                console.error('Permission error:', e);
                ShowErrorInUI('Error al activar: ' + e.message + '\n\nVerifica permisos en Ajustes > Safari');
            }
        }, 100);
    };
    
    container.appendChild(permissionBtn);
}

function SetupRecognitionHandlers() {
    recognition.onstart = function() {
        isListening = true;
        currentTranscript = '';
        UpdateUI('listening');
    };
    
    recognition.onend = function() {
        isListening = false;
        
        if (currentTranscript.trim().length > 0) {
            ProcessResponse(currentTranscript.trim());
            currentTranscript = '';
        }
        
        UpdateUI('ready');
        
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        
        // En iOS, reiniciar automáticamente si es necesario
        if (isIOS && recognition.continuous === false) {
            // iOS termina automáticamente, podemos reiniciar si queremos continuidad
        }
    };
    
    recognition.onresult = function(event) {
        var interimTranscript = '';
        var finalTranscript = '';
        
        for (var i = event.resultIndex; i < event.results.length; i++) {
            var transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (finalTranscript.length > 0) {
            currentTranscript += finalTranscript;
            
            // Reiniciar temporizador
            if (silenceTimer) {
                clearTimeout(silenceTimer);
            }
            
            // En iOS, detener después del primer resultado final
            if (isIOS) {
                recognition.stop();
            } else {
                silenceTimer = setTimeout(function() {
                    if (currentTranscript.trim().length > 0) {
                        recognition.stop();
                    }
                }, SILENCE_DELAY);
            }
        }
        
        // Mostrar en tiempo real
        DisplayTranscript(currentTranscript, interimTranscript);
    };
    
    recognition.onerror = function(event) {
        var errorMessage = GetErrorMessage(event.error);
        
        // Errores específicos de iOS
        if (isIOS) {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                errorMessage = '⚠️ Permisos de micrófono denegados.\n\n' +
                             'Ve a Ajustes > Safari > Micrófono y activa los permisos para este sitio.\n\n' +
                             'También verifica: Ajustes > Privacidad > Micrófono';
            } else if (event.error === 'no-speech') {
                errorMessage = 'No te escuché. Habla más cerca del micrófono.';
            }
        }
        
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', [errorMessage]);
        UpdateUI('error');
        
        // Mostrar error en UI
        ShowErrorInUI(errorMessage);
    };
}

function ProcessResponse(response) {
    response = AutoCorrectResponse(response);
    Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnVoiceResponse', [response]);
    UpdateUI('processing');
    ShowResponseFeedback(response);
}

function AutoCorrectResponse(text) {
    text = text.toLowerCase();
    text = text.replace(/\b(eh|uhm|mmm|este|bueno)\b/gi, '');
    
    if (text.match(/\b(nada|ninguno|ninguna|no|skip|saltar|siguiente)\b/gi)) {
        return 'ninguno';
    }
    
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

function GetErrorMessage(error) {
    var messages = {
        'no-speech': 'No te escuché. Por favor, repite.',
        'audio-capture': 'No encuentro el micrófono.',
        'not-allowed': '❌ Permisos de micrófono denegados',
        'service-not-allowed': '❌ Servicio de reconocimiento no permitido',
        'network': 'Problema de conexión. Verifica tu internet.',
        'aborted': 'Reconocimiento interrumpido.',
        'language-not-supported': 'Idioma no soportado.'
    };
    
    return messages[error] || 'Error de reconocimiento: ' + error;
}

function CreateUI() {
    var container = document.getElementById('controlAddIn');
    if (!container) {
        container = document.createElement('div');
        container.id = 'controlAddIn';
        document.body.appendChild(container);
    }
    
    var iosWarning = isIOS ? '<div class="ios-notice">📱 Modo iOS: Toca el botón de micrófono para hablar</div>' : '';
    
    container.innerHTML = `
        <div class="conversational-container ${isIOS ? 'ios-mode' : ''}">
            ${iosWarning}
            
            <div class="conversation-status">
                <div class="status-avatar" id="statusAvatar">
                    <div class="avatar-icon">🤖</div>
                    <div class="status-indicator" id="statusIndicator"></div>
                </div>
                <div class="status-message" id="statusMessage">
                    <span class="status-text">Listo para conversar</span>
                </div>
            </div>
            
            <div class="voice-visualizer" id="voiceVisualizer" style="display: none;">
                <div class="visualizer-bar"></div>
                <div class="visualizer-bar"></div>
                <div class="visualizer-bar"></div>
                <div class="visualizer-bar"></div>
                <div class="visualizer-bar"></div>
            </div>
            
            <div class="transcript-display" id="transcriptDisplay">
                <div class="transcript-label">Estás diciendo:</div>
                <div class="transcript-text" id="transcriptText">...</div>
            </div>
            
            <div class="error-display" id="errorDisplay" style="display: none;">
                <div class="error-text"></div>
            </div>
            
            <div class="conversation-controls">
                <button class="control-btn" id="muteBtn" onclick="ToggleMute()" title="Silenciar asistente">
                    🔊
                </button>
                <button class="control-btn" id="repeatBtn" onclick="RepeatQuestion()" title="Repetir pregunta">
                    🔄
                </button>
            </div>
        </div>
    `;
}

function CreateUIWithError(errorMsg) {
    var container = document.getElementById('controlAddIn');
    if (!container) {
        container = document.createElement('div');
        container.id = 'controlAddIn';
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <div class="conversational-container error">
            <div class="error-banner">
                <div class="error-icon">⚠️</div>
                <div class="error-message">${errorMsg}</div>
            </div>
        </div>
    `;
}

function ShowErrorInUI(errorMsg) {
    var errorDisplay = document.getElementById('errorDisplay');
    if (errorDisplay) {
        errorDisplay.style.display = 'block';
        errorDisplay.querySelector('.error-text').textContent = errorMsg;
        
        setTimeout(function() {
            errorDisplay.style.display = 'none';
        }, 5000);
    }
}

function UpdateUI(state) {
    var statusIndicator = document.getElementById('statusIndicator');
    var statusMessage = document.getElementById('statusMessage');
    var visualizer = document.getElementById('voiceVisualizer');
    var container = document.querySelector('.conversational-container');
    
    if (!statusIndicator || !statusMessage || !container) return;
    
    container.classList.remove('listening', 'speaking', 'processing', 'ready', 'error');
    
    switch(state) {
        case 'listening':
            container.classList.add('listening');
            statusMessage.innerHTML = '<span class="status-text">🎤 Escuchando...</span>';
            if (visualizer) visualizer.style.display = 'flex';
            break;
        case 'speaking':
            container.classList.add('speaking');
            statusMessage.innerHTML = '<span class="status-text">🗣️ Hablando...</span>';
            if (visualizer) visualizer.style.display = 'none';
            break;
        case 'processing':
            container.classList.add('processing');
            statusMessage.innerHTML = '<span class="status-text">⏳ Procesando...</span>';
            if (visualizer) visualizer.style.display = 'none';
            break;
        case 'error':
            container.classList.add('error');
            statusMessage.innerHTML = '<span class="status-text">❌ Error</span>';
            if (visualizer) visualizer.style.display = 'none';
            break;
        default:
            container.classList.add('ready');
            statusMessage.innerHTML = '<span class="status-text">✅ Listo</span>';
            if (visualizer) visualizer.style.display = 'none';
    }
}

function DisplayTranscript(final, interim) {
    var transcriptText = document.getElementById('transcriptText');
    if (transcriptText) {
        var fullText = final;
        if (interim) {
            fullText += '<span class="interim">' + interim + '</span>';
        }
        transcriptText.innerHTML = fullText || '...';
    }
}

function ShowResponseFeedback(response) {
    var transcriptText = document.getElementById('transcriptText');
    if (transcriptText) {
        transcriptText.innerHTML = '<span class="confirmed">✓ ' + response + '</span>';
        
        setTimeout(function() {
            transcriptText.innerHTML = '...';
        }, 2000);
    }
}

function Speak(text) {
    if (!synthesis) return;
    
    synthesis.cancel();
    
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentLanguage;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = function() {
        isSpeaking = true;
        UpdateUI('speaking');
    };
    
    utterance.onend = function() {
        isSpeaking = false;
        UpdateUI('ready');
        
        setTimeout(function() {
            if (!isListening) {
                StartListening();
            }
        }, 500);
    };
    
    utterance.onerror = function(event) {
        isSpeaking = false;
        UpdateUI('ready');
        console.error('Speech synthesis error:', event);
    };
    
    synthesis.speak(utterance);
}

function StartListening() {
    if (!recognitionAvailable) {
        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', 
            ['Speech recognition is not available.']);
        return;
    }
    
    // En iOS, verificar interacción del usuario
    if (isIOS && !userInteractionReceived) {
        RequestMicrophonePermission();
        return;
    }
    
    if (isSpeaking) {
        setTimeout(StartListening, 500);
        return;
    }
    
    if (!isListening) {
        try {
            recognition.lang = currentLanguage;
            recognition.start();
        } catch (e) {
            if (e.name === 'InvalidStateError') {
                recognition.stop();
                setTimeout(function() {
                    try {
                        recognition.start();
                    } catch (retryError) {
                        Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', 
                            ['Failed to start after retry: ' + retryError.message]);
                    }
                }, 200);
            } else if (e.name === 'NotAllowedError') {
                var permError = isIOS 
                    ? '⚠️ Permisos denegados. Ve a Ajustes > Safari > Micrófono'
                    : 'Permisos de micrófono denegados';
                Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', [permError]);
                ShowErrorInUI(permError);
            } else {
                Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', 
                    ['Failed to start: ' + e.message]);
            }
        }
    }
}

function StopListening() {
    if (isListening && recognition) {
        try {
            recognition.stop();
        } catch (e) {
            Microsoft.Dynamics.NAV.InvokeExtensibilityMethod('OnError', 
                ['Failed to stop: ' + e.message]);
        }
    }
}

function AskQuestion(question) {
    Speak(question);
}

function SetLanguage(language) {
    currentLanguage = language;
    if (recognition) {
        recognition.lang = language;
    }
}

var isMuted = false;
var lastQuestion = '';

function ToggleMute() {
    isMuted = !isMuted;
    var muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
        muteBtn.title = isMuted ? 'Activar voz del asistente' : 'Silenciar asistente';
    }
}

function RepeatQuestion() {
    if (lastQuestion) {
        Speak(lastQuestion);
    }
}

var originalAskQuestion = AskQuestion;
AskQuestion = function(question) {
    lastQuestion = question;
    if (!isMuted) {
        originalAskQuestion(question);
    } else {
        UpdateUI('ready');
        setTimeout(StartListening, 500);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', InitializeControl);
} else {
    InitializeControl();
}