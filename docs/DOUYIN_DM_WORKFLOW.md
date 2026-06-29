# Douyin DM Workflow Template

This document records the current WebOps Forge path for the requested Douyin automation chain:

```text
open Douyin -> check login state -> open DM -> find group -> read visible messages -> draft reply -> approval -> send reply
```

## Current Support

The system can support this chain as a configured workflow when these runtime requirements are met:

- A Playwright or front-Chrome profile already contains the Douyin login session.
- The DM icon, conversation list, target group, message rows, reply box, and send button have been picked or configured as selectors.
- Outbound reply sending is guarded by an `approval` step.
- CAPTCHA, phone verification, platform risk checks, and logged-out states are treated as blocked states for human recovery.

The runnable template is [examples/douyin-dm-workflow.mjs](../examples/douyin-dm-workflow.mjs). The Studio import bundle is [examples/douyin-dm-workflow.bundle.json](../examples/douyin-dm-workflow.bundle.json).

## New Generic Actions

- `checkSession`: checks an authenticated marker and optional logged-out marker. If the logged-out marker is visible, or the authenticated marker cannot be found, the run blocks as `login_required`.
- `setOutput`: writes a templated value into workflow outputs. In the Douyin template it creates `outputs.replyDraft` from `outputs.latestMessage`.

These actions are generic and can be reused for other logged-in web operations.

## Dry-Run Verification

Run:

```bash
node examples/douyin-dm-workflow.mjs
```

Expected behavior:

- The dry-run opens the fixture Douyin page.
- `checkSession` returns an authenticated session.
- The workflow extracts visible messages and latest message text.
- `setOutput` creates a reply draft.
- The approval is satisfied by `context.approvals.sendDouyinReply = true`.
- The workflow fills the reply editor and clicks the send button in dry-run only.

## Real Run Setup

1. Open Studio with `npm start`, then open `http://127.0.0.1:4177`.
2. Import `examples/douyin-dm-workflow.bundle.json`.
3. Use a dedicated Playwright profile or a controlled Chrome profile for Douyin.
4. Log in manually in that profile. Do not store passwords in workflow JSON.
5. Use the picker to replace the template selectors in `defaultRun.input`:
   - `accountSelector`
   - `loggedOutSelector`
   - `dmEntrySelector`
   - `conversationListSelector`
   - `groupSelector`
   - `messageListSelector`
   - `messageRowSelector`
   - `latestMessageTextSelector`
   - `replyBoxSelector`
   - `sendButtonSelector`
6. Keep `context.approvals.sendDouyinReply` unset or false for the first real run. The run should block at approval after extracting and drafting the reply.
7. After verifying the evidence and reply text, rerun with approval enabled to send.

## Known Boundaries

- The template does not bypass Douyin CAPTCHA, phone verification, or risk controls.
- The reply strategy is rule/template based. For LLM-based reply generation, add an `apiCall` step to a private server-side adapter before `approval`; do not put service keys in browser code or workflow JSON.
- Selectors are expected to drift on Douyin. The intended recovery path is to refresh selectors with the picker and keep the run evidence.
- The open-source package should keep credentials and private message playbooks outside reusable public examples.
