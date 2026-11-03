import { getAIProvider, getProviderConfig, getValidModels, genAI } from './state.js';

/**
 * Memanggil API OpenAI-Compatible (OpenRouter, Ollama/Local, DeepSeek, Groq, OpenAI, dll.)
 */
export async function askOpenAICompatible({
    providerConfig,
    history = [],
    systemInstruction = '',
    prompt = '',
    imagePart = null
}) {
    const { baseUrl, model, apiKey, name } = providerConfig;
    const providerName = name || providerConfig.id || 'Custom AI';

    if (!baseUrl) {
        throw new Error(`Endpoint URL untuk provider "${providerName}" belum diatur.`);
    }

    // Normalisasi format base URL (menghilangkan trailing slash)
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const endpoint = normalizedBaseUrl.endsWith('/chat/completions')
        ? normalizedBaseUrl
        : `${normalizedBaseUrl}/chat/completions`;

    console.log(`🌐 AI Request [${providerName}] model: ${model} @ ${endpoint}`);

    // Konversi riwayat obrolan (Gemini format -> OpenAI messages)
    const messages = [];

    if (systemInstruction && systemInstruction.trim()) {
        messages.push({ role: 'system', content: systemInstruction.trim() });
    }

    for (const entry of history) {
        const role = (entry.role === 'model' || entry.role === 'assistant') ? 'assistant' : 'user';
        const content = entry.parts?.map(p => p.text || '[Gambar]').join('') || '';
        if (content.trim()) {
            messages.push({ role, content });
        }
    }

    // Pesan pengguna terkini
    if (imagePart) {
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
                    }
                }
            ]
        });
    } else {
        messages.push({
            role: 'user',
            content: prompt
        });
    }

    const headers = {
        'Content-Type': 'application/json'
    };

    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Header khusus OpenRouter untuk identifikasi bot
    if (baseUrl.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://github.com/Rashfox/nio-bot';
        headers['X-Title'] = 'Nio WhatsApp Bot';
    }

    const bodyPayload = {
        model: model || 'default',
        messages,
        stream: false
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${providerName} HTTP ${response.status}: ${errText.slice(0, 150)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (typeof text !== 'string' || !text.trim()) {
        throw new Error(`Respons dari ${providerName} kosong atau tidak valid.`);
    }

    return text.trim();
}

/**
 * Runner terpadu AI: Secara dinamis memilih provider (Gemini, OpenRouter, Local, dsb)
 */
export async function executeAIRequest({
    providerId = null,
    remoteJid,
    prompt,
    systemInstruction,
    imagePart = null,
    db,
    sessionMap = null,
    onCleanResponse = (t) => t
}) {
    const currentProviderId = providerId || getAIProvider();
    const config = getProviderConfig(currentProviderId);

    // 1. PROVIDER GEMINI
    if (!config || config.type === 'gemini' || currentProviderId === 'gemini') {
        const modelsToTry = await getValidModels();
        const rawDbHistory = db[sessionMap ? 'nio' : 'ai']?.[remoteJid] || [];

        // Filter riwayat valid
        const cleanHistory = rawDbHistory
            .map(h => {
                if (!h || !Array.isArray(h.parts)) return null;
                return {
                    role: h.role,
                    parts: h.parts.map(p => {
                        if (h.role === 'model' && p.text) {
                            return { ...p, text: onCleanResponse(p.text) };
                        }
                        return p;
                    })
                };
            })
            .filter(h => h && Array.isArray(h.parts) && h.parts.length > 0 &&
                h.parts.some(p => (p.text && p.text.trim()) || p.inlineData)
            );

        const validHistory = [];
        for (const item of cleanHistory) {
            if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === item.role) {
                continue;
            }
            validHistory.push(item);
        }
        while (validHistory.length > 0 && validHistory[0].role !== 'user') {
            validHistory.shift();
        }

        const messagePayload = imagePart ? [{ text: prompt }, imagePart] : prompt;

        for (const modelName of modelsToTry) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
                let chat = sessionMap ? sessionMap.get(remoteJid) : null;
                if (!chat || chat.model !== modelName) {
                    chat = model.startChat({ history: validHistory });
                    chat.model = modelName;
                    if (sessionMap) sessionMap.set(remoteJid, chat);
                }

                const result = await chat.sendMessage(messagePayload);
                const rawText = result.response.text();
                if (!rawText || !rawText.trim()) throw new Error('Respon Gemini kosong');

                const responseText = onCleanResponse(rawText, prompt);
                const rawHistory = await chat.getHistory();

                const dbKey = sessionMap ? 'nio' : 'ai';
                db[dbKey][remoteJid] = rawHistory.map(h => ({
                    role: h.role,
                    parts: h.parts.map(p => {
                        if (p.inlineData) return { text: '[Gambar dikirim pengguna]' };
                        if (h.role === 'model' && p.text) return { ...p, text: onCleanResponse(p.text, prompt) };
                        return p;
                    })
                })).filter(h => h.parts && h.parts.length > 0 && h.parts.some(p => p.text?.trim() || p.inlineData));

                return { success: true, text: responseText, provider: 'gemini', model: modelName };
            } catch (err) {
                console.warn(`Gemini model ${modelName} gagal:`, err.message);
                continue;
            }
        }
        throw new Error('Semua model Gemini sedang limit atau gagal dihubungi.');
    }

    // 2. OPENAI-COMPATIBLE PROVIDERS (OpenRouter, Ollama/Local, DeepSeek, Groq, dll.)
    const dbKey = sessionMap ? 'nio' : 'ai';
    const history = db[dbKey]?.[remoteJid] || [];

    const rawResponse = await askOpenAICompatible({
        providerConfig: config,
        history,
        systemInstruction,
        prompt,
        imagePart
    });

    const responseText = onCleanResponse(rawResponse, prompt);

    // Simpan ke DB dalam struktur seragam
    db[dbKey][remoteJid] = [
        ...history,
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: responseText }] }
    ];

    if (sessionMap) {
        sessionMap.delete(remoteJid); // reset session instance jika beralih
    }

    return {
        success: true,
        text: responseText,
        provider: config.id,
        model: config.model,
        providerName: config.name || config.id
    };
}

