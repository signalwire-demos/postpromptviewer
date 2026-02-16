import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function demoAgentBuilder() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  console.log('🎨 Starting Agent Builder demo...');

  // Navigate to the Agent Builder UI
  await page.goto('http://localhost:5177');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  console.log('📊 Agent Builder UI loaded');

  // Step 1: Import voyager.json to visualize existing agent
  console.log('📥 Importing voyager.json...');

  // Click Actions dropdown
  await page.click('#actions-btn');
  await page.waitForTimeout(500);

  // Click Import SWML JSON
  const importButton = await page.locator('[data-action="import-swml"]');

  // Set up file chooser handler before clicking
  const fileChooserPromise = page.waitForEvent('filechooser');
  await importButton.click();

  const fileChooser = await fileChooserPromise;
  const voyagerPath = join(__dirname, 'voyager.json');
  await fileChooser.setFiles(voyagerPath);

  // Wait for import to complete
  await page.waitForTimeout(2000);

  console.log('✅ Voyager agent imported and visualized');

  // Step 2: Interact with the canvas - zoom out to see all nodes
  console.log('🔍 Adjusting canvas view...');
  const canvas = await page.locator('#canvas');

  // Zoom out a bit using wheel events
  await canvas.hover();
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
  }

  await page.waitForTimeout(1000);

  // Step 3: Click on a step node to view its properties
  console.log('👆 Selecting a step node...');

  // Click on the canvas to select a node (Cytoscape nodes)
  // We'll try to click in the center area where nodes should be
  await canvas.click({ position: { x: 400, y: 300 } });
  await page.waitForTimeout(1500);

  // Step 4: Modify agent name
  console.log('✏️ Updating agent name...');
  const agentNameInput = await page.locator('#agent-name-input');
  await agentNameInput.click({ clickCount: 3 }); // Select all
  await agentNameInput.fill('Voyager Travel Agent (Rebuilt)');
  await page.waitForTimeout(1000);

  // Step 5: Navigate to different contexts
  console.log('🔄 Exploring contexts...');
  const contextSelect = await page.locator('#context-select');
  await contextSelect.selectOption({ index: 0 });
  await page.waitForTimeout(1500);

  // Step 6: View node counts
  console.log('📊 Checking agent metrics...');
  const nodeCount = await page.locator('#node-count').textContent();
  const funcCount = await page.locator('#function-count').textContent();
  console.log(`   - ${nodeCount}`);
  console.log(`   - ${funcCount}`);

  await page.waitForTimeout(1000);

  // Step 7: Export SWML JSON
  console.log('💾 Exporting SWML JSON...');

  await page.click('#actions-btn');
  await page.waitForTimeout(500);

  // Set up download handler
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-swml"]');
  const download = await downloadPromise;

  // Save the downloaded file
  const downloadPath = join(__dirname, 'voyager_rebuilt.json');
  await download.saveAs(downloadPath);
  console.log(`✅ SWML exported to: voyager_rebuilt.json`);

  await page.waitForTimeout(1000);

  // Step 8: Export Python SDK code
  console.log('🐍 Exporting Python SDK code...');

  await page.click('#actions-btn');
  await page.waitForTimeout(500);

  const downloadPromise2 = page.waitForEvent('download');
  await page.click('[data-action="export-sdk"]');
  const download2 = await downloadPromise2;

  const sdkPath = join(__dirname, 'voyager_rebuilt.py');
  await download2.saveAs(sdkPath);
  console.log(`✅ Python SDK exported to: voyager_rebuilt.py`);

  await page.waitForTimeout(2000);

  // Step 9: Take a screenshot of the final result
  console.log('📸 Taking screenshot...');
  await page.screenshot({
    path: join(__dirname, 'images', 'agent-builder-voyager.png'),
    fullPage: false
  });
  console.log('✅ Screenshot saved to: images/agent-builder-voyager.png');

  console.log('');
  console.log('🎉 Agent Builder demo complete!');
  console.log('');
  console.log('📁 Generated files:');
  console.log('   - voyager_rebuilt.json (SWML)');
  console.log('   - voyager_rebuilt.py (Python SDK)');
  console.log('   - images/agent-builder-voyager.png (Screenshot)');
  console.log('');

  await browser.close();
}

demoAgentBuilder().catch(console.error);
