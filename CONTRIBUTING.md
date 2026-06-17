# Contributing

Thanks for taking a look at WebOps Forge.

## Development

Use Node.js 18 or newer.

```bash
npm test
npm run check
npm run pack:dry-run
```

## Design Rules

- Keep this project business-neutral.
- Do not add platform credentials, private selectors, customer data, or proprietary playbooks.
- Keep deterministic workflow execution as the normal path.
- Route CAPTCHA, security checks, and blocked states to humans instead of bypass logic.
- Add tests for new actions, drivers, workflow validation rules, and evidence behavior.

## Pull Requests

- Keep changes scoped.
- Update README or type declarations when public APIs change.
- Run `npm run check` before submitting.
