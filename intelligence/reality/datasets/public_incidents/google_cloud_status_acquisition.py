"""Phase 23R.13S.5D.1R Google Cloud public incident acquisition.

Acquires a bounded corpus of real, closed Google Cloud Service Health
incidents from Google's official structured incident history.

Important distinction:

CLOSED INCIDENT != VERIFIED ROOT CAUSE.

The acquisition layer MUST NOT discard a real incident merely because the
structured feed does not contain a final postmortem. Instead it records the
quality of evaluation evidence available for each incident.

Cases with explicit root-cause / incident-report evidence can later be
enriched and considered for scored production reconstruction.

Cases without sufficient ground truth remain real historical evidence but
must not be falsely promoted as ground-truth-backed evaluation cases.

No raw postmortem prose is persisted by this acquisition layer.

PUBLIC INCIDENT != EXECUTION AUTHORITY.
PUBLIC STATUS FACT != VERIFIED GROUND TRUTH.
"""

from __future__ import annotations

import hashlib
import json
import urllib.request

from datetime import datetime
from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence


GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION = (
    "23R.13S.5D.1R"
)

GOOGLE_CLOUD_STATUS_SOURCE_ID = (
    "GOOGLE_CLOUD_STATUS_PUBLIC_FACTS"
)

GOOGLE_CLOUD_STATUS_HISTORY_URL = (
    "https://status.cloud.google.com/incidents.json"
)

GOOGLE_CLOUD_STATUS_SCHEMA_URL = (
    "https://status.cloud.google.com/incidents.schema.json"
)

GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT = 100

GOOGLE_CLOUD_PUBLIC_INCIDENT_OUTPUT_RELATIVE = (
    "staging/downloads/public-incidents/"
    "google-cloud-status-incident-facts.jsonl"
)

GOOGLE_CLOUD_PUBLIC_INCIDENT_MANIFEST_RELATIVE = (
    "manifests/"
    "phase23r13-google-cloud-public-incident-acquisition-manifest.json"
)


FINAL_RCA_MARKERS = (
    "root cause",
    "root-cause",
    "rootcause",
)

INCIDENT_REPORT_MARKERS = (
    "incident report",
    "postmortem",
    "post-mortem",
)

PRELIMINARY_RCA_MARKERS = (
    "preliminary analysis",
    "preliminary root cause",
    "preliminary incident report",
)

DIAGNOSTIC_MARKERS = (
    "diagnosis:",
    "identified the cause",
    "identified a cause",
    "caused by",
    "triggered by",
    "was caused",
    "was triggered",
)

ROOT_CAUSE_CATEGORIES = (
    (
        "POWER_OR_COOLING_FAILURE",
        (
            "power failure",
            "power loss",
            "power feed",
            "voltage",
            "cooling failure",
            "temperature",
            "chiller",
            "electrical",
        ),
    ),
    (
        "NETWORK_FAILURE",
        (
            "network partition",
            "network congestion",
            "routing",
            "packet loss",
            "link flapping",
            "network failure",
            "connectivity",
            "mtu",
        ),
    ),
    (
        "CAPACITY_OR_OVERLOAD",
        (
            "overload",
            "capacity",
            "resource exhaustion",
            "out of memory",
            "oom",
            "saturation",
            "unexpected spike",
        ),
    ),
    (
        "CONFIGURATION_CHANGE",
        (
            "configuration change",
            "config change",
            "misconfiguration",
            "incorrect configuration",
            "bad traffic routing policy",
            "configuration issue",
        ),
    ),
    (
        "SOFTWARE_DEPLOYMENT",
        (
            "software rollout",
            "deployment",
            "release",
            "software update",
            "upgrade",
            "code change",
            "recent change",
        ),
    ),
    (
        "DATABASE_OR_STORAGE",
        (
            "database",
            "storage",
            "persistence",
            "replica",
            "metadata store",
            "file distribution",
        ),
    ),
    (
        "DEPENDENCY_FAILURE",
        (
            "dependency",
            "upstream",
            "downstream",
            "third-party",
            "third party",
            "provider",
        ),
    ),
    (
        "CONTROL_PLANE_FAILURE",
        (
            "control plane",
            "control-plane",
            "management plane",
            "metadata service",
            "capacity manager",
        ),
    ),
    (
        "AUTHENTICATION_OR_IDENTITY",
        (
            "authentication",
            "authorization",
            "identity",
            "credential",
            "oauth",
            "access denied",
        ),
    ),
)


