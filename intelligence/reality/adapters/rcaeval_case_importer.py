"""AIRA Phase 23R.6B/C RCAEval case importer.

Converts one locally available RCAEval case into AIRA's
EXTERNAL_BENCHMARK_V1 raw format.

The source directory name and inject timestamp are treated as evaluator
metadata. Root-cause service/fault labels never enter the visible case body.

EXTERNAL BENCHMARK != EXECUTION AUTHORITY.
BENCHMARK GROUND TRUTH != AGENT CONTEXT.
BENCHMARK PASS != PRODUCTION PROOF.
"""

from __future__ import annotations

import base64
import hashlib
import re

from pathlib import Path

from typing import Any
from typing import Dict
from typing import Optional
from typing import Tuple


from intelligence.reality.normalization.reality_case_normalizer import (
    RealityNormalizationError,
    require_string,
)


RCAEVAL_IMPORTER_VERSION = (
    "23R.6B.0"
)


_SUITE_PATTERN = re.compile(
    r"^(re[123]|torai)[-_]?(ob|ss|tt)$",
    re.IGNORECASE,
)


_SYSTEMS = {
    "OB":
        "Online Boutique",

    "SS":
        "Sock Shop",

    "TT":
        "Train Ticket",
}


_MODALITIES = (
    (
        "metrics",
        "METRIC",
        (
            "metrics.parquet",
            "metrics.json",
        ),
    ),

    (
        "logs",
        "LOG",
        (
            "logs.parquet",
            "logs.csv",
        ),
    ),

    (
        "traces",
        "TRACE",
        (
            "traces.parquet",
            "traces.csv",
        ),
    ),
)


_MEDIA_TYPES = {
    ".json":
        "application/json",

    ".csv":
        "text/csv",

    ".parquet":
        "application/vnd.apache.parquet",
}


def _error(
    code: str,
    message: str,
) -> RealityNormalizationError:
    return RealityNormalizationError(
        code,
        message,
    )


def _parse_case_name(
    name: str,
) -> Tuple[
    str,
    str,
    str,
    str,
]:
    parts = require_string(
        name,
        "caseDirectory.name",
    ).split(
        "_"
    )

    if (
        len(
            parts
        )
        <
        4
    ):
        raise _error(
            "REALITY_RCAEVAL_CASE_NAME_INVALID",
            (
                "RCAEval case directory must follow "
                "benchmark_service_fault_instance"
            ),
        )

    suite_token = (
        parts[
            0
        ]
    )

    fault = (
        parts[
            -2
        ]
    )

    instance = (
        parts[
            -1
        ]
    )

    service = "_".join(
        parts[
            1:-2
        ]
    )

    match = _SUITE_PATTERN.match(
        suite_token
    )

    if (
        not match
    ):
        raise _error(
            "REALITY_RCAEVAL_SUITE_INVALID",
            (
                "Unsupported RCAEval suite token: "
                f"{suite_token}"
            ),
        )

    benchmark, system_code = (
        match.groups()
    )

    suite = (
        f"{benchmark.upper()}-"
        f"{system_code.upper()}"
    )

    return (
        suite,

        require_string(
            service,
            "rootCauseService",
        ),

        require_string(
            fault,
            "fault",
        ),

        require_string(
            instance,
            "instance",
        ),
    )


def _opaque_case_id(
    suite: str,
    source_case_name: str,
) -> str:
    digest = hashlib.sha256(
        source_case_name.encode(
            "utf-8"
        )
    ).hexdigest()[
        :20
    ]

    safe_suite = (
        suite
        .lower()
        .replace(
            "-",
            "_",
        )
    )

    return (
        f"rcaeval_{safe_suite}_{digest}"
    )


def _read_injection_timestamp(
    case_dir: Path,
    override: Optional[
        str
    ],
) -> str:
    if (
        override
        is not None
    ):
        return require_string(
            str(
                override
            ),
            "injectionTimestamp",
        )

    inject_file = (
        case_dir /
        "inject_time.txt"
    )

    if (
        not inject_file
        .is_file()
    ):
        raise _error(
            "REALITY_RCAEVAL_INJECT_TIME_REQUIRED",
            (
                "inject_time.txt is missing; "
                "provide injection_timestamp for "
                "Parquet-layout cases"
            ),
        )

    return require_string(
        inject_file
        .read_text(
            encoding=
                "utf-8"
        )
        .strip(),

        "inject_time.txt",
    )


def _find_modality_file(
    case_dir: Path,
    candidates: Tuple[
        str,
        ...,
    ],
) -> Optional[
    Path
]:
    for candidate in candidates:
        path = (
            case_dir /
            candidate
        )

        if (
            path.is_file()
        ):
            return path

    return None


def _artifact(
    path: Path,
    artifact_id: str,
    kind: str,
    suite: str,
) -> Dict[
    str,
    Any,
]:
    body = (
        path.read_bytes()
    )

    if (
        not body
    ):
        raise _error(
            "REALITY_RCAEVAL_TELEMETRY_EMPTY",
            (
                "RCAEval telemetry file is empty: "
                f"{path.name}"
            ),
        )

    return {
        "artifactId":
            artifact_id,

        "kind":
            kind,

        "mediaType":
            _MEDIA_TYPES.get(
                path.suffix.lower(),
                "application/octet-stream",
            ),

        "contentBase64":
            base64
            .b64encode(
                body
            )
            .decode(
                "ascii"
            ),

        "provenance": {
            "benchmark":
                "RCAEval",

            "suite":
                suite,

            "sourceFile":
                path.name,

            "importerVersion":
                RCAEVAL_IMPORTER_VERSION,
        },
    }


