"""Phase 23R.13S.1 physical corpus population audit."""

from __future__ import annotations

import hashlib
import json

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Sequence


CORPUS_POPULATION_AUDIT_VERSION = "23R.13S.1.0"


@dataclass(
    frozen=True
)
class PopulationRequirement:
    requirement_id: str
    relative_path: str
    category: str
    required_for_final_certification: bool
    minimum_files: int = 1
    notes: str = ""


REQUIREMENTS: Sequence[
    PopulationRequirement
] = (
    PopulationRequirement(
        "RCAEVAL_STAGING",
        "staging/downloads/rcaeval",
        "EXTERNAL_BENCHMARK",
        True,
        1,
        (
            "RCAEval source material or index must "
            "be present before canonical ingestion."
        ),
    ),

    PopulationRequirement(
        "OTEL_DEMO_SOURCE",
        "staging/downloads/opentelemetry-demo",
        "EXECUTABLE_WORKLOAD_SOURCE",
        True,
        1,
        "OpenTelemetry Astronomy Shop source checkout.",
    ),

    PopulationRequirement(
        "AIRA_RELIABILITY_LAB_OUTPUT",
        "generated/executable-workloads/aira-reliability-lab",
        "EXECUTABLE_WORKLOAD_OUTPUT",
        True,
        1,
    ),

    PopulationRequirement(
        "ASTRONOMY_SHOP_OUTPUT",
        "generated/executable-workloads/astronomy-shop",
        "EXECUTABLE_WORKLOAD_OUTPUT",
        True,
        1,
    ),

    PopulationRequirement(
        "HEALTHY_BASELINE",
        "generated/healthy-baseline",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "NOISY_OBSERVABILITY",
        "generated/noisy-observability",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "MULTI_FAULT",
        "generated/multi-fault",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "CASCADING_FAILURE",
        "generated/cascading-failure",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "AMBIGUOUS_EVIDENCE",
        "generated/ambiguous-evidence",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "RECOVERY_OUTCOMES",
        "generated/recovery-outcomes",
        "GENERATED_CORPUS",
        True,
        1,
    ),

    PopulationRequirement(
        "INTEGRATION_TRANSLATION",
        "generated/integration-translation",
        "INTEGRATION_TRANSLATION",
        True,
        1,
        (
            "Actual provider-format corpus generated "
            "from AIRA integration adapter contracts."
        ),
    ),

    PopulationRequirement(
        "GOOGLE_CLOUD_BEHAVIOUR",
        "approved/cloud-traces/google",
        "CLOUD_BEHAVIOUR",
        True,
        1,
    ),

    PopulationRequirement(
        "PUBLIC_INCIDENTS",
        "approved/public-incidents",
        "PRODUCTION_RECONSTRUCTION",
        True,
        1,
    ),

    PopulationRequirement(
        "RCAEVAL_APPROVED",
        "approved/external-benchmarks/rcaeval",
        "EXTERNAL_BENCHMARK_APPROVED",
        True,
        1,
        (
            "Canonical promoted RCAEval artifacts "
            "after policy/integrity gates."
        ),
    ),

    PopulationRequirement(
        "DEATHSTARBENCH_RESEARCH",
        "research-only/deathstarbench",
        "RESEARCH_ONLY",
        False,
        1,
        (
            "Research-only telemetry/output; source "
            "checkout may live in WSL Linux filesystem."
        ),
    ),

    PopulationRequirement(
        "LOGHUB_RESEARCH",
        "research-only/loghub",
        "RESEARCH_ONLY",
        False,
        1,
    ),
)


def _stable_hash(
    value: Any,
) -> str:
    return hashlib.sha256(
        json.dumps(
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
    ).hexdigest()


def _iter_files(
    path: Path,
) -> Iterable[Path]:
    if (
        not path.exists()
        or
        not path.is_dir()
    ):
        return ()

    return (
        item
        for item
        in path.rglob("*")
        if item.is_file()
    )


def _inspect_path(
    root: Path,
    requirement: PopulationRequirement,
) -> Dict[
    str,
    Any,
]:
    path = (
        root
        /
        requirement.relative_path
    )

    files = list(
        _iter_files(
            path
        )
    )

    total_bytes = sum(
        item.stat().st_size
        for item
        in files
    )

    populated = (
        len(
            files
        )
        >=
        requirement.minimum_files
    )

    return {
        "requirementId":
            requirement.requirement_id,

        "category":
            requirement.category,

        "relativePath":
            requirement
            .relative_path
            .replace(
                "\\",
                "/",
            ),

        "absolutePath":
            str(
                path
            ),

        "exists":
            path.exists(),

        "isDirectory":
            path.is_dir(),

        "fileCount":
            len(
                files
            ),

        "totalBytes":
            total_bytes,

        "minimumFiles":
            requirement.minimum_files,

        "populated":
            populated,

        "requiredForFinalCertification":
            requirement
            .required_for_final_certification,

        "notes":
            requirement.notes,
    }


def audit_population(
    *,
    data_root: str | Path,
    requirements: Sequence[
        PopulationRequirement
    ] = REQUIREMENTS,
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

    if not root.exists():
        raise ValueError(
            "AIRA-DATA root does not exist: "
            f"{root}"
        )

    if not root.is_dir():
        raise ValueError(
            "AIRA-DATA root is not a directory: "
            f"{root}"
        )

    entries = [
        _inspect_path(
            root,
            requirement,
        )
        for requirement
        in requirements
    ]

    missing_required = [
        entry[
            "requirementId"
        ]
        for entry
        in entries
        if (
            entry[
                "requiredForFinalCertification"
            ]
            and
            not entry[
                "populated"
            ]
        )
    ]

    missing_optional = [
        entry[
            "requirementId"
        ]
        for entry
        in entries
        if (
            not entry[
                "requiredForFinalCertification"
            ]
            and
            not entry[
                "populated"
            ]
        )
    ]

    integration_entry = next(
        (
            entry
            for entry
            in entries
            if (
                entry[
                    "requirementId"
                ]
                ==
                "INTEGRATION_TRANSLATION"
            )
        ),
        None,
    )

    core = {
        "version":
            CORPUS_POPULATION_AUDIT_VERSION,

        "dataRoot":
            str(
                root
            ),

        "entries":
            entries,

        "summary": {
            "requirementCount":
                len(
                    entries
                ),

            "populatedCount":
                sum(
                    1
                    for entry
                    in entries
                    if entry[
                        "populated"
                    ]
                ),

            "missingRequired":
                missing_required,

            "missingOptional":
                missing_optional,

            "integrationTranslationPopulated":
                bool(
                    integration_entry
                    and
                    integration_entry[
                        "populated"
                    ]
                ),

            "readyForCoverageCertification":
                len(
                    missing_required
                )
                ==
                0,
        },

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **core,

        "auditHash":
            _stable_hash(
                core
            ),
    }