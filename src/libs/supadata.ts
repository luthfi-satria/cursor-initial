import { Supadata, type Transcript, type TranscriptOrJobId } from '@supadata/js';
import { getSubtitles } from 'youtube-captions-scraper';

// local constants to avoid path-alias issues
const BASE_YOUTUBE = 'https://www.youtube.com/watch?v=';

if (!process.env.SUPADATA_API_KEY) {
    console.warn('Supadata client: SUPADATA_API_KEY not set. Requests will fail.');
}

const supadata = new Supadata({ apiKey: process.env.SUPADATA_API_KEY || '' });

async function delay(ms: number){ return new Promise(r=>setTimeout(r, ms)); }

export async function SupadataGetTranscript(videoId: string, opts?: { retries?: number }): Promise<string | null> {
    const videoUrl = `${BASE_YOUTUBE}${videoId}`;

    try{
        const transcriptResult: TranscriptOrJobId = await supadata.transcript({
            url: videoUrl,
            lang: 'en',
            text: true,
            mode: 'auto',
        });
            const t = transcriptResult as Transcript;
            if (!t) return null;
            if (typeof t === 'string') return t;
            if ((t as any).transcript) return (t as any).transcript;
            if ((t as any).text) return (t as any).text;
            return JSON.stringify(t);
    }catch(err:any){
        const msg = err?.response?.data?.message || err?.message || String(err);
            console.error(`Error fetching transcript for video ${videoId}: ${msg}`);
            // fallback on explicit Not Found: try youtube-captions-scraper direct fetch
            if (/not found/i.test(msg) || /404/.test(msg)){
                try{
                    console.log(`Supadata Not Found for ${videoId}, trying youtube-captions-scraper fallback...`);
                    const subs = await getSubtitles({ videoID: videoId, lang: 'en' });
                    if (Array.isArray(subs)) return subs.map(s=>s.text).join('\n');
                }catch(fbErr:any){
                    console.warn('Fallback captions fetch failed:', fbErr?.message||fbErr);
                }
            }
    }
    return null;
}

