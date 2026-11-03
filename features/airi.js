import { getLocalAIConfig, getAIProvider } from './state.js';
import { askOpenAICompatible } from './ai_providers.js';

// ── AIRI: Kompatibilitas mundur untuk fungsi askAiri ────────────────────────
export async function askAiri({ history, systemInstruction, prompt, imagePart }) {
    const config = getLocalAIConfig();
    return askOpenAICompatible({
        providerConfig: config,
        history,
        systemInstruction,
        prompt,
        imagePart
    });
}
