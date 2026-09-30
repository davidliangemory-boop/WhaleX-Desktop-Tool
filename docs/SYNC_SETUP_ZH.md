# 第一次打开自动同步

右上角显示“仅本机”时，记录不会出现在另一台设备。先完成一次配置，再日常自动同步。

## 一次性配置

1. 登录自己的 Supabase 账号，新建项目。服务配额、费用和数据区域请自行确认，不需要把数据库密码发给别人。
2. 进入 **SQL Editor → New query**，复制仓库 `supabase/schema.sql` 全文并点击 **Run**。这会建立记录表、用户隔离和版本冲突处理函数，不删除其他业务表。**不要在真实项目运行 tests/postgres_bootstrap.sql，它仅供测试环境使用。**
3. 在项目设置 / Connect / API Keys 找到 **Project URL** 与 **Publishable key**。旧项目可用 `anon` key；不要使用 Secret 或 service_role key。
4. Authentication 中启用 Email，把 Site URL 设为 `https://davidliangemory-boop.github.io/WhaleX-Desktop-Tool/`。注册确认邮件受邮件服务设置和配额影响；收不到时检查邮件配置，或由项目拥有者在 Authentication → Users 添加账号。个人自用可在创建好账号后关闭公众注册。
5. 打开 WhaleX → **设置与同步**，填写网址和公开客户端 key，点击 **保存连接配置**。随后注册、确认邮箱并登录，或直接登录已有账号。
6. 在其他设备或桌面版重复第 5 步，使用同一个项目、同一个账号。

## 旧数据

登录后进入独立账号库，旧离线记录不会自动上传。需要迁移时点 **复制离线库到此账号** 并确认。只需做一次，重复会生成副本。操作前建议退出账号，在离线库导出 JSON 备份。

## 状态含义

- **仅本机 / 未连接云端**：尚未开启跨设备同步。
- **正在同步**：正在提交或读取记录。
- **已同步**：当前设备本轮保存和读取成功；不代表其他设备也已经完成拉取。
- **离线 / 等待同步**：内容仍在本机，联网后继续。
- **冲突副本**：两台设备都改了同一条，两份文字均保留，人工选择。
- **云端数据表尚未配置**：还没运行 schema.sql，或连接了另一个项目。
- **登录已失效**：重新登录，不要删除本地数据库。

保存后自动尝试同步，页面打开时约每 20 秒检查一次；后台标签页可能节流，关闭所有网页后不会继续网页后台同步。草稿只留本机，保存成记录后才进入同步队列。

没有自动抓取 ChatGPT 对话、剪贴板或电脑文件的功能，也没有模型调用。本版本不是端到端加密产品，项目拥有者可以管理数据库；本机缓存和备份应自行保护。

官方资料：
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/secure-data
- https://supabase.com/docs/guides/auth/passwords
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture/
