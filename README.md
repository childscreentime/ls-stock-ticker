# LS Stock Ticker Chrome Extension

A Chrome extension that monitors multiple stock instruments on Lang & Schwarz (ls-tc.de) in real-time, providing trade alerts and price notifications directly in your browser.

## 🚀 Features

- **Multi-Instrument Monitoring**: Track multiple stocks simultaneously (NVIDIA, Rheinmetall, etc.)
- **Real-Time Alerts**: Get instant notifications for large trades and price movements
- **Smart Tab Management**: Only injects into one ls-tc.de tab to prevent conflicts
- **ISIN-Based Configuration**: Easy instrument setup using ISIN codes
- **Live Price Tracking**: Real-time bid/ask updates with spread calculations
- **Trade Detection**: Automatic buy/sell detection with volume analysis

## 📦 Installation

### Method 1: Load as Unpacked Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/childscreentime/ls-stock-ticker.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `chrome-extension` folder

5. The extension icon should appear in your toolbar

### Method 2: Install from Chrome Web Store

*Coming soon - extension will be published to Chrome Web Store*

## ⚙️ Configuration

### Adding Instruments

1. Click the extension icon in your toolbar
2. Click "Options" to open the configuration page
3. Add instruments using their ISIN codes:
   - **NVIDIA**: `US67066G1040`
   - **Rheinmetall**: `DE0007030009`
   - **Custom stocks**: Enter any ISIN from ls-tc.de

### Alert Settings

Configure your alert preferences:
- **Minimum Trade Size**: Set threshold for trade notifications
- **Price Change Alerts**: Get notified on significant price movements
- **Sound Notifications**: Enable/disable audio alerts

## 🎯 Usage

1. **Open ls-tc.de**: Navigate to any instrument page on https://www.ls-tc.de/
2. **Extension Auto-Activates**: The extension detects the domain and starts monitoring
3. **View Live Data**: Click the extension icon to see recent events
4. **Get Notifications**: Receive alerts for significant trades and price changes

### Popup Interface

The extension popup shows:
- **Last 20 Events**: Recent quotes and trades
- **Real-Time Prices**: Current bid/ask with spread
- **Trade Notifications**: Large trades with buy/sell direction
- **Instrument Names**: Clear identification of each stock

## 🔧 Technical Details

### Architecture

```
chrome-extension/
├── manifest.json          # Extension configuration
├── content.js            # Injects into ls-tc.de pages
├── injected.js          # Integrates with LightstreamerClient
├── background.js        # Processes events and sends alerts
├── popup.html/js        # Extension popup interface
├── options.html/js      # Configuration page
└── utils/              # Helper modules
    ├── config.js       # ISIN-based instrument lookup
    ├── alerts.js       # Notification system
    └── webhooks.js     # External integrations
```

### Key Features

- **Domain Restriction**: Only works on `https://www.ls-tc.de/`
- **Single Tab Injection**: Prevents duplicate monitoring across tabs
- **LightStreamer Integration**: Reuses existing page connections
- **Event Processing**: Real-time trade and quote analysis
- **Storage Management**: Persists configuration and recent events

## 🛠️ Development

### Building the Extension

No build process required - the extension runs directly from source files.

### Testing

1. Load the extension in developer mode
2. Open browser DevTools on any ls-tc.de page
3. Check console for extension logs:
   ```
   🔍 LS Stock Ticker content script loaded
   ✅ Monitoring 2 instruments
   📊 QUOTE update received for: NVIDIA CORP.
   ```

### Debugging

Common issues and solutions:

- **"Extension already injected"**: Close other ls-tc.de tabs
- **No events showing**: Check if instruments are configured in options
- **Console errors**: Reload the extension and refresh the page

## 📁 Project Structure

- **`/chrome-extension/`** - Chrome extension (this folder)
- **`/node-app/`** - Standalone Node.js application for server-side monitoring

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with real ls-tc.de data
5. Submit a pull request

## 🐛 Issues & Support

Report issues on [GitHub Issues](https://github.com/childscreentime/ls-stock-ticker/issues)

Include:
- Chrome version
- Extension version
- Console error messages
- Steps to reproduce

---

*Built for real-time stock monitoring on Lang & Schwarz Trading Center*
