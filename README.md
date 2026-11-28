<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" alt="Lumen">
</p>

<h1 align="center">Lumen for Windows</h1>

<p align="center">
  A lightweight app for editing and color-grading your photos.<br>
  一款轻量的修图调色软件。
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#简体中文">简体中文</a>
</p>

---

## English

This is the Windows edition of Lumen, rebuilt with **Tauri** (Rust + a web interface + WebGL). The interface, colors, components, animations and every color algorithm match the Mac app one-to-one. Presets (`.json`) and LUTs (`.cube`) move freely between the two.

### Download & install

1. Download **Lumen_1.0.0_x64-setup.exe** from Releases.
2. Double-click it and follow the installer. No administrator rights are needed — Lumen installs for your user account and adds a Start-menu shortcut.

Requires Windows 10 or 11 (64-bit). The installer sets up Microsoft Edge WebView2 automatically if it's missing (it's already built into Windows 11).

**If Windows SmartScreen appears.** This build isn't code-signed, so the first launch may show "Windows protected your PC". Click **More info → Run anyway**. You only need to do this once.

### Build the installer yourself

**Option A — on any Windows PC**

1. Install [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs), and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
2. In this folder:

```powershell
npm install
npm run app        # run in development mode
npm run package    # build the installers
```

The installers are written to:

- `src-tauri/target/release/bundle/nsis/Lumen_1.0.0_x64-setup.exe` (recommended)
- `src-tauri/target/release/bundle/msi/Lumen_1.0.0_x64_en-US.msi`

The first build downloads and compiles Rust dependencies and takes 3–8 minutes; later builds are much faster.

**Option B — on GitHub, no Windows PC needed**

Push this folder to a GitHub repository. `.github/workflows/build-windows.yml` builds on GitHub's Windows machines:

- **Actions → Build Windows installer → Run workflow** builds the installer and attaches it to the run as a downloadable artifact.
- Pushing a tag such as `v1.0.0` (`git tag v1.0.0 && git push --tags`) creates a draft Release with the installers attached. Review it and click **Publish**.

### Differences from the Mac version

