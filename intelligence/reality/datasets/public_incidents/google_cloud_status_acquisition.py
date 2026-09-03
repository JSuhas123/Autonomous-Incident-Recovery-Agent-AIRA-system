"""Phase 23R.13S.5D.1R2 Google Cloud public incident acquisition.

Real historical incident discovery uses Google's official product catalog and
per-product history pages. Recent incidents.json data is used only as optional
structured enrichment. Acquisition is bounded: product pages are fetched in
concurrent batches with per-request timeouts and per-product failure isolation.

PUBLIC INCIDENT != VERIFIED ROOT CAUSE.
PUBLIC INCIDENT != EXECUTION AUTHORITY.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import socket
import urllib.error
import urllib.request

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Mapping, Sequence


GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION = "23R.13S.5D.1R2"

GOOGLE_CLOUD_STATUS_SOURCE_ID = "GOOGLE_CLOUD_STATUS_PUBLIC_FACTS"

GOOGLE_CLOUD_STATUS_BASE_URL = "https://status.cloud.google.com"

GOOGLE_CLOUD_STATUS_HISTORY_URL = (
    f"{GOOGLE_CLOUD_STATUS_BASE_URL}/incidents.json"
)

GOOGLE_CLOUD_STATUS_SCHEMA_URL = (
    f"{GOOGLE_CLOUD_STATUS_BASE_URL}/incidents.schema.json"
)

GOOGLE_CLOUD_STATUS_PRODUCTS_URL = (
    f"{GOOGLE_CLOUD_STATUS_BASE_URL}/products.json"
)

GOOGLE_CLOUD_STATUS_PRODUCTS_SCHEMA_URL = (
    f"{GOOGLE_CLOUD_STATUS_BASE_URL}/products.schema.json"
)

GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT = 100
GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_MAX_PRODUCTS = 200
GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_WORKERS = 16
GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_TIMEOUT_SECONDS = 6
GOOGLE_CLOUD_PUBLIC_INCIDENT_BATCH_SIZE = 32

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


_DURATION_RE = re.compile(
    r"(?P<count>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>days?|hours?|minutes?|mins?|seconds?|secs?)",
    re.I,
)

# Accept:
#
# /incidents/ABC
# /incidents/ABC?hl=en
# https://status.cloud.google.com/incidents/ABC
# https://status.cloud.google.com/incidents/ABC?authuser=1
#
_INCIDENT_HREF_RE = re.compile(
    r"(?:^|https?://status\.cloud\.google\.com)?"
    r"/?incidents/"
    r"([A-Za-z0-9._~-]+)"
    r"(?:[/?#].*)?$",
    re.I,
)

# Fallback scanner for embedded URLs/paths in raw markup/scripts.
_INCIDENT_ANYWHERE_RE = re.compile(
    r"(?:https?://status\.cloud\.google\.com)?"
    r"/?incidents/"
    r"([A-Za-z0-9._~-]+)",
    re.I,
)


def _stable_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        + "\n"
    ).encode("utf-8")


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_text(value: str) -> str:
    return _sha256_bytes(
        str(value or "").encode("utf-8")
    )


def _normalize_string(value: Any) -> str:
    return " ".join(
        str(value or "").split()
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


def _parse_time(
    value: Any,
) -> datetime | None:
    raw = _normalize_string(value)

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


def _parse_duration_seconds(
    value: Any,
) -> int | None:
    raw = _normalize_string(value)

    if not raw:
        return None

    total = 0.0
    found = False

    for match in _DURATION_RE.finditer(raw):
        found = True

        amount = float(
            match.group("count")
        )

        unit = (
            match.group("unit")
            .lower()
        )

        if unit.startswith("day"):
            total += amount * 86400

        elif unit.startswith("hour"):
            total += amount * 3600

        elif unit.startswith("min"):
            total += amount * 60

        else:
            total += amount

    return (
        int(total)
        if found
        else None
    )


def _product_entries(
    payload: Any,
) -> list[Dict[str, str]]:
    raw_products = (
        payload.get("products")
        if isinstance(payload, Mapping)
        else payload
    )

    if not isinstance(
        raw_products,
        list,
    ):
        raise RuntimeError(
            "Google Cloud product catalog must "
            "be a list or products wrapper"
        )

    result = []
    seen = set()

    for raw in raw_products:
        if not isinstance(
            raw,
            Mapping,
        ):
            continue

        product_id = _normalize_string(
            raw.get("id")
        )

        title = _normalize_string(
            raw.get("title")
            or raw.get("current_title")
            or raw.get("name")
        )

        if (
            not product_id
            or product_id in seen
        ):
            continue

        seen.add(product_id)

        result.append({
            "id":
                product_id,

            "title":
                title,
        })

    result.sort(
        key=lambda item: (
            item["id"],
            item["title"],
        )
    )

    return result


class _HistoryTableParser(
    HTMLParser
):
    def __init__(
        self,
    ) -> None:
        super().__init__(
            convert_charrefs=True
        )

        self.rows: list[
            list[
                Dict[
                    str,
                    Any,
                ]
            ]
        ] = []

        self._row: (
            list[
                Dict[
                    str,
                    Any,
                ]
            ]
            |
            None
        ) = None

        self._cell: (
            Dict[
                str,
                Any,
            ]
            |
            None
        ) = None

    def handle_starttag(
        self,
        tag: str,
        attrs,
    ) -> None:
        attrs_map = dict(attrs)

        if tag == "tr":
            self._row = []

        elif (
            tag in {
                "td",
                "th",
            }
            and self._row
            is not None
        ):
            self._cell = {
                "text": [],
                "hrefs": [],
            }

        elif (
            tag == "a"
            and self._cell
            is not None
        ):
            href = attrs_map.get("href")

            if href:
                self._cell[
                    "hrefs"
                ].append(
                    href
                )

    def handle_endtag(
        self,
        tag: str,
    ) -> None:
        if (
            tag in {
                "td",
                "th",
            }
            and self._row
            is not None
            and self._cell
            is not None
        ):
            self._cell[
                "text"
            ] = _normalize_string(
                "".join(
                    self._cell[
                        "text"
                    ]
                )
            )

            self._row.append(
                self._cell
            )

            self._cell = None

        elif (
            tag == "tr"
            and self._row
            is not None
        ):
            if self._row:
                self.rows.append(
                    self._row
                )

            self._row = None
            self._cell = None

    def handle_data(
        self,
        data: str,
    ) -> None:
        if self._cell is not None:
            self._cell[
                "text"
            ].append(
                data
            )


def _incident_id_from_href(
    href: Any,
) -> tuple[str, str]:
    raw = html.unescape(
        str(
            href
            or ""
        )
    ).strip()

    if not raw:
        return "", ""

    # Also support JSON/script escaped URLs.
    raw = raw.replace(
        "\\/",
        "/",
    )

    match = _INCIDENT_HREF_RE.search(
        raw
    )

    if not match:
        match = (
            _INCIDENT_ANYWHERE_RE.search(
                raw
            )
        )

    if not match:
        return "", ""

    incident_id = (
        match.group(1)
    )

    return (
        incident_id,
        (
            f"{GOOGLE_CLOUD_STATUS_BASE_URL}"
            f"/incidents/{incident_id}"
        ),
    )


def _history_incidents(
    page_html: str,
    *,
    product_id: str,
    product_title: str,
) -> list[Dict[str, Any]]:
    raw_page = str(
        page_html
        or ""
    )

    parser = (
        _HistoryTableParser()
    )

    parser.feed(
        raw_page
    )

    result: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen: set[str] = set()

    #
    # Preferred extraction:
    #
    # Keep row metadata when the history page
    # exposes ordinary table links.
    #
    for row in parser.rows:
        incident_id = ""
        source_uri = ""
        summary = ""

        for cell in row:
            for href in (
                cell.get(
                    "hrefs",
                    [],
                )
            ):
                (
                    incident_id,
                    source_uri,
                ) = (
                    _incident_id_from_href(
                        href
                    )
                )

                if incident_id:
                    summary = (
                        _normalize_string(
                            cell.get(
                                "text"
                            )
                        )
                    )

                    break

            if incident_id:
                break

        if (
            not incident_id
            or incident_id in seen
        ):
            continue

        seen.add(
            incident_id
        )

        texts = [
            _normalize_string(
                cell.get(
                    "text"
                )
            )
            for cell
            in row
        ]

        date_text = (
            texts[1]
            if len(texts) > 1
            else ""
        )

        duration_text = (
            texts[2]
            if len(texts) > 2
            else ""
        )

        result.append({
            "incidentId":
                incident_id,

            "sourceUri":
                source_uri,

            "historySummary":
                html.unescape(
                    summary
                ),

            "historyDate":
                date_text,

            "historyDuration":
                duration_text,

            "historyDurationSeconds":
                _parse_duration_seconds(
                    duration_text
                ),

            "discoveredViaProductId":
                _normalize_string(
                    product_id
                ),

            "discoveredViaProductTitle":
                _normalize_string(
                    product_title
                ),
        })

    #
    # Fallback extraction:
    #
    # Google can alter history-page markup.
    # Scan raw HTML/script content for official
    # incident URLs or relative paths.
    #
    # We intentionally retain only the immutable
    # incident identifier here. We DO NOT invent
    # date, duration or summary metadata.
    #
    normalized_page = (
        html.unescape(
            raw_page
        )
        .replace(
            "\\/",
            "/",
        )
    )

    for match in (
        _INCIDENT_ANYWHERE_RE
        .finditer(
            normalized_page
        )
    ):
        incident_id = (
            match.group(1)
        )

        if incident_id in seen:
            continue

        seen.add(
            incident_id
        )

        result.append({
            "incidentId":
                incident_id,

            "sourceUri":
                (
                    f"{GOOGLE_CLOUD_STATUS_BASE_URL}"
                    f"/incidents/{incident_id}"
                ),

            "historySummary":
                "",

            "historyDate":
                "",

            "historyDuration":
                "",

            "historyDurationSeconds":
                None,

            "discoveredViaProductId":
                _normalize_string(
                    product_id
                ),

            "discoveredViaProductTitle":
                _normalize_string(
                    product_title
                ),
        })

    return result


def _source_uri(
    incident: Mapping[str, Any],
) -> str:
    incident_id = _normalize_string(
        incident.get("id")
    )

    raw = _normalize_string(
        incident.get("uri")
    )

    if raw.startswith(
        "https://"
    ):
        return raw

    if raw.startswith("/"):
        return (
            GOOGLE_CLOUD_STATUS_BASE_URL
            +
            raw
        )

    if raw:
        return (
            GOOGLE_CLOUD_STATUS_BASE_URL
            +
            "/"
            +
            raw.lstrip("/")
        )

    return (
        f"{GOOGLE_CLOUD_STATUS_BASE_URL}"
        f"/incidents/{incident_id}"
    )


def _affected_products(
    incident: Mapping[str, Any],
) -> list[Dict[str, str]]:
    result = []
    seen = set()

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

        product_id = (
            _normalize_string(
                raw.get("id")
            )
        )

        title = (
            _normalize_string(
                raw.get(
                    "current_title"
                )
                or raw.get(
                    "title"
                )
            )
        )

        identity = (
            product_id,
            title,
        )

        if (
            (
                not product_id
                and not title
            )
            or identity in seen
        ):
            continue

        seen.add(identity)

        result.append({
            "id":
                product_id,

            "title":
                title,
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
        for raw in (
            incident.get(field)
            or []
        ):
            if not isinstance(
                raw,
                Mapping,
            ):
                continue

            item = {
                "id":
                    _normalize_string(
                        raw.get("id")
                    ),

                "title":
                    _normalize_string(
                        raw.get("title")
                    ),
            }

            identity = (
                item["id"],
                item["title"],
            )

            if identity in seen:
                continue

            seen.add(identity)

            result.append(
                item
            )

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
    return [
        str(
            update.get("text")
            or ""
        ).strip()

        for update
        in (
            incident.get("updates")
            or []
        )

        if (
            isinstance(
                update,
                Mapping,
            )
            and str(
                update.get("text")
                or ""
            ).strip()
        )
    ]


def _evaluation_evidence(
    incident: Mapping[str, Any],
) -> Dict[str, Any]:
    texts = _update_texts(
        incident
    )

    combined = "\n\n".join(
        texts
    )

    lowered = (
        combined.lower()
    )

    has_final = any(
        marker in lowered
        for marker
        in FINAL_RCA_MARKERS
    )

    has_report = any(
        marker in lowered
        for marker
        in INCIDENT_REPORT_MARKERS
    )

    has_preliminary = any(
        marker in lowered
        for marker
        in PRELIMINARY_RCA_MARKERS
    )

    has_diagnostic = any(
        marker in lowered
        for marker
        in DIAGNOSTIC_MARKERS
    )

    if has_final:
        quality = (
            "EXPLICIT_ROOT_CAUSE"
        )
        candidate = True

    elif (
        has_report
        and has_diagnostic
    ):
        quality = (
            "INCIDENT_REPORT_DIAGNOSTIC"
        )
        candidate = True

    elif has_preliminary:
        quality = (
            "PRELIMINARY_RCA"
        )
        candidate = True

    elif has_diagnostic:
        quality = (
            "DIAGNOSTIC_ONLY"
        )
        candidate = False

    else:
        quality = (
            "STATUS_FACTS_ONLY"
        )
        candidate = False

    return {
        "quality":
            quality,

        "explicitRootCause":
            has_final,

        "incidentReportPresent":
            has_report,

        "preliminaryRcaPresent":
            has_preliminary,

        "diagnosticLanguagePresent":
            has_diagnostic,

        "groundTruthCandidate":
            candidate,

        "sourceTextCount":
            len(texts),

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

    return scored[0][1]


def _historical_update_facts(
    incident: Mapping[str, Any],
) -> list[Dict[str, Any]]:
    result = []

    for raw in (
        incident.get("updates")
        or []
    ):
        if not isinstance(
            raw,
            Mapping,
        ):
            continue

        text = str(
            raw.get("text")
            or ""
        )

        result.append({
            "when":
                _normalize_string(
                    raw.get("when")
                    or raw.get("created")
                ),

            "status":
                _normalize_string(
                    raw.get("status")
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
            item["sourceTextSha256"],
        )
    )

    return result


def _base_safety_fields() -> Dict[str, Any]:
    return {
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
    }


def normalize_google_cloud_public_incident(
    incident: Mapping[str, Any],
    *,
    sequence: int,
) -> Dict[str, Any] | None:
    incident_id = (
        _normalize_string(
            incident.get("id")
        )
    )

    begin = (
        _normalize_string(
            incident.get("begin")
        )
    )

    end = (
        _normalize_string(
            incident.get("end")
        )
    )

    begin_time = (
        _parse_time(begin)
    )

    end_time = (
        _parse_time(end)
    )

    if (
        not incident_id
        or not begin
        or not end
        or begin_time is None
        or end_time is None
        or end_time <= begin_time
    ):
        return None

    products = (
        _affected_products(
            incident
        )
    )

    if not products:
        service_name = (
            _normalize_string(
                incident.get(
                    "service_name"
                )
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

    evaluation = (
        _evaluation_evidence(
            incident
        )
    )

    external_description = (
        _normalize_string(
            incident.get(
                "external_desc"
            )
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

    return {
        "acquisitionVersion":
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "recordKind":
            "RECENT_STRUCTURED_INCIDENT",

        "incidentId":
            incident_id,

        "incidentDigest":
            _sha256_bytes(
                _stable_json_bytes(
                    identity
                )
            ),

        "sourceUri":
            _source_uri(
                incident
            ),

        "begin":
            begin,

        "end":
            end,

        "durationSeconds":
            int(
                (
                    end_time
                    -
                    begin_time
                ).total_seconds()
            ),

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

        **_base_safety_fields(),

        "seed":
            670000
            +
            sequence,
    }


def normalize_google_cloud_public_incidents(
    incidents: Iterable[
        Mapping[
            str,
            Any,
        ]
    ],
    *,
    required_count: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,
) -> list[Dict[str, Any]]:
    count = (
        _require_positive_int(
            required_count,
            "required_count",
        )
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

    result = []
    seen = set()

    for record in candidates:
        if (
            record["incidentId"]
            in seen
        ):
            continue

        seen.add(
            record["incidentId"]
        )

        result.append(
            record
        )

        if len(result) >= count:
            break

    if len(result) < count:
        raise RuntimeError(
            "Google Cloud public incident feed "
            "did not contain enough usable closed "
            f"incidents: {len(result)} < {count}"
        )

    for (
        index,
        record,
    ) in enumerate(
        result,
        start=1,
    ):
        record["seed"] = (
            670000
            +
            index
        )

    return result


def _history_reference_record(
    reference: Mapping[str, Any],
    *,
    sequence: int,
) -> Dict[str, Any]:
    incident_id = (
        _normalize_string(
            reference.get(
                "incidentId"
            )
        )
    )

    summary = (
        _normalize_string(
            reference.get(
                "historySummary"
            )
        )
    )

    product_id = (
        _normalize_string(
            reference.get(
                "discoveredViaProductId"
            )
        )
    )

    product_title = (
        _normalize_string(
            reference.get(
                "discoveredViaProductTitle"
            )
        )
    )

    identity = {
        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "incidentId":
            incident_id,

        "historyDate":
            _normalize_string(
                reference.get(
                    "historyDate"
                )
            ),
    }

    return {
        "acquisitionVersion":
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "recordKind":
            "HISTORY_REFERENCE",

        "incidentId":
            incident_id,

        "incidentDigest":
            _sha256_bytes(
                _stable_json_bytes(
                    identity
                )
            ),

        "sourceUri":
            _normalize_string(
                reference.get(
                    "sourceUri"
                )
            ),

        "historyDate":
            _normalize_string(
                reference.get(
                    "historyDate"
                )
            ),

        "historyDurationSeconds":
            reference.get(
                "historyDurationSeconds"
            ),

        "historySummarySha256":
            _sha256_text(
                summary
            ),

        "historySummaryByteSize":
            len(
                summary.encode(
                    "utf-8"
                )
            ),

        "affectedProducts": [
            {
                "id":
                    product_id,

                "title":
                    product_title,
            }
        ],

        "affectedLocations":
            [],

        "historicalUpdateFacts":
            [],

        "failureFamily":
            "UNCLASSIFIED_PUBLIC_INCIDENT",

        "evaluationEvidence": {
            "quality":
                "STATUS_FACTS_ONLY",

            "explicitRootCause":
                False,

            "incidentReportPresent":
                False,

            "preliminaryRcaPresent":
                False,

            "diagnosticLanguagePresent":
                False,

            "groundTruthCandidate":
                False,

            "sourceTextCount":
                0,

            "combinedSourceTextSha256":
                _sha256_text(
                    ""
                ),

            "combinedSourceTextByteSize":
                0,
        },

        **_base_safety_fields(),

        "seed":
            670000
            +
            sequence,
    }


def _merge_recent_into_reference(
    reference: Mapping[str, Any],
    recent: Mapping[str, Any],
    *,
    sequence: int,
) -> Dict[str, Any]:
    merged = dict(
        recent
    )

    discovered = {
        "id":
            _normalize_string(
                reference.get(
                    "discoveredViaProductId"
                )
            ),

        "title":
            _normalize_string(
                reference.get(
                    "discoveredViaProductTitle"
                )
            ),
    }

    products = list(
        merged.get(
            "affectedProducts"
        )
        or []
    )

    if discovered not in products:
        products.append(
            discovered
        )

        products.sort(
            key=lambda item: (
                item.get(
                    "id",
                    "",
                ),
                item.get(
                    "title",
                    "",
                ),
            )
        )

    merged[
        "affectedProducts"
    ] = products

    merged[
        "historyReference"
    ] = {
        "historyDate":
            _normalize_string(
                reference.get(
                    "historyDate"
                )
            ),

        "historyDurationSeconds":
            reference.get(
                "historyDurationSeconds"
            ),

        "discoveredViaProductId":
            discovered["id"],

        "discoveredViaProductTitle":
            discovered["title"],
    }

    merged["seed"] = (
        670000
        +
        sequence
    )

    return merged


def _request(
    url: str,
    *,
    accept: str,
    timeout_seconds: int,
) -> bytes:
    request = (
        urllib.request.Request(
            url,
            headers={
                "User-Agent":
                    (
                        "AIRA-Phase23R/"
                        +
                        GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION
                    ),

                "Accept":
                    accept,

                "Connection":
                    "close",
            },
            method="GET",
        )
    )

    with urllib.request.urlopen(
        request,
        timeout=
            timeout_seconds,
    ) as response:
        return response.read()


def _fetch_json(
    url: str,
    *,
    timeout_seconds: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    return json.loads(
        _request(
            url,
            accept=
                "application/json",
            timeout_seconds=
                timeout_seconds,
        ).decode(
            "utf-8"
        )
    )


def _fetch_text(
    url: str,
    *,
    timeout_seconds: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_TIMEOUT_SECONDS,
) -> str:
    return (
        _request(
            url,
            accept=
                (
                    "text/html,"
                    "application/xhtml+xml"
                ),
            timeout_seconds=
                timeout_seconds,
        )
        .decode(
            "utf-8",
            errors="replace",
        )
    )


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
            payload = (
                _stable_json_bytes(
                    record
                )
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
            str(path),

        "recordCount":
            len(records),

        "byteSize":
            byte_size,

        "sha256":
            hasher.hexdigest(),
    }


def _safe_fetch_history(
    product: Mapping[str, str],
    text_fetcher: Callable[
        [str],
        str,
    ],
) -> tuple[
    str,
    list[Dict[str, Any]],
    str | None,
]:
    product_id = (
        product["id"]
    )

    url = (
        f"{GOOGLE_CLOUD_STATUS_BASE_URL}"
        f"/products/{product_id}/history"
    )

    try:
        page = text_fetcher(
            url
        )

        incidents = (
            _history_incidents(
                page,
                product_id=
                    product_id,
                product_title=
                    product.get(
                        "title",
                        "",
                    ),
            )
        )

        return (
            product_id,
            incidents,
            None,
        )

    except (
        TimeoutError,
        socket.timeout,
        urllib.error.URLError,
        urllib.error.HTTPError,
        ConnectionError,
        OSError,
    ) as exc:
        return (
            product_id,
            [],
            (
                f"{type(exc).__name__}: "
                f"{_normalize_string(exc)}"
            ),
        )

    except Exception as exc:
        # Provider/parser isolation. The exact
        # failure is recorded in the manifest.
        return (
            product_id,
            [],
            (
                f"{type(exc).__name__}: "
                f"{_normalize_string(exc)}"
            ),
        )


def acquire_google_cloud_public_incidents(
    *,
    data_root: str | Path,

    required_count: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_COUNT,

    max_products: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_MAX_PRODUCTS,

    json_fetcher: (
        Callable[
            [str],
            Any,
        ]
        |
        None
    ) = None,

    text_fetcher: (
        Callable[
            [str],
            str,
        ]
        |
        None
    ) = None,

    fetcher: (
        Callable[
            [str],
            Any,
        ]
        |
        None
    ) = None,

    workers: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_WORKERS,

    request_timeout_seconds: int =
        GOOGLE_CLOUD_PUBLIC_INCIDENT_DEFAULT_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    count = (
        _require_positive_int(
            required_count,
            "required_count",
        )
    )

    product_limit = (
        _require_positive_int(
            max_products,
            "max_products",
        )
    )

    worker_count = min(
        _require_positive_int(
            workers,
            "workers",
        ),
        32,
    )

    timeout_seconds = (
        _require_positive_int(
            request_timeout_seconds,
            "request_timeout_seconds",
        )
    )

    if json_fetcher is None:

        def fetch_json(
            url: str,
        ) -> Any:
            return _fetch_json(
                url,
                timeout_seconds=
                    timeout_seconds,
            )

    else:
        fetch_json = (
            json_fetcher
        )

    # Backward-compatible alias used by the
    # earlier acquisition tests/contracts.
    if (
        fetcher is not None
        and json_fetcher is None
    ):
        fetch_json = fetcher

    if text_fetcher is None:

        def fetch_text(
            url: str,
        ) -> str:
            return _fetch_text(
                url,
                timeout_seconds=
                    timeout_seconds,
            )

    else:
        fetch_text = (
            text_fetcher
        )

    products = (
        _product_entries(
            fetch_json(
                GOOGLE_CLOUD_STATUS_PRODUCTS_URL
            )
        )
    )

    if not products:
        raise RuntimeError(
            "Google Cloud product catalog "
            "contained no usable products"
        )

    #
    # incidents.json is optional enrichment.
    # Failure here must not invalidate the
    # historical discovery path.
    #
    try:
        recent_payload = (
            fetch_json(
                GOOGLE_CLOUD_STATUS_HISTORY_URL
            )
        )

    except Exception:
        recent_payload = []

    if not isinstance(
        recent_payload,
        list,
    ):
        recent_payload = []

    recent_by_id: Dict[
        str,
        Dict[
            str,
            Any,
        ],
    ] = {}

    priority_product_ids: set[
        str
    ] = set()

    for raw in recent_payload:
        if not isinstance(
            raw,
            Mapping,
        ):
            continue

        normalized = (
            normalize_google_cloud_public_incident(
                raw,
                sequence=1,
            )
        )

        if normalized is None:
            continue

        recent_by_id[
            normalized[
                "incidentId"
            ]
        ] = normalized

        priority_product_ids.update(
            product.get(
                "id",
                "",
            )

            for product
            in normalized.get(
                "affectedProducts",
                [],
            )

            if product.get(
                "id"
            )
        )

    #
    # Products seen in current structured history
    # are scanned first, then deterministic ID order.
    #
    products.sort(
        key=lambda product: (
            (
                0
                if product["id"]
                in priority_product_ids
                else 1
            ),
            product["id"],
            product["title"],
        )
    )

    products = (
        products[
            :product_limit
        ]
    )

    references: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    seen_incidents: set[
        str
    ] = set()

    products_scanned = 0
    products_failed = 0

    product_failures: list[
        Dict[
            str,
            str,
        ]
    ] = []

    #
    # Concurrent bounded batches prevent a slow
    # Google history page from blocking all other
    # products.
    #
    for batch_start in range(
        0,
        len(products),
        GOOGLE_CLOUD_PUBLIC_INCIDENT_BATCH_SIZE,
    ):
        batch = products[
            batch_start:
            (
                batch_start
                +
                GOOGLE_CLOUD_PUBLIC_INCIDENT_BATCH_SIZE
            )
        ]

        by_product: Dict[
            str,
            tuple[
                list[
                    Dict[
                        str,
                        Any,
                    ]
                ],
                str | None,
            ],
        ] = {}

        with ThreadPoolExecutor(
            max_workers=
                min(
                    worker_count,
                    len(batch),
                )
        ) as pool:
            futures = {
                pool.submit(
                    _safe_fetch_history,
                    product,
                    fetch_text,
                ):
                    product

                for product
                in batch
            }

            for future in (
                as_completed(
                    futures
                )
            ):
                (
                    product_id,
                    incidents,
                    error,
                ) = (
                    future.result()
                )

                by_product[
                    product_id
                ] = (
                    incidents,
                    error,
                )

        #
        # Deterministic processing in product order,
        # not worker completion order.
        #
        for product in batch:
            products_scanned += 1

            (
                incidents,
                error,
            ) = (
                by_product.get(
                    product["id"],
                    (
                        [],
                        "missing worker result",
                    ),
                )
            )

            if error:
                products_failed += 1

                if (
                    len(
                        product_failures
                    )
                    < 25
                ):
                    product_failures.append({
                        "productId":
                            product["id"],

                        "error":
                            error,
                    })

                continue

            for reference in incidents:
                incident_id = (
                    reference[
                        "incidentId"
                    ]
                )

                if (
                    incident_id
                    in seen_incidents
                ):
                    continue

                seen_incidents.add(
                    incident_id
                )

                references.append(
                    reference
                )

                if (
                    len(references)
                    >= count
                ):
                    break

            if (
                len(references)
                >= count
            ):
                break

        if (
            len(references)
            >= count
        ):
            break

    if len(references) < count:
        raise RuntimeError(
            "Google Cloud product history did not "
            "contain enough unique historical incidents: "
            f"{len(references)} < {count} after scanning "
            f"{products_scanned} products "
            f"({products_failed} product fetches failed)."
        )

    records = []

    recent_structured_count = 0
    history_reference_count = 0
    ground_truth_candidate_count = 0

    for (
        sequence,
        reference,
    ) in enumerate(
        references[:count],
        start=1,
    ):
        recent = (
            recent_by_id.get(
                reference[
                    "incidentId"
                ]
            )
        )

        if recent is not None:
            record = (
                _merge_recent_into_reference(
                    reference,
                    recent,
                    sequence=
                        sequence,
                )
            )

            recent_structured_count += 1

        else:
            record = (
                _history_reference_record(
                    reference,
                    sequence=
                        sequence,
                )
            )

            history_reference_count += 1

        if (
            record[
                "evaluationEvidence"
            ][
                "groundTruthCandidate"
            ]
        ):
            ground_truth_candidate_count += 1

        records.append(
            record
        )

    root = (
        Path(
            data_root
        )
        .expanduser()
        .resolve()
    )

    output = (
        _write_jsonl(
            root
            /
            GOOGLE_CLOUD_PUBLIC_INCIDENT_OUTPUT_RELATIVE,
            records,
        )
    )

    manifest_core = {
        "version":
            GOOGLE_CLOUD_PUBLIC_INCIDENT_ACQUISITION_VERSION,

        "sourceId":
            GOOGLE_CLOUD_STATUS_SOURCE_ID,

        "sourceHistoryUrl":
            GOOGLE_CLOUD_STATUS_HISTORY_URL,

        "sourceSchemaUrl":
            GOOGLE_CLOUD_STATUS_SCHEMA_URL,

        "sourceProductsUrl":
            GOOGLE_CLOUD_STATUS_PRODUCTS_URL,

        "sourceProductsSchemaUrl":
            GOOGLE_CLOUD_STATUS_PRODUCTS_SCHEMA_URL,

        "historyDiscoveryTemplate":
            (
                f"{GOOGLE_CLOUD_STATUS_BASE_URL}"
                "/products/<product-id>/history"
            ),

        "requestedCount":
            count,

        "caseCount":
            len(records),

        "uniqueIncidentCount":
            len({
                record[
                    "incidentId"
                ]
                for record
                in records
            }),

        "productsAvailable":
            len(products),

        "productsScanned":
            products_scanned,

        "productsFailed":
            products_failed,

        "productFailures":
            product_failures,

        "workers":
            worker_count,

        "requestTimeoutSeconds":
            timeout_seconds,

        "historyReferenceCaseCount":
            history_reference_count,

        "recentStructuredCaseCount":
            recent_structured_count,

        "groundTruthCandidateCount":
            ground_truth_candidate_count,

        "groundTruthPendingEnrichmentCount":
            (
                len(records)
                -
                ground_truth_candidate_count
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