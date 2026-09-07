import execa from 'execa'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { downloadStream } from './file'

export const MAX_STICKER_INPUT_BYTES = 1024 * 1024
const MAX_GIF_OUTPUT_BYTES = 20 * 1024 * 1024
const TIMEOUT_MS = 30 * 1000

// Only these errors are safe to show to users. Network errors can contain
// Telegram download URLs, including the bot token.
export class StickerGifError extends Error {}

export const downloadVideoSticker = async (url: string): Promise<Buffer> => {
  const stream = downloadStream(url)
  const timer = setTimeout(() => {
    stream.destroy(new StickerGifError('贴纸下载超时，请稍后重试。'))
  }, TIMEOUT_MS)
  try {
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.length
      if (total > MAX_STICKER_INPUT_BYTES) {
        throw new StickerGifError('贴纸文件超过 1 MiB，无法转换。')
      }
      chunks.push(buffer)
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
    stream.destroy()
  }
}

export const convertVideoStickerToGif = async (input: Buffer): Promise<Buffer> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-gif-'))
  const inputPath = path.join(directory, 'input.webm')
  const outputPath = path.join(directory, 'sticker.gif')
  try {
    await fs.writeFile(inputPath, input)
    // Native VP9 decoding discards WebM alpha. libvpx-vp9 preserves it.
    // Keep source frame timing; GIF quantizes delays to hundredths of a second.
    await execa('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-c:v', 'libvpx-vp9',
      '-i', inputPath,
      '-an',
      '-filter_complex',
      'split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];' +
        '[b][p]paletteuse=alpha_threshold=128:dither=sierra2_4a',
      '-loop', '0',
      outputPath
    ], { timeout: TIMEOUT_MS, killSignal: 'SIGKILL' })
    if ((await fs.stat(outputPath)).size > MAX_GIF_OUTPUT_BYTES) {
      throw new StickerGifError('转换后的 GIF 超过 20 MiB，无法发送。')
    }
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
