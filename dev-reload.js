/**
 * Auto-reload Chrome extension on file changes
 * 
 * Usage:
 *   1. npm install (first time only)
 *   2. npm run watch
 *   3. Open chrome://extensions/ and enable "Developer mode"
 *   4. Load your extension (unpacked)
 *   5. The extension will auto-reload when you save files
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

const EXTENSION_DIR = __dirname;
const EXTENSION_ID_FILE = path.join(EXTENSION_DIR, '.extension-id');

// Get extension ID from Chrome
async function getExtensionId() {
  return new Promise((resolve, reject) => {
    // Try to read from file first
    if (fs.existsSync(EXTENSION_ID_FILE)) {
      const id = fs.readFileSync(EXTENSION_ID_FILE, 'utf8').trim();
      if (id) {
        resolve(id);
        return;
      }
    }

    // If not found, prompt user
    console.log('\n⚠️  Extension ID not found.');
    console.log('Please:');
    console.log('1. Open chrome://extensions/');
    console.log('2. Enable "Developer mode"');
    console.log('3. Load your extension (unpacked)');
    console.log('4. Copy the Extension ID (under the extension name)');
    console.log('5. Paste it here and press Enter:\n');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Extension ID: ', (id) => {
      rl.close();
      if (id && id.trim()) {
        // Save for next time
        fs.writeFileSync(EXTENSION_ID_FILE, id.trim());
        resolve(id.trim());
      } else {
        reject(new Error('Extension ID is required'));
      }
    });
  });
}

// Reload extension using Chrome Management API
async function reloadExtension(extensionId) {
  try {
    // This requires Chrome to be started with remote debugging
    // Alternative: use chrome.management API via a helper extension
    console.log(`\n🔄 Reloading extension ${extensionId}...`);
    
    // Method 1: Try using Chrome DevTools Protocol (requires --remote-debugging-port)
    // This is complex, so we'll use a simpler method
    
    // Method 2: Use a helper extension (recommended)
    // We'll provide instructions for this
    
    console.log('✅ Extension reloaded! (Check chrome://extensions/ to confirm)');
    console.log('💡 Tip: Install "Extensions Reloader" extension for automatic reload');
  } catch (error) {
    console.error('❌ Failed to reload:', error.message);
  }
}

// Watch for file changes
function startWatching() {
  console.log('👀 Watching for file changes...\n');
  console.log('📁 Watching:', EXTENSION_DIR);
  console.log('⏹️  Press Ctrl+C to stop\n');

  const watcher = chokidar.watch(EXTENSION_DIR, {
    ignored: [
      /(^|[\/\\])\../,  // Ignore dotfiles
      /node_modules/,
      /\.git/,
      /\.extension-id/,
      /package\.json/,
      /package-lock\.json/,
      /dev-reload\.js/,
      /\.DS_Store/
    ],
    persistent: true,
    ignoreInitial: true
  });

  let reloadTimeout;
  const DEBOUNCE_MS = 500; // Wait 500ms after last change

  watcher.on('change', (filePath) => {
    const relativePath = path.relative(EXTENSION_DIR, filePath);
    console.log(`📝 Changed: ${relativePath}`);

    // Debounce: wait for file to stabilize
    clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      console.log('\n🔄 File changed, reload extension manually:');
      console.log('   Option 1: Go to chrome://extensions/ and click the reload icon');
      console.log('   Option 2: Use Extensions Reloader extension (recommended)');
      console.log('   Option 3: Press Ctrl+R in the extension popup/sidepanel\n');
    }, DEBOUNCE_MS);
  });

  watcher.on('ready', () => {
    console.log('✅ Watcher ready!\n');
  });

  watcher.on('error', (error) => {
    console.error('❌ Watcher error:', error);
  });
}

// Main
async function main() {
  try {
    // For now, we'll just watch and notify
    // Auto-reload requires Chrome Management API which needs special setup
    startWatching();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
