import { Message } from 'telegram-typings'
import {
  BotType,
  getTelegramBotByAnyBotName,
  TelegrafEventBusListenerType
} from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import { withProcessingReaction } from '../utils/commandReaction'
import persistConfig from '../utils/persistConfig'
import {
  convertVideoStickerToGif,
  downloadVideoSticker,
  MAX_STICKER_INPUT_BYTES,
  StickerGifError
} from '../utils/stickerGif'

const command = 'fetch_sticker_gif'
const paramDefinition = { replyMessageType: 'WebM 视频贴纸。' }

const createWorker = (worker: BotType) => {
  // Bound FFmpeg work per bot without retaining user or chat state.
  let busy = false
  const handle = async (
    source: Message | undefined,
    p: Parameters<TelegrafEventBusListenerType>[0]
  ) => {
    const { currentChatId, message, sendMessageToCurrentChat } = p
    let ownsSlot = false
    try {
      if (!source) {
        await sendMessageToCurrentChat(
          errorMessages.illegalReplyMessageCount(paramDefinition)
        )
        return
      }
      const sticker = source.sticker
      if (!sticker) {
        await sendMessageToCurrentChat(
          errorMessages.illegalReplyMessage(paramDefinition)
        )
        return
      }
      if (sticker.is_animated) {
        await sendMessageToCurrentChat('当前不支持 TGS 动画贴纸，请发送 WebM 视频贴纸。')
        return
      }
      // telegram-typings@5 does not include the Bot API is_video field.
      if ((sticker as { is_video?: boolean }).is_video !== true) {
        await sendMessageToCurrentChat('这不是 WebM 视频贴纸。静态贴纸请使用 /fetch_sticker。')
        return
      }
      if (sticker.width > 512 || sticker.height > 512 ||
          (sticker.file_size || 0) > MAX_STICKER_INPUT_BYTES) {
        await sendMessageToCurrentChat('贴纸尺寸或大小超限：最多 512×512、1 MiB。')
        return
      }
      if (busy) {
        await sendMessageToCurrentChat('正在转换另一张贴纸，请稍后重试。')
        return
      }
      busy = true
      ownsSlot = true
      void worker.instance.telegram.sendChatAction(currentChatId, 'upload_document')
        .catch(() => {})
      const fileLink = await worker.instance.telegram.getFileLink(sticker.file_id)
      const input = await downloadVideoSticker(fileLink)
      const output = await convertVideoStickerToGif(input)
      const document = { source: output, filename: 'sticker.gif' }
      await worker.instance.telegram.sendDocument(currentChatId, document, {
        reply_to_message_id: message.message_id,
        disable_content_type_detection: true
      })
    } catch (error) {
      const detail = error instanceof StickerGifError
        ? error.message
        : '贴纸下载、转换或发送失败，请稍后重试。'
      // The event bus does not await listeners, so failed error replies must
      // also be handled here. Never echo raw API/FFmpeg errors or file URLs.
      await sendMessageToCurrentChat(detail).catch(() => {})
    } finally {
      if (ownsSlot) busy = false
    }
  }

  worker.command.sub((p) => {
    if (p.commandName !== command) return
    return withProcessingReaction(
      worker.instance.telegram, p.currentChatId, p.message.message_id,
      () => handle(p.message.reply_to_message, p)
    )
  })
  worker.message.sub((p) => {
    if (p.replyToCommand !== command || p.isCommand) return
    return withProcessingReaction(
      worker.instance.telegram, p.currentChatId, p.message.reply_to_message?.message_id,
      () => handle(p.message, p)
    )
  })
}

Object.keys(persistConfig.entries.fetchSticker).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
