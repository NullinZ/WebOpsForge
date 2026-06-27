# Browser Selector Picker

WebOps Forge uses a Chrome-side picker to turn a visible page element into safe workflow node configuration.

The picker is intentionally not a simple "copy selector" tool. It captures an element identity record so browser automation can avoid acting on the wrong similar control.

## Flow

1. Run Studio on `http://127.0.0.1:4177`.
2. Load the Chrome extension from `/Users/nullin/GitHubO/WebOpsForge/apps/picker-extension`.
   When extension files change, reload the unpacked `WebOps Forge Picker` extension in `chrome://extensions`.
3. In Studio, select the relevant node, ideally the `goto` step or a browser step after it, and click `Pick Node`.
4. Studio creates a short-lived picker session with the inferred target URL from the nearest `goto`.
5. Open or switch to the page you want to pick from. The inferred URL is a reference, not an enforced match.
6. Open the `WebOps Forge Picker` extension side panel and choose the target type.
7. Click the target element in the page. To cancel an active pick, click `停止拾取` in the side panel or press `ESC`; cancellation clears the active Studio picker session as well as the extension's local active-pick state.
8. The extension posts the pick to `POST /api/picker/events`.
9. Studio automatically applies the new pick to the pending picker node, clears the picker session, and collapses the picker panel. You can also refresh picks and apply one manually in the node editor.

## Front Chrome Execution

The same extension now executes browser actions for an already-open Chrome profile after Studio hands off the target URL to the front browser. This is used when the profile is locked by normal Chrome and Playwright cannot safely take over the user data directory.

Supported executor actions include `fill`, `click`, `waitFor`, `press`, `extract`, `extractList`, `extractDetail`, and `extractMedia`. Run logs show `via: chrome-extension-executor`, selector match counts, and actual filled values when the extension completes a job.

## Element Identity

Each pick stores:

- `recommendedSelector`: the best selector for the current page.
- `selectorCandidates`: ranked fallbacks with match counts, visible counts, score, and stability.
- `targetIdentity`: stable element fingerprint used for execution-time verification.
- `pickedFrom`: page URL, title, frame URL, platform, tab id, and timestamp.

`targetIdentity` includes:

- tag name and input type.
- stable attributes such as `data-e2e`, `data-testid`, `aria-label`, `placeholder`, `name`, `role`, and `type`.
- class list as supporting evidence, not primary identity.
- short text, accessible name, associated label text, and bounding rectangle.
- match policy: minimum score, ambiguity margin, visible-element requirement, and uniqueness preference.

## Selector Priority

The bundled Chrome picker in `apps/picker-extension` ranks selectors in this order:

1. stable `data-*` attributes: `data-e2e`, `data-testid`, `data-test`, `data-cy`.
2. accessibility and form attributes: `aria-label`, `placeholder`, `name`, `role`, `type`.
3. stable id, when it does not look generated.
4. tag and stable class combinations. Short generated CSS-module/hash classes such as `div.YDoaql1z`, transient state classes, and generated ids are filtered out instead of being treated as stable selectors.
5. unique DOM path as the last fallback.

## Picker Session Scope

The extension does not guess whether the current tab is the right target page. Studio publishes the active picker request to `GET /api/picker/session`. The extension side panel stays openable on regular `http` and `https` pages so operators can recover by opening Studio from the panel, but the actual pick buttons stay disabled until an active picker session exists.

`targetUrl` and `allowedUrls` are stored as workflow context and shown as references. They are not used to hide the extension when a site redirects from one host to another, such as `douyin.com` to `www.douyin.com`.

The side panel `打开 Studio` button focuses the most recently used existing Studio tab when one is already open, preserving its current page state. It creates a new Studio tab only when no `127.0.0.1:4177` or `localhost:4177` tab exists.

## Execution Safety

For Playwright runs, steps with `targetIdentity` do not blindly execute the selector.

The driver evaluates candidate matches and scores each DOM node against the stored fingerprint. It only acts when the best visible element meets the minimum score and is not ambiguous. If the page changed enough that the identity is unclear, the run fails with a browser action error instead of clicking or filling the wrong element.

## Node Shape

Applied picks add fields like:

```json
{
  "id": "fillSearch",
  "action": "fill",
  "selector": "input[data-e2e=\"searchbar-input\"]",
  "value": "{{input.query}}",
  "targetIdentity": {
    "version": 1,
    "tagName": "input",
    "attributes": {
      "data-e2e": "searchbar-input",
      "placeholder": "搜索"
    },
    "recommendedSelector": "input[data-e2e=\"searchbar-input\"]",
    "matchPolicy": {
      "minScore": 28,
      "ambiguityMargin": 8,
      "requireVisible": true,
      "preferUnique": true
    }
  }
}
```

The stable selector remains readable, while `targetIdentity` gives the runner enough evidence to reject unsafe matches.
Front Chrome extension execution also scores selector matches against `targetIdentity`, so a stale selector candidate is not executed unless the element fingerprint still matches safely.
