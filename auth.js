import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';

const router = express.Router();

// ── MongoDB connection ──
// Reuse a single connection across requests
let db;
async function getDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db(process.env.MONGO_DB_NAME || 'voyager');
    console.log('✅ MongoDB connected');
    return db;
}

// ── JWT helper ──
const JWT_SECRET  = process.env.JWT_SECRET  || 'change_this_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES  || '7d';

function signToken(userId) {
    return jwt.sign({ id: userId.toString() }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ── REGISTER  POST /auth/register ──
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const database   = await getDB();
        const users      = database.collection('users');
        const existing   = await users.findOne({ email: email.toLowerCase() });

        if (existing) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const result = await users.insertOne({
            name,
            email:     email.toLowerCase(),
            password:  hashedPassword,
            createdAt: new Date()
        });

        const token = signToken(result.insertedId);

        // Set cookie and return token
        res.cookie('token', token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            maxAge:   7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            success:  true,
            message:  'Account created successfully!',
            redirect: '/',
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

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const database = await getDB();
        const users    = database.collection('users');
        const user     = await users.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Don't reveal whether email exists
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const expiresIn = remember ? '30d' : '1d';
        const token     = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn });

        res.cookie('token', token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === 'production',
            maxAge:   remember
                        ? 30 * 24 * 60 * 60 * 1000   // 30 days if "remember me"
                        :      24 * 60 * 60 * 1000    // 1 day otherwise
        });

        res.json({
            success:  true,
            message:  'Login successful!',
            redirect: '/',
            user: { name: user.name, email: user.email }
        });

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

// ── AUTH MIDDLEWARE — use this on protected routes ──
export function requireAuth(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

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
