# WhaleX 0.2 — 提示词与灵感工作台

[打开网页版](https://davidliangemory-boop.github.io/WhaleX-Desktop-Tool/) · [Windows 安装包构建](https://github.com/davidliangemory-boop/WhaleX-Desktop-Tool/actions/workflows/build-windows.yml) · [同步配置说明](docs/SYNC_SETUP_ZH.md)

悬浮窗是一张**能输入、能编辑、能按资料库与标签归档的便签**，不再只是只读置顶卡片。界面采用深海蓝、星光蓝鲸、玻璃卡片和奶油紫便签风格。网页和桌面共用同一套前端。

| 功能 | 网页版 | Windows 桌面版 |
|---|---|---|
| Prompt / Idea / Workflow / Todo 录入、编辑 | 支持 | 支持 |
| 资料库、标签、搜索、收藏、归档、导入导出 | 支持 | 支持 |
| 输入便签浮窗 | 浏览器支持画中画时可用；否则普通弹窗 | 原生置顶、可拖动和缩放 |
| 跨应用快捷键 | 不支持；快捷键只在网页内生效 | Ctrl + Shift + Space |
| 关闭主窗口后驻留 | 来源页面需保持打开 | 托盘驻留，菜单可彻底退出 |
| 同设备多窗口刷新 | 支持 | 支持 |
| 跨设备自动同步 | 配置 Supabase 并登录后支持 | 同一项目、同一账号登录后支持 |

**默认仍是“仅本机”。仓库没有内置云账号、密钥或已开通的同步服务器。** 发布静态网页不等于开通云同步。登录后的账号库与离线库分开；旧记录只有在主动点击“复制离线库到此账号”后才上传。

## 使用

网页直接打开上方链接，在右侧便签输入内容，选择资料库、添加标签，点击保存。浮窗入口在左侧“悬浮便签”。保存后可连续录入下一条。

桌面版：在 GitHub Actions 的 **Build WhaleX Windows** 成功记录中，下载 Artifacts 的 `WhaleX-Windows-Installer`，解压后运行 `.exe` 安装包。失败的运行没有可用安装包。快捷键 Ctrl + Shift + Space 打开输入便签；Ctrl / Cmd + Enter 保存，Escape 收起并保留草稿。若系统快捷键被其他软件占用，使用托盘菜单。

原生置顶指普通桌面窗口层级，不承诺覆盖 Windows 安全桌面、UAC、锁屏或独占全屏应用。网页画中画需浏览器支持和用户点击，关闭来源页面会失去浮窗，不等同于永久驻留的桌面便签。

跨设备同步按 [首次连接说明](docs/SYNC_SETUP_ZH.md) 配置自己的 Supabase 项目。没有 OpenAI 模型 API 调用。Supabase 的服务配额、费用和数据区域需要项目拥有者确认。

## 数据与安全

- 新数据保存在 IndexedDB，按 Supabase 项目 / 账号隔离。记录、标签和资料库共用版本化同步逻辑。
- 自动读取旧网页 `localStorage` 和旧桌面 SQLite 记录进行迁移，**不删除原数据**。应用标识仍为 `com.whalex.desktop`。原 `dist/` 只作历史参考，不再运行。
- 保存先写本机，再上传云端。断网可继续记录，重连后重试；页面打开且联网时约每 20 秒检查一次远端变化。后台标签页可能被浏览器节流；网页全部关闭时不会继续后台同步。桌面资源随安装包提供，网页离线重新打开另受浏览器缓存影响。
- 云端使用 RLS 用户隔离、服务端版本号、幂等提交及删除标记；并发编辑保留冲突副本，不悄悄覆盖。分页拉取不会只取前 1,000 条。
- 不把 `service_role` / Secret key 放进前端或 GitHub；设置页拒绝这些 key。会话保存在本机，请勿在共享设备保持登录。
- 本机缓存与 JSON 备份**不是端到端加密**。客户资料应先经过内部数据安全确认。不要把公开 GitHub 仓库用作私人笔记库。
- 导入新建副本，不覆盖原 ID。备份不包含登录会话或密钥。Word 兼容导出明确为 `.html`，不是伪装的 `.docx`。
- “归档建议”是本地关键词规则，没有接入模型，不宣称为 AI。

## 验证

```sh
npm run check
npm test
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_smoke.py
```

静态调试：`python -m http.server 8080 --directory web`。桌面编译：在 `WhaleX_Tauri_Desktop/` 执行 `npm install`、`npm run build`，需要 Rust 和 Windows 构建工具。

Actions 包含纯逻辑测试、Chromium 交互测试、PostgreSQL RLS/RPC 测试、Windows 打包和 Pages 部署。浏览器测试使用**模拟 Supabase 传输**，数据库测试使用独立 PostgreSQL，均不等于已经连接你的 Supabase。原生置顶、托盘及快捷键仍需在真实 Windows 桌面验收。测试结果以相应 Actions 记录为准。

实现说明：[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。
