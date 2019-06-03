'use strict'

const deepstate = require('../deepstate/deepstate.js')


class State {
  constructor(c, g) {
    this.constant = Object.freeze(c)
    this.root = deepstate.create({
      global: {},
      local: {}
    })
    this.root.global = g
    this.defaults = Object.freeze(g)
    console.log('ROOT', this.root)
    this.handlers = {
      root: this.root._handler,
      global: this.root._handler.go('global'),
      local: this.root._handler.go('local'),
      views: {},
      instances: {}
    }
  }
  get global() { return this.root.global }
  get local() { return this.root.local}
  get c() { return this.constant }
  get g() { return this.global }
  get l() { return this.local }
  get h() { return this.handlers }
  addView(name, obj={}) {
    if (this.local[name]) throw new Error(`View '${name}' already has a state.`)
    this.local[name] = obj
    const s = this.local[name]
    this.h.views[name] = this.h.local.go(name)
    this.h.instances[name] = {}
    return s
  }
  addInstance(name, i, obj={}) {
    if (!this.local[name]) throw new Error(`View '${name}' doesn't exist or is missing its state.`)
    if (this.local[name][i]) throw new Error(`Instance '${name}#${i}' already has a state.`)
    this.local[name][i] = obj
    const s = this.local[name][i]
    this.h.instances[name][i] = this.h.local.go(`${name}.${i}`)
    return s
  }
}


module.exports = State
