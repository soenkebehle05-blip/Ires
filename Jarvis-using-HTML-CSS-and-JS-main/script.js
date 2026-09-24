/* ==========================================================================
   J.A.R.V.I.S. — Anwendungslogik
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

    /* ---------- Permanenter Status ---------- */
    const store = {
        get notes() { try { return JSON.parse(localStorage.getItem('jarvis_notes') || '[]'); } catch { return []; } },
        set notes(v) { localStorage.setItem('jarvis_notes', JSON.stringify(v)); },
        get voiceOn() { return localStorage.getItem('jarvis_voice') !== 'off'; },
        set voiceOn(v) { localStorage.setItem('jarvis_voice', v ? 'on' : 'off'); },
        get theme() { return localStorage.getItem('jarvis_theme') || 'cyan'; },
        set theme(v) { localStorage.setItem('jarvis_theme', v); },
    };

    let history = [];
    let historyIndex = -1;
    const bootTime = Date.now();

    /* ==========================================================================
       STARTUP (BOOT)
       ========================================================================== */
    function boot() {
        if (store.theme === 'amber') document.body.classList.add('theme-amber');
        readoutVoice.textContent = store.voiceOn ? 'AN' : 'AUS';
        renderNotes();
        tickClock();
        setInterval(tickClock, 1000);
        setStatus('idle');
        logActivity('J.A.R.V.I.S. Systeme online.');
        initBattery();
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
                    readoutBattery.textContent = `${Math.round(bat.level * 100)}%${bat.charging ? ' ⚡' : ''}`;
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
                statusLabel.textContent = 'ONLINE';
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
        li.innerHTML = `<b>${t}</b> — ${text}`;
        activityLog.insertBefore(li, activityLog.firstChild);
        while (activityLog.children.length > 8) activityLog.removeChild(activityLog.lastChild);
    }

    function renderNotes() {
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
        const utter = new SpeechSynthesisUtterance(text);
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

    /* ==========================================================================
       OPTIONALE LOKALE AUDIO-EFFEKTE
       ========================================================================== */
    function tryPlayLocal(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => { });
        return true;
    }

    /* ==========================================================================
       SCHREIBMASCHINEN-AUSGABE
       ========================================================================== */
    function printUser(text) {
        const div = document.createElement('div');
        div.className = 'user-command';
        div.innerHTML = `<strong>Sie</strong>${escapeHtml(text)}`;
        outputArea.appendChild(div);
        scrollToBottom();
    }

    function printJarvis(text, { speakToo = true, cueId = null } = {}) {
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
       BEFEHLSDEFINITIONEN (J.A.R.V.I.S.-Stil)
       ========================================================================== */
    const jokes = [
        "Warum können Atomphysiker nicht lügen? Weil sie alles erfinden, Sir.",
        "Ich würde Ihnen einen UDP-Witz erzählen, aber es könnte sein, dass er nicht bei Ihnen ankommt.",
        "Es gibt 10 Arten von Menschen auf der Welt, Sir: Diejenigen, die Binärzahlen verstehen, und die, die es nicht tun.",
        "Warum bevorzugen Entwickler den Dark Mode? Weil Licht Bugs anzieht, Sir.",
        "Ich kenne einen hervorragenden Witz über Bogenreaktoren, aber er benötigt noch etwas Ladezeit.",
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
        if (h < 5) return 'Wieder eine Nachtschicht, Sir?';
        if (h < 12) return 'Guten Morgen, Sir. Alle Systeme arbeiten im optimalen Bereich.';
        if (h < 17) return 'Guten Tag, Sir. Wie kann ich behilflich sein?';
        if (h < 21) return 'Guten Abend, Sir. Bereit für die nächsten Befehle.';
        return 'Noch so spät aktiv, Sir?';
    }

    /* Regelstruktur: { test: (lowerInput) => bool, run: (raw, lower) => string | Promise<string> } */
    const rules = [
        {
            test: l => /\bich bin zurück\b|^bin wieder da/.test(l),
            run: () => "Willkommen zurück, Sir. Die Systeme sind einsatzbereit — wie darf ich Ihnen helfen?",
            cueId: 'AtyourService',
        },
        {
            test: l => /^hallo\b|^hi\b|^hey\b|^servus\b|^moin\b|^jarvis\b/.test(l),
            run: () => `Stets zu Diensten, Sir. ${greetingByTime()}`,
            cueId: 'hello-sound',
        },
        {
            test: l => l.includes('stelle dich vor') || l.includes('wer bist du') || l.includes('wer ist jarvis'),
            run: () => "Ich bin J.A.R.V.I.S. — Just A Rather Very Intelligent System. Ich stehe Ihnen für Systemanalysen, Notizen, Berechnungen und allgemeine Informationen zur Verfügung.",
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
            test: l => l.startsWith('notiz') || l.startsWith('notiz an mich') || l.startsWith('merke'),
            run: (raw) => {
                const content = raw.replace(/^notiz an mich:|^notiz:|^merke (dir )?/i, '').trim();
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
                const notes = store.notes;
                if (!notes.length) return "Es befinden sich keine Notizen in den Archiven, Sir.";
                return `Sie haben ${notes.length} gespeicherte Notiz${notes.length > 1 ? 'en' : ''}:\n${notes.map((n, i) => `${i + 1}.${n}`).join('\n')}`;
            },
        },
        {
            test: l => l.includes('notizen löschen') || l.includes('alle notizen löschen'),
            run: () => { store.notes = []; renderNotes(); logActivity('Notizen gelöscht.'); return "Sämtliche Notizen wurden aus dem Speicher entfernt, Sir."; },
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
                    printJarvis(`Timer abgelaufen — Die vereinbarten ${n} ${unit} sind verstrichen, Sir.`);
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
            test: l => l.includes('leeren') || l.includes('bildschirm leeren') || l === 'clear' || l === 'löschen',
            run: () => { outputArea.innerHTML = ''; return "Displayanzeige zurückgesetzt, Sir."; },
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
            test: l => l.includes('spiel spielen') || l.includes('spiel starten'),
            run: () => "Die Trainingssimulationen stehen bereit. Wenn Sie möchten, kann ich Ihnen in der Zwischenzeit einen Witz erzählen, Sir.",
        },
        {
            test: l => l === 'hilfe' || l.includes('was kannst du'),
            run: () => "Mögliche Befehle: Uhrzeit · Datum · Wetter in <Ort> · Berechne <Ausdruck> · Notiz: <Text> · Notizen anzeigen · Timer auf <n> Minuten · Witz · Akku · Suche <Begriff> · Neustart · Herunterfahren · Leeren.",
        },
        {
            test: l => l.includes('nachrichten') || l.includes('news'),
            run: () => { window.open('https://news.google.com', '_blank'); return "Rufe die aktuellen globalen Meldungen ab, Sir."; },
        },
        {
            test: l => l.includes('einstellungen') || l.includes('settings'),
            run: () => "Über die Schalffläche oben rechts können Sie das HUD-Farbschema anpassen, Sir.",
        },
        {
            test: l => l.includes('witz') || l.includes('tell me a joke'),
            run: () => jokes[Math.floor(Math.random() * jokes.length)],
        },
        {
            test: l => l.includes('stummschalten') || l.includes('ton aus') || l.includes('stimme aus'),
            run: () => { store.voiceOn = false; readoutVoice.textContent = 'AUS'; return "Sprachausgabe wurde deaktiviert, Sir."; },
        },
        {
            test: l => l.includes('ton an') || l.includes('stimme an') || l.includes('lautschalten'),
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

        await new Promise(res => setTimeout(res, 220)); // kurze Denkpause

        let response;
        let cueId = null;
        if (matched) {
            response = await matched.run(raw, lower);
            cueId = matched.cueId || null;
            logActivity(`Befehl: "${raw.slice(0, 40)}"`);
        } else {
            response = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            logActivity(`Nicht erkannt: "${raw.slice(0, 40)}"`);
        }

        printJarvis(response, { cueId });
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
