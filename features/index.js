import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const commands = new Map();
export const aliases = new Map();

export async function loadCommands() {
    const featuresDir = path.resolve('./features');
    // Membaca semua file .js kecuali index.js dan state.js
    const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'state.js');
    
    for (const file of files) {
        const moduleUrl = pathToFileURL(path.join(featuresDir, file)).href;
        const module = await import(moduleUrl);
        const cmds = Array.isArray(module.default) ? module.default : [module.default];
        
        for (const cmd of cmds) {
            if (cmd && cmd.name) {
                commands.set(cmd.name, cmd.execute);
                if (cmd.aliases) {
                    cmd.aliases.forEach(a => aliases.set(a, cmd.name));
                }
            }
        }
    }
    console.log(`✅ Berhasil memuat ${commands.size} perintah fitur.`);
}

export function getCommand(name) {
    if (commands.has(name)) return commands.get(name);
    if (aliases.has(name)) return commands.get(aliases.get(name));
    return null;
}
