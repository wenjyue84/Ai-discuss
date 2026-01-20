// AI Panel - Background Service Worker

// URL patterns for each AI
const AI_URL_PATTERNS = {
  claude: ['claude.ai'],
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  gemini: ['gemini.google.com'],
  perplexity: ['perplexity.ai']
};

// Store latest responses using chrome.storage.session (persists across service worker restarts)
async function getStoredResponses() {
  const result = await chrome.storage.session.get('latestResponses');
  return result.latestResponses || { claude: null, chatgpt: null, gemini: null, perplexity: null };
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
  // #region agent log
  try {
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:104',message:'injectContentScript entry',data:{aiType,tabId,scriptFile:`content/${aiType}.js`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
  } catch (e) {}
  // #endregion
  const scriptFile = `content/${aiType}.js`;
  console.log(`[AI Panel DEBUG] Attempting to inject ${scriptFile} into tab ${tabId} for ${aiType}`);
  
  // Check if tab is ready
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== 'complete') {
      console.log(`[AI Panel] Tab ${tabId} not ready, status: ${tab.status}`);
      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (tabErr) {
    console.error(`[AI Panel] Error checking tab ${tabId}:`, tabErr);
  }
  
  try {
    // First, inject a test script to verify injection works and check for errors
    try {
      const testResult = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // Create a visible marker to verify script execution
          const marker = document.createElement('div');
          marker.id = 'ai-panel-injection-marker';
          marker.style.cssText = 'position:fixed;top:10px;right:10px;background:red;color:white;padding:5px;z-index:999999;font-size:12px;';
          marker.textContent = 'AI Panel Script Injected';
          document.body.appendChild(marker);
          setTimeout(() => marker.remove(), 3000);
          return { success: true, url: window.location.href, hasRuntime: !!chrome.runtime };
        }
      });
      console.log(`[AI Panel] Test injection successful for ${aiType}:`, testResult);
    } catch (testErr) {
      console.error(`[AI Panel] Test injection failed for ${aiType}:`, testErr);
      // Continue anyway, might be CSP issue but main script might still work
    }

    // Now inject the actual content script
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [scriptFile]
    });
    // #region agent log
    try {
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:130',message:'injectContentScript executeScript success',data:{aiType,tabId,scriptFile,resultLength:result?.length,result:JSON.stringify(result)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    console.log(`[AI Panel] Injected content script for ${aiType}`, result);
    
    // Also try injecting into all frames (in case Perplexity uses iframes)
    if (aiType === 'perplexity') {
      try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId: tabId });
        console.log(`[AI Panel] Found ${frames.length} frames for Perplexity tab`);
        for (const frame of frames) {
          if (frame.frameId !== 0 && frame.url && (frame.url.includes('perplexity.ai'))) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tabId, frameIds: [frame.frameId] },
                files: [scriptFile]
              });
              console.log(`[AI Panel] Injected into frame ${frame.frameId} (${frame.url})`);
            } catch (frameErr) {
              console.log(`[AI Panel] Failed to inject into frame ${frame.frameId}:`, frameErr.message);
            }
          }
        }
      } catch (frameErr) {
        console.log(`[AI Panel] Error getting frames:`, frameErr);
      }
    }
    
    // Give the script a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
    // #region agent log
    try {
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:127',message:'injectContentScript returning true',data:{aiType,tabId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    return true;
  } catch (err) {
    // #region agent log
    try {
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:131',message:'injectContentScript error',data:{aiType,tabId,scriptFile,error:err.message,errorStack:err.stack,errorName:err.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    console.error(`[AI Panel] Failed to inject content script for ${aiType}:`, err);
    console.error(`[AI Panel] Error details:`, { name: err.name, message: err.message, stack: err.stack });
    return false;
  }
}

