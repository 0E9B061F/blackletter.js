'use strict'

const viewdata = require('./widget.html')


module.exports = {
  viewdata,
  construct: function() {
    this.s.counter = 0
  },
  onRender() {
  },
  methods: {
    increment: function() {
      this.s.counter++
      this.parent.do.increment()
    }
  },
}