| | Mac | Windows |
|---|---|---|
| Rendering | Core Image + Metal | WebGL 2, same formulas per pixel |
| Open | JPG · PNG · HEIC · TIFF · RAW | JPG · PNG · WebP · AVIF · TIFF · BMP · camera RAW (Sony, Canon, Nikon, Fujifilm, Panasonic, Olympus, Pentax, DNG… decoded in Rust with [rawler](https://github.com/dnglab/dnglab); CR3 support depends on the camera) |
| Export | JPEG · HEIC · PNG · 16-bit TIFF | JPEG · WebP · PNG · 16-bit TIFF |
| Color space | Display P3 | sRGB |
| Shortcuts | ⌘ | Ctrl (fine-tune a slider with Alt or Shift) |

Window controls follow Windows conventions (minimize / maximize / close at top right); everything else is the same layout.

### Shortcuts

| | |
|---|---|
| Ctrl+O | Open photos |
| Ctrl+W | Close photo |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+Shift+C / Ctrl+Shift+V | Copy / paste adjustments |
| Ctrl+E | Export photo |
| Ctrl+Shift+E | Export LUT |
| Ctrl+S / Ctrl+L | Save / load preset |
| Ctrl+0 / Ctrl+1 | Fit / 100% |
| Ctrl+= / Ctrl+- | Zoom in / out |
| \\ | Split view |
| Esc | Cancel the eyedropper |

### Project layout

```
src/
  engine/      WebGL pipeline: shaders.ts (every adjustment), renderer.ts (pass order), colormath.ts
  model/       Edit state, built-in looks, the document (sessions, history, export)
  ui/          Toolbar, sidebar, canvas, inspector, panels, glass components, animations
  help/        The "?" explanations (Chinese / English)
src-tauri/     Rust: file I/O, TIFF decode/encode, window, installer config
```

### Live MCP Automation (`lumen_mcp.exe`)

Lumen Windows includes a built-in **Model Context Protocol (MCP)** stdio server (`lumen_mcp.exe`) so AI assistants (**Cursor, Claude Desktop, Claude Code, Codex, Antigravity**) can control the live Lumen window and render edits in real time.

* **Why is `lumen_mcp.exe` included in the installer?**
  Lumen is a purely local desktop photo editor (all WebGL grading runs locally inside `lumen.exe` with no cloud server). `lumen_mcp.exe` acts as a lightweight local bridge between your AI client and `lumen.exe`—no Node.js, Python, or online package downloads required. If `lumen.exe` is not running when a tool is called, `lumen_mcp.exe` launches it automatically.

#### 1. Locate `lumen_mcp.exe`

* **Installed via installer** (placed alongside `Lumen.exe`):
  * NSIS installer (`*-setup.exe`, current user): `%LOCALAPPDATA%\Lumen\lumen_mcp.exe` (`C:\Users\<YourName>\AppData\Local\Lumen\lumen_mcp.exe`)
  * MSI installer: `C:\Program Files\Lumen\lumen_mcp.exe`
* **Built from source**:
  ```powershell
  cd src-tauri
  cargo build --release --bin lumen --bin lumen_mcp
  ```
  Outputs are in `src-tauri/target/release/`.

#### 2. Configure in Your MCP Client

Add the following to your Cursor / Claude Desktop / Codex / Antigravity MCP config (replace `<YourName>` with your Windows username):

```json
{
  "mcpServers": {
    "lumen": {
      "command": "C:\\Users\\<YourName>\\AppData\\Local\\Lumen\\lumen_mcp.exe"
    }
  }
}
```

#### 3. Available Tools (21)

- **Sessions**: `open_photos`, `list_sessions`, `switch_session`, `close_session`
- **Adjustments & Layers**: `get_edit_state`, `set_basic_adjustments`, `reset_adjustments`, `add_layer`, `update_layer`, `layer_action`, `apply_preset`, `sync_adjustments`, `undo`, `redo`
- **View & Analysis**: `set_view`, `get_image_analysis`, `sample_color`, `auto_white_balance`
- **Render & Export**: `render_preview`, `export_photo`, `export_lut`

---

## 简体中文

这是 Lumen 的 Windows 版，用 **Tauri**（Rust + 网页界面 + WebGL）重新实现。界面、配色、组件、动画和每一个调色算法都和 Mac 版一一对应；预设（`.json`）和 LUT（`.cube`）两边可以互相使用。

### 下载与安装

1. 在 Releases 里下载 **Lumen_1.0.0_x64-setup.exe**。
2. 双击，按提示安装。不需要管理员权限，装好后开始菜单里会有 Lumen。

需要 Windows 10 或 11（64 位）。如果电脑上没有 Microsoft Edge WebView2，安装程序会自动装上（Windows 11 自带）。

**如果出现“Windows 已保护你的电脑”。** 这个版本没有做代码签名，第一次打开时可能出现这个提示。点 **更多信息 → 仍要运行** 即可，只需要一次。

### 自己打包安装包

**方式一：在任意一台 Windows 电脑上**

1. 安装 [Node.js 20+](https://nodejs.org)、[Rust](https://rustup.rs)，以及 [Visual Studio 生成工具](https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/)（勾选“使用 C++ 的桌面开发”）。
2. 在这个文件夹里运行：

```powershell
npm install
npm run app        # 开发模式运行
npm run package    # 打包安装程序
```

打包好的安装程序在：

- `src-tauri/target/release/bundle/nsis/Lumen_1.0.0_x64-setup.exe`（推荐发这个）
- `src-tauri/target/release/bundle/msi/Lumen_1.0.0_x64_en-US.msi`

第一次打包要下载、编译 Rust 依赖，大约 3–8 分钟；之后会快很多。

**方式二：用 GitHub 打包，不需要 Windows 电脑**

把这个文件夹推到一个 GitHub 仓库，`.github/workflows/build-windows.yml` 会在 GitHub 的 Windows 机器上打包：

- **Actions → Build Windows installer → Run workflow**：打包完成后，在这次运行的页面下载安装包。
- 推送 `v1.0.0` 这样的标签（`git tag v1.0.0 && git push --tags`）：自动创建一个 Release 草稿并附上安装包，检查后点 **Publish** 发布。

### 和 Mac 版的区别

| | Mac | Windows |
|---|---|---|
| 渲染 | Core Image + Metal | WebGL 2，逐像素使用同样的公式 |
| 打开 | JPG · PNG · HEIC · TIFF · RAW | JPG · PNG · WebP · AVIF · TIFF · BMP · 相机 RAW（索尼、佳能、尼康、富士、松下、奥林巴斯、宾得、DNG 等，Rust 端用 [rawler](https://github.com/dnglab/dnglab) 解码；CR3 视机型而定） |
| 导出 | JPEG · HEIC · PNG · 16 位 TIFF | JPEG · WebP · PNG · 16 位 TIFF |
| 色彩空间 | Display P3 | sRGB |
| 快捷键 | ⌘ | Ctrl（滑杆微调用 Alt 或 Shift） |

窗口按钮按 Windows 的习惯放在右上角（最小化 / 最大化 / 关闭），其余布局完全相同。

### 快捷键

| | |
|---|---|
| Ctrl+O | 打开照片 |
| Ctrl+W | 关闭当前照片 |
| Ctrl+Z / Ctrl+Shift+Z | 撤销 / 重做 |
| Ctrl+Shift+C / Ctrl+Shift+V | 拷贝 / 粘贴调整 |
| Ctrl+E | 导出照片 |
| Ctrl+Shift+E | 导出 LUT |
| Ctrl+S / Ctrl+L | 保存 / 载入预设 |
| Ctrl+0 / Ctrl+1 | 适应窗口 / 100% |
| Ctrl+= / Ctrl+- | 放大 / 缩小 |
| \\ | 左右对比 |
| Esc | 取消吸管 |

### MCP 实时自动化控制（`lumen_mcp.exe`）

Lumen Windows 内置了标准的 **Model Context Protocol (MCP)** 本地 Stdio 服务端（`lumen_mcp.exe`），让 **Cursor、Claude Desktop、Claude Code、Codex、Antigravity** 等 AI 助手可以直接控制你电脑上正在运行的 Lumen 窗口并实时渲染修图效果。

* **为什么安装包里会带一个 `lumen_mcp.exe`？**
  Lumen 是纯本地桌面修图软件（所有 WebGL 调色渲染都在本地 `lumen.exe` 中完成，没有云端服务器），因此需要一个本地轻量桥接程序作为 AI 客户端与 `lumen.exe` 之间的“传话筒”。随安装包一起安装后，**无需额外安装 Node.js / Python 或从网上下载依赖**；AI 调用时若 `lumen.exe` 尚未启动，`lumen_mcp.exe` 也会自动将其拉起。

#### 1. 获取 `lumen_mcp.exe` 路径

* **通过安装包安装**：安装完成后，`lumen_mcp.exe` 与主程序位于同一安装目录：
  * NSIS 安装包（`*-setup.exe`，默认当前用户安装）：`%LOCALAPPDATA%\Lumen\lumen_mcp.exe`（即 `C:\Users\<你的用户名>\AppData\Local\Lumen\lumen_mcp.exe`）
  * MSI 安装包：`C:\Program Files\Lumen\lumen_mcp.exe`
* **自行源码编译**：
  ```powershell
  cd src-tauri
  cargo build --release --bin lumen --bin lumen_mcp
  ```
  编译产物均位于 `src-tauri/target/release/`。

#### 2. 在 MCP 客户端中配置

在 Cursor / Claude Desktop / Codex / Antigravity 的 MCP 配置文件中加入（以默认 NSIS 安装路径为例，请将 `<用户名>` 替换为你的 Windows 用户名）：

```json
{
  "mcpServers": {
    "lumen": {
      "command": "C:\\Users\\<用户名>\\AppData\\Local\\Lumen\\lumen_mcp.exe"
    }
  }
}
```

#### 3. 支持的 MCP 工具（共 21 个）

- **会话管理**：`open_photos`、`list_sessions`、`switch_session`、`close_session`
- **调色与图层**：`get_edit_state`、`set_basic_adjustments`、`reset_adjustments`、`add_layer`、`update_layer`、`layer_action`、`apply_preset`、`sync_adjustments`、`undo`、`redo`
- **视图与分析**：`set_view`、`get_image_analysis`、`sample_color`、`auto_white_balance`
- **预览与导出**：`render_preview`、`export_photo`、`export_lut`
