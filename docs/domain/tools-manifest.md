---
title: Tools manifest
summary: Format of tools/tools.manifest and how tools/install.sh and install.ps1 install pinned tools
tags: [install, tools]
---

# Tools manifest

`tools/tools.manifest` lists the tools an orch repo needs, each pinned to a ref. `tools/install.sh` (WSL, Linux, macOS) and `tools/install.ps1` (Windows) read it and install every tool.

## Format

One tool per line, four whitespace-separated fields: `<name> <kind> <source> <ref>`. Blank lines and lines starting with `#` are ignored.

| kind | source | ref | install steps |
| --- | --- | --- | --- |
| `git-npm` | git URL | tag, branch or commit | clone, `npm install`, `npm run build`, `npm link` each `packages/*`, `npm run skills:install` |
| `npm` | npm package name | version | `npm install -g <name>@<version>` |
| `dotnet` | NuGet package id | version | `dotnet tool update --global <id> --version <version>` |
| `git-dotnet` | git URL | tag, branch or commit | clone, run `scripts/install.sh` (`scripts/install.ps1` on Windows) |

The base manifest installs `plan-axi` (`change-axi`, `docs-axi` and the plan skills), `tasks-axi` and `dotnet-test-axi`.

## Usage

```sh
tools/install.sh
```

Options: `--manifest <file>` use another manifest, `--src <dir>` clone location (default `~/.local/share/orch-tools`, or `$TOOLS_SRC`), `--only <name>` install only that tool (repeatable). The PowerShell script takes `-Manifest`, `-Src` and `-Only`.

Reruns are safe: clones are fetched and re-checked out at the pinned ref, and links and global installs are updated in place.

## Pinning per repo

An orch repo copies `tools/tools.manifest` and edits refs, or keeps its own manifest and passes `--manifest`. Bump a pin by changing the ref and rerunning the installer.

## Requirements

`git`, `node` with `npm`, and the .NET SDK for `dotnet-test-axi`. The installer does not install these.
