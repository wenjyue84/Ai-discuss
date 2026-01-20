// AI Panel - Perplexity Content Script

(function () {
  'use strict';

  // Top-level error handler to catch any initialization errors
  try {
    const AI_TYPE = 'perplexity';

  // Check if extension context is still valid
  function isContextValid() {
    return chrome.runtime && chrome.runtime.id;
  }

  // Safe message sender that checks context first
  function safeSendMessage(message, callback) {
    if (!isContextValid()) {
      console.log('[AI Panel] Extension context invalidated, skipping message');
      return;
    }
    try {
      chrome.runtime.sendMessage(message, callback);
    } catch (e) {
      console.log('[AI Panel] Failed to send message:', e.message);
    }
  }

  // CRITICAL: Set up message listener FIRST before anything else
  // This ensures PING messages can be received even if other initialization fails
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      console.log('[AI Panel] Perplexity PING received, responding with pong');
      console.log('[AI Panel] Perplexity context check:', {
        hasRuntime: !!chrome.runtime,
        runtimeId: chrome.runtime?.id,
        url: window.location.href,
        frameId: window.frameElement ? 'in-iframe' : 'main-frame'
      });
      try {
        sendResponse({ pong: true });
      } catch (e) {
        console.error('[AI Panel] Error sending PING response:', e);
      }
      return true; // Keep channel open for async response
    }

    if (message.type === 'INJECT_MESSAGE') {
      injectMessage(message.message)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
    }

    if (message.type === 'GET_LATEST_RESPONSE') {
      const response = getLatestResponse();
      sendResponse({ content: response });
      return true;
    }
  });

  // Create visible marker to verify script is running
  try {
    const marker = document.createElement('div');
    marker.id = 'ai-panel-perplexity-loaded';
    marker.style.cssText = 'position:fixed;top:50px;right:10px;background:green;color:white;padding:5px;z-index:999999;font-size:12px;border-radius:4px;';
    marker.textContent = '✓ Perplexity Script Loaded';
    document.body.appendChild(marker);
    setTimeout(() => marker.remove(), 5000);
  } catch (e) {
    console.log('[AI Panel] Could not create marker (non-critical):', e);
  }

  // Now initialize the rest of the script
  try {
    console.log('[AI Panel] Perplexity script starting initialization...', {
      url: window.location.href,
      hasRuntime: !!chrome.runtime,
      runtimeId: chrome.runtime?.id,
      isIframe: !!window.frameElement
    });
    
    // Notify background that content script is ready
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/94790163-00e0-42e5-b5ec-318ce51d4c7e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'perplexity.js:50',message:'content script loaded, sending CONTENT_SCRIPT_READY',data:{aiType:AI_TYPE,url:window.location.href,hasRuntime:!!chrome.runtime},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    } catch (e) {
      console.log('[AI Panel] Debug log failed (non-critical):', e);
    }
    
    const readyResult = safeSendMessage({ type: 'CONTENT_SCRIPT_READY', aiType: AI_TYPE });
    console.log('[AI Panel] Perplexity content script loaded and ready, CONTENT_SCRIPT_READY sent');
    console.log('[AI Panel] Message send result:', readyResult);
  } catch (e) {
    console.error('[AI Panel] Error during Perplexity content script initialization:', e);
    console.error('[AI Panel] Error stack:', e.stack);
  }

  // Setup response observer for cross-reference feature
  try {
    setupResponseObserver();
  } catch (e) {
    console.error('[AI Panel] Error setting up response observer:', e);
  }

  async function injectMessage(text) {
    const maxRetries = 10;
    const retryInterval = 500; // 500ms between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await attemptInjectMessage(text);
      } catch (error) {
        const isRetryableError = error.message.includes('Could not find input field') ||
                                 error.message.includes('Could not find send button');
        
        if (!isRetryableError) {
          // Non-retryable error, throw immediately
          throw error;
        }
        
        if (attempt < maxRetries) {
          console.log(`[AI Panel] Perplexity injectMessage attempt ${attempt} failed: ${error.message}, retrying in ${retryInterval}ms...`);
          await sleep(retryInterval);
        } else {
          // Last attempt failed
          console.log(`[AI Panel] Perplexity injectMessage failed after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
      }
    }
  }

  async function attemptInjectMessage(text) {
    // Perplexity uses various input selectors
    const inputSelectors = [
      'textarea[placeholder*="Ask anything"]',
      'textarea[placeholder*="Ask"]',
      'textarea[aria-label*="prompt"]',
      'textarea[aria-label*="Ask"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      inputEl = document.querySelector(selector);
      if (inputEl && isVisible(inputEl)) break;
    }

    if (!inputEl) {
      throw new Error('Could not find input field');
    }

    // Focus the input
    inputEl.focus();

    // Handle different input types
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Contenteditable div
      inputEl.textContent = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Small delay to let the UI process
    await sleep(150);

    // Find and click the send button
    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error('Could not find send button');
    }

    // Wait for button to be enabled
    await waitForButtonEnabled(sendButton);

    sendButton.click();

    // Start capturing response after sending
    console.log('[AI Panel] Perplexity message sent, starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  function findSendButton() {
    // Perplexity's send button
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button[type="submit"]',
      'button svg[viewBox]',
      'button[data-testid*="send"]',
      '.send-button',
      'button:has(svg)'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) {
          return el.closest('button') || el;
        }
      } catch (e) {
        // Invalid selector (e.g., :has() not supported), continue
        continue;
      }
    }

    // Fallback: find button near the input
    const form = document.querySelector('form');
    if (form) {
      const buttons = form.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.querySelector('svg') && isVisible(btn)) {
          return btn;
        }
      }
    }

    return null;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    while (button.disabled && Date.now() - start < maxWait) {
      await sleep(50);
    }
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      // Check context validity in observer callback
      if (!isContextValid()) {
        observer.disconnect();
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              checkForResponse(node);
            }
          }
        }
      }
    });

    const startObserving = () => {
      if (!isContextValid()) return;
      const mainContent = document.querySelector('main') || document.body;
      observer.observe(mainContent, {
        childList: true,
        subtree: true
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      startObserving();
    }
  }

  let lastCapturedContent = '';
  let isCapturing = false;

  function checkForResponse(node) {
    if (isCapturing) return;

    const responseSelectors = [
      '[class*="response"]',
      '[class*="answer"]',
      '[class*="assistant"]',
      '[data-role="assistant"]',
      '[role="article"]',
      '[class*="message-content"]'
    ];

    for (const selector of responseSelectors) {
      if (node.matches?.(selector) || node.querySelector?.(selector)) {
        console.log('[AI Panel] Perplexity detected new response...');
        waitForStreamingComplete();
        break;
      }
    }
  }

  async function waitForStreamingComplete() {
    if (isCapturing) {
      console.log('[AI Panel] Perplexity already capturing, skipping...');
      return;
    }
    isCapturing = true;

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;  // 10 minutes - AI responses can be very long
    const checkInterval = 500;
    const stableThreshold = 4;  // 2 seconds of stable content

    const startTime = Date.now();

    try {
      while (Date.now() - startTime < maxWait) {
        if (!isContextValid()) {
          console.log('[AI Panel] Context invalidated, stopping capture');
          return;
        }

        await sleep(checkInterval);

        const isStreaming = checkIfStreaming();
        const currentContent = getLatestResponse() || '';

        // Content is stable when content unchanged and has content
        const contentStable = currentContent === previousContent && currentContent.length > 0;

        // Only capture if content is stable AND not streaming
        const minContentLength = 50; // Minimum content length to accept as complete
        if (isStreaming) {
          // Reset stable count if still streaming
          stableCount = 0;
        } else if (contentStable) {
          // Don't accept very short responses even if stable - likely still streaming
          if (currentContent.length < minContentLength) {
            // Content is stable but too short - likely still streaming, continue waiting
            stableCount = 0;
          } else {
            stableCount++;
            // Capture after 4 stable checks (2 seconds of stable content)
            if (stableCount >= stableThreshold) {
              if (currentContent !== lastCapturedContent) {
                lastCapturedContent = currentContent;
                console.log('[AI Panel] Perplexity capturing response, length:', currentContent.length);
                safeSendMessage({
                  type: 'RESPONSE_CAPTURED',
                  aiType: AI_TYPE,
                  content: currentContent
                });
                console.log('[AI Panel] Perplexity response captured and sent!');
              } else {
                console.log('[AI Panel] Perplexity content same as last capture, skipping');
              }
              return;
            }
          }
        } else {
          // Content changed, reset stable count
          stableCount = 0;
        }

        previousContent = currentContent;
      }
      console.log('[AI Panel] Perplexity capture timeout after', maxWait / 1000, 'seconds');
    } finally {
      isCapturing = false;
      console.log('[AI Panel] Perplexity capture loop ended');
    }
  }

  function checkIfStreaming() {
    // Check for stop button (indicates streaming is active)
    const stopButton = document.querySelector('button[aria-label*="Stop"], button[aria-label*="stop"]');
    if (stopButton && isVisible(stopButton)) {
      return true;
    }

    // Check for streaming indicators
    const hasStreamingClass = document.querySelector('[class*="streaming"], [class*="generating"], [data-streaming="true"]');
    if (hasStreamingClass) {
      return true;
    }

    return false;
  }

  function getLatestResponse() {
    // Find all response containers and get the last one
    const containerSelectors = [
      '[class*="response"]',
      '[class*="answer"]',
      '[class*="assistant"]',
      '[data-role="assistant"]',
      '[role="article"]',
      '[class*="message-content"]'
    ];

    let containers = [];
    for (const selector of containerSelectors) {
      try {
        containers = document.querySelectorAll(selector);
        if (containers.length > 0) break;
      } catch (e) {
        continue;
      }
    }

    if (containers.length > 0) {
      const lastContainer = containers[containers.length - 1];
      const containerText = lastContainer.innerText || lastContainer.textContent;
      if (containerText && containerText.trim().length > 0) {
        return containerText.trim();
      }
    }

    return null;
  }

  // Utility functions
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

    console.log('[AI Panel] Perplexity content script loaded');
  } catch (topLevelError) {
    // Catch any errors during script initialization
    console.error('[AI Panel] CRITICAL ERROR in Perplexity content script initialization:', topLevelError);
    console.error('[AI Panel] Error stack:', topLevelError.stack);
    
    // Try to notify background of the error
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'CONTENT_SCRIPT_ERROR',
          aiType: 'perplexity',
          error: topLevelError.message,
          stack: topLevelError.stack
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[AI Panel] Could not send error message:', e);
    }
  }
})();
