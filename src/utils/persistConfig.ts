import fsj from 'fs-jetpack'
import { BlobServiceClient } from '@azure/storage-blob'
import { debounce } from 'lodash-es'

const secret = process.env.AZURE_SECRET
if (!secret)
  throw new Error('Azure Storage Account Connection String is Required.')

const configFile = './bot-config.json'
const containerName = 'default'
const containerClient = BlobServiceClient.fromConnectionString(
  secret
).getContainerClient(containerName)
const blobClient = containerClient.getBlobClient(configFile)
const blockBlobClient = containerClient.getBlockBlobClient(configFile)

const data: { value: Record<string, any> } = { value: {} }
const _upload = debounce(() => blockBlobClient.uploadFile(configFile), 120000)

export default {
  init: async () => {
    if (fsj.exists(configFile)) {
      data.value = fsj.read(configFile, 'json')
      return
    }
    const fileStream = await blobClient.download()
    fsj.write(configFile, fileStream)
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