def _stable_json_bytes(
    value: Any,
) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        + "\n"
    ).encode("utf-8")


def _sha256_bytes(
    payload: bytes,
) -> str:
    return hashlib.sha256(
        payload
    ).hexdigest()


def _sha256_text(
    value: str,
) -> str:
    return _sha256_bytes(
        str(
            value or ""
        ).encode(
            "utf-8"
        )
    )


def _require_positive_int(
    value: int,
    name: str,
) -> int:
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or value < 1
    ):
        raise ValueError(
            f"{name} must be a positive integer"
        )

    return value


def _normalize_string(
    value: Any,
) -> str:
    return " ".join(
        str(
            value or ""
        ).split()
    )


def _parse_time(
    value: Any,
) -> datetime | None:
    raw = _normalize_string(
        value
    )

    if not raw:
        return None

    try:
        return datetime.fromisoformat(
            raw.replace(
                "Z",
                "+00:00",
            )
        )

    except ValueError:
        return None


def _source_uri(
    incident: Mapping[str, Any],
) -> str:
    incident_id = _normalize_string(
        incident.get(
            "id"
        )
    )

    raw = _normalize_string(
        incident.get(
            "uri"
        )
    )

    if raw.startswith(
        "https://"
    ):
        return raw

    if raw.startswith("/"):
        return (
            "https://status.cloud.google.com"
            + raw
        )

    if raw:
        return (
            "https://status.cloud.google.com/"
            + raw.lstrip("/")
        )

    return (
        "https://status.cloud.google.com/incidents/"
        + incident_id
    )


def _affected_products(
    incident: Mapping[str, Any],
) -> list[Dict[str, str]]:
    result = []

    for raw in (
        incident.get(
            "affected_products"
        )
        or []
    ):
        if not isinstance(
            raw,
            Mapping,
        ):
            continue

        product_id = _normalize_string(
            raw.get(
                "id"
            )
        )

        title = _normalize_string(
            raw.get(
                "current_title"
            )
            or raw.get(
                "title"
            )
        )

        if (
            not product_id
            and not title
        ):
            continue

        result.append({
            "id": product_id,
            "title": title,
        })

    result.sort(
        key=lambda item: (
            item["id"],
            item["title"],
        )
    )

    return result


def _affected_locations(
    incident: Mapping[str, Any],
) -> list[Dict[str, str]]:
    result = []
    seen = set()

    for field in (
        "currently_affected_locations",
        "previously_affected_locations",
    ):
        values = (
            incident.get(
                field
            )
            or []
        )

        for raw in values:
            if not isinstance(
                raw,
                Mapping,
            ):
                continue

            location_id = _normalize_string(
                raw.get(
                    "id"
                )
            )

            title = _normalize_string(
                raw.get(
                    "title"
                )
            )

            identity = (
                location_id,
                title,
            )

            if identity in seen:
                continue

            seen.add(
                identity
            )

            result.append({
                "id": location_id,
                "title": title,
            })

    result.sort(
        key=lambda item: (
            item["id"],
            item["title"],
        )
    )

    return result


def _update_texts(
    incident: Mapping[str, Any],
) -> list[str]:
    texts = []

    for update in (
        incident.get(
            "updates"
        )
        or []
    ):
        if not isinstance(
            update,
            Mapping,
        ):
            continue

        text = str(
            update.get(
                "text"
            )
            or ""
        ).strip()

        if text:
            texts.append(
                text
            )

    return texts


