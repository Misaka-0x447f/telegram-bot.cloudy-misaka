[t.me/Misaka_0x447f_bot]()

private bot codes. contact the author for more information.

这个项目有配 ci，请通过 ci 部署

所需环境变量：`CONFIG_PATH`


`/fetch_sticker_gif`：回复一张 Telegram WebM 视频贴纸发送此命令，或回复此命令发送贴纸，即可获得透明 GIF 文件，用于保存到相册后添加为 QQ 表情。沿用 `fetchSticker` 配置启用的机器人；不支持 TGS 动画贴纸。保留原尺寸和动画节奏（GIF 帧延时以 10 毫秒为单位），半透明像素按阈值转换为透明或不透明。

输入上限为 512×512、1 MiB，GIF 输出上限为 20 MiB；每个机器人同时转换一张贴纸，下载和 FFmpeg 转换各有 30 秒超时。运行环境需要带 `libvpx-vp9` 解码器的 FFmpeg（Docker 镜像已安装 FFmpeg）。

功能测试：`node --test tests/*.test.mjs`。

`/imgconv`、`/fetch_sticker`、`/fetch_sticker_gif` 在处理期间会给命令消息添加 👀，完成或失败后撤掉。回复命令发送素材时，反应仍加在原命令消息上；聊天不允许反应时不影响转换。
