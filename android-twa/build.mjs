// Builds and signs the UAT APK: Gradle release build → zipalign → apksigner (key from ./signing, never committed).
// Usage: npm run build   (after `npm run generate`). Output: ./dcu-active-uat.apk
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const local = process.env.LOCALAPPDATA;
const jdkRoot = join(local, 'Programs', 'Temurin');
const jdk = process.env.JAVA_HOME ?? join(jdkRoot, readdirSync(jdkRoot).find((d) => d.startsWith('jdk-17')));
const sdk = process.env.ANDROID_HOME ?? join(local, 'Android', 'Sdk');
const buildTools = join(sdk, 'build-tools', readdirSync(join(sdk, 'build-tools')).sort().at(-1));
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };

const props = Object.fromEntries(readFileSync('signing/keystore.properties', 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const keystore = resolve('signing', props.storeFile);

// .bat files need cmd.exe; quote every part because the project path contains spaces.
const quote = (s) => `"${s}"`;
const run = (cmd, args, opts = {}) => (cmd.endsWith('.bat')
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', quote([cmd, ...args].map(quote).join(' '))],
    { stdio: 'inherit', env, windowsVerbatimArguments: true, ...opts })
  : execFileSync(cmd, args, { stdio: 'inherit', env, ...opts }));

console.log('› Gradle release build');
run(resolve('project', 'gradlew.bat'), ['assembleRelease', '--no-daemon', '--console=plain'], { cwd: resolve('project') });

const unsigned = resolve('project/app/build/outputs/apk/release/app-release-unsigned.apk');
if (!existsSync(unsigned)) throw new Error(`Not found: ${unsigned}`);
const aligned = resolve('app-release-aligned.apk');
const output = resolve('dcu-active-uat.apk');
rmSync(aligned, { force: true });

console.log('› zipalign');
run(join(buildTools, 'zipalign.exe'), ['-f', '-p', '4', unsigned, aligned]);

console.log('› apksigner sign');
run(join(buildTools, 'apksigner.bat'), ['sign', '--ks', keystore, '--ks-key-alias', props.keyAlias,
  '--ks-pass', `env:DCU_KS_PASS`, '--key-pass', `env:DCU_KS_PASS`, '--out', output, aligned],
  { env: { ...env, DCU_KS_PASS: props.storePassword } });
rmSync(aligned, { force: true });

console.log('› apksigner verify');
run(join(buildTools, 'apksigner.bat'), ['verify', '--print-certs', output]);
console.log(`APK ready: ${output}`);
