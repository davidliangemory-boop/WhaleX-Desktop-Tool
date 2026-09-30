# WhaleX Desktop 0.2

Windows 桌面壳使用仓库 `web/` 作为唯一前端。旧 `dist/` 只作为历史参考保留，不再作为运行入口。

功能与首次使用见 [仓库首页](../README.md)，云同步见 [同步配置说明](../docs/SYNC_SETUP_ZH.md)。

开发：`npm install` → `npm run dev`。编译：`npm run build`。

升级沿用 `com.whalex.desktop` 标识和 `sqlite:whalex.db`。初次打开会读取旧笔记并迁移到按账号隔离的 IndexedDB，不删除原 SQLite。

Ctrl + Shift + Space 打开输入便签；Ctrl / Cmd + Enter 保存。主窗口与快速便签关闭后收进托盘；退出请用托盘菜单。

自动同步需要连接自己的 Supabase 项目。仅安装程序不会自动创建同步服务器或账号。
