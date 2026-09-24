/* ==========================================================================
   I.R.E.S. — Anwendungslogik mit Benutzerverwaltung & Langzeitgedächtnis
   ========================================================================== */
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

    /* ---------- Benutzersystem & Speicher (LocalStorage) ---------- */
    let currentUser = localStorage.getItem('ires_active_user') || null;

    const store = {
        // Allgemeine Einstellungen
        get voiceOn() { return localStorage.getItem('ires_voice') !== 'off'; },
        set voiceOn(v) { localStorage.setItem('ires_voice', v ? 'on' : 'off'); },
        get theme() { return localStorage.getItem('ires_theme') || 'cyan'; },
        set theme(v) { localStorage.setItem('ires_theme', v); },

        // Benutzerspezifische Daten
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
        }
    };

    let history = [];
    let historyIndex = -1;
    const bootTime = Date.now();

    /* ==========================================================================
       AUTHENTIFIZIERUNG / USER-MANAGEMENT
       ========================================================================== */
    function getUsersDB() {
        try { return JSON.parse(localStorage.getItem('ires_users_db') || '{}'); } catch { return {}; }
    }

    function saveUsersDB(db) {
        localStorage.setItem('ires_users_db', JSON.stringify(db));
    }

    function registerUser(username, password) {
        const db = getUsersDB();
        if (db[username.toLowerCase()]) {
            return { success: false, msg: 'Benutzername existiert bereits, Sir.' };
        }
        db[username.toLowerCase()] = { username, password }; // Im echten Betrieb verhashen
        saveUsersDB(db);
        return { success: true, msg: 'Konto erfolgreich angelegt.' };
    }

    function loginUser(username, password) {
        const db = getUsersDB();
        const user = db[username.toLowerCase()];
        if (!user || user.password !== password) {
            return { success: false, msg: 'Zugangsdaten ungültig, Sir.' };
        }
        currentUser = user.username;
        localStorage.setItem('ires_active_user', currentUser);
        return { success: true, msg: `Willkommen zurück, ${currentUser}.` };
    }

    function logoutUser() {
        currentUser = null;
        localStorage.removeItem('ires_active_user');
        outputArea.innerHTML = '';
        renderNotes();
        logActivity('Benutzer abgemeldet.');
        printIres("Sie wurden abgemeldet, Sir. Bitte melden Sie sich mit 'Anmelden [Name] [Passwort]' an.", { speakToo: false });
    }

    function loadSavedChat() {
        outputArea.innerHTML = '';
        const saved = store.chatHistory;
        if (saved.length === 0) {
            printIres(`I.R.E.S. Schnittstelle bereit. Angemeldet als **${currentUser}**. Wie kann ich helfen, Sir?`, { speakToo: false });
        } else {
            saved.forEach(msg => {
                if (msg.sender === 'user') {
                    printUserUI(msg.text);
                } else {
                    printIresUI(msg.text);
                }
            });
            scrollToBottom();
        }
    }

    function saveMessage(sender, text) {
        if (!currentUser) return;
        const current = store.chatHistory;
        current.push({ sender, text, time: new Date().toISOString() });
        // Maximal 100 Nachrichten pro Chat speichern
        if (current.length > 100) current.shift();
        store.chatHistory = current;
    }

    /* ==========================================================================
       STARTUP (BOOT)
       ========================================================================== */
    function boot() {
        if (store.theme === 'amber') document.body.classList.add('theme-amber');
        readoutVoice.textContent = store.voiceOn ? 'AN' : 'AUS';
        tickClock();
        setInterval(tickClock, 1000);
        setStatus('idle');
        initBattery();

        if (currentUser) {
            logActivity(`Benutzer '${currentUser}' authentifiziert.`);
            renderNotes();
            loadSavedChat();
        } else {
            logActivity('I.R.E.S. Bereit. Nicht angemeldet.');
            renderNotes();
            printIres("Willkommen bei I.R.E.S. Bitte melden Sie sich an oder registrieren Sie sich.\nBefehle: `Registrieren [Name] [Passwort]` oder `Anmelden [Name] [Passwort]`", { speakToo: false });
        }
    }

    function tickClock() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
        readoutDate.textContent = now.toLocaleDateString('de-DE', { month: 'short', day: 'numeric', year: 'numeric' });
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
       STATUS / REAKTOR-STATUS
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
       PROTOKOLLIERUNG / NOTIZEN
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
            notesList.innerHTML = '<li class="notes-empty">Bitte anmelden, um Notizen zu sehen.</li>';
            return;
        }
        const notes = store.notes;
        notesCount.textContent = `(${notes.length})`;
        notesList.innerHTML = '';
        if (notes.length === 0) {
            notesList.innerHTML = '<li class="notes-empty">Keine Einträge vorhanden, Sir. Versuchen Sie "Notiz: Besprechung anberaumen".</li>';
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
                logActivity('Eintrag gelöscht.');
            };
            li.appendChild(del);
            notesList.appendChild(li);
        });
    }

    /* ==========================================================================
       SPRACHAUSGABE (Voice Output)
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
        speechSynthesis.cancel();
        // Markdown-Zeichen für die Sprachausgabe entfernen
        const cleanText = text.replace(/[*_#`]/g, '');
        const utter = new SpeechSynthesisUtterance(cleanText);
        if (preferredVoice) utter.voice = preferredVoice;
        utter.lang = 'de-DE';
        utter.rate = 1.0;
        utter.pitch = 0.85;
        utter.onstart = () => setStatus('speaking');
        utter.onend = () => { stopWaveform(); setStatus('idle'); };
        utter.onerror = () => { stopWaveform(); setStatus('idle'); };
        speechSynthesis.speak(utter);
    }

    /* ==========================================================================
       SPRACHERKENNUNG (Voice Input)
       ========================================================================== */
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
        micBtn.disabled = true;
        micBtn.title = 'Spracheingabe wird von diesem Browser nicht unterstützt.';
        micBtn.style.opacity = 0.35;
    }

    micBtn.addEventListener('click', () => {
        if (!recognizer) return;
        if (isRecording) { recognizer.stop(); } else { try { recognizer.start(); } catch (_) { } }
    });

    function tryPlayLocal(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => { });
        return true;
    }

    /* ==========================================================================
       INTERFACE AUSGABE (UI-HELFER)
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

    function printIres(text, { speakToo = true, cueId = null } = {}) {
        saveMessage('ires', text);
        const div = document.createElement('div');
        div.className = 'jarvis-response';
        outputArea.appendChild(div);
        scrollToBottom();

        if (cueId) tryPlayLocal(cueId);
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
        wrap.scrollTop = wrap.scrollHeight;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ==========================================================================
       BEFEHLSDEFINITIONEN & LANGZEITGEDÄCHTNIS
       ========================================================================== */
    const jokes = [
        "Warum können Atomphysiker nicht lügen? Weil sie alles erfinden, Sir.",
        "Ich würde Ihnen einen UDP-Witz erzählen, aber es könnte sein, dass er nicht bei Ihnen ankommt.",
        "Es gibt 10 Arten von Menschen auf der Welt, Sir: Diejenigen, die Binärzahlen verstehen, und die, die es nicht tun.",
        "Warum bevorzugen Entwickler den Dark Mode? Weil Licht Bugs anzieht, Sir.",
        "Ich kenne einen hervorragenden Witz über Quantencomputer, aber er ist gleichzeitig lustig und nicht lustig.",
    ];

    function safeEval(expr) {
        if (!/^[0-9+\-*/().\s%^]+$/.test(expr)) return null;
        try {
            const normalized = expr.replace(/\^/g, '**');
            // eslint-disable-next-line no-new-func
            const val = Function(`"use strict"; return (${normalized})`)();
            return Number.isFinite(val) ? val : null;
        } catch { return null; }
    }

    async function fetchWeather(place) {
        try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=de`);
            const geo = await geoRes.json();
            if (!geo.results || !geo.results.length) return `Ich konnte leider keinen Standort namens "${place}" in der Datenbank finden, Sir.`;
            const { latitude, longitude, name, country } = geo.results[0];
            const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`);
            const w = await wRes.json();
            const c = w.current;
            if (!c) return `Die Koordinaten für ${name} liegen vor, jedoch antwortet der Wetterdienst derzeit nicht, Sir.`;
            return `Die Wetterdaten für ${name}, ${country}: ${c.temperature_2m}°C, Luftfeuchtigkeit liegt bei ${c.relative_humidity_2m}%, Windgeschwindigkeit beträgt ${c.wind_speed_10m} km/h.`;
        } catch {
            return "Eine Verbindung zum Wetterdienst konnte nicht hergestellt werden, Sir. Bitte überprüfen Sie Ihre Netzwerkverbindung.";
        }
    }

    function greetingByTime() {
        const h = new Date().getHours();
        const userStr = currentUser ? `, ${currentUser}` : '';
        if (h < 5) return `Wieder eine Nachtschicht${userStr}?`;
        if (h < 12) return `Guten Morgen${userStr}. Alle Systeme arbeiten im optimalen Bereich.`;
        if (h < 17) return `Guten Tag${userStr}. Wie kann ich behilflich sein?`;
        if (h < 21) return `Guten Abend${userStr}. Bereit für die nächsten Befehle.`;
        return `Noch so spät aktiv${userStr}?`;
    }

    /* Regelstruktur: { test: (lowerInput) => bool, run: (raw, lower) => string | Promise<string> } */
    const rules = [
        /* --- AUTHENTIFIZIERUNG --- */
        {
            test: l => /^registrieren\b|^register\b/.test(l),
            run: (raw) => {
                const parts = raw.split(/\s+/);
                if (parts.length < 3) return "Syntax: Registrieren [Benutzername] [Passwort]";
                const res = registerUser(parts[1], parts[2]);
                if (res.success) {
                    loginUser(parts[1], parts[2]);
                    renderNotes();
                    loadSavedChat();
                    return `Registrierung erfolgreich. Sie sind nun als ${currentUser} angemeldet.`;
                }
                return res.msg;
            }
        },
        {
            test: l => /^anmelden\b|^login\b/.test(l),
            run: (raw) => {
                const parts = raw.split(/\s+/);
                if (parts.length < 3) return "Syntax: Anmelden [Benutzername] [Passwort]";
                const res = loginUser(parts[1], parts[2]);
                if (res.success) {
                    renderNotes();
                    loadSavedChat();
                    return `Erfolgreich angemeldet. Willkommen zurück, ${currentUser}, Sir!`;
                }
                return res.msg;
            }
        },
        {
            test: l => l === 'abmelden' || l === 'logout',
            run: () => {
                logoutUser();
                return "Sie wurden erfolgreich abgemeldet, Sir.";
            }
        },

        /* --- LANGZEITGEDÄCHTNIS (Lernen & Abfragen) --- */
        {
            // Merken: "Merke dir: Mein Hund heißt Bello" ODER "Ich heiße Max" ODER "Meine Lieblingsfarbe ist Blau"
            test: l => /^merke dir:?|^merke:?|^vermerke:?|^erinnere dich:?/.test(l) || /^mein(e)? \w+ ist/.test(l) || /^ich heiße/.test(l),
            run: (raw, l) => {
                if (!currentUser) return "Sie müssen angemeldet sein, damit ich mir persönliche Daten merken kann, Sir.";
                let fact = raw.replace(/^merke dir:?|^merke:?|^vermerke:?|^erinnere dich:?/i, '').trim();
                
                let key = "allgemein";
                let value = fact;

                // Intelligente Zuordnung versuchen
                if (l.includes('heiß') || l.includes('name')) {
                    key = "name";
                    value = raw.replace(/.*(?:heiße|name ist)\s+/i, '').trim();
                } else if (l.includes('hund') || l.includes('katze') || l.includes('haustier')) {
                    key = "haustier";
                } else if (l.includes('lieblings')) {
                    key = "vorliebe";
                }

                const mem = store.memory;
                if (key !== "allgemein") {
                    mem[key] = value;
                } else {
                    if (!mem.fakten) mem.fakten = [];
                    mem.fakten.push(value);
                }
                store.memory = mem;
                logActivity('Gedächtnis aktualisiert.');
                return `Verstanden, Sir. Ich habe mir gemerkt: "${value}".`;
            }
        },
        {
            // Abrufen: "Was weißt du über mich", "Wie heiße ich", "Was ist mein Hund"
            test: l => l.includes('was weißt du') || l.includes('was hast du dir gemerkt') || l.includes('wie heiße ich') || l.includes('wer bin ich') || l.includes('was ist mein'),
            run: (raw, l) => {
                if (!currentUser) return "Bitte melden Sie sich an, um auf das persönliche Gedächtnis zuzugreifen, Sir.";
                const mem = store.memory;

                if (l.includes('wie heiße ich') || l.includes('wer bin ich')) {
                    if (mem.name) return `Sie heißen ${mem.name}, Sir.`;
                    return `Sie sind als ${currentUser} angemeldet, Sir.`;
                }

                let results = [];
                if (mem.name) results.push(`Name: ${mem.name}`);
                if (mem.haustier) results.push(`Haustier: ${mem.haustier}`);
                if (mem.vorliebe) results.push(`Vorliebe: ${mem.vorliebe}`);
                if (mem.fakten && mem.fakten.length) {
                    results.push(`Weitere Fakten:\n- ` + mem.fakten.join('\n- '));
                }

                if (results.length === 0) {
                    return "Ich habe derzeit noch keine spezifischen Erinnerungen gespeichert, Sir. Sagen Sie zum Beispiel: 'Merke dir: Meine Lieblingsfarbe ist Blau'.";
                }

                return `Hier ist das, was ich mir über Sie gemerkt habe, Sir:\n${results.join('\n')}`;
            }
        },
        {
            test: l => l.includes('gedächtnis löschen') || l.includes('erinnerungen löschen'),
            run: () => {
                if (!currentUser) return "Bitte zuerst anmelden.";
                store.memory = {};
                logActivity('Gedächtnis gelöscht.');
                return "Sämtliche gespeicherten Erinnerungen für dieses Konto wurden gelöscht, Sir.";
            }
        },

        /* --- STANDARD BEFEHLE --- */
        {
            test: l => /\bich bin zurück\b|^bin wieder da/.test(l),
            run: () => `Willkommen zurück, Sir. Die Systeme sind einsatzbereit — wie darf ich Ihnen helfen?`,
            cueId: 'AtyourService',
        },
        {
            test: l => /^hallo\b|^hi\b|^hey\b|^servus\b|^moin\b|^ires\b/.test(l),
            run: () => `Stets zu Diensten, Sir. ${greetingByTime()}`,
            cueId: 'hello-sound',
        },
        {
            test: l => l.includes('stelle dich vor') || l.includes('wer bist du') || l.includes('wer ist ires'),
            run: () => "Ich bin I.R.E.S. — Intelligent Response and Execution System. Ich stehe Ihnen für Systemanalysen, Notizen, Berechnungen, Langzeitgedächtnis und allgemeine Informationen zur Verfügung.",
            cueId: 'Introduction',
        },
        {
            test: l => l.includes('akku') || l.includes('batterie') || l.includes('energie'),
            run: () => readoutBattery.textContent && readoutBattery.textContent !== '—'
                ? `Die Energiereserven betragen derzeit ${readoutBattery.textContent}, Sir.`
                : "Es ist mir derzeit nicht möglich, die Batteriedaten dieses Geräts auszulesen, Sir.",
            cueId: 'Batterylow',
        },
        {
            test: l => /^wetter|wetter (in|für)/.test(l),
            run: async (raw, l) => {
                const match = raw.match(/wetter (?:in|für)\s+(.+)/i);
                const place = match ? match[1].trim() : null;
                if (!place) return "Bitte nennen Sie mir den gewünschten Ort — beispielsweise 'Wetter in Korbach', Sir.";
                return await fetchWeather(place);
            },
        },
        {
            test: l => l.includes('wie viel uhr') || l.includes('wie spät') || l === 'uhrzeit' || l === 'zeit',
            run: () => `Es ist exakt ${new Date().toLocaleTimeString('de-DE')} Uhr, Sir.`,
        },
        {
            test: l => l.includes('datum') && !l.includes('update'),
            run: () => `Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, Sir.`,
        },
        {
            test: l => /^berechne|^rechne|^was ist [\d.]/.test(l),
            run: (raw) => {
                const expr = raw.replace(/^berechne|^rechne|^was ist/i, '').trim();
                const result = safeEval(expr);
                return result === null ? "Diesen mathematischen Ausdruck konnte ich nicht auflösen, Sir." : `Das Ergebnis für ${expr} lautet ${result}, Sir.`;
            },
        },
        {
            test: l => l.startsWith('notiz') || l.startsWith('notiz an mich') || l.startsWith('merkenotiz'),
            run: (raw) => {
                if (!currentUser) return "Bitte melden Sie sich an, um Notizen zu speichern.";
                const content = raw.replace(/^notiz an mich:|^notiz:|^merkenotiz (dir )?/i, '').trim();
                if (!content) return "Was soll ich in den Protokollen festhalten, Sir?";
                const notes = store.notes;
                notes.push(content);
                store.notes = notes;
                renderNotes();
                logActivity('Notiz gespeichert.');
                return `Vermerkt, Sir: "${content}".`;
            },
        },
        {
            test: l => l.includes('zeige notizen') || l.includes('notizen anzeigen') || l === 'notizen',
            run: () => {
                if (!currentUser) return "Bitte melden Sie sich an.";
                const notes = store.notes;
                if (!notes.length) return "Es befinden sich keine Notizen in den Archiven, Sir.";
                return `Sie haben ${notes.length} gespeicherte Notiz${notes.length > 1 ? 'en' : ''}:\n${notes.map((n, i) => `${i + 1}.${n}`).join('\n')}`;
            },
        },
        {
            test: l => l.includes('notizen löschen') || l.includes('alle notizen löschen'),
            run: () => { 
                if (!currentUser) return "Bitte melden Sie sich an.";
                store.notes = []; 
                renderNotes(); 
                logActivity('Notizen gelöscht.'); 
                return "Sämtliche Notizen wurden aus dem Speicher entfernt, Sir."; 
            },
        },
        {
            test: l => /stelle (einen )?timer auf/.test(l) || /timer für/.test(l),
            run: (raw) => {
                const m = raw.match(/(\d+)\s*(sekunde|sekunden|minute|minuten|stunde|stunden)/i);
                if (!m) return "Bitte nennen Sie mir eine Zeitspanne, Sir — etwa 'Stelle einen Timer auf 5 Minuten'.";
                const n = parseInt(m[1], 10);
                const unit = m[2].toLowerCase();
                const ms = unit.startsWith('stunde') ? n * 3600000 : unit.startsWith('minute') ? n * 60000 : n * 1000;
                setTimeout(() => {
                    printIres(`Timer abgelaufen — Die vereinbarten ${n} ${unit} sind verstrichen, Sir.`);
                    logActivity('Timer beendet.');
                }, ms);
                logActivity(`Timer gestellt: ${n} ${unit}.`);
                return `Timer auf ${n} ${unit} eingestellt. Ich werde Sie benachrichtigen, Sir.`;
            },
        },
        {
            test: l => l.includes('neu starten') || l.includes('neustart') || l.includes('reboot'),
            run: () => { setTimeout(() => location.reload(), 1800); return "Initialisiere System-Neustart. Ich bin in Kürze wieder da, Sir."; },
            cueId: 'reboot',
        },
        {
            test: l => l.includes('herunterfahren') || l.includes('ausschalten') || l.includes('tschüss') || l.includes('gute nacht'),
            run: () => { document.body.style.transition = 'opacity 1.5s ease'; setTimeout(() => document.body.style.opacity = '0.15', 400); return "Schalte primäre Schnittstellen ab. Angenehme Ruhepause, Sir."; },
        },
        {
            test: l => l.includes('chat leeren') || l.includes('verlauf löschen'),
            run: () => { 
                if (currentUser) store.chatHistory = []; 
                outputArea.innerHTML = ''; 
                return "Chatverlauf wurde für diesen Benutzer zurückgesetzt, Sir."; 
            },
        },
        {
            test: l => l.includes('musik öffnen') || l.includes('spiele musik'),
            run: () => { window.open('https://open.spotify.com', '_blank'); return "Öffne die Audioschnittstelle, Sir."; },
        },
        {
            test: l => l.startsWith('suche') || l.startsWith('suche nach'),
            run: (raw) => {
                const q = raw.replace(/^suche( nach)?/i, '').trim();
                if (!q) return "Wonach soll ich für Sie suchen, Sir?";
                window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
                return `Suche im Datennetz nach "${q}", Sir.`;
            },
        },
        {
            test: l => l === 'hilfe' || l.includes('was kannst du'),
            run: () => "Mögliche Befehle:\n• Login: `Anmelden [Name] [PW]` | `Registrieren [Name] [PW]` | `Abmelden`\n• Gedächtnis: `Merke dir: [Fakt]` | `Was weißt du über mich?`\n• Basis: `Uhrzeit` · `Datum` · `Wetter in <Ort>` · `Berechne <Ausdruck>` · `Notiz: <Text>` · `Timer auf <n> Min` · `Witz` · `Akku` · `Suche <Begriff>`.",
        },
        {
            test: l => l.includes('witz') || l.includes('tell me a joke'),
            run: () => jokes[Math.floor(Math.random() * jokes.length)],
        },
        {
            test: l => l.includes('stummschalten') || l.includes('ton aus'),
            run: () => { store.voiceOn = false; readoutVoice.textContent = 'AUS'; return "Sprachausgabe wurde deaktiviert, Sir."; },
        },
        {
            test: l => l.includes('ton an') || l.includes('stimme an'),
            run: () => { store.voiceOn = true; readoutVoice.textContent = 'AN'; return "Sprachausgabe ist nun wieder aktiviert, Sir."; },
        },
        {
            test: l => l.includes('danke') || l.includes('vielen dank'),
            run: () => "Stets zu Ihren Diensten, Sir.",
        },
    ];

    const fallbacks = [
        "Ich bin mir nicht sicher, ob ich Ihre Anweisung verstanden habe, Sir. Versuchen Sie 'Hilfe' einzugeben.",
        "Das liegt derzeit außerhalb meiner Protokolle, Sir. Geben Sie 'Hilfe' für eine Übersicht ein.",
        "Entschuldigung, Sir, aber diesen Befehl konnte ich nicht zuordnen.",
    ];

    /* ==========================================================================
       SUBMIT-HANDLING
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

        await new Promise(res => setTimeout(res, 220));

        let response;
        let cueId = null;
        if (matched) {
            response = await matched.run(raw, lower);
            cueId = matched.cueId || null;
            logActivity(`Befehl: "${raw.slice(0, 30)}"`);
        } else {
            response = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            logActivity(`Nicht erkannt: "${raw.slice(0, 30)}"`);
        }

        printIres(response, { cueId });
    }

    /* ==========================================================================
       EVENT LISTENER
       ========================================================================== */
    sendBtn.addEventListener('click', handleSubmit);
    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { handleSubmit(); return; }
        if (e.key === 'ArrowUp') {
            if (historyIndex > 0) { historyIndex--; inputField.value = history[historyIndex]; }
            e.preventDefault();
        }
        if (e.key === 'ArrowDown') {
            if (historyIndex < history.length - 1) { historyIndex++; inputField.value = history[historyIndex]; }
            else { historyIndex = history.length; inputField.value = ''; }
            e.preventDefault();
        }
    });

    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => { inputField.value = btn.dataset.cmd; handleSubmit(); });
    });

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-amber');
        store.theme = document.body.classList.contains('theme-amber') ? 'amber' : 'cyan';
    });

    boot();
})();
