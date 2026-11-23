import { readDB, writeDB } from './state.js';

const PRAYER_LOCATION = 'cilacap';
const POLL_INTERVAL_MS = 60_000;

let monitorSocket = null;
let monitorTimer = null;
let todayPrayerTimes = null;
let lastFetchDate = '';

function getWibNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function getSubscribers(db = readDB()) {
    return Array.isArray(db.settings?.prayerReminderChats)
        ? db.settings.prayerReminderChats
        : [];
}

export default {
    name: 'sholat',
    aliases: ['jadwalsholat'],
    execute: async ({ reply, args, prefix, command, remoteJid }) => {
        const action = (args[0] || '').toLowerCase();

        if (['on', 'subscribe'].includes(action)) {
            const db = readDB();
            if (!db.settings) db.settings = {};
            if (!Array.isArray(db.settings.prayerReminderChats)) db.settings.prayerReminderChats = [];
            if (!db.settings.prayerReminderChats.includes(remoteJid)) {
                db.settings.prayerReminderChats.push(remoteJid);
                writeDB(db);
            }
            return reply(
                `✅ Pengingat sholat aktif untuk chat ini.\n` +
                `📍 Wilayah: *Cilacap*\n` +
                `Gunakan ${prefix}${command} off untuk berhenti.`
            );
        }

        if (['off', 'unsubscribe'].includes(action)) {
            const db = readDB();
            if (!db.settings) db.settings = {};
            db.settings.prayerReminderChats = getSubscribers(db).filter((jid) => jid !== remoteJid);
            writeDB(db);
            return reply('🔕 Pengingat sholat dimatikan untuk chat ini.');
        }

        if (['status', 'info'].includes(action)) {
            const subscribed = getSubscribers().includes(remoteJid);
            return reply(
                `🔔 Status pengingat chat ini: *${subscribed ? 'aktif' : 'nonaktif'}*.\n` +
                `📍 Wilayah: *Cilacap*\n\n` +
                `• ${prefix}${command} on — aktifkan\n` +
                `• ${prefix}${command} off — matikan\n` +
                `• ${prefix}${command} Jakarta — cek jadwal kota`
            );
        }

        if (!args.length) {
            return reply(
                `Masukkan nama kota!\nContoh: ${prefix}${command} Jakarta\n\n` +
                `Pengingat otomatis:\n` +
                `• ${prefix}${command} on\n` +
                `• ${prefix}${command} off\n` +
                `• ${prefix}${command} status`
            );
        }

        const kota = args.join(' ');
        try {
            const cariRes = await fetch(`https://api.myquran.com/v2/sholat/kota/cari/${kota}`);
            const cariJson = await cariRes.json();

            if (cariJson.status && cariJson.data && cariJson.data.length > 0) {
                const idKota = cariJson.data[0].id;
                const namaKota = cariJson.data[0].lokasi;
                const tgl = getWibNow();
                const y = tgl.getFullYear();
                const m = String(tgl.getMonth() + 1).padStart(2, '0');
                const d = String(tgl.getDate()).padStart(2, '0');

                const sholatRes = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${idKota}/${y}/${m}/${d}`);
                const sholatJson = await sholatRes.json();

                if (sholatJson.status && sholatJson.data) {
                    const jadwal = sholatJson.data.jadwal;
                    const teksJadwal = `🕌 *JADWAL SHOLAT* 🕌\n\n📍 *Kota:* ${namaKota}\n📅 *Tanggal:* ${jadwal.tanggal}\n\n🌅 *Imsak:* ${jadwal.imsak}\n🌄 *Subuh:* ${jadwal.subuh}\n☀️ *Terbit:* ${jadwal.terbit}\n🕛 *Dzuhur:* ${jadwal.dzuhur}\n🕞 *Ashar:* ${jadwal.ashar}\n🌇 *Maghrib:* ${jadwal.maghrib}\n🌙 *Isya:* ${jadwal.isya}`;
                    await reply(teksJadwal);
                } else {
                    await reply('❌ Gagal mendapatkan jadwal sholat dari server.');
                }
            } else {
                await reply(`❌ Kota "${kota}" tidak ditemukan! Coba gunakan nama kota yang lebih spesifik.`);
            }
        } catch (err) {
            console.error(err);
            await reply('❌ Terjadi kesalahan saat mencari jadwal sholat.');
        }
    }
};

export function startPrayerReminder(sock) {
    monitorSocket = sock;
    const subscriberCount = getSubscribers().length;
    console.log(`✅ Monitor pengingat sholat aktif; ${subscriberCount} chat berlangganan, cek tiap menit.`);
    if (monitorTimer) return;

    void checkPrayerTime().catch((error) => {
        console.error('Gagal memeriksa waktu sholat:', error.message);
    });
    monitorTimer = setInterval(() => {
        void checkPrayerTime().catch((error) => {
            console.error('Gagal memeriksa waktu sholat:', error.message);
        });
    }, POLL_INTERVAL_MS);
}

async function checkPrayerTime() {
    if (!monitorSocket) return;

    const wibTime = getWibNow();
    const y = wibTime.getFullYear();
    const m = String(wibTime.getMonth() + 1).padStart(2, '0');
    const d = String(wibTime.getDate()).padStart(2, '0');
    const currentDateStr = `${y}-${m}-${d}`;
    const currentTimeStr =
        `${String(wibTime.getHours()).padStart(2, '0')}:${String(wibTime.getMinutes()).padStart(2, '0')}`;

    if (lastFetchDate !== currentDateStr) {
        await fetchTodayPrayerTimes(y, m, d);
    }
    if (!todayPrayerTimes) return;

    const timesToRemind = [
        { name: 'Subuh', time: todayPrayerTimes.subuh },
        { name: 'Dzuhur', time: todayPrayerTimes.dzuhur },
        { name: 'Ashar', time: todayPrayerTimes.ashar },
        { name: 'Maghrib', time: todayPrayerTimes.maghrib },
        { name: 'Isya', time: todayPrayerTimes.isya }
    ];

    for (const prayer of timesToRemind) {
        if (currentTimeStr !== prayer.time) continue;

        const notificationKey = `${prayer.name}_notified`;
        if (todayPrayerTimes[notificationKey]) continue;
        todayPrayerTimes[notificationKey] = true;

        const subscribers = getSubscribers();
        if (!subscribers.length) continue;

        const msg =
            `📢 *PENGINGAT WAKTU SHOLAT*\n\n` +
            `Telah masuk waktu *${prayer.name}* untuk wilayah *Cilacap* ` +
            `(Pukul ${prayer.time} WIB).\n\n` +
            `Mari sejenak tinggalkan aktivitas dan segera dirikan sholat! 🕌`;

        console.log(`📢 Mengirim pengingat sholat ${prayer.name} ke ${subscribers.length} subscriber.`);
        for (const jid of subscribers) {
            try {
                await monitorSocket.sendMessage(jid, { text: msg });
                await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`Gagal mengirim pengingat sholat ke ${jid}:`, error.message);
            }
        }
    }
}

async function fetchTodayPrayerTimes(year, month, day) {
    try {
        const cariRes = await fetch(`https://api.myquran.com/v2/sholat/kota/cari/${PRAYER_LOCATION}`);
        const cariJson = await cariRes.json();
        if (!cariJson.status || !cariJson.data?.length) return;

        const idKota = cariJson.data[0].id;
        const sholatRes = await fetch(
            `https://api.myquran.com/v2/sholat/jadwal/${idKota}/${year}/${month}/${day}`
        );
        const sholatJson = await sholatRes.json();
        if (sholatJson.status && sholatJson.data?.jadwal) {
            todayPrayerTimes = sholatJson.data.jadwal;
            lastFetchDate = `${year}-${month}-${day}`;
            console.log('✅ Jadwal sholat otomatis area Cilacap berhasil diperbarui.');
        }
    } catch (error) {
        console.log('Gagal mengambil jadwal sholat otomatis:', error.message);
    }
}