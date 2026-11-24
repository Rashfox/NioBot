const API_BASE = 'https://api.mangadex.org';
const RESULT_LIMIT = 5;
const CHAPTER_SCAN_LIMIT = 30;

export default {
    name: 'manga',
    aliases: ['mangadex'],
    execute: async ({ sock, remoteJid, msg, reply, args, prefix, command }) => {
        if (!args.length) {
            return reply(
                `🔎 *Pencarian MangaDex*\n\n` +
                `• ${prefix}${command} <judul>\n` +
                `• ${prefix}${command} tag <genre/tag>\n` +
                `• ${prefix}${command} chapter <jumlah>\n\n` +
                `Pencarian chapter memeriksa ${CHAPTER_SCAN_LIMIT} manga terpopuler.`
            );
        }

        await reply('⏳ _Sedang mencari manga di MangaDex..._');

        try {
            const mode = args[0].toLowerCase();
            const isChapterMode = mode === 'chapter' || mode === 'chapters';
            let mangaList;
            let chapterCounts = new Map();

            if (mode === 'tag' || mode === 'tags') {
                if (!args.slice(1).length) {
                    return reply(`Masukkan genre/tag.\nContoh: ${prefix}${command} tag action, adventure`);
                }
                const tags = await resolveTags(args.slice(1).join(' '));
                mangaList = await getMangaByTags(tags);
            } else if (isChapterMode) {
                const requestedCount = Number(args[1]);
                if (!Number.isInteger(requestedCount) || requestedCount < 1) {
                    return reply(`Masukkan jumlah chapter berupa angka positif.\nContoh: ${prefix}${command} chapter 100`);
                }

                const candidates = await getPopularManga(CHAPTER_SCAN_LIMIT);
                const counts = await mapWithConcurrency(candidates, 3, async (manga) => ({
                    id: manga.id,
                    count: await getChapterCount(manga.id)
                }));
                chapterCounts = new Map(counts.map(({ id, count }) => [id, count]));
                mangaList = candidates
                    .filter((manga) => chapterCounts.get(manga.id) === requestedCount)
                    .slice(0, RESULT_LIMIT);
            } else {
                mangaList = await searchManga(args.join(' '));
            }

            if (!mangaList.length) {
                return reply(isChapterMode
                    ? `Tidak ada manga dengan tepat ${args[1]} chapter di antara ${CHAPTER_SCAN_LIMIT} manga terpopuler yang diperiksa.`
                    : 'Manga tidak ditemukan. Coba kata kunci atau tag lain ya.');
            }

            if (chapterCounts.size === 0) {
                const counts = await mapWithConcurrency(mangaList, 3, async (manga) => ({
                    id: manga.id,
                    count: await getChapterCount(manga.id)
                }));
                chapterCounts = new Map(counts.map(({ id, count }) => [id, count]));
            }

            const results = await mapWithConcurrency(mangaList.slice(0, RESULT_LIMIT), 3, async (manga) => ({
                manga,
                details: formatManga(manga, chapterCounts.get(manga.id)),
                cover: await fetchCover(manga)
            }));

            for (const { manga, details, cover } of results) {
                if (cover) {
                    await sock.sendMessage(remoteJid, { image: cover, caption: details }, { quoted: msg });
                } else {
                    await sock.sendMessage(remoteJid, { text: details }, { quoted: msg });
                }
            }
        } catch (error) {
            console.error('Gagal mencari manga MangaDex:', error.message);
            await reply(`❌ Gagal mencari manga di MangaDex: ${error.message}`);
        }
    }
};

async function requestJson(path, params) {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params || {})) {
        if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
        else url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`MangaDex merespons HTTP ${response.status}`);

    const data = await response.json();
    if (data.result !== 'ok') throw new Error('Respons MangaDex tidak valid');
    return data;
}

async function searchManga(title) {
    const data = await requestJson('/manga', {
        title,
        limit: RESULT_LIMIT,
        'order[relevance]': 'desc',
        'contentRating[]': ['safe'],
        'includes[]': ['cover_art', 'author', 'artist']
    });
    return data.data || [];
}

async function getPopularManga(limit) {
    const data = await requestJson('/manga', {
        limit,
        'order[followedCount]': 'desc',
        'contentRating[]': ['safe'],
        'includes[]': ['cover_art', 'author', 'artist']
    });
    return data.data || [];
}

