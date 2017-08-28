/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, functional, monadic, promise-compatible streaming framework with backpressure. */

function processResultValue (result, callback) {
  if (result && result.then && result.catch) {
    // if (result.forEach) {
    //   result
    //     .forEach(value => { callback(undefined, value) })
    //     .then(value => { callback(undefined, value) })
    //     .catch(error => { callback(error) })
    // } else {
    result
      .then(value => { callback(null, value) })
      .catch(error => { callback(error) })
    // }
  } else callback(null, result)
}

function handleRejectError (rejectState, error) {
  if (rejectState.callback) rejectState.callback(error)
  else rejectState.error = error
}
function handleRejectCallback (rejectState, callback) {
  if (rejectState.error) callback(rejectState.error)
  else rejectState.callback = callback
}

function handleResolveValue (resolveState, value) {
  if (resolveState.callback) resolveState.callback(value)
  else resolveState.value = value
}
function handleResolveCallback (resolveState, callback) {
  if (resolveState.value) callback(resolveState.value)
  else resolveState.callback = callback
}

function generateEmitter (generateFn, resolveState, rejectState, emitState) {
  let performEmit, onEmitCallback
  function performEmitFn (nextCallback) {
    if (!emitState.isFinished) {
      emitState.emitFn(nextResult => {
        processResultValue(nextResult, (error, nextValue) => {
          if (error) {
            handleRejectError(rejectState, error)
            emitState.isFinished = true
          } else nextCallback(nextValue, emitState.isFinished)
        })
      })
    }
  }
  function initEmitStateFn (nextCallback) {
    onEmitCallback()
    const resolveFn = result => {
      processResultValue(result, (error, value) => {
        if (error) handleRejectError(rejectState, error)
        else handleResolveValue(resolveState, value)
        emitState.isFinished = true
      })
    }
    const rejectFn = error => {
      handleRejectError(rejectState, error)
      emitState.isFinished = true
    }
    emitState.emitFn = generateFn(resolveFn, resolveState, rejectFn)
    performEmit = performEmitFn
    setTimeout(() => performEmit(nextCallback), 0)
  }
  performEmit = initEmitStateFn
  return Object.freeze({
    onEmit: callback => { onEmitCallback = callback },
    callback: nextCallback => performEmit(nextCallback)
  })
}
function generateResolver (generateFn, rejectState, resolveState, onEmit) {
  let performResolve
  function nonEmittingPerformResolve (thenCallback) {
    const resolveFn = result => {
      processResultValue(result, (error, value) => {
        if (error) handleRejectError(rejectState, error)
        else thenCallback(value)
      })
    }
    const rejectFn = error => {
      handleRejectError(rejectState, error)
    }
    generateFn(resolveFn, rejectFn)
  }
  function emittingPerformResolve (resolveCallback) {
    handleResolveCallback(resolveState, resolveCallback)
  }
  performResolve = nonEmittingPerformResolve
  return Object.freeze({
    onEmitCallback: () => { performResolve = emittingPerformResolve },
    callback: resolveCallback => performResolve(resolveCallback)
  })
}
function generateMetaFlow (generateFn) {
  const resolveState = {}
  const rejectState = {}
  const emitState = {}
  const resolver = generateResolver(generateFn, rejectState, resolveState)
  const emitter = generateEmitter(generateFn, resolveState, rejectState, emitState)
  emitter.onEmit(resolver.onEmitCallback)
  const composit = {
    emit: emitter.callback,
    resolve: resolver.callback,
    reject: rejectCallback => {
      handleRejectCallback(rejectState, rejectCallback)
    }
  }
  return Object.freeze(composit)
}

function composeThenFn (previousMetaFlow, rejectState) {
  return thenCallback => {
    const resolveState = {}
    previousMetaFlow.resolve(previousValue => {
      const result = thenCallback(previousValue)
      processResultValue(result, (error, value) => {
        if (error) handleRejectError(rejectState, error)
        else handleResolveValue(resolveState, value)
      })
    })
    const metaFlow = {
      resolve: metaResolveCallback => {
        handleResolveCallback(resolveState, metaResolveCallback)
      },
      reject: metaRejectCallback => {
        handleRejectCallback(rejectState, metaRejectCallback)
        previousMetaFlow.reject(metaRejectCallback)
      }
    }
    return pipe(undefined, Object.freeze(metaFlow))
  }
}

function composeForEachFn (previousMetaFlow) {
  return forEachCallback => {
    const retrieveNext = () => {
      previousMetaFlow.emit((value, isFinished) => {
        forEachCallback(value)
        if (!isFinished) retrieveNext()
      })
    }
    retrieveNext()
    const metaFlow = {
      resolve: previousMetaFlow.resolve,
      reject: previousMetaFlow.reject
    }
    return pipe(undefined, Object.freeze(metaFlow))
  }
}
function composeReduceFn (previousMetaFlow) {
  return (reduceCallback, accumulator) => {
    const retrieveNext = () => {
      previousMetaFlow.emit((value, isFinished) => {
        accumulator = reduceCallback(accumulator, value)
        if (!isFinished) retrieveNext()
      })
    }
    retrieveNext()
    const metaFlow = {
      resolve: resolveCallback => previousMetaFlow.resolve(
        () => resolveCallback(accumulator)),
      reject: previousMetaFlow.reject
    }
    return pipe(undefined, Object.freeze(metaFlow))
  }
}

function flowPipe (previousMetaFlow) {
  const rejectState = {}
  const composit = {
    forEach: composeForEachFn(previousMetaFlow),
    map: mapCallback => {
      let emitState = {}
      const retrieveNext = () => {
        previousMetaFlow.emit((value, isFinished) => {
          const result = mapCallback(value)
          processResultValue(result, (error, value) => {
            if (error) handleRejectError(rejectState, error)
            else {
              if (emitState.nextCallback) {
                console.log('previousMetaFlow.emit -> emitState.nextCallback')
                emitState.nextCallback(value)
                emitState = {}
                if (!isFinished) retrieveNext()
              } else {
                console.log('previousMetaFlow.emit -> emitState.nextValue')
                emitState.nextValue = value
                emitState.isFinished = isFinished
              }
            }
          })
        })
      }
      retrieveNext()
      const metaFlow = {
        emit: nextCallback => {
          if (emitState.nextValue) {
            console.log('emit: nextCallback -> emitState.nextValue')
            nextCallback(emitState.nextValue)
            if (emitState.isFinished) {
              emitState = {}
              retrieveNext()
            }
          } else {
            console.log('emit: nextCallback -> emitState.nextCallback')
            emitState.nextCallback = nextCallback
          }
        },
        resolve: previousMetaFlow.resolve,
        reject: previousMetaFlow.reject
      }
      return pipe(undefined, Object.freeze(metaFlow))
    },
    reduce: composeReduceFn(previousMetaFlow),
    then: composeThenFn(previousMetaFlow, rejectState),
    catch: catchCallback => {
      handleRejectCallback(rejectState, catchCallback)
      previousMetaFlow.reject(catchCallback)
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  return generateFn
    ? pipe(undefined, generateMetaFlow(generateFn))
    : flowPipe(arguments[1])
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
