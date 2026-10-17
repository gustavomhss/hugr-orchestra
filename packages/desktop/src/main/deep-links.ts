export function createDeepLinkDelivery(initial: string[], send: (target: number, urls: string[]) => void) {
  const pending = initial.filter((value) => value.startsWith("orchestra://"))
  const ready = new Set<number>()
  return {
    enqueue(urls: string[], target?: number) {
      const links = urls.filter((value) => value.startsWith("orchestra://"))
      if (!links.length) return
      if (target !== undefined && ready.has(target)) return send(target, links)
      pending.push(...links)
    },
    consume(target: number) {
      ready.add(target)
      return pending.splice(0)
    },
    pause(target: number) {
      ready.delete(target)
    },
  }
}
