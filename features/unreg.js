import { readDB, writeDB } from './state.js';

export default {
    name: 'unreg',
    aliases: ['unregister', 'hapusdaftar'],
    execute: async ({ reply, senderJid, prefix }) => {
        let db = readDB();
        
        if (db.users && db.users[senderJid]) {
            delete db.users[senderJid];
            writeDB(db);
            reply(`✅ Pendaftaran kamu berhasil dihapus!\n\nSekarang Nio sudah melupakan namamu. Kamu bisa daftar ulang kapan saja dengan perintah *${prefix}daftar Nama.Usia*`);
        } else {
            reply(`⚠️ Kamu belum terdaftar di database Nio. Ketik *${prefix}daftar Nama.Usia* jika ingin mendaftar.`);
        }
    }
};