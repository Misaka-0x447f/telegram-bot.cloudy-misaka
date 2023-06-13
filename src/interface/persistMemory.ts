// TODO: Implement S3 storage

import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import persistConfig from '../utils/persistConfig'
import { isNull } from 'lodash-es'

const fileName = 'persistMemory.json'

const client = new S3Client({
  region: 'auto',
  endpoint: persistConfig.entries.tokenS3.endpoint,
  credentials: {
    accessKeyId: persistConfig.entries.tokenS3.id,
    secretAccessKey: persistConfig.entries.tokenS3.key,
  },
})

type Storage = {} | null

let storage: Storage = null

const getStorage = async () => {
  if (!isNull(storage)) return storage
  const res = await client.send(new ListBucketsCommand({}))
  if (
    !res.Buckets?.some(
      (item) => item.Name === persistConfig.entries.tokenS3.bucket
    )
  ) {
    throw new Error(`Bucket ${persistConfig.entries.tokenS3.bucket} not found.`)
  }
  const objectRes = await client.send(
    new ListObjectsV2Command({
      Bucket: persistConfig.entries.tokenS3.bucket,
    })
  )
  if (!objectRes.Contents) throw new Error('Failed to retrieve object list.')
  const fileObjectRes = objectRes.Contents.find((item) => item.Key === fileName)
  if (!fileObjectRes) {
    storage = {}
    return {}
  }
  const fileRes = await client.send(
    new GetObjectCommand({
      Bucket: persistConfig.entries.tokenS3.bucket,
      Key: fileName,
    }
  ))
  if (!fileRes.Body) throw new Error('Failed to retrieve memory.')
  storage = JSON.parse(fileRes.Body.toString())
  return storage
}

const setStorage = async (transformer: (from: Storage) => Storage) => {
  storage = transformer(storage)
  await client.send(
    new PutObjectCommand({
      Bucket: persistConfig.entries.tokenS3.bucket,
      Key: fileName,
      Body: JSON.stringify(storage),
    })
  )
}
