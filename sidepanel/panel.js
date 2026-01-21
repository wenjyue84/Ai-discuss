// AI Panel - Side Panel Controller

const AI_TYPES = ['claude', 'chatgpt', 'gemini'];

// Cross-reference action keywords (inserted into message)
const CROSS_REF_ACTIONS = {
  evaluate: { prompt: 'evaluate' },
  learn: { prompt: 'what is worth learning from' },
  critique: { prompt: 'critique and point out issues' },
  supplement: { prompt: 'what needs to be supplemented' },
  compare: { prompt: 'compare with your perspective' }
};

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logContainer = document.getElementById('log-container');

// Track connected tabs
const connectedTabs = {
  claude: null,
  chatgpt: null,
  gemini: null
};

// Discussion Mode State
let discussionState = {
  active: false,
  topic: '',
  participants: [],  // [ai1, ai2] or [ai1, ai2, ai3]
  currentRound: 0,
  history: [],  // [{round, ai, type: 'initial'|'evaluation'|'response', content, evaluationTarget?}]
  pendingResponses: new Set(),  // AIs we're waiting for
  roundType: null,  // 'initial', 'cross-eval', 'counter'
  pendingEvaluations: null  // Map<aiType, {evaluated: Set<aiType>, remaining: Array<aiType>}> for 3-participant sequential evaluations
};


// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkConnectedTabs();
  setupEventListeners();
  setupDiscussionMode();
  loadVersion();
});

// Load and display version number
async function loadVersion() {
  try {
    const manifest = chrome.runtime.getManifest();
    const versionElement = document.getElementById('version-number');
    if (versionElement && manifest.version) {
      versionElement.textContent = manifest.version;
    }
    
    // Set first release date (today's date)
    const releaseDateElement = document.getElementById('release-date');
    if (releaseDateElement) {
      const today = new Date();
      const dateString = today.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      releaseDateElement.textContent = dateString;
    }
  } catch (error) {
    console.error('Failed to load version:', error);
  }
}

function setupEventListeners() {
  sendBtn.addEventListener('click', handleSend);

  // Enter to send, Shift+Enter for new line (like ChatGPT)
  // But ignore Enter during IME composition (e.g., Chinese input)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
    }
  });

  // Shortcut buttons (/cross, <-)
  document.querySelectorAll('.shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const insertText = btn.dataset.insert;
      const cursorPos = messageInput.selectionStart;
      const textBefore = messageInput.value.substring(0, cursorPos);
      const textAfter = messageInput.value.substring(cursorPos);

      messageInput.value = textBefore + insertText + textAfter;
      messageInput.focus();
      messageInput.selectionStart = messageInput.selectionEnd = cursorPos + insertText.length;
    });
  });

  // Action select - insert action prompt into textarea
  document.getElementById('action-select').addEventListener('change', (e) => {
    const action = e.target.value;
    if (!action) return;

    const actionConfig = CROSS_REF_ACTIONS[action];
    if (actionConfig) {
      const cursorPos = messageInput.selectionStart;
      const textBefore = messageInput.value.substring(0, cursorPos);
      const textAfter = messageInput.value.substring(cursorPos);

      // Add space before if needed
      const needsSpace = textBefore.length > 0 && !textBefore.endsWith(' ') && !textBefore.endsWith('\n');
      const insertText = (needsSpace ? ' ' : '') + actionConfig.prompt + ' ';

      messageInput.value = textBefore + insertText + textAfter;
      messageInput.focus();
      messageInput.selectionStart = messageInput.selectionEnd = cursorPos + insertText.length;
    }

    // Reset select to placeholder
    e.target.value = '';
  });

  // Mention buttons - insert @AI into textarea
  document.querySelectorAll('.mention-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mention = btn.dataset.mention;
      const cursorPos = messageInput.selectionStart;
      const textBefore = messageInput.value.substring(0, cursorPos);
      const textAfter = messageInput.value.substring(cursorPos);

      // Add space before if needed
      const needsSpace = textBefore.length > 0 && !textBefore.endsWith(' ') && !textBefore.endsWith('\n');
      const insertText = (needsSpace ? ' ' : '') + mention + ' ';

      messageInput.value = textBefore + insertText + textAfter;
      messageInput.focus();
      messageInput.selectionStart = messageInput.selectionEnd = cursorPos + insertText.length;
    });
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TAB_STATUS_UPDATE') {
      updateTabStatus(message.aiType, message.connected);
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: Response captured`, 'success');
      // Handle discussion mode response (async, don't await)
      if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
        handleDiscussionResponse(message.aiType, message.content).catch(err => {
          console.error('Error handling discussion response:', err);
        });
      }
    } else if (message.type === 'SEND_RESULT') {
      if (message.success) {
        log(`${message.aiType}: Message sent`, 'success');
      } else {
        log(`${message.aiType}: Failed - ${message.error}`, 'error');
      }
    }
  });
}

async function checkConnectedTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      const aiType = getAITypeFromUrl(tab.url);
      if (aiType) {
        connectedTabs[aiType] = tab.id;
        updateTabStatus(aiType, true);
      }
    }
  } catch (err) {
    log('Error checking tabs: ' + err.message, 'error');
  }
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  return null;
}

function updateTabStatus(aiType, connected) {
  const statusEl = document.getElementById(`settings-status-${aiType}`);
  if (statusEl) {
    statusEl.textContent = connected ? 'Connected' : 'Not found';
    statusEl.className = 'status ' + (connected ? 'connected' : 'disconnected');
  }
  if (connected) {
    connectedTabs[aiType] = true;
  }
}

async function handleSend() {
  const message = messageInput.value.trim();
  if (!message) return;

  // Parse message for @ mentions
  const parsed = parseMessage(message);

  // Determine targets
  let targets;
  if (parsed.mentions.length > 0) {
    // If @ mentioned specific AIs, only send to those
    targets = parsed.mentions;
  } else {
    // Otherwise use checkbox selection from Settings
    targets = AI_TYPES.filter(ai => {
      const checkbox = document.getElementById(`settings-target-${ai}`);
      return checkbox && checkbox.checked;
    });
  }

  if (targets.length === 0) {
    log('No targets selected', 'error');
    return;
  }

  sendBtn.disabled = true;

  // Clear input immediately after sending
  messageInput.value = '';

  try {
    // If mutual review, handle specially
    if (parsed.mutual) {
      if (targets.length < 2) {
        log('Mutual review requires at least 2 AIs selected', 'error');
      } else {
        log(`Mutual review: ${targets.join(', ')}`);
        await handleMutualReview(targets, parsed.prompt);
      }
    }
    // If cross-reference, handle specially
    else if (parsed.crossRef) {
      log(`Cross-reference: ${parsed.targetAIs.join(', ')} <- ${parsed.sourceAIs.join(', ')}`);
      await handleCrossReference(parsed);
    } else {
      // Send to target(s)
      log(`Sending to: ${targets.join(', ')}`);
      for (const target of targets) {
        await sendToAI(target, message);
      }
    }
  } catch (err) {
    log('Error: ' + err.message, 'error');
  }

  sendBtn.disabled = false;
  messageInput.focus();
}

function parseMessage(message) {
  // Check for /mutual command: /mutual [optional prompt]
  // Triggers mutual review based on current responses (no new topic needed)
  const trimmedMessage = message.trim();
  if (trimmedMessage.toLowerCase() === '/mutual' || trimmedMessage.toLowerCase().startsWith('/mutual ')) {
    // Extract everything after "/mutual " as the prompt
    const prompt = trimmedMessage.length > 7 ? trimmedMessage.substring(7).trim() : '';
    return {
      mutual: true,
      prompt: prompt || 'Please evaluate the above perspectives. What do you agree with? What do you disagree with? What would you add?',
      crossRef: false,
      mentions: [],
      originalMessage: message
    };
  }

  // Check for /cross command first: /cross @targets <- @sources message
  // Use this for complex cases (3 AIs, or when you want to be explicit)
  if (message.trim().toLowerCase().startsWith('/cross ')) {
    const arrowIndex = message.indexOf('<-');
    if (arrowIndex === -1) {
      // No arrow found, treat as regular message
      return { crossRef: false, mentions: [], originalMessage: message };
    }

    const beforeArrow = message.substring(7, arrowIndex).trim(); // Skip "/cross "
    const afterArrow = message.substring(arrowIndex + 2).trim();  // Skip "<-"

    // Extract targets (before arrow)
    const mentionPattern = /@(claude|chatgpt|gemini)/gi;
    const targetMatches = [...beforeArrow.matchAll(mentionPattern)];
    const targetAIs = [...new Set(targetMatches.map(m => m[1].toLowerCase()))];

    // Extract sources and message (after arrow)
    // Find all @mentions in afterArrow, sources are all @mentions
    // Message is everything after the last @mention
    const sourceMatches = [...afterArrow.matchAll(mentionPattern)];
    const sourceAIs = [...new Set(sourceMatches.map(m => m[1].toLowerCase()))];

    // Find where the actual message starts (after the last @mention)
    let actualMessage = afterArrow;
    if (sourceMatches.length > 0) {
      const lastMatch = sourceMatches[sourceMatches.length - 1];
      const lastMentionEnd = lastMatch.index + lastMatch[0].length;
      actualMessage = afterArrow.substring(lastMentionEnd).trim();
    }

    if (targetAIs.length > 0 && sourceAIs.length > 0) {
      return {
        crossRef: true,
        mentions: [...targetAIs, ...sourceAIs],
        targetAIs,
        sourceAIs,
        originalMessage: actualMessage
      };
    }
  }

  // Pattern-based detection for @ mentions
  const mentionPattern = /@(claude|chatgpt|gemini)/gi;
  const matches = [...message.matchAll(mentionPattern)];
  const mentions = [...new Set(matches.map(m => m[1].toLowerCase()))];

  // For exactly 2 AIs: use keyword detection (simpler syntax)
  // Last mentioned = source (being evaluated), first = target (doing evaluation)
  if (mentions.length === 2) {
    const evalKeywords = /evaluate|think of|opinion|review|agree|analysis|compare|learn from|what do you think|how|perspective|viewpoint|critique|supplement|criticize|analyze|consider|believe/i;

    if (evalKeywords.test(message)) {
      const sourceAI = matches[matches.length - 1][1].toLowerCase();
      const targetAI = matches[0][1].toLowerCase();

      return {
        crossRef: true,
        mentions,
        targetAIs: [targetAI],
        sourceAIs: [sourceAI],
        originalMessage: message
      };
    }
  }

  // For 3+ AIs without /cross command: just send to all (no cross-reference)
  // User should use /cross command for complex 3-AI scenarios
  return {
    crossRef: false,
    mentions,
    originalMessage: message
  };
}

async function handleCrossReference(parsed) {
  // Get responses from all source AIs
  const sourceResponses = [];

  for (const sourceAI of parsed.sourceAIs) {
    const response = await getLatestResponse(sourceAI);
    if (!response) {
      log(`Could not get ${sourceAI}'s response`, 'error');
      return;
    }
    sourceResponses.push({ ai: sourceAI, content: response });
  }

  // Build the full message with XML tags for each source
  let fullMessage = parsed.originalMessage + '\n';

  for (const source of sourceResponses) {
    fullMessage += `
<${source.ai}_response>
${source.content}
</${source.ai}_response>`;
  }

  // Send to all target AIs
  for (const targetAI of parsed.targetAIs) {
    await sendToAI(targetAI, fullMessage);
  }
}

