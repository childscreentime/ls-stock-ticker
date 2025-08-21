# LS Stock Ticker Chrome Extension

A Manifest V3 Chrome extension that replicates the behavior of the LS Stock Ticker app with real-time alerting capabilities.

## Features

### Core Functionality
- **Background Tab Management**: Opens and maintains pinned tabs for each instrument in your watchlist
- **Real-time Data Streaming**: Intercepts Lightstreamer WebSocket connections to capture live stock data
- **Event Normalization**: Converts raw Lightstreamer messages into structured events
- **Multi-instrument Support**: Monitor multiple stocks simultaneously

### Alerting System
- **Configurable Alert Rules**: Set thresholds and conditions per instrument
- **Trade Alerts**: Large trades, aggressive trades, volume thresholds
- **Quote Alerts**: Spread analysis and price movements
- **Price Thresholds**: Upper and lower price alerts
- **Smart Cooldowns**: Prevents notification spam

### External Integrations
- **Discord Webhooks**: Send formatted alerts to Discord channels
- **Telegram Bots**: Push notifications to Telegram chats
- **Generic Webhooks**: Support for custom webhook endpoints

### User Interface
- **Popup Interface**: Quick view of recent events and alert toggles
- **Options Page**: Comprehensive configuration for watchlist, alerts, and webhooks
- **Real-time Status**: Monitor tab health and connection status

## Installation

1. Download or clone this extension directory
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon should appear in your toolbar

## Configuration

### Setting Up Your Watchlist

1. Click the extension icon and select "Options" (⚙️)
2. In the "Watchlist Configuration" section, enter an ISIN (e.g., `US67066G1040` for NVIDIA)
3. Click "Add Instrument" - the extension will lookup the instrument details
4. The instrument will be added to your watchlist and a background tab will be created

### Configuring Alerts

For each instrument in your watchlist, you can configure:

- **Trade Alerts**:
  - Minimum notional value (EUR) for large trade alerts
  - Volume threshold (shares) for high-volume alerts
  - Aggressive trade highlighting (buy/sell at bid/ask)

- **Quote Alerts**:
  - Enable/disable quote change notifications
  - Spread analysis alerts

- **Price Thresholds**:
  - Upper price threshold for breakout alerts
  - Lower price threshold for breakdown alerts

### Setting Up Webhooks

1. Go to Options → Webhook Configuration
2. Enable webhooks and select your platform:
   - **Discord**: Requires webhook URL
   - **Telegram**: Requires bot token and chat ID
   - **Generic**: Custom JSON webhook endpoint

3. Test your webhook configuration with the "Test Webhook" button

## Event Structure

The extension generates normalized events with this structure:

```javascript
{
  type: "LS_EVENT",
  wkn: "918422",              // German WKN identifier
  name: "NVIDIA CORP. DL-,001", // Instrument name
  item: "43763@1",            // Lightstreamer item ID
  event: {
    kind: "QUOTE" | "TRADE",  // Event type
    bid: 151.18,              // Bid price (quotes)
    ask: 151.24,              // Ask price (quotes)
    price: 151.42,            // Trade price (trades)
    size: 100,                // Volume in shares
    ts: 1629567890000,        // Timestamp in epoch milliseconds
    side: "buy"|"sell"|"mid"  // Trade direction
  }
}
```

## Architecture

### Components

1. **Background Service Worker** (`background.js`)
   - Manages pinned tabs for each watchlist instrument
   - Processes events from content scripts
   - Handles alerting logic and notifications
   - Manages webhook integrations

2. **Content Script** (`content.js`)
   - Injects LightstreamerClient integration script into ls-tc.de pages
   - Extracts instrument context from page (WKN, name, ID)
   - Relays events to background service

3. **Injected Script** (`injected.js`)
   - Runs in page context to detect existing LightstreamerClient
   - Creates additional subscriptions for our monitoring
   - Implements trade direction analysis (same logic as original app)
   - Dispatches normalized events to content script

4. **Utility Modules** (`utils/`)
   - `config.js`: Configuration management and storage
   - `alerts.js`: Alert rule evaluation and cooldown management
   - `webhooks.js`: External notification handling

### Data Flow

```
ls-tc.de LightstreamerClient → Injected Script → Content Script → Background Service → Alerts/Webhooks
```

### Integration Method

Unlike fragile WebSocket interception, this extension:
- **Detects existing LightstreamerClient** on the page
- **Creates additional subscriptions** using the same client
- **Reuses exact logic** from the original Node.js app
- **No protocol parsing** or WebSocket manipulation needed

## Browser Permissions

The extension requires these permissions:

- `storage`: Save configuration and alert rules
- `alarms`: Periodic tab health checks
- `notifications`: Chrome desktop notifications
- `tabs`: Manage background tabs for instruments
- `activeTab`: Access to current tab for content injection
- `host_permissions`: Access to ls-tc.de domains

## Development

### Building

No build step required - this is a pure JavaScript extension.

### Testing

1. Load the extension in Developer Mode
2. Check the background service worker console for logs
3. Use the popup interface to monitor events
4. Test webhooks through the options page

### Debugging

- Background service logs: `chrome://extensions/` → Extension details → Inspect views: background page
- Content script logs: Browser DevTools console on ls-tc.de pages
- Storage inspection: Chrome DevTools → Application → Storage → Extension storage

## Limitations

- **ls-tc.de Dependency**: Only works with Lightstreamer streams from ls-tc.de
- **Chrome Only**: Manifest V3 is Chrome-specific
- **Rate Limits**: Webhook delivery is rate-limited to prevent spam
- **Tab Management**: Background tabs may be discarded by Chrome's memory management

## Troubleshooting

### No Events Received
1. Check that background tabs are created for your instruments
2. Verify tabs are not discarded (look for 🟡 status in popup)
3. Ensure LightstreamerClient is detected on the page
4. Check browser console for LightstreamerClient integration logs

### Alerts Not Working
1. Verify alert rules are enabled in options
2. Check cooldown periods (1 minute by default)
3. Ensure notification permissions are granted

### Webhook Failures
1. Test webhook configuration in options
2. Check rate limits (30 requests/minute)
3. Verify webhook URL and authentication tokens

### LightstreamerClient Not Found
1. Ensure you're on a valid ls-tc.de instrument page
2. Wait for page to fully load before checking
3. Check if LightstreamerClient is properly initialized on the page

## License

This extension is provided as-is for educational and personal use. Please respect ls-tc.de's terms of service and rate limits.
