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

function composeStatePistons () {
  function piston () {
    let value, callback, loadRelease, callbackRelease, _didLoad
    const release = () => callback(value)
    const nilfn = () => {}
    const composit = {
      load: loadValue => {
        value = loadValue
        callbackRelease = release
        loadRelease()
        _didLoad = true
        return composit
      },
      fire: fireCallback => {
        callback = fireCallback
        loadRelease = release
        callbackRelease()
        return composit
      },
      didLoad: () => _didLoad,
      reset: () => {
        value = undefined
        callback = undefined
        loadRelease = nilfn
        callbackRelease = nilfn
        _didLoad = false
        return composit
      }
    }
    return Object.freeze(composit.reset())
  }
  return Object.freeze({
    resolve: piston(),
    reject: piston()
  })
}

function generatorStream (generateFn) {
  const statePistons = composeStatePistons()
  let emitCallback, performEmit, performResolve
  const emitter = {
    requestValue: nextCallback => {
      emitCallback(value => {
        nextCallback(value, statePistons.resolve.didLoad())
      })
    },
    initialize: nextCallback => {
      performResolve = statePistons.resolve.fire
      const resolveFn = statePistons.resolve.load
      const rejectFn = statePistons.reject.load
      emitCallback = generateFn(resolveFn, rejectFn)
      performEmit = emitter.requestValue
      performEmit(nextCallback)
    }
  }
  const resolveThenable = resolveCallback => {
    const resolveFn = value => {
      statePistons.resolve.load(value).fire(resolveCallback)
    }
    const rejectFn = statePistons.reject.load
    generateFn(resolveFn, rejectFn)
  }
  performEmit = emitter.initialize
  performResolve = resolveThenable
  const composit = {
    emit: nextCallback => performEmit(nextCallback),
    resolve: resolveCallback => performResolve(resolveCallback),
    reject: statePistons.reject.fire
  }
  return Object.freeze(composit)
}

function composeThenFn (upstream, statePistons) {
  return thenCallback => {
    upstream.resolve(previousValue => {
      const result = thenCallback(previousValue)
      processResultValue(result, (error, value) => {
        if (error) statePistons.reject.load(value)
        else statePistons.resolve.load(value)
      })
    })
    const stream = {
      resolve: statePistons.resolve.fire,
      reject: rejectCallback => {
        statePistons.reject.fire(rejectCallback)
        upstream.reject(rejectCallback)
      }
    }
    return pipe(undefined, Object.freeze(stream))
  }
}

function emitUntilFinished (upstream, statePistons, callback) {
  // TODO: The stability of this solution needs to be tested in different browsers
  //       Alternatively use setTimeout(emitNext, 0) in each recursion -> much slower
  function isCallStackSizeExceededError (error) {
    const msg = error.message.toLowerCase()
    return (msg.indexOf('maximum') > -1) &&
      (msg.indexOf('call') > -1) &&
      (msg.indexOf('stack') > -1) &&
      (msg.indexOf('size') > -1) &&
      (msg.indexOf('exceeded') > -1)
  }
  function emitNext () {
    upstream.emit((value, didFinish) => {
      callback(value)
      if (!didFinish) {
        try {
          emitNext()
        } catch (error) {
          if (isCallStackSizeExceededError(error)) setTimeout(emitNext, 0)
          else statePistons.reject.load(error)
        }
      }
    })
  }
  emitNext()
}

function conduit (upstream) {
  const statePistons = composeStatePistons()
  const composit = {
    forEach: forEachCallback => {
      emitUntilFinished(upstream, statePistons, forEachCallback)
      const stream = {
        resolve: upstream.resolve,
        reject: upstream.reject
      }
      return pipe(undefined, Object.freeze(stream))
    },
    then: composeThenFn(upstream, statePistons),
    catch: catchCallback => {
      statePistons.reject.fire(catchCallback)
      upstream.reject(catchCallback)
    }
  }
  return Object.freeze(composit)
}

function pipe (generateFn) {
  return generateFn
    ? pipe(undefined, generatorStream(generateFn))
    : conduit(arguments[1])
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
