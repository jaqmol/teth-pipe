## teth-pipe

Merging promises with functional reactive map/reduce (+ debounce and throttle). Pipes run on backpressure and can be used in backends as well.

``` javascript
// ...
const readFile = pipe.wrap(fs.readFile)
const writeFile = pipe.wrap(fs.writeFile)
// ...
readFile('./package.json', 'utf8')
  .then(packString => JSON.parse(packString))
  .then(pack => pipe((resolve, reject) => {
    const keys = Object.keys(allScripts)
    return next => {
      if (keys.length) next(keys.splice(0, 1)[0])
      else resolve()
    }
  }))
  .filter(lit => !lit.pack.scripts[lit.key])
  .map(lit => {
    lit.pack.scripts[lit.key] = lit.value
    return lit.pack
  })
  .reduce((r, i) => i)
  .then(pack => JSON.stringify(pack, null, 2))
  .then(packString => writeFile('./package.json', packString))
  .then(() => { /* ... */ })
  .catch(console.error)
```

## creating pipes with deferrer and generator

`pipe(<deferrerFn>) -> <generatorFn>` creates a pipe.

- `<deferrerFn>` is a callback that will be called with 2 arguments: `<resolveFn>` and `<rejectFn>`.
- Behaves like it's Promise counterpart.

`<generatorFn>` can be returned from the `<deferrerFn>`.

- Will be called repeatedly with a `<nextFn>` until `<deferrerFn>` resolved or rejected.
- Every `<nextFn>` must be called only once with a value each time `<generatorFn>` is called.
- So that values are emitted as fast as subsequent consumption is performed.
- Example of a generator emitting keys of an object literal as fast as subsequent consumers can process:

  ``` javascript
  pipe((resolve, reject) => {
    const keys = Object.keys(anObjectLiteral)
    return next => {
      if (keys.length) next(keys.splice(0, 1)[0])
      else resolve()
    }
  })
  ```

## operators

`.map(<operate-fn>) -> <pipe>` `.filter(<operate-fn>) -> <pipe>` `.forEach(<operate-fn>) -> <pipe>` `.reduce(<operate-fn>) -> <pipe>` behave like their array counterparts.

`.reduce(<operate-fn>) -> <pipe>` the reduce result is retrieved by chaining a `then()`.

`.then(<operate-fn>) -> <pipe>` `.catch(<fn>)` behave like their Promise counterparts.

`.debounce(<delay>) -> <pipe>` continues the stream of operations only after a firing silence of the previous operation of at least `<delay>` milliseconds.

`.throttle(<delay>) -> <pipe>` limits the events coming from the previous operation to firing in the interval of the given `<delay>`.

## constructor functions

`pipe.resolve(<value>) -> <pipe>` returns a pipe that will resolve with the given value.

`pipe.reject(<error>) -> <pipe>` returns a pipe that will reject with the given error.

`pipe.all(<Array[Thenable]>) -> <pipe>` resolves after all thenables (Promise-compatible asynchronous computations) in the given array did resolve.

- Passes on an array of results.

`pipe.race(<Array[Thenable]>) -> <pipe>` resolves as soon as the first of all the thenables (Promise-compatible asynchronous computations) resolved.

- Passes on the respective result.

`pipe.from(<Array>) -> <pipe>` creates an iterable pipe on which `.map(<fn>)` `.filter(<fn>)` `.forEach(<fn>)` `.reduce(<fn>)` can be used, from an array of values.

`pipe.wrap(<NodeJS-style-callback>) -> <pipe>` wraps a NodeJS style callback function (1st argument error, others results) into a pipe.

- Will resolve with the given arguments in an array (if more than one), with the result value otherwise.
- Will reject on error.

*NOT RECOMMENDED: `pipe.buffer(<size>) -> <buffer>` creates a buffer that keeps maximum the `<size>` amount of emitted values before the consuming operation is retrieving them. If the consumer is too slow and a `<size>` is given, values might be omitted. Without a `<size>` given and a slow consumer the buffer might overflow and crash your application. It's advisable to structure your code so that a buffer is not needed.*

  - *`<buffer>.emit(<value>)` emits a value onto the buffer. The value is stored until a pipe consumer retrieves it or it gets pushed from the buffer by reaching the `<size>` limit.*
  - *`<buffer>.resolve(<value>)` resolves the pipe underneath the buffer.*
  - *`<buffer>.reject(<error>)` rejects the pipe underneath the buffer.*
  - *`<buffer>.pipe` the pipe underneath the buffer.*
