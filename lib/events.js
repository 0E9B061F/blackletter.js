'use strict'

const enumjs = require('enum.js')


// on="init:read(useSpace)/change(useSpace):read(useSpace)/input:write(useSpace)"
// on="init,change(useSpace):read(useSpace)/input:write(useSpace)"
// on="init:visibility(useSpace)/change(useSpace):visibility(useSpace)"
// on="init,change(useSpace):visibility(useSpace)"


const EWTYPE = enumjs('TRIGGER ACTION')
const EWNEED = enumjs('STATE METHOD NONE')
const EWREGX = /(\w+)\((\w+)\)|\w+/

const EWDEFAULT = {
  need: EWNEED.NONE,
}
const ETDEFAULT = {
  acts: [],
}



class EventWord {
  constructor(type, lang, conf) {
    this.type = type
    this.lang = lang
    conf = Object.assign({}, EWDEFAULT, conf)
    this.name = conf.name
    this.need = conf.need
    if (!this.name) throw new Error('EventWord must be named.')
    if (this.lang.exists(this.name)) throw new Error(`Name already exists in event lang: ${this.name}`)
    this.conf = conf
  }
  get valent() { return this.need != EWNEED.NONE }
}

class TriggerWord extends EventWord {
  constructor(...args) {
    super(EWTYPE.TRIGGER, ...args)
    this.conf = Object.assign({}, ETDEFAULT, this.conf)
    this.acts = this.conf.acts
    if (typeof(this.acts) == 'string') this.acts = this.acts.split(' ')
    this.acts.forEach(a=> {
      if (!this.lang.hasAction(a)) throw new Error(`No such action in event lang: ${a}`)
    })
  }
  compatible(a) {
    return this.acts.indexOf(a.name) >= 0
  }
  real(arg) { return new RealTrigger(this, arg) }
}

class ActionWord extends EventWord {
  constructor(...args) {
    super(EWTYPE.ACTION, ...args)
    this.does = this.conf.does
    if (!this.does) throw new Error('An action must have a behavior.')
  }
  real(arg) { return new RealAction(this, arg) }
}

const CMAP = {
  triggers: TriggerWord,
  actions: ActionWord
}

class RealWord {
  constructor(word, arg) {
    if (word.valent && !arg) throw new Error(`Word '${word.name}' requires arg.`)
    if (!word.valent && arg) throw new Error(`Word '${word.name}' takes no arg.`)
    this.word = word
    this.arg = arg
  }
  get name() { return this.word.name }
  get type() { return this.word.type }
  get need() { return this.word.need }
}

class RealTrigger extends RealWord {
  compatible(a) { return this.word.compatible(a) }
}
class RealAction extends RealWord {
  get does() { return this.word.does }
}

class EventLang {
  constructor(conf) {
    this.words = { actions: {}, triggers: {} }
    Object.keys(this.words).forEach(type=> {
      if (conf[type]) {
        Object.keys(conf[type]).forEach(name=> {
          conf[type][name].name = name
          this.words[type][name] = new CMAP[type](this, conf[type][name])
        })
      }
    })
  }
  get triggers() { return this.words.triggers }
  get actions() { return this.words.actions }
  find(name) { return this.actions[name] || this.triggers[name] }
  exists(name) { return !!this.find(name) }
  hasTrigger(name) { return !!this.triggers[name] }
  hasAction(name) { return !!this.actions[name] }
  trigger(name) {
    if (this.hasTrigger(name)) return this.triggers[name]
    else throw new Error(`Not a trigger: ${name}`)
  }
  action(name) {
    if (this.hasAction(name)) return this.actions[name]
    else throw new Error(`Not an action: ${name}`)
  }
  _parsePart(str) {
    const match = str.match(EWREGX)
    let name, arg
    if (!match) throw new Error(`Invalid word: ${str}`)
    if (match[1]) {
      return this.real(match[1], match[2])
    } else {
      return this.real(match[0])
    }
  }
  real(name, arg) {
    const w = this.find(name)
    if (!w) throw new Error(`Not an event word: ${name}`)
    return w.real(arg)
  }
  parse(conf) {
    const out = new EventHash(this)
    if (conf.on) {
      const pairs = conf.on.split('/')
      let trgs, acts, m
      pairs.forEach(p=> {
        p = p.split(':')
        trgs = p[0].split(',')
        acts = p[1].split(',')
        trgs.forEach(t=> {
          acts.forEach(a=> {
            out.add(this._parsePart(t), this._parsePart(a))
          })
        })
      })
    }
    if (conf.bind) {
      out.add(this.real('init'), this.real('read', conf.bind))
      out.add(this.real('change', conf.bind), this.real('read', conf.bind))
      out.add(this.real('input'), this.real('write', conf.bind))
    }
    if (conf.visibility) {
      out.add(this.real('init'), this.real('visibility', conf.visibility))
      out.add(this.real('change', conf.visibility), this.real('visibility', conf.visibility))
    }
    if (conf.toggle) {
      out.add(this.real('click'), this.real('toggle', conf.toggle))
    }
    return out
  }
}

