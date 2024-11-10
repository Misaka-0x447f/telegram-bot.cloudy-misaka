/* eslint-disable camelcase */
import got from 'got'
import mem from 'mem'
import { bilibiliRequestParamSigning, getBiliTicket } from '../utils/signing/bilibili'

enum BilibiliPostType {
  'basic' = 'DYNAMIC_TYPE_WORD',
  'liveStreamStart' = 'DYNAMIC_TYPE_LIVE_RCMD',
  '???' = 'DYNAMIC_TYPE_DRAW' // 疑似带图动态
}

type BilibiliPost = {
  id_str: string;
  'type': BilibiliPostType,
  modules: {
    module_author: {
      pub_ts: number; // unix timestamp seconds
      avatar: {
        fallback_layers: {
          layers: Array<{
            rosource: {
              res_image: {
                image_src: {
                  remote: {
                    bfs_style: 'widget-layer-avatar',
                    url: string; // 头像 url，"https://i2.hdslb.com/bfs/face/4bc94ba126a334aa325015848c0c12c4ea307459.jpg"
                  }
                }
              }
            }
          }>
        }
      }
    }
    module_dynamic: {
      major: {
        opus: {
          jump_url: string; // "//www.bilibili.com/opus/486720743551723191"
          pics: Array<{
            height: number;
            width: number;
            size: number; // kb?
            url: string; // "http://i0.hdslb.com/bfs/new_dyn/d0a313ded2d9f1bd37701d06f0b565c51472906636.png"
          }>,
          summary: {
            text: string; // "希望看到这条动态和fo我的人与我约法三章..."
          }
        }
      }
    } | {
      major: {
        type: 'MAJOR_TYPE_LIVE_RCMD'
      }
    },
    module_stat: {
      comment: {
        count: number;
      },
      forward: {
        count: number;
      },
      like: {
        count: number;
      }
    },
    module_tag?: {
      text: '置顶'
    }
  }
}

export const getBilibiliHomepagePosts = async (uid: string) => {
  const { ticket, expires } = await getBiliTicket()
  return (got('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space', {
    searchParams: await bilibiliRequestParamSigning({
      // offset: undefined,
      host_mid: uid,
      platform: 'web',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,forwardListHidden,ugcDelete,onlyfansQaCard',
      web_location: '333.999',
      'x-bili-device-req-json': '{"platform":"web","device":"pc"}',
      'x-bili-web-req-json': '{"spm_id":"333.999"}'
    }),
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      Referer: 'https://space.bilibili.com/1472906636/dynamic',
      Origin: 'https://space.bilibili.com',
      Cookie: [
        'buvid3=8EF193DC-3CC1-A0F8-09DC-B011989F275168969infoc',
        'b_nut=1729963868',
        'buvid4=49238FE6-6C9E-320A-3A5A-3EF08F74A1FF69537-024102617-zqmQuBDJhJkbRdoPbAVaug%3D%3D',
        'bili_ticket=' + ticket,
        'bili_ticket_expires=' + expires
      ].join('; ')
    }
  }).json())
}

export const getLiveIDByShortId = mem(async (shortID: string) => {
  const liveIDResponse = await got({
    method: 'get',
    url: `https://api.live.bilibili.com/room/v1/Room/room_init?id=${shortID}`,
    headers: {
      Referer: `https://live.bilibili.com/${shortID}`
    }
  }).json()
  // @ts-ignore
  return liveIDResponse.data.room_id
})

export const getUsernameByLiveID = mem(async (liveID) => {
  const nameResponse = await got({
    method: 'get',
    url: `https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${liveID}`,
    headers: {
      Referer: `https://live.bilibili.com/${liveID}`
    }
  }).json()
  // @ts-ignore
  return nameResponse.data.info.uname
})

export const fetchRoomInfo = async (id: string | number) => {
  const res = ((await got({
    method: 'get',
    url: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${id}&from=room`,
    headers: {
      Referer: `https://live.bilibili.com/${id}`
    }
  }).json()) as any).data
  return {
    ...res,
    live_time: new Date(
      res.live_time.replace(' ', 'T') + '+08:00'
    )
  } as {
    live_status: 0 | 1 | 2 // 2: 轮播
    parent_area_name: string // 分区名
    area_name: string // 大分区名
    title: string
    description: string
    live_time: Date,
    tags: string,
  }
}

export const getVideoDetail = async (searchParams: { aid?: string, bvid?: string }) => got({
  method: 'GET',
  url: 'http://api.bilibili.com/x/web-interface/view',
  searchParams
}).json<{
  code: number,
  message: string,
  ttl: number,
  data?: {
    bvid: string,
    aid: number,
    videos: number,
    tname: string,
    pic: string,
    title: string,
    pubdate: number,
    ctime: number,
    desc: string,
    state: number,
    duration: number,
    rights: {
      download: 0 | 1
    },
    owner: {
      mid: number,
      name: string,
      face: string,
    },
    stat: {
      aid: number,
      view: number,
      danmaku: number,
      reply: number,
      favourite: number,
      coin: number,
      share: number,
      like: number,
      dislike: number,
    },
    dimension: {
      width: number,
      height: number,
      rotate: number,
    },
    pages: Array<{
      cid: number,
      page: number,
      from: string,
      part: string,
      duration: number,
      dimension: {
        width: number,
        height: number,
        rotate: number,
      }
    }>
  }
}>()
