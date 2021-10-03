import PQueue from 'p-queue'
import { insights } from './telemetry'

export class Queue {
  private queue = new PQueue({ concurrency: 1, interval: 1000 })
  private inboundCount = 0
  private outboundCount = 0

  constructor (label: string) {
    setInterval(() => {
      /** @author https://www.ques10.com/p/8217/average-queue-length-1/ */
      const intensity = this.inboundCount / this.outboundCount
      const avgLength = Math.pow(intensity, 2) / (1 - intensity)
      insights.trackMetric({ name: `${label} 5 mins queue length avg`, average: avgLength })
      this.inboundCount = 0
      this.outboundCount = 0
    }, 300000)
  }

  async push <T> (task: () => Promise<T>) {
    this.inboundCount++
    return this.queue
      .add(() => {
        this.outboundCount++
        return task()
      })
  }
}
