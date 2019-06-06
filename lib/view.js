'use strict'

const State = require('./state.js')
const Events = require('./events.js')


function getAnchor(el, id) {
  let child
  let res
  for (let i = 0; i < el.children.length; i+=1) {
    child = el.children[i]
    if (child.id == id) {
      return child
    } else {
      res = getAnchor(child, id)
      if (res) return res
    }
  }
  return null
}

function underize(str) {
  return str.replace(/-/g, '_')
}

class Dispatch {
  constructor(v, p) {
    this.v = v
    this.p = p
  }
}

class IntegratedElement {
  constructor(view, el) {
    this.view = view
    this.el = el
    const on = el.getAttribute('on')
    const bind = el.getAttribute('bind')
    const toggle = el.getAttribute('toggle')
    const visibility = el.getAttribute('visibility')
    if (!on && !bind && !toggle && !visibility) throw new Error('Element has no event attributes and cannot be integrated.')
    this.el.setAttribute('ie', '')
    this.hash = Events.parse({on, bind, toggle, visibility})
    this.hash.on.init.forEach(a=> a.does(this.view, this.el, a.arg))
    if (this.hash.hasClick) {
      this.el.addEventListener('click', ()=> {
        this.hash.on.click.forEach(a=> a.does(this.view, this.el, a.arg))
      })
    }
    if (this.hash.hasInput) {
      this.el.addEventListener('input', ()=> {
        this.hash.on.input.forEach(a=> a.does(this.view, this.el, a.arg))
      })
    }
    this.hash.watching.forEach(k=> {
      this.hash.on.change[k].forEach(a=> {
        if (a.arg[0] == '/') {
          this.view.app.state.handlers.global.subscribe(()=> {
            a.does(this.view, this.el, a.arg)
          }, k)
        } else {
          this.view.subscribe(()=> {
            a.does(this.view, this.el, a.arg)
          }, k)
        }
      })
    })
  }
}

class Mask {
  constructor(masking, fallback) {
    this.masking = masking
    this.fallback = fallback
  }
  get(k) {
    if (typeof(this.masking[k]) != 'undefined') return this.masking[k]
    else return this.fallback[k]
  }
  set(k, v) {
    this.masking[k] = v
  }
}

class ViewInstance {
  constructor(view, index, state, handler, conf) {
    this.view = view
    this.app = this.view.app
    this.index = index
    this.conf = {
      state: {},
      parent: null,
      classes: [],
      args: {},
      tagCalls: {}
    }
    Object.assign(this.conf, conf)
    console.log(this.conf)
    this.parent = this.conf.parent
    this.localState = state
    this.handler = handler
    // Subscribe to all state changes through onStateChange
    //this.subscribe(this, this.onStateChange)
    this.do = {}
    // Bind methods to instance
    Object.keys(this.methods).forEach(key=> {
      this.do[key] = this.methods[key].bind(this)
    })
    this.anchorElements = {}
    this.classElements = {}
    this.classNames = ['view-root', `${this.name}-root`, ...this.conf.classes]
    this.constructed = false
    this.rendered = false
    this.created = false
    this.anchored = false
    this.active = false
    this.children = {}
    this.factoryRoot = document.createElement(this.view.rootTag)
    this.userRoot = null
    this.integrated = []
    this.integIndex = {}
    this.bindings = []
    this.dispatches = []
    // Assign arguments to local state
    Object.entries(this.conf.args).forEach(p=> {
      if (this.interface) {
        if (p[1] instanceof Dispatch) {
          this.s._handler.dispatch(p[1])
          this.dispatches[p[0]] = p[1]
        } else {
          this.s[p[0]] = p[1]
        }
      }
    })
    this.build()
    this.onInitialization()
    this.render()
    this.onCreation()
  }
  get name() { return this.view.name }
  get template() { return this.view.template }
  get methods() { return this.view.methods }
  get anchors() { return this.view.anchors }
  get classes() { return this.view.classes }
  get globalState() { return this.view.state.global }
  get global() { return this.globalState }
  get gs() { return this.globalState }
  get defaults() { return this.view.defaults }
  get interface() { return this.view.interface }
  get tags() { return this.view.tags }
  get tagNames() { return Object.keys(this.tags) }

