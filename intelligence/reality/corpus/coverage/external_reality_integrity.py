"""Phase 23R.13S.5D-5F external reality integrity certification.

Certifies already-promoted physical external corpus artifacts without granting
execution authority.

Important boundaries:

EXTERNAL CORPUS != EXECUTION AUTHORITY.
BENCHMARK SCORE != PRODUCTION PROOF.
GROUND TRUTH MUST NEVER ENTER AGENT CONTEXT.
PUBLIC INCIDENT RECONSTRUCTION != INDEPENDENT EVIDENCE.
PROMOTION != PRODUCTION CERTIFICATION.

This module does not download or re-promote data. It certifies the physical
approved outputs already produced by Phase 23R.13S.5B/5C/5D.
"""

from __future__ import annotations

import hashlib
import json

from pathlib import Path
from typing import Any
from typing import Dict
from typing import Mapping
from typing import Sequence

from intelligence.reality.corpus.coverage.external_reality_promotion import (
    build_external_promotion_manifest,
)


EXTERNAL_REALITY_INTEGRITY_VERSION = (
    "23R.13S.5E.0"
)


RCAEVAL_RELATIVE = (
    "approved/"
    "external-benchmarks/"
    "rcaeval/"
    "phase23r13-rcaeval-approved-cases.jsonl"
)

RCAEVAL_EVALUATOR_RELATIVE = (
    "approved/"
    "external-benchmarks/"
    "rcaeval/"
    "phase23r13-rcaeval-evaluator-manifest.json"
)

GOOGLE_RELATIVE = (
    "approved/"
    "cloud-traces/"
    "google/"
    "phase23r13-google-cloud-behaviour.jsonl"
)

PUBLIC_RELATIVE = (
    "approved/"
    "public-incidents/"
    "phase23r13-public-production-incidents.jsonl"
)

PUBLIC_POLICY_RELATIVE = (
    "approved/"
    "public-incidents/"
    "phase23r13-public-source-policy-manifest.json"
)

CERTIFICATION_RELATIVE = (
    "manifests/"
    "phase23r13-external-reality-"
    "integrity-certification.json"
)

COMBINED_MANIFEST_RELATIVE = (
    "manifests/"
    "phase23r13-external-reality-"
    "promotion-manifest.json"
)


EXPECTED_COUNTS = {
    "RCAEVAL":
        735,

    "GOOGLE_CLUSTER_DATA":
        500,

    "PUBLIC_INCIDENTS":
        100,
}


def _stable_bytes(
    value: Any,
) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(
                ",",
                ":",
            ),
            ensure_ascii=False,
        )
        +
        "\n"
    ).encode(
        "utf-8"
    )


def _sha256_bytes(
    value: bytes,
) -> str:
    return hashlib.sha256(
        value
    ).hexdigest()


