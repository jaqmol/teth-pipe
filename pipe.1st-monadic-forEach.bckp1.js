/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, promise-compatible streaming framework */

// const GENERATE = Symbol()
// const PIPE = Symbol()
const EMIT = Symbol()

function processResultValue (result, callback) {
  if (result && result.then && result.catch) {
    // if (result.forEach) {
    //   result
    //     .forEach(value => { callback(undefined, value) })
    //     .then(value => { callback(undefined, value) })
    //     .catch(error => { callback(error) })
    // } else {
    result
      .then(value => { callback(undefined, value) })
      .catch(error => { callback(error) })
    // }
  } else callback(undefined, result)
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

function generateMetaPipe (generateFn) {
  const resolveState = {}
  const rejectState = {}
  const emitState = {}
  let performEmit, performThen
  function performEmitFn (nextCallback) {
    if (!emitState.isFinished) {
      setTimeout(() => {
        emitState.emitFn(nextResult => {
          processResultValue(nextResult, (error, nextValue) => {
            if (error) {
              handleRejectError(rejectState, error)
              emitState.isFinished = true
            } else nextCallback(nextValue)
          })
        })
      }, 0)
    }
    return emitState.isFinished
  }
  function initEmitStateFn (nextCallback) {
    performThen = emittingPerformThen
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
    emitState.emitFn = generateFn(resolveFn, rejectFn)
    performEmit = performEmitFn
    return performEmit(nextCallback)
  }
  performEmit = initEmitStateFn
  function nonEmittingPerformThen (thenCallback) {
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
  function emittingPerformThen (thenCallback) {
    handleResolveCallback(resolveState, thenCallback)
  }
  performThen = nonEmittingPerformThen
  const composit = {
    [EMIT]: nextCallback => performEmit(nextCallback),
    then: thenCallback => performThen(thenCallback),
    catch: catchCallback => {
      handleRejectCallback(rejectState, catchCallback)
    }
  }
  return Object.freeze(composit)
}

function composeThenFn (previousPipe, rejectState) {
  return thenCallback => {
    const metaResolveState = {}
    previousPipe.then(previousValue => {
      const result = thenCallback(previousValue)
      processResultValue(result, (error, value) => {
        if (error) handleRejectError(rejectState, error)
        else handleResolveValue(metaResolveState, value)
      })
    })
    const metaPipe = {
      then: metaThenCallback => {
        handleResolveCallback(metaResolveState, metaThenCallback)
      },
      catch: metaCatchCallback => {
        handleRejectCallback(rejectState, metaCatchCallback)
        previousPipe.catch(metaCatchCallback)
      }
    }
    return pipe(undefined, Object.freeze(metaPipe))
  }
}

function flowPipe (previousPipe) {
  const rejectState = {}
  const composit = {
    forEach: forEachCallback => {
      const retrieveNext = () => {
        const isFinished = previousPipe[EMIT](value => {
          forEachCallback(value)
          if (!isFinished) retrieveNext()
        })
      }
      retrieveNext()
      const metaPipe = {
        then: previousPipe.then,
        catch: previousPipe.catch
      }
      return pipe(undefined, Object.freeze(metaPipe))
    },
    then: composeThenFn(previousPipe, rejectState),
    catch: catchCallback => {
      handleRejectCallback(rejectState, catchCallback)
      previousPipe.catch(catchCallback)
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  return generateFn
    ? pipe(undefined, generateMetaPipe(generateFn))
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

// pipe.emit = emitCallback => {
//   emitCallback[EMIT] = EMIT
//   return emitCallback
// }
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
