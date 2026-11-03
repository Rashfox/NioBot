import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

export default [
    {
        name: 'waifu',
        aliases: [],
        execute: async ({ sock, remoteJid, msg, reply, senderName }) => {
            await sendAnimeImage(sock, remoteJid, msg, reply, 'waifu', senderName);
        }
    },
    {
        name: 'neko',
        aliases: [],
        execute: async ({ sock, remoteJid, msg, reply, senderName }) => {
            await sendAnimeImage(sock, remoteJid, msg, reply, 'neko', senderName);
        }
    },
    {
        name: 'maid',
        aliases: [],
        execute: async ({ sock, remoteJid, msg, reply, senderName }) => {
            await sendAnimeImage(sock, remoteJid, msg, reply, 'maid', senderName);
        }
    },
    {
        name: 'ecchi',
        aliases: ['hentai'],
        execute: async ({ sock, remoteJid, msg, reply, senderName }) => {
            await sendAnimeImage(sock, remoteJid, msg, reply, 'ecchi', senderName, true); // isNsfw = true
        }
    }
];

async function sendAnimeImage(sock, remoteJid, msg, reply, category, senderName) {
    await reply(`⏳ _Nio sedang mencari gambar HD yang bagus..._`);

    // Fungsi bantuan untuk melakukan fetch dengan aman (anti-blokir & timeout)
    const fetchJsonSafe = async (url) => {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: {
                // Format wajib untuk API seperti maids.best: APP_NAME (CONTACT_INFO).
                // Nama generik seperti "WhatsApp Bot"/"Discord Bot" otomatis diblokir mereka.
                // Ganti URL di bawah dengan repo/kontak project kamu yang sebenarnya.
                'User-Agent': 'RashBot/1.0 (https://github.com/ganti-dengan-repo-kamu/rashbot)',
                'Accept': 'application/json'
            }
        });

        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            throw new Error(`Respons server terblokir (status ${res.status}): ${trimmed.substring(0, 20)}...`);
        }

        const json = JSON.parse(trimmed);

        if (!res.ok) {
            // waifu.im & API lain biasanya mengembalikan { "detail": "..." } saat error
            throw new Error(`API Error (status ${res.status}): ${json.detail || JSON.stringify(json)}`);
        }
        if (json.detail) throw new Error(`API Error: ${json.detail}`);
        if (json.success === false) throw new Error(`API Error: ${json.message || 'Unknown error'}`);

        return json;
    };

    // Fungsi untuk mengambil gambar dari API dengan fallback
    const fetchImageFromApis = async (apiList) => {
        for (const api of apiList) {
            try {
                const json = await fetchJsonSafe(api.url);
                const url = api.get(json);
                if (url) {
                    console.log(`✅ Berhasil mendapatkan gambar dari: ${api.url}`);
                    return url;
                } else {
                    console.log(`⚠️ Skip ${api.url}: Respons valid, namun tidak ada URL gambar.`);
                }
            } catch (e) {
                console.log(`⚠️ Skip ${api.url}: ${e.message}`);
                continue; // Langsung coba API berikutnya di daftar
            }
        }
        return null;
    };

    try {
        let finalUrl = '';

        // --- Prioritas utama: waifu.im ---
        const waifuImApi = {
            'waifu': { url: `https://api.waifu.best/images?IncludedTags=waifu&IsNsfw=False&PageSize=1`, get: (d) => d.items?.[0]?.url },
            'maid': { url: `https://api.waifu.best/images?IncludedTags=maid&IsNsfw=False&PageSize=1`, get: (d) => d.items?.[0]?.url },
            'ecchi': { url: `https://api.waifu.best/images?IncludedTags=ecchi&IsNsfw=True&PageSize=1`, get: (d) => d.items?.[0]?.url },
            'hentai': { url: `https://api.waifu.best/images?IncludedTags=hentai&IsNsfw=True&PageSize=1`, get: (d) => d.items?.[0]?.url },
        }; 
        // --- API Fallback jika API utama gagal atau sedang maintenance ---
        const fallbackApis = {
            'waifu': [
                { url: `https://api.marek-server.com/images?IncludedTags=waifu&IsNsfw=false&PageSize=1`, get: (d) => d.items?.[0]?.url },
                { url: 'https://maids.best/api/v2/waifu', get: (d) => d.results?.[0]?.url },
                { url: 'https://api.waifu.pics/sfw/waifu', get: (d) => d.url },
                { url: 'https://nekos.best/api/v2/waifu', get: (d) => d.results?.[0]?.url },
                { url: 'https://nekos.life/api/v2/img/neko', get: (d) => d.url },
                { url: 'https://nekobot.xyz/api/image?type=waifu', get: (d) => d.success ? d.message : null },
                { url: 'https://nekobot.xyz/api/image?type=neko', get: (d) => d.success ? d.message : null }
            ],
            'neko': [
                { url: `https://api.marek-server.com/images?IncludedTags=neko&IsNsfw=false&PageSize=1`, get: (d) => d.items?.[0]?.url },
                { url: 'https://nekos.best/api/v2/neko', get: (d) => d.results?.[0]?.url },
                { url: 'https://nekos.life/api/v2/img/neko', get: (d) => d.url },
                { url: 'https://nekobot.xyz/api/image?type=neko', get: (d) => d.success ? d.message : null },
                { url: 'https://api.waifu.pics/sfw/neko', get: (d) => d.url }
            ],
            'maid': [
                { url: `https://api.marek-server.com/images?IncludedTags=maid&IsNsfw=false  &PageSize=1`, get: (d) => d.items?.[0]?.url },
                { url: 'https://api.waifu.pics/sfw/maid', get: (d) => d.url },
                { url: 'https://maids.best/api/v2/maid', get: (d) => d.results?.[0]?.url },
                { url: 'https://nekos.best/api/v2/kitsune', get: (d) => d.results?.[0]?.url },
                { url: 'https://nekos.life/api/v2/img/neko', get: (d) => d.url },
                { url: 'https://nekobot.xyz/api/image?type=neko', get: (d) => d.success ? d.message : null }
            ],
            'ecchi': [
                { url: `https://api.marek-server.com/images?IncludedTags=ecchi&IsNsfw=True&PageSize=1`, get: (d) => d.items?.[0]?.url },
                { url: 'https://api.waifu.pics/nsfw/waifu', get: (d) => d.url }, // waifu.pics nsfw/waifu sering berisi ecchi
                { url: 'https://nekobot.xyz/api/image?type=hentai', get: (d) => d.success ? d.message : null },
                { url: 'https://api.waifu.pics/nsfw/trap', get: (d) => d.url } // Alternatif lain
            ],
            'hentai': [
                { url: `https://api.marek-server.com/images?IncludedTags=hentai&IsNsfw=True&PageSize=1`, get: (d) => d.items?.[0]?.url },
                { url: 'https://nekobot.xyz/api/image?type=hentai', get: (d) => d.success ? d.message : null },
                { url: 'https://api.waifu.pics/nsfw/waifu', get: (d) => d.url },
                { url: 'https://api.waifu.pics/nsfw/trap', get: (d) => d.url }
            ]
        };

        // Coba API waifu.im dulu jika tersedia untuk kategori ini
        if (waifuImApi[category]) {
            finalUrl = await fetchImageFromApis([waifuImApi[category]]);
        }

        // Jika waifu.im gagal atau tidak tersedia untuk kategori ini, gunakan API fallback
        if (!finalUrl && fallbackApis[category]) {
            console.log(`ℹ️ Menggunakan daftar fallback untuk kategori '${category}'...`);
            finalUrl = await fetchImageFromApis(fallbackApis[category]);
        }

        if (finalUrl) {
            const imageRes = await fetch(finalUrl, { signal: AbortSignal.timeout(15000) });
            if (!imageRes.ok) throw new Error(`Gagal mendownload gambar dari URL (status ${imageRes.status})`);
            const imageBuffer = await imageRes.arrayBuffer();

            await sock.sendMessage(remoteJid, { image: Buffer.from(imageBuffer), caption: `✨ Ini dia gambarnya, ${senderName}! 🌸` }, { quoted: msg });
        } else {
            throw new Error("Semua server gambar gagal atau memblokir akses.");
        }
    } catch (err) {
        console.error("Gagal mengirim anime:", err.message);
        try {
            await reply('❌ Hmph! Gagal mengirim gambar. Coba lagi nanti ya Rash!');
        } catch (e) {
            console.error("Gagal mengirim pesan error:", e.message);
        }
    }
}