def _descriptor(
    path: Path,
) -> Dict[
    str,
    Any,
]:
    if not path.is_file():
        raise ValueError(
            (
                "required external reality "
                "artifact missing: "
                f"{path}"
            )
        )

    payload = path.read_bytes()

    if not payload:
        raise ValueError(
            (
                "required external reality "
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
            f"invalid JSON artifact: {path}"
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


def _read_jsonl(
    path: Path,
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    _descriptor(
        path
    )

    rows: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    for (
        line_number,
        line,
    ) in enumerate(
        path
        .read_text(
            encoding="utf-8"
        )
        .splitlines(),
        start=1,
    ):
        if not line.strip():
            continue

        try:
            value = json.loads(
                line
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                (
                    "invalid JSONL at "
                    f"{path}:{line_number}"
                )
            ) from exc

        if not isinstance(
            value,
            dict,
        ):
            raise ValueError(
                (
                    "JSONL row must be "
                    "an object at "
                    f"{path}:{line_number}"
                )
            )

        rows.append(
            value
        )

    if not rows:
        raise ValueError(
            (
                "JSONL artifact is empty: "
                f"{path}"
            )
        )

    return rows


def _require_false(
    row: Mapping[
        str,
        Any,
    ],
    field: str,
    label: str,
) -> None:
    if (
        row.get(
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


def _require_integrity_hash(
    row: Mapping[
        str,
        Any,
    ],
    label: str,
) -> None:
    value = str(
        row.get(
            "integrityManifestHash",
            "",
        )
    ).strip()

    if len(
        value
    ) != 64:
        raise ValueError(
            (
                f"{label} is missing a "
                "64-character "
                "integrityManifestHash"
            )
        )


def _validate_rcaeval(
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> None:
    expected = (
        EXPECTED_COUNTS[
            "RCAEVAL"
        ]
    )

    if len(
        rows
    ) != expected:
        raise ValueError(
            (
                "RCAEval count mismatch: "
                f"{len(rows)} != {expected}"
            )
        )

    ids: set[
        str
    ] = set()

    for (
        index,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        label = (
            "RCAEval row "
            f"{index}"
        )

        case_id = str(
            row.get(
                "caseId",
                "",
            )
        ).strip()

        if (
            not case_id
            or
            case_id in ids
        ):
            raise ValueError(
                (
                    f"{label} has missing/"
                    "duplicate caseId"
                )
            )

        ids.add(
            case_id
        )

        if (
            row.get(
                "evidenceGrade"
            )
            !=
            "E2"
        ):
            raise ValueError(
                (
                    f"{label} must remain "
                    "E2"
                )
            )

        if (
            row.get(
                "independentEvidence"
            )
            is not True
        ):
            raise ValueError(
                (
                    f"{label} must remain "
                    "independent evidence"
                )
            )

        _require_false(
            row,
            "groundTruthAgentVisible",
            label,
        )

        _require_false(
            row,
            "executionAuthorized",
            label,
        )

        _require_false(
            row,
            "productionCertified",
            label,
        )

        _require_integrity_hash(
            row,
            label,
        )

        if "benchmarkCaseId" in row:
            raise ValueError(
                (
                    f"{label} exposes "
                    "benchmarkCaseId"
                )
            )


def _validate_google(
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> None:
    expected = (
        EXPECTED_COUNTS[
            "GOOGLE_CLUSTER_DATA"
        ]
    )

    if len(
        rows
    ) != expected:
        raise ValueError(
            (
                "Google Cluster Data "
                "count mismatch: "
                f"{len(rows)} != {expected}"
            )
        )

    ids: set[
        str
    ] = set()

    for (
        index,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        label = (
            "Google row "
            f"{index}"
        )

        case_id = str(
            row.get(
                "caseId",
                "",
            )
        ).strip()

        if (
            not case_id
            or
            case_id in ids
        ):
            raise ValueError(
                (
                    f"{label} has missing/"
                    "duplicate caseId"
                )
            )

        ids.add(
            case_id
        )

        if (
            row.get(
                "evidenceGrade"
            )
            !=
            "E2"
        ):
            raise ValueError(
                (
                    f"{label} must remain "
                    "E2"
                )
            )

        if (
            row.get(
                "independentEvidence"
            )
            is not True
        ):
            raise ValueError(
                (
                    f"{label} must remain "
                    "independent evidence"
                )
            )

        _require_false(
            row,
            "groundTruthAgentVisible",
            label,
        )

        _require_false(
            row,
            "executionAuthorized",
            label,
        )

        _require_false(
            row,
            "productionCertified",
            label,
        )

        _require_integrity_hash(
            row,
            label,
        )


def _validate_public(
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    policy_manifest: Mapping[
        str,
        Any,
    ],
) -> None:
    """Validate promoted public-production reconstruction artifacts.

    Prepared source evidence uses:

        historicallyAvailable
        releaseOffsetMs
        sourceReference

    Promotion normalizes these into:

        provenance.historicallyAvailable
        provenance.historicalReleaseOffsetMs
        provenance.sourceReference

    This certification validates only the canonical promoted form.
    """

    expected = (
        EXPECTED_COUNTS[
            "PUBLIC_INCIDENTS"
        ]
    )

    if len(
        rows
    ) != expected:
        raise ValueError(
            (
                "public incident count mismatch: "
                f"{len(rows)} != {expected}"
            )
        )

    sources = policy_manifest.get(
        "sources"
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
                "public source policy manifest "
                "must contain sources"
            )
        )

    approved_source_ids: set[
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
                    "public source policy "
                    f"{index} must be an object"
                )
            )

        source_id = str(
            source.get(
                "sourceId",
                "",
            )
        ).strip()

        if not source_id:
            raise ValueError(
                (
                    "public source policy "
                    f"{index} is missing sourceId"
                )
            )

        if (
            source.get(
                "policyStatus"
            )
            !=
            "APPROVED_COMMERCIAL"
        ):
            raise ValueError(
                (
                    f"public source {source_id} "
                    "is not APPROVED_COMMERCIAL"
                )
            )

        if (
            source.get(
                "licenseVerified"
            )
            is not True
        ):
            raise ValueError(
                (
                    f"public source {source_id} "
                    "has unverified license"
                )
            )

        if not str(
            source.get(
                "license",
                "",
            )
        ).strip():
            raise ValueError(
                (
                    f"public source {source_id} "
                    "is missing license"
                )
            )

        approved_source_ids.add(
            source_id
        )

    ids: set[
        str
    ] = set()

    for (
        index,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        label = (
            "public incident row "
            f"{index}"
        )

        case_id = str(
            row.get(
                "caseId",
                "",
            )
        ).strip()

        if not case_id:
            raise ValueError(
                (
                    f"{label} is missing caseId"
                )
            )

        if case_id in ids:
            raise ValueError(
                (
                    f"{label} has duplicate "
                    f"caseId={case_id}"
                )
            )

        ids.add(
            case_id
        )

        if (
            row.get(
                "corpusRole"
            )
            !=
            "PRODUCTION_RECONSTRUCTION"
        ):
            raise ValueError(
                (
                    f"{label} must be "
                    "PRODUCTION_RECONSTRUCTION"
                )
            )

        if (
            row.get(
                "evidenceGrade"
            )
            !=
            "E3"
        ):
            raise ValueError(
                (
                    f"{label} must remain E3"
                )
            )

        if (
            row.get(
                "independentEvidence"
            )
            is not False
        ):
            raise ValueError(
                (
                    f"{label} must not claim "
                    "independent evidence"
                )
            )

        source_id = str(
            row.get(
                "sourceId",
                "",
            )
        ).strip()

        if not source_id:
            raise ValueError(
                (
                    f"{label} is missing sourceId"
                )
            )

        if (
            source_id
            not in approved_source_ids
        ):
            raise ValueError(
                (
                    f"{label} references "
                    "unapproved sourceId="
                    f"{source_id}"
                )
            )

        if (
            row.get(
                "policyStatus"
            )
            !=
            "APPROVED_COMMERCIAL"
        ):
            raise ValueError(
                (
                    f"{label} is not "
                    "APPROVED_COMMERCIAL"
                )
            )

        public_sources = row.get(
            "publicSources"
        )

        if (
            not isinstance(
                public_sources,
                list,
            )
            or
            not public_sources
        ):
            raise ValueError(
                (
                    f"{label} is missing "
                    "publicSources"
                )
            )

        row_source_verified = False

        for (
            source_index,
            public_source,
        ) in enumerate(
            public_sources,
            start=1,
        ):
            if not isinstance(
                public_source,
                Mapping,
            ):
                raise ValueError(
                    (
                        f"{label} publicSources["
                        f"{source_index}] must "
                        "be an object"
                    )
                )

            public_source_id = str(
                public_source.get(
                    "sourceId",
                    "",
                )
            ).strip()

            if (
                public_source_id
                not in approved_source_ids
            ):
                raise ValueError(
                    (
                        f"{label} publicSources["
                        f"{source_index}] references "
                        "an unapproved source"
                    )
                )

            if (
                public_source.get(
                    "licenseVerified"
                )
                is not True
            ):
                raise ValueError(
                    (
                        f"{label} publicSources["
                        f"{source_index}] has "
                        "licenseVerified != true"
                    )
                )

            if not str(
                public_source.get(
                    "license",
                    "",
                )
            ).strip():
                raise ValueError(
                    (
                        f"{label} publicSources["
                        f"{source_index}] is "
                        "missing license"
                    )
                )

            if (
                public_source_id
                ==
                source_id
            ):
                row_source_verified = True

        if not row_source_verified:
            raise ValueError(
                (
                    f"{label} sourceId "
                    "is not represented in "
                    "publicSources"
                )
            )

        evaluation = row.get(
            "evaluationChannel"
        )

        if not isinstance(
            evaluation,
            Mapping,
        ):
            raise ValueError(
                (
                    f"{label} is missing "
                    "evaluationChannel"
                )
            )

        if (
            evaluation.get(
                "agentVisible"
            )
            is not False
        ):
            raise ValueError(
                (
                    f"{label} must keep "
                    "evaluationChannel."
                    "agentVisible=false"
                )
            )

        if (
            evaluation.get(
                "sealed"
            )
            is not True
        ):
            raise ValueError(
                (
                    f"{label} must keep "
                    "evaluationChannel."
                    "sealed=true"
                )
            )

        evidence_channel = row.get(
            "evidenceChannel"
        )

        if not isinstance(
            evidence_channel,
            Mapping,
        ):
            raise ValueError(
                (
                    f"{label} is missing "
                    "evidenceChannel"
                )
            )

        if (
            evidence_channel.get(
                "agentVisible"
            )
            is not True
        ):
            raise ValueError(
                (
                    f"{label} evidenceChannel "
                    "must remain agent-visible"
                )
            )

        visible_evidence = (
            evidence_channel.get(
                "evidence"
            )
        )

        if (
            not isinstance(
                visible_evidence,
                list,
            )
            or
            not visible_evidence
        ):
            raise ValueError(
                (
                    f"{label} is missing "
                    "visible evidence"
                )
            )

        for (
            evidence_index,
            item,
        ) in enumerate(
            visible_evidence,
            start=1,
        ):
            evidence_label = (
                f"{label} evidence "
                f"{evidence_index}"
            )

            if not isinstance(
                item,
                Mapping,
            ):
                raise ValueError(
                    (
                        f"{evidence_label} "
                        "must be an object"
                    )
                )

            provenance = item.get(
                "provenance"
            )

            if not isinstance(
                provenance,
                Mapping,
            ):
                raise ValueError(
                    (
                        f"{evidence_label} "
                        "is missing provenance"
                    )
                )

            if (
                provenance.get(
                    "historicallyAvailable"
                )
                is not True
            ):
                raise ValueError(
                    (
                        f"{evidence_label} "
                        "contains non-historical "
                        "visible evidence"
                    )
                )

            historical_offset = (
                provenance.get(
                    "historicalReleaseOffsetMs"
                )
            )

            if (
                isinstance(
                    historical_offset,
                    bool,
                )
                or
                not isinstance(
                    historical_offset,
                    int,
                )
                or
                historical_offset < 0
            ):
                raise ValueError(
                    (
                        f"{evidence_label} has "
                        "invalid historical "
                        "release offset"
                    )
                )

            if not str(
                provenance.get(
                    "sourceReference",
                    "",
                )
            ).strip():
                raise ValueError(
                    (
                        f"{evidence_label} "
                        "is missing "
                        "sourceReference"
                    )
                )

            if (
                "historicallyAvailable"
                in item
            ):
                raise ValueError(
                    (
                        f"{evidence_label} contains "
                        "staging-level "
                        "historicallyAvailable "
                        "outside provenance"
                    )
                )

        _require_false(
            row,
            "groundTruthAgentVisible",
            label,
        )

        _require_false(
            row,
            "executionAuthorized",
            label,
        )

        _require_false(
            row,
            "productionCertified",
            label,
        )

        _require_integrity_hash(
            row,
            label,
        )


def certify_external_reality(
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

    paths = {
        "RCAEVAL":
            root
            /
            RCAEVAL_RELATIVE,

        "RCAEVAL_EVALUATOR":
            root
            /
            RCAEVAL_EVALUATOR_RELATIVE,

        "GOOGLE_CLUSTER_DATA":
            root
            /
            GOOGLE_RELATIVE,

        "PUBLIC_INCIDENTS":
            root
            /
            PUBLIC_RELATIVE,

        "PUBLIC_SOURCE_POLICY":
            root
            /
            PUBLIC_POLICY_RELATIVE,
    }

    rcaeval_rows = _read_jsonl(
        paths[
            "RCAEVAL"
        ]
    )

    google_rows = _read_jsonl(
        paths[
            "GOOGLE_CLUSTER_DATA"
        ]
    )

    public_rows = _read_jsonl(
        paths[
            "PUBLIC_INCIDENTS"
        ]
    )

    evaluator = _read_json(
        paths[
            "RCAEVAL_EVALUATOR"
        ]
    )

    public_policy = _read_json(
        paths[
            "PUBLIC_SOURCE_POLICY"
        ]
    )

    _validate_rcaeval(
        rcaeval_rows
    )

    _validate_google(
        google_rows
    )

    _validate_public(
        public_rows,
        public_policy,
    )

    if (
        evaluator.get(
            "sealedEvaluatorOnly"
        )
        is not True
    ):
        raise ValueError(
            (
                "RCAEval evaluator manifest "
                "must remain "
                "sealedEvaluatorOnly=true"
            )
        )

    if (
        evaluator.get(
            "agentGroundTruthVisible"
        )
        is not False
    ):
        raise ValueError(
            (
                "RCAEval evaluator ground truth "
                "became agent-visible"
            )
        )

    _require_false(
        public_policy,
        "executionAuthorized",
        (
            "public source "
            "policy manifest"
        ),
    )

    _require_false(
        public_policy,
        "productionCertified",
        (
            "public source "
            "policy manifest"
        ),
    )

    artifacts = {
        name:
            _descriptor(
                path
            )

        for (
            name,
            path,
        )
        in paths.items()
    }

    component_counts = {
        "RCAEVAL":
            len(
                rcaeval_rows
            ),

        "GOOGLE_CLUSTER_DATA":
            len(
                google_rows
            ),

        "PUBLIC_INCIDENTS":
            len(
                public_rows
            ),
    }

    public_sources = (
        public_policy[
            "sources"
        ]
    )

    core = {
        "version":
            EXTERNAL_REALITY_INTEGRITY_VERSION,

        "status":
            "PASS",

        "phaseGate":
            "23R.13S.5E",

        "componentCounts":
            component_counts,

        "caseCount":
            sum(
                component_counts.values()
            ),

        "artifacts":
            artifacts,

        "publicSourceCount":
            len(
                public_sources
            ),

        "publicSourceIds":
            sorted(
                str(
                    source[
                        "sourceId"
                    ]
                )

                for source
                in public_sources
            ),

        "evidenceGrades": {
            "RCAEVAL":
                "E2",

            "GOOGLE_CLUSTER_DATA":
                "E2",

            "PUBLIC_INCIDENTS":
                "E3",
        },

        "externalEvidenceSemantics": {
            "RCAEVAL": {
                "independentEvidence":
                    True,

                "corpusRole":
                    "INDEPENDENT_BENCHMARK",
            },

            "GOOGLE_CLUSTER_DATA": {
                "independentEvidence":
                    True,

                "corpusRole":
                    "CLOUD_BEHAVIOUR",
            },

            "PUBLIC_INCIDENTS": {
                "independentEvidence":
                    False,

                "corpusRole":
                    "PRODUCTION_RECONSTRUCTION",
            },
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

        "certificationHash":
            _sha256_bytes(
                _stable_bytes(
                    core
                )
            ),
    }


def build_certified_external_promotion_manifest(
    *,
    certification: Mapping[
        str,
        Any,
    ],
) -> Dict[
    str,
    Any,
]:
    if (
        certification.get(
            "status"
        )
        !=
        "PASS"
    ):
        raise ValueError(
            (
                "combined external manifest "
                "requires PASS "
                "integrity certification"
            )
        )

    counts = (
        certification.get(
            "componentCounts"
        )
        or
        {}
    )

    rcaeval = {
        "caseCount":
            int(
                counts.get(
                    "RCAEVAL",
                    0,
                )
            ),

        "evidenceGrade":
            "E2",

        "integrityCertified":
            True,
    }

    google = {
        "caseCount":
            int(
                counts.get(
                    "GOOGLE_CLUSTER_DATA",
                    0,
                )
            ),

        "evidenceGrade":
            "E2",

        "integrityCertified":
            True,
    }

    public = {
        "caseCount":
            int(
                counts.get(
                    "PUBLIC_INCIDENTS",
                    0,
                )
            ),

        "evidenceGrade":
            "E3",

        "corpusRole":
            "PRODUCTION_RECONSTRUCTION",

        "integrityCertified":
            True,
    }

    manifest = (
        build_external_promotion_manifest(
            rcaeval=
                rcaeval,

            google_cloud=
                google,

            public_incidents=
                public,
        )
    )

    return {
        **manifest,

        "integrityCertificationHash":
            certification[
                "certificationHash"
            ],

        "integrityStatus":
            "PASS",

        "phaseGate":
            "23R.13S.5F",
    }


def write_external_reality_certification(
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

    certification = (
        certify_external_reality(
            data_root=
                root
        )
    )

    combined = (
        build_certified_external_promotion_manifest(
            certification=
                certification
        )
    )

    certification_path = (
        root
        /
        CERTIFICATION_RELATIVE
    )

    combined_path = (
        root
        /
        COMBINED_MANIFEST_RELATIVE
    )

    certification_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    combined_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    certification_path.write_bytes(
        _stable_bytes(
            certification
        )
    )

    combined_path.write_bytes(
        _stable_bytes(
            combined
        )
    )

    return {
        "version":
            EXTERNAL_REALITY_INTEGRITY_VERSION,

        "status":
            "PASS",

        "phase23r13s5d":
            "PASS",

        "phase23r13s5e":
            "PASS",

        "phase23r13s5f":
            "PASS",

        "caseCount":
            certification[
                "caseCount"
            ],

        "componentCounts":
            certification[
                "componentCounts"
            ],

        "certificationHash":
            certification[
                "certificationHash"
            ],

        "combinedManifestHash":
            combined[
                "manifestHash"
            ],

        "certificationPath":
            str(
                certification_path
            ),

        "combinedManifestPath":
            str(
                combined_path
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }