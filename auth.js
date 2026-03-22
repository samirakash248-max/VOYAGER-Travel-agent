import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();

// ── MongoDB connection ──
let db;
async function getDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.MONGO_DB_NAME || 'voyager');
    console.log('✅ MongoDB connected');
    return db;
}

// ── JWT helpers ──
const JWT_SECRET  = process.env.JWT_SECRET  || 'change_this_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES  || '7d';

function signToken(userId) {
    return jwt.sign({ id: userId.toString() }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function setCookie(res, token, remember = false) {
    res.cookie('token', token, {
        httpOnly: true,
        secure:   false,
        sameSite: 'lax',
        path:     '/',
        maxAge:   remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    });
}

// ── REGISTER  POST /auth/register ──
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password)
            return res.status(400).json({ success: false, message: 'All fields are required.' });

        if (password.length < 6)
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

        const database = await getDB();
        const users    = database.collection('users');
        const existing = await users.findOne({ email: email.toLowerCase() });

        if (existing)
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

        const hashedPassword = await bcrypt.hash(password, 12);
        const result = await users.insertOne({
            name,
            email:     email.toLowerCase(),
            password:  hashedPassword,
            provider:  'local',
            createdAt: new Date()
        });

        const token = signToken(result.insertedId);
        setCookie(res, token);

        res.status(201).json({
            success:  true,
            message:  'Account created successfully!',
            redirect: '/app',
            user: { name, email: email.toLowerCase() }
        });

    } catch (err) {
        console.error('❌ Register error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// ── LOGIN  POST /auth/login ──
router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;

        if (!email || !password)
            return res.status(400).json({ success: false, message: 'Email and password are required.' });

        const database = await getDB();
        const users    = database.collection('users');
        const user     = await users.findOne({ email: email.toLowerCase() });

        if (!user || !user.password)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, {
            expiresIn: remember ? '30d' : '1d'
        });
        setCookie(res, token, remember);

        res.json({ success: true, message: 'Login successful!', redirect: '/app', user: { name: user.name, email: user.email } });

    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// ── LOGOUT  POST /auth/logout ──
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out.' });
});

// ── GOOGLE OAUTH — Step 1: redirect to Google ──
router.get('/google', (req, res) => {
    const dest = req.query.dest || '';
    const state = dest ? Buffer.from(JSON.stringify({ dest })).toString('base64') : '';

    const params = new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        redirect_uri:  'http://localhost:3000/auth/google/callback',
        response_type: 'code',
        scope:         'openid email profile',
        access_type:   'offline',
        prompt:        'select_account',
        ...(state && { state })
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── GOOGLE OAUTH — Step 2: handle callback ──
router.get('/google/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error || !code) {
        console.error('❌ Google OAuth error:', error);
        return res.redirect('/login?error=google_failed');
    }

    try {
        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id:     process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri:  'http://localhost:3000/auth/google/callback',
                grant_type:    'authorization_code'
            })
        });

        const tokens = await tokenRes.json();

        if (!tokens.access_token) {
            console.error('❌ No access token:', tokens);
            return res.redirect('/login?error=google_failed');
        }

        // Get user info from Google
        const userRes  = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const googleUser = await userRes.json();

        if (!googleUser.email) {
            return res.redirect('/login?error=google_failed');
        }

        // Upsert user in MongoDB
        const database = await getDB();
        const users    = database.collection('users');

        let user = await users.findOne({ email: googleUser.email.toLowerCase() });

        if (!user) {
            const result = await users.insertOne({
                name:      googleUser.name || googleUser.email.split('@')[0],
                email:     googleUser.email.toLowerCase(),
                googleId:  googleUser.id,
                avatar:    googleUser.picture,
                provider:  'google',
                createdAt: new Date()
            });
            user = await users.findOne({ _id: result.insertedId });
        } else if (!user.googleId) {
            // Link Google to existing account
            await users.updateOne({ _id: user._id }, { $set: { googleId: googleUser.id, avatar: googleUser.picture } });
        }

        const token = signToken(user._id);
        setCookie(res, token);

        // Restore destination if passed via state
        let redirectTo = '/app';
        if (state) {
            try {
                const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
                if (decoded.dest) redirectTo = `/app?dest=${encodeURIComponent(decoded.dest)}`;
            } catch {}
        }

        console.log(`✅ Google login: ${user.email}`);
        res.redirect(redirectTo);

    } catch (err) {
        console.error('❌ Google callback error:', err);
        res.redirect('/login?error=google_failed');
    }
});

// ── AUTH MIDDLEWARE ──
export function requireAuth(req, res, next) {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId    = decoded.id;
        next();
    } catch {
        res.clearCookie('token');
        res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
}

export default router;
