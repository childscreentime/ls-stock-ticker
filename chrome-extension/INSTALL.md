# Installation and Setup Guide

## Quick Start

### 1. Install the Extension

1. **Download the Extension**
   ```bash
   # If you have the source code
   cd /path/to/ls-stock-ticker/chrome-extension
   ```

2. **Load in Chrome**
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked" button
   - Select the `chrome-extension` folder
   - Extension should appear with a placeholder icon

### 2. Initial Configuration

1. **Open Options Page**
   - Right-click the extension icon → "Options"
   - Or click the extension icon → ⚙️ gear button

2. **Add Your First Instrument**
   - Go to "Watchlist Configuration" section
   - Enter an ISIN code (e.g., `US67066G1040` for NVIDIA)
   - Click "Add Instrument"
   - The extension will lookup and add the instrument

3. **Configure Alerts**
   - Scroll to "Alert Rules" section
   - Enable alerts for your instrument
   - Set thresholds (e.g., minimum notional: 1000 EUR)
   - Choose notification types

4. **Save Configuration**
   - Click "Save Configuration" at the bottom
   - You should see "Configuration saved successfully!"

### 3. Verify Setup

1. **Check Tab Status**
   - Click the extension icon to open popup
   - Look at "Tab Status" section
   - Should show your instrument with 🟢 "active" status

2. **Monitor Events**
   - Watch the "Recent Events" section in popup
   - Should start showing QUOTE and TRADE events
   - Events appear as market activity happens

### 4. Optional: Webhook Setup

1. **Discord Webhook** (Optional)
   - Create a Discord webhook in your server
   - Go to Options → Webhook Configuration
   - Enable webhooks, select "Discord"
   - Paste your webhook URL
   - Test with "Test Webhook" button

2. **Telegram Bot** (Optional)
   - Create a Telegram bot with @BotFather
   - Get your bot token and chat ID
   - Configure in webhook settings
   - Test the connection

## Troubleshooting

### No Background Tabs Created
- Check console for errors: `chrome://extensions/` → Extension details → Inspect views
- Verify ISIN lookup worked in options page
- Try removing and re-adding instrument

### No Events Received
- Ensure background tab is active (not discarded)
- Check if ls-tc.de page loads properly
- Look for WebSocket connection in browser DevTools

### Notifications Not Working
- Grant notification permissions when prompted
- Check alert rules are enabled
- Verify minimum thresholds are reasonable

### Extension Not Loading
- Ensure all files are present in the directory
- Check for JavaScript errors in console
- Verify manifest.json is valid

## File Structure

```
chrome-extension/
├── manifest.json           # Extension configuration
├── background.js          # Service worker (main logic)
├── content.js            # Content script (page injection)
├── injected.js           # WebSocket monitoring
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic
├── options.html          # Options page interface
├── options.js            # Options page logic
├── utils/
│   ├── config.js         # Configuration management
│   ├── alerts.js         # Alert system
│   └── webhooks.js       # External notifications
├── styles/
│   ├── popup.css         # Popup styling
│   └── options.css       # Options page styling
├── icons/
│   └── (icon files needed)
└── README.md
```

## Next Steps

1. **Add More Instruments**: Use the options page to add more ISINs to your watchlist
2. **Fine-tune Alerts**: Adjust thresholds based on your trading preferences
3. **Set Up Webhooks**: Configure Discord/Telegram for external notifications
4. **Monitor Performance**: Check popup regularly for system status

## Support

For issues or questions:
- Check the browser console for error messages
- Review the main README.md for detailed documentation
- Verify ls-tc.de is accessible and working normally
