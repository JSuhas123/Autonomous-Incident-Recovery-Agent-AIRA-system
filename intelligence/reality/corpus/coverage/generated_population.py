"""Phase 23R.13S.3 deterministic generated-corpus population."""

from __future__ import annotations

import hashlib
import json

from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence

from intelligence.reality.generation.ambiguous.ambiguous_evidence import (
    build_ambiguous_evidence_case,
)
from intelligence.reality.generation.cascading.cascading_failure import (
    build_cascading_failure_case,
)
from intelligence.reality.generation.healthy.healthy_baseline import (
    HEALTHY_SCENARIO_TYPES,
    build_healthy_baseline_case,
)
from intelligence.reality.generation.multi_fault.multi_fault import (
    build_multi_fault_case,
)
from intelligence.reality.generation.noise.noisy_derivative import (
    OBSERVABILITY_CLASSES,
    TRANSFORMATION_TYPES,
    build_noisy_derivative,
)
from intelligence.reality.generation.recovery.recovery_outcome import (
    RECOVERY_OUTCOMES,
    build_recovery_outcome_case,
)


GENERATED_CORPUS_POPULATION_VERSION = "23R.13S.3.0"


DEFAULT_COUNTS = {
    "HEALTHY_BASELINE": 500,
    "NOISY_DERIVATIVE": 5000,
    "MULTI_FAULT": 250,
    "CASCADING_FAILURE": 250,
    "AMBIGUOUS_EVIDENCE": 250,
    "RECOVERY_OUTCOME": 500,
}


ROLE_PATHS = {
    "HEALTHY_BASELINE":
        (
            "generated/healthy-baseline/"
            "phase23r13-healthy-baseline.jsonl"
        ),

    "NOISY_DERIVATIVE":
        (
            "generated/noisy-observability/"
            "phase23r13-noisy-observability.jsonl"
        ),

    "MULTI_FAULT":
        (
            "generated/multi-fault/"
            "phase23r13-multi-fault.jsonl"
        ),

    "CASCADING_FAILURE":
        (
            "generated/cascading-failure/"
            "phase23r13-cascading-failure.jsonl"
        ),

    "AMBIGUOUS_EVIDENCE":
        (
            "generated/ambiguous-evidence/"
            "phase23r13-ambiguous-evidence.jsonl"
        ),

    "RECOVERY_OUTCOME":
        (
            "generated/recovery-outcomes/"
            "phase23r13-recovery-outcomes.jsonl"
        ),
}


SOURCE_ID = "AIRA_RELIABILITY_LAB"

WORKLOAD_ID = "AIRA_MICROSERVICES_LAB_V1"

EVIDENCE_GRADE = "E1"


BASE_ELIGIBILITY = {
    "researchEligible":
        True,

    "modelTrainingEligible":
        False,

    "retrievalEligible":
        True,

    "developmentEvaluationEligible":
        True,

    "validationEligible":
        True,

    "holdoutEligible":
        False,

    "productionCertificationEligible":
        False,

    "customerRuntimeEligible":
        False,

    "redistributionAllowed":
        False,

    "agentGroundTruthVisible":
        False,
}


LINEAGE_POLICY = {
    "policyStatus":
        "APPROVED_COMMERCIAL",

    "hasFinalHoldoutAncestor":
        False,

    "hasResearchOnlyAncestor":
        False,

    "eligibility":
        BASE_ELIGIBILITY,
}


