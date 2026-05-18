# Apothecary Avatar Viewer — Animation Download Guide

## Context

This project uses Streamoji avatar GLB animations served from a public Cloudflare R2 CDN.

**The avatar character model** is downloaded from Streamoji's API and stored in our own R2 bucket.

**The animation GLBs** are currently served on-demand at runtime directly from Streamoji's public CDN:
```
https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev
```

The goal is to **pre-download all animation GLBs** and store them in our own Cloudflare R2 bucket so they are served from our CDN instead of Streamoji's, improving reliability and load times.

---

## What Has Already Been Done

The **Idle** animations have already been downloaded and stored in R2.

They were stored under the key prefix defined in the `.env`:
```
STREAMOJI_ANIMATIONS_R2_PREFIX=animations/streamoji
```

The files are stored per gender using this pattern:
```
animations/streamoji/{gender}/{filename}.glb
```

Where `{gender}` is `male` or `female` and `{filename}` comes from the `fileName` field in the animation manifest.

### How the fileName is Built

See `src/modules/avatarLibrary/streamojiAnimationManifest.ts` → `buildStreamojiAnimationManifest()`:

```ts
fileName: `${avatarGender}/${animation.path.split('/').pop()}`
```

So for example:
- gender = `male`, path = `dance/M_Dances_001.glb`
- → `fileName` = `male/M_Dances_001.glb`
- → R2 key = `animations/streamoji/male/M_Dances_001.glb`

---

## What Still Needs to Be Downloaded

The **three remaining animation categories** that still point to Streamoji's CDN:

### Dance (15 animations × 2 genders = 30 files)

| ID | File | Source URL (masculine) |
|----|------|----------------------|
| m_dance_01 | M_Dances_001.glb | `.../masculine/dance/M_Dances_001.glb` |
| m_dance_02 | M_Dances_002.glb | `.../masculine/dance/M_Dances_002.glb` |
| m_dance_03 | M_Dances_003.glb | `.../masculine/dance/M_Dances_003.glb` |
| m_dance_04 | M_Dances_004.glb | `.../masculine/dance/M_Dances_004.glb` |
| m_dance_05 | M_Dances_005.glb | `.../masculine/dance/M_Dances_005.glb` |
| m_dance_06 | M_Dances_006.glb | `.../masculine/dance/M_Dances_006.glb` |
| m_dance_07 | M_Dances_007.glb | `.../masculine/dance/M_Dances_007.glb` |
| m_dance_08 | M_Dances_008.glb | `.../masculine/dance/M_Dances_008.glb` |
| m_dance_09 | M_Dances_009.glb | `.../masculine/dance/M_Dances_009.glb` |
| m_dance_11 | M_Dances_011.glb | `.../masculine/dance/M_Dances_011.glb` |
| f_dance_01 | F_Dances_001.glb | `.../masculine/dance/F_Dances_001.glb` |
| f_dance_04 | F_Dances_004.glb | `.../masculine/dance/F_Dances_004.glb` |
| f_dance_05 | F_Dances_005.glb | `.../masculine/dance/F_Dances_005.glb` |
| f_dance_06 | F_Dances_006.glb | `.../masculine/dance/F_Dances_006.glb` |
| f_dance_07 | F_Dances_007.glb | `.../masculine/dance/F_Dances_007.glb` |

> Same 15 files repeat for the `femenine` folder variant.

---

### Locomotion (25 animations × 2 genders = 50 files)

| ID | File |
|----|------|
| m_walk_01 | M_Walk_001.glb |
| m_walk_02 | M_Walk_002.glb |
| m_run_01 | M_Run_001.glb |
| m_jog_01 | M_Jog_001.glb |
| m_jog_03 | M_Jog_003.glb |
| m_walk_back | M_Walk_Backwards_001.glb |
| m_run_back | M_Run_Backwards_002.glb |
| m_jog_back | M_Jog_Backwards_001.glb |
| m_walk_jump_1 | M_Walk_Jump_001.glb |
| m_walk_jump_2 | M_Walk_Jump_002.glb |
| m_walk_jump_3 | M_Walk_Jump_003.glb |
| m_run_jump_1 | M_Run_Jump_001.glb |
| m_run_jump_2 | M_Run_Jump_002.glb |
| m_jog_jump_1 | M_Jog_Jump_001.glb |
| m_jog_jump_2 | M_Jog_Jump_002.glb |
| f_walk_02 | F_Walk_002.glb |
| f_walk_03 | F_Walk_003.glb |
| f_run_01 | F_Run_001.glb |
| f_jog_01 | F_Jog_001.glb |
| f_walk_strafe_l | F_Walk_Strafe_Left_001.glb |
| f_walk_strafe_r | F_Walk_Strafe_Right_001.glb |
| m_walk_strafe_l | M_Walk_Strafe_Left_002.glb |
| m_walk_strafe_r | M_Walk_Strafe_Right_002.glb |
| m_crouch | M_Crouch_Walk_003.glb |
| f_crouch | F_Crouch_Walk_001.glb |

> Folder: `locomotion/`. Same 25 files for both `masculine` and `femenine`.

---

### Expression (34 animations × 2 genders = 68 files)

