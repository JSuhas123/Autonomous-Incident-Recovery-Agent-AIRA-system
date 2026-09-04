"""Phase 23R.13U immutable corpus freeze manifest.

A successful 23R.13T certification is required before a corpus can be frozen.
The freeze records the exact physical inventory/certification bytes, source and
policy versions, partition/holdout summaries, and the full physical-artifact
hash chain.

CORPUS FREEZE != EXECUTION AUTHORITY.
CORPUS FREEZE != PRODUCTION CERTIFICATION.
HOLDOUT != RETRIEVAL CORPUS.
"""

from __future__ import annotations

import hashlib
import json

from collections import Counter
from pathlib import Path
from typing import Any
from typing import Dict
from typing import Mapping

from intelligence.reality.corpus.coverage.corpus_coverage_certification import (
    CORPUS_COVERAGE_CERTIFICATION_VERSION,
)
from intelligence.reality.corpus.partitioning.partition_policy import (
    CORPUS_PARTITION_POLICY_VERSION,
)
from intelligence.reality.corpus.policy.corpus_policy import (
    CORPUS_POLICY_VERSION,
)
from intelligence.reality.corpus.registry.source_registry import (
    SOURCE_REGISTRY_VERSION,
)


CORPUS_FREEZE_VERSION = "23R.13U.0"

INVENTORY_RELATIVE = (
    "manifests/phase23r13-corpus-inventory.json"
)

CERTIFICATION_RELATIVE = (
    "certification/phase23r13-corpus-coverage.json"
)

FREEZE_RELATIVE = (
    "manifests/phase23r13-corpus-freeze.json"
)


FORBIDDEN_HOLDOUT_ELIGIBILITY = (
    "modelTrainingEligible",
    "retrievalEligible",
    "developmentEvaluationEligible",
    "validationEligible",
    "customerRuntimeEligible",
)


def _stable_bytes(
    value: Any,
) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(
            ",",
            ":",
        ),
        ensure_ascii=False,
    ).encode(
        "utf-8"
    )


def _sha256_bytes(
    value: bytes,
) -> str:
    return hashlib.sha256(
        value
    ).hexdigest()


def _stable_hash(
    value: Any,
) -> str:
    return _sha256_bytes(
        _stable_bytes(
            value
        )
    )


def _descriptor(
    path: Path,
) -> Dict[
    str,
    Any,
]:
    if not path.is_file():
        raise ValueError(
            (
                "required Phase 23R corpus "
                "artifact missing: "
                f"{path}"
            )
        )

    payload = (
        path.read_bytes()
    )

    if not payload:
        raise ValueError(
            (
                "required Phase 23R corpus "
                "artifact is empty: "
                f"{path}"
            )
        )

    return {
        "path":
            str(
                path
            ),

        "byteSize":
            len(
                payload
            ),

        "sha256":
            _sha256_bytes(
                payload
            ),
    }


def _read_json(
    path: Path,
) -> Dict[
    str,
    Any,
]:
    _descriptor(
        path
    )

    try:
        value = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except json.JSONDecodeError as exc:
        raise ValueError(
            (
                "invalid JSON artifact: "
                f"{path}"
            )
        ) from exc

    if not isinstance(
        value,
        dict,
    ):
        raise ValueError(
            (
                "JSON artifact must contain "
                f"an object: {path}"
            )
        )

    return value


def _require_false(
    value: Mapping[
        str,
        Any,
    ],
    field: str,
    label: str,
) -> None:
    if (
        value.get(
            field
        )
        is not False
    ):
        raise ValueError(
            (
                f"{label} must keep "
                f"{field}=false"
            )
        )


def _is_sha256(
    value: Any,
) -> bool:
    if (
        not isinstance(
            value,
            str,
        )
        or
        len(
            value
        )
        !=
        64
    ):
        return False

    return all(
        character
        in
        (
            "0123456789"
            "abcdef"
            "ABCDEF"
        )

        for character
        in value
    )


