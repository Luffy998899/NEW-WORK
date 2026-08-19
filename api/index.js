// Vercel serverless entry point.
// Requires the Express app (which does NOT call listen when required as a
// module) and exports it as the request handler for all routes.
module.exports = require('../server.js');