def _evaluation_evidence(
    incident: Mapping[str, Any],
) -> Dict[str, Any]:
    texts = _update_texts(
        incident
    )

    combined = "\n\n".join(
        texts
    )

    lowered = combined.lower()

    has_final_root_cause = any(
        marker in lowered
        for marker
        in FINAL_RCA_MARKERS
    )

    has_incident_report = any(
        marker in lowered
        for marker
        in INCIDENT_REPORT_MARKERS
    )

    has_preliminary = any(
        marker in lowered
        for marker
        in PRELIMINARY_RCA_MARKERS
    )

    has_diagnostic_language = any(
        marker in lowered
        for marker
        in DIAGNOSTIC_MARKERS
    )

    if has_final_root_cause:
        quality = (
            "EXPLICIT_ROOT_CAUSE"
        )

        ground_truth_candidate = True

    elif (
        has_incident_report
        and has_diagnostic_language
    ):
        quality = (
            "INCIDENT_REPORT_DIAGNOSTIC"
        )

        ground_truth_candidate = True

    elif has_preliminary:
        quality = (
            "PRELIMINARY_RCA"
        )

        ground_truth_candidate = True

    elif has_diagnostic_language:
        quality = (
            "DIAGNOSTIC_ONLY"
        )

        ground_truth_candidate = False

    else:
        quality = (
            "STATUS_FACTS_ONLY"
        )

        ground_truth_candidate = False

    return {
        "quality":
            quality,

        "explicitRootCause":
            has_final_root_cause,

        "incidentReportPresent":
            has_incident_report,

        "preliminaryRcaPresent":
            has_preliminary,

        "diagnosticLanguagePresent":
            has_diagnostic_language,

        "groundTruthCandidate":
            ground_truth_candidate,

        "sourceTextCount":
            len(
                texts
            ),

        "combinedSourceTextSha256":
            _sha256_text(
                combined
            ),

        "combinedSourceTextByteSize":
            len(
                combined.encode(
                    "utf-8"
                )
            ),
    }


def _classify_failure_family(
    incident: Mapping[str, Any],
) -> str:
    text = "\n".join(
        [
            _normalize_string(
                incident.get(
                    "external_desc"
                )
            ),
            *_update_texts(
                incident
            ),
        ]
    ).lower()

    scored = []

    for (
        category,
        terms,
    ) in ROOT_CAUSE_CATEGORIES:
        score = sum(
            1
            for term
            in terms
            if term in text
        )

        if score:
            scored.append(
                (
                    score,
                    category,
                )
            )

    if not scored:
        return (
            "UNCLASSIFIED_PUBLIC_INCIDENT"
        )

    scored.sort(
        key=lambda item: (
            -item[0],
            item[1],
        )
    )

    return scored[
        0
    ][
        1
    ]


def _historical_update_facts(
    incident: Mapping[str, Any],
) -> list[Dict[str, Any]]:
    result = []

    for raw in (
        incident.get(
            "updates"
        )
        or []
    ):
        if not isinstance(
            raw,
            Mapping,
        ):
            continue

        text = str(
            raw.get(
                "text"
            )
            or ""
        )

        when = _normalize_string(
            raw.get(
                "when"
            )
            or raw.get(
                "created"
            )
        )

        result.append({
            "when":
                when,

            "status":
                _normalize_string(
                    raw.get(
                        "status"
                    )
                ),

            "sourceTextSha256":
                _sha256_text(
                    text
                ),

            "sourceTextByteSize":
                len(
                    text.encode(
                        "utf-8"
                    )
                ),

            "historicallyAvailable":
                True,
        })

    result.sort(
        key=lambda item: (
            item["when"],
            item[
                "sourceTextSha256"
            ],
        )
    )

    return result


