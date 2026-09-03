"""Phase 23R.13T full multi-source corpus coverage certification."""

from __future__ import annotations

import hashlib
import json

from collections import Counter
from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence


CORPUS_COVERAGE_CERTIFICATION_VERSION = "23R.13T.0"


REQUIRED_CORPUS_ROLES = frozenset({
    "INDEPENDENT_BENCHMARK",
    "EXECUTABLE_WORKLOAD",
    "HEALTHY_BASELINE",
    "NOISY_DERIVATIVE",
    "MULTI_FAULT",
    "CASCADING_FAILURE",
    "AMBIGUOUS_EVIDENCE",
    "RECOVERY_OUTCOME",
    "CLOUD_BEHAVIOUR",
    "LOG_DIVERSITY",
    "INTEGRATION_TRANSLATION",
    "PRODUCTION_RECONSTRUCTION",
    "FINAL_HOLDOUT",
})


REQUIRED_EVIDENCE_GRADES = frozenset({
    "E1",
    "E2",
    "E3",
})


REQUIRED_PARTITIONS = frozenset({
    "RETRIEVAL",
    "DEVELOPMENT",
    "VALIDATION",
    "HOLDOUT",
})


REQUIRED_PROVIDER_FAMILIES = frozenset({
    "PROMETHEUS",
    "ALERTMANAGER",
    "GRAFANA",
    "OPENTELEMETRY",
    "DATADOG",
    "CLOUDWATCH",
    "AZURE_MONITOR",
    "GCP_MONITORING",
    "PAGERDUTY",
    "SLACK",
    "GITHUB",
    "CI_CD",
    "KUBERNETES",
    "DOCKER",
    "RABBITMQ",
    "REDIS",
    "POSTGRESQL",
})


MINIMUM_CASE_COUNTS = {
    "INDEPENDENT_BENCHMARK": 500,
    "EXECUTABLE_WORKLOAD": 100,
    "HEALTHY_BASELINE": 500,
    "NOISY_DERIVATIVE": 5000,
    "MULTI_FAULT": 250,
    "CASCADING_FAILURE": 250,
    "AMBIGUOUS_EVIDENCE": 250,
    "RECOVERY_OUTCOME": 500,
    "CLOUD_BEHAVIOUR": 500,
    "LOG_DIVERSITY": 500,
    "INTEGRATION_TRANSLATION": 1000,
    "PRODUCTION_RECONSTRUCTION": 100,
    "FINAL_HOLDOUT": 50,
}


FORBIDDEN_HOLDOUT_ELIGIBILITY = (
    "modelTrainingEligible",
    "retrievalEligible",
    "developmentEvaluationEligible",
    "validationEligible",
    "customerRuntimeEligible",
)


def _stable_hash(
    value: Any,
) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")

    return hashlib.sha256(
        encoded
    ).hexdigest()


def _is_sha256(
    value: Any,
) -> bool:
    if not isinstance(
        value,
        str,
    ):
        return False

    if len(value) != 64:
        return False

    return all(
        character
        in
        "0123456789abcdefABCDEF"
        for character
        in value
    )


def _required_string(
    item: Mapping[str, Any],
    key: str,
) -> str:
    value = item.get(key)

    if not isinstance(
        value,
        str,
    ) or not value.strip():
        raise ValueError(
            f"{key} is required"
        )

    return value


def _validate_source(
    source: Mapping[str, Any],
) -> Dict[str, Any]:
    source_id = _required_string(
        source,
        "sourceId",
    )

    policy_status = _required_string(
        source,
        "policyStatus",
    )

    license_verified = source.get(
        "licenseVerified"
    )

    if not isinstance(
        license_verified,
        bool,
    ):
        raise ValueError(
            "source licenseVerified must be boolean"
        )

    return {
        "sourceId":
            source_id,

        "policyStatus":
            policy_status,

        "licenseVerified":
            license_verified,

        "license":
            source.get(
                "license"
            ),
    }


