# n8n-nodes-boostcamp

Self-hosted n8n community node for integrating with Boostcamp through an unofficial API. It does not depend on a Python runtime and implements Firebase login plus workout history normalization in TypeScript.

## Included Node

- `Boostcamp`
- `Test Auth`
- `Get Workouts`
- `Get Workout Summary`

## Included Credential

- `Boostcamp API`
- `Email + Password`
- `Token`
- `Session Cookie`
- `API Base URL` override

## Features

- Built-in Firebase email/password login
- Fetches `/programs/history`
- Normalizes workouts based on the Boostcamp Web history shape
- Weight normalization to kilograms and summary generation
- Structured warnings for partial or inferred data
- Unexpected failures raise node errors for n8n retries and error handling

## Important Notes

- This is an unofficial integration based on the Boostcamp Web implementation, not an official public API
- Behavior may change if the upstream API changes
- `sessionCookie` mode is more sensitive to service-side changes, so `token` or `emailPassword` is recommended
- If you want downstream execution after an item-level failure, use n8n's built-in `Continue On Fail`

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
