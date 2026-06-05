(function () {
  "use strict";

  const BOX_WIDTH = 240;
  const BASE_BOX_HEIGHT = 128;
  const HEADER_META_FONT_SIZE = 7;
  const HEADER_NAME_FONT_SIZE = 14;
  const HEADER_META_ROW_HEIGHT = 14;
  const HEADER_NAME_LINE_HEIGHT = 15;
  const HEADER_PAD_X = 8;
  const HEADER_PAD_TOP = 4;
  const HEADER_ROW_GAP = 2;
  const HEADER_MIN_HEIGHT = HEADER_PAD_TOP + HEADER_META_ROW_HEIGHT + HEADER_ROW_GAP + HEADER_NAME_LINE_HEIGHT + HEADER_PAD_TOP;
  const BOUNDS_BAR_HEIGHT = 28;
  const BOUNDS_HISTOGRAM_HEIGHT = BOUNDS_BAR_HEIGHT;
  const BOUNDS_TOP_OFFSET = BOUNDS_HISTOGRAM_HEIGHT + 8;
  const BODY_MIN_HEIGHT = Math.max(BASE_BOX_HEIGHT - 40, BOUNDS_TOP_OFFSET + BOUNDS_BAR_HEIGHT + 32);
  const TICK_COUNT = 20;
  const HORZ_GAP = 112;
  const GRID_PITCH = 8;
  const BASE_VERT_GAP = GRID_PITCH * 3;
  const BLUE_CROSS_GAP = 8;
  const RELATES_STUB_LENGTH = GRID_PITCH * 2;
  const RELATES_BUBBLE_CENTER_OFFSET = GRID_PITCH * 3;
  const RELATES_BUBBLE_RADIUS = 11;
  const STAIR_CHILD_OFFSET_X = Math.round(BOX_WIDTH * 0.56 + HORZ_GAP * 0.45);
  const STAIR_ROW_BASE_SHIFT_X = GRID_PITCH * 7;
  const STAIR_ROW_PROGRESS_X = GRID_PITCH * 5;
  const STAIR_SIBLING_STEP_X = GRID_PITCH * 2;
  const STAIR_MIN_SIBLING_GAP_X = HORZ_GAP + GRID_PITCH * 2;
  const MATRIX_COL_STEP_X = BOX_WIDTH + HORZ_GAP;
  const MATRIX_COL_OFFSET_X = 0;
  const MATRIX_ROOT_GAP_COLS = 1;
  const MATRIX_CHILD_BASE_SHIFT_COLS = 0;
  const MATRIX_SIBLING_GAP_COLS = 1;
  const DISPLAY_TOTAL_DIGITS = 5;
  const MIN_TREE_ZOOM = 0.18;
  const MAX_TREE_ZOOM = 4;
  const ZOOM_STEP_FACTOR = 1.1;
  const ZOOM_SLIDER_SCALE = 100;
  const ZOOM_SLIDER_STEP = 1;
  const ZOOM_SLIDER_SNAP_STEPS = 3;
  const LEVELS = ["alpha", "beta", "gamma"];

  let data = { alpha: {}, beta: {}, gamma: {}, by_id: {} };
  let positions = {}; // id -> { x, y, width, height }
  let rowMap = {};    // id -> row index (for gap-based arrow routing)
  let rowTops = {};   // row index -> y top
  let rowHeights = {}; // row index -> max row box height
  let gapSizes = {};  // gap index (between row i and i+1) -> height
  let boxLayouts = {}; // id -> header/text metrics used for rendering and row height
  let textMeasureCtx = null;
  let transform = { x: 0, y: 0, k: 1 };
  let initialTransform = null;
  let viewportEl, canvasEl, gridLayer, arrowsLayer, boxesLayer, relatesOverlayLayer;
  let viewportControlsEl, viewportHomeBtnEl, viewportZoomSliderEl, viewportZoomValueEl, viewportZoomInitialMarkerEl;
  let viewportResizeObserver = null;
  let appMainEl, leftDrawerToggle, leftPanelEl;
  let gridRenderKey = "";
  let viewportRefreshFrame = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let transformStart = { x: 0, y: 0 };
  let selectedReqId = null;
  let conflictsChecked = false;
  let detailPanelComments = []; // current panel's comments (may have unsaved additions)
  let detailPanel, detailToggle, detailTitle, detailNameEditBtn, detailNameInput, detailId, detailType, detailClass, detailStatus, detailUnit, detailUnitInput, detailDrivenBy, detailDrivenByInput, detailDrivenBySuggestions, detailDefinition;
  let detailAttributesWrap, detailAttributesEditBtn, detailClassInput, detailStatusInput, detailDefinitionDisplay;
  let detailDefinitionEditBtn, detailBoundsEditBtn;
  let detailBoundsPlot, detailBoundsConstrained, detailBoundsConstrainedValues, detailBoundsTargeted, detailBoundsTargetedValues, detailBoundsSolvable, detailBoundsSolvableValues, detailBoundsRequired, detailBoundsRequiredValues, detailBoundsExpected, detailBoundsExpectedValues;
  let detailSourceControls;
  let detailExpectedSourceLink, detailExpectedSourceEdit, detailExpectedSourceInput;
  let detailActionsWrap;
  let detailPropagationSection;
  let detailPropagationHeading;
  let detailPropagationFunctionEdit, detailPropagationFunctionRemove, detailPropagationFunctionInput;
  let detailPropagationSuggestions, detailPropagationStatus, detailPropagationParams;
  let detailPropagationSectionVisible = false;
  let isPropagationEditing = false;
  let isNameEditing = false;
  let isAttributesEditing = false;
  let isDefinitionEditing = false;
  let isBoundsEditing = false;
  let lastPropagationSuggestionsRequest = "";
  let currentPropagationParams = [];
  let detailCommentsList;
  let detailCheckConflictsBtn, detailCommitGitBtn, detailDeleteReqBtn;
  let lastDetailReqId = null;
  let currentViewerMode = "tree";
  const DEFAULT_ANALYSIS_MODE = "compliance";
  const DEFAULT_PROJECT = "launcher_001";
  const DEFAULT_BRANCH = "main";
  let currentAnalysisMode = DEFAULT_ANALYSIS_MODE;
  let currentProject = DEFAULT_PROJECT;
  let currentBranch = DEFAULT_BRANCH;
  let isLeftDrawerOpen = true;
  let hasAutoFittedTreeView = false;
  let activeRelatesOverlayReqId = null;
  let tableViewEl;
  let viewerPlaceholderEl;
  let createRequirementBtn;
  let leftPanelSampleCountInput, leftPanelResampleBtn, leftPanelShowSampleTableBtn, leftPanelSampleTableSummaryEl, leftPanelEditBoundsStatusEl;
  let leftPanelHighlightConstraintsBtn, leftPanelHighlightTargetsBtn;
  let sampleTableModalEl, sampleTableModalSummaryEl, sampleTableModalContentEl;
  let tableFilters = {};
  let expectedBoundsFromFunction = false;
  let requiredBoundsFromFunction = false;
  let editingMode = "git";
  let isNewRequirement = false;
  let createdRequirementIdsThisSession = new Set();
  let functionSignatureCache = new Map();
  let latestSampleTable = null;
  let isResampling = false;
  let activeBoundsHighlightMode = null;
  const FUNCTION_CALCULATION_COMMENT = "Expected and required bounds were calculated by the propagation function during conflict check.";

  function isDetailPanelEditable() {
    return editingMode !== "deactivated";
  }

  function formatDisplayValue(rawValue) {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return String(rawValue ?? "");
    if (Number.isInteger(numericValue)) return String(numericValue);
    const absValue = Math.abs(numericValue);
    const integerDigits = absValue < 1 ? 1 : Math.floor(Math.log10(absValue)) + 1;
    const decimalPlaces = Math.max(0, DISPLAY_TOTAL_DIGITS - integerDigits);
    const rounded = numericValue.toFixed(decimalPlaces);
    return rounded.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  function formatEditableNumberValue(rawValue) {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return String(rawValue ?? "");
    return String(numericValue);
  }

  function isNoneBoundsValue(rawValue) {
    return rawValue === null || rawValue === undefined || String(rawValue).trim().toLowerCase() === "none";
  }

  function isUnsetBoundsPair(rawBounds) {
    return Array.isArray(rawBounds) && rawBounds.length >= 2 && rawBounds[0] == null && rawBounds[1] == null;
  }

  function formatBoundDisplayValue(rawValue) {
    return isNoneBoundsValue(rawValue) ? "NONE" : formatDisplayValue(rawValue);
  }

  function formatEditableBoundValue(rawValue) {
    return isNoneBoundsValue(rawValue) ? "NONE" : formatEditableNumberValue(rawValue);
  }

  function formatRequirementType(rawValue) {
    const text = String(rawValue || "").trim();
    return text ? text.replace(/_/g, " ").toUpperCase() : "";
  }

  function toFiniteNumber(rawValue, fallback) {
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : Number(fallback) || 0;
  }

  function normalizeBoundsPair(rawBounds, fallbackBounds) {
    const fallback = Array.isArray(fallbackBounds) && fallbackBounds.length >= 2
      ? [toFiniteNumber(fallbackBounds[0], 0), toFiniteNumber(fallbackBounds[1], 0)]
      : [0, 0];
    if (!Array.isArray(rawBounds) || rawBounds.length < 2) return fallback.slice();
    const normalized = [
      toFiniteNumber(rawBounds[0], fallback[0]),
      toFiniteNumber(rawBounds[1], fallback[1])
    ];
    if (normalized[0] > normalized[1]) {
      return [normalized[1], normalized[0]];
    }
    return normalized;
  }

  function normalizeNullableBoundsPair(rawBounds, fallbackBounds) {
    const fallback = isUnsetBoundsPair(fallbackBounds)
      ? [null, null]
      : normalizeBoundsPair(fallbackBounds, [0, 0]);
    if (!Array.isArray(rawBounds) || rawBounds.length < 2) return fallback.slice();
    if (isNoneBoundsValue(rawBounds[0]) && isNoneBoundsValue(rawBounds[1])) {
      return [null, null];
    }
    if (isNoneBoundsValue(rawBounds[0]) || isNoneBoundsValue(rawBounds[1])) {
      return [null, null];
    }
    const lower = Number(rawBounds[0]);
    const upper = Number(rawBounds[1]);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return fallback.slice();
    return normalizeBoundsPair([lower, upper], [lower, upper]);
  }

  function getNormalizedRequirementBounds(req) {
    const safeReq = req && typeof req === "object" ? req : {};
    const constrained = normalizeBoundsPair(safeReq.constrained_bounds, [0, 0]);
    const targeted = normalizeNullableBoundsPair(safeReq.targeted_bounds, [null, null]);
    const solvable = normalizeBoundsPair(safeReq.solvable_bounds, [0, 1]);
    const required = normalizeBoundsPair(safeReq.required_bounds, solvable);
    const expected = normalizeBoundsPair(safeReq.expected_bounds, required);
    return { constrained, targeted, solvable, required, expected };
  }

  function defaultSolvableDistribution(solvableBounds) {
    const [min, max] = normalizeBoundsPair(solvableBounds, [0, 0]);
    const mean = (min + max) / 2;
    return {
      sample_count: 0,
      min,
      max,
      mean,
      std_dev: 0,
      one_sigma_min: mean,
      one_sigma_max: mean,
      bins: []
    };
  }

  function normalizeSolvableDistribution(rawDistribution, solvableBounds) {
    const fallback = defaultSolvableDistribution(solvableBounds);
    if (!rawDistribution || typeof rawDistribution !== "object") return fallback;

    const min = fallback.min;
    const max = fallback.max;
    const sampleCount = Math.max(0, Math.round(toFiniteNumber(rawDistribution.sample_count, fallback.sample_count)));
    const mean = toFiniteNumber(rawDistribution.mean, fallback.mean);
    const stdDev = Math.max(0, toFiniteNumber(rawDistribution.std_dev, fallback.std_dev));
    let oneSigmaMin = toFiniteNumber(rawDistribution.one_sigma_min, mean - stdDev);
    let oneSigmaMax = toFiniteNumber(rawDistribution.one_sigma_max, mean + stdDev);
    oneSigmaMin = Math.min(max, Math.max(min, oneSigmaMin));
    oneSigmaMax = Math.min(max, Math.max(min, oneSigmaMax));
    if (oneSigmaMin > oneSigmaMax) {
      const swappedMin = oneSigmaMax;
      oneSigmaMax = oneSigmaMin;
      oneSigmaMin = swappedMin;
    }

    const bins = Array.isArray(rawDistribution.bins)
      ? rawDistribution.bins.map((rawBin) => {
        const x0 = Math.min(max, Math.max(min, toFiniteNumber(rawBin && rawBin.x0, min)));
        const x1 = Math.min(max, Math.max(min, toFiniteNumber(rawBin && rawBin.x1, max)));
        return {
          x0: Math.min(x0, x1),
          x1: Math.max(x0, x1),
          count: Math.max(0, Math.round(toFiniteNumber(rawBin && rawBin.count, 0)))
        };
      }).filter((bin) => Number.isFinite(bin.x0) && Number.isFinite(bin.x1))
      : [];

    return {
      sample_count: sampleCount,
      min,
      max,
      mean: Math.min(max, Math.max(min, mean)),
      std_dev: stdDev,
      one_sigma_min: oneSigmaMin,
      one_sigma_max: oneSigmaMax,
      bins
    };
  }

  function syncRequirementSolvableDistribution(req) {
    if (!req || typeof req !== "object") return req;
    req.solvable_bounds = normalizeBoundsPair(req.solvable_bounds, [0, 1]);
    req.solvable_distribution = normalizeSolvableDistribution(req.solvable_distribution, req.solvable_bounds);
    return req;
  }

  function buildSmoothPath(points, closePath) {
    if (!Array.isArray(points) || points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      d += ` L ${points[1].x} ${points[1].y}`;
    } else {
      for (let i = 1; i < points.length - 2; i += 1) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
      }
      const penultimate = points[points.length - 2];
      const last = points[points.length - 1];
      d += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y}`;
    }
    if (closePath) d += " Z";
    return d;
  }

  function buildSmoothedHistogramCounts(bins) {
    const counts = Array.isArray(bins) ? bins.map((bin) => Math.max(0, Number(bin && bin.count) || 0)) : [];
    if (!counts.length) return [];
    return counts.map((count, index) => {
      const prev = counts[Math.max(0, index - 1)];
      const next = counts[Math.min(counts.length - 1, index + 1)];
      return ((prev + (2 * count) + next) / 4);
    });
  }

  function appendSolvableDistributionOverlay(parentEl, req, toX, options) {
    if (!parentEl || typeof toX !== "function") return;
    const opts = options || {};
    const distribution = normalizeSolvableDistribution(
      req && req.solvable_distribution,
      req && req.solvable_bounds
    );
    if (!distribution.sample_count || !distribution.bins.length) return;

    const baseY = toFiniteNumber(opts.baseY, 0);
    const height = Math.max(2, toFiniteNumber(opts.height, 8));
    const sigmaTopY = toFiniteNumber(opts.sigmaTopY, baseY - height);
    const sigmaBottomY = toFiniteNumber(opts.sigmaBottomY, baseY + height);
    const startX = toX(distribution.min);
    const endX = toX(distribution.max);
    const overlayGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    overlayGroup.setAttribute("class", "req-solvable-distribution");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `Passing samples: ${distribution.sample_count}; mean ${formatDisplayValue(distribution.mean)}; std ${formatDisplayValue(distribution.std_dev)}`;
    overlayGroup.appendChild(title);

    const sigmaValues = [distribution.one_sigma_min, distribution.one_sigma_max];
    sigmaValues.forEach((sigmaValue) => {
      const sigmaLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      sigmaLine.setAttribute("class", "req-solvable-sigma-line");
      sigmaLine.setAttribute("x1", toX(sigmaValue));
      sigmaLine.setAttribute("y1", sigmaTopY);
      sigmaLine.setAttribute("x2", toX(sigmaValue));
      sigmaLine.setAttribute("y2", sigmaBottomY);
      overlayGroup.appendChild(sigmaLine);
    });

    if (Math.abs(endX - startX) < 0.5) {
      const collapsedLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      collapsedLine.setAttribute("class", "req-solvable-curve");
      collapsedLine.setAttribute("x1", startX);
      collapsedLine.setAttribute("y1", baseY - height);
      collapsedLine.setAttribute("x2", endX);
      collapsedLine.setAttribute("y2", baseY);
      overlayGroup.appendChild(collapsedLine);
      parentEl.appendChild(overlayGroup);
      return;
    }

    const smoothedCounts = buildSmoothedHistogramCounts(distribution.bins);
    const maxCount = Math.max(...smoothedCounts, 0);
    if (maxCount <= 0) {
      parentEl.appendChild(overlayGroup);
      return;
    }

    const curvePoints = [{ x: startX, y: baseY }];
    distribution.bins.forEach((bin, index) => {
      const centerValue = (bin.x0 + bin.x1) / 2;
      const amplitude = smoothedCounts[index] / maxCount;
      curvePoints.push({
        x: toX(centerValue),
        y: baseY - (amplitude * height)
      });
    });
    curvePoints.push({ x: endX, y: baseY });

    const fillPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fillPath.setAttribute("class", "req-solvable-curve-fill");
    fillPath.setAttribute("d", buildSmoothPath(curvePoints, true));
    overlayGroup.appendChild(fillPath);

    const strokePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    strokePath.setAttribute("class", "req-solvable-curve");
    strokePath.setAttribute("d", buildSmoothPath(curvePoints, false));
    overlayGroup.appendChild(strokePath);

    parentEl.appendChild(overlayGroup);
  }

  function formatAxisTickValue(rawValue, axisRange) {
    const numericValue = Number(rawValue);
    const totalRange = Math.abs(Number(axisRange));
    if (!Number.isFinite(numericValue)) return String(rawValue ?? "");

    // Prefer integer tick labels for normal ranges to avoid noisy decimals.
    if (!Number.isFinite(totalRange) || totalRange >= 1) {
      return Math.round(numericValue).toString();
    }

    // For very small ranges, keep just enough decimals to differentiate ticks.
    const rangeOrder = Math.floor(Math.log10(totalRange));
    const decimalPlaces = Math.max(1, Math.min(6, -rangeOrder + 1));
    const rounded = Number(numericValue.toFixed(decimalPlaces));
    return rounded.toFixed(decimalPlaces).replace(/\.?0+$/, "");
  }

  function updateCalculatedMarkers() {
    if (detailBoundsExpected) {
      detailBoundsExpected.classList.toggle("detail-panel__bounds-values--from-function", expectedBoundsFromFunction);
    }
    if (detailBoundsRequired) {
      detailBoundsRequired.classList.toggle("detail-panel__bounds-values--from-function", requiredBoundsFromFunction);
    }
  }

  function lockCommitButton() {
    if (detailCommitGitBtn) detailCommitGitBtn.disabled = true;
  }

  function unlockCommitButton() {
    if (detailCommitGitBtn) detailCommitGitBtn.disabled = false;
  }

  function normalizeDrivenByValue(rawValue) {
    if (Array.isArray(rawValue)) {
      for (let i = 0; i < rawValue.length; i += 1) {
        const normalized = normalizeDrivenByValue(rawValue[i]);
        if (normalized) return normalized;
      }
      return "";
    }
    if (rawValue === null || rawValue === undefined) return "";
    const text = String(rawValue).trim();
    if (!text || text.toLowerCase() === "none") return "";
    return text;
  }

  function normalizePropagationFunctionName(rawValue) {
    const text = String(rawValue || "").trim();
    if (!text || text.toLowerCase() === "none") return "";
    return text;
  }

  function normalizeRequirementDrivenBy(req) {
    if (!req || typeof req !== "object") return req;
    req.driven_by = normalizeDrivenByValue(req.driven_by);
    return req;
  }

  function normalizeRequirementPropagationFunction(req) {
    if (!req || typeof req !== "object") return req;
    req.propagation_function = normalizePropagationFunctionName(req.propagation_function);
    return req;
  }

  function syncConstrainedBoundsForRequirement(req) {
    if (!req || typeof req !== "object") return req;
    if (isConstraintStubRequirementType(req.type)) {
      req.constrained_bounds = normalizeBoundsPair(req.constrained_bounds, [0, 0]);
      delete req.targeted_bounds;
    } else {
      delete req.constrained_bounds;
      req.targeted_bounds = normalizeNullableBoundsPair(req.targeted_bounds, [null, null]);
    }
    return req;
  }

  function computeRequirementTypeMap(byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const referencedBy = {};
    Object.keys(nextById).forEach((reqId) => {
      referencedBy[reqId] = new Set();
    });
    Object.entries(nextById).forEach(([reqId, req]) => {
      const drivenById = normalizeDrivenByValue(req && req.driven_by);
      if (!drivenById || !nextById[drivenById] || !referencedBy[drivenById]) return;
      referencedBy[drivenById].add(reqId);
    });

    const typeMap = {};
    Object.entries(nextById).forEach(([reqId, req]) => {
      const drivenById = normalizeDrivenByValue(req && req.driven_by);
      const hasValidDriver = Boolean(drivenById && nextById[drivenById]);
      const hasDependents = Boolean(referencedBy[reqId] && referencedBy[reqId].size > 0);
      if (!hasDependents) {
        const functionName = normalizePropagationFunctionName(req && req.propagation_function);
        typeMap[reqId] = functionName ? "function_stub" : "constrain_stub";
      } else if (!hasValidDriver) {
        typeMap[reqId] = "top_stub";
      } else {
        typeMap[reqId] = "branch";
      }
  });
    return typeMap;
  }

  function applyDerivedRequirementTypes(requirementsData) {
    const next = requirementsData && typeof requirementsData === "object" ? requirementsData : null;
    if (!next) return next;
    const typeMap = computeRequirementTypeMap(next.by_id || {});
    Object.entries(next.by_id || {}).forEach(([reqId, req]) => {
      if (req && typeof req === "object") {
        req.type = typeMap[reqId] || "top_stub";
        syncConstrainedBoundsForRequirement(req);
      }
    });
    LEVELS.forEach((level) => {
      Object.entries(next[level] || {}).forEach(([reqId, req]) => {
        if (req && typeof req === "object") {
          req.type = typeMap[reqId] || "top_stub";
          syncConstrainedBoundsForRequirement(req);
        }
      });
    });
    return next;
  }

  function isFunctionDrivenRequirementType(rawValue) {
    const type = String(rawValue || "").trim().toLowerCase();
    return type === "branch" || type === "top_stub" || type === "function_stub";
  }

  function requiresPropagationFunctionType(rawValue) {
    return String(rawValue || "").trim().toLowerCase() === "branch";
  }

  function isFunctionDrivenRequirement(req) {
    return Boolean(req && isFunctionDrivenRequirementType(req.type));
  }

  function isConstraintStubRequirementType(rawValue) {
    return String(rawValue || "").trim().toLowerCase() === "constrain_stub";
  }

  function isRemovableFunctionStubRequirementType(rawValue) {
    return String(rawValue || "").trim().toLowerCase() === "function_stub";
  }

  function isPropagationConfigurableRequirementType(rawValue) {
    return isFunctionDrivenRequirementType(rawValue) || isConstraintStubRequirementType(rawValue);
  }

  function shouldShowPropagationSectionForType(rawValue) {
    if (isFunctionDrivenRequirementType(rawValue)) return true;
    return editingMode !== "deactivated" && isConstraintStubRequirementType(rawValue);
  }

  function isDetailPanelPropagationEditable(reqType) {
    return isDetailPanelEditable() && shouldShowPropagationSectionForType(reqType);
  }

  function hasDefinedConstrainedBounds(req) {
    if (!req || !isConstraintStubRequirementType(req.type)) return false;
    if (!Array.isArray(req.constrained_bounds) || req.constrained_bounds.length !== 2) return false;
    return req.constrained_bounds.every((value) => Number.isFinite(Number(value)));
  }

  function hasDefinedTargetedBounds(req) {
    if (!req || isConstraintStubRequirementType(req.type)) return false;
    const { targeted } = getNormalizedRequirementBounds(req);
    return !isUnsetBoundsPair(targeted);
  }

  function shouldHighlightRequirementBounds(req) {
    if (activeBoundsHighlightMode === "constraints") return hasDefinedConstrainedBounds(req);
    if (activeBoundsHighlightMode === "targets") return hasDefinedTargetedBounds(req);
    return false;
  }

  function compareRequirementIds(leftId, rightId) {
    return String(leftId || "").localeCompare(String(rightId || ""), undefined, { numeric: true, sensitivity: "base" });
  }

  function extractPropagationDependencyRequirementIdsFromInputs(inputSpecs, byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const specs = inputSpecs && typeof inputSpecs === "object" ? inputSpecs : {};
    const refs = new Set();
    Object.values(specs).forEach((rawSpec) => {
      if (!rawSpec || typeof rawSpec !== "object") return;
      ["lower_input", "upper_input"].forEach((key) => {
        const text = String(rawSpec[key] || "").trim();
        if (!text || text.toLowerCase() === "none") return;
        if (text.length >= 2 && (
          (text[0] === "(" && text[text.length - 1] === ")")
          || (text[0] === "'" && text[text.length - 1] === "'")
          || (text[0] === '"' && text[text.length - 1] === '"')
        )) {
          return;
        }
        if (!Number.isNaN(Number(text))) return;
        const parts = text.split(/\s+/);
        const candidateId = parts[0];
        if (!candidateId || !nextById[candidateId]) return;
        if (parts.length === 1 || (parts.length === 2 && /^(lower|upper)$/i.test(parts[1]))) {
          refs.add(candidateId);
        }
      });
    });
    return Array.from(refs).sort(compareRequirementIds);
  }

  function hasCompletePropagationInputSpecs(inputSpecs) {
    const specs = inputSpecs && typeof inputSpecs === "object" ? inputSpecs : {};
    const values = Object.values(specs);
    if (!values.length) return false;
    return values.every((rawSpec) => (
      rawSpec
      && typeof rawSpec === "object"
      && String(rawSpec.lower_input || "").trim()
      && String(rawSpec.upper_input || "").trim()
    ));
  }

  function clonePropagationInputSpecs(inputSpecs) {
    return inputSpecs && typeof inputSpecs === "object"
      ? JSON.parse(JSON.stringify(inputSpecs))
      : {};
  }

  function hasEvaluablePropagationInputSpecs(functionName, inputSpecs) {
    const normalizedFunctionName = normalizePropagationFunctionName(functionName);
    const specs = inputSpecs && typeof inputSpecs === "object" ? inputSpecs : {};
    if (!normalizedFunctionName) return false;

    const signature = functionSignatureCache.get(normalizedFunctionName);
    if (signature) {
      if (!signature.found) return false;
      const requiredParams = Array.isArray(signature.params)
        ? signature.params.filter((paramName) => !String(paramName || "").startsWith("*"))
        : [];
      if (!requiredParams.length) return true;
      return requiredParams.every((paramName) => {
        const rawSpec = specs[paramName];
        return rawSpec
          && typeof rawSpec === "object"
          && String(rawSpec.lower_input || "").trim()
          && String(rawSpec.upper_input || "").trim();
      });
    }

    return hasCompletePropagationInputSpecs(specs);
  }

  function getPropagationInputSpecs(reqId) {
    const req = data.by_id[reqId];
    if (!req) return {};
    const functionName = normalizePropagationFunctionName(req.propagation_function);
    const storedInputs = clonePropagationInputSpecs(req.propagation_inputs);
    if (reqId === selectedReqId) {
      const selectedInputs = collectPropagationInputs();
      if (hasEvaluablePropagationInputSpecs(functionName, selectedInputs)) {
        return selectedInputs;
      }
    }
    return hasEvaluablePropagationInputSpecs(functionName, storedInputs) ? storedInputs : {};
  }

  function getPropagationDependencyRequirementIds(reqId, byId) {
    return extractPropagationDependencyRequirementIdsFromInputs(getPropagationInputSpecs(reqId), byId);
  }

  function getDrivenByRequirementId(req, byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const drivenById = normalizeDrivenByValue(req && req.driven_by);
    return drivenById && nextById[drivenById] ? drivenById : "";
  }

  function getDrivenByBranchRequirementIds(startReqId, byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const branchReqIds = [];
    const seen = new Set();
    let currentId = startReqId;
    while (currentId && nextById[currentId]) {
      if (seen.has(currentId)) {
        throw new Error(`Requirement hierarchy cycle detected at ${currentId}.`);
      }
      seen.add(currentId);
      branchReqIds.push(currentId);
      currentId = getDrivenByRequirementId(nextById[currentId], nextById);
    }
    return branchReqIds;
  }

  function buildPropagationEvaluationPlan(byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const typeMap = computeRequirementTypeMap(nextById);
    return {
      constraintStubReqIds: Object.keys(nextById)
        .filter((reqId) => (typeMap[reqId] || "").toLowerCase() === "constrain_stub")
        .sort(compareRequirementIds),
      functionStubReqIds: Object.keys(nextById)
        .filter((reqId) => (typeMap[reqId] || "").toLowerCase() === "function_stub")
        .sort(compareRequirementIds)
    };
  }

  function clearDetailPropagationStatus() {
    if (!detailPropagationStatus) return;
    detailPropagationStatus.textContent = "";
    detailPropagationStatus.classList.remove("detail-panel__propagation-status--error");
  }

  function setDetailPropagationVisibility(visible) {
    const shouldShow = Boolean(visible);
    detailPropagationSectionVisible = shouldShow;
    if (detailPropagationHeading) {
      detailPropagationHeading.classList.toggle("detail-panel__section-head--hidden", !shouldShow);
      detailPropagationHeading.hidden = !shouldShow;
      detailPropagationHeading.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }
    if (detailPropagationSection) {
      detailPropagationSection.classList.toggle("detail-panel__propagation-section--hidden", !shouldShow);
      detailPropagationSection.hidden = !shouldShow;
      detailPropagationSection.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    }
    if (shouldShow) return;
    if (isPropagationEditing) {
      setPropagationEditMode(false);
    } else {
      updatePropagationFunctionButton();
      setPropagationParamInputsEditable(false);
    }
    clearPropagationSuggestions();
    clearPropagationErrors();
    clearDetailPropagationStatus();
  }

  function getCurrentDetailPropagationState(baseReq, reqType) {
    const sourceReq = baseReq && typeof baseReq === "object" ? baseReq : {};
    if (!shouldShowPropagationSectionForType(reqType)) {
      return {
        propagation_function: normalizePropagationFunctionName(sourceReq.propagation_function),
        propagation_inputs: clonePropagationInputSpecs(sourceReq.propagation_inputs)
      };
    }
    const liveFunctionName = normalizePropagationFunctionName(
      detailPropagationFunctionInput && detailPropagationFunctionInput.value !== undefined
        ? detailPropagationFunctionInput.value
        : sourceReq.propagation_function
    );
    const liveInputs = clonePropagationInputSpecs(collectPropagationInputs());
    const hasRenderedParamRows = Boolean(
      detailPropagationParams && detailPropagationParams.querySelector(".detail-panel__param-row")
    );
    if (!hasRenderedParamRows) {
      return {
        propagation_function: liveFunctionName,
        propagation_inputs: clonePropagationInputSpecs(sourceReq.propagation_inputs)
      };
    }
    return {
      propagation_function: liveFunctionName,
      propagation_inputs: liveInputs
    };
  }

  function refreshDetailPanelTypeDependentUI(options) {
    const opts = options || {};
    const wasPropagationVisible = detailPropagationSectionVisible;
    const draftReq = buildDetailPanelDraftRequirement();
    const shouldPreferSourceReq = Boolean(opts.req) && (opts.loadPropagation || opts.loadPropagationOnShow);
    const req = shouldPreferSourceReq ? opts.req : ((isDetailPanelEditable() && draftReq) ? draftReq : (opts.req || draftReq));
    const reqType = refreshDetailPanelDerivedType();
    const renderReq = req ? { ...req, type: reqType } : null;
    if (renderReq) {
      renderDetailBoundsPlot(renderReq);
      fillDetailBoundsBoxes(renderReq);
    }
    if (!shouldShowPropagationSectionForType(reqType)) {
      return Promise.resolve(renderReq);
    }
    if (opts.loadPropagation || (!wasPropagationVisible && opts.loadPropagationOnShow)) {
      return loadPropagationFunctionState(renderReq).then(() => renderReq);
    }
    return Promise.resolve(renderReq);
  }

  function fetchFunctionSignature(functionName) {
    const name = normalizePropagationFunctionName(functionName);
    if (!name) return Promise.resolve({ name, found: false, params: [] });
    return fetch(`/api/functions/lookup?name=${encodeURIComponent(name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        const normalized = {
          name,
          found: Boolean(result && result.found),
          params: Array.isArray(result && result.params) ? result.params : []
        };
        functionSignatureCache.set(name, normalized);
        return normalized;
      });
  }

  function getRequirementValidationMessage(req) {
    if (!req || !isFunctionDrivenRequirement(req)) return "";
    const reqId = String(req.id || "").trim();
    const functionName = normalizePropagationFunctionName(req.propagation_function);
    if (!functionName) {
      if (!requiresPropagationFunctionType(req.type)) return "";
      return reqId
        ? `Requirement "${reqId}" requires a propagation function.`
        : "This requirement requires a propagation function.";
    }

    const signature = functionSignatureCache.get(functionName);
    if (!signature) return "";
    if (!signature.found) {
      return `Function "${functionName}" could not be found in functions.py.`;
    }

    const propagationInputs = req.propagation_inputs && typeof req.propagation_inputs === "object"
      ? req.propagation_inputs
      : {};
    const missingParams = [];
    signature.params.forEach((paramName) => {
      if (String(paramName).startsWith("*")) return;
      const spec = propagationInputs[paramName];
      const lowerInput = spec && typeof spec === "object" ? String(spec.lower_input || "").trim() : "";
      const upperInput = spec && typeof spec === "object" ? String(spec.upper_input || "").trim() : "";
      if (!lowerInput || !upperInput) missingParams.push(paramName);
    });
    if (!missingParams.length) return "";
    if (missingParams.length === 1) {
      return `Requirement "${reqId}" is missing inputs for parameter "${missingParams[0]}".`;
    }
    return `Requirement "${reqId}" is missing inputs for parameters: ${missingParams.join(", ")}.`;
  }

  function applyRequirementValidationState(requirementsData) {
    const next = requirementsData && typeof requirementsData === "object" ? requirementsData : null;
    if (!next) return next;
    Object.entries(next.by_id || {}).forEach(([reqId, req]) => {
      if (!req || typeof req !== "object") return;
      const message = getRequirementValidationMessage(req);
      if (message) req.validation_error = message;
      else delete req.validation_error;

      const level = String(req.level || "").toLowerCase();
      if (level && next[level] && next[level][reqId] && typeof next[level][reqId] === "object") {
        if (message) next[level][reqId].validation_error = message;
        else delete next[level][reqId].validation_error;
      }
    });
    return next;
  }

  function preloadRequirementValidationState(requirementsData) {
    const next = requirementsData && typeof requirementsData === "object" ? requirementsData : null;
    if (!next) return Promise.resolve(next);
    const names = Array.from(new Set(
      Object.values(next.by_id || {})
        .filter((req) => isFunctionDrivenRequirement(req))
        .map((req) => normalizePropagationFunctionName(req.propagation_function))
        .filter(Boolean)
    ));
    if (!names.length) {
      applyRequirementValidationState(next);
      return Promise.resolve(next);
    }
    return Promise.allSettled(names.map((name) => fetchFunctionSignature(name)))
      .then(() => {
        applyRequirementValidationState(next);
        return next;
      });
  }

  function normalizeRequirementsData(rawData) {
    const next = rawData && typeof rawData === "object" ? rawData : {};
    next.validation_issues = Array.isArray(next.validation_issues) ? next.validation_issues : [];
    LEVELS.forEach((level) => {
      if (!next[level] || typeof next[level] !== "object") {
        next[level] = {};
      }
      Object.values(next[level]).forEach((req) => {
        normalizeRequirementDrivenBy(req);
        normalizeRequirementPropagationFunction(req);
        syncRequirementSolvableDistribution(req);
      });
    });
    if (!next.by_id || typeof next.by_id !== "object") {
      next.by_id = {};
    }
    Object.values(next.by_id).forEach((req) => {
      normalizeRequirementDrivenBy(req);
      normalizeRequirementPropagationFunction(req);
      syncRequirementSolvableDistribution(req);
    });
    applyDerivedRequirementTypes(next);
    applyRequirementValidationState(next);
    return next;
  }

  function hasPersistedSampleTable(sampleTable) {
    if (!sampleTable || typeof sampleTable !== "object") return false;
    const rows = Array.isArray(sampleTable.rows) ? sampleTable.rows : [];
    const columns = Array.isArray(sampleTable.columns) ? sampleTable.columns : [];
    return Boolean(sampleTable.generated_at) || rows.length > 0 || columns.length > 0;
  }

  function formatSampleTableSummary(sampleTable) {
    const tableData = sampleTable && typeof sampleTable === "object" ? sampleTable : {};
    const rows = Array.isArray(tableData.rows) ? tableData.rows : [];
    const summary = tableData.summary && typeof tableData.summary === "object" ? tableData.summary : {};
    const generatedAt = tableData.generated_at ? new Date(tableData.generated_at) : null;
    const generatedText = generatedAt && !Number.isNaN(generatedAt.getTime())
      ? generatedAt.toLocaleString()
      : "Not available";
    const sampleCount = Number.isFinite(Number(tableData.sample_count)) ? Number(tableData.sample_count) : rows.length;
    return `${sampleCount} rows, ${summary.pass_count || 0} pass, ${summary.fail_count || 0} fail. Generated ${generatedText}.`;
  }

  function renderLeftPanelSampleTableSummary(sampleTable) {
    if (!leftPanelSampleTableSummaryEl) return;
    leftPanelSampleTableSummaryEl.textContent = hasPersistedSampleTable(sampleTable)
      ? formatSampleTableSummary(sampleTable)
      : "No persisted sample table is available yet.";
  }

  function setDetailStatusMessage(message, isError) {
    if (!leftPanelEditBoundsStatusEl) return;
    leftPanelEditBoundsStatusEl.textContent = String(message || "");
    leftPanelEditBoundsStatusEl.classList.toggle(
      "left-panel__status--error",
      Boolean(message) && Boolean(isError)
    );
  }

  function refreshRequirementsFromPayload(payload) {
    data = normalizeRequirementsData(payload);
    updateLeftPanelMetrics();
    refreshActiveViewer();
    if (
      selectedReqId
      && data.by_id[selectedReqId]
      && detailPanel
      && !detailPanel.classList.contains("detail-panel--closed")
    ) {
      openDetailPanel(data.by_id[selectedReqId]);
    }
  }

  function getRequestedSampleCount() {
    const rawValue = leftPanelSampleCountInput ? leftPanelSampleCountInput.value : "";
    const sampleCount = Number.parseInt(String(rawValue || "").trim(), 10);
    if (!Number.isInteger(sampleCount) || sampleCount < 1) {
      throw new Error("Sample count must be an integer greater than 0.");
    }
    return sampleCount;
  }

  function serializeSampleCellValue(columnKey, value) {
    if (columnKey === "pass") return value ? "PASS" : "FAIL";
    if (typeof value === "number" && Number.isFinite(value)) return formatDisplayValue(value);
    return serializeTableValue(value);
  }

  function closeSampleTableModal() {
    if (!sampleTableModalEl) return;
    sampleTableModalEl.classList.add("sample-table-modal--hidden");
    sampleTableModalEl.setAttribute("aria-hidden", "true");
  }

  function ensureSampleTableModal() {
    if (sampleTableModalEl) return sampleTableModalEl;
    sampleTableModalEl = document.createElement("div");
    sampleTableModalEl.className = "sample-table-modal sample-table-modal--hidden";
    sampleTableModalEl.setAttribute("aria-hidden", "true");
    sampleTableModalEl.innerHTML = `
      <div class="sample-table-modal__backdrop" data-sample-modal-close="true"></div>
      <div class="sample-table-modal__dialog" role="dialog" aria-modal="true" aria-label="Sample table">
        <div class="sample-table-modal__header">
          <h2 class="sample-table-modal__title">Sample Table</h2>
          <button type="button" class="sample-table-modal__close" data-sample-modal-close="true" aria-label="Close sample table">×</button>
        </div>
        <div class="sample-table-modal__summary"></div>
        <div class="sample-table-modal__content"></div>
      </div>
    `;
    sampleTableModalSummaryEl = sampleTableModalEl.querySelector(".sample-table-modal__summary");
    sampleTableModalContentEl = sampleTableModalEl.querySelector(".sample-table-modal__content");
    sampleTableModalEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.sampleModalClose === "true") {
        closeSampleTableModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && sampleTableModalEl && !sampleTableModalEl.classList.contains("sample-table-modal--hidden")) {
        closeSampleTableModal();
      }
    });
    document.body.appendChild(sampleTableModalEl);
    return sampleTableModalEl;
  }

  function renderSampleTableModal(sampleTable) {
    const modal = ensureSampleTableModal();
    const tableData = sampleTable && typeof sampleTable === "object" ? sampleTable : {};
    const columns = Array.isArray(tableData.columns) ? tableData.columns : [];
    const rows = Array.isArray(tableData.rows) ? tableData.rows : [];
    sampleTableModalSummaryEl.textContent = hasPersistedSampleTable(tableData)
      ? formatSampleTableSummary(tableData)
      : "No persisted sample table is available yet.";
    sampleTableModalContentEl.innerHTML = "";

    if (!columns.length || !rows.length) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "requirements-table__empty";
      emptyEl.textContent = "No persisted sample table is available yet.";
      sampleTableModalContentEl.appendChild(emptyEl);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "sample-table-view";
      const tableWrap = document.createElement("div");
      tableWrap.className = "requirements-table-wrap";
      const table = document.createElement("table");
      table.className = "requirements-table sample-table";
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      columns.forEach((column) => {
        const th = document.createElement("th");
        th.textContent = String(column && column.label ? column.label : column && column.key ? column.key : "");
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      const tbody = document.createElement("tbody");
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        columns.forEach((column) => {
          const key = String(column && column.key ? column.key : "");
          const td = document.createElement("td");
          const text = serializeSampleCellValue(key, row ? row[key] : "");
          td.textContent = text;
          td.title = text;
          if (key === "sample_no") td.classList.add("requirements-table__cell--mono");
          if (key === "pass") {
            td.classList.add(row && row[key] ? "sample-table__pass--true" : "sample-table__pass--false");
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      wrap.appendChild(tableWrap);
      sampleTableModalContentEl.appendChild(wrap);
    }

    modal.classList.remove("sample-table-modal--hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function fetchSampleTable() {
    return fetch("/api/samples/table", { cache: "no-store" })
      .then((r) => r.json().catch(() => null).then((payload) => ({ ok: r.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok) {
          const err = new Error(payload && payload.error ? payload.error : "Failed to load sample table");
          err.payload = payload;
          throw err;
        }
        latestSampleTable = payload;
        renderLeftPanelSampleTableSummary(latestSampleTable);
        return payload;
      });
  }

  function showSampleTable() {
    if (leftPanelShowSampleTableBtn) leftPanelShowSampleTableBtn.disabled = true;
    return fetchSampleTable()
      .then((payload) => {
        setDetailStatusMessage("", false);
        renderSampleTableModal(payload);
      })
      .finally(() => {
        if (leftPanelShowSampleTableBtn) leftPanelShowSampleTableBtn.disabled = false;
      });
  }

  function runResampling() {
    if (isResampling) return Promise.resolve();
    syncTargetedBoundsStateFromInputs();
    applySelectedPanelEditsToState();

    let sampleCount = 0;
    try {
      sampleCount = getRequestedSampleCount();
    } catch (err) {
      setDetailStatusMessage(err && err.message ? err.message : "Invalid sample count.", true);
      return Promise.reject(err);
    }

    isResampling = true;
    if (leftPanelResampleBtn) leftPanelResampleBtn.disabled = true;
    if (leftPanelShowSampleTableBtn) leftPanelShowSampleTableBtn.disabled = true;
    setDetailStatusMessage(`Resampling ${sampleCount} sample(s)...`, false);

    return fetch("/api/samples/resample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sample_count: sampleCount,
        requirements_snapshot: buildRequirementsSnapshotFromData()
      })
    })
      .then((r) => r.json().catch(() => null).then((payload) => ({ ok: r.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok) {
          const err = new Error(payload && payload.error ? payload.error : "Resampling failed");
          err.payload = payload;
          throw err;
        }
        latestSampleTable = payload && payload.sample_table ? payload.sample_table : latestSampleTable;
        renderLeftPanelSampleTableSummary(latestSampleTable);
        refreshRequirementsFromPayload(payload);
        const summary = payload && payload.sample_summary ? payload.sample_summary : {};
        const summaryMessage = `${sampleCount} sample(s) generated. ${summary.pass_count || 0} pass, ${summary.fail_count || 0} fail.`;
        setDetailStatusMessage(summaryMessage, Boolean(summary.zero_pass));
        if (sampleTableModalEl && !sampleTableModalEl.classList.contains("sample-table-modal--hidden") && latestSampleTable) {
          renderSampleTableModal(latestSampleTable);
        }
        return payload;
      })
      .catch((err) => {
        setDetailStatusMessage(err && err.message ? err.message : "Resampling failed", true);
        throw err;
      })
      .finally(() => {
        isResampling = false;
        if (leftPanelResampleBtn) leftPanelResampleBtn.disabled = false;
        if (leftPanelShowSampleTableBtn) leftPanelShowSampleTableBtn.disabled = false;
      });
  }

  function readBoundsInputPair(row, fallbackBounds, options) {
    const opts = options || {};
    const fallback = opts.allowNone
      ? normalizeNullableBoundsPair(fallbackBounds, [null, null])
      : normalizeBoundsPair(fallbackBounds, [0, 0]);
    if (!row) return fallback;
    const lowerInput = row.querySelector('input.detail-panel__bounds-input[data-bound-role="lower"]');
    const upperInput = row.querySelector('input.detail-panel__bounds-input[data-bound-role="upper"]');
    if (!lowerInput || !upperInput) return fallback;
    const lowerRaw = String(lowerInput.value || "").trim();
    const upperRaw = String(upperInput.value || "").trim();
    if (opts.allowNone && (lowerRaw.toLowerCase() === "none" || upperRaw.toLowerCase() === "none")) {
      return [null, null];
    }
    const lower = parseFloat(lowerInput.value);
    const upper = parseFloat(upperInput.value);
    if (Number.isNaN(lower) || Number.isNaN(upper)) return fallback;
    return normalizeBoundsPair([lower, upper], fallback);
  }

  function getCurrentDetailBoundsState(baseReq, reqType) {
    const sourceReq = baseReq && typeof baseReq === "object" ? baseReq : {};
    const normalizedBounds = getNormalizedRequirementBounds(sourceReq);
    const constraintStub = isConstraintStubRequirementType(reqType);
    const functionDriven = isFunctionDrivenRequirementType(reqType);
    if (!isDetailPanelEditable()) {
      return {
        constrained_bounds: normalizedBounds.constrained,
        targeted_bounds: normalizedBounds.targeted,
        solvable_bounds: normalizedBounds.solvable,
        required_bounds: normalizedBounds.required,
        expected_bounds: normalizedBounds.expected
      };
    }
    return {
      constrained_bounds: constraintStub
        ? readBoundsInputPair(detailBoundsConstrainedValues, normalizedBounds.constrained)
        : normalizedBounds.constrained,
      targeted_bounds: constraintStub
        ? normalizedBounds.targeted
        : readBoundsInputPair(detailBoundsTargetedValues, normalizedBounds.targeted, { allowNone: true }),
      solvable_bounds: normalizedBounds.solvable,
      required_bounds: functionDriven
        ? normalizedBounds.required
        : readBoundsInputPair(detailBoundsRequiredValues, normalizedBounds.required),
      expected_bounds: functionDriven
        ? normalizedBounds.expected
        : readBoundsInputPair(detailBoundsExpectedValues, normalizedBounds.expected)
    };
  }

  function buildDetailPanelDraftRequirement() {
    const currentReq = selectedReqId ? data.by_id[selectedReqId] : null;
    if (!currentReq && !isNewRequirement) return null;
    const base = currentReq ? { ...currentReq } : defaultNewRequirement();
    const draftId = currentReq ? currentReq.id : "__detail_panel_draft__";
    const draftLevel = String(detailClassInput && detailClassInput.value ? detailClassInput.value : (base.level || "alpha")).toLowerCase();
    const draftStatus = String(detailStatusInput && detailStatusInput.value ? detailStatusInput.value : (base.status || "analysis")).toLowerCase();
    const draftUnit = String(detailUnitInput && detailUnitInput.value !== undefined ? detailUnitInput.value : (base.unit || "")).trim();
    const draftDrivenBy = normalizeDrivenByValue(
      detailDrivenByInput && detailDrivenByInput.value !== undefined ? detailDrivenByInput.value : base.driven_by
    );
    const draftPropagationFunction = normalizePropagationFunctionName(
      detailPropagationFunctionInput && detailPropagationFunctionInput.value !== undefined
        ? detailPropagationFunctionInput.value
        : base.propagation_function
    );
    const draftById = {};
    Object.entries(data.by_id || {}).forEach(([reqId, req]) => {
      if (!req || typeof req !== "object") return;
      draftById[reqId] = {
        ...req,
        id: reqId,
        driven_by: normalizeDrivenByValue(req.driven_by)
      };
    });
    draftById[draftId] = {
      ...base,
      id: draftId,
      level: draftLevel,
      status: draftStatus,
      unit: draftUnit,
      driven_by: draftDrivenBy,
      propagation_function: draftPropagationFunction
    };
    const draftType = computeRequirementTypeMap(draftById)[draftId] || base.type || "top_stub";
    const propagationState = getCurrentDetailPropagationState(base, draftType);
    const boundsState = getCurrentDetailBoundsState(base, draftType);
    const draftReq = {
      ...base,
      id: draftId,
      level: draftLevel,
      status: draftStatus,
      unit: draftUnit,
      driven_by: draftDrivenBy,
      type: draftType,
      constrained_bounds: boundsState.constrained_bounds,
      targeted_bounds: boundsState.targeted_bounds,
      solvable_bounds: boundsState.solvable_bounds,
      required_bounds: boundsState.required_bounds,
      expected_bounds: boundsState.expected_bounds,
      propagation_function: propagationState.propagation_function || draftPropagationFunction,
      propagation_inputs: propagationState.propagation_inputs
    };
    if (!isConstraintStubRequirementType(draftType)) {
      delete draftReq.constrained_bounds;
    } else {
      delete draftReq.targeted_bounds;
    }
    return draftReq;
  }

  function refreshDetailPanelDerivedType() {
    if (!detailType) return "";
    const draftReq = buildDetailPanelDraftRequirement();
    if (!draftReq) {
      detailType.textContent = "";
      return "";
    }
    const draftById = {};
    Object.entries(data.by_id || {}).forEach(([reqId, req]) => {
      if (!req || typeof req !== "object") return;
      draftById[reqId] = {
        ...req,
        id: reqId,
        driven_by: normalizeDrivenByValue(req.driven_by)
      };
    });
    draftById[draftReq.id] = draftReq;
    const typeMap = computeRequirementTypeMap(draftById);
    const nextType = typeMap[draftReq.id] || "top_stub";
    detailType.textContent = formatRequirementType(nextType);
    if (detailBoundsEditBtn) detailBoundsEditBtn.disabled = editingMode === "deactivated";
    if (detailPropagationFunctionEdit) {
      detailPropagationFunctionEdit.disabled = editingMode === "deactivated" || !isPropagationConfigurableRequirementType(nextType);
    }
    if (detailPropagationFunctionRemove) {
      detailPropagationFunctionRemove.disabled = (
        editingMode === "deactivated"
        || !selectedReqId
        || isNewRequirement
        || !isRemovableFunctionStubRequirementType(nextType)
      );
    }
    setDetailPropagationVisibility(shouldShowPropagationSectionForType(nextType));
    return nextType;
  }

  function loadData() {
    return fetch("/api/requirements")
      .then((r) => r.json())
      .then((d) => {
        data = normalizeRequirementsData(d);
        return preloadRequirementValidationState(data).then(() => d);
      });
  }

  function serializeTableValue(value) {
    if (value === null || value === undefined) return "";
    if (isUnsetBoundsPair(value)) return "[null, null]";
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return String(value);
      }
    }
    return String(value);
  }

  function getRequirementsTableColumns() {
    const seen = new Set(["id", "level"]);
    const preferred = [
      "id",
      "level",
      "type",
      "name",
      "status",
      "definition",
      "unit",
      "driven_by",
      "relates_to",
      "targeted_bounds",
      "solvable_bounds",
      "required_bounds",
      "expected_bounds",
      "value_source",
      "propagation_function",
      "propagation_inputs",
      "comments"
    ];

    Object.values(data.by_id || {}).forEach((req) => {
      Object.keys(req || {}).forEach((key) => seen.add(key));
    });

    const dynamic = [...seen].filter((key) => key !== "id" && key !== "level" && key !== "constrained_bounds");
    dynamic.sort();

    const ordered = ["id", "level"];
    preferred.forEach((key) => {
      if (seen.has(key) && !ordered.includes(key)) ordered.push(key);
    });
    dynamic.forEach((key) => {
      if (!ordered.includes(key)) ordered.push(key);
    });
    return ordered;
  }

  function getFilteredRequirements(columns) {
    const rows = Object.values(data.by_id || {}).sort((a, b) =>
      String(a.id || "").localeCompare(String(b.id || ""))
    );
    return rows.filter((req) => columns.every((col) => {
      const filterText = String(tableFilters[col] || "").trim().toLowerCase();
      if (!filterText) return true;
      const rawValue = col === "id" ? req.id : (col === "level" ? req.level : req[col]);
      return serializeTableValue(rawValue).toLowerCase().includes(filterText);
    }));
  }

  function renderRequirementsTable() {
    if (!tableViewEl) return;
    const columns = getRequirementsTableColumns();
    if (!columns.length) {
      tableViewEl.innerHTML = '<div class="requirements-table__empty">No requirements available.</div>';
      return;
    }

    const filteredRows = getFilteredRequirements(columns);
    const wrap = document.createElement("div");
    wrap.className = "requirements-table-wrap";

    const table = document.createElement("table");
    table.className = "requirements-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col.replace(/_/g, " ");
      headerRow.appendChild(th);
    });

    const filterRow = document.createElement("tr");
    filterRow.className = "requirements-table__filter-row";
    columns.forEach((col) => {
      const th = document.createElement("th");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "requirements-table__filter";
      input.placeholder = "Filter";
      input.value = tableFilters[col] || "";
      input.setAttribute("aria-label", `Filter ${col}`);
      input.addEventListener("input", () => {
        tableFilters[col] = input.value || "";
        renderRequirementsTable();
      });
      th.appendChild(input);
      filterRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    thead.appendChild(filterRow);

    const tbody = document.createElement("tbody");
    filteredRows.forEach((req) => {
      const tr = document.createElement("tr");
      tr.className = "requirements-table__row";
      tr.setAttribute("data-id", req.id || "");
      tr.addEventListener("click", () => {
        const selected = data.by_id[req.id];
        if (selected) openDetailPanel(selected);
      });

      columns.forEach((col) => {
        const td = document.createElement("td");
        if (col === "id" || col === "level") td.classList.add("requirements-table__cell--mono");
        const rawValue = col === "id" ? req.id : (col === "level" ? req.level : req[col]);
        const text = serializeTableValue(rawValue);
        td.textContent = text;
        td.title = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    if (!filteredRows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "requirements-table__empty";
      td.textContent = "No requirements match the current filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    tableViewEl.innerHTML = "";
    tableViewEl.appendChild(wrap);
  }

  function setButtonGroupSelection(buttons, attrName, selectedValue) {
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute(attrName) === selectedValue;
      btn.classList.toggle("left-panel__view-btn--active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (btn.getAttribute("role") === "tab") {
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      }
    });
  }

  function shouldShowViewerPlaceholder() {
    return (
      currentAnalysisMode !== DEFAULT_ANALYSIS_MODE
      || currentProject !== DEFAULT_PROJECT
      || currentBranch !== DEFAULT_BRANCH
    );
  }

  function cloneTransformState(source) {
    const value = source || transform;
    return { x: value.x, y: value.y, k: value.k };
  }

  function clampTreeZoom(nextZoom) {
    const numericZoom = Number(nextZoom);
    if (!Number.isFinite(numericZoom)) return transform.k;
    return Math.max(MIN_TREE_ZOOM, Math.min(MAX_TREE_ZOOM, numericZoom));
  }

  function zoomToSliderValue(zoomLevel) {
    return Math.round(clampTreeZoom(zoomLevel) * ZOOM_SLIDER_SCALE);
  }

  function sliderValueToZoom(sliderValue) {
    return clampTreeZoom(Number(sliderValue) / ZOOM_SLIDER_SCALE);
  }

  function getInitialZoomSliderValue() {
    return initialTransform ? zoomToSliderValue(initialTransform.k) : null;
  }

  function syncViewportZoomControls() {
    if (viewportZoomSliderEl) {
      const sliderValue = String(zoomToSliderValue(transform.k));
      if (viewportZoomSliderEl.value !== sliderValue) {
        viewportZoomSliderEl.value = sliderValue;
      }
    }
    if (viewportZoomValueEl) {
      viewportZoomValueEl.value = `${Math.round(transform.k * 100)}%`;
      viewportZoomValueEl.textContent = viewportZoomValueEl.value;
    }
    const initialSliderValue = getInitialZoomSliderValue();
    if (viewportZoomInitialMarkerEl) {
      if (initialSliderValue == null || !viewportZoomSliderEl) {
        viewportZoomInitialMarkerEl.hidden = true;
      } else {
        const minValue = Number(viewportZoomSliderEl.min);
        const maxValue = Number(viewportZoomSliderEl.max);
        const span = Math.max(1, maxValue - minValue);
        const percent = ((initialSliderValue - minValue) / span) * 100;
        viewportZoomInitialMarkerEl.hidden = false;
        viewportZoomInitialMarkerEl.style.left = `${percent}%`;
      }
    }
    if (viewportHomeBtnEl) {
      viewportHomeBtnEl.disabled = !initialTransform || viewportControlsEl?.classList.contains("viewport-camera-controls--hidden");
    }
  }

  function updateViewportControlsVisibility() {
    if (!viewportControlsEl) return;
    const showControls = currentViewerMode === "tree" && !shouldShowViewerPlaceholder();
    viewportControlsEl.classList.toggle("viewport-camera-controls--hidden", !showControls);
    viewportControlsEl.setAttribute("aria-hidden", showControls ? "false" : "true");
    if (viewportHomeBtnEl) viewportHomeBtnEl.disabled = !showControls || !initialTransform;
    if (viewportZoomSliderEl) viewportZoomSliderEl.disabled = !showControls;
    syncViewportZoomControls();
  }

  function applyViewerMode() {
    const showPlaceholder = shouldShowViewerPlaceholder();
    const isTreeMode = currentViewerMode === "tree";
    const isTableMode = currentViewerMode === "table";
    if (canvasEl) canvasEl.style.display = !showPlaceholder && isTreeMode ? "block" : "none";
    if (tableViewEl) tableViewEl.classList.toggle("viewport-table--hidden", showPlaceholder || !isTableMode);
    if (viewerPlaceholderEl) {
      viewerPlaceholderEl.classList.toggle("viewport-placeholder--hidden", !showPlaceholder);
      viewerPlaceholderEl.setAttribute("aria-hidden", showPlaceholder ? "false" : "true");
    }
    if (viewportEl) {
      viewportEl.classList.toggle("viewport--table", !showPlaceholder && isTableMode);
      viewportEl.classList.toggle("viewport--placeholder", showPlaceholder);
    }
    updateViewportControlsVisibility();
    if (showPlaceholder) {
      return;
    }
    if (isTreeMode) {
      refreshActiveViewer(!hasAutoFittedTreeView);
      hasAutoFittedTreeView = true;
      return;
    }
    if (isTableMode) renderRequirementsTable();
  }

  function refreshActiveViewer(autoFit) {
    if (shouldShowViewerPlaceholder()) return;
    if (currentViewerMode === "tree") {
      computePositions();
      renderArrows();
      renderBoxes();
      updateViewBox();
      if (autoFit) fitViewToContent({ rememberInitial: true });
      applyTransform();
      return;
    }
    if (currentViewerMode === "table") renderRequirementsTable();
  }

  function syncBoundsHighlightButtons() {
    const buttonStates = [
      [leftPanelHighlightConstraintsBtn, activeBoundsHighlightMode === "constraints"],
      [leftPanelHighlightTargetsBtn, activeBoundsHighlightMode === "targets"]
    ];
    buttonStates.forEach(([btn, isActive]) => {
      if (!btn) return;
      btn.classList.toggle("left-panel__control-btn--active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function toggleBoundsHighlightMode(mode) {
    activeBoundsHighlightMode = activeBoundsHighlightMode === mode ? null : mode;
    syncBoundsHighlightButtons();
    refreshActiveViewer(false);
  }

  function uppercaseSelectOptions(selectEl) {
    if (!selectEl || !selectEl.options) return;
    Array.from(selectEl.options).forEach((option) => {
      const upperText = String(option.text || option.label || "").toUpperCase();
      option.text = upperText;
      option.label = upperText;
    });
  }

  function initLeftPanel() {
    const analysisBtns = document.querySelectorAll("[data-analysis]");
    const viewModeSelect = document.getElementById("view-mode-select");
    const analysisModeSelect = document.getElementById("analysis-mode-select");
    const projectSelect = document.getElementById("project-select");
    const branchSelect = document.getElementById("branch-select");
    leftPanelSampleCountInput = document.getElementById("left-panel-sample-count");
    leftPanelResampleBtn = document.getElementById("left-panel-resample-btn");
    leftPanelShowSampleTableBtn = document.getElementById("left-panel-show-sample-table-btn");
    leftPanelSampleTableSummaryEl = document.getElementById("left-panel-sample-table-summary");
    leftPanelEditBoundsStatusEl = document.getElementById("left-panel-edit-bounds-status");
    leftPanelHighlightConstraintsBtn = document.getElementById("left-panel-highlight-constraints-btn");
    leftPanelHighlightTargetsBtn = document.getElementById("left-panel-highlight-targets-btn");
    leftPanelEl = document.getElementById("left-panel");
    renderLeftPanelSampleTableSummary(latestSampleTable);

    if (viewModeSelect) {
      uppercaseSelectOptions(viewModeSelect);
      viewModeSelect.value = currentViewerMode;
      viewModeSelect.addEventListener("change", () => {
        const selected = viewModeSelect.value;
        if (!selected) return;
        currentViewerMode = selected;
        applyViewerMode();
        updateCreateRequirementButtonVisibility();
      });
    }

    analysisBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const selected = btn.getAttribute("data-analysis");
        if (!selected) return;
        currentAnalysisMode = selected;
        setButtonGroupSelection(analysisBtns, "data-analysis", currentAnalysisMode);
        if (analysisModeSelect) analysisModeSelect.value = currentAnalysisMode;
        applyViewerMode();
      });
    });

    if (analysisModeSelect) {
      uppercaseSelectOptions(analysisModeSelect);
      analysisModeSelect.value = currentAnalysisMode;
      analysisModeSelect.addEventListener("change", () => {
        const selected = analysisModeSelect.value;
        if (!selected) return;
        currentAnalysisMode = selected;
        setButtonGroupSelection(analysisBtns, "data-analysis", currentAnalysisMode);
        applyViewerMode();
      });
    }

    if (projectSelect) {
      projectSelect.value = currentProject;
      projectSelect.addEventListener("change", () => {
        currentProject = projectSelect.value || currentProject;
        applyViewerMode();
      });
    }

    if (branchSelect) {
      branchSelect.value = currentBranch;
      branchSelect.addEventListener("change", () => {
        currentBranch = branchSelect.value || currentBranch;
        applyViewerMode();
      });
    }

    const editingModeSelect = document.getElementById("editing-mode-select");
    if (editingModeSelect) {
      editingModeSelect.value = editingMode;
      editingModeSelect.addEventListener("change", () => {
        editingMode = (editingModeSelect.value || "git").toLowerCase();
        updateDetailPanelEditingVisibility();
        updateCreateRequirementButtonVisibility();
      });
    }

    if (leftPanelHighlightConstraintsBtn) {
      leftPanelHighlightConstraintsBtn.addEventListener("click", () => {
        toggleBoundsHighlightMode("constraints");
      });
    }

    if (leftPanelHighlightTargetsBtn) {
      leftPanelHighlightTargetsBtn.addEventListener("click", () => {
        toggleBoundsHighlightMode("targets");
      });
    }

    setButtonGroupSelection(analysisBtns, "data-analysis", currentAnalysisMode);
    syncBoundsHighlightButtons();
  }

  function updateLeftDrawerUI() {
    if (!appMainEl || !leftDrawerToggle) return;
    const drawerEnabled = editingMode !== "deactivated";
    const drawerOpen = drawerEnabled && isLeftDrawerOpen;
    appMainEl.classList.toggle("app-main--drawer-collapsed", !drawerOpen);
    appMainEl.classList.toggle("app-main--drawer-disabled", !drawerEnabled);
    leftDrawerToggle.disabled = !drawerEnabled;
    leftDrawerToggle.hidden = !drawerEnabled;
    leftDrawerToggle.tabIndex = drawerEnabled ? 0 : -1;
    leftDrawerToggle.setAttribute("aria-hidden", drawerEnabled ? "false" : "true");
    leftDrawerToggle.setAttribute("aria-expanded", drawerOpen ? "true" : "false");
    leftDrawerToggle.setAttribute("aria-label", drawerOpen ? "Close left panel" : "Open left panel");
    leftDrawerToggle.textContent = drawerOpen ? "<<" : ">>";
    if (leftPanelEl) {
      leftPanelEl.setAttribute("aria-hidden", drawerOpen ? "false" : "true");
    }
    scheduleTreeViewportRefresh();
  }

  function initLeftDrawer() {
    appMainEl = document.querySelector(".app-main");
    leftPanelEl = document.getElementById("left-panel");
    leftDrawerToggle = document.getElementById("left-drawer-toggle");
    if (!appMainEl || !leftDrawerToggle) return;
    leftDrawerToggle.addEventListener("click", () => {
      isLeftDrawerOpen = !isLeftDrawerOpen;
      updateLeftDrawerUI();
    });
    if (leftPanelEl) {
      leftPanelEl.addEventListener("transitionend", (event) => {
        if (event.target !== leftPanelEl || event.propertyName !== "transform") return;
        scheduleTreeViewportRefresh();
      });
    }
    updateLeftDrawerUI();
  }

  function orderIds(level) {
    const reqs = data[level] || {};
    return Object.keys(reqs).sort();
  }

  /** Compute display rows from driven_by graph: child is always one row below its driver. */
  function computeRows() {
    const row = {};
    const byId = data.by_id || {};
    const ids = Object.keys(byId).sort();
    const memo = {};
    const visiting = new Set();

    const resolveRow = (id) => {
      if (memo[id] !== undefined) return memo[id];
      if (visiting.has(id)) {
        // Break cycles deterministically; still render graph.
        return 0;
      }

      visiting.add(id);
      const req = byId[id];
      const driven = req && req.driven_by !== "None" ? req.driven_by : null;

      let resolved = 0;
      if (driven && byId[driven]) {
        resolved = resolveRow(driven) + 1;
      }

      visiting.delete(id);
      memo[id] = resolved;
      return resolved;
    };

    ids.forEach((id) => {
      row[id] = resolveRow(id);
    });

    return row;
  }

  function isValidReqId(id) {
    return Boolean(id && id !== "None" && data.by_id[id]);
  }

  function getRelatesTargets(req) {
    const raw = req ? req.relates_to : null;
    const candidates = Array.isArray(raw) ? raw : [raw];
    const seen = new Set();
    const targets = [];
    candidates.forEach((candidate) => {
      if (!isValidReqId(candidate)) return;
      const key = String(candidate);
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(key);
    });
    return targets;
  }

  function collectRelationEdges() {
    const edges = [];
    const seen = new Set();
    LEVELS.forEach((level) => {
      const reqs = data[level] || {};
      Object.entries(reqs).forEach(([id, req]) => {
        getRelatesTargets(req).forEach((rel) => {
          const key = [id, rel].sort().join("--");
          if (seen.has(key)) return;
          seen.add(key);
          edges.push({ a: id, b: rel });
        });
      });
    });
    return edges;
  }

  function collectAdjacency() {
    const adj = {};
    Object.keys(data.by_id || {}).forEach((id) => {
      adj[id] = new Set();
    });

    Object.entries(data.by_id || {}).forEach(([id, req]) => {
      if (isValidReqId(req.driven_by)) {
        adj[id].add(req.driven_by);
        adj[req.driven_by].add(id);
      }
    });

    collectRelationEdges().forEach(({ a, b }) => {
      adj[a].add(b);
      adj[b].add(a);
    });

    return adj;
  }

  function collectRelationAdjacency() {
    const adjacency = {};
    Object.keys(data.by_id || {}).forEach((id) => {
      adjacency[id] = new Set();
    });
    collectRelationEdges().forEach(({ a, b }) => {
      if (!adjacency[a]) adjacency[a] = new Set();
      if (!adjacency[b]) adjacency[b] = new Set();
      adjacency[a].add(b);
      adjacency[b].add(a);
    });
    return adjacency;
  }

  function buildDrivenChildrenMap(rows) {
    const childrenByParent = {};
    Object.keys(data.by_id || {}).forEach((id) => {
      childrenByParent[id] = [];
    });
    Object.entries(data.by_id || {}).forEach(([childId, req]) => {
      const parentId = req && req.driven_by;
      if (!isValidReqId(parentId)) return;
      const parentRow = rows[parentId];
      const childRow = rows[childId];
      if (parentRow === undefined || childRow === undefined || childRow <= parentRow) return;
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(childId);
    });
    Object.keys(childrenByParent).forEach((parentId) => {
      childrenByParent[parentId].sort((a, b) => {
        const ra = rows[a] ?? 0;
        const rb = rows[b] ?? 0;
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });
    });
    return childrenByParent;
  }

  function computeDrivenVisitIndex(rows) {
    const visit = {};
    const childrenByParent = buildDrivenChildrenMap(rows);
    const allIds = Object.keys(data.by_id || {}).sort();
    const roots = allIds.filter((id) => {
      const req = data.by_id[id] || {};
      const parent = req.driven_by;
      if (!isValidReqId(parent)) return true;
      const parentRow = rows[parent];
      const childRow = rows[id];
      return parentRow === undefined || childRow === undefined || childRow <= parentRow;
    });

    let order = 0;
    const visited = new Set();
    const dfs = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      visit[id] = order++;
      const children = childrenByParent[id] || [];
      children.forEach((childId) => dfs(childId));
    };

    roots.forEach((id) => dfs(id));
    allIds.forEach((id) => dfs(id));
    return visit;
  }

  function computeSubtreeWeight(id, childrenByParent, memo) {
    if (memo[id] !== undefined) return memo[id];
    const children = childrenByParent[id] || [];
    if (!children.length) {
      memo[id] = 1;
      return 1;
    }
    let total = 1;
    children.forEach((childId) => {
      total += computeSubtreeWeight(childId, childrenByParent, memo);
    });
    memo[id] = total;
    return total;
  }

  function computeDrivenShiftPlan(rows, childrenByParent) {
    const layoutById = {};
    const visiting = new Set();

    const resolve = (id) => {
      if (layoutById[id]) return layoutById[id];
      if (visiting.has(id)) {
        const loopRow = rows[id];
        const loopLayout = {
          nodeCols: { [id]: 0 },
          rowBounds: loopRow === undefined ? {} : { [loopRow]: { min: 0, max: 0 } },
          minCol: 0,
          maxCol: 0
        };
        layoutById[id] = loopLayout;
        return loopLayout;
      }

      visiting.add(id);
      const ownRow = rows[id];
      const layout = {
        nodeCols: { [id]: 0 },
        rowBounds: ownRow === undefined ? {} : { [ownRow]: { min: 0, max: 0 } },
        minCol: 0,
        maxCol: 0
      };
      const occupiedMaxByRow = ownRow === undefined ? {} : { [ownRow]: 0 };
      const children = (childrenByParent[id] || []).filter((childId) => {
        const childRow = rows[childId];
        return ownRow === undefined || childRow === undefined || childRow > ownRow;
      });

      children.forEach((childId) => {
        const childLayout = resolve(childId);
        let shiftCols = MATRIX_CHILD_BASE_SHIFT_COLS - (childLayout.minCol || 0);

        Object.entries(childLayout.rowBounds || {}).forEach(([rowKey, bounds]) => {
          const rowNum = Number(rowKey);
          const prevMax = occupiedMaxByRow[rowNum];
          if (!Number.isFinite(prevMax)) return;
          const childMin = Number.isFinite(bounds.min) ? bounds.min : 0;
          const required = prevMax + MATRIX_SIBLING_GAP_COLS;
          shiftCols = Math.max(shiftCols, required - childMin);
        });

        Object.entries(childLayout.nodeCols || {}).forEach(([nodeId, relCol]) => {
          layout.nodeCols[nodeId] = relCol + shiftCols;
        });

        Object.entries(childLayout.rowBounds || {}).forEach(([rowKey, bounds]) => {
          const rowNum = Number(rowKey);
          const shiftedMin = bounds.min + shiftCols;
          const shiftedMax = bounds.max + shiftCols;
          if (!layout.rowBounds[rowNum]) {
            layout.rowBounds[rowNum] = { min: shiftedMin, max: shiftedMax };
          } else {
            layout.rowBounds[rowNum].min = Math.min(layout.rowBounds[rowNum].min, shiftedMin);
            layout.rowBounds[rowNum].max = Math.max(layout.rowBounds[rowNum].max, shiftedMax);
          }
          occupiedMaxByRow[rowNum] = Math.max(
            Number.isFinite(occupiedMaxByRow[rowNum]) ? occupiedMaxByRow[rowNum] : -Infinity,
            shiftedMax
          );
        });
      });

      Object.values(layout.rowBounds).forEach((bounds) => {
        layout.minCol = Math.min(layout.minCol, bounds.min);
        layout.maxCol = Math.max(layout.maxCol, bounds.max);
      });

      visiting.delete(id);
      layoutById[id] = layout;
      return layout;
    };

    Object.keys(data.by_id || {}).forEach((id) => resolve(id));
    return { layoutById };
  }

  function computeStairOrderByRow(rows) {
    const byRow = {};
    Object.entries(rows).forEach(([id, row]) => {
      if (!byRow[row]) byRow[row] = [];
      byRow[row].push(id);
    });
    const visitIndex = computeDrivenVisitIndex(rows);
    Object.keys(byRow).forEach((rowKey) => {
      byRow[rowKey].sort((a, b) => {
        const da = visitIndex[a] ?? 0;
        const db = visitIndex[b] ?? 0;
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });
    });
    return byRow;
  }

  function computeSeedOrderByRow(rows) {
    const byRow = {};
    Object.entries(rows).forEach(([id, r]) => {
      if (!byRow[r]) byRow[r] = [];
      byRow[r].push(id);
    });
    Object.keys(byRow).forEach((r) => byRow[r].sort());
    return byRow;
  }

  function computeTempPositionsForOrder(byRow, rowHeightsLocal) {
    const temp = {};
    const rowIndices = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    let y = 0;
    const rowY = {};
    rowIndices.forEach((r, i) => {
      rowY[r] = y;
      if (i < rowIndices.length - 1) y += (rowHeightsLocal[r] || BASE_BOX_HEIGHT) + BASE_VERT_GAP;
    });

    rowIndices.forEach((r) => {
      const ids = byRow[r] || [];
      const totalWidth = ids.length * BOX_WIDTH + Math.max(0, ids.length - 1) * HORZ_GAP;
      let cursorX = -totalWidth / 2;
      ids.forEach((id, idx) => {
        temp[id] = {
          x: cursorX + idx * (BOX_WIDTH + HORZ_GAP),
          y: rowY[r] || 0
        };
      });
    });
    return temp;
  }

  function optimizeRowOrder(rows) {
    const byRow = computeSeedOrderByRow(rows);
    const rowIndices = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    const rowHeightsLocal = {};
    rowIndices.forEach((rowIndex) => {
      const ids = byRow[rowIndex] || [];
      rowHeightsLocal[rowIndex] = ids.reduce((maxHeight, id) => {
        const layout = boxLayouts[id];
        return Math.max(maxHeight, layout ? layout.boxHeight : BASE_BOX_HEIGHT);
      }, BASE_BOX_HEIGHT);
    });

    const adjacency = collectAdjacency();

    for (let pass = 0; pass < 8; pass++) {
      const temp = computeTempPositionsForOrder(byRow, rowHeightsLocal);
      const scores = {};
      Object.keys(rows).forEach((id) => {
        const neighbors = adjacency[id] ? [...adjacency[id]] : [];
        const own = temp[id];
        if (!own || !neighbors.length) {
          scores[id] = own ? own.x + (BOX_WIDTH / 2) : 0;
          return;
        }
        let sum = 0;
        let count = 0;
        neighbors.forEach((n) => {
          if (!temp[n]) return;
          sum += temp[n].x + (BOX_WIDTH / 2);
          count += 1;
        });
        scores[id] = count ? (sum / count) : (own.x + (BOX_WIDTH / 2));
      });

      rowIndices.forEach((rowIndex) => {
        byRow[rowIndex].sort((a, b) => {
          const d = (scores[a] || 0) - (scores[b] || 0);
          if (Math.abs(d) > 0.001) return d;
          return a.localeCompare(b);
        });
      });
    }

    return byRow;
  }

  function estimateRowGapDemands(byRow) {
    const spacing = {};
    const relationEdges = collectRelationEdges();
    const rowIndices = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    rowIndices.forEach((rowIndex) => {
      const ids = byRow[rowIndex] || [];
      if (ids.length < 2) return;
      const idx = {};
      ids.forEach((id, i) => { idx[id] = i; });
      for (let boundary = 0; boundary < ids.length - 1; boundary++) {
        let demand = 0;
        relationEdges.forEach(({ a, b }) => {
          const ia = idx[a];
          const ib = idx[b];
          if (ia === undefined || ib === undefined) return;
          if ((ia <= boundary && ib > boundary) || (ib <= boundary && ia > boundary)) demand += 1;
        });
        const requiredGap = Math.max(HORZ_GAP, (demand + 1) * GRID_PITCH);
        const cappedGap = Math.min(HORZ_GAP + (6 * GRID_PITCH), requiredGap);
        spacing[`${rowIndex}:${boundary}`] = cappedGap;
      }
    });
    return spacing;
  }

  function countGapDemand(rows, byRow) {
    const demand = {};
    const bumpGap = (gapIdx, amount) => {
      demand[gapIdx] = (demand[gapIdx] || 0) + amount;
    };
    const bumpBetweenRows = (a, b, amount) => {
      if (a === undefined || b === undefined) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let r = lo; r < hi; r++) bumpGap(r, amount);
    };
    const idsByRow = byRow || computeSeedOrderByRow(rows);
    const areNeighborsByRows = (aId, bId) => {
      const ra = rows[aId];
      const rb = rows[bId];
      if (ra === undefined || ra !== rb) return false;
      const ids = idsByRow[ra] || [];
      const ia = ids.indexOf(aId);
      const ib = ids.indexOf(bId);
      return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
    };
    const maxRow = Object.values(rows).length ? Math.max(...Object.values(rows)) : 0;
    const relatesSeen = new Set();

    const drivenLaneKeys = new Set();
    LEVELS.forEach((level) => {
      const reqs = data[level] || {};
      Object.entries(reqs).forEach(([id, req]) => {
        if (isValidReqId(req.driven_by)) {
          const childRow = rows[id];
          const parentRow = rows[req.driven_by];
          if (childRow !== undefined && parentRow !== undefined) {
            const lo = Math.min(childRow, parentRow);
            const hi = Math.max(childRow, parentRow);
            for (let r = lo; r < hi; r++) {
              const key = `${req.driven_by}::${r}`;
              if (drivenLaneKeys.has(key)) continue;
              drivenLaneKeys.add(key);
              bumpGap(r, 1);
            }
          }
        }
        getRelatesTargets(req).forEach((rel) => {
          const key = [id, rel].sort().join("--");
          if (relatesSeen.has(key)) return;
          relatesSeen.add(key);
          const a = rows[id];
          const b = rows[rel];
          if (a === undefined || b === undefined) return;
          if (a === b && areNeighborsByRows(id, rel)) return;
          if (a === b) {
            const gap = a < maxRow ? a : Math.max(0, a - 1);
            bumpGap(gap, 1);
          } else {
            bumpBetweenRows(a, b, 1);
          }
        });
      });
    });
    return demand;
  }

  function getMeasureContext() {
    if (textMeasureCtx) return textMeasureCtx;
    const canvas = document.createElement("canvas");
    textMeasureCtx = canvas.getContext("2d");
    return textMeasureCtx;
  }

  function measureHeaderTextWidth(text, fontSizePx, fontWeight) {
    const ctx = getMeasureContext();
    if (!ctx) return String(text || "").length * fontSizePx * 0.6;
    ctx.font = `${fontWeight} ${fontSizePx}px "DM Sans", "Segoe UI", system-ui, sans-serif`;
    return ctx.measureText(String(text || "")).width;
  }

  function wrapHeaderName(nameText, maxWidth) {
    const text = String(nameText || "").trim();
    if (!text) return [""];
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [""];

    const lines = [];
    let current = "";
    const fits = (candidate) => measureHeaderTextWidth(candidate, HEADER_NAME_FONT_SIZE, 500) <= maxWidth;
    const pushBrokenWord = (word) => {
      let chunk = "";
      for (const ch of word) {
        const candidate = `${chunk}${ch}`;
        if (!chunk || fits(candidate)) {
          chunk = candidate;
        } else {
          lines.push(chunk);
          chunk = ch;
        }
      }
      return chunk;
    };

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        return;
      }
      if (current) lines.push(current);
      if (fits(word)) {
        current = word;
        return;
      }
      current = pushBrokenWord(word);
    });
    if (current) lines.push(current);
    return lines.length ? lines : [text];
  }

  function computeBoxLayout(req) {
    const idText = String(req.id || "").toUpperCase();
    const typeText = String(req.level || "").toUpperCase();
    const statusText = String(req.status || "N/A").toUpperCase();
    const nameText = String((req.name || "").replace(/_/g, " ")).toUpperCase();

    const minEdgeSection = 20;
    let leftSectionWidth = Math.max(minEdgeSection, Math.ceil(measureHeaderTextWidth(idText, HEADER_META_FONT_SIZE, 700) + (2 * HEADER_PAD_X)));
    let rightSectionWidth = Math.max(minEdgeSection, Math.ceil(measureHeaderTextWidth(statusText, HEADER_META_FONT_SIZE, 700) + (2 * HEADER_PAD_X)));
    const minMiddleSection = 24;
    const maxEdgeTotal = Math.max(2 * minEdgeSection, BOX_WIDTH - minMiddleSection);
    if (leftSectionWidth + rightSectionWidth > maxEdgeTotal) {
      const scale = maxEdgeTotal / (leftSectionWidth + rightSectionWidth);
      leftSectionWidth = Math.max(minEdgeSection, Math.floor(leftSectionWidth * scale));
      rightSectionWidth = Math.max(minEdgeSection, Math.floor(rightSectionWidth * scale));
    }

    const nameLines = wrapHeaderName(nameText, BOX_WIDTH - (2 * HEADER_PAD_X));
    const headerHeight = Math.max(
      HEADER_MIN_HEIGHT,
      HEADER_PAD_TOP + HEADER_META_ROW_HEIGHT + HEADER_ROW_GAP + (nameLines.length * HEADER_NAME_LINE_HEIGHT) + HEADER_PAD_TOP
    );

    const rawBoxHeight = headerHeight + BODY_MIN_HEIGHT;
    const boxHeight = Math.ceil(rawBoxHeight / GRID_PITCH) * GRID_PITCH;

    return {
      idText,
      typeText,
      statusText,
      nameLines,
      leftSectionWidth,
      rightSectionWidth,
      metaBaselineY: HEADER_PAD_TOP + 9,
      nameFirstBaselineY: HEADER_PAD_TOP + HEADER_META_ROW_HEIGHT + HEADER_ROW_GAP + 11,
      headerHeight,
      boxHeight
    };
  }

  function computeBoxLayouts() {
    boxLayouts = {};
    Object.values(data.by_id || {}).forEach((req) => {
      if (!req || !req.id) return;
      boxLayouts[req.id] = computeBoxLayout(req);
    });
  }

  function snapToGrid(value) {
    return Math.round(value / GRID_PITCH) * GRID_PITCH;
  }

  function computePositions() {
    positions = {};
    rowMap = computeRows();
    rowTops = {};
    rowHeights = {};
    gapSizes = {};
    computeBoxLayouts();

    const byRow = computeStairOrderByRow(rowMap);
    const demand = countGapDemand(rowMap, byRow);
    const childrenByParent = buildDrivenChildrenMap(rowMap);
    const shiftPlan = computeDrivenShiftPlan(rowMap, childrenByParent);
    const layoutById = shiftPlan.layoutById || {};
    const rowIds = Object.values(rowMap);
    const maxRow = rowIds.length ? Math.max(...rowIds) : 0;
    for (let gap = 0; gap < maxRow; gap++) {
      const laneDemand = demand[gap] || 0;
      // One reserved lane near each box border + exactly one lane per routed line.
      gapSizes[gap] = Math.max(BASE_VERT_GAP, (laneDemand + 2) * GRID_PITCH);
    }

    const rowIndices = Object.keys(byRow).map(Number).sort((a, b) => a - b);
    rowIndices.forEach((rowIndex) => {
      const ids = byRow[rowIndex] || [];
      rowHeights[rowIndex] = ids.reduce((maxHeight, id) => {
        const layout = boxLayouts[id];
        return Math.max(maxHeight, layout ? layout.boxHeight : BASE_BOX_HEIGHT);
      }, BASE_BOX_HEIGHT);
    });

    if (rowIndices.length) {
      let y = 0;
      rowIndices.forEach((rowIndex, i) => {
        rowTops[rowIndex] = y;
        if (i < rowIndices.length - 1) {
          const gap = gapSizes[rowIndex] || BASE_VERT_GAP;
          y += (rowHeights[rowIndex] || BASE_BOX_HEIGHT) + gap;
        }
      });
    }

    const placed = new Set();
    const occupiedMaxByRow = {};
    const placeBranchLayout = (rootId, baseGapCols) => {
      const branch = layoutById[rootId];
      if (!branch) return;

      let shiftCols = -(branch.minCol || 0);
      Object.entries(branch.rowBounds || {}).forEach(([rowKey, bounds]) => {
        const rowNum = Number(rowKey);
        const prevMax = occupiedMaxByRow[rowNum];
        if (!Number.isFinite(prevMax)) return;
        const required = prevMax + baseGapCols;
        shiftCols = Math.max(shiftCols, required - bounds.min);
      });

      Object.entries(branch.nodeCols || {}).forEach(([nodeId, relCol]) => {
        if (placed.has(nodeId)) return;
        const rowIndex = rowMap[nodeId];
        if (rowIndex === undefined) return;
        const y = rowTops[rowIndex] || 0;
        const col = relCol + shiftCols;
        const x = MATRIX_COL_OFFSET_X + (col * MATRIX_COL_STEP_X);
        const nodeLayout = boxLayouts[nodeId];
        positions[nodeId] = { x, y, width: BOX_WIDTH, height: nodeLayout ? nodeLayout.boxHeight : BASE_BOX_HEIGHT };
        placed.add(nodeId);
      });

      Object.entries(branch.rowBounds || {}).forEach(([rowKey, bounds]) => {
        const rowNum = Number(rowKey);
        const shiftedMax = bounds.max + shiftCols;
        occupiedMaxByRow[rowNum] = Math.max(
          Number.isFinite(occupiedMaxByRow[rowNum]) ? occupiedMaxByRow[rowNum] : -Infinity,
          shiftedMax
        );
      });
    };

    const allIds = Object.keys(data.by_id || {}).sort();
    const roots = allIds.filter((id) => {
      const req = data.by_id[id] || {};
      const parent = req.driven_by;
      if (!isValidReqId(parent)) return true;
      const parentRow = rowMap[parent];
      const childRow = rowMap[id];
      return parentRow === undefined || childRow === undefined || childRow <= parentRow;
    });

    roots.forEach((rootId) => {
      placeBranchLayout(rootId, MATRIX_ROOT_GAP_COLS);
    });

    allIds.forEach((id) => {
      if (placed.has(id)) return;
      placeBranchLayout(id, MATRIX_ROOT_GAP_COLS);
    });
  }

  function norm(val, min, max) {
    if (max === min) return 0.5;
    return (val - min) / (max - min);
  }

  function getRequirementConflictLevel(req) {
    const { solvable, required, expected } = getNormalizedRequirementBounds(req);
    const [sLo, sHi] = solvable;
    const [rLo, rHi] = required;
    const [eLo, eHi] = expected;

    const outsideSolvable = eLo < sLo || eHi > sHi;
    if (outsideSolvable) return "error";

    const outsideRequired = eLo < rLo || eHi > rHi;
    if (outsideRequired) return "warning";

    return null;
  }

  function renderBoundsBar(req, x, y, headerHeight) {
    const barY = y + headerHeight + BOUNDS_TOP_OFFSET;
    const barW = BOX_WIDTH - 24;
    const barX = x + 12;
    const { constrained, targeted, solvable, required, expected } = getNormalizedRequirementBounds(req);
    const constraintStub = isConstraintStubRequirementType(req && req.type);
    const [cLo, cHi] = constrained;
    const [tLo, tHi] = targeted;
    const [sLo, sHi] = solvable;
    const [rLo, rHi] = required;
    const [eLo, eHi] = expected;
    const lowerBounds = (constraintStub ? [cLo, sLo, rLo, eLo] : [sLo, rLo, eLo]).slice();
    const upperBounds = (constraintStub ? [cHi, sHi, rHi, eHi] : [sHi, rHi, eHi]).slice();
    if (!constraintStub && !isUnsetBoundsPair(targeted)) {
      lowerBounds.push(tLo);
      upperBounds.push(tHi);
    }
    const rangeMin = Math.min(...lowerBounds);
    const rangeMax = Math.max(...upperBounds);
    const scaleMin = rangeMin === rangeMax ? rangeMin - 1 : rangeMin;
    const scaleMax = rangeMax === scaleMin ? scaleMin + 1 : rangeMax;

    const toLocalX = (v) => norm(v, scaleMin, scaleMax) * barW;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "req-bounds-group");
    g.setAttribute("transform", `translate(${barX}, ${barY})`);

    // Tick raster
    const raster = document.createElementNS("http://www.w3.org/2000/svg", "g");
    raster.setAttribute("class", "req-bounds-raster");
    for (let i = 0; i <= TICK_COUNT; i++) {
      const tx = (i / TICK_COUNT) * barW;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", tx);
      line.setAttribute("y1", 0);
      line.setAttribute("x2", tx);
      line.setAttribute("y2", BOUNDS_BAR_HEIGHT);
      raster.appendChild(line);
    }
    g.appendChild(raster);

    const rowH = BOUNDS_BAR_HEIGHT / 3;
    const segY = (i) => i * rowH;
    const solvableRowIndex = 0;

    if (constraintStub) {
      const constrainedX = Math.min(toLocalX(cLo), toLocalX(cHi));
      const constrainedW = Math.max(2, Math.abs(toLocalX(cHi) - toLocalX(cLo)));
      const constrainedRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      constrainedRect.setAttribute("class", "req-seg-constrained");
      constrainedRect.setAttribute("x", constrainedX);
      constrainedRect.setAttribute("y", segY(0));
      constrainedRect.setAttribute("width", constrainedW);
      constrainedRect.setAttribute("height", rowH - 1);
      constrainedRect.setAttribute(
        "title",
        `Constrained bounds: [${formatDisplayValue(cLo)}, ${formatDisplayValue(cHi)}] ${req.unit || ""}`
      );
      g.appendChild(constrainedRect);
    }

    if (!constraintStub && !isUnsetBoundsPair(targeted)) {
      const targetedX = Math.min(toLocalX(tLo), toLocalX(tHi));
      const targetedW = Math.max(2, Math.abs(toLocalX(tHi) - toLocalX(tLo)));
      const targetedRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      targetedRect.setAttribute("class", "req-seg-targeted");
      targetedRect.setAttribute("x", targetedX);
      targetedRect.setAttribute("y", segY(0));
      targetedRect.setAttribute("width", targetedW);
      targetedRect.setAttribute("height", rowH - 1);
      targetedRect.setAttribute(
        "title",
        `Targeted bounds: [${formatBoundDisplayValue(tLo)}, ${formatBoundDisplayValue(tHi)}] ${req.unit || ""}`
      );
      g.appendChild(targetedRect);
    }

    // Solvable overlays constrained or targeted bounds.
    const redX = Math.min(toLocalX(sLo), toLocalX(sHi));
    const redW = Math.max(2, Math.abs(toLocalX(sHi) - toLocalX(sLo)));
    const redRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    redRect.setAttribute("class", "req-seg-solvable");
    redRect.setAttribute("x", redX);
    redRect.setAttribute("y", segY(0));
    redRect.setAttribute("width", redW);
    redRect.setAttribute("height", rowH - 1);
    redRect.setAttribute(
      "title",
      `Solvable bounds: [${formatDisplayValue(sLo)}, ${formatDisplayValue(sHi)}] ${req.unit || ""}`
    );
    g.appendChild(redRect);
    appendSolvableDistributionOverlay(g, req, toLocalX, {
      baseY: segY(solvableRowIndex),
      height: BOUNDS_HISTOGRAM_HEIGHT,
      sigmaTopY: segY(solvableRowIndex) - BOUNDS_HISTOGRAM_HEIGHT,
      sigmaBottomY: segY(solvableRowIndex) + rowH + 1
    });

    // Required (orange)
    const orangeX = Math.min(toLocalX(rLo), toLocalX(rHi));
    const orangeW = Math.max(2, Math.abs(toLocalX(rHi) - toLocalX(rLo)));
    const orangeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    orangeRect.setAttribute("class", "req-seg-required");
    orangeRect.setAttribute("x", orangeX);
    orangeRect.setAttribute("y", segY(1));
    orangeRect.setAttribute("width", orangeW);
    orangeRect.setAttribute("height", rowH - 1);
    orangeRect.setAttribute(
      "title",
      `Required bounds: [${formatDisplayValue(rLo)}, ${formatDisplayValue(rHi)}] ${req.unit || ""}`
    );
    g.appendChild(orangeRect);

    // Expected (green)
    const greenX = Math.min(toLocalX(eLo), toLocalX(eHi));
    const greenW = Math.max(2, Math.abs(toLocalX(eHi) - toLocalX(eLo)));
    const greenRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    greenRect.setAttribute("class", "req-seg-expected");
    greenRect.setAttribute("x", greenX);
    greenRect.setAttribute("y", segY(2));
    greenRect.setAttribute("width", greenW);
    greenRect.setAttribute("height", rowH - 1);
    g.appendChild(greenRect);

    return g;
  }

  function renderBox(req, boxX, boxY) {
    const layout = boxLayouts[req.id] || computeBoxLayout(req);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "req-box");
    g.setAttribute("data-id", req.id);
    g.setAttribute("transform", `translate(${boxX}, ${boxY})`);
    if (shouldHighlightRequirementBounds(req)) {
      g.classList.add("req-box--bounds-highlight");
    }
    const hasValidationError = Boolean(req && req.validation_error);
    const conflictLevel = conflictsChecked ? getRequirementConflictLevel(req) : null;
    if (hasValidationError || conflictLevel === "error") {
      g.classList.add("req-box--error");
    } else if (conflictLevel === "warning") {
      g.classList.add("req-box--warning");
    }
    if (hasValidationError) {
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = req.validation_error;
      g.appendChild(title);
    }

    // Header
    const header = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    header.setAttribute("class", "req-box-header");
    header.setAttribute("width", BOX_WIDTH);
    header.setAttribute("height", layout.headerHeight);
    header.setAttribute("rx", 4);
    g.appendChild(header);

    const idText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    idText.setAttribute("class", "req-id req-meta");
    idText.setAttribute("x", HEADER_PAD_X);
    idText.setAttribute("y", layout.metaBaselineY);
    idText.setAttribute("text-anchor", "start");
    idText.textContent = layout.idText;
    g.appendChild(idText);

    const classText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    classText.setAttribute("class", "req-classification req-meta");
    classText.setAttribute("x", BOX_WIDTH / 2);
    classText.setAttribute("y", layout.metaBaselineY);
    classText.setAttribute("text-anchor", "middle");
    classText.textContent = layout.typeText;
    g.appendChild(classText);

    const statusText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    statusText.setAttribute("class", "req-status req-meta");
    statusText.setAttribute("x", BOX_WIDTH - layout.rightSectionWidth + HEADER_PAD_X);
    statusText.setAttribute("y", layout.metaBaselineY);
    statusText.setAttribute("text-anchor", "start");
    statusText.textContent = layout.statusText;
    g.appendChild(statusText);

    const nameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nameText.setAttribute("class", "req-name");
    nameText.setAttribute("x", HEADER_PAD_X);
    layout.nameLines.forEach((line, idx) => {
      const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      span.setAttribute("x", HEADER_PAD_X);
      if (idx === 0) span.setAttribute("y", layout.nameFirstBaselineY);
      else span.setAttribute("dy", HEADER_NAME_LINE_HEIGHT);
      span.textContent = line;
      nameText.appendChild(span);
    });
    g.appendChild(nameText);

    // Body
    const body = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    body.setAttribute("class", "req-box-body");
    body.setAttribute("y", layout.headerHeight);
    body.setAttribute("width", BOX_WIDTH);
    body.setAttribute("height", layout.boxHeight - layout.headerHeight);
    body.setAttribute("rx", 0);
    g.appendChild(body);

    g.appendChild(renderBoundsBar(req, 0, 0, layout.headerHeight));

    // Value boxes (expected bounds)
    const { expected } = getNormalizedRequirementBounds(req);
    const [eLo, eHi] = expected;
    const unit = req.unit || "";
    const valY = layout.headerHeight + BOUNDS_TOP_OFFSET + BOUNDS_BAR_HEIGHT + 12;
    const valW = 56;
    const valH = 20;

    const lowBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    lowBox.setAttribute("class", "req-value-box");
    lowBox.setAttribute("x", 12);
    lowBox.setAttribute("y", valY);
    lowBox.setAttribute("width", valW);
    lowBox.setAttribute("height", valH);
    lowBox.setAttribute("rx", 3);
    g.appendChild(lowBox);

    const lowText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lowText.setAttribute("class", "req-value-text");
    lowText.setAttribute("x", 12 + valW / 2);
    lowText.setAttribute("y", valY + 14);
    lowText.setAttribute("text-anchor", "middle");
    lowText.textContent = formatDisplayValue(eLo);
    g.appendChild(lowText);

    const highBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    highBox.setAttribute("class", "req-value-box");
    highBox.setAttribute("x", 12 + valW + 8);
    highBox.setAttribute("y", valY);
    highBox.setAttribute("width", valW);
    highBox.setAttribute("height", valH);
    highBox.setAttribute("rx", 3);
    g.appendChild(highBox);

    const highText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    highText.setAttribute("class", "req-value-text");
    highText.setAttribute("x", 12 + valW + 8 + valW / 2);
    highText.setAttribute("y", valY + 14);
    highText.setAttribute("text-anchor", "middle");
    highText.textContent = formatDisplayValue(eHi);
    g.appendChild(highText);

    const unitBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    unitBox.setAttribute("class", "req-value-box");
    unitBox.setAttribute("x", 12 + 2 * valW + 16);
    unitBox.setAttribute("y", valY);
    unitBox.setAttribute("width", 36);
    unitBox.setAttribute("height", valH);
    unitBox.setAttribute("rx", 3);
    g.appendChild(unitBox);

    const unitText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    unitText.setAttribute("class", "req-unit-text");
    unitText.setAttribute("x", 12 + 2 * valW + 16 + 18);
    unitText.setAttribute("y", valY + 14);
    unitText.setAttribute("text-anchor", "middle");
    unitText.textContent = unit;
    g.appendChild(unitText);

    return g;
  }

  function boxCenter(id) {
    const p = positions[id];
    if (!p) return null;
    return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
  }

  function boxEdge(id, side) {
    const p = positions[id];
    if (!p) return null;
    const c = boxCenter(id);
    if (side === "top") return { x: c.x, y: p.y };
    if (side === "bottom") return { x: c.x, y: p.y + p.height };
    if (side === "left") return { x: p.x, y: Math.max(p.y, Math.min(p.y + p.height, snapToGrid(c.y))) };
    if (side === "right") return { x: p.x + p.width, y: Math.max(p.y, Math.min(p.y + p.height, snapToGrid(c.y))) };
    return c;
  }

  const OBSTACLE_MARGIN = 8;

  function getLayoutBounds() {
    const ids = Object.keys(positions);
    if (!ids.length) {
      return {
        minX: -((BOX_WIDTH + HORZ_GAP) * 2),
        maxX: (BOX_WIDTH + HORZ_GAP) * 2
      };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    ids.forEach((id) => {
      const p = positions[id];
      if (!p) return;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + p.width);
    });
    return { minX: minX - HORZ_GAP, maxX: maxX + HORZ_GAP };
  }

  /** Y position of the center of the gap between row i and row i+1. */
  function gapCenterY(gapIndex) {
    const rowY = rowTops[gapIndex];
    if (rowY === undefined) return BASE_BOX_HEIGHT + BASE_VERT_GAP / 2;
    const gap = gapSizes[gapIndex] || BASE_VERT_GAP;
    return rowY + (rowHeights[gapIndex] || BASE_BOX_HEIGHT) + gap / 2;
  }

  function gapRouteLaneCount(gapIndex) {
    const gap = gapSizes[gapIndex] || BASE_VERT_GAP;
    return Math.max(1, Math.round((gap / GRID_PITCH) - 2));
  }

  function gapLaneYByIndex(gapIndex, laneIndex) {
    const rowY = rowTops[gapIndex];
    if (rowY === undefined) return BASE_BOX_HEIGHT + GRID_PITCH + laneIndex * GRID_PITCH;
    const lanes = gapRouteLaneCount(gapIndex);
    const idx = Math.max(0, Math.min(lanes - 1, laneIndex));
    return rowY + (rowHeights[gapIndex] || BASE_BOX_HEIGHT) + GRID_PITCH + idx * GRID_PITCH;
  }

  function getGapLanePreferenceOrder(gapIndex, tieBreakerOffset) {
    const laneCount = gapRouteLaneCount(gapIndex);
    const targetY = gapCenterY(gapIndex);
    const centerLane = (laneCount - 1) / 2;
    const offset = Number.isFinite(tieBreakerOffset) ? tieBreakerOffset : 0;
    return Array.from({ length: laneCount }, (_, idx) => idx).sort((a, b) => {
      const distanceA = Math.abs(gapLaneYByIndex(gapIndex, a) - targetY);
      const distanceB = Math.abs(gapLaneYByIndex(gapIndex, b) - targetY);
      if (Math.abs(distanceA - distanceB) > 0.001) return distanceA - distanceB;

      // Alternate above/below the midpoint when both center-adjacent lanes are equally good.
      const preferLowerLane = offset % 2 === 0;
      const sideA = a - centerLane;
      const sideB = b - centerLane;
      const sideRank = (side) => {
        if (Math.abs(side) < 0.001) return 0;
        const isLower = side > 0;
        if (preferLowerLane) return isLower ? 1 : 2;
        return isLower ? 2 : 1;
      };
      const sideCompare = sideRank(sideA) - sideRank(sideB);
      if (sideCompare !== 0) return sideCompare;
      return a - b;
    });
  }

  function gapLowestLaneY(gapIndex) {
    return gapLaneYByIndex(gapIndex, gapRouteLaneCount(gapIndex) - 1);
  }

  function getRowIdsSorted(rowIdx) {
    return Object.keys(positions)
      .filter((id) => rowMap[id] === rowIdx)
      .sort((a, b) => positions[a].x - positions[b].x);
  }

  function areNeighborsInRow(aId, bId) {
    const rowA = rowMap[aId];
    const rowB = rowMap[bId];
    if (rowA === undefined || rowA !== rowB) return false;
    const ids = getRowIdsSorted(rowA);
    const ia = ids.indexOf(aId);
    const ib = ids.indexOf(bId);
    return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
  }

  function computeRailCandidates(yStart, yEnd, blockedIds) {
    const bounds = getLayoutBounds();
    const blocked = new Set(blockedIds || []);
    const start = Math.floor(bounds.minX / GRID_PITCH) * GRID_PITCH;
    const end = Math.ceil(bounds.maxX / GRID_PITCH) * GRID_PITCH;
    const rails = [];
    for (let x = start; x <= end; x += GRID_PITCH) {
      const hitsBox = Object.keys(positions).some((id) => !blocked.has(id) && railCrossesBox(x, yStart, yEnd, id));
      if (!hitsBox) rails.push(x);
    }
    return rails;
  }

  function railCrossesBox(x, y1, y2, id) {
    const p = positions[id];
    if (!p) return false;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const left = p.x + OBSTACLE_MARGIN;
    const right = p.x + p.width - OBSTACLE_MARGIN;
    const top = p.y + OBSTACLE_MARGIN;
    const bottom = p.y + p.height - OBSTACLE_MARGIN;
    const xInside = x >= left && x <= right;
    const yOverlap = maxY >= top && minY <= bottom;
    return xInside && yOverlap;
  }

  function pickVerticalRail(fromX, toX, yStart, yEnd, blockedIds, usedVerticals) {
    const rails = computeRailCandidates(yStart, yEnd, blockedIds);
    const target = (fromX + toX) / 2;
    const overlapsUsed = (x) => {
      return (usedVerticals || []).some((v) => {
        const yLo = Math.min(yStart, yEnd);
        const yHi = Math.max(yStart, yEnd);
        const vLo = Math.min(v.y1, v.y2);
        const vHi = Math.max(v.y1, v.y2);
        const yOverlap = yHi >= vLo && yLo <= vHi;
        return yOverlap && Math.abs(v.x - x) < GRID_PITCH;
      });
    };
    const clear = rails.filter((x) => !overlapsUsed(x));
    const candidates = clear.length ? clear : rails.filter((x) => !overlapsUsed(x));
    const fallback = candidates.length ? candidates : rails;
    if (!fallback.length) return target;
    fallback.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    return fallback[0];
  }

  function segmentCrossesBox(segment, id) {
    const p = positions[id];
    if (!p) return false;
    const left = p.x + OBSTACLE_MARGIN;
    const right = p.x + p.width - OBSTACLE_MARGIN;
    const top = p.y + OBSTACLE_MARGIN;
    const bottom = p.y + p.height - OBSTACLE_MARGIN;

    if (isVertical(segment)) {
      const x = segment.a.x;
      const minY = Math.min(segment.a.y, segment.b.y);
      const maxY = Math.max(segment.a.y, segment.b.y);
      const xInside = x >= left && x <= right;
      const yOverlap = maxY >= top && minY <= bottom;
      return xInside && yOverlap;
    }

    if (isHorizontal(segment)) {
      const y = segment.a.y;
      const minX = Math.min(segment.a.x, segment.b.x);
      const maxX = Math.max(segment.a.x, segment.b.x);
      const yInside = y >= top && y <= bottom;
      const xOverlap = maxX >= left && minX <= right;
      return yInside && xOverlap;
    }

    return false;
  }

  function pathCrossesBoxes(points, blockedIds) {
    const blocked = new Set(blockedIds || []);
    return pointsToSegments(points).some((segment) => {
      return Object.keys(positions).some((id) => !blocked.has(id) && segmentCrossesBox(segment, id));
    });
  }

  function verticalSegmentOverlapsUsed(segment, usedVerticals) {
    if (!isVertical(segment)) return false;
    if (Math.abs(segment.a.y - segment.b.y) < GRID_PITCH * 0.5) return false;
    const yLo = Math.min(segment.a.y, segment.b.y);
    const yHi = Math.max(segment.a.y, segment.b.y);
    return (usedVerticals || []).some((v) => {
      const vLo = Math.min(v.y1, v.y2);
      const vHi = Math.max(v.y1, v.y2);
      const yOverlap = yHi >= vLo && yLo <= vHi;
      return yOverlap && Math.abs(v.x - segment.a.x) < GRID_PITCH;
    });
  }

  function pathUsesReservedVerticals(points, usedVerticals) {
    return pointsToSegments(points).some((segment) => verticalSegmentOverlapsUsed(segment, usedVerticals));
  }

  function countPathCorners(points) {
    const simplified = simplifyPoints(points || []);
    if (simplified.length < 3) return 0;
    let corners = 0;
    for (let i = 1; i < simplified.length - 1; i++) {
      const prev = simplified[i - 1];
      const curr = simplified[i];
      const next = simplified[i + 1];
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      if ((Math.abs(dx1) > 0.001 && Math.abs(dy2) > 0.001) || (Math.abs(dy1) > 0.001 && Math.abs(dx2) > 0.001)) {
        corners += 1;
      }
    }
    return corners;
  }

  function measurePathLength(points) {
    return pointsToSegments(points).reduce((sum, segment) => {
      return sum + Math.abs(segment.a.x - segment.b.x) + Math.abs(segment.a.y - segment.b.y);
    }, 0);
  }

  function chooseBestRelatesPath(candidates, blockedIds, usedVerticals) {
    const normalized = (candidates || [])
      .map((points) => simplifyPoints(points || []))
      .filter((points) => points.length >= 2);
    const scorePaths = (pointsList) => pointsList.map((points) => ({
        points,
        corners: countPathCorners(points),
        length: measurePathLength(points)
      }));
    const conflictFree = normalized
      .filter((points) => !pathCrossesBoxes(points, blockedIds))
      .filter((points) => !pathUsesReservedVerticals(points, usedVerticals));
    const boxSafe = normalized.filter((points) => !pathCrossesBoxes(points, blockedIds));
    const scored = scorePaths(conflictFree.length ? conflictFree : (boxSafe.length ? boxSafe : normalized));
    if (!scored.length) return null;
    scored.sort((a, b) => {
      if (a.corners !== b.corners) return a.corners - b.corners;
      if (Math.abs(a.length - b.length) > 0.001) return a.length - b.length;
      return a.points.length - b.points.length;
    });
    return scored[0].points;
  }

  function simplifyPoints(points) {
    const out = [];
    points.forEach((pt) => {
      if (!out.length) {
        out.push(pt);
        return;
      }
      const prev = out[out.length - 1];
      if (Math.abs(prev.x - pt.x) < 0.001 && Math.abs(prev.y - pt.y) < 0.001) return;
      if (out.length >= 2) {
        const prev2 = out[out.length - 2];
        const sameVertical = Math.abs(prev2.x - prev.x) < 0.001 && Math.abs(prev.x - pt.x) < 0.001;
        const sameHorizontal = Math.abs(prev2.y - prev.y) < 0.001 && Math.abs(prev.y - pt.y) < 0.001;
        if (sameVertical || sameHorizontal) {
          out[out.length - 1] = pt;
          return;
        }
      }
      out.push(pt);
    });
    return out;
  }

  function pointsToPath(points) {
    if (!points || !points.length) return null;
    const p = simplifyPoints(points);
    if (!p.length) return null;
    let d = `M ${p[0].x} ${p[0].y}`;
    for (let i = 1; i < p.length; i++) d += ` L ${p[i].x} ${p[i].y}`;
    return d;
  }

  function pointsToSegments(points) {
    const p = simplifyPoints(points || []);
    const segments = [];
    for (let i = 1; i < p.length; i++) {
      if (Math.abs(p[i - 1].x - p[i].x) < 0.001 && Math.abs(p[i - 1].y - p[i].y) < 0.001) continue;
      segments.push({ a: p[i - 1], b: p[i] });
    }
    return segments;
  }

  function routeDrivenByPoints(fromId, toId, usedVerticals, laneInfo) {
    const from = boxEdge(fromId, "bottom");
    const to = boxEdge(toId, "top");
    if (!from || !to) return null;
    const fromRow = rowMap[fromId];
    const toRow = rowMap[toId];
    if (fromRow === undefined || toRow === undefined) return [from, to];

    if (toRow <= fromRow) return [from, to];
    const startLane = laneInfo && Number.isFinite(laneInfo.startLane)
      ? laneInfo.startLane
      : (gapRouteLaneCount(fromRow) - 1);
    const endLane = laneInfo && Number.isFinite(laneInfo.endLane)
      ? laneInfo.endLane
      : (gapRouteLaneCount(toRow - 1) - 1);
    const yStart = gapLaneYByIndex(fromRow, startLane);
    const yEnd = gapLaneYByIndex(toRow - 1, endLane);
    const fromClear = { x: from.x, y: from.y + GRID_PITCH };
    const toClear = { x: to.x, y: to.y - GRID_PITCH };
    const railX = pickVerticalRail(fromClear.x, toClear.x, yStart, yEnd, [fromId, toId], usedVerticals);
    return [
      from,
      fromClear,
      { x: fromClear.x, y: yStart },
      { x: railX, y: yStart },
      { x: railX, y: yEnd },
      { x: toClear.x, y: yEnd },
      toClear,
      to
    ];
  }

  function routeDrivenByBusPoints(parentId, childId, laneIndex, includeTrunk) {
    const from = boxEdge(parentId, "bottom");
    const to = boxEdge(childId, "top");
    if (!from || !to) return null;
    const parentRow = rowMap[parentId];
    const childRow = rowMap[childId];
    if (parentRow === undefined || childRow === undefined) return [from, to];
    if (childRow <= parentRow) return [from, to];

    const busY = gapLaneYByIndex(parentRow, laneIndex);
    const fromClear = { x: from.x, y: from.y + GRID_PITCH };
    const toClear = { x: to.x, y: to.y - GRID_PITCH };

    if (includeTrunk) {
      return [
        from,
        fromClear,
        { x: fromClear.x, y: busY },
        { x: toClear.x, y: busY },
        toClear,
        to
      ];
    }

    return [
      { x: from.x, y: busY },
      { x: toClear.x, y: busY },
      toClear,
      to
    ];
  }

  function routeRelatesToPoints(fromId, toId, laneInfo, usedVerticals) {
    const fromPos = positions[fromId];
    const toPos = positions[toId];
    if (!fromPos || !toPos) return null;
    if (fromId === toId) return null;

    const fromRow = rowMap[fromId];
    const toRow = rowMap[toId];
    if (fromRow === undefined || toRow === undefined) return null;

    if (areNeighborsInRow(fromId, toId)) {
      if (fromPos.x < toPos.x) {
        return [boxEdge(fromId, "right"), boxEdge(toId, "left")];
      }
      return [boxEdge(fromId, "left"), boxEdge(toId, "right")];
    }

    const blockedIds = [fromId, toId];
    const sideFromSide = fromPos.x <= toPos.x ? "right" : "left";
    const sideToSide = fromPos.x <= toPos.x ? "left" : "right";
    const sideFrom = boxEdge(fromId, sideFromSide);
    const sideTo = boxEdge(toId, sideToSide);
    const sideDir = sideFromSide === "right" ? 1 : -1;
    const sideFromClear = sideFrom ? { x: sideFrom.x + sideDir * GRID_PITCH, y: sideFrom.y } : null;
    const sideToDir = sideToSide === "right" ? 1 : -1;
    const sideToClear = sideTo ? { x: sideTo.x + sideToDir * GRID_PITCH, y: sideTo.y } : null;

    if (fromRow === toRow) {
      const maxRow = Math.max(...Object.values(rowMap));
      const gapIndex = laneInfo && laneInfo.singleGap !== undefined
        ? laneInfo.singleGap
        : (fromRow < maxRow ? fromRow : Math.max(0, fromRow - 1));
      const laneIndex = laneInfo && Number.isFinite(laneInfo.startLane) ? laneInfo.startLane : 0;
      const laneY = gapLaneYByIndex(gapIndex, laneIndex);
      const twoBendSideCandidate = sideFrom && sideTo
        ? [
          sideFrom,
          { x: sideFrom.x, y: laneY },
          { x: sideTo.x, y: laneY },
          sideTo
        ]
        : null;
      const verticalSide = gapIndex >= fromRow ? "bottom" : "top";
      const from = boxEdge(fromId, verticalSide);
      const to = boxEdge(toId, verticalSide);
      const simpleCandidate = from && to
        ? [
          from,
          { x: from.x, y: laneY },
          { x: to.x, y: laneY },
          to
        ]
        : null;
      const fallbackCandidate = sideFrom && sideFromClear && sideTo && sideToClear
        ? (() => {
          const railX = pickVerticalRail(
            sideFromClear.x,
            sideToClear.x,
            Math.min(sideFromClear.y, laneY, sideToClear.y),
            Math.max(sideFromClear.y, laneY, sideToClear.y),
            blockedIds,
            usedVerticals
          );
          return [
            sideFrom,
            sideFromClear,
            { x: railX, y: sideFromClear.y },
            { x: railX, y: laneY },
            { x: sideToClear.x, y: laneY },
            { x: sideToClear.x, y: sideToClear.y },
            sideToClear,
            sideTo
          ];
        })()
        : null;
      return chooseBestRelatesPath([twoBendSideCandidate, simpleCandidate, fallbackCandidate], blockedIds, usedVerticals);
    }

    const fromGap = fromRow < toRow ? fromRow : Math.max(0, fromRow - 1);
    const toGap = fromRow < toRow ? Math.max(0, toRow - 1) : toRow;
    const yStart = gapLaneYByIndex(fromGap, laneInfo && Number.isFinite(laneInfo.startLane) ? laneInfo.startLane : 0);
    const yEnd = gapLaneYByIndex(toGap, laneInfo && Number.isFinite(laneInfo.endLane) ? laneInfo.endLane : 0);
    const verticalFromSide = fromRow < toRow ? "bottom" : "top";
    const verticalToSide = fromRow < toRow ? "top" : "bottom";
    const from = boxEdge(fromId, verticalFromSide);
    const to = boxEdge(toId, verticalToSide);
    if (!from || !to) return null;

    const directCandidate = Math.abs(from.x - to.x) < 0.001 ? [from, to] : null;
    const twoBendRailCandidate = sideFrom && sideTo
      ? (() => {
        const railX = pickVerticalRail(
          sideFrom.x,
          sideTo.x,
          Math.min(sideFrom.y, sideTo.y),
          Math.max(sideFrom.y, sideTo.y),
          blockedIds,
          usedVerticals
        );
        return [
          sideFrom,
          { x: railX, y: sideFrom.y },
          { x: railX, y: sideTo.y },
          sideTo
        ];
      })()
      : null;
    const startColumnCandidate = [
      from,
      { x: from.x, y: yEnd },
      { x: to.x, y: yEnd },
      to
    ];
    const endColumnCandidate = [
      from,
      { x: from.x, y: yStart },
      { x: to.x, y: yStart },
      to
    ];
    const fallbackCandidate = sideFrom && sideFromClear && sideTo && sideToClear
      ? (() => {
        const railX = pickVerticalRail(sideFromClear.x, sideToClear.x, yStart, yEnd, blockedIds, usedVerticals);
        return [
          sideFrom,
          sideFromClear,
          { x: sideFromClear.x, y: yStart },
          { x: railX, y: yStart },
          { x: railX, y: yEnd },
          { x: sideToClear.x, y: yEnd },
          sideToClear,
          sideTo
        ];
      })()
      : null;
    return chooseBestRelatesPath(
      [directCandidate, twoBendRailCandidate, startColumnCandidate, endColumnCandidate, fallbackCandidate],
      blockedIds,
      usedVerticals
    );
  }

  function isHorizontal(seg) {
    return Math.abs(seg.a.y - seg.b.y) < 0.001;
  }

  function isVertical(seg) {
    return Math.abs(seg.a.x - seg.b.x) < 0.001;
  }

  function segmentIntersection(later, earlier) {
    if (isHorizontal(later) && isVertical(earlier)) {
      const y = later.a.y;
      const x = earlier.a.x;
      const lx1 = Math.min(later.a.x, later.b.x);
      const lx2 = Math.max(later.a.x, later.b.x);
      const ey1 = Math.min(earlier.a.y, earlier.b.y);
      const ey2 = Math.max(earlier.a.y, earlier.b.y);
      if (x >= lx1 && x <= lx2 && y >= ey1 && y <= ey2) return { x, y };
    } else if (isVertical(later) && isHorizontal(earlier)) {
      const x = later.a.x;
      const y = earlier.a.y;
      const ly1 = Math.min(later.a.y, later.b.y);
      const ly2 = Math.max(later.a.y, later.b.y);
      const ex1 = Math.min(earlier.a.x, earlier.b.x);
      const ex2 = Math.max(earlier.a.x, earlier.b.x);
      if (x >= ex1 && x <= ex2 && y >= ly1 && y <= ly2) return { x, y };
    }
    return null;
  }

  function carveSegmentWithGaps(segment, priorSegments) {
    const cuts = [];
    priorSegments.forEach((prev) => {
      const hit = segmentIntersection(segment, prev);
      if (!hit) return;
      if (isHorizontal(segment)) cuts.push(hit.x);
      else if (isVertical(segment)) cuts.push(hit.y);
    });

    if (!cuts.length) return [segment];

    const halfGap = BLUE_CROSS_GAP / 2;
    if (isHorizontal(segment)) {
      const y = segment.a.y;
      const start = Math.min(segment.a.x, segment.b.x);
      const end = Math.max(segment.a.x, segment.b.x);
      const ranges = cuts
        .map((x) => [Math.max(start, x - halfGap), Math.min(end, x + halfGap)])
        .sort((a, b) => a[0] - b[0]);
      const merged = [];
      ranges.forEach((r) => {
        if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r);
        else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      });
      const out = [];
      let cursor = start;
      merged.forEach(([a, b]) => {
        if (a - cursor > 0.5) out.push({ a: { x: cursor, y }, b: { x: a, y } });
        cursor = Math.max(cursor, b);
      });
      if (end - cursor > 0.5) out.push({ a: { x: cursor, y }, b: { x: end, y } });
      return segment.a.x <= segment.b.x ? out : out.map((s) => ({ a: s.b, b: s.a })).reverse();
    }

    if (isVertical(segment)) {
      const x = segment.a.x;
      const start = Math.min(segment.a.y, segment.b.y);
      const end = Math.max(segment.a.y, segment.b.y);
      const ranges = cuts
        .map((y) => [Math.max(start, y - halfGap), Math.min(end, y + halfGap)])
        .sort((a, b) => a[0] - b[0]);
      const merged = [];
      ranges.forEach((r) => {
        if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r);
        else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      });
      const out = [];
      let cursor = start;
      merged.forEach(([a, b]) => {
        if (a - cursor > 0.5) out.push({ a: { x, y: cursor }, b: { x, y: a } });
        cursor = Math.max(cursor, b);
      });
      if (end - cursor > 0.5) out.push({ a: { x, y: cursor }, b: { x, y: end } });
      return segment.a.y <= segment.b.y ? out : out.map((s) => ({ a: s.b, b: s.a })).reverse();
    }

    return [segment];
  }

  function segmentsToPath(segments) {
    if (!segments.length) return null;
    let d = "";
    segments.forEach((seg) => {
      d += `M ${seg.a.x} ${seg.a.y} L ${seg.b.x} ${seg.b.y} `;
    });
    return d.trim();
  }

  function renderGrid() {
    if (!gridLayer || !viewportEl) return;
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    if (!w || !h) return;

    const topLeft = getContentPoint(0, 0);
    const bottomRight = getContentPoint(w, h);
    const pad = 4 * GRID_PITCH;
    const minX = Math.min(topLeft.x, bottomRight.x) - pad;
    const maxX = Math.max(topLeft.x, bottomRight.x) + pad;
    const minY = Math.min(topLeft.y, bottomRight.y) - pad;
    const maxY = Math.max(topLeft.y, bottomRight.y) + pad;

    const xStart = Math.floor(minX / GRID_PITCH) * GRID_PITCH;
    const xEnd = Math.ceil(maxX / GRID_PITCH) * GRID_PITCH;
    const yStart = Math.floor(minY / GRID_PITCH) * GRID_PITCH;
    const yEnd = Math.ceil(maxY / GRID_PITCH) * GRID_PITCH;
    const key = `${w}|${h}|${xStart}|${xEnd}|${yStart}|${yEnd}|${transform.k.toFixed(3)}`;
    if (key === gridRenderKey) return;
    gridRenderKey = key;
    gridLayer.innerHTML = "";

    for (let x = xStart; x <= xEnd; x += GRID_PITCH) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", yStart);
      line.setAttribute("x2", x);
      line.setAttribute("y2", yEnd);
      const major = Math.round(x / GRID_PITCH) % 5 === 0;
      line.setAttribute("class", major ? "grid-line grid-line-major" : "grid-line");
      gridLayer.appendChild(line);
    }
    for (let y = yStart; y <= yEnd; y += GRID_PITCH) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", xStart);
      line.setAttribute("y1", y);
      line.setAttribute("x2", xEnd);
      line.setAttribute("y2", y);
      const major = Math.round(y / GRID_PITCH) % 5 === 0;
      line.setAttribute("class", major ? "grid-line grid-line-major" : "grid-line");
      gridLayer.appendChild(line);
    }
  }

  function renderArrows() {
    arrowsLayer.innerHTML = "";
    if (relatesOverlayLayer) relatesOverlayLayer.innerHTML = "";
    if (relatesOverlayLayer && relatesOverlayLayer.parentNode) {
      // Ensure relates overlay is always rendered above all other SVG layers.
      relatesOverlayLayer.parentNode.appendChild(relatesOverlayLayer);
    }
    const drivenDrawn = new Set();
    const drawnSegments = [];
    const usedVerticals = [];
    const redGapCursor = {};
    const redGapUsed = {};

    const markVerticals = (points) => {
      pointsToSegments(points).forEach((seg) => {
        if (!isVertical(seg)) return;
        if (Math.abs(seg.a.y - seg.b.y) < GRID_PITCH * 0.5) return;
        usedVerticals.push({ x: seg.a.x, y1: seg.a.y, y2: seg.b.y });
      });
    };

    const allocRedLane = (gapIdx) => {
      const laneCount = gapRouteLaneCount(gapIdx);
      if (!redGapUsed[gapIdx]) redGapUsed[gapIdx] = new Set();
      if (redGapCursor[gapIdx] === undefined) redGapCursor[gapIdx] = 0;
      const preferredOrder = getGapLanePreferenceOrder(gapIdx, redGapCursor[gapIdx]);
      for (let step = 0; step < laneCount; step++) {
        const idx = preferredOrder[step];
        if (redGapUsed[gapIdx].has(idx)) continue;
        redGapUsed[gapIdx].add(idx);
        redGapCursor[gapIdx] += 1;
        return idx;
      }
      const fallback = preferredOrder[0];
      redGapUsed[gapIdx].add(fallback);
      redGapCursor[gapIdx] += 1;
      return fallback;
    };

    const childrenByParent = {};
    LEVELS.forEach((level) => {
      const reqs = data[level] || {};
      Object.entries(reqs).forEach(([id, req]) => {
        const driven = req.driven_by;
        if (!driven || driven === "None" || !data.by_id[driven]) return;
        if (!childrenByParent[driven]) childrenByParent[driven] = [];
        childrenByParent[driven].push(id);
      });
    });

    const parentIds = Object.keys(childrenByParent).sort((a, b) => {
      const ra = rowMap[a] ?? 0;
      const rb = rowMap[b] ?? 0;
      if (ra !== rb) return ra - rb;
      const pa = positions[a];
      const pb = positions[b];
      const xa = pa ? pa.x : 0;
      const xb = pb ? pb.x : 0;
      return xa - xb;
    });

    parentIds.forEach((parentId) => {
      const parentRow = rowMap[parentId];
      const children = (childrenByParent[parentId] || [])
        .filter((childId) => !drivenDrawn.has(childId))
        .sort((a, b) => {
          const pa = positions[a];
          const pb = positions[b];
          const xa = pa ? pa.x : 0;
          const xb = pb ? pb.x : 0;
          return xa - xb;
        });
      if (!children.length || parentRow === undefined) return;

      const lane = allocRedLane(parentRow);
      children.forEach((childId, idx) => {
        const points = routeDrivenByBusPoints(parentId, childId, lane, idx === 0);
        const path = pointsToPath(points);
        if (!path || !points) return;
        drivenDrawn.add(childId);
        const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("class", "arrow-driven");
        el.setAttribute("d", path);
        arrowsLayer.appendChild(el);
        drawnSegments.push(...pointsToSegments(points));
        markVerticals(points);
      });
    });

    if (activeRelatesOverlayReqId) {
      drawRelatesOverlayForRequirement(activeRelatesOverlayReqId, drawnSegments, usedVerticals);
    }
    renderRelatesStubs();
  }

  function getRelatesHandleGeometry(reqId, neighbors) {
    const pos = positions[reqId];
    if (!pos) return null;
    const side = "right";
    const dir = 1;
    const anchor = boxEdge(reqId, side);
    if (!anchor) return null;
    const stubEnd = { x: anchor.x + (dir * RELATES_STUB_LENGTH), y: anchor.y };
    const center = { x: anchor.x + (dir * RELATES_BUBBLE_CENTER_OFFSET), y: anchor.y };
    return { anchor, stubEnd, center };
  }

  function setActiveRelatesOverlay(reqId) {
    const nextReqId = reqId && positions[reqId] ? reqId : null;
    if (activeRelatesOverlayReqId === nextReqId) return;
    activeRelatesOverlayReqId = nextReqId;
    renderArrows();
  }

  function renderRelatesStubs() {
    if (!relatesOverlayLayer) return;
    const relationAdjacency = collectRelationAdjacency();
    Object.entries(relationAdjacency).forEach(([reqId, neighborsSet]) => {
      const neighbors = [...(neighborsSet || [])].filter((id) => positions[id]);
      const count = neighbors.length;
      if (!count || !positions[reqId]) return;
      const geometry = getRelatesHandleGeometry(reqId, neighbors);
      if (!geometry) return;

      const active = activeRelatesOverlayReqId === reqId;
      const stub = document.createElementNS("http://www.w3.org/2000/svg", "path");
      stub.setAttribute("class", "relates-stub");
      if (active) stub.style.strokeWidth = "3.5";
      stub.setAttribute(
        "d",
        `M ${geometry.anchor.x} ${geometry.anchor.y} L ${geometry.stubEnd.x} ${geometry.stubEnd.y}`
      );
      relatesOverlayLayer.appendChild(stub);

      const handle = document.createElementNS("http://www.w3.org/2000/svg", "g");
      handle.setAttribute("class", active ? "relates-handle relates-handle--active" : "relates-handle");
      handle.setAttribute("role", "button");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute(
        "aria-label",
        count === 1 ? `Show relates-to link for ${reqId}` : `Show ${count} relates-to links for ${reqId}`
      );

      const hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hitTarget.setAttribute("cx", geometry.center.x);
      hitTarget.setAttribute("cy", geometry.center.y);
      hitTarget.setAttribute("r", RELATES_BUBBLE_RADIUS + 6);
      hitTarget.setAttribute("fill", "transparent");
      handle.appendChild(hitTarget);

      const bubble = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      bubble.setAttribute("class", "relates-count-circle");
      bubble.setAttribute("cx", geometry.center.x);
      bubble.setAttribute("cy", geometry.center.y);
      bubble.setAttribute("r", RELATES_BUBBLE_RADIUS);
      handle.appendChild(bubble);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "relates-count-label");
      label.setAttribute("x", geometry.center.x);
      label.setAttribute("y", geometry.center.y);
      label.textContent = count > 99 ? "99+" : String(count);
      handle.appendChild(label);

      const activateOverlay = () => {
        if (currentViewerMode !== "tree") return;
        if (activeRelatesOverlayReqId === reqId) return;
        setActiveRelatesOverlay(reqId);
      };
      handle.addEventListener("pointerenter", activateOverlay);
      handle.addEventListener("pointermove", activateOverlay);
      handle.addEventListener("pointerleave", () => {
        if (activeRelatesOverlayReqId !== reqId) return;
        setActiveRelatesOverlay(null);
      });
      handle.addEventListener("focus", activateOverlay);
      handle.addEventListener("blur", () => {
        if (activeRelatesOverlayReqId !== reqId) return;
        setActiveRelatesOverlay(null);
      });
      relatesOverlayLayer.appendChild(handle);
    });
  }

  function allocateRelatesLane(blueGapCursor, blueGapUsed, gapIdx) {
    const laneCount = gapRouteLaneCount(gapIdx);
    if (blueGapCursor[gapIdx] === undefined) blueGapCursor[gapIdx] = 0;
    if (!blueGapUsed[gapIdx]) blueGapUsed[gapIdx] = new Set();
    for (let step = 0; step < laneCount; step++) {
      const idx = (blueGapCursor[gapIdx] + step) % laneCount;
      if (blueGapUsed[gapIdx].has(idx)) continue;
      blueGapUsed[gapIdx].add(idx);
      blueGapCursor[gapIdx] = (idx + 1) % laneCount;
      return idx;
    }
    return 0;
  }

  function buildRelatesLaneInfo(fromId, toId, blueGapCursor, blueGapUsed) {
    const fromRow = rowMap[fromId];
    const toRow = rowMap[toId];
    if (fromRow === undefined || toRow === undefined) return null;
    if (fromRow === toRow && areNeighborsInRow(fromId, toId)) {
      return { startLane: 0, endLane: 0, singleGap: fromRow };
    }
    if (fromRow === toRow) {
      const maxRow = Math.max(...Object.values(rowMap));
      const gap = fromRow < maxRow ? fromRow : Math.max(0, fromRow - 1);
      const lane = allocateRelatesLane(blueGapCursor, blueGapUsed, gap);
      return { startLane: lane, endLane: lane, singleGap: gap };
    }
    if (fromRow < toRow) {
      const startLane = allocateRelatesLane(blueGapCursor, blueGapUsed, fromRow);
      const endLane = allocateRelatesLane(blueGapCursor, blueGapUsed, toRow - 1);
      return { startLane, endLane };
    }
    const startLane = allocateRelatesLane(blueGapCursor, blueGapUsed, fromRow - 1);
    const endLane = allocateRelatesLane(blueGapCursor, blueGapUsed, toRow);
    return { startLane, endLane };
  }

  function drawRelatesOverlayForRequirement(reqId, priorSegments, usedVerticals) {
    if (!relatesOverlayLayer || !reqId || !positions[reqId]) return;
    const relationAdjacency = collectRelationAdjacency();
    const neighbors = [...(relationAdjacency[reqId] || [])]
      .filter((neighborId) => positions[neighborId])
      .sort((a, b) => {
        const ra = rowMap[a] ?? 0;
        const rb = rowMap[b] ?? 0;
        if (ra !== rb) return ra - rb;
        return (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0);
      });
    if (!neighbors.length) return;

    const blueGapCursor = {};
    const blueGapUsed = {};
    const seenSegments = (priorSegments || []).slice();
    const seenVerticals = (usedVerticals || []).slice();
    const markVerticals = (points) => {
      pointsToSegments(points).forEach((seg) => {
        if (!isVertical(seg)) return;
        if (Math.abs(seg.a.y - seg.b.y) < GRID_PITCH * 0.5) return;
        seenVerticals.push({ x: seg.a.x, y1: seg.a.y, y2: seg.b.y });
      });
    };
    neighbors.forEach((neighborId) => {
      const laneInfo = buildRelatesLaneInfo(reqId, neighborId, blueGapCursor, blueGapUsed);
      if (!laneInfo) return;
      const points = routeRelatesToPoints(reqId, neighborId, laneInfo, seenVerticals);
      const rawSegments = pointsToSegments(points);
      if (!rawSegments.length) return;
      const carvedSegments = rawSegments.flatMap((segment) => carveSegmentWithGaps(segment, seenSegments));
      const path = segmentsToPath(carvedSegments);
      if (!path) return;
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrow.setAttribute("class", "arrow-relates-overlay");
      arrow.setAttribute("d", path);
      relatesOverlayLayer.appendChild(arrow);
      seenSegments.push(...rawSegments);
      markVerticals(points);
    });
  }

  function renderBoxes() {
    boxesLayer.innerHTML = "";
    const ids = Object.keys(positions).sort((a, b) => {
      const pa = positions[a], pb = positions[b];
      return pa.y !== pb.y ? pa.y - pb.y : pa.x - pb.x;
    });
    ids.forEach((id) => {
      const req = data.by_id[id];
      if (!req) return;
      const pos = positions[id];
      const box = renderBox(req, pos.x, pos.y);
      boxesLayer.appendChild(box);
    });
  }

  function getContentPoint(screenX, screenY) {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    return {
      x: transform.x + (screenX - w / 2) / transform.k,
      y: transform.y + (screenY - h / 2) / transform.k
    };
  }

  function updateViewBox() {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    canvasEl.setAttribute("width", w);
    canvasEl.setAttribute("height", h);
  }

  function applyTransform() {
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    const root = canvasEl.querySelector("g#root");
    if (root) {
      const tx = transform.x, ty = transform.y, k = transform.k;
      root.setAttribute("transform", `translate(${w / 2}, ${h / 2}) scale(${k}) translate(${-tx}, ${-ty})`);
    }
    syncViewportZoomControls();
    renderGrid();
  }

  function fitViewToContent(options) {
    const rememberInitial = Boolean(options && options.rememberInitial);
    const ids = Object.keys(positions || {});
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    if (!ids.length || !w || !h) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach((id) => {
      const p = positions[id];
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    });

    const pad = GRID_PITCH * 10;
    const contentW = Math.max(GRID_PITCH, (maxX - minX) + (2 * pad));
    const contentH = Math.max(GRID_PITCH, (maxY - minY) + (2 * pad));
    const fitScale = Math.min(w / contentW, h / contentH) * 0.66;
    const k = clampTreeZoom(fitScale);

    transform.k = k;
    transform.x = (minX + maxX) / 2;
    transform.y = (minY + maxY) / 2;
    if (rememberInitial) initialTransform = cloneTransformState();
    syncViewportZoomControls();
  }

  function setZoomLevel(nextZoom, options) {
    if (!viewportEl) return;
    const clampedZoom = clampTreeZoom(nextZoom);
    const currentZoom = clampTreeZoom(transform.k);
    const opts = options || {};
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    const anchorX = Number.isFinite(opts.anchorX) ? opts.anchorX : (w / 2);
    const anchorY = Number.isFinite(opts.anchorY) ? opts.anchorY : (h / 2);
    if (clampedZoom !== currentZoom) {
      transform.x += (anchorX - w / 2) * (1 / currentZoom - 1 / clampedZoom);
      transform.y += (anchorY - h / 2) * (1 / currentZoom - 1 / clampedZoom);
      transform.k = clampedZoom;
    }
    if (opts.apply !== false) applyTransform();
  }

  function restoreInitialTreeView() {
    if (!initialTransform) return;
    transform.x = initialTransform.x;
    transform.y = initialTransform.y;
    transform.k = initialTransform.k;
    applyTransform();
  }

  function isViewportControlTarget(target) {
    return Boolean(target && target.closest && target.closest(".viewport-camera-controls"));
  }

  function invalidateGridCache() {
    gridRenderKey = "";
  }

  function scheduleTreeViewportRefresh() {
    if (viewportRefreshFrame) cancelAnimationFrame(viewportRefreshFrame);
    viewportRefreshFrame = requestAnimationFrame(() => {
      viewportRefreshFrame = 0;
      if (!viewportEl || !canvasEl) return;
      if (currentViewerMode !== "tree" || shouldShowViewerPlaceholder()) return;
      updateViewBox();
      invalidateGridCache();
      applyTransform();
    });
  }

  function handleViewportResize() {
    if (!viewportEl || !canvasEl) return;
    updateViewBox();
    invalidateGridCache();
    if (currentViewerMode === "tree" && !shouldShowViewerPlaceholder() && !initialTransform) {
      fitViewToContent({ rememberInitial: true });
    }
    applyTransform();
  }

  function onWheel(e) {
    if (currentViewerMode !== "tree") return;
    if (isViewportControlTarget(e.target)) return;
    e.preventDefault();
    const scale = e.deltaY > 0 ? (1 / ZOOM_STEP_FACTOR) : ZOOM_STEP_FACTOR;
    const rect = viewportEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setZoomLevel(transform.k * scale, { anchorX: mx, anchorY: my });
  }

  function onPointerDown(e) {
    if (currentViewerMode !== "tree") return;
    if (e.button !== 0) return;
    if (isViewportControlTarget(e.target)) return;
    if (e.target.closest && e.target.closest("#create-requirement-btn")) return;
    const box = e.target.closest ? e.target.closest(".req-box") : null;
    if (box) {
      const id = box.getAttribute("data-id");
      const req = data.by_id[id];
      if (req) {
        openDetailPanel(req);
        return;
      }
    }
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    transformStart = { x: transform.x, y: transform.y };
    viewportEl.classList.add("dragging");
  }

  function onPointerMove(e) {
    if (!isPanning) return;
    transform.x = transformStart.x - (e.clientX - panStart.x);
    transform.y = transformStart.y - (e.clientY - panStart.y);
    applyTransform();
  }

  function onPointerUp(e) {
    isPanning = false;
    viewportEl.classList.remove("dragging");
  }

  function onZoomSliderInput(e) {
    if (!viewportZoomSliderEl) return;
    const requestedZoom = sliderValueToZoom(viewportZoomSliderEl.value);
    const initialSliderValue = getInitialZoomSliderValue();
    let nextZoom = requestedZoom;
    if (initialSliderValue != null) {
      const requestedSliderValue = zoomToSliderValue(requestedZoom);
      if (Math.abs(requestedSliderValue - initialSliderValue) <= ZOOM_SLIDER_SNAP_STEPS) {
        nextZoom = initialTransform.k;
      }
    }
    setZoomLevel(nextZoom);
    e.stopPropagation();
  }

  function initViewportControls() {
    viewportControlsEl = document.getElementById("viewport-camera-controls");
    viewportHomeBtnEl = document.getElementById("viewport-home-btn");
    viewportZoomSliderEl = document.getElementById("viewport-zoom-slider");
    viewportZoomValueEl = document.getElementById("viewport-zoom-value");
    viewportZoomInitialMarkerEl = document.getElementById("viewport-zoom-initial-marker");
    if (viewportZoomSliderEl) {
      viewportZoomSliderEl.min = String(zoomToSliderValue(MIN_TREE_ZOOM));
      viewportZoomSliderEl.max = String(zoomToSliderValue(MAX_TREE_ZOOM));
      viewportZoomSliderEl.step = String(ZOOM_SLIDER_STEP);
      viewportZoomSliderEl.value = String(zoomToSliderValue(transform.k));
      viewportZoomSliderEl.addEventListener("input", onZoomSliderInput);
      viewportZoomSliderEl.addEventListener("pointerdown", (e) => e.stopPropagation());
      viewportZoomSliderEl.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    }
    if (viewportHomeBtnEl) {
      viewportHomeBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        restoreInitialTreeView();
      });
    }
    if (viewportControlsEl) {
      ["pointerdown", "click", "dblclick"].forEach((eventName) => {
        viewportControlsEl.addEventListener(eventName, (event) => event.stopPropagation());
      });
    }
    syncViewportZoomControls();
    updateViewportControlsVisibility();
  }

  function initPanZoom() {
    viewportEl.addEventListener("wheel", onWheel, { passive: false });
    viewportEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    if (typeof ResizeObserver === "function") {
      viewportResizeObserver = new ResizeObserver(() => {
        handleViewportResize();
      });
      viewportResizeObserver.observe(viewportEl);
    } else {
      window.addEventListener("resize", handleViewportResize);
    }
  }

  function syncDetailPanelFieldEditability(reqType) {
    const editable = isDetailPanelEditable();
    const showNameInput = editable || isNewRequirement;
    const currentType = reqType || refreshDetailPanelDerivedType();

    if (detailTitle) {
      detailTitle.classList.toggle("detail-panel__title--hidden", showNameInput);
    }
    if (detailNameInput) {
      detailNameInput.classList.toggle("detail-panel__name-input--hidden", !showNameInput);
    }
    if (detailAttributesWrap) {
      detailAttributesWrap.classList.toggle("detail-panel__attributes--editing", editable);
    }
    if (detailDefinition) {
      detailDefinition.classList.toggle("detail-panel__definition--hidden", !editable);
      if (editable) detailDefinition.removeAttribute("readonly");
      else detailDefinition.setAttribute("readonly", "readonly");
    }
    if (detailDefinitionDisplay) {
      detailDefinitionDisplay.classList.toggle("detail-panel__definition--hidden", editable);
    }
    if (detailExpectedSourceInput) {
      detailExpectedSourceInput.classList.toggle("detail-panel__source-input--hidden", !editable);
    }
    if (detailExpectedSourceEdit) {
      detailExpectedSourceEdit.disabled = !editable;
    }

    const propagationEditable = isDetailPanelPropagationEditable(currentType);
    if (detailPropagationFunctionInput) {
      detailPropagationFunctionInput.classList.toggle(
        "detail-panel__propagation-function-input--readonly",
        !propagationEditable
      );
      if (propagationEditable) detailPropagationFunctionInput.removeAttribute("readonly");
      else detailPropagationFunctionInput.setAttribute("readonly", "readonly");
    }
    setPropagationParamInputsEditable(propagationEditable);
  }

  function updateDetailPanelEditingVisibility() {
    if (!detailPanel) return;
    const wasPropagationVisible = detailPropagationSectionVisible;
    const editable = isDetailPanelEditable();
    detailPanel.classList.toggle("detail-panel--editing-disabled", !editable);
    detailPanel.classList.toggle("detail-panel--editing-enabled", editable);
    const currentType = refreshDetailPanelDerivedType();
    syncDetailPanelFieldEditability(currentType);
    if (detailBoundsEditBtn) {
      detailBoundsEditBtn.disabled = !editable;
    }
    if (detailPropagationFunctionEdit) {
      detailPropagationFunctionEdit.disabled = !editable || !isPropagationConfigurableRequirementType(currentType);
    }
    if (detailPropagationFunctionRemove) {
      detailPropagationFunctionRemove.disabled = (
        !editable
        || !selectedReqId
        || isNewRequirement
        || !isRemovableFunctionStubRequirementType(currentType)
      );
    }
    updateDetailPanelDeleteVisibility();
    if (!wasPropagationVisible && detailPropagationSectionVisible) {
      const selectedReq = selectedReqId ? data.by_id[selectedReqId] : null;
      if (selectedReq) {
        refreshDetailPanelTypeDependentUI({ req: selectedReq, loadPropagationOnShow: true });
      }
    }
  }

  function updateDetailPanelDeleteVisibility() {
    if (!detailActionsWrap) return;
    const showDelete = editingMode !== "deactivated" && !!selectedReqId && !isNewRequirement;
    detailActionsWrap.classList.toggle("detail-panel__actions--show-delete", showDelete);
  }

  function updateCreateRequirementButtonVisibility() {
    const leftPanelEditingContent = document.getElementById("left-panel-editing-content");
    const visible = editingMode !== "deactivated";
    if (leftPanelEditingContent) {
      leftPanelEditingContent.classList.toggle("left-panel__editing-content--hidden", !visible);
      leftPanelEditingContent.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    if (createRequirementBtn) {
      createRequirementBtn.setAttribute("aria-hidden", visible ? "false" : "true");
      createRequirementBtn.tabIndex = visible ? 0 : -1;
    }
    updateLeftDrawerUI();
  }

  function updateLeftPanelMetrics() {
    const leftPanel = document.getElementById("left-panel");
    if (!leftPanel) return;

    const requirements = Object.values(data.by_id || {}).filter(Boolean);
    const violatedCount = requirements.reduce((count, req) => {
      if (!req) return count;
      if (conflictsChecked) {
        return count + (getRequirementConflictLevel(req) === "error" ? 1 : 0);
      }
      return count + (String(req.status || "").toLowerCase() === "violated" ? 1 : 0);
    }, 0);
    const metrics = {
      totalRequirements: String(requirements.length),
      violatedRequirements: String(violatedCount),
      conflictsChecked: conflictsChecked ? "true" : "false"
    };

    // Keep the legacy refresh hook safe even when the current drawer has no metric widgets.
    [leftPanel, document.getElementById("left-panel-editing-content")].forEach((el) => {
      if (!el) return;
      Object.entries(metrics).forEach(([key, value]) => {
        el.dataset[key] = value;
      });
    });
  }

  function openDetailPanel(req) {
    isNewRequirement = false;
    selectedReqId = req.id;
    lastDetailReqId = req.id;
    isNameEditing = false;
    isAttributesEditing = false;
    isDefinitionEditing = false;
    isBoundsEditing = false;
    detailPanel.classList.remove("detail-panel--closed");
    detailPanel.setAttribute("aria-hidden", "false");
    updateDetailPanelToggle();
    detailTitle.textContent = (req.name || "").replace(/_/g, " ");
    detailNameInput.value = req.name || "";
    detailId.textContent = req.id;
    detailType.textContent = formatRequirementType(req.type);
    detailClass.textContent = String(req.level || "").toUpperCase();
    detailStatus.textContent = String(req.status || "analysis").toUpperCase();
    detailUnit.textContent = req.unit || "";
    detailUnitInput.value = req.unit || "";
    const drivenById = normalizeDrivenByValue(req.driven_by);
    detailDrivenBy.textContent = drivenById;
    detailDrivenByInput.value = drivenById;
    detailClassInput.value = String(req.level || "alpha").toLowerCase();
    detailStatusInput.value = String(req.status || "analysis").toLowerCase();
    detailDefinition.value = req.definition || "";
    detailDefinitionDisplay.textContent = req.definition || "";
    detailExpectedSourceInput.value = req.value_source || "";
    detailPropagationFunctionInput.value = normalizePropagationFunctionName(req.propagation_function);
    setPropagationEditMode(false);
    detailPanelComments = Array.isArray(req.comments)
      ? req.comments.filter((text) => text !== FUNCTION_CALCULATION_COMMENT)
      : [];
    expectedBoundsFromFunction = Boolean(req.expected_bounds_from_function);
    requiredBoundsFromFunction = Boolean(req.required_bounds_from_function);
    setNameEditMode(false);
    setAttributesEditMode(false);
    setDefinitionEditMode(false);
    setBoundsEditMode(false);
    updateDetailSourceButton();
    refreshDetailPanelTypeDependentUI({ req, loadPropagation: true }).finally(() => {
      const latestReq = data.by_id[req.id] || req;
      if (latestReq && latestReq.validation_error && isFunctionDrivenRequirement(latestReq)) {
        detailPropagationStatus.textContent = latestReq.validation_error;
        detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
      }
    });
    renderDetailComments();
    detailCheckConflictsBtn.disabled = false;
    lockCommitButton();
    detailDefinition.oninput = () => { /* track dirty */ };
    updateDetailPanelEditingVisibility();
    scheduleTreeViewportRefresh();
  }

  function defaultNewRequirement() {
    return {
      name: "",
      level: "alpha",
      type: "top_stub",
      status: "analysis",
      unit: "",
      driven_by: [],
      definition: "",
      value_source: "",
      comments: [],
      propagation_function: "",
      propagation_inputs: {},
      constrained_bounds: [0, 0],
      targeted_bounds: [null, null],
      solvable_bounds: [0, 0],
      solvable_distribution: defaultSolvableDistribution([0, 0]),
      required_bounds: [0, 0],
      expected_bounds: [0, 0],
      expected_bounds_from_function: false,
      required_bounds_from_function: false
    };
  }

  function openDetailPanelForNewRequirement() {
    isNewRequirement = true;
    selectedReqId = null;
    lastDetailReqId = null;
    isNameEditing = false;
    isAttributesEditing = false;
    isDefinitionEditing = false;
    isBoundsEditing = false;
    detailPanel.classList.remove("detail-panel--closed");
    detailPanel.setAttribute("aria-hidden", "false");
    updateDetailPanelToggle();
    const def = defaultNewRequirement();
    detailTitle.textContent = "New requirement";
    detailTitle.classList.add("detail-panel__title--hidden");
    detailNameInput.value = "";
    detailNameInput.classList.remove("detail-panel__name-input--hidden");
    detailId.textContent = "—";
    detailType.textContent = formatRequirementType(def.type || "top_stub");
    detailClass.textContent = "ALPHA";
    detailStatus.textContent = "ANALYSIS";
    detailUnit.textContent = "";
    detailUnitInput.value = "";
    detailDrivenBy.textContent = "";
    detailDrivenByInput.value = "";
    detailClassInput.value = "alpha";
    detailStatusInput.value = "analysis";
    detailDefinition.value = "";
    detailDefinitionDisplay.textContent = "";
    detailExpectedSourceInput.value = "";
    detailPropagationFunctionInput.value = "";
    setPropagationEditMode(false);
    detailPanelComments = [];
    expectedBoundsFromFunction = false;
    requiredBoundsFromFunction = false;
    setAttributesEditMode(false);
    setDefinitionEditMode(false);
    setBoundsEditMode(false);
    updateDetailSourceButton();
    refreshDetailPanelTypeDependentUI({ req: def, loadPropagation: true });
    renderDetailComments();
    detailCheckConflictsBtn.disabled = true;
    lockCommitButton();
    updateDetailPanelEditingVisibility();
    scheduleTreeViewportRefresh();
  }

  function refreshSelectedRequirementRendering(previousLevel, nextLevel) {
    if (previousLevel && nextLevel && previousLevel !== nextLevel) {
      refreshActiveViewer();
      return;
    }
    computeBoxLayouts();
    if (currentViewerMode === "tree") {
      renderBoxes();
    } else if (currentViewerMode === "table") {
      renderRequirementsTable();
    }
  }

  function setNameEditMode(editable) {
    isNameEditing = editable;
    detailNameInput.classList.toggle("detail-panel__name-input--hidden", !editable);
    detailTitle.classList.toggle("detail-panel__title--hidden", editable);
    if (editable) {
      detailNameInput.focus();
      detailNameInput.select();
      return;
    }
    const req = selectedReqId ? data.by_id[selectedReqId] : null;
    if (req) {
      detailTitle.textContent = (req.name || "").replace(/_/g, " ");
      detailNameInput.value = req.name || "";
    }
  }

  function commitNameEdit() {
    if (!selectedReqId || !isNameEditing) return;
    const req = data.by_id[selectedReqId];
    if (!req) {
      setNameEditMode(false);
      return;
    }
    const previousLevel = req.level;
    const nextName = String(detailNameInput.value || "").trim();
    req.name = nextName;
    if (data[req.level] && data[req.level][selectedReqId]) {
      data[req.level][selectedReqId].name = nextName;
    }
    setNameEditMode(false);
    lockCommitButton();
    refreshSelectedRequirementRendering(previousLevel, req.level);
  }

  function updateDetailSourceButton() {
    const src = (detailExpectedSourceInput.value || "").trim();
    if (!src) {
      detailExpectedSourceLink.textContent = "Source";
      detailExpectedSourceLink.setAttribute("href", "#");
      return;
    }
    detailExpectedSourceLink.textContent = "Open source";
    detailExpectedSourceLink.setAttribute("href", src);
  }

  function setAttributesEditMode(editable) {
    isAttributesEditing = editable;
    detailAttributesWrap.classList.toggle("detail-panel__attributes--editing", editable);
    if (editable) {
      refreshDetailPanelTypeDependentUI();
      detailClassInput.focus();
      return;
    }
    const req = selectedReqId ? data.by_id[selectedReqId] : null;
    if (req) {
      detailClassInput.value = String(req.level || "alpha").toLowerCase();
      detailStatusInput.value = String(req.status || "analysis").toLowerCase();
      detailUnitInput.value = req.unit || "";
      const drivenById = normalizeDrivenByValue(req.driven_by);
      detailDrivenBy.textContent = drivenById;
      detailDrivenByInput.value = drivenById;
    }
    clearDrivenBySuggestions();
    refreshDetailPanelTypeDependentUI();
  }

  function commitAttributesEdit() {
    if (!selectedReqId || !isAttributesEditing) return;
    const previousReq = data.by_id[selectedReqId];
    const previousLevel = previousReq ? previousReq.level : "";
    const nextLevel = String(detailClassInput.value || previousLevel || "alpha").toLowerCase();
    const nextStatus = String(detailStatusInput.value || previousReq.status || "analysis").toLowerCase();
    const nextUnit = String(detailUnitInput.value || "").trim();
    const nextDrivenBy = normalizeDrivenByValue(detailDrivenByInput.value);

    setAttributesEditMode(false);
    detailClass.textContent = nextLevel.toUpperCase();
    detailStatus.textContent = nextStatus.toUpperCase();
    detailUnit.textContent = nextUnit;
    detailDrivenBy.textContent = nextDrivenBy;
    detailClassInput.value = nextLevel;
    detailStatusInput.value = nextStatus;
    detailUnitInput.value = nextUnit;
    detailDrivenByInput.value = nextDrivenBy;
    refreshDetailPanelTypeDependentUI({ loadPropagationOnShow: true });
    patchSelectedRequirement({ level: nextLevel, status: nextStatus, driven_by: nextDrivenBy ? [nextDrivenBy] : [] })
      .then((updated) => {
        const updatedLevel = String(updated.level || nextLevel).toLowerCase();
        const updatedDrivenBy = normalizeDrivenByValue(updated.driven_by || nextDrivenBy);
        const updatedReq = selectedReqId ? data.by_id[selectedReqId] : null;
        if (updatedReq) {
          updatedReq.unit = nextUnit;
          updatedReq.driven_by = updatedDrivenBy;
          if (data[updatedLevel] && data[updatedLevel][selectedReqId]) {
            data[updatedLevel][selectedReqId].unit = nextUnit;
            data[updatedLevel][selectedReqId].driven_by = updatedDrivenBy;
          }
        }
        detailType.textContent = formatRequirementType((updatedReq && updatedReq.type) || updated.type);
        detailClass.textContent = String(updated.level || nextLevel).toUpperCase();
        detailStatus.textContent = String(updated.status || nextStatus).toUpperCase();
        detailUnit.textContent = nextUnit;
        detailDrivenBy.textContent = updatedDrivenBy;
        detailClassInput.value = String(updated.level || nextLevel).toLowerCase();
        detailStatusInput.value = String(updated.status || nextStatus).toLowerCase();
        detailUnitInput.value = nextUnit;
        detailDrivenByInput.value = updatedDrivenBy;
        refreshDetailPanelTypeDependentUI({ req: updatedReq || updated, loadPropagation: true });
        updateLeftPanelMetrics();
        lockCommitButton();
        refreshSelectedRequirementRendering(previousLevel, updated.level);
      })
      .catch((err) => {
        applyPropagationErrorPayload(err && err.payload ? err.payload : null);
        const req = selectedReqId ? data.by_id[selectedReqId] : null;
        if (req) {
          detailType.textContent = formatRequirementType(req.type);
          detailClass.textContent = String(req.level || "").toUpperCase();
          detailStatus.textContent = String(req.status || "").toUpperCase();
          detailUnit.textContent = req.unit || "";
          detailDrivenBy.textContent = normalizeDrivenByValue(req.driven_by);
          detailClassInput.value = String(req.level || "alpha").toLowerCase();
          detailStatusInput.value = String(req.status || "analysis").toLowerCase();
          detailUnitInput.value = req.unit || "";
          detailDrivenByInput.value = normalizeDrivenByValue(req.driven_by);
          refreshDetailPanelTypeDependentUI({ req, loadPropagation: true });
        }
        detailPropagationStatus.textContent = err && err.message ? err.message : "Attribute save failed";
        detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
      });
  }

  function clearDrivenBySuggestions() {
    if (detailDrivenBySuggestions) detailDrivenBySuggestions.innerHTML = "";
  }

  function renderDrivenBySuggestions(matches) {
    clearDrivenBySuggestions();
    if (!isDetailPanelEditable() || !matches.length || !detailDrivenBySuggestions) return;
    const list = document.createElement("ul");
    list.className = "detail-panel__driven-by-suggestions-list";
    matches.forEach((req) => {
      const li = document.createElement("li");
      li.className = "detail-panel__driven-by-suggestion-item";
      li.textContent = `${req.id} - ${(req.name || "").replace(/_/g, " ")}`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        detailDrivenByInput.value = req.id;
        clearDrivenBySuggestions();
        lockCommitButton();
        refreshDetailPanelTypeDependentUI({ loadPropagationOnShow: true });
      });
      list.appendChild(li);
    });
    detailDrivenBySuggestions.appendChild(list);
  }

  function updateDrivenBySuggestions() {
    if (!isDetailPanelEditable()) {
      clearDrivenBySuggestions();
      return;
    }
    const query = String(detailDrivenByInput && detailDrivenByInput.value ? detailDrivenByInput.value : "").trim();
    if (!query) {
      clearDrivenBySuggestions();
      return;
    }
    const matches = getRequirementMatches(query).filter((req) => req.id !== selectedReqId);
    renderDrivenBySuggestions(matches);
  }

  function setDefinitionEditMode(editable) {
    isDefinitionEditing = editable;
    detailDefinition.classList.toggle("detail-panel__definition--hidden", !editable);
    detailDefinitionDisplay.classList.toggle("detail-panel__definition--hidden", editable);
    if (editable) {
      detailDefinition.removeAttribute("readonly");
      detailDefinition.focus();
      detailDefinition.select();
      return;
    }
    detailDefinition.setAttribute("readonly", "readonly");
    detailDefinitionDisplay.textContent = detailDefinition.value || "";
  }

  function commitDefinitionEdit() {
    if (!selectedReqId || !isDefinitionEditing) return;
    setDefinitionEditMode(false);
    patchSelectedRequirement({ definition: detailDefinition.value || "" })
      .then((updated) => {
        detailDefinition.value = updated.definition || "";
        detailDefinitionDisplay.textContent = updated.definition || "";
      })
      .catch((err) => {
        applyPropagationErrorPayload(err && err.payload ? err.payload : null);
        detailPropagationStatus.textContent = err && err.message ? err.message : "Definition save failed";
        detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
      });
  }

  function setBoundsEditMode(editable) {
    const req = selectedReqId ? data.by_id[selectedReqId] : buildDetailPanelDraftRequirement();
    const reqType = refreshDetailPanelDerivedType() || (req && req.type) || "";
    isBoundsEditing = editable;
    if (req) fillDetailBoundsBoxes({ ...req, type: reqType });
    if (detailBoundsEditBtn) detailBoundsEditBtn.disabled = editingMode === "deactivated";
    if (editable) lockCommitButton();
  }

  function updatePropagationFunctionButton() {
    if (isPropagationEditing) return;
    const propagationEditable = isDetailPanelPropagationEditable(refreshDetailPanelDerivedType());
    detailPropagationFunctionInput.classList.toggle(
      "detail-panel__propagation-function-input--readonly",
      !propagationEditable
    );
    if (propagationEditable) detailPropagationFunctionInput.removeAttribute("readonly");
    else detailPropagationFunctionInput.setAttribute("readonly", "readonly");
  }

  function stagePropagationFunctionRemoval() {
    const reqType = refreshDetailPanelDerivedType() || (selectedReqId && data.by_id[selectedReqId] && data.by_id[selectedReqId].type) || "";
    if (
      editingMode === "deactivated"
      || !selectedReqId
      || isNewRequirement
      || !isRemovableFunctionStubRequirementType(reqType)
    ) {
      return;
    }

    detailPropagationFunctionInput.value = "";
    detailPropagationParams.innerHTML = "";
    currentPropagationParams = [];
    expectedBoundsFromFunction = false;
    requiredBoundsFromFunction = false;
    clearPropagationSuggestions();
    clearPropagationErrors();
    clearDetailPropagationStatus();
    updateCalculatedMarkers();
    setPropagationEditMode(false);
    refreshDetailPanelTypeDependentUI({ req: buildDetailPanelDraftRequirement(), loadPropagation: true });
    lockCommitButton();
    updateDetailPanelEditingVisibility();
  }

  function setPropagationParamInputsEditable(editable) {
    detailPropagationParams
      .querySelectorAll("input.detail-panel__propagation-param-input, input.detail-panel__param-invert-checkbox")
      .forEach((input) => {
        if (editable) {
          if (input.classList.contains("detail-panel__param-invert-checkbox")) {
            input.disabled = false;
            return;
          }
          input.removeAttribute("readonly");
          input.classList.remove("detail-panel__propagation-param-input--readonly");
        } else {
          if (input.classList.contains("detail-panel__param-invert-checkbox")) {
            input.disabled = true;
            return;
          }
          input.setAttribute("readonly", "readonly");
          input.classList.add("detail-panel__propagation-param-input--readonly");
        }
      });
  }

  function setPropagationEditMode(editable) {
    const reqType = refreshDetailPanelDerivedType() || (selectedReqId && data.by_id[selectedReqId] && data.by_id[selectedReqId].type) || "";
    if (editable && (editingMode === "deactivated" || !shouldShowPropagationSectionForType(reqType))) {
      return;
    }
    isPropagationEditing = editable;
    if (detailPropagationSection) {
      detailPropagationSection.classList.toggle("detail-panel__propagation-section--editing", editable);
    }
    if (editable) {
      lockCommitButton();
      detailPropagationFunctionInput.classList.remove("detail-panel__propagation-function-input--readonly");
      detailPropagationFunctionInput.removeAttribute("readonly");
      detailPropagationFunctionInput.focus();
      detailPropagationFunctionInput.select();
      setPropagationParamInputsEditable(true);
      return;
    }
    updatePropagationFunctionButton();
    setPropagationParamInputsEditable(false);
    clearPropagationSuggestions();
    clearPropagationErrors();
    detailPropagationParams
      .querySelectorAll(".detail-panel__propagation-suggestions-list")
      .forEach((el) => el.remove());
  }

  function clearPropagationSuggestions() {
    detailPropagationSuggestions.innerHTML = "";
  }

  function renderPropagationSuggestions(items) {
    clearPropagationSuggestions();
    if (!items.length || !isDetailPanelPropagationEditable(refreshDetailPanelDerivedType())) return;
    const list = document.createElement("ul");
    list.className = "detail-panel__propagation-suggestions-list";
    items.forEach((name) => {
      const li = document.createElement("li");
      li.className = "detail-panel__propagation-suggestion-item";
      li.textContent = name;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        detailPropagationFunctionInput.value = name;
        clearPropagationSuggestions();
        commitPropagationFunctionEdit({ keepEditing: true, focusFirstParam: true });
      });
      list.appendChild(li);
    });
    detailPropagationSuggestions.appendChild(list);
  }

  function updatePropagationSuggestions() {
    const q = (detailPropagationFunctionInput.value || "").trim();
    if (!q || !isDetailPanelPropagationEditable(refreshDetailPanelDerivedType())) {
      clearPropagationSuggestions();
      return;
    }
    lastPropagationSuggestionsRequest = q;
    fetch(`/api/functions/suggest?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        if (lastPropagationSuggestionsRequest !== q) return;
        renderPropagationSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
      })
      .catch(() => clearPropagationSuggestions());
  }

  function focusFirstPropagationParamInput() {
    const firstInput = detailPropagationParams
      ? detailPropagationParams.querySelector('input.detail-panel__propagation-param-input[data-bound="lower"]')
      : null;
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }
  }

  function commitPropagationFunctionEdit(options) {
    const opts = options && typeof options === "object" ? options : {};
    const currentInputs = collectPropagationInputs();
    clearPropagationSuggestions();
    return checkPropagationFunction(detailPropagationFunctionInput.value, currentInputs)
      .then(() => {
        if (opts.keepEditing) {
          setPropagationParamInputsEditable(true);
          if (opts.focusFirstParam) focusFirstPropagationParamInput();
          return;
        }
        setPropagationEditMode(false);
      });
  }

  function getRequirementMatches(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    const all = Object.values(data.by_id || {});
    const ranked = all
      .map((req) => {
        const id = String(req.id || "");
        const name = String(req.name || "").replace(/_/g, " ");
        const idLower = id.toLowerCase();
        const nameLower = name.toLowerCase();
        let score = 0;
        if (idLower.startsWith(q)) score += 5;
        else if (idLower.includes(q)) score += 3;
        if (nameLower.includes(q)) score += 2;
        return { req, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || String(a.req.id).localeCompare(String(b.req.id)));
    return ranked.slice(0, 8).map((item) => item.req);
  }

  function renderParameterSuggestions(suggestionsEl, inputEl) {
    suggestionsEl.innerHTML = "";
    if (!isDetailPanelPropagationEditable(refreshDetailPanelDerivedType())) return;
    const q = (inputEl.value || "").trim();
    if (!q) return;
    // Wrapped string literals should not trigger requirement suggestions.
    if ((q.startsWith("(") && q.endsWith(")")) || (q.startsWith("'") && q.endsWith("'")) || (q.startsWith("\"") && q.endsWith("\""))) return;
    const matches = getRequirementMatches(q);
    if (!matches.length) return;
    const row = inputEl.closest(".detail-panel__param-row");
    const list = document.createElement("ul");
    list.className = "detail-panel__propagation-suggestions-list";
    matches.forEach((req) => {
      const li = document.createElement("li");
      li.className = "detail-panel__propagation-suggestion-item";
      li.textContent = `${req.id} - ${(req.name || "").replace(/_/g, " ")}`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (row) {
          const lowerInput = row.querySelector('input.detail-panel__propagation-param-input[data-bound="lower"]');
          const upperInput = row.querySelector('input.detail-panel__propagation-param-input[data-bound="upper"]');
          const lowerCell = lowerInput ? lowerInput.closest(".detail-panel__param-cell") : null;
          const upperCell = upperInput ? upperInput.closest(".detail-panel__param-cell") : null;
          const lowerError = lowerCell ? lowerCell.querySelector(".detail-panel__param-error") : null;
          const upperError = upperCell ? upperCell.querySelector(".detail-panel__param-error") : null;
          if (lowerInput) {
            lowerInput.value = req.id;
            lowerInput.classList.remove("detail-panel__input--error");
          }
          if (upperInput) {
            upperInput.value = req.id;
            upperInput.classList.remove("detail-panel__input--error");
          }
          if (lowerCell) lowerCell.classList.remove("detail-panel__param-cell--error");
          if (upperCell) upperCell.classList.remove("detail-panel__param-cell--error");
          if (lowerError) {
            lowerError.textContent = "";
            lowerError.classList.remove("detail-panel__param-error--visible");
          }
          if (upperError) {
            upperError.textContent = "";
            upperError.classList.remove("detail-panel__param-error--visible");
          }
        } else {
          inputEl.value = `${req.id}`;
        }
        suggestionsEl.innerHTML = "";
        lockCommitButton();
      });
      list.appendChild(li);
    });
    suggestionsEl.appendChild(list);
  }

  function resolvePropagationInput(raw, bound, invertBounds) {
    const text = String(raw || "").trim();
    if (!text) return { input: "", value: null };
    if (text.length >= 2 && text.startsWith("(") && text.endsWith(")")) {
      return { input: text, value: text.slice(1, -1).trim() };
    }
    if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
      return { input: text, value: text.slice(1, -1) };
    }
    if (text.length >= 2 && text.startsWith("\"") && text.endsWith("\"")) {
      return { input: text, value: text.slice(1, -1) };
    }
    const effectiveBound = invertBounds
      ? (bound === "upper" ? "lower" : "upper")
      : (bound === "upper" ? "upper" : "lower");
    const simpleRef = text.match(/^([A-Za-z0-9_]+)$/);
    if (simpleRef) {
      const reqId = simpleRef[1];
      const req = data.by_id[reqId];
      if (!req) return { input: text, value: null };
      const b = Array.isArray(req.expected_bounds) ? req.expected_bounds : [];
      const idx = effectiveBound === "upper" ? 1 : 0;
      const n = Number(b[idx]);
      return { input: text, value: Number.isFinite(n) ? n : null };
    }
    const m = text.match(/^([A-Za-z0-9_]+)\s+(lower|upper)$/i);
    if (m) {
      const reqId = m[1];
      const selector = m[2].toLowerCase();
      const req = data.by_id[reqId];
      if (!req) return { input: text, value: null };
      const b = Array.isArray(req.expected_bounds) ? req.expected_bounds : [];
      const idx = selector === "upper" ? 1 : 0;
      const n = Number(b[idx]);
      return { input: text, value: Number.isFinite(n) ? n : null };
    }
    const n = Number(text);
    if (Number.isFinite(n)) return { input: text, value: n };
    return { input: text, value: null };
  }

  function renderPropagationParams(params, values) {
    detailPropagationParams.innerHTML = "";
    currentPropagationParams = params.slice();
    const propagationEditable = isDetailPanelPropagationEditable(refreshDetailPanelDerivedType());
    params.forEach((name) => {
      const row = document.createElement("div");
      row.className = "detail-panel__param-row";
      row.setAttribute("data-param", name);

      const label = document.createElement("span");
      label.className = "detail-panel__param-name";
      label.textContent = name;

      const raw = values && Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
      let lowerInput = "";
      let upperInput = "";
      let invertBounds = false;
      if (raw && typeof raw === "object") {
        lowerInput = raw.lower_input !== undefined ? String(raw.lower_input) : "";
        upperInput = raw.upper_input !== undefined ? String(raw.upper_input) : "";
        invertBounds = Boolean(raw.invert_bounds);
      } else if (raw !== null && raw !== undefined) {
        lowerInput = String(raw);
        upperInput = String(raw);
      }

      ["lower", "upper"].forEach((bound) => {
        const wrap = document.createElement("div");
        wrap.className = "detail-panel__param-cell";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "detail-panel__input detail-panel__propagation-param-input";
        input.setAttribute("data-bound", bound);
        input.value = bound === "lower" ? lowerInput : upperInput;
        input.placeholder = "REQ_ID, number (e.g. 4E5), or (string)";
        if (!propagationEditable) {
          input.setAttribute("readonly", "readonly");
          input.classList.add("detail-panel__propagation-param-input--readonly");
        }
        const suggestions = document.createElement("div");
        suggestions.className = "detail-panel__propagation-suggestions";
        const error = document.createElement("div");
        error.className = "detail-panel__param-error";
        input.addEventListener("input", () => {
          lockCommitButton();
          input.classList.remove("detail-panel__input--error");
          wrap.classList.remove("detail-panel__param-cell--error");
          error.textContent = "";
          error.classList.remove("detail-panel__param-error--visible");
          renderParameterSuggestions(suggestions, input);
        });
        input.addEventListener("blur", () => {
          setTimeout(() => { suggestions.innerHTML = ""; }, 120);
        });
        wrap.appendChild(input);
        wrap.appendChild(error);
        wrap.appendChild(suggestions);
        row.appendChild(wrap);
      });

      const invertWrap = document.createElement("div");
      invertWrap.className = "detail-panel__param-invert-cell";
      const invertLabel = document.createElement("label");
      invertLabel.className = "detail-panel__param-invert-wrap";
      const invertInput = document.createElement("input");
      invertInput.type = "checkbox";
      invertInput.className = "detail-panel__param-invert-checkbox";
      invertInput.checked = invertBounds;
      invertInput.setAttribute("aria-label", `Invert ${name} propagation bounds`);
      invertInput.title = "INV";
      if (!propagationEditable) invertInput.disabled = true;
      invertInput.addEventListener("change", () => {
        lockCommitButton();
      });
      invertLabel.appendChild(invertInput);
      invertWrap.appendChild(invertLabel);
      row.appendChild(invertWrap);

      row.appendChild(label);
      row.insertBefore(label, row.firstChild);
      detailPropagationParams.appendChild(row);
    });
  }

  function collectPropagationInputs() {
    const out = {};
    detailPropagationParams.querySelectorAll(".detail-panel__param-row").forEach((row) => {
      const param = row.getAttribute("data-param");
      if (!param) return;
      const lowerInput = row.querySelector('input.detail-panel__propagation-param-input[data-bound="lower"]');
      const upperInput = row.querySelector('input.detail-panel__propagation-param-input[data-bound="upper"]');
      const invertInput = row.querySelector("input.detail-panel__param-invert-checkbox");
      if (!lowerInput || !upperInput) return;
      const invertBounds = Boolean(invertInput && invertInput.checked);
      out[param] = {
        lower_input: String(lowerInput.value || "").trim(),
        upper_input: String(upperInput.value || "").trim(),
        invert_bounds: invertBounds
      };
    });
    return out;
  }

  function clearPropagationErrors() {
    detailPropagationFunctionInput.classList.remove("detail-panel__input--error");
    detailPropagationParams
      .querySelectorAll(".detail-panel__input--error")
      .forEach((el) => el.classList.remove("detail-panel__input--error"));
    detailPropagationParams
      .querySelectorAll(".detail-panel__param-cell--error")
      .forEach((el) => el.classList.remove("detail-panel__param-cell--error"));
    detailPropagationParams
      .querySelectorAll(".detail-panel__param-error")
      .forEach((el) => {
        el.textContent = "";
        el.classList.remove("detail-panel__param-error--visible");
      });
  }

  function setPropagationFieldError(param, bound, message) {
    if (!param) return;
    const row = detailPropagationParams.querySelector(`.detail-panel__param-row[data-param="${param}"]`);
    if (!row) return;
    const selector = bound === "upper" ? "upper" : "lower";
    const input = row.querySelector(`input.detail-panel__propagation-param-input[data-bound="${selector}"]`);
    if (!input) return;
    const cell = input.closest(".detail-panel__param-cell");
    if (cell) cell.classList.add("detail-panel__param-cell--error");
    input.classList.add("detail-panel__input--error");
    const errorEl = cell ? cell.querySelector(".detail-panel__param-error") : null;
    if (errorEl) {
      errorEl.textContent = String(message || "Invalid value.");
      errorEl.classList.add("detail-panel__param-error--visible");
    }
  }

  function applyPropagationErrorPayload(payload, options) {
    const settings = options && typeof options === "object" ? options : {};
    const targetReqId = String(settings.reqId || "").trim();
    if (settings.clear !== false) {
      clearPropagationErrors();
    }
    const payloadReqId = payload && payload.req_id ? String(payload.req_id).trim() : "";
    if (targetReqId && payloadReqId && payloadReqId !== targetReqId) {
      return false;
    }
    const fieldErrors = payload && Array.isArray(payload.field_errors) ? payload.field_errors : [];
    let hasMappedFieldError = false;
    fieldErrors.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const itemReqId = item.req_id ? String(item.req_id).trim() : "";
      if (targetReqId && itemReqId && itemReqId !== targetReqId) return;
      if (item.field === "function_name") {
        detailPropagationFunctionInput.classList.add("detail-panel__input--error");
        hasMappedFieldError = true;
        return;
      }
      if (item.param) {
        if (item.bound) {
          setPropagationFieldError(item.param, item.bound, item.message || payload.error);
        } else {
          setPropagationFieldError(item.param, "lower", item.message || payload.error);
          setPropagationFieldError(item.param, "upper", item.message || payload.error);
        }
        hasMappedFieldError = true;
      }
    });
    return hasMappedFieldError;
  }

  function getValidationIssuesForRequirement(validationIssues, reqId) {
    const targetReqId = String(reqId || "").trim();
    if (!targetReqId) return [];
    return (Array.isArray(validationIssues) ? validationIssues : []).filter((issue) => (
      issue
      && typeof issue === "object"
      && String(issue.req_id || "").trim() === targetReqId
    ));
  }

  function buildValidationIssueSaveMessage(validationIssues, reqId) {
    const issues = Array.isArray(validationIssues) ? validationIssues : [];
    if (!issues.length) return "Saved the full requirement tree.";
    const currentIssues = getValidationIssuesForRequirement(issues, reqId);
    const otherIssueCount = Math.max(0, issues.length - currentIssues.length);
    if (currentIssues.length && otherIssueCount) {
      return `Saved the full requirement tree. ${currentIssues.length} validation issue(s) remain for ${reqId}; ${otherIssueCount} other issue(s) remain elsewhere.`;
    }
    if (currentIssues.length) {
      return `Saved the full requirement tree. ${currentIssues.length} validation issue(s) remain for ${reqId}.`;
    }
    return `Saved the full requirement tree. ${issues.length} validation issue(s) remain in other requirements.`;
  }

  function buildRequirementsSnapshotFromData() {
    const snapshot = { alpha: {}, beta: {}, gamma: {} };
    LEVELS.forEach((level) => {
      snapshot[level] = {};
    });
    Object.values(data.by_id || {}).forEach((req) => {
      if (!req || !req.id) return;
      const level = LEVELS.includes(req.level) ? req.level : "alpha";
      const cloned = JSON.parse(JSON.stringify(req));
      delete cloned.id;
      delete cloned.level;
      snapshot[level][req.id] = cloned;
    });
    return snapshot;
  }

  function setRequirementStateFromPayload(reqId, payload) {
    const req = data.by_id[reqId];
    if (!req) return;
    req.expected_bounds = payload.expected_bounds;
    req.required_bounds = payload.required_bounds;
    req.expected_bounds_from_function = true;
    req.required_bounds_from_function = true;
    if (data[req.level] && data[req.level][reqId]) {
      data[req.level][reqId].expected_bounds = payload.expected_bounds;
      data[req.level][reqId].required_bounds = payload.required_bounds;
      data[req.level][reqId].expected_bounds_from_function = true;
      data[req.level][reqId].required_bounds_from_function = true;
    }
    if (selectedReqId === reqId) {
      expectedBoundsFromFunction = true;
      requiredBoundsFromFunction = true;
    }
  }

  function nextRequirementIdInLevel(level) {
    const taken = new Set();
    Object.keys(data.by_id || {}).forEach((key) => {
      const m = /^RQ(\d+)$/i.exec(key);
      if (m) taken.add(parseInt(m[1], 10));
    });
    let n = 1;
    while (taken.has(n)) n += 1;
    return `RQ${n}`;
  }

  function applySelectedPanelEditsToState() {
    if (isNewRequirement) {
      const name = (detailNameInput.value || "").trim();
      if (!name) return;
      const level = (detailClassInput.value || "alpha").toLowerCase();
      const newId = nextRequirementIdInLevel(level);
      const drivenByVal = normalizeDrivenByValue(detailDrivenByInput.value);
      const derivedType = refreshDetailPanelDerivedType();
      const propagationState = getCurrentDetailPropagationState(defaultNewRequirement(), derivedType);
      const boundsState = getCurrentDetailBoundsState(defaultNewRequirement(), derivedType);
      const entry = {
        name,
        level,
        id: newId,
        type: derivedType,
        status: (detailStatusInput.value || "analysis").toLowerCase(),
        unit: (detailUnitInput.value || "").trim(),
        driven_by: drivenByVal ? [drivenByVal] : [],
        definition: detailDefinition.value || "",
        value_source: detailExpectedSourceInput.value || "",
        comments: Array.isArray(detailPanelComments) ? detailPanelComments.slice() : [],
        propagation_function: propagationState.propagation_function,
        propagation_inputs: propagationState.propagation_inputs,
        expected_bounds_from_function: Boolean(expectedBoundsFromFunction),
        required_bounds_from_function: Boolean(requiredBoundsFromFunction),
        constrained_bounds: boundsState.constrained_bounds,
        targeted_bounds: boundsState.targeted_bounds,
        solvable_bounds: boundsState.solvable_bounds,
        required_bounds: boundsState.required_bounds,
        expected_bounds: boundsState.expected_bounds
      };
      if (!isConstraintStubRequirementType(derivedType)) {
        delete entry.constrained_bounds;
      } else {
        delete entry.targeted_bounds;
      }
      applyUpdatedRequirementToState(newId, entry);
      selectedReqId = newId;
      isNewRequirement = false;
      createdRequirementIdsThisSession.add(newId);
      return;
    }
    if (!selectedReqId) return;
    const req = data.by_id[selectedReqId];
    if (!req) return;
    const derivedType = refreshDetailPanelDerivedType();
    const propagationState = getCurrentDetailPropagationState(req, derivedType);
    const boundsState = getCurrentDetailBoundsState(req, derivedType);
    const nextName = String(detailNameInput.value || detailTitle.textContent || req.name || "").trim();
    const nextUnit = isDetailPanelEditable()
      ? String(detailUnitInput.value || "").trim()
      : String(detailUnit.textContent || req.unit || "").trim();
    const nextDrivenBy = isDetailPanelEditable()
      ? normalizeDrivenByValue(detailDrivenByInput.value)
      : normalizeDrivenByValue(detailDrivenBy.textContent || req.driven_by || "");
    const next = {
      ...req,
      id: selectedReqId,
      name: nextName,
      level: (detailClassInput.value || req.level || "alpha").toLowerCase(),
      status: (detailStatusInput.value || req.status || "analysis").toLowerCase(),
      unit: nextUnit,
      driven_by: nextDrivenBy,
      type: derivedType,
      definition: detailDefinition.value || req.definition || "",
      value_source: detailExpectedSourceInput.value || "",
      comments: Array.isArray(detailPanelComments) ? detailPanelComments.slice() : [],
      propagation_function: propagationState.propagation_function,
      propagation_inputs: propagationState.propagation_inputs,
      constrained_bounds: boundsState.constrained_bounds,
      targeted_bounds: boundsState.targeted_bounds,
      solvable_bounds: boundsState.solvable_bounds,
      required_bounds: boundsState.required_bounds,
      expected_bounds: boundsState.expected_bounds,
      expected_bounds_from_function: Boolean(expectedBoundsFromFunction),
      required_bounds_from_function: Boolean(requiredBoundsFromFunction)
    };
    if (!isConstraintStubRequirementType(derivedType)) {
      delete next.constrained_bounds;
    } else {
      delete next.targeted_bounds;
    }
    applyUpdatedRequirementToState(selectedReqId, next);
  }

  function evaluatePropagationForRequirement(reqId, requirementsSnapshot) {
    const req = data.by_id[reqId];
    if (!req) return Promise.resolve();
    if (!isFunctionDrivenRequirement(req)) return Promise.resolve();
    const functionName = normalizePropagationFunctionName(req.propagation_function);
    if (!functionName) return Promise.resolve();
    const paramRefs = getPropagationInputSpecs(reqId);
    const snapshotPayload = {
      alpha: requirementsSnapshot.alpha || {},
      beta: requirementsSnapshot.beta || {},
      gamma: requirementsSnapshot.gamma || {}
    };
    return fetch("/api/propagation/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        req_id: reqId,
        function_name: functionName,
        param_refs: paramRefs,
        requirements_snapshot: snapshotPayload
      })
    })
      .then((r) => r.json().then((payload) => ({ ok: r.ok, payload })))
      .then(({ ok, payload }) => {
        if (!ok) {
          const err = new Error(payload && payload.error ? payload.error : `Propagation evaluation failed for ${reqId}`);
          err.payload = payload;
          throw err;
        }
        setRequirementStateFromPayload(reqId, payload);
        if (requirementsSnapshot[req.level] && requirementsSnapshot[req.level][reqId]) {
          requirementsSnapshot[req.level][reqId].expected_bounds = payload.expected_bounds;
          requirementsSnapshot[req.level][reqId].required_bounds = payload.required_bounds;
          requirementsSnapshot[req.level][reqId].expected_bounds_from_function = true;
          requirementsSnapshot[req.level][reqId].required_bounds_from_function = true;
        }
        return payload;
      });
  }

  function evaluatePropagationChainForRequirement(reqId, requirementsSnapshot, activeReqIds, completedReqIds) {
    const req = data.by_id[reqId];
    const active = activeReqIds || new Set();
    const completed = completedReqIds || new Set();
    if (!req || !isFunctionDrivenRequirement(req)) return Promise.resolve();
    if (completed.has(reqId)) return Promise.resolve();
    if (active.has(reqId)) {
      return Promise.reject(new Error(`Propagation dependency cycle detected at ${reqId}.`));
    }

    active.add(reqId);
    let chain = Promise.resolve();
    getPropagationDependencyRequirementIds(reqId, data.by_id || {}).forEach((depId) => {
      const depReq = data.by_id[depId];
      if (!depReq || !isFunctionDrivenRequirement(depReq)) return;
      chain = chain.then(() => evaluatePropagationChainForRequirement(depId, requirementsSnapshot, active, completed));
    });

    return chain
      .then(() => evaluatePropagationForRequirement(reqId, requirementsSnapshot))
      .then((payload) => {
        completed.add(reqId);
        active.delete(reqId);
        return payload;
      })
      .catch((err) => {
        active.delete(reqId);
        throw err;
      });
  }

  function evaluatePropagationBranchFromStub(reqId, requirementsSnapshot, completedReqIds, byId) {
    const nextById = byId && typeof byId === "object" ? byId : {};
    const branchReqIds = getDrivenByBranchRequirementIds(reqId, nextById);
    let chain = Promise.resolve();
    branchReqIds.forEach((branchReqId) => {
      const branchReq = nextById[branchReqId];
      if (!branchReq || !isFunctionDrivenRequirement(branchReq)) return;
      chain = chain.then(() =>
        evaluatePropagationChainForRequirement(branchReqId, requirementsSnapshot, new Set(), completedReqIds)
      );
    });
    return chain;
  }

  function evaluatePropagationForSelected() {
    if (!selectedReqId) return Promise.reject(new Error("No requirement selected"));
    const functionName = normalizePropagationFunctionName(detailPropagationFunctionInput.value);
    if (!functionName) return Promise.reject(new Error("No propagation function selected"));
    clearPropagationErrors();
    applySelectedPanelEditsToState();
    const snapshot = buildRequirementsSnapshotFromData();
    return evaluatePropagationChainForRequirement(selectedReqId, snapshot)
      .then((payload) => {
        const req = data.by_id[selectedReqId];
        if (req) {
          renderDetailBoundsPlot(req);
          fillDetailBoundsBoxes(req);
          updateCalculatedMarkers();
        }
        if (currentViewerMode === "tree") {
          renderBoxes();
        } else if (currentViewerMode === "table") {
          renderRequirementsTable();
        }
        detailPropagationStatus.textContent = "Expected and required bounds updated from propagation function.";
        detailPropagationStatus.classList.remove("detail-panel__propagation-status--error");
        return payload;
      });
  }

  function checkConflictsForAllRequirements(options) {
    const settings = options && typeof options === "object" ? options : {};
    const suppressStatusMessage = Boolean(settings.suppressStatusMessage);
    syncTargetedBoundsStateFromInputs();
    applySelectedPanelEditsToState();
    clearPropagationErrors();
    const snapshot = buildRequirementsSnapshotFromData();
    const evaluationPlan = buildPropagationEvaluationPlan(data.by_id || {});
    const failures = [];
    const completedReqIds = new Set();
    let chain = Promise.resolve();
    const runBranchPhase = (stubReqIds) => {
      stubReqIds.forEach((reqId) => {
        chain = chain.then(() =>
          evaluatePropagationBranchFromStub(reqId, snapshot, completedReqIds, data.by_id || {})
            .catch((err) => {
              failures.push({ reqId, err });
            })
        );
      });
    };

    runBranchPhase(evaluationPlan.constraintStubReqIds || []);
    runBranchPhase(evaluationPlan.functionStubReqIds || []);

    return chain.then(() => {
      let violatedCount = 0;
      Object.values(data.by_id || {}).forEach((req) => {
        if (!req || !req.id) return;
        const conflictLevel = getRequirementConflictLevel(req);
        req.status = conflictLevel === "error" ? "violated" : "verified";
        if (conflictLevel === "error") violatedCount += 1;
        if (data[req.level] && data[req.level][req.id]) {
          data[req.level][req.id].status = req.status;
        }
      });

      conflictsChecked = true;
      computeBoxLayouts();
      if (currentViewerMode === "tree") {
        computePositions();
        renderArrows();
        renderBoxes();
      } else if (currentViewerMode === "table") {
        renderRequirementsTable();
      }
      updateLeftPanelMetrics();

      const selectedReq = selectedReqId ? data.by_id[selectedReqId] : null;
      let selectedReqRefresh = Promise.resolve();
      if (selectedReq) {
        detailTitle.textContent = (selectedReq.name || "").replace(/_/g, " ");
        detailTitle.classList.remove("detail-panel__title--hidden");
        detailNameInput.value = selectedReq.name || "";
        detailNameInput.classList.add("detail-panel__name-input--hidden");
        detailId.textContent = selectedReq.id;
        detailType.textContent = formatRequirementType(selectedReq.type);
        detailClass.textContent = String(selectedReq.level || "").toUpperCase();
        detailUnitInput.value = selectedReq.unit || "";
        detailUnit.textContent = selectedReq.unit || "";
        const selectedDrivenBy = normalizeDrivenByValue(selectedReq.driven_by);
        detailDrivenByInput.value = selectedDrivenBy;
        detailDefinition.value = selectedReq.definition || "";
        detailDefinitionDisplay.textContent = selectedReq.definition || "";
        detailExpectedSourceInput.value = selectedReq.value_source || "";
        detailPropagationFunctionInput.value = normalizePropagationFunctionName(selectedReq.propagation_function);
        detailDrivenBy.textContent = normalizeDrivenByValue(selectedReq.driven_by);
        detailClassInput.value = String(selectedReq.level || "alpha").toLowerCase();
        detailStatus.textContent = String(selectedReq.status || "analysis").toUpperCase();
        detailStatusInput.value = String(selectedReq.status || "analysis").toLowerCase();
        detailPanelComments = Array.isArray(selectedReq.comments)
          ? selectedReq.comments.filter((text) => text !== FUNCTION_CALCULATION_COMMENT)
          : [];
        updateDetailSourceButton();
        renderDetailComments();
        selectedReqRefresh = refreshDetailPanelTypeDependentUI({ req: selectedReq, loadPropagation: true })
          .finally(() => {
            const latestReq = data.by_id[selectedReq.id] || selectedReq;
            if (latestReq && latestReq.validation_error && isFunctionDrivenRequirement(latestReq)) {
              detailPropagationStatus.textContent = latestReq.validation_error;
              detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
            }
          });
      }

      return selectedReqRefresh.then(() => {
        if (failures.length) {
          const firstFailure = failures[0];
          if (firstFailure && firstFailure.reqId === selectedReqId) {
            applyPropagationErrorPayload(firstFailure.err && firstFailure.err.payload ? firstFailure.err.payload : null);
          }
          if (suppressStatusMessage) {
            clearDetailPropagationStatus();
          } else {
            detailPropagationStatus.textContent = `Checked all requirements; ${violatedCount} violated. ${failures.length} propagation calculation(s) failed.`;
            detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
          }
          return { violatedCount, failures: failures.length };
        }

        if (suppressStatusMessage) {
          clearDetailPropagationStatus();
        } else {
          detailPropagationStatus.textContent = `Checked all requirements; ${violatedCount} violated.`;
          detailPropagationStatus.classList.remove("detail-panel__propagation-status--error");
        }
        return { violatedCount, failures: 0 };
      });
    });
  }

  function onExpectedBoundsManualEdit() {
    if (!selectedReqId || !expectedBoundsFromFunction) return;
    expectedBoundsFromFunction = false;
    detailBoundsExpected.classList.remove("detail-panel__bounds-values--from-function");
    const req = data.by_id[selectedReqId];
    if (req) {
      req.expected_bounds_from_function = false;
      if (data[req.level] && data[req.level][selectedReqId]) {
        data[req.level][selectedReqId].expected_bounds_from_function = false;
      }
    }
    updateCalculatedMarkers();
    lockCommitButton();
  }

  function onRequiredBoundsManualEdit() {
    if (!selectedReqId || !requiredBoundsFromFunction) return;
    requiredBoundsFromFunction = false;
    detailBoundsRequired.classList.remove("detail-panel__bounds-values--from-function");
    const req = data.by_id[selectedReqId];
    if (req) {
      req.required_bounds_from_function = false;
      if (data[req.level] && data[req.level][selectedReqId]) {
        data[req.level][selectedReqId].required_bounds_from_function = false;
      }
    }
    lockCommitButton();
  }

  function syncTargetedBoundsStateFromInputs() {
    if (!selectedReqId) return;
    const req = data.by_id[selectedReqId];
    if (!req || isConstraintStubRequirementType(req.type)) return;
    const nextTargetedBounds = readBoundsInputPair(
      detailBoundsTargetedValues,
      req.targeted_bounds,
      { allowNone: true }
    );
    req.targeted_bounds = nextTargetedBounds;
    if (data[req.level] && data[req.level][selectedReqId]) {
      data[req.level][selectedReqId].targeted_bounds = nextTargetedBounds;
    }
  }

  function onTargetedBoundsManualEdit() {
    syncTargetedBoundsStateFromInputs();
    lockCommitButton();
  }

  function checkPropagationFunction(functionName, paramValues) {
    const name = normalizePropagationFunctionName(functionName);
    detailPropagationFunctionInput.value = name;
    if (!name) {
      lockCommitButton();
      detailPropagationStatus.textContent = "";
      detailPropagationStatus.classList.remove("detail-panel__propagation-status--error");
      clearPropagationErrors();
      detailPropagationParams.innerHTML = "";
      currentPropagationParams = [];
      return Promise.resolve();
    }
    return fetchFunctionSignature(name)
      .then((result) => {
        clearPropagationErrors();
        if (!result.found) {
          lockCommitButton();
          detailPropagationStatus.textContent = `Function "${name}" could not be found in functions.py.`;
          detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
          detailPropagationFunctionInput.classList.add("detail-panel__input--error");
          detailPropagationParams.innerHTML = "";
          currentPropagationParams = [];
          return;
        }
        detailPropagationStatus.textContent = "";
        detailPropagationStatus.classList.remove("detail-panel__propagation-status--error");
        renderPropagationParams(Array.isArray(result.params) ? result.params : [], paramValues || {});
        applyRequirementValidationState(data);
      })
      .catch(() => {
        lockCommitButton();
        clearPropagationErrors();
        detailPropagationStatus.textContent = "Could not validate function name.";
        detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
        detailPropagationFunctionInput.classList.add("detail-panel__input--error");
        detailPropagationParams.innerHTML = "";
        currentPropagationParams = [];
      });
  }

  function loadPropagationFunctionState(req) {
    const reqType = req && req.type ? req.type : "";
    if (!req || !shouldShowPropagationSectionForType(reqType)) {
      detailPropagationParams.innerHTML = "";
      currentPropagationParams = [];
      clearPropagationSuggestions();
      clearPropagationErrors();
      clearDetailPropagationStatus();
      return Promise.resolve();
    }
    const functionName = normalizePropagationFunctionName(
      req && req.propagation_function ? req.propagation_function : detailPropagationFunctionInput.value
    );
    const values = req && typeof req.propagation_inputs === "object" && req.propagation_inputs ? req.propagation_inputs : {};
    return checkPropagationFunction(functionName, values);
  }


  function closeDetailPanel() {
    detailPanel.classList.add("detail-panel--closed");
    detailPanel.setAttribute("aria-hidden", "true");
    selectedReqId = null;
    updateDetailPanelToggle();
    updateDetailPanelDeleteVisibility();
    scheduleTreeViewportRefresh();
  }

  function updateDetailPanelToggle() {
    if (!detailToggle || !detailPanel) return;
    const isClosed = detailPanel.classList.contains("detail-panel--closed");
    detailToggle.hidden = isClosed;
    detailToggle.tabIndex = isClosed ? -1 : 0;
    detailToggle.setAttribute("aria-hidden", isClosed ? "true" : "false");
    detailToggle.textContent = ">>";
    detailToggle.setAttribute("aria-label", isClosed ? "Open side panel" : "Close side panel");
    detailToggle.setAttribute("aria-expanded", isClosed ? "false" : "true");
  }

  function renderDetailBoundsPlot(req) {
    const svg = detailBoundsPlot;
    const plotWidth = 400;
    const plotHeight = 124;
    const pad = 40;
    const plotW = plotWidth - 2 * pad;
    const axisY = 92;
    const gridTopY = 14;
    const gridBottomY = 102;
    const tickLabelY = 112;
    const rowH = 8;
    const rowGap = 3;
    const rowStackHeight = (3 * rowH) + (2 * rowGap);
    const rowsTopY = 48;
    const { constrained, targeted, solvable, required, expected } = getNormalizedRequirementBounds(req);
    const constraintStub = isConstraintStubRequirementType(req && req.type);
    const [cLo, cHi] = constrained;
    const [tLo, tHi] = targeted;
    const [sLo, sHi] = solvable;
    const [rLo, rHi] = required;
    const [eLo, eHi] = expected;
    const lowerBounds = (constraintStub ? [cLo, sLo, rLo, eLo] : [sLo, rLo, eLo]).slice();
    const upperBounds = (constraintStub ? [cHi, sHi, rHi, eHi] : [sHi, rHi, eHi]).slice();
    if (!constraintStub && !isUnsetBoundsPair(targeted)) {
      lowerBounds.push(tLo);
      upperBounds.push(tHi);
    }
    const rangeMin = Math.min(...lowerBounds);
    const rangeMax = Math.max(...upperBounds);
    const scaleMin = rangeMin === rangeMax ? rangeMin - 1 : rangeMin;
    const scaleMax = rangeMax === scaleMin ? scaleMin + 1 : rangeMax;
    const solvableDistribution = normalizeSolvableDistribution(
      req && req.solvable_distribution,
      solvable
    );
    const hasHistogramMean = solvableDistribution.sample_count > 0 && solvableDistribution.bins.length > 0;

    const toX = (v) => pad + norm(v, scaleMin, scaleMax) * plotW;
    const centerSolvable = hasHistogramMean ? solvableDistribution.mean : ((sLo + sHi) / 2);

    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${plotWidth} ${plotHeight}`);

    // X-axis
    const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axis.setAttribute("x1", pad);
    axis.setAttribute("y1", axisY);
    axis.setAttribute("x2", plotWidth - pad);
    axis.setAttribute("y2", axisY);
    axis.setAttribute("stroke", "var(--border)");
    axis.setAttribute("stroke-width", "1");
    svg.appendChild(axis);

    // More ticks and vertical grid lines for easier bound comparison.
    const tickCount = 10;
    for (let i = 0; i <= tickCount; i++) {
      const t = i / tickCount;
      const x = pad + t * plotW;
      const v = scaleMin + t * (scaleMax - scaleMin);
      const isMajor = i % 2 === 0;

      const grid = document.createElementNS("http://www.w3.org/2000/svg", "line");
      grid.setAttribute("x1", x);
      grid.setAttribute("y1", gridTopY);
      grid.setAttribute("x2", x);
      grid.setAttribute("y2", gridBottomY);
      grid.setAttribute("stroke", "var(--border)");
      grid.setAttribute("stroke-width", isMajor ? "1" : "0.8");
      grid.setAttribute("opacity", isMajor ? "0.45" : "0.22");
      svg.appendChild(grid);

      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", x);
      tick.setAttribute("y1", axisY);
      tick.setAttribute("x2", x);
      tick.setAttribute("y2", axisY + 6);
      tick.setAttribute("stroke", "var(--border)");
      tick.setAttribute("stroke-width", "1");
      svg.appendChild(tick);

      if (isMajor || i === tickCount) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", x);
        label.setAttribute("y", tickLabelY);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("font-size", "10");
        label.setAttribute("fill", "var(--text-muted)");
        label.textContent = formatAxisTickValue(v, scaleMax - scaleMin);
        svg.appendChild(label);
      }
    }

    // Center line of histogram mean, or solvable midpoint if unavailable.
    const centerX = toX(centerSolvable);
    const centerLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    centerLine.setAttribute("x1", centerX);
    centerLine.setAttribute("y1", gridTopY);
    centerLine.setAttribute("x2", centerX);
    centerLine.setAttribute("y2", gridBottomY);
    centerLine.setAttribute("stroke", "var(--red)");
    centerLine.setAttribute("stroke-width", "2");
    centerLine.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(centerLine);

    const segY = (i) => rowsTopY + i * (rowH + rowGap);

    if (constraintStub) {
      const constrainedX = Math.min(toX(cLo), toX(cHi));
      const constrainedW = Math.max(2, Math.abs(toX(cHi) - toX(cLo)));
      const constrainedRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      constrainedRect.setAttribute("x", constrainedX);
      constrainedRect.setAttribute("y", segY(0));
      constrainedRect.setAttribute("width", constrainedW);
      constrainedRect.setAttribute("height", rowH);
      constrainedRect.setAttribute("fill", "var(--constrained)");
      constrainedRect.setAttribute("opacity", "0.76");
      svg.appendChild(constrainedRect);
    }

    const solvableRowIndex = 0;
    const requiredRowIndex = 1;
    const expectedRowIndex = 2;

    if (!constraintStub && !isUnsetBoundsPair(targeted)) {
      const targetedX = Math.min(toX(tLo), toX(tHi));
      const targetedW = Math.max(2, Math.abs(toX(tHi) - toX(tLo)));
      const targetedRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      targetedRect.setAttribute("x", targetedX);
      targetedRect.setAttribute("y", segY(solvableRowIndex));
      targetedRect.setAttribute("width", targetedW);
      targetedRect.setAttribute("height", rowH);
      targetedRect.setAttribute("fill", "var(--targeted)");
      targetedRect.setAttribute("opacity", "0.76");
      svg.appendChild(targetedRect);
    }

    // Solvable (red)
    const redX = Math.min(toX(sLo), toX(sHi));
    const redW = Math.max(2, Math.abs(toX(sHi) - toX(sLo)));
    const redRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    redRect.setAttribute("x", redX);
    redRect.setAttribute("y", segY(solvableRowIndex));
    redRect.setAttribute("width", redW);
    redRect.setAttribute("height", rowH);
    redRect.setAttribute("fill", "var(--red)");
    redRect.setAttribute("opacity", "0.9");
    svg.appendChild(redRect);
    appendSolvableDistributionOverlay(svg, req, toX, {
      baseY: segY(solvableRowIndex),
      height: rowStackHeight,
      sigmaTopY: segY(solvableRowIndex) - rowStackHeight,
      sigmaBottomY: segY(solvableRowIndex) + rowH + 2
    });

    // Required (orange)
    const orangeX = Math.min(toX(rLo), toX(rHi));
    const orangeW = Math.max(2, Math.abs(toX(rHi) - toX(rLo)));
    const orangeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    orangeRect.setAttribute("x", orangeX);
    orangeRect.setAttribute("y", segY(requiredRowIndex));
    orangeRect.setAttribute("width", orangeW);
    orangeRect.setAttribute("height", rowH);
    orangeRect.setAttribute("fill", "var(--orange)");
    orangeRect.setAttribute("opacity", "0.9");
    svg.appendChild(orangeRect);

    // Expected (green)
    const greenX = Math.min(toX(eLo), toX(eHi));
    const greenW = Math.max(2, Math.abs(toX(eHi) - toX(eLo)));
    const greenRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    greenRect.setAttribute("x", greenX);
    greenRect.setAttribute("y", segY(expectedRowIndex));
    greenRect.setAttribute("width", greenW);
    greenRect.setAttribute("height", rowH);
    greenRect.setAttribute("fill", "var(--green)");
    greenRect.setAttribute("opacity", "0.9");
    svg.appendChild(greenRect);
  }

  function ensureDetailBoundsRow(boundsListEl, key, label, legendClassName) {
    if (!boundsListEl) return { row: null, valuesRow: null };
    const rowId = `detail-bounds-${key}`;

    let row = document.getElementById(rowId);
    if (row) {
      const oldValuesRow = document.getElementById(`${rowId}-values`);
      const hasTableCells = Boolean(
        row.querySelector(".detail-panel__bounds-data-cell[data-col=\"lower\"]")
        && row.querySelector(".detail-panel__bounds-data-cell[data-col=\"upper\"]")
      );
      if (!hasTableCells || oldValuesRow) {
        row.innerHTML = "";
        row.className = `detail-panel__bounds-item detail-panel__bounds-row--${key}`;

        const colorCell = document.createElement("div");
        colorCell.className = "detail-panel__bounds-color-cell";
        const legend = document.createElement("span");
        legend.className = `detail-panel__bound-legend ${legendClassName}`;
        legend.setAttribute("aria-hidden", "true");
        colorCell.appendChild(legend);

        const typeCell = document.createElement("div");
        typeCell.className = "detail-panel__bounds-type-cell";
        typeCell.setAttribute("data-col", "type");
        typeCell.textContent = label;

        const lowerCell = document.createElement("div");
        lowerCell.className = "detail-panel__bounds-data-cell";
        lowerCell.setAttribute("data-col", "lower");

        const upperCell = document.createElement("div");
        upperCell.className = "detail-panel__bounds-data-cell";
        upperCell.setAttribute("data-col", "upper");

        const sourceCell = document.createElement("div");
        sourceCell.className = "detail-panel__bounds-source-cell";
        sourceCell.setAttribute("data-col", "source-value");

        row.appendChild(colorCell);
        row.appendChild(typeCell);
        row.appendChild(lowerCell);
        row.appendChild(upperCell);
        row.appendChild(sourceCell);
        if (oldValuesRow && oldValuesRow.parentNode) oldValuesRow.parentNode.removeChild(oldValuesRow);
      } else {
        const typeCell = row.querySelector('[data-col="type"]');
        if (typeCell) typeCell.textContent = label;
      }
      return { row, valuesRow: row };
    }

    row = document.createElement("div");
    row.id = rowId;
    row.className = `detail-panel__bounds-item detail-panel__bounds-row--${key}`;

    const colorCell = document.createElement("div");
    colorCell.className = "detail-panel__bounds-color-cell";
    const legend = document.createElement("span");
    legend.className = `detail-panel__bound-legend ${legendClassName}`;
    legend.setAttribute("aria-hidden", "true");
    colorCell.appendChild(legend);

    const typeCell = document.createElement("div");
    typeCell.className = "detail-panel__bounds-type-cell";
    typeCell.setAttribute("data-col", "type");
    typeCell.textContent = label;
    const lowerCell = document.createElement("div");
    lowerCell.className = "detail-panel__bounds-data-cell";
    lowerCell.setAttribute("data-col", "lower");
    const upperCell = document.createElement("div");
    upperCell.className = "detail-panel__bounds-data-cell";
    upperCell.setAttribute("data-col", "upper");
    const sourceCell = document.createElement("div");
    sourceCell.className = "detail-panel__bounds-source-cell";
    sourceCell.setAttribute("data-col", "source-value");
    row.appendChild(colorCell);
    row.appendChild(typeCell);
    row.appendChild(lowerCell);
    row.appendChild(upperCell);
    row.appendChild(sourceCell);
    boundsListEl.appendChild(row);
    return { row, valuesRow: row };
  }

  function ensureDetailBoundsStructure() {
    const wrap = document.querySelector(".detail-panel__bounds-table-wrap");
    if (!wrap) return;

    let boundsList = wrap.querySelector(".detail-panel__bounds-list");
    if (!boundsList) {
      boundsList = document.createElement("div");
      boundsList.className = "detail-panel__bounds-list";
      boundsList.setAttribute("aria-label", "Requirement bounds");
      wrap.insertBefore(boundsList, detailSourceControls || wrap.firstChild);
    }

    const staleColdBounceHeading = document.getElementById("detail-bounds-cold-bounce-title");
    if (staleColdBounceHeading && staleColdBounceHeading.parentNode) {
      staleColdBounceHeading.parentNode.removeChild(staleColdBounceHeading);
    }
    const staleCutHeading = document.getElementById("detail-bounds-cut-title");
    if (staleCutHeading && staleCutHeading.parentNode) {
      staleCutHeading.parentNode.removeChild(staleCutHeading);
    }

    // Legacy templates use nested primary/value rows; normalize once to a strict table grid.
    if (boundsList.getAttribute("data-bounds-layout-v2") !== "true") {
      boundsList.innerHTML = "";
      boundsList.setAttribute("data-bounds-layout-v2", "true");
      const headerRow = document.createElement("div");
      headerRow.className = "detail-panel__bounds-header-row";
      headerRow.setAttribute("aria-hidden", "true");
      headerRow.innerHTML = `
        <div class="detail-panel__bounds-header-color-cell"></div>
        <div class="detail-panel__bounds-header-cell">Type</div>
        <div class="detail-panel__bounds-header-cell">Lower</div>
        <div class="detail-panel__bounds-header-cell">Upper</div>
        <div class="detail-panel__bounds-header-cell">Source</div>
      `;
      boundsList.appendChild(headerRow);
    }

    const constrained = ensureDetailBoundsRow(boundsList, "constrained", "Constrained", "detail-panel__bound-legend--constrained");
    const targeted = ensureDetailBoundsRow(boundsList, "targeted", "Targeted", "detail-panel__bound-legend--targeted");
    const solvable = ensureDetailBoundsRow(boundsList, "solvable", "Solvable", "detail-panel__bound-legend--solvable");
    const required = ensureDetailBoundsRow(boundsList, "required", "Required", "detail-panel__bound-legend--required");
    const expected = ensureDetailBoundsRow(boundsList, "expected", "Expected", "detail-panel__bound-legend--expected");
    detailBoundsConstrained = constrained.row;
    detailBoundsConstrainedValues = constrained.valuesRow;
    detailBoundsTargeted = targeted.row;
    detailBoundsTargetedValues = targeted.valuesRow;
    detailBoundsSolvable = solvable.row;
    detailBoundsSolvableValues = solvable.valuesRow;
    detailBoundsRequired = required.row;
    detailBoundsRequiredValues = required.valuesRow;
    detailBoundsExpected = expected.row;
    detailBoundsExpectedValues = expected.valuesRow;
  }

  function makeBoundFields(row, bounds, editable, options) {
    if (!row) return;
    const opts = options || {};
    if (opts.isFunctionDerived) row.classList.add("detail-panel__bounds-values--from-function");
    else row.classList.remove("detail-panel__bounds-values--from-function");
    const normalizedBounds = opts.allowNone
      ? normalizeNullableBoundsPair(bounds, [null, null])
      : normalizeBoundsPair(bounds, [0, 0]);
    const [lo, hi] = normalizedBounds;

    const mountBoundInput = (cell, key, value) => {
      if (!cell) return;
      cell.innerHTML = "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "detail-panel__bounds-input";
      input.value = editable ? formatEditableBoundValue(value) : formatBoundDisplayValue(value);
      input.placeholder = key;
      input.setAttribute("data-bound-role", key);
      if (!editable) input.readOnly = true;
      if (editable && typeof opts.onInput === "function") {
        input.addEventListener("input", opts.onInput);
      }
      cell.appendChild(input);
    };

    mountBoundInput(row.querySelector('[data-col="lower"]'), "lower", lo);
    mountBoundInput(row.querySelector('[data-col="upper"]'), "upper", hi);

    const sourceValueCell = row.querySelector('[data-col="source-value"]');
    if (sourceValueCell) {
      const sourceLabel = (opts.sourceLabel || "").trim();
      sourceValueCell.textContent = sourceLabel || "Unknown";
    }
  }

  function fillDetailBoundsBoxes(req) {
    ensureDetailBoundsStructure();
    const { constrained, targeted, solvable, required, expected } = getNormalizedRequirementBounds(req);
    const [cLo, cHi] = constrained;
    const [tLo, tHi] = targeted;
    const [sLo, sHi] = solvable;
    const [rLo, rHi] = required;
    const [eLo, eHi] = expected;
    const functionDriven = isFunctionDrivenRequirement(req);
    const constraintStub = isConstraintStubRequirementType(req && req.type);
    const boundsEditable = isDetailPanelEditable();
    const boundsWrap = document.querySelector(".detail-panel__bounds-table-wrap");
    if (boundsWrap) {
      boundsWrap.classList.toggle("detail-panel__bounds-table-wrap--constraint-stub", constraintStub);
    }
    const constrainedEditable = boundsEditable && constraintStub;
    const targetedEditable = boundsEditable && !constraintStub;
    const calculatedBoundsEditable = boundsEditable && !functionDriven;
    if (detailBoundsConstrained) {
      detailBoundsConstrained.hidden = !constraintStub;
      if (constraintStub) {
        makeBoundFields(detailBoundsConstrained, [cLo, cHi], constrainedEditable, {
          sourceLabel: "manual"
        });
      }
    }
    if (detailBoundsTargeted) {
      detailBoundsTargeted.hidden = constraintStub;
      if (!constraintStub) {
        makeBoundFields(detailBoundsTargeted, [tLo, tHi], targetedEditable, {
          sourceLabel: "manual",
          allowNone: true,
          onInput: onTargetedBoundsManualEdit
        });
      }
    }
    makeBoundFields(detailBoundsSolvable, [sLo, sHi], false, {
      sourceLabel: "Monte Carlo",
      colorLabel: "red"
    });
    makeBoundFields(detailBoundsRequired, [rLo, rHi], calculatedBoundsEditable, {
      sourceLabel: functionDriven ? "Function" : (constraintStub ? "MANUAL" : (requiredBoundsFromFunction ? "propagated" : "manual")),
      colorLabel: "orange",
      isFunctionDerived: requiredBoundsFromFunction,
      onInput: onRequiredBoundsManualEdit
    });
    makeBoundFields(detailBoundsExpected, [eLo, eHi], calculatedBoundsEditable, {
      sourceLabel: functionDriven ? "Function" : (constraintStub ? "MANUAL" : (expectedBoundsFromFunction ? "propagated" : "manual")),
      colorLabel: "green",
      isFunctionDerived: expectedBoundsFromFunction,
      onInput: onExpectedBoundsManualEdit
    });
    updateCalculatedMarkers();
  }

  function renderDetailComments() {
    if (!detailCommentsList) return;
    detailCommentsList.innerHTML = "";
    detailPanelComments
      .filter((text) => text !== FUNCTION_CALCULATION_COMMENT)
      .forEach((text) => {
      const div = document.createElement("div");
      div.className = "detail-panel__comment-item";
      div.textContent = text;
      detailCommentsList.appendChild(div);
      });

    const composer = document.createElement("div");
    composer.className = "detail-panel__comment-composer";
    const input = document.createElement("textarea");
    input.className = "detail-panel__comment-input";
    input.rows = 2;
    input.placeholder = "Write a comment...";

    const actions = document.createElement("div");
    actions.className = "detail-panel__comment-actions";
    const status = document.createElement("span");
    status.className = "detail-panel__comment-status";
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "detail-panel__btn detail-panel__btn--small";
    sendBtn.textContent = "Send";
    sendBtn.setAttribute("aria-label", "Send comment");

    const submitComment = () => {
      const text = (input.value || "").trim();
      if (!text || !selectedReqId) {
        if (!text) input.focus();
        return;
      }
      status.textContent = "Saving...";
      sendBtn.disabled = true;
      patchSelectedRequirement({ comments: [...detailPanelComments, text] })
        .then((updated) => {
          detailPanelComments = Array.isArray(updated.comments) ? updated.comments.slice() : [];
          renderDetailComments();
          detailCommentsList.scrollTop = detailCommentsList.scrollHeight;
        })
        .catch(() => {
          status.textContent = "Could not save comment.";
          sendBtn.disabled = false;
        });
    };

    sendBtn.addEventListener("click", submitComment);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitComment();
      }
    });

    composer.appendChild(input);
    actions.appendChild(status);
    actions.appendChild(sendBtn);
    composer.appendChild(actions);
    detailCommentsList.appendChild(composer);
  }

  function applyUpdatedRequirementToState(reqId, updated) {
    if (!reqId || !updated) return;
    const previous = data.by_id[reqId] || null;
    const previousLevel = previous ? previous.level : null;
    const nextLevel = String(updated.level || previousLevel || "alpha").toLowerCase();
    const merged = {
      ...(previous || {}),
      ...updated,
      id: reqId,
      level: nextLevel,
      driven_by: normalizeDrivenByValue(updated.driven_by),
      propagation_function: normalizePropagationFunctionName(updated.propagation_function)
    };

    if (previousLevel && data[previousLevel] && data[previousLevel][reqId]) {
      delete data[previousLevel][reqId];
    }
    if (!data[nextLevel]) data[nextLevel] = {};

    data.by_id[reqId] = merged;
    const levelEntry = { ...merged };
    delete levelEntry.id;
    delete levelEntry.level;
    data[nextLevel][reqId] = levelEntry;
    applyDerivedRequirementTypes(data);
    applyRequirementValidationState(data);

    expectedBoundsFromFunction = Boolean(merged.expected_bounds_from_function);
    requiredBoundsFromFunction = Boolean(merged.required_bounds_from_function);
    detailPanelComments = Array.isArray(merged.comments) ? merged.comments.slice() : [];
    if (currentViewerMode === "table") {
      renderRequirementsTable();
    }
  }

  function patchRequirement(reqId, payload) {
    if (!reqId) return Promise.resolve(null);
    return fetch(`/api/requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    })
      .then((r) => r.json().catch(() => null).then((payloadData) => ({ ok: r.ok, payload: payloadData })))
      .then(({ ok, payload }) => {
        if (!ok) {
          const err = new Error(payload && payload.error ? payload.error : "Save failed");
          err.payload = payload;
          throw err;
        }
        return payload;
      })
      .then((updated) => {
        applyUpdatedRequirementToState(reqId, updated);
        return updated;
      });
  }

  function patchSelectedRequirement(payload) {
    if (!selectedReqId) return Promise.resolve(null);
    return patchRequirement(selectedReqId, payload);
  }

  function buildSavePayloadForRequirement(req) {
    const normalizedDrivenBy = normalizeDrivenByValue(req.driven_by);
    const payload = {
      name: req.name || "",
      unit: req.unit || "",
      driven_by: normalizedDrivenBy ? [normalizedDrivenBy] : [],
      definition: req.definition || "",
      comments: Array.isArray(req.comments) ? req.comments.slice() : [],
      propagation_function: normalizePropagationFunctionName(req.propagation_function),
      propagation_inputs: req.propagation_inputs || {},
      status: (req.status || "analysis").toLowerCase(),
      level: (req.level || "alpha").toLowerCase(),
      expected_bounds_from_function: Boolean(req.expected_bounds_from_function),
      required_bounds_from_function: Boolean(req.required_bounds_from_function),
      value_source: req.value_source || ""
    };
    if (
      !isConstraintStubRequirementType(req.type)
      && Array.isArray(req.targeted_bounds)
      && req.targeted_bounds.length === 2
    ) {
      payload.targeted_bounds = req.targeted_bounds.map((value) => (value == null ? null : Number(value)));
    }
    if (
      isConstraintStubRequirementType(req.type)
      && Array.isArray(req.constrained_bounds)
      && req.constrained_bounds.length === 2
    ) {
      payload.constrained_bounds = [Number(req.constrained_bounds[0]), Number(req.constrained_bounds[1])];
    }
    if (Array.isArray(req.expected_bounds) && req.expected_bounds.length === 2) {
      payload.expected_bounds = [Number(req.expected_bounds[0]), Number(req.expected_bounds[1])];
    }
    if (Array.isArray(req.required_bounds) && req.required_bounds.length === 2) {
      payload.required_bounds = [Number(req.required_bounds[0]), Number(req.required_bounds[1])];
    }
    return payload;
  }

  function createRequirement(payload) {
    return fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    })
      .then((r) => r.json().catch(() => null).then((payloadData) => ({ ok: r.ok, payload: payloadData })))
      .then(({ ok, payload }) => {
        if (ok) return payload;
        const err = new Error(payload && payload.error ? payload.error : "Create failed");
        err.payload = payload;
        throw err;
      });
  }

  function deleteRequirement(reqId) {
    return fetch(`/api/requirements/${reqId}`, { method: "DELETE" })
      .then((r) => {
        if (!r.ok) {
          return r.json().then((err) => {
            throw new Error(err && err.error ? err.error : "Delete failed");
          });
        }
      })
      .then(() => {
        return loadData().then(() => {
          closeDetailPanel();
          updateLeftPanelMetrics();
          refreshActiveViewer();
        });
      });
  }

  function saveDetailEdits() {
    syncTargetedBoundsStateFromInputs();
    applySelectedPanelEditsToState();
    const requirements = buildRequirementsSnapshotFromData();
    return fetch("/api/requirements/tree", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirements })
    })
      .then((r) => r.json().catch(() => null).then((payloadData) => ({ ok: r.ok, payload: payloadData })))
      .then(({ ok, payload }) => {
        if (!ok) {
          const err = new Error(payload && payload.error ? payload.error : "Save failed");
          err.payload = payload;
          throw err;
        }
        return payload;
      })
      .then((savedTree) => {
        const validationIssues = Array.isArray(savedTree && savedTree.validation_issues)
          ? savedTree.validation_issues.slice()
          : [];
        data = normalizeRequirementsData(savedTree);
        createdRequirementIdsThisSession = new Set();
        updateLeftPanelMetrics();
        refreshActiveViewer();
        if (selectedReqId && data.by_id[selectedReqId] && detailPanel && !detailPanel.classList.contains("detail-panel--closed")) {
          openDetailPanel(data.by_id[selectedReqId]);
          unlockCommitButton();
        }
        return { savedTree, validationIssues };
      });
  }

  function initDetailPanel() {
    detailPanel = document.getElementById("detail-panel");
    detailToggle = document.getElementById("detail-panel-toggle");
    detailTitle = document.getElementById("detail-panel-title");
    detailNameEditBtn = document.getElementById("detail-name-edit");
    detailNameInput = document.getElementById("detail-panel-name-input");
    detailAttributesWrap = document.getElementById("detail-attributes");
    detailAttributesEditBtn = document.getElementById("detail-attributes-edit");
    detailId = document.getElementById("detail-panel-id");
    detailType = document.getElementById("detail-panel-type");
    detailClass = document.getElementById("detail-panel-class");
    detailStatus = document.getElementById("detail-panel-status");
    detailUnit = document.getElementById("detail-panel-unit");
    detailUnitInput = document.getElementById("detail-panel-unit-input");
    detailDrivenBy = document.getElementById("detail-panel-driven-by");
    detailDrivenByInput = document.getElementById("detail-panel-driven-by-input");
    detailDrivenBySuggestions = document.getElementById("detail-driven-by-suggestions");
    detailClassInput = document.getElementById("detail-panel-class-input");
    detailStatusInput = document.getElementById("detail-panel-status-input");
    detailDefinitionDisplay = document.getElementById("detail-definition-display");
    detailDefinition = document.getElementById("detail-definition");
    detailDefinitionEditBtn = document.getElementById("detail-definition-edit");
    detailBoundsEditBtn = document.getElementById("detail-bounds-edit");
    detailBoundsPlot = document.getElementById("detail-bounds-plot");
    detailBoundsConstrained = document.getElementById("detail-bounds-constrained");
    detailBoundsConstrainedValues = document.getElementById("detail-bounds-constrained-values");
    detailBoundsTargeted = document.getElementById("detail-bounds-targeted");
    detailBoundsTargetedValues = document.getElementById("detail-bounds-targeted-values");
    detailBoundsSolvable = document.getElementById("detail-bounds-solvable");
    detailBoundsSolvableValues = document.getElementById("detail-bounds-solvable-values");
    detailBoundsRequired = document.getElementById("detail-bounds-required");
    detailBoundsRequiredValues = document.getElementById("detail-bounds-required-values");
    detailBoundsExpected = document.getElementById("detail-bounds-expected");
    detailBoundsExpectedValues = document.getElementById("detail-bounds-expected-values");
    detailSourceControls = document.getElementById("detail-source-controls");
    detailExpectedSourceLink = document.getElementById("detail-expected-source-link");
    detailExpectedSourceEdit = document.getElementById("detail-expected-source-edit");
    detailExpectedSourceInput = document.getElementById("detail-expected-source-input");
    detailActionsWrap = document.getElementById("detail-panel-actions");
    detailPropagationSection = document.getElementById("detail-propagation-section");
    detailPropagationFunctionEdit = document.getElementById("detail-propagation-function-edit");
    detailPropagationFunctionRemove = document.getElementById("detail-propagation-function-remove");
    detailPropagationHeading = detailPropagationFunctionEdit ? detailPropagationFunctionEdit.closest(".detail-panel__section-head") : null;
    detailPropagationFunctionInput = document.getElementById("detail-propagation-function-input");
    detailPropagationSuggestions = document.getElementById("detail-propagation-suggestions");
    detailPropagationStatus = document.getElementById("detail-propagation-status");
    detailPropagationParams = document.getElementById("detail-propagation-params");
    detailCommentsList = document.getElementById("detail-comments-list");
    detailCheckConflictsBtn = document.getElementById("detail-check-conflicts");
    detailCommitGitBtn = document.getElementById("detail-commit-git");
    detailDeleteReqBtn = document.getElementById("detail-delete-requirement");
    ensureDetailBoundsStructure();

    detailToggle.addEventListener("click", () => {
      if (detailPanel.classList.contains("detail-panel--closed")) {
        const fallbackReq = lastDetailReqId ? data.by_id[lastDetailReqId] : null;
        if (fallbackReq) openDetailPanel(fallbackReq);
        return;
      }
      closeDetailPanel();
    });
    detailPanel.addEventListener("transitionend", (event) => {
      if (event.target !== detailPanel || event.propertyName !== "transform") return;
      scheduleTreeViewportRefresh();
    });
    detailNameEditBtn.addEventListener("click", () => {
      if (isNameEditing) {
        commitNameEdit();
        return;
      }
      setNameEditMode(true);
    });
    detailNameInput.addEventListener("input", () => {
      lockCommitButton();
      if (isNewRequirement && detailCheckConflictsBtn) {
        detailCheckConflictsBtn.disabled = !(detailNameInput.value || "").trim();
      }
    });
    detailNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitNameEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setNameEditMode(false);
      }
    });
    detailAttributesEditBtn.addEventListener("click", () => {
      if (isAttributesEditing) {
        commitAttributesEdit();
        return;
      }
      setAttributesEditMode(true);
    });
    detailClassInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitAttributesEdit();
      }
    });
    detailClassInput.addEventListener("input", () => {
      lockCommitButton();
    });
    detailStatusInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitAttributesEdit();
      }
    });
    detailStatusInput.addEventListener("input", () => {
      lockCommitButton();
    });
    detailUnitInput.addEventListener("input", () => {
      lockCommitButton();
    });
    detailUnitInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitAttributesEdit();
      }
    });
    detailDrivenByInput.addEventListener("input", () => {
      lockCommitButton();
      updateDrivenBySuggestions();
      refreshDetailPanelTypeDependentUI({ loadPropagationOnShow: true });
    });
    detailDrivenByInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitAttributesEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearDrivenBySuggestions();
      }
    });
    detailDrivenByInput.addEventListener("blur", () => {
      setTimeout(() => clearDrivenBySuggestions(), 120);
    });
    detailDefinitionEditBtn.addEventListener("click", () => {
      if (isDefinitionEditing) {
        commitDefinitionEdit();
        return;
      }
      setDefinitionEditMode(true);
    });
    detailDefinition.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitDefinitionEdit();
      }
    });
    detailBoundsEditBtn.addEventListener("click", () => {
      setBoundsEditMode(!isBoundsEditing);
    });
    detailExpectedSourceEdit.addEventListener("click", () => {
      const hidden = detailExpectedSourceInput.classList.contains("detail-panel__source-input--hidden");
      detailExpectedSourceInput.classList.toggle("detail-panel__source-input--hidden", !hidden);
      if (hidden) detailExpectedSourceInput.focus();
      updateDetailSourceButton();
    });
    detailExpectedSourceInput.addEventListener("input", updateDetailSourceButton);
    detailPropagationFunctionEdit.addEventListener("click", () => {
      if (isPropagationEditing) {
        commitPropagationFunctionEdit()
          .catch(() => {});
        return;
      }
      setPropagationEditMode(true);
    });
    if (detailPropagationFunctionRemove) {
      detailPropagationFunctionRemove.addEventListener("click", () => {
        stagePropagationFunctionRemoval();
      });
    }
    detailPropagationFunctionInput.addEventListener("input", () => {
      if (!isDetailPanelPropagationEditable(refreshDetailPanelDerivedType())) return;
      lockCommitButton();
      updatePropagationSuggestions();
    });
    detailPropagationFunctionInput.addEventListener("change", () => {
      lockCommitButton();
      if (!isDetailPanelPropagationEditable(refreshDetailPanelDerivedType())) {
        checkPropagationFunction(detailPropagationFunctionInput.value, collectPropagationInputs());
      }
    });
    detailPropagationFunctionInput.addEventListener("blur", () => {
      setTimeout(() => clearPropagationSuggestions(), 120);
    });
    detailPropagationFunctionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitPropagationFunctionEdit({ keepEditing: true, focusFirstParam: true })
          .catch(() => {});
      }
    });
    detailCheckConflictsBtn.addEventListener("click", () => {
      lockCommitButton();
      checkConflictsForAllRequirements()
        .then(() => {
          unlockCommitButton();
        })
        .catch((err) => {
          lockCommitButton();
          const payload = err && err.payload ? err.payload : null;
          applyPropagationErrorPayload(payload);
          detailPropagationStatus.textContent = err && err.message ? err.message : "Propagation evaluation failed";
          detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
        });
    });

    detailCommitGitBtn.addEventListener("click", () => {
      const activeReqId = selectedReqId;
      clearPropagationErrors();
      saveDetailEdits()
        .then((result) => {
          const validationIssues = result && Array.isArray(result.validationIssues) ? result.validationIssues : [];
          const activeIssues = getValidationIssuesForRequirement(validationIssues, activeReqId);
          clearPropagationErrors();
          if (activeIssues.length) {
            applyPropagationErrorPayload(activeIssues[0], { reqId: activeReqId, clear: false });
          }
          detailPropagationStatus.textContent = buildValidationIssueSaveMessage(validationIssues, activeReqId);
          detailPropagationStatus.classList.toggle("detail-panel__propagation-status--error", activeIssues.length > 0);
        })
        .catch((err) => {
          applyPropagationErrorPayload(err && err.payload ? err.payload : null, { reqId: activeReqId });
          detailPropagationStatus.textContent = err && err.message ? err.message : "Save failed";
          detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
        });
    });
    if (detailDeleteReqBtn) {
      detailDeleteReqBtn.addEventListener("click", () => {
        if (!selectedReqId) return;
        if (!confirm("Delete this requirement?")) return;
        deleteRequirement(selectedReqId).catch((err) => {
          detailPropagationStatus.textContent = err && err.message ? err.message : "Delete failed";
          detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
        });
      });
    }
    updateDetailPanelToggle();
    updateDetailPanelEditingVisibility();
  }

  function run() {
    initLeftDrawer();
    viewportEl = document.getElementById("viewport");
    canvasEl = document.getElementById("canvas");
    tableViewEl = document.getElementById("table-view");
    viewerPlaceholderEl = document.getElementById("viewer-placeholder");
    initViewportControls();
    gridLayer = document.getElementById("grid-layer");
    arrowsLayer = document.getElementById("arrows-layer");
    boxesLayer = document.getElementById("boxes-layer");
    relatesOverlayLayer = document.getElementById("relates-overlay-layer");
    if (relatesOverlayLayer) relatesOverlayLayer.setAttribute("class", "relates-overlay-layer");
    createRequirementBtn = document.getElementById("create-requirement-btn");
    if (createRequirementBtn) {
      createRequirementBtn.addEventListener("click", () => openDetailPanelForNewRequirement());
    }
    initDetailPanel();

    initLeftPanel();
    ensureSampleTableModal();
    fetchSampleTable().catch(() => {
      renderLeftPanelSampleTableSummary(latestSampleTable);
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const resampleButton = target.closest("#left-panel-resample-btn");
      if (resampleButton) {
        runResampling().catch((err) => {
          console.error(err);
        });
        return;
      }
      const sampleTableButton = target.closest("#left-panel-show-sample-table-btn");
      if (sampleTableButton) {
        showSampleTable().catch((err) => {
          setDetailStatusMessage(err && err.message ? err.message : "Failed to load sample table", true);
          console.error(err);
        });
      }
    });
    initPanZoom();
    updateCreateRequirementButtonVisibility();
    loadData()
      .then(() => checkConflictsForAllRequirements({ suppressStatusMessage: true }))
      .then(() => {
        refreshActiveViewer();
        applyViewerMode();
        updateCreateRequirementButtonVisibility();
        const openParam = new URLSearchParams(window.location.search).get("open");
        if (openParam && data.by_id[openParam]) {
          openDetailPanel(data.by_id[openParam]);
          if (isFunctionDrivenRequirement(data.by_id[openParam])) {
            evaluatePropagationForSelected().catch((err) => {
              const message = err && err.message ? err.message : "Propagation refresh failed";
              if (detailPropagationStatus) {
                detailPropagationStatus.textContent = message;
                detailPropagationStatus.classList.add("detail-panel__propagation-status--error");
              }
            });
          }
        }
      })
      .catch((err) => {
        console.error(err);
        boxesLayer.innerHTML = `<text x="0" y="20" fill="#e74c3c">Failed to load requirements.</text>`;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
