let map, marker;

document.addEventListener('DOMContentLoaded', () => {

    const destination = document.getElementById('destination');
    const range = document.getElementById('rangeInput');
    const durationText = document.getElementById('durationText');
    const interests = document.getElementById('interests');
    const form = document.querySelector('.trip-form');
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const generateBtn = form.querySelector('.generate');

    let selectedBudget = "Moderate";

    // Chat history for multi-turn context
    let chatHistory = [];

    /* ─── RANGE ─── */
    range.addEventListener('input', () => {
        durationText.textContent = range.value + " Days";
    });

    /* ─── BUDGET ─── */
    document.querySelectorAll('.buttons button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.buttons button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBudget = btn.textContent;
        });
    });

    /* ─── NAV TABS ─── */
    document.getElementById('plannerTab').addEventListener('click', () => {
        document.getElementById('plannerSection').style.display = 'block';
        document.getElementById('assistantSection').style.display = 'none';
        document.getElementById('plannerTab').classList.add('active');
        document.getElementById('assistantTab').classList.remove('active');
    });

    document.getElementById('assistantTab').addEventListener('click', () => {
        document.getElementById('plannerSection').style.display = 'none';
        document.getElementById('assistantSection').style.display = 'block';
        document.getElementById('assistantTab').classList.add('active');
        document.getElementById('plannerTab').classList.remove('active');
    });

    /* ─── STATUS ─── */
    function updateStatus(msg, type = '') {
        status.textContent = msg;
        status.style.color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#00c6ff' : 'white';
    }

    /* ─── MAP ─── */
    async function showMap(place) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
            const data = await res.json();

            if (!data.length) return;

            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);

            if (!map) {
                map = L.map('map').setView([lat, lon], 10);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(map);
            } else {
                map.setView([lat, lon], 10);
                if (marker) map.removeLayer(marker);
            }

            marker = L.marker([lat, lon]).addTo(map);

            // FIX 3: Force Leaflet to recalculate size after container may have changed
            setTimeout(() => map.invalidateSize(), 100);

        } catch (e) {
            console.log("Map error", e);
        }
    }

    /* ─── FORMAT ITINERARY ─── */
    // FIX 4: Now renders the full day-by-day itinerary, not just highlights
    function format(text) {
        try {
            const data = JSON.parse(text);

            const highlightsList = (data.highlights || [])
                .map(h => `<li>✦ ${h}</li>`)
                .join('');

            const daysList = (data.itinerary || []).map(day => `
                <div class="day-card">
                    <div class="day-header">Day ${day.day} — ${day.theme}</div>
                    <div class="day-row"><span class="time-label">🌅 Morning</span> ${day.morning}</div>
                    <div class="day-row"><span class="time-label">☀️ Afternoon</span> ${day.afternoon}</div>
                    <div class="day-row"><span class="time-label">🌙 Evening</span> ${day.evening}</div>
                </div>
            `).join('');

            return `
                <h2 style="margin-bottom:4px">${data.destination}</h2>
                <p style="color:#555;margin-bottom:12px">${data.duration} • ${data.budgetLevel}</p>
                <ul style="margin-bottom:16px;padding-left:18px">${highlightsList}</ul>
                ${daysList}
            `;
        } catch {
            return `<p>${text}</p>`;
        }
    }

    /* ─── GENERATE ─── */
    async function generate(prompt) {
        // FIX 5: Disable button to prevent spam clicks
        generateBtn.disabled = true;
        generateBtn.textContent = "Generating...";
        updateStatus("✈️ Building your itinerary...");

        try {
            const res = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await res.json();

            if (data.success) {
                output.innerHTML = format(data.itinerary);
                // FIX 6: Clear status on success
                updateStatus("✅ Itinerary ready!", 'success');

                try {
                    const parsed = JSON.parse(data.itinerary);
                    showMap(parsed.destination);
                } catch {}
            } else {
                output.innerHTML = `<p style="color:red">❌ ${data.error || 'Failed to generate itinerary'}</p>`;
                updateStatus("Something went wrong.", 'error');
            }

        } catch (err) {
            console.error(err);
            output.innerHTML = `<p style="color:red">❌ Server error. Is the server running?</p>`;
            updateStatus("Server error.", 'error');
        } finally {
            // FIX 5: Always re-enable button
            generateBtn.disabled = false;
            generateBtn.textContent = "Generate ✨";
        }
    }

    /* ─── FORM SUBMIT ─── */
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        if (!destination.value.trim()) {
            updateStatus("Please enter a destination.", 'error');
            return;
        }

        const prompt = `${range.value} day trip to ${destination.value}. Budget: ${selectedBudget}. Interests: ${interests.value || 'general sightseeing'}`;
        generate(prompt);
    });

    /* ─── CHAT ─── */
    // FIX 7: Chat assistant is now fully wired up
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatBox = document.getElementById('chatBox');

    function appendMessage(text, role) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.textContent = text;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
        const msg = chatInput.value.trim();
        if (!msg) return;

        appendMessage(msg, 'user');
        chatInput.value = '';
        sendBtn.disabled = true;
        sendBtn.textContent = "...";

        try {
            const res = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: chatHistory })
            });

            const data = await res.json();

            if (data.success) {
                appendMessage(data.reply, 'bot');
                // Keep rolling history for multi-turn context
                chatHistory.push({ role: 'user', text: msg });
                chatHistory.push({ role: 'model', text: data.reply });
                // Keep last 10 turns to avoid huge payloads
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            } else {
                appendMessage("Sorry, I couldn't get a response. Try again.", 'bot');
            }

        } catch (err) {
            appendMessage("❌ Server error.", 'bot');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = "Send";
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    /* ─── ITINERARY CARD STYLES (injected so no style.css edit needed) ─── */
    const style = document.createElement('style');
    style.textContent = `
        .day-card {
            background: #f7f7fb;
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 10px;
            border-left: 4px solid #6c5ce7;
        }
        .day-header {
            font-weight: 700;
            margin-bottom: 8px;
            color: #333;
        }
        .day-row {
            font-size: 0.9em;
            color: #444;
            margin: 4px 0;
            line-height: 1.5;
        }
        .time-label {
            font-weight: 600;
            margin-right: 6px;
        }
        .generate:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

});
