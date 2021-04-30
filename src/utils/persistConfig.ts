import fsj from 'fs-jetpack'
import { BlobServiceClient } from '@azure/storage-blob'
import { debounce } from 'lodash-es'

const secret = process.env.AZURE_SECRET
if (!secret)
  throw new Error('Azure Storage Account Connection String is Required.')

enum configFilesType {
  'config.json'
}

const configFiles = Object.keys(configFilesType)
const containerName = 'default'
const containerClient = BlobServiceClient.fromConnectionString(
  secret
).getContainerClient(containerName)
const blobClients = configFiles.map((el) => ({
  client: containerClient.getBlobClient(el),
  fileName: el,
}))
const blockBlobClients = configFiles.map((el) => ({
  client: containerClient.getBlockBlobClient(el),
  fileName: el,
}))

const data: { value: Record<keyof typeof configFilesType, Record<string, string | number>> } = { value: {} as any }
const _upload = debounce(
  async () =>
    Promise.all(
      blockBlobClients.map(async (el) =>
        el.client.uploadFile((await fsj.readAsync(el.fileName))!)
      )
    ),
  120000
)

export default {
  init: async () => {
    if (configFiles.every((el) => fsj.exists(el))) {
      data.value = Object.fromEntries(
        configFiles.map((el) => [el, fsj.read(el, 'json')])
      ) as any
      return
    }
    await Promise.all(
      blobClients.map(async (el) =>
        fsj.write(el.fileName, await el.client.download())
      )
    )
  },
  get data() {
    return data.value
  },
  update: async (
    updateMethod: (src: typeof data.value) => typeof data.value
  ) => {
    data.value = updateMethod(data.value)
    _upload()
  },
}
