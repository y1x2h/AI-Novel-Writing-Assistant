# 桌面端跨平台打包（Windows / macOS）

## Background

桌面端最初的打包链路只面向 Windows：`electron-builder.config.cjs` 只声明了 `win`、`nsis`、`portable`，`run-electron-builder.cjs` 无条件修补 electron-builder 的 NSIS 模板并校验 Windows 签名材料，`verify-desktop-package.cjs` 只认 `win-unpacked/resources`，图标集也只提供 `.ico`。

这些写死的假设叠加在一起，导致 macOS 上既无法产出安装包，也无法复用同一套 staging 与校验流程。桌面端的本地服务依赖 Prisma 引擎和 `better-sqlite3` 两个原生模块，它们的二进制与构建机架构绑定，因此不能简单地用 Windows 产物交叉产出 macOS 包。

## Decision

打包链路按“目标平台”分流，而不是继续堆 Windows 特例：

- 目标平台由 CLI 参数推断（`--win` / `--mac` / `--linux`），没有显式参数时回退到当前运行平台。
- 只有 Windows 目标才会执行 NSIS 模板修补、NSIS 模板镜像和 Windows 签名门禁。
- macOS 目标使用 `dmg` + `zip`，只产出 Apple Silicon（`arm64`）。
- macOS 默认不签名，`mac.identity = null` 且关闭 `hardenedRuntime`；只有显式提供签名材料时才启用签名与强化运行时。
- 校验脚本按平台解析产物目录，而不是固定 `win-unpacked`。
- macOS 的窗口生命周期遵循平台习惯：关闭全部窗口不退出进程，dock 激活时重建主窗口。

这样做的原因是：Windows 的签名与 NSIS 规则是发布合规要求，macOS 本期只需要本机可用的安装包；把两者拆开可以让 Windows 发布流程保持不变，同时不再让 macOS 构建被 Windows 专属步骤阻塞。

## Current Rule

- 打包必须在目标平台上执行。macOS 包要在 macOS 上打，Windows 包要在 Windows 上打，因为 Prisma 引擎与 `better-sqlite3` 是架构相关的原生模块，`stage-desktop.cjs` 使用的是构建机本地依赖。
- `desktop/scripts/run-electron-builder.cjs` 在**所有平台**上都会执行 `ensurePatchedElectronBuilder()`。这个 patch 才是 `AI_NOVEL_EB_FORCE_TRAVERSAL` 生效的前提（它把 `appFileCopier` 的 `pmApproaches` 改成只使用依赖遍历收集器）。只有 NSIS 模板镜像和 Windows 签名门禁按平台区分。
- 不要用 `files` 里的 `node_modules/**` 模式去补依赖文件。electron-builder 永远不会遍历应用根目录下的 `node_modules`（`createFilter` 对 `relative === "node_modules"` 直接返回 false），这类模式是死配置；真正进入包内的 node_modules 只来自依赖收集器。
- 依赖收集器必须能在 `desktop/build/app` 上成功，否则会回退到仓库根目录收集，产出“看起来能打包、运行时却缺依赖”的错误包。
- `desktop/electron-builder.config.cjs` 中的目标平台由 `process.argv` 推断；Windows 的“非 beta 通道必须有签名材料”门禁只在 Windows 目标生效。
- `desktop/scripts/run-electron-builder.cjs` 只在 Windows 目标下修补 NSIS 模板并注入 `AI_NOVEL_EB_NSIS_TEMPLATES_DIR`；其他平台跳过并打印说明。
- macOS 图标来源是 `desktop/builder/app-icon.icns`，由 `desktop/scripts/generate-desktop-icons.py` 生成，包含 32 / 64 / 128 / 256 / 512 / 1024 六个位图尺寸（覆盖 `ic07`–`ic14` 表示）。
- macOS 窗口图标在运行态使用 `app-icon.png`（`resolveDesktopWindowIcon` 按 `process.platform` 选择），Dock 图标由应用包内的 `.icns` 决定。
- Windows 签名材料读取 `CSC_LINK` / `WIN_CSC_LINK` / `AI_NOVEL_WINDOWS_CSC_*`；macOS 签名材料读取 `MAC_CSC_LINK` / `AI_NOVEL_MAC_CSC_*`。没有 macOS 签名材料时使用 ad-hoc 签名（`identity: "-"`）而不是完全跳过签名：Apple Silicon 要求可执行文件至少带有效签名，否则应用无法启动。
- macOS 目标产出 `dmg` 与 `zip`（`zip` 供 `electron-updater` 使用），只支持 `arm64`。
- `verify-desktop-package.cjs` 按平台选择 unpacked 目录（macOS 为 `mac-arm64`）与资源根目录（macOS 为 `<App>.app/Contents/Resources`）。
- macOS 运行态在 `window-all-closed` 不退出，`activate` 事件复用已启动的本地服务端口重建主窗口。

