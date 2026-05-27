import { beforeEach, describe, expect, it, vi } from 'vitest'

import type Workspace from '../core/Workspace'
import { bindWheelZoom } from './wheelZoom'

// ---- ヘルパー ----------------------------------------------------------

/** ホイールハンドラーを直接キャプチャするモック要素を作成する */
function createMockElement() {
  let capturedHandler: ((e: WheelEvent) => void) | undefined

  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: vi.fn(
      (type: string, handler: EventListenerOrEventListenerObject, _opts?: unknown) => {
        if (type === 'wheel') capturedHandler = handler as (e: WheelEvent) => void
      }
    ),
    removeEventListener: vi.fn(),
  } as unknown as HTMLElement

  /** キャプチャしたハンドラーにホイールイベントを送り、使った event を返す */
  function fire(init: Partial<WheelEvent> = {}): WheelEvent & { preventDefault: ReturnType<typeof vi.fn> } {
    const event = {
      deltaY: 0,
      deltaX: 0,
      deltaMode: 0,
      clientX: 50,
      clientY: 50,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent & { preventDefault: ReturnType<typeof vi.fn> }

    capturedHandler?.(event)
    return event
  }

  return { element, fire }
}

/** モック Workspace を作成する */
function createMockWorkspace(scale = 1): Workspace {
  return {
    viewport: { scale },
    zoomAt: vi.fn(),
  } as unknown as Workspace
}

// ---- テスト -----------------------------------------------------------

