// Inject only a verified disposable local stack into a build/test command.
const fs = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const { loopbackOrigin } = require('./lib/local-launch.cjs');
const workdir = process.env.APLIFYR_LOCAL_STACK_DIR ?? '/tmp/aplifyr-launch-local';
const cli = process.env.APLIFYR_SUPABASE_CLI ?? 'supabase';
const [command, ...args] = process.argv.slice(2);
if (!command || !fs.readFileSync(workdir + '/supabase/config.toml', 'utf8').includes('project_id = "aplifyr-launch-local"') ||
  fs.existsSync(workdir + '/supabase/.temp/project-ref')) throw Error('An unlinked disposable local stack and a command are required.');
const result = spawnSync(cli, ['--workdir', workdir, 'status', '-o', 'json'], { encoding: 'utf8', timeout: 15000 });
if (result.status !== 0) throw Error('Local Supabase is unavailable. Start the isolated stack first.');
const status = JSON.parse(result.stdout);
const auth = loopbackOrigin(status.API_URL);
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw Error('Local status did not return the required keys.');
const env = { ...process.env,
  APLIFYR_LOCAL_SUPABASE_URL: auth, APLIFYR_LOCAL_ANON_KEY: status.ANON_KEY,
  APLIFYR_LOCAL_SERVICE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: auth, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  BACKEND_URL: 'http://127.0.0.1:5200', NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:5200',
};
// AI and privileged backend configuration are never inherited from production.
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'GEMINI_CV_API_KEY', 'GROQ_API_KEY']) delete env[name];
env.AI_ALLOWED_PROVIDERS = '';
const child = spawn(command, args, { stdio: 'inherit', env });
child.on('error', () => { console.error('Could not start local command.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
