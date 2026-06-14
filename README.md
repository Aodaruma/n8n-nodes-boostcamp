# n8n-nodes-boostcamp

Boostcamp の unofficial API を self-hosted n8n から扱う community node です。Python runtime には依存せず、Firebase login と workout history 正規化を TypeScript で実装しています。

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

- Firebase email/password login を内蔵
- `/programs/history` の取得
- Boostcamp Web の履歴形状をもとにした workout 正規化
- kg 正規化と summary 生成
- structured warnings / errors
- `failOnError: false` でワークフロー継続可能

## Important Notes

- Boostcamp の公式公開 API ではなく、Web 実装を参考にした unofficial integration です
- API 仕様変更で動作が変わる可能性があります
- `sessionCookie` モードはサービス側の仕様変更に影響されやすいため、`token` または `emailPassword` を推奨します

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
