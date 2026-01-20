// Helper extension to reload only AI Discuss extension
// This uses chrome.management API to reload a specific extension by ID

// Get extension ID from storage or prompt user
async function getTargetExtensionId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['targetExtensionId'], (result) => {
      if (result.targetExtensionId) {
        resolve(result.targetExtensionId);
      } else {
        // First time: need to get the extension ID
        // User should set it via the options page or we'll try to find it
        chrome.management.getAll((extensions) => {
          // Try to find AI Discuss extension by name
          const target = extensions.find(ext =>
            ext.name && ext.name.includes('AI Discuss')
          );

          if (target) {
            // Save it for next time
            chrome.storage.local.set({ targetExtensionId: target.id });
            resolve(target.id);
          } else {
            // Not found, need user to provide ID
            console.log('AI Discuss extension not found. Please:');
            console.log('1. Go to chrome://extensions/');
            console.log('2. Find your extension ID');
            console.log('3. Right-click this extension icon → Options');
            console.log('4. Enter the extension ID');
            resolve(null);
          }
        });
      }
    });
  });
}

// Reload the target extension
async function reloadTargetExtension() {
  const extensionId = await getTargetExtensionId();

  if (!extensionId) {
    console.error('Target extension ID not set. Please configure it in options.');
    // Show notification
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Extension Reload Helper',
      message: 'Please configure the target extension ID in options'
    });
    return;
  }

  try {
    chrome.management.reload(extensionId, () => {
      console.log('✅ Extension reloaded:', extensionId);

      // Show success notification
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: 'Extension Reloaded',
        message: 'AI Discuss extension has been reloaded'
      });
    });
  } catch (error) {
    console.error('❌ Failed to reload extension:', error);
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'Reload Failed',
      message: error.message || 'Failed to reload extension'
    });
  }
}

// Listen for icon click
chrome.action.onClicked.addListener(() => {
  reloadTargetExtension();
});

// Listen for messages (for programmatic reload)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'reload') {
    reloadTargetExtension();
    sendResponse({ success: true });
  }
  return true;
});
