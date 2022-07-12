import got from 'got'
import parse from 'node-html-parser'

export const fetchGalnet = async () => {
  const base = 'https://community.elitedangerous.com/galnet'
  const res = await got
    .get(base)
    .text()
  const root = parse(res)
  return root.querySelectorAll('#block-system-main .article').map(el => ({
    title: el.querySelector('.galnetNewsArticleTitle')?.innerText.trim(),
    path: el.querySelector('.galnetNewsArticleTitle a')?.attributes.href,
    date: el.querySelector('.i_right')?.innerText.trim(),
    content: el.querySelector('> p')?.innerText.trim()
  })).map(el => ({
    ...el,
    url: `${base}${el.path}`,
    id: el.path?.split('/').pop()?.padStart(128, '0')
  }))
}
