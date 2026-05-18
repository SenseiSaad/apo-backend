/**
 * scripts/uploadStreamojiAnimations.js
 *
 * Downloads Streamoji animation GLBs from their public CDN and uploads them
 * to our own Cloudflare R2 bucket.
 *
 * Usage:
 *   node scripts/uploadStreamojiAnimations.js                        # all categories
 *   node scripts/uploadStreamojiAnimations.js --categories Dance,Locomotion,Expression
 *   node scripts/uploadStreamojiAnimations.js --categories Idle
 *   node scripts/uploadStreamojiAnimations.js --dry-run              # list files without uploading
 *   node scripts/uploadStreamojiAnimations.js --gender male          # one gender only
 *
 * Options:
 *   --categories   Comma-separated list: Idle, Dance, Locomotion, Expression (default: all)
 *   --gender       Filter to a single gender: male | female (default: both)
 *   --dry-run      Print what would be uploaded without actually uploading
 *   --concurrency  Number of parallel uploads (default: 4)
 */

require('dotenv').config();
require('ts-node/register');

const path = require('path');
const { PutObjectCommand, HeadObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { buildStreamojiAnimationManifest } = require('../src/modules/avatarLibrary/streamojiAnimationManifest');

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = parseInt(getArg('--concurrency') || '4', 10);

const CATEGORY_FILTER = getArg('--categories')
  ? getArg('--categories').split(',').map((c) => c.trim())
  : null; // null = all

const GENDER_FILTER = getArg('--gender') || null; // null = both

// ─── Config ────────────────────────────────────────────────────────────────
const targetPrefix = (process.env.STREAMOJI_ANIMATIONS_R2_PREFIX || 'animations/streamoji').replace(/^\/+|\/+$/g, '');

const requiredEnv = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
];

function assertEnv() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

function buildPublicUrl(baseUrl, key) {
  return `${baseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

// ─── Check if object already exists in R2 ─────────────────────────────────
async function existsInR2(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return false;
    throw err;
  }
}

// ─── Download from Streamoji CDN ──────────────────────────────────────────
async function downloadGlb(animation, attempt = 1) {
  const response = await fetch(animation.sourceUrl);
  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }
  if (attempt < 3) {
    const delay = 1000 * attempt;
    console.warn(`  ⚠ HTTP ${response.status} for ${animation.sourceUrl} — retrying in ${delay}ms…`);
    await new Promise((r) => setTimeout(r, delay));
    return downloadGlb(animation, attempt + 1);
  }
  throw new Error(`Download failed for ${animation.id} (${animation.avatarGender}): HTTP ${response.status}`);
}

// ─── Upload worker (processes a chunk of the queue) ───────────────────────
async function processQueue(queue, client, bucket, baseUrl, results) {
  for (const animation of queue) {
    const storageKey = `${targetPrefix}/${animation.fileName}`;
    const publicUrl = buildPublicUrl(baseUrl, storageKey);

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would upload: ${storageKey}`);
      results.push({ ...animation, storageKey, publicUrl, status: 'dry-run' });
      continue;
    }

    // Skip if already uploaded
    const alreadyExists = await existsInR2(client, bucket, storageKey);
    if (alreadyExists) {
      console.log(`  ⏭  Skip (exists): ${storageKey}`);
      results.push({ ...animation, storageKey, publicUrl, status: 'skipped' });
      continue;
    }

    try {
      const buffer = await downloadGlb(animation);

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: 'model/gltf-binary',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      console.log(`  ✓ Uploaded ${storageKey} (${(buffer.length / 1024).toFixed(0)} KB)`);
      results.push({ ...animation, storageKey, publicUrl, bytes: buffer.length, status: 'uploaded' });
    } catch (err) {
      console.error(`  ✗ FAILED ${storageKey}: ${err.message}`);
      results.push({ ...animation, storageKey, publicUrl, status: 'failed', error: err.message });
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  assertEnv();

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });

  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL.replace(/\/+$/, '');

  // Build manifest and apply filters
  let manifest = buildStreamojiAnimationManifest();

  if (CATEGORY_FILTER) {
    manifest = manifest.filter((a) => CATEGORY_FILTER.includes(a.category));
    console.log(`Category filter: ${CATEGORY_FILTER.join(', ')}`);
  }
  if (GENDER_FILTER) {
    manifest = manifest.filter((a) => a.avatarGender === GENDER_FILTER);
    console.log(`Gender filter: ${GENDER_FILTER}`);
  }

  console.log(`\nAnimations to process: ${manifest.length}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`R2 prefix: ${targetPrefix}\n`);

  // Print summary table grouped by category × gender
  const grouped = {};
  for (const a of manifest) {
    const key = `${a.category} (${a.avatarGender})`;
    grouped[key] = (grouped[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(grouped)) {
    console.log(`  ${key}: ${count} files`);
  }
  console.log('');

  // Split into CONCURRENCY-sized lanes and run in parallel
  const lanes = Array.from({ length: CONCURRENCY }, () => []);
  manifest.forEach((a, i) => lanes[i % CONCURRENCY].push(a));

  const results = [];
  await Promise.all(lanes.map((lane) => processQueue(lane, client, bucket, baseUrl, results)));

  // ─── Stats ───────────────────────────────────────────────────────────────
  const uploaded = results.filter((r) => r.status === 'uploaded');
  const skipped  = results.filter((r) => r.status === 'skipped');
  const failed   = results.filter((r) => r.status === 'failed');
  const dryRun   = results.filter((r) => r.status === 'dry-run');

  console.log('\n─── Summary ─────────────────────────────────────────────');
  if (DRY_RUN) console.log(`  Would upload: ${dryRun.length}`);
  else {
    console.log(`  Uploaded:  ${uploaded.length}`);
    console.log(`  Skipped:   ${skipped.length}  (already in R2)`);
    console.log(`  Failed:    ${failed.length}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed files:');
    for (const f of failed) console.log(`  ✗ ${f.storageKey} — ${f.error}`);
  }

  // ─── Write manifest.json to R2 ───────────────────────────────────────────
  if (!DRY_RUN && (uploaded.length > 0 || skipped.length > 0)) {
    // Build complete manifest (all animations, regardless of what this run filtered)
    const allManifest = buildStreamojiAnimationManifest().map((a) => {
      const storageKey = `${targetPrefix}/${a.fileName}`;
      return {
        id: a.id,
        aliases: a.aliases || [],
        name: a.name,
        category: a.category,
        avatarGender: a.avatarGender,
        fileName: a.fileName,
        storageKey,
        publicUrl: buildPublicUrl(baseUrl, storageKey),
        sourceUrl: a.sourceUrl,
      };
    });

    const manifestPayload = {
      generatedAt: new Date().toISOString(),
      prefix: targetPrefix,
      totalAnimations: allManifest.length,
      categorySummary: allManifest.reduce((acc, a) => {
        const key = `${a.category}/${a.avatarGender}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      animations: allManifest,
    };

    const remoteManifestKey = `${targetPrefix}/manifest.json`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: remoteManifestKey,
      Body: JSON.stringify(manifestPayload, null, 2),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public, max-age=300',
    }));

    console.log(`\n  ✓ Manifest updated: ${buildPublicUrl(baseUrl, remoteManifestKey)}`);
  }

  console.log('\nDone.');
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
