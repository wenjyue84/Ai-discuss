# Contributing to AI Discuss

Thank you for your interest in contributing to AI Discuss! This document provides guidelines and information for contributors.

## Project Status

This is an **experimental prototype** project. The focus is on validating the "roundtable workflow" concept rather than building a production-ready tool.

## Contribution Types

We welcome the following types of contributions:

### 1. Bug Reports

**Requirements:**
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (browser version, extension version)
- Screenshots if applicable

**Template:**
```markdown
**Description:**
[Clear description of the bug]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Environment:**
- Browser: [Chrome/Edge/etc] [Version]
- Extension Version: [Version]
- AI Platforms: [Which AIs were you using]

**Additional Context:**
[Any other relevant information]
```

### 2. Documentation Improvements

- Fix typos or unclear explanations
- Add missing information
- Improve code comments
- Translate documentation (if you're fluent in both languages)

### 3. Small Fixes

- Bug fixes
- Selector updates when AI platforms change their DOM
- Minor UI improvements
- Performance optimizations

### 4. Feature Requests

**Note:** Due to limited maintenance capacity, feature requests may not be acted upon immediately. However, we still welcome them for future consideration.

When submitting feature requests:
- Explain the use case
- Describe how it fits with the project's goals
- Consider if it aligns with the "non-goals" section in README

## Development Setup

### Prerequisites

- Chrome or Chromium-based browser
- Basic knowledge of JavaScript and Chrome Extensions

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ai-roundtable-main
   ```

2. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

3. **Test the extension:**
   - Open AI platform pages (Claude, ChatGPT, Gemini)
   - Click extension icon to open side panel
   - Try sending messages

### Development Workflow

1. **Create a branch:**
   ```bash
   git checkout -b fix/your-fix-name
   # or
   git checkout -b feature/your-feature-name
   ```

2. **Make changes:**
   - Follow existing code style
   - Add comments for complex logic
   - Test thoroughly

3. **Test your changes:**
   - Test on all supported AI platforms if applicable
   - Test edge cases
   - Verify no console errors

4. **Commit:**
   ```bash
   git commit -m "Brief description of changes"
   ```

5. **Push and create PR:**
   ```bash
   git push origin your-branch-name
   ```

## Code Style

### JavaScript

- Use modern ES6+ features
- Prefer `const` over `let`, avoid `var`
- Use async/await for asynchronous code
- Add comments for complex logic
- Keep functions focused and small

### Naming Conventions

- Variables: `camelCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` (if truly constant)
- AI types: lowercase (`'claude'`, `'chatgpt'`, `'gemini'`)

### File Structure

- Keep files focused on single responsibility
- Content scripts should be platform-specific
- Shared utilities can go in a `utils/` folder (if needed)

## Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test:

- [ ] Extension loads without errors
- [ ] All AI platforms can be detected
- [ ] Messages can be sent to each platform
- [ ] Responses are captured correctly
- [ ] Mutual review (`/mutual`) works
- [ ] Cross-reference (`@AI1 评价 @AI2`) works
- [ ] Discussion mode works (if changed)
- [ ] No console errors in:
  - Content scripts (check AI page console)
  - Background script (check service worker console)
  - Side panel (check side panel console)

### Testing Different Scenarios

- Short responses (< 100 characters)
- Long responses (> 5000 characters)
- Streaming responses
- Multiple rapid messages
- Page refresh during operation
- Extension reload during operation

## Common Contribution Tasks

### Updating DOM Selectors

When an AI platform updates their UI:

1. **Identify the change:**
   - Inspect the page to find new selectors
   - Test selectors in browser console

2. **Update content script:**
   - Update input field selector
   - Update send button selector
   - Update response container selector
   - Update streaming indicator selector

3. **Test thoroughly:**
   - Send message
   - Capture response
   - Verify streaming detection

4. **Update documentation:**
   - Note the change in TECHNICAL.md if significant

### Adding a New AI Platform

See [TECHNICAL.md](TECHNICAL.md#adding-a-new-ai-platform) for detailed instructions.

### Fixing Bugs

1. **Reproduce the bug:**
   - Follow bug report steps
   - Identify root cause

2. **Fix the issue:**
   - Make minimal changes
   - Don't refactor unrelated code

3. **Test the fix:**
   - Verify bug is fixed
   - Ensure no regressions
   - Test edge cases

## Pull Request Process

1. **Create PR:**
   - Use clear, descriptive title
   - Reference related issues if applicable
   - Describe what changed and why

2. **PR Description Template:**
   ```markdown
   ## Description
   [What this PR does]

   ## Changes
   - [Change 1]
   - [Change 2]

   ## Testing
   - [How you tested]
   - [Platforms tested]

   ## Related Issues
   - Fixes #123
   ```

3. **Review Process:**
   - Maintainer will review
   - May request changes
   - Will merge when approved

## Questions?

If you have questions about contributing:

- Check existing documentation first
- Look at similar contributions
- Open an issue for discussion

## Code of Conduct

- Be respectful and constructive
- Focus on the code, not the person
- Help others learn and improve
- Follow the project's goals and non-goals

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to AI Discuss! 🎉
