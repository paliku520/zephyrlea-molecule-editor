import type { KekuleNamespace } from './kekule';
import { getEditorScroller, getMolecules, getObjScreenScale, getUnionBox } from './kekuleSpace';

/**
 * Target size of the drawing surface. Kekule sizes its canvas layers as
 * `screenSize * zoom`, so the surface is expressed in rendered pixels and then
 * converted back with the current zoom; this keeps both the panning room and
 * the canvas memory bounded at every zoom level.
 */
const BOARD_SPAN_FACTOR = 4;
const BOARD_TARGET_MIN_PX = 2600;
const BOARD_TARGET_MAX_PX = 4608;
/** Rendered pixels per side the canvas may reach; Kekule keeps 3 canvas layers. */
const BOARD_MAX_CANVAS_PX = 4608;
/** Chemical-space margin (in rendered px) that must stay free around the content. */
const BOARD_CONTENT_MARGIN_PX = 80;

/**
 * How much of the viewport may stay between the view and the surface border.
 * Panning closer than this silently moves the drawing back to the middle of the
 * surface, which turns the bounded canvas into an endless drawing area.
 */
const EDGE_TRIGGER_RATIO = 0.3;
/** Corrections smaller than this are ignored so the drawing cannot drift. */
const MIN_RECENTER_PX = 12;
/** Quiet period before the surface grows around freshly drawn content. */
const CONTENT_FIT_DELAY_MS = 260;
/** Scroll events caused by our own layout work are ignored for this long. */
const LAYOUT_SETTLE_MS = 160;

/**
 * Zoom is a multiplier of the default bond screen length. Kekule itself has no
 * bounds, so repeated clicks (or a pinch gesture) could shrink the drawing into
 * a speck or blow single bonds up past a screen; the editor clamps here, which
 * also covers Kekule's own double-click / wheel / gesture zoom paths.
 */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 4;
/** Zoom differences below this are treated as "no change". */
const ZOOM_EPSILON = 1e-4;

export interface EditorBoardOptions {
  /** Called whenever the effective zoom changes (or is pinned at a bound). */
  onZoomChange?: (zoom: number) => void;
}

export interface EditorBoard {
  rebalance(options?: { preserveViewCenter?: boolean }): void;
  centerView(): void;
  centerEmptyView(): void;
  notifyContentChanged(): void;
  /** Drop restores queued by a zoom or resize, e.g. before re-centering by hand. */
  clearPendingRestores(): void;
  dispose(): void;
}

