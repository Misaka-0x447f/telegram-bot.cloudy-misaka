/* eslint-disable camelcase */
import got from 'got'
import telemetry from '../utils/telemetry'

export const fetchRoomStatus = async (room: '6655') => {
  try {
    const res: {
      launch_remind: {
        room_id: string
        user_operate: '0' | '1' // 用户最后一次操作
        user_operate_time: string // 去毫秒 unix 时间
      }
      game: {
        tag_name: string // 标记游戏
      }
      room: {
        show_time: number // 去毫秒 unix 时间
        end_time: string
        room_name: string
        show_status: 1 | 2 // 1: online | 2: offline
        second_lvl_name: string // 分区名称
      }
    } = await got.get(`https://www.douyu.com/betard/${room}`).json()
    return {
      ...res,
      room: {
        ...res.room,
        lastOnlineTime: new Date(
          parseInt(res.room.show_time.toString().concat('000'))
        ),
        lastOfflineTime: new Date(parseInt(res.room.end_time.concat('000'))),
        liveName: res.room.room_name,
        isOnline: res.room.show_status === 1,
        category: res.room.second_lvl_name
      }
    }
  } catch (e) {
    telemetry(`interface/douyu.ts/fetchRoomStatus`, 'Error while fetching room info.', e)
    return null
  }
}