## Examples

```bash
# macOS：完整构建并产出 dmg + zip（Apple Silicon）
pnpm dist:desktop:mac

# macOS：复用已 staging 的应用目录
pnpm dist:desktop:mac:reuse-stage

# macOS：只产出 dmg
pnpm dist:desktop:dmg

# macOS：打包布局校验（不产出安装包）
pnpm verify:desktop-package:mac
pnpm verify:desktop-package:mac:reuse-stage
```

Windows 现有命令保持不变：`pnpm dist:desktop:nsis`、`pnpm dist:desktop:portable`、`pnpm verify:desktop-package`。

## Failure Modes

- macOS 构建报“找不到 NSIS 模板”或 NSIS 相关错误：说明目标平台判定仍然落到 Windows，应检查调用参数是否包含 `--mac`。
- 安装 dmg 后提示应用“已损坏”或无法打开：这是未签名应用被 Gatekeeper 拦截。可以从“访达”右键选择“打开”，或对应用执行 `xattr -dr com.apple.quarantine "/Applications/Biz Novel Studio.app"`。
- macOS 上设置 `BrowserWindow` 的 `icon` 看起来无效：属于平台行为，macOS 使用应用包内的 `.icns`，不读取窗口图标。
- 打包后本地服务启动失败、报原生模块加载错误：说明包内的 Prisma 引擎或 `better-sqlite3` 与运行机器架构不一致，确认是否在目标平台（或匹配架构）上执行了 `stage:desktop`。
- 打包后的应用启动即报 `Could not load the "sharp" module using the <platform> runtime`：说明 `@img/sharp-*` 与 `@img/sharp-libvips-*` 平台包没有进包。这几乎总是依赖收集器回退到仓库根目录导致的，检查构建日志中 `searching for node modules` 的 `searchDir` 是否为 `desktop/build/app`。
- 打包后的应用报 `Cannot find module '.prisma/client/default'`：说明 `@prisma/client` 进包时没有带上 `generated-client` 子目录，`stage-desktop.cjs` 对 `@prisma/client` 的改写没有随包生效，同样是依赖收集目录不对造成的。
- 判断打包是否真的可用，不能只看 `verify:desktop-package` 的路径断言。最可靠的方式是启动打包后的应用并请求 `/api/health`：健康检查返回 200 才说明 Prisma、`better-sqlite3`、`sharp` 都真正加载成功。
- 未签名 macOS 应用无法使用自动更新安装：`electron-updater` 在 macOS 上要求应用已签名。本期 macOS 包定位为本机安装包，更新通道以签名版本为准。
- DMG 步骤卡在下载 `dmg-builder` 并报 `ETIMEDOUT`：该步骤需要从 GitHub 拉取 electron-builder 的二进制工具。可以设置二进制镜像后重跑，例如 `ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/ pnpm dist:desktop:dmg:reuse-stage`。
- 本地构建报 `GitHub Personal Access Token is not set`：说明 electron-builder 进入了发布流程。仓库内的 macOS 本地构建命令已带 `--publish never`；自定义命令需要显式加上该参数。

## Related Modules

- `desktop/electron-builder.config.cjs`：平台目标、签名门禁与 dmg / zip 产物定义。
- `desktop/scripts/run-electron-builder.cjs`：按平台决定是否修补 NSIS 与校验签名环境。
- `desktop/scripts/verify-desktop-package.cjs`：按平台解析 unpacked 目录与资源路径。
- `desktop/scripts/generate-desktop-icons.py`：生成 `.ico`、`.png` 与 `.icns` 图标资产。
- `desktop/src/runtime/paths.ts`：按平台解析窗口图标与数据目录。
- `desktop/src/main.ts`：macOS 窗口生命周期与 `activate` 重开窗口。
- `docs/wiki/workflows/desktop-release-versioning.md`：桌面版本号与发布标识规则。
