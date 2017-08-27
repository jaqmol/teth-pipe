/* Copyright 2017 Ronny Reichmann */
/* PIPE, minimal, promise-compatible streaming framework */

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
  if (state.performResolve) state.performResolve(value)
  else { state.performResolve = cb => { cb(value) } }
}
function handlePerformReject (state, error) {
  if (state.performReject) state.performReject(error)
  else { state.performReject = cb => { cb(error) } }
}

function generateUpstream (generateFn) {
  const state = {}
  const composit = {
    pull: callback => {
      generateFn(
        result => handlePerformResolve(state, result),
        error => handlePerformReject(state, error),
        item => processResultValue(item, (error, value) => {
          console.log('pull push item', item)
          if (error) handlePerformReject(state, error)
          else callback(value)
        })
      )
    },
    resolve: callback => {
      generateFn(
        result => processResultValue(result, (error, value) => {
          if (error) handlePerformReject(state, error)
          else callback(value)
        }),
        error => handlePerformReject(state, error))
    },
    reject: callback => {
      if (state.performReject) state.performReject(callback)
      else { state.performReject = callback }
    }
  }
  return Object.freeze(composit)
}

function pipeUpstream (previousUpstream, state) {
  const composit = {
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
      forEach: forEachCallback => {
        previousUpstream.pull(value => {
          try {
            forEachCallback(value)
          } catch (error) {
            handlePerformReject(state, error)
          }
        })
        currentUpstream.resolveConcludingPull = resolveCallback => {
          console.log('resolveConcludingPull resolveCallback ->', resolveCallback)
        }
        return pipe(undefined, currentUpstream)
      },
      then: thenCallback => {
        const resolveCallback = value => {
          try {
            const result = thenCallback(value)
            processResultValue(result, (error, value) => {
              if (error) handlePerformReject(state, error)
              else handlePerformResolve(state, value)
            })
          } catch (error) {
            handlePerformReject(state, error)
          }
        }
        previousUpstream.resolve(resolveCallback)
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
pipe.from = collection => {
  return pipe((resolve, reject, push) => {
    collection.forEach(push)
    resolve()
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