def normalize_google_cloud_public_incident(
    incident: Mapping[str, Any],
    *,
    sequence: int,
) -> Dict[str, Any] | None:
    incident_id = _normalize_string(
        incident.get(
            "id"
        )
    )

    begin = _normalize_string(
        incident.get(
            "begin"
        )
    )

    end = _normalize_string(
        incident.get(
            "end"
        )
    )

    if (
        not incident_id
        or not begin
        or not end
    ):
        return None

    begin_time = _parse_time(
        begin
    )

    end_time = _parse_time(
        end
    )

    if (
        begin_time is None
        or end_time is None
        or end_time <= begin_time
    ):
        return None

    products = _affected_products(
        incident
    )

    if not products:
        service_name = _normalize_string(
            incident.get(
                "service_name"
            )
        )

        if service_name:
            products = [
                {
                    "id":
                        _normalize_string(
                            incident.get(
                                "service_key"
                            )
                        ),

                    "title":
                        service_name,
                }
            ]

    if not products:
        return None

    evaluation = _evaluation_evidence(
        incident
    )

    external_description = _normalize_string(
        incident.get(
            "external_desc"
        )
    )

    identity = {
        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "incidentId":
            incident_id,

        "begin":
            begin,

        "end":
            end,
    }

    incident_digest = _sha256_bytes(
        _stable_json_bytes(
            identity
        )
    )

    duration_seconds = int(
        (
            end_time
            -
            begin_time
        ).total_seconds()
    )

    return {
        "acquisitionVersion":
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "incidentId":
            incident_id,

        "incidentDigest":
            incident_digest,

        "sourceUri":
            _source_uri(
                incident
            ),

        "begin":
            begin,

        "end":
            end,

        "durationSeconds":
            duration_seconds,

        "severity":
            _normalize_string(
                incident.get(
                    "severity"
                )
            ),

        "statusImpact":
            _normalize_string(
                incident.get(
                    "status_impact"
                )
            ),

        "serviceKey":
            _normalize_string(
                incident.get(
                    "service_key"
                )
            ),

        "serviceName":
            _normalize_string(
                incident.get(
                    "service_name"
                )
            ),

        "externalDescriptionSha256":
            _sha256_text(
                external_description
            ),

        "externalDescriptionByteSize":
            len(
                external_description.encode(
                    "utf-8"
                )
            ),

        "affectedProducts":
            products,

        "affectedLocations":
            _affected_locations(
                incident
            ),

        "historicalUpdateFacts":
            _historical_update_facts(
                incident
            ),

        "failureFamily":
            _classify_failure_family(
                incident
            ),

        "evaluationEvidence":
            evaluation,

        "contentStoragePolicy": {
            "mode":
                "FACTS_AND_HASHES_ONLY",

            "rawUpdateTextStored":
                False,

            "rawPostmortemStored":
                False,

            "fullSourceRedistributed":
                False,

            "sourceReferenceRetained":
                True,
        },

        "sourcePolicy": {
            "policyStatus":
                "QUARANTINED_LICENSE_REVIEW",

            "license":
                "PUBLIC_STATUS_FACTS_REFERENCE_ONLY",

            "licenseVerified":
                False,

            "redistributionAllowed":
                False,

            "commercialPromotionEligible":
                False,
        },

        # This acquisition is real-world public incident evidence.
        # Certification-grade reconstruction is decided later.
        "evidenceGrade":
            "E3",

        "corpusRole":
            "PRODUCTION_RECONSTRUCTION",

        "independentEvidence":
            False,

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,

        "seed":
            670000
            +
            sequence,
    }


def normalize_google_cloud_public_incidents(
    incidents: Iterable[
        Mapping[str, Any]
    ],
    *,
    required_count: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,
) -> list[Dict[str, Any]]:
    count = _require_positive_int(
        required_count,
        "required_count",
    )

    candidates = []

    for incident in incidents:
        if not isinstance(
            incident,
            Mapping,
        ):
            continue

        normalized = (
            normalize_google_cloud_public_incident(
                incident,
                sequence=1,
            )
        )

        if normalized is not None:
            candidates.append(
                normalized
            )

    candidates.sort(
        key=lambda item: (
            item["begin"],
            item["incidentId"],
        ),
        reverse=True,
    )

    deduplicated = []
    seen = set()

    for record in candidates:
        incident_id = record[
            "incidentId"
        ]

        if incident_id in seen:
            continue

        seen.add(
            incident_id
        )

        deduplicated.append(
            record
        )

        if len(
            deduplicated
        ) >= count:
            break

    if len(
        deduplicated
    ) < count:
        raise RuntimeError(
            (
                "Google Cloud public incident feed "
                "did not contain enough usable closed "
                "incidents: "
                f"{len(deduplicated)} < {count}"
            )
        )

    for (
        index,
        record,
    ) in enumerate(
        deduplicated,
        start=1,
    ):
        record["seed"] = (
            670000
            +
            index
        )

    return deduplicated


