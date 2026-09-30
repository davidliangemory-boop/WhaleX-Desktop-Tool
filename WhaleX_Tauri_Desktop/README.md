# WhaleX Desktop — Tauri 2 MVP

这是 WhaleX 的 **Tauri 2 桌面版源码包**，不是普通 HTML 演示。

## 已经落地的桌面能力

- **Windows 原生桌面 App 架构**：Tauri 2 + Rust + 原生 WebView。
- **SQLite 本地数据库**：笔记、资料库、标签状态、Sticky 状态全部本地保存。
- **全局快捷键 `Ctrl + Shift + Space`**：无论正在 Word、Chrome、Excel 还是其他程序里，都可以呼出 Quick Capture。
- **真正的 Always-on-top Sticky**：每条桌面便签是独立 Tauri 原生窗口，默认 `always_on_top = true`。
- **主动最小化**：点 `—` 后才最小化；工作台可以恢复。
- **主动收起**：点 `×` 只是取消桌面展示，内容仍留在原资料库。
- **系统托盘**：左键回到 WhaleX；菜单可以打开 WhaleX、快速记录、退出。
- **工作台与 Sticky 共用同一条 SQLite 数据**。
- **TXT 导出**：导出到 `Documents/WhaleX Exports/`。
- 默认中文；前端已保留中英切换入口。

## UI 结构

这版不再使用死板三栏。主工作台改成：

**左侧 TickTick 式导航 + 中央动态 WhaleX Core + 六个能力节点 + 底部流动卡片 + 右侧悬浮 Sticky / Today 模块 + 需要时才出现的编辑 Inspector。**

整体视觉按你提供的“中心智能核心 + 发光连接节点 + 悬浮模块”方向重构。

## 最省事的 Windows 打包方式（推荐）

你不需要自己安装 Rust。把整个文件夹上传到 GitHub 后：

1. 打开 GitHub 仓库的 **Actions**。
2. 选择 **Build WhaleX Windows**。
3. 点击 **Run workflow**。
4. 等待完成。
5. 在该次运行页面底部的 **Artifacts** 下载 `WhaleX-Windows-Installer`。

里面会包含 Tauri 生成的 Windows 安装包（NSIS `.exe` / MSI，具体取决于构建环境）。

## 本地开发

需要：Node.js、Rust stable、Windows WebView2 与 Visual Studio C++ Build Tools。

```bash
npm install
npm run dev
```

打安装包：

```bash
npm run build
```

## 数据位置

SQLite 使用 `sqlite:whalex.db`，由 Tauri SQL 插件管理，路径位于应用数据目录。

## 下一阶段建议

当前是可运行的 Desktop MVP。下一步优先补：

1. DOCX / Markdown / JSON 高级导出。
2. Sticky 的位置和尺寸持久化。
3. 自动标题 / 自动标签 / 自动归库。
4. Library 多层级（类似滴答清单的文件夹 / 清单）。
5. 全文搜索索引与相似笔记。
6. 开机自启与 Windows 签名。
