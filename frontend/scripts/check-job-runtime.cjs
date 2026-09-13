// Run after next build. Turbopack can report an async module error after require returns.
process.on('unhandledRejection', error => { console.error(error); process.exit(1); });
process.on('uncaughtException', error => { console.error(error); process.exit(1); });
require('../.next/server/pages/jobs/[id].js');
require('../.next/server/pages/jobs/[id]/cv.js');
setTimeout(() => console.log('Job and CV route modules loaded with require(ESM) disabled.'), 100);