// ============================================
// Mutual Review Functions
// ============================================

async function handleMutualReview(participants, prompt) {
  // Get current responses from all participants
  const responses = {};

  log(`[Mutual] Fetching responses from ${participants.join(', ')}...`);

  for (const ai of participants) {
    const response = await getLatestResponse(ai);
    if (!response || response.trim().length === 0) {
      log(`[Mutual] Could not get ${ai}'s response - make sure ${ai} has replied first`, 'error');
      return;
    }
    responses[ai] = response;
    log(`[Mutual] Got ${ai}'s response (${response.length} chars)`);
  }

  log(`[Mutual] All responses collected. Sending cross-evaluations...`);

  // For each AI, send them the responses from all OTHER AIs
  for (const targetAI of participants) {
    const otherAIs = participants.filter(ai => ai !== targetAI);

    // Build message with all other AIs' responses
    let evalMessage = `Here are the perspectives from other AIs:\n`;

    for (const sourceAI of otherAIs) {
      evalMessage += `
<${sourceAI}_response>
${responses[sourceAI]}
</${sourceAI}_response>
`;
    }

    evalMessage += `\n${prompt}`;

    log(`[Mutual] Sending to ${targetAI}: ${otherAIs.join('+')} responses + prompt`);
    await sendToAI(targetAI, evalMessage);
  }

  log(`[Mutual] Complete! All ${participants.length} AIs received cross-evaluations`, 'success');
}

async function getLatestResponse(aiType) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_RESPONSE', aiType },
      (response) => {
        resolve(response?.content || null);
      }
    );
  });
}

async function pingAI(aiType) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'PING_CONTENT_SCRIPT', aiType },
      (response) => {
        resolve(response || { alive: false, error: 'No response' });
      }
    );
  });
}

async function sendToAI(aiType, message) {
  // Pre-check: verify content script is loaded
  const pingResult = await pingAI(aiType);
  if (!pingResult.alive) {
    const errorMsg = pingResult.error || `${aiType} content script not responding`;
    log(`${aiType}: ${errorMsg}`, 'error');
    return { success: false, error: errorMsg };
  }

  return new Promise((resolve) => {
      chrome.runtime.sendMessage(
      { type: 'SEND_MESSAGE', aiType, message },
      (response) => {
        if (response?.success) {
          log(`Sent to ${aiType}`, 'success');
        } else {
          log(`Failed to send to ${aiType}: ${response?.error || 'Unknown error'}`, 'error');
        }
        resolve(response);
      }
    );
  });
}

