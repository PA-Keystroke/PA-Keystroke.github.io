# PA Keystroke Website

PA Keystroke 的中文官网，使用纯静态 HTML、CSS 和 JavaScript 构建，部署在 GitHub Pages。

## 页面

- `index.html`：Apple 式产品首页，只保留核心介绍和入口
- `features.html`：功能与适用场景
- `demo.html`：键盘和手柄演示视频
- `download.html`：下载、版本和运行要求
- `wiki.html`：完整的站内 Wiki
- `404.html`：GitHub Pages 的 404 页面

## 本地预览

在仓库根目录运行：

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。

## 资源目录

- `assets/brand`：发行仓库中的图标和文字标识
- `assets/fonts`：应用内 LetsParty 字体，包含网站所需中英文子集
- `assets/screenshots`：官网使用的界面截图
- `assets/videos`：键盘与手柄演示视频
- `assets/vendor`：本地化的 Lucide 图标库

## GitHub Pages

仓库提交并推送到 GitHub 后，在仓库的 `Settings > Pages` 中选择：

- Source：`Deploy from a branch`
- Branch：推送后的默认分支（例如 `main` 或 `master`）
- Folder：`/(root)`

默认访问地址：

`https://pa-keystroke.github.io/PA-Keystroke-Web/`
