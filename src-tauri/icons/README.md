# アイコン

`tauri build`(MSI/NSIS インストーラ作成)にはアイコンが必要です。
1枚の正方形 PNG(1024×1024 推奨)を用意し、リポジトリのルートで次を実行すると、
このフォルダに必要な全形式(`.ico` / `.png` 各サイズ / `.icns`)が生成されます。

```bash
npm run tauri icon path/to/icon.png
```

生成されるまで `tauri.conf.json` の `bundle.icon` が参照する
`32x32.png` / `128x128.png` / `icon.ico` は存在しません。
`tauri dev`(開発実行)はアイコン無しでも動作します。
