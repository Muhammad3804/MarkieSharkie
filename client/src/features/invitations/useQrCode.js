import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// { dataUrl, failed } for the QR of `url`: dataUrl is null while it renders (or when there's no url); failed is true
// when the link is too long for a QR code. Quiet zone 2 modules; dark ink on white scans best.
export function useQrCode(url) {
  const [result, setResult] = useState({ url: null, dataUrl: null, failed: false })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 640, color: { dark: '#241f20', light: '#ffffff' } })
      .then((dataUrl) => !cancelled && setResult({ url, dataUrl, failed: false }))
      .catch((error) => {
        console.error('[invitations] QR failed', error)
        if (!cancelled) setResult({ url, dataUrl: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [url])
  const current = url && result.url === url
  return { dataUrl: current ? result.dataUrl : null, failed: Boolean(current && result.failed) }
}
