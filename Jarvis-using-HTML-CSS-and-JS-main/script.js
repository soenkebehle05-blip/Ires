/* ==========================================================================
   I.R.E.S. — Anwendungslogik mit Modal-Login, Gedächtnis & Kalender
   ========================================================================== */

/* Globale Hilfsfunktionen für Schnellbefehle */
function sendQuickCommand(text) {
    const input = document.getElementById('user-input');
    if (input) {
        input.value = text;
        if (typeof window.handleSubmit === 'function') {
            window.handleSubmit();
        }
    }
}

function setQuickInput(text) {
    const input = document.getElementById('user-input');
    if (input) {
        input.value = text;
        input.focus();
    }
}

(() => {
    'use strict';

    /* ---------- Element-Referenzen ---------- */
    const outputArea = document.getElementById('output-area');
    const inputField = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const reactor = document.getElementById('reactor');
    const waveform = document.getElementById('waveform');
    const statusDot = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const clockEl = document.getElementById('clock');
    const themeToggle = document.getElementById('theme-toggle');
    const activityLog = document.getElementById('activity-log');
    const notesList = document.getElementById('notes-list');
    const notesCount = document.getElementById('notes-count');
    const readoutDate = document.getElementById('readout-date');
    const readoutUptime = document.getElementById('readout-uptime');
    const readoutBattery = document.getElementById('readout-battery');
    const readoutVoice = document.getElementById('readout-voice');
    const readoutMic = document.getElementById('readout-mic');

    /* Einstellungsmenü Elemente */
    const settingsMenu = document.getElementById('settings-menu');
    const icalUrlInput = document.getElementById('ical-url-input');
    const saveIcalBtn = document.getElementById('save-ical-btn');
    const icalStatusMsg = document.getElementById('ical-status-msg');
    const closeMenuBtn = document.getElementById('close-menu-btn');

    /* Auth Modal Elemente */
    const authModal = document.getElementById('auth-modal');
    const authTitle = document.getElementById('auth-title');
    const authEmailInput = document.getElementById('auth-email');
    const emailField = document.getElementById('email-field');
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authRememberInput = document.getElementById('auth-remember');
    const authError = document.getElementById('auth-error');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleBtn = document.getElementById('auth-toggle-btn');

    let isRegisterMode = false;
    let currentUser = localStorage.getItem('ires_active_user') || null;
    let currentEmail = localStorage.getItem('ires_active_email') || null;

    /* ---------- Benutzerspezifischer Speicher ---------- */
    const store = {
        get voiceOn() { return localStorage.getItem('ires_voice') !== 'off'; },
        set voiceOn(v) { localStorage.setItem('ires_voice', v ? 'on' : 'off'); },
        get theme() { return localStorage.getItem('ires_theme') || 'cyan'; },
        set theme(v) { localStorage.setItem('ires_theme', v); },

        get notes() {
            if (!currentUser) return [];
            try { return JSON.parse(localStorage.getItem(`ires_notes_${currentUser}`) || '[]'); } catch { return []; }
        },
        set notes(v) {
            if (currentUser) localStorage.setItem(`ires_notes_${currentUser}`, JSON.stringify(v));
        },
        get chatHistory() {
            if (!currentUser) return [];
            try { return JSON.parse(localStorage.getItem(`ires_chat_${currentUser}`) || '[]'); } catch { return []; }
        },
        set chatHistory(v) {
            if (currentUser) localStorage.setItem(`ires_chat_${currentUser}`, JSON.stringify(v));
        },
        get memory() {
            if (!currentUser) return {};
            try { return JSON.parse(localStorage.getItem(`ires_memory_${currentUser}`) || '{}'); } catch { return {}; }
        },
        set memory(v) {
            if (currentUser) localStorage.setItem(`ires_memory_${currentUser}`, JSON.stringify(v));
        },
        get icalUrl() {
            if (currentEmail && localStorage.getItem(`ires_ical_${currentEmail}`)) {
                return localStorage.getItem(`ires_ical_${currentEmail}`);
            }
            return localStorage.getItem('ires_global_ical') || '';
        },
        set icalUrl(v) {
            if (currentEmail) localStorage.setItem(`ires_ical_${currentEmail}`, v);
            localStorage.setItem('ires_global_ical', v);
        }
    };

    let history = [];
    let historyIndex = -1;
    const bootTime = Date.now();

    /* ==========================================================================
       AUTHENTIFIZIERUNG / POPUP-MODAL
       ========================================================================== */
    function getUsersDB() {
        try { return JSON.parse(localStorage.getItem('ires_users_db') || '{}'); } catch { return {}; }
    }

    function saveUsersDB(db) {
        localStorage.setItem('ires_users_db', JSON.stringify(db));
    }

    function checkSessionExpired() {
        const sessionExp = localStorage.getItem('ires_session_exp');
        if (sessionExp) {
            if (Date.now() > parseInt(sessionExp, 10)) {
                logoutUser();
                return true;
            }
        }
        return false;
    }

    function applyRememberMe(rememberMe) {
        if (rememberMe) {
            const thirtyDays = Date.now() + (30 * 24 * 60 * 60 * 1000);
            localStorage.setItem('ires_session_exp', thirtyDays.toString());
        } else {
            localStorage.removeItem('ires_session_exp');
        }
    }

    function handleAuthSubmit() {
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value.trim();
        const email = authEmailInput.value.trim();
        const rememberMe = authRememberInput.checked;

        const db = getUsersDB();

        if (isRegisterMode) {
            if (!email || !username || !password) {
                authError.textContent = 'Bitte E-Mail, Benutzernamen und Passwort ausfüllen.';
                return;
            }
            if (db[username.toLowerCase()]) {
                authError.textContent = 'Benutzername existiert bereits.';
                return;
            }
            db[username.toLowerCase()] = { username, email, password };
            saveUsersDB(db);
            currentUser = username;
            currentEmail = email;
            localStorage.setItem('ires_active_user', currentUser);
            localStorage.setItem('ires_active_email', currentEmail);
            applyRememberMe(rememberMe);
            closeModal();
            onLoginSuccess(`Konto erstellt. Willkommen, ${currentUser}!`);
        } else {
            if (!username || !password) {
                authError.textContent = 'Bitte Benutzernamen und Passwort ausfüllen.';
                return;
            }
            const user = db[username.toLowerCase()];
            if (!user || user.password !== password) {
                authError.textContent = 'Zugangsdaten ungültig.';
                return;
            }
            currentUser = user.username;
            currentEmail = user.email;
            localStorage.setItem('ires_active_user', currentUser);
            localStorage.setItem('ires_active_email', currentEmail || '');
            applyRememberMe(rememberMe);
            closeModal();
            onLoginSuccess(`Willkommen zurück, ${currentUser}, Sir!`);
        }
    }

    function toggleAuthMode() {
        isRegisterMode = !isRegisterMode;
        authError.textContent = '';
        if (isRegisterMode) {
            authTitle.textContent = 'NEUES KONTO ERSTELLEN';
            emailField.style.display = 'block';
            authSubmitBtn.textContent = 'REGISTRIEREN';
            authToggleBtn.textContent = 'Bereits registriert? Anmelden';
        } else {
            authTitle.textContent = 'SYSTEM-AUTHENTIFIZIERUNG';
            emailField.style.display = 'none';
            authSubmitBtn.textContent = 'ANMELDEN';
            authToggleBtn.textContent = 'Neues Konto erstellen';
        }
    }

    function showModal() {
        if (authModal) authModal.classList.remove('hidden');
    }

    function closeModal() {
        if (authModal) authModal.classList.add('hidden');
        authUsernameInput.value = '';
        authPasswordInput.value = '';
        authEmailInput.value = '';
        authRememberInput.checked = false;
        authError.textContent = '';
    }

    function onLoginSuccess(welcomeMsg) {
        logActivity(`Benutzer '${currentUser}' angemeldet.`);
        setStatus('idle');
        renderNotes();
        loadSavedChat();
        if (icalUrlInput) icalUrlInput.value = store.icalUrl;
        printIres(welcomeMsg, { speakToo: true });
    }

    function logoutUser() {
        currentUser = null;
        currentEmail = null;
        localStorage.removeItem('ires_active_user');
        localStorage.removeItem('ires_active_email');
        localStorage.removeItem('ires_session_exp');
        outputArea.innerHTML = '';
        renderNotes();
        logActivity('Benutzer abgemeldet.');
        showModal();
    }

    function loadSavedChat() {
        outputArea.innerHTML = '';
        const saved = store.chatHistory;
        if (saved.length > 0) {
            saved.forEach(msg => {
                if (msg.sender === 'user') printUserUI(msg.text);
                else printIresUI(msg.text);
            });
            scrollToBottom();
        }
    }

    function saveMessage(sender, text) {
        if (!currentUser) return;
        const current = store.chatHistory;
        current.push({ sender, text, time: new Date().toISOString() });
        if (current.length > 100) current.shift();
        store.chatHistory = current;
    }

    /* ==========================================================================
       BOOT / SYSTEM-START
       ========================================================================== */
    function boot() {
        if (store.theme === 'amber') document.body.classList.add('theme-amber');
        readoutVoice.textContent = store.voiceOn ? 'AN' : 'AUS';
        tickClock();
        setInterval(tickClock, 1000);
        setStatus('idle');
        initBattery();

        // Einstellungsmenü beim Boot sicherheitshalber ausblenden
        if (settingsMenu) {
            settingsMenu.classList.add('hidden');
        }

        if (currentUser && !checkSessionExpired()) {
            logActivity(`Benutzer '${currentUser}' authentifiziert.`);
            renderNotes();
            loadSavedChat();
            if (icalUrlInput) icalUrlInput.value = store.icalUrl;
        } else {
            showModal();
        }
    }

    function tickClock() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour12: false });

        if (readoutDate) {
            readoutDate.textContent = now.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }

        const uptimeMs = Date.now() - bootTime;
        const s = Math.floor(uptimeMs / 1000) % 60;
        const m = Math.floor(uptimeMs / 60000) % 60;
        const h = Math.floor(uptimeMs / 3600000);
        readoutUptime.textContent = [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }

    function initBattery() {
        if (navigator.getBattery) {
            navigator.getBattery().then(bat => {
                const update = () => {
                    readoutBattery.textContent = `${Math.round(bat.level * 100)}\%${bat.charging ? ' ⚡' : ''}`;
                };
                update();
                bat.addEventListener('levelchange', update);
                bat.addEventListener('chargingchange', update);
            }).catch(() => { readoutBattery.textContent = 'N/A'; });
        } else {
            readoutBattery.textContent = 'N/A';
        }
    }

    /* ==========================================================================
       STATUS & REAKTOR ANIMATION
       ========================================================================== */
    function setStatus(state) {
        statusDot.className = 'status-dot';
        reactor.className = '';
        waveform.classList.remove('active');
        switch (state) {
            case 'idle':
                statusDot.classList.add('on');
                statusLabel.textContent = currentUser ? currentUser.toUpperCase() : 'ONLINE';
                break;
            case 'thinking':
                statusDot.classList.add('busy');
                statusLabel.textContent = 'ANALYSE...';
                break;
            case 'listening':
                statusDot.classList.add('listening');
                statusLabel.textContent = 'ZUHÖREN';
                reactor.classList.add('listening');
                readoutMic.textContent = 'AKTIV';
                break;
            case 'speaking':
                statusDot.classList.add('busy');
                statusLabel.textContent = 'SPRICHT';
                reactor.classList.add('speaking');
                waveform.classList.add('active');
                animateWaveform();
                break;
        }
        if (state !== 'listening') readoutMic.textContent = 'INAKTIV';
    }

    let waveformTimer = null;
    function animateWaveform() {
        clearInterval(waveformTimer);
        const bars = waveform.querySelectorAll('span');
        waveformTimer = setInterval(() => {
            bars.forEach(b => { b.style.height = waveform.classList.contains('active') ? `${4 + Math.random() * 16}px` : '4px'; });
        }, 110);
    }
    function stopWaveform() {
        clearInterval(waveformTimer);
        waveform.classList.remove('active');
        waveform.querySelectorAll('span').forEach(b => b.style.height = '4px');
    }

    /* ==========================================================================
       LOGS & NOTIZEN
       ========================================================================== */
    function logActivity(text) {
        const li = document.createElement('li');
        const t = new Date().toLocaleTimeString([], { hour12: false });
        li.innerHTML = `<b>${t}</b> —${text}`;
        activityLog.insertBefore(li, activityLog.firstChild);
        while (activityLog.children.length > 8) activityLog.removeChild(activityLog.lastChild);
    }

    function renderNotes() {
        if (!currentUser) {
            notesCount.textContent = `(0)`;
            notesList.innerHTML = '<li class="notes-empty">Anmeldung erforderlich.</li>';
            return;
        }
        const notes = store.notes;
        notesCount.textContent = `(${notes.length})`;
        notesList.innerHTML = '';
        if (notes.length === 0) {
            notesList.innerHTML = '<li class="notes-empty">Keine Memos vorhanden. Schreiben Sie "Notiz: ..."</li>';
            return;
        }
        notes.forEach((n, i) => {
            const li = document.createElement('li');
            li.textContent = n;
            const del = document.createElement('span');
            del.className = 'note-del';
            del.textContent = '✕';
            del.title = 'Eintrag löschen';
            del.onclick = () => {
                const updated = store.notes.filter((_, idx) => idx !== i);
                store.notes = updated;
                renderNotes();
                logActivity('Memo gelöscht.');
            };
            li.appendChild(del);
            notesList.appendChild(li);
        });
    }

    /* ==========================================================================
       GOOGLE KALENDER (Verbesserte Parsing-Logik)
       ========================================================================== */
    async function fetchCalendarEvents() {
        const rawUrl = store.icalUrl || (icalUrlInput ? icalUrlInput.value.trim() : '');
        if (!rawUrl) {
            return "Kein Google-Kalender-Link hinterlegt, Sir. Bitte tragen Sie ihn im Einstellungsmenü oben rechts ein.";
        }

        // Bereinigen des Links
        const url = rawUrl.trim();

        try {
            // Nutzen eines stabilen CORS-Proxies
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error("Netzwerkantwort war nicht OK");
            
            const data = await res.json();
            const text = data.contents;

            if (!text || !text.includes('BEGIN:VCALENDAR')) {
                return "Der Kalender konnte nicht gelesen werden. Bitte prüfen Sie den iCal-Link im Einstellungsmenü.";
            }

            // Erkennung von Terminen Blöcken
            const eventBlocks = text.split('BEGIN:VEVENT');
            if (eventBlocks.length <= 1) {
                return "Ich konnte keine Termine in Ihrem Kalender finden, Sir.";
            }

            let events = [];
            
            for (let i = 1; i < eventBlocks.length; i++) {
                const block = eventBlocks[i];
                const summaryMatch = block.match(/SUMMARY:(.*)/);
                
                if (summaryMatch) {
                    let title = summaryMatch[1].replace('\r', '').trim();
                    if (title) events.push(title);
                } else {
                    // Falls der Kalender auf "Nur verfügbar (keine Details)" gesetzt ist
                    events.push("Belegter Termin (Keine Details freigegeben)");
                }
            }

            if (events.length === 0) {
                return "Keine anstehenden Termine in den Kalenderdaten gefunden, Sir.";
            }

            // Duplikate filtern
            const uniqueEvents = [...new Set(events)];
            let output = "Ihre nächsten Kalender-Einträge:\n";
            uniqueEvents.slice(0, 5).forEach(ev => {
                output += `• ${ev}\n`;
            });
            return output;

        } catch (e) {
            return "Fehler beim Abrufen des Kalenders. Bitte vergewissern Sie sich, dass der iCal-Link korrekt abgespeichert ist.";
        }
    }

    /* ==========================================================================
       SPRACHAUSGABE & I/O
       ========================================================================== */
    let preferredVoice = null;
    function pickVoice() {
        const voices = speechSynthesis.getVoices();
        preferredVoice =
            voices.find(v => /Google Deutsch|Marlene|Vicki|Hans|de-DE/i.test(v.name)) ||
            voices.find(v => /de-DE/i.test(v.lang)) ||
            voices.find(v => /de/i.test(v.lang)) ||
            voices[0] || null;
    }
    if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = pickVoice;
        pickVoice();
    }

    function speak(text) {
        if (!store.voiceOn || !('speechSynthesis' in window)) return;

        const cleanText = text.replace(/[*_#`]/g, '');
        const utter = new SpeechSynthesisUtterance(cleanText);
        if (preferredVoice) utter.voice = preferredVoice;
        utter.lang = 'de-DE';
        utter.rate = 1.0;
        utter.pitch = 0.85;
        utter.onstart = () => setStatus('speaking');
        utter.onend = () => { stopWaveform(); setStatus('idle'); };
        utter.onerror = () => { stopWaveform(); setStatus('idle'); };

        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(utter), 60);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;
    let isRecording = false;

    if (SpeechRecognition) {
        recognizer = new SpeechRecognition();
        recognizer.lang = 'de-DE';
        recognizer.interimResults = false;
        recognizer.maxAlternatives = 1;

        recognizer.onstart = () => { isRecording = true; micBtn.classList.add('recording'); setStatus('listening'); };
        recognizer.onend = () => { isRecording = false; micBtn.classList.remove('recording'); if (statusLabel.textContent === 'ZUHÖREN') setStatus('idle'); };
        recognizer.onerror = () => { isRecording = false; micBtn.classList.remove('recording'); setStatus('idle'); };
        recognizer.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            inputField.value = transcript;
            handleSubmit();
        };
    } else {
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.title = 'Spracheingabe wird nicht unterstützt.';
            micBtn.style.opacity = 0.35;
        }
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (!recognizer) return;
            if (isRecording) { recognizer.stop(); } else { try { recognizer.start(); } catch (_) { } }
        });
    }

    /* ==========================================================================
       INTERFACE DRUCK & PARSER
       ========================================================================== */
    function printUserUI(text) {
        const div = document.createElement('div');
        div.className = 'user-command';
        div.innerHTML = `<strong>${currentUser || 'Sie'}</strong>${escapeHtml(text)}`;
        outputArea.appendChild(div);
    }

    function printIresUI(text) {
        const div = document.createElement('div');
        div.className = 'jarvis-response';
        div.textContent = text;
        outputArea.appendChild(div);
    }

    function printUser(text) {
        printUserUI(text);
        saveMessage('user', text);
        scrollToBottom();
    }

    function printIres(text, { speakToo = true } = {}) {
        saveMessage('ires', text);
        const div = document.createElement('div');
        div.className = 'jarvis-response';
        outputArea.appendChild(div);
        scrollToBottom();

        if (speakToo) speak(text);
        else setStatus('idle');

        let i = 0;
        const speed = Math.max(6, 22 - Math.floor(text.length / 40));
        const timer = setInterval(() => {
            div.textContent += text.charAt(i);
            i++;
            scrollToBottom();
            if (i >= text.length) clearInterval(timer);
        }, speed);
    }

    function scrollToBottom() {
        const wrap = document.getElementById('jarvis-output');
        if (wrap) wrap.scrollTop = wrap.scrollHeight;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ==========================================================================
       BEFEHLE & BEANTWORTUNG
       ========================================================================== */
    const jokes = [
        "Warum können Atomphysiker nicht lügen? Weil sie alles erfinden, Sir.",
        "Ich würde Ihnen einen UDP-Witz erzählen, aber es könnte sein, dass er nicht bei Ihnen ankommt.",
        "Es gibt 10 Arten von Menschen auf der Welt: Diejenigen, die Binärzahlen verstehen, und die, die es nicht tun.",
        "Warum bevorzugen Entwickler den Dark Mode? Weil Licht Bugs anzieht, Sir."
    ];

    async function fetchWeather(place) {
        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=de`);
            const geo = await geoRes.json();
            if (!geo.results || !geo.results.length) return `Ich konnte keinen Standort namens "${place}" finden, Sir.`;
            const { latitude, longitude, name, country } = geo.results[0];
            const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`);
            const w = await wRes.json();
            const c = w.current;
            return `Wetter für ${name}, ${country}: ${c.temperature_2m}°C, Luftfeuchtigkeit: ${c.relative_humidity_2m}%, Wind: ${c.wind_speed_10m} km/h.`;
        } catch {
            return "Verbindung zum Wetterdienst fehlgeschlagen, Sir.";
        }
    }

    const rules = [
        {
            test: l => l.includes('hilfe') || l.includes('befehle') || l.includes('was kannst du'),
            run: () => {
                return `Verfügbare Befehle:\n` +
                       `• "Wie viel Uhr ist es?" — Zeigt die aktuelle Uhrzeit an\n` +
                       `• "Welches Datum ist heute?" — Zeigt das Datum an\n` +
                       `• "Suche [Suchbegriff]" — Öffnet Google-Suche im neuen Fenster\n` +
                       `• "Kalender" / "Termine" — Liest deinen Google Kalender aus\n` +
                       `• "Wetter in [Ort]" — Ruft das aktuelle Wetter ab\n` +
                       `• "Merke dir: [Text]" — Speichert eine Information\n` +
                       `• "Was weißt du über mich?" — Zeigt alle gespeicherten Erinnerungen\n` +
                       `• "Gedächtnis löschen" — Löscht alle gespeicherten Fakten\n` +
                       `• "Notizen anzeigen" — Zeigt deine Notizen an\n` +
                       `• "Notiz: [Text]" — Erstellt einen Eintrag in der Notizliste\n` +
                       `• "Wie viel Akku habe ich?" — Zeigt den Akkustand an\n` +
                       `• "Erzähl mir einen Witz" — Gibt einen zufälligen Witz aus\n` +
                       `• "Abmelden" — Loggt dich aus dem System aus`;
            }
        },
        {
            test: l => l === 'abmelden' || l === 'logout',
            run: () => { logoutUser(); return "Sie wurden abgemeldet."; }
        },
        {
            test: l => l.includes('kalender') || l.includes('termine') || l.includes('was steht an'),
            run: async () => {
                return await fetchCalendarEvents();
            }
        },
        {
            test: l => l.includes('datum') || l.includes('welcher tag'),
            run: () => {
                const today = new Date().toLocaleDateString('de-DE', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
                return `Heute ist ${today}, Sir.`;
            }
        },
        {
            test: l => l.startsWith('suche') || l.startsWith('google'),
            run: (raw) => {
                const query = raw.replace(/^suche nach|^suche|^google/i, '').trim();
                if (!query) return "Was soll ich für Sie suchen, Sir?";
                window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                logActivity(`Websuche gestartet: ${query}`);
                return `Ich habe ein neues Fenster für die Suche nach "${query}" geöffnet, Sir.`;
            }
        },
        {
            test: l => l === 'notizen' || l.includes('notizen anzeigen') || l.includes('meine notizen') || l.includes('welche notizen'),
            run: () => {
                const notes = store.notes;
                if (notes.length === 0) return "Sie haben aktuell keine Memos oder Notizen gespeichert, Sir.";
                return `Ihre gespeicherten Notizen:\n- ` + notes.join('\n- ');
            }
        },
        {
            test: l => l.startsWith('notiz:'),
            run: (raw) => {
                const content = raw.replace(/^notiz:/i, '').trim();
                if (!content) return "Inhalt der Notiz fehlt. Beispiel: 'Notiz: Einkaufen gehen'";
                const notes = store.notes;
                notes.push(content);
                store.notes = notes;
                renderNotes();
                return `Notiz gespeichert: "${content}".`;
            }
        },
        {
            test: l => /^merke dir:?|^merke:?|^vermerke:?|^erinnere dich:?/.test(l) || /^mein(e)? \w+ ist/.test(l) || /^ich heiße/.test(l),
            run: (raw, l) => {
                let fact = raw.replace(/^merke dir:?|^merke:?|^vermerke:?|^erinnere dich:?/i, '').trim();
                let key = "allgemein";
                let value = fact;

                if (l.includes('heiß') || l.includes('name')) {
                    key = "name";
                    value = raw.replace(/.*(?:heiße|name ist)\s+/i, '').trim();
                } else if (l.includes('hund') || l.includes('katze') || l.includes('haustier')) {
                    key = "haustier";
                }

                const mem = store.memory;
                if (key !== "allgemein") {
                    mem[key] = value;
                } else {
                    if (!Array.isArray(mem.fakten)) {
                        mem.fakten = [];
                    }
                    mem.fakten.push(value);
                }
                store.memory = mem;
                logActivity('Erinnerung gespeichert.');
                return `Verstanden, Sir. Ich habe mir gemerkt: "${value}".`;
            }
        },
        {
            test: l => l.includes('was weißt du') || l.includes('über mich') || l.includes('was hast du dir gemerkt') || l.includes('wie heiße ich') || l.includes('wer bin ich'),
            run: (raw, l) => {
                const mem = store.memory;
                if (l.includes('wie heiße ich') || l.includes('wer bin ich')) {
                    if (mem.name) return `Sie heißen ${mem.name}, Sir.`;
                    return `Sie sind als ${currentUser} angemeldet, Sir.`;
                }

                let results = [];
                if (mem.name) results.push(`Name: ${mem.name}`);
                if (mem.haustier) results.push(`Haustier: ${mem.haustier}`);
                if (mem.fakten && Array.isArray(mem.fakten) && mem.fakten.length > 0) {
                    results.push(`Weitere Fakten:\n- ` + mem.fakten.join('\n- '));
                }

                if (results.length === 0) return "Ich habe noch keine spezifischen Erinnerungen über Sie gespeichert, Sir.";
                return `Erinnerungen über Sie, Sir:\n${results.join('\n')}`;
            }
        },
        {
            test: l => l.includes('gedächtnis löschen'),
            run: () => { store.memory = {}; return "Speicher wurde geleert, Sir."; }
        },
        {
            test: l => /^hallo\b|^hi\b|^hey\b|^ires\b/.test(l),
            run: () => `Stets zu Diensten, ${currentUser || 'Sir'}.`
        },
        {
            test: l => /^wetter|wetter (in|für)/.test(l),
            run: async (raw) => {
                const match = raw.match(/wetter (?:in|für)\s+(.+)/i);
                return match ? await fetchWeather(match[1].trim()) : "Bitte nennen Sie einen Ort.";
            }
        },
        {
            test: l => l.includes('wie viel uhr') || l.includes('uhrzeit'),
            run: () => `Es ist ${new Date().toLocaleTimeString('de-DE')} Uhr.`
        },
        {
            test: l => l.includes('akku') || l.includes('batterie'),
            run: () => {
                const batVal = readoutBattery ? readoutBattery.textContent : '--%';
                return `Der aktuelle Akkustand beträgt ${batVal}, Sir.`;
            }
        },
        {
            test: l => l.includes('witz'),
            run: () => jokes[Math.floor(Math.random() * jokes.length)]
        }
    ];

    /* ==========================================================================
       EVENT LISTENER & MENÜ-STEUERUNG
       ========================================================================== */
    async function handleSubmit() {
        const raw = inputField.value.trim();
        if (!raw) return;

        history.push(raw);
        historyIndex = history.length;

        printUser(raw);
        inputField.value = '';
        setStatus('thinking');

        const lower = raw.toLowerCase();
        const matched = rules.find(r => r.test(lower));

        await new Promise(res => setTimeout(res, 200));

        let response = matched ? await matched.run(raw, lower) : "Diesen Befehl kenne ich nicht, Sir. Schreiben Sie 'Hilfe' für alle Befehle.";
        printIres(response);
    }

    window.handleSubmit = handleSubmit;

    if (authSubmitBtn) authSubmitBtn.addEventListener('click', handleAuthSubmit);
    if (authToggleBtn) authToggleBtn.addEventListener('click', toggleAuthMode);
    if (authPasswordInput) authPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });

    if (sendBtn) sendBtn.addEventListener('click', handleSubmit);
    if (inputField) inputField.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });

    /* Kalender Speichern */
    if (saveIcalBtn) {
        saveIcalBtn.addEventListener('click', () => {
            const val = icalUrlInput.value.trim();
            store.icalUrl = val;
            if (icalStatusMsg) {
                icalStatusMsg.textContent = 'iCal-Link gespeichert!';
                setTimeout(() => { icalStatusMsg.textContent = ''; }, 3000);
            }
            logActivity('Kalender-Link aktualisiert.');
        });
    }

    /* KORREKTUR: Menü Schließen Button */
    if (closeMenuBtn) {
        closeMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (settingsMenu) {
                settingsMenu.classList.add('hidden');
            }
        });
    }

    /* KORREKTUR: Theme- / Einstellungen-Toggle Button */
    let themeClickTimer = null;
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            if (themeClickTimer === null) {
                themeClickTimer = setTimeout(() => {
                    themeClickTimer = null;
                    if (settingsMenu) {
                        settingsMenu.classList.toggle('hidden');
                    }
                }, 250);
            }
        });

        themeToggle.addEventListener('dblclick', () => {
            clearTimeout(themeClickTimer);
            themeClickTimer = null;
            document.body.classList.toggle('theme-amber');
            store.theme = document.body.classList.contains('theme-amber') ? 'amber' : 'cyan';
        });
    }

    boot();
})();