def _validate_case(
    case: Mapping[str, Any],
) -> Dict[str, Any]:
    case_id = _required_string(
        case,
        "caseId",
    )

    source_id = _required_string(
        case,
        "sourceId",
    )

    corpus_role = _required_string(
        case,
        "corpusRole",
    )

    evidence_grade = _required_string(
        case,
        "evidenceGrade",
    )

    partition = _required_string(
        case,
        "partition",
    )

    policy_status = _required_string(
        case,
        "policyStatus",
    )

    integrity_hash = case.get(
        "integrityManifestHash"
    )

    if not _is_sha256(
        integrity_hash
    ):
        raise ValueError(
            "case integrityManifestHash "
            "must be SHA-256 hex"
        )

    eligibility = case.get(
        "eligibility"
    )

    if not isinstance(
        eligibility,
        Mapping,
    ):
        raise ValueError(
            "case eligibility is required"
        )

    if (
        eligibility.get(
            "agentGroundTruthVisible",
            False,
        )
        is not False
    ):
        raise ValueError(
            "ground truth cannot be agent-visible"
        )

    return {
        "caseId":
            case_id,

        "sourceId":
            source_id,

        "corpusRole":
            corpus_role,

        "evidenceGrade":
            evidence_grade,

        "partition":
            partition,

        "policyStatus":
            policy_status,

        "integrityManifestHash":
            integrity_hash.lower(),

        "eligibility":
            dict(
                eligibility
            ),

        "providerFamily":
            case.get(
                "providerFamily"
            ),

        "workloadId":
            case.get(
                "workloadId"
            ),

        "faultFamily":
            case.get(
                "faultFamily"
            ),

        "evidenceModalities":
            list(
                case.get(
                    "evidenceModalities",
                    [],
                )
            ),

        "isFinalHoldout":
            bool(
                case.get(
                    "isFinalHoldout",
                    False,
                )
            ),

        "independentEvidence":
            bool(
                case.get(
                    "independentEvidence",
                    False,
                )
            ),
    }