function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type !== 'info' ? ` ${type}` : '');

  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  entry.innerHTML = `<span class="time">${time}</span>${message}`;
  logContainer.insertBefore(entry, logContainer.firstChild);

  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// ============================================
// Discussion Mode Functions
// ============================================

function setupDiscussionMode() {
  // Mode switcher buttons
  document.getElementById('mode-settings').addEventListener('click', () => switchMode('settings'));
  document.getElementById('mode-normal').addEventListener('click', () => switchMode('normal'));
  document.getElementById('mode-discussion').addEventListener('click', () => switchMode('discussion'));

  // Create new chat button
  document.getElementById('create-chat-btn').addEventListener('click', createNewChatsForAll);

  // Discussion controls
  document.getElementById('start-discussion-btn').addEventListener('click', startDiscussion);
  document.getElementById('next-round-btn').addEventListener('click', nextRound);
  document.getElementById('end-discussion-btn').addEventListener('click', endDiscussion);
  document.getElementById('generate-summary-btn').addEventListener('click', generateSummary);
  document.getElementById('new-discussion-btn').addEventListener('click', resetDiscussion);
  document.getElementById('interject-btn').addEventListener('click', handleInterject);
  document.getElementById('show-discussion-btn').addEventListener('click', openDiscussionView);

  // Participant selection validation
  document.querySelectorAll('input[name="participant"]').forEach(checkbox => {
    checkbox.addEventListener('change', validateParticipants);
  });

  // Handle default topic text area behavior
  const topicTextarea = document.getElementById('discussion-topic');
  const defaultTopic = 'Latest important news from the past 1 week related to new features of advanced AI tools included but not limited to Gemini, Claude, Chatgpt, Grok, Cursor, Antigravity, NotebookLm, Notion AI, Perplexity, Cursor, Copilot, Deepseek, Qwen, Midjourney, Stable Diffusion, Manus, Llama, Devin, Comet and Replit.';
  
  // On focus, if text is still default, select all for easy replacement
  topicTextarea.addEventListener('focus', () => {
    if (topicTextarea.value.trim() === defaultTopic) {
      topicTextarea.select();
    }
  });

  // On blur, if text is empty, restore default (less intrusive than on input)
  topicTextarea.addEventListener('blur', () => {
    if (topicTextarea.value.trim() === '') {
      topicTextarea.value = defaultTopic;
    }
  });
}

function switchMode(mode) {
  const settingsMode = document.getElementById('settings-mode');
  const normalMode = document.getElementById('normal-mode');
  const discussionMode = document.getElementById('discussion-mode');
  const settingsBtn = document.getElementById('mode-settings');
  const normalBtn = document.getElementById('mode-normal');
  const discussionBtn = document.getElementById('mode-discussion');
  const logSection = document.querySelector('.log');

  // Hide all modes first
  settingsMode.classList.add('hidden');
  normalMode.classList.add('hidden');
  discussionMode.classList.add('hidden');
  settingsBtn.classList.remove('active');
  normalBtn.classList.remove('active');
  discussionBtn.classList.remove('active');

  // Show selected mode
  if (mode === 'settings') {
    settingsMode.classList.remove('hidden');
    settingsBtn.classList.add('active');
    logSection.classList.add('hidden');
  } else if (mode === 'normal') {
    normalMode.classList.remove('hidden');
    normalBtn.classList.add('active');
    logSection.classList.remove('hidden');
  } else {
    discussionMode.classList.remove('hidden');
    discussionBtn.classList.add('active');
    logSection.classList.remove('hidden');
  }
}

function validateParticipants() {
  const selected = document.querySelectorAll('input[name="participant"]:checked');
  const startBtn = document.getElementById('start-discussion-btn');
  // Allow 2-3 participants
  startBtn.disabled = selected.length < 2 || selected.length > 3;
}

async function startDiscussion() {
  const topicTextarea = document.getElementById('discussion-topic');
  let topic = topicTextarea.value.trim();
  
  // If topic is empty, use default
  if (!topic) {
    topic = 'Latest important news from the past 1 week related to new features of advanced AI tools included but not limited to Gemini, Claude, Chatgpt, Grok, Cursor, Antigravity, NotebookLm, Notion AI, Perplexity, Cursor, Copilot, Deepseek, Qwen, Midjourney, Stable Diffusion, Manus, Llama, Devin, Comet and Replit.';
    topicTextarea.value = topic;
  }

  const selected = Array.from(document.querySelectorAll('input[name="participant"]:checked'))
    .map(cb => cb.value);

  if (selected.length < 2 || selected.length > 3) {
    log('Please select 2-3 participants', 'error');
    return;
  }

  // Initialize discussion state
  discussionState = {
    active: true,
    topic: topic,
    participants: selected,
    currentRound: 1,
    history: [],
    pendingResponses: new Set(selected),
    roundType: 'initial',
    pendingEvaluations: null
  };

  // Update UI
  document.getElementById('discussion-setup').classList.add('hidden');
  document.getElementById('discussion-active').classList.remove('hidden');
  document.getElementById('round-badge').textContent = 'Round 1';
  const participantsText = selected.length === 2
    ? `${capitalize(selected[0])} vs ${capitalize(selected[1])}`
    : selected.map(capitalize).join(', ');
  document.getElementById('participants-badge').textContent = participantsText;
  document.getElementById('topic-display').textContent = topic;
  updateDiscussionStatus('waiting', `Waiting for initial responses from ${selected.map(capitalize).join(', ')}...`);

  // Disable buttons during round
  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;
  document.getElementById('show-discussion-btn').disabled = true;

  log(`Discussion started: ${selected.map(capitalize).join(', ')}`, 'success');

  // Send topic to all selected AIs
  for (const ai of selected) {
    await sendToAI(ai, `Please share your thoughts on the following topic:\n\n${topic}`);
  }

  // Start periodic check for responses (backup in case mutation observer fails)
  startResponsePolling();
}

let responsePollingInterval = null;

function startResponsePolling() {
  // Clear any existing interval
  if (responsePollingInterval) {
    clearInterval(responsePollingInterval);
  }

  responsePollingInterval = setInterval(async () => {
    if (!discussionState.active || discussionState.pendingResponses.size === 0) {
      clearInterval(responsePollingInterval);
      responsePollingInterval = null;
      return;
    }

    // Check each pending AI for responses
    const minContentLength = 50; // Minimum content length to accept as response
    for (const aiType of discussionState.pendingResponses) {
      try {
        const response = await getLatestResponse(aiType);
        if (response && response.trim().length > 0) {
          // Don't process very short responses - likely still streaming
          if (response.trim().length < minContentLength) {
            continue; // Skip very short responses, continue polling
          }
          
          // Check if this is a new response (not already in history)
          const alreadyRecorded = discussionState.history.some(
            h => h.ai === aiType && 
                 h.round === discussionState.currentRound && 
                 h.content === response
          );
          
          if (!alreadyRecorded) {
            log(`[Poll] Found ${aiType} response via polling`, 'success');
            // Use handleDiscussionResponse which will verify completion
            handleDiscussionResponse(aiType, response);
          }
        }
      } catch (err) {
        // Ignore errors, continue checking
      }
    }
  }, 2000); // Check every 2 seconds
}

