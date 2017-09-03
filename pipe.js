/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, functional, monadic, promise-compatible streaming framework with backpressure. */

function resolveResult (result, successCb, errorCb) {
  if (result && result.then && result.catch) {
    result.then(successCb).catch(errorCb)
  } else successCb(result)
}

function composeBaseTransition (previousTransition) {
  let _nextMessage, _nextMessageCallback, _onMessageCallback, _onDispatchFinished
  let _isDeferred = true
  function dispatch () {
    if (_nextMessage && _nextMessageCallback) {
      _nextMessageCallback(_nextMessage)
      _nextMessage = null
      if (_onDispatchFinished) {
        _onDispatchFinished()
        _onDispatchFinished = null
      }
    }
  }
  function expectNext () {
    if (_isDeferred) {
      previousTransition.requestNextMessage(message => {
        _onMessageCallback(message.type, message.value)
        if (message.type === 'resolve') _isDeferred = false
        else if (message.type === 'reject') _isDeferred = false
      })
    }
  }
  const composit = {
    onMessage: callback => {
      _onMessageCallback = callback
    },
    expectNext: () => {
      setTimeout(expectNext, 0)
    },
    nextDispatch: (nextMessage, finishedCb) => {
      _nextMessage = nextMessage
      dispatch()
      _onDispatchFinished = finishedCb
    },
    requestNextMessage: nextMessageCallback => {
      _nextMessageCallback = nextMessageCallback
      expectNext()
      dispatch()
    }
  }
  return Object.freeze(composit)
}

function composeReduceTransition (previousTransition, reduceCallback, initialAccumulator) {
  let accumulator = initialAccumulator
  const baseTransition = composeBaseTransition(previousTransition)
  baseTransition.onMessage((type, value) => {
    if (type === 'emit') {
      try {
        const result = reduceCallback(accumulator, value)
        resolveResult(result, nextAccumulator => {
          accumulator = nextAccumulator
          baseTransition.expectNext()
        }, error => {
          baseTransition.nextDispatch({ type: 'reject', value: error })
        })
      } catch (error) {
        baseTransition.nextDispatch({ type: 'reject', value: error })
      }
    } else if (type === 'resolve') {
      baseTransition.nextDispatch({ type: 'resolve', value: accumulator })
    } else {
      baseTransition.nextDispatch({ type, value })
    }
  })
  return Object.freeze({
    requestNextMessage: baseTransition.requestNextMessage
  })
}

function composeFilterTransition (previousTransition, filterCallback) {
  const baseTransition = composeBaseTransition(previousTransition)
  baseTransition.onMessage((type, value) => {
    if (type === 'emit') {
      try {
        const result = filterCallback(value)
        resolveResult(result, dispatchMessage => {
          if (dispatchMessage) {
            baseTransition.nextDispatch({ type, value }, baseTransition.expectNext)
          } else {
            baseTransition.expectNext()
          }
        }, error => {
          baseTransition.nextDispatch({ type: 'reject', value: error })
        })
      } catch (error) {
        baseTransition.nextDispatch({ type: 'reject', value: error })
      }
    } else {
      baseTransition.nextDispatch({ type, value })
    }
  })
  return Object.freeze({
    requestNextMessage: baseTransition.requestNextMessage
  })
}

function composeMapTransition (previousTransition, mapCallback) {
  const baseTransition = composeBaseTransition(previousTransition)
  baseTransition.onMessage((type, value) => {
    if (type === 'emit') {
      try {
        const result = mapCallback(value)
        resolveResult(result, value => {
          baseTransition.nextDispatch({ type: 'emit', value }, baseTransition.expectNext)
        }, error => {
          baseTransition.nextDispatch({ type: 'reject', value: error })
        })
      } catch (error) {
        baseTransition.nextDispatch({ type: 'reject', value: error })
      }
    } else {
      baseTransition.nextDispatch({ type, value })
    }
  })
  return Object.freeze({
    requestNextMessage: baseTransition.requestNextMessage
  })
}

function composeForEachTransition (previousTransition, forEachCallback) {
  const baseTransition = composeBaseTransition(previousTransition)
  baseTransition.onMessage((type, value) => {
    if (type === 'emit') {
      forEachCallback(value)
      baseTransition.expectNext()
    } else if (type === 'resolve') {
      baseTransition.nextDispatch({ type, value })
    } else {
      baseTransition.nextDispatch({ type, value })
    }
  })
  return Object.freeze({
    requestNextMessage: baseTransition.requestNextMessage
  })
}

function composeThenTransition (previousTransition, thenCallback) {
  let _nextMessage, _nextMessageCallback
  function dispatch () {
    if (_nextMessage && _nextMessageCallback) {
      _nextMessageCallback(_nextMessage)
      _nextMessage = null
    }
  }
  previousTransition.requestNextMessage(message => {
    if (message.type === 'resolve') {
      try {
        const result = thenCallback(message.value)
        resolveResult(result, value => {
          _nextMessage = { type: 'resolve', value }
          dispatch()
        }, error => {
          _nextMessage = { type: 'reject', value: error }
          dispatch()
        })
      } catch (error) {
        _nextMessage = { type: 'reject', value: error }
        dispatch()
      }
    } else {
      _nextMessage = message
      dispatch()
    }
  })
  const composit = {
    requestNextMessage: nextMessageCallback => {
      _nextMessageCallback = nextMessageCallback
      dispatch()
    }
  }
  return Object.freeze(composit)
}

