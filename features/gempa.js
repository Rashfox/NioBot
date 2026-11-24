import { readDB, writeDB } from './state.js';

const BMKG_URL = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
const BMKG_MAP_BASE_URL = 'https://data.bmkg.go.id/DataMKG/TEWS/';
const POLL_INTERVAL_MS = 60_000;

let monitorSocket = null;
let monitorTimer = null;
let pollInProgress = false;

export default {
    name: 'gempa',
    aliases: ['gempabumi', 'bmkg'],
    execute: async ({ sock, remoteJid, reply, args, prefix, command, msg }) => {
        const action = (args[0] || 'info').toLowerCase();

        if (action === 'on' || action === 'subscribe') {
            const db = readDB();
            if (!db.settings) db.settings = {};
            if (!Array.isArray(db.settings.bmkgEarthquakeChats)) db.settings.bmkgEarthquakeChats = [];

            if (!db.settings.bmkgEarthquakeChats.includes(remoteJid)) {
                db.settings.bmkgEarthquakeChats.push(remoteJid);
                writeDB(db);
            }

            await reply('✅ Notifikasi gempa BMKG aktif untuk chat ini. Pengecekan berjalan tiap menit.');
            try {
                const quake = await getLatestEarthquake();
                await sendEarthquakeMessage(sock, remoteJid, quake, { quoted: msg });
            } catch (error) {
                console.error('Gagal mengambil info gempa BMKG:', error.message);
                await reply(`❌ Langganan aktif, tetapi info gempa terbaru gagal diambil: ${error.message}`);
            }
            return;
        }

        if (action === 'off' || action === 'unsubscribe') {
            const db = readDB();
            if (!db.settings) db.settings = {};
            const subscribers = Array.isArray(db.settings.bmkgEarthquakeChats)
                ? db.settings.bmkgEarthquakeChats
                : [];
            db.settings.bmkgEarthquakeChats = subscribers.filter((jid) => jid !== remoteJid);
            writeDB(db);
            return reply('🔕 Notifikasi gempa BMKG dimatikan untuk chat ini.');
        }

        if (action !== 'info' && action !== 'status') {
            return reply(
                `Gunakan:\n` +
                `• ${prefix}${command} — info gempa terbaru BMKG\n` +
                `• ${prefix}${command} on — aktifkan notifikasi untuk chat ini\n` +
                `• ${prefix}${command} off — matikan notifikasi untuk chat ini`
            );
        }

        const db = readDB();
        const isSubscribed = Array.isArray(db.settings?.bmkgEarthquakeChats)
            && db.settings.bmkgEarthquakeChats.includes(remoteJid);
        try {
            const quake = await getLatestEarthquake();
            const footer = `\n\n🔔 Notifikasi chat ini: ${isSubscribed ? 'aktif' : 'nonaktif'} (gunakan ${prefix}${command} on/off).`;
            await sendEarthquakeMessage(sock, remoteJid, quake, { footer, quoted: msg });
        } catch (error) {
            console.error('Gagal mengambil info gempa BMKG:', error.message);
            await reply(`❌ Info gempa BMKG gagal diambil: ${error.message}`);
        }
    }
};

export function startEarthquakeMonitor(sock) {
    monitorSocket = sock;
    const subscribers = readDB().settings?.bmkgEarthquakeChats;
    const subscriberCount = Array.isArray(subscribers) ? subscribers.length : 0;
    console.log(`✅ Monitor gempa BMKG aktif; ${subscriberCount} chat berlangganan, cek tiap menit.`);
    if (monitorTimer) return;

    void pollForEarthquakeUpdate().catch((error) => {
        console.error('Gagal memulai monitor gempa BMKG:', error.message);
    });
    monitorTimer = setInterval(() => {
        void pollForEarthquakeUpdate().catch((error) => {
            console.error('Gagal memeriksa feed gempa BMKG:', error.message);
        });
    }, POLL_INTERVAL_MS);
}