  get viewdata() { return this._viewdata || this.view.viewdata }

  get local() { return this.localState }
  get ls() { return this.localState }
  get s() { return this.localState }
  get cons() { return this.view.app.state.c }
  get a() { return this.anchorElements }
  get g() { return this.classElements }
  get c() { return this.children }

  get views() { return this.view.app.views }

  get root() { return this.userRoot || this.factoryRoot}

  dereference(str) {
    let r
    if (str[0] == '@') {
      r = this.s[str.slice(1)]
    } else if (str[0] == '!') {
      r = this.do[str.slice(1)]
    } else if (str[0] == '#') {
      r = new Dispatch(this, str.slice(1))
    } else {
      r = str
    }
    return r
  }

  subscribe(...args) { this.handler.subscribe(...args) }
  integrate(el) {
    const ie = new IntegratedElement(this, el)
    this.integrated.push(ie)
    return ie
  }

  hide() {
    if (!this.rendered) throw new Error('View must be rendered first.')
    this.root.style.display = 'none'
  }
  show() {
    if (!this.rendered) throw new Error('View must be rendered first.')
    this.root.style.display = null
  }

  render() {
    if (!this.rendered || this.template) {
      this.beforeRender()
      if (this.template) {
        this._viewdata = this.template(this.makeContext())
      }
      this.factoryRoot.innerHTML = this.viewdata
      this.userRoot = this.factoryRoot.querySelector('root:only-child, *[root]:only-child')
      this.root.classList.add(...this.classNames)
      this.parseMarkup()
      this.getElements()
      this.rendered = true
      this.onRender()
      this.callTags()
    }
  }

  callTags() {
    let t
    Object.entries(this.conf.tagCalls).forEach(p=> {
      t = p[0].toLowerCase()
      if (this.tagNames.indexOf(t) < 0) throw new Error(`Invalid tag: ${t}`)
      for (let i = 0; i < p[1].length; i++) {
        this.tags[t].call(this, p[1][i])
      }
    })
  }

  parseMarkup(r=this.root, s=this.ls) {
    this.parseEachCmds(r,s)
    this.parseDirectives(r,s)
  }

  parseDirectives(r=this.root, s=this.ls) {
    this.parseChildCmds(r,s)
    this.parseEvents(r,s)
    this.parseAnchored(r,s)
  }

  parseEachCmds(r=this.root, s=this.ls) {
    const eachCmd = r.querySelectorAll('each')
    let f, i, masked, dummy, result
    eachCmd.forEach(ec=> {
      result = document.createElement('div')
      f = ec.getAttribute('for')
      i = ec.getAttribute('in')
      masked = new Mask({}, this.ls)
      this.ls[i].forEach(item=> {
        dummy = ec.cloneNode(true)
        masked.set(f, item)
        this.parseDirectives(dummy, masked)
        result.append(...dummy.children)
      })
      ec.replaceWith(...result.children)
    })
  }

  parseChildCmds(r=this.root, s=this.ls) {
    const childCmd = r.querySelectorAll('child')
    let vn, name, list, argt, args, child, tags, tag, tcall
    childCmd.forEach(cc=> {
      vn   = cc.getAttribute('view')
      name = cc.getAttribute('name')
      list = cc.getAttribute('list')

      args = {}
      argt = cc.querySelectorAll('args')
      if (argt.length) {
        if (argt.length > 1) throw new Error('Only one args tag, please.')
        argt = argt[0]
        for (let name of argt.getAttributeNames()) {
          args[name] = argt.getAttribute(name)
          args[name] = this.dereference(args[name])
        }
        argt.remove()
      }

      tags = {}
      for (var i = 0; i < cc.children.length; i++) {
        tag = cc.children[i].tagName
        if (!tags[tag]) tags[tag] = []
        tcall = {}
        for (let name of cc.children[i].getAttributeNames()) {
          tcall[name] = cc.children[i].getAttribute(name)
          tcall[name] = this.dereference(tcall[name])
        }
        tags[tag].push(tcall)
      }

      child = this.views[vn].create({
        args, tagCalls: tags, parent: this
      })
      this.registerChild(child, {name, list})
      child.preactivate(cc.parentNode)
      cc.replaceWith(child.root)
      child.postactivate()
    })
  }

