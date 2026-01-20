// Options page for Extension Reload Helper

document.addEventListener('DOMContentLoaded', () => {
  const extensionIdInput = document.getElementById('extensionId');
  const saveBtn = document.getElementById('saveBtn');
  const messageDiv = document.getElementById('message');

  // Load saved extension ID
  chrome.storage.local.get(['targetExtensionId'], (result) => {
    if (result.targetExtensionId) {
      extensionIdInput.value = result.targetExtensionId;
    }
  });

  // Try to auto-detect AI Discuss extension
  chrome.management.getAll((extensions) => {
    const target = extensions.find(ext =>
      ext.name && ext.name.includes('AI Discuss')
    );

    if (target && !extensionIdInput.value) {
      extensionIdInput.value = target.id;
      showMessage('Auto-detected AI Discuss extension!', 'success');
    }
  });

  // Save button handler
  saveBtn.addEventListener('click', () => {
    const extensionId = extensionIdInput.value.trim();

    if (!extensionId) {
      showMessage('Please enter an extension ID', 'error');
      return;
    }

    // Verify the extension exists
    chrome.management.get(extensionId, (extension) => {
      if (chrome.runtime.lastError) {
        showMessage('Extension not found. Please check the ID.', 'error');
        return;
      }

      // Save it
      chrome.storage.local.set({ targetExtensionId: extensionId }, () => {
        showMessage(`Saved! Will reload: ${extension.name}`, 'success');
      });
    });
  });
});

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = type;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}