def _validate_certification(
    certification: Mapping[
        str,
        Any,
    ],
) -> None:
    if (
        certification.get(
            "version"
        )
        !=
        CORPUS_COVERAGE_CERTIFICATION_VERSION
    ):
        raise ValueError(
            (
                "23R.13U requires the frozen "
                "23R.13T certification version"
            )
        )

    if (
        certification.get(
            "passed"
        )
        is not True
    ):
        raise ValueError(
            (
                "23R.13U requires a passing "
                "23R.13T certification"
            )
        )

    hard_failures = (
        certification.get(
            "hardFailures"
        )
    )

    if not isinstance(
        hard_failures,
        Mapping,
    ):
        raise ValueError(
            (
                "23R.13T certification is "
                "missing hardFailures"
            )
        )

    non_empty = {
        key:
            value

        for (
            key,
            value,
        ) in hard_failures.items()

        if value
    }

    if non_empty:
        raise ValueError(
            (
                "23R.13T contains unresolved "
                "hard failures"
            )
        )

    _require_false(
        certification,
        "executionAuthorized",
        "23R.13T certification",
    )

    _require_false(
        certification,
        "productionCertified",
        "23R.13T certification",
    )

    certification_hash = (
        certification.get(
            "certificationHash"
        )
    )

    if not _is_sha256(
        certification_hash
    ):
        raise ValueError(
            (
                "23R.13T certificationHash "
                "must be SHA-256"
            )
        )

    core = {
        key:
            value

        for (
            key,
            value,
        ) in certification.items()

        if key
        !=
        "certificationHash"
    }

    expected = (
        _stable_hash(
            core
        )
    )

    if (
        certification_hash.lower()
        !=
        expected
    ):
        raise ValueError(
            (
                "23R.13T certificationHash "
                "does not match "
                "certification content"
            )
        )