  parseEvents(r=this.root, s=this.ls) {
    let els = r.querySelectorAll('*[on], *[bind], *[toggle], *[visibility]')
    els = Array.from(els)
    if (this.root.hasAttribute('on')
    || this.root.hasAttribute('bind')
    || this.root.hasAttribute('toggle')
    || this.root.hasAttribute('visibility')) {
      els.push(this.root)
    }
    els.forEach(el=> {
      this.integrate(el)
      el.removeAttribute('on')
      el.removeAttribute('bind')
      el.removeAttribute('toggle')
      el.removeAttribute('visibility')
    })
  }

  parseAnchored(r=this.root, s=this.ls) {
    const anchors = r.querySelectorAll('*[anchor]')
    let name
    anchors.forEach(el=> {
      name = el.getAttribute('anchor')
      if (name[0] == '.') {
        name = name.slice(1)
        el.classList.add(name)
      } else {
        el.id = name
      }
      el.removeAttribute('anchor')
      name = name.replace('-', '_')
      this.anchorElements[name] = el
    })
  }

  getElements() {
    let name
    this.anchors.forEach(anchor=> {
      name = underize(anchor)
      if (anchor[0] == '.') {
        anchor = anchor.slice(1)
        name = name.slice(1)
        this.anchorElements[name] = this.root.getElementsByClassName(anchor)
        if (this.anchorElements[name].length > 1) {
          console.warn('Anchorized class matched multiple elements.')
        }
        this.anchorElements[name] = this.anchorElements[name][0]
      } else {
        this.anchorElements[name] = getAnchor(this.root, anchor)
      }
    })

    this.classes.forEach(klass=> {
      name = underize(klass)
      this.classElements[name] = this.root.getElementsByClassName(klass)
    })
  }

  addChild(name, opt) {
    opt = Object.assign({anchor: this.root, activate: true}, opt)
    opt.parent = this
    if (!this.rendered) {
      throw new Error('View must be rendered first.')
    }
    const v = this.views[name].create(opt)
    this.registerChild(v, opt)
    if (opt.activate) v.activate(opt.anchor)
    else v.preactivate(opt.anchor)
    return v
  }

  registerChild(child, opt) {
    if (!opt.name && !opt.list) {
      throw new Error('Must specify a name or a list for the child.')
    }
    if (opt.name) this.children[opt.name] = child
    if (opt.list) {
      if (!this.children[opt.list]) this.children[opt.list] = []
      this.children[opt.list].push(child)
    }
  }

  makeContext() {
    if (this.view.makeContext) return this.view.makeContext.call(this)
    else return this.localState.raw
  }

  build() {
    if (this.constructed) return
    console.log(`this.view.build a: ${this.view.build}`)
    if (this.view.build) {
      console.log(`this.view.build b: ${this.view.build}`)
      this.view.build.call(this, ...this.conf.args)
    }
    this.constructed = true
  }

  onInitialization() {
    if (this.view.onInitialization) this.view.onInitialization.call(this)
  }

  beforeRender() {
    if (this.view.beforeRender) this.view.beforeRender.call(this)
  }

  onRender() {
    if (this.view.onRender) this.view.onRender.call(this)
  }

  onCreation() {
    if (this.created) throw new Error('Already created.')
    if (this.view.onCreation) this.view.onCreation.call(this)
    this.created = true
  }

