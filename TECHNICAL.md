# Technical Documentation

This document provides detailed technical information about the AI Discuss extension architecture, implementation details, and development guidelines.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Details](#component-details)
- [Message Protocol](#message-protocol)
- [DOM Interaction](#dom-interaction)
- [Response Capture Mechanism](#response-capture-mechanism)
- [Development Guide](#development-guide)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

### Extension Structure

The extension follows Chrome Extension Manifest V3 architecture with three main components:

```
┌─────────────────┐
│   Side Panel    │  User Interface
│   (panel.js)    │  Command parsing, UI state
└────────┬────────┘
         │ chrome.runtime.sendMessage
         │
┌────────▼────────┐
│  Background     │  Message Router
│ (background.js) │  Tab management, storage
└────────┬────────┘
         │ chrome.tabs.sendMessage
         │
┌────────▼────────┐
│ Content Scripts │  Page Interaction
│ (claude.js,     │  DOM manipulation, response capture
│  chatgpt.js,    │
│  gemini.js)     │
└─────────────────┘
```

### Data Flow

1. **User Input** → Side Panel parses command
2. **Command** → Background finds target tabs
3. **Message** → Content script injects into page
4. **Response** → Content script captures from DOM
5. **Notification** → Background stores response
6. **Update** → Side Panel displays in log

## Component Details

### 1. Background Service Worker (`background.js`)

**Responsibilities:**
- Tab discovery and management
- Message routing between components
- Response storage (using `chrome.storage.session`)
- Tab lifecycle tracking

**Key Functions:**

```javascript
// Tab discovery
async function findAITab(aiType) {
  // Searches all tabs for matching URL patterns
  // Returns first matching tab or null
}

// Message routing
async function handleMessage(message, sender) {
  // Routes messages based on type:
  // - SEND_MESSAGE: Forward to content script
  // - GET_RESPONSE: Query content script or storage
  // - RESPONSE_CAPTURED: Store and notify side panel
  // - CONTENT_SCRIPT_READY: Update connection status
}
```

**Storage:**
- Uses `chrome.storage.session` for temporary response storage
- Persists across service worker restarts
- Cleared when browser session ends

### 2. Side Panel (`panel.js`)

**Responsibilities:**
- User interface management
- Command parsing (`/mutual`, `/cross`, `@mentions`)
- Discussion mode state management
- Activity logging

**Command Parsing:**

The parser handles multiple command formats:

1. **Mutual Review** (`/mutual [prompt]`)
   - Triggers cross-evaluation of all selected AIs
   - Each AI receives responses from all others
   - Default prompt: "请评价以上观点。你同意什么？不同意什么？有什么补充？"

2. **Cross Reference** (`@AI1 评价 @AI2` or `/cross @targets <- @sources message`)
   - Two AI format: Last mentioned = source, first = target
   - Three+ AI format: Requires `/cross` command with arrow syntax
   - Automatically wraps source responses in XML tags

3. **Normal Message**
   - Sent to all checked AIs or mentioned AIs
   - Supports @mentions for targeting specific AIs

**Discussion Mode:**

Structured debate workflow:
- **Round 1**: Initial positions
- **Round 2+**: Cross-evaluation (each AI evaluates the other)
- **Summary**: Both AIs generate independent summaries

State management tracks:
- Current round number
- Participant responses
- Pending responses
- Discussion history

### 3. Content Scripts

Each AI platform has a dedicated content script that handles platform-specific DOM interactions.

#### Common Pattern

All content scripts follow this structure:

```javascript
1. Context validation check
2. Notify background of readiness
3. Listen for INJECT_MESSAGE commands
4. Listen for GET_LATEST_RESPONSE queries
5. Setup response observer (MutationObserver)
6. Implement platform-specific DOM selectors
```

#### Platform-Specific Details

**Claude (`claude.js`):**
- Input: `div[contenteditable="true"].ProseMirror`
- Send button: `button[aria-label="Send message"]`
- Response container: `[data-is-streaming="false"]`
- Response content: `.standard-markdown` (excluding thinking blocks)
- Streaming indicator: `[data-is-streaming="true"]`

**ChatGPT (`chatgpt.js`):**
- Input: `textarea#prompt-textarea` or `div[contenteditable="true"]`
- Send button: `button[data-testid="send-button"]`
- Response container: `div[data-message-author-role="assistant"]`
- Streaming indicator: Presence of stop button or streaming class

**Gemini (`gemini.js`):**
- Input: `textarea.ql-editor` or `div[contenteditable="true"]`
- Send button: `button[aria-label*="Send"]`
- Response container: `.model-response-text` or similar
- Streaming indicator: Loading spinner or streaming class

## Message Protocol

### Message Types

#### From Side Panel to Background

```javascript
// Send message to AI
{
  type: 'SEND_MESSAGE',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  message: string
}

// Get latest response
{
  type: 'GET_RESPONSE',
  aiType: 'claude' | 'chatgpt' | 'gemini'
}
```

#### From Background to Content Script

```javascript
// Inject message into page
{
  type: 'INJECT_MESSAGE',
  message: string
}

// Query for latest response
{
  type: 'GET_LATEST_RESPONSE'
}
```

#### From Content Script to Background

```javascript
// Content script ready
{
  type: 'CONTENT_SCRIPT_READY',
  aiType: 'claude' | 'chatgpt' | 'gemini'
}

// Response captured
{
  type: 'RESPONSE_CAPTURED',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  content: string
}
```

#### From Background to Side Panel

```javascript
// Tab status update
{
  type: 'TAB_STATUS_UPDATE',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  connected: boolean
}

// Response captured notification
{
  type: 'RESPONSE_CAPTURED',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  content: string
}

// Send result
{
  type: 'SEND_RESULT',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  success: boolean,
  error?: string
}
```

## DOM Interaction

### Message Injection

The content scripts inject messages by:

1. **Finding the input element** using platform-specific selectors
2. **Focusing the input** to ensure it's active
3. **Setting the content**:
   - For textareas: Direct value assignment
   - For contenteditable divs: Setting innerHTML or textContent
4. **Triggering events**:
   - `input` event for React state updates
   - `change` event if needed
5. **Finding and clicking send button** using platform-specific selectors
6. **Starting response capture** after successful send

### Response Capture

Response capture uses a polling mechanism with stability detection:

```javascript
async function waitForStreamingComplete() {
  let previousContent = '';
  let stableCount = 0;
  const maxWait = 600000;  // 10 minutes
  const checkInterval = 500;  // Check every 500ms
  const stableThreshold = 4;  // 2 seconds stable (4 * 500ms)

  while (Date.now() - startTime < maxWait) {
    await sleep(checkInterval);
    
    const isStreaming = checkStreamingIndicator();
    const currentContent = getLatestResponse();

    if (!isStreaming && currentContent === previousContent && currentContent.length > 0) {
      stableCount++;
      if (stableCount >= stableThreshold) {
        // Response is complete
        captureResponse(currentContent);
        return;
      }
    } else {
      stableCount = 0;
    }
    
    previousContent = currentContent;
  }
}
```

**Streaming Detection:**
- Claude: `[data-is-streaming="true"]` or stop button presence
- ChatGPT: Stop button or streaming class
- Gemini: Loading spinner or streaming indicator

**Response Extraction:**
- Finds the last response container
- Extracts text content while filtering out:
  - Thinking blocks (Claude)
  - UI elements (buttons, timestamps)
  - Metadata

## Response Capture Mechanism

### Stability Detection

The extension uses a stability-based approach to detect when streaming is complete:

1. **Polling**: Checks every 500ms
2. **Stability Check**: Content must remain unchanged for 2 seconds (4 checks)
3. **Streaming Check**: Verifies no streaming indicators are present
4. **Content Validation**: Ensures content length > 0

### Edge Cases

- **Very long responses**: Up to 10 minutes wait time
- **Empty responses**: Ignored until content appears
- **Multiple responses**: Only captures the latest one
- **Context invalidation**: Checks extension context validity before operations

### Storage

Responses are stored in two places:

1. **Background storage** (`chrome.storage.session`):
   - Persists across service worker restarts
   - Used as fallback if content script query fails
   - Cleared on browser session end

2. **Content script memory**:
   - Real-time DOM content
   - Used for immediate queries
   - Lost on page refresh

## Development Guide

### Adding a New AI Platform

1. **Create content script** (`content/newai.js`):
   ```javascript
   const AI_TYPE = 'newai';
   
   // Implement:
   - injectMessage(text)
   - getLatestResponse()
   - findSendButton()
   - setupResponseObserver()
   - waitForStreamingComplete()
   ```

2. **Update manifest.json**:
   ```json
   {
     "content_scripts": [{
       "matches": ["https://newai.example.com/*"],
       "js": ["content/newai.js"],
       "run_at": "document_idle"
     }]
   }
   ```

3. **Update background.js**:
   ```javascript
   const AI_URL_PATTERNS = {
     // ... existing patterns
     newai: ['newai.example.com']
   };
   ```

4. **Update panel.js**:
   ```javascript
   const AI_TYPES = ['claude', 'chatgpt', 'gemini', 'newai'];
   ```

5. **Update panel.html**:
   - Add checkbox for new AI
   - Add status indicator
   - Add mention button

### Testing

1. **Load extension** in developer mode
2. **Open AI page** in new tab
3. **Open side panel** and verify connection status
4. **Send test message** and verify:
   - Message appears in input
   - Send button is clicked
   - Response is captured
   - Log shows success

### Debugging

**Enable console logging:**
- Content scripts: Check browser console on AI page
- Background: Check `chrome://extensions` → Service Worker → Inspect
- Side panel: Check side panel console (right-click → Inspect)

**Common issues:**
- **Selector not found**: DOM structure changed, update selectors
- **Message not sending**: Check input focus and event dispatch
- **Response not captured**: Verify streaming detection logic
- **Context invalidated**: Extension reloaded, refresh AI page

## Troubleshooting

### Issue: Messages not sending

**Symptoms:** Clicking send shows error in log

**Diagnosis:**
1. Check if AI page is loaded and logged in
2. Verify content script is injected (check console)
3. Inspect DOM to verify selectors still work
4. Check for JavaScript errors in content script console

**Solutions:**
- Refresh AI page to reload content script
- Update DOM selectors if page structure changed
- Check if input field is visible and accessible

### Issue: Responses not captured

**Symptoms:** Response appears in page but not in extension

**Diagnosis:**
1. Check if response observer is running
2. Verify streaming detection logic
3. Check response extraction selectors
4. Look for errors in content script console

**Solutions:**
- Increase stability threshold if responses are very long
- Update response container selectors
- Check if streaming indicator detection works
- Verify response text extraction logic

### Issue: Extension stops working after AI page update

**Symptoms:** Previously working features break

**Diagnosis:**
- AI platform updated their UI/DOM structure
- Selectors no longer match elements

**Solutions:**
1. Inspect updated page structure
2. Update selectors in content script
3. Test all functions (send, capture, streaming detection)
4. Update version number in manifest.json

### Issue: Discussion mode not progressing

**Symptoms:** Discussion stuck waiting for responses

**Diagnosis:**
1. Check if responses are being captured
2. Verify pending responses set is being updated
3. Check for errors in side panel console

**Solutions:**
- Manually check if AIs have responded
- Refresh discussion state if needed
- Verify response capture is working for both participants

## Performance Considerations

- **Polling interval**: 500ms balances responsiveness and CPU usage
- **Stability threshold**: 2 seconds prevents premature capture
- **Max wait time**: 10 minutes accommodates very long responses
- **Storage**: Session storage used to avoid persistence overhead
- **Context checks**: Prevents errors when extension is reloaded

## Security & Privacy

- **No data transmission**: All processing happens locally
- **No external APIs**: Extension doesn't communicate with external servers
- **Local storage only**: Uses browser's local storage APIs
- **Content script isolation**: Runs in isolated context, can't access page JavaScript
- **Permissions**: Minimal required permissions (activeTab, scripting, storage)

## Future Improvements

Potential enhancements (not currently planned):

- Support for more AI platforms
- Export discussion history
- Custom command templates
- Multi-round discussion automation
- Response comparison visualization
- API mode support (optional)

---

For user-facing documentation, see [README.md](README.md).
