"""Phase 23R.13F executable workload source catalog."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from typing import Dict
from typing import Iterable

from intelligence.reality.corpus.registry.source_registry import (
    get_source,
)


WORKLOAD_CATALOG_VERSION = "23R.13F.1"


SOURCE_LOCATION_TYPES = frozenset({
    "AIRA_INTERNAL",
    "WINDOWS_OR_LINUX",
    "WSL_LINUX",
})


_WORKLOADS: Dict[str, Dict[str, Any]] = {
    "AIRA_RELIABILITY_LAB": {
        "workloadId":
            "AIRA_RELIABILITY_LAB",

        "sourceId":
            "AIRA_RELIABILITY_LAB",

        "workloadFamily":
            "AIRA_INTERNAL",

        "acquisitionType":
            "INTERNAL",

        "repository":
            None,

        "sourceCloneRequired":
            False,

        "sourceLocationType":
            "AIRA_INTERNAL",

        "executionZone":
            "LAB_ONLY",

        "telemetryOutputClass":
            "AIRA_GENERATED",

        "generatedCorpusRole":
            "EXECUTABLE_WORKLOAD",

        "generatedEvidenceGrade":
            "E1",

        "faultInjectionOwner":
            "PHASE_21_FAILURE_INJECTION_ENGINE",

        "executionAuthorizationOwner":
            "EXISTING_EXECUTION_AUTHORIZATION_PATH",

        "replayOwner":
            "PHASE_23R_REALITY_REPLAY",

        "production":
            False,
    },

    "OTEL_ASTRONOMY_SHOP": {
        "workloadId":
            "OTEL_ASTRONOMY_SHOP",

        "sourceId":
            "OTEL_ASTRONOMY_SHOP",

        "workloadFamily":
            "MICROSERVICES",

        "acquisitionType":
            "GIT_CLONE",

        "repository":
            (
                "https://github.com/"
                "open-telemetry/"
                "opentelemetry-demo.git"
            ),

        "sourceCloneRequired":
            True,

        "sourceLocationType":
            "WINDOWS_OR_LINUX",

        "executionZone":
            "LAB_ONLY",

        "telemetryOutputClass":
            "AIRA_GENERATED",

        "generatedCorpusRole":
            "EXECUTABLE_WORKLOAD",

        "generatedEvidenceGrade":
            "E1",

        "faultInjectionOwner":
            "PHASE_21_FAILURE_INJECTION_ENGINE",

        "executionAuthorizationOwner":
            "EXISTING_EXECUTION_AUTHORIZATION_PATH",

        "replayOwner":
            "PHASE_23R_REALITY_REPLAY",

        "production":
            False,
    },

    "DEATHSTARBENCH": {
        "workloadId":
            "DEATHSTARBENCH",

        "sourceId":
            "DEATHSTARBENCH",

        "workloadFamily":
            "MICROSERVICES",

        "acquisitionType":
            "GIT_CLONE",

        "repository":
            (
                "https://github.com/"
                "delimitrou/"
                "DeathStarBench.git"
            ),

        "sourceCloneRequired":
            True,

        "sourceLocationType":
            "WSL_LINUX",

        "executionZone":
            "RESEARCH_ONLY",

        "telemetryOutputClass":
            "RESEARCH_ONLY",

        "generatedCorpusRole":
            "RESEARCH_EXPERIMENT",

        "generatedEvidenceGrade":
            "E1",

        "faultInjectionOwner":
            "RESEARCH_HARNESS_ONLY",

        "executionAuthorizationOwner":
            "NONE",

        "replayOwner":
            "RESEARCH_REPLAY_ONLY",

        "production":
            False,
    },
}


def get_workload(
    workload_id: str,
) -> Dict[str, Any]:
    if workload_id not in _WORKLOADS:
        raise KeyError(
            f"unknown executable workload: {workload_id}"
        )

    value = deepcopy(
        _WORKLOADS[
            workload_id
        ]
    )

    source = get_source(
        value[
            "sourceId"
        ]
    )

    value[
        "version"
    ] = WORKLOAD_CATALOG_VERSION

    value[
        "policyStatus"
    ] = source[
        "policyStatus"
    ]

    value[
        "sourceDestinationZone"
    ] = source[
        "destinationZone"
    ]

    value[
        "sourceLicense"
    ] = source[
        "license"
    ]

    value[
        "sourceLicenseVerified"
    ] = source[
        "licenseVerified"
    ]

    value[
        "executionAuthorized"
    ] = False

    value[
        "productionCertified"
    ] = False

    _validate_workload(
        value
    )

    return value


def list_workloads() -> Iterable[
    Dict[
        str,
        Any,
    ]
]:
    for workload_id in sorted(
        _WORKLOADS
    ):
        yield get_workload(
            workload_id
        )


def _validate_workload(
    workload: Dict[str, Any],
) -> None:
    if (
        workload[
            "sourceLocationType"
        ]
        not in
        SOURCE_LOCATION_TYPES
    ):
        raise ValueError(
            "unknown workload source location type"
        )

    if (
        workload[
            "executionZone"
        ]
        ==
        "LAB_ONLY"
        and
        workload[
            "production"
        ]
        is not False
    ):
        raise ValueError(
            "LAB_ONLY workload cannot be production"
        )

    if (
        workload[
            "executionZone"
        ]
        ==
        "RESEARCH_ONLY"
        and
        workload[
            "policyStatus"
        ]
        !=
        "APPROVED_RESEARCH_ONLY"
    ):
        raise ValueError(
            "research workload requires "
            "research-only source policy"
        )

    if (
        workload[
            "executionZone"
        ]
        ==
        "RESEARCH_ONLY"
        and
        workload[
            "executionAuthorizationOwner"
        ]
        !=
        "NONE"
    ):
        raise ValueError(
            "research workload cannot acquire "
            "AIRA execution authority"
        )

    if (
        workload[
            "executionAuthorized"
        ]
        is not False
    ):
        raise ValueError(
            "workload catalog cannot grant "
            "execution authority"
        )