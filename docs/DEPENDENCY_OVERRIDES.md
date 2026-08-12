# Why `pnpm.overrides` exists in package.json

Three packages carried published advisories, and none of them is a direct
dependency — they arrive through the dependency tree, so `pnpm update <name>` has no
effect on them. An override tells pnpm to install a chosen version regardless of what
the package that depends on them asked for.

| Package | Was installed | Forced to | Advisory |
|---|---|---|---|
| `sharp` | 0.34.5 **and** 0.35.2 | `^0.35.0` | Inherited libvips CVEs (CVE-2026-33327, -33328, -35590, -35591) |
| `nanoid` | 3.3.15 | `^3.3.17` | Denial of service — generators can loop indefinitely |
| `postcss` | 8.4.31 **and** 8.5.16 | `^8.5.23` | XSS via unescaped `</style>`; arbitrary `.map` file read |

`sharp` matters most: it processes uploaded images, which are attacker-supplied by
definition. `postcss` and `nanoid` are build-time and lower risk, but they came free
with the same change.

Two copies of `sharp` and `postcss` were installed simultaneously — different parts
of the tree pinning different versions. The override collapses each to one.

## Ranges are deliberately capped

Carets, not `>=`:

- `^0.35.0` resolves to `>=0.35.0 <0.36.0`. For a `0.x` package a caret pins the
  minor version, because pre-1.0 projects treat minor bumps as breaking.
- `^3.3.17` keeps `nanoid` on v3. Version 5 is ESM-only and would break the build.
- `^8.5.23` keeps `postcss` on v8.

A bare `>=` would have allowed a future major version to arrive silently during an
unrelated install — the kind of upgrade that breaks a Friday deploy for no reason
anybody remembers.

## What to check after changing these

An override overrules what a package said it needs, so the risk is real if small.
`sharp` sits on the image path, so:

```powershell
pnpm install
pnpm typecheck
pnpm test
```

Then deploy and **upload a photograph to a property**. If images upload and display,
the override is fine. That single check covers the only override with runtime
consequences — `postcss` and `nanoid` would fail at build time, so a green build is
sufficient for them.

## A warning you can ignore — for now

Running `pnpm install` prints:

> The "pnpm" field in package.json is no longer read by pnpm. The following keys were
> ignored: "pnpm.overrides".

That warning comes from a newer pnpm reading the file. The version this project
actually uses — `pnpm@9.12.0`, pinned in `packageManager` and used by CI — **does**
read `pnpm.overrides`, and the result is visible in `pnpm-lock.yaml`:

```yaml
overrides:
  sharp: ^0.35.0
  nanoid: ^3.3.17
  postcss: ^8.5.23
```

with `sharp@0.35.2`, `nanoid@3.3.18` and `postcss@8.5.26` resolved. The overrides are
applied.

**But this is a trap waiting for whoever upgrades pnpm.** From pnpm 10 onwards the
setting moved to `pnpm-workspace.yaml`:

```yaml
overrides:
  sharp: ^0.35.0
  nanoid: ^3.3.17
  postcss: ^8.5.23
```

If someone bumps `packageManager` to pnpm 10 or later without moving these, the
overrides are silently dropped and the vulnerable versions come back — with no error,
because everything still installs and builds. Move them at the same time as the pnpm
upgrade, and confirm with `pnpm why sharp` afterwards.

## When to remove these

Overrides are a workaround, not a fix. Once the packages upstream depend on patched
versions of their own accord, the entries become redundant. Check occasionally:

```powershell
pnpm why sharp
```

If everything already requires `>=0.35.0`, drop the override and reinstall.
