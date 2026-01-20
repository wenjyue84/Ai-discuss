# AI Discuss

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)](#-experimental-prototype)

> Orchestrate multiple AI assistants in a roundtable discussion, enabling cross-evaluation and deep collaboration

A Chrome extension that lets you act as a "meeting facilitator," simultaneously controlling multiple AIs (Claude, ChatGPT, Gemini) to create a true AI roundtable discussion.

<!-- TODO: Add demo GIF -->
<!-- ![Demo GIF](assets/demo.gif) -->

---

## 🔬 Experimental Prototype

This is an **experimental prototype** built to validate a working method:

> **Ask the same question to multiple models, let them debate each other, and use the friction to expose blind spots and expand thinking.**

It is **not** a production-ready tool, nor an attempt to compete with AI aggregators or workflow platforms.
Think of it as a *runnable experiment* rather than a polished product.

---

## 🎯 Non-goals

* No guarantee of long-term compatibility (AI web UIs change frequently)
* No promise of ongoing maintenance or rapid fixes
* No cloud backend, accounts, or data persistence
* No complex workflow orchestration, exports, or template libraries
* Not trying to support every model or platform

The focus is validating the **roundtable workflow**, not building software for its own sake.

---

## ❓ Why this does NOT use APIs

This project intentionally operates on the **web UIs** (Claude / ChatGPT / Gemini) instead of APIs.

In practice, **API and web chat often behave differently** — commonly due to model variants, hidden system settings, sampling parameters, or UI-specific features.

I'm currently most satisfied with, and calibrated to, the **web chat experience**, so this experiment stays on the web to validate the workflow under real conditions I actually use.

---

## Core Features

- **Unified Console** - Manage multiple AIs simultaneously through Chrome sidebar
- **Multi-target Sending** - Send one message to multiple AIs and compare responses
- **Mutual Review Mode** - Let all AIs critique each other with equal participation (`/mutual` command)
- **Cross-reference** - Have Claude evaluate ChatGPT's response, or vice versa
- **Discussion Mode** - Two AIs engage in multi-round deep discussions on the same topic
- **No API Required** - Directly operates web interfaces, uses your existing AI subscriptions

---

## 🧭 Recommended Workflow

1. **Normal** — Ask the same question to multiple models (create divergence)
2. **/mutual** — Let models critique each other (expose assumptions)
3. **@ audit** — You decide who audits whom
4. **/cross** — Two models pressure-test one conclusion
5. **Discussion** — Run multi-round debates only when needed

---

## 🚀 Quick Start

### Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select this project folder

### First-run Tip: Refresh Pages

After opening the sidebar and selecting target AIs, **refresh each AI page once** to ensure reliable detection (especially if these tabs have been open for a while).

### Setup

1. Open Chrome and log in to the following AI platforms (as needed):
   - [Claude](https://claude.ai)
   - [ChatGPT](https://chatgpt.com)
   - [Gemini](https://gemini.google.com)

2. Recommended: Use Chrome's Split Tab feature to display 2 AI pages side by side

3. Click the extension icon to open the sidebar console

---

## Usage

### Normal Mode

**Basic Sending**
1. Check the target AIs you want to send to (Claude / ChatGPT / Gemini)
2. Enter your message
3. Press Enter or click the "Send" button

**@ Mention Syntax**
- Click the @ button to quickly insert AI names
- Or type manually: `@Claude What do you think about this question?`

**Mutual Review (Recommended)**

Based on existing responses, let all selected AIs evaluate each other:
```
/mutual
/mutual Focus on analyzing strengths and weaknesses
```

Usage:
1. First, send a question to multiple AIs and wait for their responses
2. Click the `/mutual` button or type `/mutual`
3. Each AI will receive responses from all others and provide evaluations
   - 2 AIs: A evaluates B, B evaluates A
   - 3 AIs: A evaluates BC, B evaluates AC, C evaluates AB

**Cross-reference (One-way)**

Two AIs (auto-detected):
```
@Claude Evaluate @ChatGPT
```
The last @ mentioned is the source (being evaluated), the first is the target (evaluator).

Three AIs (use `/cross` command):
```
/cross @Claude @Gemini <- @ChatGPT Evaluate this
/cross @ChatGPT <- @Claude @Gemini Compare these
```

**Action Dropdown Menu**: Quickly insert preset action words (evaluate/learn/critique/supplement/compare)

### Discussion Mode

Let two AIs engage in a deep debate on the same topic:

1. Click "Discussion" at the top to switch to discussion mode
2. Select 2 AIs to participate in the discussion
3. Enter the discussion topic
4. Click "Start Discussion"

**Discussion Flow**

```
Round 1: Both AIs present their initial positions
Round 2: Each AI evaluates the other's position
Round 3: Respond to the other's evaluation, deepen the discussion
...
Summary: Both AIs generate independent discussion summaries
```

---

## Technical Architecture

### Project Structure

```
ai-roundtable/
├── manifest.json           # Chrome extension config (Manifest V3)
├── background.js           # Service Worker message relay
├── sidepanel/
│   ├── panel.html         # Sidebar UI
│   ├── panel.css          # Styles
│   └── panel.js           # Control logic
├── content/
│   ├── claude.js          # Claude page injection script
│   ├── chatgpt.js         # ChatGPT page injection script
│   └── gemini.js          # Gemini page injection script
└── icons/                  # Extension icons
```

### How It Works

1. **Content Scripts**: Injected into each AI webpage, responsible for:
   - Listening for messages from background script
   - Finding input fields in the page and injecting messages
   - Simulating send button clicks
   - Monitoring DOM changes to capture AI responses
   - Detecting streaming output completion status

2. **Background Service Worker**: Acts as message relay center:
   - Manages tab state
   - Routes messages between sidepanel and content scripts
   - Stores latest responses (using `chrome.storage.session`)
   - Handles tab update and close events

3. **Side Panel**: User interface:
   - Displays connection status
   - Provides message input and send controls
   - Parses commands (`/mutual`, `/cross`, `@mentions`)
   - Manages discussion mode state
   - Displays activity log

### Message Flow

```
User Input → Side Panel (panel.js)
    ↓
Parse Command/Target → Background (background.js)
    ↓
Find Corresponding Tab → Content Script (claude.js/chatgpt.js/gemini.js)
    ↓
Inject Message into Page → Simulate Send Click
    ↓
Monitor DOM Changes → Capture Response
    ↓
Notify Background → Update Storage
    ↓
Notify Side Panel → Display Log
```

For detailed technical documentation, see [TECHNICAL.md](TECHNICAL.md)

---

## Privacy

- **No Data Upload** - Extension runs entirely locally, sends no data to any server
- **No Telemetry/Logging** - Does not collect usage data or track behavior
- **Data Storage Location** - Uses only browser local storage (`chrome.storage.local`)
- **No Third-party Services** - Does not depend on any external APIs or services
- **How to Delete Data** - Uninstalling the extension completely removes data, or clear storage in Chrome extension settings

---

## FAQ

### Q: Can't connect to AI pages after installation?
**A:** After installing or updating the extension, refresh any open AI pages. This is because content scripts are only injected when pages load.

### Q: "Unable to get response" when cross-referencing?
**A:** Ensure the source AI has already responded. The system retrieves that AI's latest response. If a response is still being generated, wait for it to complete before trying again.

### Q: Will ChatGPT timeout on very long responses?
**A:** No. The system supports up to 10 minutes of response capture. The response detection mechanism waits for content to stabilize (2 seconds with no changes) before marking it as complete.

### Q: Why do messages sometimes fail to send?
**A:** Possible reasons:
- AI page structure has been updated, requiring updates to content script DOM selectors
- Page is still loading, wait for page to fully load before trying again
- Input field is blocked by other elements, try scrolling the page or refreshing

### Q: How to interject during discussion mode?
**A:** During an active discussion, use the "Interject" feature to send a message to both AIs simultaneously. Interjections automatically include the other AI's latest response, allowing AIs to respond to your question while understanding the other's viewpoint.

### Q: Which browsers are supported?
**A:** Currently only Chrome and Chromium-based browsers (such as Edge, Brave) are supported, due to the use of Manifest V3 and Side Panel API.

---

## Known Limitations

- **DOM Dependency**: Depends on each AI platform's DOM structure; platform updates may cause features to break
- **Discussion Mode**: Fixed at 2 participants, does not support 3+ party discussions
- **Special Features**: Does not support Claude Artifacts, ChatGPT Canvas, Gemini multimodal input, and other special features
- **Streaming Output**: Only captures final complete responses, not intermediate states
- **Multiple Tabs**: If multiple tabs of the same AI are open, only the first matching tab will be used
- **Language Support**: Interface primarily supports English; other languages may display incorrectly

---

## Contributing

Contributions welcome (low-maintenance project):

- Reproducible bug reports (input + output + steps + environment)
- Documentation improvements
- Small PRs (fixes/docs)

> **Note:** Feature requests may not be acted on due to limited maintenance capacity.

---

## License

MIT License - see [LICENSE](LICENSE) for details.
