#!/usr/bin/env python3
"""Reject Android App Bundles that would ship unstripped Flutter libraries."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

MIB = 1024 * 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--max-bundle-mib", type=float, default=35.0)
    parser.add_argument("--max-libflutter-mib", type=float, default=20.0)
    parser.add_argument("--manifest", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    bundle = args.bundle.resolve()
    failures: list[str] = []

    if not bundle.is_file():
        print(f"ERROR: bundle does not exist: {bundle}", file=sys.stderr)
        return 2

    bundle_bytes = bundle.stat().st_size
    with zipfile.ZipFile(bundle) as archive:
        flutter_entries = [
            entry
            for entry in archive.infolist()
            if entry.filename.endswith("/lib/arm64-v8a/libflutter.so")
        ]

    if len(flutter_entries) != 1:
        failures.append(
            "expected exactly one arm64-v8a libflutter.so entry, "
            f"found {len(flutter_entries)}"
        )
        libflutter_bytes = None
        libflutter_compressed_bytes = None
        libflutter_path = None
    else:
        flutter_entry = flutter_entries[0]
        libflutter_bytes = flutter_entry.file_size
        libflutter_compressed_bytes = flutter_entry.compress_size
        libflutter_path = flutter_entry.filename
        if libflutter_bytes > args.max_libflutter_mib * MIB:
            failures.append(
                f"{libflutter_path} is {libflutter_bytes / MIB:.2f} MiB uncompressed; "
                f"limit is {args.max_libflutter_mib:.2f} MiB. Native symbols were likely not stripped."
            )

    if bundle_bytes > args.max_bundle_mib * MIB:
        failures.append(
            f"bundle is {bundle_bytes / MIB:.2f} MiB; "
            f"limit is {args.max_bundle_mib:.2f} MiB"
        )

    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    report = {
        "bundle": str(bundle),
        "bundleBytes": bundle_bytes,
        "bundleMiB": round(bundle_bytes / MIB, 2),
        "libflutter": libflutter_path,
        "libflutterBytes": libflutter_bytes,
        "libflutterMiB": (
            round(libflutter_bytes / MIB, 2) if libflutter_bytes is not None else None
        ),
        "libflutterCompressedBytes": libflutter_compressed_bytes,
        "sha256": digest,
        "limits": {
            "bundleMiB": args.max_bundle_mib,
            "libflutterMiB": args.max_libflutter_mib,
        },
        "valid": not failures,
    }

    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
