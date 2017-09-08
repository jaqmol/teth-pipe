/* Copyright 2017 Ronny Reichmann */
/* global test expect */

const pipe = require('./pipe')
const runHeavyDutyTests = false
// IMPORTANT TODO: Rejection and error catching needs to be tested more thoroughly in all partial concerns

test('singular synchronous pipe', done => {
  pipe((resolve, reject) => { resolve(42) })
    .then(result => {
      expect(result).toBe(42)
      done()
    })
})
test('synchronous pipe', done => {
  pipe((resolve, reject) => { resolve(1) })
    .then(result => result + 1)
    .then(result => result + 2)
    .then(result => result + 3)
    .then(result => {
      expect(result).toBe(7)
      done()
    })
})
test('asynchronous pipe', done => {
  function asyncResolve (resolve, reject) {
    setTimeout(() => { resolve(11) }, 121)
  }
  pipe(asyncResolve)
    .then(result => result + 33)
    .then(result => {
      expect(result).toBe(44)
      done()
    })
})
test('pipe reject', done => {
  const e = new Error('Pipe test error')
  function asyncResolve (resolve, reject) {
    reject(e)
  }
  pipe(asyncResolve)
    .then(result => {
      expect(false).toBe(true)
      done()
    })
    .catch(error => {
      expect(error).toBe(e)
      done()
    })
})
test('pipe error', done => {
  const e = new Error('Pipe test error')
  pipe((resolve, reject) => { resolve(1) })
    .then(result => result + 1)
    .then(result => result + 2)
    .then(result => {
      throw e
    })
    .then(result => result + 3)
    .then(result => result + 4)
    .then(result => {
      expect(false).toBe(true)
      done()
    })
    .catch(error => {
      expect(error).toBe(e)
      done()
    })
})
test('then return pipe and Promise', done => {
  pipe(resolve => { resolve(1) })
    .then(result => pipe(resolve => {
      setTimeout(() => { resolve(result + 1) }, 11)
    }))
    .then(result => new Promise(resolve => {
      setTimeout(() => { resolve(result + 2) }, 22)
    }))
    .then(result => pipe(resolve => {
      setTimeout(() => { resolve(result + 3) }, 33)
    }))
    .then(result => {
      expect(result).toBe(7)
      done()
    })
    .catch(err => {
      expect(err).toBe(null)
      done()
    })
})
test('pipe.resolve', done => {
  pipe.resolve(13)
    .then(result => {
      expect(result).toBe(13)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('pipe.reject', done => {
  const e = new Error('Pipe reject test')
  pipe.reject(e)
    .then(() => {
      expect(false).toBe(true)
      done()
    })
    .catch(error => {
      expect(error).toBe(e)
      done()
    })
})
test('pipe.all resolve', done => {
  const allPipes = [
    pipe(resolve => {
      setTimeout(() => { resolve(111) }, 33)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(222) }, 22)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(333) }, 11)
    })
  ]
  pipe.all(allPipes)
    .then(allResults => {
      expect(allResults).toEqual([111, 222, 333])
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('pipe.all reject', done => {
  const e = new Error('Pipe all reject test')
  const allPipes = [
    pipe(resolve => {
      setTimeout(() => { resolve(111) }, 33)
    }),
    pipe((r, reject) => {
      setTimeout(() => { reject(e) }, 22)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(333) }, 11)
    })
  ]
  pipe.all(allPipes)
    .then(allResults => {
      expect(false).toBe(true)
      done()
    })
    .catch(error => {
      expect(error).toBe(e)
      done()
    })
})
test('pipe.race resolve', done => {
  const allPipes = [
    pipe(resolve => {
      setTimeout(() => { resolve(111) }, 33)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(222) }, 22)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(333) }, 11)
    })
  ]
  pipe.race(allPipes)
    .then(firstResult => {
      expect(firstResult).toBe(333)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('pipe.race reject', done => {
  const e = new Error('Pipe race reject test')
  const allPipes = [
    pipe(resolve => {
      setTimeout(() => { resolve(333) }, 33)
    }),
    pipe((r, reject) => {
      setTimeout(() => { reject(e) }, 11)
    }),
    pipe(resolve => {
      setTimeout(() => { resolve(555) }, 22)
    })
  ]
  pipe.all(allPipes)
    .then(allResults => {
      expect(false).toBe(true)
      done()
    })
    .catch(error => {
      expect(error).toBe(e)
      done()
    })
})
test('resolve with undefined value', done => {
  pipe(resolve => {
    setTimeout(() => { resolve() }, 33)
  }).then(() => {
    expect(true).toBe(true)
    done()
  }).catch(() => {
    expect(false).toBe(true)
    done()
  })
})
test('from iterable and forEach', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7]
  let sum = 0
  pipe.from(iterable)
    .forEach(num => {
      sum += num
    })
    .then(() => {
      expect(sum).toBe(28)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(false).toBe(true)
      done()
    })
})
test('reduce from inner pipe', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7]
  let firstSum
  pipe.from(iterable)
    .reduce((acc, num) => acc + num, 0)
    .then(sum => {
      firstSum = sum
      return pipe.from(iterable)
    })
    .reduce((acc, num) => acc + num, 0)
    .then(sum => {
      return [firstSum, sum]
    })
    .then(results => {
      expect(results[0]).toBe(results[1])
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('map from inner pipe', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7]
  let sum
  pipe.from(iterable)
    .reduce((acc, num) => acc + num, 0)
    .then(result => {
      sum = result
      return pipe.from(iterable)
    })
    .map(num => num * sum)
    .reduce((acc, result) => result, 0)
    .then(result => {
      expect(result).toBe(196)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('filter from inner pipe', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21]
  const oddsOnly = iterable.filter(num => num % 2)
  pipe.from(iterable)
    .reduce((acc, num) => acc + num, 0)
    .then(() => pipe.from(iterable))
    .filter(num => num % 2)
    .reduce((acc, num) => acc.concat([num]), [])
    .then(result => {
      expect(result).toEqual(oddsOnly)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('forEach from inner pipe', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21]
  const collector = []
  pipe.from(iterable)
    .reduce((acc, num) => acc + num, 0)
    .then(() => pipe.from(iterable))
    .forEach(num => { collector.push(num) })
    .then(() => {
      expect(collector).toEqual(iterable)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('reduce from filter', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21]
  const oddsOnly = iterable.filter(num => num % 2)
  pipe.from(iterable)
    .filter(num => num % 2)
    .reduce((acc, num) => acc.concat([num]), [])
    .then(results => {
      expect(results).toEqual(oddsOnly)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('reduce from map', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21]
  const multitudes = iterable.map(num => num * 10)
  pipe.from(iterable)
    .map(num => num * 10)
    .reduce((acc, num) => acc.concat([num]), [])
    .then(results => {
      expect(results).toEqual(multitudes)
      done()
    })
    .catch(e => {
      console.error(e)
      expect(e).toBe(null)
      done()
    })
})
test('async emit next and forEach', done => {
  const allItems = [1, 2, 3, 4, 5, 6, 7]
  function asyncPush (resolve, reject) {
    let idx = 0
    let duration = 7
    return next => {
      if (idx === allItems.length) {
        setTimeout(() => { resolve() }, duration)
      } else {
        setTimeout(() => { next(allItems[idx++]) }, duration)
      }
    }
  }
  let sum = 0
  pipe(asyncPush)
    .forEach(num => {
      sum += num
    })
    .then(() => {
      expect(sum).toBe(28)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
if (runHeavyDutyTests) {
  test('heavy duty emit next and forEach', done => {
    let idx = 0
    function asyncPush (resolve, reject) {
      const maxValue = 1000
      return next => {
        if (idx === maxValue) resolve()
        else next(idx++)
      }
    }
    pipe(asyncPush)
      .forEach(item => {
        expect(item - 1).not.toBe(idx)
      })
      .then(() => { done() })
      .catch(error => {
        console.error(error)
        expect(false).toBe(true)
        done()
      })
  })
}
test('simple map with forEach', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7]
  let sum = 0
  pipe.from(iterable)
    .map(num => num * 10)
    .forEach(num => {
      sum += num
    })
    .then(() => {
      expect(sum).toBe(280)
      done()
    })
    .catch(error => {
      console.error(error)
      expect(false).toBe(true)
      done()
    })
})
test('multiple map with forEach', done => {
  const iterable = [1, 2, 3, 4, 5, 6, 7]
  let sum = 0
  pipe.from(iterable)
    .map(num => {
      // console.log('1st MAP NUM:', num * 10)
      return num * 10
    })
    .map(num => {
      // console.log('2nd MAP NUM:', num * 10)
      return num * 10
    })
    .map(num => {
      // console.log('3rd MAP NUM:', num * 10)
      return num * 10
    })
    .forEach(num => {
      // console.log('NUM:', num)
      sum += num
    })
    .then(() => {
      expect(sum).toBe(28000)
      done()
    })
    .catch(error => {
      console.error(error)
      expect(false).toBe(true)
      done()
    })
})
test('async map with forEach', done => {
  const iterable = [11, 22, 33, 44, 55, 66, 77]
  pipe.from(iterable)
    .map(item => pipe(resolve => {
      setTimeout(() => { resolve(item + 3) }, 3)
    }))
    .map(item => pipe(resolve => {
      setTimeout(() => { resolve(item + 6) }, 5)
    }))
    .forEach(item => {
      expect(iterable.indexOf(item - 9)).not.toBe(-1)
    })
    .then(() => { done() })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('filter with forEach', done => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const output = [1, 3, 5, 7, 9]
  pipe.from(input)
    .filter(item => Math.abs(item % 2) === 1)
    .forEach(item => {
      const idx = output.indexOf(item)
      expect(idx).not.toBe(-1)
      output.splice(idx, 1)
    })
    .then(() => {
      expect(output.length).toBe(0)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('async filter with forEach', done => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const output = [1, 3, 5, 7, 9]
  pipe.from(input)
    .filter(item => pipe(resolve => {
      setTimeout(() => { resolve(Math.abs(item % 2) === 1) }, 3)
    }))
    .forEach(item => {
      const idx = output.indexOf(item)
      expect(idx).not.toBe(-1)
      output.splice(idx, 1)
    })
    .then(() => {
      expect(output.length).toBe(0)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('reduce with resolve', done => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  pipe.from(input)
    .reduce((s, n) => s + n, 0)
    // .forEach(sum => sum)
    .then(sum => {
      expect(sum).toBe(45)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('async reduce with resolve', done => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  pipe.from(input)
    .reduce((s, n) => pipe(resolve => {
      setTimeout(() => { resolve(s + n) }, 11)
    }), 0)
    .then(sum => {
      expect(sum).toBe(45)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('complex streaming with resolve', done => {
  const inputA = [2, 4, 6, 8, 10]
  const inputB = [1, 3, 5, 7, 9]
  let idx = 0
  pipe.from(inputA)
    .map(a => ({ a, b: inputB[idx++] }))
    .map(lit => lit.a * lit.b)
    .map(aSum => aSum * 10)
    .map(num => num / 2)
    .reduce((acc, num) => acc + num, 0)
    .then(sum => {
      expect(sum).toBe(950)
      done()
    })
    .catch(() => {
      expect(false).toBe(true)
      done()
    })
})
test('buffer', done => {
  const allDelays = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]
  const buffer = pipe.buffer()
  let counter = 1
  allDelays.forEach((delay, idx) => {
    setTimeout(() => {
      buffer.emit({ counter: counter++ })
      if ((idx + 1) === allDelays.length) {
        buffer.resolve()
      }
    }, delay)
  })
  buffer.pipe
    .forEach(event => {
      expect(event.counter <= allDelays.length).toBe(true)
    })
    .then(() => {
      done()
    })
    .catch(error => {
      console.error(error)
      expect(false).toBe(true)
      done()
    })
})
test('sized buffer', done => {
  const allDelays = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]
  const buffer = pipe.buffer(5)
  allDelays.forEach((delay, idx) => {
    buffer.emit({ delay })
    if ((idx + 1) === allDelays.length) {
      buffer.resolve()
    }
  })
  let counter = 0
  buffer.pipe
    .forEach(event => counter++)
    .then(() => {
      expect(counter).toBe(5)
      done()
    })
    .catch(error => {
      console.error(error)
      expect(false).toBe(true)
      done()
    })
})
test('pipe.event', done => {
  function receiveSendFn (msg) {
    let count = 0
    msg.event
      .forEach(event => {
        count++
        if (count === 100) {
          expect(true).toBe(true)
          done()
        }
      })
  }
  const pattern = { role: 'event' }
  const eventEmitterFn = pipe.event(receiveSendFn)(pattern)
  for (var i = 0; i < 100; i++) {
    eventEmitterFn({ type: 'test', index: i })
  }
})
// test('wrapping of node callback functions', done => {
//   function positiveTestFn (arg1, arg2, arg3, callback) {
//     callback(undefined, arg1 + arg2 + arg3)
//   }
//   function negativeTestFn (arg1, callback) {
//     callback('TEST-ERROR')
//   }
//   const wrappedPositiveTestFn = pipe.wrap(positiveTestFn)
//   const wrappedNegativeTestFn = pipe.wrap(negativeTestFn)
//   let count = 0
//   function doneIfDone () {
//     count += 1
//     if (count === 2) done()
//   }
//   wrappedPositiveTestFn(1, 3, 5)
//     .then(result => {
//       expect(result).toBe(9)
//       doneIfDone()
//     })
//   wrappedNegativeTestFn(9)
//     .catch(err => {
//       if (err) {
//         expect(err).toBe('TEST-ERROR')
//       } else {
//         expect(false).toBe(true)
//       }
//       doneIfDone()
//     })
// })
