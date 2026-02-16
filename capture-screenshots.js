import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Create images directory if it doesn't exist
  const imagesDir = join(__dirname, 'images');
  try {
    mkdirSync(imagesDir, { recursive: true });
  } catch (e) {
    // Directory already exists
  }

  console.log('📸 Starting screenshot capture...');

  // Navigate to the app
  await page.goto('http://localhost:5176');
  await page.waitForLoadState('networkidle');

  // 1. Capture drop zone (start screen)
  console.log('📷 Capturing drop zone...');
  await page.screenshot({ path: join(imagesDir, '01-drop-zone.png'), fullPage: false });

  // 2. Load conversation JSON
  console.log('📂 Loading call.json...');
  const conversationFile = join(__dirname, 'call.json');

  const fileInput = await page.locator('#postprompt-input');
  await fileInput.setInputFiles(conversationFile);

  // Wait for tabs to appear after file processing
  await page.waitForSelector('.tabs', { timeout: 5000 });
  await page.waitForTimeout(1000);

  // 3. Dashboard tab
  console.log('📷 Capturing Dashboard...');
  await page.click('.tab[data-tab="dashboard"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '02-dashboard.png'), fullPage: false });

  // 4. Charts tab
  console.log('📷 Capturing Charts...');
  await page.click('.tab[data-tab="charts"]');
  await page.waitForTimeout(1000); // Wait for charts to render
  await page.screenshot({ path: join(imagesDir, '03-charts.png'), fullPage: false });

  // 5. Timeline tab
  console.log('📷 Capturing Timeline...');
  await page.click('.tab[data-tab="timeline"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '04-timeline.png'), fullPage: false });

  // 6. Transcript tab
  console.log('📷 Capturing Transcript...');
  await page.click('.tab[data-tab="transcript"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '05-transcript.png'), fullPage: false });

  // 7. SWAIG Inspector tab
  console.log('📷 Capturing SWAIG Inspector...');
  await page.click('.tab[data-tab="swaig"]');
  await page.waitForTimeout(500);
  // Expand first entry
  const firstEntry = await page.locator('.swaig-entry__header').first();
  if (await firstEntry.isVisible()) {
    await firstEntry.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: join(imagesDir, '06-swaig-inspector.png'), fullPage: false });

  // 8. Post-Prompt tab
  console.log('📷 Capturing Post-Prompt...');
  await page.click('.tab[data-tab="post-prompt"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '07-post-prompt.png'), fullPage: false });

  // 9. State Flow tab
  console.log('📷 Capturing State Flow...');
  await page.click('.tab[data-tab="state-flow"]');
  await page.waitForTimeout(1000); // Wait for mermaid to render
  await page.screenshot({ path: join(imagesDir, '08-state-flow.png'), fullPage: false });

  // 10. Recording tab
  console.log('📷 Capturing Recording...');
  await page.click('.tab[data-tab="recording"]');
  await page.waitForTimeout(3000); // Wait longer for waveform to render
  await page.screenshot({ path: join(imagesDir, '09-recording.png'), fullPage: false });

  // 11. Global Data tab
  console.log('📷 Capturing Global Data...');
  await page.click('.tab[data-tab="global-data"]');
  await page.waitForTimeout(500);
  // Expand first section
  const firstSection = await page.locator('.global-data-header').first();
  if (await firstSection.isVisible()) {
    await firstSection.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: join(imagesDir, '10-global-data.png'), fullPage: false });

  // 12. Load SWML file
  console.log('📂 Loading SWML JSON (voyager.json)...');
  await page.goto('http://localhost:5176');
  await page.waitForLoadState('networkidle');

  const swmlFile = join(__dirname, 'voyager.json');
  const swmlFileInput = await page.locator('#swml-input');
  await swmlFileInput.setInputFiles(swmlFile);

  // Wait for tabs to appear after SWML file processing
  await page.waitForSelector('.tabs', { timeout: 5000 });
  await page.waitForTimeout(1000);

  // 13. SWML Overview tab (automatically selected)
  console.log('📷 Capturing SWML Overview...');
  await page.screenshot({ path: join(imagesDir, '11-swml-overview.png'), fullPage: false });

  // 14. SWML Prompts tab
  console.log('📷 Capturing SWML Prompts...');
  await page.click('.tab[data-tab="swml-prompts"]');
  await page.waitForTimeout(1500); // Wait for mermaid diagrams to render
  await page.screenshot({ path: join(imagesDir, '12-swml-prompts.png'), fullPage: false });

  // 15. SWML Functions tab
  console.log('📷 Capturing SWML Functions...');
  await page.click('.tab[data-tab="swml-functions"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '13-swml-functions.png'), fullPage: false });

  // 16. SWML Config tab
  console.log('📷 Capturing SWML Config...');
  await page.click('.tab[data-tab="swml-config"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imagesDir, '14-swml-config.png'), fullPage: false });

  console.log('✅ Screenshot capture complete!');
  console.log(`📁 Images saved to: ${imagesDir}`);

  await browser.close();
}

captureScreenshots().catch(console.error);