export function createEditorBoard(
  K: KekuleNamespace,
  composer: any,
  options: EditorBoardOptions = {},
): EditorBoard {
  const editor = composer.getEditor?.();
  let disposed = false;
  let scrollFrame = 0;
  let contentTimer = 0;
  let settleUntil = 0;
  let pointerDown = false;
  let listeningOn: HTMLElement | undefined;

  const getScroller = () => getEditorScroller(editor);

  /** View centers that a pending layout pass still has to restore. */
  let pendingAnchors: { x: number; y: number }[] = [];

  const trackAnchor = (anchor: { x: number; y: number }) => {
    pendingAnchors.push(anchor);
    window.setTimeout(() => {
      pendingAnchors = pendingAnchors.filter((item) => item !== anchor);
    }, 400);

    return anchor;
  };

  const pauseScrollTracking = () => {
    settleUntil = performance.now() + LAYOUT_SETTLE_MS;
  };

  const getBoardTarget = (scroller: HTMLElement) => {
    const zoom = editor.getCurrZoom?.() || 1;
    const viewportX = scroller.clientWidth / zoom;
    const viewportY = scroller.clientHeight / zoom;

    const targetWidth = Math.min(
      Math.max(scroller.clientWidth * BOARD_SPAN_FACTOR, BOARD_TARGET_MIN_PX),
      BOARD_TARGET_MAX_PX,
    );
    const targetHeight = Math.min(
      Math.max(scroller.clientHeight * BOARD_SPAN_FACTOR, BOARD_TARGET_MIN_PX),
      BOARD_TARGET_MAX_PX,
    );

    return {
      zoom,
      viewportX,
      viewportY,
      desiredX: Math.max(targetWidth / zoom, viewportX),
      desiredY: Math.max(targetHeight / zoom, viewportY),
    };
  };

  /** Smallest surface (in screen px) that still contains the drawn content. */
  const getContentMinScreenSize = (zoom: number) => {
    const box = getUnionBox(K, getMolecules(K, composer));
    const ratio = composer.getEditor?.()?.getChemSpace?.()?.getObjScreenLengthRatio?.() || 0;
    if (!box || !ratio) return null;

    const margin = (BOARD_CONTENT_MARGIN_PX / zoom) * ratio;
    const widthObj = box.x2 - box.x1 + margin * 2;
    const heightObj = box.y2 - box.y1 + margin * 2;

    return {
      x: widthObj / ratio,
      y: heightObj / ratio,
    };
  };

  /**
   * Keep the drawing surface sized for the current zoom: big enough to pan and
   * draw around the viewport, never smaller than the content, and bounded so the
   * canvas layers do not explode in memory at high zoom levels.
   */
  const rebalance = (options: { preserveViewCenter?: boolean } = {}) => {
    if (disposed) return;

    const space = editor?.getChemSpace?.();
    const scroller = getScroller();
    if (!space || !scroller) return;

    const current = space.getScreenSize?.();
    if (!current || !current.x || !current.y) return;

    const target = getBoardTarget(scroller);
    const contentMin = getContentMinScreenSize(target.zoom);
    const contentX = contentMin?.x ?? 0;
    const contentY = contentMin?.y ?? 0;

    const floorX = Math.max(target.viewportX, contentX);
    const floorY = Math.max(target.viewportY, contentY);
    const ceilX = Math.max(BOARD_MAX_CANVAS_PX / target.zoom, floorX);
    const ceilY = Math.max(BOARD_MAX_CANVAS_PX / target.zoom, floorY);

    const nextX = Math.min(Math.max(target.desiredX, contentX, floorX), ceilX);
    const nextY = Math.min(Math.max(target.desiredY, contentY, floorY), ceilY);

    if (Math.abs(nextX - current.x) < 1 && Math.abs(nextY - current.y) < 1) return;

    // Resizing the surface changes the scroll range, so remember what the center
    // of the viewport points at and restore it afterwards.
    const preserveViewCenter = options.preserveViewCenter ?? true;
    const rawCenter = preserveViewCenter
      ? editor.screenCoordToObj?.({
          x: scroller.scrollLeft + scroller.clientWidth / 2,
          y: scroller.scrollTop + scroller.clientHeight / 2,
        })
      : null;
    // Tracked so that a later content shift - which moves every object - can
    // move the pending restore along with it.
    const viewCenter = rawCenter ? trackAnchor({ x: rawCenter.x, y: rawCenter.y }) : null;

    pauseScrollTracking();
    editor.changeChemSpaceScreenSize?.(
      { x: Math.max(1, Math.round(nextX)), y: Math.max(1, Math.round(nextY)) },
    );

    if (viewCenter) {
      // Kekule resets the scroll position asynchronously after a size change,
      // so keep re-applying until its own layout pass has finished.
      const restoreViewCenter = () => applyAnchor(viewCenter);

      restoreViewCenter();
      window.requestAnimationFrame(restoreViewCenter);
      window.setTimeout(restoreViewCenter, 80);
    }

    syncScrollListener();
  };

  /** Scroll so that a tracked object coordinate sits in the viewport center. */
  function applyAnchor(anchor: { x: number; y: number }) {
    const scroller = getScroller();
    const screenCoord = editor?.objCoordToScreen?.(anchor);
    if (!scroller || !screenCoord) return;

    const left = Math.max(0, Math.round(screenCoord.x - scroller.clientWidth / 2));
    const top = Math.max(0, Math.round(screenCoord.y - scroller.clientHeight / 2));

    if (scroller.scrollLeft !== left) scroller.scrollLeft = left;
    if (scroller.scrollTop !== top) scroller.scrollTop = top;
  }

  /** Center the viewport on the drawing surface. */
  const centerView = () => {
    const scroller = getScroller();
    if (!scroller) return;

    // An explicit centering wins over restores queued by earlier resizes.
    pendingAnchors = [];

    const left = Math.max(0, Math.round((scroller.scrollWidth - scroller.clientWidth) / 2));
    const top = Math.max(0, Math.round((scroller.scrollHeight - scroller.clientHeight) / 2));

    pauseScrollTracking();
    if (scroller.scrollLeft !== left) scroller.scrollLeft = left;
    if (scroller.scrollTop !== top) scroller.scrollTop = top;
  };

  /**
   * Move the whole drawing by the same amount the viewport moves, so the
   * rendered picture does not change while the scroll returns to the middle of
   * the surface. This is what makes the finite canvas behave like an endless one.
   */
  const shiftView = (dx: number, dy: number) => {
    const scroller = getScroller();
    const scale = getObjScreenScale(editor);
    if (!scroller || scale <= 0) return;

    const controller = editor.getIaController?.('ClientDragScrollIaController');
    const panning = !!controller?.isExecuting?.();
    const delta = { x: dx / scale, y: dy / scale };

    editor._shiftChemSpaceChildCoord?.(delta, K.CoordMode.COORD2D, false);

    // Pending layout restores still target object coordinates; they moved too.
    for (const anchor of pendingAnchors) {
      anchor.x += delta.x;
      anchor.y += delta.y;
    }

    pauseScrollTracking();
    scroller.scrollLeft += dx;
    scroller.scrollTop += dy;

    // A pan in progress keeps its own scroll baseline; move it along, otherwise
    // the next pointer move would snap the view back to the previous position.
    if (panning && controller._originalScrollPos) {
      controller._originalScrollPos.x += dx;
      controller._originalScrollPos.y += dy;
    }
  };

  /**
   * A shift moves every fragment in the chemical space, so it must stop before
   * the drawing itself would leave the canvas and get clipped.
   */
  const clampShiftToContent = (dx: number, dy: number) => {
    const space = editor?.getChemSpace?.();
    const box = getUnionBox(K, getMolecules(K, composer));
    const size = space?.getSize2D?.();
    const ratio = space?.getObjScreenLengthRatio?.() || 0;
    const zoom = editor.getCurrZoom?.() || 1;
    const scale = getObjScreenScale(editor);
    if (!box || !size || !ratio || scale <= 0) return { dx, dy };

    const margin = (BOARD_CONTENT_MARGIN_PX / zoom) * ratio;
    const clampAxis = (delta: number, low: number, high: number) =>
      low > high ? 0 : Math.min(Math.max(delta, low), high);

    return {
      dx: clampAxis(dx, (margin - box.x1) * scale, (size.x - margin - box.x2) * scale),
      dy: clampAxis(dy, (margin - box.y1) * scale, (size.y - margin - box.y2) * scale),
    };
  };

  /**
   * Zooming keeps the object coordinates but changes how many of them fit on
   * the surface, so the drawing drifts towards a border and panning in that
   * direction dies. Moving the drawing back to the middle - with the same
   * scroll compensation as above, so nothing visibly moves - restores the
   * panning room.
   */
  const centerContentInArena = () => {
    const space = editor?.getChemSpace?.();
    const box = getUnionBox(K, getMolecules(K, composer));
    const size = space?.getSize2D?.();
    const scale = getObjScreenScale(editor);
    if (!space || !box || !size || scale <= 0) return;

    const dx = (size.x / 2 - (box.x1 + box.x2) / 2) * scale;
    const dy = (size.y / 2 - (box.y1 + box.y2) / 2) * scale;
    const clamped = clampShiftToContent(dx, dy);
    const stepX = Math.abs(clamped.dx) > MIN_RECENTER_PX ? clamped.dx : 0;
    const stepY = Math.abs(clamped.dy) > MIN_RECENTER_PX ? clamped.dy : 0;
    if (!stepX && !stepY) return;

    shiftView(stepX, stepY);
  };

  const recenterIfNearEdge = () => {
    if (disposed || performance.now() < settleUntil) return;

    const scroller = getScroller();
    if (!scroller) return;

    const maxX = scroller.scrollWidth - scroller.clientWidth;
    const maxY = scroller.scrollHeight - scroller.clientHeight;

    const offsetToCenter = (scroll: number, max: number, trigger: number) => {
      if (max <= MIN_RECENTER_PX) return 0;
      if (scroll >= trigger && max - scroll >= trigger) return 0;

      const delta = Math.round(max / 2) - scroll;
      return Math.abs(delta) > MIN_RECENTER_PX ? delta : 0;
    };

    const wantedX = offsetToCenter(
      scroller.scrollLeft,
      maxX,
      Math.max(MIN_RECENTER_PX * 2, scroller.clientWidth * EDGE_TRIGGER_RATIO),
    );
    const wantedY = offsetToCenter(
      scroller.scrollTop,
      maxY,
      Math.max(MIN_RECENTER_PX * 2, scroller.clientHeight * EDGE_TRIGGER_RATIO),
    );
    if (!wantedX && !wantedY) return;

    const { dx, dy } = clampShiftToContent(wantedX, wantedY);
    const stepX = Math.abs(dx) > MIN_RECENTER_PX ? dx : 0;
    const stepY = Math.abs(dy) > MIN_RECENTER_PX ? dy : 0;
    if (!stepX && !stepY) return;

    shiftView(stepX, stepY);
  };

  const onScroll = () => {
    if (disposed || scrollFrame) return;

    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      recenterIfNearEdge();
    });
  };

  function syncScrollListener() {
    const scroller = getScroller();
    if (scroller === listeningOn) return;

    listeningOn?.removeEventListener('scroll', onScroll);
    listeningOn = scroller;
    listeningOn?.addEventListener('scroll', onScroll, { passive: true });
  }

  /** Grow the surface so freshly drawn atoms are never painted off-canvas. */
  const fitSurfaceToContent = () => {
    if (disposed) return;

    // Never move the drawing while a pointer interaction is still running.
    if (pointerDown) {
      scheduleContentFit();
      return;
    }

    const space = editor?.getChemSpace?.();
    const molecules = getMolecules(K, composer);
    if (!space || molecules.length === 0) return;

    const box = getUnionBox(K, molecules);
    const size = space.getSize2D?.();
    const ratio = space.getObjScreenLengthRatio?.() || 0;
    const zoom = editor.getCurrZoom?.() || 1;
    if (!box || !size || !ratio) return;

    const margin = (BOARD_CONTENT_MARGIN_PX / zoom) * ratio;
    const overflow = {
      x: Math.max(0, -box.x1),
      y: Math.max(0, -box.y1),
    };
    const wanted = {
      x: Math.max(size.x, box.x2 + overflow.x + margin),
      y: Math.max(size.y, box.y2 + overflow.y + margin),
    };

    const needsGrowth =
      overflow.x > 0 ||
      overflow.y > 0 ||
      wanted.x - size.x > 0.5 ||
      wanted.y - size.y > 0.5;
    if (!needsGrowth) return;

    // Every extra pixel costs one canvas per layer, so stop at the memory
    // budget; bigger drawings stay reachable through the endless panning above.
    const renderedX = (wanted.x / ratio) * zoom;
    const renderedY = (wanted.y / ratio) * zoom;
    if (renderedX > BOARD_MAX_CANVAS_PX || renderedY > BOARD_MAX_CANVAS_PX) return;

    pauseScrollTracking();
    editor._expandChemSpaceSizeAndShiftChildrenCoords?.(wanted, overflow, K.CoordMode.COORD2D);
  };

  const scheduleContentFit = () => {
    if (disposed) return;

    if (contentTimer) window.clearTimeout(contentTimer);
    contentTimer = window.setTimeout(() => {
      contentTimer = 0;
      fitSurfaceToContent();
    }, CONTENT_FIT_DELAY_MS);
  };

  const centerEmptyView = () => {
    const apply = () => {
      rebalance();
      centerView();
    };

    window.requestAnimationFrame(() => {
      apply();
      window.setTimeout(apply, 80);
      window.setTimeout(apply, 320);
    });
  };

  const onPointerDown = () => {
    pointerDown = true;
  };

  const onPointerUp = () => {
    if (!pointerDown) return;

    pointerDown = false;
    scheduleContentFit();
  };

  // Kekule can change the zoom on its own (double click, gestures). The surface
  // has to follow, otherwise the canvas layers keep the size of the old zoom.
  const originalZoomTo = editor?.zoomTo?.bind(editor);
  if (originalZoomTo) {
    editor.zoomTo = (...args: any[]) => {
      const requested = Number(args[0]);
      const current = editor.getCurrZoom?.() || 1;

      if (!Number.isFinite(requested)) {
        return originalZoomTo(...args);
      }

      const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requested));

      // Pinned at a bound: skip the (expensive) layout passes so repeated
      // clicks cannot queue settle work or nudge the view.
      if (Math.abs(target - current) < ZOOM_EPSILON) {
        options.onZoomChange?.(current);
        return editor;
      }

      const result = originalZoomTo(target, ...args.slice(1));
      options.onZoomChange?.(target);

      // Remember what the middle of the viewport was pointing at, so the
      // delayed passes below can put it back exactly where it was.
      const scroller = getScroller();
      const viewPoint =
        scroller && editor.screenCoordToObj?.({
          x: scroller.scrollLeft + scroller.clientWidth / 2,
          y: scroller.scrollTop + scroller.clientHeight / 2,
        });
      const anchor = viewPoint ? trackAnchor({ x: viewPoint.x, y: viewPoint.y }) : null;

      // Kekule re-lays out the scroller asynchronously after a zoom (it moves
      // the scroll back to keep the zoom center), so re-apply a few times.
      const settleZoom = () => {
        if (disposed || pointerDown) return;

        rebalance();

        if (getMolecules(K, composer).length > 0) {
          centerContentInArena();
          if (anchor && pendingAnchors.includes(anchor)) applyAnchor(anchor);
        } else {
          centerView();
        }
      };

      window.requestAnimationFrame(settleZoom);
      window.setTimeout(settleZoom, 140);
      window.setTimeout(settleZoom, 360);
      return result;
    };
  }

  const dispose = () => {
    disposed = true;
    pendingAnchors = [];

    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    if (contentTimer) window.clearTimeout(contentTimer);

    listeningOn?.removeEventListener('scroll', onScroll);
    listeningOn = undefined;

    if (originalZoomTo) editor.zoomTo = originalZoomTo;

    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
  };

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  window.requestAnimationFrame(syncScrollListener);

  return {
    rebalance,
    centerView,
    centerEmptyView,
    notifyContentChanged: scheduleContentFit,
    clearPendingRestores: () => {
      pendingAnchors = [];
    },
    dispose,
  };
}