function composeCatchTransition (previousTransition, catchCallback) {
  previousTransition.requestNextMessage(message => {
    if (message.type === 'reject') {
      catchCallback(message.value)
    }
  })
}

function composeGenerateTransition (generateFn) {
  let _nextMessage, _nextMessageCallback
  function dispatch () {
    if (_nextMessage && _nextMessageCallback) {
      _nextMessageCallback(_nextMessage)
      _nextMessage = null
    }
  }
  let perform = () => {
    const emitFn = generateFn(
      value => {
        _nextMessage = { type: 'resolve', value }
        dispatch()
      },
      error => {
        _nextMessage = { type: 'reject', value: error }
        dispatch()
      }
    )
    if (emitFn) {
      perform = () => {
        emitFn(value => {
          _nextMessage = { type: 'emit', value }
          dispatch()
        })
      }
      perform()
    }
  }
  const composit = {
    requestNextMessage: nextMessageCallback => {
      perform()
      _nextMessageCallback = nextMessageCallback
      dispatch()
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  if (generateFn) return pipe(undefined, composeGenerateTransition(generateFn))
  const previousTransition = arguments[1]
  function composeOperatorFn (composeTransition) {
    return (callback, addition) => pipe(undefined, composeTransition(
      previousTransition, callback, addition))
  }
  const composit = {
    reduce: composeOperatorFn(composeReduceTransition),
    filter: composeOperatorFn(composeFilterTransition),
    map: composeOperatorFn(composeMapTransition),
    forEach: composeOperatorFn(composeForEachTransition),
    then: composeOperatorFn(composeThenTransition),
    catch: catchCallback => {
      composeCatchTransition(previousTransition, catchCallback)
    }
  }
  return Object.freeze(composit)
}

pipe.resolve = value => {
  return pipe(resolve => { resolve(value) })
}
pipe.reject = error => {
  return pipe((resolve, reject) => { reject(error) })
}
pipe.all = allItems => {
  return pipe((resolve, reject) => {
    const acc = []
    const length = allItems.length
    let count = 0
    let wasRejected = false
    const composeThenFn = idx => value => {
      if (wasRejected) return
      acc[idx] = value
      count += 1
      if (count === length) resolve(acc)
    }
    const composeCatchFn = () => err => {
      if (wasRejected) return
      wasRejected = true
      reject(err)
    }
    allItems.forEach((item, idx) => {
      if (wasRejected) return
      if (item.then && item.catch) {
        item.then(composeThenFn(idx)).catch(composeCatchFn())
      } else {
        composeThenFn(idx)(item)
      }
    })
  })
}
pipe.race = allItems => {
  return pipe((resolve, reject) => {
    let value, error
    const composeThenFn = () => val => {
      if (value || error) return
      value = val
      resolve(val)
    }
    const composeCatchFn = () => err => {
      if (value || error) return
      error = err
      reject(err)
    }
    allItems.forEach(item => {
      if (value || error) return
      if (item.then && item.catch) {
        item.then(composeThenFn()).catch(composeCatchFn())
      } else {
        composeThenFn()(item)
      }
    })
  })
}

pipe.from = collection => {
  return pipe((resolve, reject) => {
    let idx = 0
    return next => {
      if (idx === collection.length) resolve()
      else next(collection[idx++])
    }
  })
}

pipe.buffer = function (size) {
  size = arguments.length === 0 ? Infinity : size
  size = size <= 0 ? 1 : size
  let resolveCallback, rejectCallback, emitCallback
  let messageBuffer = []
  function handleNextMessage () {
    if (messageBuffer.length === 0) return
    const msg = messageBuffer[0]
    if (msg.type === 'emit') {
      if (emitCallback) {
        messageBuffer.splice(0, 1)
        emitCallback(msg.value)
        emitCallback = null
      }
    } else if (msg.type === 'resolve') {
      messageBuffer.splice(0, 1)
      resolveCallback(msg.value)
    } else if (msg.type === 'reject') {
      messageBuffer.splice(0, 1)
      rejectCallback(msg.value)
    }
  }
  function resizeMessageBuffer () {
    if (size === Infinity) return
    let workBuffer = [].concat(messageBuffer)
    workBuffer.reverse()
    let count = 0
    workBuffer = workBuffer.filter(msg => {
      if (msg.type === 'emit') {
        if (count < size) {
          count += 1
          return true
        } else return false
      } else return true
    })
    workBuffer.reverse()
    messageBuffer = workBuffer
  }
  const _pipe = pipe((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
    return nextCb => {
      emitCallback = nextCb
      handleNextMessage()
    }
  })
  const composit = {
    emit: value => {
      messageBuffer.push({ type: 'emit', value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    resolve: value => {
      messageBuffer.push({ type: 'resolve', value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    reject: value => {
      messageBuffer.push({ type: 'reject', value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    pipe: _pipe
  }
  return Object.freeze(composit)
}

pipe.wrap = workerFn => {
  return function (...workerFnArgs) {
    return pipe((resolve, reject) => {
      workerFn(...workerFnArgs, function (err, ...args) {
        if (err) reject(err)
        else resolve(args.length === 1 ? args[0] : args)
      })
    })
  }
}

module.exports = pipe