async function verifyResponseComplete(aiType, initialContent) {
  // Verify that the response is actually complete (not still streaming)
  // Check multiple times to ensure content is stable
  const checkInterval = 500;
  const stableThreshold = 4; // 2 seconds of stable content (4 checks * 500ms)
  const maxWait = 30000; // 30 seconds max wait (increased for long responses)
  const minContentLength = 50; // Minimum content length to accept as complete (reject suspiciously short responses)
  let previousContent = initialContent;
  let stableCount = 0;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await sleep(checkInterval);
    
    try {
      const currentContent = await getLatestResponse(aiType);
      
      if (!currentContent || currentContent.trim().length === 0) {
        // No content yet, continue waiting
        continue;
      }

      if (previousContent !== null) {
        if (currentContent.length > previousContent.length) {
          // Content is still growing - reset stable count
          stableCount = 0;
          previousContent = currentContent;
          continue;
        } else if (currentContent === previousContent) {
          // Content is stable
          stableCount++;
          if (stableCount >= stableThreshold) {
            // Only accept as complete if content meets minimum length requirement
            // This prevents accepting very short responses that might be captured during streaming pauses
            if (currentContent.length >= minContentLength) {
              return currentContent; // Response is complete
            } else {
              // Content is stable but too short - likely still streaming, continue waiting
              stableCount = 0; // Reset to continue waiting
              continue;
            }
          }
        } else {
          // Content changed but not growing (might be a different response)
          stableCount = 0;
          previousContent = currentContent;
        }
      } else {
        // First check
        previousContent = currentContent;
      }
    } catch (err) {
      // Ignore errors, continue checking
    }
  }

  // Timeout - return the last known content only if it meets minimum length
  const finalContent = previousContent || initialContent;
  return finalContent;
}

