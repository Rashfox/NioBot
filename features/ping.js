export default {
    name: 'ping',
    aliases: [],
    execute: async ({ sock, remoteJid, msg }) => {
        const start = Date.now();
        const sentMsg = await sock.sendMessage(remoteJid, { text: '🚀 _Menjalankan Speedtest..._' }, { quoted: msg });
        
        const end = Date.now();
        const pingSpeed = end - start;
        
        const textPing = `🏓 *PONG!*\n\n📶 *Latency:* ${pingSpeed} ms\n🤖 *Status:* Aktif & Stabil\n\n_Sistem bot berjalan dengan sangat lancar!_`;
        
        await sock.sendMessage(remoteJid, { text: textPing, edit: sentMsg.key });
    }
};