# ios-sim-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI agents (Claude, Windsurf, Cursor, etc.) drive **iOS Simulators** on macOS — listing devices, launching apps, tapping, typing, swiping, reading the on-screen UI tree and taking screenshots.

The package is published as `ios-sim-mcp` and exposes the `ios-sim-mcp` binary. It talks to the simulator through two channels:

- **`xcrun simctl`** — app launch/terminate, installed-app listing, screenshots
- **[WebDriverAgent](https://github.com/appium/WebDriverAgent)** (on `localhost:8100`) — taps, swipes, key input, hardware buttons, orientation, UI element tree, opening URLs

---

## Table of contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running WebDriverAgent](#running-webdriveragent)
- [Configuring an MCP client](#configuring-an-mcp-client)
- [Available tools](#available-tools)
- [Typical agent workflow](#typical-agent-workflow)
- [Project structure](#project-structure)
- [npm scripts](#npm-scripts)
- [Error handling](#error-handling)
- [Known limitations](#known-limitations)
- [License](#license)

---

## Architecture

```
┌──────────────┐  stdio (MCP)  ┌──────────────────────┐
│  MCP client  │──────────────▶│  src/index.js        │
│ (Claude etc.)│◀──────────────│  src/server.js       │  tool registry
└──────────────┘               └─────────┬────────────┘
                                         │ Robot interface (src/robot.js)
                                         ▼
                               ┌──────────────────────┐
                               │ src/iphone-simulator │  Simctl / SimctlManager
                               └───┬──────────────┬───┘
                     xcrun simctl  │              │  HTTP (W3C WebDriver)
                                   ▼              ▼
                          ┌──────────────┐  ┌───────────────────────┐
                          │ iOS Simulator│◀─│ WebDriverAgent :8100  │
                          └──────────────┘  └───────────────────────┘
```

- `src/index.js` starts the MCP server over a stdio transport.
- `src/server.js` registers every tool and holds the currently selected device ("robot").
- `src/robot.js` documents the Robot interface every device controller implements, plus shared constants (`ORIENTATIONS`, `BUTTONS`, `SWIPE_DIRECTIONS`) and `ActionableError`.
- `src/iphone-simulator.js` implements the Robot interface for iOS Simulators (`Simctl`) and discovers simulators (`SimctlManager`).
- `src/webdriver-agent.js` is a small WebDriverAgent HTTP client. Each call opens a WDA session, runs the request and deletes the session.
- `src/png.js` / `src/image-utils.js` validate PNG screenshots and optionally downscale/convert them via ImageMagick.

For detailed diagrams, API contracts (MCP, WebDriverAgent HTTP, `simctl`), connection types and request flows, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Requirements

| Requirement | Notes |
|---|---|
| macOS | Simulator discovery returns nothing on other platforms. |
| Xcode + Command Line Tools | Provides `xcrun simctl` and the iOS Simulator. |
| Node.js ≥ 18 | Uses the built-in `fetch` API. |
| WebDriverAgent | Must be running on the simulator, reachable at `http://localhost:8100`. |
| ImageMagick 7 (optional) | If `magick` is on `PATH`, screenshots are resized and converted to JPEG (quality 75) to shrink the payload. `brew install imagemagick` |

## Installation

```bash
git clone https://code.devsnc.com/harish-dewangan/ios-sim-mcp.git
cd ios-sim-mcp
npm install
```

Boot a simulator (via Xcode → Open Developer Tool → Simulator, or):

```bash
xcrun simctl list devices          # find a device UDID
xcrun simctl boot <UDID>
open -a Simulator
```

## Running WebDriverAgent

Most tools (everything except app listing/launch/terminate and screenshots) need WebDriverAgent. One way to run it on a booted simulator:

```bash
git clone https://github.com/appium/WebDriverAgent.git
cd WebDriverAgent
xcodebuild -project WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,id=<UDID>" \
  test
```

Verify it is up:

```bash
curl http://localhost:8100/status
```

The host and port (`localhost:8100`) are hard-coded in `src/iphone-simulator.js` (`WDA_PORT`).

## Configuring an MCP client

The server speaks MCP over stdio. Point your client at `src/index.js`:

```json
{
  "mcpServers": {
    "ios-sim-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/ios-sim-mcp/src/index.js"]
    }
  }
}
```

- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Code:** `claude mcp add ios-sim-mcp -- node /absolute/path/to/ios-sim-mcp/src/index.js`
- **Windsurf / Cursor:** add the same block to the editor's MCP config.

To run it standalone (e.g. for debugging with the MCP Inspector):

```bash
npm start
# or
npx @modelcontextprotocol/inspector node src/index.js
```

## Available tools

| Tool | Parameters | Description |
|---|---|---|
| `mobile_list_available_devices` | `_unused: string` (ignored) | Lists **booted** iOS simulators by name. |
| `mobile_use_device` | `device: string`, `deviceType: "simulator"` | Selects the simulator for all later calls. **Pass the simulator UDID** (see [limitations](#known-limitations)). |
| `mobile_list_apps` | — | Lists installed apps as `name (bundle id)`. |
| `mobile_launch_app` | `packageName: string` | Launches an app by bundle id (`xcrun simctl launch`). |
| `mobile_terminate_app` | `packageName: string` | Terminates an app by bundle id. |
| `mobile_get_screen_size` | — | Returns screen size in points via WDA. |
| `mobile_click_on_screen_at_coordinates` | `x: number`, `y: number` | Taps at the given coordinates. |
| `mobile_list_elements_on_screen` | — | Returns visible UI elements (TextField, Button, Switch, Icon, SearchField, StaticText, Image, WebView…) with rect, label/name and WDA attributes. |
| `mobile_press_button` | `button: string` | `HOME`, `VOLUME_UP`, `VOLUME_DOWN`, or `ENTER` (sent as `\n`). |
| `mobile_open_url` | `url: string` | Opens a URL on the device via WDA. |
| `swipe_on_screen` | `direction: "up" \| "down"` | Vertical swipe between y=200 and y=600 at x=200. |
| `mobile_type_keys` | `text: string`, `submit: boolean` | Types into the focused element; presses Enter if `submit` is true. |
| `mobile_take_screenshot` | — | Returns the screenshot as an image and saves a copy to disk (see `OUTPUT_DIR`). |
| `mobile_set_orientation` | `orientation: "portrait" \| "landscape"` | Rotates the device. |
| `mobile_get_orientation` | — | Returns the current orientation. |

All tools except `mobile_list_available_devices` and `mobile_use_device` require a device to be selected first.

## Typical agent workflow

1. `mobile_list_available_devices` — see what's booted.
2. `mobile_use_device` — select a simulator (by UDID).
3. `mobile_launch_app` — e.g. `com.apple.mobilesafari`.
4. `mobile_list_elements_on_screen` and/or `mobile_take_screenshot` — understand the UI.
5. `mobile_click_on_screen_at_coordinates` / `mobile_type_keys` / `swipe_on_screen` — interact.
6. Repeat 4–5, then `mobile_terminate_app`.

Example prompt to an agent:

> Open Safari on the booted iPhone simulator, go to example.com and take a screenshot.

## Project structure

```
.
├── src/
│   ├── index.js            # Entry point: MCP server over stdio
│   ├── server.js           # Tool definitions and device selection
│   ├── robot.js            # Robot interface docs, constants, ActionableError
│   ├── iphone-simulator.js # Simctl (Robot impl) + SimctlManager (discovery)
│   ├── webdriver-agent.js  # WebDriverAgent HTTP client
│   ├── png.js              # PNG signature / dimension parsing
│   └── image-utils.js      # ImageMagick-based resize / JPEG conversion
├── examples/               # (currently empty)
├── package.json
├── LICENSE
├── ARCHITECTURE.md
└── README.md
```

## npm scripts

| Script | Command | Notes |
|---|---|---|
| `start` | `chmod +x src/index.js && node src/index.js` | Runs the MCP server on stdio. |
| `lint` | `eslint .` | No ESLint config file is present in the repo yet. |
| `test` | `nyc mocha test/*.js` | No `test/` directory exists yet. |
| `clean` | `rm -rf lib` | |
| `prepare` | `husky` | Runs on `npm install`; no `.husky/` hooks are committed. |

## Error handling

Tools are wrapped so that:

- An **`ActionableError`** (e.g. "No device selected", "WebDriverAgent is not running on simulator", unsupported button) is returned as plain text ending in *"Please fix the issue and try again."* so the agent can self-correct.
- Any other exception is returned with `isError: true` and the message `Error: <message>`.

## Known limitations

These reflect the current code and are worth knowing before relying on the server:

- **iOS Simulator only.** No Android or physical iOS device support; `deviceType` only accepts `"simulator"`.
- **Device name vs. UDID.** `mobile_list_available_devices` returns simulator *names*, but `mobile_use_device` passes its argument straight to `xcrun simctl` as the device identifier. Supply the UDID (from `xcrun simctl list devices`); `booted` may also work when a single simulator is running.
- **Hard-coded screenshot directory.** `OUTPUT_DIR` in `src/server.js` is set to `/Users/harish.dewangan/Documents/ios-demo/`. Change it for your machine. Files are always saved with a `.png` extension, even when ImageMagick has converted them to JPEG.
- **stdout logging.** Several tools use `console.log`, which writes to stdout — the same stream the stdio MCP transport uses. Some clients may report protocol/parse errors because of this; switching those calls to `console.error` avoids it.
- **`mobile_list_apps` parsing.** The regexes in `Simctl.parseIOSAppData` use `\\s` inside regex literals, which matches a literal backslash rather than whitespace, so app listing may return an empty list.
- **Swipe** supports only `up`/`down` with fixed coordinates, regardless of screen size.
- **WebDriverAgent** location is fixed at `localhost:8100`, and a new WDA session is created per call (slower, but stateless).
- **`zod`** is imported by `src/server.js` but not declared in `package.json`; it currently resolves as a transitive dependency of `@modelcontextprotocol/sdk`.

## License

[MIT](LICENSE) © 2026 harishdk522
