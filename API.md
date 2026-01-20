# API Reference

This document describes the internal APIs and message protocols used by the AI Discuss extension.

## Message API

### Side Panel → Background

#### Send Message to AI

**Request:**
```javascript
chrome.runtime.sendMessage({
  type: 'SEND_MESSAGE',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  message: string
}, (response) => {
  // response: { success: boolean, error?: string }
});
```

**Response:**
```javascript
{
  success: boolean,
  error?: string  // Present if success is false
}
```

#### Get Latest Response

**Request:**
```javascript
chrome.runtime.sendMessage({
  type: 'GET_RESPONSE',
  aiType: 'claude' | 'chatgpt' | 'gemini'
}, (response) => {
  // response: { content: string | null }
});
```

**Response:**
```javascript
{
  content: string | null  // null if no response available
}
```

### Background → Content Script

#### Inject Message

**Request:**
```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'INJECT_MESSAGE',
  message: string
}, (response) => {
  // response: { success: boolean, error?: string }
});
```

**Response:**
```javascript
{
  success: boolean,
  error?: string  // Present if success is false
}
```

#### Get Latest Response

**Request:**
```javascript
chrome.tabs.sendMessage(tabId, {
  type: 'GET_LATEST_RESPONSE'
}, (response) => {
  // response: { content: string | null }
});
```

**Response:**
```javascript
{
  content: string | null
}
```

### Content Script → Background

#### Content Script Ready

**Message:**
```javascript
chrome.runtime.sendMessage({
  type: 'CONTENT_SCRIPT_READY',
  aiType: 'claude' | 'chatgpt' | 'gemini'
});
```

**No response expected.**

#### Response Captured

**Message:**
```javascript
chrome.runtime.sendMessage({
  type: 'RESPONSE_CAPTURED',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  content: string
});
```

**No response expected.**

### Background → Side Panel

#### Tab Status Update

**Message:**
```javascript
chrome.runtime.sendMessage({
  type: 'TAB_STATUS_UPDATE',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  connected: boolean
});
```

**No response expected.**

#### Response Captured Notification

**Message:**
```javascript
chrome.runtime.sendMessage({
  type: 'RESPONSE_CAPTURED',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  content: string
});
```

**No response expected.**

#### Send Result

**Message:**
```javascript
chrome.runtime.sendMessage({
  type: 'SEND_RESULT',
  aiType: 'claude' | 'chatgpt' | 'gemini',
  success: boolean,
  error?: string  // Present if success is false
});
```

**No response expected.**

## Command Parsing API

### Command Types

#### 1. Mutual Review

**Format:**
```
/mutual [optional prompt]
```

**Parsed Result:**
```javascript
{
  mutual: true,
  prompt: string,  // Default: "Please evaluate the above viewpoints. What do you agree with? What do you disagree with? What would you add?"
  crossRef: false,
  mentions: [],
  originalMessage: string
}
```

#### 2. Cross Reference (Two AIs)

**Format:**
```
@AI1 Evaluate @AI2
@AI1 Review @AI2's response
```

**Parsed Result:**
```javascript
{
  crossRef: true,
  mentions: ['ai1', 'ai2'],
  targetAIs: ['ai1'],      // Evaluator
  sourceAIs: ['ai2'],      // Being evaluated
  originalMessage: string
}
```

#### 3. Cross Reference (Three+ AIs)

**Format:**
```
/cross @target1 @target2 <- @source1 @source2 message
```

**Parsed Result:**
```javascript
{
  crossRef: true,
  mentions: ['target1', 'target2', 'source1', 'source2'],
  targetAIs: ['target1', 'target2'],
  sourceAIs: ['source1', 'source2'],
  originalMessage: string  // Message after last @mention
}
```

#### 4. Normal Message

**Format:**
```
Any text message
@AI1 optional mention
```

**Parsed Result:**
```javascript
{
  crossRef: false,
  mentions: ['ai1'],  // Empty if no mentions
  originalMessage: string
}
```

## Storage API

### Response Storage

**Location:** `chrome.storage.session`

**Structure:**
```javascript
{
  latestResponses: {
    claude: string | null,
    chatgpt: string | null,
    gemini: string | null
  }
}
```

**Methods:**

```javascript
// Get all responses
const result = await chrome.storage.session.get('latestResponses');
const responses = result.latestResponses || {
  claude: null,
  chatgpt: null,
  gemini: null
};

// Set single response
const responses = await chrome.storage.session.get('latestResponses');
responses.latestResponses[aiType] = content;
await chrome.storage.session.set({ latestResponses: responses.latestResponses });
```

## Content Script API

### Required Functions

