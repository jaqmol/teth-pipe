/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, functional, monadic, promise-compatible streaming framework with backpressure. */

const EMIT = Symbol('EMIT')
const RESOLVE = Symbol('RESOLVE')
const REJECT = Symbol('REJECT')
const CONTINUE = Symbol('CONTINUE')
const TRANSITION = Symbol('TRANSITION')
const NXT_MSG_CB = Symbol('NXT_MSG_CB')

function resolveResult (result, successCb, errorCb) {
  if (result && result.then && result.catch) {
    result.then(successCb).catch(errorCb)
  } else successCb(result)
}

function errorHandler (nextMessageDispatch, state) {
  return error => {
    nextMessageDispatch.value({ type: REJECT, value: error })
    state.isFinished = true
  }
}

function autoDispatch () {
  let callback, callbackIsSet, value, valueIsSet
  function clear () {
    callback = null
    callbackIsSet = false
    value = null
    valueIsSet = false
  }
  clear()
  function resolve () {
    if (callbackIsSet && valueIsSet) callback(value)
  }
  const composit = {
    callback: dispatchCallback => {
      callback = dispatchCallback
      callbackIsSet = true
      resolve()
      return composit
    },
    value: dispatchValue => {
      value = dispatchValue
      valueIsSet = true
      resolve()
      return composit
    },
    clear
  }
  return Object.freeze(composit)
}

function composeReduceTransition (previousTransition, reduceCallback, initialAccumulator) {
  const nextMessageDispatch = autoDispatch()
  const state = { isFinished: false }
  let accumulator = initialAccumulator
  function expectNext () {
    if (state.isFinished) return
    previousTransition.requestNextMessage(message => {
      if (message.type === EMIT) {
        try {
          const result = reduceCallback(accumulator, message.value)
          resolveResult(result, nextAccumulator => {
            accumulator = nextAccumulator
            nextMessageDispatch.value({ type: CONTINUE }).clear()
          }, errorHandler(nextMessageDispatch, state))
        } catch (error) {
          errorHandler(nextMessageDispatch, state)(error)
        }
      } else if (message.type === TRANSITION) {
        previousTransition = message.value
        nextMessageDispatch.value({ type: CONTINUE }).clear()
      } else if (message.type === RESOLVE) {
        nextMessageDispatch.value({ type: RESOLVE, value: accumulator }).clear()
      } else {
        nextMessageDispatch.value(message).clear()
      }
    })
  }
  return Object.freeze({
    requestNextMessage: nextMessageCallback => {
      nextMessageDispatch.callback(nextMessageCallback)
      expectNext()
    }
  })
}

function composeFilterTransition (previousTransition, mapCallback) {
  const nextMessageDispatch = autoDispatch()
  const state = { isFinished: false }
  function expectNext () {
    if (state.isFinished) return
    previousTransition.requestNextMessage(message => {
      if (message.type === EMIT) {
        try {
          const result = mapCallback(message.value)
          resolveResult(result, dispatchMessage => {
            if (dispatchMessage) {
              nextMessageDispatch.value(message).clear()
            } else {
              nextMessageDispatch.value({ type: CONTINUE }).clear()
            }
          }, errorHandler(nextMessageDispatch, state))
        } catch (error) {
          errorHandler(nextMessageDispatch, state)(error)
        }
      } else if (message.type === TRANSITION) {
        previousTransition = message.value
        nextMessageDispatch.value({ type: CONTINUE }).clear()
      } else {
        nextMessageDispatch.value(message).clear()
      }
    })
  }
  return Object.freeze({
    requestNextMessage: nextMessageCallback => {
      nextMessageDispatch.callback(nextMessageCallback)
      expectNext()
    }
  })
}

function composeMapTransition (previousTransition, mapCallback) {
  const nextMessageDispatch = autoDispatch()
  const state = { isFinished: false }
  function expectNext () {
    if (state.isFinished) return
    previousTransition.requestNextMessage(message => {
      if (message.type === EMIT) {
        try {
          const result = mapCallback(message.value)
          resolveResult(result, value => {
            nextMessageDispatch.value({ type: EMIT, value }).clear()
          }, errorHandler(nextMessageDispatch, state))
        } catch (error) {
          errorHandler(nextMessageDispatch, state)(error)
        }
      } else if (message.type === TRANSITION) {
        previousTransition = message.value
        nextMessageDispatch.value({ type: CONTINUE }).clear()
      } else {
        nextMessageDispatch.value(message).clear()
      }
    })
  }
  return Object.freeze({
    requestNextMessage: nextMessageCallback => {
      nextMessageDispatch.callback(nextMessageCallback)
      expectNext()
    }
  })
}