class EventHash {
  constructor(lang) {
    this.lang = lang
    this.on = {}
    Object.entries(this.lang.triggers).forEach(p=> {
      this.on[p[0]] = p[1].need == EWNEED.NONE ? [] : {}
    })
  }
  get hasClick() { return !!this.on.click.length }
  get hasInput() { return !!this.on.input.length }
  get watching() { return Object.keys(this.on.change) }
  add(t, a) {
    if (!t.compatible(a)) throw new Error(`Trigger '${t.name}' is incompatible with action '${a.name}'`)
    if (t.need == EWNEED.NONE) {
      this.on[t.name].push(a)
    } else {
      if (!this.on[t.name][t.arg]) this.on[t.name][t.arg] = []
      this.on[t.name][t.arg].push(a)
    }
  }
}

function getPath(p, g, l) {
  console.log(p,g,l)
  let o
  if (p[0] == '/') {
    o = g
    p = p.slice(1)
  } else {
    o = l
  }
  console.log('from', o)
  p.split('/').forEach(prop=> o = o[prop])
  console.log('to', o)
  return o
}
function setPath(p, g, l, v) {
  let o
  if (p[0] == '/') {
    o = g
    p = p.slice(1)
  } else {
    o = l
  }
  p = p.split('/')
  const final = p[p.length-1]
  p = p.slice(0,p.length-1)
  p.forEach(prop=> o = o[prop])
  o[final] = v
}
function togglePath(p, g, l) {
  let o
  if (p[0] == '/') {
    o = g
    p = p.slice(1)
  } else {
    o = l
  }
  p = p.split('/')
  const final = p[p.length-1]
  p = p.slice(0,p.length-1)
  p.forEach(prop=> o = o[prop])
  if (typeof(o[final]) == 'boolean') o[final] = !o[final]
  else throw new Error('Cannot toggle non-boolean value.')
}

module.exports = new EventLang({
  triggers: {
    init: {acts: 'read visibility show hide'},
    click: {acts: 'read write toggle call hide'},
    input: {acts: 'read write toggle call'},
    change: {acts: 'read call visibility show hide', need: EWNEED.STATE},
  },
  actions: {
    toggle: {
      need: EWNEED.STATE,
      does: function(v, e, a) {
        console.log('Toggling')
        togglePath(a, v.gs, v.ls)
      }
    },
    read: {
      need: EWNEED.STATE,
      does: function(v, e, a) {
        const val = getPath(a, v.gs, v.ls)
        if (e.tagName == 'INPUT') e.value = val
        else e.innerHTML = val
      }
    },
    write: {
      need: EWNEED.STATE,
      does: function(v, e, a) {
        if (e.tagName == 'INPUT') setPath(a, v.gs, v.ls, e.value)
        else setPath(a, v.gs, v.ls, e.innerHTML)
      }
    },
    call: {
      need: EWNEED.METHOD,
      does: function(v, e, a) {
        v.do[a]()
      }
    },
    visibility: {
      need: EWNEED.STATE,
      does: function(v, e, a) {
        if (v.s[a]) e.style.display = null
        else e.style.display = 'none'
      }
    },
    show: {
      does: function(v, e) {
        e.style.display = null
      }
    },
    hide: {
      does: function(v, e) {
        e.style.display = 'none'
      }
    },
  }
})
