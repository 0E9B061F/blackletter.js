'use strict'

require('./test.styl')

const BL = require('../lib/view.js')


const app = new BL.Application({
  constant: {x: 100},
  global: {foo: 'bar'},
  viewdocs: {
    root: require('./views/root/root.js'),
    widget: require('./views/widget/widget.js'),
  }
})

function begin() {
  document.app = app.bootstrap(document.body)
}

begin()
