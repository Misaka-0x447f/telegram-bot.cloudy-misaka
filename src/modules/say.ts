import persistConfig from '../utils/persistConfig'
import { BotType, getTelegramBotByAnyBotName } from "../interface/telegram";
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { isNumeric, stringify, tryCatchReturn } from '../utils/lang'
import { Chat } from 'telegraf/typings/telegram-types'
import { Message } from 'telegram-typings'
import formatYaml from 'prettyjson'
import yaml from 'js-yaml'
import { isUndefined, omitBy } from 'lodash-es'
import telemetry from "../utils/telemetry";
import { recordSpam } from '../utils/telemetrySpam'

const configs = persistConfig.entries.say
const replyTargetStore = {
  chatId: null as number | null,
  messageId: null as number | null
}

type ChatInfoParseResult = {
  from: string
  chatId: string
  messageId: string
  userName: string
  link: string
  shortcut?: string
}

const spamPatterns = [
  /(tg|电报|引流|群发|拉人|推广|广告|退订|私信|代开|兼职|刷单|刷量|薅羊毛)/i,
  /(担保|彩票|投注|娱乐|分红|工资|返点|返水)/i,
  /(注册链接|登录地址|测速地址|立即体验|老板专用|联系)/i,
  /(主营业务|老群|老频道|机器人|会员)/i,
  /(高利贷|房贷)/i,
]


type MatchRule = {
  label: string
  // 返回权重（分数），而非布尔。0 表示不加分。
  test: () => Promise<number>
  /**
   * delayed 表示：在非延迟规则全部执行后，如果分数仍不足，再执行这些规则。
   */
  delayed?: boolean
}

// 动态规则构建器：根据当前 message 和 bot 构建规则，test 内部返回权重
const buildMatchRules = (message: Message, bot: BotType): MatchRule[] => {
  const rules: MatchRule[] = []

  // 1) 文本垃圾关键词命中数量累加
  rules.push({
    label: 'spamPatterns',
    test: async () => {
      const textToCheck = `${message.text || ''} ${message.caption || ''}`
      return spamPatterns.reduce((acc, re) => acc + (re.test(textToCheck) ? 1 : 0), 0)
    }
  })

  // 2) 存在 inline keyboard
  rules.push({
    label: 'inlineKeyboard',
    test: async () => (message.reply_markup?.inline_keyboard ? 2 : 0)
  })

  // 3) entities: url/mention 数量累加
  rules.push({
    label: 'entities:url-or-mention',
    test: async () => (message.entities || []).filter((e) => ['url', 'mention'].includes(e.type)).length
  })

  // 4) caption_entities: 实体数量累加
  rules.push({
    label: 'caption_entities:text_link',
    test: async () => (message.caption_entities || []).filter((e) => (['text_link', 'url', 'mention', 'bold'].includes(e.type))).length
  })

  // 5) forward_origin.type 为 channel 的 +1
  rules.push({
    label: "forwardFromChannel",
    // @ts-expect-error 版本过老
    test: async () => (message.forward_origin?.type === "channel" ? 1 : 0)
  });

  // 6) 名字均为英文词或包含 emoji 命中 +1
  rules.push({
    label: "bothNameIsEnglishWordOrEmoji",
    test: async () => {
      const first = message.forward_from?.first_name || message.from?.first_name;
      const last = message.forward_from?.last_name || message.from?.last_name;
      const arr = [first, last];
      const ok = arr.every((name) => {
        if (!name) return false;
        // 检查是否为英文词（<=10 个字母）或包含 emoji
        const isEnglishWord = /^[a-zA-Z]{,10}$/.test(name);
        const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}]/u.test(name);
        return isEnglishWord || hasEmoji;
      });
      return ok ? 1 : 0;
    }
  });

  // 7) Unicode Combining Marks 命中 +1
  rules.push({
    label: "combiningMarks",
    test: async () => {
      const combiningMarks = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
      return combiningMarks.test(message.text || "") ? 1 : 0;
    }
  });

  // 8) 精确匹配 "/start" 命令 +1
  rules.push({
    label: "exactStartCommand",
    test: async () => (message.text === "/start" ? 1 : 0)
  });

  // 9) 延迟规则：用户头像为 0 则 +1（异常上报 telemetry）
  rules.push({
    label: 'noProfilePhoto',
    delayed: true,
    test: async () => {
      const originUserId = message.forward_from?.id || message.from?.id
      if (!originUserId) return 0
      const photos = await bot.instance.telegram.getUserProfilePhotos(originUserId, 0, 1)
      return photos?.total_count === 0 ? 1 : 0
    }
  })

  return rules
}

