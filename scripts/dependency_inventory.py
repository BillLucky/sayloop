"""Print installed package license declarations; no paths, secrets, or user data."""

import json
from importlib.metadata import distributions

entries = []
for distribution in distributions():
    metadata = distribution.metadata
    classifiers = metadata.get_all("Classifier") or []
    entries.append(
        {
            "name": metadata["Name"],
            "version": distribution.version,
            "license_expression": metadata.get("License-Expression"),
            "license_classifiers": [c for c in classifiers if c.startswith("License ::")],
            "license_declaration": (metadata.get("License") or "Unspecified")[:200],
        }
    )
print(json.dumps(sorted(entries, key=lambda item: item["name"].lower()), indent=2))