def certify_corpus_inventory(
    *,
    sources: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    cases: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
    minimum_case_counts: Mapping[
        str,
        int,
    ] | None = None,
    required_provider_families: Iterable[
        str
    ] | None = None,
) -> Dict[str, Any]:
    normalized_sources = [
        _validate_source(
            source
        )
        for source
        in sources
    ]

    normalized_cases = [
        _validate_case(
            case
        )
        for case
        in cases
    ]

    source_ids = [
        source[
            "sourceId"
        ]
        for source
        in normalized_sources
    ]

    if (
        len(
            source_ids
        )
        !=
        len(
            set(
                source_ids
            )
        )
    ):
        raise ValueError(
            "duplicate sourceId in coverage inventory"
        )

    case_ids = [
        case[
            "caseId"
        ]
        for case
        in normalized_cases
    ]

    if (
        len(
            case_ids
        )
        !=
        len(
            set(
                case_ids
            )
        )
    ):
        raise ValueError(
            "duplicate caseId in coverage inventory"
        )

    source_by_id = {
        source[
            "sourceId"
        ]:
            source
        for source
        in normalized_sources
    }

    violations = []

    for case in normalized_cases:
        source = source_by_id.get(
            case[
                "sourceId"
            ]
        )

        if source is None:
            violations.append({
                "code":
                    "SOURCE_MISSING_FROM_INVENTORY",

                "caseId":
                    case[
                        "caseId"
                    ],

                "sourceId":
                    case[
                        "sourceId"
                    ],
            })

            continue

        if (
            source[
                "policyStatus"
            ]
            !=
            case[
                "policyStatus"
            ]
        ):
            violations.append({
                "code":
                    "SOURCE_POLICY_MISMATCH",

                "caseId":
                    case[
                        "caseId"
                    ],

                "sourceId":
                    case[
                        "sourceId"
                    ],
            })

        if (
            case[
                "policyStatus"
            ]
            in {
                "QUARANTINED_LICENSE_REVIEW",
                "BLOCKED",
            }
        ):
            violations.append({
                "code":
                    "DISALLOWED_POLICY_IN_CORPUS",

                "caseId":
                    case[
                        "caseId"
                    ],

                "policyStatus":
                    case[
                        "policyStatus"
                    ],
            })

        if (
            case[
                "policyStatus"
            ]
            ==
            "APPROVED_RESEARCH_ONLY"

            and

            case[
                "partition"
            ]
            in
            REQUIRED_PARTITIONS
        ):
            violations.append({
                "code":
                    "RESEARCH_COMMERCIAL_BOUNDARY_VIOLATION",

                "caseId":
                    case[
                        "caseId"
                    ],

                "partition":
                    case[
                        "partition"
                    ],
            })

        if (
            case[
                "partition"
            ]
            ==
            "HOLDOUT"

            or

            case[
                "isFinalHoldout"
            ]
        ):
            if (
                case[
                    "partition"
                ]
                !=
                "HOLDOUT"
            ):
                violations.append({
                    "code":
                        "FINAL_HOLDOUT_PARTITION_VIOLATION",

                    "caseId":
                        case[
                            "caseId"
                        ],
                })

            if not case[
                "eligibility"
            ].get(
                "holdoutEligible",
                False,
            ):
                violations.append({
                    "code":
                        "HOLDOUT_NOT_ELIGIBLE",

                    "caseId":
                        case[
                            "caseId"
                        ],
                })

            if any(
                case[
                    "eligibility"
                ].get(
                    key,
                    False,
                )
                for key
                in FORBIDDEN_HOLDOUT_ELIGIBILITY
            ):
                violations.append({
                    "code":
                        "HOLDOUT_CONTAMINATION",

                    "caseId":
                        case[
                            "caseId"
                        ],
                })

    role_counts = Counter(
        case[
            "corpusRole"
        ]
        for case
        in normalized_cases
    )

    grade_counts = Counter(
        case[
            "evidenceGrade"
        ]
        for case
        in normalized_cases
    )

    partition_counts = Counter(
        case[
            "partition"
        ]
        for case
        in normalized_cases
    )

    policy_counts = Counter(
        case[
            "policyStatus"
        ]
        for case
        in normalized_cases
    )

    provider_counts = Counter(
        case[
            "providerFamily"
        ]
        for case
        in normalized_cases
        if case[
            "providerFamily"
        ]
    )

    workload_counts = Counter(
        case[
            "workloadId"
        ]
        for case
        in normalized_cases
        if case[
            "workloadId"
        ]
    )

    fault_counts = Counter(
        case[
            "faultFamily"
        ]
        for case
        in normalized_cases
        if case[
            "faultFamily"
        ]
    )

    modality_counts: Counter[str] = Counter()

    for case in normalized_cases:
        modality_counts.update(
            str(
                value
            )
            for value
            in case[
                "evidenceModalities"
            ]
        )

    thresholds = dict(
        minimum_case_counts
        or
        MINIMUM_CASE_COUNTS
    )

    provider_requirements = set(
        required_provider_families
        or
        REQUIRED_PROVIDER_FAMILIES
    )

    missing_roles = sorted(
        role
        for role
        in REQUIRED_CORPUS_ROLES
        if role_counts[
            role
        ]
        ==
        0
    )

    below_minimum = {
        role: {
            "required":
                minimum,

            "actual":
                role_counts[
                    role
                ],
        }

        for (
            role,
            minimum,
        )
        in thresholds.items()

        if (
            role_counts[
                role
            ]
            <
            minimum
        )
    }

    missing_grades = sorted(
        REQUIRED_EVIDENCE_GRADES
        -
        set(
            grade_counts
        )
    )

    missing_partitions = sorted(
        REQUIRED_PARTITIONS
        -
        set(
            partition_counts
        )
    )

    missing_providers = sorted(
        provider_requirements
        -
        set(
            provider_counts
        )
    )

    unverified_commercial_sources = sorted(
        source[
            "sourceId"
        ]

        for source
        in normalized_sources

        if (
            source[
                "policyStatus"
            ]
            ==
            "APPROVED_COMMERCIAL"

            and

            source[
                "licenseVerified"
            ]
            is not True
        )
    )

    hard_failures = {
        "violations":
            violations,

        "missingRoles":
            missing_roles,

        "belowMinimum":
            below_minimum,

        "missingEvidenceGrades":
            missing_grades,

        "missingPartitions":
            missing_partitions,

        "missingProviderFamilies":
            missing_providers,

        "unverifiedCommercialSources":
            unverified_commercial_sources,
    }

    passed = all(
        not value
        for value
        in hard_failures.values()
    )

    inventory_digest_input = {
        "sources":
            normalized_sources,

        "cases":
            normalized_cases,
    }

    coverage = {
        "totalSources":
            len(
                normalized_sources
            ),

        "totalCases":
            len(
                normalized_cases
            ),

        "sourcePolicyCounts":
            dict(
                sorted(
                    Counter(
                        source[
                            "policyStatus"
                        ]
                        for source
                        in normalized_sources
                    ).items()
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

        "partitionCounts":
            dict(
                sorted(
                    partition_counts.items()
                )
            ),

        "casePolicyCounts":
            dict(
                sorted(
                    policy_counts.items()
                )
            ),

        "providerFamilyCounts":
            dict(
                sorted(
                    provider_counts.items()
                )
            ),

        "workloadCounts":
            dict(
                sorted(
                    workload_counts.items()
                )
            ),

        "faultFamilyCounts":
            dict(
                sorted(
                    fault_counts.items()
                )
            ),

        "evidenceModalityCounts":
            dict(
                sorted(
                    modality_counts.items()
                )
            ),
    }

    certification_core = {
        "version":
            CORPUS_COVERAGE_CERTIFICATION_VERSION,

        "passed":
            passed,

        "coverage":
            coverage,

        "thresholds":
            thresholds,

        "requiredProviderFamilies":
            sorted(
                provider_requirements
            ),

        "hardFailures":
            hard_failures,

        "inventoryHash":
            _stable_hash(
                inventory_digest_input
            ),

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    return {
        **deepcopy(
            certification_core
        ),

        "certificationHash":
            _stable_hash(
                certification_core
            ),
    }