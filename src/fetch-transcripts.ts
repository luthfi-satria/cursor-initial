import 'dotenv/config';
// runtime helpers
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
  process.exit(1);
});
import * as fs from 'fs';
import * as path from 'path';
import type { ExpertVideo } from './repository/interfaces.js';
import { SupadataGetTranscript } from './libs/supadata.js';
import { expertVideos } from './data/experts.js';

async function fetchFromSupadata(expert: ExpertVideo): Promise<void> {
  const { name, videoId } = expert;
  
  const targetDir = path.resolve('research', 'youtube-transcripts', name);

  try {
    console.log(`⏳ Fetching transcript for [${name}]...`);
    
    const fullTranscript = await SupadataGetTranscript(videoId, { retries: 3 });
    if (fullTranscript) {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(path.join(targetDir, `${videoId}.txt`), fullTranscript, 'utf-8');
      console.log(`✅ Success: Saved research/youtube-transcripts/${name}/${videoId}.txt`);
    } else {
      throw new Error('Invalid response structure from Supadata API');
    }

  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || String(error);
    console.error(`❌ Failed [${name}] (${videoId}):`, msg);
  }
}

async function main(): Promise<void> {
  if (!process.env.SUPADATA_API_KEY) {
    console.error('❌ Error: SUPADATA_API_KEY not found. Create .env with SUPADATA_API_KEY=your_key or export in shell');
    process.exit(1);
  }

  console.log('🚀 Starting batch export via Supadata API...');
  for (const expert of expertVideos) {
    await fetchFromSupadata(expert);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('🏁 Supadata data collection pipeline finished.');
}

main();