import {
    getAIProvider,
    setAIProvider,
    getAllAIProviders,
    getProviderConfig,
    saveProviderConfig,
    deleteProviderConfig
} from './state.js';

// ── OWNER-ONLY: AI Provider Management & Dynamic Setup ───────────────────────
// Perintah:
//   .setai                      → tampilkan status & daftar semua provider
//   .setai <provider_id>        → ganti provider aktif (gemini, openrouter, local, dsb)
//   .setaimodel [id] <model>    → atur model provider aktif / tertentu
//   .setaikey [id] <key>        → atur API key provider (ketik "none" untuk hapus)
//   .setaiurl [id] <url>        → atur base URL endpoint provider
//   .addai <id> <name> <url> <model> [key] → tambah provider pihak ketiga baru secara dinamis
//   .delai <id>                 → hapus custom provider pihak ketiga

export default [
    {
        name: 'setai',
        aliases: ['switchai', 'aiswitch', 'listai'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ *Cemberut* Ini khusus Rash aja yang bisa ngatur!');

            const allProviders = getAllAIProviders();
            const currentProviderId = getAIProvider();

            if (!args.length) {
                let statusText = `🤖 *MANAJEMEN AI PROVIDER*\n\n`;
                statusText += `🔘 *Provider Aktif:* \`${currentProviderId}\` (${allProviders[currentProviderId]?.name || 'Unknown'})\n\n`;
                statusText += `📋 *Daftar Provider Tersedia:*\n`;

                for (const [id, prov] of Object.entries(allProviders)) {
                    const isCurrent = id === currentProviderId;
                    const bullet = isCurrent ? '🟢' : '⚪';
                    statusText += `${bullet} *${prov.name || id}* [\`${id}\`]\n`;
                    if (prov.type === 'gemini') {
                        statusText += `   • Tipe: Google Gemini SDK\n`;
                    } else {
                        statusText += `   • URL: \`${prov.baseUrl || '-'}\`\n`;
                        statusText += `   • Model: \`${prov.model || '-'}\`\n`;
                        statusText += `   • API Key: ${prov.apiKey ? '✅ Terset' : '❌ Kosong'}\n`;
                    }
                    statusText += `\n`;
                }

                statusText += `🔁 *Ganti Provider:* \`${prefix}setai <id>\`\n`;
                statusText += `   _Contoh:_ \`${prefix}setai openrouter\` atau \`${prefix}setai gemini\`\n\n`;
                statusText += `⚙️ *Ubah Pengaturan:* \n`;
                statusText += `   • \`${prefix}setaimodel [id] <model>\`\n`;
                statusText += `   • \`${prefix}setaikey [id] <key>\`\n`;
                statusText += `   • \`${prefix}setaiurl [id] <url>\`\n\n`;
                statusText += `➕ *Tambah Pihak Ketiga Baru:*\n`;
                statusText += `   • \`${prefix}addai <id> <nama> <url> <model> [key]\`\n`;
                statusText += `   • \`${prefix}delai <id>\` (hapus custom provider)`;

                return reply(statusText);
            }

            const target = args[0].toLowerCase();
            const aliasMap = {
                lokal: 'local',
                ollama: 'local',
                google: 'gemini',
                router: 'openrouter'
            };
            const resolvedTarget = aliasMap[target] || target;

            if (!allProviders[resolvedTarget]) {
                return reply(`❌ Provider dengan ID *"${resolvedTarget}"* tidak ditemukan!\n\nKetik \`${prefix}setai\` untuk melihat daftar yang tersedia atau gunakan \`${prefix}addai\` untuk menambahkan baru.`);
            }

            setAIProvider(resolvedTarget);
            const prov = allProviders[resolvedTarget];

            let note = '';
            if (resolvedTarget === 'openrouter' && !prov.apiKey) {
                note = `\n\n⚠️ *Perhatian:* API Key OpenRouter belum diset! Silakan ketik:\n\`${prefix}setaikey openrouter <your_openrouter_api_key>\``;
            } else if (resolvedTarget === 'local') {
                note = `\n\n⚠️ Pastikan server Ollama/Local AI kamu berjalan di \`${prov.baseUrl}\` ya!`;
            }

            return reply(`✅ *Provider AI berhasil diubah ke [${prov.name || resolvedTarget}]!*${note}`);
        }
    },
    {
        name: 'setaimodel',
        aliases: ['aimodel'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ Cuma Rash yang bisa ngatur ini!');
            if (!args.length) {
                return reply(
                    `❌ Format salah!\n\n` +
                    `Gunakan:\n` +
                    `• \`${prefix}setaimodel <model>\` (untuk provider yang sedang aktif)\n` +
                    `• \`${prefix}setaimodel <id_provider> <model>\`\n\n` +
                    `Contoh OpenRouter:\n\`${prefix}setaimodel openrouter deepseek/deepseek-chat\`\n` +
                    `\`${prefix}setaimodel openrouter meta-llama/llama-3.3-70b-instruct\``
                );
            }

            const all = getAllAIProviders();
            let targetProviderId = getAIProvider();
            let newModel = '';

            if (all[args[0].toLowerCase()] && args.length > 1) {
                targetProviderId = args[0].toLowerCase();
                newModel = args.slice(1).join(' ').trim();
            } else {
                newModel = args.join(' ').trim();
            }

            if (!newModel) return reply('❌ Nama model tidak boleh kosong!');

            saveProviderConfig(targetProviderId, { model: newModel });
            const prov = getProviderConfig(targetProviderId);
            reply(`✅ *Model AI untuk [${prov.name || targetProviderId}] diperbarui!*\n\nModel aktif: \`${newModel}\``);
        }
    },
    {
        name: 'setaikey',
        aliases: ['aikey'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ Cuma Rash yang bisa ngatur ini!');
            if (!args.length) {
                return reply(
                    `❌ Format salah!\n\n` +
                    `Gunakan:\n` +
                    `• \`${prefix}setaikey <key>\` (untuk provider aktif)\n` +
                    `• \`${prefix}setaikey <id_provider> <key>\`\n\n` +
                    `Ketik \`none\` jika ingin mengosongkan key.\n\n` +
                    `Contoh OpenRouter:\n\`${prefix}setaikey openrouter sk-or-v1-xxxxxx\``
                );
            }

            const all = getAllAIProviders();
            let targetProviderId = getAIProvider();
            let keyInput = '';

            if (all[args[0].toLowerCase()] && args.length > 1) {
                targetProviderId = args[0].toLowerCase();
                keyInput = args.slice(1).join(' ').trim();
            } else {
                keyInput = args.join(' ').trim();
            }

            const finalKey = keyInput.toLowerCase() === 'none' ? '' : keyInput;
            saveProviderConfig(targetProviderId, { apiKey: finalKey });
            const prov = getProviderConfig(targetProviderId);

            reply(finalKey
                ? `✅ *API Key [${prov.name || targetProviderId}] berhasil disimpan!*\n\nKey: \`${finalKey.slice(0, 10)}...${finalKey.slice(-4)}\` (terlindungi)`
                : `✅ *API Key [${prov.name || targetProviderId}] dikosongkan.*`
            );
        }
    },
    {
        name: 'setaiurl',
        aliases: ['aiurl'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ Cuma Rash yang bisa ngatur ini!');
            if (!args.length) {
                return reply(
                    `❌ Format salah!\n\n` +
                    `Gunakan:\n` +
                    `• \`${prefix}setaiurl <url>\` (untuk provider aktif)\n` +
                    `• \`${prefix}setaiurl <id_provider> <url>\`\n\n` +
                    `Contoh:\n\`${prefix}setaiurl openrouter https://openrouter.ai/api/v1\``
                );
            }

            const all = getAllAIProviders();
            let targetProviderId = getAIProvider();
            let urlInput = '';

            if (all[args[0].toLowerCase()] && args.length > 1) {
                targetProviderId = args[0].toLowerCase();
                urlInput = args.slice(1).join(' ').trim();
            } else {
                urlInput = args.join(' ').trim();
            }

            if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
                return reply('❌ URL harus diawali dengan http:// atau https://');
            }

            saveProviderConfig(targetProviderId, { baseUrl: urlInput });
            const prov = getProviderConfig(targetProviderId);
            reply(`✅ *URL Endpoint [${prov.name || targetProviderId}] berhasil diubah!*\n\nURL: \`${urlInput}\``);
        }
    },
    {
        name: 'addai',
        aliases: ['createai', 'newai'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ Cuma Rash yang bisa ngatur ini!');

            // Format: .addai <id> <nama> <baseUrl> <model> [apiKey]
            // Contoh: .addai groq Groq https://api.groq.com/openai/v1 llama-3.3-70b-versatile gsk_xxxx
            if (args.length < 4) {
                return reply(
                    `➕ *TAMBAH PROVIDER AI PIHAK KETIGA*\n\n` +
                    `Format:\n\`${prefix}addai <id> <nama> <baseUrl> <model> [apiKey]\`\n\n` +
                    `Contoh Groq:\n` +
                    `\`${prefix}addai groq "Groq Cloud" https://api.groq.com/openai/v1 llama-3.3-70b-versatile gsk_xxxx\`\n\n` +
                    `Contoh DeepSeek:\n` +
                    `\`${prefix}addai deepseek DeepSeek https://api.deepseek.com deepseek-chat sk-xxxx\`\n\n` +
                    `Semua provider yang mendukung standar OpenAI API kompatibel langsung!`
                );
            }

            const id = args[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (!id) return reply('❌ ID provider tidak valid! Gunakan huruf kecil atau angka.');

            let name = args[1];
            let baseUrl = args[2];
            let model = args[3];
            let apiKey = args[4] || '';

            if (!baseUrl.startsWith('http')) {
                return reply('❌ URL Endpoint harus diawali http:// atau https://');
            }

            saveProviderConfig(id, {
                id,
                name,
                type: 'openai_compatible',
                baseUrl,
                model,
                apiKey
            });

            reply(
                `🎉 *Provider AI Baru Berhasil Ditambahkan!*\n\n` +
                `• ID: \`${id}\`\n` +
                `• Nama: *${name}*\n` +
                `• Base URL: \`${baseUrl}\`\n` +
                `• Model: \`${model}\`\n` +
                `• API Key: ${apiKey ? '✅ Terset' : '❌ Kosong'}\n\n` +
                `Gunakan \`${prefix}setai ${id}\` untuk langsung mengaktifkannya!`
            );
        }
    },
    {
        name: 'delai',
        aliases: ['removeai'],
        execute: async ({ reply, args, isRash, prefix }) => {
            if (!isRash) return reply('❌ Cuma Rash yang bisa ngatur ini!');
            if (!args.length) return reply(`Masukkan ID provider yang ingin dihapus!\nContoh: \`${prefix}delai groq\``);

            const id = args[0].toLowerCase();
            if (['gemini', 'openrouter', 'local'].includes(id)) {
                return reply(`❌ Provider bawaan *"${id}"* tidak dapat dihapus!`);
            }

            const deleted = deleteProviderConfig(id);
            if (!deleted) {
                return reply(`❌ Provider dengan ID *"${id}"* tidak ditemukan.`);
            }

            reply(`🗑️ *Provider AI [${id}] berhasil dihapus!*`);
        }
    }
];
