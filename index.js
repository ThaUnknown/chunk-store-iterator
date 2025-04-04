import blockIterator from 'block-iterator'

async function * chunkStoreRead (store, opts = {}) {
  if (store?.[Symbol.asyncIterator]) {
    yield * store[Symbol.asyncIterator](opts.offset)
    return
  }
  if (!store?.get) throw new Error('First argument must be an abstract-chunk-store compliant store')

  const chunkLength = opts.chunkLength || store.chunkLength
  if (!chunkLength) throw new Error('missing required `chunkLength` property')

  let length = opts.length || store.length
  if (!Number.isFinite(length)) throw new Error('missing required `length` property')

  const offset = opts.offset || 0

  const get = (i, length, offset) => new Promise((resolve, reject) => {
    store.get(i, { offset, length }, (err, chunk) => {
      if (err) reject(err)
      resolve(chunk)
    })
  })

  let index = Math.floor(offset / chunkLength)
  const chunkOffset = offset % chunkLength
  if (offset) {
    const target = Math.min(length, chunkLength - chunkOffset)
    length -= target
    yield get(index++, target, chunkOffset)
  }

  for (let remainingLength = length; remainingLength > 0; ++index, remainingLength -= chunkLength) {
    yield get(index, Math.min(remainingLength, chunkLength))
  }
}

async function chunkStoreWrite (store, stream, opts = {}) {
  if (!store?.put) throw new Error('First argument must be an abstract-chunk-store compliant store')

  const chunkLength = opts.chunkLength || store.chunkLength
  if (!chunkLength) throw new Error('missing required `chunkLength` property')

  const storeMaxOutstandingPuts = opts.storeMaxOutstandingPuts || 16
  let outstandingPuts = 0

  let index = 0

  let cb = () => {}
  let ended = false

  for await (const chunk of blockIterator(stream, chunkLength, { zeroPadding: opts.zeroPadding || false })) {
    await new Promise((resolve, reject) => {
      if (outstandingPuts++ <= storeMaxOutstandingPuts) resolve()
      store.put(index++, chunk, err => {
        if (err) return reject(err)
        --outstandingPuts
        resolve()
        if (ended && outstandingPuts === 0) cb()
      })
    })
  }
  if (outstandingPuts === 0) return
  ended = new Promise(resolve => { cb = resolve })
  await ended
}

export { chunkStoreRead, chunkStoreWrite }
export default { chunkStoreRead, chunkStoreWrite }
