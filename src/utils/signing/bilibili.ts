import { hmacSha256, md5 } from '../lang'
import got from 'got'

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
const getMixinKey = (orig) => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)

// 为请求参数进行 wbi 签名
const encWbi = (params, img_key, sub_key) => {
  const mixin_key = getMixinKey(img_key + sub_key)
  const curr_time = Math.round(Date.now() / 1000)
  const chr_filter = /[!'()*]/g

  Object.assign(params, { wts: curr_time }) // 添加 wts 字段
  // 按照 key 重排参数
  const query = Object
    .keys(params)
    .sort()
    .map(key => {
      // 过滤 value 中的 "!'()*" 字符
      const value = params[key].toString().replace(chr_filter, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')

  const wbi_sign = md5(query + mixin_key) // 计算 w_rid

  return query + '&w_rid=' + wbi_sign
}

// 获取最新的 img_key 和 sub_key
const getWbiKeys = async () => {
  const { data: { wbi_img: { img_url, sub_url } } } = await (got('https://api.bilibili.com/x/web-interface/nav', {
    method: 'get',
    headers: {
      // SESSDATA 字段，因为不需要使用登录功能所以不带
      // Cookie: 'SESSDATA=xxxxxx',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      Referer: 'https://www.bilibili.com/'// 对于直接浏览器调用可能不适用
    }
  }).json())

  return {
    img_key: img_url.slice(
      img_url.lastIndexOf('/') + 1,
      img_url.lastIndexOf('.')
    ),
    sub_key: sub_url.slice(
      sub_url.lastIndexOf('/') + 1,
      sub_url.lastIndexOf('.')
    )
  }
}

/**
 * 需要注意的是：如果参数值含中文或特殊字符等，编码字符字母应当大写 （部分库会编码为小写字母），空格应当编码为 %20（部分库按 application/x-www-form-urlencoded 约定编码为 +）。
 */
export const bilibiliRequestParamSigning = async (getParams: Record<string, unknown>) => {
  const web_keys = await getWbiKeys()
  return encWbi(getParams, web_keys.img_key, web_keys.sub_key)
}

const ticketCache = {
  value: null as null | string,
  expires: null as null | number,
  lastUpdate: 0
}

/**
 * Get Bilibili web ticket
 * @param {string} csrf    CSRF token, can be empty or null
 * @returns {Promise<any>} Promise of the ticket response in JSON format
 */
export const getBiliTicket = async (csrf = '') => {
  if (ticketCache.value && Date.now() - ticketCache.lastUpdate < 7200000) {
    return {
      ticket: ticketCache.value,
      expires: ticketCache.expires
    }
  }
  const ts = Math.floor(Date.now() / 1000)
  const hexSign = hmacSha256('XgwSnGZ1p', `ts${ts}`)
  const url = 'https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket'
  const params = new URLSearchParams({
    key_id: 'ec02',
    hexsign: hexSign,
    'context[ts]': ts,
    csrf: csrf || ''
  })
  const res = await (got(`${url}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0'
    }
  }).json())
  ticketCache.value = res.data.ticket
  ticketCache.expires = res.data.created_at + res.data.ttl
  return {
    ticket: ticketCache.value,
    expires: ticketCache.expires
  }
}
