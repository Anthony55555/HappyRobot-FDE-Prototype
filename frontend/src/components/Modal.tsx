import React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
