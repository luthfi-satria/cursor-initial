import axios from 'axios';

export type LinkedInExpert = {
    name: string;
    topic: string;
};

type SearchHit = {
    title: string;
    url: string;
    snippet: string;
};

type PageContent = {
    title: string;
    url: string;
    text: string;
    hashtags: string[];
};

const DDG_URL = 'https://html.duckduckgo.com/html/';

function decodeDuckDuckGoRedirect(raw: string): string {
    if (!raw) return '';
    if (raw.startsWith('/l/?')) {
        try {
            const query = raw.split('?')[1] || '';
            const params = new URLSearchParams(query);
            const uddg = params.get('uddg');
            if (uddg) return decodeURIComponent(uddg);
        } catch {
            return '';
        }
    }
    return raw;
}

function normalizeUrl(raw: string): string {
    if (!raw) return '';
    const decoded = decodeDuckDuckGoRedirect(raw);
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
    return `https://${decoded.replace(/^\/+/, '')}`;
}

function isLinkedInPostUrl(url: string): boolean {
    return /linkedin\.com\/(posts|feed\/update|pulse|in|company)\//i.test(url);
}

function unique<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

export async function searchLinkedInViaDuckDuckGo(expert: LinkedInExpert): Promise<SearchHit[]> {
    const query = `site:linkedin.com "${expert.name}" "${expert.topic}"`;
    const sourceUrl = `${DDG_URL}?q=${encodeURIComponent(query)}`;
    const proxyUrl = `https://r.jina.ai/${sourceUrl.replace(/^https?:\/\//, 'http://')}`;
    const response = await axios.get(proxyUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
    });
    const markdown = String(response.data || '');

    const hits: SearchHit[] = [];

    // Parse markdown links produced by jina proxy.
    const mdLinks = Array.from(markdown.matchAll(/\[[^\]]*\]\((http:\/\/duckduckgo\.com\/l\/\?[^)]+)\)/g)).map((m) => m[1]);
    for (const raw of mdLinks) {
        const href = normalizeUrl(raw);
        if (!isLinkedInPostUrl(href)) continue;
        hits.push({ title: '', url: href, snippet: '' });
    }

    // Fallback: direct linkedin URLs that may appear in proxy text.
    if (!hits.length) {
        const direct = Array.from(markdown.matchAll(/https?:\/\/www\.linkedin\.com\/[^\s)]+/g)).map((m) => m[0]);
        for (const href of direct) {
            if (!isLinkedInPostUrl(href)) continue;
            hits.push({ title: '', url: href, snippet: '' });
        }
    }

    const deduped = unique(hits.map((h) => h.url)).map((url) => hits.find((h) => h.url === url)!);
    return deduped;
}

function topicFromText(text: string): string {
    const hashtags = text.match(/#([\p{L}0-9_-]+)/giu) || [];
    if (hashtags.length > 0) return hashtags[0]!.replace('#', '');
    const firstSentence = (text.split(/[.!?]\s/)[0] || '').trim();
    if (firstSentence) return firstSentence;
    return 'linkedin-insight';
}

export async function scrapeLinkedInPagesWithPuppeteer(urls: string[]): Promise<PageContent[]> {
    let puppeteerMod: any;
    try {
        puppeteerMod = await import('puppeteer');
    } catch {
        throw new Error('Puppeteer not installed. Run: pnpm add -D puppeteer');
    }

    const puppeteer = puppeteerMod.default ?? puppeteerMod;
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    const out: PageContent[] = [];
    for (const url of urls) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForTimeout(1200);
            const extracted = await page.evaluate(() => {
                const selectors = [
                    'div.feed-shared-update-v2__description',
                    'div.feed-shared-text__text-view',
                    'article',
                    '.update-components-text',
                ];

                let text = '';
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent) {
                        text = el.textContent.trim();
                        break;
                    }
                }

                const title =
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    document.title ||
                    '';

                const fallbackText =
                    document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

                const hashtags = Array.from(document.querySelectorAll('a'))
                    .map((a) => (a.textContent || '').trim())
                    .filter((txt) => txt.startsWith('#'));

                return {
                    title: title.trim(),
                    text: (text || fallbackText).trim(),
                    hashtags,
                };
            });

            out.push({
                title: extracted.title,
                url,
                text: extracted.text,
                hashtags: extracted.hashtags,
            });
        } catch (err: any) {
            console.warn(`LinkedIn puppeteer skip ${url}: ${err?.message || String(err)}`);
        }
    }

    await browser.close();
    return out;
}

export async function scrapeLinkedInPostContent(expert: LinkedInExpert): Promise<string | null> {
    const hits = await searchLinkedInViaDuckDuckGo(expert);
    if (!hits.length) return null;

    const topUrls = hits.map((h) => h.url).slice(0, 5);
    let pages: PageContent[] = [];
    try {
        pages = await scrapeLinkedInPagesWithPuppeteer(topUrls);
    } catch (err: any) {
        // fallback: use DDG snippets if puppeteer unavailable
        console.warn(`Puppeteer fallback for ${expert.name}: ${err?.message || String(err)}`);
    }

    const lines: string[] = [];
    lines.push(`# LinkedIn Insights: ${expert.name}`);
    lines.push('');
    lines.push(`Topic Focus: ${expert.topic}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (pages.length > 0) {
        pages.forEach((p, idx) => {
            const topic = p.hashtags[0]?.replace('#', '') || topicFromText(p.text);
            lines.push(`## Post ${idx + 1}`);
            lines.push(`Title: ${p.title || 'Untitled'}`);
            lines.push(`URL: ${p.url}`);
            lines.push(`Topic: ${topic}`);
            lines.push(`Hashtags: ${p.hashtags.join(', ')}`);
            lines.push('');
            lines.push(p.text || '(No content extracted)');
            lines.push('');
            lines.push('---');
            lines.push('');
        });
        return lines.join('\n');
    }

    hits.slice(0, 5).forEach((h, idx) => {
        lines.push(`## Search Hit ${idx + 1}`);
        lines.push(`Title: ${h.title || 'Untitled'}`);
        lines.push(`URL: ${h.url}`);
        lines.push(`Snippet: ${h.snippet || '(No snippet)'}`);
        lines.push('');
        lines.push('---');
        lines.push('');
    });

    return lines.join('\n');
}
