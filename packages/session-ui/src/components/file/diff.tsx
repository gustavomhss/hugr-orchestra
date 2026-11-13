import { sampledChecksum } from "@orchestra/core/util/encode"
import { areFilesEqual, areOptionsEqual, type DiffLineAnnotation, type FileContents, type FileDiffMetadata, type FileDiffOptions, FileDiff, type SelectedLineRange, VirtualizedFileDiff, Virtualizer } from "@pierre/diffs"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, onCleanup, splitProps } from "solid-js"
import { createDefaultOptions } from "../../pierre"
import { markCommentedDiffLines } from "../../pierre/commented-lines"
import { fixDiffSelection, type DiffSelectionSide } from "../../pierre/diff-selection"
import { findDiffLineNumber, readShadowLineSelection } from "../../pierre/file-selection"
import { restoreShadowTextSelection } from "../../pierre/selection-bridge"
import { virtualMetrics } from "../../pierre/virtualizer"
import { getWorkerPool } from "../../pierre/worker"
import { DiffFileProps, diffKeys } from "./types"
import { MouseHit } from "./hook"
import { useModeViewer, useSearchHandle, createLineCallbacks, useAnnotationRerender, notifyRendered, renderViewer, preserve, createSharedVirtualStrategy, mouseHit, diffMouseSide, diffSelectionSide, ViewerShell, ModeAdapter, Viewer } from "./helpers"

// DiffViewer
// ---------------------------------------------------------------------------

