export default {
    name: 'sholat',
    aliases: ['jadwalsholat'],
    execute: async ({ reply, args, prefix, command }) => {
        if (!args.length) return reply(`Masukkan nama kota!\nContoh: ${prefix}${command} Jakarta`);
        const kota = args.join(' ');
        try {
            const cariRes = await fetch(`https://api.myquran.com/v2/sholat/kota/cari/${kota}`);
            const cariJson = await cariRes.json();
            
            if (cariJson.status && cariJson.data && cariJson.data.length > 0) {
                const idKota = cariJson.data[0].id;
                const namaKota = cariJson.data[0].lokasi;
                
                const tgl = new Date();
                const y = tgl.getFullYear();
                const m = String(tgl.getMonth() + 1).padStart(2, '0');
                const d = String(tgl.getDate()).padStart(2, '0');
                
                const sholatRes = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${idKota}/${y}/${m}/${d}`);
                const sholatJson = await sholatRes.json();
                
                if (sholatJson.status && sholatJson.data) {
                    const jadwal = sholatJson.data.jadwal;
                    const teksJadwal = `🕌 *JADWAL SHOLAT* 🕌\n\n📍 *Kota:* ${namaKota}\n📅 *Tanggal:* ${jadwal.tanggal}\n\n🌅 *Imsak:* ${jadwal.imsak}\n🌄 *Subuh:* ${jadwal.subuh}\n☀️ *Terbit:* ${jadwal.terbit}\n🕛 *Dzuhur:* ${jadwal.dzuhur}\n🕞 *Ashar:* ${jadwal.ashar}\n🌇 *Maghrib:* ${jadwal.maghrib}\n🌙 *Isya:* ${jadwal.isya}`;
                    await reply(teksJadwal);
                } else reply('❌ Gagal mendapatkan jadwal sholat dari server.');
            } else reply(`❌ Kota "${kota}" tidak ditemukan! Coba gunakan nama kota yang lebih spesifik.`);
        } catch (err) {
            console.error(err);
            reply('❌ Terjadi kesalahan saat mencari jadwal sholat.');
        }
    }
};