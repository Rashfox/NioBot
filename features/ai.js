import { aiSessions, readDB, writeDB, getAIProvider, getProviderConfig } from './state.js';
import { executeAIRequest } from './ai_providers.js';

export default {
    name: 'ai',
    aliases: ['chatgpt'],
    execute: async ({ remoteJid, reply, args, prefix, command, msg }) => {
        if (!args.length) return reply(`Masukkan pertanyaan untuk AI!\nContoh: ${prefix}${command} Apa itu black hole?`);
        
        await reply('⏳ _AI sedang berpikir..._');
        const pertanyaan = args.join(' ');
        
        try {
            const wibTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const pertanyaanDenganWaktu = `${pertanyaan}\n\n[System Info: Waktu saat ini adalah ${wibTime} WIB]`;

            let db = readDB();
            const systemInstruction = "Kamu adalah asisten AI WhatsApp yang cerdas, sopan, dan formal. Jawablah setiap pertanyaan dengan rapi dan jelas.";
            
            // Mendapatkan gambar jika ada
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const media = msg.message?.imageMessage || (quoted && quoted.imageMessage);
            let imagePart = null;
            if (media) {
                try {
                    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
                    const stream = await downloadContentFromMessage(media, 'image');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    imagePart = { inlineData: { data: Buffer.concat(chunks).toString("base64"), mimeType: media.mimetype || "image/jpeg" } };
                } catch (e) {}
            }

            const currentProvider = getAIProvider();
            const result = await executeAIRequest({
                providerId: currentProvider,
                remoteJid,
                prompt: pertanyaanDenganWaktu,
                systemInstruction,
                imagePart,
                db,
                sessionMap: null
            });

            writeDB(db);
            await reply(result.text);
        } catch (err) {
            console.error("AI Error:", err);
            const provider = getAIProvider();
            const config = getProviderConfig(provider);
            const name = config?.name || provider;
            reply(`❌ Terjadi kesalahan pada provider AI (*${name}*).\n\n*Detail:* ${err.message}`);
        }
    }
};
