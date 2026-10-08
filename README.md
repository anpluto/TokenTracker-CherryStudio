# TokenTracker-CherryStudio

[English](README.en.md)

**非官方 Cherry Studio（CherryStudio）适配补丁。** 让 Windows TokenTracker 显示 Cherry Studio 的 Token 用量、模型、普通聊天和 Agent 会话，以及本机 API 平台名称。

首版：`cherrystudio-1.1.5-r5`。**只支持 Windows TokenTracker 1.1.5**；其他版本会拒绝部署。已在 Cherry Studio 2.0.14 的 SQLite 用量表上验证。不是 Cherry Studio 插件，也不是完整 TokenTracker 安装包。

## 下载和部署

1. 从[官方 v1.1.5 Release](https://github.com/xiufengsun/TokenTracker/releases/tag/v1.1.5) 下载 Windows 安装包 `TokenTracker-Setup.exe` 或便携包 `TokenTracker-win-x64.zip`。已有其他版本的用户不要直接覆盖或降级；请等待对应版本适配。
2. 从[本项目 Releases](https://github.com/anpluto/TokenTracker-CherryStudio/releases) 下载 **`TokenTracker-CherryStudio-1.1.5-r5-Windows.zip`**。GitHub 的 `Source code (zip)` 只有源码，不能直接部署。
3. 将部署 ZIP 解压到长期保留的文件夹。从 TokenTracker 托盘菜单完全退出程序，双击 `Deploy.cmd`。
4. 重新打开刚部署的 TokenTracker，在托盘菜单执行 **Sync Now**。用量页展开 Cherry Studio 查看模型和平台；会话页选择 Cherry Studio。

普通用户不需要 Git、Node.js 或 npm，也不需要卸载重装 TokenTracker。默认安装位置为 `%LOCALAPPDATA%\Programs\TokenTracker`。

自定义安装位置或便携版，在解压目录打开 PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

安装目录中应有 `TokenTracker.exe` 和 `EmbeddedServer`。若电脑安装了多份 TokenTracker，请确认快捷方式指向部署的那份。系统目录若无写入权限，使用管理员终端运行相同命令。

部署先验证官方版本、原文件和补丁校验和，再备份并替换后端及界面。**部署会关闭 TokenTracker 自动更新，防止补丁被覆盖。** 失败时回滚，重复部署同一补丁不会重复备份。

## 验证、恢复和升级

Cherry Studio 至少运行过一次、已经生成数据库后，可双击 `Verify.cmd`。空账本会正常报告零请求。验证只读取数据库，统计队列写入临时目录。生成回复期间记录可能变化，请等待完成后再验证。

自定义位置验证：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

恢复：从托盘退出 TokenTracker 后双击 `Restore.cmd`；自定义目录使用下列命令。恢复原程序及原自动更新偏好，保留使用期间产生的统计。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

**部署期间请保留解压目录及其中 `.deployment-backups`，不要移动、改名或删除。** 备份是本机生成的，不能用其他电脑的备份恢复。补丁更新时先用旧部署目录恢复，再部署新包。官方升级前也先恢复，再安装官方新版；新版需等待匹配的新补丁，不要运行旧脚本强行覆盖。

## 能看到什么

- Cherry Studio 独立数据源、模型 Token、时间趋势及估算成本。
- 普通聊天、Agent 会话、未关联请求；会话名称、时间、模型及本机平台名称。
- 同一模型或会话使用多个平台时显示全部名称，例如 `本机 API 平台：示例平台 A / 示例平台 B`。
- 开启云同步后，账户总量仍由 TokenTracker 云端提供；平台标签只补充本机观察。其他设备的平台信息需在对应电脑查看。
- 平台接口暂时失败时保留同范围缓存并标注“缓存”；首次失败显示暂不可用。成功读取空结果时清除旧平台。

只统计 Cherry Studio `ai_usage_record` 的 `invocation` 记录，不叠加 Agent 日志，不补算旧日志或 `legacy-aggregate` 历史。默认读取 `%APPDATA%\CherryStudio\Data\cherrystudio.sqlite`，可在启动 TokenTracker 前通过 `TOKENTRACKER_CHERRYSTUDIO_DB` 指定其他路径。

输入 Token 扣除缓存读写；推理 Token 已包含在输出中，不重复计费。费用沿用 TokenTracker 模型定价估算，**不代表 API 平台实际账单**；未知价格或字段不完整时提示估算不完整。

## 隐私

不读取消息正文、提问、回复、API 密钥或平台配置。会话名称、标识和平台信息只用于本地展示及本地缓存，不进入用量队列或现有云端/CSV 会话汇总。TokenTracker 原有云同步开关仍控制数值用量上传，部署不会替你关闭或开启云同步。

部署备份可能包含本机用量和会话元数据，请保留在自己的电脑，不要上传、提交到 Git 或附在公开 Issue 中。报告问题仅需版本、报错和经过遮盖的示例。

## 源码和维护者构建

仓库保存部署脚本、回归测试和 `patches/tokentracker-v1.1.5.patch`，包含可阅读、可重建的后端和界面改动；完整基础源码来自[官方 TokenTracker](https://github.com/xiufengsun/TokenTracker)。普通用户直接下载 Release。

维护者需要 Windows、Git、Node.js 22 或更新版本及网络：

```powershell
node --test test/*.test.cjs
node scripts/build-release.cjs
node scripts/test-release.cjs
```

构建固定基线为 `d7274599df793f970b9a6559a1882ff7d5b1e7f2`，校验源码补丁 SHA-256，在干净源码上应用补丁、执行 `npm ci`、相关测试、类型和文案检查，然后构建 Dashboard（包含桌面宠物及配额入口）。产物在 `.release`。`--local-source <已有官方仓库>` 可从同一固定提交离线取源码；依赖首次安装仍需网络。

维护新版本时更新源码补丁、支持版本、基线和测试，再重新构建。脚本不会自动适配未知官方版本。

根目录依赖安装跳过生命周期脚本，避免构建与补丁无关的原生压缩模块；部署包不包含 `node_modules`，运行时继续使用官方安装已有的依赖。

许可证和上游署名见 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md)。与 TokenTracker、Cherry Studio 官方无隶属或背书关系。
