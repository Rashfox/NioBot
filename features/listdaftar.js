import { readDB } from './state.js';

export default {
    name: 'listdaftar',
    aliases: ['users', 'userlist'],
    execute: async ({ reply, isRash }) => {
        // Membatasi agar hanya Rash (Owner) yang bisa melihat daftar ini
        if (!isRash) return reply('❌ *cemberut* Cuma Rash yang boleh lihat data rahasia ini!');

        let db = readDB();
        let users = db.users || {};
        let userCount = Object.keys(users).length;

        if (userCount === 0) {
            return reply('📂 Belum ada pengguna yang mendaftar sama sekali.');
        }

        let text = `📋 *DAFTAR PENGGUNA NIO (${userCount})*\n\n`;
        let i = 1;
        for (let jid in users) {
            text += `${i}. *${users[jid].name}* (${users[jid].age} tahun)\n   Nomor: wa.me/${jid.split('@')[0]}\n`;
            i++;
        }
        reply(text);
    }
};