def _fetch_json(
    url: str,
    *,
    timeout_seconds: int = 30,
) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                (
                    "AIRA-Phase23R/"
                    +
                    GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION
                ),

            "Accept":
                "application/json",
        },
        method="GET",
    )

    with urllib.request.urlopen(
        request,
        timeout=
            timeout_seconds,
    ) as response:
        payload = response.read()

    return json.loads(
        payload.decode(
            "utf-8"
        )
    )


def _write_jsonl(
    path: Path,
    records: Sequence[
        Mapping[str, Any]
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
            payload = _stable_json_bytes(
                record
            )

            handle.write(
                payload
            )

            hasher.update(
                payload
            )

            byte_size += len(
                payload
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


def acquire_google_cloud_public_incidents(
    *,
    data_root: str | Path,
    required_count: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,

    fetcher=None,
) -> Dict[str, Any]:
    count = _require_positive_int(
        required_count,
        "required_count",
    )

    fetch = fetcher or _fetch_json

    incidents = fetch(
        GOOGLE_CLOUD_STATUS_HISTORY_URL
    )

    if not isinstance(
        incidents,
        list,
    ):
        raise RuntimeError(
            (
                "Google Cloud incident history "
                "must be a JSON array"
            )
        )

    records = (
        normalize_google_cloud_public_incidents(
            incidents,
            required_count=
                count,
        )
    )

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    output = _write_jsonl(
        root
        /
        GOOGLE_CLOUD_PUBLIC_INCIDENT_OUTPUT_RELATIVE,
        records,
    )

    quality_counts: Dict[
        str,
        int,
    ] = {}

    failure_family_counts: Dict[
        str,
        int,
    ] = {}

    ground_truth_candidate_count = 0

    for record in records:
        quality = (
            record[
                "evaluationEvidence"
            ][
                "quality"
            ]
        )

        quality_counts[
            quality
        ] = (
            quality_counts.get(
                quality,
                0,
            )
            +
            1
        )

        family = record[
            "failureFamily"
        ]

        failure_family_counts[
            family
        ] = (
            failure_family_counts.get(
                family,
                0,
            )
            +
            1
        )

        if (
            record[
                "evaluationEvidence"
            ][
                "groundTruthCandidate"
            ]
        ):
            ground_truth_candidate_count += 1

    manifest_core = {
        "version":
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "sourceHistoryUrl":
            GOOGLE_CLOUD_STATUS_HISTORY_URL,

        "sourceSchemaUrl":
            GOOGLE_CLOUD_STATUS_SCHEMA_URL,

        "requestedCount":
            count,

        "caseCount":
            len(
                records
            ),

        "closedIncidentCount":
            len(
                records
            ),

        "groundTruthCandidateCount":
            ground_truth_candidate_count,

        "groundTruthPendingEnrichmentCount":
            (
                len(
                    records
                )
                -
                ground_truth_candidate_count
            ),

        "evaluationEvidenceQualityCounts":
            dict(
                sorted(
                    quality_counts.items()
                )
            ),

        "failureFamilyCounts":
            dict(
                sorted(
                    failure_family_counts.items()
                )
            ),

        "contentStorageMode":
            "FACTS_AND_HASHES_ONLY",

        "rawPostmortemStored":
            False,

        "rawUpdateTextStored":
            False,

        "policyStatus":
            "QUARANTINED_LICENSE_REVIEW",

        "licenseVerified":
            False,

        "commercialPromotionEligible":
            False,

        "output":
            output,

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
            _sha256_bytes(
                _stable_json_bytes(
                    manifest_core
                )
            ),
    }

    manifest_path = (
        root
        /
        GOOGLE_CLOUD_PUBLIC_INCIDENT_MANIFEST_RELATIVE
    )

    manifest_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest_path.write_bytes(
        _stable_json_bytes(
            manifest
        )
    )

    return {
        **manifest,

        "manifestPath":
            str(
                manifest_path
            ),
    }