def _validate_inventory(
    inventory: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    sources = (
        inventory.get(
            "sources"
        )
    )

    cases = (
        inventory.get(
            "cases"
        )
    )

    if (
        not isinstance(
            sources,
            list,
        )
        or
        not sources
    ):
        raise ValueError(
            (
                "corpus inventory must "
                "contain sources"
            )
        )

    if (
        not isinstance(
            cases,
            list,
        )
        or
        not cases
    ):
        raise ValueError(
            (
                "corpus inventory must "
                "contain cases"
            )
        )

    inventory_hash = (
        inventory.get(
            "inventoryHash"
        )
    )

    if not _is_sha256(
        inventory_hash
    ):
        raise ValueError(
            (
                "corpus inventory "
                "inventoryHash must "
                "be SHA-256"
            )
        )

    inventory_core = {
        key:
            value

        for (
            key,
            value,
        ) in inventory.items()

        if key
        !=
        "inventoryHash"
    }

    if (
        inventory_hash.lower()
        !=
        _stable_hash(
            inventory_core
        )
    ):
        raise ValueError(
            (
                "corpus inventoryHash "
                "does not match "
                "inventory content"
            )
        )

    source_ids: set[
        str
    ] = set()

    for (
        index,
        source,
    ) in enumerate(
        sources,
        start=1,
    ):
        if not isinstance(
            source,
            Mapping,
        ):
            raise ValueError(
                (
                    f"inventory source "
                    f"{index} must be "
                    "an object"
                )
            )

        source_id = str(
            source.get(
                "sourceId",
                "",
            )
        ).strip()

        if (
            not source_id
            or
            source_id
            in source_ids
        ):
            raise ValueError(
                (
                    f"inventory source "
                    f"{index} has missing/"
                    "duplicate sourceId"
                )
            )

        source_ids.add(
            source_id
        )

        if (
            source.get(
                "policyStatus"
            )
            ==
            "APPROVED_COMMERCIAL"
        ):
            if (
                source.get(
                    "licenseVerified"
                )
                is not True
            ):
                raise ValueError(
                    (
                        "commercial source "
                        f"{source_id} has "
                        "unverified license"
                    )
                )

    case_ids: set[
        str
    ] = set()

    partition_counts: Counter[
        str
    ] = Counter()

    role_counts: Counter[
        str
    ] = Counter()

    grade_counts: Counter[
        str
    ] = Counter()

    provider_counts: Counter[
        str
    ] = Counter()

    source_counts: Counter[
        str
    ] = Counter()

    final_holdout_count = (
        0
    )

    holdout_leakage_count = (
        0
    )

    authority_violations = (
        0
    )

    ground_truth_violations = (
        0
    )

    production_certification_violations = (
        0
    )

    for (
        index,
        case,
    ) in enumerate(
        cases,
        start=1,
    ):
        if not isinstance(
            case,
            Mapping,
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{index} must be "
                    "an object"
                )
            )

        case_id = str(
            case.get(
                "caseId",
                "",
            )
        ).strip()

        if (
            not case_id
            or
            case_id
            in case_ids
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{index} has missing/"
                    "duplicate caseId"
                )
            )

        case_ids.add(
            case_id
        )

        source_id = str(
            case.get(
                "sourceId",
                "",
            )
        ).strip()

        if (
            source_id
            not in source_ids
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{case_id} references "
                    "unknown sourceId"
                )
            )

        role = str(
            case.get(
                "corpusRole",
                "",
            )
        ).strip()

        grade = str(
            case.get(
                "evidenceGrade",
                "",
            )
        ).strip()

        partition = str(
            case.get(
                "partition",
                "",
            )
        ).strip()

        if (
            not role
            or
            not grade
            or
            not partition
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{case_id} lacks "
                    "role/grade/partition"
                )
            )

        integrity_hash = (
            case.get(
                "integrityManifestHash"
            )
        )

        if not _is_sha256(
            integrity_hash
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{case_id} has "
                    "invalid integrity hash"
                )
            )

        eligibility = (
            case.get(
                "eligibility"
            )
        )

        if not isinstance(
            eligibility,
            Mapping,
        ):
            raise ValueError(
                (
                    f"inventory case "
                    f"{case_id} lacks "
                    "eligibility"
                )
            )

        if (
            eligibility.get(
                "agentGroundTruthVisible",
                False,
            )
            is not False
        ):
            ground_truth_violations += (
                1
            )

        if (
            case.get(
                "groundTruthAgentVisible"
            )
            is True
        ):
            ground_truth_violations += (
                1
            )

        if (
            case.get(
                "executionAuthorized"
            )
            is True
        ):
            authority_violations += (
                1
            )

        if (
            case.get(
                "productionCertified"
            )
            is True
        ):
            production_certification_violations += (
                1
            )

        is_final_holdout = (
            case.get(
                "isFinalHoldout"
            )
            is True
            or
            role
            ==
            "FINAL_HOLDOUT"
        )

        if is_final_holdout:
            final_holdout_count += (
                1
            )

            if (
                partition
                !=
                "HOLDOUT"
            ):
                holdout_leakage_count += (
                    1
                )

            if (
                eligibility.get(
                    "holdoutEligible"
                )
                is not True
            ):
                holdout_leakage_count += (
                    1
                )

            if any(
                eligibility.get(
                    key,
                    False,
                )

                for key
                in
                FORBIDDEN_HOLDOUT_ELIGIBILITY
            ):
                holdout_leakage_count += (
                    1
                )

        partition_counts[
            partition
        ] += (
            1
        )

        role_counts[
            role
        ] += (
            1
        )

        grade_counts[
            grade
        ] += (
            1
        )

        source_counts[
            source_id
        ] += (
            1
        )

        provider_family = (
            case.get(
                "providerFamily"
            )
        )

        if provider_family:
            provider_counts[
                str(
                    provider_family
                )
            ] += (
                1
            )

    if (
        final_holdout_count
        <
        50
    ):
        raise ValueError(
            (
                "23R.13U requires at least "
                "50 isolated FINAL_HOLDOUT "
                "cases"
            )
        )

    if holdout_leakage_count:
        raise ValueError(
            (
                "23R.13U detected "
                "FINAL_HOLDOUT retrieval/"
                "evaluation leakage"
            )
        )

    if authority_violations:
        raise ValueError(
            (
                "23R.13U detected "
                "corpus-derived "
                "execution authority"
            )
        )

    if ground_truth_violations:
        raise ValueError(
            (
                "23R.13U detected "
                "agent-visible ground truth"
            )
        )

    if (
        production_certification_violations
    ):
        raise ValueError(
            (
                "23R.13U detected "
                "corpus-derived production "
                "certification"
            )
        )

    return {
        "sourceCount":
            len(
                source_ids
            ),

        "caseCount":
            len(
                case_ids
            ),

        "finalHoldoutCount":
            final_holdout_count,

        "partitionCounts":
            dict(
                sorted(
                    partition_counts.items()
                )
            ),

        "roleCounts":
            dict(
                sorted(
                    role_counts.items()
                )
            ),

        "evidenceGradeCounts":
            dict(
                sorted(
                    grade_counts.items()
                )
            ),

        "providerFamilyCounts":
            dict(
                sorted(
                    provider_counts.items()
                )
            ),

        "sourceCounts":
            dict(
                sorted(
                    source_counts.items()
                )
            ),

        "holdoutRetrievalLeakage":
            0,

        "groundTruthAgentVisible":
            False,

        "corpusExecutionAuthority":
            False,

        "productionCertified":
            False,
    }


