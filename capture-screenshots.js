import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CALL_FILE = '/Users/brian/Desktop/ClueCon2026/demos/goair/calls/c62f681d-161a-47ac-9b12-31932d89367a.json';
const SWML_FILE = join(__dirname, 'voyager.json');
const BASE_URL = 'http://localhost:5173';

async function captureScreenshots() {
  const imagesDir = join(__dirname, 'images');
  const videoDir = join(__dirname, 'videos');
  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });

  // Context with video recording enabled
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1400, height: 900 } },
  });
  const page = await context.newPage();

  console.log('📸 Starting screenshot & video capture...\n');

  // ─── Drop zone ──────────────────────────────────────────────────────
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  console.log('📷 01 Drop zone');
  await page.screenshot({ path: join(imagesDir, '01-drop-zone.png') });

  // ─── Load GoAir call JSON ───────────────────────────────────────────
  console.log('📂 Loading GoAir demo call...');
  const fileInput = await page.locator('#postprompt-input');
  await fileInput.setInputFiles(CALL_FILE);
  await page.waitForSelector('.tabs', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ─── Dashboard ──────────────────────────────────────────────────────
  console.log('📷 02 Dashboard');
  await page.click('.tab[data-tab="dashboard"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(imagesDir, '02-dashboard.png') });

  // ─── Charts ─────────────────────────────────────────────────────────
  console.log('📷 03 Charts');
  await page.click('.tab[data-tab="charts"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(imagesDir, '03-charts.png') });

  // ─── Timeline ───────────────────────────────────────────────────────
  console.log('📷 04 Timeline');
  await page.click('.tab[data-tab="timeline"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(imagesDir, '04-timeline.png') });

  // ─── Transcript (Processed) ─────────────────────────────────────────
  console.log('📷 05 Transcript (Processed Log)');
  await page.click('.tab[data-tab="transcript"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(imagesDir, '05-transcript.png') });

  // ─── Transcript (Raw Call Log) ──────────────────────────────────────
  console.log('📷 06 Transcript (Raw Call Log)');
  const rawToggle = page.locator('.transcript__log-toggle[data-log="raw"]');
  if (await rawToggle.isVisible()) {
    await rawToggle.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: join(imagesDir, '06-raw-call-log.png') });

  // ─── SWAIG Inspector ───────────────────────────────────────────────
  console.log('📷 07 SWAIG Inspector');
  await page.click('.tab[data-tab="swaig"]');
  await page.waitForTimeout(800);
  const firstEntry = page.locator('.swaig-entry__header').first();
  if (await firstEntry.isVisible()) {
    await firstEntry.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(imagesDir, '07-swaig-inspector.png') });

  // ─── Post-Prompt ────────────────────────────────────────────────────
  console.log('📷 08 Post-Prompt');
  await page.click('.tab[data-tab="post-prompt"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '08-post-prompt.png') });

  // ─── State Flow ─────────────────────────────────────────────────────
  console.log('📷 09 State Flow');
  await page.click('.tab[data-tab="state-flow"]');
  await page.waitForTimeout(2000); // mermaid render time
  await page.screenshot({ path: join(imagesDir, '09-state-flow.png') });

  // ─── Recording ──────────────────────────────────────────────────────
  console.log('📷 10 Recording');
  await page.click('.tab[data-tab="recording"]');
  await page.waitForTimeout(4000); // waveform load
  await page.screenshot({ path: join(imagesDir, '10-recording.png') });

  // ─── Global Data (Snapshot) ─────────────────────────────────────────
  console.log('📷 11 Global Data (Snapshot)');
  await page.click('.tab[data-tab="global-data"]');
  await page.waitForTimeout(800);
  const gdSection = page.locator('.global-data-header').first();
  if (await gdSection.isVisible()) {
    await gdSection.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(imagesDir, '11-global-data-snapshot.png') });

  // ─── Global Data (Timeline) ─────────────────────────────────────────
  console.log('📷 12 Global Data (Timeline)');
  const timelineBtn = page.locator('.gd-subview-btn[data-view="timeline"]');
  if (await timelineBtn.isVisible()) {
    await timelineBtn.click();
    await page.waitForTimeout(1000);
    // Hit play briefly to show the player in action
    const playBtn = page.locator('.gd-btn').first();
    if (await playBtn.isVisible()) {
      await playBtn.click();
      await page.waitForTimeout(2000);
      await playBtn.click(); // pause
      await page.waitForTimeout(300);
    }
  }
  await page.screenshot({ path: join(imagesDir, '12-global-data-timeline.png') });

  // ─── Load SWML file ─────────────────────────────────────────────────
  console.log('📂 Loading SWML JSON (voyager.json)...');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  const swmlFileInput = page.locator('#swml-input');
  await swmlFileInput.setInputFiles(SWML_FILE);
  await page.waitForSelector('.tabs', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // ─── SWML Overview ──────────────────────────────────────────────────
  console.log('📷 13 SWML Overview');
  await page.screenshot({ path: join(imagesDir, '13-swml-overview.png') });

  // ─── SWML Prompts ───────────────────────────────────────────────────
  console.log('📷 14 SWML Prompts');
  await page.click('.tab[data-tab="swml-prompts"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(imagesDir, '14-swml-prompts.png') });

  // ─── SWML Functions ─────────────────────────────────────────────────
  console.log('📷 15 SWML Functions');
  await page.click('.tab[data-tab="swml-functions"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(imagesDir, '15-swml-functions.png') });

  // ─── SWML Config ────────────────────────────────────────────────────
  console.log('📷 16 SWML Config');
  await page.click('.tab[data-tab="swml-config"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(imagesDir, '16-swml-config.png') });

  // ─── Finish ─────────────────────────────────────────────────────────
  console.log('\n✅ Screenshots saved to:', imagesDir);

  await page.close();
  const videoPath = await page.video().path();
  const webmTmp = join(videoDir, '_tmp.webm');
  copyFileSync(videoPath, webmTmp);

  // Convert webm → mp4 (H.264) for universal playback
  const finalVideo = join(videoDir, 'ui-walkthrough.mp4');
  console.log('🔄 Converting webm → mp4...');
  execSync(`ffmpeg -y -i "${webmTmp}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart "${finalVideo}"`, { stdio: 'pipe' });
  unlinkSync(webmTmp);
  console.log('🎬 Video saved to:', finalVideo);

  await context.close();
  await browser.close();
}

captureScreenshots().catch(console.error);