export function DiffViewer<T>(props: DiffFileProps<T>) {
  let instance: FileDiff<T> | undefined
  let instanceVirtualizer: Virtualizer | undefined
  let instanceWorkerPool: ReturnType<typeof getWorkerPool>
  let instanceVirtualHunkSeparators: FileDiffOptions<T>["hunkSeparators"] | undefined
  let instanceFileDiff: FileDiffMetadata | undefined
  let instanceBefore: FileContents | undefined
  let instanceAfter: FileContents | undefined
  let dragSide: DiffSelectionSide | undefined
  let dragEndSide: DiffSelectionSide | undefined
  let viewer!: Viewer

  const [local, others] = splitProps(props, diffKeys)

  const mobile = createMediaQuery("(max-width: 640px)")

  const lineFromMouseEvent = (event: MouseEvent): MouseHit => mouseHit(event, findDiffLineNumber, diffMouseSide)

  const setSelectedLines = (range: SelectedLineRange | null, preserve?: { root: ShadowRoot; text: Range }) => {
    const active = instance
    if (!active) return

    const fixed = fixDiffSelection(viewer.getRoot(), range)
    if (fixed === undefined) {
      viewer.lastSelection = range
      return
    }

    viewer.lastSelection = fixed
    active.setSelectedLines(fixed)
    restoreShadowTextSelection(preserve?.root, preserve?.text)
  }

  const adapter: ModeAdapter = {
    lineFromMouseEvent,
    setSelectedLines,
    updateSelection: (preserveTextSelection) => {
      const root = viewer.getRoot()
      if (!root) return

      const selected = readShadowLineSelection({
        root,
        lineForNode: findDiffLineNumber,
        sideForNode: diffSelectionSide,
        preserveTextSelection,
      })
      if (!selected) return

      if (selected.text) {
        setSelectedLines(selected.range, { root, text: selected.text })
        return
      }

      setSelectedLines(selected.range)
    },
    buildDragSelection: () => {
      if (viewer.dragStart === undefined || viewer.dragEnd === undefined) return
      const selected: SelectedLineRange = { start: viewer.dragStart, end: viewer.dragEnd }
      if (dragSide) selected.side = dragSide
      if (dragEndSide && dragSide && dragEndSide !== dragSide) selected.endSide = dragEndSide
      return selected
    },
    buildClickSelection: () => {
      if (viewer.dragStart === undefined) return
      const selected: SelectedLineRange = { start: viewer.dragStart, end: viewer.dragStart }
      if (dragSide) selected.side = dragSide
      return selected
    },
    onDragStart: (hit) => {
      dragSide = hit.side
      dragEndSide = hit.side
    },
    onDragMove: (hit) => {
      dragEndSide = hit.side
    },
    onDragReset: () => {
      dragSide = undefined
      dragEndSide = undefined
    },
    markCommented: markCommentedDiffLines,
  }

  viewer = useModeViewer(
    {
      enableLineSelection: () => props.enableLineSelection === true,
      selectedLines: () => local.selectedLines,
      commentedLines: () => local.commentedLines,
      onLineSelectionEnd: (range) => local.onLineSelectionEnd?.(range),
    },
    adapter,
  )

  const virtuals = createSharedVirtualStrategy(
    () => viewer.container,
    () => local.virtualize !== false,
  )

  const large = createMemo(() => {
    if (local.fileDiff) {
      const before = local.fileDiff.deletionLines.join("")
      const after = local.fileDiff.additionLines.join("")
      return Math.max(before.length, after.length) > 500_000
    }

    const before = typeof local.before?.contents === "string" ? local.before.contents : ""
    const after = typeof local.after?.contents === "string" ? local.after.contents : ""
    return Math.max(before.length, after.length) > 500_000
  })

  const largeOptions = {
    lineDiffType: "none",
    maxLineDiffLength: 0,
    tokenizeMaxLineLength: 1,
  } satisfies Pick<FileDiffOptions<T>, "lineDiffType" | "maxLineDiffLength" | "tokenizeMaxLineLength">

  const lineCallbacks = createLineCallbacks({
    viewer,
    normalize: (range) => fixDiffSelection(viewer.getRoot(), range),
    onLineSelected: (range) => local.onLineSelected?.(range),
    onLineSelectionEnd: (range) => local.onLineSelectionEnd?.(range),
    onLineNumberSelectionEnd: (range) => local.onLineNumberSelectionEnd?.(range),
  })

  const options = createMemo<FileDiffOptions<T>>(() => {
    const base = {
      ...createDefaultOptions(props.diffStyle),
      ...others,
      ...lineCallbacks,
    }

    const perf = large() ? { ...base, ...largeOptions } : base
    if (!mobile()) return perf
    return { ...perf, disableLineNumbers: true }
  })

  const notify = (done?: VoidFunction) => {
    notifyRendered({
      viewer,
      isReady: (root) => root.querySelector("[data-line]") != null,
      settleFrames: 1,
      onReady: () => {
        done?.()
        setSelectedLines(viewer.lastSelection)
        viewer.find.refresh({ reset: true })
        local.onRendered?.()
      },
    })
  }

  useSearchHandle({
    search: () => local.search,
    find: viewer.find,
  })

  // -- render instance --

  createEffect(() => {
    const opts = options()
    const workerPool = large() ? getWorkerPool("unified") : getWorkerPool(props.diffStyle)
    const virtualizer = virtuals.get()
    const beforeContents = typeof local.before?.contents === "string" ? local.before.contents : ""
    const afterContents = typeof local.after?.contents === "string" ? local.after.contents : ""
    const done = preserve(viewer)

    onCleanup(done)

    const cacheKey = (contents: string) => {
      if (!large()) return sampledChecksum(contents, contents.length)
      return sampledChecksum(contents)
    }

    const before = local.before
      ? { ...local.before, contents: beforeContents, cacheKey: cacheKey(beforeContents) }
      : undefined
    const after = local.after
      ? { ...local.after, contents: afterContents, cacheKey: cacheKey(afterContents) }
      : undefined
    const targetChanged =
      local.fileDiff !== undefined
        ? instanceFileDiff !== local.fileDiff
        : instanceFileDiff !== undefined ||
          before === undefined ||
          after === undefined ||
          instanceBefore === undefined ||
          instanceAfter === undefined ||
          !areFilesEqual(instanceBefore, before) ||
          !areFilesEqual(instanceAfter, after)
    // Pierre beta virtualized instances retain their first diff target and resolve separator metrics at construction.
    // Plain timeline diffs can retain the instance as content streams; virtualized viewers reset only when that is unsafe.
    const reset =
      instance !== undefined &&
      (instanceVirtualizer !== virtualizer ||
        instanceWorkerPool !== workerPool ||
        (virtualizer !== undefined && (instanceVirtualHunkSeparators !== opts.hunkSeparators || targetChanged)))
    const forceRender = !reset && instance !== undefined && !areOptionsEqual(instance.options, opts)

    renderViewer({
      viewer,
      current: instance,
      reset,
      create: () =>
        virtualizer
          ? new VirtualizedFileDiff<T>(opts, virtualizer, virtualMetrics, workerPool)
          : new FileDiff<T>(opts, workerPool),
      update: (value) => value.setOptions(opts),
      assign: (value) => {
        instance = value
        instanceVirtualizer = virtualizer
        instanceWorkerPool = workerPool
        instanceVirtualHunkSeparators = virtualizer ? opts.hunkSeparators : undefined
        instanceFileDiff = local.fileDiff
        instanceBefore = before
        instanceAfter = after
      },
      draw: (value) => {
        if (local.fileDiff) {
          value.render({
            fileDiff: local.fileDiff,
            forceRender,
            lineAnnotations: [],
            containerWrapper: viewer.container,
          })
          return
        }

        if (!before || !after) return

        value.render({
          oldFile: before,
          newFile: after,
          forceRender,
          lineAnnotations: [],
          containerWrapper: viewer.container,
        })
      },
      onReady: () => notify(done),
    })
  })

  useAnnotationRerender<DiffLineAnnotation<T>>({
    viewer,
    current: () => instance,
    annotations: () => (local.annotations as DiffLineAnnotation<T>[] | undefined) ?? [],
  })

  // -- cleanup --

  onCleanup(() => {
    instance?.cleanUp()
    instance = undefined
    instanceVirtualizer = undefined
    instanceWorkerPool = undefined
    instanceVirtualHunkSeparators = undefined
    instanceFileDiff = undefined
    instanceBefore = undefined
    instanceAfter = undefined
    virtuals.cleanup()
    dragSide = undefined
    dragEndSide = undefined
  })

  return <ViewerShell mode="diff" viewer={viewer} class={local.class} classList={local.classList} />
}
