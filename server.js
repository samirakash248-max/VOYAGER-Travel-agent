import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRouter from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Auth routes (/auth/login, /auth/register, /auth/logout) ──
app.use("/auth", authRouter);

// ── Login page ──
app.get("/login", (req, res) => res.sendFile("login_index.html", { root: "." }));
app.get("/register", (req, res) => res.sendFile("register_index.html", { root: "." }));

app.use(express.static("."));

console.log("🔑 API Key:", API_KEY ? "Loaded ✅" : "Missing ❌");

// Models to try in order
const MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
];

// ── Core Gemini call with model fallback ──
async function callGemini(promptText, maxTokens = 2048) {
    for (const model of MODELS) {
        try {
            console.log(`🤖 Trying: ${model}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: promptText }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
                    }),
                    signal: controller.signal
                }
            );

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.log(`⚠️ ${model} failed: ${err?.error?.message || response.status}`);
                continue;
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.log(`⚠️ ${model} returned empty`);
                continue;
            }

            console.log(`✅ Got response from ${model}`);
            console.log('📝 Raw text:', text.substring(0, 500));
            return { text, model };

        } catch (err) {
            console.log(`❌ ${model} error: ${err.message}`);
            continue;
        }
    }
    return null;
}

// Health
app.get("/health", (req, res) => {
    res.json({ status: "ok", gemini: API_KEY ? "connected" : "not configured", models: MODELS });
});

// Generate itinerary
app.post("/generate", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || prompt.trim().length < 3) {
            return res.json({ success: false, error: "Enter a valid prompt" });
        }

        // Mock fallback when no API key
        if (!API_KEY) {
            console.log("⚠️ No API key — using MOCK data");
            const mock = {
                destination: "Paris, France",
                duration: "3 days",
                budgetLevel: "Moderate",
                highlights: ["Eiffel Tower", "Louvre Museum", "Seine River"],
                itinerary: [
                    { day: 1, theme: "Iconic Paris", morning: "Visit the Eiffel Tower at sunrise", afternoon: "Explore the Louvre Museum", evening: "Dinner cruise on the Seine" },
                    { day: 2, theme: "Art & Culture", morning: "Stroll through Montmartre", afternoon: "Visit Musée d'Orsay", evening: "Café hopping in Saint-Germain" },
                    { day: 3, theme: "Hidden Gems", morning: "Explore Le Marais district", afternoon: "Visit Sainte-Chapelle", evening: "Farewell dinner at a bistro" }
                ]
            };
            return res.json({ success: true, itinerary: JSON.stringify(mock) });
        }

        console.log(`\n📍 Request: ${prompt}`);

        const systemPrompt = `You are an expert travel planner. Return ONLY a valid JSON object. No markdown, no backticks, no explanation.

Schema:
{
  "destination": "City, Country",
  "duration": "X days",
  "budgetLevel": "Budget | Moderate | Luxury",
  "highlights": ["highlight1", "highlight2", "highlight3"],
  "budgetBreakdown": {
    "totalEstimate": "$XXX total",
    "perDay": "$XX/day",
    "accommodation": "$XX/night",
    "food": "$XX/day",
    "transport": "$XX/day",
    "activities": "$XX/day"
  },
  "transport": {
    "international": "Flight type and estimated cost to reach destination",
    "local": ["Local transport option 1 with cost", "Local transport option 2 with cost"]
  },
  "hotels": [
    {
      "name": "Hotel name",
      "type": "Budget | Mid-range | Luxury",
      "pricePerNight": "$XX/night",
      "location": "Area/neighborhood",
      "highlights": "Key features"
    }
  ],
  "itinerary": [
    {
      "day": 1,
      "theme": "Theme name",
      "morning": "Morning activity",
      "afternoon": "Afternoon activity",
      "evening": "Evening activity",
      "transport": {
        "vehicle": "Specific vehicle for today e.g. Metro Line 1, Tuk-tuk, Rental bike, Taxi, Ferry",
        "details": "Practical detail e.g. Take the JR Yamanote Line from Shinjuku to Ueno, cost ~$2",
        "estimatedCost": "$X"
      }
    }
  ]
}

User request: ${prompt}

IMPORTANT RULES:
- Each day's transport must be specific to that day's locations and activities — not generic.
- If day 1 visits temples in Asakusa, say "Take Tokyo Metro Ginza Line to Asakusa Station".
- If day 2 goes to the mountains, say "Rent a scooter from the city center, ~$15/day".
- Vehicle choices must match the user's budget (e.g. budget travellers use public transit, luxury travellers use private cars/taxis).
- Tailor ALL recommendations (hotels, transport, activities) strictly to the user's stated budget per day.
Output ONLY the JSON object. Start with { and end with }.`;

        const result = await callGemini(systemPrompt);

        if (!result) {
            return res.json({ success: false, error: "All models rate limited. Wait a minute and try again." });
        }

        const { text: rawText, model } = result;

        console.log("📝 Raw text preview:", rawText.substring(0, 300));

        // Strip markdown fences like ```json ... ```
        let cleaned = rawText
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .trim();

        // Slice from first { to last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            console.error("❌ No JSON braces found. Raw:", rawText.substring(0, 500));
            return res.json({ success: false, error: "AI response was not valid JSON" });
        }

        cleaned = cleaned.slice(firstBrace, lastBrace + 1);

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            console.error("❌ JSON parse failed:", e.message);
            console.error("❌ Attempted:", cleaned.substring(0, 500));
            return res.json({ success: false, error: "AI returned malformed JSON" });
        }

        if (!parsed.destination || !parsed.itinerary) {
            return res.json({ success: false, error: "AI response missing required fields" });
        }

        console.log(`✅ Itinerary ready for: ${parsed.destination} (via ${model})`);
        res.json({ success: true, itinerary: JSON.stringify(parsed) });

    } catch (err) {
        console.error("❌ Error:", err.message);
        res.json({ success: false, error: "Failed to generate itinerary" });
    }
});

// Chat assistant
app.post("/chat", async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message) return res.json({ success: false, error: "No message provided" });

        if (!API_KEY) {
            return res.json({ success: true, reply: "I'm VOYAGER! (Add Gemini API key to .env for real answers.)" });
        }

        const historyText = (history || []).map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`).join("\n");
        const fullPrompt = `You are VOYAGER, a friendly travel assistant. Answer travel questions concisely.\n\n${historyText}\nUser: ${message}\nAssistant:`;

        const result = await callGemini(fullPrompt, 512);

        if (!result) return res.json({ success: false, error: "Rate limited. Please wait a moment." });

        res.json({ success: true, reply: result.text });

    } catch (err) {
        console.error("❌ Chat error:", err.message);
        res.json({ success: false, error: "Chat failed" });
    }
});

// Root
app.get("/", (req, res) => {
    res.sendFile("index.html", { root: "." });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔑 Gemini: ${API_KEY ? "Connected ✅" : "NOT configured ⚠️"}`);
    console.log(`📋 Models: ${MODELS.join(" → ")}\n`);
});
