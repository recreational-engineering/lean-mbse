#!/usr/bin/env python3
"""Requirements tree browser - web app entry point."""

import ast
import difflib
import importlib.util
import json
import math
import os
import random
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml
from flask import Flask, jsonify, render_template, request, send_from_directory

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
)

REQUIREMENTS_PATH = Path(__file__).resolve().parent / "requirements.yaml"
SAMPLE_TABLE_PATH = Path(__file__).resolve().parent / "sample_table.json"
FUNCTIONS_PATH = Path(__file__).resolve().parent / "functions.py"
REQUIRED_PROPAGATION_FUNCTION_TYPES = {"branch"}
REQUIREMENT_LEVELS = ("alpha", "beta", "gamma")


def build_requirements_index(data):
    """Build normalized requirements map with level buckets and flat by_id index (legacy format)."""
    alpha = data.get("alpha") or {}
    beta = data.get("beta") or {}
    gamma = data.get("gamma") or {}
    by_id = {}
    for level, reqs in [("alpha", alpha), ("beta", beta), ("gamma", gamma)]:
        for rid, r in (reqs or {}).items():
            by_id[rid] = {**r, "id": rid, "level": level}
    return {"alpha": alpha, "beta": beta, "gamma": gamma, "by_id": by_id}


def _is_legacy_format(data):
    """True if top-level keys include alpha, beta, or gamma (legacy structure)."""
    keys = set((data or {}).keys())
    return bool(keys & {"alpha", "beta", "gamma"})


def build_requirements_index_from_flat(flat_data):
    """Build alpha, beta, gamma and by_id from flat YAML (top-level keys = RQ ids, each has 'class')."""
    alpha, beta, gamma = {}, {}, {}
    by_id = {}
    for rid, r in (flat_data or {}).items():
        if not re.match(r"^RQ\d+$", str(rid).strip(), re.IGNORECASE):
            continue
        entry = dict(r or {})
        level = (entry.get("class") or entry.get("level") or "alpha").strip().lower()
        if level not in ("alpha", "beta", "gamma"):
            level = "alpha"
        entry_no_meta = {k: v for k, v in entry.items() if k not in ("class", "level")}
        by_id[rid] = {**entry_no_meta, "id": rid, "level": level}
        bucket = alpha if level == "alpha" else (beta if level == "beta" else gamma)
        bucket[rid] = entry_no_meta
    return {"alpha": alpha, "beta": beta, "gamma": gamma, "by_id": by_id}


def normalize_requirement_id_set(raw_value, by_id):
    """Normalize scalar/list requirement references to a validated ID set."""
    candidates = raw_value if isinstance(raw_value, (list, tuple, set)) else [raw_value]
    normalized = set()
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text and text != "None" and text in by_id:
            normalized.add(text)
    return normalized


def normalize_propagation_function_name(raw_value):
    """Normalize propagation function values so literal 'none' behaves as unset."""
    text = str(raw_value or "").strip()
    if not text or text.lower() == "none":
        return ""
    return text


def extract_propagation_input_requirement_ids(req, by_id):
    """Extract referenced requirement IDs from propagation input records."""
    inputs = req.get("propagation_inputs") or {}
    if not isinstance(inputs, dict):
        return set()

    refs = set()
    for raw_spec in inputs.values():
        if not isinstance(raw_spec, dict):
            continue
        for key in ("lower_input", "upper_input"):
            text = str(raw_spec.get(key) or "").strip()
            if not text or text == "None":
                continue

            # Ignore explicit literals like "(text)", "'text'", "\"text\"" and numbers.
            if len(text) >= 2 and (
                (text[0] == "(" and text[-1] == ")")
                or (text[0] == "'" and text[-1] == "'")
                or (text[0] == '"' and text[-1] == '"')
            ):
                continue
            try:
                float(text)
                continue
            except (TypeError, ValueError):
                pass

            parts = text.split()
            if len(parts) == 1:
                req_id = parts[0]
            elif len(parts) == 2 and parts[1].lower() in {"lower", "upper"}:
                req_id = parts[0]
            else:
                continue

            if req_id in by_id:
                refs.add(req_id)
    return refs


def compute_derived_relates_map(by_id):
    """Build bidirectional relates adjacency from propagation inputs."""
    relates = {req_id: set() for req_id in by_id}
    driven_by = {
        req_id: normalize_requirement_id_set((req or {}).get("driven_by"), by_id)
        for req_id, req in by_id.items()
    }

    for src_id, req in by_id.items():
        for target_id in extract_propagation_input_requirement_ids(req or {}, by_id):
            if target_id == src_id:
                continue
            if target_id in driven_by.get(src_id, set()):
                continue
            if src_id in driven_by.get(target_id, set()):
                continue
            relates[src_id].add(target_id)
            relates[target_id].add(src_id)
    return relates


def compute_requirement_type_map(by_id):
    """Classify each requirement from driven_by edges and reverse driven_by usage."""
    driven_by = {
        req_id: normalize_requirement_id_set((req or {}).get("driven_by"), by_id)
        for req_id, req in by_id.items()
    }
    referenced_by = {req_id: set() for req_id in by_id}
    for child_id, parent_ids in driven_by.items():
        for parent_id in parent_ids:
            referenced_by.setdefault(parent_id, set()).add(child_id)

    requirement_types = {}
    for req_id, req in by_id.items():
        has_driver = bool(driven_by.get(req_id))
        has_dependents = bool(referenced_by.get(req_id))
        if not has_dependents:
            function_name = normalize_propagation_function_name((req or {}).get("propagation_function"))
            requirement_types[req_id] = "function_stub" if function_name else "constrain_stub"
        elif not has_driver:
            requirement_types[req_id] = "top_stub"
        else:
            requirement_types[req_id] = "branch"
    return requirement_types


def with_derived_fields(alpha, beta, gamma):
    """Return level dicts with derived metadata overwritten from normalized links."""
    base = {"alpha": alpha or {}, "beta": beta or {}, "gamma": gamma or {}}
    idx = build_requirements_index(base)
    relates_map = compute_derived_relates_map(idx["by_id"])
    type_map = compute_requirement_type_map(idx["by_id"])

    updated = {"alpha": {}, "beta": {}, "gamma": {}}
    for level in ("alpha", "beta", "gamma"):
        for req_id, req in (base.get(level) or {}).items():
            entry = dict(req or {})
            entry["relates_to"] = sorted(relates_map.get(req_id, set()))
            entry_type = type_map.get(req_id, "top_stub")
            entry["type"] = entry_type
            if entry_type == "constrain_stub":
                entry["constrained_bounds"] = _normalize_bounds_value(
                    entry.get("constrained_bounds"), [0.0, 0.0]
                )
                entry.pop("targeted_bounds", None)
            else:
                entry.pop("constrained_bounds", None)
                entry["targeted_bounds"] = _normalize_nullable_bounds_value(
                    entry.get("targeted_bounds"), [None, None]
                )
            updated[level][req_id] = entry
    return updated


