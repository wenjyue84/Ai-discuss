// AI Panel - Gemini Content Script

(function () {
  'use strict';

  const AI_TYPE = 'gemini';

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

  // Notify background that content script is ready
  safeSendMessage({ type: 'CONTENT_SCRIPT_READY', aiType: AI_TYPE });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return true;
    }

    if (message.type === 'INJECT_MESSAGE') {
      injectMessage(message.message)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'GET_LATEST_RESPONSE') {
      const response = getLatestResponse();
      sendResponse({ content: response });
      return true;
    }

    if (message.type === 'FORCE_CHECK_RESPONSE') {
      // Force check for response and capture if found
      const response = getLatestResponse();
      if (response && response.length > 0 && response !== lastCapturedContent) {
        lastCapturedContent = response;
        safeSendMessage({
          type: 'RESPONSE_CAPTURED',
          aiType: AI_TYPE,
          content: response
        });
        console.log('[AI Panel] Gemini response force-captured, length:', response.length);
      }
      sendResponse({ content: response, captured: response !== null && response !== lastCapturedContent });
      return true;
    }
  });

  // Setup response observer for cross-reference feature
  setupResponseObserver();

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
          console.log(`[AI Panel] Gemini injectMessage attempt ${attempt} failed: ${error.message}, retrying in ${retryInterval}ms...`);
          await sleep(retryInterval);
        } else {
          // Last attempt failed
          console.log(`[AI Panel] Gemini injectMessage failed after ${maxRetries} attempts: ${error.message}`);
          throw error;
        }
      }
    }
  }

  async function attemptInjectMessage(text) {
    // Gemini uses a rich text editor (contenteditable or textarea)
    const inputSelectors = [
      '.ql-editor',
      'div[contenteditable="true"]',
      'rich-textarea textarea',
      'textarea[aria-label*="prompt"]',
      'textarea[placeholder*="Enter"]',
      '.input-area textarea',
      'textarea'
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
      // Contenteditable div (Quill editor or similar)
      inputEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
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

    // Track the last known response element before sending
    const resultBeforeSend = getLatestResponseWithElement();
    lastKnownResponseElement = resultBeforeSend.element;
    messageSendTime = Date.now();

    sendButton.click();

    // Start capturing response after sending
    console.log('[AI Panel] Gemini message sent, starting response capture...');

    // Reset lastCapturedContent when sending new message
    lastCapturedContent = '';

    // Wait a moment for the UI to update
    await sleep(500);

    // Start active polling immediately (doesn't rely on mutation observer)
    waitForStreamingComplete();

    // Also set up a periodic check as backup
    startPeriodicResponseCheck();

    return true;
  }

  // Periodic check as backup to mutation observer
  let periodicCheckInterval = null;
  function startPeriodicResponseCheck() {
    // Clear any existing interval
    if (periodicCheckInterval) {
      clearInterval(periodicCheckInterval);
    }

    let checkCount = 0;
    const maxChecks = 120; // Check for 60 seconds (500ms * 120)

    periodicCheckInterval = setInterval(() => {
      checkCount++;

      // Check if there's a response we haven't captured yet
      const currentResponse = getLatestResponse();
      if (currentResponse && currentResponse.length > 0 && currentResponse !== lastCapturedContent) {
        console.log('[AI Panel] Gemini periodic check found response, triggering capture...');
        waitForStreamingComplete();
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = null;
        return;
      }

      // Stop after max checks
      if (checkCount >= maxChecks) {
        console.log('[AI Panel] Gemini periodic check timeout');
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = null;
      }
    }, 500);
  }

  function findSendButton() {
    // Gemini's send button
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="submit"]',
      'button.send-button',
      'button[data-test-id="send-button"]',
      '.input-area button',
      'button mat-icon[data-mat-icon-name="send"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        return el.closest('button') || el;
      }
    }

    // Fallback: find button with send-related icon or near input
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      // Check for send icon or arrow
      if (btn.querySelector('mat-icon, svg') && isVisible(btn)) {
        const text = btn.textContent.toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('send') || ariaLabel.includes('send') ||
          text.includes('submit') || ariaLabel.includes('submit')) {
          return btn;
        }
      }
    }

    // Last resort: find button at bottom of page
    for (const btn of buttons) {
      const rect = btn.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 150 && isVisible(btn)) {
        if (btn.querySelector('svg, mat-icon')) {
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
        } else if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          // Also watch for text content changes (streaming updates)
          // and attribute changes (like data-is-streaming)
          if (mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE) {
            checkForResponse(mutation.target);
          }
        }
      }
    });

    const startObserving = () => {
      if (!isContextValid()) return;
      const mainContent = document.querySelector('main, .conversation-container, [class*="chat"], [class*="conversation"]') || document.body;
      observer.observe(mainContent, {
        childList: true,
        subtree: true,
        characterData: true,  // Watch for text content changes
        attributes: true,     // Watch for attribute changes (e.g., data-is-streaming)
        attributeFilter: ['data-is-streaming', 'data-status', 'aria-busy']  // Specific attributes that might indicate streaming
      });
      console.log('[AI Panel] Gemini response observer started');
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      startObserving();
    }
  }

  let lastCapturedContent = '';
  let isCapturing = false;  // Prevent multiple captures
  let lastKnownResponseElement = null;  // Track last response element before sending new message
  let messageSendTime = 0;  // Timestamp when message was sent

  function checkForResponse(node) {
    // Skip if already capturing
    if (isCapturing) return;

    // More comprehensive selectors for Gemini responses
    const responseSelectors = [
      '.model-response-text',
      'message-content',
      '[data-message-type="model"]',
      '[class*="model-response"]',
      '[class*="assistant-message"]',
      '[class*="gemini-response"]',
      'div[data-role="assistant"]',
      'div[role="assistant"]',
      '[aria-label*="model"]',
      '[aria-label*="assistant"]'
    ];

    // Check if this node or its children match any response selector
    for (const selector of responseSelectors) {
      try {
        if (node.matches?.(selector) ||
          node.querySelector?.(selector) ||
          node.classList?.contains(selector.replace('.', '').replace('[', '').replace(']', ''))) {
          console.log('[AI Panel] Gemini detected new response element:', selector);
          waitForStreamingComplete();
          return;
        }
      } catch (e) {
        // Invalid selector, skip
        continue;
      }
    }

    // Also check for text content that suggests a response
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent || '';
      // If node has substantial text and is in a likely response container
      if (text.length > 50 && (
        node.closest('main') ||
        node.closest('[class*="conversation"]') ||
        node.closest('[class*="chat"]') ||
        node.closest('[class*="message"]')
      )) {
        // Check if it's not user input
        const isInput = node.closest('textarea') ||
          node.closest('[contenteditable="true"]') ||
          node.closest('input');
        if (!isInput) {
          console.log('[AI Panel] Gemini detected potential response in text content');
          waitForStreamingComplete();
        }
      }
    }
  }

  async function waitForStreamingComplete() {
    // Prevent multiple simultaneous captures
    if (isCapturing) {
      console.log('[AI Panel] Gemini already capturing, skipping...');
      return;
    }
    isCapturing = true;
    console.log('[AI Panel] Gemini starting response capture...');

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;  // 10 minutes - AI responses can be very long
    const checkInterval = 500;
    const stableThreshold = 4;  // 2 seconds of stable content
    let firstContentTime = null;
    let responseElement = null;

    const startTime = Date.now();

    try {
      while (Date.now() - startTime < maxWait) {
        if (!isContextValid()) {
          console.log('[AI Panel] Context invalidated, stopping capture');
          return;
        }

        await sleep(checkInterval);

        const result = getLatestResponseWithElement();
        const currentContent = result.content || '';
        responseElement = result.element || responseElement;

        // Track when content first appears
        if (currentContent.length > 0 && firstContentTime === null) {
          firstContentTime = Date.now();
          console.log('[AI Panel] Gemini first content detected, length:', currentContent.length);

          // Try to scroll response into view when first detected
          if (responseElement) {
            try {
              responseElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              console.log('[AI Panel] Gemini: Scrolled response into view');
            } catch (e) {
              console.log('[AI Panel] Gemini: Failed to scroll response:', e.message);
            }
          }
        }

        // Debug: log every 5 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed % 5000 < checkInterval) {
          console.log(`[AI Panel] Gemini capture check: contentLen=${currentContent.length}, stableCount=${stableCount}, elapsed=${Math.round(elapsed / 1000)}s`);
        }

        // Normalize content for comparison (trim whitespace)
        const normalizedCurrent = currentContent.trim();
        const normalizedPrevious = previousContent.trim();
        const normalizedLast = lastCapturedContent.trim();

        if (normalizedCurrent === normalizedPrevious && normalizedCurrent.length > 0) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            // Check if this is different from last captured (with some tolerance for minor changes)
            const isDifferent = normalizedLast.length === 0 ||
              normalizedCurrent.length < normalizedLast.length * 0.9 || // At least 10% different
              normalizedCurrent.length > normalizedLast.length * 1.1 ||
              normalizedCurrent !== normalizedLast;

            if (isDifferent) {
              lastCapturedContent = currentContent;

              // Ensure response is visible and scrolled into view
              if (responseElement) {
                try {
                  // Make sure element is visible
                  responseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                  // Try to expand any collapsed containers
                  const parent = responseElement.closest('[class*="collapse"], [class*="hidden"], details');
                  if (parent && parent.tagName === 'DETAILS' && !parent.open) {
                    parent.open = true;
                    console.log('[AI Panel] Gemini: Opened collapsed container');
                  }

                  console.log('[AI Panel] Gemini: Response element made visible');
                } catch (e) {
                  console.log('[AI Panel] Gemini: Failed to make response visible:', e.message);
                }
              }

              safeSendMessage({
                type: 'RESPONSE_CAPTURED',
                aiType: AI_TYPE,
                content: currentContent
              });
              console.log('[AI Panel] Gemini response captured, length:', currentContent.length);
            } else {
              console.log('[AI Panel] Gemini content same as last capture, skipping');
            }
            return;
          }
        } else {
          stableCount = 0;
        }

        previousContent = currentContent;
      }
      console.log('[AI Panel] Gemini capture timeout after', maxWait / 1000, 'seconds');
    } finally {
      isCapturing = false;
      console.log('[AI Panel] Gemini capture loop ended');
    }
  }

  function getLatestResponseWithElement() {
    // Try multiple selectors to find Gemini responses
    const selectors = [
      '.model-response-text',
      'message-content',
      '[data-message-type="model"]',
      '[class*="model-response"]',
      '[class*="assistant-message"]',
      '[class*="gemini-response"]',
      'div[data-role="assistant"]',
      'div[role="assistant"]',
      // More generic selectors
      '[class*="response"]',
      '[class*="message"][class*="model"]',
      'div[class*="assistant"]',
      // Look for any div with substantial text that's not an input
      'div:not(textarea):not(input):not([contenteditable="true"])'
    ];

    let messages = [];
    for (const selector of selectors) {
      try {
        messages = document.querySelectorAll(selector);
        if (messages.length > 0) {
          // Get the last message (most recent)
          const lastMessage = messages[messages.length - 1];

          // Skip if it's an input field
          if (lastMessage.closest('textarea') ||
            lastMessage.closest('[contenteditable="true"]') ||
            lastMessage.closest('input')) {
            continue;
          }

          // Check visibility - but be more lenient (allow slightly off-screen)
          const rect = lastMessage.getBoundingClientRect();
          const hasDimensions = rect.width > 0 || rect.height > 0;
          const style = window.getComputedStyle(lastMessage);
          const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';

          if (isHidden && !hasDimensions) {
            console.log(`[AI Panel] Gemini: Element found with ${selector} but hidden, will try to reveal`);
            // Don't skip - we'll try to make it visible
          }

          // Check if this response is newer than the last known response element
          if (lastKnownResponseElement && messageSendTime > 0) {
            // Only accept responses that come AFTER the last known response element
            const position = lastKnownResponseElement.compareDocumentPosition(lastMessage);
            const isAfterLastKnown = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
            const isSameElement = lastKnownResponseElement === lastMessage;

            if (!isAfterLastKnown && !isSameElement) {
              console.log(`[AI Panel] Gemini: Skipping response that came before last known element`);
              continue;
            }

            // If it's the same element, check if content changed
            if (isSameElement) {
              const lastKnownContent = lastKnownResponseElement.innerText?.trim() || '';
              const currentContent = lastMessage.innerText?.trim() || '';
              if (currentContent === lastKnownContent) {
                console.log(`[AI Panel] Gemini: Skipping same response element with unchanged content`);
                continue;
              }
            }
          }

          const content = lastMessage.innerText?.trim() || lastMessage.textContent?.trim();
          if (content && content.length > 20) { // Minimum 20 chars to avoid false positives
            console.log(`[AI Panel] Gemini response found using ${selector}, length:`, content.length);
            return { content, element: lastMessage };
          }
        }
      } catch (e) {
        // Invalid selector, continue
        continue;
      }
    }

    // More aggressive fallback: Look in all main containers
    const mainContainers = document.querySelectorAll('main, [class*="conversation"], [class*="chat"], [class*="message"], article, section');
    const allTextBlocks = [];

    for (const container of mainContainers) {
      // Skip if it's an input container
      if (container.closest('textarea') ||
        container.closest('[contenteditable="true"]') ||
        container.closest('input')) {
        continue;
      }

      // Get all direct text content or from child divs
      const directText = container.innerText?.trim() || container.textContent?.trim();
      if (directText && directText.length > 20) {
        allTextBlocks.push({ text: directText, element: container });
      }

      // Also check child divs
      const childDivs = container.querySelectorAll('div:not(textarea):not(input)');
      for (const div of childDivs) {
        // Skip if it's an input
        if (div.closest('textarea') ||
          div.closest('[contenteditable="true"]') ||
          div.closest('input') ||
          div.querySelector('textarea') ||
          div.querySelector('[contenteditable="true"]')) {
          continue;
        }

        const text = div.innerText?.trim() || div.textContent?.trim();
        if (text && text.length > 20) {
          allTextBlocks.push({ text: text, element: div });
        }
      }
    }

    if (allTextBlocks.length > 0) {
      // Filter to only blocks that come after lastKnownResponseElement
      let candidateBlocks = allTextBlocks;
      
      if (lastKnownResponseElement && messageSendTime > 0) {
        candidateBlocks = allTextBlocks.filter(block => {
          // Skip if it's the same element or contains it
          if (block.element === lastKnownResponseElement || block.element.contains(lastKnownResponseElement)) {
            return false;
          }
          // Check if this block comes after lastKnownResponseElement in DOM
          const position = block.element.compareDocumentPosition(lastKnownResponseElement);
          return (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
        });
        
        // If no blocks after lastKnownResponseElement, use all blocks
        if (candidateBlocks.length === 0) {
          candidateBlocks = allTextBlocks;
        }
      }
      
      // Get the last (most recent) substantial text block
      // Sort by position in DOM (later = more recent)
      candidateBlocks.sort((a, b) => {
        const aPos = a.element.compareDocumentPosition(b.element);
        return aPos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });

      const lastBlock = candidateBlocks[candidateBlocks.length - 1];
      if (lastBlock && lastBlock.text.length > 20) {
        console.log('[AI Panel] Gemini response found (aggressive fallback), length:', lastBlock.text.length);
        return { content: lastBlock.text, element: lastBlock.element };
      }
    }

    // Last resort: check entire document body for substantial text blocks
    // But only if we can't find anything visible - this is less reliable
    // Note: We skip this fallback as it can capture hidden text
    // If we reach here, it means no visible response was found
    console.log('[AI Panel] Gemini: No response found in DOM');
    return { content: null, element: null };
  }

  function getLatestResponse() {
    const result = getLatestResponseWithElement();
    return result.content;
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);

    // Check basic visibility properties
    if (style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0') {
      return false;
    }

    // Check if element has dimensions (not collapsed)
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    // Check if element is in viewport (at least partially visible)
    // Allow some tolerance for elements just outside viewport
    const tolerance = 100; // pixels
    const isInViewport = rect.top < window.innerHeight + tolerance &&
      rect.bottom > -tolerance &&
      rect.left < window.innerWidth + tolerance &&
      rect.right > -tolerance;

    if (!isInViewport) {
      return false;
    }

    return true;
  }

  console.log('[AI Panel] Gemini content script loaded');
})();
