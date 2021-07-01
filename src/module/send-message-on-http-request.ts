import bot from '../interface/telegram'
import http from 'http'
import qs from 'qs'

import crypto from 'crypto'
import * as url from 'url'
import persistConfig from "../utils/persistConfig";

const checksum = crypto.createHash('sha1')
checksum.update(persistConfig.entries.master.tokenTelegram.find(el => el.name === 'strawberry960')?.token!)
const token = checksum.digest('hex')

const sendResponse = async (
  chatId: number,
  {
    text,
    parseMode,
    replyMarkup,
    disableWebPagePreview,
    photo,
    disableNotification,
  }: any
) => {
  parseMode = parseMode || ''
  disableWebPagePreview = disableWebPagePreview || false
  disableNotification = disableNotification || false
  let newText = text
  const postData = {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
    disable_web_page_preview: disableWebPagePreview,
    disable_notification: disableNotification,
  }
  if (photo) {
    newText = photo
  }
  await bot.strawberry960.sendMessage(chatId, newText, postData)
}

const server = http.createServer((req, res) => {
  const done = ({ code = 200, text = '' } = {}) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'text/html')
    res.end(`<h1>${text}</h1>`)
  }
  // home-made routing. for fun.
  const routes: Array<{
    path: RegExp
    command: (params: {
      query: URLSearchParams
      param: Record<string, string>
    }) => any
  }> = [
    {
      path: /^\/sendMessage\/(?<token>.*)/,
      command: ({ param }) => {
        console.log(param, token)
        if (param.token !== token) {
          done({ code: 403, text: 'token rejected.' })
          return
        }
        let body = ''
        req.once('data', (chunk) => {
          body += chunk.toString() // convert Buffer to string
        })
        req.once('end', () => {
          qs.parse(body)
          console.log(qs.parse(body))
          sendResponse(1244020370, qs.parse(body)).then()
          done({ text: 'success.' })
        })
      },
    },
  ]
  console.log(req)
  for (const route of routes) {
    if (!route.path.exec(req.url!)) continue
    const targetUrl = new url.URL(req.url!, 'http://test')
    route.command({
      query: targetUrl.searchParams,
      param: route.path.exec(targetUrl.pathname)!.groups!,
    })
    return
  }
  done({ code: 404, text: 'Not Found.' })
})

server.listen('17536', () => console.log('listening port 17536.'))