async function handleDiscussionResponse(aiType, content) {
  if (!discussionState.active) return;

  // Verify response is complete before marking as done
  const verifiedContent = await verifyResponseComplete(aiType, content);

  // Double-check: verify content hasn't grown since verification
  await sleep(1000); // Wait 1 second after verification
  const postVerifyContent = await getLatestResponse(aiType);
  let finalContent = verifiedContent;
  if (postVerifyContent && postVerifyContent.length > verifiedContent.length) {
    // Content is still growing - re-verify
    finalContent = await verifyResponseComplete(aiType, postVerifyContent);
  }

  // Determine evaluation target for sequential evaluations
  let evaluationTarget = null;
  if (discussionState.pendingEvaluations) {
    const evalState = discussionState.pendingEvaluations.get(aiType);
    if (evalState && evalState.remaining.length > 0) {
      // The target is the first remaining (the one we just evaluated)
      evaluationTarget = evalState.remaining[0];
    }
  }

  // Record this response in history
  const historyEntry = {
    round: discussionState.currentRound,
    ai: aiType,
    type: discussionState.roundType,
    content: finalContent
  };
  if (evaluationTarget) {
    historyEntry.evaluationTarget = evaluationTarget;
  }
  discussionState.history.push(historyEntry);

  // Handle sequential evaluations for 3 participants
  if (discussionState.pendingEvaluations) {
    const evalState = discussionState.pendingEvaluations.get(aiType);
    if (evalState) {
      // Mark current evaluation as complete
      if (evalState.remaining.length > 0) {
        const completedTarget = evalState.remaining[0];
        evalState.evaluated.add(completedTarget);
        evalState.remaining.shift(); // Remove first element
      }

      // Check if there are more evaluations remaining for this participant
      if (evalState.remaining.length > 0) {
        // Send next evaluation prompt
        const nextTarget = evalState.remaining[0];
        
        // Get previous round response for the next target
        const prevRound = discussionState.currentRound - 1;
        const targetResponse = discussionState.history.find(
          h => h.round === prevRound && h.ai === nextTarget
        )?.content;

        if (targetResponse) {
          const msg = `Here is ${capitalize(nextTarget)}'s response to the topic "${discussionState.topic}":

<${nextTarget}_response>
${targetResponse}
</${nextTarget}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

          log(`Discussion: ${capitalize(aiType)} evaluating ${capitalize(nextTarget)} (${evalState.evaluated.size + 1}/2)`, 'info');
          await sendToAI(aiType, msg);
          
          // Update status message
          const statusParts = [];
          for (const [participant, state] of discussionState.pendingEvaluations.entries()) {
            if (state.remaining.length > 0) {
              const target = state.remaining[0];
              const progress = state.evaluated.size + 1;
              statusParts.push(`${capitalize(participant)} evaluating ${capitalize(target)} (${progress}/2)`);
            } else if (discussionState.pendingResponses.has(participant)) {
              statusParts.push(`${capitalize(participant)} completing...`);
            }
          }
          if (statusParts.length > 0) {
            updateDiscussionStatus('waiting', `Sequential evaluation: ${statusParts.join(', ')}...`);
          }
          
          // Don't remove from pendingResponses yet - still waiting for next response
          return;
        } else {
          log(`Could not find previous round response for ${nextTarget}`, 'error');
        }
      } else {
        // All evaluations complete for this participant
        log(`Discussion: ${capitalize(aiType)} completed all evaluations (Round ${discussionState.currentRound})`, 'success');
        discussionState.pendingResponses.delete(aiType);
      }
    }
  } else {
    // Not a sequential evaluation round - remove from pending as before
    discussionState.pendingResponses.delete(aiType);
  }

  log(`Discussion: ${aiType} replied (Round ${discussionState.currentRound})`, 'success');

  // Check if all pending responses received
  if (discussionState.pendingResponses.size === 0) {
    onRoundComplete();
  } else {
    const remaining = Array.from(discussionState.pendingResponses).map(capitalize).join(', ');
    if (discussionState.pendingEvaluations) {
      // Update status for sequential evaluation
      const statusParts = [];
      for (const [participant, state] of discussionState.pendingEvaluations.entries()) {
        if (discussionState.pendingResponses.has(participant)) {
          if (state.remaining.length > 0) {
            const target = state.remaining[0];
            const progress = state.evaluated.size + 1;
            statusParts.push(`${capitalize(participant)} evaluating ${capitalize(target)} (${progress}/2)`);
          } else {
            statusParts.push(`${capitalize(participant)} completing...`);
          }
        }
      }
      if (statusParts.length > 0) {
        updateDiscussionStatus('waiting', `Sequential evaluation: ${statusParts.join(', ')}...`);
      } else {
        updateDiscussionStatus('waiting', `Waiting for ${remaining}...`);
      }
    } else {
      updateDiscussionStatus('waiting', `Waiting for ${remaining}...`);
    }
  }
}

function onRoundComplete() {
  log(`Round ${discussionState.currentRound} completed`, 'success');
  updateDiscussionStatus('ready', `Round ${discussionState.currentRound} completed, ready for next round`);

  // Clear pendingEvaluations when round completes
  discussionState.pendingEvaluations = null;

  // Enable next round button
  document.getElementById('next-round-btn').disabled = false;
  document.getElementById('generate-summary-btn').disabled = false;
  document.getElementById('show-discussion-btn').disabled = false;
}

async function nextRound() {
  discussionState.currentRound++;
  const participants = discussionState.participants;

  // Update UI
  document.getElementById('round-badge').textContent = `Round ${discussionState.currentRound}`;
  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;
  // Keep show-discussion-btn enabled (can view discussion at any point after first round)

  // Get previous round responses
  const prevRound = discussionState.currentRound - 1;
  const prevRoundResponses = {};
  for (const ai of participants) {
    const response = discussionState.history.find(
      h => h.round === prevRound && h.ai === ai
    )?.content;
    if (!response) {
      log('Missing responses from previous round', 'error');
      return;
    }
    prevRoundResponses[ai] = response;
  }

  // Handle 2 participants (backward compatible)
  if (participants.length === 2) {
    const [ai1, ai2] = participants;

    // Set pending responses
    discussionState.pendingResponses = new Set([ai1, ai2]);
    discussionState.roundType = 'cross-eval';
    discussionState.pendingEvaluations = null;

    updateDiscussionStatus('waiting', `Cross-evaluation: ${capitalize(ai1)} evaluating ${capitalize(ai2)}, ${capitalize(ai2)} evaluating ${capitalize(ai1)}...`);

    log(`Round ${discussionState.currentRound}: Cross-evaluation started`);

    // Send cross-evaluation requests
    // AI1 evaluates AI2's response
    const msg1 = `Here is ${capitalize(ai2)}'s response to the topic "${discussionState.topic}":

<${ai2}_response>
${prevRoundResponses[ai2]}
</${ai2}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

    // AI2 evaluates AI1's response
    const msg2 = `Here is ${capitalize(ai1)}'s response to the topic "${discussionState.topic}":

<${ai1}_response>
${prevRoundResponses[ai1]}
</${ai1}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

    await sendToAI(ai1, msg1);
    await sendToAI(ai2, msg2);

    // Restart response polling for this round
    startResponsePolling();
    return;
  }

  // Handle 3 participants (sequential evaluation)
  if (participants.length === 3) {
    const [ai1, ai2, ai3] = participants;

    // Initialize pendingEvaluations map
    discussionState.pendingEvaluations = new Map();
    for (const ai of participants) {
      const otherParticipants = participants.filter(p => p !== ai);
      discussionState.pendingEvaluations.set(ai, {
        evaluated: new Set(),
        remaining: otherParticipants
      });
    }

    // Set pending responses (all 3 participants)
    discussionState.pendingResponses = new Set(participants);
    discussionState.roundType = 'cross-eval';

    // Send first evaluation prompt to each participant
    for (const evaluator of participants) {
      const evalState = discussionState.pendingEvaluations.get(evaluator);
      if (evalState && evalState.remaining.length > 0) {
        const firstTarget = evalState.remaining[0];
        const targetResponse = prevRoundResponses[firstTarget];

        const msg = `Here is ${capitalize(firstTarget)}'s response to the topic "${discussionState.topic}":

<${firstTarget}_response>
${targetResponse}
</${firstTarget}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

        await sendToAI(evaluator, msg);
      }
    }

    // Update status message
    const statusParts = participants.map(ai => {
      const evalState = discussionState.pendingEvaluations.get(ai);
      const target = evalState?.remaining[0];
      return `${capitalize(ai)} evaluating ${capitalize(target)}`;
    });
    updateDiscussionStatus('waiting', `Sequential evaluation: ${statusParts.join(', ')}...`);

    log(`Round ${discussionState.currentRound}: Sequential evaluation started (3 participants)`);

    // Restart response polling for this round
    startResponsePolling();
    return;
  }

  // Should not reach here, but handle gracefully
  log('Unsupported number of participants', 'error');
}

async function handleInterject() {
  const input = document.getElementById('interject-input');
  const message = input.value.trim();

  if (!message) {
    log('Please enter a message to send', 'error');
    return;
  }

  if (!discussionState.active || discussionState.participants.length === 0) {
    log('No active discussion', 'error');
    return;
  }

  const btn = document.getElementById('interject-btn');
  btn.disabled = true;

  const [ai1, ai2] = discussionState.participants;

  log(`[Interject] Fetching latest responses from both participants...`);

  // Get latest responses from both participants
  const ai1Response = await getLatestResponse(ai1);
  const ai2Response = await getLatestResponse(ai2);

  if (!ai1Response || !ai2Response) {
    log(`[Interject] Could not get responses, please ensure both participants have replied`, 'error');
    btn.disabled = false;
    return;
  }

  log(`[Interject] Got responses from both, sending...`);

  // Send to AI1: user message + AI2's response
  const msg1 = `${message}

Here is ${capitalize(ai2)}'s latest response:

<${ai2}_response>
${ai2Response}
</${ai2}_response>`;

  // Send to AI2: user message + AI1's response
  const msg2 = `${message}

Here is ${capitalize(ai1)}'s latest response:

<${ai1}_response>
${ai1Response}
</${ai1}_response>`;

  await sendToAI(ai1, msg1);
  await sendToAI(ai2, msg2);

  log(`[Interject] Sent to both participants (including each other's responses)`, 'success');

  // Clear input
  input.value = '';
  btn.disabled = false;
}

async function generateSummary() {
  document.getElementById('generate-summary-btn').disabled = true;
  updateDiscussionStatus('waiting', 'Requesting summaries from both participants...');

  const [ai1, ai2] = discussionState.participants;

  // Build conversation history for summary
  let historyText = `Topic: ${discussionState.topic}\n\n`;

  for (let round = 1; round <= discussionState.currentRound; round++) {
    historyText += `=== Round ${round} ===\n\n`;
    const roundEntries = discussionState.history.filter(h => h.round === round);
    for (const entry of roundEntries) {
      historyText += `[${capitalize(entry.ai)}]:\n${entry.content}\n\n`;
    }
  }

  const summaryPrompt = `Please summarize the following discussion between AIs. Please include:
1. Main points of consensus
2. Main points of disagreement
3. Core perspectives from each side
4. Overall conclusion

Discussion history:
${historyText}`;

  // Send to both AIs
  discussionState.roundType = 'summary';
  discussionState.pendingResponses = new Set([ai1, ai2]);

  log(`[Summary] Requesting summaries from both participants...`);
  await sendToAI(ai1, summaryPrompt);
  await sendToAI(ai2, summaryPrompt);

  // Wait for both responses, then show summary
  const checkForSummary = setInterval(async () => {
    if (discussionState.pendingResponses.size === 0) {
      clearInterval(checkForSummary);

      // Get both summaries
      const summaries = discussionState.history.filter(h => h.type === 'summary');
      const ai1Summary = summaries.find(s => s.ai === ai1)?.content || '';
      const ai2Summary = summaries.find(s => s.ai === ai2)?.content || '';

      log(`[Summary] Summaries from both participants generated`, 'success');
      showSummary(ai1Summary, ai2Summary);
    }
  }, 500);
}

function showSummary(ai1Summary, ai2Summary) {
  document.getElementById('discussion-active').classList.add('hidden');
  document.getElementById('discussion-summary').classList.remove('hidden');

  const [ai1, ai2] = discussionState.participants;

  // Handle empty summaries
  if (!ai1Summary && !ai2Summary) {
    log('Warning: Did not receive summary content from AIs', 'error');
  }

  // Build summary HTML - show both summaries side by side conceptually
  let html = `<div class="round-summary">
    <h4>Summary Comparison</h4>
    <div class="summary-comparison">
      <div class="ai-response">
        <div class="ai-name ${ai1}">${capitalize(ai1)}'s Summary:</div>
        <div>${escapeHtml(ai1Summary).replace(/\n/g, '<br>')}</div>
      </div>
      <div class="ai-response">
        <div class="ai-name ${ai2}">${capitalize(ai2)}'s Summary:</div>
        <div>${escapeHtml(ai2Summary).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  </div>`;

  // Add round-by-round history
  html += `<div class="round-summary"><h4>Complete Discussion History</h4>`;
  for (let round = 1; round <= discussionState.currentRound; round++) {
    const roundEntries = discussionState.history.filter(h => h.round === round && h.type !== 'summary');
    if (roundEntries.length > 0) {
      html += `<div style="margin-top:12px"><strong>Round ${round}</strong></div>`;
      for (const entry of roundEntries) {
        const preview = entry.content.substring(0, 200) + (entry.content.length > 200 ? '...' : '');
        html += `<div class="ai-response">
          <div class="ai-name ${entry.ai}">${capitalize(entry.ai)}:</div>
          <div>${escapeHtml(preview).replace(/\n/g, '<br>')}</div>
        </div>`;
      }
    }
  }
  html += `</div>`;

  document.getElementById('summary-content').innerHTML = html;
  discussionState.active = false;
  log('Discussion summary generated', 'success');
}

async function openDiscussionView() {
  if (!discussionState.history || discussionState.history.length === 0) {
    log('No discussion history to display', 'error');
    return;
  }

  if (!discussionState.topic || !discussionState.participants || discussionState.participants.length === 0) {
    log('Discussion data incomplete', 'error');
    return;
  }

  const btn = document.getElementById('show-discussion-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Waiting for responses...';

  try {
    // Wait for all pending responses to complete
    if (discussionState.pendingResponses && discussionState.pendingResponses.size > 0) {
      log('Waiting for pending responses to complete before opening discussion view...', 'info');
      updateDiscussionStatus('waiting', 'Waiting for responses to complete before opening discussion view...');
      
      await waitForPendingResponses();
    }

    // Check and update responses for the current round to ensure they're complete
    await ensureCurrentRoundResponsesComplete();

    // Generate HTML for the full discussion
    const html = generateDiscussionHTML();
    
    // Create a data URL and open in new tab
    chrome.tabs.create({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) }, (tab) => {
      if (chrome.runtime.lastError) {
        log('Failed to open discussion view: ' + chrome.runtime.lastError.message, 'error');
      } else {
        log('Opened discussion view in new tab', 'success');
      }
    });
  } catch (err) {
    log('Error generating discussion view: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function waitForPendingResponses(maxWait = 60000) {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every second
  const stableThreshold = 3; // 3 seconds of stable content

  while (discussionState.pendingResponses && discussionState.pendingResponses.size > 0) {
    if (Date.now() - startTime > maxWait) {
      log('Timeout waiting for responses, opening discussion view with current content', 'warning');
      break;
    }

    await sleep(checkInterval);
  }
}

async function ensureCurrentRoundResponsesComplete() {
  if (!discussionState.active || !discussionState.participants) return;

  const currentRound = discussionState.currentRound;
  const participants = discussionState.participants;
  const checkInterval = 500;
  const stableThreshold = 4; // 2 seconds of stable content (4 checks * 500ms)
  const maxWait = 30000; // 30 seconds max wait per participant

  // Check each participant's latest response
  for (const aiType of participants) {
    let previousContent = null;
    let stableCount = 0;
    let contentGrowing = false;
    const startTime = Date.now();

    // Get the current response from history for this round
    const historyEntry = discussionState.history.find(
      h => h.round === currentRound && h.ai === aiType
    );
    const historyContent = historyEntry?.content || '';

    while (Date.now() - startTime < maxWait) {
      try {
        const latestResponse = await getLatestResponse(aiType);
        
        if (!latestResponse || latestResponse.trim().length === 0) {
          await sleep(checkInterval);
          continue;
        }

        // Check if content is still growing (comparing to previous check)
        if (previousContent !== null) {
          if (latestResponse.length > previousContent.length) {
            // Content is still growing
            contentGrowing = true;
            stableCount = 0;
          } else if (latestResponse === previousContent) {
            // Content is stable (not changing)
            stableCount++;
            contentGrowing = false;
          } else {
            // Content changed but not growing (might be a different response)
            stableCount = 0;
            contentGrowing = false;
          }
        } else {
          // First check, just record it
          contentGrowing = latestResponse.length > historyContent.length;
        }

        // If content is stable and we've waited long enough
        if (!contentGrowing && stableCount >= stableThreshold) {
          // Check if this is different/updated from history
          if (historyContent && latestResponse !== historyContent) {
            // Update history with the latest complete response
            if (historyEntry) {
              historyEntry.content = latestResponse;
              log(`Updated ${aiType} response for round ${currentRound} (${latestResponse.length} chars)`, 'success');
            } else {
              discussionState.history.push({
                round: currentRound,
                ai: aiType,
                type: discussionState.roundType,
                content: latestResponse
              });
              log(`Added ${aiType} response for round ${currentRound}`, 'success');
            }
          } else if (!historyContent) {
            // No history entry, add it
            const exists = discussionState.history.some(
              h => h.round === currentRound && h.ai === aiType && h.content === latestResponse
            );
            if (!exists) {
              discussionState.history.push({
                round: currentRound,
                ai: aiType,
                type: discussionState.roundType,
                content: latestResponse
              });
              log(`Added ${aiType} response for round ${currentRound}`, 'success');
            }
          }
          break;
        }

        // If content is still growing, continue waiting
        if (contentGrowing) {
          previousContent = latestResponse;
          await sleep(checkInterval);
          continue;
        }

        previousContent = latestResponse;
      } catch (err) {
        // Ignore errors, continue checking
      }

      await sleep(checkInterval);
    }
  }
}

// Format markdown-like text to HTML (similar to LLM interfaces)
function formatMarkdown(text) {
  if (!text) return '';
  
  // First, protect code blocks from other processing
  const codeBlocks = [];
  let html = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ lang: lang || 'text', code: code.trim() });
    return placeholder;
  });
  
  // Protect existing HTML tags (like <ol>, <ul>, <li>, <p>, etc.) before processing
  const htmlTags = [];
  const htmlTagPattern = /<(ol|ul|li|p|h[1-6]|div|span|strong|em|a|code|pre|hr|br|blockquote)(\s[^>]*)?>|<\/(ol|ul|li|p|h[1-6]|div|span|strong|em|a|code|pre|hr|br|blockquote)>/gi;
  html = html.replace(htmlTagPattern, (match) => {
    const placeholder = `__HTML_TAG_${htmlTags.length}__`;
    htmlTags.push(match);
    return placeholder;
  });
  
  // Process line by line for block elements
  const lines = html.split('\n');
  const processedLines = [];
  let inList = false;
  let listType = null;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push('');
      continue;
    }
    
    // Headers
    if (line.match(/^### /)) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push(line.replace(/^### (.*)$/, '<h3>$1</h3>'));
      continue;
    }
    if (line.match(/^## /)) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push(line.replace(/^## (.*)$/, '<h2>$1</h2>'));
      continue;
    }
    if (line.match(/^# /)) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push(line.replace(/^# (.*)$/, '<h1>$1</h1>'));
      continue;
    }
    
    // Horizontal rules
    if (line === '---') {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push('<hr>');
      continue;
    }
    
    // Numbered lists
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) {
          processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        }
        processedLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      processedLines.push(`<li>${numberedMatch[2]}</li>`);
      continue;
    }
    
    // Bullet lists
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) {
          processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        }
        processedLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      processedLines.push(`<li>${bulletMatch[1]}</li>`);
      continue;
    }
    
    // Regular line
    if (inList) {
      processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }
    processedLines.push(line);
  }
  
  if (inList) {
    processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
  }
  
  html = processedLines.join('\n');
  
  // Restore protected HTML tags before escaping
  htmlTags.forEach((tag, index) => {
    const placeholder = `__HTML_TAG_${index}__`;
    html = html.replace(placeholder, tag);
  });
  
  // Protect all HTML tags (both original and newly generated) before escaping
  const protectedHtml = [];
  html = html.replace(htmlTagPattern, (match) => {
    const placeholder = `__PROTECTED_HTML_${protectedHtml.length}__`;
    protectedHtml.push(match);
    return placeholder;
  });
  
  html = escapeHtml(html);
  
  // Restore protected HTML tags
  protectedHtml.forEach((tag, index) => {
    const placeholder = escapeHtml(`__PROTECTED_HTML_${index}__`);
    html = html.replace(placeholder, tag);
  });
  
  // Restore code blocks with proper formatting (code is already escaped)
  codeBlocks.forEach((block, index) => {
    const placeholder = escapeHtml(`__CODE_BLOCK_${index}__`);
    const escapedCode = escapeHtml(block.code);
    html = html.replace(placeholder, `<pre class="code-block"><code class="language-${block.lang}">${escapedCode}</code></pre>`);
  });
  
  // Inline code (`code`)
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
  
  // Bold (**text**)
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  
  // Italic (*text* but not **text**)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Split into paragraphs, but preserve existing HTML structure
  // If content already has HTML tags, don't wrap in <p>
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(para => {
    para = para.trim();
    if (!para) return '';
    
    // Don't wrap if it's already a block element or contains HTML tags
    if (para.match(/^<(h[1-6]|ul|ol|pre|hr|p|div|blockquote)/) || para.match(/<(ol|ul|li|p|h[1-6]|div|span|strong|em|a|code|pre|hr|br|blockquote)/)) {
      return para;
    }
    
    // Convert single newlines to <br> within paragraphs
    para = para.replace(/\n/g, '<br>');
    
    return '<p>' + para + '</p>';
  }).join('\n');
  
  return html;
}