async function getMangaByTags(tags) {
    const data = await requestJson('/manga', {
        limit: RESULT_LIMIT,
        'includedTags[]': tags.map((tag) => tag.id),
        includedTagsMode: 'AND',
        'order[followedCount]': 'desc',
        'contentRating[]': ['safe'],
        'includes[]': ['cover_art', 'author', 'artist']
    });
    return data.data || [];
}

async function resolveTags(query) {
    const tagData = await requestJson('/manga/tag');
    const availableTags = tagData.data || [];
    const requested = query.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (!requested.length) throw new Error('Masukkan setidaknya satu genre/tag');

    return requested.map((name) => {
        const normalized = name.toLowerCase();
        const exact = availableTags.find((tag) =>
            Object.values(tag.attributes?.name || {}).some((localized) =>
                typeof localized === 'string' && localized.toLowerCase() === normalized
            )
        );
        if (exact) return exact;

        const partial = availableTags.filter((tag) =>
            Object.values(tag.attributes?.name || {}).some((localized) =>
                typeof localized === 'string' && localized.toLowerCase().includes(normalized)
            )
        );
        if (partial.length === 1) return partial[0];
        if (partial.length > 1) {
            const suggestions = partial.slice(0, 5).map((tag) => tag.attributes.name.en || Object.values(tag.attributes.name)[0]);
            throw new Error(`Tag "${name}" ambigu. Coba salah satu: ${suggestions.join(', ')}`);
        }
        throw new Error(`Tag "${name}" tidak ditemukan di MangaDex`);
    });
}

async function getChapterCount(mangaId) {
    const data = await requestJson(`/manga/${encodeURIComponent(mangaId)}/aggregate`);
    const chapters = new Set();
    for (const [volume, volumeData] of Object.entries(data.volumes || {})) {
        for (const chapter of Object.keys(volumeData.chapters || {})) {
            chapters.add(`${volume}:${chapter}`);
        }
    }
    return chapters.size;
}

async function mapWithConcurrency(items, concurrency, callback) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await callback(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

async function fetchCover(manga) {
    const coverUrl = getCoverUrl(manga);
    if (!coverUrl) return null;

    try {
        const response = await fetch(coverUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) throw new Error('Respons bukan gambar');
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.warn(`Gagal memuat cover manga ${manga.id}: ${error.message}`);
        return null;
    }
}

function getMangaTitle(manga) {
    const title = manga.attributes?.title || {};
    return title.en || title['ja-ro'] || Object.values(title)[0] || 'Judul tidak tersedia';
}

function formatManga(manga, chapterCount) {
    const attributes = manga.attributes || {};
    const title = getMangaTitle(manga);
    const description = attributes.description?.id || attributes.description?.en || Object.values(attributes.description || {})[0] || 'Sinopsis tidak tersedia.';
    const tags = (attributes.tags || [])
        .map((tag) => tag.attributes?.name?.en || Object.values(tag.attributes?.name || {})[0])
        .filter(Boolean)
        .slice(0, 10);
    const author = (manga.relationships || [])
        .filter((relation) => relation.type === 'author' || relation.type === 'artist')
        .map((relation) => relation.attributes?.name)
        .filter(Boolean);
    const readUrl = `https://mangadex.org/title/${manga.id}`;

    return [
        `📚 *${title}*`,
        author.length ? `✍️ ${[...new Set(author)].join(', ')}` : null,
        `🏷️ ${tags.length ? tags.join(', ') : 'Tag tidak tersedia'}`,
        `📖 Chapter: ${chapterCount == null ? 'tidak tersedia' : chapterCount}`,
        `📝 ${truncate(description.replace(/\s+/g, ' ').trim(), 550)}`,
        `🔗 Baca di MangaDex: ${readUrl}`
    ].filter(Boolean).join('\n\n');
}

function getCoverUrl(manga) {
    const cover = (manga.relationships || []).find((relation) => relation.type === 'cover_art');
    const fileName = cover?.attributes?.fileName;
    return fileName
        ? `https://uploads.mangadex.org/covers/${encodeURIComponent(manga.id)}/${encodeURIComponent(fileName)}.256.jpg`
        : null;
}

function truncate(text, maxLength) {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}