Each content script must implement:

#### `injectMessage(text: string): Promise<boolean>`

Injects a message into the AI page's input field and sends it.

**Returns:** `Promise<boolean>` - Success status

**Throws:** `Error` if input field or send button not found

#### `getLatestResponse(): string | null`

Extracts the latest AI response from the page DOM.

**Returns:** Response text or `null` if no response found

#### `findSendButton(): HTMLElement | null`

Finds the send button element.

**Returns:** Button element or `null` if not found

#### `setupResponseObserver(): void`

Sets up a MutationObserver to detect new responses.

**No return value.**

#### `waitForStreamingComplete(): Promise<void>`

Waits for streaming to complete and captures the response.

**Returns:** `Promise<void>`

**Behavior:**
- Polls every 500ms
- Checks for streaming indicators
- Waits for content stability (2 seconds unchanged)
- Maximum wait: 10 minutes
- Sends `RESPONSE_CAPTURED` message when complete

## Utility Functions

### Context Validation

```javascript
function isContextValid(): boolean {
  return chrome.runtime && chrome.runtime.id;
}
```

### Safe Message Sending

```javascript
function safeSendMessage(message: object, callback?: function): void {
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
```

### URL Pattern Matching

```javascript
const AI_URL_PATTERNS = {
  claude: ['claude.ai'],
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  gemini: ['gemini.google.com']
};

function getAITypeFromUrl(url: string): string | null {
  if (!url) return null;
  for (const [aiType, patterns] of Object.entries(AI_URL_PATTERNS)) {
    if (patterns.some(p => url.includes(p))) {
      return aiType;
    }
  }
  return null;
}
```

## Error Handling

### Common Error Types

1. **Tab Not Found**
   ```javascript
   { success: false, error: `No ${aiType} tab found` }
   ```

2. **Input Field Not Found**
   ```javascript
   { success: false, error: 'Could not find input field' }
   ```

3. **Send Button Not Found**
   ```javascript
   { success: false, error: 'Could not find send button' }
   ```

4. **Context Invalidated**
   - Content script detects invalid context
   - Stops operations gracefully
   - Logs warning message

5. **Response Not Available**
   ```javascript
   { content: null }  // When querying for response
   ```

## Event Listeners

### Background Script

```javascript
// Extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Handle tab status changes
});

// Tab closures
chrome.tabs.onRemoved.addListener((tabId) => {
  // Handle tab removal
});

// Runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle all message types
});
```

### Side Panel

```javascript
// Runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle: TAB_STATUS_UPDATE, RESPONSE_CAPTURED, SEND_RESULT
});
```

### Content Script

```javascript
// Runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle: INJECT_MESSAGE, GET_LATEST_RESPONSE
});
```

## Constants

### AI Types

```javascript
const AI_TYPES = ['claude', 'chatgpt', 'gemini'];
```

### Cross-Reference Actions

```javascript
const CROSS_REF_ACTIONS = {
  evaluate: { prompt: 'Evaluate this' },
  learn: { prompt: 'What is worth learning from this' },
  critique: { prompt: 'Critique this and point out issues' },
  supplement: { prompt: 'What is missing that needs to be added' },
  compare: { prompt: 'Compare this with your viewpoint' }
};
```

### Response Capture Settings

```javascript
const MAX_WAIT = 600000;        // 10 minutes
const CHECK_INTERVAL = 500;     // 500ms
const STABLE_THRESHOLD = 4;     // 2 seconds (4 * 500ms)
```

## Type Definitions (TypeScript-style)

```typescript
type AIType = 'claude' | 'chatgpt' | 'gemini';

interface MessageRequest {
  type: 'SEND_MESSAGE' | 'GET_RESPONSE';
  aiType?: AIType;
  message?: string;
}

interface MessageResponse {
  success?: boolean;
  content?: string | null;
  error?: string;
}

interface ParsedMessage {
  mutual?: boolean;
  crossRef?: boolean;
  mentions: AIType[];
  targetAIs?: AIType[];
  sourceAIs?: AIType[];
  prompt?: string;
  originalMessage: string;
}

interface DiscussionState {
  active: boolean;
  topic: string;
  participants: AIType[];
  currentRound: number;
  history: DiscussionHistoryEntry[];
  pendingResponses: Set<AIType>;
  roundType: 'initial' | 'cross-eval' | 'counter' | 'summary' | null;
}

interface DiscussionHistoryEntry {
  round: number;
  ai: AIType;
  type: 'initial' | 'evaluation' | 'response' | 'summary';
  content: string;
}
```

---

For implementation details, see [TECHNICAL.md](TECHNICAL.md).