function generateDiscussionHTML() {
  const [ai1, ai2] = discussionState.participants;
  const participantsText = discussionState.participants.map(capitalize).join(' vs ');
  
  // Group responses by round and separate summaries
  const rounds = {};
  const summaries = [];
  
  for (const entry of discussionState.history) {
    if (entry.type === 'summary') {
      summaries.push(entry);
    } else {
      if (!rounds[entry.round]) {
        rounds[entry.round] = [];
      }
      rounds[entry.round].push(entry);
    }
  }

  // Get round type labels
  const getRoundTypeLabel = (roundType) => {
    switch(roundType) {
      case 'initial': return 'Initial Positions';
      case 'cross-eval': return 'Cross-Evaluation';
      case 'counter': return 'Counter-Response';
      default: return 'Discussion';
    }
  };

  // Get round type icon
  const getRoundTypeIcon = (roundType) => {
    switch(roundType) {
      case 'initial': return '💬';
      case 'cross-eval': return '🔄';
      case 'counter': return '↩️';
      default: return '💭';
    }
  };

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Discussion - ${escapeHtml(discussionState.topic.substring(0, 50))}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: #f8fafc;
      padding: 40px 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #1e293b;
    }
    .header .meta {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 16px;
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .header .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .topic {
      background: #e8f4f8;
      padding: 16px 20px;
      border-left: 4px solid #3b82f6;
      margin-top: 16px;
      border-radius: 6px;
      font-size: 15px;
      line-height: 1.6;
      color: #1e293b;
    }
    .timeline-container {
      position: relative;
      padding-left: 60px;
    }
    .timeline-line {
      position: absolute;
      left: 20px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e2e8f0;
    }
    .round-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 32px;
      position: relative;
    }
    .round-badge-timeline {
      position: absolute;
      left: -50px;
      top: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .round-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #e2e8f0;
    }
    .round-number {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }
    .round-type {
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .response {
      margin-bottom: 16px;
      padding: 16px;
      border-radius: 8px;
      background: #fafafa;
      border-left: 4px solid;
    }
    .response:last-child {
      margin-bottom: 0;
    }
    .response.claude {
      border-left-color: #d97706;
    }
    .response.chatgpt {
      border-left-color: #10b981;
    }
    .response.gemini {
      border-left-color: #3b82f6;
    }
    .ai-name {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      display: inline-block;
      color: white;
    }
    .ai-name.claude {
      background: #d97706;
    }
    .ai-name.chatgpt {
      background: #10b981;
    }
    .ai-name.gemini {
      background: #3b82f6;
    }
    .response-content {
      padding: 16px;
      background: white;
      border-radius: 6px;
      word-wrap: break-word;
      font-size: 15px;
      line-height: 1.7;
      color: #1e293b;
    }
    .response-content p {
      margin: 0 0 12px 0;
    }
    .response-content p:last-child {
      margin-bottom: 0;
    }
    .response-content h1,
    .response-content h2,
    .response-content h3 {
      margin: 20px 0 12px 0;
      font-weight: 600;
      line-height: 1.3;
    }
    .response-content h1 {
      font-size: 24px;
      color: #0f172a;
    }
    .response-content h2 {
      font-size: 20px;
      color: #1e293b;
    }
    .response-content h3 {
      font-size: 18px;
      color: #334155;
    }
    .response-content ul,
    .response-content ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    .response-content li {
      margin: 6px 0;
      line-height: 1.6;
    }
    .response-content code {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace;
      font-size: 14px;
    }
    .response-content .inline-code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      color: #e11d48;
      font-size: 14px;
      border: 1px solid #e2e8f0;
    }
    .response-content .code-block {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
      border: 1px solid #334155;
    }
    .response-content .code-block code {
      color: #e2e8f0;
      display: block;
      white-space: pre;
      font-size: 13px;
      line-height: 1.5;
    }
    .response-content strong {
      font-weight: 600;
      color: #0f172a;
    }
    .response-content em {
      font-style: italic;
    }
    .response-content a {
      color: #3b82f6;
      text-decoration: none;
      border-bottom: 1px solid #93c5fd;
      transition: color 0.2s;
    }
    .response-content a:hover {
      color: #2563eb;
      border-bottom-color: #3b82f6;
    }
    .response-content hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }
    .response-type {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 8px;
      font-style: italic;
    }
    .summary-section {
      background: #fff9e6;
      border: 2px solid #f59e0b;
      padding: 24px;
      border-radius: 12px;
      margin-top: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .summary-section h3 {
      color: #d97706;
      margin-bottom: 20px;
      font-size: 20px;
      font-weight: 700;
    }
    .summary-item {
      margin-bottom: 20px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary-item:last-child {
      margin-bottom: 0;
    }
    @media (max-width: 768px) {
      body {
        padding: 20px 10px;
      }
      .timeline-container {
        padding-left: 0;
      }
      .timeline-line {
        display: none;
      }
      .round-badge-timeline {
        display: none;
      }
      .header {
        padding: 20px;
      }
      .round-section {
        padding: 16px;
      }
    }
    @media print {
      .timeline-line,
      .round-badge-timeline {
        display: none;
      }
      .round-section {
        page-break-inside: avoid;
        margin-bottom: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>AI Discussion Transcript</h1>
    <div class="meta">
      <div class="meta-item">
        <strong>Participants:</strong> ${escapeHtml(participantsText)}
      </div>
      <div class="meta-item">
        <strong>Total Rounds:</strong> ${discussionState.currentRound}
      </div>
      <div class="meta-item">
        <strong>Generated:</strong> ${new Date().toLocaleString()}
      </div>
    </div>
    <div class="topic">
      <strong>Topic:</strong> ${escapeHtml(discussionState.topic)}
    </div>
  </div>

  <div class="timeline-container">
    <div class="timeline-line"></div>`;

  // Display each round
  for (let round = 1; round <= discussionState.currentRound; round++) {
    if (rounds[round] && rounds[round].length > 0) {
      const roundType = rounds[round][0].type;
      const typeLabel = getRoundTypeLabel(roundType);
      const typeIcon = getRoundTypeIcon(roundType);
      
      html += `
    <div class="round-section">
      <div class="round-badge-timeline">${round}</div>
      <div class="round-header">
        <span class="round-number">Round ${round}</span>
        <span class="round-type">${typeIcon} ${typeLabel}</span>
      </div>`;
      
      for (const entry of rounds[round]) {
        html += `
      <div class="response ${entry.ai}">
        <div class="ai-name ${entry.ai}">${capitalize(entry.ai)}</div>
        <div class="response-content">${formatMarkdown(entry.content)}</div>
      </div>`;
      }
      
      html += `
    </div>`;
    }
  }

  html += `
  </div>`;

  // Display summaries if available
  if (summaries.length > 0) {
    html += `
  <div class="summary-section">
    <h3>📋 Discussion Summaries</h3>`;
    
    for (const summary of summaries) {
      html += `
    <div class="summary-item">
      <div class="ai-name ${summary.ai}">${capitalize(summary.ai)}'s Summary</div>
      <div class="response-content">${formatMarkdown(summary.content)}</div>
    </div>`;
    }
    
    html += `
  </div>`;
  }

  html += `
</body>
</html>`;

  return html;
}

function endDiscussion() {
  if (confirm('Are you sure you want to end the discussion? It is recommended to generate a summary first.')) {
    resetDiscussion();
  }
}

function resetDiscussion() {
  discussionState = {
    active: false,
    topic: '',
    participants: [],
    currentRound: 0,
    history: [],
    pendingResponses: new Set(),
    roundType: null,
    pendingEvaluations: null
  };

  // Stop response polling
  if (responsePollingInterval) {
    clearInterval(responsePollingInterval);
    responsePollingInterval = null;
  }

  // Reset UI
  document.getElementById('discussion-setup').classList.remove('hidden');
  document.getElementById('discussion-active').classList.add('hidden');
  document.getElementById('discussion-summary').classList.add('hidden');
  document.getElementById('discussion-topic').value = 'Latest important news from the past 1 week related to new features of advanced AI tools included but not limited to Gemini, Claude, Chatgpt, Grok, Cursor, Antigravity, NotebookLm, Notion AI, Perplexity, Cursor, Copilot, Deepseek, Qwen, Midjourney, Stable Diffusion, Manus, Llama, Devin, Comet and Replit.';
  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;
  document.getElementById('show-discussion-btn').disabled = true;

  log('Discussion ended');
}

function updateDiscussionStatus(state, text) {
  const statusEl = document.getElementById('discussion-status');
  statusEl.textContent = text;
  statusEl.className = 'discussion-status ' + state;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findExistingAITab(aiType) {
  const patterns = {
    claude: ['claude.ai'],
    chatgpt: ['chat.openai.com', 'chatgpt.com'],
    gemini: ['gemini.google.com'],
    perplexity: ['perplexity.ai'],
    grok: ['grok.com']
  };

  const urlPatterns = patterns[aiType];
  if (!urlPatterns) return null;

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && urlPatterns.some(pattern => tab.url.includes(pattern))) {
        return tab;
      }
    }
  } catch (err) {
    console.error(`Error finding ${aiType} tab:`, err);
  }
  return null;
}

async function createNewChatsForAll() {
  const btn = document.getElementById('create-chat-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening chats...';

  try {
    const aiUrls = {
      claude: 'https://claude.ai/chat',
      chatgpt: 'https://chat.openai.com/',
      gemini: 'https://gemini.google.com/',
      perplexity: 'https://www.perplexity.ai/',
      grok: 'https://grok.com/'
    };

    log('Creating new chats for all participants...', 'info');

    // Check for existing tabs and create new chats
    for (const [aiType, url] of Object.entries(aiUrls)) {
      try {
        const existingTab = await findExistingAITab(aiType);
        
        if (existingTab) {
          // Tab exists - update it to create a new chat
          try {
            await chrome.tabs.update(existingTab.id, { url: url, active: true });
            log(`Created new ${capitalize(aiType)} chat in existing tab`, 'success');
          } catch (err) {
            log(`Failed to update ${capitalize(aiType)} tab: ${err.message}`, 'error');
            // Fallback: create new tab if update fails
            await chrome.tabs.create({ url: url });
            log(`Opened new ${capitalize(aiType)} chat tab (fallback)`, 'success');
          }
        } else {
          // No existing tab - create new one
          await chrome.tabs.create({ url: url });
          log(`Opened new ${capitalize(aiType)} chat tab`, 'success');
        }
        
        // Small delay between opening tabs to avoid overwhelming the browser
        await sleep(300);
      } catch (err) {
        log(`Failed to open ${capitalize(aiType)} chat: ${err.message}`, 'error');
      }
    }

    log('All new chats opened successfully', 'success');
  } catch (err) {
    log('Error creating new chats: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}
