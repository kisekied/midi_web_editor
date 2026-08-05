# 织音 MIDI 编辑器

一个纯浏览器运行的 React MIDI 钢琴卷帘编辑器。支持新建或导入 Standard MIDI
File、编辑多轨音符与速度/拍号、内置合成器试听、逐轨 Web MIDI 输出、自动恢复和
`.mid` 导出。

## 环境准备

项目使用 mise 固定 Node.js 24.18.0 与 pnpm 11.18.0：

```bash
mise install
mise trust
pnpm install
```

## 开发

```bash
pnpm dev
```

访问 `http://localhost:4173`。Web MIDI 需要安全上下文；`localhost` 可用于本地开发。

## 验证

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

端到端测试首次运行前需要安装 Playwright 浏览器：

```bash
pnpm exec playwright install
pnpm test:e2e
```

## 支持范围

- 可编辑 PPQ 时基的 SMF Type 0 和 Type 1。
- Type 2、SMPTE time division 会给出明确错误。
- 首版编辑音符、力度、轨道、离散 tempo 与拍号事件。
- CC、弯音、aftertouch、SysEx 和未知 meta 会保留；除 SysEx 外的安全通道事件可发送到外接设备。
- 所有数据保存在浏览器本地；没有账号、云端或后端服务。
