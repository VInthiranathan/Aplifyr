// Create a disposable Supabase stack without linking or changing a hosted project.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] ?? '/tmp/aplifyr-launch-local');
if (target === root || target.startsWith(root + path.sep) || fs.existsSync(target)) {
  throw Error('Choose a new directory outside the repository. Existing directories are never overwritten.');
}
fs.mkdirSync(path.join(target, 'supabase'), { recursive: true, mode: 0o700 });
fs.cpSync(path.join(root, 'supabase/migrations'), path.join(target, 'supabase/migrations'), { recursive: true });
fs.writeFileSync(path.join(target, 'supabase/config.toml'), `project_id = "aplifyr-launch-local"
[api]
enabled = true
port = 55321
schemas = ["public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = 55322
shadow_port = 55320
major_version = 17
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = true
port = 55324
[storage]
enabled = false
[realtime]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:3200"
additional_redirect_urls = ["http://127.0.0.1:3200/**", "http://localhost:3200/**"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
enable_signup = true
enable_anonymous_sign_ins = false
minimum_password_length = 12
[auth.email]
enable_signup = true
enable_confirmations = true
max_frequency = "1s"
otp_expiry = 3600
[auth.rate_limit]
email_sent = 100
token_refresh = 300
sign_in_sign_ups = 100
token_verifications = 100
[edge_runtime]
enabled = false
[analytics]
enabled = false
`, { mode: 0o600 });
console.log('Prepared isolated local stack at ' + target + '; email confirmation is required.');