  onActivation() {
    if (this.active) throw new Error('Already active.')
    if (this.view.onActivation) this.view.onActivation.call(this)
  }

  onStateChange(sc) {
    if (this.view.onStateChange) this.view.onStateChange.call(this, sc)
  }

  iterate(klass, block) {
    klass = this.c[underize(klass)]
    for (let i = 0; i < klass.length; i += 1) block(klass[i])
  }

  preactivate(anchor) {
    this.anchor = anchor
  }

  activate(anchor=null, before=null) {
    if (this.active) throw new Error('View has already been activated.')
    if (anchor) this.anchor = anchor
    if (!this.anchor) throw new Error('View has no anchor.')
    this.insert(before)
    this.postactivate()
  }

  postactivate() {
    this.onActivation()
    this.active = true
  }

  unanchor() {
    if (!this.anchored) return
    this.root.remove
    this.anchored = false
  }

  reanchor(before=null) {
    if (!this.anchor) throw new Error('View has no anchor.')
    if (!this.active) this.activate(null, before)
    else this.insert(before)
  }

  insert(before=null) {
    if (typeof(before) == 'number') before = this.anchor.children[before]
    this.anchor.insertBefore(this.root, before)
    this.anchored = true
  }

  destroy() {
    this.root.remove()
    delete this.root
    this.view.reportDestruction(this)
  }
}

class View {
  constructor(app, name, ls, handler, conf) {
    this.app = app
    this.name = name
    this.local = ls
    this.handler = handler
    this.conf = {
      template: null,
      viewdata: null,
      anchors: [],
      classes: [],
      tags: {},
      interface: null,
      build: null,
      onCreation: null,
      onActivation: null,
      onStateChange: null,
      beforeRender: null,
      onRender: null,
      makeContext: null,
      onInitialization: null,
      defaults: {},
      methods: {},
      rootTag: 'div'
    }
    Object.assign(this.conf, conf)
    this.viewdata = this.conf.viewdata
    this.template = this.conf.template
    this.anchors = this.conf.anchors
    this.classes = this.conf.classes
    this.tags = this.conf.tags
    this.interface = this.conf.interface
    this.build = this.conf.build
    this.onCreation = this.conf.onCreation
    this.onActivation = this.conf.onActivation
    this.onStateChange = this.conf.onStateChange
    this.beforeRender = this.conf.beforeRender
    this.onRender = this.conf.onRender
    this.makeContext = this.conf.makeContext
    this.onInitialization = this.conf.onInitialization
    this.defaults = this.conf.defaults
    this.methods = this.conf.methods
    this.rootTag = this.conf.rootTag
    this.instances = []
    this.created = 0
  }
  get state() { return this.app.state }
  subscribe(...args) { this.handler.subscribe(...args) }
  create(conf={state: {}}) {
    const i = this.created += 1
    const o = Object.assign({}, this.defaults, conf.state)
    const s = this.state.addInstance(this.name, i, o)
    const h = this.state.h.instances[this.name][i]
    const v = new ViewInstance(this, i, s, h, conf)
    return this.instances[i] = v
  }
  reportDestruction(v) {
    delete this.local[v.index]
    delete this.instances[v.index]
  }
}

class Application {
  constructor(conf) {
    conf = Object.assign({
      constant: {},
      global: {},
      viewdocs: {},
      root: 'root'
    }, conf)
    this.state = new State(conf.constant, conf.global)
    this.root = conf.root
    this.views = {}
    let c, s, h
    Object.keys(conf.viewdocs).forEach(name=> {
      c = conf.viewdocs[name]
      s = this.state.addView(name)
      h = this.state.h.views[name]
      this.views[name] = new View(this, name, s, h, c)
    })
  }
  bootstrap(el) {
    const r = this.views[this.root].create()
    r.activate(el)
    return r
  }
}


module.exports = { View, ViewInstance, Application }
