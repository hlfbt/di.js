# DI.js

[![npm (tag)](https://img.shields.io/npm/v/@halfbit/di/latest.svg)][npm-link]

DI.js is a simple yet extensible parameter dependency injection written in vanilla Javascript.

### Usage example

Providable resources are called `Parameter`, an evaluation context is called `Context`.
A `Context` can evaluate either a parameter name or the function which it will try to provide with all its parameters.
A most basic usage would look like this:
```js
import di from 'di';

let context = new di.Context();
context.addParameter('dog', { name: "Wooffers", bark: console.log.bind(window, 'Woof!') });

// No need for ugly ['dependency', function (dependency) {}] syntax
// Outputs 'Woof!' on the console!
context.evaluate(dog => dog.bark());
```
Under the hood, DI.js uses the functions `toString` method and some RegExp trickery to parse out all parameters.
It works with named, anonymous and arrow functions, and supports default as well as rest parameters.
The only current caveat is that it fails when the *last* parameter has a function as default:
```js
// Will fail with 'SyntaxError: Unexpected end of input'
context.evaluate((a, b = () => {}) => console.log(a, b));
// Works just fine
context.evaluate((a, b = () => {}, c, d = '', ...e) => console.log(a, b, c, d, e));
```

### Typing and custom adapters
DI.js offers type conversion via `Adapter`s.
An example would look like this:
```js
context.addAdapter('json', JSON.stringify);

// Returns '{"name":"Woofers"}'
context.evaluate("dog_json");
```

An `Adapter` has a type that it produces and at least one transforming function.

It can also have multiple transforming functions for different input types:
```js
context.addAdapter('str', String);
// Returns '[object Object]'
context.evaluate("dog_str");

// The third parameter is a fallback that is called if no matching input type is found
context.addAdapter('str', { 'object': JSON.stringify }, String);

// Returns '{"name":"Woofers"}'
context.evaluate("dog_str");
```

You might have noticed that the input type used here is `'object'` and that we never provided a type together with the `dog` `Parameter`.
We can actually specify our own type for `Parameter`s to enable for even fancier `Adapter`s:
```js
context.addParameter('dog', { name: "Wooffers", bark: console.log.bind(window, 'Woof!') }, 'dog');
context.addParameter('neighboursCat', { name: "Spotty", meow: console.log.bind(window, 'meow~') }, 'cat');

context.addAdapter('call', { 'dog': d => d.bark, 'cat': c => c.meow });

// 'Woof!'
context.evaluate("dog_call")();
// 'meow~'
context.evaluate("neighboursCat_call")();
```

The default type name that is used if no type conversion is specified (f.i. `context.evaluate('dog')`) is `'def'`.
A newly created `Context` will always have an `Adapter` defined for this type that simply returns the value, i.e. `a => a`.
However, if we override this `Adapter` then we can apply our own conversion, unbeknownst to the evaluated parameter or function:
```js
context.addAdapter('def', { 'cat': a => a.name, 'dog': a => a.name }, a => a);

// 'Wooffers'
context.evaluate("dog");
```


[npm-link]: https://www.npmjs.com/package/@halfbit/di