export async function getLatestEarthquake() {
    const response = await fetch(BMKG_URL, {
        signal: AbortSignal.timeout(15000),
        headers: {
            Accept: 'application/json',
            'User-Agent': 'NioBot-BMKG/1.0'
        }
    });
    if (!response.ok) throw new Error(`BMKG merespons HTTP ${response.status}`);

    const data = await response.json();
    const quake = data?.Infogempa?.gempa;
    if (!quake || !quake.DateTime || !quake.Magnitude || !quake.Wilayah) {
        throw new Error('Data gempa dari BMKG belum lengkap');
    }
    return quake;
}

async function pollForEarthquakeUpdate() {
    if (pollInProgress || !monitorSocket) return;
    pollInProgress = true;

    try {
        const quake = await getLatestEarthquake();
        const eventId = quake.DateTime || `${quake.Tanggal}|${quake.Jam}|${quake.Coordinates}|${quake.Magnitude}`;
        const db = readDB();
        if (!db.settings) db.settings = {};

        const previousEventId = db.settings.bmkgLastEarthquakeId;
        if (previousEventId === eventId) return;

        db.settings.bmkgLastEarthquakeId = eventId;
        writeDB(db);

        if (!previousEventId) {
            console.log(`ℹ️ Feed gempa BMKG tersinkronisasi: ${eventId}`);
            return;
        }

        const subscribers = Array.isArray(db.settings.bmkgEarthquakeChats)
            ? db.settings.bmkgEarthquakeChats
            : [];
        if (!subscribers.length) return;

        console.log(`📢 Mengirim pembaruan gempa BMKG ke ${subscribers.length} chat.`);

        for (const jid of subscribers) {
            try {
                await sendEarthquakeMessage(monitorSocket, jid, quake, {
                    header: `🚨 *PEMBARUAN GEMPA BMKG*\n\n`
                });
            } catch (error) {
                console.error(`Gagal mengirim notifikasi gempa ke ${jid}:`, error.message);
            }
        }
    } finally {
        pollInProgress = false;
    }
}

async function sendEarthquakeMessage(sock, jid, quake, { header = '', footer = '', quoted } = {}) {
    const { text, shakemapUrl } = formatEarthquake(quake);
    const fullText = `${header}${text}${footer}`;
    const sendOptions = quoted ? { quoted } : {};

    if (shakemapUrl) {
        try {
            const imgRes = await fetch(shakemapUrl, {
                signal: AbortSignal.timeout(15000),
                    headers: {
                        'User-Agent': 'NioBot-BMKG/1.0',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    }
            });
            if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);

            const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption: fullText
            }, sendOptions);
            return;
        } catch (imgError) {
            console.warn(`⚠️ Gambar shakemap gagal dimuat (${imgError.message}), mengirim teks saja.`);
        }
    }

    await sock.sendMessage(jid, { text: fullText }, sendOptions);
}

function formatEarthquake(quake) {
    const text = [
        `🌏 *INFO GEMPA TERBARU — BMKG*`,
        `🕒 ${quake.Tanggal || 'Waktu tidak tersedia'} ${quake.Jam || ''}`.trim(),
        `📏 Magnitudo: *${quake.Magnitude}*`,
        `📍 ${quake.Wilayah}`,
        `⬇️ Kedalaman: ${quake.Kedalaman || 'tidak tersedia'}`,
        `🧭 Koordinat: ${quake.Coordinates || 'tidak tersedia'}`,
        quake.Potensi ? `⚠️ Potensi: ${quake.Potensi}` : null,
        quake.Dirasakan ? `📳 Dirasakan: ${quake.Dirasakan}` : null,
        `_Sumber: feed resmi BMKG. Ikuti arahan BMKG dan petugas setempat._`
    ].filter(Boolean).join('\n');

    const shakemapUrl = quake.Shakemap ? `${BMKG_MAP_BASE_URL}${quake.Shakemap}` : null;

    return { text, shakemapUrl };
}