def _physical_artifacts(
    inventory: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    summary = (
        inventory.get(
            "physicalSummary"
        )
    )

    if not isinstance(
        summary,
        Mapping,
    ):
        raise ValueError(
            (
                "corpus inventory is "
                "missing physicalSummary"
            )
        )

    artifacts = (
        summary.get(
            "physicalArtifacts"
        )
    )

    if (
        not isinstance(
            artifacts,
            Mapping,
        )
        or
        not artifacts
    ):
        raise ValueError(
            (
                "corpus inventory is "
                "missing physical "
                "artifact descriptors"
            )
        )

    normalized: Dict[
        str,
        Any,
    ] = {}

    for (
        name,
        descriptor,
    ) in sorted(
        artifacts.items()
    ):
        if not isinstance(
            descriptor,
            Mapping,
        ):
            raise ValueError(
                (
                    "physical artifact "
                    f"descriptor {name} "
                    "is invalid"
                )
            )

        sha256 = (
            descriptor.get(
                "sha256"
            )
        )

        if not _is_sha256(
            sha256
        ):
            raise ValueError(
                (
                    "physical artifact "
                    f"descriptor {name} "
                    "lacks SHA-256"
                )
            )

        normalized[
            str(
                name
            )
        ] = {
            "path":
                str(
                    descriptor.get(
                        "path",
                        "",
                    )
                ),

            "byteSize":
                int(
                    descriptor.get(
                        "byteSize",
                        0,
                    )
                ),

            "sha256":
                str(
                    sha256
                ).lower(),
        }

    return normalized


def build_corpus_freeze(
    *,
    data_root: str | Path,
) -> Dict[
    str,
    Any,
]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    inventory_path = (
        root
        /
        INVENTORY_RELATIVE
    )

    certification_path = (
        root
        /
        CERTIFICATION_RELATIVE
    )

    inventory = (
        _read_json(
            inventory_path
        )
    )

    certification = (
        _read_json(
            certification_path
        )
    )

    _validate_certification(
        certification
    )

    inventory_summary = (
        _validate_inventory(
            inventory
        )
    )

    artifacts = {
        "canonicalInventory":
            _descriptor(
                inventory_path
            ),

        "coverageCertification":
            _descriptor(
                certification_path
            ),

        "physicalCorpus":
            _physical_artifacts(
                inventory
            ),
    }

    core = {
        "version":
            CORPUS_FREEZE_VERSION,

        "status":
            "FROZEN",

        "phaseGate":
            "23R.13U",

        "sourceRegistryVersion":
            SOURCE_REGISTRY_VERSION,

        "corpusPolicyVersion":
            CORPUS_POLICY_VERSION,

        "partitionPolicyVersion":
            CORPUS_PARTITION_POLICY_VERSION,

        "coverageCertificationVersion":
            CORPUS_COVERAGE_CERTIFICATION_VERSION,

        "inventoryHash":
            inventory[
                "inventoryHash"
            ],

        "coverageInventoryHash":
            certification[
                "inventoryHash"
            ],

        "coverageCertificationHash":
            certification[
                "certificationHash"
            ],

        "inventorySummary":
            inventory_summary,

        "artifacts":
            artifacts,

        "freezeSemantics": {
            "immutableSnapshot":
                True,

            "laterMutationRequiresNewCorpusVersion":
                True,

            "holdoutRetrievalLeakage":
                0,

            "researchOnlyCommercialLeakage":
                0,

            "quarantineCommercialLeakage":
                0,
        },

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **core,

        "freezeHash":
            _stable_hash(
                core
            ),
    }


def write_corpus_freeze(
    *,
    data_root: str | Path,
) -> Dict[
    str,
    Any,
]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    freeze = (
        build_corpus_freeze(
            data_root=
                root
        )
    )

    output = (
        root
        /
        FREEZE_RELATIVE
    )

    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    payload = (
        json.dumps(
            freeze,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        +
        "\n"
    ).encode(
        "utf-8"
    )

    output.write_bytes(
        payload
    )

    return {
        "version":
            CORPUS_FREEZE_VERSION,

        "status":
            "PASS",

        "phase23r13t":
            "PASS",

        "phase23r13u":
            "FROZEN",

        "caseCount":
            freeze[
                "inventorySummary"
            ][
                "caseCount"
            ],

        "sourceCount":
            freeze[
                "inventorySummary"
            ][
                "sourceCount"
            ],

        "finalHoldoutCount":
            freeze[
                "inventorySummary"
            ][
                "finalHoldoutCount"
            ],

        "freezeHash":
            freeze[
                "freezeHash"
            ],

        "freezePath":
            str(
                output
            ),

        "freezeArtifactSha256":
            _sha256_bytes(
                payload
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }