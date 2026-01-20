# Extension Reload Helper

A custom Chrome extension that reloads **only** your AI Discuss extension (not all extensions).

## Setup

1. **Load the helper extension:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select this `reload-helper/` folder

2. **Configure it (first time only):**
   - Right-click the helper extension icon in your toolbar
   - Click "Options"
   - It should auto-detect your AI Discuss extension
   - If not, manually enter your extension ID (found in `chrome://extensions/`)

3. **Pin it to toolbar** (optional but recommended)

## Usage

Just click the helper extension icon whenever you want to reload your AI Discuss extension. It will:
- ✅ Reload only your extension (not others)
- ✅ Show a notification when done
- ✅ Auto-detect your extension on first use

## Why Use This?

The regular "Extensions Reloader" extension reloads **all** unpacked extensions, which can be annoying if you have multiple extensions in development.

This helper extension uses Chrome's `management` API to reload only the specific extension you configure.

## Alternative

You can also use [Advanced Extension Reloader](https://chromewebstore.google.com/detail/advanced-extension-reload/hagknokdofkmojolcpbddjfdjhnjdkae) from the Chrome Web Store, which also supports targeting specific extensions.
