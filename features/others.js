import { exec } from 'child_process';
import { aiSessions, nioSessions, readDB, writeDB } from './state.js';

export default [
    {
        name: 'setname',
        aliases: [],
        execute: async ({ sock, reply, args, prefix, command, isRash }) => {
            if (!isRash) return reply('❌ *cemberut* Cuma Rash yang boleh ganti nama Nio!');
            if (!args.length) return reply(`Masukkan nama bot baru!\nContoh: ${prefix}${command} Nio V2`);
            try { await sock.updateProfileName(args.join(' ')); reply('✅ Nama profil berhasil diubah!'); }
            catch (err) { reply('❌ Gagal mengubah nama profil.'); }
        }
    },
    {
        name: 'setbio',
        aliases: ['setstatus'],
        execute: async ({ sock, reply, args, prefix, command, isRash }) => {
            if (!isRash) return reply('❌ *cemberut* Cuma Rash yang boleh ganti bio Nio!');
            if (!args.length) return reply(`Masukkan bio baru!\nContoh: ${prefix}${command} Bot sedang aktif!`);
            try { await sock.updateProfileStatus(args.join(' ')); reply('✅ Bio berhasil diubah!'); }
            catch (err) { reply('❌ Gagal mengubah bio bot.'); }
        }
    },
    {
        name: 'hidetag',
        aliases: ['h'],
        execute: async ({ sock, remoteJid, reply, args }) => {
            if (!remoteJid.endsWith('@g.us')) return reply('❌ Perintah ini hanya bisa digunakan di grup!');
            try {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const participants = groupMetadata.participants.map(p => p.id);
                await sock.sendMessage(remoteJid, { text: args.join(' ') || '📢 *Pengumuman!*', mentions: participants });
            } catch (err) { reply('❌ Terjadi kesalahan saat tag semua member.'); }
        }
    },
    {
        name: 'owner',
        aliases: ['creator'],
        execute: async ({ sock, remoteJid, msg }) => {
            const ownerName = process.env.OWNER_NAME || 'Owner';
            const ownerNumber = (process.env.OWNER_NUMBER || '628xxxxxxxxxx').replace(/[^0-9]/g, '');
            const ownerVCard = `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nORG:Bot Creator;\nTEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\nEND:VCARD`;
            await sock.sendMessage(remoteJid, { contacts: { displayName: ownerName, contacts: [{ vcard: ownerVCard }] } }, { quoted: msg });
        }
    },
    {
        name: 'restart',
        aliases: [],
        execute: async ({ reply, isRash }) => {
            if (!isRash) return reply('❌ *cemberut* Kamu bukan Rash! Cuma Rash yang boleh suruh Nio tidur!');
            await reply('✅ _Nio akan merestart sistemnya sekarang! (Silakan jalankan ulang NPM Start di terminal ya)_');
            setTimeout(() => { process.exit(0); }, 1500);
        }
    },
    {
        name: 'clear',
        aliases: ['clearai'],
        execute: async ({ remoteJid, reply }) => {
            let db = readDB();
            if (aiSessions.has(remoteJid) || db.ai[remoteJid]) { aiSessions.delete(remoteJid); delete db.ai[remoteJid]; }
            if (nioSessions.has(remoteJid) || db.nio[remoteJid]) { nioSessions.delete(remoteJid); delete db.nio[remoteJid]; }
            writeDB(db);
            reply('✅ Memori obrolan AI & Nio telah berhasil dihapus!');
        }
    },
    {
        name: 'menu',
        aliases: [],
        execute: async ({ sock, remoteJid, msg, prefix }) => {
            const menuText = `✨ *NIO BOT MENU* ✨\n\nHaloo! Nio di sini! 🌸\nNio itu asisten bot super pintar yang diciptakan khusus oleh *Rash*! 🥰\n\n🎯 *Prefix:* [ ${prefix} ]\n\n📌 *Kenalan Sama Nio:*\n- ${prefix}daftar <nama.usia>\n- ${prefix}unreg\n- ${prefix}ping\n- ${prefix}menu\n- ${prefix}owner\n\n🕌 *Pengingat Ibadah:*\n- ${prefix}sholat <kota>\n\n🤖 *Ngobrol Bareng Nio:*\n- ${prefix}ai <tanya>\n- ${prefix}nio <tanya>\n- ${prefix}niovn <tanya>\n- ${prefix}chatnio\n- ${prefix}stopchat\n- ${prefix}clear\n\n🎙️ *Suara & Audio (TTS):*\n- ${prefix}tts <teks/balas pesan>\n- ${prefix}ttsanime <teks/balas pesan>\n\n🌸 *Cari Gambar Anime:*\n- ${prefix}waifu\n- ${prefix}neko\n- ${prefix}maid\n\n🎬 *Stiker Animasi GIF (Nekos.best):*\n- ${prefix}menugif (lihat semua 58 kategori)\n- ${prefix}gif <kategori> (misal: ${prefix}gif hug)\n- Perintah langsung: ${prefix}hug, ${prefix}kiss, ${prefix}pat, ${prefix}dance, ${prefix}slap, dll.\n\n🎨 *Bikin-bikin:*\n- ${prefix}s / ${prefix}stiker <gambar/gif>\n- ${prefix}qc <teks/balas pesan>\n- ${prefix}toimg <balas stiker statis>\n- ${prefix}smeme <teks atas|teks bawah>\n- ${prefix}smemegif <teks atas|teks bawah> (meme animasi!)\n\n🔄 *Konversi Stiker ↔ GIF:*\n- ${prefix}togif <balas stiker animasi>\n- ${prefix}gifs <kirim/balas GIF/video>\n\n📢 *Keramaian Grup:*\n- ${prefix}hidetag <teks>\n\n👑 *Khusus Owner:*\n- ${prefix}setname <teks>\n- ${prefix}setbio <teks>\n- ${prefix}listdaftar\n- ${prefix}restart\n\n_Jangan nakal-nakal ya pakenya, nanti Nio laporin ke Rash lho! 🐾_`;

            await sock.sendMessage(remoteJid, {
                image: { url: 'assets/img/nio.jpg' },
                caption: menuText
            }, { quoted: msg });
        }
    }
];