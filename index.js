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

    // Budget slider elements
    const budgetSlider = document.getElementById('budgetSlider');
    const budgetLabel = document.getElementById('budgetLabel');

    const BUDGET_LEVELS = ['', 'Budget', 'Moderate', 'Luxury'];
    const BUDGET_AMOUNTS = ['', '< $50/day', '$50–150/day', '$150+/day'];

    let selectedBudget = 'Moderate';
    let chatHistory = [];

    /* ─── FETCH USER NAME ─── */
    fetch('/api/me')
        .then(r => r.json())
        .then(data => {
            const el = document.querySelector('.profile');
            if (el && data.name) el.textContent = data.name;
        })
        .catch(() => {});

    /* ─── LOGOUT ─── */
    window.handleLogout = async function() {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch {}
        window.location.href = '/';
    };

    /* ─── PRE-FILL DESTINATION FROM URL PARAM ─── */
    const urlParams = new URLSearchParams(window.location.search);
    const destParam = urlParams.get('dest');
    if (destParam) {
        destination.value = destParam;
        // clean URL without reloading
        window.history.replaceState({}, '', '/app');
    }

    /* ─── DURATION RANGE ─── */
    range.addEventListener('input', () => {
        durationText.textContent = range.value + ' Days';
    });

    /* ─── BUDGET SLIDER ─── */
    function updateBudgetUI() {
        const val = parseInt(budgetSlider.value);
        const max = parseInt(budgetSlider.max);
        const label = val >= max ? '$' + max + '+/day' : '$' + val + '/day';

        selectedBudget = label;
        budgetLabel.textContent = label;
        const budgetValueEl = document.getElementById('budgetValue');
        if (budgetValueEl) budgetValueEl.textContent = label;
    }

    budgetSlider.addEventListener('input', updateBudgetUI);
    updateBudgetUI();

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
            setTimeout(() => map.invalidateSize(), 100);
        } catch (e) {
            console.log('Map error', e);
        }
    }

    /* ─── FORMAT ITINERARY ─── */
    function format(text) {
        try {
            const data = JSON.parse(text);

            const highlightsList = (data.highlights || [])
                .map(h => `<span class="highlight-pill">✦ ${h}</span>`).join('');

            // Budget breakdown
            const bd = data.budgetBreakdown || {};
            const budgetSection = bd.totalEstimate ? `
                <div class="section-block">
                    <div class="section-title">💰 Budget Breakdown</div>
                    <div class="budget-grid">
                        <div class="budget-item"><span class="bi-label">Total</span><span class="bi-val">${bd.totalEstimate || '—'}</span></div>
                        <div class="budget-item"><span class="bi-label">Per Day</span><span class="bi-val">${bd.perDay || '—'}</span></div>
                        <div class="budget-item"><span class="bi-label">🏨 Stay</span><span class="bi-val">${bd.accommodation || '—'}</span></div>
                        <div class="budget-item"><span class="bi-label">🍜 Food</span><span class="bi-val">${bd.food || '—'}</span></div>
                        <div class="budget-item"><span class="bi-label">🚗 Transport</span><span class="bi-val">${bd.transport || '—'}</span></div>
                        <div class="budget-item"><span class="bi-label">🎟 Activities</span><span class="bi-val">${bd.activities || '—'}</span></div>
                    </div>
                </div>` : '';

            // Transport
            const tr = data.transport || {};
            const localTransport = (tr.local || []).map(t => `<li class="transport-item">🚌 ${t}</li>`).join('');
            const transportSection = (tr.international || tr.local) ? `
                <div class="section-block">
                    <div class="section-title">✈️ Getting There & Around</div>
                    ${tr.international ? `<div class="transport-intl">✈️ ${tr.international}</div>` : ''}
                    <ul class="transport-list">${localTransport}</ul>
                </div>` : '';

            // Hotels
            const hotelsList = (data.hotels || []).map(h => `
                <div class="hotel-card">
                    <div class="hotel-header">
                        <span class="hotel-name">${h.name}</span>
                        <span class="hotel-price">${h.pricePerNight}</span>
                    </div>
                    <div class="hotel-meta">
                        <span class="hotel-type hotel-type-${(h.type||'').toLowerCase().replace('-','')}">${h.type}</span>
                        <span class="hotel-loc">📍 ${h.location}</span>
                    </div>
                    ${h.highlights ? `<div class="hotel-desc">${h.highlights}</div>` : ''}
                </div>
            `).join('');
            const hotelsSection = data.hotels?.length ? `
                <div class="section-block">
                    <div class="section-title">🏨 Recommended Hotels</div>
                    ${hotelsList}
                </div>` : '';

            // Day cards
            const daysList = (data.itinerary || []).map(day => {
                const t = day.transport || {};
                const transportHTML = t.vehicle ? `
                    <div class="day-transport">
                        <span class="transport-icon">🚗</span>
                        <div class="transport-info">
                            <span class="transport-vehicle">${t.vehicle}</span>
                            ${t.details ? `<span class="transport-details">${t.details}</span>` : ''}
                        </div>
                        ${t.estimatedCost ? `<span class="transport-cost">${t.estimatedCost}</span>` : ''}
                    </div>` : '';
                return `
                <div class="day-card">
                    <div class="day-header">Day ${day.day} — ${day.theme}</div>
                    <div class="day-row"><span class="time-label">🌅 Morning</span>${day.morning}</div>
                    <div class="day-row"><span class="time-label">☀️ Afternoon</span>${day.afternoon}</div>
                    <div class="day-row"><span class="time-label">🌙 Evening</span>${day.evening}</div>
                    ${transportHTML}
                </div>`;
            }).join('');

            // Safety tips
            const safetySection = (data.safetyTips?.length) ? `
                <div class="section-block">
                    <div class="section-title">🛡️ Safety Tips for ${data.destination.split(",")[0]}</div>
                    <div class="safety-grid">
                        ${(data.safetyTips || []).map(cat => `
                            <div class="safety-card">
                                <div class="safety-category">${cat.category}</div>
                                <ul class="safety-list">
                                    ${(cat.tips || []).map(tip => `<li>${tip}</li>`).join("")}
                                </ul>
                            </div>
                        `).join("")}
                    </div>
                </div>` : "";

            return `
                <h2 style="margin-bottom:4px">${data.destination}</h2>
                <p style="color:#555;margin-bottom:12px">${data.duration} • ${data.budgetLevel}</p>
                <div class="highlights-row">${highlightsList}</div>
                ${budgetSection}
                ${transportSection}
                ${hotelsSection}
                <div class="section-block">
                    <div class="section-title">🗓 Day by Day</div>
                    ${daysList}
                </div>
                ${safetySection}
            `;
        } catch {
            return `<p>${text}</p>`;
        }
    }

    /* ─── GENERATE ─── */
    async function generate(prompt) {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        updateStatus('✈️ Building your itinerary...');

        try {
            const res = await fetch('/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            const data = await res.json();

            if (data.success) {
                output.innerHTML = format(data.itinerary);
                updateStatus('✅ Itinerary ready!', 'success');
                try {
                    const parsed = JSON.parse(data.itinerary);
                    showMap(parsed.destination);
                } catch {}
            } else {
                output.innerHTML = `<p style="color:red">❌ ${data.error || 'Failed to generate itinerary'}</p>`;
                updateStatus('Something went wrong.', 'error');
            }

        } catch (err) {
            console.error(err);
            output.innerHTML = `<p style="color:red">❌ Server error. Is the server running?</p>`;
            updateStatus('Server error.', 'error');
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate ✨';
        }
    }

    /* ─── FORM SUBMIT ─── */
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!destination.value.trim()) {
            updateStatus('Please enter a destination.', 'error');
            return;
        }
        const prompt = `${range.value} day trip to ${destination.value}. Budget: ${selectedBudget}. Interests: ${interests.value || 'general sightseeing'}`;
        generate(prompt);
    });

    /* ─── CHAT ─── */
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatBox = document.getElementById('chatBox');

    function appendMessage(text, role) {
        // Remove typing indicator if present
        const typing = chatBox.querySelector('.typing-indicator');
        if (typing) typing.remove();

        const div = document.createElement('div');
        div.className = `message ${role}`;

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;
        div.appendChild(textDiv);

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showTyping() {
        const div = document.createElement('div');
        div.className = 'message bot typing-indicator';
        div.innerHTML = '<div class="message-text"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
        const msg = chatInput.value.trim();
        if (!msg || sendBtn.disabled) return;

        appendMessage(msg, 'user');
        chatInput.value = '';
        sendBtn.disabled = true;
        showTyping();

        try {
            const res = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: chatHistory })
            });

            const data = await res.json();

            if (data.success) {
                appendMessage(data.reply, 'bot');
                chatHistory.push({ role: 'user', text: msg });
                chatHistory.push({ role: 'model', text: data.reply });
                if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
            } else {
                appendMessage('Sorry, I could not get a response right now. Try again in a moment.', 'bot');
            }
        } catch {
            appendMessage('❌ Cannot reach the server. Make sure it is running.', 'bot');
        } finally {
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

});
