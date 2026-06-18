# アイコン

Kura のブランドアイコン(蔵 = 書類を収める蔵)を生成済みです。
`tauri.conf.json` の `bundle.icon` が参照する `32x32.png` / `128x128.png` /
`icon.ico` はこのフォルダにコミットされています。

マスター素材は `icon-source-1024.png`(1024×1024)です。デザインを変更したい
場合は、リポジトリの SVG(`app/icon.svg` / `public/logo-mark.svg`)を編集し、
リポジトリのルートで次を実行すると全形式を再生成できます。

```bash
npm run tauri icon src-tauri/icons/icon-source-1024.png
```

`tauri dev`(開発実行)はアイコン無しでも動作します。
