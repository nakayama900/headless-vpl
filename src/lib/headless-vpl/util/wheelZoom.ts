import type Workspace from '../core/Workspace'

/**
 * `bindWheelZoom` の設定オプション。
 * すべてのフィールドはオプショナルで、省略時はデフォルト値が使われる。
 */
export type WheelZoomConfig = {
  /** ズーム対象のワークスペース（必須） */
  workspace: Workspace
  /** ズームの最小スケール（デフォルト: 0.1） */
  minScale?: number
  /** ズームの最大スケール（デフォルト: 5） */
  maxScale?: number
  /** 1回のホイール操作で適用するズーム量（デフォルト: 0.1） */
  factor?: number
  /** スケール変更後に呼ばれるコールバック */
  onChange?: () => void
  /**
   * ズームを有効にするために押す必要がある修飾キー。
   * - `'none'`（デフォルト）: 修飾キー不要
   * - `'ctrl'` / `'meta'` / `'alt'` / `'shift'`: 対応するキーが押されている場合のみズーム
   */
  requireModifier?: 'none' | 'ctrl' | 'meta' | 'alt' | 'shift'
  /**
   * `deltaY === 0`（純粋な水平スクロールなど）のイベントを無視するか（デフォルト: true）。
   * `true` の場合、`deltaY` がゼロのイベントでは `preventDefault` を呼ばず、ズームも行わない。
   */
  ignoreHorizontal?: boolean
  /**
   * `deltaY` の絶対値がこの値未満の場合にズームを無視するしきい値（デフォルト: 0）。
   * `0` の場合はしきい値判定を行わない。
   */
  eps?: number
  /**
   * `deltaMode` に応じて `deltaY` を正規化するか（デフォルト: false）。
   * `true` にすると `DOM_DELTA_LINE`（mode 1）の値を `lineHeight` 倍に換算する。
   */
  normalizeDeltaMode?: boolean
  /**
   * `normalizeDeltaMode` が `true` のとき、1行の高さとして使うピクセル数（デフォルト: 16）。
   */
  lineHeight?: number
}

/** deltaMode 定数 */
const DOM_DELTA_LINE = 1

/**
 * ホイールによるズームをバインドする。
 * クリーンアップ関数を返す。
 *
 * ### デフォルト動作
 * - `deltaY === 0`（水平スクロール等）はズームしない（`preventDefault` も呼ばない）
 * - 修飾キーの制限なし（`requireModifier: 'none'`）
 * - `eps` しきい値なし
 * - `deltaMode` の正規化なし
 *
 * ### 後方互換性
 * 以前の実装では `deltaY === 0` のときにズームインが発生していたが、
 * このバージョンから `deltaY === 0` はデフォルトで no-op になる。
 */
export function bindWheelZoom(element: HTMLElement, config: WheelZoomConfig): () => void {
  const {
    workspace,
    minScale = 0.1,
    maxScale = 5,
    factor = 0.1,
    onChange,
    requireModifier = 'none',
    ignoreHorizontal = true,
    eps = 0,
    normalizeDeltaMode = false,
    lineHeight = 16,
  } = config

  const onWheel = (e: WheelEvent) => {
    // 修飾キーの確認
    if (requireModifier === 'ctrl' && !e.ctrlKey) return
    if (requireModifier === 'meta' && !e.metaKey) return
    if (requireModifier === 'alt' && !e.altKey) return
    if (requireModifier === 'shift' && !e.shiftKey) return

    // deltaMode に応じて deltaY を正規化
    let deltaY = e.deltaY
    if (normalizeDeltaMode && e.deltaMode === DOM_DELTA_LINE) {
      deltaY *= lineHeight
    }

    // 水平スクロール（deltaY === 0）を無視
    if (ignoreHorizontal && deltaY === 0) return

    // eps しきい値: 微小なデルタを無視
    if (eps > 0 && Math.abs(deltaY) < eps) return

    // スクロール方向を求める（0 の場合はズーム不要）
    const dir = Math.sign(deltaY)
    if (dir === 0) return

    // ズームを実施する場合のみ preventDefault を呼ぶ
    e.preventDefault()

    const r = element.getBoundingClientRect()
    const zoomFactor = dir > 0 ? 1 - factor : 1 + factor
    const newScale = Math.max(minScale, Math.min(maxScale, workspace.viewport.scale * zoomFactor))
    workspace.zoomAt(e.clientX - r.left, e.clientY - r.top, newScale)
    onChange?.()
  }

  element.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    element.removeEventListener('wheel', onWheel)
  }
}
