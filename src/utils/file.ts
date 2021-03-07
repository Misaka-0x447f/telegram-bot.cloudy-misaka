import got from 'got'
import { createWriteStream } from 'fs'

export const download = (url: string, dest: string) =>
  new Promise((resolve, reject) => {
    const downloadStream = got.stream(url)
    const fileWriterStream = createWriteStream(dest)

    downloadStream
      .on('error', (error) => {
        reject(error)
      })

    fileWriterStream
      .on('error', (error: Error) => {
        reject(error)
      })
      .on('finish', resolve)

    downloadStream.pipe(fileWriterStream)
  })
