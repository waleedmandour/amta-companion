#!/usr/bin/env python3
"""Bump the AMTA Companion version in the three files that must stay in lockstep:
package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml.

Usage: python3 scripts/bump.py 0.2.0
Then:  git commit -am "chore(release): v<version>" && git tag v<version> && git push origin main v<version>
"""
import json
import re
import sys
import pathlib

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+(-[\w.]+)?", sys.argv[1]):
    sys.exit("usage: bump.py <semver, e.g. 0.2.0>")
version = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent

pkg = root / "package.json"
data = json.loads(pkg.read_text(encoding="utf-8"))
data["version"] = version
pkg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

conf = root / "src-tauri" / "tauri.conf.json"
data = json.loads(conf.read_text(encoding="utf-8"))
data["version"] = version
conf.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

cargo = root / "src-tauri" / "Cargo.toml"
text = cargo.read_text(encoding="utf-8")
text = re.sub(r'(?m)^version = ".*"$', f'version = "{version}"', text, count=1)
cargo.write_text(text, encoding="utf-8")

print(f"bumped package.json, tauri.conf.json, Cargo.toml -> {version}")
