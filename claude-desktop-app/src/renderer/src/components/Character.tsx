import { useEffect, useRef } from 'react'
import { CLAUDIE_IMAGE, type ClaudieState } from '../config'

interface Props {
  state: ClaudieState
}

/**
 * 클로디 캐릭터. 상태별로 다른 이미지와 애니메이션을 보여줍니다.
 *  - idle: 둥둥 떠다님(km-float)
 *  - working: 좌우로 흔들흔들(km-sway)
 *  - permission: 떠다니며 대기(km-float)
 *  - done: 신나게 통통 튐(km-bob) + 반짝이
 * className "interactive" 영역이라 드래그(-webkit-app-region: drag) 가능.
 */
export default function Character({ state }: Props) {
  const draggingRef = useRef(false)

  // 어디서 마우스를 떼더라도 드래그가 확실히 끝나도록 전역에서 mouseup 감지
  useEffect(() => {
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      window.claudie.dragEnd()
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return // 좌클릭만
    draggingRef.current = true
    window.claudie.dragStart()
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    // 진행 중이던 드래그가 있으면 확실히 종료(메뉴가 mouseup 을 삼켜 박히는 것 방지)
    if (draggingRef.current) {
      draggingRef.current = false
      window.claudie.dragEnd()
    }
    window.claudie.showMenu()
  }

  return (
    <div
      className={`character interactive ${state}`}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {state === 'done' && (
        <>
          <span className="spark s1" />
          <span className="spark s2" />
        </>
      )}
      <img className="character-img" src={CLAUDIE_IMAGE[state]} alt="클로디" draggable={false} />
      <div className="character-shadow" />
    </div>
  )
}