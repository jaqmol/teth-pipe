/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, promise-compatible streaming framework */

const GENERATE = Symbol()
const PIPE = Symbol()
const EMIT = Symbol()

function processResultValue (result, callback) {
  if (result && result.then && result.catch) {
    if (result.forEach) {
      result
        .forEach(value => { callback(undefined, value) })
        .then(value => { callback(undefined, value) })
        .catch(error => { callback(error) })
    } else {
      result
        .then(value => { callback(undefined, value) })
        .catch(error => { callback(error) })
    }
  } else callback(undefined, result)
}

function handlePerformResolve (state, value) {
  if (state.performResolve) {
    state.performResolve(value)
    state.resolved = true
  } else {
    state.performResolve = cb => {
      cb(value)
      state.resolved = true
    }
  }
}
function handlePerformReject (state, error) {
  if (state.performReject) {
    state.performReject(error)
    state.rejected = true
  } else {
    state.performReject = cb => {
      cb(error)
      state.rejected = true
    }
  }
}

function generateUpstream (generateFn) {
  const state = {}
  const composit = {
    type: GENERATE,
    resolve: resolveCallback => {
      if (state.performEmit) {
        if (state.performResolve) state.performResolve(resolveCallback)
        else { state.performResolve = resolveCallback }
      } else {
        generateFn(
          result => processResultValue(result, (error, value) => {
            if (error) handlePerformReject(state, error)
            else resolveCallback(value)
          }),
          error => handlePerformReject(state, error))
      }
    },
    reject: rejectCallback => {
      if (state.performReject) state.performReject(rejectCallback)
      else { state.performReject = rejectCallback }
    },
    next: nextCallback => {
      if (!state.performEmit) {
        const emitCallback = generateFn(
          result => processResultValue(result, (error, value) => {
            if (error) handlePerformReject(state, error)
            else handlePerformResolve(state, value)
          }),
          error => handlePerformReject(state, error))
        if (emitCallback && (emitCallback[EMIT] === EMIT)) {
          state.performEmit = nextCb => emitCallback(nextCb)
          state.performEmit(nextCallback)
        } else {
          throw new Error('To emit values return pipe.emit(<emitter-function>) from generator function')
        }
        console.log('Configured for emitting')
      }
      console.log('Performing next emit ...')
      state.performEmit(nextCallback)
    }
  }
  return Object.freeze(composit)
}

function pipeUpstream (previousUpstream, state) {
  const composit = {
    type: PIPE,
    resolve: callback => {
      if (state.performResolve) state.performResolve(callback)
      else { state.performResolve = callback }
    },
    reject: callback => {
      if (state.performReject) state.performReject(callback)
      else {
        state.performReject = callback
        previousUpstream.reject(callback)
      }
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  if (generateFn) return pipe(undefined, generateUpstream(generateFn))
  else {
    const previousUpstream = arguments[1]
    const state = {}
    const currentUpstream = pipeUpstream(previousUpstream, state)
    const composit = {
      // forEach: forEachCallback => {
      //
      // },
      then: thenCallback => {
        previousUpstream.resolve(value => {
          try {
            const result = thenCallback(value)
            processResultValue(result, (error, value) => {
              if (error) handlePerformReject(state, error)
              else handlePerformResolve(state, value)
            })
          } catch (error) {
            handlePerformReject(state, error)
          }
        })
        return pipe(undefined, currentUpstream)
      },
      catch: previousUpstream.reject,
      currentUpstream
    }
    return Object.freeze(composit)
  }
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

pipe.emit = emitCallback => {
  emitCallback[EMIT] = EMIT
  return emitCallback
}
pipe.from = collection => {
  return pipe((resolve, reject) => {
    let idx = 0
    return pipe.emit(next => {
      if (idx === collection.length) resolve()
      else next(collection[idx++])
    })
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
