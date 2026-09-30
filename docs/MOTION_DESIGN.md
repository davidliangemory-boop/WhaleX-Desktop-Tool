# WhaleX Observatory：动态视觉与来源

本次只修改展示层，不修改笔记数据库、归档、云端身份或同步算法。鲸鱼、星云、银河、轨道光束分别绘制并独立运动，不是把概念图整体平移。

## 公开方案研究（2026-09-30）

| 参考 | 借鉴的方法 | 项目实现 |
|---|---|---|
| React Bits Galaxy / Aurora / Light Rays | 分层粒子、平滑鼠标、时间驱动的星空与光线 | 原生 Canvas 星空、缓存星云纹理、非对称螺旋银河、慢速极光 |
| Aceternity UI Glowing Effect | 指针附近的局部高光，不让全部卡片持续闪烁 | CSS 聚光渐变、克制的边缘光与玻璃卡片 |
| Motion performance / easing guides | 动画与内容分层、微小按压回弹 | 原生 Web Animations API、指数平滑视差 |
| MDN Canvas optimization | 预渲染重复元素、复用纹理、限制像素量 | 缓存银河与光晕、DPR 上限、低负载模式 |

原始链接：
- https://reactbits.dev/backgrounds/galaxy
- https://reactbits.dev/backgrounds/aurora
- https://reactbits.dev/backgrounds/light-rays
- https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/Galaxy/Galaxy.jsx
- https://ui.aceternity.com/components/glowing-effect
- https://motion.dev/docs/performance
- https://motion.dev/docs/easing-functions
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

以上是设计和工程方法的参考，未直接安装这些 React 组件或复制其源代码。没有新的运行时依赖、第三方 CDN 或付费特效接口。`web/assets/whale-isolated.webp` 从本对话用户认可的星际鲸鱼概念图中裁切、遮罩并压缩，校验 Git blob SHA 为 `9edd12e3393971c4e0e6b8b1c141edf8ae0d4b04`。黑底通过 screen 混合消除，不包含界面文字。原有图片保留作兼容回退。

## 动效与可用性

远景星空分层漂移、低频极光、独立旋转银河；轨道亮点带渐隐拖尾；鲸鱼身体缓慢浮动、尾端传播形变。鲸鱼是 **2D 形变动画，不是完整 3D 骨骼模型**。离屏缓冲区先完成形变，再整体叠加，避免分片高光接缝。

便签和输入控件保持稳定，只用微光与按压反馈。输入时降低背景强度和速度。提供沉浸、轻柔、静止三档并记住选择。系统减少动态优先；后台标签页停止循环；离屏主体暂停绘制；页面恢复不累计时间跳跃。

目标桌面 60fps、低负载或移动端 30fps，不是所有设备的性能保证。

## 验证

`tests/scene_browser.py` 检查时钟、鲸鱼与背景像素变化、静止、系统减少动态、页面恢复、多屏宽及记录归库功能。测试不放宽 CSP。CI 截图来自真实 Chromium 渲染。原业务与模拟云同步测试继续执行。

不能从 CI 推断用户电脑帧率、Windows 原生置顶效果或真实 Supabase 项目已接通。数据和账户配置不因视觉升级改变。
