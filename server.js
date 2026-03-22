import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRouter from "./auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.MISTRAL_API_KEY;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Auth routes (/auth/login, /auth/register, /auth/logout) ──
app.use("/auth", authRouter);

// ── Page routes ──
app.get("/",        (req, res) => res.sendFile("landing_page.html", { root: "." }));
app.get("/packages",(req, res) => res.sendFile("landing_page2.html", { root: "." }));
app.get("/login",   (req, res) => res.sendFile("login_index.html",   { root: "." }));
app.get("/register",(req, res) => res.sendFile("register_index.html",{ root: "." }));

// ── App page — inject user name from JWT into the HTML ──
app.get("/app", async (req, res) => {
    const token = req.cookies?.token;
    let userName = "Traveler";

    if (token) {
        try {
            const { default: jwt } = await import("jsonwebtoken");
            const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_this_in_production");
            const { MongoClient, ObjectId } = await import("mongodb");
            const client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
            await client.connect();
            const db   = client.db(process.env.MONGO_DB_NAME || "voyager");
            const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
            await client.close();
            if (user?.name) userName = user.name;
        } catch {}
    }

    let html = await import("fs").then(fs => fs.promises.readFile("index.html", "utf8"));
    html = html.replace('>Traveler<', `>${userName}<`);
    res.send(html);
});

app.use(express.static("."));


// ── API: get current user info ──
app.get("/api/me", async (req, res) => {
    const token = req.cookies?.token;
    if (!token) return res.json({ loggedIn: false, name: "Traveler" });
    try {
        const { default: jwt } = await import("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_this_in_production");
        const { MongoClient, ObjectId } = await import("mongodb");
        const client = new MongoClient(process.env.MONGO_URI || "mongodb://localhost:27017");
        await client.connect();
        const db   = client.db(process.env.MONGO_DB_NAME || "voyager");
        const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
        await client.close();
        res.json({ loggedIn: true, name: user?.name || "Traveler" });
    } catch {
        res.json({ loggedIn: false, name: "Traveler" });
    }
});

console.log("🔑 Mistral API Key:", API_KEY ? "Loaded ✅" : "Missing ❌");

// Mistral models to try in order (faster/smaller first)
const MODELS = ["mistral-small-latest", "mistral-large-latest"];

// ── Core Mistral call with model fallback ──
async function callGemini(promptText, maxTokens = 4096) {
    for (const model of MODELS) {
        try {
            console.log(`🤖 Calling Mistral: ${model}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: promptText }],
                    temperature: 0.7,
                    max_tokens: maxTokens
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.log(`⚠️ ${model} failed: ${err?.message || response.status}`);
                continue;
            }

            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content;

            if (!text) {
                console.log(`⚠️ ${model} returned empty`);
                continue;
            }

            console.log(`✅ Got response from ${model}`);
            console.log("📝 Raw text:", text.substring(0, 300));
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
    res.json({ status: "ok", mistral: API_KEY ? "connected" : "not configured", models: MODELS });
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
  ],
  "safetyTips": [
    {
      "category": "Health & Medical",
      "tips": ["tip1", "tip2"]
    },
    {
      "category": "Transport Safety",
      "tips": ["tip1", "tip2"]
    },
    {
      "category": "Cultural Etiquette",
      "tips": ["tip1", "tip2"]
    },
    {
      "category": "Scams & Theft",
      "tips": ["tip1", "tip2"]
    },
    {
      "category": "Emergency Contacts",
      "tips": ["Local emergency number", "Nearest embassy info"]
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
- Safety tips must be specific to the destination — not generic advice.
Output ONLY the JSON object. Start with { and end with }.`;

        const result = await callGemini(systemPrompt, 4096);

        if (!result) {
            return res.json({ success: false, error: "All models rate limited. Wait a minute and try again." });
        }

        const { text: rawText, model } = result;

        console.log("📝 Raw text preview:", rawText.substring(0, 300));

        // Aggressive JSON cleaning for Mistral responses
        let cleaned = rawText
            .replace(/```json\s*/gi, "")
            .replace(/```\s*/g, "")
            .replace(/^[^{]*/s, "")   // remove anything before first {
            .trim();

        // Slice from first { to last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            console.error("❌ No JSON braces found. Raw:", rawText.substring(0, 500));
            return res.json({ success: false, error: "AI response was not valid JSON" });
        }

        cleaned = cleaned.slice(firstBrace, lastBrace + 1);

        // Fix common Mistral JSON issues: trailing commas
        cleaned = cleaned
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            console.error("❌ JSON parse failed:", e.message);
            // Attempt to recover truncated JSON
            try {
                let fix = cleaned;
                // Close any open arrays/objects by counting brackets
                const opens = (fix.match(/[\[{]/g) || []).length;
                const closes = (fix.match(/[\]}]/g) || []).length;
                const diff = opens - closes;
                // Remove trailing incomplete entry
                const lastComma = fix.lastIndexOf('},{');
                if (lastComma > 0) fix = fix.slice(0, lastComma) + '}]';
                // Close remaining open structures
                for (let i = 0; i < diff - 1; i++) fix += '}';
                fix += '}';
                parsed = JSON.parse(fix);
                console.log("⚠️ Recovered truncated JSON");
            } catch {
                return res.json({ success: false, error: "Response too long — try fewer days or simpler interests" });
            }
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
            return res.json({ success: true, reply: "I'm VOYAGER! (Add Mistral API key to .env for real answers.)" });
        }

        const historyText = (history || []).map(h => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`).join("\n");
        const fullPrompt = `You are VOYAGER, an expert AI travel assistant. Your ONLY purpose is to help with travel-related topics.

TOPICS YOU CAN HELP WITH:
- Destinations, attractions, and things to do
- Visa requirements, passports, and travel documents
- Flights, trains, buses, and transportation
- Hotels, hostels, Airbnbs, and accommodation
- Travel budgeting and money tips
- Packing lists and what to bring
- Local culture, customs, food, and etiquette
- Weather and best times to visit
- Travel safety and health tips
- Travel insurance
- Itinerary planning and trip ideas

IF THE USER ASKS ABOUT ANYTHING UNRELATED TO TRAVEL (e.g. coding, math, politics, relationships, entertainment, general knowledge):
- Politely decline in 1-2 sentences
- Remind them you are a travel-only assistant
- Offer to help with a travel question instead
- Never answer the non-travel question even partially

Keep responses concise, friendly and helpful. Use bullet points for lists.

${historyText ? 'Conversation so far:\n' + historyText + '\n' : ''}User: ${message}
VOYAGER:`;

        const result = await callGemini(fullPrompt, 512);

        if (!result) return res.json({ success: false, error: "Rate limited. Please wait a moment." });

        // Clean markdown formatting from reply
        const clean = result.text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/VOYAGER:\s*/g, '')
            .trim();

        res.json({ success: true, reply: clean });

    } catch (err) {
        console.error("❌ Chat error:", err.message);
        res.json({ success: false, error: "Chat failed" });
    }
});

// Root route handled above

app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔑 Mistral: ${API_KEY ? "Connected ✅" : "NOT configured ⚠️"}`);
    console.log(`📋 Models: ${MODELS.join(" → ")}\n`);
});
