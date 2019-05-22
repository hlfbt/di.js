"use strict";

/**
 * Extensible, simple parameter dependency injection and introspection solution for Javascript.
 *
 * @author Alexander Schulz (alex@nope.bz)
 *
 * @param {string} [typeDelimiter] The type delimiter in parameter/argument names, defaults to '_'
 * @param {string} [typeDefaultName] The default type name that is used when no type is specified, defaults to 'def'
 * @returns {DI}
 * @constructor
 */
const DI = function DI(typeDelimiter, typeDefaultName) {

    /**
     * @type {string} The type delimiter in parameter/argument names
     */
    this.TypeDelimiter = (typeof typeDelimiter === 'string') ? typeDelimiter : '_';
    /**
     * @type {string} The default type name that is used when no type is specified
     */
    this.TypeDefaultName = (typeof typeDefaultName === 'string') ? typeDefaultName : 'def';


    const di = this;


    const ArgumentFlags = {
        "REST":    0b01,
        "DEFAULT": 0b10
    };

    /**
     * Adapters take any input value and try to convert them into another type that they are responsible for.
     * An example of a 'string' type Adapter could be as simple as: a => '' + a
     * Different behaviours can be configured depending on the input type by passing a dictionary as the constructors second parameter
     *
     * @type {DI.Adapter}
     */
    this.Adapter = class Adapter {

        /**
         * @param {string} type The name of the output type
         * @param {Object<string, DI.Function>|function} fns A dictionary of input type names and their corresponding converter function
         * @param {function} [fallback] An optional fallback function to use for unknown input types, the identity function is used by default (a => a)
         * @param {string} [nativeType] An optional native type name for the output type if the given output type name is an alias (f.i. if type='str', then nativeType should be 'string')
         */
        constructor(type, fns, fallback, nativeType) {
            this.nativeTypeName = undefined;
            this.fallback = a => a;
            this.categories = {};

            this.outputType = type;
            if (typeof fns === 'function') {
                this.fallback = fns;
            } else if (typeof fns === 'object') {
                this.categories = fns;
            } else {
                throw new TypeError(`Parameter fns must either be a general adapter function or a dictionary of types and corresponding adapter functions`);
            }

            if (typeof fallback === 'function') {
                this.fallback = fallback;
            }

            if (typeof nativeType === 'string') {
                this.nativeTypeName = nativeType;
            }
        }

        /**
         * Convert a value into this adapters output type
         *
         * @param {*} value The to be converted value
         * @param {string} [type] An optional input type name, typeof will be used if none provided
         */
        convert(value, type) {
            if (typeof value === 'undefined') {
                return undefined;
            }

            if (typeof type === 'undefined') {
                type = typeof value;
            }

            if (type in this.categories) {
                return this.categories[type](value);
            }

            return this.fallback(value);
        }
    };

    /**
     * Arguments describe parameters of a function. They also take care of resolving parameter dependencies.
     *
     * @type {DI.Argument}
     */
    this.Argument = class Argument {

        /**
         * @param {string} arg
         */
        constructor(arg) {
            this.type = di.TypeDefaultName;
            this.flags = 0;
            this.defaultRaw = undefined;

            // Remove default value...
            if (arg.includes('=')) {
                this.flags |= ArgumentFlags.DEFAULT;
                this.defaultRaw = arg.substr(arg.indexOf('=') + 1).trim();
                arg = arg.substr(0, arg.indexOf('=')).trim();
            }

            // ..and rest parameter dots...
            if (arg.startsWith('...')) {
                this.flags |= ArgumentFlags.REST;
                this.raw = this.name = arg.slice(3).trim();
            } else {
                this.raw = this.name = arg;
            }

            // ..and stitch the parsed and cleaned values back onto the raw at the end
            if (this.isDefaultParameter()) {
                this.raw += '=' + this.defaultRaw;
            }
            if (this.isRestParameter()) {
                this.raw = '...' + this.raw;
            }

            if (arg.includes(di.TypeDelimiter)) {
                if (this.isRestParameter()) {
                    console.warn(`Type specifier of rest parameter '${arg}' will be ignored`);
                } else {
                    let type, s = arg.split(di.TypeDelimiter);
                    type = s.slice(-1)[0];
                    if (type.length > 0) {
                        this.name = s.slice(0, -1).join(di.TypeDelimiter);
                        this.type = type;
                    }
                }
            }
        }

        get default() {
            return eval(this.defaultRaw);
        }

        isRestParameter() {
            return this.flags & ArgumentFlags.REST;
        }

        isDefaultParameter() {
            return this.flags & ArgumentFlags.DEFAULT;
        }

        /**
         * Resolve the arguments dependency from the context and return the result.
         *
         * @param {DI.Context} context
         * @returns {undefined}
         */
        supply(context) {
            if (!(this.name in context.parameters) || context.parameters[this.name].isUndefined()) {
                return undefined;
            }

            let adapter, parameter = context.parameters[this.name];

            if (this.type in context.adapters) {
                adapter = context.adapters[this.type];
            }

            if (!adapter) {
                adapter = Object.values(context.adapters).find(adapter => adapter instanceof di.Adapter && typeof adapter.nativeTypeName !== undefined && adapter.nativeTypeName === this.type);
            }

            if (adapter && !(adapter instanceof di.Adapter) && typeof adapter === 'function') {
                adapter = new di.Adapter(this.type, adapter);
            }

            if (!adapter) {
                throw new ReferenceError(`No Adapter for type '${this.type}' could be found in the Context: ${JSON.stringify(context.adapters)}`);
            }

            return adapter.convert(parameter.value, parameter.type);
        }
    };

    /**
     * Parameters are simply named and typed data stores for parameter values, they do not hold any logic (other than it's own type deduction).
     *
     * @type {DI.Parameter}
     */
    this.Parameter = class Parameter {

        /**
         * @param {string} name The parameter's name
         * @param {*} value The parameter's value
         * @param {string|*} [type] An optional type name, object of which the typeof will be taken, or the typeof of the value if left empty
         */
        constructor(name, value, type) {
            this.name = name;
            this.set(value, type);
        }

        isUndefined() {
            return typeof this._value === 'undefined';
        }

        /**
         * @param {*} value The parameter's new value
         * @param {string|*} [type] An optional type name, object of which the typeof will be taken, or the typeof of the value if left empty
         */
        set(value, type) {
            this._value = value;
            if (typeof type === 'string') {
                this._type = type;
            } else if (typeof type !== 'undefined') {
                this._type = typeof type;
            } else if (typeof value !== 'undefined') {
                this._type = typeof value;
            }
        }

        get type() {
            return this._type;
        }

        set type(type) {}

        get value() {
            return this._value;
        }

        set value(value) {}
    };

    /**
     * Functions parse functions and delegate any dependency resolving to its arguments when being evaluated against a context.
     *
     * @type {DI.Function}
     */
    this.Function = class Function {

        constructor(fn) {
            this.fn = undefined;
            this.args = [];

            if (typeof fn !== 'function') {
                throw new TypeError(`Type ${typeof fn} is not a function`);
            }
            this.fn = fn;
            // Convert to string and get rid of comment blocks first
            let fnStr = fn.toString().replace(/\/\*(?:\s|.)*?\*\//g, '');
            // Then extract all parameters as a comma separated list
            // TODO: A current caveat is that if the last parameter is a default parameter (arg = 'somevalue') AND the default value has any of the "function delimiters" '){', '[^=\s]{' or '=>' in it, it will break
            //       The parameter will be properly parsed, the default flag will be set as well, but the value will be truncated to the start of that delimiter
            //       A proper fix for this would be to not rely on shoddy RegExp based parsing and instead implement a JS tokenizer (which is it's own behemoth)
            let args, m = fnStr.match(/^\s*(?:function(?:\s*[^\(]+)?)?(?:\(((?:\s*[^\)\s,]+\s*(?:=.*?)?,)*\s*(?:\.{3}\s*)?[^\)\s,]+\s*(?:=.*?)?)?\)|(\s*[^=\s]+\s*)?)\s*(?:\{|=>)/);
            // If any parameters where found, turn them into Argument objects for some more introspection
            if (m && (m[1] || m[2])) {
                args = (m[1] || m[2]).split(',');
                this.args = args.map(arg => new di.Argument(arg.trim()));
            }
        }

        /**
         * Execute the function against the given context.
         *
         * @param {DI.Context} context The context to execute the function with
         * @returns {*} The function's return
         */
        run(context) {
            let args = [];
            this.args.forEach((arg, i) => {
                let value = arg.supply(context);
                if (! (typeof value === 'undefined' && i === this.args.length - 1 && arg.isRestParameter())) {
                    args.push(arg.supply(context));
                }
            });

            return this.fn.apply(this.fn, args);
        }
    };

    /**
     * The Context aggregates a parameter and adapter state and can raw argument strings and functions.
     *
     * @type {DI.Context}
     */
    this.Context = class Context {

        constructor() {
            this._parameters = {};
            this._adapters = {};
            this._adapters[di.TypeDefaultName] = new di.Adapter(di.TypeDefaultName, a => a);
        }

        /**
         * Utility setter of single parameter.
         * Accepts either a single DI.Parameter instance, or all three name, value and the optional type parameters.
         * @param {DI.Parameter|string} name
         * @param {*} [value]
         * @param {string|*} [type]
         */
        addParameter(name, value, type) {
            if (typeof name !== 'undefined') {
                this._parameters[name] = name instanceof di.Parameter ? name : new di.Parameter(name, value, type);
            }
        }

        set parameters(parameters) {
            if (parameters === {}) {
                this._parameters = {};
                return this._parameters;
            } else if (!parameters) {
                return this._parameters;
            }

            if (typeof parameters !== 'object') {
                throw new TypeError("Parameters setter only accepts objects with name: value or name: DI.Parameter pairs");
            }

            for (let name in parameters) {
                let value = parameters[name];
                if (parameters.hasOwnProperty(name) && typeof value !== 'undefined') {
                    this._parameters[name] = value instanceof di.Parameter ? value : new di.Parameter(name, value)
                }
            }

            this._parameters;
        }

        get parameters() {
            return this._parameters;
        }

        /**
         * @param {string} type The name of the output type
         * @param {Object<string, DI.Function>|function} fns A dictionary of input type names and their corresponding converter function
         * @param {function} [fallback] An optional fallback function to use for unknown input types, the identity function is used by default (a => a)
         * @param {string} [nativeType] An optional native type name for the output type if the given output type name is an alias (f.i. if type='str', then nativeType should be 'string')
         */

        /**
         * Utility setter of single adapter.
         * Accepts either a single DI.Adapter instance, or all four type, fns, optional fallback and optional nativeType parameters.
         * @param {DI.Adapter|string} type
         * @param {Object<string, DI.Function>|function} [fns]
         * @param {function} [fallback]
         * @param {string} [nativeType]
         */
        addAdapter(type, fns, fallback, nativeType) {
            if (typeof type !== 'undefined') {
                this._adapters[type] = type instanceof di.Adapter ? type : new di.Adapter(type, fns, fallback, nativeType);
            }
        }

        set adapters(adapters) {
            if (adapters === {}) {
                this._adapters = {};
                return this._adapters;
            } else if (!adapters) {
                return this._adapters;
            }

            if (typeof adapters !== 'object') {
                throw new TypeError("Adapters setter only accepts objects with type: function or type: DI.Adapter pairs");
            }

            for (let type in adapters) {
                let fn = adapters[type];
                if (adapters.hasOwnProperty(type) && typeof fn !== 'undefined') {
                    if (fn instanceof di.Adapter || typeof fn === 'function') {
                        this._adapters[type] = fn;
                    }
                }
            }

            return this._adapters;
        }

        get adapters() {
            return this._adapters;
        }

        /**
         * Evaluate an argument or function in this context.
         * Strings are treated as arguments and functions as .. functions.
         *
         * @param {string|function} obj Either a string representing an argument or a non-native function
         * @returns {*} The result of the evaluation
         */
        evaluate(obj) {
            if (typeof obj === 'string') {
                return new di.Argument(obj).supply(this);
            } else if (typeof obj === 'function') {
                return new di.Function(obj).run(this);
            } else {
                throw new TypeError(`Cannot evaluate type '${typeof obj}'`);
            }
        }
    };

    return this;
};

let di = new DI();

export default DI;
export { di };
