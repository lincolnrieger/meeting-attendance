/**
 * App-wide feedback: toast notifications and confirmation dialogs.
 *
 *   const toast = useToast();      toast('Saved');  toast('Failed', 'error');
 *   const confirm = useConfirm();  if (await confirm({ title, message, confirmLabel, danger })) ...
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const ToastContext = createContext(() => {});
const ConfirmContext = createContext(async () => false);

export const useToast = () => useContext(ToastContext);
export const useConfirm = () => useContext(ConfirmContext);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const toast = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setDialog({ ...opts, resolve })),
    [],
  );

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {t.kind === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
        {dialog && <ConfirmDialog {...dialog} onClose={close} />}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onClose }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <Modal title={title} onClose={() => onClose(false)} size="sm">
      <div className="modal-body">{typeof message === 'string' ? <p>{message}</p> : message}</div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={() => onClose(false)}>{cancelLabel}</button>
        <button type="button" ref={confirmRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
