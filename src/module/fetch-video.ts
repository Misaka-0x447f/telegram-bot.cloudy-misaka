import bot from '../interface/bot'
import { getVideoDetail } from '../interface/bilibili'
import { ExtractPromise } from '../utils/type'
import errorMessages from '../utils/errorMessages'

const biliVideoDetailAdapter = (
  src: ExtractPromise<ReturnType<typeof getVideoDetail>>
) => {
  if (!src.data) {
    const extra = ({
      '-400': '输入的视频编号错误，或者该视频不存在。',
      '-404': '稿件可能已被删除。',
    } as any)[src.code] || '' as string
    return `${src.code}: ${src.message}。`.concat(extra)
  }
  const d = src.data
  // noinspection NonAsciiCharacters,JSNonASCIINames
  return Object.entries({
    av号: d.aid,
    bv号: d.bvid,
    名称: d.title,
    描述: d.desc,
    封面链接: d.pic,
    发布者: d.owner.name,
  })
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

bot.misaka.command.sub(async ({ ctx, meta }) => {
  if (meta.commandName !== 'fetch_video' || !ctx.chat?.id) return
  const reply = ctx.message?.reply_to_message
  if (!reply?.text) {
    await ctx.telegram.sendMessage(ctx.chat?.id, errorMessages.tooFewArguments(1, 0))
    return
  }
  const biliRegex = /([ab]v)(.*)/im
  if (reply.text.match(biliRegex)) {
    const result = reply.text.match(biliRegex)!
    const isAv = result[1].toLowerCase() === 'av'
    const res = await getVideoDetail(
      isAv ? { aid: result[2] } : { bvid: result[2] }
    )
    await ctx.telegram.sendMessage(ctx.chat?.id, biliVideoDetailAdapter(res))
    return
  }
  await ctx.telegram.sendMessage(
    ctx.chat?.id,
    errorMessages.unexpectedArguments([{
      name: 'videoId',
      acceptable: 'av 号或 bv 号。例如：av39092411'
    }])
  )
})
