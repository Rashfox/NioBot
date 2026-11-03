import fs from 'fs';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Memori dan sesi obrolan (State)
export const aiSessions = new Map();
export const nioSessions = new Map();
export const activeNioChats = new Map();

export const dbFile = './chat_history.json';
export const apiKey = process.env.GEMINI_API_KEY || '';
export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

let cachedModels = [];
export async function getValidModels(key = apiKey) {
    if (!key) return ["models/gemini-flash-lite-latest", "models/gemini-flash-latest", "models/gemini-pro-latest"];
    if (cachedModels.length > 0) return cachedModels;
    try {
        const req = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const res = await req.json();
        if (res.models) {
            cachedModels = res.models
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name)
                .filter(name => !name.includes('embedding') && !name.includes('vision') && !name.includes('tts') && !name.includes('exp') && !name.includes('image'));
            
            // Prioritaskan model flash-lite dan flash stabil untuk kecepatan dan kuota tinggi
            cachedModels.sort((a, b) => {
                const getScore = (name) => {
                    if (name.includes('flash-lite-latest')) return 1;
                    if (name.includes('flash-latest')) return 2;
                    if (name.includes('2.5-flash-lite')) return 3;
                    if (name.includes('2.5-flash')) return 4;
                    if (name.includes('pro-latest')) return 5;
                    if (name.includes('flash')) return 6;
                    return 10;
                };
                return getScore(a) - getScore(b);
            });
            return cachedModels;
        }
    } catch (e) {
        console.log("Gagal mengambil daftar model dari Google:", e.message);
    }
    return ["models/gemini-flash-lite-latest", "models/gemini-flash-latest", "models/gemini-pro-latest"];
}

export function readDB() {
    if (fs.existsSync(dbFile)) {
        try {
            let data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
            if (!data.users) data.users = {};
            if (!data.ai) data.ai = {};
            if (!data.nio) data.nio = {};
            return data;
        } catch (e) {
            console.error("Gagal membaca database:", e.message);
        }
    }
    // Fallback template jika chat_history.json belum ada
    if (fs.existsSync('./chat_history.template.json')) {
        try {
            const template = JSON.parse(fs.readFileSync('./chat_history.template.json', 'utf-8'));
            fs.writeFileSync(dbFile, JSON.stringify(template, null, 2));
            return template;
        } catch (e) {}
    }
    return { ai: {}, nio: {}, users: {}, interactedUsers: [], settings: { aiProvider: 'gemini' } };
}

export function writeDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// ── KONFIGURASI AI PROVIDER ─────────────────────────────────────────────────
// Provider default: 'gemini' | 'openrouter' | 'local' | atau custom ID pihak ketiga
// Tersimpan persisten di chat_history.json → db.settings

export const DEFAULT_AI_PROVIDERS = {
    gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'gemini',
        model: 'gemini-flash-latest'
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter.ai',
        type: 'openai_compatible',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'deepseek/deepseek-chat',
        apiKey: ''
    },
    local: {
        id: 'local',
        name: 'Local AI (Ollama)',
        type: 'openai_compatible',
        baseUrl: 'http://localhost:11434/v1',
        model: 'rash5679/nio',
        apiKey: ''
    }
};

export function getAIProvider() {
    const db = readDB();
    return db.settings?.aiProvider || 'gemini';
}

export function setAIProvider(providerId) {
    const db = readDB();
    if (!db.settings) db.settings = {};
    db.settings.aiProvider = providerId;
    writeDB(db);
}

export function getAllAIProviders() {
    const db = readDB();
    const custom = db.settings?.aiProviders || {};
    // Merge default dan custom/override
    const merged = { ...DEFAULT_AI_PROVIDERS };
    
    // Migrasi backward-compatibility jika ada db.settings.localAI
    if (db.settings?.localAI) {
        merged.local = { ...merged.local, ...db.settings.localAI };
    }

    for (const [key, val] of Object.entries(custom)) {
        merged[key] = { ...(merged[key] || {}), ...val };
    }
    return merged;
}

export function getProviderConfig(providerId) {
    const all = getAllAIProviders();
    return all[providerId] || null;
}

export function saveProviderConfig(providerId, patch) {
    const db = readDB();
    if (!db.settings) db.settings = {};
    if (!db.settings.aiProviders) db.settings.aiProviders = {};

    const existing = getAllAIProviders()[providerId] || {
        id: providerId,
        name: providerId,
        type: 'openai_compatible',
        baseUrl: '',
        model: '',
        apiKey: ''
    };

    db.settings.aiProviders[providerId] = { ...existing, ...patch, id: providerId };
    writeDB(db);
    return db.settings.aiProviders[providerId];
}

export function deleteProviderConfig(providerId) {
    if (['gemini', 'openrouter', 'local'].includes(providerId)) {
        return false; // Jangan hapus template bawaan
    }
    const db = readDB();
    if (db.settings?.aiProviders?.[providerId]) {
        delete db.settings.aiProviders[providerId];
        if (db.settings.aiProvider === providerId) {
            db.settings.aiProvider = 'gemini';
        }
        writeDB(db);
        return true;
    }
    return false;
}

// Backward-compatible helper untuk local AI
export function getLocalAIConfig() {
    return getProviderConfig('local') || DEFAULT_AI_PROVIDERS.local;
}

export function setLocalAIConfig(patch) {
    return saveProviderConfig('local', patch);
}