# Windows 构建

## 对非程序员最简单：GitHub Actions

1. 把这个项目整个上传到 GitHub。
2. 进入 **Actions**。
3. 选择 **Build WhaleX Windows**。
4. 点 **Run workflow**。
5. 构建成功后下载 **WhaleX-Windows-Installer**。

本项目已经自带 `.github/workflows/build-windows.yml`。

## 本机打包

```powershell
npm install
npm run build
```

Windows 安装包通常会出现在：

- `src-tauri/target/release/bundle/nsis/`
- `src-tauri/target/release/bundle/msi/`
