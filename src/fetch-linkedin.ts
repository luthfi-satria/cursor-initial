import fs from 'fs';
import path from 'path';
import { expertVideos } from './data/experts.js';
import { scrapeLinkedInPostContent } from './libs/linkedin.js';

const OUT_ROOT = path.resolve('research', 'linkedin-posts');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run(): Promise<void> {
  ensureDir(OUT_ROOT);
  console.log('Starting LinkedIn scrape pipeline...');

  for (const expert of expertVideos) {
    const author = expert.name;
    const topic = expert.topic;
    const authorDir = path.join(OUT_ROOT, slugify(author));
    const outputFile = path.join(authorDir, `${slugify(topic)}.md`);

    ensureDir(authorDir);
    console.log(`Searching LinkedIn insights for ${author} on "${topic}"...`);

    const content = await scrapeLinkedInPostContent({ name: author, topic });
    if (!content) {
      console.log(`No LinkedIn insights found for [${author}] on "${topic}".`);
      continue;
    }

    fs.writeFileSync(outputFile, content, 'utf8');
    console.log(`Saved: ${outputFile}`);

    // Small delay to reduce request burst.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  console.log('LinkedIn scrape pipeline finished.');
}

run().catch((err) => {
  console.error('LinkedIn scrape failed:', err?.message || String(err));
  process.exit(1);
});