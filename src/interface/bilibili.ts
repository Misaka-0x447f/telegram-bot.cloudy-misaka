/* eslint-disable camelcase */
import got from 'got'
import mem from 'mem'

export const getLiveIDByShortId = mem(async (shortID) => {
  const liveIDResponse = await got({
    method: 'get',
    url: `https://api.live.bilibili.com/room/v1/Room/room_init?id=${shortID}`,
    headers: {
      Referer: `https://live.bilibili.com/${shortID}`,
    },
  }).json()
  // @ts-ignore
  return liveIDResponse.data.room_id
})

export const getUsernameByLiveID = mem(async (liveID) => {
  const nameResponse = await got({
    method: 'get',
    url: `https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${liveID}`,
    headers: {
      Referer: `https://live.bilibili.com/${liveID}`,
    },
  }).json()
  // @ts-ignore
  return nameResponse.data.info.uname
})

export const fetchRoomInfo = async (id: string | number) => {
  const res = ((await got({
    method: 'get',
    url: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${id}&from=room`,
    headers: {
      Referer: `https://live.bilibili.com/${id}`,
    },
  }).json()) as any).data
  return {
    ...res,
    live_time: new Date(
      res.live_time.replace(' ', 'T') + '+08:00'
    ).toUTCString(),
  } as {
    live_status: 0 | 1 | 2  // 2: 轮播
    parent_area_name: string // 分区名
    area_name: string // 大分区名
    title: string
    description: string
    live_time: Date,
    tags: string,
  }
}