async function pingContentScript(aiType) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:121',message:'pingContentScript entry',data:{aiType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D,E'})}).catch(()=>{});
  // #endregion
  try {
    const tab = await findAITab(aiType);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:125',message:'findAITab result',data:{aiType,tabFound:!!tab,tabId:tab?.id,tabUrl:tab?.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!tab) {
      return { alive: false, error: `No ${aiType} tab found. Please open ${aiType} in a tab.` };
    }

    // Try to ping the content script with a timeout
    let response;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:132',message:'ping attempt before injection',data:{aiType,tabId:tab.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:136',message:'ping success before injection',data:{aiType,tabId:tab.id,response:response},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    } catch (pingErr) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:139',message:'ping failed, checking if should inject',data:{aiType,tabId:tab.id,pingError:pingErr.message,shouldInject:pingErr.message.includes('Receiving end does not exist') || pingErr.message === 'timeout'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,E'})}).catch(()=>{});
      // #endregion
      // If ping fails, try to inject the script programmatically
      if (pingErr.message.includes('Receiving end does not exist') || pingErr.message === 'timeout') {
        console.log(`[AI Panel] Content script not found for ${aiType}, attempting to inject...`);
        console.log(`[AI Panel DEBUG] Tab URL: ${tab.url}, Tab ID: ${tab.id}, Tab status: ${tab.status}`);
        // Verify tab URL matches expected pattern
        const patterns = AI_URL_PATTERNS[aiType];
        if (patterns && tab.url && !patterns.some(p => tab.url.includes(p))) {
          console.error(`[AI Panel] Tab URL ${tab.url} does not match patterns ${patterns.join(', ')}`);
          return { alive: false, error: `${aiType} tab URL does not match expected pattern. Please navigate to a valid ${aiType} page.` };
        }
        const injected = await injectContentScript(aiType, tab.id);
        // #region agent log
        try {
          fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:145',message:'injection result',data:{aiType,tabId:tab.id,injected,tabUrl:tab.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
        } catch (e) {}
        // #endregion
        if (injected) {
          // Try pinging again after injection with retries
          let pingSuccess = false;
          const maxRetries = 3;
          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              // #region agent log
              try {
                fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:205',message:'ping attempt after injection',data:{aiType,tabId:tab.id,retry},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,E'})}).catch(()=>{});
              } catch (e) {}
              // #endregion
              // Wait a bit longer for each retry
              await new Promise(resolve => setTimeout(resolve, 500 * (retry + 1)));
              response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, { type: 'PING' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
              ]);
              // #region agent log
              try {
                fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:213',message:'ping success after injection',data:{aiType,tabId:tab.id,response:response,retry},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,E'})}).catch(()=>{});
              } catch (e) {}
              // #endregion
              pingSuccess = true;
              break;
            } catch (retryErr) {
              // #region agent log
              try {
                fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:220',message:'ping failed after injection, retrying',data:{aiType,tabId:tab.id,retryError:retryErr.message,retry,maxRetries},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              } catch (e) {}
              // #endregion
              console.log(`[AI Panel] Ping attempt ${retry + 1}/${maxRetries} failed for ${aiType}:`, retryErr.message);
              if (retry === maxRetries - 1) {
                return { alive: false, error: `${aiType} content script injection failed. Please refresh the ${aiType} tab.` };
              }
            }
          }
          if (!pingSuccess) {
            return { alive: false, error: `${aiType} content script injection failed. Please refresh the ${aiType} tab.` };
          }
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:155',message:'injection failed, returning error',data:{aiType,tabId:tab.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
          // #endregion
          return { alive: false, error: `${aiType} tab found but content script not loaded. Please refresh the ${aiType} tab.` };
        }
      } else {
        throw pingErr;
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:163',message:'pingContentScript returning success',data:{aiType,tabId:tab.id,alive:response?.pong === true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return { alive: response?.pong === true, tabId: tab.id };
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:166',message:'pingContentScript error',data:{aiType,error:err.message,errorStack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D,E'})}).catch(()=>{});
    // #endregion
    const errorMsg = err.message.includes('Receiving end does not exist') || err.message === 'timeout'
      ? `${aiType} tab found but content script not loaded. Please refresh the ${aiType} tab.`
      : err.message;
    return { alive: false, error: errorMsg };
  }
}

async function sendMessageToAI(aiType, message) {
  try {
    // Find the tab for this AI
    const tab = await findAITab(aiType);

    if (!tab) {
      return { success: false, error: `No ${aiType} tab found` };
    }

    // Ensure content script is loaded before sending message
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    } catch (pingErr) {
      // If ping fails, try to inject the script
      if (pingErr.message.includes('Receiving end does not exist')) {
        console.log(`[AI Panel] Content script not found for ${aiType}, attempting to inject before sending message...`);
        const injected = await injectContentScript(aiType, tab.id);
        if (!injected) {
          return { success: false, error: `Content script not loaded. Please refresh the ${aiType} tab.` };
        }
      } else {
        throw pingErr;
      }
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_MESSAGE',
      message
    });

    // Notify side panel
    notifySidePanel('SEND_RESULT', {
      aiType,
      success: response?.success,
      error: response?.error
    });

    return response;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function findAITab(aiType) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:237',message:'findAITab entry',data:{aiType,patterns:AI_URL_PATTERNS[aiType]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  const patterns = AI_URL_PATTERNS[aiType];
  if (!patterns) return null;

  const tabs = await chrome.tabs.query({});
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:243',message:'findAITab tabs queried',data:{aiType,totalTabs:tabs.length,tabUrls:tabs.map(t=>t.url).filter(Boolean)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  for (const tab of tabs) {
    if (tab.url && patterns.some(p => tab.url.includes(p))) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:247',message:'findAITab match found',data:{aiType,tabId:tab.id,tabUrl:tab.url,matchedPattern:patterns.find(p=>tab.url.includes(p))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return tab;
    }
  }

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:253',message:'findAITab no match',data:{aiType,patterns},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
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