function composeForEachTransition (previousTransition, forEachCallback) {
  const nextMessageDispatch = autoDispatch()
  const state = { isFinished: false }
  function expectNext () {
    if (state.isFinished) return
    previousTransition.requestNextMessage(message => {
      if (message.type === EMIT) {
        forEachCallback(message.value)
        setTimeout(expectNext, 0)
      } else if (message.type === TRANSITION) {
        previousTransition = message.value
        setTimeout(expectNext, 0)
      } else if (message.type === CONTINUE) {
        setTimeout(expectNext, 0)
      } else {
        nextMessageDispatch.value(message).clear()
        state.isFinished = true
      }
    })
  }
  expectNext()
  return Object.freeze({
    requestNextMessage: nextMessageCallback => {
      nextMessageDispatch.callback(nextMessageCallback)
    }
  })
}

function composeThenTransition (previousTransition, thenCallback) {
  const nextMessageDispatch = autoDispatch()
  const state = { isFinished: false }
  function expectNext () {
    if (state.isFinished) return
    previousTransition.requestNextMessage(message => {
      if (message.type === RESOLVE) {
        try {
          const result = thenCallback(message.value)
          if (result && result[NXT_MSG_CB]) {
            const transition = { requestNextMessage: result[NXT_MSG_CB] }
            nextMessageDispatch.value({ type: TRANSITION, value: transition })
          } else {
            resolveResult(result, value => {
              nextMessageDispatch.value({ type: RESOLVE, value })
            }, errorHandler(nextMessageDispatch, state))
          }
        } catch (error) {
          errorHandler(nextMessageDispatch, state)(error)
        }
      } else if (message.type === TRANSITION) {
        previousTransition = message.value
        setTimeout(expectNext, 0)
      } else if (message.type === CONTINUE) {
        setTimeout(expectNext, 0)
      } else {
        nextMessageDispatch.value(message)
      }
    })
  }
  expectNext()
  return Object.freeze({
    requestNextMessage: nextMessageCallback => {
      nextMessageDispatch.callback(nextMessageCallback)
    }
  })
}

function composeCatchTransition (previousTransition, catchCallback) {
  previousTransition.requestNextMessage(message => {
    if (message.type === REJECT) {
      catchCallback(message.value)
    }
  })
}

function composeGenerateTransition (generateFn) {
  let nextMessage, nextMessageCb
  function dispatch () {
    if (nextMessage && nextMessageCb) {
      nextMessageCb(nextMessage)
      nextMessage = null
    }
  }
  let perform = () => {
    const emitFn = generateFn(
      value => {
        nextMessage = { type: RESOLVE, value }
        dispatch()
      },
      error => {
        nextMessage = { type: REJECT, value: error }
        dispatch()
      }
    )
    if (emitFn) {
      perform = () => {
        emitFn(value => {
          nextMessage = { type: EMIT, value }
          dispatch()
        })
      }
      perform()
    }
  }
  const composit = {
    requestNextMessage: nextMessageCallback => {
      perform()
      nextMessageCb = nextMessageCallback
      dispatch()
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  if (generateFn) return pipe(undefined, composeGenerateTransition(generateFn))
  const previousTransition = arguments[1]
  function composeOperatorFn (composeTransition) {
    return (callback, addition) => {
      return pipe(undefined, composeTransition(previousTransition, callback, addition))
    }
  }
  const composit = {
    [NXT_MSG_CB]: previousTransition.requestNextMessage,
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
    if (msg.type === EMIT) {
      if (emitCallback) {
        messageBuffer.splice(0, 1)
        emitCallback(msg.value)
        emitCallback = null
      }
    } else if (msg.type === RESOLVE) {
      messageBuffer.splice(0, 1)
      resolveCallback(msg.value)
    } else if (msg.type === REJECT) {
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
      if (msg.type === EMIT) {
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
      messageBuffer.push({ type: EMIT, value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    resolve: value => {
      messageBuffer.push({ type: RESOLVE, value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    reject: value => {
      messageBuffer.push({ type: REJECT, value })
      resizeMessageBuffer()
      handleNextMessage()
    },
    pipe: _pipe
  }
  return Object.freeze(composit)
}
pipe.event = function (ctxSendFn, basePattern) {
  if (arguments.length === 1) {
    return contPattern => pipe.event(ctxSendFn, contPattern)
  } else if (arguments.length === 2) {
    let send = e => {
      const buffer = pipe.buffer()
      ctxSendFn(Object.assign(
        {},
        basePattern,
        { event: buffer.pipe }
      ))
      send = buffer.emit
      send(e)
    }
    return event => { send(event) }
  } else {
    throw new Error('Argument(s) missing.')
  }
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