def load_requirements():
    """Load requirements from YAML. Returns dict with alpha, beta, gamma and flat id->req."""
    if not REQUIREMENTS_PATH.exists():
        return {"alpha": {}, "beta": {}, "gamma": {}, "by_id": {}}
    with open(REQUIREMENTS_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if _is_legacy_format(data):
        idx = build_requirements_index(data)
    else:
        idx = build_requirements_index_from_flat(data)
    derived = with_derived_fields(idx["alpha"], idx["beta"], idx["gamma"])
    return build_requirements_index(derived)


@app.route("/")
def index():
    version_candidates = [Path(__file__).resolve()]
    static_dir = Path(app.static_folder or "")
    css_path = static_dir / "css" / "style.css"
    js_path = static_dir / "js" / "app.js"
    if css_path.exists():
        version_candidates.append(css_path)
    if js_path.exists():
        version_candidates.append(js_path)
    static_version = max(int(path.stat().st_mtime) for path in version_candidates)
    return render_template("index.html", static_version=static_version)


@app.route("/api/requirements")
def api_requirements():
    return jsonify(load_requirements())


@app.route("/api/samples/table")
def api_sample_table():
    return no_store_json(load_sample_table())


def _rq_sort_key(key):
    """Sort key for YAML: RQ1, RQ2, ..., RQ10, RQ11 (numeric by RQ number)."""
    if not isinstance(key, str):
        return (0, str(key))
    m = re.match(r"^RQ(\d+)$", key.strip(), re.IGNORECASE)
    if m:
        return (1, int(m.group(1)))
    return (0, key)


def save_requirements(alpha, beta, gamma):
    """Save to requirements.yaml as flat dict: top-level keys = RQ ids, each entry has 'class' (level)."""
    data = with_derived_fields(alpha, beta, gamma)
    flat = {}
    for level, bucket in [("alpha", data["alpha"]), ("beta", data["beta"]), ("gamma", data["gamma"])]:
        for rid, entry in (bucket or {}).items():
            flat[rid] = {**dict(entry), "class": level}
    ordered = dict(sorted(flat.items(), key=lambda item: _rq_sort_key(item[0])))
    with open(REQUIREMENTS_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(ordered, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def load_sample_table():
    """Load the last persisted sample table, or return an empty payload."""
    empty_payload = {
        "generated_at": None,
        "sample_count": 0,
        "columns": [],
        "rows": [],
        "summary": {"pass_count": 0, "fail_count": 0, "zero_pass": True},
    }
    if not SAMPLE_TABLE_PATH.exists():
        return dict(empty_payload)
    try:
        with open(SAMPLE_TABLE_PATH, encoding="utf-8") as f:
            payload = json.load(f) or {}
    except (OSError, ValueError, TypeError):
        return dict(empty_payload)
    if not isinstance(payload, dict):
        return dict(empty_payload)
    payload.setdefault("generated_at", None)
    payload.setdefault("sample_count", 0)
    payload.setdefault("columns", [])
    payload.setdefault("rows", [])
    payload.setdefault("summary", {"pass_count": 0, "fail_count": 0, "zero_pass": True})
    return payload


def save_sample_table(payload):
    """Persist the latest sample table to disk."""
    with open(SAMPLE_TABLE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload or {}, f, indent=2, ensure_ascii=True)


def inspect_function_signature(function_name):
    """Return function existence and parameter names from functions.py without importing it."""
    if not function_name or not isinstance(function_name, str):
        return {"found": False, "params": []}
    if not FUNCTIONS_PATH.exists():
        return {"found": False, "params": []}
    try:
        source = FUNCTIONS_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source)
    except (OSError, SyntaxError):
        return {"found": False, "params": []}

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            params = []
            all_args = list(node.args.posonlyargs) + list(node.args.args) + list(node.args.kwonlyargs)
            for arg in all_args:
                if arg.arg in ("self", "cls"):
                    continue
                params.append(arg.arg)
            if node.args.vararg:
                params.append(f"*{node.args.vararg.arg}")
            if node.args.kwarg:
                params.append(f"**{node.args.kwarg.arg}")
            return {"found": True, "params": params}
    return {"found": False, "params": []}


def list_functions():
    """Return all top-level function names defined in functions.py."""
    if not FUNCTIONS_PATH.exists():
        return []
    try:
        source = FUNCTIONS_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source)
    except (OSError, SyntaxError):
        return []
    names = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            names.append(node.name)
    return sorted(names)


def load_functions_module():
    """Load functions.py as runtime module."""
    if not FUNCTIONS_PATH.exists():
        return None
    spec = importlib.util.spec_from_file_location("runtime_functions_module", FUNCTIONS_PATH)
    if not spec or not spec.loader:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolve_propagation_ref(raw, by_id, default_selector=None, source_bounds_field="expected_bounds"):
    """Resolve propagation input as literal/number/reference using a selected bounds source."""
    text = str(raw or "").strip()
    if not text:
        raise ValueError("Empty propagation input")

    # Explicit string literals:
    # - (value)
    # - 'value'
    # - "value"
    if len(text) >= 2 and text[0] == "(" and text[-1] == ")":
        return text[1:-1].strip()
    if len(text) >= 2 and text[0] == "'" and text[-1] == "'":
        return text[1:-1]
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        return text[1:-1]

    try:
        return float(text)
    except (TypeError, ValueError):
        pass

    parts = text.split()
    req_id = ""
    which = ""
    if len(parts) == 1:
        req_id = parts[0]
        which = (default_selector or "").lower()
        if which not in ("lower", "upper"):
            raise ValueError(f"Invalid reference '{text}'. Use number, '(string)', quoted string, or '<REQ_ID>'.")
    elif len(parts) == 2:
        req_id = parts[0]
        which = parts[1].lower()
        if which not in ("lower", "upper"):
            raise ValueError(f"Invalid bound selector in '{text}'. Use lower/upper.")
    else:
        raise ValueError(f"Invalid reference '{text}'. Use number, '(string)', quoted string, or '<REQ_ID>'.")
    req = by_id.get(req_id)
    if not req:
        raise ValueError(f"Requirement '{req_id}' not found.")
    bounds = req.get(source_bounds_field) or []
    if not isinstance(bounds, (list, tuple)) or len(bounds) != 2:
        label = "required bounds" if source_bounds_field == "required_bounds" else "expected bounds"
        raise ValueError(f"Requirement '{req_id}' has no {label}.")
    lower_bound, upper_bound = sorted((bounds[0], bounds[1]))
    idx = 0 if which == "lower" else 1
    return (lower_bound, upper_bound)[idx]


def _is_constraint_stub_requirement_type(raw_value):
    return str(raw_value or "").strip().lower() == "constrain_stub"


def _is_function_driven_requirement_type(raw_value):
    req_type = str(raw_value or "").strip().lower()
    return req_type in {"branch", "top_stub", "function_stub"}


def _is_numeric_value(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _default_solvable_distribution():
    return {
        "sample_count": 0,
        "min": 0.0,
        "max": 0.0,
        "mean": 0.0,
        "std_dev": 0.0,
        "one_sigma_min": 0.0,
        "one_sigma_max": 0.0,
        "bins": [],
    }


def _has_targeted_bounds(req):
    bounds = (req or {}).get("targeted_bounds")
    return isinstance(bounds, (list, tuple)) and len(bounds) == 2 and not (
        bounds[0] is None and bounds[1] is None
    )


def _normalize_requirements_payload(raw_requirements):
    alpha, beta, gamma = _normalize_requirement_tree_payload(raw_requirements)
    derived = with_derived_fields(alpha, beta, gamma)
    return build_requirements_index(derived)


def _get_driven_by_requirement_id(req, by_id):
    candidates = sorted(
        normalize_requirement_id_set((req or {}).get("driven_by"), by_id),
        key=_rq_sort_key,
    )
    return candidates[0] if candidates else ""


def _get_driven_by_branch_requirement_ids(start_req_id, by_id):
    branch_req_ids = []
    seen = set()
    current_id = str(start_req_id or "").strip()
    while current_id and current_id in by_id:
        if current_id in seen:
            raise ValueError(f"Requirement hierarchy cycle detected at {current_id}.")
        seen.add(current_id)
        branch_req_ids.append(current_id)
        current_id = _get_driven_by_requirement_id(by_id.get(current_id), by_id)
    return branch_req_ids


def _get_propagation_dependency_requirement_ids(req_id, by_id):
    req = by_id.get(req_id) or {}
    return sorted(extract_propagation_input_requirement_ids(req, by_id), key=_rq_sort_key)


def _build_sampling_evaluation_plan(by_id):
    type_map = compute_requirement_type_map(by_id)
    sorted_req_ids = sorted(by_id, key=_rq_sort_key)
    return {
        "requirement_ids": sorted_req_ids,
        "constraint_stub_req_ids": [
            req_id for req_id in sorted_req_ids if type_map.get(req_id) == "constrain_stub"
        ],
        "function_stub_req_ids": [
            req_id for req_id in sorted_req_ids if type_map.get(req_id) == "function_stub"
        ],
    }


def _resolve_sample_input(raw, by_id, row_values):
    """Resolve a propagation input to a scalar using sampled row values instead of bounds."""
    text = str(raw or "").strip()
    if not text:
        raise ValueError("Empty propagation input")

    if len(text) >= 2 and text[0] == "(" and text[-1] == ")":
        return text[1:-1].strip()
    if len(text) >= 2 and text[0] == "'" and text[-1] == "'":
        return text[1:-1]
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        return text[1:-1]

    try:
        return float(text)
    except (TypeError, ValueError):
        pass

    parts = text.split()
    if len(parts) == 1:
        req_id = parts[0]
    elif len(parts) == 2 and parts[1].lower() in {"lower", "upper"}:
        req_id = parts[0]
    else:
        raise ValueError(
            f"Invalid reference '{text}'. Use number, '(string)', quoted string, or '<REQ_ID>'."
        )
    if req_id not in by_id:
        raise ValueError(f"Requirement '{req_id}' not found.")
    if req_id not in row_values:
        raise ValueError(f"Requirement '{req_id}' has no sampled value yet.")
    return row_values[req_id]


def _sample_parameter_value(input_spec, by_id, row_values, rng):
    """Turn a lower/upper propagation spec into one sampled scalar value for a row."""
    if not isinstance(input_spec, dict):
        raise ValueError("Both lower and upper propagation inputs are required.")
    lower_value = _resolve_sample_input(input_spec.get("lower_input", ""), by_id, row_values)
    upper_value = _resolve_sample_input(input_spec.get("upper_input", ""), by_id, row_values)

    if isinstance(lower_value, str) or isinstance(upper_value, str):
        if isinstance(lower_value, str) and isinstance(upper_value, str):
            if lower_value != upper_value:
                raise ValueError("String propagation inputs must match for sampled evaluation.")
            return lower_value
        raise ValueError("Cannot mix string and numeric propagation inputs for sampled evaluation.")

    if not _is_numeric_value(lower_value) or not _is_numeric_value(upper_value):
        raise ValueError("Sampled propagation inputs must resolve to numeric values.")

    lower_bound, upper_bound = sorted((float(lower_value), float(upper_value)))
    return lower_bound if lower_bound == upper_bound else rng.uniform(lower_bound, upper_bound)


def _coerce_sampled_value(value):
    """Normalize function results to JSON-safe scalar values."""
    if hasattr(value, "item") and callable(getattr(value, "item")):
        try:
            value = value.item()
        except Exception:
            pass
    if value is None or isinstance(value, (str, bool)):
        return value
    if _is_numeric_value(value):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return str(value)


def _evaluate_sampled_requirement(req_id, reqs, signature_cache, module, row_values, rng):
    req = reqs["by_id"].get(req_id) or {}
    function_name = normalize_propagation_function_name(req.get("propagation_function"))
    if not function_name:
        row_values.setdefault(req_id, None)
        return row_values.get(req_id)

    signature = signature_cache.get(function_name)
    if signature is None:
        signature = inspect_function_signature(function_name)
        signature_cache[function_name] = signature
    if not signature.get("found"):
        raise ValueError(f"Function '{function_name}' not found in functions.py.")

    func = getattr(module, function_name, None)
    if not callable(func):
        raise ValueError(f"Function '{function_name}' is not callable.")

    propagation_inputs = req.get("propagation_inputs") or {}
    if not isinstance(propagation_inputs, dict):
        propagation_inputs = {}

    kwargs = {}
    for param in signature.get("params", []):
        if str(param).startswith("*"):
            continue
        kwargs[param] = _sample_parameter_value(propagation_inputs.get(param), reqs["by_id"], row_values, rng)

    row_values[req_id] = _coerce_sampled_value(func(**kwargs))
    return row_values[req_id]


def _evaluate_sampled_requirement_chain(
    req_id, reqs, signature_cache, module, row_values, rng, active_req_ids=None, completed_req_ids=None
):
    req = reqs["by_id"].get(req_id)
    active = active_req_ids if active_req_ids is not None else set()
    completed = completed_req_ids if completed_req_ids is not None else set()
    if not req or not _is_function_driven_requirement_type(req.get("type")):
        return row_values.get(req_id)
    if req_id in completed:
        return row_values.get(req_id)
    if req_id in active:
        raise ValueError(f"Propagation dependency cycle detected at {req_id}.")

    active.add(req_id)
    try:
        for dep_id in _get_propagation_dependency_requirement_ids(req_id, reqs["by_id"]):
            dep_req = reqs["by_id"].get(dep_id)
            if dep_req and _is_function_driven_requirement_type(dep_req.get("type")):
                _evaluate_sampled_requirement_chain(
                    dep_id, reqs, signature_cache, module, row_values, rng, active, completed
                )

        result = _evaluate_sampled_requirement(req_id, reqs, signature_cache, module, row_values, rng)
        completed.add(req_id)
        return result
    finally:
        active.discard(req_id)


def _evaluate_sampling_branch_from_stub(start_req_id, reqs, signature_cache, module, row_values, rng, completed_req_ids):
    for req_id in _get_driven_by_branch_requirement_ids(start_req_id, reqs["by_id"]):
        req = reqs["by_id"].get(req_id)
        if req and _is_function_driven_requirement_type(req.get("type")):
            _evaluate_sampled_requirement_chain(
                req_id, reqs, signature_cache, module, row_values, rng, set(), completed_req_ids
            )


def _sample_constraint_stub_row_values(reqs, plan, row_values, rng):
    for req_id in plan.get("constraint_stub_req_ids", []):
        req = reqs["by_id"].get(req_id) or {}
        bounds = req.get("constrained_bounds")
        if not isinstance(bounds, (list, tuple)) or len(bounds) != 2:
            raise ValueError(f"Constraint stub '{req_id}' has no constrained bounds.")
        lower_bound, upper_bound = sorted((float(bounds[0]), float(bounds[1])))
        row_values[req_id] = (
            lower_bound if lower_bound == upper_bound else rng.uniform(lower_bound, upper_bound)
        )


def _evaluate_sample_rows(reqs, sample_count):
    module = load_functions_module()
    if module is None:
        raise ValueError("functions.py could not be loaded.")

    rng = random.Random()
    signature_cache = {}
    plan = _build_sampling_evaluation_plan(reqs["by_id"])
    rows = []

    for sample_index in range(sample_count):
        row_values = {}
        completed_req_ids = set()
        _sample_constraint_stub_row_values(reqs, plan, row_values, rng)
        row_pass = True

        try:
            for req_id in plan.get("constraint_stub_req_ids", []):
                _evaluate_sampling_branch_from_stub(
                    req_id, reqs, signature_cache, module, row_values, rng, completed_req_ids
                )
            for req_id in plan.get("function_stub_req_ids", []):
                _evaluate_sampling_branch_from_stub(
                    req_id, reqs, signature_cache, module, row_values, rng, completed_req_ids
                )
            for req_id in plan.get("requirement_ids", []):
                req = reqs["by_id"].get(req_id)
                if req and _is_function_driven_requirement_type(req.get("type")):
                    _evaluate_sampled_requirement_chain(
                        req_id, reqs, signature_cache, module, row_values, rng, set(), completed_req_ids
                    )
        except Exception:
            row_pass = False

        row = {"sample_no": sample_index + 1, "pass": row_pass}
        for req_id in plan.get("requirement_ids", []):
            row[req_id] = row_values.get(req_id)

        if row["pass"]:
            for req_id in plan.get("requirement_ids", []):
                req = reqs["by_id"].get(req_id) or {}
                if not _has_targeted_bounds(req):
                    continue
                value = row.get(req_id)
                if not _is_numeric_value(value):
                    row["pass"] = False
                    break
                targeted_bounds = req.get("targeted_bounds") or [None, None]
                lower_target, upper_target = sorted((float(targeted_bounds[0]), float(targeted_bounds[1])))
                if float(value) < lower_target or float(value) > upper_target:
                    row["pass"] = False
                    break

        rows.append(row)

    return plan.get("requirement_ids", []), rows


def _apply_solvable_bounds_from_rows(reqs, requirement_ids, rows):
    pass_rows = [row for row in rows if row.get("pass") is True]
    if not pass_rows:
        return False
    for req_id in requirement_ids:
        req = reqs["by_id"].get(req_id)
        if not req:
            continue
        numeric_values = [float(row[req_id]) for row in pass_rows if _is_numeric_value(row.get(req_id))]
        if not numeric_values:
            continue
        solvable_bounds = [min(numeric_values), max(numeric_values)]
        req["solvable_bounds"] = solvable_bounds
        level = req.get("level")
        if level in reqs and req_id in reqs[level]:
            reqs[level][req_id]["solvable_bounds"] = solvable_bounds
    return True


def _build_solvable_distribution(numeric_values, solvable_bounds):
    if not numeric_values:
        return _default_solvable_distribution()

    sorted_values = sorted(float(value) for value in numeric_values)
    bound_min, bound_max = sorted((float(solvable_bounds[0]), float(solvable_bounds[1])))
    sample_count = len(sorted_values)
    mean = sum(sorted_values) / sample_count
    variance = sum((value - mean) ** 2 for value in sorted_values) / sample_count
    std_dev = math.sqrt(max(0.0, variance))
    one_sigma_min = max(bound_min, mean - std_dev)
    one_sigma_max = min(bound_max, mean + std_dev)

    if bound_min == bound_max:
        bins = [{"x0": bound_min, "x1": bound_max, "count": sample_count}]
    else:
        bin_count = 1 if sample_count == 1 else max(2, min(24, int(round(math.sqrt(sample_count)))))
        counts = [0] * bin_count
        span = bound_max - bound_min
        for value in sorted_values:
            clamped = min(bound_max, max(bound_min, float(value)))
            relative = (clamped - bound_min) / span
            idx = min(bin_count - 1, int(relative * bin_count))
            counts[idx] += 1
        bin_width = span / bin_count
        bins = []
        for idx, count in enumerate(counts):
            x0 = bound_min + (idx * bin_width)
            x1 = bound_max if idx == bin_count - 1 else bound_min + ((idx + 1) * bin_width)
            bins.append({"x0": x0, "x1": x1, "count": count})

    return {
        "sample_count": sample_count,
        "min": bound_min,
        "max": bound_max,
        "mean": mean,
        "std_dev": std_dev,
        "one_sigma_min": one_sigma_min,
        "one_sigma_max": one_sigma_max,
        "bins": bins,
    }


def _apply_solvable_distributions_from_rows(reqs, requirement_ids, rows):
    pass_rows = [row for row in rows if row.get("pass") is True]
    if not pass_rows:
        return False
    for req_id in requirement_ids:
        req = reqs["by_id"].get(req_id)
        if not req:
            continue
        numeric_values = [float(row[req_id]) for row in pass_rows if _is_numeric_value(row.get(req_id))]
        if not numeric_values:
            continue
        solvable_distribution = _build_solvable_distribution(
            numeric_values, req.get("solvable_bounds") or [min(numeric_values), max(numeric_values)]
        )
        req["solvable_distribution"] = solvable_distribution
        level = req.get("level")
        if level in reqs and req_id in reqs[level]:
            reqs[level][req_id]["solvable_distribution"] = solvable_distribution
    return True


def _build_sample_table_payload(requirement_ids, rows):
    pass_count = sum(1 for row in rows if row.get("pass") is True)
    fail_count = len(rows) - pass_count
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_count": len(rows),
        "columns": [
            {"key": "sample_no", "label": "Sample #"},
            {"key": "pass", "label": "Pass"},
            *({"key": req_id, "label": req_id} for req_id in requirement_ids),
        ],
        "rows": rows,
        "summary": {
            "pass_count": pass_count,
            "fail_count": fail_count,
            "zero_pass": pass_count == 0,
        },
    }


def build_validation_issue(message, code=None, field_errors=None, req_id=None):
    """Build a validation payload that can be returned directly or embedded as a warning."""
    payload = {"error": str(message)}
    if code:
        payload["code"] = str(code)
    if req_id:
        payload["req_id"] = str(req_id)
    if field_errors:
        normalized_field_errors = []
        for item in field_errors:
            if isinstance(item, dict):
                normalized_item = dict(item)
            else:
                normalized_item = {"message": str(item)}
            if req_id and "req_id" not in normalized_item:
                normalized_item["req_id"] = str(req_id)
            normalized_field_errors.append(normalized_item)
        payload["field_errors"] = normalized_field_errors
    return payload


def error_response(message, status=400, field_errors=None, code=None, req_id=None):
    """Return a JSON error payload that frontend can map to specific fields."""
    payload = build_validation_issue(message, code=code, field_errors=field_errors, req_id=req_id)
    return jsonify(payload), status


def no_store_json(payload):
    """Return JSON response that bypasses browser caches for dynamic editor data."""
    response = jsonify(payload)
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def error_response_from_issue(issue, status=400):
    """Return a JSON error response from a prebuilt validation issue payload."""
    return jsonify(dict(issue or {})), status


def collect_function_driven_requirement_issues(alpha, beta, gamma, req_ids=None):
    """Collect propagation configuration issues for the provided requirements or the whole file."""
    candidate = build_requirements_index({"alpha": alpha, "beta": beta, "gamma": gamma})
    by_id = candidate.get("by_id") or {}
    type_map = compute_requirement_type_map(by_id)
    req_ids_filter = None
    issues = []
    if req_ids is not None:
        req_ids_filter = {str(req_id).strip() for req_id in req_ids if str(req_id).strip()}

    for req_id in sorted(by_id, key=_rq_sort_key):
        if req_ids_filter is not None and req_id not in req_ids_filter:
            continue
        req = by_id.get(req_id) or {}
        req_type = type_map.get(req_id, "top_stub")
        function_name = normalize_propagation_function_name(req.get("propagation_function"))
        if not function_name:
            if req_type in REQUIRED_PROPAGATION_FUNCTION_TYPES:
                issues.append(
                    build_validation_issue(
                        f"Requirement '{req_id}' requires a propagation function because it is a {req_type.replace('_', ' ')}.",
                        code="missing_required_function",
                        field_errors=[
                            {
                                "field": "function_name",
                                "message": "Function name is required for branch requirements.",
                            }
                        ],
                        req_id=req_id,
                    )
                )
            continue

        signature = inspect_function_signature(function_name)
        if not signature.get("found"):
            issues.append(
                build_validation_issue(
                    f"Requirement '{req_id}' references unknown function '{function_name}'.",
                    code="function_not_found",
                    field_errors=[
                        {
                            "field": "function_name",
                            "message": f"Function '{function_name}' not found in functions.py.",
                        }
                    ],
                    req_id=req_id,
                )
            )
            continue

        propagation_inputs = req.get("propagation_inputs") or {}
        if not isinstance(propagation_inputs, dict):
            propagation_inputs = {}

        for param in signature.get("params", []):
            if str(param).startswith("*"):
                continue
            input_spec = propagation_inputs.get(param)
            if not isinstance(input_spec, dict):
                issues.append(
                    build_validation_issue(
                        f"Requirement '{req_id}' is missing propagation inputs for parameter '{param}'.",
                        code="missing_parameter_inputs",
                        field_errors=[
                            {
                                "param": param,
                                "message": "Both lower and upper propagation inputs are required.",
                            }
                        ],
                        req_id=req_id,
                    )
                )
                continue

            lower_input = str(input_spec.get("lower_input", "")).strip()
            upper_input = str(input_spec.get("upper_input", "")).strip()
            if lower_input and upper_input:
                continue

            field_errors = []
            if not lower_input:
                field_errors.append(
                    {"param": param, "bound": "lower", "message": "Lower propagation input is required."}
                )
            if not upper_input:
                field_errors.append(
                    {"param": param, "bound": "upper", "message": "Upper propagation input is required."}
                )
            issues.append(
                build_validation_issue(
                    f"Requirement '{req_id}' is missing propagation inputs for parameter '{param}'.",
                    code="missing_parameter_inputs",
                    field_errors=field_errors,
                    req_id=req_id,
                )
            )

    return issues


def validate_function_driven_requirements(alpha, beta, gamma, req_ids=None):
    """Validate propagation configuration for the provided requirements or the whole file."""
    issues = collect_function_driven_requirement_issues(alpha, beta, gamma, req_ids=req_ids)
    if issues:
        return error_response_from_issue(issues[0], status=400)
    return None


def infer_param_from_exception(exc, known_params):
    """Best-effort extraction of problematic parameter name from Python exception text."""
    text = str(exc or "")
    if not text:
        return None

    patterns = [
        r"argument ['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]",
        r"missing 1 required positional argument: ['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]",
        r"unexpected keyword argument ['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            candidate = match.group(1)
            if candidate in known_params:
                return candidate

    # KeyError often comes as "'param_name'".
    quoted = re.fullmatch(r"['\"]([A-Za-z_][A-Za-z0-9_]*)['\"]", text.strip())
    if quoted:
        candidate = quoted.group(1)
        if candidate in known_params:
            return candidate
    return None


@app.route("/api/functions/lookup")
def api_lookup_function():
    function_name = (request.args.get("name") or "").strip()
    result = inspect_function_signature(function_name)
    return no_store_json({"name": function_name, **result})


@app.route("/api/functions/suggest")
def api_suggest_functions():
    query = (request.args.get("q") or "").strip()
    names = list_functions()
    if not query:
        return no_store_json({"query": query, "suggestions": names[:12]})

    scored = []
    q_lower = query.lower()
    q_compact = re.sub(r"[^a-z0-9]+", "", q_lower)
    for name in names:
        n_lower = name.lower()
        n_compact = re.sub(r"[^a-z0-9]+", "", n_lower)
        score = difflib.SequenceMatcher(None, q_lower, n_lower).ratio()
        if n_lower.startswith(q_lower):
            score += 0.8
        elif q_lower in n_lower:
            score += 0.45
        if q_compact and n_compact.startswith(q_compact):
            score += 0.5
        elif q_compact and q_compact in n_compact:
            score += 0.3
        scored.append((score, name))
    scored.sort(key=lambda item: item[0], reverse=True)
    suggestions = [name for score, name in scored if score >= 0.18][:12]
    return no_store_json({"query": query, "suggestions": suggestions})


@app.route("/api/propagation/evaluate", methods=["POST"])
def api_evaluate_propagation():
    body = request.get_json() or {}
    req_id = (body.get("req_id") or "").strip()
    function_name = normalize_propagation_function_name(body.get("function_name"))
    param_refs = body.get("param_refs") or {}
    if not req_id:
        return error_response("Missing req_id", status=400, code="missing_req_id")
    if not function_name:
        return error_response(
            "Missing function_name",
            status=400,
            code="missing_function_name",
            field_errors=[{"field": "function_name", "message": "Function name is required."}],
        )

    snapshot = body.get("requirements_snapshot")
    if isinstance(snapshot, dict):
        reqs = build_requirements_index(snapshot)
    else:
        reqs = load_requirements()
    if req_id not in reqs["by_id"]:
        return error_response("Requirement not found", status=404, code="requirement_not_found")

    sig = inspect_function_signature(function_name)
    if not sig.get("found"):
        return error_response(
            f"Function '{function_name}' not found",
            status=404,
            code="function_not_found",
            field_errors=[{"field": "function_name", "message": f"Function '{function_name}' not found in functions.py."}],
        )

    try:
        module = load_functions_module()
    except Exception as exc:
        return error_response(
            f"Failed to load functions.py: {exc}",
            status=500,
            code="functions_module_load_error",
            field_errors=[{"field": "function_name", "message": "Could not import functions.py. Check syntax/runtime errors."}],
        )
    if module is None:
        return error_response(
            "functions.py could not be loaded",
            status=500,
            code="functions_module_unavailable",
            field_errors=[{"field": "function_name", "message": "Could not load functions.py."}],
        )
    func = getattr(module, function_name, None)
    if not callable(func):
        return error_response(
            f"Function '{function_name}' is not callable",
            status=400,
            code="function_not_callable",
            field_errors=[{"field": "function_name", "message": f"'{function_name}' is not callable."}],
        )

    def build_kwargs_for_source(source_bounds_field):
        kwargs_lower = {}
        kwargs_upper = {}
        for param in sig.get("params", []):
            if param.startswith("*"):
                continue
            ref = param_refs.get(param) if isinstance(param_refs, dict) else None
            if not isinstance(ref, dict):
                return None, None, error_response(
                    f"Missing propagation inputs for parameter '{param}'",
                    status=400,
                    code="missing_parameter_inputs",
                    field_errors=[{"param": param, "message": "Both lower and upper propagation inputs are required."}],
                )
            try:
                invert_bounds = bool(ref.get("invert_bounds")) if isinstance(ref, dict) else False
                kwargs_lower[param] = resolve_propagation_ref(
                    ref.get("lower_input", ""),
                    reqs["by_id"],
                    default_selector="upper" if invert_bounds else "lower",
                    source_bounds_field=source_bounds_field,
                )
            except ValueError as exc:
                return None, None, error_response(
                    f"Parameter '{param}' lower input: {exc}",
                    status=400,
                    code="parameter_resolution_error",
                    field_errors=[{"param": param, "bound": "lower", "message": str(exc)}],
                )
            try:
                kwargs_upper[param] = resolve_propagation_ref(
                    ref.get("upper_input", ""),
                    reqs["by_id"],
                    default_selector="lower" if invert_bounds else "upper",
                    source_bounds_field=source_bounds_field,
                )
            except ValueError as exc:
                return None, None, error_response(
                    f"Parameter '{param}' upper input: {exc}",
                    status=400,
                    code="parameter_resolution_error",
                    field_errors=[{"param": param, "bound": "upper", "message": str(exc)}],
                )
        return kwargs_lower, kwargs_upper, None

    def evaluate_pair(kwargs_lower, kwargs_upper, label):
        try:
            lower_result = float(func(**kwargs_lower))
        except Exception as exc:
            problem_param = infer_param_from_exception(exc, set(sig.get("params", [])))
            field_errors = []
            if problem_param:
                field_errors.append(
                    {"param": problem_param, "bound": "lower", "message": f"Lower solve failed: {exc}"}
                )
            return None, None, error_response(
                f"Function {label} lower-bound evaluation failed: {exc}",
                status=400,
                code="function_evaluation_error",
                field_errors=field_errors or None,
            )
        try:
            upper_result = float(func(**kwargs_upper))
        except Exception as exc:
            problem_param = infer_param_from_exception(exc, set(sig.get("params", [])))
            field_errors = []
            if problem_param:
                field_errors.append(
                    {"param": problem_param, "bound": "upper", "message": f"Upper solve failed: {exc}"}
                )
            return None, None, error_response(
                f"Function {label} upper-bound evaluation failed: {exc}",
                status=400,
                code="function_evaluation_error",
                field_errors=field_errors or None,
            )
        return lower_result, upper_result, None

    expected_kwargs_lower, expected_kwargs_upper, expected_kwargs_err = build_kwargs_for_source("expected_bounds")
    if expected_kwargs_err:
        return expected_kwargs_err
    expected_lower, expected_upper, expected_eval_err = evaluate_pair(
        expected_kwargs_lower, expected_kwargs_upper, "expected"
    )
    if expected_eval_err:
        return expected_eval_err

    required_kwargs_lower, required_kwargs_upper, required_kwargs_err = build_kwargs_for_source("required_bounds")
    if required_kwargs_err:
        return required_kwargs_err
    required_lower, required_upper, required_eval_err = evaluate_pair(
        required_kwargs_lower, required_kwargs_upper, "required"
    )
    if required_eval_err:
        return required_eval_err

    # Keep evaluation order deterministic: expected first, required second.
    return jsonify(
        {
            "req_id": req_id,
            "expected_bounds": [expected_lower, expected_upper],
            "required_bounds": [required_lower, required_upper],
        }
    )


def _next_requirement_id(all_ids):
    """Return lowest RQ id not yet in use across the whole file (e.g. RQ2 if RQ1,RQ3 exist)."""
    taken = set()
    for key in all_ids or []:
        m = re.match(r"^RQ(\d+)$", str(key).strip(), re.IGNORECASE)
        if m:
            taken.add(int(m.group(1)))
    n = 1
    while n in taken:
        n += 1
    return f"RQ{n}"


def _default_requirement_entry():
    """Return a new requirement dict with default values (matches YAML shape)."""
    return {
        "name": "",
        "solvable_bounds": [0, 0],
        "solvable_distribution": _default_solvable_distribution(),
        "targeted_bounds": [None, None],
        "required_bounds": [0.0, 0.0],
        "expected_bounds": [0.0, 0.0],
        "driven_by": [],
        "relates_to": [],
        "unit": "",
        "status": "analysis",
        "definition": "",
        "value_source": "",
        "comments": [],
        "propagation_function": "",
        "propagation_inputs": {},
        "expected_bounds_from_function": False,
        "required_bounds_from_function": False,
    }


def _normalize_requirement_level(raw_level, fallback="alpha"):
    """Normalize requirement level strings to a supported level."""
    candidate = str(raw_level or fallback).strip().lower()
    return candidate if candidate in REQUIREMENT_LEVELS else fallback


def _normalize_requirement_reference_list(raw_value):
    """Normalize driven_by payloads to at most one requirement ID entry."""
    candidates = raw_value if isinstance(raw_value, list) else ([] if raw_value is None else [raw_value])
    normalized = []
    for candidate in candidates:
        text = str(candidate).strip()
        if text and text.lower() != "none":
            normalized.append(text)
            break
    return normalized


def _normalize_comments_list(raw_value):
    """Normalize comments payloads to a string list."""
    return [str(item) for item in raw_value] if isinstance(raw_value, list) else []


def _normalize_propagation_inputs(raw_value):
    """Normalize propagation input specs for persistence."""
    if not isinstance(raw_value, dict):
        return {}

    cleaned = {}
    for key, raw in raw_value.items():
        if isinstance(raw, dict):
            cleaned[str(key)] = {
                "lower_input": str(raw.get("lower_input", "")).strip(),
                "upper_input": str(raw.get("upper_input", "")).strip(),
                "invert_bounds": bool(raw.get("invert_bounds")),
            }
        else:
            cleaned[str(key)] = raw
    return cleaned


def _normalize_bounds_value(raw_value, fallback):
    """Normalize a 2-item bounds payload to floats, or keep fallback on invalid input."""
    if not isinstance(raw_value, (list, tuple)) or len(raw_value) != 2:
        return list(fallback)
    try:
        return [float(raw_value[0]), float(raw_value[1])]
    except (TypeError, ValueError):
        return list(fallback)


def _normalize_nullable_bounds_value(raw_value, fallback):
    """Normalize a 2-item bounds payload to floats or preserve an all-null unset pair."""
    if not isinstance(raw_value, (list, tuple)) or len(raw_value) != 2:
        return list(fallback)
    if raw_value[0] is None and raw_value[1] is None:
        return [None, None]
    try:
        lower = float(raw_value[0])
        upper = float(raw_value[1])
        return [lower, upper] if lower <= upper else [upper, lower]
    except (TypeError, ValueError):
        return list(fallback)


def _normalize_solvable_distribution(raw_value, fallback=None):
    default = dict(fallback or _default_solvable_distribution())
    if not isinstance(raw_value, dict):
        return default

    bins = []
    for raw_bin in raw_value.get("bins") or []:
        if not isinstance(raw_bin, dict):
            continue
        try:
            x0 = float(raw_bin.get("x0"))
            x1 = float(raw_bin.get("x1"))
            count = int(raw_bin.get("count"))
        except (TypeError, ValueError):
            continue
        bins.append({"x0": min(x0, x1), "x1": max(x0, x1), "count": max(0, count)})

    try:
        normalized = {
            "sample_count": max(0, int(raw_value.get("sample_count", default.get("sample_count", 0)))),
            "min": float(raw_value.get("min", default.get("min", 0.0))),
            "max": float(raw_value.get("max", default.get("max", 0.0))),
            "mean": float(raw_value.get("mean", default.get("mean", 0.0))),
            "std_dev": max(0.0, float(raw_value.get("std_dev", default.get("std_dev", 0.0)))),
            "one_sigma_min": float(raw_value.get("one_sigma_min", default.get("one_sigma_min", 0.0))),
            "one_sigma_max": float(raw_value.get("one_sigma_max", default.get("one_sigma_max", 0.0))),
            "bins": bins,
        }
    except (TypeError, ValueError):
        return default

    normalized["min"], normalized["max"] = sorted((normalized["min"], normalized["max"]))
    normalized["one_sigma_min"] = min(
        normalized["max"], max(normalized["min"], normalized["one_sigma_min"])
    )
    normalized["one_sigma_max"] = min(
        normalized["max"], max(normalized["min"], normalized["one_sigma_max"])
    )
    if normalized["one_sigma_min"] > normalized["one_sigma_max"]:
        normalized["one_sigma_min"], normalized["one_sigma_max"] = (
            normalized["one_sigma_max"],
            normalized["one_sigma_min"],
        )
    return normalized


def _apply_requirement_payload(entry, payload):
    """Apply normalized request payload fields onto a requirement entry."""
    next_entry = dict(entry or {})
    body = payload if isinstance(payload, dict) else {}

    if "name" in body:
        next_entry["name"] = str(body["name"] or "")
    if "unit" in body:
        next_entry["unit"] = str(body["unit"] or "")
    if "status" in body:
        next_entry["status"] = str(body["status"]).strip().lower() or "analysis"
    if "definition" in body:
        next_entry["definition"] = body["definition"] if body["definition"] is not None else ""
    if "value_source" in body:
        next_entry["value_source"] = str(body["value_source"] or "")
    if "comments" in body:
        next_entry["comments"] = _normalize_comments_list(body["comments"])
    if "driven_by" in body:
        next_entry["driven_by"] = _normalize_requirement_reference_list(body["driven_by"])
    if "propagation_function" in body:
        next_entry["propagation_function"] = normalize_propagation_function_name(body["propagation_function"])
    if "propagation_inputs" in body:
        next_entry["propagation_inputs"] = _normalize_propagation_inputs(body["propagation_inputs"])
    if "expected_bounds" in body:
        next_entry["expected_bounds"] = _normalize_bounds_value(
            body["expected_bounds"], next_entry.get("expected_bounds", [0.0, 0.0])
        )
    if "required_bounds" in body:
        next_entry["required_bounds"] = _normalize_bounds_value(
            body["required_bounds"], next_entry.get("required_bounds", [0.0, 0.0])
        )
    if "solvable_bounds" in body:
        next_entry["solvable_bounds"] = _normalize_bounds_value(
            body["solvable_bounds"], next_entry.get("solvable_bounds", [0.0, 0.0])
        )
    if "solvable_distribution" in body:
        next_entry["solvable_distribution"] = _normalize_solvable_distribution(
            body["solvable_distribution"], next_entry.get("solvable_distribution")
        )
    if "targeted_bounds" in body:
        next_entry["targeted_bounds"] = _normalize_nullable_bounds_value(
            body["targeted_bounds"], next_entry.get("targeted_bounds", [None, None])
        )
    if "constrained_bounds" in body:
        next_entry["constrained_bounds"] = _normalize_bounds_value(
            body["constrained_bounds"], next_entry.get("constrained_bounds", [0.0, 0.0])
        )
    if "expected_bounds_from_function" in body:
        next_entry["expected_bounds_from_function"] = bool(body["expected_bounds_from_function"])
    if "required_bounds_from_function" in body:
        next_entry["required_bounds_from_function"] = bool(body["required_bounds_from_function"])
    return next_entry


def _normalize_requirement_tree_payload(raw_requirements):
    """Normalize a full-tree payload into alpha/beta/gamma buckets."""
    payload = raw_requirements if isinstance(raw_requirements, dict) else {}
    buckets = {level: {} for level in REQUIREMENT_LEVELS}
    by_id = payload.get("by_id")

    if isinstance(by_id, dict):
        for req_id, raw_req in by_id.items():
            text_req_id = str(req_id or "").strip()
            if not text_req_id or not isinstance(raw_req, dict):
                continue
            level = _normalize_requirement_level(raw_req.get("level"), "alpha")
            buckets[level][text_req_id] = _apply_requirement_payload(_default_requirement_entry(), raw_req)
        return buckets["alpha"], buckets["beta"], buckets["gamma"]

    for level in REQUIREMENT_LEVELS:
        raw_bucket = payload.get(level) or {}
        if not isinstance(raw_bucket, dict):
            continue
        for req_id, raw_req in raw_bucket.items():
            text_req_id = str(req_id or "").strip()
            if not text_req_id or not isinstance(raw_req, dict):
                continue
            buckets[level][text_req_id] = _apply_requirement_payload(_default_requirement_entry(), raw_req)
    return buckets["alpha"], buckets["beta"], buckets["gamma"]


@app.route("/api/requirements", methods=["POST"])
def api_create_requirement():
    """Create a new requirement in the given level and save to requirements.yaml."""
    body = request.get_json() or {}
    level = (body.get("level") or "").strip().lower()
    if level not in ("alpha", "beta", "gamma"):
        return error_response("Invalid or missing level", status=400, code="invalid_level")
    name = (body.get("name") or "").strip()
    if not name:
        return error_response("Name is required", status=400, code="missing_name")

    reqs = load_requirements()
    new_id = _next_requirement_id((reqs.get("by_id") or {}).keys())
    entry = _apply_requirement_payload(_default_requirement_entry(), body)
    entry["name"] = name

    alpha = dict(reqs["alpha"])
    beta = dict(reqs["beta"])
    gamma = dict(reqs["gamma"])
    if level == "alpha":
        alpha[new_id] = entry
    elif level == "beta":
        beta[new_id] = entry
    else:
        gamma[new_id] = entry
    validation_error = validate_function_driven_requirements(alpha, beta, gamma, req_ids={new_id})
    if validation_error:
        return validation_error
    save_requirements(alpha, beta, gamma)
    saved = load_requirements()["by_id"].get(new_id)
    return jsonify(saved or {**entry, "id": new_id, "level": level})


@app.route("/api/requirements/<req_id>", methods=["PATCH"])
def api_patch_requirement(req_id):
    """Update a single requirement (definition, value_source, propagation, expected bounds metadata)."""
    reqs = load_requirements()
    req = reqs["by_id"].get(req_id)
    if not req:
        return error_response("Requirement not found", status=404, code="requirement_not_found")
    body = request.get_json() or {}
    current_level = req["level"]
    current_level_data = dict(reqs[current_level])
    if req_id not in current_level_data:
        return error_response("Requirement not in level", status=404, code="requirement_not_in_level")

    target_level = current_level
    if "level" in body:
        target_level = _normalize_requirement_level(body["level"], current_level)

    entry = _apply_requirement_payload(dict(current_level_data[req_id]), body)

    alpha = dict(reqs["alpha"])
    beta = dict(reqs["beta"])
    gamma = dict(reqs["gamma"])
    if current_level == "alpha":
        alpha.pop(req_id, None)
    elif current_level == "beta":
        beta.pop(req_id, None)
    else:
        gamma.pop(req_id, None)

    if target_level == "alpha":
        alpha[req_id] = entry
    elif target_level == "beta":
        beta[req_id] = entry
    else:
        gamma[req_id] = entry

    validation_error = validate_function_driven_requirements(alpha, beta, gamma, req_ids={req_id})
    if validation_error:
        return validation_error

    save_requirements(alpha, beta, gamma)
    saved = load_requirements()["by_id"].get(req_id)
    return jsonify(saved or {**entry, "id": req_id, "level": target_level})


@app.route("/api/requirements/tree", methods=["PUT"])
def api_save_requirement_tree():
    """Persist the full requirements tree in one write."""
    body = request.get_json() or {}
    raw_requirements = body.get("requirements") if isinstance(body.get("requirements"), dict) else body
    alpha, beta, gamma = _normalize_requirement_tree_payload(raw_requirements)
    validation_issues = collect_function_driven_requirement_issues(alpha, beta, gamma)
    save_requirements(alpha, beta, gamma)
    payload = load_requirements()
    payload["validation_issues"] = validation_issues
    return no_store_json(payload)


@app.route("/api/samples/resample", methods=["POST"])
def api_resample_requirements():
    """Generate a persisted sample table and update solvable bounds from passing rows."""
    body = request.get_json() or {}
    try:
        sample_count = int(body.get("sample_count", 0))
    except (TypeError, ValueError):
        return error_response("Sample count must be an integer.", status=400, code="invalid_sample_count")
    if sample_count < 1:
        return error_response("Sample count must be at least 1.", status=400, code="invalid_sample_count")

    raw_snapshot = body.get("requirements_snapshot")
    reqs = _normalize_requirements_payload(raw_snapshot) if isinstance(raw_snapshot, dict) else load_requirements()
    validation_error = validate_function_driven_requirements(reqs["alpha"], reqs["beta"], reqs["gamma"])
    if validation_error:
        return validation_error

    try:
        requirement_ids, rows = _evaluate_sample_rows(reqs, sample_count)
        _apply_solvable_bounds_from_rows(reqs, requirement_ids, rows)
        _apply_solvable_distributions_from_rows(reqs, requirement_ids, rows)
    except Exception as exc:
        return error_response(str(exc), status=400, code="resampling_failed")

    save_requirements(reqs["alpha"], reqs["beta"], reqs["gamma"])
    sample_table_payload = _build_sample_table_payload(requirement_ids, rows)
    save_sample_table(sample_table_payload)

    payload = load_requirements()
    payload["sample_table"] = sample_table_payload
    payload["sample_summary"] = sample_table_payload.get("summary", {})
    payload["validation_issues"] = collect_function_driven_requirement_issues(
        payload["alpha"], payload["beta"], payload["gamma"]
    )
    return no_store_json(payload)


@app.route("/api/requirements/<req_id>", methods=["DELETE"])
def api_delete_requirement(req_id):
    """Delete a requirement and save to requirements.yaml."""
    reqs = load_requirements()
    req = reqs["by_id"].get(req_id)
    if not req:
        return jsonify({"error": "Requirement not found"}), 404
    level = req["level"]
    alpha = dict(reqs["alpha"])
    beta = dict(reqs["beta"])
    gamma = dict(reqs["gamma"])
    if level == "alpha":
        alpha.pop(req_id, None)
    elif level == "beta":
        beta.pop(req_id, None)
    else:
        gamma.pop(req_id, None)
    save_requirements(alpha, beta, gamma)
    return "", 204


@app.route("/static/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