| ID | File |
|----|------|
| m_expr_01 | M_Standing_Expressions_001.glb |
| m_expr_02 | M_Standing_Expressions_002.glb |
| m_expr_04 | M_Standing_Expressions_004.glb |
| m_expr_05 | M_Standing_Expressions_005.glb |
| m_expr_06 | M_Standing_Expressions_006.glb |
| m_expr_07 | M_Standing_Expressions_007.glb |
| m_expr_08 | M_Standing_Expressions_008.glb |
| m_expr_09 | M_Standing_Expressions_009.glb |
| m_expr_10 | M_Standing_Expressions_010.glb |
| m_expr_11 | M_Standing_Expressions_011.glb |
| m_expr_12 | M_Standing_Expressions_012.glb |
| m_expr_13 | M_Standing_Expressions_013.glb |
| m_expr_14 | M_Standing_Expressions_014.glb |
| m_expr_15 | M_Standing_Expressions_015.glb |
| m_expr_16 | M_Standing_Expressions_016.glb |
| m_expr_17 | M_Standing_Expressions_017.glb |
| m_expr_18 | M_Standing_Expressions_018.glb |
| m_talk_01 | M_Talking_Variations_001.glb |
| m_talk_02 | M_Talking_Variations_002.glb |
| m_talk_03 | M_Talking_Variations_003.glb |
| m_talk_04 | M_Talking_Variations_004.glb |
| m_talk_05 | M_Talking_Variations_005.glb |
| m_talk_06 | M_Talking_Variations_006.glb |
| m_talk_07 | M_Talking_Variations_007.glb |
| m_talk_08 | M_Talking_Variations_008.glb |
| m_talk_09 | M_Talking_Variations_009.glb |
| m_talk_10 | M_Talking_Variations_010.glb |
| f_talk_01 | F_Talking_Variations_001.glb |
| f_talk_02 | F_Talking_Variations_002.glb |
| f_talk_03 | F_Talking_Variations_003.glb |
| f_talk_04 | F_Talking_Variations_004.glb |
| f_talk_05 | F_Talking_Variations_005.glb |
| f_talk_06 | F_Talking_Variations_006.glb |

> Folder: `expression/`. Same 34 files for both `masculine` and `femenine`.

---

## Full Source URL Pattern

```
https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/{genderFolder}/{category}/{filename}
```

- `{genderFolder}` = `masculine` or `femenine` (note: Streamoji spells it "femenine")
- `{category}` = `dance`, `locomotion`, or `expression`
- `{filename}` = the GLB filename from the tables above

**Example:**
```
https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/masculine/dance/M_Dances_001.glb
https://pub-be53cae7bd99457a8c1f11b4d38f1672.r2.dev/femenine/expression/F_Talking_Variations_001.glb
```

---

## Target R2 Storage Key Pattern

```
animations/streamoji/{gender}/{filename}
```

- `{gender}` = `male` or `female` (our internal naming, NOT Streamoji's folder name)
- `{filename}` = the GLB filename (same as source, no folder prefix)

**Example:**
```
animations/streamoji/male/M_Dances_001.glb
animations/streamoji/female/F_Talking_Variations_001.glb
```

> This matches exactly what `buildStreamojiAnimationManifest()` computes as `fileName`.

---

## How to Implement the Download Script

**Do NOT hardcode URLs manually.** Use `buildStreamojiAnimationManifest()` from
`src/modules/avatarLibrary/streamojiAnimationManifest.ts` as the single source of truth.
It already has both `sourceUrl` and `fileName` for every animation × gender combination.

Place the script in the `scripts/` directory and filter to only the categories still needed:

```ts
import { buildStreamojiAnimationManifest } from '../src/modules/avatarLibrary/streamojiAnimationManifest';
import { r2StorageService } from '../src/services/r2Storage.service';

const CATEGORIES_TO_DOWNLOAD = ['Dance', 'Locomotion', 'Expression']; // Idle already done
const PREFIX = process.env.STREAMOJI_ANIMATIONS_R2_PREFIX || 'animations/streamoji';

const animations = buildStreamojiAnimationManifest().filter(
    (a) => CATEGORIES_TO_DOWNLOAD.includes(a.category)
);

for (const animation of animations) {
    const storageKey = `${PREFIX}/${animation.fileName}`;
    console.log(`Downloading ${animation.sourceUrl} ...`);
    const response = await fetch(animation.sourceUrl);
    if (!response.ok) {
        console.error(`FAILED ${animation.sourceUrl}: ${response.status}`);
        continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await r2StorageService.uploadBuffer(storageKey, buffer, 'model/gltf-binary');
    console.log(`✓  Uploaded → ${storageKey}`);
}
```

**Total files to download:** 30 (Dance) + 50 (Locomotion) + 68 (Expression) = **148 GLB files**

---

## Verification

After uploading, verify the animations are accessible via the public R2 URL:

```
{CLOUDFLARE_R2_PUBLIC_BASE_URL}/animations/streamoji/male/M_Dances_001.glb
```

The `CLOUDFLARE_R2_PUBLIC_BASE_URL` env var is already set in the project's `.env`.

Also confirm the backend API response for `GET /api/v1/avatar-viewer/session/me` returns
non-empty `url` fields in the `animations` array — if the base URL env is set and files are
uploaded, URLs will resolve correctly automatically.