def build_external_benchmark_dataset(
    case_directory: str,
    *,
    organization_id: str,
    environment_id: str,
    benchmark_version: str = "2026-main",
    injection_timestamp: Optional[str] = None,
    replay_seed: int = 23,
) -> Dict[
    str,
    Any,
]:
    case_dir = (
        Path(
            case_directory
        )
        .expanduser()
        .resolve()
    )

    if (
        not case_dir
        .is_dir()
    ):
        raise _error(
            "REALITY_RCAEVAL_CASE_DIRECTORY_MISSING",
            (
                "RCAEval case directory does not exist: "
                f"{case_dir}"
            ),
        )

    (
        suite,
        root_cause_service,
        fault,
        instance,
    ) = _parse_case_name(
        case_dir.name
    )

    injection_time = (
        _read_injection_timestamp(
            case_dir,
            injection_timestamp,
        )
    )

    artifacts = []

    timeline = []

    offset_ms = (
        0
    )

    for (
        modality,
        kind,
        candidates,
    ) in _MODALITIES:
        source_path = (
            _find_modality_file(
                case_dir,
                candidates,
            )
        )

        if (
            source_path
            is None
        ):
            if (
                modality
                ==
                "metrics"
            ):
                raise _error(
                    "REALITY_RCAEVAL_METRICS_REQUIRED",
                    (
                        "RCAEval case must contain "
                        "metrics.json or metrics.parquet"
                    ),
                )

            continue

        artifact_id = (
            f"{modality}_1"
        )

        artifacts.append(
            _artifact(
                source_path,
                artifact_id,
                kind,
                suite,
            )
        )

        timeline.append({
            "eventId":
                f"{modality}_event_1",

            "offsetMs":
                offset_ms,

            "kind":
                kind,

            "artifactId":
                artifact_id,
        })

        offset_ms += (
            1000
        )

    opaque_case_id = (
        _opaque_case_id(
            suite,
            case_dir.name,
        )
    )

    system_code = (
        suite
        .split(
            "-"
        )[
            -1
        ]
    )

    return {
        "rawFormat":
            "EXTERNAL_BENCHMARK_V1",

        "benchmark": {
            "benchmarkId":
                "RCAEVAL",

            "benchmarkVersion":
                require_string(
                    benchmark_version,
                    "benchmarkVersion",
                ),

            "suite":
                suite,

            # This remains benchmark provenance metadata.
# It is NOT copied into replay-visible RealityCase identity.
            "benchmarkCaseId":
                case_dir.name,

            "license":
                "MIT",

            "modified":
                False,

            "groundTruthMethod":
                (
                    "RCAEval annotated root-cause "
                    "service and fault label"
                ),
        },

        "case": {
           # IMPORTANT:
#
# RCAEval directory names encode the fault and root-cause
# service. They therefore cannot become replay-visible IDs.
            "caseId":
                opaque_case_id,

            "title":
                (
                    f"RCAEval {suite} external case "
                    f"{opaque_case_id[-8:]}"
                ),

            "organizationId":
                require_string(
                    organization_id,
                    "organizationId",
                ),

            "environmentId":
                require_string(
                    environment_id,
                    "environmentId",
                ),

            "evidenceGrade":
                "E2",

            "workload": {
                "platform":
                    "microservices",

                "benchmark":
                    "RCAEval",

                "suite":
                    suite,

                "system":
                    _SYSTEMS[
                        system_code
                    ],
            },

            "timeline":
                timeline,

            "safetyRestrictions": [
                "EXTERNAL_BENCHMARK_ONLY",
                "NO_AUTHORIZATION_GRANT",
                "NO_PRODUCTION_CERTIFICATION",
                "GROUND_TRUTH_SEALED",
            ],

            "replayConfiguration": {
                "seed":
                    int(
                        replay_seed
                    ),

                "speedMultiplier":
                    1,

                "deterministicTimestamps":
                    True,
            },
        },

        "evidence":
            artifacts,

        # ============================================================
        # SEALED EVALUATION CHANNEL
        # ============================================================
        #
        # Everything below is evaluator-only.
         
        "evaluation": {
            "knownFault":
                fault,

            "expectedDiagnosis":
                (
                    f"{root_cause_service} "
                    f"{fault}"
                ),

            "acceptableDiagnoses": [
                root_cause_service,

                (
                    f"{root_cause_service} "
                    f"{fault}"
                ),

                (
                    f"{fault} fault affecting "
                    f"{root_cause_service}"
                ),
            ],

            
             # RCAEval is an RCA benchmark.
             #
             # We must not invent recovery correctness labels that
             # RCAEval itself does not establish.
             
            "expectedRecoveryFamily":
                "BENCHMARK_DIAGNOSIS_ONLY",

            "rubric": {
                "benchmarkIndependent":
                    True,

                "safetyDominates":
                    True,

                "sourceCaseName":
                    case_dir.name,

                "rootCauseService":
                    root_cause_service,

                "fault":
                    fault,

                "instance":
                    instance,

                "injectionTimestamp":
                    injection_time,

                "groundTruthAgentVisible":
                    False,
            },
        },
    }