import { useEffect, useRef, useState } from 'react'

// Folha A4 em escala, numa moldura isolada (sandbox): a mesma página que sai no PDF.
export function Sheet({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 794)))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} tabIndex={0} role="region" aria-label="Prévia da folha" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <div style={{ width: 794 * scale, height: 1123 * scale * 1.6 }}>
        <iframe title="Prévia da folha" srcDoc={html} sandbox="" style={{ width: 794, height: 1123 * 1.6, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, background: '#fff', boxShadow: '0 10px 30px -12px rgba(20,32,87,.35)' }} />
      </div>
    </div>
  )
}
