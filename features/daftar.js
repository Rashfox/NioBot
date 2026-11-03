import { readDB, writeDB } from './state.js';

export default {
    name: 'daftar',
    aliases: ['register', 'reg'],
    execute: async ({ reply, args, prefix, command, senderJid }) => {
        let db = readDB();
        
        if (db.users[senderJid]) {
            return reply(`❌ Kamu sudah terdaftar sebelumnya dengan nama *${db.users[senderJid].name}*!\n\n_Tidak perlu mendaftar lagi._`);
        }

        if (!args.length) {
            return reply(`❌ Format pendaftaran salah!\n\nKetik: *${prefix}${command} Nama.Usia*\nContoh: *${prefix}${command} Rash.21*`);
        }

        const input = args.join(' ');
        if (!input.includes('.')) {
            return reply(`❌ Format salah!\nPastikan menggunakan tanda titik (.) untuk memisahkan nama dan usia.\n\nContoh: *${prefix}${command} Rash.21*`);
        }

        const parts = input.split('.');
        const nama = parts[0].trim();
        const usia = parseInt(parts[1].trim());

        if (!nama) return reply('❌ Nama tidak boleh kosong!');
        if (isNaN(usia)) return reply('❌ Usia harus berupa angka!');

        db.users[senderJid] = {
            name: nama,
            age: usia,
            registeredAt: new Date().toISOString()
        };
        writeDB(db);

        reply(`✅ *Berhasil Daftar!*\n\nHalo *${nama}* (${usia} tahun)! Nio sekarang udah ingat nama kamu. 🥰\nKamu bisa ngobrol dan Nio akan memanggil kamu dengan nama ini!`);
    }
};