import got from 'got'

// 84b09c32-8f68-45b4-823c-06fce29c34f5
type UUID = string;
// eg: 2022-07-18T13:00:56+00:00
type DateTimeString = string;
type HTMLString = string;

export const fetchGalnet = async () => {
  const base = 'https://cms.zaonce.net/en-GB/jsonapi/node/galnet_article/'
  const res = await got
    .get(base, {
      searchParams: {
        'sort[sort-publish][direction]': 'DESC',
        'sort[sort-publish][path]': 'published_at',
        'page[limit]': '10'
      }
    })
    .json<{
      data: Array<{
        id: UUID,
        attributes: {
          /* eslint-disable camelcase */
          revision_timestamp: DateTimeString,
          title: string,
          created: DateTimeString,
          changed: DateTimeString,
          published_at: DateTimeString,
          langcode: 'en',
          body: {
            value: string,
            processed: HTMLString,
            summary: null,
          }
          // "18 JUL 3308"
          field_galnet_date: string,
          // 62cfd656e5378e4f3f7b5b96
          field_galnet_guid: string,
          field_galnet_image: string,
          field_slug: string,
          /* eslint-enable camelcase */
        }
      }>
    }>()

  return res.data.map(news => {
    return {
      timestamp: new Date(news.attributes.published_at).getTime(),
      title: news.attributes.title,
      publishedAt: news.attributes.published_at,
      url: `https://www.elitedangerous.com/news/galnet/${news.attributes.field_slug}`,
      cover: `https://hosting.zaonce.net/elite-dangerous/galnet/${news.attributes.field_galnet_image}.png`,
      date: news.attributes.field_galnet_date,
      content: news.attributes.body.value
    }
  })
}
