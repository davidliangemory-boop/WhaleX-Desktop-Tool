# WhaleX Observatory：动态视觉设计与来源

本次只修改展示层，不修改笔记数据库、归档、云端身份或同步算法。新主题不是把整张概念图放大平移：鲸鱼、星云、银河、轨道光束分别绘制并独立运动。

## 公开方案研究（2026-09-30）

| 参考 | 借鉴的设计方法 | 本项目实现方式 |
|---|---|---|
| React Bits Galaxy / Aurora / Light Rays | 分层粒子、鼠标平滑、时间驱动的星空与光线、柔和色彩 | 原生 Canvas 星空、缓存星云纹理、真实非对称螺旋银河、缓慢极光 |
| Aceternity UI Glowing Effect | 光照跟随指针，边缘的局部高光，而非所有卡片持续闪烁 | CSS 聚光渐变、克制边缘光、玻璃卡片 |
| Motion performance / easing guides | transform 和 opacity 优先、细微按压回弹、动态与内容层解耦 | 原生 Web Animations API 按压反馈，时间平滑视差 |
| MDN Canvas optimization | 预渲染重复元素、复用纹理、限制像素量 | 缓存银河/光晕图层、DPR 上限、低负载模式 |

原始链接：
- https://reactbits.dev/backgrounds/galaxy
- https://reactbits.dev/backgrounds/aurora
- https://reactbits.dev/backgrounds/light-rays
- https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/Galaxy/Galaxy.jsx
- https://ui.aceternity.com/components/glowing-effect
- https://motion.dev/docs/performance
- https://motion.dev/docs/easing-functions
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

这里是设计和工程方法的参考，不是直接安装以上组件，也未复制其源代码。现有项目不必为了动效迁移到 React；无新运行时依赖、无第三方 CDN、无模型或付费特效调用。鲸鱼素材沿用当前仓库资产。

## 动效编排

- 远景：星空深度漂移、低频极光、独立旋转的螺旋银河。
- 中景：曲线轨道上移动的亮点与渐隐拖尾，不是对称渐变原地旋转。
- 主体：鲸鱼从照片中裁切，躯体浮动加尾端传播形变，独立于背景；这是 2D 形变动画，不是完整 3D 骨骼模型。
- 前景：可输入便签不浮动，操作目标保持稳定；局部微光与按压反馈。
- 输入时降低背景强度和速度；轻柔、沉浸、静止三档，记住选择。
- 遵从系统减少动态；后台标签页停止动画循环；离屏主体暂停绘制；恢复时不累计时间跳跃。
- 目标桌面 60fps、低负载或移动端 30fps，上限不是性能保证，实测结果以设备为准。

## 验证

`tests/scene_browser.py` 验证时钟推进、鲸鱼与天空像素变化、静止模式、系统减少动态、页面恢复、多种宽度、记录归库及标签功能。CI 导出的截图是浏览器渲染结果。`tests/browser_smoke.py` 继续执行原来的业务与模拟云同步检查。

不能从 CI 推断真实用户电脑帧率、Windows 原生置顶体验或真实 Supabase 账号已接通。数据缓存与账户配置不因本次视觉升级改变。
