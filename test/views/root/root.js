'use strict'

const viewdata = require('./root.html')


module.exports = {
  viewdata,
  construct: function() {
    this.s.counter = 0
  },
  onRender() {
    for (let i = 0; i < 100; i++) {
      this.addChild('widget', {
        anchor: this.a.widgets,
        name: 'widget' + i + 1,
        list: 'widgets',
      })
    }
  },
  methods: {
    increment: function() {
      this.s.counter++
    }
  },
}