describe('bindWheelZoom', () => {
  let workspace: Workspace

  beforeEach(() => {
    workspace = createMockWorkspace(1)
  })

  // -- クリーンアップ
  it('クリーンアップ関数が removeEventListener を呼ぶ', () => {
    const { element } = createMockElement()
    const cleanup = bindWheelZoom(element, { workspace })
    cleanup()
    expect((element.removeEventListener as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
  })

  // -- デフォルト: deltaY > 0 でズームアウト
  it('deltaY > 0 のとき zoomAt が呼ばれ、スケールが縮小する', () => {
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace })
    fire({ deltaY: 100 })
    const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
    expect(zoomAt).toHaveBeenCalledTimes(1)
    // factor=0.1 → zoomFactor = 0.9、newScale = max(0.1, min(5, 0.9)) = 0.9
    expect(zoomAt.mock.calls[0][2]).toBeCloseTo(0.9)
  })

  // -- デフォルト: deltaY < 0 でズームイン
  it('deltaY < 0 のとき zoomAt が呼ばれ、スケールが拡大する', () => {
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace })
    fire({ deltaY: -100 })
    const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
    expect(zoomAt).toHaveBeenCalledTimes(1)
    // factor=0.1 → zoomFactor = 1.1、newScale = 1.1
    expect(zoomAt.mock.calls[0][2]).toBeCloseTo(1.1)
  })

  // -- バグ修正: deltaY === 0 はデフォルトで no-op
  it('deltaY === 0（水平スクロール等）のとき zoomAt が呼ばれない（デフォルト ignoreHorizontal=true）', () => {
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace })
    const event = fire({ deltaY: 0 })
    expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  // -- ignoreHorizontal=false でも deltaY===0 は dir===0 なので no-op
  it('ignoreHorizontal=false かつ deltaY===0 のとき zoomAt が呼ばれない', () => {
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace, ignoreHorizontal: false })
    const event = fire({ deltaY: 0 })
    expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  // -- preventDefault はズームが発生する場合のみ呼ぶ
  it('ズームが発生する場合にのみ preventDefault を呼ぶ', () => {
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace })
    const noZoom = fire({ deltaY: 0 })
    expect(noZoom.preventDefault).not.toHaveBeenCalled()
    const doZoom = fire({ deltaY: 50 })
    expect(doZoom.preventDefault).toHaveBeenCalledTimes(1)
  })

  // -- onChange コールバック
  it('ズーム後に onChange が呼ばれる', () => {
    const onChange = vi.fn()
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace, onChange })
    fire({ deltaY: 100 })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ズームしない場合は onChange が呼ばれない', () => {
    const onChange = vi.fn()
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace, onChange })
    fire({ deltaY: 0 })
    expect(onChange).not.toHaveBeenCalled()
  })

  // -- minScale / maxScale クランプ
  it('newScale が maxScale を超えない', () => {
    workspace = createMockWorkspace(5)
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace, maxScale: 5 })
    fire({ deltaY: -100 })
    const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
    expect(zoomAt.mock.calls[0][2]).toBe(5)
  })

  it('newScale が minScale を下回らない', () => {
    workspace = createMockWorkspace(0.1)
    const { element, fire } = createMockElement()
    bindWheelZoom(element, { workspace, minScale: 0.1 })
    fire({ deltaY: 100 })
    const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
    expect(zoomAt.mock.calls[0][2]).toBe(0.1)
  })

  // -- requireModifier
  describe('requireModifier', () => {
    it("requireModifier='ctrl' のとき ctrlKey=false ではズームしない", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'ctrl' })
      const event = fire({ deltaY: 100, ctrlKey: false })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it("requireModifier='ctrl' のとき ctrlKey=true ではズームする", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'ctrl' })
      fire({ deltaY: 100, ctrlKey: true })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it("requireModifier='meta' のとき metaKey=false ではズームしない", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'meta' })
      fire({ deltaY: 100, metaKey: false })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it("requireModifier='meta' のとき metaKey=true ではズームする", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'meta' })
      fire({ deltaY: 100, metaKey: true })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it("requireModifier='alt' のとき altKey=true ではズームする", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'alt' })
      fire({ deltaY: 100, altKey: true })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it("requireModifier='shift' のとき shiftKey=true ではズームする", () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, requireModifier: 'shift' })
      fire({ deltaY: 100, shiftKey: true })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })
  })

  // -- eps しきい値
  describe('eps しきい値', () => {
    it('|deltaY| < eps のとき no-op', () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, eps: 10 })
      const event = fire({ deltaY: 5 })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('|deltaY| >= eps のときズームする', () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, eps: 10 })
      fire({ deltaY: 15 })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it('eps > 0 のとき deltaY === 0 も no-op', () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, eps: 1 })
      fire({ deltaY: 0 })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })
  })

  // -- normalizeDeltaMode
  describe('normalizeDeltaMode', () => {
    it('normalizeDeltaMode=true かつ deltaMode=1 のとき deltaY を lineHeight 倍に換算する', () => {
      const { element, fire } = createMockElement()
      // deltaY=3 lines × lineHeight=16 = 48px → dir=+1 → zoomFactor=0.9 → newScale=0.9
      bindWheelZoom(element, { workspace, normalizeDeltaMode: true, lineHeight: 16 })
      fire({ deltaY: 3, deltaMode: 1 })
      const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
      expect(zoomAt).toHaveBeenCalledTimes(1)
      expect(zoomAt.mock.calls[0][2]).toBeCloseTo(0.9)
    })

    it('normalizeDeltaMode=true かつ deltaMode=0 のとき deltaY はそのまま使われる', () => {
      const { element, fire } = createMockElement()
      bindWheelZoom(element, { workspace, normalizeDeltaMode: true, lineHeight: 16 })
      fire({ deltaY: 100, deltaMode: 0 })
      const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
      expect(zoomAt).toHaveBeenCalledTimes(1)
    })

    it('normalizeDeltaMode=false のとき deltaMode=1 でも deltaY は変換されない', () => {
      const { element, fire } = createMockElement()
      // deltaY=3 lines だが変換なし → eps=10 を超えるので正常にズーム
      bindWheelZoom(element, { workspace, normalizeDeltaMode: false })
      fire({ deltaY: 3, deltaMode: 1 })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it('normalizeDeltaMode=true かつ deltaMode=1 で deltaY*lineHeight が eps 未満なら no-op', () => {
      const { element, fire } = createMockElement()
      // deltaY=1 line × lineHeight=16 = 16px、eps=20 → no-op
      bindWheelZoom(element, { workspace, normalizeDeltaMode: true, lineHeight: 16, eps: 20 })
      const event = fire({ deltaY: 1, deltaMode: 1 })
      expect((workspace.zoomAt as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  // -- zoomAt の引数確認
  it('zoomAt に正しい座標が渡される', () => {
    const { element, fire } = createMockElement()
    // getBoundingClientRect は (left=0, top=0) を返す
    bindWheelZoom(element, { workspace })
    fire({ deltaY: 100, clientX: 30, clientY: 40 })
    const zoomAt = workspace.zoomAt as ReturnType<typeof vi.fn>
    expect(zoomAt.mock.calls[0][0]).toBe(30)
    expect(zoomAt.mock.calls[0][1]).toBe(40)
  })
})
