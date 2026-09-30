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

以上是设计和工程方法的参考，未直接安装这些 React 组件或复制其源代码。没有新的运行时依赖、第三方 CDN 或付费特效接口。当前原始素材为 `whale-luminous.webp`（1400 × 597，透明通道）及 `cosmic-landscape.webp`（1672 × 941）。本次高清升级不重生成或替换素材。

## 动效与可用性

远景星空分层漂移、低频极光、独立旋转银河；轨道亮点带渐隐拖尾；鲸鱼身体缓慢浮动、尾端传播形变。鲸鱼是 **2D 形变动画，不是完整 3D 骨骼模型**。新主渲染器直接采样原始透明纹理，以连续的纹理坐标形变实现游动；不支持 WebGL 时保留原 Canvas 缓冲区实现。

便签和输入控件保持稳定，只用微光与按压反馈。输入时仅降低运动速度，保持画面亮度。提供沉浸、轻柔、静止三档并记住选择。系统减少动态优先；后台标签页停止循环；离屏主体暂停绘制；页面恢复不累计时间跳跃。

目标桌面 60fps、低负载或移动端 30fps，不是所有设备的性能保证。

## 验证

`tests/scene_browser.py` 检查时钟、鲸鱼与背景像素变化、静止、系统减少动态、页面恢复、多屏宽及记录归库功能。测试不放宽 CSP。CI 截图来自真实 Chromium 渲染。原业务与模拟云同步测试继续执行。

不能从 CI 推断用户电脑帧率、Windows 原生置顶效果或真实 Supabase 项目已接通。数据和账户配置不因视觉升级改变。


## 2026-10-01：用户授权的高清与流动升级

用户在此前“背景不可改”之后，明确要求美化背景、鲸、行星、轨道、星空及三档动效，并追加增强星空与星球流动感。新的 `tests/scene-lock.json` 记录此授权及更新后的渲染文件校验值；原素材、Hero 几何、UI 功能和 5% / 26% 记录栏继续锁定。

- 鲸：WebGL 单次原图采样、局部细节增强、双频尾部波形、轻微鳍摆与俯仰、双向体表光纹、星点闪烁、轮廓光及细粒子尾迹。没有把源图宣称为原生 4K 素材。
- 星球：按原图位置映射球面，有限角度的表面偏转、沿经纬线运动的云带及移动高光，保持轮廓和地平线；这是 2.5D 图像渲染，不是完整 3D 星球模型。
- 星空：420 个远近星点采用不同流速与视差，近景星点带短拖尾；另有 110 点椭圆星河、三层星云光带、两层独立银河及两颗错峰彗星。
- 轨道：行星环增加三组不同方向的流光脉冲；鲸周围增加双环与明暗分层，继续绕开鲸的主体细节。
- 沉浸：完整星空流动、鲸游动、云层高光、轨道和错峰彗星。轻柔：时钟约 28%、形变幅度约 30%。静止：停止整个动画循环并保留当前完整画质。系统减少动态优先。
- 画质预算：天空最高 2.25× / 840 万像素；鲸最高 3× / 360 万像素。背景纹理更新最高 36Hz（手机/低负载 24Hz），星空和鲸分别绘制；持续掉帧会降低像素预算。
- 原有暗色渐变与边缘遮罩移除；专注输入及轻柔档不再压暗整幅场景。
- GPU 上下文丢失时显示原图，恢复后重建纹理；不支持 WebGL 时保留 Canvas 动画和全部工作台功能。关闭页面释放渲染资源。

`tests/scene_hd_browser.py` 使用隔离 Chromium / SwiftShader 验证真实着色器、各层像素变化、星球表面流动、静止、减少动态、上下文恢复、手机像素预算和无 WebGL 回退。软件渲染测试不能代表用户显卡帧率。
