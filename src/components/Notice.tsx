import { useEffect } from 'react';

export function Toast({ text, kind = 'error', onClose }: { text: string; kind?: 'error' | 'ok'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [text, onClose]);
  return (
    <div className={`notice toast ${kind}`} role="alert" onClick={onClose}>
      {text}
    </div>
  );
}
