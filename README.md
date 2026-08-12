# 织音 · ZHIYIN MIDI

织音是一个本地优先、纯浏览器运行的多轨 MIDI 钢琴卷帘编辑器。它可以新建或导入
Standard MIDI File，在浏览器里编辑、试听并导出 `.mid` 或 `.musicxml` 文件，不需要账号、后端
服务或上传作品。

## 功能概览

- 导入、拖放和导出 SMF Type 0 / Type 1 文件，并可将乐曲导出为 MusicXML 4.0。
- 在钢琴卷帘中创建、选择、框选、移动、缩放、复制、粘贴和删除音符。
- 编辑音符的起始 tick、时值、音高与力度，支持网格吸附和所选音符量化。
- 管理多条音乐轨：重命名、增删、静音、独奏、设置默认通道和 GM 音色。
- 使用 Tone.js 内置合成器试听，或把每条轨道单独路由到 Web MIDI 输出设备。
- 在播放栏调整或静音内置合成器总音量，音量偏好会保存在当前浏览器中。
- 播放、暂停、停止、拖动播放头和循环播放，并在播放时自动跟随播放头。
- 编辑离散速度与拍号事件，支持 1/4 至 1/32 以及三连音吸附。
- 提供最多 200 步撤销/重做历史，自动恢复最近一次本地会话。
- 支持浅色与深色主题；首次访问跟随系统，手动选择后记住偏好。

## 快速开始

