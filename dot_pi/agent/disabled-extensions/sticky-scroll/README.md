# Sticky Scroll

`sticky-scroll` is a local Pi extension that keeps the status area, widgets, editor, and footer pinned to the bottom of the terminal while rendering a scrollable message viewport above them.

It is intentionally a first-party local extension: there is no package manifest, npm installation, runtime dependency, or lifecycle script.

## Behavior

- Uses the alternate terminal screen while Pi is active.
- Keeps Pi's final five UI regions—status, above-editor widgets, editor, below-editor widgets, and footer—inside a fixed bottom pane.
- Scrolls the bounded history viewport with keyboard controls, alternate-scroll wheel input, or optional SGR mouse capture.
- Falls back to Pi's standard renderer for overlays, unknown layouts, undersized terminals, and unsafe inline-image layouts.
- Preserves inline image spans when possible and forces a full redraw when moving them.
- Displays `↑ scrolled` in the status area while history is not following the newest output.

This extension relies on Pi TUI internals, specifically the runtime `TUI.doRender()` implementation. It was validated against Pi/TUI `0.80.10`; test it after every Pi upgrade.

## Controls

| Input | Behavior |
| --- | --- |
| Mouse wheel | Scrolls message history through alternate-scroll by default. |
| `Ctrl+PageUp` / `Ctrl+PageDown` | Scroll history by `keyboardScrollRows`, even while editing. |
| `Ctrl+Home` / `Ctrl+End` | Jump to the retained history start/end. |
| `PageUp` / `PageDown` | Scroll history only when the editor is empty; otherwise leave paging to the editor. |
| `Home` / `End` | Jump history only when the editor is empty; otherwise leave navigation to the editor. |
| `/sticky-scroll on` | Enable SGR mouse-wheel capture. This captures native terminal selection and links. |
| `/sticky-scroll off` | Disable SGR mouse capture and immediately restore configured alternate-scroll behavior. |
| `/sticky-scroll status` | Show the current SGR mouse-capture status. |

### Alternate-scroll tradeoff

Terminal alternate-scroll mode encodes a wheel event as the same Up/Down sequence emitted by physical arrow keys. With the default `scrollWhileTyping: true`, both wheel movement and physical Up/Down scroll the history viewport while the editor contains text. Pi autocomplete retains Up/Down ownership while open.

Set `scrollWhileTyping` to `false` to preserve ordinary Up/Down editing whenever text exists. In that mode, wheel-derived sequences only scroll history while the editor is empty.

## Configuration

Defaults work without a config file. To override them globally, copy the example:

```sh
cp ~/.pi/agent/extensions/sticky-scroll/config/config.example.json \
  ~/.pi/agent/extensions/sticky-scroll/config.json
```

Project-local overrides live at:

```text
<project>/.pi/extensions/sticky-scroll/config.json
```

Later files override earlier ones. Relevant defaults:

```json
{
  "alternateScreen": true,
  "alternateScroll": true,
  "scrollWhileTyping": true,
  "mouseScroll": false,
  "mouseWheelScrollRows": 2,
  "keyboardScroll": true,
  "historyViewportLineLimit": 1000
}
```

`mouseWheelScrollRows` controls how many history rows each wheel event moves. The default is 2; lower it to 1 for the slowest scrolling.

`historyViewportLineLimit` is the maximum number of rendered history lines exposed to the sticky viewport. Older rendered lines are intentionally not scrollable through this extension and are represented by a truncation marker; the underlying Pi conversation is unchanged.

`debug` is off by default. When enabled, diagnostics are written only to `debug/debug.log` beside this extension. The chezmoi source's `.gitignore` excludes both runtime config and diagnostics.

## Emergency disable switches

```sh
PI_STICKY_SCROLL_DISABLE=1 pi
```

Disables the extension entirely for one invocation.

```sh
PI_STICKY_SCROLL_DISABLE_RENDERER=1 pi
```

Loads the extension but disables the sticky renderer and terminal modes, which is useful when diagnosing a renderer compatibility problem.

## Validation

The regression suite uses Pi's already-installed `jiti` and core packages; it does not install dependencies or contact npm. Set `PI_CODING_AGENT_ROOT` only if Pi is installed outside its normal managed location:

```sh
bash ~/.pi/agent/extensions/sticky-scroll/test/run.sh
```

Run it from the chezmoi source before applying with:

```sh
bash dot_pi/agent/extensions/sticky-scroll/test/run.sh
```

Then manually verify in your normal terminal:

1. Start a fresh Pi session and generate enough output to exceed one screen.
2. Scroll history with the wheel while typing in the editor.
3. Open Pi autocomplete and confirm Up/Down navigate the menu.
4. Toggle `/sticky-scroll on`, verify SGR wheel scrolling, then `/sticky-scroll off` and verify native selection plus alternate-scroll resume.
5. Resize the terminal, open/close an overlay, reload Pi, and exit Pi; confirm the normal terminal input state returns.

## Provenance and license

The implementation is adapted under the MIT license from:

- [`MasuRii/pi-sticky-input` v0.2.0](https://github.com/MasuRii/pi-sticky-input), commit `c268886cff17b68b0eee1bd77d7d42212f1e6166`
- [`EmilioAK/pi-claude-style-scroll` v0.3.3](https://github.com/EmilioAK/pi-claude-style-scroll), commit `e31a9844e3835f138c9570d6d5144c363f0834bf`

Local changes include removal of package/install machinery and legacy configuration paths, explicit renderer teardown, bounded visual history retention, preserved editor PageUp/PageDown behavior, restored alternate-scroll after mouse-capture toggling, local naming, and the emergency disable switches.

See [`LICENSES/upstream-MIT.txt`](LICENSES/upstream-MIT.txt) for the upstream MIT license and copyright notice.
