#!/usr/bin/env python3
"""Read-only, offline verifier for the HuGR v1.0 handoff. Python 3.9+.

Usage: python3 11-handoff/verify_handoff.py [--json] [--kit-root DIRECTORY]
Exit 0: local checks passed. Exit 1: failed check. Exit 2: invalid CLI usage.
This does not run a product, prove rendering, or provide a digital signature.
"""
import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def local_file(root, relative):
    """Reject traversal, absolute paths and symlinks, including parent links."""
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise ValueError("Invalid relative path: " + repr(relative))
    raw = PurePosixPath(relative)
    if raw.is_absolute() or ".." in raw.parts:
        raise ValueError("Unsafe relative path: " + relative)
    candidate = root
    for part in raw.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError("Symlink not allowed in a baseline path: " + relative)
    if not candidate.is_file():
        raise ValueError("File missing: " + relative)
    candidate.resolve().relative_to(root)
    return candidate


def checksum_lines(root, relative):
    result = {}
    for number, line in enumerate(local_file(root, relative).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if not match:
            raise ValueError("Malformed checksum at {}:{}".format(relative, number))
        expected, name = match.groups()
        if name in result:
            raise ValueError("Duplicate checksum path: " + name)
        result[name] = expected
    return result


def verify(root):
    result = {
        "scope": "local_package_integrity_and_relationships_only",
        "visual_change_requested": False,
        "product_integration_tested": False,
        "counts": {},
        "errors": [],
    }
    errors = result["errors"]

    def require(condition, message):
        if not condition:
            errors.append(message)

    mapping = json.loads(local_file(root, "11-handoff/ASSET-MAP.json").read_text(encoding="utf-8"))
    require(mapping.get("schema_version") == 1, "Unsupported ASSET-MAP schema")
    baseline = mapping["files"]
    baseline_names = [entry["path"] for entry in baseline]
    require(len(baseline_names) == len(set(baseline_names)), "Duplicate baseline paths")
    require(len(baseline) == mapping["counts"]["original_files"] == 295, "Baseline count differs from v1.0")
    for item in baseline:
        try:
            file = local_file(root, item["path"])
            require(file.stat().st_size == item["bytes"], "Size changed: " + item["path"])
            require(digest(file) == item["sha256"], "Baseline hash mismatch: " + item["path"])
        except (OSError, ValueError) as error:
            errors.append(str(error))
    result["counts"]["original_files_checked"] = len(baseline)

    original_checksums = checksum_lines(root, "CHECKSUMS.sha256")
    require(set(original_checksums) == set(baseline_names) - {"CHECKSUMS.sha256"}, "Original checksum coverage differs")
    for relative, expected in original_checksums.items():
        try:
            require(digest(local_file(root, relative)) == expected, "Original checksum mismatch: " + relative)
        except (OSError, ValueError) as error:
            errors.append(str(error))
    result["counts"]["original_checksum_entries_checked"] = len(original_checksums)

    pairs = mapping["canonical_deployed_pairs"]
    for pair in pairs:
        try:
            canonical = digest(local_file(root, pair["canonical"]))
            deployed = digest(local_file(root, pair["deployed_copy"]))
            require(canonical == deployed == pair["sha256"], "Web copy differs: " + pair["deployed_copy"])
        except (OSError, ValueError) as error:
            errors.append(str(error))
    actual_web = {p.relative_to(root).as_posix() for p in (root / "07-web/brand").rglob("*") if p.is_file()}
    require(actual_web == {p["deployed_copy"] for p in pairs}, "Web subset inventory differs")
    require(len(pairs) == mapping["counts"]["web_subset_files"] == 36, "Web subset count differs")
    result["counts"]["web_copy_pairs_checked"] = len(pairs)

    parsed = 0
    master_count = 0
    for relative in baseline_names:
        if not relative.endswith(".svg"):
            continue
        try:
            svg = ET.parse(local_file(root, relative)).getroot()
            require(svg.tag.rsplit("}", 1)[-1] == "svg", "Invalid SVG root: " + relative)
            parsed += 1
            if relative.startswith("01-logos/svg/"):
                master_count += 1
                ids = [el.attrib["id"] for el in svg.iter() if "id" in el.attrib]
                require(len(ids) == len(set(ids)), "Duplicate SVG ids: " + relative)
                for el in svg.iter():
                    tag = el.tag.rsplit("}", 1)[-1]
                    require(tag not in {"image", "script", "foreignObject", "text", "font"}, "Unexpected raster/script/text/font: " + relative)
                    for key, value in el.attrib.items():
                        attribute = key.rsplit("}", 1)[-1]
                        require(not attribute.lower().startswith("on"), "Event handler in logo: " + relative)
                        if attribute == "href":
                            require(value.startswith("#"), "External SVG href: " + relative)
                        for target in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", value):
                            require(target.startswith("#") and target[1:] in ids, "Unresolved SVG reference: " + relative)
        except (ET.ParseError, OSError, ValueError) as error:
            errors.append("{}: {}".format(relative, error))
    require(master_count == mapping["counts"]["logo_svg_masters"] == 42, "Master SVG count differs")
    result["counts"]["svg_xml_parsed"] = parsed
    result["counts"]["logo_master_svgs_checked"] = master_count

    catalogue = json.loads(local_file(root, "assets.json").read_text(encoding="utf-8"))["assets"]
    require(catalogue == mapping["logo_catalogue"], "Catalogue differs from original assets.json")
    for asset in catalogue:
        try:
            svg = ET.parse(local_file(root, asset["file"])).getroot()
            viewbox = [float(value) for value in svg.attrib["viewBox"].split()]
            require(len(viewbox) == 4 and viewbox[2:] == [asset["width"], asset["height"]], "SVG dimensions differ: " + asset["file"])
        except (ET.ParseError, OSError, ValueError, KeyError) as error:
            errors.append("{}: {}".format(asset.get("file", "catalogue"), error))
    for route in mapping["usage_routes"]:
        try:
            local_file(root, route["source"])
        except (OSError, ValueError) as error:
            errors.append(str(error))
    result["counts"]["usage_routes_checked"] = len(mapping["usage_routes"])

    manifest_path = mapping["web"]["manifest"]
    manifest = json.loads(local_file(root, manifest_path).read_text(encoding="utf-8"))
    for icon in manifest["icons"]:
        try:
            local_file(root, (PurePosixPath(manifest_path).parent / icon["src"]).as_posix())
        except (OSError, ValueError) as error:
            errors.append(str(error))
    result["counts"]["manifest_icon_references_checked"] = len(manifest["icons"])

    addon_checksums = checksum_lines(root, "HANDOFF-CHECKSUMS.sha256")
    expected_additions = {p.relative_to(root).as_posix() for p in (root / "11-handoff").rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    expected_additions.add("AGENT-START-HERE.md")
    require(set(addon_checksums) == expected_additions, "Handoff checksum coverage differs")
    for relative, expected in addon_checksums.items():
        try:
            require(digest(local_file(root, relative)) == expected, "Handoff hash mismatch: " + relative)
        except (OSError, ValueError) as error:
            errors.append(str(error))
    result["counts"]["handoff_files_checked"] = len(addon_checksums)
    result["status"] = "PASS" if not errors else "FAIL"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", action="store_true", help="Print machine-readable output to stdout")
    args = parser.parse_args()
    try:
        result = verify(args.kit_root.resolve())
    except (OSError, ValueError, KeyError, TypeError, ET.ParseError) as error:
        result = {"status": "FAIL", "scope": "local_package_integrity_and_relationships_only", "errors": [str(error)]}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("HuGR handoff: " + result["status"])
        for name, count in result.get("counts", {}).items():
            print("  {}: {}".format(name, count))
        for error in result["errors"]:
            print("  ERROR: " + error)
        print("Read-only, offline check. Does not validate integration in a product.")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