def _stable_hash(
    value: Any,
) -> str:
    encoded = json.dumps(
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

    return hashlib.sha256(
        encoded
    ).hexdigest()


def _ordered(
    values: Iterable[str],
) -> list[str]:
    return sorted(
        str(
            value
        )
        for value
        in values
    )


def _metric_evidence(
    index: int,
    *,
    healthy: bool,
) -> list[Dict[str, Any]]:
    cpu = (
        35
        +
        (
            index
            %
            18
        )
        if healthy
        else
        88
        +
        (
            index
            %
            10
        )
    )

    latency = (
        90
        +
        (
            index
            %
            140
        )
        if healthy
        else
        900
        +
        (
            index
            %
            2400
        )
    )

    return [
        {
            "kind":
                "METRIC",

            "metric":
                "cpu_utilization_percent",

            "value":
                cpu,

            "service":
                "checkout",

            "timestampOffsetSeconds":
                index
                %
                60,
        },

        {
            "kind":
                "METRIC",

            "metric":
                "request_latency_ms",

            "value":
                latency,

            "service":
                "checkout",

            "timestampOffsetSeconds":
                (
                    index
                    %
                    60
                )
                +
                1,
        },

        {
            "kind":
                "LOG",

            "level":
                (
                    "INFO"
                    if healthy
                    else
                    "WARN"
                ),

            "service":
                "checkout",

            "message":
                (
                    "steady workload observation"
                    if healthy
                    else
                    "degraded workload observation"
                ),
        },
    ]


def _incident_parent(
    index: int,
    family: str,
) -> Dict[str, Any]:
    digest = _stable_hash({
        "index":
            index,

        "family":
            family,
    })

    return {
        "caseId":
            (
                "incident-"
                +
                digest[:24]
            ),

        "caseDigest":
            digest,

        "sourceId":
            SOURCE_ID,

        "workloadId":
            WORKLOAD_ID,

        "scenario":
            "INCIDENT",

        "scenarioType":
            family,

        "evidenceGrade":
            EVIDENCE_GRADE,
    }


def _enrich(
    record: Mapping[str, Any],
    *,
    source_id: str = SOURCE_ID,
) -> Dict[str, Any]:
    value = dict(
        record
    )

    value.setdefault(
        "sourceId",
        source_id,
    )

    value.setdefault(
        "workloadId",
        WORKLOAD_ID,
    )

    value.setdefault(
        "policyStatus",
        "APPROVED_COMMERCIAL",
    )

    value.setdefault(
        "independentEvidence",
        False,
    )

    value.setdefault(
        "groundTruthAgentVisible",
        False,
    )

    value.setdefault(
        "executionAuthorized",
        False,
    )

    value.setdefault(
        "productionCertified",
        False,
    )

    return value


def generate_healthy_cases(
    count: int,
) -> list[Dict[str, Any]]:
    scenarios = _ordered(
        HEALTHY_SCENARIO_TYPES
    )

    cases = []

    for index in range(
        count
    ):
        scenario = scenarios[
            index
            %
            len(
                scenarios
            )
        ]

        case = build_healthy_baseline_case(
            source_id=
                SOURCE_ID,

            workload_id=
                WORKLOAD_ID,

            scenario_type=
                scenario,

            evidence_grade=
                EVIDENCE_GRADE,

            evidence=
                _metric_evidence(
                    index,
                    healthy=True,
                ),

            eligibility=
                BASE_ELIGIBILITY,

            seed=
                index
                +
                1,

            metadata={
                "populationVersion":
                    GENERATED_CORPUS_POPULATION_VERSION,

                "populationIndex":
                    index,
            },
        )

        cases.append(
            _enrich(
                case
            )
        )

    return cases


def generate_noisy_cases(
    count: int,
    healthy_cases: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> list[Dict[str, Any]]:
    if (
        not healthy_cases
        and
        count
    ):
        raise ValueError(
            "noisy population requires healthy parents"
        )

    transformations = _ordered(
        TRANSFORMATION_TYPES
    )

    observability_classes = [
        value

        for value
        in _ordered(
            OBSERVABILITY_CLASSES
        )

        if value !=
        "CLEAN"
    ]

    cases = []

    for index in range(
        count
    ):
        parent = healthy_cases[
            index
            %
            len(
                healthy_cases
            )
        ]

        transformation = transformations[
            index
            %
            len(
                transformations
            )
        ]

        observability = observability_classes[
            index
            %
            len(
                observability_classes
            )
        ]

        evidence = list(
            parent.get(
                "evidence",
                [],
            )
        )

        if transformation in {
            "MISSING_EVIDENCE",
            "MISSING_TRACES",
        }:
            transformed = (
                evidence[:-1]
                or
                evidence[:1]
            )

        elif (
            transformation
            ==
            "DUPLICATE_ALERTS"
        ):
            transformed = (
                evidence
                +
                evidence[:1]
            )

        elif (
            transformation
            ==
            "REORDERED_EVIDENCE"
        ):
            transformed = list(
                reversed(
                    evidence
                )
            )

        elif (
            transformation
            ==
            "CONFLICTING_EVIDENCE"
        ):
            transformed = (
                evidence
                +
                [
                    {
                        "kind":
                            "METRIC",

                        "metric":
                            "request_latency_ms",

                        "value":
                            40,

                        "service":
                            "checkout",

                        "conflicting":
                            True,
                    }
                ]
            )

        else:
            transformed = evidence

        case = build_noisy_derivative(
            parent_case=
                parent,

            transformation_type=
                transformation,

            observability_class=
                observability,

            transformation_version=
                GENERATED_CORPUS_POPULATION_VERSION,

            seed=
                100000
                +
                index,

            transformed_evidence=
                transformed,

            lineage_policy=
                LINEAGE_POLICY,
        )

        cases.append(
            _enrich(
                case
            )
        )

    return cases


def generate_multi_fault_cases(
    count: int,
) -> list[Dict[str, Any]]:
    fault_pairs = [
        (
            "NETWORK_LATENCY",
            "MEMORY_PRESSURE",
        ),

        (
            "DATABASE_LATENCY",
            "POD_CRASH",
        ),

        (
            "BAD_DEPLOYMENT",
            "LOAD_SPIKE",
        ),

        (
            "QUEUE_BACKLOG",
            "DEPENDENCY_UNAVAILABLE",
        ),
    ]

    cases = []

    for index in range(
        count
    ):
        (
            left,
            right,
        ) = fault_pairs[
            index
            %
            len(
                fault_pairs
            )
        ]

        parents = [
            _incident_parent(
                index
                *
                2,
                left,
            ),

            _incident_parent(
                (
                    index
                    *
                    2
                )
                +
                1,
                right,
            ),
        ]

        case = build_multi_fault_case(
            parent_cases=
                parents,

            root_faults=[
                {
                    "faultId":
                        (
                            f"{left.lower()}-"
                            f"{index}"
                        ),

                    "family":
                        left,
                },

                {
                    "faultId":
                        (
                            f"{right.lower()}-"
                            f"{index}"
                        ),

                    "family":
                        right,
                },
            ],

            combined_evidence=
                _metric_evidence(
                    index,
                    healthy=False,
                ),

            lineage_policy=
                LINEAGE_POLICY,

            seed=
                200000
                +
                index,

            metadata={
                "populationVersion":
                    GENERATED_CORPUS_POPULATION_VERSION,

                "faultFamily":
                    (
                        f"{left}"
                        f"+"
                        f"{right}"
                    ),
            },
        )

        value = _enrich(
            case
        )

        value[
            "faultFamily"
        ] = (
            f"{left}"
            f"+"
            f"{right}"
        )

        cases.append(
            value
        )

    return cases


def generate_cascading_cases(
    count: int,
) -> list[Dict[str, Any]]:
    cases = []

    for index in range(
        count
    ):
        parent = _incident_parent(
            index,
            "DEPENDENCY_LATENCY",
        )

        chain = [
            {
                "nodeId":
                    f"root-{index}",

                "nodeType":
                    "ROOT_FAULT",
            },

            {
                "nodeId":
                    f"symptom-{index}",

                "nodeType":
                    "PRIMARY_SYMPTOM",
            },

            {
                "nodeId":
                    f"retry-{index}",

                "nodeType":
                    "RETRY_AMPLIFICATION",
            },

            {
                "nodeId":
                    f"queue-{index}",

                "nodeType":
                    "QUEUE_GROWTH",
            },

            {
                "nodeId":
                    f"downstream-{index}",

                "nodeType":
                    "DOWNSTREAM_FAILURE",
            },

            {
                "nodeId":
                    f"alerts-{index}",

                "nodeType":
                    "ALERT_STORM",
            },
        ]

        case = build_cascading_failure_case(
            parent_case=
                parent,

            causal_chain=
                chain,

            evidence=
                _metric_evidence(
                    index,
                    healthy=False,
                ),

            lineage_policy=
                LINEAGE_POLICY,

            seed=
                300000
                +
                index,

            metadata={
                "populationVersion":
                    GENERATED_CORPUS_POPULATION_VERSION,

                "faultFamily":
                    "DEPENDENCY_LATENCY",
            },
        )

        value = _enrich(
            case
        )

        value[
            "faultFamily"
        ] = (
            "DEPENDENCY_LATENCY"
        )

        cases.append(
            value
        )

    return cases


def generate_ambiguous_cases(
    count: int,
) -> list[Dict[str, Any]]:
    ambiguity_types = [
        "ALARMING_NON_ROOT_SIGNAL",
        "COMPETING_HYPOTHESES",
        "CORRELATED_NOT_CAUSAL",
        "STALE_CHANGE_CONTEXT",
        "MISLEADING_TOPOLOGY",
        "PARTIAL_CAUSAL_VISIBILITY",
        "CONFLICTING_SIGNALS",
    ]

    cases = []

    for index in range(
        count
    ):
        parent = _incident_parent(
            index,
            "DATABASE_LATENCY",
        )

        ambiguity_type = ambiguity_types[
            index
            %
            len(
                ambiguity_types
            )
        ]

        case = build_ambiguous_evidence_case(
            parent_case=
                parent,

            ambiguity_type=
                ambiguity_type,

            visible_evidence=[
                {
                    "kind":
                        "ALERT",

                    "signalId":
                        f"cpu-high-{index}",

                    "service":
                        "api",

                    "severity":
                        "critical",
                },

                {
                    "kind":
                        "METRIC",

                    "metric":
                        "database_wait_ms",

                    "value":
                        1800
                        +
                        (
                            index
                            %
                            400
                        ),

                    "service":
                        "postgresql",
                },
            ],

            alarming_signal_id=
                f"cpu-high-{index}",

            evaluator_root_cause={
                "causeId":
                    (
                        "database-lock-"
                        f"{index}"
                    ),

                "family":
                    "DATABASE_LATENCY",

                "summary":
                    "database lock contention",
            },

            lineage_policy=
                LINEAGE_POLICY,

            seed=
                400000
                +
                index,

            metadata={
                "populationVersion":
                    GENERATED_CORPUS_POPULATION_VERSION,

                "faultFamily":
                    "DATABASE_LATENCY",
            },
        )

        value = _enrich(
            case
        )

        value[
            "faultFamily"
        ] = (
            "DATABASE_LATENCY"
        )

        cases.append(
            value
        )

    return cases


def generate_recovery_cases(
    count: int,
) -> list[Dict[str, Any]]:
    outcomes = _ordered(
        RECOVERY_OUTCOMES
    )

    cases = []

    for index in range(
        count
    ):
        outcome = outcomes[
            index
            %
            len(
                outcomes
            )
        ]

        parent = _incident_parent(
            index,
            "MEMORY_PRESSURE",
        )

        verification_status = (
            "PASS"
            if outcome == "SUCCESS"
            else
            "FAIL"
        )

        trajectory_state = (
            "RECOVERED"
            if outcome == "SUCCESS"
            else
            "DEGRADED"
        )

        case = build_recovery_outcome_case(
            parent_case=
                parent,

            diagnosis={
                "cause":
                    "memory-pressure",

                "confidence":
                    0.86,
            },

            proposed_recovery={
                "action":
                    "restartDeployment",

                "target":
                    "checkout",
            },

            authorization_record={
                "decision":
                    "APPROVED",

                "historicalEvidenceOnly":
                    True,
            },

            execution_record={
                "status":
                    "SUCCEEDED",

                "historicalEvidenceOnly":
                    True,
            },

            verification_record={
                "status":
                    verification_status,
            },

            post_recovery_trajectory=[
                {
                    "offsetSeconds":
                        30,

                    "state":
                        trajectory_state,
                },

                {
                    "offsetSeconds":
                        120,

                    "state":
                        trajectory_state,
                },
            ],

            recovery_outcome=
                outcome,

            evidence=
                _metric_evidence(
                    index,
                    healthy=(
                        outcome
                        ==
                        "SUCCESS"
                    ),
                ),

            lineage_policy=
                LINEAGE_POLICY,

            seed=
                500000
                +
                index,

            metadata={
                "populationVersion":
                    GENERATED_CORPUS_POPULATION_VERSION,

                "faultFamily":
                    "MEMORY_PRESSURE",
            },
        )

        value = _enrich(
            case
        )

        value[
            "faultFamily"
        ] = (
            "MEMORY_PRESSURE"
        )

        cases.append(
            value
        )

    return cases


def build_generated_corpus(
    counts: Mapping[
        str,
        int,
    ] | None = None,
) -> Dict[
    str,
    list[
        Dict[
            str,
            Any,
        ]
    ],
]:
    effective = dict(
        DEFAULT_COUNTS
    )

    if counts is not None:
        effective.update(
            counts
        )

    for (
        role,
        count,
    ) in effective.items():
        if role not in DEFAULT_COUNTS:
            raise ValueError(
                "unknown generated corpus role: "
                f"{role}"
            )

        if (
            not isinstance(
                count,
                int,
            )
            or
            count < 0
        ):
            raise ValueError(
                "generated corpus count must be "
                "non-negative integer: "
                f"{role}"
            )

    healthy = generate_healthy_cases(
        effective[
            "HEALTHY_BASELINE"
        ]
    )

    return {
        "HEALTHY_BASELINE":
            healthy,

        "NOISY_DERIVATIVE":
            generate_noisy_cases(
                effective[
                    "NOISY_DERIVATIVE"
                ],
                healthy,
            ),

        "MULTI_FAULT":
            generate_multi_fault_cases(
                effective[
                    "MULTI_FAULT"
                ]
            ),

        "CASCADING_FAILURE":
            generate_cascading_cases(
                effective[
                    "CASCADING_FAILURE"
                ]
            ),

        "AMBIGUOUS_EVIDENCE":
            generate_ambiguous_cases(
                effective[
                    "AMBIGUOUS_EVIDENCE"
                ]
            ),

        "RECOVERY_OUTCOME":
            generate_recovery_cases(
                effective[
                    "RECOVERY_OUTCOME"
                ]
            ),
    }


def _write_jsonl(
    path: Path,
    records: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[str, Any]:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = hashlib.sha256()

    byte_size = 0

    with path.open(
        "wb"
    ) as handle:
        for record in records:
            line = (
                json.dumps(
                    record,
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

            handle.write(
                line
            )

            hasher.update(
                line
            )

            byte_size += len(
                line
            )

    return {
        "path":
            str(
                path
            ),

        "recordCount":
            len(
                records
            ),

        "byteSize":
            byte_size,

        "sha256":
            hasher.hexdigest(),
    }


def populate_generated_corpus(
    *,
    data_root: str | Path,
    counts: Mapping[
        str,
        int,
    ] | None = None,
) -> Dict[str, Any]:
    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    if (
        not root.exists()
        or
        not root.is_dir()
    ):
        raise ValueError(
            "AIRA-DATA root does not exist: "
            f"{root}"
        )

    corpus = build_generated_corpus(
        counts=
            counts
    )

    shards = {}

    for (
        role,
        records,
    ) in corpus.items():
        relative_path = ROLE_PATHS[
            role
        ]

        shard = _write_jsonl(
            root
            /
            relative_path,

            records,
        )

        shard[
            "relativePath"
        ] = relative_path

        shards[
            role
        ] = shard

    total_records = sum(
        item[
            "recordCount"
        ]
        for item
        in shards.values()
    )

    manifest_core = {
        "version":
            GENERATED_CORPUS_POPULATION_VERSION,

        "sourceId":
            SOURCE_ID,

        "workloadId":
            WORKLOAD_ID,

        "evidenceGrade":
            EVIDENCE_GRADE,

        "totalRecords":
            total_records,

        "roleCounts": {
            role:
                shard[
                    "recordCount"
                ]

            for (
                role,
                shard,
            )
            in sorted(
                shards.items()
            )
        },

        "shards": {
            role: {
                "relativePath":
                    shard[
                        "relativePath"
                    ],

                "recordCount":
                    shard[
                        "recordCount"
                    ],

                "byteSize":
                    shard[
                        "byteSize"
                    ],

                "sha256":
                    shard[
                        "sha256"
                    ],
            }

            for (
                role,
                shard,
            )
            in sorted(
                shards.items()
            )
        },

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }

    manifest = {
        **manifest_core,

        "manifestHash":
            _stable_hash(
                manifest_core
            ),
    }

    manifest_path = (
        root
        /
        "manifests"
        /
        "phase23r13-generated-corpus-manifest.json"
    )

    manifest_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest_path.write_text(
        (
            json.dumps(
                manifest,
                indent=2,
                sort_keys=True,
            )
            +
            "\n"
        ),
        encoding="utf-8",
    )

    return {
        "manifest":
            manifest,

        "manifestPath":
            str(
                manifest_path
            ),
    }