const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const args = process.argv.slice(2);
const translated = args.map(a => a === '-snld' ? '-snl-' : a);

try {
  fs.appendFileSync(path.join(os.tmpdir(), '7za-wrapper-debug.log'), `called with: ${args.join(' ')}\n`);
} catch {}

const exeCandidates = [
  path.join(__dirname, '7za-bin.exe'),
  path.join(process.cwd(), '7za-bin.exe'),
  'C:/Users/Atencion online 4/Desktop/driveman-desktop-starter/node_modules/7zip-bin/win/x64/7za-bin.exe'
];

for (const exe of exeCandidates) {
  if (fs.existsSync(exe)) {
    const r = spawnSync(exe, translated, { stdio: 'inherit' });
    process.exit(r.status || 0);
  }
}
console.error('7za-bin.exe not found');
process.exit(1);
