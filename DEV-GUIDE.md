# Development Guide - Fast Testing Workflow

## Quick Testing Options

### Option 1: Advanced Extension Reloader (Recommended - Targets One Extension)

**⚠️ Important:** The regular "Extensions Reloader" reloads **ALL** unpacked extensions. Use this instead:

1. Install [Advanced Extension Reloader](https://chromewebstore.google.com/detail/advanced-extension-reload/hagknokdofkmojolcpbddjfdjhnjdkae) from Chrome Web Store
2. Configure it with your extension ID:
   - Get your extension ID from `chrome://extensions/` (under your extension name)
   - Right-click the Advanced Extension Reloader icon → Options
   - Add your extension ID
3. Pin it to your toolbar
4. When you make changes, click the reloader icon (only your extension reloads!)

**Advantages:**
- ✅ Reloads **only your extension** (not all extensions)
- ✅ One-click reload
- ✅ Can set keyboard shortcuts
- ✅ Supports auto-reload on file changes (with npm package)

**Alternative:** If you want to reload all unpacked extensions, use the regular [Extensions Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid) instead.

### Option 1b: Custom Reload Helper Extension (Alternative)

I've created a custom helper extension in `reload-helper/` that reloads only your AI Discuss extension:

1. Load the helper extension:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `reload-helper/` folder
2. Configure it (first time only):
   - Right-click the helper extension icon → Options
   - It should auto-detect your AI Discuss extension
   - Or manually enter your extension ID
3. Click the helper icon to reload only your extension

**Advantages:**
- ✅ Reloads only your extension
- ✅ No external dependencies
- ✅ Auto-detects your extension
- ✅ Shows notifications when reloaded

---

### Option 2: File Watcher + Manual Reload

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the watcher:
   ```bash
   npm run watch
   ```

3. The watcher will notify you when files change
4. Manually reload in `chrome://extensions/` (or use Extensions Reloader)

**Advantages:**
- Knows exactly when files change
- Can be extended with auto-reload later

---

### Option 3: Keyboard Shortcut (Fastest Manual Method)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Find your extension
4. Use keyboard shortcut:
   - **Windows/Linux**: `Ctrl+R` (when extensions page is focused)
   - **Mac**: `Cmd+R`

**Advantages:**
- No additional tools needed
- Very fast once you get the muscle memory

---

### Option 4: Chrome Extension Reload API (Advanced)

For fully automatic reload, you can use Chrome's Management API. This requires:

1. A helper extension that uses `chrome.management.reload()`
2. Or starting Chrome with `--remote-debugging-port=9222` and using Chrome DevTools Protocol

**Not recommended** for simple development - the manual methods above are faster to set up.

---

## Testing Different Parts of Your Extension

### Testing Content Scripts (content/*.js)

**What needs reload:**
- ✅ Content scripts: **Refresh the AI page** (not the extension)
- ✅ Background script: Reload extension

**Workflow:**
1. Make changes to `content/claude.js`, `content/chatgpt.js`, or `content/gemini.js`
2. **Just refresh the AI page** (e.g., refresh claude.ai)
3. No need to reload the extension!

**Why:** Content scripts are injected when pages load, so refreshing the page re-injects them.

---

### Testing Side Panel (sidepanel/*)

**What needs reload:**
- ✅ Side panel: **Reload extension** OR **Close and reopen side panel**

**Workflow:**
1. Make changes to `sidepanel/panel.js` or `sidepanel/panel.html`
2. Reload extension OR close/reopen the side panel
3. Side panel reloads automatically when reopened

---

### Testing Background Script (background.js)

**What needs reload:**
- ✅ Background script: **Must reload extension**

**Workflow:**
1. Make changes to `background.js`
2. Reload extension (Extensions Reloader or manual)
3. Background service worker restarts

---

### Testing Manifest Changes (manifest.json)

**What needs reload:**
- ✅ Manifest: **Must reload extension**

**Workflow:**
1. Make changes to `manifest.json`
2. Reload extension
3. Chrome validates and applies new manifest

---

## Recommended Development Workflow

### For Content Script Development:

```bash
# Terminal 1: Watch for changes
npm run watch

# Terminal 2: (Optional) Keep chrome://extensions/ open
# Just refresh AI pages when notified
```

**Steps:**
1. Edit `content/claude.js`
2. Save file
3. **Refresh claude.ai page** (F5 or Ctrl+R)
4. Test immediately - no extension reload needed!

---

### For Side Panel / Background Development:

```bash
# Terminal 1: Watch for changes
npm run watch

# Use Extensions Reloader extension (one click)
```

**Steps:**
1. Edit `sidepanel/panel.js` or `background.js`
2. Save file
3. Click Extensions Reloader icon
4. Test immediately

---

## Pro Tips

### 1. Keep Chrome Extensions Page Open

Keep `chrome://extensions/` in a pinned tab for quick access to the reload button.

### 2. Use Browser DevTools

- **Side Panel DevTools**: Right-click in side panel → Inspect
- **Content Script DevTools**: Open DevTools on the AI page, check "Console" tab
- **Background DevTools**: Go to `chrome://extensions/` → Click "service worker" link under your extension

### 3. Hot Reload for Side Panel

The side panel automatically reloads when you close and reopen it, so you can:
1. Make changes to `panel.js`
2. Close side panel
3. Reopen side panel (changes are loaded)

### 4. Test in Incognito Mode

Sometimes extensions behave differently. Test in incognito:
1. Go to `chrome://extensions/`
2. Enable "Allow in incognito" for your extension
3. Test in a new incognito window

---

## Troubleshooting

### Extension Not Reloading?

1. Check if extension is enabled in `chrome://extensions/`
2. Look for errors in the extension details page
3. Check background service worker console for errors

### Changes Not Appearing?

1. **Content scripts**: Make sure you refreshed the AI page, not just the extension
2. **Side panel**: Close and reopen the side panel
3. **Background**: Make sure extension was actually reloaded (check service worker status)

### Service Worker Died?

Background service workers can be terminated by Chrome. If your extension stops working:
1. Go to `chrome://extensions/`
2. Click the "service worker" link to wake it up
3. Or reload the extension

---

## Summary: Fastest Method

**For most development:**
1. Install **Advanced Extension Reloader** (targets one extension) OR use the **Custom Reload Helper** in `reload-helper/`
2. Keep it pinned to toolbar
3. Click it after each change
4. **For content scripts**: Just refresh the AI page instead

**Total time per change: < 2 seconds** ⚡

**Important:** Regular "Extensions Reloader" reloads ALL unpacked extensions. Use "Advanced Extension Reloader" or the custom helper to reload only yours.