项目使用 [mise](https://mise.jdx.dev/) 固定开发工具版本：

- Node.js 24.18.0
- pnpm 11.18.0

安装并信任项目工具，然后安装依赖：

```bash
mise install
mise trust
pnpm install
```

启动开发服务器：

```bash
pnpm dev
```

访问 <http://localhost:4173>。项目不会依赖全局安装的 Node.js 或 pnpm。

## 使用方式

1. 在欢迎页创建一个 `120 BPM`、`4/4`、`480 PPQ` 的空白项目，或选择/拖入
   `.mid`、`.midi` 文件。
2. 在左侧选择轨道并设置名称、默认 MIDI 通道、GM 音色以及输出目标。
3. 双击钢琴卷帘空白处创建音符；拖动音符可移动，拖动右侧手柄可修改时值。
4. 在底部力度区拖动柱形修改 velocity；选中音符后也可直接输入 tick、时值等属性。
5. 使用播放控制试听，按需设置吸附、量化、缩放、速度、拍号和循环范围。
6. 点击“导出”并选择 MIDI 或 MusicXML；也可按 `Command/Ctrl+S` 直接下载 MIDI 文件。

Type 0 文件只有一条物理轨道。向 Type 0 项目新增轨道时，编辑器会先请求确认，再将
项目转换为 Type 1。

## 常用操作与快捷键

| 操作 | 鼠标或快捷键 |
| --- | --- |
| 播放 / 暂停 | `Space` |
| 导出 MIDI | `Command/Ctrl+S` |
| 撤销 | `Command/Ctrl+Z` |
| 重做 | `Command/Ctrl+Shift+Z` |
| 选择当前轨全部音符 | `Command/Ctrl+A` |
| 复制 / 粘贴 | `Command/Ctrl+C` / `Command/Ctrl+V` |
| 删除所选音符 | `Delete` 或 `Backspace` |
| 按吸附网格左右移动 | `←` / `→` |
| 上下移动一个半音 | `↑` / `↓` |
| 上下移动一个八度 | `Shift+↑` / `Shift+↓` |
| 增减选择 | `Shift`、`Command` 或 `Ctrl` + 单击 |
| 框选音符 | 在卷帘空白处拖动 |
| 设置播放位置 | 单击时间标尺或拖动播放头 |
| 设置循环范围 | 按住 `Shift` 在时间标尺上拖动 |

复制会保留音符之间的相对位置、时值、力度和 MIDI 通道。粘贴默认紧跟最近一次音符
编辑的结束位置；连续粘贴会继续向后推进，并避开同音高、同通道的重叠音符。如果当前
会话还没有编辑过音符，粘贴位置会回退到吸附后的播放头。

## MIDI 支持范围

### 支持

- 使用 PPQ 时基的 SMF Type 0 和 Type 1。
- 音符、力度、轨道名称、默认通道、Program Change、速度与拍号事件。
- MusicXML 4.0 导出会保留音乐轨、音高、起始位置、时值、力度、GM 音色、速度与拍号；
  和弦、重叠音符及跨小节音符会分别转换为和弦、多声部及延音线。
- 导入文件中的 CC、弯音、aftertouch、SysEx、文本及其他 meta 事件会作为透传事件保留，
  并在导出时按原顺序重新写入。
- 可安全转换为通道消息的透传事件会发送到外接 MIDI 输出；SysEx 不会发送。
- 无法配对、零时值、逆序或同键重叠的导入音符会显示警告，并尽可能原样保留。

### 当前限制

- 不支持 SMF Type 2 和 SMPTE time division；导入时会显示明确错误。
- 界面目前只直接编辑音符、velocity、轨道属性、速度与拍号；其他 MIDI 事件仅透传。
- MIDI 透传事件（如 CC、弯音、SysEx 和文本）不会写入 MusicXML。
- 内置合成器用于预听，不模拟完整的 General MIDI 音源；GM 音色设置主要面向外接设备。
- 不包含音频轨道、实时 MIDI 录制、乐谱视图、云同步或协作功能。
- Web MIDI 取决于浏览器支持，并要求安全上下文；本地开发可使用 `localhost`。
  编辑器请求的 MIDI 权限不包含 SysEx。
- 播放栏总音量只作用于内置合成器，不会改变外接 MIDI 设备的音量。

## 本地数据与文件安全

会话快照保存在浏览器的 IndexedDB 中，主题偏好保存在本地存储中。编辑器会在启动时
恢复最近一次会话，并在内容变化后自动保存。如果自动保存失败，页面会提示立即导出。

新建项目或导入其他文件会替换当前文档；存在未导出修改时，编辑器会先提供导出、放弃
或取消选项。所有处理都在浏览器本地完成，但浏览器数据不是长期备份，重要作品请及时
导出 `.mid` 文件。

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 在 `http://localhost:4173` 启动 Vite 开发服务器 |
| `pnpm check` | 运行 Biome 格式和 lint 检查 |
| `pnpm check:fix` | 应用 Biome 的安全修复 |
| `pnpm typecheck` | 运行严格 TypeScript 检查，不生成文件 |
| `pnpm test` | 单次运行 Vitest 单元测试 |
| `pnpm test:watch` | 以监听模式运行 Vitest |
| `pnpm test:e2e` | 在 Chromium、Firefox 和 WebKit 中运行 Playwright 测试 |
| `pnpm build` | 类型检查并生成生产构建到 `dist/` |

首次运行端到端测试前安装 Playwright 浏览器：

```bash
pnpm exec playwright install
pnpm test:e2e
```

提交改动前建议执行：

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

## 技术栈

- React 19 + TypeScript 7
- Vite 8 + Tailwind CSS 4
- Zustand + Immer
- Tone.js
- `midi-file`
- Vitest + Playwright
- Biome

## 项目结构

```text
src/
├── audio/       # Tone.js 播放引擎、MIDI 消息与 Web MIDI 适配
├── components/  # 编辑器界面与交互组件
├── domain/      # MIDI 文档模型、编辑命令和时间计算
├── midi/        # SMF 编解码、Web Worker 与客户端边界
├── state/       # Zustand 编辑器状态和 IndexedDB 会话持久化
├── App.tsx      # 应用编排、文件流与全局快捷键
└── main.tsx     # 浏览器入口
e2e/             # Playwright 用户流程测试
public/          # 静态资源
```
