# cherrystudio-1.1.5-r5

首个独立发布包：非官方 Windows TokenTracker 1.1.5 Cherry Studio 用量适配。包括普通聊天、Agent 会话、模型 Token 和估算成本，以及本机 API 平台名称。

修复平台接口/数据库失败时丢失缓存、设备身份变化后的旧平台归属、以及零请求账本验证。费用并非平台实际账单。平台和会话名称留在本机，不读取正文或密钥。

下载 `TokenTracker-CherryStudio-1.1.5-r5-Windows.zip`，解压后完全退出 TokenTracker，运行 `Deploy.cmd`。自动生成的 Source code ZIP 不能直接部署。无需用户安装 Git 或 Node。

只支持 Windows TokenTracker 1.1.5：[对应官方下载](https://github.com/xiufengsun/TokenTracker/releases/tag/v1.1.5)。其他版本拒绝部署，不要降级已有安装强行使用。

部署会暂停自动更新。请保留解压目录及备份；恢复时退出程序后运行 `Restore.cmd`，还原原更新偏好。升级官方版本或补丁前先恢复。

发布附件：部署 ZIP 和同名 `.zip.sha256` 文件。使用及自定义安装目录见 README。
