module.exports = srv => {
  srv.on('*', async function(req, next) {
    debugger
    return next()
  })
}