const chatInfoString = (chat: Chat, message: Message, shortcut?: string) =>
  formatYaml.render(
    omitBy(
      {
        from: `${chat.first_name || chat.title} ${chat.last_name || ''}`,
        chatId: chat.id,
        messageId: message.message_id,
        userName: chat.username,
        link:
          chat.id.toString().startsWith('-100') &&
          `https://t.me/c/${chat.id.toString().substring(4)}/${
            message.message_id
          }`,
        shortcut
      },
      isUndefined
    ),
    { noColor: true }
  )

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ sendMessageToCurrentChat, ctx, message, currentChat, currentChatId }) => {
    const isPrivate = message.chat.type === 'private'
    if (!config.adminChatIdsCanReceiveReply) return
    const parseResult = tryCatchReturn<ChatInfoParseResult | null>(
      () =>
        yaml.load(message.reply_to_message?.text || '') as ChatInfoParseResult,
      () => null
    )
    if (parseResult && isPrivate) {
      if (config.adminChatIds && !config.adminChatIds.includes(currentChatId)) {
        await sendMessageToCurrentChat('Permission denied.')
        return
      }
      await ctx.telegram.sendCopy(
        parseInt(parseResult.chatId),
        message,
        parseResult
          ? {
              reply_to_message_id: parseResult.messageId
            }
          : {}
      )
      return
    }
    if (
      (message.reply_to_message &&
        message.reply_to_message?.from?.username === bot.username) ||
      message.text?.includes(`@${bot.username}`) ||
      isPrivate
    ) {
      const threshold = 2
      let matchCount = 0
      const ruleDetails: Array<{ label: string; weight: number; delayed?: boolean }> = []

      // 使用动态规则构建器
      const rules = buildMatchRules(message, bot)
      console.log(message)
      // 先执行非 delayed 规则
      for (const rule of rules.filter((r) => !r.delayed)) {
        try {
          const w = Math.max(0, await rule.test())
          matchCount += w
          ruleDetails.push({ label: rule.label, weight: w, delayed: !!rule.delayed })
        } catch (e) {
          await telemetry('say.ts', '运行规则失败', { error: stringify(e) })
        }
      }
      const isAdmin = config.adminChatIds?.includes(currentChat.id)
      // 如果分数不足，再执行 delayed 规则（如头像检查）
      if (matchCount < threshold) {
        for (const rule of rules.filter((r) => r.delayed)) {
          try {
            const w = Math.max(0, await rule.test())
            matchCount += w
            ruleDetails.push({ label: rule.label, weight: w, delayed: !!rule.delayed })
            if (matchCount >= threshold) break
          } catch (e) {
            await telemetry('say.ts', '运行规则失败', { error: stringify(e) })
          }
        }
      }
      const filterLines = [
        '```plaintext',
        `SPAM score [${matchCount}/${threshold}]`,
        ...ruleDetails.filter((r) => r.weight > 0).map((r) => `- ${r.label}${r.delayed ? ' (delayed)' : ''}: ${r.weight}`),
        '```',
      ]
      if (isAdmin) {
        await sendMessageToCurrentChat(filterLines.join('\n'), {
          parse_mode: 'MarkdownV2'
        })
      }

      if (matchCount >= threshold) {
        try {
          // 记录完整消息，后续按小时转发到遥测频道
          recordSpam(botName, currentChatId, message.message_id, message)
        } catch (e) {
          await telemetry('say.ts', 'recordSpam 失败', { error: stringify(e) })
        }
        await sendMessageToCurrentChat(`\`此消息已被特征检查拦截。(特征码 ${(new Date().getMilliseconds() + 10) % 30})\``, {
          parse_mode: 'MarkdownV2'
        })
        return
      }
      if (isAdmin && isPrivate) return
      const shortcut = config.list.find((el) => el.id === currentChatId)?.name

      for (const el of config.adminChatIds || []) {
        await bot.forwardMessage(el, currentChatId, message.message_id)
        await bot.sendMessage(
          el,
          chatInfoString(currentChat, message, shortcut),
        )
        await bot.sendMessage(el, filterLines.join('\n'), {
          parse_mode: 'MarkdownV2'
        })
      }
    }
  })
  bot.command.sub(async ({ ctx, commandName, sendMessageToCurrentChat }) => {
    const paramDefinition = {
      replyMessageType:
        '以 yaml 格式储存的，包含 chatId 和 messageId 键的消息。这些信息被使用一次后将会从内存中清除。'
    }
    if (commandName !== 'sayTarget') return
    const replyTarget = ctx.message?.reply_to_message
    const parseResult = tryCatchReturn(
      () => yaml.load(replyTarget?.text || ''),
      () => ({})
    ) as Record<string, string>
    if (
      !replyTarget ||
      !parseInt(parseResult?.chatId) ||
      !parseInt(parseResult?.messageId)
    ) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    replyTargetStore.chatId = parseInt(parseResult.chatId)
    replyTargetStore.messageId = parseInt(parseResult.messageId)
    await sendMessageToCurrentChat(
      `成功。\n${formatYaml.render(replyTargetStore, { noColor: true })}`
    )
  })
  bot.command.sub(
    async ({
      ctx,
      commandName,
      args,
      currentChatId,
      sendMessageToCurrentChat
    }) => {
      const paramDefinition: ParamsDefinition = {
        argumentList: [
          {
            name: 'contact',
            acceptable: `发送目标。可以是以下任意字符串或任意 ChatId：${config.list
              .map((el) => el.name)
              .join(
                ', '
              )}；如果不指定此参数，则必须先通过 /sayTarget 指令指定发送目标。`,
            optional: true
          }
        ],
        replyMessageType: '发送内容。'
      }
      if (commandName !== 'say' || !currentChatId) return
      if (config.adminChatIds && !config.adminChatIds.includes(currentChatId)) {
        await sendMessageToCurrentChat('Permission denied.')
        return
      }
      if (
        !isNumeric(args[0]) &&
        !config.list.find((el) => args[0] === el.name) &&
        !replyTargetStore.chatId
      ) {
        await sendMessageToCurrentChat(
          errorMessages.illegalArguments(paramDefinition)
        )
        return
      }
      const predefinedTarget = config.list.find((el) => el.name === args[0])?.id
      if (!ctx.message?.reply_to_message) {
        await sendMessageToCurrentChat(
          errorMessages.illegalReplyMessageCount(paramDefinition)
        )
        return
      }
      try {
        const res = await ctx.telegram.sendCopy(
          replyTargetStore.chatId || predefinedTarget || args[0],
          ctx.message?.reply_to_message,
          replyTargetStore.messageId
            ? {
                reply_to_message_id: replyTargetStore.messageId
              }
            : {}
        )
        await Promise.all(
          config.adminChatIds?.map((user) =>
            bot.sendMessage(user, stringify(res))
          ) || []
        )
        replyTargetStore.messageId = null
        replyTargetStore.chatId = null
      } catch (e) {
        await sendMessageToCurrentChat(stringify(e))
        console.log(e)
      }
    }
  )
}
