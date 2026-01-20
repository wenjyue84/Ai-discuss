// AI Panel - Background Service Worker

// URL patterns for each AI
const AI_URL_PATTERNS = {
  claude: ['claude.ai'],
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  gemini: ['gemini.google.com']
};

// Store latest responses using chrome.storage.session (persists across service worker restarts)
async function getStoredResponses() {
  const result = await chrome.storage.session.get('latestResponses');
  return result.latestResponses || { claude: null, chatgpt: null, gemini: null };
}

async function setStoredResponse(aiType, content) {
  const responses = await getStoredResponses();
  responses[aiType] = content;
  await chrome.storage.session.set({ latestResponses: responses });
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from side panel and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'SEND_MESSAGE':
      return await sendMessageToAI(message.aiType, message.message);

    case 'GET_RESPONSE':
      // Query content script directly for real-time response (not from storage)
      return await getResponseFromContentScript(message.aiType);

    case 'PING_CONTENT_SCRIPT':
      // Check if content script is alive and responsive
      return await pingContentScript(message.aiType);

    case 'RESPONSE_CAPTURED':
      // Content script captured a response
      await setStoredResponse(message.aiType, message.content);
      // Forward to side panel (include content for discussion mode)
      notifySidePanel('RESPONSE_CAPTURED', { aiType: message.aiType, content: message.content });
      return { success: true };

    case 'CONTENT_SCRIPT_READY':
      // Content script loaded and ready
      const aiType = getAITypeFromUrl(sender.tab?.url);
      if (aiType) {
        notifySidePanel('TAB_STATUS_UPDATE', { aiType, connected: true });
      }
      return { success: true };

    default:
      return { error: 'Unknown message type' };
  }
}

async function getResponseFromContentScript(aiType) {
  try {
    const tab = await findAITab(aiType);
    if (!tab) {
      // Fallback to stored response if tab not found
      const responses = await getStoredResponses();
      return { content: responses[aiType] };
    }

    // Ensure content script is loaded before querying
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    } catch (pingErr) {
      // If ping fails, try to inject the script
      if (pingErr.message.includes('Receiving end does not exist')) {
        console.log(`[AI Panel] Content script not found for ${aiType}, attempting to inject...`);
        await injectContentScript(aiType, tab.id);
      }
    }

    // Query content script for real-time DOM content
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_LATEST_RESPONSE'
    });

    return { content: response?.content || null };
  } catch (err) {
    // Fallback to stored response on error
    console.log('[AI Panel] Failed to get response from content script:', err.message);
    const responses = await getStoredResponses();
    return { content: responses[aiType] };
  }
}

async function injectContentScript(aiType, tabId) {
  const scriptFile = `content/${aiType}.js`;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [scriptFile]
    });
    console.log(`[AI Panel] Injected content script for ${aiType}`);
    // Give the script a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (err) {
    console.log(`[AI Panel] Failed to inject content script for ${aiType}:`, err.message);
    return false;
  }
}

async function pingContentScript(aiType) {
  try {
    const tab = await findAITab(aiType);
    if (!tab) {
      return { alive: false, error: `No ${aiType} tab found. Please open ${aiType} in a tab.` };
    }

    // Try to ping the content script with a timeout
    let response;
    try {
      response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
    } catch (pingErr) {
      // If ping fails, try to inject the script programmatically
      if (pingErr.message.includes('Receiving end does not exist') || pingErr.message === 'timeout') {
        console.log(`[AI Panel] Content script not found for ${aiType}, attempting to inject...`);
        const injected = await injectContentScript(aiType, tab.id);
        if (injected) {
          // Try pinging again after injection
          try {
            response = await Promise.race([
              chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
          } catch (retryErr) {
            return { alive: false, error: `${aiType} content script injection failed. Please refresh the ${aiType} tab.` };
          }
        } else {
          return { alive: false, error: `${aiType} tab found but content script not loaded. Please refresh the ${aiType} tab.` };
        }
      } else {
        throw pingErr;
      }
    }

    return { alive: response?.pong === true, tabId: tab.id };
  } catch (err) {
    const errorMsg = err.message.includes('Receiving end does not exist') || err.message === 'timeout'
      ? `${aiType} tab found but content script not loaded. Please refresh the ${aiType} tab.`
      : err.message;
    return { alive: false, error: errorMsg };
  }
}

async function sendMessageToAI(aiType, message) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:166',message:'sendMessageToAI entry',data:{aiType,messageLength:message?.length||0,messagePreview:message?.substring(0,100)||''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
  // #endregion
  try {
    // Find the tab for this AI
    const tab = await findAITab(aiType);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:170',message:'tab found check',data:{aiType,tabFound:!!tab,tabId:tab?.id,tabUrl:tab?.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (!tab) {
      return { success: false, error: `No ${aiType} tab found` };
    }

    // Ensure content script is loaded before sending message
    let pingSuccess = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      pingSuccess = true;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:177',message:'ping successful',data:{aiType,tabId:tab.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
      // #endregion
    } catch (pingErr) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:179',message:'ping failed',data:{aiType,tabId:tab.id,error:pingErr.message,willInject:pingErr.message.includes('Receiving end does not exist')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
      // #endregion
      // If ping fails, try to inject the script
      if (pingErr.message.includes('Receiving end does not exist')) {
        console.log(`[AI Panel] Content script not found for ${aiType}, attempting to inject before sending message...`);
        const injected = await injectContentScript(aiType, tab.id);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:182',message:'injection attempt result',data:{aiType,tabId:tab.id,injected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
        // #endregion
        if (!injected) {
          return { success: false, error: `Content script not loaded. Please refresh the ${aiType} tab.` };
        }
      } else {
        throw pingErr;
      }
    }

    // Send message to content script
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:192',message:'sending INJECT_MESSAGE to content script',data:{aiType,tabId:tab.id,messageLength:message?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D'})}).catch(()=>{});
    // #endregion
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_MESSAGE',
      message
    });
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:196',message:'INJECT_MESSAGE response received',data:{aiType,tabId:tab.id,success:response?.success,error:response?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D,E'})}).catch(()=>{});
    // #endregion

    // Notify side panel
    notifySidePanel('SEND_RESULT', {
      aiType,
      success: response?.success,
      error: response?.error
    });

    return response;
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:206',message:'sendMessageToAI error',data:{aiType,error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D,E'})}).catch(()=>{});
    // #endregion
    return { success: false, error: err.message };
  }
}

async function findAITab(aiType) {
  const patterns = AI_URL_PATTERNS[aiType];
  if (!patterns) return null;

  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (tab.url && patterns.some(p => tab.url.includes(p))) {
      return tab;
    }
  }

  return null;
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  for (const [aiType, patterns] of Object.entries(AI_URL_PATTERNS)) {
    if (patterns.some(p => url.includes(p))) {
      return aiType;
    }
  }
  return null;
}

async function notifySidePanel(type, data) {
  try {
    await chrome.runtime.sendMessage({ type, ...data });
  } catch (err) {
    // Side panel might not be open, ignore
  }
}

// Track tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const aiType = getAITypeFromUrl(tab.url);
    if (aiType) {
      notifySidePanel('TAB_STATUS_UPDATE', { aiType, connected: true });
    }
  }
});

// Track tab closures
chrome.tabs.onRemoved.addListener((tabId) => {
  // We'd need to track which tabs were AI tabs to notify properly
  // For now, side panel will re-check on next action
});
