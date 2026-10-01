import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.scss";

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	maxWidth?: number;
}

export function Modal({ open, onClose, title, children, footer, maxWidth }: ModalProps) {
	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	// Portal to document.body so the fixed backdrop escapes any transformed
	// ancestor (e.g. the mobile slide-in sidebar) and always covers the viewport.
	return createPortal(
		<div className="modal-backdrop" onMouseDown={onClose}>
			<div
				className="modal-dialog"
				style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
				onMouseDown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
			>
				<div className="modal-head">
					<h2 className="modal-title">{title}</h2>
					<button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
						✕
					</button>
				</div>
				<div className="modal-body">{children}</div>
				{footer && <div className={styles.footer}>{footer}</div>}
			</div>
		</div>,
		document.body
	);
}
