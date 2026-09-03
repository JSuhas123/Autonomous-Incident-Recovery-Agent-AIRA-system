"""Phase 23R.13S.5D.3/5D.4 Wikimedia production incident corpus.

Acquires real Wikimedia/Wikitech incident reports from the MediaWiki API and
constructs policy-approved public production reconstruction inputs.

Important boundaries:

PUBLIC INCIDENT REPORT != EXECUTION AUTHORITY.
POSTMORTEM GROUND TRUTH != AGENT-VISIBLE EVIDENCE.
DERIVED CLASSIFICATION != FABRICATED ROOT CAUSE.
CC-BY-SA CONTENT MUST RETAIN ATTRIBUTION / SHARE-ALIKE METADATA.

Only text explicitly present in the source incident report may become sealed
ground truth. Timeline entries are reconstructed as historically observable
operational evidence while root-cause/conclusion material stays sealed.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import urllib.parse
import urllib.request
import random
import time
import urllib.error
from pathlib import Path
from typing import Any
from typing import Dict
from typing import Iterable
from typing import Mapping
from typing import Sequence


WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION = (
    "23R.13S.5D.3-4.0"
)

WIKIMEDIA_SOURCE_ID = (
    "WIKIMEDIA_WIKITECH_INCIDENTS"
)

WIKIMEDIA_SOURCE_NAME = (
    "Wikimedia Wikitech Incident Documentation"
)

WIKIMEDIA_API_URL = (
    "https://wikitech.wikimedia.org/w/api.php"
)

WIKIMEDIA_BASE_URL = (
    "https://wikitech.wikimedia.org/wiki/"
)

WIKIMEDIA_CATEGORY = (
    "Category:Incident documentation"
)

WIKIMEDIA_LICENSE = (
    "CC-BY-SA-4.0"
)

WIKIMEDIA_LICENSE_URL = (
    "https://creativecommons.org/licenses/by-sa/4.0/"
)

WIKIMEDIA_TERMS_URL = (
    "https://foundation.wikimedia.org/wiki/Terms_of_Use"
)

WIKIMEDIA_DEFAULT_COUNT = 100

WIKIMEDIA_DEFAULT_MAX_PAGES = 400

WIKIMEDIA_OUTPUT_RELATIVE = (
    "staging/prepared/public-incidents/"
    "wikimedia-wikitech-production-reconstructions.jsonl"
)

WIKIMEDIA_MANIFEST_RELATIVE = (
    "manifests/"
    "phase23r13-wikimedia-public-incident-reconstruction-manifest.json"
)


_HEADING_RE = re.compile(
    r"(?m)^(={2,6})\s*(.*?)\s*\1\s*$"
)

_TEMPLATE_RE = re.compile(
    r"\{\{[^{}]*\}\}",
    re.DOTALL,
)

_REF_RE = re.compile(
    r"<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>",
    re.I | re.DOTALL,
)

_TAG_RE = re.compile(
    r"<[^>]+>"
)

_LINK_RE = re.compile(
    r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]"
)

_EXTERNAL_LINK_RE = re.compile(
    r"\[(https?://\S+)(?:\s+([^\]]+))?\]"
)

_DATE_TITLE_RE = re.compile(
    r"^(?:Incidents/)?(?:"
    r"\d{4}[-_/]\d{2}[-_/]\d{2}"
    r"|"
    r"\d{8}"
    r")",
    re.I,
)

_CAUSE_MARKERS = (
    "root cause",
    "caused by",
    "due to",
    "because",
    "triggered by",
    "result of",
    "resulted from",
    "failure of",
    "misconfiguration",
)

_ROOT_CAUSE_HEADINGS = (
    "root cause",
    "root causes",
    "cause",
    "causes",
    "conclusion",
    "conclusions",
    "analysis",
    "what happened",
    "incident analysis",
)

_TIMELINE_HEADINGS = (
    "timeline",
    "incident timeline",
    "detailed timeline",
)

_SUMMARY_HEADINGS = (
    "summary",
    "incident summary",
)

_RESOLUTION_HEADINGS = (
    "resolution",
    "recovery",
    "remediation",
    "mitigation",
    "conclusions",
    "conclusion",
    "actionables",
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
        +
        "\n"
    ).encode(
        "utf-8"
    )


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
            value
            or ""
        ).encode(
            "utf-8"
        )
    )


def _sha256_file(
    path: Path,
) -> str:
    hasher = hashlib.sha256()

    with path.open(
        "rb"
    ) as handle:
        while True:
            chunk = handle.read(
                1024 * 1024
            )

            if not chunk:
                break

            hasher.update(
                chunk
            )

    return hasher.hexdigest()


def _normalize(
    value: Any,
) -> str:
    return " ".join(
        str(
            value
            or ""
        ).split()
    )


def _page_url(
    title: str,
) -> str:
    return (
        WIKIMEDIA_BASE_URL
        +
        urllib.parse.quote(
            title.replace(
                " ",
                "_",
            ),
            safe="/():_-",
        )
    )


def _post_json(
    params: Mapping[
        str,
        Any,
    ],
    *,
    timeout_seconds: int = 30,
    maximum_attempts: int = 8,
) -> Any:
    """Call the Wikitech MediaWiki API with bounded retry/backoff.

    Wikimedia may return HTTP 429 or 503 when anonymous API clients exceed
    temporary limits or when backend load is high.

    This function:
    - performs requests serially;
    - supplies maxlag for non-interactive work;
    - respects Retry-After;
    - falls back to exponential backoff;
    - retries transient 429/503/502/504 failures only;
    - never retries permanent HTTP errors indefinitely.
    """

    if (
        not isinstance(
            maximum_attempts,
            int,
        )
        or maximum_attempts < 1
    ):
        raise ValueError(
            "maximum_attempts must be a positive integer"
        )

    request_params = dict(
        params
    )

    #
    # Official MediaWiki guidance recommends
    # maxlag for non-interactive/batch jobs.
    #
    request_params.setdefault(
        "maxlag",
        5,
    )

    request_params.setdefault(
        "errorformat",
        "plaintext",
    )

    payload = urllib.parse.urlencode(
        {
            key:
                str(value)

            for (
                key,
                value,
            )
            in request_params.items()
        }
    ).encode(
        "utf-8"
    )

    last_error: Exception | None = None

    for attempt in range(
        1,
        maximum_attempts + 1,
    ):
        request = urllib.request.Request(
            WIKIMEDIA_API_URL,
            data=payload,
            headers={
                "User-Agent":
                    (
                        "AIRA-Phase23R/"
                        +
                        WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION
                        +
                        " public-incident-corpus"
                    ),

                "Api-User-Agent":
                    (
                        "AIRA-Phase23R/"
                        +
                        WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION
                    ),

                "Accept":
                    "application/json",

                "Content-Type":
                    (
                        "application/"
                        "x-www-form-urlencoded"
                    ),

                "Connection":
                    "close",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=
                    timeout_seconds,
            ) as response:
                raw = response.read()

            result = json.loads(
                raw.decode(
                    "utf-8"
                )
            )

            #
            # MediaWiki maxlag normally returns
            # JSON rather than a non-2xx response.
            #
            if isinstance(
                result,
                Mapping,
            ):
                error = result.get(
                    "error"
                )

                if isinstance(
                    error,
                    Mapping,
                ):
                    code = str(
                        error.get(
                            "code"
                        )
                        or
                        ""
                    ).lower()

                    if code == "maxlag":
                        if (
                            attempt
                            >=
                            maximum_attempts
                        ):
                            raise RuntimeError(
                                (
                                    "Wikimedia API remained "
                                    "maxlag-limited after "
                                    f"{maximum_attempts} attempts"
                                )
                            )

                        wait_seconds = min(
                            60.0,
                            (
                                2.0
                                *
                                (
                                    2
                                    **
                                    (
                                        attempt
                                        -
                                        1
                                    )
                                )
                            )
                            +
                            random.uniform(
                                0.25,
                                1.25,
                            ),
                        )

                        time.sleep(
                            wait_seconds
                        )

                        continue

                    raise RuntimeError(
                        (
                            "Wikimedia API returned error "
                            f"{code or 'UNKNOWN'}: "
                            f"{error.get('info') or error}"
                        )
                    )

            #
            # Be polite even after successful calls.
            # This corpus acquisition is offline;
            # speed is less important than completing
            # without triggering another rate limit.
            #
            time.sleep(
                0.75
            )

            return result

        except urllib.error.HTTPError as exc:
            last_error = exc

            if (
                exc.code
                not in {
                    429,
                    502,
                    503,
                    504,
                }
            ):
                raise

            if (
                attempt
                >=
                maximum_attempts
            ):
                raise RuntimeError(
                    (
                        "Wikimedia API remained unavailable "
                        "after bounded retries: "
                        f"HTTP {exc.code}, "
                        f"attempts={maximum_attempts}"
                    )
                ) from exc

            retry_after = None

            try:
                raw_retry_after = (
                    exc.headers.get(
                        "Retry-After"
                    )
                )

                if raw_retry_after:
                    retry_after = float(
                        raw_retry_after
                    )

            except (
                TypeError,
                ValueError,
            ):
                retry_after = None

            if retry_after is not None:
                wait_seconds = max(
                    1.0,
                    min(
                        retry_after,
                        120.0,
                    ),
                )

            else:
                #
                # Wikimedia explicitly recommends
                # exponential backoff when Retry-After
                # is unavailable.
                #
                wait_seconds = min(
                    60.0,
                    (
                        5.0
                        *
                        (
                            2
                            **
                            (
                                attempt
                                -
                                1
                            )
                        )
                    )
                    +
                    random.uniform(
                        0.5,
                        2.0,
                    ),
                )

            print(
                (
                    "[Phase23R Wikimedia] "
                    f"HTTP {exc.code}; "
                    f"attempt {attempt}/"
                    f"{maximum_attempts}; "
                    f"waiting {wait_seconds:.1f}s "
                    "before retry"
                )
            )

            time.sleep(
                wait_seconds
            )

        except (
            TimeoutError,
            urllib.error.URLError,
            ConnectionError,
            OSError,
        ) as exc:
            last_error = exc

            if (
                attempt
                >=
                maximum_attempts
            ):
                raise RuntimeError(
                    (
                        "Wikimedia API network request "
                        "failed after bounded retries: "
                        f"{type(exc).__name__}: {exc}"
                    )
                ) from exc

            wait_seconds = min(
                30.0,
                (
                    2.0
                    *
                    (
                        2
                        **
                        (
                            attempt
                            -
                            1
                        )
                    )
                )
                +
                random.uniform(
                    0.25,
                    1.0,
                ),
            )

            print(
                (
                    "[Phase23R Wikimedia] "
                    f"{type(exc).__name__}; "
                    f"attempt {attempt}/"
                    f"{maximum_attempts}; "
                    f"waiting {wait_seconds:.1f}s "
                    "before retry"
                )
            )

            time.sleep(
                wait_seconds
            )

    raise RuntimeError(
        (
            "Wikimedia API acquisition failed "
            "without a usable response"
        )
    ) from last_error

def _clean_wikitext(
    value: str,
) -> str:
    text = str(
        value
        or ""
    )

    text = _REF_RE.sub(
        " ",
        text,
    )

    for _ in range(
        8
    ):
        updated = _TEMPLATE_RE.sub(
            " ",
            text,
        )

        if updated == text:
            break

        text = updated

    text = _LINK_RE.sub(
        lambda match:
            match.group(1),
        text,
    )

    text = _EXTERNAL_LINK_RE.sub(
        lambda match:
            (
                match.group(2)
                or
                match.group(1)
            ),
        text,
    )

    text = _TAG_RE.sub(
        " ",
        text,
    )

    text = html.unescape(
        text
    )

    text = re.sub(
        r"'{2,5}",
        "",
        text,
    )

    text = re.sub(
        r"(?m)^[*#:;]+\s*",
        "",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def _split_sections(
    wikitext: str,
) -> Dict[
    str,
    str,
]:
    matches = list(
        _HEADING_RE.finditer(
            wikitext
        )
    )

    result: Dict[
        str,
        str,
    ] = {}

    for (
        index,
        match,
    ) in enumerate(
        matches
    ):
        heading = _normalize(
            match.group(2)
        ).lower()

        start = match.end()

        end = (
            matches[
                index + 1
            ].start()
            if (
                index + 1
                <
                len(matches)
            )
            else
            len(wikitext)
        )

        body = (
            wikitext[
                start:end
            ]
            .strip()
        )

        if (
            heading
            and body
            and heading not in result
        ):
            result[
                heading
            ] = body

    return result


def _first_section(
    sections: Mapping[
        str,
        str,
    ],
    names: Iterable[
        str
    ],
) -> str:
    for name in names:
        body = sections.get(
            name
        )

        if body:
            return body

    return ""

def _preamble_text(
    wikitext: str,
) -> str:
    """Return content before the first section heading."""

    match = _HEADING_RE.search(
        str(
            wikitext
            or ""
        )
    )

    if match:
        return str(
            wikitext
            or ""
        )[
            :match.start()
        ].strip()

    return str(
        wikitext
        or ""
    ).strip()


def _looks_like_template_placeholder(
    value: str,
) -> bool:
    lowered = _normalize(
        value
    ).lower()

    if not lowered:
        return True

    placeholders = (
        "write a step by step",
        "write how the issue",
        "write what happened",
        "summary of what happened",
        "what happened, in one paragraph",
        "avoid assuming deep knowledge",
        "who was affected and how",
        "todo:",
        "(todo)",
        "something something",
        "(voila)",
        "incident summary here",
        "replace this text",
        "example",
    )

    return any(
        marker in lowered
        for marker
        in placeholders
    )


def _causal_sentence(
    value: str,
) -> str:
    """Find an explicit source-backed causal statement.

    This function does not infer a cause. It only returns a sentence
    containing explicit causal language already present in the report.
    """

    cleaned = _clean_wikitext(
        value
    )

    if not cleaned:
        return ""

    sentences = re.split(
        r"(?<=[.!?])\s+",
        cleaned,
    )

    for sentence in sentences:
        candidate = _normalize(
            sentence
        )

        if (
            len(candidate) < 15
            or
            _looks_like_template_placeholder(
                candidate
            )
        ):
            continue

        lowered = candidate.lower()

        if any(
            marker in lowered
            for marker
            in (
                "root cause",
                "caused by",
                "cause was",
                "cause is",
                "due to",
                "because of",
                "because ",
                "triggered by",
                "resulted from",
                "result of",
                "responsible for",
                "failure was",
                "failed because",
            )
        ):
            return candidate[
                :900
            ]

    return ""

def _timeline_lines(
    section: str,
) -> list[str]:
    raw_lines = str(
        section
        or ""
    ).splitlines()

    values = []

    for raw in raw_lines:
        stripped = raw.strip()

        if not stripped:
            continue

        if not (
            stripped.startswith("*")
            or stripped.startswith("#")
            or re.match(
                r"^\d{1,2}[:.]\d{2}",
                stripped,
            )
            or re.match(
                r"^\d{4}[-/]\d{2}[-/]\d{2}",
                stripped,
            )
        ):
            continue

        cleaned = _clean_wikitext(
            stripped
        )

        if len(cleaned) < 8:
            continue

        values.append(
            cleaned
        )

    return values


def _first_sentence(
    value: str,
    *,
    maximum: int = 700,
) -> str:
    cleaned = _clean_wikitext(
        value
    )

    if not cleaned:
        return ""

    match = re.search(
        r"^(.{10,}?[.!?])(?:\s|$)",
        cleaned,
    )

    result = (
        match.group(1)
        if match
        else cleaned
    )

    return result[
        :maximum
    ].strip()


def _extract_ground_truth(
    sections: Mapping[
        str,
        str,
    ],
    *,
    wikitext: str = "",
) -> tuple[
    str,
    str,
]:
    """Extract explicit source-backed ground truth.

    Precedence:

    1. dedicated root-cause/cause section;
    2. causal statement in summary;
    3. causal statement in report preamble;
    4. causal statement in conclusions/analysis;
    5. explicit causal timeline statement as last resort.

    No cause is inferred from symptoms, service names, recovery operations,
    or domain classification.
    """

    #
    # 1. Strongest source: explicitly named
    # root-cause/cause sections.
    #
    strong_headings = (
        "root cause",
        "root causes",
        "root cause analysis",
        "cause",
        "causes",
    )

    for heading in strong_headings:
        body = sections.get(
            heading
        )

        if not body:
            continue

        candidate = _first_sentence(
            body,
            maximum=900,
        )

        if (
            candidate
            and
            not _looks_like_template_placeholder(
                candidate
            )
        ):
            return (
                candidate,
                heading,
            )

    #
    # 2. Summary.
    #
    summary = _first_section(
        sections,
        _SUMMARY_HEADINGS,
    )

    candidate = _causal_sentence(
        summary
    )

    if candidate:
        return (
            candidate,
            "summary",
        )

    #
    # 3. Introductory prose before the first
    # heading.
    #
    # Many real Wikimedia incident documents
    # state the cause here.
    #
    preamble = _preamble_text(
        wikitext
    )

    candidate = _causal_sentence(
        preamble
    )

    if candidate:
        return (
            candidate,
            "preamble",
        )

    #
    # 4. Conclusions / analysis.
    #
    for heading in (
        "conclusion",
        "conclusions",
        "analysis",
        "incident analysis",
        "technical analysis",
        "technical details",
        "what happened",
        "description",
        "overview",
    ):
        body = sections.get(
            heading
        )

        if not body:
            continue

        candidate = _causal_sentence(
            body
        )

        if candidate:
            return (
                candidate,
                heading,
            )

    #
    # 5. Last-resort explicit causal statement
    # from the timeline itself.
    #
    # This is still source-backed. The matching
    # causal timeline entry is removed from the
    # agent-visible Evidence Channel below.
    #
    timeline_body = _first_section(
        sections,
        _TIMELINE_HEADINGS,
    )

    candidate = _causal_sentence(
        timeline_body
    )

    if candidate:
        return (
            candidate,
            "timeline",
        )

    return (
        "",
        "",
    )

def _recovery_family(
    sections: Mapping[
        str,
        str,
    ],
) -> str:
    """Classify the source-backed recovery action.

    Recovery evidence may appear in an explicit remediation/resolution
    section OR in the incident timeline itself. Prefer concrete recovery
    actions such as rollback/failover/restart over broader failure-domain
    descriptions such as configuration or database.
    """

    relevant_headings = (
        *_TIMELINE_HEADINGS,
        *_RESOLUTION_HEADINGS,
    )

    text = " ".join(
        _clean_wikitext(
            sections.get(
                heading,
                "",
            )
        )
        for heading
        in relevant_headings
    ).lower()

    #
    # Concrete recovery operations have precedence.
    #
    # Example:
    # "configuration was reverted"
    #
    # must classify as ROLLBACK_OR_REVERT rather
    # than generic CONFIGURATION_REMEDIATION.
    #
    if any(
        marker in text
        for marker
        in (
            "rollback",
            "rolled back",
            "roll back",
            "revert",
            "reverted",
            "undo the change",
            "undid the change",
        )
    ):
        return "ROLLBACK_OR_REVERT"

    if any(
        marker in text
        for marker
        in (
            "failover",
            "failed over",
            "fail over",
            "switchover",
            "switched over",
            "traffic shifted",
            "shifted traffic",
        )
    ):
        return "FAILOVER_OR_SWITCHOVER"

    if any(
        marker in text
        for marker
        in (
            "restart",
            "restarted",
            "restarting",
            "reboot",
            "rebooted",
            "recreate",
            "recreated",
        )
    ):
        return "RESTART_OR_RECREATE"

    if any(
        marker in text
        for marker
        in (
            "configuration",
            "config ",
            "config.",
            "configured",
            "reconfigure",
            "reconfigured",
            "puppet",
        )
    ):
        return "CONFIGURATION_REMEDIATION"

    if any(
        marker in text
        for marker
        in (
            "capacity",
            "scale up",
            "scaled up",
            "scale out",
            "scaled out",
            "add capacity",
            "added capacity",
        )
    ):
        return "CAPACITY_REMEDIATION"

    if any(
        marker in text
        for marker
        in (
            "database",
            "replica",
            "mysql",
            "mariadb",
            "postgres",
            "postgresql",
            "cassandra",
        )
    ):
        return "DATABASE_REMEDIATION"

    if any(
        marker in text
        for marker
        in (
            "network",
            "router",
            "switch",
            "routing",
            "dns",
        )
    ):
        return "NETWORK_REMEDIATION"

    return "INCIDENT_SPECIFIC_REMEDIATION"

def _incident_domain(
    title: str,
    sections: Mapping[
        str,
        str,
    ],
) -> str:
    text = (
        title
        +
        " "
        +
        " ".join(
            _clean_wikitext(
                value
            )
            for value
            in sections.values()
        )
    ).lower()

    mappings = (
        (
            "DNS",
            (
                "dns",
                "nameserver",
                "resolver",
            ),
        ),

        (
            "DATABASE",
            (
                "database",
                "mysql",
                "mariadb",
                "postgres",
                "replica",
                "cassandra",
            ),
        ),

        (
            "MESSAGING",
            (
                "kafka",
                "rabbitmq",
                "queue",
                "eventlogging",
            ),
        ),

        (
            "IDENTITY",
            (
                "oauth",
                "authentication",
                "login",
                "account creation",
            ),
        ),

        (
            "STORAGE",
            (
                "ceph",
                "swift",
                "storage",
                "filesystem",
                "nfs",
            ),
        ),

        (
            "CI_CD",
            (
                "jenkins",
                "zuul",
                "gerrit",
                "deployment",
                "deploy",
                "puppet",
            ),
        ),

        (
            "NETWORK",
            (
                "network",
                "router",
                "switch",
                "fiber",
                "packet",
            ),
        ),

        (
            "OBSERVABILITY",
            (
                "logstash",
                "logging",
                "monitoring",
                "alert",
                "grafana",
            ),
        ),

        (
            "KUBERNETES",
            (
                "kubernetes",
                "k8s",
                "kube",
            ),
        ),

        (
            "CDN",
            (
                "varnish",
                "cache",
                "cdn",
            ),
        ),

        (
            "SOURCE_CONTROL",
            (
                "git",
                "gerrit",
            ),
        ),
    )

    for (
        domain,
        terms,
    ) in mappings:
        if any(
            term in text
            for term
            in terms
        ):
            return domain

    return "CLOUD"


def _service_name(
    title: str,
) -> str:
    value = (
        title.split(
            "/"
        )[-1]
    )

    value = re.sub(
        r"^\d{4}[-_/]?\d{2}[-_/]?\d{2}[- _]*",
        "",
        value,
    )

    value = re.sub(
        r"^\d{8}[- _]*",
        "",
        value,
    )

    return (
        _normalize(
            value
        )
        or
        "wikimedia-production-service"
    )


def _source_policy() -> Dict[
    str,
    Any,
]:
    return {
        "sourceId":
            WIKIMEDIA_SOURCE_ID,

        "policyStatus":
            "APPROVED_COMMERCIAL",

        "licenseVerified":
            True,

        "license":
            WIKIMEDIA_LICENSE,

        "licenseUrl":
            WIKIMEDIA_LICENSE_URL,

        "termsUrl":
            WIKIMEDIA_TERMS_URL,

        "commercialUseAllowed":
            True,

        "redistributionAllowed":
            True,

        "attributionRequired":
            True,

        "shareAlikeRequired":
            True,

        "derivativeLicense":
            WIKIMEDIA_LICENSE,
    }


def _candidate_title(
    title: str,
) -> bool:
    normalized = _normalize(
        title
    )

    if not normalized:
        return False

    lowered = normalized.lower()

    if any(
        forbidden in lowered
        for forbidden
        in (
            "template",
            "meeting",
            "runbook",
            "training",
            "process improvement",
            "incident status",
            "scorecard",
        )
    ):
        return False

    return bool(
        _DATE_TITLE_RE.match(
            normalized
        )
    )


def _category_titles(
    *,
    maximum: int,
) -> list[str]:
    titles: list[str] = []

    continuation: str | None = None

    while (
        len(titles)
        <
        maximum
    ):
        params: Dict[
            str,
            Any,
        ] = {
            "action":
                "query",

            "format":
                "json",

            "formatversion":
                2,

            "list":
                "categorymembers",

            "cmtitle":
                WIKIMEDIA_CATEGORY,

            "cmnamespace":
                0,

            "cmtype":
                "page",

            "cmlimit":
                500,
        }

        if continuation:
            params[
                "cmcontinue"
            ] = continuation

        payload = _post_json(
            params
        )

        members = (
            payload
            .get(
                "query",
                {},
            )
            .get(
                "categorymembers",
                [],
            )
        )

        for member in members:
            if not isinstance(
                member,
                Mapping,
            ):
                continue

            title = _normalize(
                member.get(
                    "title"
                )
            )

            if not _candidate_title(
                title
            ):
                continue

            if title in titles:
                continue

            titles.append(
                title
            )

            if (
                len(titles)
                >= maximum
            ):
                break

        continuation = (
            payload
            .get(
                "continue",
                {},
            )
            .get(
                "cmcontinue"
            )
        )

        if not continuation:
            break

    return titles


def _fetch_pages(
    titles: Sequence[
        str
    ],
) -> list[
    Dict[
        str,
        Any,
    ]
]:
    result: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    batch_size = 50

    for start in range(
        0,
        len(titles),
        batch_size,
    ):
        batch = titles[
            start:
            start
            +
            batch_size
        ]

        payload = _post_json({
            "action":
                "query",

            "format":
                "json",

            "formatversion":
                2,

            "prop":
                "revisions",

            "rvprop":
                "ids|timestamp|content",

            "rvslots":
                "main",

            "redirects":
                1,

            "titles":
                "|".join(
                    batch
                ),
        })

        pages = (
            payload
            .get(
                "query",
                {},
            )
            .get(
                "pages",
                [],
            )
        )

        for page in pages:
            if (
                not isinstance(
                    page,
                    Mapping,
                )
                or page.get(
                    "missing"
                )
            ):
                continue

            revisions = (
                page.get(
                    "revisions"
                )
                or
                []
            )

            if not revisions:
                continue

            revision = (
                revisions[0]
            )

            slots = (
                revision.get(
                    "slots"
                )
                or
                {}
            )

            main = (
                slots.get(
                    "main"
                )
                or
                {}
            )

            content = (
                main.get(
                    "content"
                )
                or
                main.get(
                    "*"
                )
                or
                ""
            )

            if not str(
                content
            ).strip():
                continue

            result.append({
                "pageId":
                    page.get(
                        "pageid"
                    ),

                "title":
                    _normalize(
                        page.get(
                            "title"
                        )
                    ),

                "revisionId":
                    revision.get(
                        "revid"
                    ),

                "revisionTimestamp":
                    _normalize(
                        revision.get(
                            "timestamp"
                        )
                    ),

                "wikitext":
                    str(
                        content
                    ),
            })

    return result


def build_wikimedia_reconstruction_row(
    page: Mapping[
        str,
        Any,
    ],
    *,
    sequence: int,
) -> Dict[
    str,
    Any,
] | None:
    title = _normalize(
        page.get(
            "title"
        )
    )

    revision_id = page.get(
        "revisionId"
    )

    revision_timestamp = _normalize(
        page.get(
            "revisionTimestamp"
        )
    )

    wikitext = str(
        page.get(
            "wikitext"
        )
        or
        ""
    )

    if (
        not title
        or not wikitext
    ):
        return None

    sections = _split_sections(
        wikitext
    )

    timeline_section = _first_section(
        sections,
        _TIMELINE_HEADINGS,
    )

    timeline = _timeline_lines(
        timeline_section
    )

    if not timeline:
        return None

    (
        known_fault,
        ground_truth_section,
    ) = _extract_ground_truth(
        sections,
        wikitext=wikitext,
    )

    #
    # Fail closed.
    #
    # No explicit source-backed cause means
    # this incident cannot become E3.
    #
    if not known_fault:
        return None

    source_uri = _page_url(
        title
    )

    evidence: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    #
    # Timeline observations become replay-visible
    # evidence only when they do NOT themselves
    # disclose the sealed causal ground truth.
    #
    safe_timeline: list[str] = []

    for observation in timeline:
        causal_content = _causal_sentence(
            observation
        )

        if causal_content:
            continue

        if _looks_like_template_placeholder(
            observation
        ):
            continue

        safe_timeline.append(
            observation
        )

    #
    # E3 still requires visible evidence.
    #
    # If every timeline event was actually
    # postmortem/causal disclosure, reject
    # the reconstruction instead of leaking
    # evaluation-channel information.
    #
    if not safe_timeline:
        return None

    for (
        index,
        observation,
    ) in enumerate(
        safe_timeline[:16]
    ):
        evidence.append({
            "artifactId": (
                "timeline-"
                f"{sequence:04d}-"
                f"{index + 1:02d}"
            ),

            "kind":
                "LOG",

            "mediaType":
                "application/json",

            "historicallyAvailable":
                True,

            "releaseOffsetMs":
                index,

            "sourceReference":
                source_uri,

            "content": {
                "observation":
                    observation,

                "orderingSemantics": (
                    "RECONSTRUCTED_ORDER_ONLY_"
                    "NOT_WALL_CLOCK_DURATION"
                ),

                "sourceRevisionId":
                    revision_id,

                "sourceLicense":
                    WIKIMEDIA_LICENSE,
            },
        })

    service = _service_name(
        title
    )

    domain = _incident_domain(
        title,
        sections,
    )

    recovery_family = _recovery_family(
        sections
    )

    source_policy = _source_policy()

    incident_reference = str(
        revision_id
        or
        title
    )

    #
    # Preserve source-backed ground truth only
    # for the sealed evaluation channel.
    #
    expected_diagnosis = known_fault

    acceptable_diagnoses = [
        known_fault
    ]

    partition = (
        "HOLDOUT"
        if (
            sequence
            %
            5
            ==
            0
        )
        else
        "VALIDATION"
    )

    source_core = {
        "sourceId":
            WIKIMEDIA_SOURCE_ID,

        "pageId":
            page.get(
                "pageId"
            ),

        "revisionId":
            revision_id,

        "revisionTimestamp":
            revision_timestamp,

        "title":
            title,

        "sourceUri":
            source_uri,

        "license":
            WIKIMEDIA_LICENSE,
    }

    return {
        "version":
            WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION,

        "sourcePolicy":
            source_policy,

        "organizationId":
            "public-reconstruction",

        "environmentId":
            "historical-wikimedia",

        "sourceName":
            WIKIMEDIA_SOURCE_NAME,

        "sourceVersion": (
            revision_timestamp
            or
            str(
                revision_id
                or
                "unknown"
            )
        ),

        "sourceUri":
            source_uri,

        "incidentReference":
            incident_reference,

        "title":
            title,

        "workload": {
            "service":
                service,

            "provider":
                "WIKIMEDIA",

            "environment":
                "PRODUCTION",

            "incidentDomain":
                domain,
        },

        "evidence":
            evidence,

        "knownFault":
            known_fault,

        "expectedDiagnosis":
            expected_diagnosis,

        "acceptableDiagnoses":
            acceptable_diagnoses,

        "expectedRecoveryFamily":
            recovery_family,

        "groundTruthMethod": (
            "WIKIMEDIA_CC_BY_SA_"
            "PUBLIC_INCIDENT_REPORT_"
            f"{ground_truth_section.upper().replace(' ', '_')}"
        ),

        "incidentDomain":
            domain,

        "partition":
            partition,

        "seed":
            710000
            +
            sequence,

        "attribution": {
            "sourceTitle":
                title,

            "sourceUri":
                source_uri,

            "revisionId":
                revision_id,

            "revisionTimestamp":
                revision_timestamp,

            "license":
                WIKIMEDIA_LICENSE,

            "licenseUrl":
                WIKIMEDIA_LICENSE_URL,

            "modified":
                True,

            "shareAlikeRequired":
                True,
        },

        "sourceArtifactHash":
            _sha256_bytes(
                _stable_json_bytes(
                    source_core
                )
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def build_wikimedia_reconstruction_row(
    page: Mapping[
        str,
        Any,
    ],
    *,
    sequence: int,
) -> Dict[
    str,
    Any,
] | None:
    title = _normalize(
        page.get(
            "title"
        )
    )

    revision_id = page.get(
        "revisionId"
    )

    revision_timestamp = (
        _normalize(
            page.get(
                "revisionTimestamp"
            )
        )
    )

    wikitext = str(
        page.get(
            "wikitext"
        )
        or
        ""
    )

    if (
        not title
        or not wikitext
    ):
        return None

    sections = _split_sections(
        wikitext
    )

    timeline_section = (
        _first_section(
            sections,
            _TIMELINE_HEADINGS,
        )
    )

    timeline = _timeline_lines(
        timeline_section
    )

    if not timeline:
        return None

    (
        known_fault,
        ground_truth_section,
    ) = (
        _extract_ground_truth(
            sections,
            wikitext=wikitext,
        )
    )

    #
    # Fail closed.
    #
    # No explicit cause/conclusion in source
    # means no E3 reconstruction.
    #
    if not known_fault:
        return None

    source_uri = _page_url(
        title
    )

    evidence = []

    #
    # Timeline observations are reconstructed
    # operational evidence.
    #
    # releaseOffsetMs expresses deterministic
    # event ORDER only. We explicitly preserve
    # this semantic in the artifact content.
    #
    safe_timeline = []

    for observation in timeline:
    #
    # Ground-truth-bearing causal statements
    # belong only in the sealed Evaluation
    # Channel.
    #
    # Do not leak explicit postmortem cause
    # statements into agent-visible replay
    # evidence.
    #
        causal_content = _causal_sentence(
            observation
        )

        if causal_content:
            continue

        if _looks_like_template_placeholder(
            observation
        ):
            continue

        safe_timeline.append(
            observation
        )


#
# E3 requires useful visible evidence.
#
# A report whose timeline consists entirely
# of causal/postmortem statements is unsuitable.
#
    if not safe_timeline:
        return None


    for (
        index,
        observation,
    ) in enumerate(
        safe_timeline[
            :16
        ]
    ):
        evidence.append({
        "artifactId":
            (
                "timeline-"
                f"{sequence:04d}-"
                f"{index + 1:02d}"
            ),

        "kind":
            "LOG",

        "mediaType":
            "application/json",

        "historicallyAvailable":
            True,

        "releaseOffsetMs":
            index,

        "sourceReference":
            source_uri,

        "content": {
            "observation":
                observation,

            "orderingSemantics":
                (
                    "RECONSTRUCTED_ORDER_ONLY_"
                    "NOT_WALL_CLOCK_DURATION"
                ),

            "sourceRevisionId":
                revision_id,

            "sourceLicense":
                WIKIMEDIA_LICENSE,
        },
        })

    service = _service_name(
        title
    )

    domain = _incident_domain(
        title,
        sections,
    )

    recovery_family = (
        _recovery_family(
            sections
        )
    )

    source_policy = (
        _source_policy()
    )

    incident_reference = (
        str(
            revision_id
            or
            title
        )
    )

    #
    # Preserve exact source-backed ground
    # truth in the sealed evaluation channel.
    #
    expected_diagnosis = (
        known_fault
    )

    acceptable_diagnoses = [
        known_fault
    ]

    partition = (
        "HOLDOUT"
        if (
            sequence
            % 5
            ==
            0
        )
        else
        "VALIDATION"
    )

    source_core = {
        "sourceId":
            WIKIMEDIA_SOURCE_ID,

        "pageId":
            page.get(
                "pageId"
            ),

        "revisionId":
            revision_id,

        "revisionTimestamp":
            revision_timestamp,

        "title":
            title,

        "sourceUri":
            source_uri,

        "license":
            WIKIMEDIA_LICENSE,
    }

    return {
        "version":
            WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION,

        "sourcePolicy":
            source_policy,

        "organizationId":
            "public-reconstruction",

        "environmentId":
            "historical-wikimedia",

        "sourceName":
            WIKIMEDIA_SOURCE_NAME,

        "sourceVersion":
            (
                revision_timestamp
                or
                str(
                    revision_id
                    or
                    "unknown"
                )
            ),

        "sourceUri":
            source_uri,

        "incidentReference":
            incident_reference,

        "title":
            title,

        "workload": {
            "service":
                service,

            "provider":
                "WIKIMEDIA",

            "environment":
                "PRODUCTION",

            "incidentDomain":
                domain,
        },

        "evidence":
            evidence,

        "knownFault":
            known_fault,

        "expectedDiagnosis":
            expected_diagnosis,

        "acceptableDiagnoses":
            acceptable_diagnoses,

        "expectedRecoveryFamily":
            recovery_family,

        "groundTruthMethod":
            (
                "WIKIMEDIA_CC_BY_SA_"
                "PUBLIC_INCIDENT_REPORT_"
                f"{ground_truth_section.upper().replace(' ', '_')}"
            ),

        "incidentDomain":
            domain,

        "partition":
            partition,

        "seed":
            710000
            +
            sequence,

        "attribution": {
            "sourceTitle":
                title,

            "sourceUri":
                source_uri,

            "revisionId":
                revision_id,

            "revisionTimestamp":
                revision_timestamp,

            "license":
                WIKIMEDIA_LICENSE,

            "licenseUrl":
                WIKIMEDIA_LICENSE_URL,

            "modified":
                True,

            "shareAlikeRequired":
                True,
        },

        "sourceArtifactHash":
            _sha256_bytes(
                _stable_json_bytes(
                    source_core
                )
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,
    }


def _write_jsonl(
    path: Path,
    rows: Sequence[
        Mapping[
            str,
            Any,
        ]
    ],
) -> Dict[
    str,
    Any,
]:
    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    hasher = hashlib.sha256()

    size = 0

    with path.open(
        "wb"
    ) as handle:
        for row in rows:
            payload = (
                _stable_json_bytes(
                    row
                )
            )

            handle.write(
                payload
            )

            hasher.update(
                payload
            )

            size += len(
                payload
            )

    return {
        "path":
            str(
                path
            ),

        "recordCount":
            len(
                rows
            ),

        "byteSize":
            size,

        "sha256":
            hasher.hexdigest(),
    }


def acquire_and_prepare_wikimedia_incidents(
    *,
    data_root: str | Path,
    required_count: int =
        WIKIMEDIA_DEFAULT_COUNT,
    maximum_pages: int =
        WIKIMEDIA_DEFAULT_MAX_PAGES,
) -> Dict[
    str,
    Any,
]:
    if (
        not isinstance(
            required_count,
            int,
        )
        or required_count < 1
    ):
        raise ValueError(
            "required_count must be positive"
        )

    if (
        not isinstance(
            maximum_pages,
            int,
        )
        or maximum_pages < required_count
    ):
        raise ValueError(
            (
                "maximum_pages must be >= "
                "required_count"
            )
        )

    titles = _category_titles(
        maximum=
            maximum_pages
    )

    if (
        len(titles)
        <
        required_count
    ):
        raise RuntimeError(
            (
                "Wikimedia incident category did "
                "not contain enough candidate pages: "
                f"{len(titles)} < {required_count}"
            )
        )

    pages = _fetch_pages(
        titles
    )

    cases: list[
        Dict[
            str,
            Any,
        ]
    ] = []

    rejected_no_timeline = 0
    rejected_no_ground_truth = 0

    domain_counts: Dict[
        str,
        int,
    ] = {}

    partition_counts: Dict[
        str,
        int,
    ] = {}

    seen_revisions: set[
        str
    ] = set()

    for page in pages:
        wikitext = str(
            page.get(
                "wikitext"
            )
            or
            ""
        )

        sections = _split_sections(
            wikitext
        )

        timeline = _timeline_lines(
            _first_section(
                sections,
                _TIMELINE_HEADINGS,
            )
        )

        if not timeline:
            rejected_no_timeline += 1
            continue

        (
            known_fault,
            _,
        ) = _extract_ground_truth(
            sections
        )

        if not known_fault:
            rejected_no_ground_truth += 1
            continue

        next_sequence = (
            len(cases)
            +
            1
        )

        row = (
            build_wikimedia_reconstruction_row(
                page,
                sequence=
                    next_sequence,
            )
        )

        if row is None:
            continue

        identity = str(
            row[
                "incidentReference"
            ]
        )

        if identity in seen_revisions:
            continue

        seen_revisions.add(
            identity
        )

        cases.append(
            row
        )

        domain = str(
            row[
                "incidentDomain"
            ]
        )

        domain_counts[
            domain
        ] = (
            domain_counts.get(
                domain,
                0,
            )
            +
            1
        )

        partition = str(
            row[
                "partition"
            ]
        )

        partition_counts[
            partition
        ] = (
            partition_counts.get(
                partition,
                0,
            )
            +
            1
        )

        if (
            len(cases)
            >=
            required_count
        ):
            break

    if (
        len(cases)
        <
        required_count
    ):
        raise RuntimeError(
            (
                "Wikimedia incident reconstruction "
                "did not produce enough source-backed "
                "E3 candidates: "
                f"{len(cases)} < {required_count}. "
                f"pagesFetched={len(pages)}, "
                f"rejectedNoTimeline="
                f"{rejected_no_timeline}, "
                f"rejectedNoGroundTruth="
                f"{rejected_no_ground_truth}"
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
        WIKIMEDIA_OUTPUT_RELATIVE,
        cases,
    )

    manifest_core = {
        "version":
            WIKIMEDIA_INCIDENT_RECONSTRUCTION_VERSION,

        "sourceId":
            WIKIMEDIA_SOURCE_ID,

        "sourceName":
            WIKIMEDIA_SOURCE_NAME,

        "sourceApi":
            WIKIMEDIA_API_URL,

        "sourceCategory":
            WIKIMEDIA_CATEGORY,

        "policyStatus":
            "APPROVED_COMMERCIAL",

        "license":
            WIKIMEDIA_LICENSE,

        "licenseVerified":
            True,

        "commercialUseAllowed":
            True,

        "redistributionAllowed":
            True,

        "attributionRequired":
            True,

        "shareAlikeRequired":
            True,

        "requestedCount":
            required_count,

        "caseCount":
            len(
                cases
            ),

        "uniqueIncidentCount":
            len({
                case[
                    "incidentReference"
                ]
                for case
                in cases
            }),

        "pagesDiscovered":
            len(
                titles
            ),

        "pagesFetched":
            len(
                pages
            ),

        "rejectedNoTimeline":
            rejected_no_timeline,

        "rejectedNoGroundTruth":
            rejected_no_ground_truth,

        "evidenceGrade":
            "E3",

        "corpusRole":
            "PRODUCTION_RECONSTRUCTION",

        "domainCounts":
            dict(
                sorted(
                    domain_counts.items()
                )
            ),

        "partitionCounts":
            dict(
                sorted(
                    partition_counts.items()
                )
            ),

        "groundTruthAgentVisible":
            False,

        "executionAuthorized":
            False,

        "productionCertified":
            False,

        "output":
            output,
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
        WIKIMEDIA_MANIFEST_RELATIVE
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